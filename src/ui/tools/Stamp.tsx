import { useState } from 'react'
import { closeDoc, loadDoc, renderThumbnail } from '../../core/pdf-to-images.ts'
import { numberPages, watermarkPdf, type Corner } from '../../core/pdf-stamp.ts'
import { FilePicker } from '../Dropzone.tsx'
import { PageGrid, type Tile } from '../PageGrid.tsx'
import { RangeSelect } from '../RangeSelect.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import { Button, DownloadIcon, Field, PlusIcon, Segmented, Select, StampIcon, TextInput } from '../kit.tsx'
import { useT } from '../i18n.ts'
import { message, newId, readBytes, save, stem, toBlob } from '../files.ts'

const ACCEPT = '.pdf'

type Mode = 'watermark' | 'numbers'

interface Loaded {
  name: string
  bytes: Uint8Array
  pages: { id: string; index: number; url: string }[]
}

export function Stamp() {
  const t = useT()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function clear() {
    for (const page of loaded?.pages ?? []) URL.revokeObjectURL(page.url)
    setLoaded(null)
    setSelected(new Set())
  }

  async function open(files: File[]) {
    const file = files[0]
    if (!file) return
    clear()
    setError(null)
    setBusy(true)
    try {
      const bytes = await readBytes(file)
      const doc = await loadDoc(bytes)
      try {
        const pages = []
        for (let number = 1; number <= doc.numPages; number++) {
          pages.push({
            id: newId(),
            index: number - 1,
            url: await renderThumbnail(doc, number),
          })
        }
        setLoaded({ name: file.name, bytes, pages })
      } finally {
        await closeDoc(doc)
      }
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
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
    if (!loaded) return
    setBusy(true)
    setError(null)
    try {
      // No selection means the whole document, which is what the core call
      // already understands as "pages omitted".
      const pages =
        selected.size === 0
          ? undefined
          : loaded.pages.filter((page) => selected.has(page.id)).map((page) => page.index)
      const pdf =
        mode === 'watermark'
          ? await watermarkPdf(loaded.bytes, {
              text,
              opacity: Number(opacity),
              angleDegrees: Number(angle),
              size: textSize.trim() === '' ? undefined : Number(textSize),
              pages,
            })
          : await numberPages(loaded.bytes, {
              position,
              start: Number(start),
              format,
              size: textSize.trim() === '' ? undefined : Number(textSize),
              margin: Number(margin),
              pages,
            })
      save(toBlob(pdf, 'application/pdf'), `${stem(loaded.name)}-stamped.pdf`)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  const tiles: Tile[] = (loaded?.pages ?? []).map((page) => ({
    id: page.id,
    url: page.url,
    caption: t.export.pageLabel(page.index + 1),
  }))

  return (
    <Workspace
      title={t.tools.stamp.label}
      accept={ACCEPT}
      onFiles={open}
      error={error}
      empty={
        loaded
          ? undefined
          : { icon: <StampIcon />, title: t.stamp.emptyTitle, hint: t.stamp.emptyHint }
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
              {loaded.name} · {t.export.pages(loaded.pages.length)}
            </span>
            <Spacer />
            <RangeSelect
              total={loaded.pages.length}
              onSelect={(indices) =>
                setSelected(new Set(indices.map((index) => loaded.pages[index]!.id)))
              }
            />
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
            <Button variant="primary" className="ml-auto" onClick={apply} disabled={busy}>
              <DownloadIcon />
              {busy ? t.stamp.working : t.stamp.save}
            </Button>
          </>
        ) : undefined
      }
    >
      <>
        <p className="text-muted text-footnote px-5 pt-4">
          {selected.size === 0 ? t.stamp.allPages : t.stamp.somePages(selected.size)}
        </p>
        <PageGrid tiles={tiles} selected={selected} onToggle={toggle} />
      </>
    </Workspace>
  )
}
