import { useState } from 'react'
import { decodeImage } from '../../core/images-browser.ts'
import {
  IMAGE_FORMATS,
  defaultQuality,
  encodeImage,
  extensionFor,
  hasLosslessOption,
  keepsAlpha,
  mimeType,
  type ImageFormat,
} from '../../core/images.ts'
import { humanSize, sizeChange } from '../../core/units.ts'
import { FilePicker } from '../Dropzone.tsx'
import { PageGrid, type Tile } from '../PageGrid.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import { Button, DownloadIcon, Field, PlusIcon, Select, Slider, SwapIcon, Toggle } from '../kit.tsx'
import { useT } from '../i18n.ts'
import { message, newId, readBytes, save, saveAll, stem } from '../files.ts'

/**
 * Anything a browser can open. The list is what the file picker offers rather
 * than what is enforced: the file's own leading bytes decide that, since phones
 * hand out HEIC photos named .jpg.
 */
const ACCEPT = '.png,.jpg,.jpeg,.webp,.avif,.jxl,.gif,.bmp,.tif,.tiff,.ico,.heic,.heif,.svg'

interface Picture {
  id: string
  name: string
  bytes: Uint8Array
  /** Preview of the file as it arrived, so the grid fills before any work. */
  url: string
  result?: { blob: Blob; name: string; size: number }
}

export function Convert() {
  const t = useT()
  const [pictures, setPictures] = useState<Picture[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [format, setFormat] = useState<ImageFormat>('webp')
  const [quality, setQuality] = useState(defaultQuality('webp'))
  const [touchedQuality, setTouchedQuality] = useState(false)
  const [lossless, setLossless] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function add(files: File[]) {
    setError(null)
    void (async () => {
      try {
        const loaded: Picture[] = []
        for (const file of files) {
          const bytes = await readBytes(file)
          loaded.push({
            id: newId(),
            name: file.name,
            bytes,
            url: URL.createObjectURL(file),
          })
        }
        setPictures((previous) => [...previous, ...loaded])
      } catch (failure) {
        // A file can go away between being dropped and being read, and a
        // rejection with nobody catching it would leave the grid empty with no
        // reason given.
        setError(message(failure))
      }
    })()
  }

  function clear() {
    for (const picture of pictures) URL.revokeObjectURL(picture.url)
    setPictures([])
    setSelected(new Set())
  }

  function remove(id: string) {
    setPictures((previous) => {
      const going = previous.find((picture) => picture.id === id)
      if (going) URL.revokeObjectURL(going.url)
      return previous.filter((picture) => picture.id !== id)
    })
  }

  /**
   * A result belongs to the settings that produced it. Leaving one on screen
   * after a setting moves would caption it with the old size and hand the old
   * bytes to Download, so every setting drops them and the work is done again.
   */
  function forgetResults() {
    setPictures((previous) => previous.map(({ result: _drop, ...rest }) => rest))
  }

  /**
   * Changing the target format moves the quality with it unless the slider has
   * been touched. The scales are not the same between formats, so carrying 82
   * from WebP over to AVIF would quietly ask for a much larger file.
   */
  function chooseFormat(next: ImageFormat) {
    setFormat(next)
    if (!touchedQuality) setQuality(defaultQuality(next))
    // The switch is hidden for a format with no choice, so leaving it on would
    // strand it: PNG to AVIF lossless, then to JPEG, and the encoder refuses a
    // setting there is no longer any control for.
    if (!hasLosslessOption(next)) setLossless(false)
    forgetResults()
  }

  async function run() {
    const chosen =
      selected.size > 0 ? pictures.filter((picture) => selected.has(picture.id)) : pictures
    if (chosen.length === 0) return
    setError(null)
    const done: Record<string, Picture['result']> = {}
    try {
      for (const [index, picture] of chosen.entries()) {
        setBusy(t.progress(index + 1, chosen.length))
        const pixels = await decodeImage(picture.bytes)
        const bytes = await encodeImage(pixels, { format, quality, lossless })
        done[picture.id] = {
          blob: new Blob([bytes as BlobPart], { type: mimeType(format) }),
          name: `${stem(picture.name)}.${extensionFor(format)}`,
          size: bytes.length,
        }
      }
      setPictures((previous) =>
        previous.map((picture) =>
          done[picture.id] ? { ...picture, result: done[picture.id] } : picture,
        ),
      )
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(null)
    }
  }

  const results = pictures.flatMap((picture) => (picture.result ? [picture.result] : []))

  async function download() {
    if (results.length === 1) save(results[0]!.blob, results[0]!.name)
    else await saveAll(results)
  }

  const tiles: Tile[] = pictures.map((picture) => ({
    id: picture.id,
    url: picture.url,
    caption: picture.result
      ? `${picture.result.name} · ${humanSize(picture.result.size)} · ${t.convert.change(sizeChange(picture.bytes.length, picture.result.size))}`
      : `${picture.name} · ${humanSize(picture.bytes.length)}`,
  }))

  const count = selected.size > 0 ? selected.size : pictures.length
  // JPEG is the one target with nowhere to keep transparency, so it is the one
  // that has to say what happens to it.
  const flattens = !keepsAlpha(format)

  return (
    <Workspace
      title={t.tools.convert.label}
      accept={ACCEPT}
      onFiles={add}
      error={error}
      busy={busy}
      empty={
        pictures.length === 0
          ? { icon: <SwapIcon />, title: t.convert.emptyTitle, hint: t.convert.emptyHint }
          : undefined
      }
      toolbar={
        pictures.length > 0 ? (
          <>
            <FilePicker accept={ACCEPT} onFiles={add}>
              <Button>
                <PlusIcon />
                {t.convert.add}
              </Button>
            </FilePicker>
            <span className="text-muted text-body hidden truncate sm:inline">
              {t.convert.count(pictures.length)}
            </span>
            <Spacer />
            <Button
              variant="ghost"
              onClick={() =>
                setSelected(
                  selected.size === pictures.length
                    ? new Set()
                    : new Set(pictures.map((picture) => picture.id)),
                )
              }
            >
              {selected.size === pictures.length ? t.deselectAll : t.selectAll}
            </Button>
            <Button variant="ghost" onClick={clear}>
              {t.clear}
            </Button>
          </>
        ) : undefined
      }
      footer={
        pictures.length > 0 ? (
          <>
            <Field label={t.convert.format}>
              <Select
                aria-label={t.convert.format}
                value={format}
                onChange={(event) => chooseFormat(event.target.value as ImageFormat)}
              >
                {IMAGE_FORMATS.map((one) => (
                  <option key={one} value={one}>
                    {one.toUpperCase()}
                  </option>
                ))}
              </Select>
            </Field>

            {format !== 'png' && (
              <Field label={t.convert.quality}>
                {lossless ? (
                  <span className="text-muted text-body">{t.convert.losslessNote}</span>
                ) : (
                  <Slider
                    label={t.convert.quality}
                    value={quality}
                    onChange={(next) => {
                      setTouchedQuality(true)
                      setQuality(next)
                      forgetResults()
                    }}
                  />
                )}
              </Field>
            )}

            {hasLosslessOption(format) && (
              <Toggle
                label={t.convert.lossless}
                checked={lossless}
                onChange={(next) => {
                  setLossless(next)
                  forgetResults()
                }}
              />
            )}

            <Spacer />
            {flattens && <span className="text-muted text-caption">{t.convert.flattens}</span>}
            {results.length > 0 && (
              <Button onClick={download}>
                <DownloadIcon />
                {t.convert.download(results.length)}
              </Button>
            )}
            <Button variant="primary" onClick={run} disabled={busy !== null}>
              {busy ?? t.convert.run(count, format.toUpperCase())}
            </Button>
          </>
        ) : undefined
      }
    >
      <PageGrid
        tiles={tiles}
        selected={selected}
        onToggle={(id) =>
          setSelected((previous) => {
            const next = new Set(previous)
            if (!next.delete(id)) next.add(id)
            return next
          })
        }
        onRemove={remove}
      />
    </Workspace>
  )
}
