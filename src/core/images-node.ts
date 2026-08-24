/**
 * Decoding images outside a browser.
 *
 * Node has no image decoder of its own, so this is the same WebAssembly used
 * for encoding, run in reverse. It reads the five formats those codecs cover.
 * The browser app reads more, because a browser ships decoders for GIF, BMP
 * and the rest and Node does not.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { decodeWithCodec, isImageFormat, sniff, type Pixels } from './images.ts'

/**
 * The codecs are built for the web, so they ask for their .wasm over fetch.
 * Under Node that resolves to a file: URL, which fetch refuses by design.
 *
 * Rather than reaching into node_modules for each codec's binary by hand, which
 * is eight paths that move when the packages do and several of which are picked
 * at run time by CPU feature, fetch is given a file: case. Everything else is
 * passed through untouched, so a dependency that starts making real requests
 * still shows up as one.
 */
function serveLocalFiles(): void {
  const upstream = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith('file:')) return upstream(input, init)
    return new Response(await readFile(fileURLToPath(url)), {
      headers: { 'content-type': 'application/wasm' },
    })
  }
}

// Import order matters: this has to be in place before any codec is loaded, and
// the codecs are loaded by the first call into either this file or the encoder.
serveLocalFiles()

/** Formats a browser opens and this cannot, named the way a person would. */
const BROWSER_ONLY: Record<string, string> = {
  gif: 'GIF',
  bmp: 'BMP',
  tiff: 'TIFF',
  ico: 'ICO',
  heic: 'HEIC',
  svg: 'SVG',
}

export async function decodeImage(bytes: Uint8Array): Promise<Pixels> {
  const format = sniff(bytes)
  if (format === null) {
    throw new Error('this file is not an image, or not one of the kinds read here')
  }
  const readable = BROWSER_ONLY[format]
  if (readable !== undefined) {
    throw new Error(
      `${readable} can be converted in the browser app but not here: ` +
        'the only decoders for it are the ones a browser has built in',
    )
  }
  if (!isImageFormat(format)) throw new Error(`no decoder for ${format}`)
  return decodeWithCodec(bytes, format)
}
