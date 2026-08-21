import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { cx } from './kit.tsx'

/** Keep only the files whose extension appears in an `accept` list like ".pdf,.png". */
export function matching(files: File[], accept: string): File[] {
  const wanted = accept.split(',').map((part) => part.trim().toLowerCase())
  return files.filter((file) => wanted.some((ext) => file.name.toLowerCase().endsWith(ext)))
}

/**
 * Turns its whole area into a drop target. Wrapping the content rather than
 * sitting next to it means a file can be dropped anywhere in the window.
 */
export function Dropzone({
  accept,
  onFiles,
  children,
}: {
  accept: string
  onFiles: (files: File[]) => void
  children: ReactNode
}) {
  const [over, setOver] = useState(false)
  // dragenter/dragleave also fire for every child element, so count the depth
  // instead of toggling, or the highlight flickers as the pointer moves.
  const depth = useRef(0)

  function reset() {
    depth.current = 0
    setOver(false)
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    reset()
    const files = matching([...event.dataTransfer.files], accept)
    if (files.length > 0) onFiles(files)
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(event) => {
        event.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        depth.current -= 1
        if (depth.current <= 0) reset()
      }}
      onDrop={drop}
    >
      {children}
      <div
        className={cx(
          'pointer-events-none absolute inset-3 rounded-card border-2 border-dashed',
          'transition-all duration-200 ease-glass',
          over ? 'border-ink/35 bg-fill scale-100 opacity-100' : 'scale-[0.99] border-transparent opacity-0',
        )}
      />
    </div>
  )
}

/** The button half of the same job, for people who would rather not drag. */
export function FilePicker({
  accept,
  onFiles,
  children,
}: {
  accept: string
  onFiles: (files: File[]) => void
  children: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          // Clear it so picking the same file twice in a row still fires onChange.
          event.target.value = ''
          if (files.length > 0) onFiles(files)
        }}
      />
      <span onClick={() => input.current?.click()}>{children}</span>
    </>
  )
}
