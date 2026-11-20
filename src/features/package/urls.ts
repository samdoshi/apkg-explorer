/** What a URL in card HTML or CSS points at. */
export type UrlTarget =
  | { kind: 'empty' }
  /** `#id`: a link or SVG reference within the card. */
  | { kind: 'fragment' }
  | { kind: 'data' }
  | { kind: 'web'; host: string }
  | { kind: 'script' }
  /** A file name: package media. */
  | { kind: 'local'; name: string }
  /** mailto:, blob:, file: and other schemes. */
  | { kind: 'other'; scheme: string }

const SCHEME = /^([a-z][a-z0-9+.-]*):/i
/** `//host`, and the backslash spellings browsers treat the same way. */
const NETWORK_PATH = /^[/\\]{2}/

export function classifyUrl(raw: string): UrlTarget {
  // Browsers skip tabs and newlines anywhere in a URL, so "java\nscript:" is still a script.
  const value = raw.trim().replace(/[\t\n\r]/g, '')
  if (!value) return { kind: 'empty' }
  if (value.startsWith('#')) return { kind: 'fragment' }
  const scheme = SCHEME.exec(value)?.[1]?.toLowerCase()
  if (scheme === 'javascript' || scheme === 'vbscript') return { kind: 'script' }
  if (scheme === 'data') return { kind: 'data' }
  if (scheme === 'http' || scheme === 'https' || NETWORK_PATH.test(value)) {
    return { kind: 'web', host: hostOf(scheme ? value : `https:${value.replace(/\\/g, '/')}`) }
  }
  if (scheme) return { kind: 'other', scheme }
  // A relative URL: in Anki, media files are served from the root. A query or fragment
  // can't be part of a media file name (the browser wouldn't send it either).
  const name = value.replace(/[?#].*$/, '').replace(/^(?:\.?\/)+/, '')
  return name ? { kind: 'local', name } : { kind: 'empty' }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname || 'an unknown site'
  } catch {
    return 'an unknown site'
  }
}

// @import "a.css"; @import url(a.css) screen; and url(…) anywhere else.
const CSS_REFERENCE =
  /@import\s+(?:url\(\s*("[^"]*"|'[^']*'|[^)\s]*)\s*\)|("[^"]*"|'[^']*'))([^;]*);?|url\(\s*("[^"]*"|'[^']*'|[^)\s]*)\s*\)/gi

function unquote(value: string): string {
  const inner = /^(["'])([\s\S]*)\1$/.exec(value)?.[2] ?? value
  return inner.replace(/\\(.)/g, '$1')
}

function cssString(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, '')}"`
}

/**
 * Rewrites every URL in a stylesheet or style attribute. `resolve` returns the URL to
 * use, or null to drop it: a dropped @import is removed, a dropped url() becomes `none`
 * (which makes most declarations that held it invalid, so the browser ignores them).
 */
export function rewriteCssUrls(
  css: string,
  resolve: (url: string, kind: 'url' | 'import') => string | null,
): string {
  return css.replace(
    CSS_REFERENCE,
    (_match, importUrl?: string, importString?: string, media?: string, url?: string) => {
      if (url !== undefined) {
        const next = resolve(unquote(url), 'url')
        return next === null ? 'none' : `url(${cssString(next)})`
      }
      const next = resolve(unquote(importUrl ?? importString ?? ''), 'import')
      return next === null ? '' : `@import url(${cssString(next)})${media ?? ''};`
    },
  )
}
