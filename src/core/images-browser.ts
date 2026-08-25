/**
 * Decoding images inside a browser.
 *
 * The browser already has decoders for more formats than any library here
 * ships, they are native code rather than WebAssembly, and createImageBitmap
 * runs them off the main thread. So it goes first, and the WebAssembly
 * decoders are the fallback for what this particular browser cannot read -
 * JPEG XL outside Safari, AVIF on anything old enough.
 */
import { decodeWithCodec, isImageFormat, sniff, type Pixels } from './images.ts'

/**
 * A canvas has a maximum area as well as a maximum side, both undocumented and
 * different per browser. Past it getImageData returns transparent black rather
 * than failing, so the size is checked before anything is drawn.
 *
 * The numbers are Chrome's, the tightest of the three engines: 65535 a side,
 * and 268435456 pixels of area.
 */
const MAX_SIDE = 65535
const MAX_AREA = 268_435_456

/**
 * Exported because rasterising a PDF page draws onto a canvas too, and a large
 * page at 300 dpi passes these limits long before anything complains: the
 * canvas comes back blank rather than refusing.
 */
export function checkSize(width: number, height: number): void {
  if (width < 1 || height < 1) throw new Error('the image has no pixels')
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_AREA) {
    throw new Error(
      `this image is ${width}x${height}, which is larger than a browser canvas can hold`,
    )
  }
}

function pixelsFrom(source: CanvasImageSource, width: number, height: number): Pixels {
  checkSize(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  // The image is about to be read back out, so there is no point in the
  // browser keeping a GPU copy of it.
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) throw new Error('this browser would not give out a 2D canvas')
  context.drawImage(source, 0, 0)
  return context.getImageData(0, 0, width, height)
}

/**
 * SVG has no pixels until something decides how big to draw it, and
 * createImageBitmap refuses one that does not say. An <img> applies the same
 * sizing rules a page would, so it answers with the size the file asks for.
 */
async function decodeVector(bytes: Uint8Array, type: string): Promise<Pixels> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error('this SVG has no width and height, so there is no size to convert it at')
    }
    return pixelsFrom(image, image.naturalWidth, image.naturalHeight)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const MIME_FOR_SNIFF: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  jxl: 'image/jxl',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  ico: 'image/x-icon',
  heic: 'image/heic',
  svg: 'image/svg+xml',
}

export async function decodeImage(bytes: Uint8Array): Promise<Pixels> {
  const format = sniff(bytes)
  if (format === null) {
    throw new Error('this file is not an image, or not one of the kinds read here')
  }
  const type = MIME_FOR_SNIFF[format] ?? 'application/octet-stream'
  if (format === 'svg') return decodeVector(bytes, type)

  try {
    // "from-image" is the default and is what makes a sideways phone photo come
    // out the right way up: the EXIF orientation tag is applied to the pixels
    // here, because no format this writes to has anywhere to carry it onward.
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }), {
      imageOrientation: 'from-image',
    })
    try {
      return pixelsFrom(bitmap, bitmap.width, bitmap.height)
    } finally {
      bitmap.close()
    }
  } catch (refused) {
    // A canvas that is too big is a real answer, not a reason to try again in
    // WebAssembly, which would run out of memory more slowly.
    if (refused instanceof Error && refused.message.includes('canvas can hold')) throw refused
    if (!isImageFormat(format)) throw refused
    return decodeWithCodec(bytes, format)
  }
}
