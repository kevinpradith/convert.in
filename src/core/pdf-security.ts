import { EncryptedPDFError, PDFDict, PDFDocument, PDFName, PDFRef } from '@cantoo/pdf-lib'

/**
 * Password security modelled on Acrobat's own dialog, because that is the
 * vocabulary anyone protecting a PDF has already met.
 *
 * The cipher is AES-256 written as V5 / R6, which is what Acrobat calls
 * "Acrobat X and later" and the strongest setting it offers.
 */

/** Acrobat's "Printing Allowed" dropdown. Low is its 150 dpi setting. */
export type PrintingLevel = 'none' | 'low' | 'high'

/** Acrobat's "Changes Allowed" dropdown, in the same order it lists them. */
export type ChangesLevel =
  /** None */
  | 'none'
  /** Inserting, deleting and rotating pages */
  | 'assembly'
  /** Filling in form fields and signing */
  | 'forms'
  /** Commenting, filling in form fields and signing */
  | 'comments'
  /** Any except extracting pages */
  | 'any'

export const PRINTING_LEVELS: PrintingLevel[] = ['none', 'low', 'high']
export const CHANGES_LEVELS: ChangesLevel[] = ['none', 'assembly', 'forms', 'comments', 'any']

export interface ProtectOptions {
  /** Acrobat's "Document Open Password": needed to open the file at all. */
  openPassword?: string
  /** Acrobat's "Permissions Password": needed to lift the restrictions below. */
  permissionsPassword?: string
  printing?: PrintingLevel
  changes?: ChangesLevel
  /** Acrobat's "Enable copying of text, images and other content". */
  copying?: boolean
  /** The password the file is already locked with, if it is. */
  currentPassword?: string
}

/**
 * The library's own words for a password it would not take. Only the first is
 * a type; the rest arrive as messages, and one of them is shouted.
 */
const REFUSALS = [/password incorrect/i, /^needs password$/i, /no password given/i]

/**
 * Repair what a decrypting parse leaves behind, so the document can be written
 * back out in the clear.
 *
 * Two things need doing by hand. The re-parse loses the trailer's /Info
 * reference, so title, author, subject and keywords would silently vanish. And
 * the library only stops pointing at the encryption dictionary; the object
 * itself stays in the context and is written out as an orphan, which is enough
 * for a reader that scans for /Encrypt to call the file locked, and for this
 * tool's own info command to report a document nobody can open. Both are read
 * back from an undecrypted parse of the same bytes, where the object numbers
 * are identical.
 */
async function unseal(clear: PDFDocument, file: Uint8Array): Promise<PDFDocument> {
  const sealed = await PDFDocument.load(file, { ignoreEncryption: true, updateMetadata: false })

  // The document's own information dictionary, by the object number it has in
  // both parses. Its decrypted contents are in the context already; only the
  // trailer's way of naming it went missing.
  const original = sealed.context.trailerInfo.Info
  const restored = original instanceof PDFRef ? clear.context.lookup(original) : undefined
  if (original instanceof PDFRef && restored instanceof PDFDict) {
    // Having found no /Info to update, the library will have written its
    // Producer and ModDate into a dictionary of its own. Those entries are the
    // ones it meant to stamp, so they move onto the real dictionary rather than
    // replacing it, and the stand-in goes.
    const stray = clear.context.trailerInfo.Info
    if (stray instanceof PDFRef && stray.toString() !== original.toString()) {
      const written = clear.context.lookup(stray)
      if (written instanceof PDFDict) {
        for (const [key, value] of written.entries()) restored.set(key, value)
        clear.context.delete(stray)
      }
    }
    clear.context.trailerInfo.Info = original
  }

  const encryption = sealed.context.trailerInfo.Encrypt
  if (encryption instanceof PDFRef) clear.context.delete(encryption)

  return clear
}

/**
 * Open a document, turning the library's encryption errors into readable ones.
 *
 * A file locked only by a permissions password opens with an empty one, which
 * is what every reader does and what a person handed such a file expects: it
 * does not prompt them either. Asked to open one with no password at all, this
 * tries the empty password rather than demanding a secret that does not exist.
 */
async function open(
  file: Uint8Array,
  password?: string,
  extra: { updateMetadata?: boolean } = {},
  advice = 'supply the password to open it',
): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(
      file,
      password === undefined ? extra : { ...extra, password },
    )
  } catch (error) {
    // A wrong password does not come back as EncryptedPDFError: the cipher
    // itself rejects it, with a message rather than a type.
    const refused =
      error instanceof EncryptedPDFError ||
      (error instanceof Error && REFUSALS.some((shape) => shape.test(error.message)))
    if (!refused) throw error
    if (password === undefined) {
      try {
        return await unseal(await PDFDocument.load(file, { ...extra, password: '' }), file)
      } catch {
        throw new Error(`this PDF is password protected: ${advice}`)
      }
    }
    throw new Error('that password does not open this PDF')
  }
}

/**
 * Open a document for an operation that has no password of its own.
 *
 * Merging, stamping or compressing a file never asks for a password, so this is
 * the loader the rest of the core uses. It matters for one document in
 * particular: a file locked only by a permissions password is fully encrypted
 * yet carries an empty open password, so every reader opens it without
 * prompting. Loading it plainly still raises the library's encryption error,
 * which used to refuse work on a file the person could open by double-clicking
 * it. The retry below is what a reader does.
 *
 * A file whose open password is a real secret still refuses, and says to unlock
 * it first, because that is the command that takes a password.
 *
 * The output is a document with no encryption of its own, which is what
 * modifying a permissions-protected file means anywhere: those restrictions
 * live in a flag a reader chooses to honour, not in the cipher.
 */
export function openPdf(
  file: Uint8Array,
  extra: { updateMetadata?: boolean } = {},
): Promise<PDFDocument> {
  return open(file, undefined, extra, 'unlock it first')
}

/** A part of the document its own encryption dictionary leaves readable. */
export type InTheClear =
  /** Page content, images, fonts: everything held in a stream. */
  | 'streams'
  /** Titles, authors, form values, annotation text: everything held in a string. */
  | 'strings'
  /** The XMP packet, which carries the title and author again. */
  | 'metadata'

export interface Security {
  /** The file carries a security handler at all. */
  encrypted: boolean
  /** A reader would be prompted: the open password is not empty. */
  needsPassword: boolean
  /**
   * What the encryption dictionary declines to encrypt. Empty for a file this
   * tool wrote, and for anything Acrobat writes; a document with entries here
   * is protected in name more than in fact.
   */
  inTheClear: InTheClear[]
}

function nameAt(dict: PDFDict, key: string): string | undefined {
  const value = dict.get(PDFName.of(key))
  return value instanceof PDFName ? value.asString() : undefined
}

/**
 * Which parts of a document its encryption dictionary leaves alone.
 *
 * The format allows ciphertext and plaintext side by side: /StmF and /StrF name
 * the crypt filter each kind of object goes through, and /Identity means none.
 * A file can therefore announce AES-256, prompt for a password, and still carry
 * every page in the clear for anyone with a text editor. That is the shape the
 * PDFex work (Muller et al., ACM CCS 2019) builds its direct-exfiltration
 * attack on, and it is standard-compliant, so no reader complains.
 *
 * Reported rather than repaired: this is what the file says about itself, and a
 * person deciding whether to forward it is owed the true answer.
 */
function whatIsNotEncrypted(pdf: PDFDocument): InTheClear[] {
  const encryption = pdf.context.lookup(pdf.context.trailerInfo.Encrypt)
  if (!(encryption instanceof PDFDict)) return []
  const version = encryption.get(PDFName.of('V'))?.toString()
  // Crypt filters only exist from V4. Before that the one handler covers the
  // whole document, so there is nothing to opt out of.
  if (version !== '4' && version !== '5') return []

  const open: InTheClear[] = []
  // An absent /StmF or /StrF defaults to /Identity, so missing is as clear as
  // saying so.
  if ((nameAt(encryption, 'StmF') ?? '/Identity') === '/Identity') open.push('streams')
  if ((nameAt(encryption, 'StrF') ?? '/Identity') === '/Identity') open.push('strings')
  if (encryption.get(PDFName.of('EncryptMetadata'))?.toString() === 'false') {
    open.push('metadata')
  }
  return open
}

/**
 * Carrying encryption and demanding a password are two different things: a file
 * protected only by a permissions password is fully encrypted yet opens without
 * a prompt, because its open password is empty. Callers need to tell those
 * apart, so this reports both rather than one boolean standing in for two, and
 * says which parts are not encrypted at all.
 */
export async function describeSecurity(file: Uint8Array): Promise<Security> {
  try {
    await PDFDocument.load(file)
    return { encrypted: false, needsPassword: false, inTheClear: [] }
  } catch (error) {
    if (!(error instanceof EncryptedPDFError)) throw error
  }
  // Reading the encryption dictionary needs no password: it is the one part of
  // an encrypted document that has to stay readable.
  const sealed = await PDFDocument.load(file, { ignoreEncryption: true, updateMetadata: false })
  const inTheClear = whatIsNotEncrypted(sealed)
  try {
    await PDFDocument.load(file, { password: '' })
    return { encrypted: true, needsPassword: false, inTheClear }
  } catch {
    return { encrypted: true, needsPassword: true, inTheClear }
  }
}

/** What to tell someone about a document that is only partly encrypted. */
export function clearWarning(parts: InTheClear[]): string | null {
  if (parts.length === 0) return null
  const words: Record<InTheClear, string> = {
    streams: 'its pages, images and fonts',
    strings: 'its title, author and any form values',
    metadata: 'its XMP metadata',
  }
  // Semicolons rather than "and": two of the three phrases already contain one.
  const listed = parts.map((part) => words[part]).join('; ')
  return (
    `this PDF asks for a password but does not encrypt everything. Readable straight ` +
    `out of the file, with no password at all: ${listed}.`
  )
}

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

/**
 * ISO 32000-2 truncates an R6 password to the first 127 bytes of its UTF-8
 * form, so a longer one is not a stronger one: the truncated prefix opens the
 * file just as well, which is measurably true and quietly surprising. Acrobat
 * caps its own field at the same point, so refusing here matches it and keeps
 * the promise the length seems to make.
 */
const MAX_PASSWORD_BYTES = 127

function assertUsablePassword(password: string, what: string): void {
  const bytes = new TextEncoder().encode(password).length
  if (bytes > MAX_PASSWORD_BYTES) {
    throw new Error(
      `the ${what} is ${bytes} bytes, and only the first ${MAX_PASSWORD_BYTES} are used. ` +
        'Shorten it, or the part you cannot see is doing nothing.',
    )
  }
}

/** Acrobat's two dropdowns expand into the individual flags the PDF spec stores. */
function permissionsFor(printing: PrintingLevel, changes: ChangesLevel, copying: boolean) {
  return {
    printing: printing === 'none' ? false : printing === 'low' ? ('lowResolution' as const) : ('highResolution' as const),
    modifying: changes === 'any',
    annotating: changes === 'comments' || changes === 'any',
    fillingForms: changes === 'forms' || changes === 'comments' || changes === 'any',
    documentAssembly: changes === 'assembly' || changes === 'any',
    copying,
    // Acrobat greys this on and locks it for 256-bit AES. Denying a screen
    // reader access to a document is not a restriction worth offering.
    contentAccessibility: true,
  }
}

/**
 * What a set of restrictions will actually be worth once the file leaves.
 *
 * Both answers were confirmed against this tool rather than reasoned about.
 * Neither is a defect being worked around: permissions live in the /P field,
 * which a reader is asked to honour, and anyone who can decrypt the document
 * holds the file encryption key that /P is stored under.
 */
export type Caveat =
  /** No open password, so the file opens for anyone and the restrictions lift with no secret. */
  | 'opensToAnyone'
  /** The recipient's own open password is enough to take the restrictions off. */
  | 'liftableByReader'

/**
 * Callers ask before locking and say so where the choice is being made. A
 * warning in a README is read by nobody in the middle of protecting a file, and
 * having one function answer for both the CLI and the web app is the only way
 * the two cannot end up promising different things.
 */
export function caveat(options: ProtectOptions): Caveat | null {
  const { openPassword, printing = 'high', changes = 'any', copying = true } = options
  const restricted = printing !== 'high' || changes !== 'any' || !copying
  if (!restricted) return null
  return openPassword ? 'liftableByReader' : 'opensToAnyone'
}

/**
 * Encrypt a document, with the restrictions the caller asked for.
 *
 * Four combinations are refused rather than resolved quietly, because each one
 * produces a file that does not do what asking for it suggests: no password at
 * all, the same password for both roles, a password past the 127 bytes R6 uses,
 * and a level outside the two ladders. What is *not* refused is a set of
 * restrictions a reader can lift, which is most of them. Call {@link caveat}
 * first and say so where the choice is being made; this function will write the
 * file either way.
 */
export async function protectPdf(file: Uint8Array, options: ProtectOptions): Promise<Uint8Array> {
  const {
    openPassword,
    permissionsPassword,
    printing = 'high',
    changes = 'any',
    copying = true,
    currentPassword,
  } = options

  if (!openPassword && !permissionsPassword) {
    throw new Error('give an open password, a permissions password, or both')
  }
  if (openPassword && permissionsPassword && openPassword === permissionsPassword) {
    // Acrobat refuses this too. Identical passwords mean anyone who can open the
    // file already holds owner rights, so the restrictions are decoration.
    throw new Error('the open and permissions passwords must be different')
  }
  if (openPassword !== undefined) assertUsablePassword(openPassword, 'open password')
  if (permissionsPassword !== undefined) {
    assertUsablePassword(permissionsPassword, 'permissions password')
  }
  if (!PRINTING_LEVELS.includes(printing)) {
    throw new Error(`printing must be one of: ${PRINTING_LEVELS.join(', ')}`)
  }
  if (!CHANGES_LEVELS.includes(changes)) {
    throw new Error(`changes must be one of: ${CHANGES_LEVELS.join(', ')}`)
  }

  const pdf = await open(file, currentPassword)
  pdf.encrypt({
    // pdf-lib's names are the spec's: user opens, owner overrides.
    userPassword: openPassword ?? '',
    ownerPassword: permissionsPassword ?? openPassword ?? '',
    algorithm: 'AES-256',
    permissions: permissionsFor(printing, changes, copying),
  })
  return pdf.save()
}

/** Open with the password and write the document back out in the clear. */
export async function unlockPdf(file: Uint8Array, password: string): Promise<Uint8Array> {
  const clear = await unseal(await open(file, password, { updateMetadata: false }), file)
  return clear.save()
}
