import { describe, expect, it } from 'vitest'
import { findMath, replaceMath } from './find-math'

const texOf = (html: string) => findMath(html).map((span) => [span.tex, span.display])

describe('findMath', () => {
  it('finds inline and display maths with their places in the HTML', () => {
    const html = 'Solve \\(x^2 = 9\\). <b>Then</b> \\[x = \\pm 3\\]'
    const spans = findMath(html)
    expect(spans.map((span) => [span.tex, span.display])).toEqual([
      ['x^2 = 9', false],
      ['x = \\pm 3', true],
    ])
    expect(spans.map((span) => html.slice(span.start, span.end))).toEqual(['\\(x^2 = 9\\)', '\\[x = \\pm 3\\]'])
    expect(replaceMath(html, spans, ['A', 'B'])).toBe('Solve A. <b>Then</b> B')
  })

  it('decodes entities, keeps line breaks and ignores comments inside maths', () => {
    expect(texOf('\\[a &amp; b \\\\<br>c &lt; d<!-- x -->\\]')).toEqual([['a & b \\\\\nc < d', true]])
  })

  it('needs the closing delimiter outside braces and not escaped', () => {
    expect(texOf('\\(\\text{a \\) b}\\)')).toEqual([['\\text{a \\) b}', false]])
    expect(texOf('\\(a \\\\) b\\)')).toEqual([['a \\\\) b', false]])
  })

  it('leaves unclosed delimiters as text and keeps looking', () => {
    expect(texOf('\\( no end \\[x\\]')).toEqual([['x', true]])
  })

  it('does not cross elements, and skips code, scripts and attributes', () => {
    expect(texOf('\\(a <b>b</b> c\\)')).toEqual([])
    expect(texOf('<code>\\(x\\)</code><pre>\\[y\\]</pre><span title="\\(z\\)">\\(w\\)</span>')).toEqual([['w', false]])
    expect(texOf('<script>if (a<b) "\\(x\\)"</script><style>a::after{content:"\\(y\\)"}</style>\\(v\\)')).toEqual([
      ['v', false],
    ])
  })
})
