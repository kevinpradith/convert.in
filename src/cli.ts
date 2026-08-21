import { parseArgs } from 'node:util'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import { guide, type Lang } from './help.ts'
import { askSecret } from './prompt.ts'
import { dim, humanSize, isWsl } from './term.ts'
import { imagesToPdf, type Orientation, type PageSize } from './core/images-to-pdf.ts'
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
      position: { type: 'string', default: 'bottom-center' },
      start: { type: 'string', default: '1' },
      format: { type: 'string', default: '{n}' },
      'text-size': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })

  const [command, ...rest] = positionals
  if (values.help || command === undefined || command === 'help') {
    const lang: Lang = [command, ...rest].includes('id') ? 'id' : 'en'
    console.log(guide(lang))
    return
  }

  const force = values.force

  switch (command) {
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

      const out = await outputFile(
        values.out,
        beside(input!, `${stem(input!)}-protected.pdf`),
        force,
      )
      await writeFile(
        out,
        await protectPdf(file, {
          openPassword,
          permissionsPassword: values['permissions-password'],
          printing: oneOf<PrintingLevel>(values.printing, PRINTING_LEVELS, 'printing'),
          changes: oneOf<ChangesLevel>(values.changes, CHANGES_LEVELS, 'changes'),
          copying: !values['no-copying'],
          currentPassword: values.password,
        }),
      )
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
          position: oneOf<Corner>(values.position, CORNERS, 'position'),
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
