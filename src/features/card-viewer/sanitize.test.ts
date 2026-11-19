// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { MediaHandle } from '@/features/package/media-cache'
import { buildFrame, scanContent, type FrameContent } from './card-document'
import { ContentCleaner, type CleanOptions } from './sanitize'
import { classifyUrl, rewriteCssUrls } from './urls'

const media = new Map<string, Blob>([
  ['flag.png', new Blob(['png'])],
  ['a.ogg', new Blob(['ogg'])],
  ['b.mp3', new Blob(['mp3'])],
  ['_bg.png', new Blob(['bg'])],
])

const handle: MediaHandle = {
  blob: (name) => media.get(name) ?? null,
  url: (name) => (media.has(name) ? `blob:app/${name}` : null),
  release: () => undefined,
}

function clean(html: string, options: Partial<CleanOptions> = {}) {
  const cleaner = new ContentCleaner({
    allowScripts: false,
    allowWeb: false,
    mediaUrl: handle.url,
    canPlay: (name) => !name.endsWith('.ogg'),
    ...options,
  })
  return { html: cleaner.html(html), report: cleaner.report() }
}

describe('classifyUrl', () => {
  it('tells package files, web addresses and scripts apart', () => {
    expect(classifyUrl(' ./my file.png?v=2 ')).toEqual({ kind: 'local', name: 'my file.png' })
    expect(classifyUrl('/_font.ttf')).toEqual({ kind: 'local', name: '_font.ttf' })
    expect(classifyUrl('https://example.com/a.png')).toEqual({ kind: 'web', host: 'example.com' })
    expect(classifyUrl('//cdn.example.org/a.png')).toEqual({ kind: 'web', host: 'cdn.example.org' })
    expect(classifyUrl('\\\\evil.example/x')).toEqual({ kind: 'web', host: 'evil.example' })
    expect(classifyUrl('java\nscript:alert(1)')).toEqual({ kind: 'script' })
    expect(classifyUrl('data:image/png;base64,AAAA')).toEqual({ kind: 'data' })
    expect(classifyUrl('mailto:someone@example.com')).toEqual({ kind: 'other', scheme: 'mailto' })
    expect(classifyUrl('#top')).toEqual({ kind: 'fragment' })
  })

  it('rewrites every url() and @import in CSS', () => {
    const css =
      '@import "a.css";@import url(https://fonts.example/x) screen;\n' +
      `.a { background: #fff url('b.png') no-repeat } @font-face { src: url("c d.ttf") }`
    expect(rewriteCssUrls(css, (url) => (url.startsWith('https:') ? null : `blob:${url}`))).toBe(
      '@import url("blob:a.css");\n' +
        '.a { background: #fff url("blob:b.png") no-repeat } @font-face { src: url("blob:c d.ttf") }',
    )
    expect(rewriteCssUrls('.a { background: url(x.png) }', () => null)).toBe('.a { background: none }')
  })
})

describe('ContentCleaner', () => {
  const scripted = '<script>alert(1)</script><b onclick="go()">b</b><a href="javascript:go()">j</a>'

  it('removes scripts unless they are allowed', () => {
    const blocked = clean(scripted)
    expect(blocked.report.scripts).toBe(true)
    expect(blocked.html).toBe('<b>b</b><a>j</a>')
    expect(clean(scripted, { allowScripts: true }).html).toBe(scripted)
  })

  it('replaces web content with placeholders unless it is allowed, but keeps links', () => {
    const html =
      '<img src="https://example.com/a.png" alt="A"><link rel="stylesheet" href="https://fonts.googleapis.com/css">' +
      '<style>@import url("https://fonts.googleapis.com/x"); .a { background: url(//cdn.example.org/b.png) }</style>' +
      '<a href="https://ankiweb.net/">site</a><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"></path></svg>'
    const blocked = clean(html)
    expect(blocked.report.webHosts).toEqual(['cdn.example.org', 'example.com', 'fonts.googleapis.com'])
    expect(blocked.html).toBe(
      '<span class="apkg-placeholder apkg-blocked" title="https://example.com/a.png">Blocked image from example.com</span>' +
        '<style> .a { background: none }</style>' +
        '<a href="https://ankiweb.net/" target="_blank" rel="noopener noreferrer">site</a>' +
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"></path></svg>',
    )
    const allowed = clean(html, { allowWeb: true })
    expect(allowed.html).toContain('<img src="https://example.com/a.png" alt="A">')
    expect(allowed.html).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com/css">')
    expect(allowed.html).toContain('url("//cdn.example.org/b.png")')
  })

  it('points package media at its URL, with placeholders for missing or unplayable files', () => {
    const { html, report } = clean(
      '<img src="flag.png"><img src="missing.png"><audio controls autoplay src="b.mp3"></audio>' +
        '<audio controls src="a.ogg"></audio><div style="background: url(\'_bg.png\')">x</div>',
    )
    expect(report.media).toEqual(['flag.png', 'missing.png', 'b.mp3', 'a.ogg', '_bg.png'])
    expect(html).toBe(
      '<img src="blob:app/flag.png">' +
        '<span class="apkg-placeholder apkg-missing">Missing image: missing.png</span>' +
        '<audio controls="" src="blob:app/b.mp3"></audio>' +
        '<span class="apkg-placeholder apkg-unsupported">This browser can’t play a.ogg. ' +
        '<a href="blob:app/a.ogg" download="a.ogg">Download</a></span>' +
        '<div style="background: url(&quot;blob:app/_bg.png&quot;)">x</div>',
    )
  })

  it('always removes things that would change or escape the page', () => {
    const { html, report } = clean(
      '<base href="https://example.com/"><meta http-equiv="refresh" content="0;url=https://example.com">' +
        '<object data="https://plugins.example/x"></object><iframe src="page.html"></iframe>' +
        '<iframe src="https://www.youtube.com/embed/x"></iframe><form action="https://example.com"><button formaction="/x">Go</button></form>' +
        '<noscript><img src="https://tracker.example/p.png"></noscript>',
    )
    expect(report.webHosts).toEqual(['plugins.example', 'tracker.example', 'www.youtube.com'])
    expect(html).toBe(
      '<span class="apkg-placeholder apkg-blocked" title="https://www.youtube.com/embed/x">Blocked embedded page from www.youtube.com</span>' +
        '<form><button>Go</button></form>' +
        // Scripts are off, so <noscript> content shows (and is cleaned like the rest).
        '<span class="apkg-placeholder apkg-blocked" title="https://tracker.example/p.png">Blocked image from tracker.example</span>',
    )
  })
})

describe('frame documents', () => {
  const content: FrameContent = {
    parts: ['<img src="flag.png"> [sound] <audio controls src="b.mp3"></audio>'],
    layout: ([part = '']) => `<div id="qa">${part}</div>`,
    css: '.card { background: url(_bg.png) } </style><script>alert(1)</script>',
    bodyClass: 'card card1',
  }
  const options = { allowScripts: false, allowWeb: false, nightMode: true, canPlay: () => true }

  it('reports what the content needs before media is loaded', () => {
    expect(scanContent([content])).toEqual({ scripts: false, webHosts: [], media: ['flag.png', 'b.mp3', '_bg.png'] })
  })

  it('uses app blob URLs in a script-free, same-origin frame', () => {
    const frame = buildFrame(content, options, handle)
    expect(frame.sandbox).toContain('allow-same-origin')
    expect(frame.sandbox).not.toContain('allow-scripts')
    expect(frame.payload).toBeNull()
    expect(frame.srcdoc).toContain("script-src 'none'")
    expect(frame.srcdoc).toContain('<body class="card card1 nightMode night_mode"><div id="qa"><img src="blob:app/flag.png">')
    // Deck CSS can't close its <style> element and inject markup.
    expect(frame.srcdoc).toContain('<\\/style><script>alert(1)')
    expect(frame.srcdoc).not.toContain('</style><script>')
  })

  it('hands media to the loader of a frame that runs scripts', () => {
    const frame = buildFrame(content, { ...options, allowScripts: true }, handle)
    expect(frame.sandbox).toContain('allow-scripts')
    expect(frame.sandbox).not.toContain('allow-same-origin')
    expect(frame.srcdoc).toContain(`const token = '${frame.token}'`)
    expect(frame.payload?.media).toEqual([media.get('flag.png'), media.get('b.mp3'), media.get('_bg.png')])
    expect(frame.payload?.html).toContain(`<img src="apkg-media-${frame.token}-0">`)
    expect(frame.payload?.html).toContain(`url("apkg-media-${frame.token}-2")`)
    expect(frame.payload?.html).toContain("script-src 'unsafe-inline' blob:")
  })
})
