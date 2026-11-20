import { describe, expect, it } from 'vitest'
import { cssReferences, htmlReferences } from './media-references'

describe('htmlReferences', () => {
  it('finds files in URL attributes, srcset, styles and [sound:] tags', () => {
    const html = [
      '<img src="a.png" srcset="b.png 2x, c.png 3x">',
      '<audio src=d.mp3></audio>[sound:e.mp3]',
      `<div style="background: url('f.jpg')">`,
      '<object data="g.pdf"></object><video poster="h.jpg"><source src="i.webm"></video>',
      '<a href="j.pdf">notes</a><table background="k.gif">',
      '<style>@import "_l.css"; .x { background: url(m.svg) }</style>',
      '<link rel="stylesheet" href="_n.css"><link rel="icon" href="o.ico">',
    ].join('')
    expect(htmlReferences(html)).toEqual({
      files: ['_l.css', 'm.svg', 'a.png', 'b.png', 'c.png', 'd.mp3', 'f.jpg', 'g.pdf', 'h.jpg', 'i.webm', 'j.pdf', 'k.gif', '_n.css', 'o.ico', 'e.mp3'],
      stylesheets: ['_l.css', '_n.css'],
    })
  })

  it('decodes entities and drops queries, and ignores web addresses, data, links within the card and comments', () => {
    const html =
      '<img src="caf&#233; &amp; cake.png?v=2"><img src="https://example.com/x.png"><img src="data:image/png;base64,AA">' +
      '<a href="#top">top</a><!-- <img src="old.png"> --><img src="./pics/y.png">'
    expect(htmlReferences(html).files).toEqual(['café & cake.png', 'pics/y.png'])
  })

  it('counts a script file but not names in script code, and skips template fields', () => {
    const html =
      '<script src="_quiz.js">load("_hidden.json")</script>' +
      '<img src="{{Picture}}">[sound:{{Audio}}]<img src="_logo.png">'
    expect(htmlReferences(html).files).toEqual(['_quiz.js', '_logo.png'])
  })

  it('reads attributes in any case and quote style, with > inside quotes', () => {
    expect(htmlReferences(`<IMG ALT="a > b" SRC='z.png'>`).files).toEqual(['z.png'])
  })
})

describe('cssReferences', () => {
  it('finds url() files and @imported stylesheets', () => {
    expect(cssReferences('@import url("_a.css") screen; @font-face { src: url(_f.ttf) } .x { background: url(https://x.y/z.png) }')).toEqual({
      files: ['_a.css', '_f.ttf'],
      stylesheets: ['_a.css'],
    })
  })
})
