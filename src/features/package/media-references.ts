import { decodeEntities } from './html-text'
import { classifyUrl, rewriteCssUrls } from './urls'

/*
 * Finds the package files that HTML (a note's fields, a card template) and CSS refer to.
 * It runs in the package worker, which has no DOM, so it reads tags with patterns, in the
 * places the card viewer loads files from (see card-viewer/sanitize.ts): URL attributes
 * (src, href, data, poster, background), srcset, url() and @import in style attributes and
 * <style> elements, and [sound:…] tags. File names that scripts put together in code can't
 * be found this way.
 */

export interface References {
  /** File names as written (entities decoded, no query or fragment), each once. */
  files: string[]
  /** Those loaded as stylesheets (`@import`, `<link rel="stylesheet">`): what they refer to counts too. */
  stylesheets: string[]
}

const COMMENTS = /<!--[\s\S]*?-->/g
const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi
/** A script's code is dropped (its src attribute stays): names in code aren't references. */
const SCRIPT_CODE = /(<script\b(?:[^>"']|"[^"]*"|'[^']*')*>)[\s\S]*?<\/script\s*>/gi
const TAG = /<([a-z][a-z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
const ATTRIBUTE = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const SOUND = /\[sound:([^\]]+)\]/g
const URL_ATTRIBUTES = new Set(['src', 'href', 'xlink:href', 'data', 'poster', 'background'])

class Collector {
  readonly files = new Set<string>()
  readonly stylesheets = new Set<string>()

  /** A URL; only package files (relative URLs) count. */
  url(raw: string, stylesheet = false) {
    // A card template's {{Field}} stands for a note's own value, found in its fields.
    if (raw.includes('{{') || raw.includes('}}')) return
    const target = classifyUrl(raw)
    if (target.kind !== 'local') return
    this.files.add(target.name)
    if (stylesheet) this.stylesheets.add(target.name)
  }

  css(css: string) {
    rewriteCssUrls(css, (url, kind) => {
      this.url(url, kind === 'import')
      return null
    })
  }

  result(): References {
    return { files: [...this.files], stylesheets: [...this.stylesheets] }
  }
}

export function htmlReferences(html: string): References {
  const found = new Collector()
  const text = html
    .replace(COMMENTS, '')
    .replace(STYLE_ELEMENT, (_element, css: string) => {
      found.css(css)
      return ''
    })
    .replace(SCRIPT_CODE, '$1')

  for (const [, tag = '', attributeText = ''] of text.matchAll(TAG)) {
    const attributes = new Map<string, string>()
    for (const [, name = '', double, single, bare] of attributeText.matchAll(ATTRIBUTE)) {
      attributes.set(name.toLowerCase(), decodeEntities(double ?? single ?? bare ?? ''))
    }
    const isStylesheet =
      tag.toLowerCase() === 'link' && (attributes.get('rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet')
    for (const [name, value] of attributes) {
      if (URL_ATTRIBUTES.has(name)) found.url(value, isStylesheet && name === 'href')
      else if (name === 'style') found.css(value)
      else if (name === 'srcset') {
        for (const candidate of value.split(',')) found.url(candidate.trim().split(/\s+/)[0] ?? '')
      }
    }
  }
  for (const [, name = ''] of text.matchAll(SOUND)) found.url(decodeEntities(name).trim())
  return found.result()
}

export function cssReferences(css: string): References {
  const found = new Collector()
  found.css(css)
  return found.result()
}
