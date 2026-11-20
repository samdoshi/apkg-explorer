# APKG Explorer

Browser-only viewer for Anki `.apkg` / `.colpkg` files. The spec is in `SPEC.md` (approved).
Saved-data approvals live in AGENTS.md:

@AGENTS.md

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run check` | `tsc --noEmit` (app, test and node configs), ESLint, Vitest. Run after every change. |
| `npm run check:ui` | Build, then Playwright smoke tests (Chromium) against `vite preview`, then list new, changed and no-longer-produced screenshots. Run after each feature and before each commit. |
| `npm run build` / `npm run preview` | Production build / serve it at http://localhost:4173/apkg-explorer/ |
| `npx playwright test e2e/smoke.spec.ts` | One spec file (needs a fresh `npm run build` first) |
| `npm run fixtures` | Rebuild the synthetic decks in `fixtures/` (`scripts/make_fixtures.py`, deterministic) |
| `scripts/make_video.sh` | Remake `scripts/media/mandelbrot.webm`, the sample deck's video (ffmpeg; the clip is committed, so only needed to change it) |

## Folder layout

```
src/routes.tsx          every route (hash router). Pages that need an open file are lazy (their
                        own chunks); prefetchPages() (called from main.tsx on load) fetches them
                        in the background, so the start screen comes up first
src/main.tsx            entry
src/index.css           Tailwind + shadcn theme (dark mode = prefers-color-scheme)
src/components/ui/      shadcn components (generated; add with the CLI, below)
src/lib/                shared helpers: format.ts (numbers, sizes, dates, name order),
                        use-virtual-rows.ts (virtual rows + keyboard focus for both tables) and
                        opened-from-list.ts (popups opened from a list close with Back)
src/features/<name>/    code grouped by feature:
  app-shell/            layout, header, drop overlay, RequirePackage route guard,
                        route-error.tsx (errorElements: a page or popup that fails while drawing),
                        loading-status.tsx (spinner / failure message while data loads),
                        list-popup.tsx + use-list-popup.ts (the note popup's and media preview's
                        shared dialog: title, Previous / Next, [ ] keys, closing with Back)
  open-file/            start screen, file picker, window-wide drag and drop, sample deck
  package/              .apkg reader (zip, zstd, protobuf, media map, schema 11/18), the Web
                        Worker that runs it, PackageClient (main-thread RPC) and React context;
                        usePackageData() loads anything from the worker into a component.
                        urls.ts = what a URL in card HTML/CSS points at; media-references.ts finds
                        file references without a DOM, media-usage.ts indexes them (media usage)
  notes-table/          #/notes/:noteTypeId: TanStack Table (sorting only) + TanStack Virtual
                        rows. Search and column filters are plain functions in filters.ts,
                        applied before the table sorts. Rows come from the worker
                        (getNotes -> NoteRow, plain text built by package/html-text.ts)
  overview/             #/overview: package summary (format, counts, note types, decks)
  card-viewer/          #/notes/:noteTypeId/:noteId: the note popup, a child route of the table so
                        Back closes it. template.ts + cloze.ts + template-filters.ts = Anki's
                        template language; card-html.ts = reviewer extras (type answers, [sound:]);
                        sanitize.ts (+ package/urls.ts) = cleaning and script/web findings (listed by
                        content-details.tsx, "View scripts" / "View remote URLs"); card-document.ts =
                        frame documents: every frame has allow-scripts and an opaque origin and
                        starts with a loader; blocked scripts are stopped by the CSP (only the
                        loader's nonce runs). Don't add allow-same-origin or drop allow-scripts
                        (Safari's media controls are JavaScript). Package stylesheets (@import,
                        <link>) are read by use-content-scan.ts, cleaned, and sent as text the
                        loader fills in, so their fonts load.
                        Media blobs come from package/media-cache.ts (64 MB LRU, on the client)
  mathjax/              find-math.ts = where MathJax would find \( \) and \[ \] in card HTML;
                        typeset.ts = lazy loader, used by card-viewer/use-frames.ts;
                        mathjax-engine.ts = MathJax 4 (TeX → SVG on MathJax's lite DOM, its own
                        chunk; the font's glyph files are bundled with import.meta.glob)
  media/                #/media: the media list (TanStack Table for sorting, rows drawn by
                        media-table.tsx) and #/media/:name, the preview dialog (a child route,
                        name URI-encoded; files come through package/media-cache.ts).
                        font-file.ts reads fonts (names, cmap, post, fvar; TTF/OTF/TTC/WOFF/
                        WOFF2), font-view.tsx is the font preview, font-samples.ts its text.
                        used-by.tsx = the preview's "Used by" (notes link to their popups)
e2e/                    Playwright smoke tests; fixtures.ts has the guards, approved-storage.ts the
                        storage allow-list
scripts/                Node scripts in TypeScript (run directly by Node 24); make_fixtures.py
                        (also draws the sample deck's pixel font, pixel_font());
                        media/ = committed media made by other tools (make_video.sh)
fixtures/               generated test decks (committed): sample.apkg (current format, also the
                        in-app sample), legacy-anki2.apkg, legacy-anki21.apkg (WAL header),
                        collection.colpkg, large.apkg (5,000 notes), invalid/*. fixtures/real/ = the user's real decks
                        (git-ignored; Vitest opens each one when present)
test-results/screens/   screenshots from check:ui (1280x800); test-results/artifacts/ = traces
.github/workflows/      GitHub Pages deploy (runs npm run check, then builds)
```

## Environment

- NixOS bubblewrap sandbox. Node 24, npm, git, Python 3 and ffmpeg available. Check anything else with
  `command -v` and ask the user before relying on it. Never install software globally, never use
  Nix commands, never download binaries.
- Playwright browsers come from `$PLAYWRIGHT_BROWSERS_PATH` (chromium-1248, which matches
  `@playwright/test` 1.64.1). Never run `npx playwright install`. If the browser folders change,
  find the matching version from each playwright-core release's browsers.json and tell the user.
- Playwright's Firefox build works here (all smoke tests passed in it on 2026-11-19); WebKit does
  not (it aborts with "Could not create EGL display": the sandbox has no Mesa EGL driver), so
  Safari is tested by the user. `check:ui` is Chromium-only anyway. A
  one-off Firefox run overwrites `test-results/screens/`, so run `check:ui` again afterwards. For
  a one-off Firefox run, use a temporary config
  that spreads `playwright.config.ts` and swaps `projects`.
- Tool inputs decode `\uXXXX` sequences, so a `\u0300` written into a file arrives as the
  literal character. In source, build such characters with `String.fromCodePoint(0x300)`.
- `/tmp` is wiped when the sandbox restarts. Keep anything worth keeping in the project.
- Screenshots for the user: draw them with the kitty graphics protocol by writing to Claude
  Code's own terminal (`/proc/<claude pid>/fd/1`; `/dev/tty` won't work). Use `q=2`, save and
  restore the cursor, and clear the image when the user is done.

## Rules

Stack
- Vite + React + TypeScript (strict). Pure client-side SPA: no server, no SSR, no API routes.
- React Router hash router, all routes in `src/routes.tsx`.
- Tailwind CSS + shadcn/ui. Mobile-first, light/dark follows the system, keyboard accessible.
- Must work in current Chrome, Firefox and Safari, desktop and mobile.
- Nothing from a CDN or other outside host: every script, stylesheet, font, icon and image comes
  from npm or the repo and is bundled by Vite. No external `<script>`/`<link>`, import maps,
  esm.sh or Google Fonts. System fonts only.
- No API keys in code, no analytics.

Data
- Save nothing in the browser by default: no localStorage, sessionStorage, IndexedDB, cookies,
  Cache Storage or OPFS. State lives in React state and is lost on reload, even small things
  like a theme toggle.
- If a feature seems to need saved data, stop and ask first (what, where, why). Save only what is
  approved, record each approval in AGENTS.md and add it to `e2e/approved-storage.ts`.
- If saved data is approved: IndexedDB via Dexie (versioned schema with migrations, read with
  `useLiveQuery`), JSON export and import, `navigator.storage.persist()` after the first save.
- The smoke tests fail if cookies, localStorage, sessionStorage, IndexedDB or Cache Storage
  hold anything not on the approved list.

Checks
- `npm run check` after every change; fix failures before reporting back. Never use `any`,
  `@ts-ignore`/`@ts-expect-error` or `eslint-disable` to silence an error.
- `npm run check:ui` after each feature and before each commit, not after every edit. Keep it to
  5-10 Chromium tests covering the main flows. Each fails on any console error or request to
  another origin (the guard in `e2e/fixtures.ts`). Role and label locators only, no fixed waits.
- Keep test output small: `--reporter=line`, `--max-failures=1`, traces only on failure
  (saved under `test-results/artifacts/`).
- Save screenshots of key screens at 1280x800 to `test-results/screens/`. After a visual change,
  open only the screenshots that `check:ui` reports as new or changed, preferring element
  screenshots to full-page ones. The report compares file hashes, so Chromium's rendering noise
  (1-2 colour levels on anti-aliased edges, seen on `media-font.png`, `card-maths.png` and
  `filter-tags.png`) can mark an untouched screen as changed.

Guardrails
- npm with exact versions (`save-exact=true` in `.npmrc`). Ask before adding any dependency
  that isn't on the approved list below.
- Group code by feature under `src/features/`.
- Keep this file up to date when commands, layout, environment or rules change.
- Commit after each feature passes both checks, then stop so the user can try it.
- GitHub Pages deploy via `.github/workflows/deploy.yml` (runs `npm run check`, then builds).
  Its actions are pinned to commit hashes, with the release in a comment; update both together.
  Vite `base` is `/apkg-explorer/`. `check:ui` stays local for now.
- Later, not now: vite-plugin-pwa for offline use with an "update available" prompt. It caches
  the app's files in the browser, so it needs the user's OK under the Data rules first.
- Never push or create the GitHub repo; the user does that.

## Dependencies

MathJax: `@mathjax/src` 4.1.3 (brings `@mathjax/mathjax-newcm-font`). Import it as
`@mathjax/src/js/…` (the package maps that to its ES modules) so the font's own imports share
the same module instances. Keep the `require`, `autoload` and `texhtml` TeX packages out: the
first two fetch code at run time, the last lets TeX insert raw HTML. MathJax's
`speech-rule-engine` and `mj-context-menu` dependencies are installed but not imported.

`jsdom` (dev) gives Vitest a DOM for the sanitiser tests: put `// @vitest-environment jsdom` at
the top of a test file that needs one (the default environment is node).

ESLint reports three warnings ("Compilation Skipped: Use of incompatible library") from
`react-hooks/incompatible-library`: `useReactTable` (notes and media pages) and `useVirtualizer`
(`src/lib/use-virtual-rows.ts`). They only matter
with the React Compiler, which this project doesn't use. Left visible on purpose.

Package reading: `@zip.js/zip.js` (import `@zip.js/zip.js/index-native.js`: native
DecompressionStream, no zip.js workers or WASM), `sql.js` (the worker loads
`sql-wasm-browser.wasm` via `?url`; Vitest uses the Node build), `fzstd` (streaming zstd).

Fonts: `brotli` 2.1.0 (approved 2026-11-19) decompresses WOFF2 files for the font preview,
because Chrome has no Brotli DecompressionStream (Firefox does). Import only
`brotli/decompress`, dynamically (font-file.ts), so it stays an on-demand chunk (89 KB).

shadcn: add components with `npx shadcn@4.23.0 add <name>`. The CLI's preset uses the `cn` package
and `shadcn/tailwind.css` (both approved; `shadcn` is a dev dependency). Its Inter font was
declined: if the CLI re-adds `@fontsource-variable/inter`, uninstall it and keep system fonts.
TypeScript stays on 6.0.x because `typescript-eslint` doesn't support 7 yet.
