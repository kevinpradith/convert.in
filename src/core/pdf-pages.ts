import { PDFDocument, degrees, type PDFPage } from '@cantoo/pdf-lib'

/** Page indices here are 0-based; the ranges people type are 1-based. */

/** One page taken from one source document, optionally turned. */
export interface PagePick {
  /** Index into the `sources` array. */
  source: number
  /** 0-based page index inside that source. */
  page: number
  /** Extra rotation in degrees, added to whatever rotation the page already had. */
  rotate?: number
}

/** What a PDF is, in the terms a person asks about: how many pages, and how big. */
export interface Description {
  pages: number
  /** First page size in PDF points, 72pt to the inch. */
  width: number
  height: number
}

export async function describe(file: Uint8Array): Promise<Description> {
  const pdf = await PDFDocument.load(file)
  const pages = pdf.getPageCount()
  if (pages === 0) throw new Error('this PDF has no pages')
  const { width, height } = pdf.getPage(0).getSize()
  return { pages, width, height }
}

/**
 * True when the document has an interactive form.
 *
 * Worth asking before any operation built on copyPages: page copying carries the
 * widgets across but not the AcroForm that gives them names and values, so the
 * fields stop working. Callers warn rather than let that happen quietly.
 */
export async function hasFormFields(file: Uint8Array): Promise<boolean> {
  return (await PDFDocument.load(file)).getForm().getFields().length > 0
}

/** Carry the document information dictionary across, since copyPages does not. */
function carryInfo(from: PDFDocument, to: PDFDocument): void {
  const title = from.getTitle()
  if (title !== undefined) to.setTitle(title)
  const author = from.getAuthor()
  if (author !== undefined) to.setAuthor(author)
  const subject = from.getSubject()
  if (subject !== undefined) to.setSubject(subject)
  const keywords = from.getKeywords()
  if (keywords !== undefined) to.setKeywords(keywords.split(' '))
  const creator = from.getCreator()
  if (creator !== undefined) to.setCreator(creator)
  const created = from.getCreationDate()
  if (created !== undefined) to.setCreationDate(created)
}

export async function pageCount(file: Uint8Array): Promise<number> {
  return (await describe(file)).pages
}

/**
 * Turn an optional page selection into concrete, checked, 0-based indices.
 * Omitting the selection means the whole document, which is what every caller
 * wants when the user did not narrow it down.
 */
export function resolvePages(total: number, pages?: number[]): number[] {
  if (total === 0) throw new Error('this PDF has no pages')
  if (pages === undefined) return Array.from({ length: total }, (_, i) => i)
  if (pages.length === 0) throw new Error('no pages selected')
  for (const index of pages) {
    if (!Number.isInteger(index) || index < 0 || index >= total) {
      throw new Error(`page ${index + 1} is out of range (document has ${total} pages)`)
    }
  }
  return pages
}

/** pdf-lib refuses negative angles, so fold everything into 0..359. */
function normaliseAngle(angle: number): number {
  return ((angle % 360) + 360) % 360
}

/**
 * The one primitive every page-level operation is built from: take pages from
 * any number of source PDFs and lay them out in exactly the order given.
 * Merge, reorder, delete, extract and duplicate are all just different picks.
 */
export async function assemblePages(
  sources: Uint8Array[],
  picks: PagePick[],
): Promise<Uint8Array> {
  if (picks.length === 0) throw new Error('no pages selected')
  const docs = await Promise.all(sources.map((source) => PDFDocument.load(source)))
  const out = await PDFDocument.create()

  // Group by source so each one is copied in a single copyPages call. pdf-lib
  // only shares fonts and images between pages copied together, so copying page
  // by page would duplicate every shared resource and bloat the output.
  const grouped = new Map<number, { pages: number[]; slots: number[] }>()
  picks.forEach((pick, slot) => {
    const doc = docs[pick.source]
    if (!doc) throw new Error(`source ${pick.source + 1} does not exist`)
    if (!Number.isInteger(pick.page) || pick.page < 0 || pick.page >= doc.getPageCount()) {
      throw new Error(
        `page ${pick.page + 1} is out of range (source has ${doc.getPageCount()} pages)`,
      )
    }
    const group = grouped.get(pick.source) ?? { pages: [], slots: [] }
    group.pages.push(pick.page)
    group.slots.push(slot)
    grouped.set(pick.source, group)
  })

  const ordered = new Array<PDFPage>(picks.length)
  for (const [source, group] of grouped) {
    const copies = await out.copyPages(docs[source]!, group.pages)
    group.slots.forEach((slot, i) => {
      ordered[slot] = copies[i]!
    })
  }

  // Merging several documents has to pick one document's properties; Acrobat and
  // the online tools all take the first, so this does too.
  const firstSource = docs[picks[0]!.source]
  if (firstSource !== undefined) carryInfo(firstSource, out)

  ordered.forEach((page, slot) => {
    const added = out.addPage(page)
    const rotate = picks[slot]!.rotate
    if (rotate) added.setRotation(degrees(normaliseAngle(added.getRotation().angle + rotate)))
  })
  return out.save()
}

/** Concatenate whole PDFs in the order given. */
export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('no PDFs given')
  const counts = await Promise.all(files.map(pageCount))
  return assemblePages(
    files,
    counts.flatMap((count, source) =>
      Array.from({ length: count }, (_, page) => ({ source, page })),
    ),
  )
}

/**
 * Keep `indices` in exactly the order given, which covers reorder, delete and
 * extract in one operation. Repeating an index duplicates that page.
 */
export async function selectPages(file: Uint8Array, indices: number[]): Promise<Uint8Array> {
  return assemblePages([file], indices.map((page) => ({ source: 0, page })))
}

/** One output PDF per group of page indices. */
export async function splitPdf(file: Uint8Array, groups: number[][]): Promise<Uint8Array[]> {
  if (groups.length === 0) throw new Error('no page groups given')
  // Known cost: the source is parsed once per group rather than once in total.
  // That is fine below a few hundred pages; hoist the load out of selectPages if
  // it ever stops being.
  return Promise.all(groups.map((group) => selectPages(file, group)))
}

/** Split into consecutive chunks of `size` pages. */
export function chunkPages(total: number, size: number): number[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('chunk size must be an integer >= 1')
  const groups: number[][] = []
  for (let start = 0; start < total; start += size) {
    groups.push(Array.from({ length: Math.min(size, total - start) }, (_, i) => start + i))
  }
  return groups
}

/** Rotate pages in place by a multiple of 90 degrees, relative to their current rotation. */
export async function rotatePages(
  file: Uint8Array,
  indices: number[],
  deltaDegrees: number,
): Promise<Uint8Array> {
  if (!Number.isInteger(deltaDegrees) || deltaDegrees % 90 !== 0) {
    throw new Error('rotation must be a whole multiple of 90 degrees')
  }
  const pdf = await PDFDocument.load(file)
  const total = pdf.getPageCount()
  if (indices.length === 0) throw new Error('no pages selected')
  for (const i of indices) {
    if (!Number.isInteger(i) || i < 0 || i >= total) {
      throw new Error(`page ${i + 1} is out of range (document has ${total} pages)`)
    }
    const page = pdf.getPage(i)
    page.setRotation(degrees(normaliseAngle(page.getRotation().angle + deltaDegrees)))
  }
  return pdf.save()
}

/**
 * Parse a 1-based page range like "1-3,5,9-" into 0-based indices.
 * Shared by the CLI and the web UI so both accept exactly the same syntax.
 */
export function parseRanges(spec: string, total: number): number[] {
  const indices: number[] = []
  for (const part of spec.split(',')) {
    const token = part.trim()
    if (token === '') continue

    // Split on the dash before matching digits. Doing it the other way round,
    // with one regex holding two optional \d+ groups, backtracks quadratically:
    // a hundred thousand digits followed by one stray character took eleven
    // seconds to reject. Splitting first leaves only anchored /^\d+$/ tests,
    // which fail on the first bad character.
    const halves = token.split('-')
    if (halves.length > 2) throw new Error(`bad page range: "${token}"`)

    const open = halves.length === 2
    const left = halves[0]!.trim()
    const right = open ? halves[1]!.trim() : left
    const digits = /^\d+$/

    const hasLeft = left !== ''
    const hasRight = right !== ''
    if (!hasLeft && !hasRight) throw new Error(`bad page range: "${token}"`)
    if ((hasLeft && !digits.test(left)) || (hasRight && !digits.test(right))) {
      throw new Error(`bad page range: "${token}"`)
    }

    const from = hasLeft ? Number(left) : 1
    const to = hasRight ? Number(right) : total
    if (from < 1 || to > total || from > to) {
      throw new Error(`page range "${token}" is out of bounds (document has ${total} pages)`)
    }
    for (let page = from; page <= to; page++) indices.push(page - 1)
  }
  if (indices.length === 0) throw new Error('empty page range')
  return indices
}
