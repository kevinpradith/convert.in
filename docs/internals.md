# How it is built

Why the interface looks the way it does, what the first paint costs, and the
four decisions inside the PDF work that took the longest to get right. None
of this is needed to use the tools; it is here for anyone reading the source.

## Design

Three sections: what the interface is made of, the type and spacing it is set
on, and how both survive a phone.

### Look

Apple's current design language: translucent layers over a backdrop, radii that
nest concentrically (an inner radius is its parent's minus the padding between
them), and controls sized the way a Mac sizes them.

The backdrop is a photograph of a sky, which is what the glass has to refract.
Everything above it is white at partial opacity, so the surfaces take their
colour from what is behind them rather than from a token. One accent, `#0d6ee0`,
is spent only on what a person acts on: the primary button, the current
selection, the active tool, the focus ring. It measures 4.87:1 against the white
it carries, which clears WCAG 2.2 AA for text of any size.

Depth does the rest: layered shadows, a lit top edge on every pane, and a 4.5%
film of SVG noise so the large soft gradients do not band on 8-bit displays.

One palette, declared once. There is no dark variant to keep in sync and no
switch to keep both honest under: the window is glass over a photograph, and a
dark palette has nothing to be underneath it.

The three accessibility settings Apple's own glass was criticised for ignoring
are honoured: `prefers-reduced-transparency` drops the blur and makes surfaces
opaque, `prefers-contrast: more` strengthens borders and secondary text, and
`prefers-reduced-motion` removes the transitions.

### Scale

Type follows the macOS text styles, named as Apple names them: caption 11,
footnote 12, body 13, headline 15, title 17, display 21. Body is 13 because that
is what a Mac window uses. Spacing and control heights sit on the 4pt grid.

The golden ratio is used where it does real work and not as a grid: the display
step is body x 1.618, and the empty-state icon nests 40 inside 64. Line length is
capped in `ch` rather than pixels, because that is what readability depends on.

### Responsive

One layout, three shapes:

| Width        | Shape                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| `< 640px`    | Edge to edge, no window chrome, two tile columns, toolbars scroll sideways behind a fade |
| `640–1023px` | Floating window, sidebar still behind the menu button                                    |
| `>= 1024px`  | Sidebar pinned open                                                                      |

Below 1024px the sidebar becomes a drawer rather than a second navigation: it is
the same component, so there is one thing to keep correct. The drawer is a
native `<dialog>` opened with `showModal()`, which is where the modal role, the
focus trap, the inert background, Escape and the return of focus to the button
that opened it all come from without being written. Picking a tool closes it,
and so does crossing back above 1024px.

On a coarse pointer every control grows to the 44px minimum touch target, and
the per-tile remove button stops hiding behind hover, since there is no hover to
reveal it. The viewport uses `dvh` so a phone's disappearing toolbar cannot crop
the footer, and `env(safe-area-inset-*)` keeps the interface clear of notches.

## Performance

The page has to be a page before the application is one. Everything below is
measured against `dist/`, served gzipped with the headers this project ships.

- **The hero is in the HTML.** `scripts/prerender.mts` renders the same
  component the app mounts and writes it into `dist/index.html`, so the largest
  paint is text the browser already has rather than something React has yet to
  produce. React mounts over the top and replaces those nodes with its own; the
  two agree because they are the same component, and the entrance animation is
  suppressed on the replacements so nothing moves twice.
- **The stylesheet is inlined.** It is 9.9 kB gzipped and it blocks the first
  paint, so as a separate file it cost a round trip before the browser knew what
  the page looked like, and another before it learned the fonts existed. There
  is one HTML page here and the CSS is rebuilt with it, so there was nothing to
  lose by giving up its cache entry. The first response is 12.2 kB gzipped and
  carries the whole first screen.
- **The bundle waits for it.** The 76 kB gzipped entry chunk is loaded from
  `boot.js` on `load`, with a two-second timer behind it in case `load` never
  fires. It is a file rather than an inline script because the CSP allows
  neither inline script nor `eval`, and three lines are not worth weakening it
  for.
- **A PDF writer is not downloaded to convert a PNG.** pdf-lib is 278 kB
  gzipped and shared by seven of the ten tools, so it landed in the chunk they
  have in common, which is also the one the image converter needs. It is named
  as its own group in `vite.config.ts` instead. pdf.js is larger still, and its
  worker is now configured inside the module that opens it rather than at
  start-up, so it is fetched by the tools that rasterise and by nobody else.
- **Two typefaces, both cut down and served from here.** No third-party font
  host, which the CSP would refuse anyway. The display italic exists for one
  line of the page, so it is subset to the twenty-two characters the two
  headlines spell: 39 KiB becomes 7 KiB, and `test/display-font.test.ts` fails
  if the headline is ever reworded past that alphabet.

Lighthouse against that build, emulated mobile, throttled: **99** performance,
**100** accessibility, **100** best practices, **100** SEO. Largest paint 2.1 s,
total blocking time 0 ms, layout shift 0.018.

## How it works

Four decisions inside `src/core` that a person meets only when they are wrong.

### The page a reader sees, not the page the file describes

A page carries a MediaBox saying how big the sheet is and, often, a CropBox
saying how much of it to display. Where the two differ the CropBox wins, and
everything outside it is simply not drawn: a 600-point page cropped to its
middle 300 is a 300-point page to everybody but the file itself. Neither box has
to start at the origin either.

`visibleBox` answers that question once, and `info`, `watermark`, `number`,
`sign` and `resize` all ask it rather than reading the sheet. The same idea runs
through `/Rotate`: a page stored sideways is measured the way it is looked at.
Both are the kind of thing that is invisible until it is wrong, and then the
page number is drawn onto a part of the sheet nobody can see.

### One sheet for every page

A PDF does not require one page size: every page carries its own box, and a
document assembled from a scan, an export and a downloaded form quite legally
holds three. That is fine on screen and chaos on paper, where the printer
rescales, shifts the margins or changes tray at every size change.

`resize`, and the **Sheet** control in Organize, put them all on one. The
content is scaled to fit and centred rather than stretched, so nothing changes
shape and nothing is cropped, and annotations are scaled with it — a comment
that stays where it was is a comment pointing at the wrong line. The default
turns the sheet to match each page, so a landscape chart does not come back
letterboxed between two white bands, and a page stored sideways is measured the
way it is looked at rather than the way its box happens to be written.

### Bookmarks come with their pages

A PDF's table of contents is a tree hanging off the catalogue, and every entry
names its page by reference. Copying pages into a new document does not bring
it: the references point at objects that are no longer part of anything, so
merging or extracting silently throws the whole outline away. That is the
complaint on every forum thread about merging PDFs, and it is why Sejda sells
keeping them as a feature.

`assemblePages` rebuilds the tree against the pages that actually came across,
so merge, select, split and reorder all keep it without knowing they do. Merging
lays the sources' outlines end to end. Reordering moves each entry with its
page. An entry whose page was left out is dropped rather than pointed somewhere
plausible, because a bookmark that jumps to the wrong chapter is worse than one
that is missing: only the second is noticed. Destinations written out in full
and destinations referred to by name through the `/Names /Dests` tree are both
resolved, since plenty of writers choose the second.

`npm run test:cli` reads the result back with pypdf, which shares no code with
what wrote it.

### Redaction that removes what it covers

A black rectangle drawn over a paragraph hides nothing. PDF renders in layers,
so the characters underneath survive the shape on top of them, still selectable
and still copyable; that is how the details behind the bars in the Manafort
filings were read, and the same mistake is made every week.

The only removal this project can make and then prove is to stop the page being
text at all. Each page is rendered to pixels, the rectangles are painted onto
those pixels, and the document is rebuilt from the images. There is no text
object left to select, no vector path to lift and no earlier revision to
recover, because the objects that held them are not carried across. The
information dictionary and the XMP packet go too, since a redacted document that
still names its author has only moved the leak.

What that costs is stated in the tool rather than buried here: the text stops
being searchable and selectable for the recipient as well, and the file is
usually larger. Both are the price of the guarantee, not a defect in it.

Two ways to say where. Dragging suits a signature, a photograph or a corner of a
scan. Searching suits what dragging is worst at — a name that appears forty
times across nineteen pages, which is a job somebody will get wrong once, and
once is all it takes. Searching also works without a pointer, which dragging
cannot. A scanned page carries no text, so nothing is found there and the
rectangle has to be drawn.

The browser suite proves the claim from the bytes out rather than restating it:
it redacts a document and then checks that no text can be extracted from any
page and that none of the original words appear anywhere in the file.

---

[Back to the README](../README.md)
