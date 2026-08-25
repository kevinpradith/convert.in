import { useState } from 'react'
import {
  assemblePages,
  hasFormFields,
  PAPERS,
  resizePages,
  type Paper,
} from '../../core/pdf-pages.ts'
import { closeDoc, loadDoc, renderThumbnail } from '../../core/pdf-to-images.ts'
import { FilePicker } from '../Dropzone.tsx'
import { PageGrid, reorder, type Tile } from '../PageGrid.tsx'
import { RangeSelect } from '../RangeSelect.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import {
  Button,
  DownloadIcon,
  Field,
  PagesIcon,
  PlusIcon,
  RotateIcon,
  Select,
  TrashIcon,
} from '../kit.tsx'
import { useT } from '../i18n.ts'
import { message, newId, numbered, readBytes, save, saveAll, stem, toBlob, useOnce } from '../files.ts'

const ACCEPT = '.pdf'

interface Source {
  id: string
  name: string
  bytes: Uint8Array
}

interface Page {
  id: string
  sourceId: string
  /** 0-based index inside its source document. */
  page: number
  url: string
  rotation: number
  label: string
}

/**
 * Merge, reorder, rotate, delete and split are one screen rather than five,
 * because they are one operation underneath: pick pages and put them in order.
 */
export function Organize() {
  const t = useT()
  // Two clicks inside one frame both reach the handler, and this tool hands
  // over one file per page: a double click on a forty-page split asks the
  // browser to save eighty.
  const once = useOnce()
  const [sources, setSources] = useState<Source[]>([])
  const [pages, setPages] = useState<Page[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  /** Empty means every page keeps the size it arrived at. */
  const [paper, setPaper] = useState('')
  const [forms, setForms] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(files: File[]) {
    setError(null)
    setBusy(t.organize.reading)
    try {
      for (const file of files) {
        const source: Source = { id: newId(), name: file.name, bytes: await readBytes(file) }
        if (await hasFormFields(source.bytes)) setForms(true)
        const doc = await loadDoc(source.bytes)
        try {
          // Previews are rendered one page at a time, up front. That is fine for
          // everyday documents; page them in on scroll before opening books.
          const rendered: Page[] = []
          for (let number = 1; number <= doc.numPages; number++) {
            setBusy(t.progress(number, doc.numPages))
            rendered.push({
              id: newId(),
              sourceId: source.id,
              page: number - 1,
              url: await renderThumbnail(doc, number),
              rotation: 0,
              label: `${stem(file.name)} · ${number}`,
            })
          }
          setSources((previous) => [...previous, source])
          setPages((previous) => [...previous, ...rendered])
        } finally {
          await closeDoc(doc)
        }
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

  /** With nothing selected, rotation applies to the whole document. */
  function rotate(delta: number) {
    setPages((previous) =>
      previous.map((page) =>
        selected.size === 0 || selected.has(page.id)
          ? { ...page, rotation: (((page.rotation + delta) % 360) + 360) % 360 }
          : page,
      ),
    )
  }

  function remove(ids: ReadonlySet<string>) {
    setPages((previous) =>
      previous.filter((page) => {
        if (!ids.has(page.id)) return true
        URL.revokeObjectURL(page.url)
        return false
      }),
    )
    setSelected(new Set())
  }

  function clear() {
    for (const page of pages) URL.revokeObjectURL(page.url)
    setPages([])
    setSources([])
    setForms(false)
    setSelected(new Set())
    setError(null)
  }

  async function build(groups: Page[][]): Promise<Uint8Array[]> {
    const order = new Map(sources.map((source, index) => [source.id, index]))
    const bytes = sources.map((source) => source.bytes)
    return Promise.all(
      groups.map(async (group) => {
        const assembled = await assemblePages(
          bytes,
          group.map((page) => ({
            source: order.get(page.sourceId)!,
            page: page.page,
            rotate: page.rotation,
          })),
        )
        // Sizing is the last step, so it applies to the pages that were kept
        // rather than to every page of every source.
        return paper === '' ? assembled : resizePages(assembled, { paper: paper as Paper })
      }),
    )
  }

  const baseName = sources.length === 1 ? stem(sources[0]!.name) : 'convert.in'

  async function saveOne() {
    await once(async () => {
      setBusy(t.organize.building)
      setError(null)
      try {
        const [pdf] = await build([pages])
        save(toBlob(pdf!, 'application/pdf'), `${baseName}.pdf`)
      } catch (failure) {
        setError(message(failure))
      } finally {
        setBusy(null)
      }
    })
  }

  async function saveSeparately() {
    await once(async () => {
      setBusy(t.organize.splitting)
      setError(null)
      try {
        const chosen = selected.size > 0 ? pages.filter((page) => selected.has(page.id)) : pages
        const parts = await build(chosen.map((page) => [page]))
        await saveAll(
          parts.map((pdf, index) => ({
            blob: toBlob(pdf, 'application/pdf'),
            name: `${numbered(baseName, index, parts.length)}.pdf`,
          })),
        )
      } catch (failure) {
        setError(message(failure))
      } finally {
        setBusy(null)
      }
    })
  }

  const tiles: Tile[] = pages.map((page) => ({
    id: page.id,
    url: page.url,
    caption: page.label,
    rotation: page.rotation,
  }))

  const allSelected = selected.size === pages.length && pages.length > 0

  return (
    <Workspace
      title={t.tools.organize.label}
      accept={ACCEPT}
      onFiles={add}
      error={error}
      busy={busy}
      empty={
        pages.length === 0
          ? { icon: <PagesIcon />, title: t.organize.emptyTitle, hint: t.organize.emptyHint }
          : undefined
      }
      toolbar={
        pages.length > 0 ? (
          <>
            <FilePicker accept={ACCEPT} onFiles={add}>
              <Button>
                <PlusIcon />
                {t.organize.add}
              </Button>
            </FilePicker>
            <span className="text-muted text-body hidden truncate sm:inline">
              {t.organize.pages(pages.length)}
              {sources.length > 1 && ` · ${t.organize.files(sources.length)}`}
              {selected.size > 0 && ` · ${t.organize.selected(selected.size)}`}
            </span>
            <Spacer />
            <RangeSelect
              total={pages.length}
              onSelect={(indices) => setSelected(new Set(indices.map((i) => pages[i]!.id)))}
            />
            <Button
              variant="ghost"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(pages.map((page) => page.id)))
              }
            >
              {allSelected ? t.deselectAll : t.selectAll}
            </Button>
            <Button variant="ghost" onClick={() => rotate(-90)} title={t.organize.rotateLeft}>
              <span className="-scale-x-100">
                <RotateIcon />
              </span>
            </Button>
            <Button variant="ghost" onClick={() => rotate(90)} title={t.organize.rotateRight}>
              <RotateIcon />
            </Button>
            <Button
              variant="ghost"
              onClick={() => remove(selected)}
              disabled={selected.size === 0}
              title={t.organize.deleteSelected}
            >
              <TrashIcon />
            </Button>
            <Button variant="ghost" onClick={clear}>
              {t.clear}
            </Button>
          </>
        ) : undefined
      }
      footer={
        pages.length > 0 ? (
          <>
            <span className="text-muted text-[12px]">
              {forms
                ? t.organize.formsWarning
                : selected.size === 0
                  ? t.organize.nothingSelected
                  : t.organize.someSelected(selected.size)}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Field label={t.organize.paper}>
                <Select
                  aria-label={t.organize.paperLabel}
                  value={paper}
                  onChange={(event) => setPaper(event.target.value)}
                >
                  <option value="">{t.organize.paperAsIs}</option>
                  {PAPERS.map((size) => (
                    <option key={size} value={size}>
                      {size.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button onClick={saveSeparately} disabled={busy !== null}>
                {t.organize.saveSeparately}
              </Button>
              <Button variant="primary" onClick={saveOne} disabled={busy !== null}>
                <DownloadIcon />
                {busy ?? t.organize.save}
              </Button>
            </div>
          </>
        ) : undefined
      }
    >
      <PageGrid
        tiles={tiles}
        selected={selected}
        onToggle={toggle}
        onReorder={(dragId, overId) => setPages((previous) => reorder(previous, dragId, overId))}
        onRemove={(id) => remove(new Set([id]))}
      />
    </Workspace>
  )
}
