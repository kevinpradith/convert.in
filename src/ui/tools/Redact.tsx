import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { findText, redactPdf, type RedactionBox } from '../../core/pdf-redact.ts'
import { closeDoc, loadDoc, renderThumbnail } from '../../core/pdf-to-images.ts'
import { humanSize } from '../../core/units.ts'
import { useBatch } from '../batch.tsx'
import { FilePicker } from '../Dropzone.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import {
  Button,
  DownloadIcon,
  Field,
  MarkerIcon,
  PlusIcon,
  Select,
  TextInput,
  cx,
} from '../kit.tsx'
import { useT } from '../i18n.ts'
import { message, newId, stem, toBlob } from '../files.ts'

const ACCEPT = '.pdf'

/** Long edge of each preview. Big enough to draw an accurate box on. */
const PREVIEW_PX = 1100

/**
 * What to rasterise at. 150 is legible on screen and acceptable in print; 300
 * roughly doubles the file for detail a redacted document rarely needs.
 */
const RESOLUTIONS = ['150', '300']

/** Below this a drag is a click that missed, not a rectangle. */
const MINIMUM_DRAG = 0.004

interface Preview {
  id: string
  /** 1-based, matching what the page is called everywhere a person sees it. */
  number: number
  url: string
}

/**
 * Redact PDF: black out what should not be there, and remove it rather than
 * cover it.
 *
 * The two ways of saying where are deliberate. Dragging suits a signature, a
 * photograph or a corner of a scan. Searching suits the case dragging is worst
 * at: a name that appears forty times across nineteen pages, which is a job
 * somebody will get wrong once, and once is all it takes. Searching also works
 * without a pointer, which dragging cannot.
 */
export function Redact() {
  const t = useT()
  const batch = useBatch()
  const [previews, setPreviews] = useState<Preview[]>([])
  const [boxes, setBoxes] = useState<RedactionBox[]>([])
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<number | null>(null)
  const [dpi, setDpi] = useState('150')

  function forgetPreviews() {
    for (const page of previews) URL.revokeObjectURL(page.url)
    setPreviews([])
    setBoxes([])
    setFound(null)
  }

  function clear() {
    batch.clear()
    forgetPreviews()
  }

  async function open(files: File[]) {
    // One document at a time, and the one before it goes. A rectangle is drawn
    // on a particular page of a particular file, so a second document has
    // nothing to inherit: leaving the first loaded meant the previews showed
    // one file while the search read another and the run redacted both.
    batch.clear()
    forgetPreviews()
    const added = await batch.add(files.slice(0, 1))
    if (!added[0]) return
    batch.setBusy(t.redact.reading)
    try {
      const doc = await loadDoc(added[0].bytes)
      try {
        const rendered: Preview[] = []
        for (let number = 1; number <= doc.numPages; number++) {
          batch.setBusy(t.progress(number, doc.numPages))
          rendered.push({
            id: newId(),
            number,
            url: await renderThumbnail(doc, number, PREVIEW_PX),
          })
        }
        // Revoked inside the setter rather than beforehand, so a second file
        // dropped while the first is still rendering cannot leave a list of
        // object URLs behind that nothing will ever release.
        setPreviews((previous) => {
          for (const page of previous) URL.revokeObjectURL(page.url)
          return rendered
        })
      } finally {
        await closeDoc(doc)
      }
    } catch (failure) {
      batch.setError(message(failure))
    } finally {
      batch.setBusy(null)
    }
  }

  async function search() {
    const item = batch.items[0]
    if (!item || query.trim() === '') return
    batch.setBusy(t.redact.searching)
    try {
      const matches = await findText(item.bytes, query)
      setBoxes((previous) => [...previous, ...matches])
      setFound(matches.length)
    } catch (failure) {
      batch.setError(message(failure))
    } finally {
      batch.setBusy(null)
    }
  }

  async function run() {
    await batch.run(async (item) => {
      const bytes = await redactPdf(item.bytes, {
        boxes,
        dpi: Number(dpi),
        onPage: (done, total) => batch.setBusy(t.progress(done, total)),
      })
      return {
        result: {
          blob: toBlob(bytes, 'application/pdf'),
          name: `${stem(item.name)}-redacted.pdf`,
          size: bytes.length,
        },
        note: `${t.batch.done} · ${humanSize(bytes.length)}`,
      }
    }, t.redact.working)
  }

  const loaded = batch.items.length > 0

  return (
    <Workspace
      title={t.tools.redact.label}
      accept={ACCEPT}
      onFiles={(files) => void open(files)}
      error={batch.error}
      busy={batch.busy}
      empty={
        loaded
          ? undefined
          : { icon: <MarkerIcon />, title: t.redact.emptyTitle, hint: t.redact.emptyHint }
      }
      toolbar={
        loaded ? (
          <>
            <FilePicker accept={ACCEPT} onFiles={(files) => void open(files)}>
              <Button>
                <PlusIcon />
                {t.redact.replace}
              </Button>
            </FilePicker>
            <span className="text-muted text-body hidden truncate sm:inline">
              {t.redact.count(boxes.length)}
            </span>
            <Spacer />
            {boxes.length > 0 && (
              <Button variant="ghost" onClick={() => setBoxes([])}>
                {t.redact.clearBoxes}
              </Button>
            )}
            <Button variant="ghost" onClick={clear}>
              {t.clear}
            </Button>
          </>
        ) : undefined
      }
      footer={
        loaded ? (
          <>
            <Field label={t.redact.find}>
              <TextInput
                aria-label={t.redact.findLabel}
                value={query}
                placeholder={t.redact.findPlaceholder}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setFound(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void search()
                }}
                className="w-[160px]"
              />
            </Field>
            <Button onClick={() => void search()} disabled={batch.busy !== null || query.trim() === ''}>
              {t.redact.addMatches}
            </Button>
            {found !== null && (
              <span className="text-muted text-footnote" role="status">
                {t.redact.matches(found)}
              </span>
            )}
            <Field label={t.redact.detail}>
              <Select
                aria-label={t.redact.detailLabel}
                value={dpi}
                onChange={(event) => setDpi(event.target.value)}
              >
                {RESOLUTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} dpi
                  </option>
                ))}
              </Select>
            </Field>
            <Spacer />
            {batch.results.length > 0 && (
              <Button onClick={() => void batch.download()}>
                <DownloadIcon />
                {t.batch.download(batch.results.length)}
              </Button>
            )}
            <Button variant="primary" onClick={() => void run()} disabled={batch.busy !== null}>
              {batch.busy ?? t.redact.run}
            </Button>
          </>
        ) : undefined
      }
    >
      {loaded && (
        <div className="mx-auto flex max-w-[820px] flex-col gap-6 p-5 sm:p-8">
          <p className="bg-fill text-body rounded-card px-3 py-2 leading-relaxed">
            {t.redact.notice}
          </p>
          {previews.map((page) => (
            <PageSheet
              key={page.id}
              page={page}
              boxes={boxes.filter((box) => box.page === page.number)}
              onAdd={(box) => setBoxes((previous) => [...previous, box])}
              onRemove={(box) => setBoxes((previous) => previous.filter((one) => one !== box))}
            />
          ))}
        </div>
      )}
    </Workspace>
  )
}

/**
 * One page, with whatever is being blacked out on it.
 *
 * The rectangles are held as fractions of the page rather than pixels, so the
 * preview can be any size the window gives it and the same numbers still mean
 * the same part of the page when it is rendered at 300 dpi.
 */
function PageSheet({
  page,
  boxes,
  onAdd,
  onRemove,
}: {
  page: Preview
  boxes: RedactionBox[]
  onAdd: (box: RedactionBox) => void
  onRemove: (box: RedactionBox) => void
}) {
  const t = useT()
  const sheet = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(
    null,
  )

  function at(event: ReactPointerEvent): { x: number; y: number } {
    const area = sheet.current?.getBoundingClientRect()
    if (!area || area.width === 0 || area.height === 0) return { x: 0, y: 0 }
    return {
      x: Math.max(0, Math.min(1, (event.clientX - area.left) / area.width)),
      y: Math.max(0, Math.min(1, (event.clientY - area.top) / area.height)),
    }
  }

  function begin(event: ReactPointerEvent) {
    // Only the primary button draws, so a right click still opens the menu.
    if (event.button !== 0) return
    const start = at(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ fromX: start.x, fromY: start.y, toX: start.x, toY: start.y })
  }

  function finish() {
    if (drag === null) return
    const x = Math.min(drag.fromX, drag.toX)
    const y = Math.min(drag.fromY, drag.toY)
    const width = Math.abs(drag.toX - drag.fromX)
    const height = Math.abs(drag.toY - drag.fromY)
    setDrag(null)
    // A drag this small is a click that missed a box, not a rectangle.
    if (width < MINIMUM_DRAG || height < MINIMUM_DRAG) return
    onAdd({ page: page.number, x, y, width, height })
  }

  const drawing =
    drag === null
      ? null
      : {
          left: `${Math.min(drag.fromX, drag.toX) * 100}%`,
          top: `${Math.min(drag.fromY, drag.toY) * 100}%`,
          width: `${Math.abs(drag.toX - drag.fromX) * 100}%`,
          height: `${Math.abs(drag.toY - drag.fromY) * 100}%`,
        }

  return (
    <figure className="flex flex-col gap-2">
      <div
        ref={sheet}
        className="ring-line relative touch-none rounded-card ring-1 select-none"
        onPointerDown={begin}
        onPointerMove={(event) => {
          if (drag === null) return
          const now = at(event)
          setDrag((previous) => (previous ? { ...previous, toX: now.x, toY: now.y } : previous))
        }}
        onPointerUp={finish}
        onPointerCancel={() => setDrag(null)}
      >
        <img
          src={page.url}
          alt={t.export.pageLabel(page.number)}
          draggable={false}
          className="block w-full rounded-card"
        />
        {boxes.map((box, index) => (
          <button
            key={index}
            type="button"
            // Focusable and pressable, so a page can be corrected without a
            // pointer once the search has put the rectangles there.
            aria-label={t.redact.removeBox(page.number)}
            onClick={() => onRemove(box)}
            onPointerDown={(event) => event.stopPropagation()}
            className={cx(
              'absolute cursor-pointer bg-black',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            )}
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          />
        ))}
        {drawing && <div className="absolute bg-black/70" style={drawing} />}
      </div>
      <figcaption className="text-muted text-footnote flex items-center gap-3">
        <span>{t.export.pageLabel(page.number)}</span>
        <button
          type="button"
          className="py-1 underline underline-offset-2"
          onClick={() => onAdd({ page: page.number, x: 0, y: 0, width: 1, height: 1 })}
        >
          {t.redact.wholePage}
        </button>
      </figcaption>
    </figure>
  )
}
