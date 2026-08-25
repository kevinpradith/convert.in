import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  degrees,
  type PDFPage,
} from '@cantoo/pdf-lib'
import { carryOutline } from './pdf-outline.ts'

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
  const { width, height } = visibleBox(pdf.getPage(0))
  return { pages, width, height }
}

/** A rectangle in a page's own coordinates, with its corner where the box starts. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The part of a page a reader actually shows.
 *
 * A page carries a MediaBox saying how big the sheet is and, often, a CropBox
 * saying how much of it to display. Where the two differ the CropBox wins, and
 * everything outside it is simply not drawn: a 600 point page cropped to its
 * middle 300 is a 300 point page to everybody but the file itself. Anything
 * that measures a page, or works out a corner of one, has to ask this rather
 * than getSize(), which reports the MediaBox and nothing else.
 *
 * Neither box has to start at the origin, either. A cropping tool leaves boxes
 * like [50 50 645 891], so the corner is part of the answer and not an
 * assumption.
 */
export function visibleBox(page: PDFPage): Box {
  const media = page.getMediaBox()
  // getCropBox falls back to the media box, so the entry has to be looked for
  // rather than the value compared.
  if (page.node.CropBox() === undefined) return media
  const crop = page.getCropBox()
  // A CropBox is only meaningful where it overlaps the sheet, and a reader that
  // finds no overlap falls back to the whole sheet.
  const left = Math.max(media.x, crop.x)
  const bottom = Math.max(media.y, crop.y)
  const right = Math.min(media.x + media.width, crop.x + crop.width)
  const top = Math.min(media.y + media.height, crop.y + crop.height)
  if (right - left <= 0 || top - bottom <= 0) return media
  return { x: left, y: bottom, width: right - left, height: top - bottom }
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

  // Bookmarks name their pages by reference, so copying pages leaves the whole
  // table of contents pointing at objects that came nowhere. Rebuilt here
  // rather than in each caller, because merge, select, split and rotate all
  // come through this one function.
  carryOutline(docs, out, picks)
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
  // Turning is not something a page can be asked for twice: "1,1" or a range
  // that overlaps "odd" means one page, named more than once, not two turns.
  for (const i of new Set(indices)) {
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

    // "odd" and "even" name the halves a duplex scanner gets wrong: a feeder
    // that flips the back of every sheet leaves one of them upside down, and
    // typing out 2,4,6,8 up to 300 is not a page range anybody should write.
    const half = token.toLowerCase()
    if (half === 'odd' || half === 'even') {
      for (let page = half === 'odd' ? 1 : 2; page <= total; page += 2) indices.push(page - 1)
      continue
    }

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

/* ------------------------------------------------------------ page size --- */

/** Page sizes in PDF points, 72 to the inch. */
const PAPER = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
} as const

export type Paper = keyof typeof PAPER

export const PAPERS = Object.keys(PAPER) as Paper[]

/** Named apart from the images-to-PDF one, which answers a different question. */
export type SheetOrientation = 'auto' | 'portrait' | 'landscape'

export const SHEET_ORIENTATIONS: SheetOrientation[] = ['auto', 'portrait', 'landscape']

export interface ResizeOptions {
  /** Which sheet every page should end up on. */
  paper: Paper
  /**
   * 'auto' keeps each page's own shape, turning the sheet to match, so a
   * landscape chart does not come back letterboxed between two white bands.
   */
  orientation?: SheetOrientation
  /** White border to leave around the scaled content, in points. */
  marginPt?: number
}

/**
 * Apply the same move to a page's annotations as to its content.
 *
 * pdf-lib can scale annotations but not move them, and a comment that keeps its
 * old coordinates while the page around it shifts is a comment pointing at the
 * wrong line. Their rectangles are absolute, in the same space the content
 * uses, so the same affine applies: scale, then translate.
 */
function moveAnnotations(page: PDFPage, factor: number, dx: number, dy: number): void {
  const annotations = page.node.Annots()
  if (!(annotations instanceof PDFArray)) return
  for (let at = 0; at < annotations.size(); at++) {
    const annotation = page.node.context.lookup(annotations.get(at))
    if (!(annotation instanceof PDFDict)) continue
    const rect = page.node.context.lookup(annotation.get(PDFName.of('Rect')))
    if (!(rect instanceof PDFArray) || rect.size() < 4) continue
    const moved = [0, 1, 2, 3].map((corner) => {
      const value = page.node.context.lookup(rect.get(corner))
      if (!(value instanceof PDFNumber)) return null
      // Even indices are x, odd are y.
      return value.asNumber() * factor + (corner % 2 === 0 ? dx : dy)
    })
    if (moved.some((value) => value === null)) continue
    annotation.set(
      PDFName.of('Rect'),
      page.node.context.obj(moved.map((value) => PDFNumber.of(value!))),
    )
  }
}

/**
 * Put every page on the same sheet.
 *
 * A PDF does not require one page size: each page carries its own MediaBox, and
 * a document assembled from a scan, an export and a downloaded form quite
 * legally holds three. That is fine on screen and chaos on paper, where the
 * printer rescales, shifts the margins or changes tray at every size change.
 *
 * The content is scaled to fit and centred rather than stretched, so nothing
 * changes shape and nothing is cropped. Annotations are scaled with it, since a
 * comment that stays where it was is a comment pointing at the wrong line.
 *
 * A page stored sideways is measured the way it is looked at: the sheet is
 * turned to match it rather than the content being squeezed into the short
 * edge.
 */
export async function resizePages(
  file: Uint8Array,
  options: ResizeOptions,
): Promise<Uint8Array> {
  const { paper, orientation = 'auto', marginPt = 0 } = options
  const sheet = PAPER[paper]
  if (sheet === undefined) throw new Error(`page size must be one of: ${PAPERS.join(', ')}`)
  if (!Number.isFinite(marginPt) || marginPt < 0) throw new Error('margin must be a number >= 0')

  const pdf = await PDFDocument.load(file)
  for (const page of pdf.getPages()) {
    const source = visibleBox(page)
    const { width, height } = source
    // getRotation is what a reader applies on top of the box, so a page stored
    // sideways is wider than it is tall to everybody but the file itself.
    const turned = Math.abs(page.getRotation().angle / 90) % 2 === 1
    // 'auto' follows the shape the page is looked at in, not the shape its box
    // happens to be stored in.
    const shownWide = turned ? height >= width : width >= height
    const landscape =
      orientation === 'auto' ? shownWide : orientation === 'landscape'

    // The sheet as the reader will see it, then expressed in the page's own
    // unrotated terms so the box and the content agree.
    const [shownWidth, shownHeight] = landscape
      ? [Math.max(...sheet), Math.min(...sheet)]
      : [Math.min(...sheet), Math.max(...sheet)]
    const [boxWidth, boxHeight] = turned
      ? [shownHeight, shownWidth]
      : [shownWidth, shownHeight]

    const room = { width: boxWidth - marginPt * 2, height: boxHeight - marginPt * 2 }
    if (room.width <= 0 || room.height <= 0) throw new Error('margin is larger than the page')

    // One factor for both axes: scaling them apart would change the shape of
    // everything on the page, which is the failure people call "stretched".
    //
    // A page with no width or no height is a broken page, and there is nothing
    // on it to scale. It still gets the sheet, because being asked to put every
    // page on A4 and quietly leaving one at nothing by three hundred points is
    // the answer nobody wants.
    const factor =
      width > 0 && height > 0 ? Math.min(room.width / width, room.height / height) : 1
    const left = (boxWidth - width * factor) / 2
    const bottom = (boxHeight - height * factor) / 2

    // Bring the visible corner to the origin before scaling, since scaling
    // happens about the origin and neither box has to start there. Then move
    // the result to the middle of the new sheet.
    page.translateContent(-source.x, -source.y)
    page.scaleContent(factor, factor)
    page.translateContent(left, bottom)
    moveAnnotations(page, factor, left - source.x * factor, bottom - source.y * factor)
    page.setMediaBox(0, 0, boxWidth, boxHeight)

    // The old crop describes a page that no longer exists. Left behind, a
    // reader would go on showing the part of the sheet it names, which is the
    // one thing this was asked not to do.
    for (const name of ['CropBox', 'BleedBox', 'TrimBox', 'ArtBox']) {
      page.node.delete(PDFName.of(name))
    }
  }
  return pdf.save()
}
