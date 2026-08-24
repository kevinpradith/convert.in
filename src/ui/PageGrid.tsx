import { useState } from 'react'
import { CheckIcon, cx } from './kit.tsx'
import { useT } from './i18n.ts'

export interface Tile {
  id: string
  /** Object URL of the preview image. */
  url: string
  caption: string
  /** Degrees, shown on the preview only; the export applies the real rotation. */
  rotation?: number
}

/**
 * Square tiles are not only a look: a rotated image that fits a square box
 * still fits it after a quarter turn, so previews need no scaling maths.
 */
export function PageGrid({
  tiles,
  selected,
  onToggle,
  onReorder,
  onRemove,
}: {
  tiles: Tile[]
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onReorder?: (dragId: string, overId: string) => void
  onRemove?: (id: string) => void
}) {
  const t = useT()
  const [dragId, setDragId] = useState<string | null>(null)

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-4 p-5">
      {tiles.map((tile, index) => {
        const isSelected = selected.has(tile.id)
        return (
          <div
            key={tile.id}
            draggable={onReorder !== undefined}
            onDragStart={(event) => {
              setDragId(tile.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(event) => {
              event.preventDefault()
              if (dragId && dragId !== tile.id) onReorder?.(dragId, tile.id)
            }}
            onDragEnd={() => setDragId(null)}
            onClick={() => onToggle(tile.id)}
            className={cx('group cursor-pointer select-none', dragId === tile.id && 'opacity-40')}
          >
            <div
              className={cx(
                'relative aspect-square overflow-hidden rounded-tile bg-raised',
                'transition-all duration-200 ease-glass group-hover:-translate-y-0.5',
                isSelected
                  ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface shadow-accent'
                  : 'ring-1 ring-line group-hover:shadow-tile group-hover:ring-accent-ring',
              )}
            >
              <img
                src={tile.url}
                alt=""
                draggable={false}
                className="h-full w-full rounded-inner object-contain p-1.5 transition-transform duration-300 ease-glass"
                style={{ transform: `rotate(${tile.rotation ?? 0}deg)` }}
              />

              <span
                className={cx(
                  'absolute top-1.5 left-1.5 grid h-[18px] min-w-[18px] place-items-center',
                  'rounded-capsule px-1 text-[10px] font-semibold tabular-nums transition-colors',
                  isSelected
                    ? 'bg-accent text-on-accent'
                    : 'glass-strong text-muted ring-1 ring-line',
                )}
              >
                {isSelected ? <CheckIcon /> : index + 1}
              </span>

              {onRemove && (
                <button
                  type="button"
                  aria-label={`${t.remove} ${tile.caption}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemove(tile.id)
                  }}
                  className={cx(
                    'absolute top-1.5 right-1.5 grid h-[18px] w-[18px] place-items-center rounded-capsule',
                    'glass-strong text-muted opacity-0 ring-1 ring-line transition-opacity duration-150',
                    'group-hover:opacity-100 hover:text-ink focus-visible:opacity-100',
                    // Nothing reveals on hover when there is no hover.
                    'touch:h-7 touch:w-7 touch:opacity-100',
                  )}
                >
                  <svg viewBox="0 0 16 16" width="9" height="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              )}
            </div>

            <p className="text-muted text-caption mt-1.5 truncate px-0.5" title={tile.caption}>
              {tile.caption}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/** Move `dragId` to where `overId` currently sits, keeping everything else in order. */
export function reorder<T extends { id: string }>(items: T[], dragId: string, overId: string): T[] {
  const from = items.findIndex((item) => item.id === dragId)
  const to = items.findIndex((item) => item.id === overId)
  if (from === -1 || to === -1 || from === to) return items
  const next = [...items]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}
