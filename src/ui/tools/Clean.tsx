import { useState } from 'react'
import { describeMetadata, stripMetadata, type MetadataReport } from '../../core/pdf-metadata.ts'
import { humanSize } from '../../core/units.ts'
import { FileList, useBatch, type Item } from '../batch.tsx'
import { FilePicker } from '../Dropzone.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import { Button, DownloadIcon, PlusIcon, TagIcon } from '../kit.tsx'
import { useT } from '../i18n.ts'
import { stem, toBlob } from '../files.ts'

const ACCEPT = '.pdf'

export function Clean() {
  const t = useT()
  const batch = useBatch()
  /** What each loaded file says about itself, read as soon as it arrives. */
  const [found, setFound] = useState<Record<string, MetadataReport>>({})

  async function load(files: File[]) {
    const loaded = await batch.add(files)
    for (const item of loaded) {
      try {
        const report = await describeMetadata(item.bytes)
        setFound((previous) => ({ ...previous, [item.id]: report }))
      } catch {
        // A file this cannot even be read is the run's problem to report, and
        // it will, in words, the moment Clean is pressed. Leaving it out of
        // `found` here says only that there was nothing to show.
      }
    }
  }

  async function run() {
    await batch.run(async (item) => {
      const report = found[item.id] ?? (await describeMetadata(item.bytes))
      if (!report.any) return { note: t.clean.alreadyClean }
      const bytes = await stripMetadata(item.bytes)
      return {
        result: {
          blob: toBlob(bytes, 'application/pdf'),
          name: `${stem(item.name)}-clean.pdf`,
          size: bytes.length,
        },
        note: t.clean.removed(report.entries.length, report.xmp),
      }
    }, t.clean.working)
  }

  const loaded = batch.items.length > 0

  return (
    <Workspace
      title={t.tools.clean.label}
      accept={ACCEPT}
      onFiles={(files) => void load(files)}
      error={batch.error}
      busy={batch.busy}
      empty={
        loaded ? undefined : { icon: <TagIcon />, title: t.clean.emptyTitle, hint: t.clean.emptyHint }
      }
      toolbar={
        loaded ? (
          <>
            <FilePicker accept={ACCEPT} onFiles={(files) => void load(files)}>
              <Button>
                <PlusIcon />
                {t.batch.add}
              </Button>
            </FilePicker>
            <span className="text-muted text-body hidden truncate sm:inline">
              {t.batch.count(batch.items.length)}
            </span>
            <Spacer />
            <Button variant="ghost" onClick={batch.clear}>
              {t.clear}
            </Button>
          </>
        ) : undefined
      }
      footer={
        loaded ? (
          <>
            <Spacer />
            {batch.results.length > 0 && (
              <Button onClick={() => void batch.download()}>
                <DownloadIcon />
                {t.batch.download(batch.results.length)}
              </Button>
            )}
            <Button variant="primary" onClick={() => void run()} disabled={batch.busy !== null}>
              {batch.busy ?? t.clean.run}
            </Button>
          </>
        ) : undefined
      }
    >
      {loaded && (
        <>
          <p className="text-muted text-footnote mx-auto w-full max-w-[720px] px-5 pt-4 sm:px-8">{t.clean.hint}</p>
          <FileList items={batch.items} onRemove={batch.remove} />
          <Sheets items={batch.items} found={found} />
        </>
      )}
    </Workspace>
  )
}

/**
 * What the files actually say, before anything is done to them. Seeing the
 * name and the company sitting there is the whole argument for the tool; a
 * button labelled "remove metadata" is an abstraction over it.
 */
function Sheets({ items, found }: { items: Item[]; found: Record<string, MetadataReport> }) {
  const t = useT()
  const shown = items.filter((item) => found[item.id]?.any === true)
  if (shown.length === 0) return null
  return (
    <div className="px-5 pb-6 sm:px-8">
      {shown.map((item) => {
        const report = found[item.id]!
        return (
          <section key={item.id} className="border-line mt-5 border-t pt-4">
            <h3 className="text-footnote text-muted truncate">{item.name}</h3>
            <dl className="mt-2 grid grid-cols-[minmax(0,auto)_1fr] gap-x-4 gap-y-1">
              {report.entries.map((entry) => (
                <div key={entry.name} className="contents">
                  <dt className="text-footnote text-muted break-words">
                    {entry.name}
                    {entry.custom && <span className="opacity-60"> · {t.clean.custom}</span>}
                  </dt>
                  <dd className="text-footnote break-words">{entry.value}</dd>
                </div>
              ))}
              {report.xmp > 0 && (
                <div className="contents">
                  <dt className="text-footnote text-muted">XMP</dt>
                  <dd className="text-footnote">{t.clean.xmp(humanSize(report.xmp))}</dd>
                </div>
              )}
            </dl>
          </section>
        )
      })}
    </div>
  )
}
