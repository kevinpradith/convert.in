/**
 * Redaction that actually removes what it covers.
 *
 * A black rectangle drawn over a paragraph hides nothing. PDF renders in
 * layers, so the characters underneath survive the shape on top of them, still
 * selectable and still copyable; that is how the details behind the bars in the
 * Manafort filings were read, and the same mistake is made every week. Covering
 * is not removing.
 *
 * The only removal this project can make and then prove is to stop the page
 * being text at all. Each page is rendered to pixels, the rectangles are
 * painted onto those pixels, and the document is rebuilt from the images. There
 * is no text object left to select, no vector path to lift, and no earlier
 * revision to recover, because the object that held them is not carried across.
 * Then the information dictionary and the XMP packet go too, since a redacted
 * document that still names its author has only moved the leak.
 *
 * What that costs is stated plainly wherever it is offered: the text stops
 * being searchable and selectable for everyone, including the recipient, and
 * the file is usually larger. Both are the price of the guarantee, not a defect
 * in it.
 *
 * Browser-only, because the rendering runs through a real canvas. See
 * ./pdf-to-images.ts for why the page-level tools next door stay portable.
 */
import { Util, type PDFDocumentProxy } from 'pdfjs-dist'
import { imagesToPdf } from './images-to-pdf.ts'
import { stripMetadata } from './pdf-metadata.ts'
import { canvasToBlob, closeDoc, loadDoc, renderPage } from './pdf-to-images.ts'

/**
 * A rectangle to black out, given in fractions of the page as it is displayed:
 * 0,0 is its top-left corner and 1,1 its bottom-right.
 *
 * Fractions rather than points, because the only place a person draws one of
 * these is on a preview whose size has nothing to do with the page's own.
 */
export interface RedactionBox {
  /** 1-based, matching what the page is called everywhere a person sees it. */
  page: number
  x: number
  y: number
  width: number
  height: number
}

export interface RedactOptions {
  /** Where to black out. None means the pages are only flattened. */
  boxes?: readonly RedactionBox[]
  /**
   * Pixels per inch to render at. 150 is legible on screen and acceptable in
   * print; 300 doubles the file for detail a redacted document rarely needs.
   */
  dpi?: number
  /** Called after each page, so a caller can show how far along it is. */
  onPage?: (done: number, total: number) => void
}

const DEFAULT_DPI = 150

/** Rendering above this makes a canvas no browser will allocate. */
const MAX_DPI = 600

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Pick the smaller of the two encodings a page can take.
 *
 * Which one wins is not a question that can be answered once: a page of text is
 * a few sharp colours on white, which PNG stores in a fraction of what JPEG
 * needs and without the ringing that makes small type mushy; a scanned
 * photograph is the opposite. Both are cheap next to the rendering that
 * produced the canvas, so both are tried.
 */
async function smallerOf(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const [png, jpeg] = await Promise.all([
    canvasToBlob(canvas, 'image/png').then(bytesOf),
    canvasToBlob(canvas, 'image/jpeg', 0.92).then(bytesOf),
  ])
  return png.length <= jpeg.length ? png : jpeg
}

/**
 * Paint the rectangles for one page onto the canvas it was rendered to.
 *
 * A box is clamped to the page rather than refused: a rectangle dragged past
 * the edge of a preview is somebody covering a corner, and cutting it back to
 * the corner is what they meant.
 */
function blackOut(
  canvas: HTMLCanvasElement,
  boxes: readonly RedactionBox[],
): void {
  if (boxes.length === 0) return
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('this browser would not give out a 2D canvas')
  context.fillStyle = '#000000'
  for (const box of boxes) {
    const left = Math.max(0, Math.min(1, box.x)) * canvas.width
    const top = Math.max(0, Math.min(1, box.y)) * canvas.height
    const right = Math.max(0, Math.min(1, box.x + box.width)) * canvas.width
    const bottom = Math.max(0, Math.min(1, box.y + box.height)) * canvas.height
    if (right <= left || bottom <= top) continue
    context.fillRect(left, top, right - left, bottom - top)
  }
}

/**
 * Black out the given rectangles and hand back a document in which the covered
 * content no longer exists.
 *
 * Every page is rebuilt, not only the ones carrying a box. A document where
 * page 4 is a picture and the rest is still selectable text announces which
 * page had something to hide, and leaves the rest of the original objects in
 * the file for anyone who wanted them.
 */
export async function redactPdf(
  file: Uint8Array,
  options: RedactOptions = {},
): Promise<Uint8Array> {
  const { boxes = [], onPage } = options
  const dpi = options.dpi ?? DEFAULT_DPI
  if (!Number.isFinite(dpi) || dpi < 1 || dpi > MAX_DPI) {
    throw new Error(`the resolution must be between 1 and ${MAX_DPI} dots per inch`)
  }
  // Refused rather than clamped away. A rectangle whose numbers are not numbers
  // paints nothing, and a redaction that quietly covers nothing is the one
  // failure this tool must not have.
  for (const box of boxes) {
    const sides = [box.x, box.y, box.width, box.height]
    if (!sides.every((side) => Number.isFinite(side)) || box.width <= 0 || box.height <= 0) {
      throw new Error('a redaction rectangle needs a position and a size, given as numbers')
    }
  }

  const doc = await loadDoc(file)
  const pages: Uint8Array[] = []
  try {
    for (const box of boxes) {
      if (!Number.isInteger(box.page) || box.page < 1 || box.page > doc.numPages) {
        throw new Error(`page ${box.page} is out of range (document has ${doc.numPages} pages)`)
      }
    }
    for (let number = 1; number <= doc.numPages; number++) {
      const canvas = await renderPage(doc, number, dpi / 72)
      blackOut(canvas, boxes.filter((box) => box.page === number))
      pages.push(await smallerOf(canvas))
      onPage?.(number, doc.numPages)
      // Free the backing store now rather than waiting for GC; a long document
      // otherwise holds every full-size canvas in memory at once.
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    await closeDoc(doc)
  }

  // The same dpi going out as went in, so each page comes back the physical
  // size it started at rather than the pixel count it was rendered to.
  const rebuilt = await imagesToPdf(pages, { pageSize: 'fit', dpi })
  // A redacted document that still names its author has moved the leak, not
  // closed it.
  return stripMetadata(rebuilt)
}


/* ------------------------------------------------------- finding words --- */

/**
 * How much larger than the measured glyph box to make a redaction.
 *
 * A text run's width and height describe where the glyphs sit, not where their
 * ink ends: descenders, accents and the sidebearing of an italic all reach past
 * it. Covering slightly too much is a redaction with a wide margin; covering
 * slightly too little is a redaction that can be read at the edges.
 */
const PADDING = 0.25

/** A quarter of a device unit, so a hairline of a run cannot be a match. */
const MINIMUM = 0.25

function boxFrom(
  page: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  width: number,
  height: number,
): RedactionBox | null {
  const pad = thickness * PADDING
  const left = Math.min(x1, x2) - pad
  const right = Math.max(x1, x2) + pad
  const top = Math.min(y1, y2) - thickness - pad
  const bottom = Math.max(y1, y2) + pad
  if (right - left < MINIMUM || bottom - top < MINIMUM) return null
  return {
    page,
    x: left / width,
    y: top / height,
    width: (right - left) / width,
    height: (bottom - top) / height,
  }
}

async function boxesOnPage(
  doc: PDFDocumentProxy,
  page: number,
  needle: string,
): Promise<RedactionBox[]> {
  const proxy = await doc.getPage(page)
  // Scale 1 puts the numbers in the page's own points, and the viewport applies
  // any /Rotate, so what comes back is measured the way the page is looked at.
  const viewport = proxy.getViewport({ scale: 1 })
  const content = await proxy.getTextContent()
  const found: RedactionBox[] = []

  for (const item of content.items) {
    if (!('str' in item) || item.str === '') continue
    const haystack = item.str.toLowerCase()
    // The run is one straight line of glyphs, so where a match sits inside it
    // is where its characters sit inside the string. Proportional fonts make
    // that an approximation, which is what the padding is for.
    const matrix = Util.transform(viewport.transform, item.transform)
    const angle = Math.atan2(matrix[1] as number, matrix[0] as number)
    const originX = matrix[4] as number
    const originY = matrix[5] as number
    const step = item.width / item.str.length

    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
      const from = at * step
      const to = (at + needle.length) * step
      const box = boxFrom(
        page,
        originX + from * Math.cos(angle),
        originY + from * Math.sin(angle),
        originX + to * Math.cos(angle),
        originY + to * Math.sin(angle),
        item.height,
        viewport.width,
        viewport.height,
      )
      if (box !== null) found.push(box)
    }
  }
  return found
}

/**
 * Find every occurrence of a word or phrase and hand back the rectangles that
 * would cover it.
 *
 * This is the half of redaction a pointer is bad at. Blacking out a name that
 * appears forty times across nineteen pages by dragging forty rectangles is a
 * job somebody will get wrong once, and once is all it takes; it is also a job
 * nobody can do without a mouse. Searching finds them all, reaches every page,
 * and works from a keyboard.
 *
 * The match is case-insensitive and literal: no patterns, because a redaction
 * that covers the wrong thing because of a stray metacharacter is worse than
 * one that has to be typed out. A scanned page carries no text at all, so
 * nothing is found there and the rectangles have to be drawn.
 */
export async function findText(file: Uint8Array, query: string): Promise<RedactionBox[]> {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []
  const doc = await loadDoc(file)
  try {
    const found: RedactionBox[] = []
    for (let page = 1; page <= doc.numPages; page++) {
      found.push(...(await boxesOnPage(doc, page, needle)))
    }
    return found
  } finally {
    await closeDoc(doc)
  }
}
