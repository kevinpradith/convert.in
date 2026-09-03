import { useContext, type ReactNode } from 'react'
import { Dropzone, FilePicker } from './Dropzone.tsx'
import { Button, cx, MenuIcon } from './kit.tsx'
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
      {/*
        The bar wraps rather than scrolling sideways. Every tool here puts 200 to
        630px of controls in it, and on a phone the title and the menu button
        leave about 140px of the row for them: what a sideways scroller bought
        was a fade at the right-hand edge and four fifths of the controls behind
        it, reachable only by a drag nobody makes. Wrapped, the whole toolbar is
        on screen at 320, which is the width WCAG 1.4.10 measures reflow at.

        Aligned to the top rather than the middle, because the toolbar is the
        child that grows to two or three rows: centred, the title was pushed
        down to sit beside the toolbar's second row while its first row ran
        along the top of the bar with nothing to the left of it.

        That alignment says where an item sits inside its line. It says nothing
        about where the line sits when the bar is taller than its contents, and
        `min-h-bar` makes it taller by 14 pixels whenever a tool has no controls
        to show: every one of those pixels fell below the title, which then read
        as pinned to the ceiling. `content-center` places the line itself, so a
        bar at its minimum height centres what is in it and a bar grown by a
        wrapped toolbar is unaffected, having no spare room to place.
      */}
      {/*
        Its own corners, matched to the window's. The panel already clips this
        bar with `overflow-hidden` and a radius, and Chrome honours that; Gecko
        does not always apply an ancestor's rounded clip to a child carrying its
        own `backdrop-filter`, and the bar is one, so the window came out with a
        square top-right corner there. Carrying the radius rather than relying
        on being cut to it costs two classes and leaves nothing square to show.
      */}
      <div className="glass-strong border-line liquid relative flex shrink-0 flex-wrap content-center items-start gap-x-3 gap-y-1 border-b px-3 py-1 sm:min-h-bar sm:rounded-t-window sm:px-4 lg:rounded-tl-none">
        {/* The title and, below the sidebar breakpoint, the navigation behind
            it. One box, so it keeps a control's height and centres inside it
            however many rows the toolbar beside it turns into. */}
        <div className="flex h-touch shrink-0 items-center gap-3 sm:h-control">
          <Button
            variant="ghost"
            aria-label={t.menu}
            onClick={() => shell?.openNav()}
            className="-ml-1.5 px-2 lg:hidden"
          >
            <MenuIcon />
          </Button>

          <h1 className="text-body font-semibold whitespace-nowrap">{title}</h1>
          {toolbar && <span className="bg-line hidden h-4 w-px sm:block" />}
        </div>

        {/* Its own row below the small breakpoint: at 320 the title leaves too
            little beside it for even one control.

            Rendered only when there is something to put in it. Empty, the box
            still counted as a flex line and still took the row gap with it, so
            a tool with no controls carried four pixels of nothing under its
            title and sat that much too high. */}
        {toolbar && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-1">
            {toolbar}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty && busy ? (
          <div className="flex h-full items-center justify-center p-8 sm:p-10">
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
          // 32 and 40 around a card whose own padding is 32: the space around an
          // element is never less than the space inside it, or the card stops
          // reading as one thing sitting on a surface.
          <div className="flex h-full items-center justify-center p-8 sm:p-10">
            {/*
              The target is the card, not the button on it: the whole surface
              takes a click, which is the same area the eye already reads as the
              place a file goes. The button stays because it is what a keyboard
              reaches, and because a surface that only responds to a drag tells
              nobody it can be clicked at all.
            */}
            <FilePicker accept={accept} onFiles={onFiles} className="block w-[min(36rem,100%)]">
              <div
                className={cx(
                  // Below the small breakpoint the card is as wide as the pane
                  // lets it be, so the ratio is kept by turning it upright:
                  // 1:1.618 rather than 1.618:1, which is the same proportion
                  // in the direction a phone actually has room in. The floor
                  // below stays as the guard for a hint that runs long.
                  'max-sm:aspect-[1/1.618]',
                  // 36rem across, 22.25rem down: one is the other times 1.618,
                  // and every tool's card measures that in both languages. The
                  // height is a floor rather than a fixed size, and the width
                  // is what makes the floor hold: at this measure the longest
                  // hint any tool has still wraps to four lines, so nothing
                  // pushes past it and nothing is clipped if something does.
                  // 26 over 42 is the same ratio again, and the heavier bottom
                  // is what lifts the block off the arithmetic centre onto the
                  // optical one.
                  'flex min-h-[22.25rem] w-full cursor-pointer flex-col',
                  'items-center justify-center px-8 pt-6 pb-10 text-center sm:px-12',
                  // The one opaque surface in a design made of translucent
                  // ones, which is the point: everything else here is something
                  // to look through, and this is the thing to put a file on.
                  'bg-invert specular ring-line shadow-tile rounded-window ring-1',
                  'transition-all duration-200 ease-glass',
                  'hover:shadow-window hover:ring-ink/20 active:scale-[0.995]',
                )}
              >
                {/* 64 outer, 40 inner: the nesting people read as balanced, 1:1.618. */}
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="bg-accent-soft absolute -inset-7 rounded-full blur-2xl"
                  />
                  <div className="glass-strong liquid ring-line text-accent shadow-tile relative grid h-16 w-16 place-items-center rounded-card ring-1">
                    {empty.icon}
                  </div>
                </div>

                {/*
                    24, 12, 40, on the grid every other measure in here sits on.
                    The order is what carries the meaning: the hint sits closest
                    to the heading because they are one statement, the icon a
                    step further because it labels the pair, and the button
                    furthest of all because it is the one thing that acts.
                */}
                <h2 className="text-title mt-6 font-semibold">{empty.title}</h2>
                {/* Measured in characters, which is what readability actually depends on. */}
                <p className="text-muted text-body mt-3 max-w-[62ch] leading-[1.55]">
                  {empty.hint}
                </p>
                <Button variant="primary" className="mt-10">
                  {t.chooseFiles}
                </Button>
              </div>
            </FilePicker>
          </div>
        ) : (
          children
        )}
      </div>

      {(footer || error) && (
        // The foot of the window, and the same reason as the bar at its head:
        // it carries its own radius rather than trusting the panel's clip to
        // round a backdrop-filtered child.
        <div className="glass-strong border-line liquid relative shrink-0 border-t px-4 py-3 sm:rounded-b-window lg:rounded-bl-none">
          {error && (
            // Announced, not just drawn. A failure that only appears as text is
            // a failure a screen reader never mentions, and this bar is the
            // only place a tool ever says something went wrong.
            <p
              role="alert"
              className="bg-fill text-ink text-footnote mb-2 rounded-inner px-2.5 py-1.5"
            >
              {error}
            </p>
          )}
          {/*
              The last thing in a tool's footer is always the button that does
              the work, and `ml-auto` keeps it against the right edge of
              whatever row it lands on. Without it the bar reads correctly until
              it wraps, and then the primary action is suddenly bottom-left with
              a gap after it.
          */}
          {footer && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 [&>:last-child]:ml-auto">
              {footer}
            </div>
          )}
        </div>
      )}
    </Dropzone>
  )
}

/**
 * Right-aligned spacer, so bars read left-options, right-actions.
 *
 * Gone below the small breakpoint, where the bars wrap. A flex-1 element in a
 * wrapping row takes the whole rest of the line it lands on, so on a phone this
 * was buying a blank row: Organize's toolbar stood 211px tall in a 483px
 * window, and about a fifth of that was a spacer holding a line open.
 */
export function Spacer() {
  return <div className="hidden flex-1 sm:block" />
}
