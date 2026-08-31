import { createContext } from 'react'
import {
  CompressIcon,
  cx,
  ExportIcon,
  ImageIcon,
  LockIcon,
  MarkerIcon,
  PagesIcon,
  SignIcon,
  StampIcon,
  SwapIcon,
  TagIcon,
} from './kit.tsx'
import { STRINGS } from './i18n.ts'
import type { Lang } from './prefs.ts'

export const TOOL_IDS = [
  'convert',
  'compress',
  'images',
  'organize',
  'stamp',
  'sign',
  'protect',
  'clean',
  'redact',
  'export',
] as const
export type ToolId = (typeof TOOL_IDS)[number]

const TOOL_ICONS: Record<ToolId, typeof ImageIcon> = {
  convert: SwapIcon,
  compress: CompressIcon,
  images: ImageIcon,
  organize: PagesIcon,
  stamp: StampIcon,
  sign: SignIcon,
  protect: LockIcon,
  clean: TagIcon,
  redact: MarkerIcon,
  export: ExportIcon,
}

/**
 * Lets the shared toolbar open the navigation drawer without every tool having
 * to accept and forward a prop it does not care about.
 */
export const ShellContext = createContext<{ openNav: () => void } | null>(null)

/**
 * The three lights a Mac window wears in its top left corner, at the size and
 * spacing the real ones use: 12 across, 8 between, and the group set 20 in from
 * the edge of the window. The fills are the measured approximations of Big
 * Sur's own, each with the half-pixel darker rim that keeps a light circle from
 * dissolving into a light titlebar.
 *
 * Decoration, and honest about it. There is no window to close, so these take
 * no pointer, offer no hover, and are hidden from a screen reader rather than
 * announced as three buttons that do nothing.
 */
function TrafficLights() {
  const lights = [
    { fill: '#ed6a5f', rim: '#e24b41' },
    { fill: '#f6be50', rim: '#e1a73e' },
    { fill: '#61c555', rim: '#2dac2f' },
  ]
  return (
    <div
      aria-hidden="true"
      // The lights belong to a window, and the drawer this list is also the
      // inside of is not one. Hiding the three circles and keeping the bar they
      // sit in left 52px of nothing above the first row of the drawer, so the
      // whole strip goes rather than its contents.
      className="pointer-events-none hidden h-bar shrink-0 items-center gap-2 pl-5 select-none lg:flex"
    >
      {lights.map(({ fill, rim }) => (
        <span
          key={fill}
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: fill, boxShadow: `inset 0 0 0 0.5px ${rim}` }}
        />
      ))}
    </div>
  )
}

export function Sidebar({
  active,
  onSelect,
  lang,
}: {
  active: ToolId
  onSelect: (id: ToolId) => void
  lang: Lang
}) {
  const t = STRINGS[lang]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <TrafficLights />

      {/*
          One line a row, an unboxed glyph, and a flat fill for the selection.
          A sidebar is a list of places, and the three things that were here
          instead of that were all noise: a second line under every one of ten
          rows, a grey tile around every icon, and a raised card under the
          selected one. macOS marks the row you are on by filling it, not by
          lifting it off the surface. What the hint used to say is on the tool's
          own screen the moment the row is picked, and on hover in the meantime.
      */}
      <nav className="flex flex-col gap-0.5 px-2 pt-1">
        {TOOL_IDS.map((id) => {
          const ToolIcon = TOOL_ICONS[id]
          const current = id === active
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={current ? 'page' : undefined}
              title={t.tools[id].hint}
              className={cx(
                // 8 of nav padding and 8 of row padding put the glyph on the
                // same 16 the logo above it starts at. Two different insets in
                // one column is the kind of misalignment nobody names and
                // everybody sees.
                'flex items-center gap-2 rounded-inner px-2 py-2 text-left',
                'transition-colors duration-150 ease-glass',
                current ? 'bg-accent text-on-accent' : 'hover:bg-fill',
              )}
            >
              {/*
                  Tinted, not filled. The sidebar glyph takes the text colour in
                  macOS; an accent-coloured chip on a translucent panel reads as
                  a badge, and ten badges read as ten alerts.
              */}
              <span
                className={cx(
                  'shrink-0 transition-colors duration-150',
                  current ? 'text-on-accent' : 'text-muted',
                )}
              >
                <ToolIcon size={16} stroke={current ? 1.7 : 1.45} />
              </span>
              <span className={cx('text-body truncate', current ? 'font-semibold' : 'font-medium')}>
                {t.tools[id].label}
              </span>
            </button>
          )
        })}
      </nav>

      {/*
        Nothing under the list. The notices this bundle has to carry are linked
        from the page's own footer, and one link in one place is the whole of
        that obligation; a second copy in here was only ever a second thing to
        keep in step.
      */}
      <div className="pb-4" />
    </div>
  )
}
