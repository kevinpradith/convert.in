import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { signPdf } from '../../core/pdf-sign.ts'
import { CORNERS, type Corner } from '../../core/pdf-stamp.ts'
import { pageCount } from '../../core/pdf-pages.ts'
import { canvasToBlob } from '../../core/pdf-to-images.ts'
import { FilePicker } from '../Dropzone.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import {
  Button,
  DownloadIcon,
  Field,
  PlusIcon,
  Segmented,
  Select,
  SignIcon,
  Slider,
} from '../kit.tsx'
import { useT } from '../i18n.ts'
import { message, readBytes, save, stem, toBlob } from '../files.ts'

const ACCEPT = '.pdf'
const SIGNATURE_ACCEPT = '.png,.jpg,.jpeg'

/**
 * The drawing surface, in device pixels. Wider than it is tall because that is
 * the shape of a signature, and large enough that the drawn line still has
 * detail once it is scaled down to 150pt on the page.
 */
const PAD_WIDTH = 900
const PAD_HEIGHT = 300

interface Loaded {
  name: string
  bytes: Uint8Array
  pages: number
}

type Source = 'draw' | 'image'

export function Sign() {
  const t = useT()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [source, setSource] = useState<Source>('draw')
  const [drawn, setDrawn] = useState(false)
  const [uploaded, setUploaded] = useState<{ bytes: Uint8Array; url: string } | null>(null)
  const [position, setPosition] = useState<Corner>('bottom-right')
  const [width, setWidth] = useState(150)
  const [page, setPage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pad = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  async function open(files: File[]) {
    const file = files[0]
    if (!file) return
    setError(null)
    setBusy(t.sign.working)
    try {
      const bytes = await readBytes(file)
      setLoaded({ name: file.name, bytes, pages: await pageCount(bytes) })
      setPage('')
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(null)
    }
  }

  function context(): CanvasRenderingContext2D | null {
    return pad.current?.getContext('2d') ?? null
  }

  /**
   * Pointer events rather than mouse or touch: one set of handlers covers a
   * mouse, a finger and a stylus, and a stylus is what most people sign with.
   */
  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = pad.current
    const ink = context()
    if (!canvas || !ink) return
    // Capture, so a stroke that leaves the canvas mid-signature still lands.
    canvas.setPointerCapture(event.pointerId)
    drawing.current = true
    ink.lineWidth = 5
    ink.lineCap = 'round'
    ink.lineJoin = 'round'
    ink.strokeStyle = '#111111'
    ink.beginPath()
    const { x, y } = at(event, canvas)
    ink.moveTo(x, y)
  }

  /** Pointer position in canvas pixels, which the CSS size does not give. */
  function at(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
    const box = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - box.left) / box.width) * canvas.width,
      y: ((event.clientY - box.top) / box.height) * canvas.height,
    }
  }

  function extend(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = pad.current
    const ink = context()
    if (!drawing.current || !canvas || !ink) return
    const { x, y } = at(event, canvas)
    ink.lineTo(x, y)
    ink.stroke()
    if (!drawn) setDrawn(true)
  }

  function stop() {
    drawing.current = false
  }

  function wipe() {
    const canvas = pad.current
    context()?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0)
    setDrawn(false)
  }

  function useImage(files: File[]) {
    const file = files[0]
    if (!file) return
    setError(null)
    void (async () => {
      try {
        if (uploaded) URL.revokeObjectURL(uploaded.url)
        setUploaded({ bytes: await readBytes(file), url: URL.createObjectURL(file) })
      } catch (failure) {
        setError(message(failure))
      }
    })()
  }

  /** The signature as PNG bytes, whichever way it was made. */
  async function signature(): Promise<Uint8Array | null> {
    if (source === 'image') return uploaded?.bytes ?? null
    const canvas = pad.current
    if (!canvas || !drawn) return null
    // The canvas never gets a background, so the PNG carries the ink on
    // transparency and the page shows through around the strokes.
    return new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer())
  }

  async function run() {
    if (!loaded) return
    setError(null)
    const mark = await signature()
    if (mark === null) {
      setError(t.sign.needSignature)
      return
    }
    setBusy(t.sign.working)
    try {
      const signed = await signPdf(loaded.bytes, {
        signature: mark,
        position,
        width,
        ...(page === '' ? {} : { pages: [Number(page) - 1] }),
      })
      save(toBlob(signed, 'application/pdf'), `${stem(loaded.name)}-signed.pdf`)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Workspace
      title={t.tools.sign.label}
      accept={ACCEPT}
      onFiles={open}
      error={error}
      busy={busy}
      empty={
        loaded ? undefined : { icon: <SignIcon />, title: t.sign.emptyTitle, hint: t.sign.emptyHint }
      }
      toolbar={
        loaded ? (
          <>
            <FilePicker accept={ACCEPT} onFiles={open}>
              <Button>
                <PlusIcon />
                {t.export.open}
              </Button>
            </FilePicker>
            <span className="text-muted text-body hidden truncate sm:inline">
              {loaded.name} · {t.export.pages(loaded.pages)}
            </span>
            <Spacer />
            <Segmented
              label={t.tools.sign.label}
              value={source}
              onChange={setSource}
              options={[
                { value: 'draw', label: t.sign.draw },
                { value: 'image', label: t.sign.upload },
              ]}
            />
          </>
        ) : undefined
      }
      footer={
        loaded ? (
          <>
            <Field label={t.sign.where}>
              <Select
                aria-label={t.sign.where}
                value={position}
                onChange={(event) => setPosition(event.target.value as Corner)}
              >
                {CORNERS.map((corner) => (
                  <option key={corner} value={corner}>
                    {corner}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.sign.onPage}>
              <Select
                aria-label={t.sign.onPage}
                value={page}
                onChange={(event) => setPage(event.target.value)}
              >
                <option value="">{t.sign.lastPage}</option>
                {Array.from({ length: loaded.pages }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {t.export.pageLabel(i + 1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.sign.width}>
              <Slider label={t.sign.width} value={width} onChange={setWidth} min={40} max={400} />
            </Field>
            <Spacer />
            <Button variant="primary" onClick={run} disabled={busy !== null}>
              <DownloadIcon />
              {busy ?? t.sign.run}
            </Button>
          </>
        ) : undefined
      }
    >
      {loaded && (
        <div className="mx-auto flex max-w-[640px] flex-col gap-4 p-5 sm:p-8">
          {/* Said next to the control rather than in a footnote: someone reaching
              for this is often about to rely on it meaning more than it does. */}
          <p className="bg-fill text-body rounded-card px-3 py-2 leading-relaxed">
            {t.sign.notCrypto}
          </p>

          {source === 'draw' ? (
            <>
              <canvas
                ref={pad}
                width={PAD_WIDTH}
                height={PAD_HEIGHT}
                aria-label={t.sign.drawHere}
                onPointerDown={start}
                onPointerMove={extend}
                onPointerUp={stop}
                onPointerCancel={stop}
                className="ring-line bg-surface aspect-[3/1] w-full touch-none rounded-card ring-1"
              />
              <div className="flex items-center gap-3">
                <span className="text-muted text-caption">{t.sign.drawHere}</span>
                <Spacer />
                <Button variant="ghost" onClick={wipe} disabled={!drawn}>
                  {t.sign.clearDrawing}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <FilePicker accept={SIGNATURE_ACCEPT} onFiles={useImage}>
                <Button>
                  <PlusIcon />
                  {t.sign.upload}
                </Button>
              </FilePicker>
              {uploaded && (
                <img
                  src={uploaded.url}
                  alt=""
                  className="ring-line bg-surface max-h-40 rounded-card object-contain p-2 ring-1"
                />
              )}
            </div>
          )}
        </div>
      )}
    </Workspace>
  )
}
