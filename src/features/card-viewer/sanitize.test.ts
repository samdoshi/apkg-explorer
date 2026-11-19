// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { MediaHandle } from '@/features/package/media-cache'
import { buildFrame, scanContent, type FrameContent } from './card-document'
import { ContentCleaner, mergeReports, webHosts, type CleanOptions } from './sanitize'
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
  return { html: cleaner.html(html, 'Front'), report: cleaner.report() }
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
    expect(blocked.html).toBe('<b>b</b><a>j</a>')
    expect(clean(scripted, { allowScripts: true }).html).toBe(scripted)
  })

  it('lists each script with its code and where it was found', () => {
    const cleaner = new ContentCleaner()
    cleaner.html(`${scripted}<script src="_lib.js"></script><script src="https://cdn.example.org/x.js"></script>`, 'Front')
    // The back repeats the front ({{FrontSide}}) and adds a script of its own.
    cleaner.html(`${scripted}<script type="module">\n  run()\n</script>`, 'Back')
    // A data block never runs, so it isn't a script.
    cleaner.html('<script type="text/template"><b>x</b></script>', 'Back')
    const report = cleaner.report()
    expect(report.scripts).toEqual([
      { type: 'code', label: 'Script', code: 'alert(1)', where: ['Front', 'Back'] },
      { type: 'code', label: 'onclick on <b>', code: 'go()', where: ['Front', 'Back'] },
      { type: 'code', label: 'javascript: link', code: 'javascript:go()', where: ['Front', 'Back'] },
      { type: 'file', name: '_lib.js', where: ['Front'] },
      { type: 'web', url: 'https://cdn.example.org/x.js', host: 'cdn.example.org', where: ['Front'] },
      { type: 'code', label: 'Script', code: 'run()', where: ['Back'] },
    ])
    // A web script is web content too.
    expect(report.web).toEqual([
      { url: 'https://cdn.example.org/x.js', host: 'cdn.example.org', kind: 'Script', where: ['Front'] },
    ])
    expect(report.media).toEqual(['_lib.js'])
  })

  it('replaces web content with placeholders unless it is allowed, but keeps links', () => {
    const html =
      '<img src="https://example.com/a.png" alt="A"><link rel="stylesheet" href="https://fonts.googleapis.com/css">' +
      '<style>@import url("https://fonts.googleapis.com/x"); .a { background: url(//cdn.example.org/b.png) }</style>' +
      '<a href="https://ankiweb.net/">site</a><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"></path></svg>'
    const blocked = clean(html)
    expect(blocked.report.web).toEqual([
      { url: 'https://example.com/a.png', host: 'example.com', kind: 'Image', where: ['Front'] },
      { url: 'https://fonts.googleapis.com/css', host: 'fonts.googleapis.com', kind: 'Stylesheet', where: ['Front'] },
      { url: 'https://fonts.googleapis.com/x', host: 'fonts.googleapis.com', kind: 'Stylesheet (CSS @import)', where: ['Front'] },
      { url: '//cdn.example.org/b.png', host: 'cdn.example.org', kind: 'Font or image (CSS url)', where: ['Front'] },
    ])
    expect(webHosts(blocked.report)).toEqual(['cdn.example.org', 'example.com', 'fonts.googleapis.com'])
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
    expect(report.web.map((finding) => [finding.host, finding.kind])).toEqual([
      ['plugins.example', 'Plugin'],
      ['www.youtube.com', 'Embedded page'],
      ['tracker.example', 'Image'],
    ])
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
    parts: [{ label: 'Front', html: '<img src="flag.png"> [sound] <audio controls src="b.mp3"></audio>' }],
    layout: ([part = '']) => `<div id="qa">${part}</div>`,
    css: '.card { background: url(_bg.png) } </style><script>alert(1)</script>',
    bodyClass: 'card card1',
  }
  const options = { allowScripts: false, allowWeb: false, nightMode: true, canPlay: () => true }

  it('reports what the content needs before media is loaded', () => {
    expect(scanContent([content])).toEqual({ scripts: [], web: [], media: ['flag.png', 'b.mp3', '_bg.png'] })
  })

  it('merges findings from several frames, keeping every place they were found', () => {
    const side = (label: string, html: string): FrameContent => ({ ...content, parts: [{ label, html }], css: '' })
    const image = '<img src="https://example.com/a.png">'
    const report = scanContent([side('Front', image), side('Back', `${image}<b onclick="x()">b</b>`)])
    expect(report.web).toEqual([{ url: 'https://example.com/a.png', host: 'example.com', kind: 'Image', where: ['Front', 'Back'] }])
    expect(report.scripts).toEqual([{ type: 'code', label: 'onclick on <b>', code: 'x()', where: ['Back'] }])
    expect(mergeReports([report, report])).toEqual(report)
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
