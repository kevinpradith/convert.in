import { degrees, PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib'
import { resolvePages } from './pdf-pages.ts'

/**
 * Text drawn over existing pages. Both operations use the built-in Helvetica so
 * nothing has to be shipped or downloaded, which is also why the text has to sit
 * inside Latin-1.
 */

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
  const radians = (angleDegrees * Math.PI) / 180
  const perUnit = font.widthOfTextAtSize(text, 1)

  for (const index of resolvePages(pdf.getPageCount(), pages)) {
    const page = pdf.getPage(index)
    const { width, height } = page.getSize()
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
      rotate: degrees(angleDegrees),
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
    const { width, height } = page.getSize()
    const labelWidth = font.widthOfTextAtSize(label, size)
    page.drawText(label, {
      x:
        horizontal === 'left'
          ? margin
          : horizontal === 'right'
            ? width - margin - labelWidth
            : (width - labelWidth) / 2,
      y: vertical === 'top' ? height - margin - size : margin,
      size,
      font,
      color: rgb(0, 0, 0),
    })
  })
  return pdf.save()
}
