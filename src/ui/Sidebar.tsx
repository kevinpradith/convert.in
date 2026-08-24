import { createContext } from 'react'
import {
  cx,
  ExportIcon,
  ImageIcon,
  LockIcon,
  Logo,
  PagesIcon,
  Segmented,
  StampIcon,
  SwapIcon,
} from './kit.tsx'
import { STRINGS } from './i18n.ts'
import type { Lang, Theme } from './prefs.ts'

export const TOOL_IDS = ['convert', 'images', 'organize', 'stamp', 'protect', 'export'] as const
export type ToolId = (typeof TOOL_IDS)[number]

const TOOL_ICONS: Record<ToolId, typeof ImageIcon> = {
  convert: SwapIcon,
  images: ImageIcon,
  organize: PagesIcon,
  stamp: StampIcon,
  protect: LockIcon,
  export: ExportIcon,
}

/**
 * Lets the shared toolbar open the navigation drawer without every tool having
 * to accept and forward a prop it does not care about.
 */
export const ShellContext = createContext<{ openNav: () => void } | null>(null)

export function Sidebar({
  active,
  onSelect,
  lang,
  onLang,
  theme,
  onTheme,
}: {
  active: ToolId
  onSelect: (id: ToolId) => void
  lang: Lang
  onLang: (lang: Lang) => void
  theme: Theme
  onTheme: (theme: Theme) => void
}) {
  const t = STRINGS[lang]

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex h-bar shrink-0 items-center px-4">
        <Logo className="h-6 w-auto" />
      </div>

      <nav className="flex flex-col gap-1 px-2.5">
        {TOOL_IDS.map((id) => {
          const ToolIcon = TOOL_ICONS[id]
          const current = id === active
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={current ? 'page' : undefined}
              className={cx(
                'flex items-center gap-2.5 rounded-card px-2.5 py-2 text-left',
                'transition-all duration-200 ease-glass',
                current ? 'glass-strong specular ring-line shadow-tile ring-1' : 'hover:bg-fill',
              )}
            >
              <span
                className={cx(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-inner transition-colors duration-200',
                  current ? 'bg-accent text-on-accent shadow-accent' : 'bg-fill text-muted',
                )}
              >
                <ToolIcon size={15} stroke={1.35} />
              </span>
              <span className="min-w-0">
                <span className={cx('text-body block', current ? 'font-semibold' : 'font-medium')}>
                  {t.tools[id].label}
                </span>
                <span className="text-muted text-caption mt-0.5 block truncate">
                  {t.tools[id].hint}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="min-h-8 flex-1" />

      <div className="flex flex-col gap-4 px-3.5 pb-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted text-caption px-0.5 font-medium tracking-wide uppercase">
            {t.appearance}
          </span>
          <Segmented
            label={t.appearance}
            value={theme}
            onChange={onTheme}
            options={[
              { value: 'system', label: t.theme.system },
              { value: 'light', label: t.theme.light },
              { value: 'dark', label: t.theme.dark },
            ]}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-muted text-caption px-0.5 font-medium tracking-wide uppercase">
            {t.language}
          </span>
          <Segmented
            label={t.language}
            value={lang}
            onChange={onLang}
            options={[
              { value: 'en', label: 'English' },
              { value: 'id', label: 'Indonesia' },
            ]}
          />
        </div>

        <p className="text-muted text-caption px-0.5 leading-relaxed">
          {t.tagline}{' '}
          {/* The bundle carries Apache-2.0 and MIT code whose notices have to
              travel with it. Shipping the file is the requirement; linking it is
              what makes it reachable by the people it is meant for. */}
          <a
            href="./THIRD-PARTY-NOTICES.txt"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink underline underline-offset-2"
          >
            {t.licences}
          </a>
        </p>
      </div>
    </div>
  )
}
