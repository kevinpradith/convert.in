import { useState } from 'react'
import { closeDoc, loadDoc, renderThumbnail } from '../../core/pdf-to-images.ts'
import { numberPages, watermarkPdf, type Corner } from '../../core/pdf-stamp.ts'
import { humanSize } from '../../core/units.ts'
import { FileList, useBatch } from '../batch.tsx'
import { FilePicker } from '../Dropzone.tsx'
import { PageGrid, type Tile } from '../PageGrid.tsx'
import { RangeSelect } from '../RangeSelect.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import {
  Button,
  DownloadIcon,
  Field,
  PlusIcon,
  Segmented,
  Select,
  StampIcon,
  TextInput,
} from '../kit.tsx'
import { useT } from '../i18n.ts'
import { message, newId, stem, toBlob } from '../files.ts'

const ACCEPT = '.pdf'

type Mode = 'watermark' | 'numbers'

interface Thumbnail {
  id: string
  index: number
  url: string
}

export function Stamp() {
  const t = useT()
  const batch = useBatch()
  /**
   * Previews of the one document, so pages can be picked out. Empty once a
   * second file arrives: page 3 of one file is not page 3 of the next, and
   * rendering every page of a folder costs more than it tells anyone.
   */
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [mode, setMode] = useState<Mode>('watermark')
  const [text, setText] = useState('DRAFT')
  const [opacity, setOpacity] = useState('0.12')
  const [angle, setAngle] = useState('45')
  const [position, setPosition] = useState<Corner>('bottom-center')
  const [start, setStart] = useState('1')
  const [format, setFormat] = useState('{n}')
  const [textSize, setTextSize] = useState('')
  const [margin, setMargin] = useState('28')

  function forgetThumbnails() {
    for (const page of thumbnails) URL.revokeObjectURL(page.url)
    setThumbnails([])
    setSelected(new Set())
  }

  function clear() {
    batch.clear()
    forgetThumbnails()
  }

  async function open(files: File[]) {
    const added = await batch.add(files)
    const total = batch.items.length + added.length
    forgetThumbnails()
    if (total !== 1 || !added[0]) return
    batch.setBusy(t.stamp.working)
    try {
      const doc = await loadDoc(added[0].bytes)
      try {
        const rendered: Thumbnail[] = []
        for (let number = 1; number <= doc.numPages; number++) {
          batch.setBusy(t.progress(number, doc.numPages))
          rendered.push({ id: newId(), index: number - 1, url: await renderThumbnail(doc, number) })
        }
        // Revoked inside the setter rather than beforehand, so a second file
        // dropped while the first is still rendering cannot leave a list of
        // object URLs behind that nothing will ever release.
        setThumbnails((previous) => {
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

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function apply() {
    // No selection means the whole document, which is what the core call
    // already understands as "pages omitted". Across several files there is no
    // selection to make, so every page of each is what gets stamped.
    const pages =
      selected.size === 0
        ? undefined
        : thumbnails.filter((page) => selected.has(page.id)).map((page) => page.index)
    await batch.run(async (item) => {
      const pdf =
        mode === 'watermark'
          ? await watermarkPdf(item.bytes, {
              text,
              opacity: Number(opacity),
              angleDegrees: Number(angle),
              size: textSize.trim() === '' ? undefined : Number(textSize),
              pages,
            })
          : await numberPages(item.bytes, {
              position,
              start: Number(start),
              format,
              size: textSize.trim() === '' ? undefined : Number(textSize),
              margin: Number(margin),
              pages,
            })
      return {
        result: {
          blob: toBlob(pdf, 'application/pdf'),
          name: `${stem(item.name)}-stamped.pdf`,
          size: pdf.length,
        },
        note: `${t.batch.done} · ${humanSize(pdf.length)}`,
      }
    }, t.stamp.working)
  }

  const loaded = batch.items.length > 0
  const tiles: Tile[] = thumbnails.map((page) => ({
    id: page.id,
    url: page.url,
    caption: t.export.pageLabel(page.index + 1),
  }))

  return (
    <Workspace
      title={t.tools.stamp.label}
      accept={ACCEPT}
      onFiles={(files) => void open(files)}
      error={batch.error}
      busy={batch.busy}
      empty={
        loaded
          ? undefined
          : { icon: <StampIcon />, title: t.stamp.emptyTitle, hint: t.stamp.emptyHint }
      }
      toolbar={
        loaded ? (
          <>
            <FilePicker accept={ACCEPT} onFiles={(files) => void open(files)}>
              <Button>
                <PlusIcon />
                {t.batch.add}
              </Button>
            </FilePicker>
            <span className="text-muted text-body hidden truncate sm:inline">
              {t.batch.count(batch.items.length)}
            </span>
            <Spacer />
            {thumbnails.length > 0 && (
              <RangeSelect
                total={thumbnails.length}
                onSelect={(indices) =>
                  setSelected(new Set(indices.map((index) => thumbnails[index]!.id)))
                }
              />
            )}
            <Segmented
              label={t.tools.stamp.label}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'watermark', label: t.stamp.watermark },
                { value: 'numbers', label: t.stamp.numbers },
              ]}
            />
            <Button variant="ghost" onClick={clear}>
              {t.clear}
            </Button>
          </>
        ) : undefined
      }
      footer={
        loaded ? (
          <>
            {mode === 'watermark' ? (
              <>
                <Field label={t.stamp.text}>
                  <TextInput
                    aria-label={t.stamp.text}
                    value={text}
                    placeholder={t.stamp.textPlaceholder}
                    onChange={(event) => setText(event.target.value)}
                    className="w-[150px]"
                  />
                </Field>
                <Field label={t.stamp.opacity}>
                  <TextInput
                    aria-label={t.stamp.opacity}
                    type="number"
                    min="0.02"
                    max="1"
                    step="0.02"
                    value={opacity}
                    onChange={(event) => setOpacity(event.target.value)}
                    className="w-[78px]"
                  />
                </Field>
                <Field label={t.stamp.angle}>
                  <TextInput
                    aria-label={t.stamp.angle}
                    type="number"
                    step="5"
                    value={angle}
                    onChange={(event) => setAngle(event.target.value)}
                    className="w-[78px]"
                  />
                </Field>
                <Field label={t.stamp.textSize}>
                  <TextInput
                    aria-label={t.stamp.textSize}
                    type="number"
                    min="1"
                    placeholder={t.stamp.textSizeAuto}
                    value={textSize}
                    onChange={(event) => setTextSize(event.target.value)}
                    className="w-[86px]"
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label={t.stamp.position}>
                  <Select
                    aria-label={t.stamp.position}
                    value={position}
                    onChange={(event) => setPosition(event.target.value as Corner)}
                  >
                    <option value="bottom-center">↓ ·</option>
                    <option value="bottom-left">↓ ←</option>
                    <option value="bottom-right">↓ →</option>
                    <option value="top-center">↑ ·</option>
                    <option value="top-left">↑ ←</option>
                    <option value="top-right">↑ →</option>
                  </Select>
                </Field>
                <Field label={t.stamp.start}>
                  <TextInput
                    aria-label={t.stamp.start}
                    type="number"
                    step="1"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    className="w-[70px]"
                  />
                </Field>
                <Field label={t.stamp.format}>
                  <TextInput
                    aria-label={t.stamp.format}
                    value={format}
                    onChange={(event) => setFormat(event.target.value)}
                    className="w-[110px]"
                  />
                </Field>
                <Field label={t.stamp.textSize}>
                  <TextInput
                    aria-label={t.stamp.textSize}
                    type="number"
                    min="1"
                    placeholder="10"
                    value={textSize}
                    onChange={(event) => setTextSize(event.target.value)}
                    className="w-[80px]"
                  />
                </Field>
                <Field label={t.stamp.margin}>
                  <TextInput
                    aria-label={t.stamp.margin}
                    type="number"
                    min="0"
                    value={margin}
                    onChange={(event) => setMargin(event.target.value)}
                    className="w-[80px]"
                  />
                </Field>
              </>
            )}
            <Spacer />
            {batch.results.length > 0 && (
              <Button onClick={() => void batch.download()}>
                <DownloadIcon />
                {t.batch.download(batch.results.length)}
              </Button>
            )}
            <Button variant="primary" onClick={() => void apply()} disabled={batch.busy !== null}>
              {batch.busy ?? t.stamp.save}
            </Button>
          </>
        ) : undefined
      }
    >
      <>
        <p className="text-muted text-footnote mx-auto w-full max-w-[720px] px-5 pt-4">
          {thumbnails.length === 0
            ? t.batch.everyPage
            : selected.size === 0
              ? t.stamp.allPages
              : t.stamp.somePages(selected.size)}
        </p>
        {thumbnails.length > 0 ? (
          <PageGrid tiles={tiles} selected={selected} onToggle={toggle} />
        ) : (
          <FileList items={batch.items} onRemove={batch.remove} />
        )}
      </>
    </Workspace>
  )
}
