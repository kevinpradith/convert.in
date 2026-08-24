import { degrees, PDFDocument, rgb, StandardFonts, type PDFPage } from '@cantoo/pdf-lib'
import { resolvePages } from './pdf-pages.ts'

/**
 * Text drawn over existing pages. Both operations use the built-in Helvetica so
 * nothing has to be shipped or downloaded, which is also why the text has to sit
 * inside Latin-1.
 */

/**
 * A page can carry a /Rotate entry, and a scan that came out of the feeder
 * sideways almost always does. The drawing operators work in the page's own
 * unrotated space, so a corner worked out from getSize() is not the corner the
 * reader is looking at: on a page turned a quarter, the bottom right lands
 * bottom left and the text runs up the side.
 *
 * These three translate between the page as displayed and the space the drawing
 * commands use, so callers can go on thinking about the page a person sees.
 * A rotation that is not a quarter turn is not something the format allows, so
 * it is treated as none rather than guessed at.
 */
export function turnOf(page: PDFPage): number {
  const angle = ((page.getRotation().angle % 360) + 360) % 360
  return angle === 90 || angle === 180 || angle === 270 ? angle : 0
}

/** The page as the reader sees it: a quarter turn swaps the sides. */
export function displayedSize(page: PDFPage): { width: number; height: number } {
  const { width, height } = page.getSize()
  const turn = turnOf(page)
  return turn === 90 || turn === 270 ? { width: height, height: width } : { width, height }
}

/**
 * Where a point on the displayed page sits in the unrotated drawing space.
 * Pair it with `rotate: degrees(turnOf(page))`, which cancels the page's own
 * turn so the drawn thing reads upright and runs the way the reader expects.
 */
export function placeOnPage(page: PDFPage, u: number, v: number): { x: number; y: number } {
  const { width, height } = page.getSize()
  switch (turnOf(page)) {
    case 90:
      return { x: width - v, y: u }
    case 180:
      return { x: width - u, y: height - v }
    case 270:
      return { x: v, y: height - u }
    default:
      return { x: u, y: v }
  }
}

/** The few above U+00FF that WinAnsi still maps, so they should not be refused. */
const EXTRA_ENCODABLE = '‘’“”–—†‡•…€™'

function assertEncodable(text: string): void {
  const unsupported = [...text].find((character) => {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 && character !== '\n') return true
    return code > 0xff && !EXTRA_ENCODABLE.includes(character)
  })
  if (unsupported !== undefined) {
    throw new Error(
      `"${unsupported}" cannot be drawn: the built-in fonts only cover Latin-1. ` +
        'Stick to characters a Western European keyboard produces.',
    )
  }
}

export interface WatermarkOptions {
  text: string
  /** 0 to 1. The default is faint enough to read the page through. */
  opacity?: number
  angleDegrees?: number
  /** Point size. Omitted means "as large as fits across the diagonal". */
  size?: number
  /** 0-based page indices; omit for every page. */
  pages?: number[]
}

/** Stamp one line of text diagonally across the middle of each page. */
export async function watermarkPdf(
  file: Uint8Array,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  const { text, opacity = 0.12, angleDegrees = 45, size, pages } = options
  if (text.trim() === '') throw new Error('the watermark text is empty')
  assertEncodable(text)
  if (!(opacity > 0 && opacity <= 1)) throw new Error('opacity must be above 0 and at most 1')
  if (size !== undefined && !(size > 0)) throw new Error('size must be above 0')

  const pdf = await PDFDocument.load(file)
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  const perUnit = font.widthOfTextAtSize(text, 1)

  for (const index of resolvePages(pdf.getPageCount(), pages)) {
    const page = pdf.getPage(index)
    // The centre of the page is the centre whichever way it is turned, so only
    // the angle has to account for the rotation: without this a 45 degree
    // watermark leans the other way on a sideways scan.
    const { width, height } = page.getSize()
    const spin = angleDegrees + turnOf(page)
    const radians = (spin * Math.PI) / 180
    const fontSize = size ?? (0.78 * Math.hypot(width, height)) / perUnit
    const textWidth = font.widthOfTextAtSize(text, fontSize)
    const textHeight = font.heightAtSize(fontSize)

    // drawText rotates around its own origin, so walk back from the page centre
    // along the baseline and then across it to land the text visually centred.
    page.drawText(text, {
      x: width / 2 - (textWidth / 2) * Math.cos(radians) + (textHeight / 2) * Math.sin(radians),
      y: height / 2 - (textWidth / 2) * Math.sin(radians) - (textHeight / 2) * Math.cos(radians),
      size: fontSize,
      font,
      rotate: degrees(spin),
      opacity,
      color: rgb(0, 0, 0),
    })
  }
  return pdf.save()
}

export type Corner =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export const CORNERS: Corner[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

export interface NumberOptions {
  position?: Corner
  /** The number printed on the first stamped page. */
  start?: number
  size?: number
  /** Distance from the page edge, in points. */
  margin?: number
  /** `{n}` is the running number, `{total}` the count of pages being numbered. */
  format?: string
  pages?: number[]
}

/**
 * Print a running number on each page, in one corner.
 *
 * `{total}` in the format counts the pages being numbered rather than the pages
 * in the document, so numbering a selection reads "3 of 5" and not "3 of 40".
 * That is the count a person reading the printed selection can verify.
 */
export async function numberPages(
  file: Uint8Array,
  options: NumberOptions = {},
): Promise<Uint8Array> {
  const { position = 'bottom-center', start = 1, size = 10, margin = 28, format = '{n}', pages } =
    options
  if (!Number.isInteger(start)) throw new Error('the starting number must be a whole number')
  if (!(size > 0)) throw new Error('size must be above 0')
  if (!(margin >= 0)) throw new Error('margin must be 0 or more')
  if (!CORNERS.includes(position)) {
    throw new Error(`position must be one of: ${CORNERS.join(', ')}`)
  }

  const pdf = await PDFDocument.load(file)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const targets = resolvePages(pdf.getPageCount(), pages)
  const [vertical, horizontal] = position.split('-')

  targets.forEach((index, ordinal) => {
    const label = format
      .replaceAll('{n}', String(start + ordinal))
      .replaceAll('{total}', String(targets.length))
    assertEncodable(label)

    const page = pdf.getPage(index)
    // Worked out on the page as it is displayed, then translated, so "bottom
    // right" is the corner the reader sees rather than the corner the file
    // happens to store.
    const { width, height } = displayedSize(page)
    const labelWidth = font.widthOfTextAtSize(label, size)
    page.drawText(label, {
      ...placeOnPage(
        page,
        horizontal === 'left'
          ? margin
          : horizontal === 'right'
            ? width - margin - labelWidth
            : (width - labelWidth) / 2,
        vertical === 'top' ? height - margin - size : margin,
      ),
      rotate: degrees(turnOf(page)),
      size,
      font,
      color: rgb(0, 0, 0),
    })
  })
  return pdf.save()
}
