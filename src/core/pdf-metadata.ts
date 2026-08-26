/**
 * What a PDF says about who made it, and how to take that back out.
 *
 * A document carries its author's name in at least two places and usually
 * three: the information dictionary a reader shows under File Properties, an
 * XMP packet holding the same facts again in XML, and whatever custom keys the
 * software that wrote it felt like adding. A CV names the person, a report
 * names the company, and a leaked document names whoever exported it, complete
 * with the Windows account and the internal tool that produced it.
 *
 * None of that is visible while reading the file, and cleaning one copy leaves
 * the others. This reports every copy and removes every copy.
 */
import { PDFDict, PDFDocument, PDFName, PDFHexString, PDFStream, PDFString } from '@cantoo/pdf-lib'
import { openPdf } from './pdf-security.ts'

/** The information dictionary keys the format defines. Anything else is custom. */
const STANDARD = [
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
  'Trapped',
] as const

/** One thing the file says about itself. */
export interface MetadataEntry {
  /** The key as the format spells it, e.g. "Author". */
  name: string
  value: string
  /** True for a key the software that wrote the file invented. */
  custom: boolean
}

export interface MetadataReport {
  /** Everything in the information dictionary, in the order the file holds it. */
  entries: MetadataEntry[]
  /** Bytes of XMP, which is the same facts again in XML. 0 when there is none. */
  xmp: number
  /** True when there is anything at all to remove. */
  any: boolean
}

function textOf(value: unknown): string | null {
  if (value instanceof PDFHexString || value instanceof PDFString) return value.decodeText()
  if (value instanceof PDFName) return value.asString().replace(/^\//, '')
  return null
}

/**
 * Read the whole information dictionary rather than the seven keys pdf-lib has
 * getters for, because the interesting ones are usually the other kind: Word
 * writes /Company, Acrobat writes /SourceModified, and a document management
 * system writes whatever it likes.
 */
function infoDict(pdf: PDFDocument): PDFDict | undefined {
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info)
  return info instanceof PDFDict ? info : undefined
}

function xmpBytes(pdf: PDFDocument): number {
  // Only a stream carries a packet, and the key is usually absent altogether,
  // so this asks rather than asserts: lookup throws when handed a type to
  // expect and nothing to match it against.
  const stream = pdf.context.lookup(pdf.catalog.get(PDFName.of('Metadata')))
  return stream instanceof PDFStream ? stream.getContents().length : 0
}

/**
 * List what the document says about itself, so a person can see it before
 * deciding whether to send the file.
 */
export async function describeMetadata(file: Uint8Array): Promise<MetadataReport> {
  // updateMetadata: false, or loading the file to look at it would stamp a new
  // ModDate and Producer on it and this would report its own footprints.
  const pdf = await openPdf(file, { updateMetadata: false })
  const entries: MetadataEntry[] = []
  const info = infoDict(pdf)
  if (info !== undefined) {
    for (const [key, value] of info.entries()) {
      const name = key.asString().replace(/^\//, '')
      const text = textOf(value)
      if (text === null || text === '') continue
      entries.push({ name, value: text, custom: !(STANDARD as readonly string[]).includes(name) })
    }
  }
  const xmp = xmpBytes(pdf)
  return { entries, xmp, any: entries.length > 0 || xmp > 0 }
}

/**
 * Take all of it back out: the information dictionary, the XMP packet at the
 * document level and on every page, and the piece of paperwork that is easiest
 * to forget, the Producer line pdf-lib writes on the way out.
 *
 * The pages, their content and any form are untouched. This removes what the
 * file says about itself, not what it says.
 */
export async function stripMetadata(file: Uint8Array): Promise<Uint8Array> {
  const pdf = await openPdf(file, { updateMetadata: false })

  const info = infoDict(pdf)
  if (info !== undefined) {
    // Collected first: deleting from a dictionary while walking its own keys
    // is a way to skip half of them.
    for (const key of [...info.keys()]) info.delete(key)
  }

  pdf.catalog.delete(PDFName.of('Metadata'))
  // A page can carry its own packet, which is where a scanner sometimes puts
  // the machine's serial number.
  for (const page of pdf.getPages()) page.node.delete(PDFName.of('Metadata'))

  // Dropping the reference is not enough. Every object that was in the file is
  // written back out whether anything points at it or not, so an unreferenced
  // XMP packet still sits there in full, findable with `strings`. The stream
  // itself has to go. Sweeping every object rather than only the two just
  // unlinked also catches a packet the document had already orphaned.
  for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFStream)) continue
    if (object.dict.get(PDFName.of('Type'))?.toString() !== '/Metadata') continue
    pdf.context.delete(ref)
  }

  // Loading with updateMetadata off is what keeps pdf-lib from stamping its own
  // Producer and a fresh ModDate on the way through, which would put two of the
  // keys just removed straight back.
  return pdf.save()
}
