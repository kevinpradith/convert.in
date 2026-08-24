import { useState } from 'react'
import { compressPdf, type CompressReport } from '../../core/pdf-compress.ts'
import { FilePicker } from '../Dropzone.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import { Button, CompressIcon, DownloadIcon, Field, PlusIcon, Select, Slider } from '../kit.tsx'
import { useT } from '../i18n.ts'
import { humanSize, sizeChange } from '../../core/units.ts'
import { message, readBytes, save, stem, toBlob } from '../files.ts'

const ACCEPT = '.pdf'

/** Caps offered rather than a free number: these are the sizes worth printing at. */
const LONGEST_SIDES = ['', '2400', '1600', '1200', '800']

interface Loaded {
  name: string
  bytes: Uint8Array
  result?: CompressReport
}

export function Compress() {
  const t = useT()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [quality, setQuality] = useState(55)
  const [maxSide, setMaxSide] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function open(files: File[]) {
    const file = files[0]
    if (!file) return
    setError(null)
    setBusy(t.compress.working)
    try {
      setLoaded({ name: file.name, bytes: await readBytes(file) })
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(null)
    }
  }

  /** A result describes the settings that produced it, so a change discards it. */
  function retune(change: () => void) {
    change()
    setLoaded((previous) => (previous ? { name: previous.name, bytes: previous.bytes } : null))
  }

  async function run() {
    if (!loaded) return
    setBusy(t.compress.working)
    setError(null)
    try {
      const result = await compressPdf(loaded.bytes, {
        quality,
        ...(maxSide === '' ? {} : { maxSide: Number(maxSide) }),
      })
      setLoaded({ name: loaded.name, bytes: loaded.bytes, result })
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(null)
    }
  }

  const result = loaded?.result
  // Why nothing happened, in the words that name the reason rather than leaving
  // a result of "0% smaller" to be interpreted as a broken tool.
  const outcome =
    result === undefined
      ? undefined
      : result.images === 0
        ? t.compress.nothingToDo
        : result.replaced === 0
          ? t.compress.noneSmaller(result.images)
          : t.compress.result(sizeChange(result.before, result.after), result.replaced)

  return (
    <Workspace
      title={t.tools.compress.label}
      accept={ACCEPT}
      onFiles={open}
      error={error}
      busy={busy}
      empty={
        loaded
          ? undefined
          : { icon: <CompressIcon />, title: t.compress.emptyTitle, hint: t.compress.emptyHint }
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
              {loaded.name} · {humanSize(loaded.bytes.length)}
            </span>
            <Spacer />
            <Button variant="ghost" onClick={() => setLoaded(null)}>
              {t.clear}
            </Button>
          </>
        ) : undefined
      }
      footer={
        loaded ? (
          <>
            <Field label={t.compress.quality}>
              <Slider
                label={t.compress.quality}
                value={quality}
                onChange={(next) => retune(() => setQuality(next))}
              />
            </Field>
            <Field label={t.compress.maxSide}>
              <Select
                aria-label={t.compress.maxSide}
                value={maxSide}
                onChange={(event) => retune(() => setMaxSide(event.target.value))}
              >
                {LONGEST_SIDES.map((side) => (
                  <option key={side} value={side}>
                    {side === '' ? t.compress.unlimited : `${side} px`}
                  </option>
                ))}
              </Select>
            </Field>
            <Spacer />
            {result && result.replaced > 0 && (
              <Button
                onClick={() =>
                  save(toBlob(result.bytes, 'application/pdf'), `${stem(loaded.name)}-compressed.pdf`)
                }
              >
                <DownloadIcon />
                {t.compress.save}
              </Button>
            )}
            <Button variant="primary" onClick={run} disabled={busy !== null}>
              {busy ?? t.compress.run}
            </Button>
          </>
        ) : undefined
      }
    >
      {loaded && (
        <div className="mx-auto flex max-w-[560px] flex-col gap-4 p-5 sm:p-8">
          <p className="bg-fill text-body rounded-card px-3 py-2 leading-relaxed">
            {outcome ?? t.compress.hint}
          </p>
          {result && (
            <p className="text-muted text-body tabular-nums">
              {humanSize(result.before)} → {humanSize(result.after)}
              {result.skipped > 0 && ` · ${result.skipped} left alone`}
            </p>
          )}
        </div>
      )}
    </Workspace>
  )
}
