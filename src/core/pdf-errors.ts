/**
 * Reading a PDF error into a sentence. Kept clear of the library it translates
 * for: every tool shows failures, including the ones that only ever touch an
 * image, and importing this from the shared shell used to pull a PDF writer
 * into the first thing a visitor downloads. Nothing in here is more than string
 * matching, so nothing in here needs the library present.
 */

/**
 * The library reports its failures with messages aimed at its own callers, and
 * a few of them reach a person who only picked a file. Every entry point that
 * loads a PDF can hit them, so the translation lives here rather than being
 * repeated at each one.
 */
export function explain(error: unknown): string {
  const message = messageOf(error)
  if (
    /document to `PDFDocument.load` is encrypted/i.test(message) ||
    // pdf.js rasterises the previews and the redaction, and it words the same
    // refusal its own way. A person meets whichever library the tool they
    // picked happens to use, so both have to arrive as one sentence.
    /^no password given$/i.test(message)
  ) {
    return 'this PDF is password protected: unlock it first'
  }
  // A file that is damaged past the point of being read comes back as an
  // internal type complaint. "No PDF header found" is its own case, because
  // that one almost always means the wrong file was picked.
  if (
    /no pdf header found/i.test(message) ||
    // An empty file reaches pdf-lib as a missing header and pdf.js as its own
    // sentence. Both mean the same thing to whoever picked it.
    /pdf file is empty/i.test(message)
  ) {
    return 'this file is not a PDF'
  }
  // An encryption dictionary this cannot work with: a handler nobody
  // implements, or a key length the cipher has no meaning for. Both come back
  // as the library's own words, which name a field a person never chose.
  if (/unsupported encryption algorithm/i.test(message) || /invalid key length/i.test(message)) {
    return 'this PDF is locked in a way this cannot open: its encryption is damaged or not one of the standard schemes'
  }
  if (
    /failed to parse pdf document/i.test(message) ||
    /expected instance of pdf/i.test(message) ||
    /cannot read propert(y|ies) of (undefined|null)/i.test(message) ||
    // A page tree that points back at itself walks forever, and what comes back
    // is the stack running out. That is a broken document, not a broken tool.
    /maximum call stack size exceeded/i.test(message) ||
    // pdf.js again, for a file whose cross-reference table leads nowhere.
    /invalid pdf structure/i.test(message)
  ) {
    return 'this PDF is damaged past the point where it can be read'
  }
  return message
}

/**
 * Not everything thrown is an Error. The WebAssembly codecs abort with a plain
 * object, and String() on one of those is the word "[object Object]", which is
 * what a person was shown instead of a reason. Anything carrying a string
 * message is taken at its word before falling back.
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null) {
    const { message } = error as { message?: unknown }
    if (typeof message === 'string' && message !== '') return message
  }
  return 'something went wrong that did not say what it was'
}
