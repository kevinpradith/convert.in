import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'
import { PDFDocument } from '@cantoo/pdf-lib'

import { imagesToPdf, sniffImage } from '../src/core/images-to-pdf.ts'
import {
  assemblePages,
  chunkPages,
  describe as describePdf,
  hasFormFields,
  mergePdfs,
  pageCount,
  parseRanges,
  rotatePages,
  selectPages,
  splitPdf,
} from '../src/core/pdf-pages.ts'
import { caveat, describeSecurity, explain, protectPdf, unlockPdf } from '../src/core/pdf-security.ts'
import { decodeImage } from '../src/core/images-node.ts'
import {
  IMAGE_FORMATS,
  defaultQuality,
  encodeImage,
  flatten,
  keepsAlpha,
  sniff,
} from '../src/core/images.ts'
import { numberPages, watermarkPdf } from '../src/core/pdf-stamp.ts'

/* ---------- fixtures, built here so the repo carries no binary blobs ---------- */

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, checksum])
}

/** Minimal grey truecolour PNG of the given size. */
function makePng(width: number, height: number): Uint8Array {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: truecolour
  const stride = 1 + width * 3
  const raw = Buffer.alloc(height * stride, 0x30)
  for (let y = 0; y < height; y++) raw[y * stride] = 0 // per-row filter: none
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function makePdf(pages: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) pdf.addPage([100 + i, 200]) // width encodes the page index
  return pdf.save()
}

async function widths(file: Uint8Array): Promise<number[]> {
  const pdf = await PDFDocument.load(file)
  return pdf.getPages().map((page) => Math.round(page.getWidth()))
}

/* ---------- parseRanges ---------- */

test('parseRanges understands single pages, spans and open ends', () => {
  assert.deepEqual(parseRanges('1', 10), [0])
  assert.deepEqual(parseRanges('1-3', 10), [0, 1, 2])
  assert.deepEqual(parseRanges('1-3,5', 10), [0, 1, 2, 4])
  assert.deepEqual(parseRanges('8-', 10), [7, 8, 9])
  assert.deepEqual(parseRanges('-3', 10), [0, 1, 2])
  assert.deepEqual(parseRanges(' 2 , 4 ', 10), [1, 3])
  assert.deepEqual(parseRanges('3,1', 10), [2, 0], 'order given is order kept')
  assert.deepEqual(parseRanges('2,2', 10), [1, 1], 'repeats are kept, they duplicate the page')
})

test('parseRanges rejects nonsense and out-of-bounds input', () => {
  assert.throws(() => parseRanges('abc', 10), /bad page range/)
  assert.throws(() => parseRanges('', 10), /empty page range/)
  assert.throws(() => parseRanges('0', 10), /out of bounds/)
  assert.throws(() => parseRanges('11', 10), /out of bounds/)
  assert.throws(() => parseRanges('5-2', 10), /out of bounds/)
  assert.throws(() => parseRanges('1-99', 10), /out of bounds/)
})

test('chunkPages splits into consecutive groups and keeps the short tail', () => {
  assert.deepEqual(chunkPages(5, 2), [[0, 1], [2, 3], [4]])
  assert.deepEqual(chunkPages(4, 1), [[0], [1], [2], [3]])
  assert.deepEqual(chunkPages(3, 10), [[0, 1, 2]])
  assert.throws(() => chunkPages(3, 0), />= 1/)
})

/* ---------- imagesToPdf ---------- */

test('imagesToPdf: fit gives every page its own image size', async () => {
  const pdf = await PDFDocument.load(await imagesToPdf([makePng(40, 20), makePng(10, 60)]))
  assert.equal(pdf.getPageCount(), 2)
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 40, height: 20 })
  assert.deepEqual(pdf.getPage(1).getSize(), { width: 10, height: 60 })
})

test('imagesToPdf: margin grows the page, not the image', async () => {
  const pdf = await PDFDocument.load(await imagesToPdf([makePng(40, 20)], { marginPt: 5 }))
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 50, height: 30 })
})

test('imagesToPdf: a4 orients to the image and scales it to fit', async () => {
  const landscape = await PDFDocument.load(
    await imagesToPdf([makePng(40, 20)], { pageSize: 'a4' }),
  )
  const { width, height } = landscape.getPage(0).getSize()
  assert.ok(width > height, 'a landscape image should give a landscape A4 page')
  assert.equal(Math.round(width), 842)

  const forced = await PDFDocument.load(
    await imagesToPdf([makePng(40, 20)], { pageSize: 'a4', orientation: 'portrait' }),
  )
  assert.equal(Math.round(forced.getPage(0).getWidth()), 595)
})

test('imagesToPdf: rejects unknown bytes and bad margins', async () => {
  await assert.rejects(() => imagesToPdf([new Uint8Array([1, 2, 3, 4])]), /not an image/)
  await assert.rejects(() => imagesToPdf([]), /no images given/)
  // A real image in a format PDF cannot hold, with nothing given to read it.
  const webp = await encodeImage(await decodeImage(makePng(8, 8)), { format: 'webp' })
  await assert.rejects(() => imagesToPdf([webp]), /WEBP cannot be put straight into a PDF/)
  await assert.rejects(() => imagesToPdf([makePng(4, 4)], { marginPt: -1 }), /margin/)
  // 'fit' grows the page with the margin, so only a fixed page size can be over-margined.
  await assert.rejects(
    () => imagesToPdf([makePng(4, 4)], { pageSize: 'a4', marginPt: 400 }),
    /larger than the page/,
  )
})

/**
 * PDF holds a JPEG or a PNG and nothing else, so everything else has to become
 * one first. The decoder is passed in because the browser and Node have
 * different ones, and the core has no business knowing which it is running in.
 */
test('imagesToPdf takes any format once it is handed a decoder', async () => {
  const webp = await encodeImage(await decodeImage(makePng(40, 20)), { format: 'webp' })
  const avif = await encodeImage(await decodeImage(makePng(20, 40)), { format: 'avif' })
  const pdf = await PDFDocument.load(
    await imagesToPdf([webp, avif, makePng(30, 30)], { decode: decodeImage }),
  )
  assert.equal(pdf.getPageCount(), 3)
  assert.deepEqual(
    pdf.getPages().map((page) => Math.round(page.getWidth())),
    [40, 20, 30],
    'each page still matches the image it came from',
  )
})

test('sniffImage trusts magic bytes, not the extension', () => {
  assert.equal(sniffImage(makePng(2, 2)), 'png')
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpg')
  assert.throws(() => sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38])), /unsupported/)
})

/* ---------- page operations ---------- */

test('mergePdfs concatenates in the order given', async () => {
  const merged = await mergePdfs([await makePdf(2), await makePdf(3)])
  assert.equal(await pageCount(merged), 5)
  assert.deepEqual(await widths(merged), [100, 101, 100, 101, 102])
  await assert.rejects(() => mergePdfs([]), /no PDFs given/)
})

test('selectPages reorders, extracts and duplicates', async () => {
  const source = await makePdf(4)
  assert.deepEqual(await widths(await selectPages(source, [3, 0])), [103, 100])
  assert.deepEqual(await widths(await selectPages(source, [1, 1])), [101, 101])
  await assert.rejects(() => selectPages(source, [4]), /out of range/)
  await assert.rejects(() => selectPages(source, [-1]), /out of range/)
  await assert.rejects(() => selectPages(source, []), /no pages selected/)
})

test('splitPdf produces one document per group', async () => {
  const parts = await splitPdf(await makePdf(5), chunkPages(5, 2))
  assert.equal(parts.length, 3)
  assert.deepEqual(await Promise.all(parts.map(pageCount)), [2, 2, 1])
})

test('rotatePages accumulates and normalises the angle', async () => {
  const source = await makePdf(2)
  const once = await rotatePages(source, [0], 90)
  const twice = await rotatePages(once, [0], 270)
  const back = await PDFDocument.load(twice)
  assert.equal(back.getPage(0).getRotation().angle, 0, '90 + 270 wraps back to 0')
  assert.equal(back.getPage(1).getRotation().angle, 0, 'untouched pages stay put')

  const negative = await PDFDocument.load(await rotatePages(source, [0], -90))
  assert.equal(negative.getPage(0).getRotation().angle, 270, 'negative deltas stay positive')

  await assert.rejects(() => rotatePages(source, [0], 45), /multiple of 90/)
})

test('assemblePages interleaves sources, keeps order and applies rotation', async () => {
  const a = await makePdf(2) // widths 100, 101
  const b = await makePdf(3) // widths 100, 101, 102
  const out = await assemblePages(
    [a, b],
    [
      { source: 1, page: 2 },
      { source: 0, page: 0 },
      { source: 1, page: 0, rotate: -90 },
      { source: 0, page: 0 },
    ],
  )
  assert.deepEqual(await widths(out), [102, 100, 100, 100], 'slots keep their requested order')

  const pdf = await PDFDocument.load(out)
  assert.equal(pdf.getPage(2).getRotation().angle, 270, 'negative rotation is normalised')
  assert.equal(pdf.getPage(1).getRotation().angle, 0, 'other pages are untouched')

  await assert.rejects(() => assemblePages([a], [{ source: 3, page: 0 }]), /does not exist/)
  await assert.rejects(() => assemblePages([a], [{ source: 0, page: 9 }]), /out of range/)
  await assert.rejects(() => assemblePages([a], []), /no pages selected/)
})

test('describe reports page count and first page size', async () => {
  const info = await describePdf(await makePdf(3))
  assert.deepEqual(info, { pages: 3, width: 100, height: 200 })
})

/* ---------- passwords ---------- */

test('protect locks a document with AES-256 R6, the setting Acrobat calls "Acrobat X and later"', async () => {
  const plain = await makePdf(3)
  assert.deepEqual(await describeSecurity(plain), { encrypted: false, needsPassword: false })

  const locked = await protectPdf(plain, { openPassword: 'hunter2' })
  assert.deepEqual(await describeSecurity(locked), { encrypted: true, needsPassword: true })
  await assert.rejects(() => pageCount(locked), /encrypted/i)

  // The encryption dictionary is not itself encrypted, so the handler it
  // declares can be read straight out of the bytes.
  const header = Buffer.from(locked).toString('latin1')
  assert.match(header, /\/V 5\b/, 'V 5 is the AES-256 handler')
  assert.match(header, /\/R 6\b/, 'R 6 is the revision Acrobat X and later writes')
  assert.match(header, /\/CFM \/AESV3\b/, 'AESV3 is 256-bit AES')

  const opened = await unlockPdf(locked, 'hunter2')
  assert.equal((await describeSecurity(opened)).encrypted, false)
  assert.equal(await pageCount(opened), 3, 'the pages survive the round trip')
})

test('protect follows Acrobat rules about the two passwords', async () => {
  const plain = await makePdf(1)

  await assert.rejects(() => protectPdf(plain, {}), /open password, a permissions password/)
  await assert.rejects(
    () => protectPdf(plain, { openPassword: 'same', permissionsPassword: 'same' }),
    /must be different/,
  )

  // Permissions password only: the file opens freely but is restricted.
  const restricted = await protectPdf(plain, {
    permissionsPassword: 'owner',
    printing: 'none',
    changes: 'none',
    copying: false,
  })
  assert.deepEqual(
    await describeSecurity(restricted),
    { encrypted: true, needsPassword: false },
    'encrypted, but a reader is never prompted',
  )
  // pdf-lib refuses to open any encrypted document unless it is handed a
  // password, even the empty one a reader would use, so the rest of the toolkit
  // reaches such a file through unlock rather than directly.
  assert.equal(await pageCount(await unlockPdf(restricted, '')), 1)

  await assert.rejects(
    () => protectPdf(plain, { openPassword: 'x', printing: 'medium' as never }),
    /printing must be one of/,
  )
  await assert.rejects(
    () => protectPdf(plain, { openPassword: 'x', changes: 'some' as never }),
    /changes must be one of/,
  )
})

test('unlock refuses a wrong password', async () => {
  const locked = await protectPdf(await makePdf(1), { openPassword: 'right' })
  await assert.rejects(() => unlockPdf(locked, 'wrong'), /does not open this PDF/)
})

/* ---------- stamps ---------- */

async function bytesOf(file: Uint8Array): Promise<number> {
  return file.byteLength
}

test('watermark draws on the pages it is told to and no others', async () => {
  const plain = await makePdf(4)
  const one = await watermarkPdf(plain, { text: 'DRAFT', pages: [0] })
  const all = await watermarkPdf(plain, { text: 'DRAFT' })

  assert.equal(await pageCount(one), 4, 'stamping does not add or drop pages')
  assert.ok(
    (await bytesOf(all)) > (await bytesOf(one)),
    'stamping every page must cost more than stamping one',
  )
  assert.ok((await bytesOf(one)) > (await bytesOf(plain)), 'something was actually drawn')
})

test('watermark rejects empty text, bad opacity and characters it cannot draw', async () => {
  const plain = await makePdf(1)
  await assert.rejects(() => watermarkPdf(plain, { text: '   ' }), /text is empty/)
  await assert.rejects(() => watermarkPdf(plain, { text: 'x', opacity: 0 }), /opacity/)
  await assert.rejects(() => watermarkPdf(plain, { text: 'x', opacity: 1.5 }), /opacity/)
  await assert.rejects(() => watermarkPdf(plain, { text: '機密' }), /only cover Latin-1/)
  // Curly quotes and dashes are inside WinAnsi, so they must not be refused.
  await watermarkPdf(plain, { text: '“Draft” – 2026' })
})

test('numberPages validates its options and honours a page selection', async () => {
  const plain = await makePdf(5)
  const numbered = await numberPages(plain, { format: '{n} / {total}', position: 'top-right' })
  assert.equal(await pageCount(numbered), 5)

  const some = await numberPages(plain, { pages: [0, 1] })
  assert.ok(some.byteLength < numbered.byteLength, 'two pages cost less than five')

  await assert.rejects(() => numberPages(plain, { size: 0 }), /size/)
  await assert.rejects(() => numberPages(plain, { margin: -1 }), /margin/)
  await assert.rejects(() => numberPages(plain, { start: 1.5 }), /whole number/)
  await assert.rejects(
    () => numberPages(plain, { position: 'middle' as never }),
    /position must be one of/,
  )
  await assert.rejects(() => numberPages(plain, { pages: [9] }), /out of range/)
})

test('page assembly carries the document information dictionary across', async () => {
  const source = await PDFDocument.create()
  source.addPage([100, 200])
  source.addPage([101, 200])
  source.setTitle('Kept')
  source.setAuthor('convert.in')
  const bytes = await source.save()

  for (const [label, made] of [
    ['merge', await mergePdfs([bytes, bytes])],
    ['select', await selectPages(bytes, [1, 0])],
  ] as const) {
    const out = await PDFDocument.load(made)
    assert.equal(out.getTitle(), 'Kept', `${label} keeps the title`)
    assert.equal(out.getAuthor(), 'convert.in', `${label} keeps the author`)
  }
})

test('hasFormFields sees an interactive form and its absence', async () => {
  const bare = await PDFDocument.create()
  bare.addPage([100, 200])
  assert.equal(await hasFormFields(await bare.save()), false)

  const withForm = await PDFDocument.create()
  const page = withForm.addPage([200, 200])
  withForm.getForm().createTextField('who').addToPage(page, { x: 10, y: 10, width: 80, height: 20 })
  assert.equal(await hasFormFields(await withForm.save()), true)
})

test('parseRanges rejects a long bad token without backtracking', () => {
  // The old regex held two optional \d+ groups and took eleven seconds on this.
  const nonsense = '9'.repeat(200_000) + 'x'
  const started = performance.now()
  assert.throws(() => parseRanges(nonsense, 10), /bad page range/)
  const elapsed = performance.now() - started
  assert.ok(elapsed < 250, `rejecting a 200k-character token took ${elapsed.toFixed(0)}ms`)
})

test('parseRanges still handles every shape after the rewrite', () => {
  assert.deepEqual(parseRanges('1-2-3'.replace('1-2-3', '4'), 10), [3])
  assert.throws(() => parseRanges('1-2-3', 10), /bad page range/)
  assert.throws(() => parseRanges('-', 10), /bad page range/)
  assert.throws(() => parseRanges('1.5', 10), /bad page range/)
  assert.throws(() => parseRanges('1 2', 10), /bad page range/)
  assert.deepEqual(parseRanges('  7  ', 10), [6])
})

test('a password past the 127 bytes the format uses is refused, not silently cut', async () => {
  const plain = await makePdf(1)
  const tooLong = 'a'.repeat(128)
  await assert.rejects(
    () => protectPdf(plain, { openPassword: tooLong }),
    /only the first 127 are used/,
  )
  await assert.rejects(
    () => protectPdf(plain, { permissionsPassword: tooLong }),
    /only the first 127 are used/,
  )

  // Right at the limit it still works, and multi-byte characters count as bytes.
  await protectPdf(plain, { openPassword: 'a'.repeat(127) })
  await assert.rejects(
    () => protectPdf(plain, { openPassword: '€'.repeat(43) }),
    /only the first 127 are used/,
  )
})

test('a unicode password round-trips exactly, and a renormalised one does not', async () => {
  const password = 'påsswørd-日本語-🔐'
  const locked = await protectPdf(await makePdf(2), { openPassword: password })
  assert.equal(await pageCount(await unlockPdf(locked, password)), 2)
  await assert.rejects(() => unlockPdf(locked, password.normalize('NFD')), /does not open/)
})

/**
 * vercel.json and public/_headers say the same thing to two different hosts,
 * and both are edited by hand. A policy that is strict on one host and lax on
 * the other is worse than one that is merely strict, because nobody would know.
 */
test('the two header files carry the same security headers', () => {
  const json = JSON.parse(readFileSync('vercel.json', 'utf8'))
  const vercel = new Map<string, string>(
    json.headers
      .filter((rule: { source: string }) => rule.source === '/(.*)')
      .flatMap((rule: { headers: { key: string; value: string }[] }) => rule.headers)
      .map((header: { key: string; value: string }) => [header.key, header.value]),
  )

  const netlify = new Map<string, string>()
  for (const line of readFileSync('public/_headers', 'utf8').split('\n')) {
    const match = /^ {2}([A-Za-z-]+): (.*)$/.exec(line)
    if (match?.[1] && match[2] !== undefined && !netlify.has(match[1])) {
      netlify.set(match[1], match[2])
    }
  }

  assert.ok(vercel.size > 0, 'vercel.json declares no site-wide headers')
  for (const [key, value] of vercel) {
    assert.equal(netlify.get(key), value, `public/_headers disagrees about ${key}`)
  }

  // The CSP is the one people relax by accident, so name what it must and must
  // not allow rather than only checking the two files match each other.
  const csp = vercel.get('Content-Security-Policy') ?? ''
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/, 'wasm needs its keyword, nothing more')
  // The lookbehind is the point: 'wasm-unsafe-eval' contains 'unsafe-eval'.
  assert.doesNotMatch(csp, /(?<!wasm-)'unsafe-eval'/, 'the wasm keyword must not widen into a full eval grant')
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, 'inline script stays blocked')
  for (const directive of ["default-src 'self'", "connect-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
    assert.ok(csp.includes(directive), `the CSP dropped ${directive}`)
  }
})

/**
 * The library's own wording reaches a person who only picked a file, so both
 * surfaces route it through explain(). A damaged PDF used to arrive as
 * "Cannot read properties of undefined (reading 'Pages')".
 */
test('library failures are translated before anyone sees them', () => {
  assert.equal(explain(new Error('No PDF header found')), 'this file is not a PDF')
  assert.equal(
    explain(new Error("Cannot read properties of undefined (reading 'Pages')")),
    'this PDF is damaged past the point where it can be read',
  )
  assert.equal(
    explain(new Error('Expected instance of PDFDict, but got instance of PDFInvalidObject')),
    'this PDF is damaged past the point where it can be read',
  )
  assert.equal(
    explain(new Error('Input document to `PDFDocument.load` is encrypted')),
    'this PDF is password protected: unlock it first',
  )
  // Anything it does not recognise has to survive untouched, or a real message
  // would be replaced by a guess.
  assert.equal(explain(new Error('disk full')), 'disk full')
})

/**
 * Confirmed by testing rather than assumed: holding the open password is enough
 * to strip a permissions password, and a file carrying only a permissions
 * password needs no password at all. Both are properties of the format, and
 * both are stated in the README, the help and the web app. The test is here so
 * nobody later writes a claim the format cannot keep.
 */
test('a permissions password protects nothing from whoever can open the file', async () => {
  const source = await PDFDocument.create()
  source.addPage([200, 200])
  const plain = await source.save()

  const both = await protectPdf(plain, {
    openPassword: 'reader',
    permissionsPassword: 'owner',
    printing: 'none',
    changes: 'none',
    copying: false,
  })
  const stripped = await unlockPdf(both, 'reader')
  assert.deepEqual(await describeSecurity(stripped), { encrypted: false, needsPassword: false })

  const permissionsOnly = await protectPdf(plain, { permissionsPassword: 'owner', printing: 'none' })
  assert.deepEqual(await describeSecurity(permissionsOnly), { encrypted: true, needsPassword: false })
  const opened = await unlockPdf(permissionsOnly, '')
  assert.deepEqual(await describeSecurity(opened), { encrypted: false, needsPassword: false })
})

/**
 * The CLI and the web app both ask this before locking, so the wording they
 * show has to follow the settings rather than a fixed footnote.
 */
test('caveat reports what a set of restrictions is actually worth', () => {
  // Nothing restricted, so there is nothing to qualify.
  assert.equal(caveat({ openPassword: 'reader' }), null)
  assert.equal(caveat({ openPassword: 'reader', printing: 'high', changes: 'any', copying: true }), null)

  // Restricted with no open password: the file opens for anyone.
  assert.equal(caveat({ permissionsPassword: 'owner', printing: 'none' }), 'opensToAnyone')
  assert.equal(caveat({ permissionsPassword: 'owner', changes: 'none' }), 'opensToAnyone')
  assert.equal(caveat({ permissionsPassword: 'owner', copying: false }), 'opensToAnyone')

  // Restricted behind an open password: the reader can still lift them.
  assert.equal(
    caveat({ openPassword: 'reader', permissionsPassword: 'owner', printing: 'low' }),
    'liftableByReader',
  )
})

/* ------------------------------------------------------------- images --- */

/**
 * A file's name is whatever somebody typed, so the format has to come out of
 * the bytes. Phones are the reason: they hand out HEIC photos called .jpg.
 */
test('sniff names the format from the bytes, not the extension', () => {
  assert.equal(sniff(makePng(4, 4)), 'png')
  assert.equal(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpeg')
  assert.equal(sniff(Buffer.from('RIFF____WEBPVP8 ', 'ascii')), 'webp')
  assert.equal(sniff(Buffer.from('GIF89a', 'ascii')), 'gif')
  // "BM", the twelve bytes of file header after it, then a DIB header naming
  // one of the lengths the format defines. 40 is the one Windows writes.
  const bmp = Buffer.alloc(18, 0x5f)
  bmp.write('BM', 0, 'ascii')
  bmp.writeUInt32LE(40, 14)
  assert.equal(sniff(bmp), 'bmp')
  assert.equal(sniff(new Uint8Array([0x49, 0x49, 0x2a, 0x00])), 'tiff')
  assert.equal(sniff(new Uint8Array([0x00, 0x00, 0x01, 0x00])), 'ico')
  assert.equal(sniff(new Uint8Array([0xff, 0x0a])), 'jxl')

  // Same box structure, different brand, and only the brand tells them apart.
  assert.equal(sniff(Buffer.from('\0\0\0 ftypavifavif', 'binary')), 'avif')
  assert.equal(sniff(Buffer.from('\0\0\0 ftypheicheic', 'binary')), 'heic')

  assert.equal(sniff(Buffer.from('  <svg xmlns="http://www.w3.org/2000/svg"/>', 'ascii')), 'svg')
  assert.equal(sniff(Buffer.from('not an image at all', 'ascii')), null)
  assert.equal(sniff(new Uint8Array(0)), null)
})

/**
 * Two of the signatures are weak enough to catch files that are not images at
 * all, and a wrong answer here is worse than none: the caller goes on to say
 * "SVG can be converted in the browser app" about somebody's RSS feed.
 */
test('a signature that is only nearly right is not enough', () => {
  // Every XML document starts this way. Only one of them is a picture.
  assert.equal(sniff(Buffer.from('<?xml version="1.0"?><rss><channel/></rss>', 'ascii')), null)
  assert.equal(
    sniff(Buffer.from('<?xml version="1.0"?>\n<!-- drawn by hand -->\n<svg width="8"/>', 'ascii')),
    'svg',
  )
  // Two letters of a plain sentence, and no DIB header behind them.
  assert.equal(sniff(Buffer.from('BM is not a bitmap header', 'ascii')), null)
})

/**
 * JPEG has nowhere to put an alpha channel. Without this the transparent parts
 * of a PNG land on whatever was underneath them, which in most drawing tools is
 * black, and the result looks nothing like what the person saw.
 */
test('transparency is composited rather than dropped', () => {
  const pixels = {
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([
      200, 100, 50, 255, // opaque: untouched
      200, 100, 50, 0, // clear: all background
      200, 100, 50, 128, // half: halfway between
    ]),
  }
  const onWhite = flatten(pixels, '#ffffff')
  assert.deepEqual([...onWhite.data.slice(0, 4)], [200, 100, 50, 255])
  assert.deepEqual([...onWhite.data.slice(4, 8)], [255, 255, 255, 255])
  assert.equal(onWhite.data[11], 255, 'everything comes out opaque')
  // 200 over white at half alpha lands between the two, nearer white.
  assert.ok(onWhite.data[8]! > 200 && onWhite.data[8]! < 255)

  // The short form of a hex colour means the same as the long one.
  assert.deepEqual([...flatten(pixels, '#f00').data.slice(4, 8)], [255, 0, 0, 255])
  assert.deepEqual([...flatten(pixels, '#ff0000').data.slice(4, 8)], [255, 0, 0, 255])

  assert.throws(() => flatten(pixels, 'reddish'), /hex colour/)
  assert.throws(() => flatten(pixels, '#12345'), /hex colour/)

  // Not a copy-on-write mistake: the source is left alone.
  assert.equal(pixels.data[7], 0)
})

/**
 * The quality scales are not comparable between formats, so the defaults are
 * deliberately different numbers: they are the settings measured to look alike.
 * Carrying one format's number over to another would quietly change the file.
 */
test('each format defaults to its own quality', () => {
  assert.equal(defaultQuality('jpeg'), 80)
  assert.equal(defaultQuality('webp'), 82)
  assert.equal(defaultQuality('avif'), 64)
  assert.notEqual(defaultQuality('webp'), defaultQuality('avif'))
  assert.equal(keepsAlpha('jpeg'), false)
  for (const format of IMAGE_FORMATS.filter((one) => one !== 'jpeg')) {
    assert.equal(keepsAlpha(format), true, `${format} keeps alpha`)
  }
})

/**
 * The real round trip, through the same WebAssembly the browser runs. Slow
 * enough to be worth doing once rather than per format assertion.
 */
test('every format written here can be read back', async () => {
  const source = makePng(24, 16)
  for (const format of IMAGE_FORMATS) {
    const encoded = await encodeImage(await decodeImage(source), { format, quality: 70 })
    assert.equal(sniff(encoded), format, `${format} is written with its own signature`)
    const back = await decodeImage(encoded)
    assert.deepEqual([back.width, back.height], [24, 16], `${format} keeps the size`)
  }
})

test('an impossible request is refused rather than fudged', async () => {
  const pixels = await decodeImage(makePng(4, 4))
  await assert.rejects(
    encodeImage(pixels, { format: 'jpeg', lossless: true }),
    /no lossless mode/,
  )
  await assert.rejects(encodeImage(pixels, { format: 'webp', quality: 0 }), /1 to 100/)
  await assert.rejects(encodeImage(pixels, { format: 'webp', quality: 101 }), /1 to 100/)
  await assert.rejects(encodeImage(pixels, { format: 'webp', quality: NaN }), /1 to 100/)
  await assert.rejects(decodeImage(Buffer.from('nothing image about this')), /not an image/)
  // Readable in the browser, and saying so beats "unsupported format".
  await assert.rejects(decodeImage(Buffer.from('GIF89a....', 'ascii')), /browser app/)
})
