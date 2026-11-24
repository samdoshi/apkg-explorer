# APKG Explorer

**Use it here: [samdoshi.com/apkg-explorer](https://samdoshi.com/apkg-explorer/)**

Look inside Anki decks in your browser. Open an `.apkg` or `.colpkg` file and browse its notes,
see each card as Anki would show it, and check its media files.

Everything happens on your device. The file is never uploaded, and nothing is saved in the
browser: reload the page and it's gone.

> **Note:** this project was vibe coded. The code was written by an AI coding agent (Claude
> Code) following the author's instructions.

## Features

- **Notes table**: one row per note, for each note type. Sort by any column (shift-click for a
  second sort), filter columns by text, tags, deck, card count or date, and search across
  fields, tags and deck names. Scrolls smoothly through tens of thousands of notes.
- **Card viewer**: each card's front and back, drawn from the deck's own templates and styling:
  clozes, type-in answers, hints, furigana, and maths with MathJax. Images, audio and video
  come from the package. A Note tab lists every field. Step through notes with Previous / Next
  or the `[` and `]` keys.
- **Safe by default**: cards are shown in sandboxed frames. Scripts and anything loaded from the
  web are blocked until you allow them for that file, and you can read the scripts and web
  addresses first.
- **Media browser**: every file in the package with its kind, size and the notes that use it.
  Filters show unused files and files that cards refer to but the package doesn't include.
  Previews for images, audio, video, text files and fonts (font details, which languages it
  covers, and its private-use glyphs).
- **Overview**: the package's format, counts, note types and deck tree, with links into the
  notes table.
- Works in current Chrome, Firefox and Safari, on desktop and mobile. Light and dark follow
  your system, and everything works from the keyboard.

No deck to hand? The start screen has a **Try a sample deck** button.

## Supported files

Decks exported by Anki 2.0 and every later version open, as do collection backups (`.colpkg`).

| Collection inside | Format | Media |
|---|---|---|
| `collection.anki2` | Anki 2.0 format | plain zip entries |
| `collection.anki21` | Anki 2.1 legacy format | plain zip entries |
| `collection.anki21b` | Anki 2.1.50+ format (zstd-compressed) | zstd-compressed entries |

When a package holds more than one collection file, the newest format is used.

## Privacy

- There's no server: the app is a set of static files.
- The package is read in a Web Worker on your device. Media files are read one at a time, only
  when a card or preview needs them.
- Nothing is saved: no cookies, local storage, IndexedDB or caches. The tests check this.
- Nothing comes from other sites. Scripts, styles and fonts are all bundled with the app, and
  there's no analytics. A card's own web content stays blocked unless you allow it.

## Not supported

- Editing, exporting or re-packaging decks.
- Image Occlusion masks: the image is shown, but the masks aren't drawn.
- Text-to-speech: `{{tts}}` text is shown, not spoken.
- Studying, statistics and review history.
- Offline use (planned).

## Development

You'll need Node 24 or later and npm. Rebuilding the test decks needs Python 3.14 or later
(standard library only); remaking the sample deck's video needs ffmpeg.

```sh
npm ci
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run check` | Type checks, ESLint and the unit tests (Vitest) |
| `npm run check:ui` | Production build, then the Playwright smoke tests in Chromium; lists screenshots that are new or changed |
| `npm run build` / `npm run preview` | Production build / serve it at http://localhost:4173/apkg-explorer/ |
| `npm run fixtures` | Rebuild the test decks in `fixtures/` from `scripts/make_fixtures.py` |
| `scripts/make_video.sh` | Remake the sample deck's video (the clip is committed) |

The smoke tests need Playwright's Chromium (`npx playwright install chromium`). They fail on any
console error, any request to another site, or anything saved in the browser, and they save
screenshots of key screens to `test-results/screens/`.

### Test decks

`fixtures/` holds small generated decks in every supported format, plus broken files the app
must reject with a clear message. `fixtures/sample.apkg` is also the in-app sample deck. To test
against your own decks, put them in `fixtures/real/`: that folder is git-ignored, and the unit
tests open every package in it.

### Code layout

Code is grouped by feature under `src/features/` (opening files, reading packages, the notes
table, the card viewer, MathJax, media, the overview). Every route is in `src/routes.tsx`.
[AGENTS.md](AGENTS.md) has the full layout and the project's rules.

Built with Vite, React, TypeScript, React Router, Tailwind CSS, shadcn/ui and TanStack Table
and Virtual. Packages are read with `@zip.js/zip.js`, `sql.js` (SQLite in WebAssembly) and
`fzstd`, and maths is drawn with MathJax 4.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`: `npm run check`, a production build,
then a deploy to GitHub Pages. In the repository's settings, set Pages → Source to "GitHub
Actions". The app is built for the path `/apkg-explorer/`, so if the repository has another
name, change `base` in `vite.config.ts` to match.

---

APKG Explorer is an independent project, not affiliated with Anki or its developers.
