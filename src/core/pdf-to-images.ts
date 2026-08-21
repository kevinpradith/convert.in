import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist'

/**
 * Browser-only: pdf.js rasterises through a real <canvas>. The page-level tools
 * in ./pdf-pages.ts stay portable; only rendering needs a DOM.
 */

export interface RenderOptions {
  /** 1 = 72dpi. 2 is a good screen default, 4 is roughly print quality. */
  scale?: number
  type?: 'image/png' | 'image/jpeg'
  /** JPEG only, 0..1. */
  quality?: number
  /** 1-based page numbers; omit for every page. */
  pages?: number[]
}

/**
 * pdf.js takes ownership of the buffer it is handed and detaches it, which
 * silently empties the caller's Uint8Array. Hand it a copy instead.
 */
export function loadDoc(file: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({ data: file.slice() }).promise
}

/**
 * Release the document and its worker slot. The teardown lives on the loading
 * task rather than on the document, so callers should not reach for it directly.
 */
export function closeDoc(doc: PDFDocumentProxy): Promise<void> {
  return doc.loadingTask.destroy()
}

export async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale = 1,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, viewport }).promise
  return canvas
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas could not be encoded'))),
      type,
      quality,
    )
  })
}

/** Rasterise a PDF to one image per page. */
export async function pdfToImages(
  file: Uint8Array,
  options: RenderOptions = {},
): Promise<Blob[]> {
  const { scale = 2, type = 'image/png', quality = 0.92, pages } = options
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('scale must be a number > 0')

  const doc = await loadDoc(file)
  try {
    const numbers = pages ?? Array.from({ length: doc.numPages }, (_, i) => i + 1)
    const images: Blob[] = []
    for (const pageNumber of numbers) {
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.numPages) {
        throw new Error(`page ${pageNumber} is out of range (document has ${doc.numPages} pages)`)
      }
      const canvas = await renderPage(doc, pageNumber, scale)
      images.push(await canvasToBlob(canvas, type, type === 'image/jpeg' ? quality : undefined))
      // Free the backing store now rather than waiting for GC; a 40-page render
      // otherwise holds every full-size canvas in memory at once.
      canvas.width = 0
      canvas.height = 0
    }
    return images
  } finally {
    await closeDoc(doc)
  }
}

/**
 * Small preview of a page, long edge capped at `maxPx`.
 * The caller owns the returned object URL and must revoke it.
 */
export async function renderThumbnail(
  doc: PDFDocumentProxy,
  pageNumber: number,
  maxPx = 240,
): Promise<string> {
  const base = (await doc.getPage(pageNumber)).getViewport({ scale: 1 })
  const canvas = await renderPage(doc, pageNumber, maxPx / Math.max(base.width, base.height))
  const blob = await canvasToBlob(canvas, 'image/png')
  canvas.width = 0
  canvas.height = 0
  return URL.createObjectURL(blob)
}
