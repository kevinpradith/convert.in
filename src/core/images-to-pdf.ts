import { PDFDocument } from '@cantoo/pdf-lib'
import { encodeImage, sniff, type Pixels } from './images.ts'

export type PageSize = 'fit' | 'a4' | 'letter'
export type Orientation = 'auto' | 'portrait' | 'landscape'

export interface ImagesToPdfOptions {
  /** 'fit' makes every page match its image; a4/letter scale the image to fit inside. */
  pageSize?: PageSize
  orientation?: Orientation
  /** White border around the image, in PDF points (72pt = 1 inch). */
  marginPt?: number
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

/**
 * PDF can carry a JPEG or a PNG and nothing else, so anything else has to
 * become one first. Handed a decoder, this turns a WebP, an AVIF or a phone's
 * HEIC into a lossless PNG on the way in; without one it says what it was
 * given rather than "unsupported image".
 */
async function embeddable(
  bytes: Uint8Array,
  decode?: (bytes: Uint8Array) => Promise<Pixels>,
): Promise<Uint8Array> {
  const format = sniff(bytes)
  if (format === 'jpeg' || format === 'png') return bytes
  if (format === null) throw new Error('this file is not an image')
  if (decode === undefined) {
    throw new Error(`${format.toUpperCase()} cannot be put straight into a PDF here`)
  }
  // PNG rather than JPEG: this is a one-way trip into a document, and a
  // re-compression the person never asked for is not one to make for them.
  return encodeImage(await decode(bytes), { format: 'png' })
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
    pageSize === 'fit'
      ? [imageWidth + marginPt * 2, imageHeight + marginPt * 2]
      : SIZES[pageSize]
  const landscape = wantsLandscape(orientation, imageWidth >= imageHeight)
  return landscape === w >= h ? [w, h] : [h, w]
}

/**
 * Build a PDF from JPEG/PNG bytes, one image per page.
 *
 * JPEG bytes are embedded untouched (DCTDecode passthrough): no re-encode, no
 * quality loss, and the PDF stays about as big as the originals. Routing images
 * through a canvas instead would re-compress every one of them.
 */
export async function imagesToPdf(
  images: Uint8Array[],
  options: ImagesToPdfOptions = {},
): Promise<Uint8Array> {
  const { pageSize = 'fit', orientation = 'auto', marginPt = 0, decode } = options
  if (images.length === 0) throw new Error('no images given')
  if (!Number.isFinite(marginPt) || marginPt < 0) throw new Error('margin must be a number >= 0')

  const pdf = await PDFDocument.create()
  for (const source of images) {
    const bytes = await embeddable(source, decode)
    const image = sniffImage(bytes) === 'jpg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes)
    const [pageWidth, pageHeight] = pageDimensions(
      pageSize,
      orientation,
      image.width,
      image.height,
      marginPt,
    )
    const boxWidth = pageWidth - marginPt * 2
    const boxHeight = pageHeight - marginPt * 2
    if (boxWidth <= 0 || boxHeight <= 0) throw new Error('margin is larger than the page')

    const scale = Math.min(boxWidth / image.width, boxHeight / image.height)
    const width = image.width * scale
    const height = image.height * scale
    pdf.addPage([pageWidth, pageHeight]).drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    })
  }
  return pdf.save()
}
