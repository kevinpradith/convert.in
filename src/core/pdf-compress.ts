import { PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib'
import { decodeWithCodec, encodeImage, resize, type Pixels } from './images.ts'

/**
 * Making a PDF smaller by re-encoding the pictures inside it.
 *
 * This is not what Ghostscript does. Ghostscript rebuilds the document: it
 * resamples every image, subsets the fonts to the glyphs actually used, and
 * rewrites the content streams. That gets more, and it is not available here,
 * because Ghostscript and MuPDF are both AGPL and this project is MIT. Nothing
 * permissively licensed does the whole job in a browser.
 *
 * What is left is still where nearly all of the weight is. A scanned document
 * is one large JPEG per page and almost nothing else, so re-encoding those is
 * most of what a compressor would have achieved anyway. A PDF that is only text
 * has no images to shrink and comes out the size it went in, which this reports
 * rather than hides: a progress bar that ends at "0% smaller" with no
 * explanation is worse than being told there was nothing to do.
 */

export interface CompressOptions {
  /**
   * JPEG quality for the re-encoded images, 1 to 100. Lower than the 80 a
   * standalone photo gets, because a scan is being read rather than looked at,
   * and because anything already in a PDF has usually been compressed once.
   */
  quality?: number
  /**
   * Cap on the longest side of any image, in pixels. A page scanned at 600 dpi
   * carries about four times the detail that printing it back at 150 dpi can
   * use, and shrinking it is worth more than any quality setting. Omit to
   * re-encode at the size the images already are.
   */
  maxSide?: number
}

export interface CompressReport {
  bytes: Uint8Array
  /** Size of the document before and after, so a caller can say what it saved. */
  before: number
  after: number
  /** Images found, and how many actually came out smaller and were replaced. */
  images: number
  replaced: number
  /**
   * Images left alone because nothing here can read them: fax, JBIG2 and
   * JPEG 2000, which are already compressed about as far as they go, and the
   * Flate images that are usually diagrams rather than photographs.
   */
  skipped: number
}

/** The one image encoding this re-encodes: DCTDecode is a JPEG, byte for byte. */
const JPEG_FILTER = '/DCTDecode'

function nameOf(dict: PDFDict, key: string): string | undefined {
  return dict.get(PDFName.of(key))?.toString()
}

function numberOf(dict: PDFDict, key: string): number {
  return Number(dict.get(PDFName.of(key))?.toString())
}

/**
 * Whether this object is a picture this can rewrite.
 *
 * An image mask is a stencil rather than a picture, one bit a pixel, and
 * running it through a photographic encoder would both grow it and destroy it.
 */
function isRewritableImage(stream: PDFRawStream): boolean {
  const dict = stream.dict
  if (nameOf(dict, 'Subtype') !== '/Image') return false
  if (nameOf(dict, 'Filter') !== JPEG_FILTER) return false
  if (dict.get(PDFName.of('ImageMask'))?.toString() === 'true') return false
  // A /Mask written as an array is a colour-key mask: ranges of component
  // values to drop, counted in the image's own colour space. Everything here
  // comes out as three-channel RGB, so a range written for a one-channel scan
  // would then be read against the wrong components and punch holes in the
  // picture. A /Mask that is a reference points at a separate stencil stream,
  // which does not care what the base image is made of.
  if (nameOf(dict, 'Mask')?.startsWith('[') === true) return false
  return true
}

function clamp(quality: number): number {
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new Error('quality must be a number from 1 to 100')
  }
  return Math.round(quality)
}

/**
 * Re-encode the images in a PDF and hand back the smaller document.
 *
 * Every image is kept unless the new one is genuinely smaller, so a document
 * whose pictures are already tighter than this can make them comes back
 * unchanged rather than larger, which is the failure mode of every compressor
 * that trusts its own settings.
 */
export async function compressPdf(
  file: Uint8Array,
  options: CompressOptions = {},
): Promise<CompressReport> {
  const quality = clamp(options.quality ?? 55)
  const { maxSide } = options
  if (maxSide !== undefined && (!Number.isFinite(maxSide) || maxSide < 1)) {
    throw new Error('the longest side must be a whole number of pixels, 1 or more')
  }

  const pdf = await PDFDocument.load(file)
  let images = 0
  let replaced = 0
  let skipped = 0

  for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue
    if (nameOf(object.dict, 'Subtype') !== '/Image') continue
    images++
    if (!isRewritableImage(object)) {
      skipped++
      continue
    }

    const original = object.getContents()
    let pixels: Pixels
    try {
      pixels = await decodeWithCodec(original, 'jpeg')
    } catch {
      // A JPEG this cannot read is one to leave exactly as it is.
      skipped++
      continue
    }

    // decodeWithCodec applies the EXIF orientation tag, which is right for a
    // loose photo and wrong for one already placed on a page by a transformation
    // matrix. Mismatched dimensions are how that shows up, and the safe answer
    // to it is to leave the image alone.
    if (pixels.width !== numberOf(object.dict, 'Width') || pixels.height !== numberOf(object.dict, 'Height')) {
      skipped++
      continue
    }

    const longest = Math.max(pixels.width, pixels.height)
    const scaled =
      maxSide !== undefined && longest > maxSide
        ? resize(pixels, pixels.width >= pixels.height ? { width: maxSide } : { height: maxSide })
        : pixels

    const rewritten = await encodeImage(scaled, { format: 'jpeg', quality })
    if (rewritten.length >= original.length) continue

    // The dictionary describes the bytes, so it has to describe the new ones.
    // Everything here decodes to eight-bit RGB whatever it started as, which
    // matters for the CMYK scans that carry an inverted /Decode array: left
    // behind, it would turn the page into a photographic negative.
    const dict = object.dict
    dict.set(PDFName.of('Width'), pdf.context.obj(scaled.width))
    dict.set(PDFName.of('Height'), pdf.context.obj(scaled.height))
    dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))
    dict.set(PDFName.of('BitsPerComponent'), pdf.context.obj(8))
    dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
    dict.delete(PDFName.of('DecodeParms'))
    dict.delete(PDFName.of('Decode'))
    pdf.context.assign(ref, PDFRawStream.of(dict, rewritten))
    replaced++
  }

  const rebuilt = await pdf.save()
  // Writing the document back out costs a few bytes of its own, so a file with
  // nothing worth re-encoding comes out of the save fractionally larger than it
  // went in. Handing that back would make this the one kind of compressor that
  // is worse than doing nothing, so the original wins whenever it is smaller.
  const bytes = rebuilt.length < file.length ? rebuilt : file
  return { bytes, before: file.length, after: bytes.length, images, replaced, skipped }
}

/* ------------------------------------------------------------ to a limit --- */

/**
 * The settings to try, in the order to try them. The first two only re-encode;
 * past that the pictures start losing pixels as well, because below about 45
 * the artefacts show up faster than the file shrinks and shrinking the image
 * itself buys more.
 */
const LADDER: readonly CompressOptions[] = [
  { quality: 75 },
  { quality: 60 },
  { quality: 45, maxSide: 2200 },
  { quality: 35, maxSide: 1700 },
  { quality: 30, maxSide: 1200 },
  { quality: 25, maxSide: 900 },
]

export interface FitReport extends CompressReport {
  /** False when even the harshest setting could not get under the limit. */
  fits: boolean
  /** What it took, so the caller can say what the file cost to get there. */
  used: CompressOptions
}

/**
 * Squeeze a document until it is under a size limit, which is the thing every
 * upload form asks for and no compressor takes as an instruction: a visa portal
 * wants 500KB, a court filing wants 5MB, and a slider marked "medium" is a
 * guess that has to be repeated until it lands.
 *
 * Each attempt starts from the original file rather than the last attempt, so a
 * document that needs four tries is compressed once, not four times over.
 * A file that is already small enough is handed straight back untouched.
 *
 * Where nothing gets it under the limit, the smallest attempt comes back with
 * `fits: false` rather than an error: a file that is close is still worth
 * having, and only the caller knows whether close is good enough.
 */
export async function compressToFit(
  file: Uint8Array,
  maxBytes: number,
  options: { quality?: number; maxSide?: number } = {},
): Promise<FitReport> {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) {
    throw new Error('the size limit must be a whole number of bytes, 1 or more')
  }
  if (file.length <= maxBytes) {
    return {
      bytes: file,
      before: file.length,
      after: file.length,
      images: 0,
      replaced: 0,
      skipped: 0,
      fits: true,
      used: {},
    }
  }

  // A ceiling given by the caller applies to every rung, so "no wider than
  // 1500px, and under 2MB" is one request rather than two.
  const rungs = LADDER.map((rung) => ({
    quality: options.quality === undefined ? rung.quality : Math.min(rung.quality!, options.quality),
    ...(options.maxSide === undefined && rung.maxSide === undefined
      ? {}
      : { maxSide: Math.min(options.maxSide ?? Infinity, rung.maxSide ?? Infinity) }),
  }))

  let best: FitReport | null = null
  for (const rung of rungs) {
    const report = await compressPdf(file, rung)
    const attempt: FitReport = { ...report, fits: report.after <= maxBytes, used: rung }
    if (attempt.fits) return attempt
    if (best === null || attempt.after < best.after) best = attempt
    // Nothing left to shrink: every image was one this cannot read, so the
    // remaining rungs would do the same work for the same result.
    if (report.replaced === 0) break
  }
  return best!
}
