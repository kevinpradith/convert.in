import { PDFDocument, degrees, rgb } from '@cantoo/pdf-lib'
import { encodeImage, sniff, type Pixels } from './images.ts'
import { isMirrored, readImageMeta, turnFor } from './image-meta.ts'

export type PageSize = 'fit' | 'a4' | 'letter'
export type Orientation = 'auto' | 'portrait' | 'landscape'

export interface ImagesToPdfOptions {
  /** 'fit' makes every page match its image; a4/letter scale the image to fit inside. */
  pageSize?: PageSize
  orientation?: Orientation
  /** White border around the image, in PDF points (72pt = 1 inch). */
  marginPt?: number
  /**
   * Pixels per inch to size a 'fit' page by, overriding whatever the file
   * claims. This is the answer to a page that comes out the size of a poster:
   * a 3000-pixel photo is 41 inches wide at 72dpi and 10 at 300.
   */
  dpi?: number
  /**
   * How to read a format PDF cannot hold. Supplied by whichever side is
   * calling, since the browser and Node decode by different means. Left out,
   * only JPEG and PNG go in.
   */
  decode?: (bytes: Uint8Array) => Promise<Pixels>
}

/** Page dimensions in PDF points. */
const SIZES: Record<Exclude<PageSize, 'fit'>, readonly [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
}

/**
 * What to assume when the file says nothing about its resolution, which is the
 * usual case for a screenshot or anything saved by a web app. 96 is what every
 * desktop calls a screen inch, and what img2pdf assumes for the same reason.
 */
const DEFAULT_DPI = 96

export type ImageKind = 'jpg' | 'png'

/**
 * Identify the image from its magic bytes rather than its filename, so a
 * mislabelled .png that is really a JPEG still embeds correctly.
 */
export function sniffImage(bytes: Uint8Array): ImageKind {
  const format = sniff(bytes)
  if (format === 'jpeg') return 'jpg'
  if (format === 'png') return 'png'
  throw new Error('unsupported image: expected JPEG or PNG')
}

/** A picture ready to be put on a page, with what its own metadata asked for. */
interface Embeddable {
  bytes: Uint8Array
  /** Quarter turns clockwise the viewer must apply, from the EXIF tag. */
  turn: 0 | 90 | 180 | 270
  /** What the file says its resolution is, or null when it says nothing. */
  dpi: number | null
}

/**
 * PDF can carry a JPEG or a PNG and nothing else, so anything else has to
 * become one first. Handed a decoder, this turns a WebP, an AVIF or a phone's
 * HEIC into a lossless PNG on the way in; without one it says what it was
 * given rather than "unsupported image".
 *
 * A JPEG or PNG goes through untouched, which keeps the conversion lossless
 * but also means nothing has looked at its EXIF orientation. That tag is
 * carried out to the caller so the page can turn the picture instead, which
 * costs nothing and keeps the original bytes. The four orientations that
 * mirror as well as turn cannot be done that way, so those are decoded, which
 * applies the tag to the pixels themselves.
 */
async function embeddable(
  bytes: Uint8Array,
  decode?: (bytes: Uint8Array) => Promise<Pixels>,
): Promise<Embeddable> {
  const format = sniff(bytes)
  if (format === null) throw new Error('this file is not an image')
  const meta = readImageMeta(bytes)
  const passthrough = format === 'jpeg' || format === 'png'
  if (passthrough && !isMirrored(meta.orientation)) {
    return { bytes, turn: turnFor(meta.orientation), dpi: meta.dpi }
  }
  if (decode === undefined) {
    if (passthrough) return { bytes, turn: 0, dpi: meta.dpi }
    throw new Error(`${format.toUpperCase()} cannot be put straight into a PDF here`)
  }
  // PNG rather than JPEG: this is a one-way trip into a document, and a
  // re-compression the person never asked for is not one to make for them.
  // The decoder applies the EXIF orientation, so nothing is left to turn.
  return {
    bytes: await encodeImage(await decode(bytes), { format: 'png' }),
    turn: 0,
    dpi: meta.dpi,
  }
}

function wantsLandscape(orientation: Orientation, imageIsLandscape: boolean): boolean {
  if (orientation === 'landscape') return true
  if (orientation === 'portrait') return false
  return imageIsLandscape
}

function pageDimensions(
  pageSize: PageSize,
  orientation: Orientation,
  imageWidth: number,
  imageHeight: number,
  marginPt: number,
): [number, number] {
  const [w, h] =
    pageSize === 'fit' ? [imageWidth + marginPt * 2, imageHeight + marginPt * 2] : SIZES[pageSize]
  const landscape = wantsLandscape(orientation, imageWidth >= imageHeight)
  return landscape === w >= h ? [w, h] : [h, w]
}

/**
 * Where to anchor a drawn image so that, once rotated about that anchor, its
 * corner lands at (x, y) and it covers width by height.
 *
 * pdf-lib turns an image anticlockwise about its bottom-left corner, so every
 * turn but none of them moves the picture off the page unless the anchor moves
 * with it.
 */
function anchor(
  turn: 0 | 90 | 180 | 270,
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number; degrees: number } {
  switch (turn) {
    case 90:
      return { x, y: y + height, degrees: -90 }
    case 180:
      return { x: x + width, y: y + height, degrees: 180 }
    case 270:
      return { x: x + width, y, degrees: 90 }
    default:
      return { x, y, degrees: 0 }
  }
}

/**
 * Build a PDF from JPEG/PNG bytes, one image per page.
 *
 * JPEG bytes are embedded untouched (DCTDecode passthrough): no re-encode, no
 * quality loss, and the PDF stays about as big as the originals. Routing images
 * through a canvas instead would re-compress every one of them.
 *
 * A 'fit' page is sized by the resolution the image claims, so a 3000-pixel
 * photo from a 300dpi scanner becomes a 10-inch page rather than a 41-inch one.
 * An image that claims nothing is treated as 96dpi, and {@link
 * ImagesToPdfOptions.dpi} overrides both.
 */
export async function imagesToPdf(
  images: Uint8Array[],
  options: ImagesToPdfOptions = {},
): Promise<Uint8Array> {
  const { pageSize = 'fit', orientation = 'auto', marginPt = 0, decode } = options
  if (images.length === 0) throw new Error('no images given')
  if (!Number.isFinite(marginPt) || marginPt < 0) throw new Error('margin must be a number >= 0')
  if (options.dpi !== undefined && (!Number.isFinite(options.dpi) || options.dpi <= 0)) {
    throw new Error('dpi must be a number greater than 0')
  }

  const pdf = await PDFDocument.create()
  for (const source of images) {
    const { bytes, turn, dpi } = await embeddable(source, decode)
    const image =
      sniffImage(bytes) === 'jpg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes)

    // The picture as it is meant to be looked at, which for a photo taken
    // sideways is not the shape its pixels are stored in.
    const turned = turn === 90 || turn === 270
    const pixelWidth = turned ? image.height : image.width
    const pixelHeight = turned ? image.width : image.height
    const points = 72 / (options.dpi ?? dpi ?? DEFAULT_DPI)

    const [pageWidth, pageHeight] = pageDimensions(
      pageSize,
      orientation,
      pixelWidth * points,
      pixelHeight * points,
      marginPt,
    )
    const boxWidth = pageWidth - marginPt * 2
    const boxHeight = pageHeight - marginPt * 2
    if (boxWidth <= 0 || boxHeight <= 0) throw new Error('margin is larger than the page')

    const scale = Math.min(boxWidth / pixelWidth, boxHeight / pixelHeight)
    const width = pixelWidth * scale
    const height = pixelHeight * scale
    const page = pdf.addPage([pageWidth, pageHeight])
    // Paint the page white before the picture goes on it. A PDF page has no
    // colour of its own, so a transparent PNG shows whatever the reader puts
    // behind it, which in a dark-mode reader is black.
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) })
    const placed = anchor(turn, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height)
    page.drawImage(image, {
      x: placed.x,
      y: placed.y,
      rotate: degrees(placed.degrees),
      // Rotation happens after sizing, so these are the stored pixels' own way
      // round, not the way the picture is looked at.
      width: turned ? height : width,
      height: turned ? width : height,
    })
  }
  return pdf.save()
}
