import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deflateSync, inflateSync, crc32 } from 'node:zlib'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  degrees,
  type PDFObject,
  type PDFRef,
} from '@cantoo/pdf-lib'

import { imagesToPdf, sniffImage } from '../src/core/images-to-pdf.ts'
import {
  assemblePages,
  chunkPages,
  describe as describePdf,
  hasFormFields,
  mergePdfs,
  pageCount,
  parseRanges,
  resizePages,
  resolvePages,
  visibleBox,
  rotatePages,
  selectPages,
  splitPdf,
} from '../src/core/pdf-pages.ts'
import {
  caveat,
  clearWarning,
  describeSecurity,
  explain,
  protectPdf,
  unlockPdf,
} from '../src/core/pdf-security.ts'
import { compressPdf, compressToFit } from '../src/core/pdf-compress.ts'
import { describeMetadata, stripMetadata } from '../src/core/pdf-metadata.ts'
import { signPdf } from '../src/core/pdf-sign.ts'
import { cap, oneLine, tame } from '../src/term.ts'
import { decodeImage } from '../src/core/images-node.ts'
import {
  IMAGE_FORMATS,
  READ_ONLY_FORMATS,
  defaultQuality,
  extensionFor,
  hasLosslessOption,
  isImageFormat,
  looksTruncated,
  mimeType,
  encodeImage,
  resize,
  resizedTo,
  flatten,
  keepsAlpha,
  sniff,
} from '../src/core/images.ts'
import {
  displayedSize,
  numberPages,
  placeOnPage,
  turnOf,
  watermarkPdf,
} from '../src/core/pdf-stamp.ts'
import { isMirrored, readImageMeta, turnFor } from '../src/core/image-meta.ts'
import { humanSize, sizeChange } from '../src/core/units.ts'
import { numbered, safeName, stem } from '../src/ui/files.ts'
import { matching } from '../src/ui/Dropzone.tsx'

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

/** The same PNG, with a pHYs chunk claiming a resolution. */
function withResolution(png: Uint8Array, dpi: number): Uint8Array {
  const data = Buffer.alloc(9)
  const perMetre = Math.round(dpi / 0.0254)
  data.writeUInt32BE(perMetre, 0)
  data.writeUInt32BE(perMetre, 4)
  data[8] = 1 // unit: metres
  // Straight after the 8-byte signature and the 25-byte IHDR chunk.
  return Buffer.concat([
    Buffer.from(png.subarray(0, 33)),
    pngChunk('pHYs', data),
    Buffer.from(png.subarray(33)),
  ])
}

/**
 * A JPEG with an EXIF block holding an orientation tag. Written by hand rather
 * than with a library, so the test knows exactly what the bytes say.
 */
function withOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff: number[] = []
  const put16 = (value: number) => tiff.push(value & 0xff, (value >> 8) & 0xff)
  const put32 = (value: number) =>
    tiff.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff)
  tiff.push(0x49, 0x49) // little-endian
  put16(42)
  put32(8) // the first directory starts straight after this header
  put16(1) // one entry
  put16(0x0112) // Orientation
  put16(3) // SHORT
  put32(1)
  put16(orientation)
  put16(0)
  put32(0) // no second directory
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff] // "Exif\0\0"
  const segment = [0xff, 0xe1, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff]
  return Buffer.concat([
    Buffer.from(jpeg.subarray(0, 2)), // SOI
    Buffer.from(segment),
    Buffer.from(payload),
    Buffer.from(jpeg.subarray(2)),
  ])
}

/**
 * A document with a two-level table of contents. pdf-lib has no API for an
 * outline, so it is written as the dictionaries the format actually stores:
 * a root hanging off the catalogue, items chained by /Next and /Prev, and a
 * destination array naming a page by reference.
 *
 * `named` writes the destinations through the /Names /Dests name tree instead
 * of inline, which is the other half of what real documents do.
 */
async function makeOutlined(named = false): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const pages = [0, 1, 2, 3].map((index) => pdf.addPage([200, 200 + index]))
  const { context } = pdf
  const root = context.obj({ Type: 'Outlines' })
  const rootRef = context.register(root)
  const destinations: [string, PDFArray][] = []

  function item(title: string, page: number, parent: PDFRef) {
    const target = context.obj([
      pages[page]!.ref,
      PDFName.of('XYZ'),
      PDFNumber.of(0),
      PDFNumber.of(200),
      PDFNumber.of(0),
    ])
    const dict = context.obj({ Title: PDFString.of(title), Parent: parent })
    if (named) {
      const key = `dest${page}`
      destinations.push([key, target])
      dict.set(PDFName.of('Dest'), PDFString.of(key))
    } else {
      dict.set(PDFName.of('Dest'), target)
    }
    return { dict, ref: context.register(dict) }
  }

  const one = item('Chapter one', 0, rootRef)
  const two = item('Chapter two', 2, rootRef)
  const section = item('Section 2.1', 3, two.ref)
  one.dict.set(PDFName.of('Next'), two.ref)
  two.dict.set(PDFName.of('Prev'), one.ref)
  two.dict.set(PDFName.of('First'), section.ref)
  two.dict.set(PDFName.of('Last'), section.ref)
  two.dict.set(PDFName.of('Count'), PDFNumber.of(1))
  root.set(PDFName.of('First'), one.ref)
  root.set(PDFName.of('Last'), two.ref)
  root.set(PDFName.of('Count'), PDFNumber.of(3))
  pdf.catalog.set(PDFName.of('Outlines'), rootRef)

  if (named) {
    const pairs = context.obj([])
    for (const [key, target] of destinations) {
      pairs.push(PDFString.of(key))
      pairs.push(context.register(target))
    }
    const tree = context.obj({})
    tree.set(PDFName.of('Names'), pairs)
    const names = context.obj({})
    names.set(PDFName.of('Dests'), context.register(tree))
    pdf.catalog.set(PDFName.of('Names'), context.register(names))
  }
  return pdf.save()
}

/** Every bookmark in a document, as "title -> 1-based page", depth first. */
async function outlineOf(file: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(file)
  const root = pdf.context.lookup(pdf.catalog.get(PDFName.of('Outlines')))
  if (!(root instanceof PDFDict)) return []
  const refs = pdf.getPages().map((page) => page.ref.toString())
  const found: string[] = []

  // Annotated rather than inferred: lookup's signature widens to every object
  // type at once when it is handed something unknown, and narrowing that
  // intersection leaves nothing behind.
  const walk = (start: PDFObject | undefined, depth: number) => {
    let node: PDFObject | undefined = pdf.context.lookup(start)
    while (node instanceof PDFDict) {
      const title = node.get(PDFName.of('Title'))
      const text =
        title instanceof PDFHexString || title instanceof PDFString ? title.decodeText() : '?'
      const destination: PDFObject | undefined = pdf.context.lookup(node.get(PDFName.of('Dest')))
      const at =
        destination instanceof PDFArray
          ? refs.indexOf(destination.get(0)?.toString() ?? '')
          : -1
      found.push(`${'  '.repeat(depth)}${text} -> ${at === -1 ? 'nowhere' : `page ${at + 1}`}`)
      walk(node.get(PDFName.of('First')), depth + 1)
      node = pdf.context.lookup(node.get(PDFName.of('Next')))
    }
  }
  walk(root.get(PDFName.of('First')), 0)
  return found
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
  assert.throws(() => parseRanges('1-99', 10), /out of bounds/)
  // Backwards is its own mistake. Both ends of "5-2" are inside a ten-page
  // document, so calling it out of bounds sends the reader to the page count,
  // which is not where the problem is.
  assert.throws(() => parseRanges('5-2', 10), /counts backwards/)
})

test('chunkPages splits into consecutive groups and keeps the short tail', () => {
  assert.deepEqual(chunkPages(5, 2), [[0, 1], [2, 3], [4]])
  assert.deepEqual(chunkPages(4, 1), [[0], [1], [2], [3]])
  assert.deepEqual(chunkPages(3, 10), [[0, 1, 2]])
  assert.throws(() => chunkPages(3, 0), />= 1/)
})

/**
 * A duplex feeder that flips the back of every sheet leaves half the document
 * upside down, and the fix is a page range nobody wants to type out to 300.
 */
test('odd and even name the halves a duplex scan gets wrong', async () => {
  assert.deepEqual(parseRanges('odd', 7), [0, 2, 4, 6])
  assert.deepEqual(parseRanges('even', 7), [1, 3, 5])
  assert.deepEqual(parseRanges('EVEN', 4), [1, 3])
  assert.deepEqual(parseRanges('1,even', 4), [0, 1, 3])
  // Nothing to name is still an empty range, not a silent no-op.
  assert.throws(() => parseRanges('even', 1), /empty page range/)

  // Turning is not something one page can be asked for twice, however many
  // ways the range names it.
  const pdf = await rotatePages(await makePdf(3), [0, 0, 2], 90)
  const angles = (await PDFDocument.load(pdf)).getPages().map((page) => page.getRotation().angle)
  assert.deepEqual(angles, [90, 0, 90])
})

/**
 * The Emscripten codecs carry the C libraries' own diagnostics, and libjpeg
 * answers a file that stops early with "Premature end of JPEG file" on standard
 * error. It names no file, offers no advice, and used to land in the middle of a
 * batch's output directly above a tick saying the conversion worked.
 */
test('a codec does not get to write on the terminal', async () => {
  const written: string[] = []
  const realErr = process.stderr.write.bind(process.stderr)
  // Only standard error, which is where the C libraries write and where the
  // stray line appeared. Standard output carries this runner's own messages to
  // its parent, and watching it would record those instead. Passed through as
  // well as recorded, so a failure here is readable rather than swallowed by
  // the thing it is testing.
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    written.push(String(chunk))
    return realErr(chunk as string, ...(rest as []))
  }) as typeof process.stderr.write

  try {
    const pixels = { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4).fill(180) }
    for (const format of IMAGE_FORMATS) {
      const whole = await encodeImage(pixels, { format })
      for (const bytes of [whole, whole.slice(0, Math.floor(whole.length * 0.6)), whole.slice(0, 20)]) {
        // Whether it reads is not the point; whether it complains out loud is.
        await decodeImage(bytes).catch(() => undefined)
      }
    }
  } finally {
    process.stderr.write = realErr
  }

  const noise = written.filter((line) => line.trim() !== '')
  assert.deepEqual(noise, [], 'every codec kept its diagnostics to itself')
})

/**
 * A decoder handed half a file does not refuse it: libjpeg fills what it never
 * received with grey, hands back a full-size picture, and prints "Premature end
 * of JPEG file" to standard error, which names no file and offers no advice.
 * Without this the run reports success over an image whose bottom is missing.
 */
test('a file that stops before its own end is spotted before it is decoded', async () => {
  const pixels = { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4).fill(200) }
  for (const format of ['jpeg', 'png'] as const) {
    const whole = await encodeImage(pixels, { format })
    assert.equal(looksTruncated(whole), false, `an intact ${format} is not damaged`)
    assert.equal(looksTruncated(whole.slice(0, whole.length - 20)), true, `a cut ${format} is`)

    // Trailing padding is common enough that treating it as damage would cry
    // wolf, which is worse than staying quiet.
    const padded = new Uint8Array(whole.length + 40)
    padded.set(whole)
    assert.equal(looksTruncated(padded), false, `a padded ${format} is not damaged`)
  }

  // Only the two formats with an unambiguous end are judged. Saying a file is
  // damaged when nothing here can tell is worse than saying nothing.
  const webp = await encodeImage(pixels, { format: 'webp' })
  assert.equal(looksTruncated(webp.slice(0, 40)), false, 'no opinion is offered about a WebP')
  assert.equal(looksTruncated(new Uint8Array([1, 2, 3])), false)
  assert.equal(looksTruncated(new Uint8Array(0)), false)
})

/* ---------- what a reader actually shows ---------- */

/**
 * A page carries a MediaBox saying how big the sheet is and, often, a CropBox
 * saying how much of it to display. Where they differ the CropBox wins, and
 * everything outside it is simply not drawn. Nothing here read it, so a 600
 * point page cropped to its middle 300 was measured as 600 and stamped in a
 * corner nobody can see.
 */
test('a cropped page is measured and drawn on as the part that is shown', async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([600, 600])
  page.node.set(PDFName.of('CropBox'), pdf.context.obj([150, 150, 450, 450]))
  const cropped = await pdf.save()

  assert.deepEqual(visibleBox(page), { x: 150, y: 150, width: 300, height: 300 })
  assert.deepEqual(displayedSize(page), { width: 300, height: 300 })
  // The bottom-left of what the reader sees is 150,150 on the sheet.
  assert.deepEqual(placeOnPage(page, 0, 0), { x: 150, y: 150 })

  assert.deepEqual(
    await describePdf(cropped),
    { pages: 1, width: 300, height: 300 },
    'info reports the page a person is looking at',
  )

  // A page number asked for the bottom right corner has to land inside the
  // crop, or it is drawn onto part of the sheet no reader displays.
  const numbered = await numberPages(cropped, { position: 'bottom-right', margin: 28 })
  const where = drawnAt(await operatorsOf(numbered), 'Tm')
  assert.ok(where.x > 150 && where.x < 450, `x ${where.x} is inside the crop`)
  assert.ok(where.y > 150 && where.y < 450, `y ${where.y} is inside the crop`)

  // A crop that does not overlap the sheet is not a crop a reader honours.
  const nonsense = await PDFDocument.create()
  const odd = nonsense.addPage([100, 100])
  odd.node.set(PDFName.of('CropBox'), nonsense.context.obj([500, 500, 600, 600]))
  assert.deepEqual(visibleBox(odd), { x: 0, y: 0, width: 100, height: 100 })
})

/* ---------- page size ---------- */

/** Every page's size, as the reader sees it rather than as the box stores it. */
async function shownSizes(file: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(file)
  return pdf.getPages().map((page) => {
    const { width, height } = page.getSize()
    const turned = Math.abs(page.getRotation().angle / 90) % 2 === 1
    const [w, h] = turned ? [height, width] : [width, height]
    return `${Math.round(w)}x${Math.round(h)}`
  })
}

/**
 * A PDF does not require one page size, and a document assembled from a scan,
 * an export and a downloaded form quite legally holds three. That is fine on
 * screen and chaos on paper, where the printer rescales, shifts the margins or
 * changes tray at every size change.
 */
test('every page can be put on the same sheet', async () => {
  const pdf = await PDFDocument.create()
  pdf.addPage([612, 792]) // letter, upright
  pdf.addPage([842, 595]) // A4, on its side
  pdf.addPage([200, 1000]) // a tall strip
  pdf.addPage([400, 300]).setRotation(degrees(90)) // stored wide, shown tall
  const mixed = await pdf.save()

  assert.deepEqual(await shownSizes(mixed), ['612x792', '842x595', '200x1000', '300x400'])
  assert.deepEqual(
    await shownSizes(await resizePages(mixed, { paper: 'a4' })),
    ['595x842', '842x595', '595x842', '595x842'],
    'auto turns the sheet to match each page, so nothing is letterboxed',
  )
  assert.deepEqual(
    await shownSizes(await resizePages(mixed, { paper: 'a4', orientation: 'portrait' })),
    ['595x842', '595x842', '595x842', '595x842'],
  )
  assert.deepEqual(
    await shownSizes(await resizePages(mixed, { paper: 'letter', orientation: 'landscape' })),
    ['792x612', '792x612', '792x612', '792x612'],
  )

  await assert.rejects(
    () => resizePages(mixed, { paper: 'a4', marginPt: 400 }),
    /margin is larger/,
  )
  await assert.rejects(() => resizePages(mixed, { paper: 'a4', marginPt: -1 }), /margin/)

  // A page with no width is a broken page and there is nothing on it to scale,
  // but being asked to put every page on A4 and quietly leaving one at nothing
  // by three hundred points is the answer nobody wants.
  const flat = await PDFDocument.create()
  flat.addPage([300, 300]).setMediaBox(0, 0, 0, 300)
  const put = await PDFDocument.load(await resizePages(await flat.save(), { paper: 'a4' }))
  assert.deepEqual(put.getPage(0).getSize(), { width: 595.28, height: 841.89 })
})

/**
 * Changing the box without moving the content leaves the page the wrong size
 * and the drawing in the corner of it, which is the failure this has to be
 * checked against rather than assumed away.
 */
test('resizing moves the content with the box, in proportion and centred', async () => {
  const pdf = await PDFDocument.create()
  pdf.addPage([300, 300])
  const square = await pdf.save()

  const fitted = await resizePages(square, {
    paper: 'a4',
    orientation: 'portrait',
    marginPt: 36,
  })
  const drawn = await operatorsOf(fitted)
  const matrices = [...drawn.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm/g)]
    .map((found) => found.slice(1).map(Number))

  // 300 points of content into 595.28 minus two 36-point margins.
  const factor = (595.28 - 72) / 300
  const scaling = matrices.find((m) => m[0] !== 1 || m[3] !== 1)
  assert.ok(scaling, 'the content should have been scaled at all')
  assert.ok(Math.abs(scaling[0]! - factor) < 0.001, `scaled by ${scaling[0]}, wanted ${factor}`)
  assert.equal(scaling[0], scaling[3], 'one factor for both axes, so nothing changes shape')

  // Centred: all of the spare width is the margin, and the spare height is
  // split evenly above and below.
  const moving = matrices.find((m) => m[4] === 36)
  assert.ok(moving, 'the content should have been moved onto the sheet')
  assert.ok(
    Math.abs(moving[5]! - (841.89 - 300 * factor) / 2) < 0.01,
    `moved up ${moving[5]}, wanted it centred`,
  )
})

/**
 * Neither box has to start at the origin: a cropping tool leaves boxes like
 * [50 50 645 891]. Scaling happens about the origin, so a page whose content
 * sits away from it comes out shifted unless the corner is part of the sum.
 */
test('resizing a cropped page starting away from the origin lands square', async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([300, 300])
  page.setMediaBox(50, 50, 300, 300)
  page.node.set(PDFName.of('CropBox'), pdf.context.obj([100, 100, 250, 250]))
  // An annotation at a known place, to check it moves with what it points at.
  page.node.set(
    PDFName.of('Annots'),
    pdf.context.obj([
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Square',
        Rect: pdf.context.obj([100, 100, 130, 130]),
      }),
    ]),
  )
  const source = await pdf.save()

  const fitted = await resizePages(source, { paper: 'a4', orientation: 'portrait' })
  const out = await PDFDocument.load(fitted)
  const resized = out.getPage(0)

  assert.deepEqual(resized.getSize(), { width: 595.28, height: 841.89 })
  assert.deepEqual(
    visibleBox(resized),
    { x: 0, y: 0, width: 595.28, height: 841.89 },
    'the old crop described a page that no longer exists, so it went',
  )

  // 150 points of visible page onto 595.28 of sheet.
  const factor = 595.28 / 150
  const drawn = await operatorsOf(fitted)
  const matrices = [...drawn.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm/g)]
    .map((found) => found.slice(1).map(Number))
  assert.ok(
    matrices.some((m) => m[4] === -100 && m[5] === -100),
    'the visible corner is brought to the origin before anything is scaled',
  )
  assert.ok(
    matrices.some((m) => Math.abs((m[0] ?? 0) - factor) < 0.001 && m[0] === m[3]),
    `scaled by ${factor} on both axes`,
  )
  assert.ok(
    matrices.some((m) => m[4] === 0 && Math.abs((m[5] ?? 0) - (841.89 - 595.28) / 2) < 0.01),
    'then centred on the sheet',
  )

  // The annotation sat in the corner of the crop, so it should now sit in the
  // corner of the sheet, scaled with everything else.
  const annotations = resized.node.Annots() as PDFArray
  const rect = out.context.lookup(annotations.get(0), PDFDict).get(PDFName.of('Rect')) as PDFArray
  const corners = [0, 1, 2, 3].map((at) => (rect.get(at) as PDFNumber).asNumber())
  assert.ok(Math.abs(corners[0]!) < 0.01, `annotation x ${corners[0]}, wanted the corner`)
  assert.ok(
    Math.abs(corners[1]! - (841.89 - 595.28) / 2) < 0.01,
    `annotation y ${corners[1]}, wanted it moved with the content`,
  )
  assert.ok(
    Math.abs(corners[2]! - 30 * factor) < 0.01,
    'and scaled by the same factor, or it points at the wrong line',
  )
})

/* ---------- bookmarks ---------- */

/**
 * An outline names its pages by reference, so copying pages into a new document
 * leaves the whole table of contents pointing at objects that came nowhere.
 * Every one of these operations used to drop it silently, which is the
 * complaint on every forum thread about merging PDFs.
 */
test('bookmarks survive being merged, reordered, extracted and split', async () => {
  const source = await makeOutlined()
  assert.deepEqual(await outlineOf(source), [
    'Chapter one -> page 1',
    'Chapter two -> page 3',
    '  Section 2.1 -> page 4',
  ])

  assert.deepEqual(
    await outlineOf(await mergePdfs([source, source])),
    [
      'Chapter one -> page 1',
      'Chapter two -> page 3',
      '  Section 2.1 -> page 4',
      'Chapter one -> page 5',
      'Chapter two -> page 7',
      '  Section 2.1 -> page 8',
    ],
    'each source contributes its own, in the order the documents were given',
  )

  // Chapter one has no page in this selection, so it is dropped rather than
  // pointed somewhere plausible: a bookmark that jumps to the wrong chapter is
  // worse than one that is missing, because only the second is noticed.
  assert.deepEqual(await outlineOf(await selectPages(source, [2, 3])), [
    'Chapter two -> page 1',
    '  Section 2.1 -> page 2',
  ])

  assert.deepEqual(
    await outlineOf(await selectPages(source, [3, 2, 1, 0])),
    ['Chapter one -> page 4', 'Chapter two -> page 2', '  Section 2.1 -> page 1'],
    'reordering moves the bookmarks with their pages',
  )

  // A page copied three times gets one bookmark, on the first copy, which is
  // where somebody following the table of contents expects to arrive.
  assert.deepEqual(await outlineOf(await selectPages(source, [0, 0, 2])), [
    'Chapter one -> page 1',
    'Chapter two -> page 3',
  ])

  const halves = await splitPdf(source, [
    [0, 1],
    [2, 3],
  ])
  assert.deepEqual(await outlineOf(halves[0]!), ['Chapter one -> page 1'])
  assert.deepEqual(await outlineOf(halves[1]!), [
    'Chapter two -> page 1',
    '  Section 2.1 -> page 2',
  ])
})

/**
 * A destination can be written out in full or referred to by name, and plenty
 * of writers choose the second. Resolving only the first would drop half the
 * bookmarks in the wild for no reason a person could see.
 */
test('bookmarks that name their destination are carried too', async () => {
  const named = await makeOutlined(true)
  assert.deepEqual(await outlineOf(await mergePdfs([named])), [
    'Chapter one -> page 1',
    'Chapter two -> page 3',
    '  Section 2.1 -> page 4',
  ])
})

/**
 * An outline is a chain of references, and nothing in the format stops one
 * pointing back at itself. Walked naively that is a merge that never finishes;
 * walked with only a counter it is ten thousand copies of the same bookmark.
 */
test('an outline that points back at itself does not run away with the merge', async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([200, 200])
  const root = pdf.context.obj({ Type: 'Outlines' })
  const rootRef = pdf.context.register(root)
  const loop = pdf.context.obj({
    Title: PDFString.of('Round and round'),
    Parent: rootRef,
    Dest: pdf.context.obj([page.ref, PDFName.of('XYZ'), PDFNumber.of(0), PDFNumber.of(200), PDFNumber.of(0)]),
  })
  const loopRef = pdf.context.register(loop)
  // Its own sibling, and its own child.
  loop.set(PDFName.of('Next'), loopRef)
  loop.set(PDFName.of('First'), loopRef)
  root.set(PDFName.of('First'), loopRef)
  root.set(PDFName.of('Last'), loopRef)
  pdf.catalog.set(PDFName.of('Outlines'), rootRef)

  const started = Date.now()
  const merged = await mergePdfs([await pdf.save()])
  assert.ok(Date.now() - started < 5000, 'it finishes')
  assert.deepEqual(
    await outlineOf(merged),
    ['Round and round -> page 1'],
    'the bookmark is carried once, not once per lap',
  )
})

/** A document with nothing to carry should not gain an empty outline. */
test('a document with no bookmarks does not grow one', async () => {
  const plain = await mergePdfs([await makePdf(3), await makePdf(2)])
  assert.deepEqual(await outlineOf(plain), [])
  const pdf = await PDFDocument.load(plain)
  assert.equal(pdf.catalog.get(PDFName.of('Outlines')), undefined, 'and no root either')
})

/**
 * These four tables decide the extension a saved file gets and the type its
 * Blob carries, which is what the operating system opens it with. Small enough
 * to be thought obvious, and wrong in a way nobody notices until a PNG will not
 * open.
 */
test('every writable format agrees with itself about what it is called', () => {
  for (const format of IMAGE_FORMATS) {
    assert.equal(isImageFormat(format), true)
    assert.match(mimeType(format), /^image\/[a-z+-]+$/, `${format} has a real media type`)
    assert.match(extensionFor(format), /^[a-z]+$/, `${format} has a bare extension, no dot`)
    assert.equal(typeof hasLosslessOption(format), 'boolean')
  }
  assert.equal(mimeType('jpeg'), 'image/jpeg')
  assert.equal(extensionFor('jpeg'), 'jpg', 'the extension people expect, not the format name')
  assert.equal(extensionFor('png'), 'png')
  assert.equal(hasLosslessOption('jpeg'), false, 'JPEG has no lossless mode to offer')

  // The read-only ones are not writable, and the two lists must not overlap or
  // a format would be offered as an output it cannot be written to.
  for (const format of READ_ONLY_FORMATS) {
    assert.equal(isImageFormat(format), false, `${format} can be read but not written`)
  }
  assert.equal(isImageFormat('pdf'), false)
  assert.equal(isImageFormat(''), false)
})

/* ---------- the small shared pieces ---------- */

/**
 * Sizes are quoted in the decimal units SI defines. The difference from the
 * 1024s only matters in one place, and it is the place that matters most: an
 * upload form saying "500KB" never says which it means, and the decimal reading
 * is the smaller of the two, so a file under it is under both.
 */
test('sizes are reported in the units an upload form means', () => {
  assert.equal(humanSize(0), '0 B')
  assert.equal(humanSize(999), '999 B')
  assert.equal(humanSize(1000), '1 kB')
  assert.equal(humanSize(200_000), '200 kB', 'not the 195 kB the 1024s would give')
  assert.equal(humanSize(1_000_000), '1.0 MB')
  assert.equal(humanSize(2_500_000), '2.5 MB')
  // Nothing here should ever be handed one of these, but a size that reads as
  // "NaN MB" in a progress line is worse than one that admits it does not know.
  assert.equal(humanSize(Number.NaN), '? B')
  assert.equal(humanSize(Number.POSITIVE_INFINITY), '? B')

  assert.equal(sizeChange(100, 50), 50)
  assert.equal(sizeChange(50, 100), -100, 'a file that grew reports a negative saving')
  assert.equal(sizeChange(0, 0), 0, 'nothing divided by nothing is not a percentage')
})

/**
 * The name a finished file is offered under comes from the name of the file
 * that was dropped in, which is somebody else's text whenever the document came
 * from somebody else.
 */
test('a download name cannot carry anything but a name', () => {
  assert.equal(safeName('report.pdf'), 'report.pdf')
  assert.equal(safeName('../../etc/passwd'), '-..-etc-passwd', 'separators cannot escape')
  assert.equal(safeName('  .bashrc'), 'bashrc', 'trimmed first, so the dot is still leading')
  assert.equal(safeName('a:b.pdf'), 'ab.pdf', 'a colon is an alternate data stream on Windows')
  assert.equal(safeName('report .'), 'report', 'Windows drops these and Unix does not')
  assert.equal(safeName('   '), 'convert.in.pdf', 'something has to be offered')

  // A bidirectional override reorders what follows it, so this name is listed
  // by the browser as ending in ".png" while the bytes end in ".exe". The
  // source-code form of the same trick is CVE-2021-42574.
  assert.equal(safeName('report\u202Egnp.exe'), 'reportgnp.exe')
  // Windows keeps these names for devices, extension and all: NUL.pdf is still
  // the null device, so the download either fails or writes to nothing.
  assert.equal(safeName('NUL.pdf'), '_NUL.pdf')
  assert.equal(safeName('com1.tar.gz'), '_com1.tar.gz')
  assert.equal(safeName('CON'), '_CON')
  assert.equal(safeName('console.pdf'), 'console.pdf', 'only the name itself is reserved')
  assert.equal(safeName('nullify.pdf'), 'nullify.pdf')
  assert.equal(safeName('\u2066hidden\u2069.pdf'), 'hidden.pdf')

  // Truncation keeps the extension, or the file stops being openable.
  const long = safeName(`${'x'.repeat(250)}.pdf`)
  assert.equal(long.length, 200)
  assert.ok(long.endsWith('.pdf'), 'the extension survives whatever else is cut')
  // What is not an extension is not treated as one.
  assert.equal(safeName('y'.repeat(250)).length, 200)

  assert.equal(stem('holiday photos.HEIC'), 'holiday photos')
  assert.equal(stem('archive.tar.gz'), 'archive.tar')
  assert.equal(stem('.bashrc'), '.bashrc', 'a dotfile is all name and no extension')
  assert.equal(numbered('page', 0, 100), 'page-001', 'padded so a file manager sorts them')
  assert.equal(numbered('page', 9, 10), 'page-10')
})

/**
 * A drop event carries names, not bytes, so this is the only filter that can
 * run at the door. Whatever gets through is identified from its own magic bytes
 * further in.
 */
test('a drop is filtered by extension without an empty entry letting everything in', () => {
  const dropped = [
    new File([], 'scan.pdf'),
    new File([], 'photo.PNG'),
    new File([], 'notes.txt'),
  ]
  assert.deepEqual(
    matching(dropped, '.pdf,.png').map((file) => file.name),
    ['scan.pdf', 'photo.PNG'],
    'the extension is matched without regard to case',
  )
  // One stray comma leaves an empty string in the list, and every name ends
  // with an empty string, so this used to accept the lot.
  assert.deepEqual(
    matching(dropped, '.pdf,').map((file) => file.name),
    ['scan.pdf'],
  )
  assert.deepEqual(matching(dropped, '').length, 3, 'accepting nothing in particular takes all')
})

/**
 * A page carries its content in one orientation and a /Rotate telling the
 * reader to turn it. Everything drawn onto a page has to cross that, and three
 * tools do, so the crossing lives in one place.
 */
test('the rotation helpers agree with what a reader is shown', async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([400, 200])

  assert.equal(turnOf(page), 0)
  assert.deepEqual(displayedSize(page), { width: 400, height: 200 })
  assert.deepEqual(placeOnPage(page, 10, 20), { x: 10, y: 20 })

  page.setRotation(degrees(90))
  assert.equal(turnOf(page), 90)
  assert.deepEqual(displayedSize(page), { width: 200, height: 400 }, 'the reader sees it upright')
  assert.deepEqual(placeOnPage(page, 10, 20), { x: 380, y: 10 })

  page.setRotation(degrees(180))
  assert.deepEqual(displayedSize(page), { width: 400, height: 200 })
  assert.deepEqual(placeOnPage(page, 10, 20), { x: 390, y: 180 })

  page.setRotation(degrees(270))
  assert.deepEqual(placeOnPage(page, 10, 20), { x: 20, y: 190 })

  page.setRotation(degrees(-90))
  assert.equal(turnOf(page), 270, 'a negative turn folds into the same four')

  // pdf-lib will not set an angle that is not a quarter turn, but a file from
  // somewhere else can carry one, so it is written into the page dictionary
  // the way a parser would find it.
  page.node.set(PDFName.of('Rotate'), pdf.context.obj(45))
  assert.equal(turnOf(page), 0, 'an angle that is not a quarter turn is treated as none')
  assert.deepEqual(displayedSize(page), { width: 400, height: 200 })
})

/** The EXIF orientation tag, which is eight values and only four of them turns. */
test('orientation tags map to turns, and the mirrored ones are known', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(turnFor), [0, 0, 180, 180, 90, 90, 270, 270])
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(isMirrored), [
    false, true, false, true, true, false, true, false,
  ])
  // Nothing that is not a tag becomes a turn.
  assert.equal(turnFor(0), 0)
  assert.equal(turnFor(99), 0)

  // A file that says nothing says nothing, rather than guessing.
  assert.deepEqual(readImageMeta(makePng(4, 4)), { orientation: 1, dpi: null })
  assert.deepEqual(readImageMeta(new Uint8Array([1, 2, 3])), { orientation: 1, dpi: null })
  assert.deepEqual(readImageMeta(new Uint8Array(0)), { orientation: 1, dpi: null })
  assert.equal(readImageMeta(withResolution(makePng(4, 4), 300)).dpi, 300)
})

/** Every page-level tool narrows to a set of indices through this one function. */
test('a page selection is checked before anything is drawn on it', () => {
  assert.deepEqual(resolvePages(3), [0, 1, 2], 'no selection means the whole document')
  assert.deepEqual(resolvePages(3, [2, 0]), [2, 0], 'the order given is the order kept')
  assert.throws(() => resolvePages(0), /no pages/)
  assert.throws(() => resolvePages(3, []), /no pages selected/)
  assert.throws(() => resolvePages(3, [3]), /out of range/)
  assert.throws(() => resolvePages(3, [-1]), /out of range/)
  assert.throws(() => resolvePages(3, [1.5]), /out of range/)
})

/* ---------- metadata ---------- */

/**
 * A PDF names its author, the machine that wrote it and the company licence it
 * was written under, in an information dictionary and again in an XMP packet,
 * and none of it shows while reading the document. Every one of those copies
 * has to go, and the packet has to leave the file rather than merely lose the
 * reference that pointed at it.
 */
test('what a PDF says about itself can be listed, and taken out', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  doc.setTitle('Q3 layoffs draft')
  doc.setAuthor('a.person')
  doc.setCreator('Microsoft Word for Office 365')
  const once = await doc.save()

  // A custom key and an XMP packet, which is where the interesting things
  // usually are and which pdf-lib has no setter for.
  const marked = await PDFDocument.load(once, { updateMetadata: false })
  const info = marked.context.lookup(marked.context.trailerInfo.Info) as PDFDict
  info.set(PDFName.of('Company'), PDFHexString.fromText('Acme Holdings'))
  const packet = marked.context.stream(
    '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/">a.person</x:xmpmeta><?xpacket end="w"?>',
    { Type: 'Metadata', Subtype: 'XML' },
  )
  marked.catalog.set(PDFName.of('Metadata'), marked.context.register(packet))
  const dirty = await marked.save()

  const before = await describeMetadata(dirty)
  assert.equal(before.any, true)
  const names = before.entries.map((entry) => entry.name)
  for (const key of ['Title', 'Author', 'Creator', 'Company']) {
    assert.ok(names.includes(key), `${key} should have been found`)
  }
  assert.equal(before.entries.find((entry) => entry.name === 'Company')?.custom, true)
  assert.equal(before.entries.find((entry) => entry.name === 'Author')?.custom, false)
  assert.ok(before.xmp > 0)

  const clean = await stripMetadata(dirty)
  assert.deepEqual(await describeMetadata(clean), { entries: [], xmp: 0, any: false })
  assert.equal((await PDFDocument.load(clean)).getPageCount(), 1, 'the pages are untouched')

  // Unlinking the packet is not removing it: an object nothing points at is
  // still written out in full, and still readable with `strings`.
  const text = Buffer.from(clean).toString('latin1')
  assert.ok(!text.includes('xpacket'), 'the XMP packet left the file, not just the catalog')
  assert.ok(!text.includes('a.person'), 'and so did the name inside it')
  // pdf-lib stamps its own Producer during a normal save, which would put one
  // of the removed keys straight back.
  assert.ok(!text.includes('pdf-lib'), 'nothing signed the file on the way out')
})

/* ---------- imagesToPdf ---------- */

/**
 * A page in points, not pixels. An image that says nothing about its own
 * resolution is treated as 96dpi, so 40 pixels is 30 points.
 */
test('imagesToPdf: fit gives every page its own image size', async () => {
  const pdf = await PDFDocument.load(await imagesToPdf([makePng(40, 20), makePng(10, 60)]))
  assert.equal(pdf.getPageCount(), 2)
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 30, height: 15 })
  assert.deepEqual(pdf.getPage(1).getSize(), { width: 7.5, height: 45 })
})

test('imagesToPdf: margin grows the page, not the image', async () => {
  const pdf = await PDFDocument.load(await imagesToPdf([makePng(40, 20)], { marginPt: 5 }))
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 40, height: 25 })
})

/**
 * The complaint this answers: a 3000-pixel scan becomes a page three and a half
 * feet wide, because the converter treated one pixel as one point. The file
 * says what it is; nothing was reading it.
 */
test('imagesToPdf: a page is the size the image says it is', async () => {
  const at300 = await PDFDocument.load(
    await imagesToPdf([withResolution(makePng(3000, 2000), 300)]),
  )
  assert.deepEqual(at300.getPage(0).getSize(), { width: 720, height: 480 }, '10 inches by 7')

  // And an explicit dpi overrides whatever the file claims.
  const forced = await PDFDocument.load(
    await imagesToPdf([withResolution(makePng(3000, 2000), 300)], { dpi: 150 }),
  )
  assert.equal(forced.getPage(0).getWidth(), 1440, '20 inches at half the resolution')

  await assert.rejects(() => imagesToPdf([makePng(4, 4)], { dpi: 0 }), /dpi/)
})

/**
 * A phone writes the sensor's pixels and a tag saying which way the phone was
 * held. Embedding the bytes untouched is what keeps this lossless, and it is
 * also what loses the tag, so the page turns instead of the pixels.
 */
test('imagesToPdf: a photo taken sideways is not a sideways page', async () => {
  const jpeg = await encodeImage(await decodeImage(makePng(400, 200)), { format: 'jpeg' })
  const upright = await PDFDocument.load(await imagesToPdf([jpeg]))
  assert.deepEqual(upright.getPage(0).getSize(), { width: 300, height: 150 })

  for (const orientation of [6, 8]) {
    const pdf = await PDFDocument.load(await imagesToPdf([withOrientation(jpeg, orientation)]))
    assert.deepEqual(
      pdf.getPage(0).getSize(),
      { width: 150, height: 300 },
      `orientation ${orientation} is a quarter turn, so the page stands up`,
    )
  }
  // 3 is a half turn, which leaves the shape alone.
  const halfTurn = await PDFDocument.load(await imagesToPdf([withOrientation(jpeg, 3)]))
  assert.deepEqual(halfTurn.getPage(0).getSize(), { width: 300, height: 150 })
})

/**
 * A PDF page has no colour of its own. Left unpainted, a transparent PNG shows
 * whatever the reader puts behind it, which in a dark-mode reader is black.
 */
test('imagesToPdf: the page is painted white before the picture goes on it', async () => {
  const pdf = await imagesToPdf([makePng(40, 20)])
  const drawn = await operatorsOf(pdf)
  assert.match(drawn, /1 1 1 rg/, 'a white fill')
  assert.ok(drawn.indexOf('rg') < drawn.indexOf('Do'), 'painted before the image, not over it')
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
    [30, 15, 23],
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
  assert.deepEqual(await describeSecurity(plain), {
    encrypted: false,
    needsPassword: false,
    inTheClear: [],
  })

  const locked = await protectPdf(plain, { openPassword: 'hunter2' })
  assert.deepEqual(await describeSecurity(locked), {
    encrypted: true,
    needsPassword: true,
    inTheClear: [],
  })
  await assert.rejects(() => pageCount(locked), /password protected/i)

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
    { encrypted: true, needsPassword: false, inTheClear: [] },
    'encrypted, but a reader is never prompted',
  )
  // Such a file opens everywhere else too, because its open password is empty
  // and that is the password a reader supplies without asking anyone.
  assert.equal(await pageCount(restricted), 1)
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

test('a file locked only by a permissions password is worked on like any other', async () => {
  const source = await PDFDocument.create()
  source.addPage([300, 400])
  source.setTitle('Quarterly figures')
  source.setAuthor('Finance')
  const restricted = await protectPdf(await source.save(), {
    permissionsPassword: 'owner',
    printing: 'none',
    copying: false,
  })
  assert.equal((await describeSecurity(restricted)).needsPassword, false)

  // Every operation, not only the ones that rebuild the document from scratch:
  // stamping and metadata editing write the same objects back out, and that is
  // where an encryption dictionary left pointing at the old key would survive.
  const numbered = await numberPages(restricted, {})
  const stamped = await watermarkPdf(restricted, { text: 'DRAFT' })
  const resized = await resizePages(restricted, { paper: 'a4' })

  for (const [name, made] of [
    ['number', numbered],
    ['watermark', stamped],
    ['resize', resized],
  ] as const) {
    assert.deepEqual(
      await describeSecurity(made),
      { encrypted: false, needsPassword: false, inTheClear: [] },
      `${name} writes a document a reader can open, with no orphan /Encrypt left behind`,
    )
    assert.equal(await pageCount(made), 1, `${name} keeps the page`)
  }

  // The trailer's /Info survives the decrypting parse, so the document still
  // says who wrote it, and clean still has something to take out.
  const said = await describeMetadata(numbered)
  const named = said.entries.find((entry) => entry.name === 'Title')
  assert.equal(named?.value, 'Quarterly figures')
  assert.equal((await describeMetadata(await stripMetadata(restricted))).any, false)
})

test('what a document says about itself is text, not instructions to a terminal', () => {
  // ESC [ 2K erases the line being written and the carriage return puts the
  // cursor back at its start, so a title carrying both overwrites whatever was
  // printed and shows what it likes instead. ESC ] 0 renames the window.
  const hostile = '\u001b[31mred\u001b[0m\u001b[2K\rHIJACKED\u0007\u001b]0;renamed\u0007'
  const printed = tame(hostile)
  assert.ok(!printed.includes('\u001b'), 'no escape reaches the terminal')
  assert.ok(!printed.includes('\r'), 'nor a carriage return, which is half the trick')
  assert.ok(printed.includes('HIJACKED'), 'the text itself survives, as text')
  assert.equal(tame('report\u202Egnp.exe'), 'reportgnp.exe', 'and the reordering overrides go')

  // Written with newlines on purpose, so those stay: warnings here wrap.
  assert.equal(tame('two\nlines\there'), 'two\nlines\there')

  // The rows of the info table are aligned by padding, so a value carrying a
  // newline and enough spaces would print what looks like a row of its own.
  assert.equal(oneLine('one\n   two \t three '), 'one two three')

  assert.equal(cap('short', 10), 'short')
  assert.equal(cap('x'.repeat(20), 10), `${'x'.repeat(9)}\u2026`)
  assert.equal(cap('x'.repeat(20), 10).length, 10, 'the limit counts the ellipsis')
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

/**
 * sign has always refused a mark that does not fit. number was drawing into the
 * void: a margin bigger than the page put the label off the edge, and a page
 * number that is not on the page is the same as no page number at all except
 * that it looks like it worked.
 */
test('a page number that cannot fit where it was asked for is refused', async () => {
  const a4 = await PDFDocument.create()
  a4.addPage([595, 842])
  const sheet = await a4.save()

  await assert.doesNotReject(() => numberPages(sheet, { size: 10, margin: 28 }))
  await assert.rejects(
    () => numberPages(sheet, { size: 10, margin: 900 }),
    /595x842pt.+does not fit/s,
  )

  const tiny = await PDFDocument.create()
  tiny.addPage([1, 1])
  const speck = await tiny.save()
  await assert.rejects(() => numberPages(speck, {}), /1x1pt.+does not fit/s)
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
  // The other library in the toolkit words the same three failures its own way.
  assert.equal(
    explain(new Error('No password given')),
    'this PDF is password protected: unlock it first',
  )
  assert.equal(
    explain(new Error('Invalid PDF structure.')),
    'this PDF is damaged past the point where it can be read',
  )
  assert.equal(
    explain(new Error('The PDF file is empty, i.e. its size is zero bytes.')),
    'this file is not a PDF',
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
  assert.deepEqual(await describeSecurity(stripped), {
    encrypted: false,
    needsPassword: false,
    inTheClear: [],
  })

  const permissionsOnly = await protectPdf(plain, { permissionsPassword: 'owner', printing: 'none' })
  assert.deepEqual(await describeSecurity(permissionsOnly), {
    encrypted: true,
    needsPassword: false,
    inTheClear: [],
  })
  const opened = await unlockPdf(permissionsOnly, '')
  assert.deepEqual(await describeSecurity(opened), {
    encrypted: false,
    needsPassword: false,
    inTheClear: [],
  })

  // Such a file opens with no password, so nothing should be demanding one.
  // Before this, re-protecting it failed with "supply the password to open it",
  // and the only way through was to work out that the password was "".
  const relocked = await protectPdf(permissionsOnly, { openPassword: 'reader' })
  assert.equal((await describeSecurity(relocked)).needsPassword, true)
  // A file that really is locked still refuses, rather than the empty password
  // becoming a way past anything.
  await assert.rejects(() => protectPdf(relocked, { openPassword: 'other' }), /password protected/)
})

/**
 * The format lets ciphertext and plaintext sit side by side: /StmF and /StrF
 * name the crypt filter each kind of object goes through, and /Identity means
 * none. A file can therefore announce AES-256, prompt for a password, and still
 * carry every page in the clear. That is the shape the PDFex work (Muller et
 * al., ACM CCS 2019) builds its direct-exfiltration attack on, and it is
 * standard-compliant, so nothing warns about it.
 *
 * This was reported as "encrypted, needs a password" before, which is the
 * answer that gets a document forwarded.
 */
test('a file that only pretends to be encrypted is called out', async () => {
  const source = await PDFDocument.create()
  source.addPage([200, 200])
  const locked = await protectPdf(await source.save(), { openPassword: 'hunter2' })

  const swap = (find: string, replace: string) => {
    const text = Buffer.from(locked).toString('latin1')
    const at = text.indexOf('/Filter /Standard')
    assert.ok(at > 0, 'the fixture should carry an encryption dictionary')
    const changed = text.slice(at).replace(find, replace)
    assert.notEqual(changed, text.slice(at), `nothing to replace: ${find}`)
    return new Uint8Array(Buffer.from(text.slice(0, at) + changed, 'latin1'))
  }

  assert.deepEqual((await describeSecurity(locked)).inTheClear, [], 'what this tool writes is sealed')
  assert.deepEqual(
    (await describeSecurity(swap('/StmF /StdCF', '/StmF /Identity'))).inTheClear,
    ['streams'],
  )
  assert.deepEqual(
    (await describeSecurity(swap('/StrF /StdCF', '/StrF /Identity'))).inTheClear,
    ['strings'],
  )
  assert.deepEqual(
    (await describeSecurity(swap('/Filter /Standard', '/Filter /Standard /EncryptMetadata false')))
      .inTheClear,
    ['metadata'],
  )

  assert.equal(clearWarning([]), null)
  assert.match(clearWarning(['streams'])!, /without a password|with no password/i)
  assert.match(clearWarning(['streams', 'strings'])!, /pages/)
})

/**
 * Every one of these reached a person verbatim. "NEEDS PASSWORD" is the
 * library shouting about an empty password; the other two name a field nobody
 * chose, in a file they did not write.
 */
test('the library is not allowed to answer in its own words', async () => {
  const source = await PDFDocument.create()
  source.addPage([200, 200])
  const locked = await protectPdf(await source.save(), { openPassword: 'hunter2' })

  await assert.rejects(() => unlockPdf(locked, ''), /that password does not open this PDF/)
  assert.match(
    explain(new Error('unsupported encryption algorithm')),
    /locked in a way this cannot open/,
  )
  assert.match(explain(new Error('invalid key length: 7')), /locked in a way this cannot open/)
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

/**
 * Sampling one source pixel per output pixel is the obvious way to scale and
 * the wrong one: half the rows of a shrinking photo are thrown away outright.
 * Averaging the covered area is what keeps detail, and these are the two cases
 * where the difference is visible in three numbers rather than in a picture.
 */
test('scaling averages the pixels it covers rather than picking one', () => {
  const pair = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
  }
  const one = resize(pair, { width: 1, height: 1 })
  assert.equal(one.data[0], 128, 'black beside white is mid grey, not one of the two')

  // Transparent pixels carry coverage but no colour. Averaging the channels
  // beside the alpha instead drags green into the edge of a cut-out, which is
  // the dark fringe every naive resizer leaves behind.
  const cut = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0]) }
  const blended = resize(cut, { width: 1, height: 1 })
  assert.deepEqual([...blended.data], [255, 0, 0, 128])
})

test('a scaled image keeps its proportions unless told not to', () => {
  const shape = { width: 400, height: 300, data: new Uint8ClampedArray(0) }
  assert.deepEqual(resizedTo(shape, { width: 200 }), { width: 200, height: 150 })
  assert.deepEqual(resizedTo(shape, { height: 150 }), { width: 200, height: 150 })
  // Both sides given means fit inside the box, so nothing is cropped.
  assert.deepEqual(resizedTo(shape, { width: 100, height: 100 }), { width: 100, height: 75 })
  assert.deepEqual(resizedTo(shape, { width: 100, height: 100, fit: false }), {
    width: 100,
    height: 100,
  })
  assert.throws(() => resizedTo(shape, {}), /width, a height, or both/)
  assert.throws(() => resizedTo(shape, { width: 0 }), /1 or more/)
  assert.throws(() => resizedTo(shape, { height: NaN }), /1 or more/)
})

test('compressing re-encodes the pictures and leaves everything else alone', async () => {
  const pixels = { width: 600, height: 400, data: new Uint8ClampedArray(600 * 400 * 4) }
  for (let at = 0; at < pixels.data.length; at += 4) {
    pixels.data[at] = (at / 4) % 256
    pixels.data[at + 1] = 140
    pixels.data[at + 2] = 200
    pixels.data[at + 3] = 255
  }
  const scan = await imagesToPdf([await encodeImage(pixels, { format: 'jpeg', quality: 95 })])

  const smaller = await compressPdf(scan, { quality: 40 })
  assert.equal(smaller.images, 1)
  assert.equal(smaller.replaced, 1)
  assert.ok(smaller.after < smaller.before / 2, `expected less than half, got ${smaller.after}`)
  assert.equal((await PDFDocument.load(smaller.bytes)).getPageCount(), 1)

  // Capping the long side is worth more than any quality setting on a scan.
  const capped = await compressPdf(scan, { maxSide: 200 })
  assert.ok(capped.after < smaller.after)

  await assert.rejects(compressPdf(scan, { quality: 0 }), /1 to 100/)
  await assert.rejects(compressPdf(scan, { maxSide: 0 }), /1 or more/)
})

/**
 * The complaint this answers: a portal wants the file under 500KB and every
 * compressor offers "low, medium, high" instead, so the settings get guessed at
 * until one of them lands.
 */
test('compressing to a limit keeps trying until the file is under it', async () => {
  // Noise, because a smooth gradient compresses so well that the first rung
  // would meet any limit and the ladder would never be exercised.
  const pixels = { width: 900, height: 700, data: new Uint8ClampedArray(900 * 700 * 4) }
  let state = 7
  for (let at = 0; at < pixels.data.length; at += 4) {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    pixels.data[at] = state & 0xff
    pixels.data[at + 1] = (state >> 8) & 0xff
    pixels.data[at + 2] = (state >> 16) & 0xff
    pixels.data[at + 3] = 255
  }
  const scan = await imagesToPdf([await encodeImage(pixels, { format: 'jpeg', quality: 95 })])
  assert.ok(scan.length > 300_000, `expected a big fixture, got ${scan.length}`)

  const fitted = await compressToFit(scan, 90_000)
  assert.ok(fitted.fits, 'it should have got under the limit')
  assert.ok(fitted.after <= 90_000, `${fitted.after} is over the limit`)

  // A gentler limit should stop earlier on the ladder, so it keeps more detail.
  const gentle = await compressToFit(scan, 250_000)
  assert.ok(gentle.fits)
  assert.ok(
    gentle.used.quality! > fitted.used.quality!,
    'a limit that is easy to meet should not reach for the harshest setting',
  )

  // Already small enough: handed straight back, byte for byte.
  const untouched = await compressToFit(scan, scan.length + 1)
  assert.equal(untouched.bytes, scan, 'the original, not a re-encode of it')
  assert.equal(untouched.replaced, 0)

  // A limit nothing can meet reports the closest it got rather than throwing,
  // because a file that is nearly small enough is still worth having.
  const impossible = await compressToFit(scan, 1000)
  assert.equal(impossible.fits, false)
  assert.ok(impossible.after < scan.length, 'it still shrank what it could')

  await assert.rejects(compressToFit(scan, 0), /1 or more/)
})

/**
 * A compressor that hands back a bigger file is worse than one that does
 * nothing, and it is the easy mistake to make: writing the document back out
 * costs a few bytes even when not one image changed.
 */
test('a PDF with nothing to compress comes back untouched, not larger', async () => {
  const doc = await PDFDocument.create()
  for (let page = 0; page < 4; page++) doc.addPage([300, 300])
  const source = await doc.save()

  const report = await compressPdf(source)
  assert.equal(report.images, 0)
  assert.equal(report.replaced, 0)
  assert.ok(report.after <= report.before, `${report.before} went in, ${report.after} came out`)
  assert.deepEqual([...report.bytes], [...source], 'the original bytes, byte for byte')
})

test('signing draws on the last page unless told otherwise', async () => {
  const mark = await encodeImage(
    { width: 300, height: 100, data: new Uint8ClampedArray(300 * 100 * 4).fill(180) },
    { format: 'png' },
  )
  const doc = await PDFDocument.create()
  for (let page = 0; page < 3; page++) doc.addPage([595, 842])
  const source = await doc.save()

  const signed = await signPdf(source, { signature: mark })
  assert.equal((await PDFDocument.load(signed)).getPageCount(), 3)
  assert.ok(signed.length > source.length, 'the signature went in')

  await assert.rejects(signPdf(source, { signature: Buffer.from('nope') }), /PNG or a JPEG/)
  await assert.rejects(signPdf(source, { signature: mark, width: 0 }), /above 0/)
  await assert.rejects(signPdf(source, { signature: mark, margin: -1 }), /0 or more/)
  await assert.rejects(signPdf(source, { signature: mark, pages: [9] }), /out of range/)
  // A signature wider than the page is refused rather than drawn off the edge.
  await assert.rejects(signPdf(source, { signature: mark, width: 900 }), /does not fit/)
})

/**
 * The transform the PDF spec gives for /Rotate, written out here rather than
 * imported, so that the placement code and the check are two derivations of the
 * same rule instead of one repeated twice.
 */
function asDisplayed(
  turn: number,
  boxWidth: number,
  boxHeight: number,
  x: number,
  y: number,
): { u: number; v: number; width: number; height: number } {
  const sideways = turn === 90 || turn === 270
  const size = { width: sideways ? boxHeight : boxWidth, height: sideways ? boxWidth : boxHeight }
  if (turn === 90) return { u: y, v: boxWidth - x, ...size }
  if (turn === 180) return { u: boxWidth - x, v: boxHeight - y, ...size }
  if (turn === 270) return { u: boxHeight - y, v: x, ...size }
  return { u: x, v: y, ...size }
}

/** Every content stream in the document, inflated, as one string of operators. */
async function operatorsOf(pdf: Uint8Array): Promise<string> {
  const loaded = await PDFDocument.load(pdf)
  const parts: string[] = []
  for (const [, object] of loaded.context.enumerateIndirectObjects()) {
    const raw = object as { getContents?: () => Uint8Array }
    if (typeof raw.getContents !== 'function') continue
    const bytes = Buffer.from(raw.getContents())
    // pdf-lib deflates what it writes, so the operators are not in the file as
    // text. Anything that will not inflate was never a content stream.
    try {
      parts.push(inflateSync(bytes).toString('latin1'))
    } catch {
      parts.push(bytes.toString('latin1'))
    }
  }
  return parts.join('\n')
}

/**
 * The point the first `Tm` or `cm` puts its content at. Both operators end with
 * the two numbers of the translation, and the first one in the stream is the
 * placement; the ones after it are the rotation and the scale.
 */
function drawnAt(operators: string, operator: 'Tm' | 'cm'): { x: number; y: number } {
  const found = operators.match(new RegExp(`(-?[\\d.]+) (-?[\\d.]+) ${operator}`))
  assert.ok(found, `no ${operator} operator in the output`)
  return { x: Number(found[1]), y: Number(found[2]) }
}

test('a page stored sideways is stamped in the corner the reader sees', async () => {
  const margin = 28
  for (const turn of [0, 90, 180, 270]) {
    const doc = await PDFDocument.create()
    doc.addPage([400, 600]).setRotation({ type: 'degrees', angle: turn } as never)
    const source = await doc.save()

    const numbered = await numberPages(source, {
      position: 'bottom-right',
      margin,
      size: 10,
      format: '7',
    })
    const { x, y } = drawnAt(await operatorsOf(numbered), 'Tm')
    const seen = asDisplayed(turn, 400, 600, x, y)

    // The label is a single digit, so it starts a hair in from the right margin
    // and sits exactly one margin up from the bottom, whichever way the page is
    // stored. Before this, all four rotations drew at the same point.
    assert.ok(
      seen.u > seen.width - margin - 12 && seen.u < seen.width - margin,
      `turned ${turn}: the number is against the right edge, at ${seen.u.toFixed(1)} of ${seen.width}`,
    )
    assert.ok(
      Math.abs(seen.v - margin) < 0.01,
      `turned ${turn}: the number is one margin up from the bottom, at ${seen.v.toFixed(1)}`,
    )
  }
})

test('a signature is measured against the page as it is looked at', async () => {
  const mark = await encodeImage(
    { width: 300, height: 100, data: new Uint8ClampedArray(300 * 100 * 4).fill(180) },
    { format: 'png' },
  )
  const turned = await PDFDocument.create()
  // 400 wide in the file, 600 wide once the reader turns it.
  turned.addPage([400, 600]).setRotation({ type: 'degrees', angle: 90 } as never)
  const sideways = await turned.save()

  // 500pt of signature does not fit across 400pt of stored page but fits the
  // 600pt the reader is looking at, and the reader is the one signing it.
  const signed = await signPdf(sideways, { signature: mark, width: 500, margin: 20 })
  const { x, y } = drawnAt(await operatorsOf(signed), 'cm')
  const seen = asDisplayed(90, 400, 600, x, y)
  assert.equal(seen.width, 600)
  assert.ok(Math.abs(seen.u - (600 - 20 - 500)) < 0.01, `across at ${seen.u}`)
  assert.ok(Math.abs(seen.v - 20) < 0.01, `up at ${seen.v}`)

  // Wider than the page it is looked at is still refused.
  await assert.rejects(signPdf(sideways, { signature: mark, width: 700 }), /does not fit/)
})

test('an image cannot be asked for more pixels than anything can hold', () => {
  const pixels = { width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4) }
  // One side given, the other follows, and it is the pair that has to fit.
  assert.throws(() => resizedTo(pixels, { width: 200_000 }), /as large as this goes/)
  assert.throws(() => resize(pixels, { width: 40_000, height: 40_000 }), /as large as this goes/)
  // Just inside is still allowed, so the limit is a limit and not a refusal.
  assert.deepEqual(resizedTo(pixels, { width: 16_000 }), { width: 16_000, height: 16_000 })
})

test('a codec that aborts says what happened rather than [object Object]', () => {
  // What an Emscripten build throws: a message, but not an Error, which every
  // reader of `.message` used to miss and print as the words object Object.
  const aborted = { name: 'ExitStatus', message: 'Program terminated with exit(1)', status: 1 }
  assert.equal(explain(aborted), 'Program terminated with exit(1)')
  assert.equal(explain({}), 'something went wrong that did not say what it was')
  assert.equal(explain('plain string'), 'plain string')
})

test('a picture the codecs cannot read says so in words', async () => {
  const real = makePng(4, 4)
  // Right signature, nothing behind it. The Rust decoder panics on this with
  // "`unwrap_throw` failed", which used to be printed as it stands.
  const liar = Buffer.concat([Buffer.from(real.subarray(0, 8)), Buffer.alloc(200, 0x41)])
  await assert.rejects(decodeImage(liar), /this PNG could not be read/)

  // Cut in half, which is what an interrupted download leaves behind.
  await assert.rejects(decodeImage(real.subarray(0, real.length >> 1)), /this PNG could not be read/)

  // A header claiming 30000x30000 with almost nothing behind it. The decoder
  // refuses the allocation and traps with the single word "unreachable".
  const header = Buffer.alloc(13)
  header.writeUInt32BE(30_000, 0)
  header.writeUInt32BE(30_000, 4)
  header[8] = 8
  header[9] = 2
  const bomb = Buffer.concat([
    Buffer.from(real.subarray(0, 8)),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.alloc(1000))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  await assert.rejects(decodeImage(bomb), /this PNG could not be read/)

  // The real one still reads, so the catch has not swallowed the working path.
  assert.equal((await decodeImage(real)).width, 4)
})
