import { parseArgs } from 'node:util'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import { guide, type Lang } from './help.ts'
import { askSecret } from './prompt.ts'
import { dim, isWsl } from './term.ts'
import { humanSize, sizeChange } from './core/units.ts'
import { imagesToPdf, type Orientation, type PageSize } from './core/images-to-pdf.ts'
import { decodeImage } from './core/images-node.ts'
import {
  IMAGE_FORMATS,
  defaultQuality,
  encodeImage,
  extensionFor,
  isImageFormat,
  keepsAlpha,
  resize,
  resizedTo,
  sniff,
  type ImageFormat,
} from './core/images.ts'
import { compressPdf } from './core/pdf-compress.ts'
import { signPdf } from './core/pdf-sign.ts'
import {
  chunkPages,
  describe,
  hasFormFields,
  mergePdfs,
  pageCount,
  parseRanges,
  rotatePages,
  selectPages,
  splitPdf,
} from './core/pdf-pages.ts'
import {
  CHANGES_LEVELS,
  caveat,
  describeSecurity,
  explain,
  PRINTING_LEVELS,
  protectPdf,
  unlockPdf,
  type ChangesLevel,
  type PrintingLevel,
} from './core/pdf-security.ts'
import { numberPages, watermarkPdf, type Corner, CORNERS } from './core/pdf-stamp.ts'

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
  console.log(`✓ ${target}  ${dim(`${detail} · ${humanSize(total)}`)}`)
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
 * Page copying carries a form's widgets but not the form itself. Silently
 * breaking someone's fillable PDF is worse than a line of warning.
 */
/** Something worth knowing that is not a reason to stop. Goes to stderr, so a
 *  redirected stdout still carries only the result. */
function warn(text: string): void {
  console.error(dim(`convert.in: ${text}`))
}

async function warnFormLoss(files: Uint8Array[]): Promise<void> {
  const anyForms = (await Promise.all(files.map(hasFormFields))).some(Boolean)
  if (anyForms) {
    warn(
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

      // Several inputs need somewhere to put several outputs. One input keeps
      // -o meaning the file it has always meant.
      const many = files.length > 1
      const outDir = many
        ? await outputDir(values.out, dirname(files[0]!), true)
        : undefined
      const written: string[] = []
      for (const input of files) {
        const source = await read(input)
        // Re-encoding a lossy format at the same format throws away detail for
        // nothing. PNG to PNG is worth doing, because it comes out optimised.
        if (sniff(source) === format && !values.lossless && format !== 'png') {
          warn(
            `${basename(input)} is already ${format.toUpperCase()}, and encoding it again ` +
              'loses a little more detail.',
          )
        }
        const out = many
          ? join(outDir!, `${stem(input)}.${extensionFor(format)}`)
          : await outputFile(values.out, beside(input, `${stem(input)}.${extensionFor(format)}`), force)
        if (out === input) fail(`${input} is both the input and the output. Pass -o to write somewhere else.`)
        if (many && !force && (await exists(out))) {
          fail(`${out} already exists. Add --force to overwrite it.`)
        }
        const decoded = await decodeImage(source)
        const pixels = resizing === undefined ? decoded : resize(decoded, resizing)
        const bytes = await encodeImage(pixels, {
          format,
          quality,
          lossless: values.lossless,
          background: values.background,
        })
        await writeFile(out, bytes)
        written.push(out)
        const shape =
          resizing === undefined
            ? `${pixels.width}x${pixels.height}`
            : `${decoded.width}x${decoded.height} to ${pixels.width}x${pixels.height}`
        if (many) {
          console.log(
            `✓ ${out}  ${dim(`${shape} · ${humanSize(bytes.length)}, ${sizeDelta(source.length, bytes.length)}`)}`,
          )
        } else {
          const setting =
            values.lossless || format === 'png'
              ? 'lossless'
              : `quality ${quality ?? defaultQuality(format)}`
          await report(out, `${format.toUpperCase()}, ${shape}, ${setting}, ${sizeDelta(source.length, bytes.length)}`)
        }
      }
      return
    }

    case 'compress': {
      const [input] = requireInputs(rest, 'PDF')
      const file = await read(input!)
      const out = await outputFile(
        values.out,
        beside(input!, `${stem(input!)}-compressed.pdf`),
        force,
      )
      if (out === input) fail(`${input} is both the input and the output. Pass -o to write somewhere else.`)
      const result = await compressPdf(file, {
        ...(values.quality === undefined ? {} : { quality: number(values.quality, 'quality') }),
        ...(values['max-side'] === undefined
          ? {}
          : { maxSide: number(values['max-side'], 'max-side') }),
      })
      // Saying why nothing happened is the whole difference between a tool that
      // looks broken and one that has told you your file is already as small as
      // it goes.
      if (result.replaced === 0) {
        warn(
          result.images === 0
            ? 'this PDF holds no images, so there was nothing to re-encode. Text and vector\n' +
                '            drawings are already about as small as they get.'
            : `none of its ${plural(result.images, 'image')} came out smaller than they already were.`,
        )
      }
      await writeFile(out, result.bytes)
      const detail = [
        `${plural(result.replaced, 'image')} re-encoded`,
        result.skipped > 0 ? `${result.skipped} left alone` : '',
        sizeDelta(result.before, result.after),
      ].filter(Boolean).join(', ')
      return report(out, detail)
    }

    case 'sign': {
      const [input] = requireInputs(rest, 'PDF')
      const file = await read(input!)
      // "sign contract.pdf mark.png" reads better than spelling out the flag.
      const given = values.signature ?? rest[1]
      if (given === undefined) {
        fail('which signature? e.g. convert.in sign contract.pdf signature.png')
      }
      const signature = await read(localPath(given))
      const pages =
        values.pages === undefined ? undefined : parseRanges(values.pages, await pageCount(file))
      const out = await outputFile(values.out, beside(input!, `${stem(input!)}-signed.pdf`), force)
      await writeFile(
        out,
        await signPdf(file, {
          signature,
          // Where a form is signed, rather than the centre a page number wants.
          position: oneOf<Corner>(values.position ?? 'bottom-right', CORNERS, 'position'),
          width: number(values.width ?? '150', 'width'),
          margin: number(values.margin ?? '36', 'margin'),
          ...(pages === undefined ? {} : { pages }),
        }),
      )
      return report(out, `${basename(given)} on ${pages === undefined ? 'the last page' : plural(pages.length, 'page')}`)
    }

    case 'images': {
      const files = ordered(requireInputs(rest, 'images'), values.sort)
      const out = await outputFile(values.out, beside(files[0]!, `${commonName(files)}.pdf`), force)
      const pdf = await imagesToPdf(await Promise.all(files.map(read)), {
        pageSize: oneOf<PageSize>(values.size, ['fit', 'a4', 'letter'], 'size'),
        orientation: oneOf<Orientation>(
          values.orientation,
          ['auto', 'portrait', 'landscape'],
          'orientation',
        ),
        marginPt: number(values.margin ?? '0', 'margin'),
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
      const [input] = requireInputs(rest, 'PDF')
      const file = await read(input!)
      // "select in.pdf 1-3" reads better than "select in.pdf --pages 1-3", so the
      // second positional is accepted as the range. The flag still works.
      const spec = rest[1] ?? values.pages
      if (spec === undefined) fail('which pages? e.g. convert.in select in.pdf 1-3,7')
      await warnFormLoss([file])
      const out = await outputFile(
        values.out,
        beside(input!, `${stem(input!)}-selected.pdf`),
        force,
      )
      const pdf = await selectPages(file, parseRanges(spec, await pageCount(file)))
      await writeFile(out, pdf)
      return report(out, plural(await pageCount(pdf), 'page'))
    }

    case 'rotate': {
      const [input] = requireInputs(rest, 'PDF')
      const file = await read(input!)
      const total = await pageCount(file)
      // No pages named means the whole document, which is what "rotate this" means.
      const indices =
        values.pages === undefined
          ? Array.from({ length: total }, (_, i) => i)
          : parseRanges(values.pages, total)
      const degrees = number(rest[1] ?? values.by, 'by')
      const out = await outputFile(values.out, beside(input!, `${stem(input!)}-rotated.pdf`), force)
      await writeFile(out, await rotatePages(file, indices, degrees))
      return report(out, `${indices.length} of ${plural(total, 'page')} turned ${degrees}°`)
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
      const [input] = requireInputs(rest, 'PDF')
      const file = await read(input!)
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

      const out = await outputFile(
        values.out,
        beside(input!, `${stem(input!)}-protected.pdf`),
        force,
      )
      await writeFile(out, await protectPdf(file, settings))
      return report(out, 'AES-256, Acrobat X and later')
    }

    case 'unlock': {
      const [input] = requireInputs(rest, 'PDF')
      const file = await read(input!)
      warnInlineSecret(values.password)

      const security = await describeSecurity(file)
      if (!security.encrypted) fail(`${input} is not encrypted, so there is nothing to unlock.`)
      // A file carrying only a permissions password has an empty open password,
      // so it comes apart without a secret. Prompting for one would suggest the
      // restrictions are holding something shut when they are not.
      if (!security.needsPassword) {
        warn(
          'this file has no open password: only its permissions are set, and those come off\n' +
            '            without a secret. Any PDF tool can do the same.',
        )
      }
      const password = security.needsPassword
        ? (values.password ?? (await askSecret('Password: ')))
        : (values.password ?? '')

      const out = await outputFile(values.out, beside(input!, `${stem(input!)}-unlocked.pdf`), force)
      const opened = await unlockPdf(file, password)
      // The point of this command is to strip protection, so the result is the
      // readable copy of something that was deliberately locked. Default
      // permissions would hand it to every account on the machine.
      await writeFile(out, opened, { mode: 0o600 })
      return report(out, plural(await pageCount(opened), 'page'))
    }

    case 'watermark': {
      const [input] = requireInputs(rest, 'PDF')
      const file = await read(input!)
      const text = rest[1] ?? values.text
      if (text === undefined) fail('what should it say? e.g. convert.in watermark in.pdf "DRAFT"')
      const total = await pageCount(file)
      const pages = values.pages === undefined ? undefined : parseRanges(values.pages, total)
      const out = await outputFile(
        values.out,
        beside(input!, `${stem(input!)}-watermarked.pdf`),
        force,
      )
      await writeFile(
        out,
        await watermarkPdf(file, {
          text,
          opacity: number(values.opacity, 'opacity'),
          angleDegrees: number(values.angle, 'angle'),
          size: values['text-size'] === undefined ? undefined : number(values['text-size'], 'text-size'),
          pages,
        }),
      )
      return report(out, `"${text}" on ${plural(pages?.length ?? total, 'page')}`)
    }

    case 'number': {
      const [input] = requireInputs(rest, 'PDF')
      const file = await read(input!)
      const total = await pageCount(file)
      const pages = values.pages === undefined ? undefined : parseRanges(values.pages, total)
      const out = await outputFile(values.out, beside(input!, `${stem(input!)}-numbered.pdf`), force)
      await writeFile(
        out,
        await numberPages(file, {
          position: oneOf<Corner>(values.position ?? 'bottom-center', CORNERS, 'position'),
          start: number(values.start, 'start'),
          size: number(values['text-size'] ?? '10', 'text-size'),
          margin: number(values.margin ?? '28', 'margin'),
          format: values.format,
          pages,
        }),
      )
      return report(out, plural(pages?.length ?? total, 'page'))
    }

    case 'info': {
      const [input] = requireInputs(rest, 'PDF')
      const file = await read(input!)
      const { size } = await stat(input!)
      const security = await describeSecurity(file)

      // A locked file still has something worth saying about it, so report the
      // lock rather than failing on the read.
      if (security.needsPassword) {
        console.log(`${input}  ${dim(`${humanSize(size)} · encrypted, needs a password`)}`)
        return
      }

      const { pages, width, height } = await describe(
        security.encrypted ? await unlockPdf(file, '') : file,
      )
      const inches = `${(width / 72).toFixed(2)} × ${(height / 72).toFixed(2)} in`
      const lock = security.encrypted ? ' · encrypted, opens without a password' : ''
      console.log(
        `${input}  ${dim(`${plural(pages, 'page')} · ${humanSize(size)} · ` +
          `${Math.round(width)} × ${Math.round(height)} pt · ${inches}${lock}`)}`,
      )
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
  console.error(`convert.in: ${explain(error)}`)
  process.exitCode = 1
})
