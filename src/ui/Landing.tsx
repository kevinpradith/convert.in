import { cx } from './kit.tsx'
import { useT } from './i18n.ts'
import type { Lang } from './prefs.ts'

/**
 * The page around the window: a sky the glass has something to be glass
 * against, a hero that says what this is, and a bank of cloud that dissolves
 * the photograph into the footer rather than cutting it off with a line.
 */

/**
 * Its own fixed layer rather than a background on the body, because a fixed
 * background attachment is the one thing iOS Safari still gets wrong, and it
 * shears visibly as the page scrolls.
 */
/**
 * One photographed cloud, reused everywhere. Every instance is the same file,
 * so the browser decodes it once; what makes them read as different clouds is
 * size, which side is up, and how much of each is hidden behind something else.
 */
function Cloud({ className, flip }: { className: string; flip?: boolean }) {
  return (
    <img
      src="./cloud.webp"
      alt=""
      aria-hidden="true"
      // Its own size, so the box is reserved before the file arrives rather
      // than collapsing to nothing and then pushing the page open.
      width={942}
      height={526}
      /* Not drawn at all below the medium breakpoint, and a hidden image is
         still fetched: on a phone this was 32 KiB pulled down the critical path
         for three pictures nobody is shown. Lazy is what makes the browser
         check whether the layout wants it first. */
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cx('pointer-events-none absolute select-none', flip && '-scale-x-100', className)}
    />
  )
}

export function Hero({ lang, onLang }: { lang: Lang; onLang: (lang: Lang) => void }) {
  const t = useT()

  return (
    <section className="relative z-10 flex w-full flex-col">
      {/* Drawn before everything else in here, so the type and the buttons sit
          in front of them. The low one overflows the section on purpose: the
          window below is painted after this and cuts it off, which is the
          cheapest honest depth cue on the page. */}
      {/*
          Still. The clouds used to drift about thirty pixels over three quarters
          of a minute, which is far less than a pixel a frame, and a compositor
          moving a layer that slowly snaps it to whole device pixels: the cloud
          held still, jumped a pixel, held still again, and several of them doing
          that out of step read as the sky twitching. Measured, the drift cost
          the page 60fps down to about 35 and bought motion nobody could see
          except as that fault. The grouping wrappers are kept so bringing it
          back is one class on each of five elements.
      */}
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="top-[6%] right-[-4%] hidden w-[34%] max-w-[560px] md:block" />
        <Cloud
          className="top-[40%] left-[-7%] hidden w-[28%] max-w-[460px] opacity-90 md:block"
          flip
        />
        <Cloud className="bottom-[-16%] left-[2%] hidden w-[26%] max-w-[430px] lg:block" />
      </div>

      {/* The window below is 1100 wide, so the bar above it and the line
          under it are too: three things at one measure rather than a page
          gutter that happens to differ from the thing it frames. */}
      {/*
        No overlay across the hero at all. The last one left was a strip behind
        the bar at the top, and a full-width box inside the page stops at the
        layout viewport while the fixed picture behind it does not: the width of
        the scrollbar was enough to show the join. The bar's own type carries
        the same shadow as the rest of the hero instead.
      */}
      {/*
          The bar and the window below it are both 1100 wide, and from the width
          where the window stops touching the edges the bar drops its own gutter
          so the mark starts exactly where the window's left edge does. Keeping
          a 24 gutter here instead reads as the bar being indented from the
          thing it introduces.
      */}
      <nav className="relative mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-center gap-x-4 gap-y-3 px-6 py-6 sm:justify-between lg:px-0">
        {/* The white cut of the wordmark: the hero sits on a photograph, and
            the ink one disappears into it. */}
        <img
          src="./images/logo/logo.webp"
          alt="convert.in"
          // The intrinsic size. The height class overrides it, but the ratio
          // between the two is what holds the width open until the file lands.
          width={628}
          height={183}
          // Same halo the nav links carry. A white mark on a photograph of a
          // white cloud has nothing else holding it up.
          className="h-7 w-auto object-contain [filter:drop-shadow(0_1px_2px_rgb(8_30_62/0.55))_drop-shadow(0_3px_10px_rgb(8_30_62/0.4))]"
        />

        <div className="text-footnote flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-medium text-white sm:gap-x-6 [text-shadow:0_1px_2px_rgb(8_30_62/0.65),0_3px_10px_rgb(8_30_62/0.5)]">
          <a
            href="https://github.com/kevinpradith/convert.in#readme"
            target="_blank"
            rel="noreferrer"
            className="py-1 transition-colors hover:text-white"
          >
            {t.hero.docs}
          </a>
          {/* Kept at every width. Two words each, and navigation that is not
              shown at all is worse than navigation behind a menu: hidden
              navigation already measures 20% less discoverable, and this was
              not hidden, it was gone. */}
          {/* py-1 takes these from 18 tall to 26. A pointer target is 24 by 24
              at AA, and a line of text on its own is under it. */}
          <a href="#tools" className="py-1 transition-colors hover:text-white">
            {t.hero.tools}
          </a>

          {/* The only control the page carries above the window, and the only
              place the language can be changed, so it stays at every width. */}
          <div
            role="group"
            aria-label={t.language}
            className="flex items-center gap-0.5 rounded-capsule border border-white/40 bg-white/10 p-0.5 backdrop-blur-md"
          >
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onLang(code)}
                aria-pressed={lang === code}
                className={cx(
                  // 28 tall. The AA floor for a target is 24, and this is the
                  // one control the page carries above the window.
                  'rounded-capsule px-2.5 py-1.5 uppercase transition-colors',
                  lang === code ? 'text-ink bg-white/90' : 'text-white/80 hover:text-white',
                )}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/*
          The top space is a step on the same scale as everything else rather
          than a share of the viewport: 10vh is 68 on a laptop and 128 on a
          large desktop, and a rhythm that changes with the window is not one.
      */}
      <div className="relative flex w-full flex-col items-center px-6 pt-16 pb-16 text-center md:pt-24 md:pb-36">
        {/* One measure with the bar above and the window below. The paragraph
            is the only thing that pulls in tighter, and it does that for a
            reason about reading rather than about layout. */}
        <div className="mx-auto w-full max-w-[1100px]">
          <p className="rise text-footnote mb-6 inline-block rounded-capsule border border-white/25 bg-sky-shade/55 px-4 py-1.5 font-medium tracking-wide text-white shadow-sm backdrop-blur-md [animation-delay:0ms]">
            {t.hero.badge}
          </p>

          <h1 className="rise mb-6 text-[2rem] leading-[1.08] sm:text-[2.75rem] font-bold tracking-tight text-balance text-white [text-shadow:0_1px_2px_rgb(8_30_62/0.55),0_6px_24px_rgb(8_30_62/0.45)] [animation-delay:80ms] md:text-[4.5rem]">
            {t.hero.title}
            <br />
            {/* 600 rather than 500. Set beside Inter at 700, a high-contrast
                display face reads a weight lighter than its number says. */}
            <i className="font-serif font-semibold">{t.hero.titleEm}</i>
          </h1>

          {/*
            Wide enough to hold 55 to 65 characters a line, which is the range
            people read fastest, and set at 1.5 because a line that long needs
            the leading to find its way back to the start of the next one.

            18 on a phone, 20 from the small breakpoint, 24 from the medium one.
            A 24px line on a 320px screen is four words wide and pushes the
            buttons off the first screen; the size was originally held there
            because WCAG counts 24 as large type and lets it pass at 3:1 rather
            than 4.5, but this text sits on a photograph at about 1.1:1 either
            way, so the size is bought nothing and cost the layout.
          */}
          <p className="rise mx-auto mb-12 max-w-[56rem] text-lg text-pretty leading-[1.5] sm:text-xl md:text-2xl font-medium text-white [text-shadow:0_1px_2px_rgb(8_30_62/0.6),0_4px_16px_rgb(8_30_62/0.45)] [animation-delay:160ms]">
            {t.hero.sub}
          </p>

          {/*
            One of these is the thing to do and the other is for the people who
            want to read the source first, so they are not the same size, the
            same weight or the same colour. The labels were inheriting the app's
            13px body size, which is right inside a toolbar and much too quiet
            for the one button the page is built around.
          */}
          <div className="rise text-headline relative z-20 mx-auto flex w-fit flex-col items-center justify-center gap-4 [animation-delay:240ms] sm:flex-row">
            <a
              href="#tools"
              className={cx(
                // Ink, not the accent. The accent is a blue, and a blue button
                // on a photograph of a blue sky is a button that has to be
                // looked for. Black is the only thing in the palette the sky
                // cannot swallow.
                'bg-ink text-invert shadow-accent flex w-full items-center justify-center gap-2',
                'rounded-capsule px-9 py-4 font-semibold transition-all duration-200 ease-glass',
                'hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 sm:w-auto',
              )}
            >
              {t.hero.start}
              {/* Points where the link goes, which is down the page. */}
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 3.5v9M4 8.5l4 4 4-4" />
              </svg>
            </a>

            <a
              href="https://github.com/kevinpradith/convert.in"
              target="_blank"
              rel="noreferrer"
              className={cx(
                // Second, and it has to look it. Two buttons of the same size
                // and weight beside each other is a choice the reader has to
                // stop and make. Smaller, lighter and a thinner rim than the
                // one beside it, but still a filled button: a ghost one is
                // measurably harder to find and measurably less clicked, so
                // the way to make this quieter is not to stop drawing it.
                'flex w-full items-center justify-center gap-2 rounded-capsule border border-white/35',
                'bg-sky-shade/65 px-6 py-3 font-medium text-white backdrop-blur-md',
                'transition-all duration-200 ease-glass hover:bg-sky-shade/80 sm:w-auto',
              )}
            >
              <GitHubMark />
              {t.hero.repo}
            </a>
          </div>

          {/*
              Under the button, not in the footer. The three things someone
              weighs in the second before a click are whether it costs an
              account, whether the file leaves the machine, and whether it is
              being counted, and an answer read after the click is an answer
              that arrived too late.
          */}
          <p className="rise text-body mt-5 font-medium text-white [text-shadow:0_1px_2px_rgb(8_30_62/0.9),0_2px_10px_rgb(8_30_62/0.75)] [animation-delay:320ms]">
            {t.hero.assure}
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * Three wave layers over a gradient of the footer's own colour. They rise past
 * the window's bottom edge rather than stopping under it, which is what gives
 * the page its depth: the window sits inside the weather rather than on top of
 * a picture of it.
 *
 * Only the front layer is opaque, and it clears the window by a few pixels. The
 * two behind it are translucent and blurred, so where they cross the interface
 * they read as haze and the controls underneath stay legible and clickable
 * (the whole bank is `pointer-events-none`).
 */
export function CloudFooter() {
  const t = useT()

  return (
    <section className="pointer-events-none relative z-20 w-full">
      <div className="from-invert via-invert/75 absolute bottom-full left-0 z-10 h-[140px] w-full bg-linear-to-t to-transparent" />

      {/*
        A bank rather than a row: two ranks of the same cloud, the far one
        blurred and smaller, the near one larger and hanging further down so it
        overlaps both its own rank and the footer's white. Nothing lines up with
        anything, which is the whole job.
      */}
      {/*
        Clipped, and given a height to be clipped against. The near rank hangs
        below this box on purpose, and without the clip that overhang lengthens
        the page: the document ends up taller than the footer and a band of sky
        appears under it.

        The mask is what the clip would otherwise cost. These clouds carry their
        own grey shading, so cutting them against the footer's white left a line
        you could see; fading the last 150px out means they dissolve into it.
      */}
      <div
        aria-hidden="true"
        className="absolute bottom-full left-0 z-20 h-[460px] w-full overflow-hidden [-webkit-mask-image:linear-gradient(to_top,transparent_0,#000_150px)] [mask-image:linear-gradient(to_top,transparent_0,#000_150px)]"
      >
        <div className="absolute inset-0">
          {BANK.map(({ key, className, flip }) => (
            <Cloud key={key} className={className} flip={flip} />
          ))}
        </div>
      </div>

      {/*
        The minimal pattern: a copyright notice and the few links that have to
        be somewhere, and nothing that already exists further up the page. It
        used to repeat the hero's own sentence back at the reader and then set
        the word MIT next to it as plain text, which said nothing and led
        nowhere.

        The notice is worded to match LICENSE exactly, because that is the
        copyright notice of record and two different ones is worse than none.
      */}
      <div className="bg-invert pointer-events-auto relative z-30 w-full px-6 pt-12 pb-14 lg:px-7">
        <div className="text-muted text-footnote mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:justify-between lg:px-0">
          <span>© 2026 Kevin Praditiansyah</span>

          <span className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <a
              href="https://github.com/kevinpradith/convert.in"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink py-1 transition-colors"
            >
              GitHub
            </a>
            {/* The bundle carries Apache-2.0 and MIT code whose notices have to
                travel with it. Shipping the file is the requirement; linking it
                is what makes it reachable by the people it is meant for. */}
            <a
              href="./THIRD-PARTY-NOTICES.txt"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink py-1 transition-colors"
            >
              {t.licences}
            </a>
            <a
              href="https://github.com/kevinpradith/convert.in/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink py-1 transition-colors"
            >
              MIT
            </a>
          </span>
        </div>
      </div>
    </section>
  )
}

/**
 * Two ranks. The far one sits higher, smaller and softened; the near one is
 * bigger and hangs down past the footer's edge so its base disappears into the
 * white rather than ending on a line. Offsets are percentages so the bank keeps
 * its proportions on a phone and on a 4K screen alike.
 */
const BANK: { key: string; className: string; flip?: boolean }[] = [
  { key: 'far-1', className: 'bottom-[-140px] left-[-10%] w-[40%] max-w-[600px] opacity-55' },
  {
    key: 'far-2',
    className: 'bottom-[-168px] left-[24%] w-[44%] max-w-[650px] opacity-50',
    flip: true,
  },
  { key: 'far-3', className: 'bottom-[-151px] left-[60%] w-[42%] max-w-[620px] opacity-55' },
  { key: 'near-1', className: 'bottom-[-166px] left-[-14%] w-[50%] max-w-[700px]', flip: true },
  { key: 'near-2', className: 'bottom-[-200px] left-[20%] w-[54%] max-w-[760px]' },
  { key: 'near-3', className: 'bottom-[-183px] left-[56%] w-[52%] max-w-[730px]', flip: true },
  { key: 'near-4', className: 'bottom-[-132px] left-[84%] w-[44%] max-w-[640px]' },
]

const LANGS = ['en', 'id'] as const

/**
 * The clouds the window stands in front of. They are placed to cross the window
 * itself rather than to sit under it: what is left of them either side of it,
 * cut off along its edges, is the whole reason the page reads as having depth.
 * A cloud below the window is just a cloud below the window.
 */
export function CloudBehind() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 hidden md:block"
    >
      <div className="absolute inset-0">
        <Cloud className="bottom-[520px] left-[-10%] w-[28%] max-w-[520px] opacity-50" flip />
        <Cloud className="bottom-[300px] left-[-14%] w-[34%] max-w-[620px]" />
        <Cloud className="bottom-[420px] left-[62%] w-[36%] max-w-[660px]" flip />
      </div>
    </div>
  )
}

/**
 * And the ones it stands behind. Their job is the strip immediately under the
 * window: an edge with a shadow beneath it, ending on open sky, is the one
 * place the whole page looks pasted together. Here the edge goes into cloud
 * instead.
 *
 * They lap the foot by about fourteen pixels and no more. That is the rounded
 * corner and the hairline, which is enough for the window to read as sitting in
 * the weather; the bar along that edge is where every tool keeps its options
 * and the button that does the work, and its own bottom padding is deeper than
 * the lap, so nothing lands on a control. The widths are capped for the same
 * reason: uncapped, a wide window grows the clouds and the lap with it.
 */
/**
 * The pair that crosses the top edge. Flipped head over heels, so the side that
 * meets the window is the soft one the picture feathers out to rather than its
 * flat base, and hung from above so they tie the window back into the hero.
 *
 * The lap is the same sixteen pixels the foot gets, for the same reason: the
 * bar along the top holds a title and four controls, and its own padding is
 * deeper than that, so nothing lands on anything anyone has to hit.
 */
export function CloudOverTop() {
  return (
    <div
      aria-hidden="true"
      className={cx(
        // Anchored by the edge that has to land on the window: the box ends
        // sixteen pixels below the panel's top, the clouds sit on that floor,
        // and the lap stops depending on how tall the cloud renders.
        'pointer-events-none absolute inset-x-0 top-[-120px] z-20 hidden h-[136px] overflow-hidden md:block',
        '[-webkit-mask-image:linear-gradient(to_bottom,transparent_0,#000_96px)]',
        '[mask-image:linear-gradient(to_bottom,transparent_0,#000_96px)]',
      )}
    >
      <div className="absolute inset-0">
        <Cloud className="bottom-0 left-[-8%] w-[40%] max-w-[640px] -scale-y-100 opacity-80" />
        <Cloud className="bottom-0 left-[58%] w-[38%] max-w-[600px] -scale-y-100 opacity-75" flip />
      </div>
    </div>
  )
}

export function CloudFront() {
  return (
    <div
      aria-hidden="true"
      className={cx(
        'pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden h-[380px] overflow-hidden md:block',
        // Same pair of measures the footer's bank needs, and for the same two
        // reasons: clipped so the overhang cannot lengthen the page, masked so
        // the clip is a fade rather than a line.
        '[-webkit-mask-image:linear-gradient(to_top,transparent_0,#000_110px)]',
        '[mask-image:linear-gradient(to_top,transparent_0,#000_110px)]',
      )}
    >
      {/*
          Four, at four different depths, because three of the same size at the
          same height read as a border rather than as weather. The deepest lap
          is the one on the far left, where the panel's own foot is the empty
          bottom of the sidebar; the two that cross the tool's action bar are
          the shallow ones, so a control never sits under anything but haze.
      */}
      <div className="absolute inset-0">
        <Cloud className="top-[44px] left-[-18%] w-[48%] max-w-[720px] opacity-85" />
        <Cloud className="top-[86px] left-[16%] w-[54%] max-w-[800px] opacity-70" flip />
        <Cloud className="top-[78px] left-[46%] w-[42%] max-w-[660px] opacity-80" />
        <Cloud className="top-[94px] left-[74%] w-[50%] max-w-[750px] opacity-85" flip />
      </div>
    </div>
  )
}

function GitHubMark() {
  return (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}
