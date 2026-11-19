# APKG Explorer — Specification

A browser-only app for looking inside Anki `.apkg` (and `.colpkg`) files. Everything happens on
the user's device: no server, nothing uploaded, nothing saved in the browser.

Status: **approved 2026-11-18** (including the dependency list, shadcn CLI use, repo name and real-deck location in section 10).

## 1. Opening a file

- Start screen (`#/`): a drop zone plus an "Open file…" button (accepts `.apkg` and `.colpkg`),
  and a **Try a sample deck** button that loads a synthetic deck bundled with the app.
- One file at a time. Opening another file replaces the current one and resets all view state.
- Reloading the page loses the file (nothing is saved). Deep links to other routes without a
  loaded file go back to the start screen.
- Errors are shown in plain language: not a zip, no collection inside, unknown/newer format,
  corrupt database, file changed on disk since it was opened.

### Supported package formats

| Package written by | Collection file | Media map (`media`) | Media files |
|---|---|---|---|
| Anki 2.0 / 2.1 legacy export | `collection.anki2` (schema 11) | JSON | plain zip entries |
| Anki 2.1.x "support older versions" off | `collection.anki21` (schema 11) | JSON | plain zip entries |
| Anki 2.1.50+ (current) | `collection.anki21b` (zstd, schema 18) | zstd + protobuf | zstd-compressed entries |

The newest collection file present wins (`anki21b` > `anki21` > `anki2`); the `meta` entry is read
when present. Schema 18 note types, fields, templates and decks are stored as protobuf; the few
messages we need are decoded by a small hand-written decoder (no protobuf library).

### Memory rules

- The zip is read with random access: only the central directory is read when opening.
- The collection database is the one thing loaded fully into memory (needed for the table).
- Media is read **on demand**, one file at a time, only when a card or the media viewer needs it.
  - Uncompressed ("stored") media entries are handed to the browser as a slice of the original
    `File` (disk-backed, no copy).
  - Deflated or zstd-compressed media is decompressed into a single Blob for that file.
- Object URLs are revoked when the card/preview that used them closes, and a small LRU cache
  (about 64 MB) caps what is kept between cards.
- Parsing and database queries run in a Web Worker so the page stays responsive on big decks.

## 2. Main view: notes table (`#/notes/:notetypeId`)

- **One row per note.** The cards a note generates are shown in the popup (section 3).
- **Note type menu** at the start of the table's toolbar (just under the header) when the file
  has more than one note type with notes, showing each type's name and note count. Defaults to
  the type with the most notes. Note types with no notes are left out. With only one, its name
  is shown as the heading instead.
- **Columns**, in order: each field of the note type (in field order), then Tags, Deck(s),
  Cards (count), Created, Modified.
  - Field cells show plain text: HTML stripped, entities decoded, whitespace collapsed, long
    text truncated with the full text in a tooltip. Images show as an image icon + file name,
    `[sound:…]` as a speaker icon + file name. Cloze markup is shown as written (like Anki's
    browser).
- **Sorting**: every column. Click a header to cycle ascending → descending → off;
  shift-click adds a secondary sort. Text sorts with a locale-aware, number-aware collator;
  dates and counts sort numerically.
- **Per-column filters**, opened from a filter button in each header (popover, works the same
  on mobile and desktop):
  - Fields: "contains" text, plus "is empty" / "is not empty".
  - Tags: pick tags from a searchable checklist; match any or all; "untagged".
  - Deck: pick decks from a searchable checklist.
  - Cards: min/max number.
  - Created / Modified: from/to date.
  - Active filters appear as removable chips above the table, with "Clear all".
- **Global search** box at the top: case- and accent-insensitive, every word must match
  somewhere in the note's fields, tags or deck names.
- A result count ("1,204 of 5,880 notes") is always visible.
- Rows are virtualised so tens of thousands of notes scroll smoothly.
- Mobile: the table scrolls horizontally with the first field column pinned.
- Keyboard: rows are focusable; ↑/↓, Page Up/Down, Home and End move between rows, Enter
  opens the popup (step 3). Clicking a row opens it too; when the popup closes, focus returns to
  the row of the note it was last showing.

## 3. Card popup (`#/notes/:notetypeId/:noteId`)

Opening a note puts its id in the URL, so the browser Back button (and the Android back gesture)
closes the popup.

- Dialog on desktop, full screen on mobile. Title is the note's sort field (clozes revealed).
  _Each side is a fixed-height frame that scrolls inside, rather than one that grows to fit: many
  decks size cards with `vh` units (e.g. `min-height: 100vh`), which would make a frame that
  sizes itself to its content grow without end._
- **Tabs**: one per card the note actually has in the file (template name, or "Cloze 1",
  "Cloze 2", …), plus a **Note** tab.
- Each card tab shows **Front** and **Back** side by side (stacked on narrow screens). The back
  is rendered as Anki renders it, so it normally includes the front via `{{FrontSide}}`.
  Below them: the card's deck and, if the export included scheduling, due/interval/ease/
  reviews/lapses.
- **Note** tab: every field rendered (with media), tags, note id, created/modified dates.
- **Previous / Next** buttons step through notes in the table's current sort and filter order
  (also `[` and `]` keys). `Esc` closes.
- Media in cards: images display; `[sound:…]` becomes an audio player; video plays inline.
  Nothing autoplays. Unsupported formats (e.g. some `.ogg` on older Safari) show a message
  and a download link instead.
- Night mode: when the system is dark, the card body gets Anki's `nightMode night_mode` classes
  so deck CSS that supports night mode works; otherwise the deck's own colours are kept.
  _As in Anki's reviewer, night mode also gives the body Anki's dark background and text
  colours, which override the stock `.card { color: black; background-color: white }`; deck rules
  such as `.card.nightMode` still win._

### Template rendering

Implemented: `{{Field}}`, `{{#Field}}…{{/Field}}`, `{{^Field}}…{{/Field}}`, `{{FrontSide}}`,
`{{cloze:Field}}` (including hints and nested clozes), `{{cloze-only:…}}`, `{{type:Field}}` and
`{{type:cloze:Field}}` (a disabled input on the front, the expected answer on the back),
`{{hint:Field}}` (click-to-reveal using `<details>`, so no script needed), `{{text:Field}}`,
`{{furigana:}}`, `{{kana:}}`, `{{kanji:}}`, and the special fields `Tags`, `Type`, `Deck`,
`Subdeck`, `Card`, `CardFlag`. `{{tts …}}` shows its text (not spoken). Unknown filters pass the
field through unchanged. Media referenced from the deck CSS (e.g. `_font.ttf` in `@font-face`)
is loaded from the package. _Also `{{CardID}}`, `{{c1,2::…}}` clozes, `{{#c2}}…{{/c2}}`, and
the old `{{=<% %>=}}` delimiters. A missing field or a broken template shows Anki's own error
message in place of that side, as Anki does._

### Safety: scripts and web content

Cards render in a sandboxed `<iframe>` with its own Content-Security-Policy.

- **By default**: scripts and inline event handlers are removed before rendering, and any
  reference to the web (`http(s)://…` in `src`, `href`, `srcset`, CSS `url()`/`@import`) is
  replaced with a "blocked" placeholder. Only media from the package loads. The iframe sandbox
  and CSP block anything the clean-up misses.
- **When detected**, a notice above the card says what was blocked, e.g. "This card has scripts
  (blocked) — Allow scripts" and "This card loads content from fonts.googleapis.com,
  example.com (blocked) — Allow web content". The two permissions are separate.
- _Added after step 3: each notice also has a **View scripts** / **View remote URLs** button
  that lists what was found in this card (or note), so the choice is an informed one. Scripts
  show their code: each `<script>`, inline handler (e.g. `onclick on <button>`) and
  `javascript:` link, plus script files from the package, read from the file on demand (the
  first 256 KB). Web scripts show only their address; nothing is downloaded. Web addresses are
  grouped by site, with what would load each one (image, stylesheet, CSS `url()`, script,
  embedded page…). Every item says where it was found: front, back, card styling or a named
  field. Addresses are plain text, not links. The list explains what allowing means (for the
  whole file) and has its own Allow / Block button. Data blocks such as
  `<script type="text/template">` never run, so they aren't counted as scripts and are kept._
- A permission applies to the whole open file until the user turns it off, opens another file
  or reloads. It is never saved.
- Allowed scripts still run in a sandbox with an opaque origin: they cannot reach the app, the
  package, or other cards.
- _How it works: with scripts blocked, the frame's sandbox has no `allow-scripts`, so nothing in
  it can run, and it keeps the app's origin so it can show the app's `blob:` URLs for media. With
  scripts allowed it gets `allow-scripts` and an opaque origin. Such a frame can't use the app's
  `blob:` URLs (Chrome and Firefox both refuse), so a small loader inside it receives the card's
  media files by `postMessage` and makes its own._
- _Links (`<a href="https://…">`) are not web content: nothing loads until they're clicked, and
  then they open in a new tab._
- _Limit: an allowed script can still send its own frame to a website (browsers have no setting
  that stops a frame navigating itself), so allow scripts only for decks you trust._

### MathJax

`\( … \)` and `\[ … \]` are typeset with MathJax 4, rendered to SVG by the app (so it works with
scripts off). MathJax and its fonts are bundled locally and loaded only the first time a card
contains maths. If MathJax 4 can't be bundled fully offline, I'll stop and ask before falling
back to MathJax 3.

_As built (step 4), with MathJax 4.1.3; no fallback was needed:_
- _Bundling: the engine is one lazily loaded chunk (1.4 MB, about 0.5 MB gzipped). The font
  keeps rarer glyph ranges (script, fraktur, arrows, Greek and Cyrillic variants…) in 40
  files that MathJax asks for by name; each is its own chunk, loaded only when a formula needs
  it. Nothing comes from outside the app. The first maths card takes about half a second
  longer while MathJax loads; later ones open as fast as other cards._
- _TeX packages as in Anki (MathJax's defaults plus `noerrors` and `mhchem`), with the
  extensions MathJax would fetch on demand (`\cancel`, `\color`, `\boldsymbol`, …) bundled up
  front. Left out: `require` and `autoload` (they fetch code at run time) and `texhtml` (it lets
  TeX insert raw HTML)._
- _Maths is found the way MathJax finds it in Anki's reviewer: only `\( … \)` and `\[ … \]`;
  not across elements other than `<br>`; not inside `<code>`, `<pre>`, `<script>`, `<style>`,
  `<textarea>` or `<noscript>`; and the closing delimiter must be outside braces._
- _Clozes follow Anki's MathJax rules: inside an expression, `}}` only closes a cloze opened in
  that expression (so `x^{2}}` can't end a cloze early), and the cloze filter turns cloze markup
  inside maths into plain TeX (`[...]` on the question)._
- _Output is SVG that takes the text colour (so night mode works), with hidden MathML for
  screen readers. A TeX error shows MathJax's error box. The Note tab's fields are typeset too._

## 4. Media browser (`#/media`)

A second tab in the header, next to Notes.

- Lists every media file in the package: name, kind (image/audio/video/other) and size.
- Search by name, filter by kind, sort by name/size/kind. Virtualised.
- Selecting a file opens a preview dialog: image viewer, audio or video player, or "no preview"
  for other types. Each has a Download button (a normal browser download; nothing is cached).
- No thumbnails in the list, to keep memory low.
- SVGs are only ever shown via `<img>`, which doesn't run scripts inside them.

_As built (step 5):_
- _Header links are Notes / Media / Overview. The kind filter shows only the kinds the package
  has, with counts; the status line gives the number of files shown and their total size._
- _The list is always sorted (by name to start with): clicking a header toggles ascending and
  descending, shift-click adds a secondary sort. Size sorts unknown sizes last. On phones the
  Kind column is hidden and each name's icon shows its kind._
- _The preview is a child route (`#/media/<name>`), like the note popup: Back closes it, `[` and
  `]` (or the arrow buttons) step through the list's current order, and closing puts focus back
  on the file's row. Images show on a checkerboard so transparent parts are visible, with their
  pixel size; audio and video use the browser's player, or say the browser can't play that
  type._
- _Added: text files (`.js`, `.css`, `.json`, `.txt`) show their first 256 KB as plain text, so
  a deck's script files can be read before allowing scripts._

## 5. Layout, theme, accessibility

- Header: Notes / Media / Overview links, file name, "Open another file".
  _Overview (`#/overview`) keeps the package summary from step 1: format, counts, note types
  with their fields and card types, and decks._
- Light and dark follow the system (`prefers-color-scheme`). No toggle, because it couldn't be
  remembered.
- Keyboard accessible throughout (shadcn/Radix primitives, visible focus, labelled controls).
- Works in current Chrome, Firefox and Safari, desktop and mobile.

## 6. Out of scope for v1

- Editing, exporting or re-packaging.
- Image Occlusion note types: the image is shown, but the masks are not drawn.
- Spoken TTS.
- Review/study mode, statistics, the revlog.
- Offline/PWA (planned later; needs a Data-rules approval because it caches app files).

## 7. Technical design

- **Stack**: Vite + React + TypeScript (strict), React Router hash router with every route in
  `src/routes.tsx`, Tailwind CSS v4 + shadcn/ui, TanStack Table v8 + TanStack Virtual.
- **Package reading**: `@zip.js/zip.js` (random-access zip from a `File`), `sql.js` (SQLite
  compiled to WASM, bundled by Vite), `fzstd` (zstd decompression, pure JS).
- **Folders**:
  ```
  src/
    routes.tsx            all routes
    main.tsx
    components/ui/        shadcn components
    lib/                  shared helpers
    features/
      open-file/          start screen, drop zone, sample deck
      package/            zip, zstd, protobuf, media map, schema 11/18 readers, worker
      notes-table/        table, filters, global search, note type menu
      card-viewer/        template renderer, sanitiser, sandboxed iframe, popup
      mathjax/            finding maths, lazy MathJax loader, TeX → SVG engine
      media/              media browser and preview
  scripts/make_fixtures.py   builds synthetic test decks (npm run fixtures)
  fixtures/               generated decks (committed)
  fixtures/real/          your real exports (git-ignored; tests use them when present)
  e2e/                    Playwright smoke tests
  ```
- **Test decks**: `scripts/make_fixtures.py` (Python standard library only: `sqlite3`, `zipfile`,
  `compression.zstd`) builds small decks in all three formats with Basic, Basic-and-reversed,
  Cloze, type-in, MathJax and custom notes, generated PNG flags, SVGs and WAV chimes, a card
  with a `<script>`, a card referencing a web image and one referencing a missing file. Output
  is deterministic. `fixtures/sample.apkg` is also the in-app sample deck. Vitest also runs
  against any files in `fixtures/real/`. _Changed from the Node script first planned: Python's
  sqlite3 can register Anki's `unicase` collation, so the fixtures use Anki's real schema 18
  DDL, and its zipfile module mirrors Anki's legacy Python exporter._
- **Anki's `unicase` collation**: schema 18 declares names with a custom collation that sql.js
  can't register, and SQLite then refuses to read the WITHOUT ROWID `fields`/`templates`/`tags`
  tables. After loading, the reader rewrites its in-memory copy of the schema to `NOCASE`.
- **Saved data**: none. No localStorage, sessionStorage, IndexedDB, cookies, Cache Storage or
  OPFS. A smoke test checks this after running the main flows.

## 8. Checks, CI and deploy

- `npm run check`: `tsc --noEmit`, ESLint (with React Hooks rules), Vitest (unit tests for the
  readers, protobuf decoder, template renderer, sanitiser, filters; jsdom where DOM APIs are
  needed).
- `npm run check:ui`: build, then Playwright (Chromium only) against `vite preview`; 5–10 smoke
  tests, each failing on any console error or request to another origin; screenshots of key
  screens at 1280×800 to `test-results/screens/`. _Traces on failure have no DOM snapshots:
  taking them logs console errors inside the script-free card frames._
- GitHub Actions: on push to `main`, run `npm run check`, build, deploy to GitHub Pages.
  Vite `base` is `/apkg-explorer/`.

## 9. Build order

Each step ends with both checks passing, a commit, and a stop for you to try it.

0. Project setup: scaffold, CLAUDE.md, AGENTS.md, both check scripts, one passing smoke test,
   Pages workflow.
1. Fixture generator + package reader for all formats + start screen (open, drop, sample) showing
   a summary of note types and counts.
2. Notes table: note type menu, columns, sorting, filters, global search, virtualisation.
3. Card popup: template rendering, card tabs, front/back, inline media, safety notices,
   previous/next.
4. MathJax.
5. Media browser.

## 10. Needs your OK

1. **Dependencies** (exact versions, latest at the time of writing unless noted):
   - Runtime: `react` / `react-dom` 19.3.1, `react-router` 8.5.2, `@zip.js/zip.js` 2.25.0,
     `sql.js` 1.16.0, `fzstd` 0.1.1, `@tanstack/react-table` 8.21.3 (v9 is very new; v8 is the
     stable line), `@tanstack/react-virtual` 3.14.26, `@mathjax/src` 4.1.3 (brings
     `@mathjax/mathjax-newcm-font`), `tailwindcss` / `@tailwindcss/vite` 4.3.5, and shadcn's
     dependencies `radix-ui` 1.8.1, `class-variance-authority` 0.7.1, `cn` 0.5.2,
     `lucide-react` 1.75.0, `tw-animate-css` 1.4.0, plus `shadcn` 4.23.0 as a dev dependency
     (for `shadcn/tailwind.css`). _Changed during setup, approved: the shadcn CLI now uses `cn`
     instead of `clsx` + `tailwind-merge`. Its Inter font was declined in favour of system
     fonts._
   - Dev: `vite` 8.3.8, `@vitejs/plugin-react` 6.3.0, `typescript` **6.0.3** (7.x is out, but
     `typescript-eslint` only supports up to 6.0), `@types/react` / `@types/react-dom` 19.3.0,
     `@types/sql.js` 1.4.11, `@types/node` 26.6.6, `eslint` 10.15.0, `@eslint/js` 10.0.1,
     `typescript-eslint` 8.73.0, `eslint-plugin-react-hooks` 7.1.1,
     `eslint-plugin-react-refresh` 0.5.8, `globals` 17.14.0, `vitest` 5.1.1, `jsdom` 31.0.1,
     `@playwright/test` 1.64.1 (matches `chromium-1248`).
2. **shadcn CLI**: OK to run `npx shadcn@4.23.0` to add components? It downloads component
   source from ui.shadcn.com into `src/components/ui/` and installs only the shadcn dependencies
   listed above. The alternative is for me to write the components by hand.
3. **Repo name**: I've assumed the GitHub repo is `apkg-explorer` (so `base` is
   `/apkg-explorer/`) and the branch is `main` (already renamed from `master`). You'll need to
   create the repo, push, and set Pages → Source to "GitHub Actions". I won't push anything.
4. **Real decks**: put them in `fixtures/real/` (git-ignored). Say if you'd rather commit them.
