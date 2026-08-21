import { useState } from 'react'
import { imagesToPdf, type Orientation, type PageSize } from '../../core/images-to-pdf.ts'
import { FilePicker } from '../Dropzone.tsx'
import { PageGrid, reorder, type Tile } from '../PageGrid.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import {
  Button,
  DownloadIcon,
  Field,
  ImageIcon,
  PlusIcon,
  Segmented,
  TextInput,
  TrashIcon,
} from '../kit.tsx'
import { useT } from '../i18n.ts'
import { message, newId, readBytes, save, stem, toBlob } from '../files.ts'

const ACCEPT = '.jpg,.jpeg,.png'

interface Item {
  id: string
  file: File
  url: string
}

export function ImagesToPdf() {
  const t = useT()
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [pageSize, setPageSize] = useState<PageSize>('fit')
  const [orientation, setOrientation] = useState<Orientation>('auto')
  const [margin, setMargin] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function add(files: File[]) {
    setError(null)
    setItems((previous) => [
      ...previous,
      ...files.map((file) => ({ id: newId(), file, url: URL.createObjectURL(file) })),
    ])
  }

  function drop(ids: ReadonlySet<string>) {
    setItems((previous) =>
      previous.filter((item) => {
        if (!ids.has(item.id)) return true
        URL.revokeObjectURL(item.url)
        return false
      }),
    )
    setSelected(new Set())
  }

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function exportPdf() {
    setBusy(true)
    setError(null)
    try {
      const bytes = await Promise.all(items.map((item) => readBytes(item.file)))
      const pdf = await imagesToPdf(bytes, {
        pageSize,
        orientation,
        marginPt: Number(margin) || 0,
      })
      save(toBlob(pdf, 'application/pdf'), `${stem(items[0]!.file.name)}.pdf`)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  const tiles: Tile[] = items.map((item) => ({
    id: item.id,
    url: item.url,
    caption: item.file.name,
  }))

  return (
    <Workspace
      title={t.tools.images.label}
      accept={ACCEPT}
      onFiles={add}
      error={error}
      empty={
        items.length === 0
          ? { icon: <ImageIcon />, title: t.images.emptyTitle, hint: t.images.emptyHint }
          : undefined
      }
      toolbar={
        items.length > 0 ? (
          <>
            <FilePicker accept={ACCEPT} onFiles={add}>
              <Button>
                <PlusIcon />
                {t.images.add}
              </Button>
            </FilePicker>
            <span className="text-muted text-body hidden truncate sm:inline">
              {t.images.count(items.length)}
              {selected.size > 0 && ` · ${t.images.selected(selected.size)}`}
            </span>
            <Spacer />
            {selected.size > 0 && (
              <Button variant="ghost" onClick={() => drop(selected)}>
                <TrashIcon />
                {t.remove}
              </Button>
            )}
            <Button variant="ghost" onClick={() => drop(new Set(items.map((item) => item.id)))}>
              {t.clear}
            </Button>
          </>
        ) : undefined
      }
      footer={
        items.length > 0 ? (
          <>
            <Field label={t.images.page}>
              <Segmented
                label={t.images.page}
                value={pageSize}
                onChange={setPageSize}
                options={[
                  { value: 'fit', label: t.images.fit },
                  { value: 'a4', label: t.images.a4 },
                  { value: 'letter', label: t.images.letter },
                ]}
              />
            </Field>
            <Field label={t.images.turn}>
              <Segmented
                label={t.images.turn}
                value={orientation}
                onChange={setOrientation}
                options={[
                  { value: 'auto', label: t.images.auto },
                  { value: 'portrait', label: t.images.portrait },
                  { value: 'landscape', label: t.images.landscape },
                ]}
              />
            </Field>
            <Field label={t.images.margin}>
              <TextInput
                type="number"
                min="0"
                aria-label={t.images.marginLabel}
                value={margin}
                onChange={(event) => setMargin(event.target.value)}
                className="w-[68px]"
              />
            </Field>
            <Button variant="primary" className="ml-auto" onClick={exportPdf} disabled={busy}>
              <DownloadIcon />
              {busy ? t.images.building : t.images.save}
            </Button>
          </>
        ) : undefined
      }
    >
      <PageGrid
        tiles={tiles}
        selected={selected}
        onToggle={toggle}
        onReorder={(dragId, overId) => setItems((previous) => reorder(previous, dragId, overId))}
        onRemove={(id) => drop(new Set([id]))}
      />
    </Workspace>
  )
}
