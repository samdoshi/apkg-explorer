import { mediaKindFor } from '@/features/package/mime'
import { classifyUrl, rewriteCssUrls } from './urls'

/*
 * Cleans card HTML and CSS before it goes into the card frame. The frame's sandbox and
 * Content-Security-Policy are what actually stop scripts and web requests; this step
 * finds them (for the notices and the "View" lists), swaps package media for real URLs,
 * and replaces blocked content with visible placeholders so the CSP never has to step in.
 */

/** Something in a card that would run code. `where` says which parts it was found in. */
export type ScriptFinding =
  /** Code written in the card: a <script>, an event handler or a javascript: URL. */
  | { type: 'code'; label: string; code: string; where: string[] }
  /** A script file from the package, as in <script src="_file.js">. */
  | { type: 'file'; name: string; where: string[] }
  /** A script file from the web. */
  | { type: 'web'; url: string; host: string; where: string[] }

/** Something in a card that would load from the web. */
export interface WebFinding {
  url: string
  host: string
  /** What would load it: "Image", "Stylesheet", "Script"… */
  kind: string
  where: string[]
}

/** What a card's content tried to do. */
export interface ContentReport {
  scripts: ScriptFinding[]
  web: WebFinding[]
  /** Package media files the content uses, including those its package stylesheets use. */
  media: string[]
  /** Stylesheets from the package (`@import`, `<link rel="stylesheet">`) the content uses. */
  stylesheets: string[]
}

/** The sites a report's web content comes from, sorted. */
export function webHosts(report: ContentReport): string[] {
  return [...new Set(report.web.map((finding) => finding.host))].sort()
}

export interface CleanOptions {
  allowScripts: boolean
  allowWeb: boolean
  /** The URL to use for a package media file, or null if the package doesn't have it. */
  mediaUrl: (name: string) => string | null
  /** Whether this browser can play an audio or video file. */
  canPlay: (name: string) => boolean
  /**
   * The text of a stylesheet from the package, or null if it's missing or not read yet.
   * Its URLs are cleaned like the rest, so the fonts and images it uses load too.
   */
  stylesheetText: (name: string) => string | null
  /** The URL to use for a package stylesheet, given its cleaned text; null leaves it out. */
  stylesheetUrl: (name: string, css: string) => string | null
}

/** For finding out what content needs, before any media is loaded. */
const SCAN_OPTIONS: CleanOptions = {
  allowScripts: false,
  allowWeb: false,
  mediaUrl: () => null,
  canPlay: () => true,
  stylesheetText: () => null,
  stylesheetUrl: () => null,
}

/** Labels for what an element loads, in placeholders ("Blocked image from…") and lists. */
const KIND_LABELS: Record<string, string> = {
  img: 'image',
  image: 'image',
  input: 'image',
  audio: 'audio',
  video: 'video',
  iframe: 'embedded page',
  object: 'plugin',
  embed: 'plugin',
  applet: 'plugin',
  frame: 'embedded page',
  portal: 'embedded page',
  source: 'audio or video',
  track: 'subtitles',
  use: 'SVG',
  feImage: 'image',
}

/** Elements that are always removed: they change the page or embed plugins. */
const REMOVED = new Set(['base', 'meta', 'object', 'embed', 'applet', 'frame', 'frameset', 'portal'])

/** Script types browsers run; others (e.g. "text/template") hold inert data. */
const SCRIPT_TYPE = /^(?:module|.*(?:java|ecma|j|live)script.*)$/i

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function scriptKey(finding: ScriptFinding): string {
  if (finding.type === 'code') return `code\n${finding.label}\n${finding.code}`
  return finding.type === 'file' ? `file\n${finding.name}` : `web\n${finding.url}`
}

const webKey = (finding: WebFinding) => `${finding.kind}\n${finding.url}`

/** Adds a finding, or adds its places to an identical one already found. */
function collect<T extends { where: string[] }>(found: Map<string, T>, key: string, finding: T) {
  const existing = found.get(key)
  if (!existing) {
    found.set(key, { ...finding, where: [...finding.where] })
    return
  }
  for (const place of finding.where) if (!existing.where.includes(place)) existing.where.push(place)
}

export class ContentCleaner {
  private readonly options: CleanOptions
  private readonly scripts = new Map<string, ScriptFinding>()
  private readonly web = new Map<string, WebFinding>()
  private readonly media = new Set<string>()
  private readonly stylesheets = new Set<string>()
  /** Each package stylesheet's URL, once cleaned (null while it's being cleaned). */
  private readonly stylesheetUrls = new Map<string, string | null>()
  private doc: Document | undefined
  /** The part being cleaned ("Front", a field name…), recorded with each finding. */
  private where = ''

  /** Without options (or with only some), it cleans for a scan: nothing loads. */
  constructor(options: Partial<CleanOptions> = {}) {
    this.options = { ...SCAN_OPTIONS, ...options }
  }

  report(): ContentReport {
    return {
      scripts: [...this.scripts.values()],
      web: [...this.web.values()],
      media: [...this.media],
      stylesheets: [...this.stylesheets],
    }
  }

  css(css: string, where: string): string {
    this.where = where
    return this.cleanCss(css)
  }

  html(html: string, where: string): string {
    this.where = where
    // Parsed into a <template>, whose contents are inert: nothing loads or runs while we
    // work on them, and leading <style> or <link> elements stay in place.
    this.doc ??= new DOMParser().parseFromString('<!doctype html><body>', 'text/html')
    const template = this.doc.createElement('template')
    template.innerHTML = html
    this.cleanTree(template.content)
    return template.innerHTML
  }

  private cleanCss(css: string): string {
    return rewriteCssUrls(css, (url, kind) =>
      kind === 'import' ? this.loadStylesheet(url, 'Stylesheet (CSS @import)') : this.load(url, 'Font or image (CSS url)'),
    )
  }

  private noteScript(finding: ScriptFinding) {
    collect(this.scripts, scriptKey(finding), finding)
  }

  private noteCode(label: string, code: string) {
    this.noteScript({ type: 'code', label, code: code.trim(), where: [this.where] })
  }

  /**
   * The URL to load a resource from, or null to block it. Records what it found:
   * `kind` says what would load a web address ("Image", "Stylesheet"…).
   */
  private load(raw: string, kind: string): string | null {
    const target = classifyUrl(raw)
    switch (target.kind) {
      case 'empty':
      case 'fragment':
      case 'data':
        return raw
      case 'web': {
        const finding = { url: raw.trim(), host: target.host, kind, where: [this.where] }
        collect(this.web, webKey(finding), finding)
        return this.options.allowWeb ? raw : null
      }
      case 'local':
        this.media.add(target.name)
        return this.options.mediaUrl(target.name)
      case 'script':
        this.noteCode('javascript: URL', raw)
        return null
      case 'other':
        return null
    }
  }

  /**
   * Like load(), for a stylesheet. One from the package is cleaned too: its URLs would
   * otherwise be relative to a blob: URL, so its fonts and images wouldn't load.
   */
  private loadStylesheet(raw: string, kind: string): string | null {
    const target = classifyUrl(raw)
    if (target.kind !== 'local') return this.load(raw, kind)
    const { name } = target
    this.stylesheets.add(name)
    // Cleaned once; a stylesheet that imports itself (directly or not) gets nothing the second time.
    if (this.stylesheetUrls.has(name)) return this.stylesheetUrls.get(name) ?? null
    this.stylesheetUrls.set(name, null)
    const text = this.options.stylesheetText(name)
    if (text === null) return null
    const where = this.where
    this.where = name
    const css = this.cleanCss(text)
    this.where = where
    const url = this.options.stylesheetUrl(name, css)
    this.stylesheetUrls.set(name, url)
    return url
  }

  private cleanTree(root: DocumentFragment) {
    // A frame without scripts shows <noscript> content and one with scripts hides it, so
    // unwrap or drop it. (Its inner HTML is markup either way, however it was parsed.)
    for (const noscript of [...root.querySelectorAll('noscript')]) {
      if (this.options.allowScripts) {
        noscript.remove()
      } else {
        const template = noscript.ownerDocument.createElement('template')
        template.innerHTML = noscript.innerHTML
        noscript.replaceWith(template.content)
      }
    }
    for (const element of [...root.querySelectorAll('*')]) this.cleanElement(element)
    for (const nested of root.querySelectorAll('template')) {
      if (nested instanceof HTMLTemplateElement) this.cleanTree(nested.content)
    }
  }

  private cleanElement(element: Element) {
    const tag = element.localName
    for (const { name, value } of [...element.attributes]) {
      const lower = name.toLowerCase()
      if (lower.startsWith('on')) {
        this.noteCode(`${lower} on <${tag}>`, value)
        if (!this.options.allowScripts) element.removeAttribute(name)
      } else if (['action', 'formaction', 'ping', 'srcdoc', 'autoplay'].includes(lower)) {
        // Forms can't submit in the frame, and nothing plays by itself.
        element.removeAttribute(name)
      } else if (lower === 'style') {
        element.setAttribute(name, this.cleanCss(value))
      } else if (lower === 'background') {
        this.setUrlAttribute(element, name, 'Image')
      }
    }

    if (REMOVED.has(tag)) {
      const source = element.getAttribute('data') ?? element.getAttribute('src')
      if (source) this.load(source, capitalise(KIND_LABELS[tag] ?? 'embedded content'))
      element.remove()
      return
    }
    switch (tag) {
      case 'script':
        this.cleanScript(element)
        return
      case 'style':
        element.textContent = this.cleanCss(element.textContent)
        return
      case 'link':
        this.cleanLinkElement(element)
        return
      case 'a':
      case 'area':
        this.cleanLink(element, 'href')
        if (element.hasAttribute('xlink:href')) this.cleanLink(element, 'xlink:href')
        return
      case 'img':
      case 'input':
        if (tag === 'img' || element.getAttribute('type')?.toLowerCase() === 'image') {
          this.cleanSource(element)
          this.cleanSrcset(element)
        }
        return
      case 'audio':
      case 'video':
        element.setAttribute('controls', '')
        this.setUrlAttribute(element, 'poster', 'Image (video poster)')
        this.cleanSource(element)
        return
      case 'source':
      case 'track':
        this.cleanSrcset(element)
        if (element.hasAttribute('src') && !this.replaceSource(element, 'src')) element.remove()
        return
      case 'iframe':
        this.cleanFrame(element)
        return
      case 'image':
      case 'feImage':
      case 'use':
        // SVG elements that load what their href points at.
        this.setUrlAttribute(element, 'href')
        this.setUrlAttribute(element, 'xlink:href')
        return
    }
  }

  private cleanScript(element: Element) {
    const type = element.getAttribute('type')?.trim() ?? ''
    // Data blocks such as <script type="text/template"> never run, so they stay as they are.
    if (type && !SCRIPT_TYPE.test(type)) return
    const src = element.getAttribute('src')
    let url: string | null = null
    if (src === null) {
      this.noteCode('Script', element.textContent)
    } else {
      const target = classifyUrl(src)
      if (target.kind === 'local') this.noteScript({ type: 'file', name: target.name, where: [this.where] })
      else if (target.kind === 'web') this.noteScript({ type: 'web', url: src.trim(), host: target.host, where: [this.where] })
      else this.noteCode('Script (inline URL)', src)
      // A script's web address counts as web content too, even while scripts are blocked.
      // Data and other URLs never load: the frame's policy wouldn't allow them.
      url = target.kind === 'local' || target.kind === 'web' ? this.load(src, 'Script') : null
    }
    if (!this.options.allowScripts || (src !== null && url === null)) {
      element.remove()
      return
    }
    if (url !== null) element.setAttribute('src', url)
  }

  private cleanLinkElement(element: Element) {
    const rel = element.getAttribute('rel')?.toLowerCase().split(/\s+/) ?? []
    const href = element.getAttribute('href')
    // Only stylesheets are kept; icons, preloads and the like have no use in a card.
    const url = href !== null && rel.includes('stylesheet') ? this.loadStylesheet(href, 'Stylesheet') : null
    if (url === null) element.remove()
    else element.setAttribute('href', url)
  }

  /** Links open in a new tab; nothing navigates the card itself. */
  private cleanLink(element: Element, attribute: string) {
    const href = element.getAttribute(attribute)
    if (href === null) return
    const target = classifyUrl(href)
    let keep = false
    if (target.kind === 'web' || (target.kind === 'other' && ['mailto', 'tel'].includes(target.scheme))) {
      element.setAttribute('target', '_blank')
      element.setAttribute('rel', 'noopener noreferrer')
      keep = true
    } else if (target.kind === 'fragment') {
      element.removeAttribute('target')
      keep = true
    } else if (target.kind === 'script') {
      this.noteCode('javascript: link', href)
      keep = this.options.allowScripts
    } else if (target.kind === 'local') {
      this.media.add(target.name)
      const url = this.options.mediaUrl(target.name)
      if (url !== null) {
        element.setAttribute(attribute, url)
        element.setAttribute('target', '_blank')
        keep = true
      }
    }
    if (!keep) element.removeAttribute(attribute)
  }

  /** img, input, audio and video: a placeholder replaces whatever can't be shown. */
  private cleanSource(element: Element) {
    if (!element.hasAttribute('src')) return
    const raw = element.getAttribute('src') ?? ''
    const target = classifyUrl(raw)
    const kind = KIND_LABELS[element.localName] ?? 'file'
    if (target.kind === 'local' && this.options.mediaUrl(target.name) === null) {
      this.media.add(target.name)
      element.replaceWith(placeholder(element, 'apkg-missing', `Missing ${kind}: ${target.name}`))
      return
    }
    if (target.kind === 'local' && kind !== 'image' && !this.options.canPlay(target.name)) {
      this.media.add(target.name)
      element.replaceWith(this.unsupported(element, target.name))
      return
    }
    if (!this.replaceSource(element, 'src')) {
      if (target.kind === 'web') {
        element.replaceWith(placeholder(element, 'apkg-blocked', `Blocked ${kind} from ${target.host}`, raw))
      } else {
        element.removeAttribute('src')
      }
    }
  }

  private cleanFrame(element: Element) {
    const raw = element.getAttribute('src') ?? ''
    const target = classifyUrl(raw)
    if (target.kind === 'web') {
      if (this.load(raw, 'Embedded page') !== null) return
      element.replaceWith(placeholder(element, 'apkg-blocked', `Blocked embedded page from ${target.host}`, raw))
      return
    }
    // Frames of package files or inline HTML can't be cleaned, so they go.
    element.remove()
  }

  /** Sets the attribute to its resolved URL. False (attribute untouched) if it's blocked. */
  private replaceSource(element: Element, attribute: string, kind?: string): boolean {
    const raw = element.getAttribute(attribute)
    if (raw === null) return true
    const target = classifyUrl(raw)
    if (target.kind === 'local' && mediaKindFor(target.name) !== 'image' && !this.options.canPlay(target.name)) {
      if (element.localName === 'source') {
        this.media.add(target.name)
        return false
      }
    }
    const url = this.load(raw, kind ?? capitalise(KIND_LABELS[element.localName] ?? 'file'))
    if (url === null) return false
    element.setAttribute(attribute, url)
    return true
  }

  private setUrlAttribute(element: Element, attribute: string, kind?: string) {
    if (element.hasAttribute(attribute) && !this.replaceSource(element, attribute, kind)) {
      element.removeAttribute(attribute)
    }
  }

  private cleanSrcset(element: Element) {
    const srcset = element.getAttribute('srcset')
    if (srcset === null) return
    const candidates = srcset
      .split(',')
      .map((candidate) => candidate.trim())
      .filter(Boolean)
      .flatMap((candidate) => {
        const [url = '', ...descriptor] = candidate.split(/\s+/)
        const next = this.load(url, 'Image')
        return next === null ? [] : [[next, ...descriptor].join(' ')]
      })
    if (candidates.length) element.setAttribute('srcset', candidates.join(', '))
    else element.removeAttribute('srcset')
  }

  private unsupported(element: Element, name: string): Element {
    const span = placeholder(element, 'apkg-unsupported', `This browser can’t play ${name}. `)
    const url = this.options.mediaUrl(name)
    if (url !== null) {
      const link = element.ownerDocument.createElement('a')
      link.href = url
      link.setAttribute('download', name)
      link.textContent = 'Download'
      span.append(link)
    }
    return span
  }
}

function placeholder(element: Element, className: string, text: string, title?: string): Element {
  const span = element.ownerDocument.createElement('span')
  span.className = `apkg-placeholder ${className}`
  span.textContent = text
  if (title) span.title = title
  return span
}

/** Combines the reports of several pieces of content (front, back, CSS…). */
export function mergeReports(reports: ContentReport[]): ContentReport {
  const scripts = new Map<string, ScriptFinding>()
  const web = new Map<string, WebFinding>()
  for (const report of reports) {
    for (const finding of report.scripts) collect(scripts, scriptKey(finding), finding)
    for (const finding of report.web) collect(web, webKey(finding), finding)
  }
  return {
    scripts: [...scripts.values()],
    web: [...web.values()],
    media: [...new Set(reports.flatMap((report) => report.media))],
    stylesheets: [...new Set(reports.flatMap((report) => report.stylesheets))],
  }
}
