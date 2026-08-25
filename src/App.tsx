import { useEffect, useState } from 'react'
import { Clean } from './ui/tools/Clean.tsx'
import { Compress } from './ui/tools/Compress.tsx'
import { Convert } from './ui/tools/Convert.tsx'
import { ImagesToPdf } from './ui/tools/ImagesToPdf.tsx'
import { Organize } from './ui/tools/Organize.tsx'
import { PdfToImages } from './ui/tools/PdfToImages.tsx'
import { Protect } from './ui/tools/Protect.tsx'
import { Sign } from './ui/tools/Sign.tsx'
import { Stamp } from './ui/tools/Stamp.tsx'
import { Boundary } from './ui/Boundary.tsx'
import { Sidebar, ShellContext, TOOL_IDS, type ToolId } from './ui/Sidebar.tsx'
import { LangContext } from './ui/i18n.ts'
import {
  applyTheme,
  loadLang,
  loadTheme,
  saveLang,
  saveTheme,
  type Lang,
  type Theme,
} from './ui/prefs.ts'
import { cx } from './ui/kit.tsx'

export default function App() {
  const [active, setActive] = useState<ToolId>('convert')
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [lang, setLang] = useState<Lang>(loadLang)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    saveLang(lang)
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    if (!navOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [navOpen])

  const settings = { lang, onLang: setLang, theme, onTheme: setTheme }

  return (
    <LangContext value={lang}>
      <ShellContext value={{ openNav: () => setNavOpen(true) }}>
        {/* Edge to edge on a phone, a floating window from the small breakpoint up. */}
        <div className="h-full p-0 sm:p-4 lg:p-7">
          <div className="ring-line shadow-window flex h-full overflow-hidden rounded-none ring-1 sm:rounded-window">
            <aside className="glass specular border-line hidden w-sidebar shrink-0 border-r lg:block">
              <Sidebar active={active} onSelect={setActive} {...settings} />
            </aside>

            {/* All of them stay mounted: switching tools should not throw away loaded pages. */}
            <main className="pane flex min-w-0 flex-1 flex-col">
              {TOOL_IDS.map((id) => (
                <div key={id} className={cx(id === active ? 'flex min-h-0 flex-1 flex-col' : 'hidden')}>
                  {/* One boundary each, not one around the lot: a tool that
                      breaks should not take the other four's loaded files
                      down with it. */}
                  <Boundary lang={lang}>
                    {id === 'convert' && <Convert />}
                    {id === 'compress' && <Compress />}
                    {id === 'images' && <ImagesToPdf />}
                    {id === 'organize' && <Organize />}
                    {id === 'stamp' && <Stamp />}
                    {id === 'sign' && <Sign />}
                    {id === 'protect' && <Protect />}
                    {id === 'clean' && <Clean />}
                    {id === 'export' && <PdfToImages />}
                  </Boundary>
                </div>
              ))}
            </main>
          </div>
        </div>

        {navOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setNavOpen(false)}
              className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            />
            <div className="glass specular ring-line shadow-window absolute inset-y-0 left-0 w-[min(84vw,var(--spacing-sidebar))] ring-1">
              <Sidebar
                active={active}
                onSelect={(id) => {
                  setActive(id)
                  setNavOpen(false)
                }}
                {...settings}
              />
            </div>
          </div>
        )}
      </ShellContext>
    </LangContext>
  )
}
