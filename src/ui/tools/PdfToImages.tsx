import { useState } from 'react'
import { closeDoc, loadDoc, pdfToImages, renderThumbnail } from '../../core/pdf-to-images.ts'
import { FilePicker } from '../Dropzone.tsx'
import { PageGrid, type Tile } from '../PageGrid.tsx'
import { RangeSelect } from '../RangeSelect.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import { Button, DownloadIcon, ExportIcon, Field, PlusIcon, Segmented } from '../kit.tsx'
import { useT } from '../i18n.ts'
import { message, newId, numbered, readBytes, saveAll, stem, useOnce } from '../files.ts'

const ACCEPT = '.pdf'

type Format = 'image/png' | 'image/jpeg'

interface Loaded {
  name: string
  bytes: Uint8Array
  pages: { id: string; number: number; url: string }[]
}

export function PdfToImages() {
  const t = useT()
  // Two clicks inside one frame both reach the handler, and this one saves a
  // file per page: a double click on a forty-page export asks for eighty.
  const once = useOnce()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [format, setFormat] = useState<Format>('image/png')
  const [scale, setScale] = useState('2')
  const [busy, setBusy] = useState<string | null>(null)
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
    setBusy(t.export.reading)
    try {
      const bytes = await readBytes(file)
      const doc = await loadDoc(bytes)
      try {
        const pages = []
        for (let number = 1; number <= doc.numPages; number++) {
          setBusy(t.progress(number, doc.numPages))
          pages.push({ id: newId(), number, url: await renderThumbnail(doc, number) })
        }
        setLoaded({ name: file.name, bytes, pages })
      } finally {
        await closeDoc(doc)
      }
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(null)
    }
  }

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function exportImages() {
    if (!loaded) return
    await once(async () => {
      setBusy(t.export.rendering)
      setError(null)
      try {
        const chosen =
          selected.size > 0 ? loaded.pages.filter((page) => selected.has(page.id)) : loaded.pages
        const images = await pdfToImages(loaded.bytes, {
          scale: Number(scale),
          type: format,
          pages: chosen.map((page) => page.number),
          onPage: (done, total) => setBusy(t.progress(done, total)),
        })
        const extension = format === 'image/png' ? 'png' : 'jpg'
        const base = stem(loaded.name)
        await saveAll(
          images.map((blob, index) => ({
            blob,
            name: `${numbered(base, index, images.length)}.${extension}`,
          })),
        )
      } catch (failure) {
        setError(message(failure))
      } finally {
        setBusy(null)
      }
    })
  }

  const tiles: Tile[] = (loaded?.pages ?? []).map((page) => ({
    id: page.id,
    url: page.url,
    caption: t.export.pageLabel(page.number),
  }))

  const count = selected.size > 0 ? selected.size : (loaded?.pages.length ?? 0)

  return (
    <Workspace
      title={t.tools.export.label}
      accept={ACCEPT}
      onFiles={open}
      error={error}
      busy={busy}
      empty={
        loaded
          ? undefined
          : { icon: <ExportIcon />, title: t.export.emptyTitle, hint: t.export.emptyHint }
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
              onSelect={(indices) => setSelected(new Set(indices.map((i) => loaded.pages[i]!.id)))}
            />
            <Button
              variant="ghost"
              onClick={() =>
                setSelected(
                  selected.size === loaded.pages.length
                    ? new Set()
                    : new Set(loaded.pages.map((page) => page.id)),
                )
              }
            >
              {selected.size === loaded.pages.length ? t.deselectAll : t.selectAll}
            </Button>
            <Button variant="ghost" onClick={clear}>
              {t.clear}
            </Button>
          </>
        ) : undefined
      }
      footer={
        loaded ? (
          <>
            <Field label={t.export.format}>
              <Segmented
                label={t.export.format}
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'image/png', label: 'PNG' },
                  { value: 'image/jpeg', label: 'JPEG' },
                ]}
              />
            </Field>
            <Field label={t.export.size}>
              <Segmented
                label={t.export.size}
                value={scale}
                onChange={setScale}
                options={[
                  { value: '1', label: '72 dpi' },
                  { value: '2', label: '144 dpi' },
                  { value: '4', label: '288 dpi' },
                ]}
              />
            </Field>
            <Button variant="primary" className="ml-auto" onClick={exportImages} disabled={busy !== null}>
              <DownloadIcon />
              {busy ?? t.export.save(count)}
            </Button>
          </>
        ) : undefined
      }
    >
      <PageGrid tiles={tiles} selected={selected} onToggle={toggle} />
    </Workspace>
  )
}
