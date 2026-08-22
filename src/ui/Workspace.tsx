import { useContext, type ReactNode } from 'react'
import { Dropzone, FilePicker } from './Dropzone.tsx'
import { Button, MenuIcon } from './kit.tsx'
import { useT } from './i18n.ts'
import { ShellContext } from './Sidebar.tsx'

/**
 * The frame every tool shares: drop anywhere, an empty state until something is
 * loaded, a scrolling middle, and glass bars pinned top and bottom.
 */
export function Workspace({
  title,
  accept,
  onFiles,
  empty,
  busy,
  toolbar,
  footer,
  error,
  children,
}: {
  title: string
  accept: string
  onFiles: (files: File[]) => void
  /** Shown instead of `children` while there is nothing loaded. */
  empty?: { icon: ReactNode; title: string; hint: string }
  /**
   * What is happening before there is anything to show. Opening a large
   * document renders every page up front, and until this the empty state simply
   * sat there through it, which reads as nothing having happened at all.
   */
  busy?: string | null
  toolbar?: ReactNode
  footer?: ReactNode
  error?: string | null
  children?: ReactNode
}) {
  const t = useT()
  const shell = useContext(ShellContext)

  return (
    <Dropzone accept={accept} onFiles={onFiles}>
      <div className="glass-strong border-line flex h-bar shrink-0 items-center gap-3 border-b px-3 sm:px-4">
        {/* Below the sidebar breakpoint the navigation lives behind this. */}
        <Button
          variant="ghost"
          aria-label={t.menu}
          onClick={() => shell?.openNav()}
          className="-ml-1.5 px-2 lg:hidden"
        >
          <MenuIcon />
        </Button>

        <h1 className="text-body font-semibold whitespace-nowrap">{title}</h1>
        {toolbar && <span className="bg-line hidden h-4 w-px shrink-0 sm:block" />}

        <div className="bar-scroll flex min-w-0 flex-1 items-center gap-2">{toolbar}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty && busy ? (
          <div className="flex h-full items-center justify-center p-6 sm:p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div
                aria-hidden="true"
                className="border-line border-t-ink h-8 w-8 animate-spin rounded-full border-2 motion-reduce:animate-none"
              />
              <p aria-live="polite" className="text-body text-muted tabular-nums">
                {busy}
              </p>
            </div>
          </div>
        ) : empty ? (
          <div className="flex h-full items-center justify-center p-6 sm:p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              {/* 64 outer, 40 inner: the nesting people read as balanced, 1:1.618. */}
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="bg-accent-soft absolute -inset-7 rounded-full blur-2xl"
                />
                <div className="glass-strong specular ring-line text-accent shadow-tile relative grid h-16 w-16 place-items-center rounded-card ring-1">
                  {empty.icon}
                </div>
              </div>
              <h2 className="text-title font-semibold">{empty.title}</h2>
              {/* Measured in characters, which is what readability actually depends on. */}
              <p className="text-muted text-body max-w-[46ch] leading-[1.55]">{empty.hint}</p>
              <FilePicker accept={accept} onFiles={onFiles}>
                <Button variant="primary" className="mt-1">
                  {t.chooseFiles}
                </Button>
              </FilePicker>
            </div>
          </div>
        ) : (
          children
        )}
      </div>

      {(footer || error) && (
        <div className="glass-strong border-line shrink-0 border-t px-3 py-3 sm:px-4">
          {error && (
            <p className="bg-fill text-ink text-footnote mb-2 rounded-inner px-2.5 py-1.5">
              {error}
            </p>
          )}
          {footer && <div className="flex flex-wrap items-center gap-x-4 gap-y-3">{footer}</div>}
        </div>
      )}
    </Dropzone>
  )
}

/** Right-aligned spacer, so bars read left-options, right-actions. */
export function Spacer() {
  return <div className="flex-1" />
}
