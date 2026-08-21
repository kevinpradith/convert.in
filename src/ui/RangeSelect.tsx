import { useState } from 'react'
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
        title={error ?? undefined}
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
    </form>
  )
}
