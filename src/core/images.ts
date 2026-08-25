/**
 * Image format conversion.
 *
 * Every codec here is the same WebAssembly build in both places this project
 * runs, so a file converted in the browser and the same file converted at the
 * command line come out byte for byte identical. The encoders are the ones
 * Squoosh settled on after measuring: MozJPEG, libwebp, libavif, libjxl and
 * Oxipng, packaged as @jsquash and licensed Apache-2.0.
 *
 * They are loaded on demand. The AVIF encoder alone is 3.5 MB, and nobody
 * should pay for it to convert a PNG to a JPEG.
 */

/**
 * Raw pixels, RGBA, eight bits a channel. Structurally a browser ImageData,
 * which Node does not have, so it is written out rather than imported.
 */
export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

export const IMAGE_FORMATS = ['png', 'jpeg', 'webp', 'avif', 'jxl'] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]

/** Formats that can be read but not written: nothing here encodes them. */
export const READ_ONLY_FORMATS = ['gif', 'bmp', 'tiff', 'ico', 'heic', 'svg'] as const
export type ReadOnlyFormat = (typeof READ_ONLY_FORMATS)[number]

export type SourceFormat = ImageFormat | ReadOnlyFormat

export interface EncodeImageOptions {
  format: ImageFormat
  /**
   * 1 to 100. The scales are not comparable between formats, so the defaults
   * are not the same number: they are the settings measured to look alike.
   */
  quality?: number
  /** PNG is always lossless; JPEG never is. The other three can go either way. */
  lossless?: boolean
  /** Colour transparent pixels sit on when the target format has no alpha. */
  background?: string
}

/**
 * Quality defaults, chosen to look about the same as each other rather than to
 * be the same number.
 *
 * JPEG 80 is the long-standing web default and the point past which MozJPEG's
 * gains flatten out. The WebP and AVIF numbers come from Malte Ubl's
 * measurements of DSSIM against JPEG at matched quality, which put JPEG 80 at
 * WebP 82 and AVIF 64. JPEG XL's own encoder defaults to 75 on a scale it
 * shares with libjpeg.
 *
 * https://www.industrialempathy.com/posts/avif-webp-quality-settings/
 */
const DEFAULT_QUALITY: Record<ImageFormat, number> = {
  png: 100,
  jpeg: 80,
  webp: 82,
  avif: 64,
  jxl: 75,
}

const MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  jxl: 'image/jxl',
}

const EXTENSION: Record<ImageFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  avif: 'avif',
  jxl: 'jxl',
}

/** Formats that carry an alpha channel. JPEG is the one that does not. */
const KEEPS_ALPHA: Record<ImageFormat, boolean> = {
  png: true,
  jpeg: false,
  webp: true,
  avif: true,
  jxl: true,
}

export function defaultQuality(format: ImageFormat): number {
  return DEFAULT_QUALITY[format]
}

export function mimeType(format: ImageFormat): string {
  return MIME[format]
}

export function extensionFor(format: ImageFormat): string {
  return EXTENSION[format]
}

export function keepsAlpha(format: ImageFormat): boolean {
  return KEEPS_ALPHA[format]
}

/**
 * Whether the format offers a choice. PNG is always lossless and JPEG never is,
 * so for those two a lossless switch is not a setting, it is a fact. Callers
 * that show one have to hide it again when the target changes underneath.
 */
export function hasLosslessOption(format: ImageFormat): boolean {
  return format !== 'png' && format !== 'jpeg'
}

/**
 * The codecs are typed against the browser's ImageData, which carries a
 * colorSpace field they never read. Node has no ImageData at all, so the three
 * fields they do read are the ones this project passes around.
 */
function asImageData(pixels: Pixels): ImageData {
  return pixels as unknown as ImageData
}

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * Decode with the WebAssembly codecs. These read the five formats they also
 * write, and run identically in both places, so a browser too old for AVIF and
 * a command line with no decoders at all take the same path.
 */
export async function decodeWithCodec(bytes: Uint8Array, format: ImageFormat): Promise<Pixels> {
  try {
    return await runCodec(bytes, format)
  } catch (failure) {
    throw unreadable(format, failure)
  }
}

/**
 * What a codec says when it gives up is not written for anybody, and the three
 * kinds here fail in three different unhelpful ways. The Emscripten builds
 * abort by throwing an object that is not an Error at all, which arrived as the
 * words "[object Object]". The Rust ones panic with "`unwrap_throw` failed" on
 * a truncated file, or trap with "unreachable" on one whose declared size the
 * decoder cannot allocate. libwebp manages "Decoding error".
 *
 * None of the four names the file or says what to do, and none is worth trying
 * to tell apart, so the answer is written here and the original kept as the
 * cause for whoever opens a console.
 *
 * A PNG claiming 30000x30000 lands in the same place: measured at 147ms and
 * 9 MB, because the decoder refuses the allocation rather than attempting it,
 * so there is nothing to guard against ahead of time.
 */
function unreadable(format: ImageFormat, cause: unknown): Error {
  // Only for JPEG, and only as one possibility among several: a plainly damaged
  // file reaches here too, and naming a cause it does not have sends people
  // looking in the wrong place.
  const print =
    format === 'jpeg'
      ? ' A CMYK JPEG, which is what a print workflow produces, is one this cannot read at all.'
      : ''
  return new Error(
    `this ${format.toUpperCase()} could not be read: it is damaged, cut short, or in a variant ` +
      `the decoder here does not handle.${print}`,
    { cause },
  )
}

async function runCodec(bytes: Uint8Array, format: ImageFormat): Promise<Pixels> {
  const data = buffer(bytes)
  switch (format) {
    case 'png':
      return decoded(await (await import('@jsquash/png/decode.js')).default(data))
    case 'jpeg':
      // The option name reads backwards. It means "act on the EXIF orientation
      // tag", so a photo taken sideways comes out of here the way up it is
      // meant to be seen. Left off, a phone photo converts rotated: the tag
      // lives in the JPEG and every format this writes to drops it.
      return decoded(
        await (await import('@jsquash/jpeg/decode.js')).default(data, { preserveOrientation: true }),
      )
    case 'webp':
      return decoded(await (await import('@jsquash/webp/decode.js')).default(data))
    case 'avif':
      return decoded(await (await import('@jsquash/avif/decode.js')).default(data))
    case 'jxl':
      return decoded(await (await import('@jsquash/jxl/decode.js')).default(data))
  }
}

/** A decoder that answers null has been handed something it could not parse. */
export function decoded(pixels: Pixels | null): Pixels {
  if (pixels === null) {
    throw new Error('this image could not be read: the file is damaged or cut short')
  }
  return pixels
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length))
}

function starts(bytes: Uint8Array, ...signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

function littleEndian32(bytes: Uint8Array, at: number): number {
  if (at + 4 > bytes.length) return 0
  return bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)
}

/**
 * Every DIB header length the format has ever defined: the OS/2 original, the
 * Windows 3 one almost everything writes, its three extensions, and the two
 * versions that carry a colour profile.
 */
const DIB_HEADER_SIZES = new Set([12, 40, 52, 56, 64, 108, 124])

/**
 * Identify a file from its leading bytes rather than its name, because the
 * name is whatever somebody typed. Phones in particular hand out .jpg files
 * that are HEIC inside.
 *
 * Returns null rather than throwing: the caller usually has a better error to
 * give than this function does.
 */
export function sniff(bytes: Uint8Array): SourceFormat | null {
  if (starts(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png'
  if (starts(bytes, 0xff, 0xd8, 0xff)) return 'jpeg'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'
  if (ascii(bytes, 0, 3) === 'GIF') return 'gif'
  // "BM" alone is two bytes of anything. The DIB header that follows names its
  // own length, and the handful of lengths ever written are what tells a bitmap
  // apart from a text file that happens to start with those letters.
  if (ascii(bytes, 0, 2) === 'BM' && DIB_HEADER_SIZES.has(littleEndian32(bytes, 14))) return 'bmp'
  if (starts(bytes, 0x49, 0x49, 0x2a, 0x00) || starts(bytes, 0x4d, 0x4d, 0x00, 0x2a)) return 'tiff'
  if (starts(bytes, 0x00, 0x00, 0x01, 0x00)) return 'ico'
  // Both a bare JPEG XL codestream and the ISO container it can be wrapped in.
  if (starts(bytes, 0xff, 0x0a)) return 'jxl'
  if (starts(bytes, 0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20)) return 'jxl'
  // ISO base media: the brand at byte 8 says which of the family it is.
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4)
    if (brand === 'avif' || brand === 'avis') return 'avif'
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic'
  }
  // SVG has no magic number, so this is the shape of the thing rather than a
  // signature: whitespace, then the root tag.
  const head = ascii(bytes, 0, 1000)
  const opening = head.trimStart()
  if (opening.startsWith('<svg') || opening.startsWith('<!DOCTYPE svg')) return 'svg'
  // An XML declaration says only "XML", and every RSS feed starts with one. The
  // root element is what decides, so it has to actually turn up. The test is a
  // plain scan rather than a prolog grammar: anchored alternation over a
  // comment would backtrack, and the window is what bounds the work here.
  if (opening.startsWith('<?xml') && /<svg[\s/>]/i.test(head)) return 'svg'
  return null
}

/**
 * True when a file stops before its own format says it should.
 *
 * A decoder handed half a JPEG does not refuse it: libjpeg fills what it never
 * received with grey, hands back a full-size picture, and prints "Premature end
 * of JPEG file" to standard error, which names no file and offers no advice.
 * The result is a conversion that reports success over an image whose bottom
 * half is missing.
 *
 * Only the two formats with an unambiguous end are checked. A JPEG ends with
 * the end-of-image marker and a PNG with an IEND chunk, and neither is optional.
 * The rest are left alone rather than guessed at: saying a sound file is
 * damaged is worse than saying nothing.
 */
export function looksTruncated(bytes: Uint8Array): boolean {
  const format = sniff(bytes)
  // Both are looked for in the last stretch of the file rather than at its very
  // end. Trailing padding after the marker is common enough that treating it as
  // damage would cry wolf, which is worse than staying quiet.
  const TAIL = 64
  const from = Math.max(0, bytes.length - TAIL)
  if (format === 'jpeg') {
    for (let at = bytes.length - 2; at >= from; at--) {
      if (bytes[at] === 0xff && bytes[at + 1] === 0xd9) return false
    }
    return true
  }
  if (format === 'png') {
    for (let at = bytes.length - 4; at >= from; at--) {
      if (ascii(bytes, at, 4) === 'IEND') return false
    }
    return true
  }
  return false
}

export function isImageFormat(value: string): value is ImageFormat {
  return (IMAGE_FORMATS as readonly string[]).includes(value)
}

/** '#f80' and '#ff8800' both mean the same colour. */
function parseColour(colour: string): [number, number, number] {
  const hex = colour.trim().replace(/^#/, '')
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    throw new Error(`background must be a hex colour such as #ffffff, not "${colour}"`)
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function hasTransparency(pixels: Pixels): boolean {
  for (let at = 3; at < pixels.data.length; at += 4) if (pixels.data[at]! < 255) return true
  return false
}

/**
 * Composite onto a solid colour, for the formats with nowhere to put alpha.
 *
 * Without this, saving a transparent PNG as JPEG turns every transparent pixel
 * into whatever colour happened to be underneath it, which for most drawing
 * tools is black. Source-over with an opaque backdrop, done in place on a copy.
 */
export function flatten(pixels: Pixels, background: string): Pixels {
  const [red, green, blue] = parseColour(background)
  const out = new Uint8ClampedArray(pixels.data)
  for (let at = 0; at < out.length; at += 4) {
    const alpha = out[at + 3]! / 255
    if (alpha === 1) continue
    out[at] = out[at]! * alpha + red * (1 - alpha)
    out[at + 1] = out[at + 1]! * alpha + green * (1 - alpha)
    out[at + 2] = out[at + 2]! * alpha + blue * (1 - alpha)
    out[at + 3] = 255
  }
  return { data: out, width: pixels.width, height: pixels.height }
}

export interface ResizeOptions {
  /** Cap on the result's width. Omit to let the height decide it. */
  width?: number
  /** Cap on the result's height. Omit to let the width decide it. */
  height?: number
  /**
   * Give both and the image is fitted inside the box rather than filled to it,
   * so nothing is cropped and the aspect ratio is kept. Off, both are treated
   * as exact and the picture stretches.
   */
  fit?: boolean
}

/**
 * The most pixels a result is allowed to have.
 *
 * Without a ceiling the only thing stopping a typed-in width is the allocator,
 * and what comes back from it is "Array buffer allocation failed" in a terminal
 * or a hung tab in a browser. This is Chrome's own canvas area limit, which is
 * the tightest of the three engines and already the point past which the
 * browser could not hold the answer anyway.
 */
const MAX_PIXELS = 268_435_456

/** What the requested caps work out to for this particular image. */
export function resizedTo(
  pixels: Pixels,
  options: ResizeOptions,
): { width: number; height: number } {
  const { width, height, fit = true } = options
  if (width === undefined && height === undefined) {
    throw new Error('give a width, a height, or both')
  }
  for (const side of [width, height]) {
    if (side !== undefined && (!Number.isFinite(side) || side < 1)) {
      throw new Error('width and height must be whole numbers of pixels, 1 or more')
    }
  }
  const ratio = pixels.width / pixels.height
  return checked(sized(pixels, ratio, width, height, fit))
}

function sized(
  pixels: Pixels,
  ratio: number,
  width: number | undefined,
  height: number | undefined,
  fit: boolean,
): { width: number; height: number } {
  if (width !== undefined && height !== undefined) {
    if (!fit) return { width: Math.round(width), height: Math.round(height) }
    // Fit inside the box: the tighter of the two constraints wins, which is the
    // smaller scale factor.
    const scale = Math.min(width / pixels.width, height / pixels.height)
    return { width: Math.max(1, Math.round(pixels.width * scale)), height: Math.max(1, Math.round(pixels.height * scale)) }
  }
  if (width !== undefined) {
    return { width: Math.round(width), height: Math.max(1, Math.round(width / ratio)) }
  }
  return { width: Math.max(1, Math.round(height! * ratio)), height: Math.round(height!) }
}

/**
 * Checked on the result rather than on what was asked for, because one side is
 * often left to follow the picture and it is the pair that has to fit.
 */
function checked(size: { width: number; height: number }): { width: number; height: number } {
  if (size.width * size.height > MAX_PIXELS) {
    throw new Error(
      `${size.width}x${size.height} is ${Math.round((size.width * size.height) / 1e6)} megapixels, ` +
        `and ${Math.round(MAX_PIXELS / 1e6)} is as large as this goes`,
    )
  }
  return size
}

/**
 * Scale an image, by averaging over the area each output pixel covers.
 *
 * Sampling one input pixel per output pixel is the obvious way and the wrong
 * one: shrinking a photo that way throws away most of the rows outright, so
 * fine detail turns into a shimmer of whatever happened to land on the grid.
 * Averaging the whole covered area is what a box filter does, it is what every
 * image library reaches for when reducing, and on a magnified image it lands on
 * bilinear on its own, because a covered area smaller than one pixel is just a
 * weighted blend of its neighbours.
 *
 * Alpha is weighted along with the colours rather than averaged beside them.
 * Averaging it separately drags the colour of fully transparent pixels into the
 * edges of a cut-out, which shows up as a dark fringe.
 */
export function resize(pixels: Pixels, options: ResizeOptions): Pixels {
  const { width, height } = resizedTo(pixels, options)
  if (width === pixels.width && height === pixels.height) return pixels

  const out = new Uint8ClampedArray(width * height * 4)
  const scaleX = pixels.width / width
  const scaleY = pixels.height / height

  for (let y = 0; y < height; y++) {
    // The rows of the source this output row covers, as a half-open span, with
    // at least one row taken so a magnified image still reads something.
    const topEdge = y * scaleY
    const bottomEdge = topEdge + scaleY
    const firstRow = Math.floor(topEdge)
    const lastRow = Math.min(pixels.height - 1, Math.max(firstRow, Math.ceil(bottomEdge) - 1))

    for (let x = 0; x < width; x++) {
      const leftEdge = x * scaleX
      const rightEdge = leftEdge + scaleX
      const firstColumn = Math.floor(leftEdge)
      const lastColumn = Math.min(pixels.width - 1, Math.max(firstColumn, Math.ceil(rightEdge) - 1))

      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      let covered = 0

      for (let row = firstRow; row <= lastRow; row++) {
        // How much of this source row falls inside the output pixel, so an
        // edge row that is only half covered counts half.
        const rowWeight = Math.min(row + 1, bottomEdge) - Math.max(row, topEdge)
        if (rowWeight <= 0) continue
        for (let column = firstColumn; column <= lastColumn; column++) {
          const columnWeight = Math.min(column + 1, rightEdge) - Math.max(column, leftEdge)
          if (columnWeight <= 0) continue
          const weight = rowWeight * columnWeight
          const at = (row * pixels.width + column) * 4
          // Premultiplied, so a transparent pixel contributes its area but not
          // its colour.
          const pixelAlpha = pixels.data[at + 3]! / 255
          const weighted = weight * pixelAlpha
          red += pixels.data[at]! * weighted
          green += pixels.data[at + 1]! * weighted
          blue += pixels.data[at + 2]! * weighted
          alpha += weight * pixels.data[at + 3]!
          covered += weight
        }
      }

      const to = (y * width + x) * 4
      if (covered === 0) continue
      const meanAlpha = alpha / covered
      // Undo the premultiply. A fully transparent patch has no colour to
      // recover, so it stays at zero rather than dividing by it.
      const solid = meanAlpha === 0 ? 0 : covered * (meanAlpha / 255)
      out[to] = solid === 0 ? 0 : red / solid
      out[to + 1] = solid === 0 ? 0 : green / solid
      out[to + 2] = solid === 0 ? 0 : blue / solid
      out[to + 3] = meanAlpha
    }
  }
  return { data: out, width, height }
}

function clampQuality(quality: number): number {
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new Error('quality must be a number from 1 to 100')
  }
  return Math.round(quality)
}

/**
 * Encode raw pixels.
 *
 * Lossless is refused rather than ignored where the format cannot do it: a
 * silently lossy "lossless" file is worse than being told no.
 */
export async function encodeImage(
  pixels: Pixels,
  options: EncodeImageOptions,
): Promise<Uint8Array> {
  const { format, lossless = false, background = '#ffffff' } = options
  if (pixels.width < 1 || pixels.height < 1) throw new Error('the image has no pixels')
  const quality = clampQuality(options.quality ?? DEFAULT_QUALITY[format])
  if (lossless && format === 'jpeg') {
    throw new Error('JPEG has no lossless mode: use PNG, WebP, AVIF or JPEG XL')
  }

  const source = !KEEPS_ALPHA[format] && hasTransparency(pixels) ? flatten(pixels, background) : pixels
  try {
    return await runEncoder(source, format, quality, lossless)
  } catch (failure) {
    // Same story as decoding: whatever the WebAssembly says on the way out is
    // not addressed to anyone.
    throw new Error(
      `this image could not be written as ${format.toUpperCase()}: the encoder gave up on it.`,
      { cause: failure },
    )
  }
}

async function runEncoder(
  source: Pixels,
  format: ImageFormat,
  quality: number,
  lossless: boolean,
): Promise<Uint8Array> {
  switch (format) {
    case 'png': {
      const encode = (await import('@jsquash/png/encode.js')).default
      const optimise = (await import('@jsquash/oxipng/optimise.js')).default
      // The Rust PNG encoder writes a correct file and makes no attempt to make
      // it small; Oxipng re-chooses the filters and reruns deflate, which on
      // flat graphics is routinely an order of magnitude. Level 2 is its own
      // default and the point where the curve flattens.
      return new Uint8Array(await optimise(await encode(asImageData(source)), { level: 2 }))
    }
    case 'jpeg': {
      const encode = (await import('@jsquash/jpeg/encode.js')).default
      // MozJPEG's own defaults otherwise: progressive, optimised Huffman
      // tables, and the quantisation table tuned on MS-SSIM rather than the
      // one from 1992.
      return new Uint8Array(await encode(asImageData(source), { quality }))
    }
    case 'webp': {
      const encode = (await import('@jsquash/webp/encode.js')).default
      // In lossless mode libwebp reads `quality` as how hard to try rather than
      // how much to throw away, so it is pinned high instead of passed through.
      return new Uint8Array(
        await encode(asImageData(source), lossless ? { lossless: 1, quality: 90 } : { quality }),
      )
    }
    case 'avif': {
      const encode = (await import('@jsquash/avif/encode.js')).default
      return new Uint8Array(await encode(asImageData(source), lossless ? { lossless: true } : { quality }))
    }
    case 'jxl': {
      const encode = (await import('@jsquash/jxl/encode.js')).default
      return new Uint8Array(await encode(asImageData(source), lossless ? { lossless: true } : { quality }))
    }
  }
}
