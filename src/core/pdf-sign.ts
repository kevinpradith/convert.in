import { degrees, PDFDocument } from '@cantoo/pdf-lib'
import { CORNERS, displayedSize, placeOnPage, turnOf, type Corner } from './pdf-stamp.ts'
import { resolvePages } from './pdf-pages.ts'
import { sniff } from './images.ts'

/**
 * Putting a signature image onto a page.
 *
 * Worth being exact about what this is: it draws a picture of a signature onto
 * the page, the way signing a printout and scanning it back does. It is not a
 * cryptographic signature, so it proves nothing about who signed or whether the
 * document changed afterwards. That is a different feature with a different
 * name, it needs a certificate, and calling this one "signing" without saying
 * so would let someone believe they had a guarantee they do not have.
 *
 * It is still the thing people actually want most days, because the other party
 * wants a signature that looks like theirs on a form, and a signature is exactly
 * the page nobody should be uploading to a stranger's server to get it.
 */

export interface SignOptions {
  /** PNG or JPEG. A drawn signature should be a PNG, so the paper shows through. */
  signature: Uint8Array
  /** Where on the page it sits. */
  position?: Corner
  /**
   * Width on the page in PDF points, 72 to the inch. The height follows the
   * image's own proportions, because a stretched signature reads as a forgery.
   */
  width?: number
  /** Distance from the page edges, in points. */
  margin?: number
  /** 0-based page indices. Omit for the last page, which is where a form signs. */
  pages?: number[]
}

/**
 * Draw the signature and hand back the document.
 *
 * The default is the last page rather than every page: a contract is signed at
 * the end, and stamping all forty pages is a mistake that is tedious to undo
 * once the file has been sent.
 */
export async function signPdf(file: Uint8Array, options: SignOptions): Promise<Uint8Array> {
  const { signature, position = 'bottom-right', width = 150, margin = 36, pages } = options

  const kind = sniff(signature)
  if (kind !== 'png' && kind !== 'jpeg') {
    throw new Error('the signature has to be a PNG or a JPEG')
  }
  if (!CORNERS.includes(position)) {
    throw new Error(`position must be one of: ${CORNERS.join(', ')}`)
  }
  if (!(width > 0)) throw new Error('the signature width must be above 0')
  if (!(margin >= 0)) throw new Error('margin must be 0 or more')

  const pdf = await PDFDocument.load(file)
  const image = kind === 'png' ? await pdf.embedPng(signature) : await pdf.embedJpg(signature)
  const total = pdf.getPageCount()
  const targets = resolvePages(total, pages ?? [total - 1])

  const height = (image.height / image.width) * width
  const [vertical, horizontal] = position.split('-')

  for (const index of targets) {
    const page = pdf.getPage(index)
    // The page as the reader sees it. A portrait scan turned a quarter is a
    // landscape page, and both the corner and the room available follow from
    // that rather than from the box the file stores.
    const size = displayedSize(page)
    const u =
      horizontal === 'left'
        ? margin
        : horizontal === 'right'
          ? size.width - margin - width
          : (size.width - width) / 2
    const v = vertical === 'top' ? size.height - margin - height : margin
    // The exact question, rather than a rule of thumb: does the signature sit
    // inside the page where it has been asked to go. Doubling the margin
    // refused a centred signature that fits perfectly well.
    if (u < 0 || v < 0 || u + width > size.width || v + height > size.height) {
      throw new Error(
        `the signature is ${Math.round(width)}x${Math.round(height)}pt and does not fit on a ` +
          `${Math.round(size.width)}x${Math.round(size.height)}pt page with a ${margin}pt margin`,
      )
    }
    page.drawImage(image, {
      ...placeOnPage(page, u, v),
      rotate: degrees(turnOf(page)),
      width,
      height,
    })
  }
  return pdf.save()
}
