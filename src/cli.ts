import { parseArgs } from 'node:util'
import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import { guide, type Lang } from './help.ts'
import { askSecret } from './prompt.ts'
import { cap, dim, isWsl, oneLine, tame } from './term.ts'
import { humanSize, sizeChange } from './core/units.ts'
import { imagesToPdf, type Orientation, type PageSize } from './core/images-to-pdf.ts'
import { decodeImage } from './core/images-node.ts'
import {
  IMAGE_FORMATS,
  defaultQuality,
  encodeImage,
  extensionFor,
  isImageFormat,
  looksTruncated,
  keepsAlpha,
  resize,
  resizedTo,
  sniff,
  type ImageFormat,
} from './core/images.ts'
import { compressPdf, compressToFit } from './core/pdf-compress.ts'
import { signPdf } from './core/pdf-sign.ts'
import {
  chunkPages,
  describe,
  hasFormFields,
  mergePdfs,
  pageCount,
  PAPERS,
  parseRanges,
  resizePages,
  rotatePages,
  SHEET_ORIENTATIONS,
  selectPages,
  splitPdf,
  type Paper,
  type SheetOrientation,
} from './core/pdf-pages.ts'
import {
  CHANGES_LEVELS,
  caveat,
  clearWarning,
  describeSecurity,
  explain,
  PRINTING_LEVELS,
  protectPdf,
  unlockPdf,
  type ChangesLevel,
  type PrintingLevel,
} from './core/pdf-security.ts'
import { numberPages, watermarkPdf, type Corner, CORNERS } from './core/pdf-stamp.ts'
import { describeMetadata, stripMetadata } from './core/pdf-metadata.ts'

const COMMANDS = [
  'convert',
  'compress',
  'sign',
  'images',
  'merge',
  'select',
  'rotate',
  'split',
  'protect',
  'unlock',
  'watermark',
  'number',
  'clean',
  'resize',
  'info',
  'help',
  'version',
]

function fail(message: string): never {
  throw new Error(message)
}

/* ---------------------------------------------------------------- paths --- */

/**
 * Accept Windows paths, because this almost always runs from a WSL shell where
 * someone has just pasted one out of Explorer.
 *
 * Unquoted backslashes never survive the shell, so `C:\Users\x` arrives as
 * `C:Usersx`. That is worth naming explicitly rather than reporting as a
 * missing file, since the fix is quoting, not a different path.
 */
export function localPath(value: string): string {
  if (!isWsl) return value
  const drive = /^([A-Za-z]):(.*)$/s.exec(value)
  if (!drive) return value
  const [, letter, rest] = drive
  const mount = `/mnt/${letter!.toLowerCase()}`
  if (rest !== '' && rest![0] !== '\\' && rest![0] !== '/') {
    fail(
      `"${value}" looks like a Windows path with its backslashes eaten by the shell.\n` +
        `  Quote it:  '${letter}:\\Users\\...'\n` +
        `  Or use:    ${mount}/Users/...`,
    )
  }
  return `${mount}/${rest!.replace(/^[\\/]/, '').replaceAll('\\', '/')}`
}

const stem = (file: string) => basename(file, extname(file))

/** "shot1.png", "shot2.png", "shot10.png" sort the way a person counts. */
const collate = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare

/**
 * Name a multi-file result after what its inputs have in common, so a glob of
 * shot1..shot12 produces shot.pdf rather than shot1.pdf, which reads like a
 * single page.
 */
function commonName(files: string[]): string {
  const stems = files.map(stem)
  let prefix = stems[0]!
  for (const name of stems.slice(1)) {
    while (prefix !== '' && !name.startsWith(prefix)) prefix = prefix.slice(0, -1)
  }
  prefix = prefix.replace(/[\s._-]*\d*[\s._-]*$/, '')
  return prefix.length >= 2 ? prefix : stems[0]!
}

/**
 * The order files arrive in is the page order, and a shell glob hands over
 * shot10 before shot2 unless the shell was told otherwise. Reordering silently
 * would be worse than the bug, so say something and let the caller decide.
 */
function ordered(files: string[], mode: string): string[] {
  const natural = [...files].sort((a, b) => collate(basename(a), basename(b)))
  if (mode === 'natural') return natural
  if (mode !== 'given') fail('--sort must be one of: given, natural')

  const at = files.findIndex((file, i) => i > 0 && collate(basename(files[i - 1]!), basename(file)) > 0)
  if (at > 0) {
    console.error(
      dim(
        `convert.in: page order follows the input order, and ${basename(files[at - 1]!)} ` +
          `comes before ${basename(files[at]!)} there. Add --sort natural if that is wrong.`,
      ),
    )
  }
  return files
}
const beside = (input: string, name: string) => join(dirname(input), name)
const read = (path: string) => readFile(path).then((buffer) => new Uint8Array(buffer))

/* -------------------------------------------------------------- outputs --- */

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

/** Never write over something that is already there without being told to. */
async function outputFile(explicit: string | undefined, fallback: string, force: boolean) {
  const target = explicit === undefined ? fallback : localPath(explicit)
  if (!force && (await exists(target))) {
    fail(`${target} already exists. Add --force to overwrite it.`)
  }
  return target
}

async function outputDir(explicit: string | undefined, fallback: string, force: boolean) {
  const target = explicit === undefined ? fallback : localPath(explicit)
  if (!force && (await exists(target)) && (await readdir(target)).length > 0) {
    fail(`${target} is not empty. Add --force to write into it anyway.`)
  }
  await mkdir(target, { recursive: true })
  return target
}

async function report(target: string, detail: string): Promise<void> {
  const info = await stat(target)
  const sizes = info.isDirectory()
    ? await Promise.all(
        (await readdir(target)).map((name) => stat(join(target, name)).then((one) => one.size)),
      )
    : [info.size]
  const total = sizes.reduce((sum, size) => sum + size, 0)
  // Both halves can carry text out of a file: the target is named after the
  // input, and the detail quotes what was done to it.
  console.log(`✓ ${tame(target)}  ${dim(`${tame(detail)} · ${humanSize(total)}`)}`)
}

/** What a one-in, one-out command hands back for {@link each} to write. */
interface Produced {
  bytes: Uint8Array
  /** What was done, printed beside the path once the file is on disk. */
  detail: string
  /** Non-default permissions, where the result is more sensitive than its input. */
  mode?: number
}

/* ------------------------------------------------------------- argument --- */

function requireInputs(files: string[], what: string): string[] {
  if (files.length === 0) fail(`no ${what} given. Run "convert.in --help" for examples.`)
  return files.map(localPath)
}

function oneOf<T extends string>(value: string, allowed: readonly T[], flag: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T
  fail(`--${flag} must be one of: ${allowed.join(', ')}`)
}

function number(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) fail(`--${flag} must be a number, got "${value}"`)
  return parsed
}

/**
 * "500kb", "2MB", "1.5 mb" or a plain count of bytes. Upload forms state their
 * limit in whichever of those they feel like, and retyping it as a byte count
 * is arithmetic nobody should be asked to do at the command line.
 *
 * A kilobyte here is 1000 bytes, as SI defines it and as {@link humanSize}
 * reports it. Where a form means the 1024s, the smaller reading still fits.
 */
function bytes(value: string, flag: string): number {
  const match = /^\s*([\d.]+)\s*(b|kb|mb|k|m)?\s*$/i.exec(value)
  if (match === null) fail(`--${flag} must be a size like 500kb or 2mb, got "${value}"`)
  const scale = { b: 1, k: 1000, kb: 1000, m: 1_000_000, mb: 1_000_000 }
  const amount = Number(match![1]) * scale[(match![2] ?? 'b').toLowerCase() as keyof typeof scale]
  if (!Number.isFinite(amount) || amount < 1) fail(`--${flag} must be at least one byte`)
  return Math.floor(amount)
}

/**
 * Page copying carries a form's widgets but not the form itself. Silently
 * breaking someone's fillable PDF is worse than a line of warning.
 */
/** Something worth knowing that is not a reason to stop. Goes to stderr, so a
 *  redirected stdout still carries only the result. */
function warn(text: string): void {
  // Warnings name files and quote the library, and both come from outside.
  console.error(dim(`convert.in: ${tame(text)}`))
}

async function warnFormLoss(files: Uint8Array[], about = ''): Promise<void> {
  const anyForms = (await Promise.all(files.map(hasFormFields))).some(Boolean)
  if (anyForms) {
    warn(
      about +
        'this document has form fields, and copying pages leaves them behind.\n' +
        '            rotate, watermark, number and protect keep them intact.',
    )
  }
}

/** Passwords do not belong in argv; say so once, then carry on. */
function warnInlineSecret(...given: (string | undefined)[]): void {
  if (given.some((value) => value !== undefined)) {
    warn(
      'a password typed as an argument stays in your shell history and shows up in ps.\n' +
        '            Leave the flag off and you will be asked for it instead.',
    )
  }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * A warning about one file among many has to say which one. About the only file
 * there is, naming it again is noise.
 */
const named = (files: string[], input: string) =>
  files.length > 1 ? `${basename(input)}: ` : ''

/**
 * Several commands read better with their argument last: `watermark in.pdf DRAFT`,
 * `sign contract.pdf mark.png`. That only works while there is something in front
 * of it, and the matching flag covers the batch case where every word is a file.
 */
const trailingArgument = (positionals: string[]) =>
  positionals.length > 1 ? positionals.at(-1) : undefined

function sizeDelta(before: number, after: number): string {
  const change = sizeChange(before, after)
  if (change === 0) return 'the same size'
  return change > 0 ? `${change}% smaller` : `${-change}% larger`
}


/** Levenshtein distance, so a typed command can be matched to the nearest real one. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        next[j - 1]! + 1,
        row[j]! + 1,
        row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    row = next
  }
  return row[b.length]!
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      pages: { type: 'string', short: 'p' },
      force: { type: 'boolean', short: 'f', default: false },
      size: { type: 'string', default: 'fit' },
      orientation: { type: 'string', default: 'auto' },
      margin: { type: 'string' },
      dpi: { type: 'string' },
      by: { type: 'string', default: '90' },
      every: { type: 'string', default: '1' },
      sort: { type: 'string', default: 'given' },
      'open-password': { type: 'string' },
      'permissions-password': { type: 'string' },
      password: { type: 'string' },
      printing: { type: 'string', default: 'high' },
      changes: { type: 'string', default: 'any' },
      'no-copying': { type: 'boolean', default: false },
      text: { type: 'string' },
      opacity: { type: 'string', default: '0.12' },
      angle: { type: 'string', default: '45' },
      position: { type: 'string' },
      start: { type: 'string', default: '1' },
      format: { type: 'string', default: '{n}' },
      'text-size': { type: 'string' },
      to: { type: 'string' },
      quality: { type: 'string' },
      lossless: { type: 'boolean', default: false },
      background: { type: 'string', default: '#ffffff' },
      width: { type: 'string' },
      height: { type: 'string' },
      stretch: { type: 'boolean', default: false },
      'max-side': { type: 'string' },
      'max-size': { type: 'string' },
      signature: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  })

  const [command, ...rest] = positionals
  if (values.version || command === 'version') {
    // Read at run time rather than baked in, so a checkout and an installed
    // copy cannot disagree about which one is running.
    const manifest = new URL('../package.json', import.meta.url)
    const { version } = JSON.parse(await readFile(manifest, 'utf8')) as { version: string }
    console.log(`convert.in ${version}`)
    return
  }
  if (values.help || command === undefined || command === 'help') {
    const lang: Lang = [command, ...rest].includes('id') ? 'id' : 'en'
    console.log(guide(lang))
    return
  }

  const force = values.force

  /**
   * Run a one-in, one-out command over however many files were given. A single
   * input keeps -o meaning the file it has always meant; several turn it into a
   * directory, because several results cannot share one name.
   *
   * Every target is worked out and checked before the first one is written, so
   * a batch that would overwrite or collide stops with nothing half done.
   */
  async function each(
    inputs: string[],
    name: (input: string) => string,
    work: (file: Uint8Array, input: string) => Promise<Produced | null>,
  ): Promise<void> {
    // Every input is checked before any output directory is made, so a typo in
    // the fortieth filename is found before the first file is written rather
    // than after thirty-nine of them are.
    for (const input of inputs) {
      if (!(await exists(input))) fail(`${input} does not exist.`)
    }
    const many = inputs.length > 1
    const outDir = many ? await outputDir(values.out, dirname(inputs[0]!), true) : undefined
    const targets: string[] = []
    for (const input of inputs) {
      const target = many
        ? join(outDir!, name(input))
        : await outputFile(values.out, beside(input, name(input)), force)
      if (target === input) {
        fail(`${input} is both the input and the output. Pass -o to write somewhere else.`)
      }
      // Two inputs from different folders can share a basename, and the second
      // would land on top of the first without anything being said.
      if (targets.includes(target)) {
        fail(`${basename(target)} would be written twice. Convert those two separately.`)
      }
      if (many && !force && (await exists(target))) {
        fail(`${target} already exists. Add --force to overwrite it.`)
      }
      targets.push(target)
    }
    for (const [index, input] of inputs.entries()) {
      const produced = await work(await read(input), input)
      // null means the command decided this file needed nothing doing, and has
      // already said why.
      if (produced === null) continue
      const target = targets[index]!
      await writeFile(target, produced.bytes, produced.mode === undefined ? {} : { mode: produced.mode })
      // writeFile's mode only applies to a file it creates, so overwriting an
      // existing one with --force kept whatever permissions that file already
      // had. For the one command that deliberately narrows them, that silently
      // handed a decrypted document to every account on the machine.
      if (produced.mode !== undefined) await chmod(target, produced.mode)
      console.log(`✓ ${target}  ${dim(`${produced.detail} · ${humanSize(produced.bytes.length)}`)}`)
    }
  }

  switch (command) {
    case 'convert': {
      const files = requireInputs(rest, 'images')
      // "convert shot.png webp" reads better than spelling out the flag, so the
      // last positional is taken as the target when it names a format.
      const trailing = rest.at(-1)
      const named = trailing !== undefined && isImageFormat(trailing.toLowerCase()) ? files.pop() : undefined
      if (files.length === 0) fail('no images given. Run "convert.in --help" for examples.')
      if (values.to !== undefined && named !== undefined && named.toLowerCase() !== values.to.toLowerCase()) {
        fail(`--to says ${values.to} and the last word says ${named}. Give the format once.`)
      }
      const target = values.to ?? named
      if (target === undefined) {
        fail(`which format? e.g. convert.in convert photo.png --to webp\n  one of: ${IMAGE_FORMATS.join(', ')}`)
      }
      const format = oneOf<ImageFormat>(target.toLowerCase(), IMAGE_FORMATS, 'to')
      const quality = values.quality === undefined ? undefined : number(values.quality, 'quality')
      // Checked here as well as in the encoder, so a batch of forty files says
      // so before it writes the first one.
      if (quality !== undefined && (quality < 1 || quality > 100)) {
        fail('--quality must be a number from 1 to 100')
      }
      if (values.lossless && format === 'jpeg') {
        fail('--lossless does not apply to JPEG, which has no lossless mode. Try png, webp, avif or jxl.')
      }
      // Only the formats without an alpha channel have anything to put behind
      // a transparent pixel, so a background asked for anywhere else is a
      // misunderstanding worth naming rather than quietly dropping.
      if (values.background !== '#ffffff' && keepsAlpha(format)) {
        warn(`${format.toUpperCase()} keeps transparency, so --background does nothing here.`)
      }

      // Worked out once rather than per file, so a batch is refused before the
      // first output is written rather than halfway through.
      const resizing =
        values.width === undefined && values.height === undefined
          ? undefined
          : {
              ...(values.width === undefined ? {} : { width: number(values.width, 'width') }),
              ...(values.height === undefined ? {} : { height: number(values.height, 'height') }),
              fit: !values.stretch,
            }
      if (resizing !== undefined) {
        // A one-pixel probe, only to make the range check fail here rather than
        // once per file in the middle of a batch.
        resizedTo({ width: 100, height: 100, data: new Uint8ClampedArray(0) }, resizing)
      }
      if (values.stretch && (values.width === undefined || values.height === undefined)) {
        fail('--stretch needs both --width and --height. With one of them the other follows the picture.')
      }

      const setting =
        values.lossless || format === 'png'
          ? 'lossless'
          : `quality ${quality ?? defaultQuality(format)}`

      return each(
        files,
        (input) => `${stem(input)}.${extensionFor(format)}`,
        async (source, input) => {
          // Re-encoding a lossy format at the same format throws away detail for
          // nothing. PNG to PNG is worth doing, because it comes out optimised.
          if (sniff(source) === format && !values.lossless && format !== 'png') {
            warn(
              `${basename(input)} is already ${format.toUpperCase()}, and encoding it again ` +
                'loses a little more detail.',
            )
          }
          // A decoder handed half a file does not refuse it: it fills what it
          // never received with grey and hands back a full-size picture, so
          // without this the run reports success over an image whose bottom is
          // missing.
          if (looksTruncated(source)) {
            warn(
              `${basename(input)} stops before the end of the picture, so part of it is ` +
                'missing.\n            The conversion goes ahead with what is there.',
            )
          }
          const decoded = await decodeImage(source)
          const pixels = resizing === undefined ? decoded : resize(decoded, resizing)
          const bytes = await encodeImage(pixels, {
            format,
            quality,
            lossless: values.lossless,
            background: values.background,
          })
          const shape =
            resizing === undefined
              ? `${pixels.width}x${pixels.height}`
              : `${decoded.width}x${decoded.height} to ${pixels.width}x${pixels.height}`
          return {
            bytes,
            detail: `${format.toUpperCase()}, ${shape}, ${setting}, ${sizeDelta(source.length, bytes.length)}`,
          }
        },
      )
    }

    case 'compress': {
      const files = requireInputs(rest, 'PDFs')
      const settings = {
        ...(values.quality === undefined ? {} : { quality: number(values.quality, 'quality') }),
        ...(values['max-side'] === undefined
          ? {}
          : { maxSide: number(values['max-side'], 'max-side') }),
      }
      const limit =
        values['max-size'] === undefined ? undefined : bytes(values['max-size'], 'max-size')
      return each(files, (input) => `${stem(input)}-compressed.pdf`, async (file, input) => {
        // A file already under the limit is one to leave alone. Re-encoding it
        // to meet a limit it already meets would only cost it quality.
        if (limit !== undefined && file.length <= limit) {
          warn(
            named(files, input) +
              `already ${humanSize(file.length)}, under the ${humanSize(limit)} limit, ` +
              'so it was copied rather than re-encoded.',
          )
          return { bytes: file, detail: 'left as it was' }
        }
        const result =
          limit === undefined
            ? { ...(await compressPdf(file, settings)), fits: true, used: settings }
            : await compressToFit(file, limit, settings)
        // A limit nothing could meet is worth saying out loud: the file is
        // written either way, but sending it somewhere that will bounce it is
        // worse than being told now.
        if (!result.fits) {
          warn(
            named(files, input) +
              `this is ${humanSize(result.after)} at the hardest setting here, and the limit is ` +
              `${humanSize(limit!)}.\n            Splitting the document is the next thing to try.`,
          )
        }
        // Saying why nothing happened is the whole difference between a tool that
        // looks broken and one that has told you your file is already as small as
        // it goes.
        if (result.replaced === 0 && result.fits) {
          warn(
            named(files, input) +
              (result.images === 0
                ? 'this PDF holds no images, so there was nothing to re-encode. Text and vector\n' +
                  '            drawings are already about as small as they get.'
                : `none of its ${plural(result.images, 'image')} came out smaller than they already were.`),
          )
        }
        return {
          bytes: result.bytes,
          detail: [
            `${plural(result.replaced, 'image')} re-encoded`,
            result.skipped > 0 ? `${result.skipped} left alone` : '',
            result.used.quality === undefined ? '' : `quality ${result.used.quality}`,
            result.used.maxSide === undefined ? '' : `${result.used.maxSide}px wide at most`,
            sizeDelta(result.before, result.after),
          ]
            .filter(Boolean)
            .join(', '),
        }
      })
    }

    case 'sign': {
      // "sign contract.pdf mark.png" reads better than spelling out the flag, so
      // the last word names the signature. --signature says it once instead,
      // which is what a whole folder of contracts needs.
      const given = values.signature ?? trailingArgument(rest)
      if (given === undefined) {
        fail('which signature? e.g. convert.in sign contract.pdf signature.png')
      }
      const files = requireInputs(values.signature === undefined ? rest.slice(0, -1) : rest, 'PDFs')
      const signature = await read(localPath(given))
      const settings = {
        signature,
        // Where a form is signed, rather than the centre a page number wants.
        position: oneOf<Corner>(values.position ?? 'bottom-right', CORNERS, 'position'),
        width: number(values.width ?? '150', 'width'),
        margin: number(values.margin ?? '36', 'margin'),
      }
      return each(files, (input) => `${stem(input)}-signed.pdf`, async (file) => {
        // Worked out per file, because the last page of one is not the last page
        // of the next.
        const pages =
          values.pages === undefined ? undefined : parseRanges(values.pages, await pageCount(file))
        return {
          bytes: await signPdf(file, { ...settings, ...(pages === undefined ? {} : { pages }) }),
          detail: `${basename(given)} on ${pages === undefined ? 'the last page' : plural(pages.length, 'page')}`,
        }
      })
    }

    case 'images': {
      const files = ordered(requireInputs(rest, 'images'), values.sort)
      const out = await outputFile(values.out, beside(files[0]!, `${commonName(files)}.pdf`), force)
      const sources = await Promise.all(files.map(read))
      files.forEach((input, at) => {
        if (looksTruncated(sources[at]!)) {
          warn(`${basename(input)} stops before the end of the picture, so part of it is missing.`)
        }
      })
      const pdf = await imagesToPdf(sources, {
        pageSize: oneOf<PageSize>(values.size, ['fit', 'a4', 'letter'], 'size'),
        orientation: oneOf<Orientation>(
          values.orientation,
          ['auto', 'portrait', 'landscape'],
          'orientation',
        ),
        marginPt: number(values.margin ?? '0', 'margin'),
        ...(values.dpi === undefined ? {} : { dpi: number(values.dpi, 'dpi') }),
        decode: decodeImage,
      })
      await writeFile(out, pdf)
      return report(out, plural(files.length, 'page'))
    }

    case 'merge': {
      const files = ordered(requireInputs(rest, 'PDFs'), values.sort)
      const out = await outputFile(
        values.out,
        beside(files[0]!, `${commonName(files)}-merged.pdf`),
        force,
      )
      const sources = await Promise.all(files.map(read))
      await warnFormLoss(sources)
      const pdf = await mergePdfs(sources)
      await writeFile(out, pdf)
      return report(out, `${plural(await pageCount(pdf), 'page')} from ${plural(files.length, 'file')}`)
    }

    case 'select': {
      // "select in.pdf 1-3" reads better than "select in.pdf --pages 1-3", so the
      // last word is accepted as the range. The flag still works, and is what a
      // batch needs.
      const spec = values.pages ?? trailingArgument(rest)
      if (spec === undefined) fail('which pages? e.g. convert.in select in.pdf 1-3,7')
      const files = requireInputs(values.pages === undefined ? rest.slice(0, -1) : rest, 'PDFs')
      return each(files, (input) => `${stem(input)}-selected.pdf`, async (file, input) => {
        await warnFormLoss([file], named(files, input))
        // The range is re-read against each document, so 1-3 means the first
        // three pages of whichever file is in hand.
        const pdf = await selectPages(file, parseRanges(spec, await pageCount(file)))
        return { bytes: pdf, detail: plural(await pageCount(pdf), 'page') }
      })
    }

    case 'rotate': {
      // A trailing number is the angle, but only a number: a file called 90.pdf
      // is still a file.
      const trailing = trailingArgument(rest)
      const angle = trailing !== undefined && Number.isFinite(Number(trailing)) ? trailing : undefined
      const degrees = number(angle ?? values.by, 'by')
      const files = requireInputs(angle === undefined ? rest : rest.slice(0, -1), 'PDFs')
      return each(files, (input) => `${stem(input)}-rotated.pdf`, async (file) => {
        const total = await pageCount(file)
        // No pages named means the whole document, which is what "rotate this" means.
        const indices =
          values.pages === undefined
            ? Array.from({ length: total }, (_, i) => i)
            : parseRanges(values.pages, total)
        return {
          bytes: await rotatePages(file, indices, degrees),
          detail: `${indices.length} of ${plural(total, 'page')} turned ${degrees}°`,
        }
      })
    }

    case 'split': {
      const [input] = requireInputs(rest, 'PDF')
      const file = await read(input!)
      await warnFormLoss([file])
      const every = number(rest[1] ?? values.every, 'every')
      const outDir = await outputDir(values.out, beside(input!, `${stem(input!)}-pages`), force)
      const parts = await splitPdf(file, chunkPages(await pageCount(file), every))
      const width = String(parts.length).length
      await Promise.all(
        parts.map((part, i) =>
          writeFile(join(outDir, `${stem(input!)}-${String(i + 1).padStart(width, '0')}.pdf`), part),
        ),
      )
      return report(outDir, plural(parts.length, 'file'))
    }

    case 'protect': {
      const files = requireInputs(rest, 'PDFs')
      warnInlineSecret(values['open-password'], values['permissions-password'], values.password)

      // With neither flag given, ask for the one Acrobat asks for first.
      const openPassword =
        values['open-password'] ??
        (values['permissions-password'] === undefined
          ? await askSecret('Document open password: ')
          : undefined)

      const settings = {
        openPassword,
        permissionsPassword: values['permissions-password'],
        printing: oneOf<PrintingLevel>(values.printing, PRINTING_LEVELS, 'printing'),
        changes: oneOf<ChangesLevel>(values.changes, CHANGES_LEVELS, 'changes'),
        copying: !values['no-copying'],
        currentPassword: values.password,
      }
      // Said before the file is written, while the settings can still be
      // changed, rather than left for a README to explain afterwards.
      const limit = caveat(settings)
      if (limit === 'opensToAnyone') {
        warn(
          'these restrictions carry no open password, so the file opens for anyone and\n' +
            '            they come off again with no password at all.',
        )
      } else if (limit === 'liftableByReader') {
        warn(
          'anyone you give the open password to can take these restrictions off, with this\n' +
            '            tool or any other. They record an intention; they do not enforce one.',
        )
      }

      // Asked for once and applied to all of them, which is the point of handing
      // over a folder rather than a file.
      return each(files, (input) => `${stem(input)}-protected.pdf`, async (file) => ({
        bytes: await protectPdf(file, settings),
        detail: 'AES-256, Acrobat X and later',
      }))
    }

    case 'unlock': {
      const files = requireInputs(rest, 'PDFs')
      warnInlineSecret(values.password)
      // Asked for at the first file that actually needs one and kept for the
      // rest, because a folder of statements shares a password.
      let secret = values.password

      return each(files, (input) => `${stem(input)}-unlocked.pdf`, async (file, input) => {
        const security = await describeSecurity(file)
        const partial = clearWarning(security.inTheClear)
        if (partial !== null) warn(named(files, input) + partial)
        if (!security.encrypted) {
          const why = 'is not encrypted, so there is nothing to unlock.'
          // Alone it is the whole request and worth failing on; among others it
          // is one file to leave out.
          if (files.length === 1) fail(`${input} ${why}`)
          warn(`${basename(input)} ${why}`)
          return null
        }
        // A file carrying only a permissions password has an empty open password,
        // so it comes apart without a secret. Prompting for one would suggest the
        // restrictions are holding something shut when they are not.
        if (!security.needsPassword) {
          warn(
            named(files, input) +
              'this file has no open password: only its permissions are set, and those come off\n' +
              '            without a secret. Any PDF tool can do the same.',
          )
        }
        const password = security.needsPassword
          ? (secret ??= await askSecret('Password: '))
          : (secret ?? '')
        const opened = await unlockPdf(file, password)
        return {
          bytes: opened,
          detail: plural(await pageCount(opened), 'page'),
          // The point of this command is to strip protection, so the result is
          // the readable copy of something that was deliberately locked. Default
          // permissions would hand it to every account on the machine.
          mode: 0o600,
        }
      })
    }

    case 'watermark': {
      const text = values.text ?? trailingArgument(rest)
      if (text === undefined) fail('what should it say? e.g. convert.in watermark in.pdf "DRAFT"')
      // Any word can be a watermark, including a filename, so a whole PDF
      // quietly becoming the stamp is a real way to lose a batch.
      if (values.text === undefined && (await exists(localPath(text)))) {
        fail(
          `"${text}" is both the last word and a file that exists, so it is not clear whether it\n` +
            '  is the text or another input. Pass the text as --text to say which.',
        )
      }
      const files = requireInputs(values.text === undefined ? rest.slice(0, -1) : rest, 'PDFs')
      const settings = {
        text,
        opacity: number(values.opacity, 'opacity'),
        angleDegrees: number(values.angle, 'angle'),
        size: values['text-size'] === undefined ? undefined : number(values['text-size'], 'text-size'),
      }
      return each(files, (input) => `${stem(input)}-watermarked.pdf`, async (file) => {
        const total = await pageCount(file)
        const pages = values.pages === undefined ? undefined : parseRanges(values.pages, total)
        return {
          bytes: await watermarkPdf(file, { ...settings, pages }),
          detail: `"${cap(text, 60)}" on ${plural(pages?.length ?? total, 'page')}`,
        }
      })
    }

    case 'number': {
      const files = requireInputs(rest, 'PDFs')
      const settings = {
        position: oneOf<Corner>(values.position ?? 'bottom-center', CORNERS, 'position'),
        start: number(values.start, 'start'),
        size: number(values['text-size'] ?? '10', 'text-size'),
        margin: number(values.margin ?? '28', 'margin'),
        format: values.format,
      }
      return each(files, (input) => `${stem(input)}-numbered.pdf`, async (file) => {
        const total = await pageCount(file)
        const pages = values.pages === undefined ? undefined : parseRanges(values.pages, total)
        return {
          bytes: await numberPages(file, { ...settings, pages }),
          detail: plural(pages?.length ?? total, 'page'),
        }
      })
    }

    case 'resize': {
      const files = requireInputs(rest, 'PDFs')
      // "resize scan.pdf a4" reads better than spelling the flag out, so a
      // trailing word that names a paper size is taken as one.
      const trailing = trailingArgument(positionals)
      const named = trailing !== undefined && (PAPERS as string[]).includes(trailing.toLowerCase())
      if (named) files.pop()
      const paper = oneOf<Paper>(
        named ? trailing!.toLowerCase() : (values.size ?? 'a4'),
        PAPERS,
        'size',
      )
      const settings = {
        paper,
        orientation: oneOf<SheetOrientation>(
          values.orientation ?? 'auto',
          SHEET_ORIENTATIONS,
          'orientation',
        ),
        marginPt: number(values.margin ?? '0', 'margin'),
      }
      return each(files, (input) => `${stem(input)}-${paper}.pdf`, async (file) => ({
        bytes: await resizePages(file, settings),
        detail: `${plural(await pageCount(file), 'page')} on ${paper.toUpperCase()}`,
      }))
    }

    case 'clean': {
      const files = requireInputs(rest, 'PDFs')
      return each(files, (input) => `${stem(input)}-clean.pdf`, async (file, input) => {
        const before = await describeMetadata(file)
        if (!before.any) {
          warn(named(files, input) + 'this PDF already says nothing about itself.')
          return { bytes: file, detail: 'nothing to remove' }
        }
        const named_ = before.entries.map((entry) => entry.name)
        return {
          bytes: await stripMetadata(file),
          detail: [
            named_.length > 0
              ? `${plural(named_.length, 'field')} removed (${cap(oneLine(named_.join(', ')))})`
              : '',
            before.xmp > 0 ? `${humanSize(before.xmp)} of XMP removed` : '',
          ]
            .filter(Boolean)
            .join(', '),
        }
      })
    }

    case 'info': {
      const files = requireInputs(rest, 'PDFs')
      for (const input of files) {
        const file = await read(input)
        const { size } = await stat(input)
        const security = await describeSecurity(file)

        // A file that announces encryption and then leaves half of itself
        // readable is the one thing here nobody would think to check for, and
        // the answer changes what they do with the file.
        const partial = clearWarning(security.inTheClear)

        // A locked file still has something worth saying about it, so report the
        // lock rather than failing on the read.
        if (security.needsPassword) {
          const shape = partial === null ? 'encrypted, needs a password' : 'encrypted in part only'
          console.log(`${tame(input)}  ${dim(`${humanSize(size)} · ${shape}`)}`)
          if (partial !== null) warn(partial)
          continue
        }
        if (partial !== null) warn(`${basename(input)}: ${partial}`)

        const { pages, width, height } = await describe(file)
        const inches = `${(width / 72).toFixed(2)} × ${(height / 72).toFixed(2)} in`
        const lock = security.encrypted ? ' · encrypted, opens without a password' : ''
        console.log(
          `${tame(input)}  ${dim(`${plural(pages, 'page')} · ${humanSize(size)} · ` +
            `${Math.round(width)} × ${Math.round(height)} pt · ${inches}${lock}`)}`,
        )

        // What the file says about whoever made it. None of this shows while
        // reading the document, and a CV, a report or a leaked draft all carry
        // it: run "clean" to take it out.
        const meta = await describeMetadata(file)
        for (const entry of meta.entries) {
          const mark = entry.custom ? dim(' (custom)') : ''
          // The most direct path in this tool from somebody else's file to a
          // terminal: both the key and its value are whatever the document says.
          const name = cap(oneLine(tame(entry.name)), 24).padEnd(16)
          console.log(`  ${name} ${cap(oneLine(tame(entry.value)), 200)}${mark}`)
        }
        if (meta.xmp > 0) console.log(`  ${'XMP'.padEnd(16)} ${dim(`${humanSize(meta.xmp)} of XML`)}`)
        if (meta.any) console.log(dim('  Run "convert.in clean" to take all of that out.'))
      }
      return
    }

    default: {
      const near = COMMANDS.filter((name) => distance(name, command) <= 2).sort(
        (a, b) => distance(a, command) - distance(b, command),
      )[0]
      fail(
        `unknown command: ${command}` +
          (near === undefined ? '' : `. Did you mean "${near}"?`) +
          '\n  Run "convert.in --help" for the list.',
      )
    }
  }
}

main().catch((error: unknown) => {
  console.error(`convert.in: ${tame(explain(error))}`)
  process.exitCode = 1
})
