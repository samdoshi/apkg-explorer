import type { MediaHandle } from '@/features/package/media-cache'
import { ContentCleaner, mergeReports, type ContentReport } from './sanitize'

/*
 * Builds the HTML documents shown in card frames.
 *
 * Scripts blocked (the default): the frame is sandboxed without allow-scripts, so
 * nothing in it can run. It keeps the app's origin, which lets it use the app's blob:
 * URLs for package media.
 *
 * Scripts allowed: the frame gets allow-scripts and therefore an opaque origin, so its
 * scripts can't reach the app or the package. An opaque origin can't load the app's
 * blob: URLs, so the frame starts with a small loader that receives the media files by
 * postMessage, makes its own blob: URLs and writes the card into itself.
 *
 * Either way the Content-Security-Policy only lets the card load package media (and,
 * if allowed, content from the web).
 */

export interface FrameContent {
  /**
   * Uncleaned HTML pieces (a card side, or each field), cleaned one at a time. The label
   * ("Front", a field name…) says where things were found in the "View" lists.
   */
  parts: { label: string; html: string }[]
  /** Lays the cleaned parts out as the body's HTML. */
  layout: (parts: string[]) => string
  /** The note type's CSS. */
  css: string
  /** CSS the app adds before the note type's (MathJax's, when the content has maths). */
  appCss?: string
  bodyClass: string
}

export interface FrameOptions {
  allowScripts: boolean
  allowWeb: boolean
  nightMode: boolean
  canPlay: (name: string) => boolean
}

export interface FrameDocument {
  /** A fresh value for each document; use it as the frame's React key. */
  token: string
  srcdoc: string
  sandbox: string
  /** When scripts are allowed: what the loader inside the frame is sent. */
  payload: { html: string; media: Blob[] } | null
}

/** Where findings in the note type's CSS are said to be. */
const CSS_LABEL = 'Card styling'

/** Finds out what content needs (media) and does (scripts, web loads), before loading media. */
export function scanContent(contents: FrameContent[]): ContentReport {
  return mergeReports(
    contents.map((content) => {
      const cleaner = new ContentCleaner()
      for (const part of content.parts) cleaner.html(part.html, part.label)
      cleaner.css(content.css, CSS_LABEL)
      return cleaner.report()
    }),
  )
}

export function cardCsp({ allowScripts, allowWeb }: Pick<FrameOptions, 'allowScripts' | 'allowWeb'>): string {
  const web = allowWeb ? ' https: http:' : ''
  return [
    "default-src 'none'",
    `img-src blob: data:${web}`,
    `media-src blob: data:${web}`,
    `font-src blob: data:${web}`,
    `style-src 'unsafe-inline' blob:${web}`,
    allowScripts ? `script-src 'unsafe-inline' blob:${web}` : "script-src 'none'",
    allowWeb ? `frame-src${web}` : "frame-src 'none'",
    allowWeb && allowScripts ? `connect-src${web}` : "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

/** Allows links to open in a new tab and media downloads; never top navigation or forms. */
const SANDBOX_BASE = 'allow-popups allow-popups-to-escape-sandbox allow-downloads'

/*
 * What Anki's reviewer adds around every card (ts/reviewer/reviewer.scss): margins,
 * night mode colours that override the stock `.card` colours, image sizing and the
 * type-answer box. Our own placeholders use :where() so deck CSS can restyle them.
 */
export const BASE_CSS = `
body { margin: 20px; overflow-wrap: break-word; }
body.nightMode { background-color: #2c2c2c; color: #fcfcfc; }
img { max-width: 100%; max-height: 95vh; }
li { text-align: start; }
#typeans { width: 100%; box-sizing: border-box; line-height: 1.75; font: inherit; }
code#typeans { display: block; white-space: pre-wrap; font-family: ui-monospace, monospace; }
:where(details.hint > summary) { cursor: pointer; text-decoration: underline; }
:where(.apkg-placeholder) {
  display: inline-block; max-width: 100%; padding: 0.25em 0.5em; border: 1px dashed currentColor;
  border-radius: 4px; font: 14px/1.4 system-ui, sans-serif; opacity: 0.75;
}
:where(.apkg-template-problem) {
  font: 15px/1.5 system-ui, sans-serif; text-align: start; padding: 0.5em 1em;
  border-left: 3px solid #d97706;
}
:where(.apkg-fields) { margin: 0; font: 16px/1.5 system-ui, sans-serif; text-align: start; }
:where(.apkg-field) { padding: 0.5em 0; border-bottom: 1px solid rgb(128 128 128 / 0.25); }
:where(.apkg-field dt) { font-size: 13px; font-weight: 600; opacity: 0.7; }
:where(.apkg-field dd) { margin: 0.25em 0 0; }
:where(.apkg-empty) { opacity: 0.5; font-style: italic; }
`

/** CSS goes inside <style>; this stops it from closing the element early. */
function styleText(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1')
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function head(csp: string, colorScheme: string): string {
  return (
    '<meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<meta name="color-scheme" content="${colorScheme}">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">'
  )
}

/** The loader for frames that run scripts. `token` is random hex, safe to inline. */
function loaderScript(token: string): string {
  return `(() => {
  const token = '${token}';
  const media = /apkg-media-${token}-(\\d+)/g;
  addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== parent || !data || data.token !== token || data.type !== 'render') return;
    const urls = data.media.map((blob) => URL.createObjectURL(blob));
    const html = data.html.replace(media, (_, index) => urls[Number(index)] || '');
    document.open();
    document.write(html);
    document.close();
    document.addEventListener('keydown', (key) => {
      if (['Escape', '[', ']'].includes(key.key)) parent.postMessage({ token, type: 'key', key: key.key }, '*');
    });
  });
  parent.postMessage({ token, type: 'ready' }, '*');
})();`
}

/** Builds one frame's document, using the media the content needs (already loaded). */
export function buildFrame(content: FrameContent, options: FrameOptions, media: MediaHandle): FrameDocument {
  const token = randomToken()
  const blobs: Blob[] = []
  const indexes = new Map<string, number>()
  // With scripts allowed, media is referenced by placeholder tokens that the loader
  // swaps for blob: URLs it creates inside the frame.
  const mediaUrl = options.allowScripts
    ? (name: string) => {
        const blob = media.blob(name)
        if (!blob) return null
        let index = indexes.get(name)
        if (index === undefined) {
          index = blobs.push(blob) - 1
          indexes.set(name, index)
        }
        return `apkg-media-${token}-${String(index)}`
      }
    : (name: string) => media.url(name)
  const cleaner = new ContentCleaner({ ...options, mediaUrl })
  const body = content.layout(content.parts.map((part) => cleaner.html(part.html, part.label)))
  const css = cleaner.css(content.css, CSS_LABEL)

  const csp = cardCsp(options)
  const colorScheme = options.nightMode ? 'dark' : 'light'
  const html =
    `<!doctype html><html${options.nightMode ? ' class="night-mode"' : ''}><head>${head(csp, colorScheme)}` +
    `<style>${BASE_CSS}${styleText(content.appCss ?? '')}</style><style>${styleText(css)}</style></head>` +
    `<body class="${content.bodyClass}${options.nightMode ? ' nightMode night_mode' : ''}">${body}</body></html>`

  if (!options.allowScripts) {
    return { token, srcdoc: html, sandbox: `allow-same-origin ${SANDBOX_BASE}`, payload: null }
  }
  return {
    token,
    srcdoc: `<!doctype html><html><head>${head(csp, colorScheme)}<script>${loaderScript(token)}</script></head></html>`,
    sandbox: `allow-scripts ${SANDBOX_BASE}`,
    payload: { html, media: blobs },
  }
}
