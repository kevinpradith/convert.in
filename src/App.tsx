import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Boundary } from './ui/Boundary.tsx'
import { CloudBehind, CloudFooter, CloudFront, CloudOverTop, Hero } from './ui/Landing.tsx'
import { Sidebar, ShellContext, TOOL_IDS, type ToolId } from './ui/Sidebar.tsx'
import { LangContext, STRINGS } from './ui/i18n.ts'
import { loadLang, saveLang, type Lang } from './ui/prefs.ts'
import { Button, cx } from './ui/kit.tsx'

/*
  Split at the tool, not at the page. Someone who lands here is shown a sky, a
  headline and one tool; the other nine carry the PDF and codec code with them,
  and pulling all ten into the first response makes the landing page pay for
  work nobody has asked for yet. Each of these arrives on the click that needs
  it and stays loaded afterwards.
*/
const TOOL_VIEWS: Record<ToolId, ReturnType<typeof lazy>> = {
  convert: lazy(() => import('./ui/tools/Convert.tsx').then((m) => ({ default: m.Convert }))),
  compress: lazy(() => import('./ui/tools/Compress.tsx').then((m) => ({ default: m.Compress }))),
  images: lazy(() =>
    import('./ui/tools/ImagesToPdf.tsx').then((m) => ({ default: m.ImagesToPdf })),
  ),
  organize: lazy(() => import('./ui/tools/Organize.tsx').then((m) => ({ default: m.Organize }))),
  stamp: lazy(() => import('./ui/tools/Stamp.tsx').then((m) => ({ default: m.Stamp }))),
  sign: lazy(() => import('./ui/tools/Sign.tsx').then((m) => ({ default: m.Sign }))),
  protect: lazy(() => import('./ui/tools/Protect.tsx').then((m) => ({ default: m.Protect }))),
  clean: lazy(() => import('./ui/tools/Clean.tsx').then((m) => ({ default: m.Clean }))),
  redact: lazy(() => import('./ui/tools/Redact.tsx').then((m) => ({ default: m.Redact }))),
  export: lazy(() =>
    import('./ui/tools/PdfToImages.tsx').then((m) => ({ default: m.PdfToImages })),
  ),
}

/** Holds the pane's height while a tool's chunk is on the way, so the window
 *  does not collapse and snap back on the first click. */
function Loading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div
        aria-hidden="true"
        className="border-line border-t-ink h-8 w-8 animate-spin rounded-full border-2 motion-reduce:animate-none"
      />
    </div>
  )
}

export default function App() {
  const [active, setActive] = useState<ToolId>('convert')
  const [opened, setOpened] = useState<ReadonlySet<ToolId>>(() => new Set<ToolId>(['convert']))
  const [lang, setLang] = useState<Lang>(loadLang)
  const nav = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    setOpened((seen) => (seen.has(active) ? seen : new Set(seen).add(active)))
  }, [active])

  useEffect(() => {
    saveLang(lang)
    document.documentElement.lang = lang
  }, [lang])

  /*
    A modal dialog holds the rest of the document inert for as long as it is
    open. Dragged past the breakpoint where the sidebar appears, the drawer is
    hidden by its own `lg:hidden` while still being open, and the page behind it
    would be left dead with nothing on screen to close.
  */
  useEffect(() => {
    const wide = window.matchMedia('(width >= 64rem)')
    const close = () => {
      if (wide.matches) nav.current?.close()
    }
    wide.addEventListener('change', close)
    return () => wide.removeEventListener('change', close)
  }, [])

  return (
    <LangContext value={lang}>
      <ShellContext value={{ openNav: () => nav.current?.showModal() }}>
        <Hero lang={lang} onLang={setLang} />

        {/*
          Edge to edge on a phone, a floating window from the small breakpoint
          up. The height is fixed rather than the viewport's: the page scrolls
          past it, and the tools inside measure their own scrolling areas
          against this.

          1100 by 680 is the window at its full size, which is 1.618 to 1. The
          floor under it is not a ratio but a measurement: 608 is what the tool
          list needs to stand at its full length, and anything shorter puts a
          scrollbar inside the sidebar and hides the last tool from anyone whose
          window is a little short.
        */}
        <section id="tools" className="relative z-10 px-0 pb-[240px] sm:px-4 lg:px-7">
          <CloudBehind />

          <div className="ring-line shadow-window liquid relative z-10 mx-auto flex h-[100dvh] max-w-[1100px] sm:h-[min(85dvh,680px)] lg:h-[min(80vh,680px)] lg:min-h-[608px] overflow-hidden rounded-none ring-1 sm:rounded-window">
            <aside className="glass specular border-line relative hidden w-sidebar shrink-0 flex-col border-r lg:flex">
              <Sidebar active={active} onSelect={setActive} lang={lang} />
            </aside>

            {/* All of them stay mounted: switching tools should not throw away loaded pages. */}
            <main className="pane flex min-w-0 flex-1 flex-col">
              {TOOL_IDS.map((id) => {
                // Mounted from the first time it is opened and never after that
                // unmounted, so a tool keeps the files loaded into it while the
                // sidebar wanders off to another one and back.
                if (id !== active && !opened.has(id)) return null
                const View = TOOL_VIEWS[id]
                return (
                  <div
                    key={id}
                    className={cx(id === active ? 'flex min-h-0 flex-1 flex-col' : 'hidden')}
                  >
                    {/* One boundary each, not one around the lot: a tool that
                        breaks should not take the other four's loaded files
                        down with it. */}
                    <Boundary lang={lang}>
                      <Suspense fallback={<Loading />}>
                        <View />
                      </Suspense>
                    </Boundary>
                  </div>
                )
              })}
            </main>
          </div>

          <CloudOverTop />
          <CloudFront />
        </section>

        <CloudFooter />

        {/*
          A <dialog> opened with showModal(), rather than a div with a scrim
          under it. Everything a modal owes the person using it comes with the
          element and none of it had been written by hand: focus moves into the
          panel and cannot leave it, the rest of the page goes inert instead of
          staying tabbable behind the overlay, Escape closes, focus returns to
          the button that opened it, and a screen reader is told this is a modal
          dialog. Measured before this, the drawer had none of them: focus never
          left the hamburger, eleven controls behind the overlay stayed
          reachable by Tab, and the panel carried no role at all.

          The two things showModal() does not do are here: the backdrop closes
          on a click, and the page behind is stopped from scrolling by the rule
          in index.css.
        */}
        <dialog
          ref={nav}
          aria-label={STRINGS[lang].menu}
          onClick={(event) => {
            // The dialog's own box is the backdrop as far as a click is
            // concerned; anything inside the panel has a different target.
            if (event.target === nav.current) nav.current.close()
          }}
          className={cx(
            // A <dialog> arrives centred, boxed and shrink-wrapped. This is a
            // panel down the left edge instead.
            'fixed top-0 left-0 m-0 h-dvh max-h-none max-w-none border-0 p-0',
            'w-[min(84vw,var(--spacing-sidebar))] lg:hidden',
            'glass specular ring-line shadow-window ring-1',
            'backdrop:bg-black/35 backdrop:backdrop-blur-[2px]',
          )}
        >
          <div className="flex h-full flex-col">
            {/*
              The drawer says what it is and offers the way out. It sits in the
              52px the traffic lights hold open in the window, which in here was
              an empty band above the first row and nothing else.

              A scrim that closes on a tap is the convention and it stays, but
              it is invisible, unlabelled and not a thing anyone can reach from
              a keyboard or a screen reader. This is the one that can.
            */}
            <div className="border-line flex h-bar shrink-0 items-center gap-2 border-b pr-2 pl-4">
              <h2 className="text-body flex-1 font-semibold">{STRINGS[lang].menu}</h2>
              <Button
                variant="ghost"
                aria-label={STRINGS[lang].closeMenu}
                onClick={() => nav.current?.close()}
                className="px-2"
              >
                <CloseIcon />
              </Button>
            </div>

            <Sidebar
              active={active}
              onSelect={(id) => {
                setActive(id)
                nav.current?.close()
              }}
              lang={lang}
            />
          </div>
        </dialog>
      </ShellContext>
    </LangContext>
  )
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}
