/**
 * The two things an image file says about itself that a PDF needs and a
 * decoder throws away: which way up it is, and how big it is meant to be.
 *
 * Both are read from the bytes without decoding anything. A JPEG that goes
 * into a PDF untouched never passes through a decoder, so this is the only
 * place its EXIF orientation and its resolution can be learned.
 */

/** How the pixels are stored relative to how they should be shown. */
export interface ImageMeta {
  /**
   * The EXIF orientation tag, 1 to 8. 1 means the pixels are already the right
   * way up, and is what an image without the tag gets.
   */
  orientation: number
  /** Pixels per inch the file claims, or null when it makes no claim. */
  dpi: number | null
}

const UPRIGHT: ImageMeta = { orientation: 1, dpi: null }

/** A quarter turn the picture needs, clockwise, for the orientations that are one. */
export function turnFor(orientation: number): 0 | 90 | 180 | 270 {
  // 5 to 8 are the four that also mirror. The mirroring is dropped here, and
  // the caller decides whether to redraw those properly or leave them be.
  if (orientation === 3 || orientation === 4) return 180
  if (orientation === 6 || orientation === 5) return 90
  if (orientation === 8 || orientation === 7) return 270
  return 0
}

/** True for the four orientations that mirror as well as turn. */
export function isMirrored(orientation: number): boolean {
  return orientation === 2 || orientation === 4 || orientation === 5 || orientation === 7
}

function big16(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
}

function big32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] ?? 0) * 0x1000000 +
      ((bytes[at + 1] ?? 0) << 16) +
      ((bytes[at + 2] ?? 0) << 8) +
      (bytes[at + 3] ?? 0)) >>>
    0
  )
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length))
}

/** A dpi is only believable if it is a positive, finite, not-absurd number. */
function believable(dpi: number): number | null {
  return Number.isFinite(dpi) && dpi >= 1 && dpi <= 20_000 ? Math.round(dpi) : null
}

/* ---------------------------------- PNG ---------------------------------- */

/**
 * PNG states its resolution in pixels per metre, in a pHYs chunk that sits
 * before the image data. Chunks are walked rather than searched for, so a
 * "pHYs" that happens to appear inside compressed pixels is not mistaken for
 * the real one.
 */
function pngMeta(bytes: Uint8Array): ImageMeta {
  let at = 8
  while (at + 8 <= bytes.length) {
    const length = big32(bytes, at)
    const type = ascii(bytes, at + 4, 4)
    if (type === 'IDAT' || type === 'IEND') break
    if (type === 'pHYs' && length === 9) {
      const unit = bytes[at + 8 + 8]
      // Unit 0 means the numbers are only a ratio, with no real-world size.
      if (unit === 1) return { orientation: 1, dpi: believable(big32(bytes, at + 8) * 0.0254) }
      return UPRIGHT
    }
    // Length, type, payload, CRC. The length is a 32-bit count, so a corrupt
    // one could point past the end or wrap; the loop bound catches both.
    const next = at + 12 + length
    if (next <= at) break
    at = next
  }
  return UPRIGHT
}

/* ---------------------------------- TIFF --------------------------------- */

/**
 * Walk the first IFD of a TIFF header for the three tags that matter, which is
 * all EXIF is at this depth. Returns nothing rather than throwing on anything
 * malformed: a photo with a damaged EXIF block is still a photo.
 */
function tiffMeta(bytes: Uint8Array, start: number): ImageMeta {
  const order = ascii(bytes, start, 2)
  if (order !== 'II' && order !== 'MM') return UPRIGHT
  const little = order === 'II'
  const u16 = (at: number) =>
    little ? ((bytes[at + 1] ?? 0) << 8) | (bytes[at] ?? 0) : big16(bytes, at)
  const u32 = (at: number) =>
    little
      ? (((bytes[at + 3] ?? 0) * 0x1000000 +
          ((bytes[at + 2] ?? 0) << 16) +
          ((bytes[at + 1] ?? 0) << 8) +
          (bytes[at] ?? 0)) >>>
        0)
      : big32(bytes, at)

  if (u16(start + 2) !== 42) return UPRIGHT
  const ifd = start + u32(start + 4)
  if (ifd + 2 > bytes.length) return UPRIGHT
  const count = u16(ifd)

  let orientation = 1
  let resolution: number | null = null
  let unit = 2 // 2 is inches, and is the default the spec gives.

  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12
    if (entry + 12 > bytes.length) break
    const tag = u16(entry)
    const value = entry + 8
    if (tag === 0x0112) orientation = u16(value)
    else if (tag === 0x0128) unit = u16(value)
    else if (tag === 0x011a) {
      // A RATIONAL never fits in the four bytes of the entry, so those bytes
      // are an offset to the numerator and denominator.
      const at = start + u32(value)
      const denominator = u32(at + 4)
      if (denominator !== 0) resolution = u32(at) / denominator
    }
  }

  if (orientation < 1 || orientation > 8) orientation = 1
  const dpi =
    resolution === null ? null : believable(unit === 3 ? resolution * 2.54 : resolution)
  return { orientation, dpi }
}

/* ---------------------------------- JPEG --------------------------------- */

/**
 * Walk the JPEG marker segments for JFIF's density and EXIF's orientation.
 * EXIF wins on resolution where both are present, because a camera or scanner
 * writes EXIF and the JFIF block is usually a default nobody set.
 */
function jpegMeta(bytes: Uint8Array): ImageMeta {
  let at = 2
  let jfifDpi: number | null = null
  let exif: ImageMeta | null = null

  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) break
    const marker = bytes[at + 1]!
    // Start of scan: everything past here is compressed pixels.
    if (marker === 0xda || marker === 0xd9) break
    const length = big16(bytes, at + 2)
    if (length < 2) break
    const payload = at + 4

    if (marker === 0xe0 && ascii(bytes, payload, 5) === 'JFIF\0') {
      // "JFIF\0", then a two-byte version, then the units and the two densities.
      const units = bytes[payload + 7]
      const density = big16(bytes, payload + 8)
      if (units === 1) jfifDpi = believable(density)
      else if (units === 2) jfifDpi = believable(density * 2.54)
    } else if (marker === 0xe1 && ascii(bytes, payload, 6) === 'Exif\0\0') {
      exif = tiffMeta(bytes, payload + 6)
    }

    at = at + 2 + length
  }

  if (exif === null) return { orientation: 1, dpi: jfifDpi }
  return { orientation: exif.orientation, dpi: exif.dpi ?? jfifDpi }
}

/* --------------------------------- public -------------------------------- */

/**
 * Read what the file says about its own orientation and resolution. Formats
 * this does not parse, and files that say nothing, come back as upright with
 * no resolution, which is the honest answer rather than a guessed one.
 */
export function readImageMeta(bytes: Uint8Array): ImageMeta {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegMeta(bytes)
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return pngMeta(bytes)
  return UPRIGHT
}
