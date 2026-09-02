/**
 * Carrying a document's bookmarks across a page-level operation.
 *
 * A PDF's outline is a tree of dictionaries hanging off the catalogue, each one
 * naming a page by reference. Copying pages into a new document does not bring
 * it: the references it holds point at objects that are no longer part of
 * anything, so the tree has to be rebuilt against the pages that actually came
 * across. Every tool that merges, reorders, extracts or splits loses the whole
 * table of contents without this, which is the complaint on every forum thread
 * about merging PDFs and the reason Sejda sells the option as a feature.
 *
 * A bookmark whose page did not come across is dropped rather than pointed
 * somewhere plausible. A bookmark that jumps to the wrong chapter is worse than
 * one that is missing, because only the second is noticed.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  PDFHexString,
  type PDFObject,
} from '@cantoo/pdf-lib'

/** Where an output page came from, by index into the sources and their pages. */
export interface Origin {
  source: number
  page: number
}

const OUTLINES = PDFName.of('Outlines')
const FIRST = PDFName.of('First')
const LAST = PDFName.of('Last')
const NEXT = PDFName.of('Next')
const PREV = PDFName.of('Prev')
const PARENT = PDFName.of('Parent')
const COUNT = PDFName.of('Count')
const TITLE = PDFName.of('Title')
const DEST = PDFName.of('Dest')

/** How deep an outline is followed before it is treated as a loop. */
const MAX_DEPTH = 32

/**
 * How many nodes are followed at one level before it is treated as a loop.
 *
 * The visited set below catches a chain that points back at itself, which is
 * the shape a hand-written loop takes. This catches the other one: a chain long
 * enough to be a denial of service rather than a table of contents.
 */
const MAX_SIBLINGS = 10_000

/* ------------------------------------------------------- destinations --- */

/**
 * Look a named destination up in the catalogue.
 *
 * A destination can be written out in full or referred to by name, and the
 * names live in one of two places: the modern /Names /Dests name tree, or the
 * /Dests dictionary that PDF 1.1 used and plenty of writers still emit. Both
 * are checked, because a bookmark that resolves in Acrobat and not here would
 * be dropped for no reason a person could see.
 */
function namedDestination(doc: PDFDocument, key: string): PDFObject | undefined {
  const legacy = doc.context.lookup(doc.catalog.get(PDFName.of('Dests')))
  if (legacy instanceof PDFDict) {
    const direct = doc.context.lookup(legacy.get(PDFName.of(key)))
    if (direct !== undefined) return direct
  }

  const names = doc.context.lookup(doc.catalog.get(PDFName.of('Names')))
  if (!(names instanceof PDFDict)) return undefined
  const root = doc.context.lookup(names.get(PDFName.of('Dests')))
  if (!(root instanceof PDFDict)) return undefined

  // A name tree is a dictionary of sorted /Names pairs, or /Kids pointing at
  // more of the same. Walked rather than binary-searched: an outline has tens
  // of entries, not millions, and a tree written slightly out of order would
  // defeat the search while the walk still finds it.
  const stack: PDFDict[] = [root]
  const seen = new Set<PDFDict>([root])
  for (let steps = 0; stack.length > 0 && steps < MAX_SIBLINGS; steps++) {
    const node = stack.pop()!
    const pairs = doc.context.lookup(node.get(PDFName.of('Names')))
    if (pairs instanceof PDFArray) {
      for (let at = 0; at + 1 < pairs.size(); at += 2) {
        const name = pairs.get(at)
        const text =
          name instanceof PDFString || name instanceof PDFHexString ? name.decodeText() : null
        if (text === key) return doc.context.lookup(pairs.get(at + 1))
      }
    }
    const kids = doc.context.lookup(node.get(PDFName.of('Kids')))
    if (kids instanceof PDFArray) {
      for (let at = 0; at < kids.size(); at++) {
        const kid = doc.context.lookup(kids.get(at))
        // A tree whose kid is its own parent is walked once, not until the
        // step count gives up.
        if (kid instanceof PDFDict && !seen.has(kid)) {
          seen.add(kid)
          stack.push(kid)
        }
      }
    }
  }
  return undefined
}

/**
 * The destination array an outline node points at, whichever of the three ways
 * it says so: /Dest holding the array, /Dest naming one, or a /GoTo action.
 */
function destinationOf(doc: PDFDocument, node: PDFDict): PDFArray | undefined {
  const resolve = (value: PDFObject | undefined): PDFObject | undefined => {
    const found = value instanceof PDFRef ? doc.context.lookup(value) : value
    if (found instanceof PDFString || found instanceof PDFHexString) {
      return namedDestination(doc, found.decodeText())
    }
    if (found instanceof PDFName) {
      return namedDestination(doc, found.asString().replace(/^\//, ''))
    }
    return found
  }

  const direct = resolve(node.get(DEST))
  if (direct instanceof PDFArray) return direct
  // A destination can also be wrapped in a dictionary under /D.
  if (direct instanceof PDFDict) {
    const inner = resolve(direct.get(PDFName.of('D')))
    if (inner instanceof PDFArray) return inner
  }

  const action = doc.context.lookup(node.get(PDFName.of('A')))
  if (!(action instanceof PDFDict)) return undefined
  // Only a jump inside this document. A /URI or /Launch action is not a page
  // reference and has no business being rewritten to one.
  if (action.get(PDFName.of('S'))?.toString() !== '/GoTo') return undefined
  const target = resolve(action.get(PDFName.of('D')))
  return target instanceof PDFArray ? target : undefined
}

/* ------------------------------------------------------------ rebuild --- */

interface Built {
  ref: PDFRef
  /** Visible descendants, which is what a reader shows beside a closed item. */
  count: number
}

/**
 * Copy one outline node and its children into the output, pointing at whatever
 * pages survived.
 *
 * Returns nothing when neither this node nor anything under it has a page in
 * the result. A heading whose whole chapter was left out is not a heading any
 * more.
 */
function rebuild(
  source: PDFDocument,
  node: PDFDict,
  parent: PDFRef,
  out: PDFDocument,
  pageFor: (destination: PDFArray) => PDFRef | undefined,
  depth: number,
  visited: Set<PDFDict>,
): Built | undefined {
  if (depth > MAX_DEPTH || visited.has(node)) return undefined
  visited.add(node)

  const children: Built[] = []
  let child = source.context.lookup(node.get(FIRST))
  for (let seen = 0; child instanceof PDFDict && seen < MAX_SIBLINGS; seen++) {
    if (visited.has(child)) break
    // The parent is filled in below, once this node has a reference of its own.
    const built = rebuild(source, child, PDFRef.of(0), out, pageFor, depth + 1, visited)
    if (built !== undefined) children.push(built)
    child = source.context.lookup(child.get(NEXT))
  }

  const destination = destinationOf(source, node)
  const page = destination === undefined ? undefined : pageFor(destination)
  if (page === undefined && children.length === 0) return undefined

  const title = node.get(TITLE)
  const copy = out.context.obj({
    Title:
      title instanceof PDFString || title instanceof PDFHexString
        ? PDFHexString.fromText(title.decodeText())
        : PDFHexString.fromText(''),
    Parent: parent,
  })
  const ref = out.context.register(copy)

  if (page !== undefined && destination !== undefined) {
    // Keep the view the bookmark asked for — /XYZ and its coordinates, /Fit,
    // whatever it was — and swap only the page it names.
    const rewritten = out.context.obj([page])
    for (let at = 1; at < destination.size(); at++) rewritten.push(destination.get(at))
    copy.set(DEST, rewritten)
  }

  let visible = 0
  for (const [index, built] of children.entries()) {
    const dict = out.context.lookup(built.ref, PDFDict)
    dict.set(PARENT, ref)
    const previous = children[index - 1]
    const following = children[index + 1]
    if (previous) dict.set(PREV, previous.ref)
    if (following) dict.set(NEXT, following.ref)
    visible += 1 + built.count
  }
  if (children.length > 0) {
    copy.set(FIRST, children[0]!.ref)
    copy.set(LAST, children.at(-1)!.ref)
    // Positive means the item is shown open, which is what a table of contents
    // that was worth carrying across should be.
    copy.set(COUNT, PDFNumber.of(visible))
  }
  return { ref, count: visible }
}

/**
 * Rebuild the bookmarks of every source against the pages that came across, and
 * hang the result off the output's catalogue.
 *
 * Merging several documents lays their outlines end to end in the order the
 * documents were given, which is what every reader shows for a merged file and
 * what the pages themselves already do.
 *
 * Silent about its own failures on purpose: this is a document's table of
 * contents, not its content, and a merge that refuses to finish because one
 * source has a malformed outline would be a worse tool than one that merges.
 */
export function carryOutline(sources: PDFDocument[], out: PDFDocument, origins: Origin[]): void {
  const pages = out.getPages()
  // The first output page a source page landed on. A page duplicated three
  // times gets one bookmark, on the first copy, which is where a reader
  // following the table of contents expects to arrive.
  const landed = new Map<string, PDFRef>()
  origins.forEach((origin, slot) => {
    const page = sources[origin.source]?.getPage(origin.page)
    const target = pages[slot]
    if (page === undefined || target === undefined) return
    const key = `${origin.source}:${page.ref.toString()}`
    if (!landed.has(key)) landed.set(key, target.ref)
  })

  const outlines = out.context.obj({ Type: 'Outlines' })
  const outlinesRef = out.context.register(outlines)
  const top: Built[] = []

  sources.forEach((source, index) => {
    try {
      const root = source.context.lookup(source.catalog.get(OUTLINES))
      if (!(root instanceof PDFDict)) return
      const pageFor = (destination: PDFArray): PDFRef | undefined => {
        const named = destination.get(0)
        return named === undefined ? undefined : landed.get(`${index}:${named.toString()}`)
      }
      // One set per source: an outline that points back at itself would
      // otherwise be walked until the sibling cap stopped it, ten thousand
      // copies later.
      const visited = new Set<PDFDict>()
      let node = source.context.lookup(root.get(FIRST))
      for (let seen = 0; node instanceof PDFDict && seen < MAX_SIBLINGS; seen++) {
        if (visited.has(node)) break
        const built = rebuild(source, node, outlinesRef, out, pageFor, 0, visited)
        if (built !== undefined) top.push(built)
        node = source.context.lookup(node.get(NEXT))
      }
    } catch {
      // A source whose outline cannot be read contributes none. The pages it
      // contributed are already in the output and are what was actually asked
      // for.
    }
  })

  if (top.length === 0) {
    out.context.delete(outlinesRef)
    return
  }

  let visible = 0
  for (const [index, built] of top.entries()) {
    const dict = out.context.lookup(built.ref, PDFDict)
    const previous = top[index - 1]
    const following = top[index + 1]
    if (previous) dict.set(PREV, previous.ref)
    if (following) dict.set(NEXT, following.ref)
    visible += 1 + built.count
  }
  outlines.set(FIRST, top[0]!.ref)
  outlines.set(LAST, top.at(-1)!.ref)
  outlines.set(COUNT, PDFNumber.of(visible))
  out.catalog.set(OUTLINES, outlinesRef)
}
