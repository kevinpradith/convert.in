import { useId, useState } from 'react'
import { parseRanges } from '../core/pdf-pages.ts'
import { Button, TextInput } from './kit.tsx'
import { useT } from './i18n.ts'
import { message } from './files.ts'

/**
 * Typing "1-3,7" instead of clicking two hundred tiles. It runs the same
 * `parseRanges` the CLI does, so a range that works in one works in the other.
 */
export function RangeSelect({
  total,
  onSelect,
}: {
  total: number
  onSelect: (indices: number[]) => void
}) {
  const t = useT()
  const said = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function apply() {
    if (text.trim() === '') return
    try {
      onSelect(parseRanges(text, total))
      setError(null)
    } catch (failure) {
      setError(message(failure))
    }
  }

  return (
    <form
      className="flex shrink-0 items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        apply()
      }}
    >
      <TextInput
        aria-label={t.selectRange}
        aria-invalid={error !== null}
        // Pointed at the message rather than carrying it: a reason kept in a
        // title attribute reaches a mouse and nothing else, and "5-2 counts
        // backwards" is exactly what somebody needs to be told.
        aria-errormessage={error === null ? undefined : said}
        placeholder={t.rangePlaceholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setError(null)
        }}
        className={error === null ? 'w-[92px]' : 'w-[92px] ring-2 ring-ink'}
      />
      <Button type="submit" variant="ghost" disabled={text.trim() === ''}>
        {t.applyRange}
      </Button>
      {error !== null && (
        // Truncated to keep the toolbar a toolbar; a reader announces the whole
        // string either way, and the title carries it for a pointer.
        <span id={said} role="alert" title={error} className="text-footnote max-w-[30ch] truncate">
          {error}
        </span>
      )}
    </form>
  )
}
