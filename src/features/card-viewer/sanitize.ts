import { mediaKindFor } from '@/features/package/mime'
import { classifyUrl, rewriteCssUrls } from './urls'

/*
 * Cleans card HTML and CSS before it goes into the card frame. The frame's sandbox and
 * Content-Security-Policy are what actually stop scripts and web requests; this step
 * finds them (for the notices), swaps package media for real URLs, and replaces blocked
 * content with visible placeholders so the CSP never has to step in.
 */

/** What a card's content tried to do. */
export interface ContentReport {
  /** <script> elements, inline event handlers or javascript: URLs. */
  scripts: boolean
  /** Sites that images, styles, fonts, scripts or frames would load from. */
  webHosts: string[]
  /** Package media files the content uses. */
  media: string[]
}

export interface CleanOptions {
  allowScripts: boolean
  allowWeb: boolean
  /** The URL to use for a package media file, or null if the package doesn't have it. */
  mediaUrl: (name: string) => string | null
  /** Whether this browser can play an audio or video file. */
  canPlay: (name: string) => boolean
}

/** For finding out what content needs, before any media is loaded. */
const SCAN_OPTIONS: CleanOptions = {
  allowScripts: false,
  allowWeb: false,
  mediaUrl: () => null,
  canPlay: () => true,
}

const KIND_LABELS: Record<string, string> = {
  img: 'image',
  image: 'image',
  input: 'image',
  audio: 'audio',
  video: 'video',
  iframe: 'embedded page',
}

/** Elements that are always removed: they change the page or embed plugins. */
const REMOVED = new Set(['base', 'meta', 'object', 'embed', 'applet', 'frame', 'frameset', 'portal'])

export class ContentCleaner {
  private readonly options: CleanOptions
  private scripts = false
  private readonly hosts = new Set<string>()
  private readonly media = new Set<string>()
  private doc: Document | undefined

  constructor(options: CleanOptions = SCAN_OPTIONS) {
    this.options = options
  }

  report(): ContentReport {
    return {
      scripts: this.scripts,
      webHosts: [...this.hosts].sort(),
      media: [...this.media],
    }
  }

  css(css: string): string {
    return rewriteCssUrls(css, (url) => this.load(url))
  }

  html(html: string): string {
    // Parsed into a <template>, whose contents are inert: nothing loads or runs while we
    // work on them, and leading <style> or <link> elements stay in place.
    this.doc ??= new DOMParser().parseFromString('<!doctype html><body>', 'text/html')
    const template = this.doc.createElement('template')
    template.innerHTML = html
    this.cleanTree(template.content)
    return template.innerHTML
  }

  /** The URL to load a resource from, or null to block it (recording what was found). */
  private load(raw: string): string | null {
    const target = classifyUrl(raw)
    switch (target.kind) {
      case 'empty':
      case 'fragment':
      case 'data':
        return raw
      case 'web':
        this.hosts.add(target.host)
        return this.options.allowWeb ? raw : null
      case 'local':
        this.media.add(target.name)
        return this.options.mediaUrl(target.name)
      case 'script':
        this.scripts = true
        return null
      case 'other':
        return null
    }
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
    for (const { name } of [...element.attributes]) {
      const lower = name.toLowerCase()
      if (lower.startsWith('on')) {
        this.scripts = true
        if (!this.options.allowScripts) element.removeAttribute(name)
      } else if (['action', 'formaction', 'ping', 'srcdoc', 'autoplay'].includes(lower)) {
        // Forms can't submit in the frame, and nothing plays by itself.
        element.removeAttribute(name)
      } else if (lower === 'style') {
        element.setAttribute(name, this.css(element.getAttribute(name) ?? ''))
      } else if (lower === 'background') {
        this.setUrlAttribute(element, name)
      }
    }

    if (REMOVED.has(tag)) {
      const source = element.getAttribute('data') ?? element.getAttribute('src')
      if (source) this.load(source)
      element.remove()
      return
    }
    switch (tag) {
      case 'script':
        this.cleanScript(element)
        return
      case 'style':
        element.textContent = this.css(element.textContent)
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
        this.setUrlAttribute(element, 'poster')
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
    this.scripts = true
    const src = element.getAttribute('src')
    // A script's own web host counts as web content even while scripts are blocked.
    const url = src === null ? null : this.load(src)
    if (!this.options.allowScripts || (src !== null && url === null)) {
      element.remove()
      return
    }
    if (src !== null && url !== null) element.setAttribute('src', url)
  }

  private cleanLinkElement(element: Element) {
    const rel = element.getAttribute('rel')?.toLowerCase().split(/\s+/) ?? []
    const href = element.getAttribute('href')
    const url = href === null ? null : this.load(href)
    // Only stylesheets are kept; icons, preloads and the like have no use in a card.
    if (!rel.includes('stylesheet') || url === null) element.remove()
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
      this.scripts = true
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
      if (this.load(raw) !== null) return
      element.replaceWith(placeholder(element, 'apkg-blocked', `Blocked embedded page from ${target.host}`, raw))
      return
    }
    // Frames of package files or inline HTML can't be cleaned, so they go.
    element.remove()
  }

  /** Sets the attribute to its resolved URL. False (attribute untouched) if it's blocked. */
  private replaceSource(element: Element, attribute: string): boolean {
    const raw = element.getAttribute(attribute)
    if (raw === null) return true
    const target = classifyUrl(raw)
    if (target.kind === 'local' && mediaKindFor(target.name) !== 'image' && !this.options.canPlay(target.name)) {
      if (element.localName === 'source') {
        this.media.add(target.name)
        return false
      }
    }
    const url = this.load(raw)
    if (url === null) return false
    element.setAttribute(attribute, url)
    return true
  }

  private setUrlAttribute(element: Element, attribute: string) {
    if (element.hasAttribute(attribute) && !this.replaceSource(element, attribute)) {
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
        const next = this.load(url)
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
  return {
    scripts: reports.some((report) => report.scripts),
    webHosts: [...new Set(reports.flatMap((report) => report.webHosts))].sort(),
    media: [...new Set(reports.flatMap((report) => report.media))],
  }
}

