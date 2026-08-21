import { EncryptedPDFError, PDFDocument, PDFRef } from '@cantoo/pdf-lib'

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

/** Open a document, turning the library's encryption errors into readable ones. */
async function open(
  file: Uint8Array,
  password?: string,
  extra: { updateMetadata?: boolean } = {},
): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(
      file,
      password === undefined ? extra : { ...extra, password },
    )
  } catch (error) {
    // A wrong password does not come back as EncryptedPDFError: the cipher
    // itself rejects it, with a message rather than a type.
    const wrongPassword = error instanceof Error && /password incorrect/i.test(error.message)
    if (error instanceof EncryptedPDFError || wrongPassword) {
      throw new Error(
        password === undefined
          ? 'this PDF is password protected: supply the password to open it'
          : 'that password does not open this PDF',
      )
    }
    throw error
  }
}

export interface Security {
  /** The file carries a security handler at all. */
  encrypted: boolean
  /** A reader would be prompted: the open password is not empty. */
  needsPassword: boolean
}

/**
 * Carrying encryption and demanding a password are two different things: a file
 * protected only by a permissions password is fully encrypted yet opens without
 * a prompt, because its open password is empty. Callers need to tell those
 * apart, so this reports both rather than one boolean standing in for two.
 */
export async function describeSecurity(file: Uint8Array): Promise<Security> {
  try {
    await PDFDocument.load(file)
    return { encrypted: false, needsPassword: false }
  } catch (error) {
    if (!(error instanceof EncryptedPDFError)) throw error
  }
  try {
    await PDFDocument.load(file, { password: '' })
    return { encrypted: true, needsPassword: false }
  } catch {
    return { encrypted: true, needsPassword: true }
  }
}

/**
 * The library reports encryption with a message aimed at its own callers. Every
 * entry point that loads a PDF can hit it, so the translation lives here rather
 * than being repeated at each one.
 */
export function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/document to `PDFDocument.load` is encrypted/i.test(message)) {
    return 'this PDF is password protected: unlock it first'
  }
  return message
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

/**
 * Open with the password and write the document back out in the clear.
 *
 * Two things have to be repaired by hand. The decrypting re-parse loses the
 * trailer's /Info reference, so title, author, subject and keywords would
 * silently vanish. And the library only stops pointing at the encryption
 * dictionary; the object itself stays in the context and gets written out as an
 * orphan, which is enough for a reader that scans for /Encrypt to call the
 * unlocked file locked. Both are read back from an undecrypted parse of the same
 * bytes, where the object numbers are identical.
 */
export async function unlockPdf(file: Uint8Array, password: string): Promise<Uint8Array> {
  const clear = await open(file, password, { updateMetadata: false })
  const sealed = await PDFDocument.load(file, { ignoreEncryption: true, updateMetadata: false })

  const info = sealed.context.trailerInfo.Info
  if (clear.context.trailerInfo.Info === undefined && info !== undefined) {
    clear.context.trailerInfo.Info = info
  }

  const encryption = sealed.context.trailerInfo.Encrypt
  if (encryption instanceof PDFRef) clear.context.delete(encryption)

  return clear.save()
}
