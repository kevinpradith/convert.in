import { useState } from 'react'
import { humanSize } from '../core/units.ts'
import { message, newId, readBytes, save, saveAll } from './files.ts'
import { useT } from './i18n.ts'

/** A finished file, waiting for the Download button. */
export interface Output {
  blob: Blob
  name: string
  size: number
}

export interface Item {
  id: string
  name: string
  bytes: Uint8Array
  /** What the last run made of it, absent when it produced nothing worth saving. */
  result?: Output
  /** What the last run had to say about it, whether or not it produced a file. */
  note?: string
}

/**
 * The loaded-files half of a tool: a list, a run that walks it, and a download
 * that knows whether it is handing over one file or twenty.
 *
 * The tools that use this differ only in the work they do per file and the
 * controls above it, and every one of them used to carry its own copy of the
 * loading, the progress counter and the error handling.
 */
export function useBatch() {
  const t = useT()
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Adds to whatever is loaded rather than replacing it, so files can arrive in
   * several drops. Hands back what it just read, because a caller that needs to
   * look inside a file needs the ids that came with it.
   */
  async function add(files: File[]): Promise<Item[]> {
    setError(null)
    const loaded: Item[] = []
    try {
      for (const file of files) {
        loaded.push({ id: newId(), name: file.name, bytes: await readBytes(file) })
      }
    } catch (failure) {
      // A file can go away between being dropped and being read.
      setError(message(failure))
    }
    setItems((previous) => [...previous, ...loaded])
    return loaded
  }

  function clear(): void {
    setItems([])
    setError(null)
  }

  function remove(id: string): void {
    setItems((previous) => previous.filter((item) => item.id !== id))
  }

  /**
   * A result belongs to the settings that produced it, so every setting drops
   * them. Leaving one on screen after a slider moves would caption it with the
   * old size and hand the old bytes to Download.
   */
  function forget(): void {
    setItems((previous) => previous.map(({ result: _r, note: _n, ...rest }) => rest))
  }

  /**
   * One file at a time rather than in parallel: the codecs and the PDF writer
   * are single-threaded here anyway, and one at a time is what lets the count
   * in the button mean something.
   *
   * Whatever finished before a failure is kept. A folder of forty where the
   * thirty-first is corrupt should still hand over the thirty that worked.
   */
  async function run(
    work: (item: Item) => Promise<{ result?: Output; note?: string }>,
    label: string,
  ): Promise<void> {
    if (items.length === 0) return
    setError(null)
    const done: Record<string, { result?: Output; note?: string }> = {}
    try {
      for (const [index, item] of items.entries()) {
        setBusy(items.length === 1 ? label : t.progress(index + 1, items.length))
        done[item.id] = await work(item)
      }
    } catch (failure) {
      setError(message(failure))
    } finally {
      setItems((previous) =>
        previous.map((item) => {
          const outcome = done[item.id]
          if (outcome === undefined) return item
          // Built from the file rather than merged over the old answer. A run
          // that produces only a note for a file that produced a result last
          // time has to clear that result, or Download quietly hands back the
          // bytes from the settings before last.
          const { result: _old, note: _said, ...base } = item
          return { ...base, ...outcome }
        }),
      )
      setBusy(null)
    }
  }

  const results = items.flatMap((item) => (item.result ? [item.result] : []))

  async function download(): Promise<void> {
    if (results.length === 1) save(results[0]!.blob, results[0]!.name)
    else await saveAll(results)
  }

  return {
    items,
    results,
    busy,
    error,
    setError,
    setBusy,
    add,
    clear,
    remove,
    forget,
    run,
    download,
  }
}

/**
 * What is loaded and what became of it. Deliberately a list rather than the
 * thumbnail grid the single-document tools use: rendering a page of every file
 * in a folder of fifty costs more than it tells anyone.
 */
export function FileList({
  items,
  onRemove,
  className = 'mx-auto max-w-[720px] p-5 sm:p-8',
}: {
  items: Item[]
  onRemove: (id: string) => void
  /** Layout is the caller's, since this sits inside their column as often as on its own. */
  className?: string
}) {
  const t = useT()
  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      {items.map((item) => (
        <li
          key={item.id}
          className="border-line bg-raised flex items-center gap-3 rounded-card border px-3 py-2"
        >
          <span className="text-body min-w-0 flex-1 truncate" title={item.name}>
            {item.name}
          </span>
          <span className="text-muted text-caption shrink-0 text-right tabular-nums">
            {item.note ?? humanSize(item.bytes.length)}
          </span>
          <button
            type="button"
            aria-label={`${t.remove} ${item.name}`}
            onClick={() => onRemove(item.id)}
            className="text-muted hover:text-ink shrink-0 rounded-inner p-1"
          >
            <svg
              viewBox="0 0 16 16"
              width="10"
              height="10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  )
}
