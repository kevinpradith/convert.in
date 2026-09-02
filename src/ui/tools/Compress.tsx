import { useState } from 'react'
import { compressPdf, compressToFit } from '../../core/pdf-compress.ts'
import { humanSize, sizeChange } from '../../core/units.ts'
import { FileList, useBatch } from '../batch.tsx'
import { FilePicker } from '../Dropzone.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import { Button, CompressIcon, DownloadIcon, Field, PlusIcon, Select, Slider } from '../kit.tsx'
import { useT } from '../i18n.ts'
import { stem, toBlob } from '../files.ts'

const ACCEPT = '.pdf'

/** Caps offered rather than a free number: these are the sizes worth printing at. */
const LONGEST_SIDES = ['', '2400', '1600', '1200', '800']

/**
 * The limits upload forms actually ask for. A visa application wants 100 to
 * 500KB, an HR portal 2MB, a court filing 5MB; nobody is ever told to hit
 * 1.37MB, so a free number field would be a worse question than a list.
 */
const TARGETS = [0, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000]

export function Compress() {
  const t = useT()
  const batch = useBatch()
  const [quality, setQuality] = useState(55)
  const [maxSide, setMaxSide] = useState('')
  const [target, setTarget] = useState(0)

  /** A result describes the settings that produced it, so a change discards it. */
  function retune(change: () => void) {
    change()
    batch.forget()
  }

  async function run() {
    await batch.run(async (item) => {
      // A file already under the limit is copied out rather than re-encoded:
      // meeting a limit it already meets would only cost it quality.
      if (target > 0 && item.bytes.length <= target) {
        return { note: t.compress.alreadyUnder(humanSize(target)) }
      }
      const settings = { quality, ...(maxSide === '' ? {} : { maxSide: Number(maxSide) }) }
      const result =
        target > 0
          ? await compressToFit(item.bytes, target, {})
          : { ...(await compressPdf(item.bytes, settings)), fits: true }
      // Why nothing happened, in the words that name the reason rather than
      // leaving a result of "0% smaller" to be read as a broken tool.
      if (result.replaced === 0) {
        return {
          note:
            result.images === 0 ? t.compress.nothingToDo : t.compress.noneSmaller(result.images),
        }
      }
      return {
        result: {
          blob: toBlob(result.bytes, 'application/pdf'),
          name: `${stem(item.name)}-compressed.pdf`,
          size: result.after,
        },
        note:
          `${humanSize(result.before)} → ${humanSize(result.after)} · ` +
          t.compress.result(sizeChange(result.before, result.after), result.replaced) +
          // A limit nothing could meet is worth saying: the file is still
          // offered, but sending it somewhere that will bounce it is worse
          // than being told now.
          (result.fits
            ? ''
            : ` · ${t.compress.tooBig(humanSize(result.after), humanSize(target))}`),
      }
    }, t.compress.working)
  }

  const loaded = batch.items.length > 0

  return (
    <Workspace
      title={t.tools.compress.label}
      accept={ACCEPT}
      onFiles={(files) => void batch.add(files)}
      error={batch.error}
      busy={batch.busy}
      empty={
        loaded
          ? undefined
          : { icon: <CompressIcon />, title: t.compress.emptyTitle, hint: t.compress.emptyHint }
      }
      toolbar={
        loaded ? (
          <>
            <FilePicker accept={ACCEPT} onFiles={(files) => void batch.add(files)}>
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
            <Field label={t.compress.target}>
              <Select
                aria-label={t.compress.target}
                value={String(target)}
                onChange={(event) => retune(() => setTarget(Number(event.target.value)))}
              >
                {TARGETS.map((size) => (
                  <option key={size} value={size}>
                    {size === 0 ? t.compress.noTarget : humanSize(size)}
                  </option>
                ))}
              </Select>
            </Field>
            {/* A limit picks its own settings, so offering these as well would
                be two answers to one question. */}
            {target === 0 && (
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
              </>
            )}
            <Spacer />
            {batch.results.length > 0 && (
              <Button onClick={() => void batch.download()}>
                <DownloadIcon />
                {t.batch.download(batch.results.length)}
              </Button>
            )}
            <Button variant="primary" onClick={() => void run()} disabled={batch.busy !== null}>
              {batch.busy ?? t.compress.run}
            </Button>
          </>
        ) : undefined
      }
    >
      {loaded && (
        <>
          <p className="text-muted text-footnote mx-auto w-full max-w-[720px] px-5 pt-4 sm:px-8">
            {target === 0 ? t.compress.hint : t.compress.targetHint}
          </p>
          <FileList items={batch.items} onRemove={batch.remove} />
        </>
      )}
    </Workspace>
  )
}
