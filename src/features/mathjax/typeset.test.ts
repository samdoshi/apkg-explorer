import { describe, expect, it } from 'vitest'
import { typesetMath } from './typeset'

describe('typesetMath', () => {
  it('leaves HTML without maths alone and skips loading MathJax', async () => {
    expect(await typesetMath(['<b>No maths</b>', '\\( unclosed'])).toEqual({
      parts: ['<b>No maths</b>', '\\( unclosed'],
      css: null,
    })
  })

  it('replaces inline and display maths with SVG and hidden MathML', async () => {
    const { parts, css } = await typesetMath(['Solve \\(x^2 = 9\\).', '\\[x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\\]'])
    const [inline = '', display = ''] = parts
    expect(inline).toMatch(/^Solve <mjx-container class="MathJax" jax="SVG"[^>]*><svg [^>]*role="img"/)
    expect(inline).toMatch(/<\/mjx-container>\.$/)
    expect(inline).toContain('<mjx-assistive-mml')
    expect(display).toMatch(/^<mjx-container [^>]*display="true"/)
    expect(css).toContain('mjx-container[display]')
    expect(css).toContain('mjx-assistive-mml')
  })

  it('draws rarer glyphs from the bundled font files, and shows broken TeX as an error', async () => {
    const {
      parts: [fancy = '', broken = '', unbalanced = ''],
    } = await typesetMath([
      '\\(\\mathscr{L} \\mathfrak{g} \\ce{H2O}\\)',
      '\\(\\frac{1}\\)',
      // The closing delimiter is inside an open brace, so (as in MathJax) this isn't maths at all.
      '\\(\\frac{1}{\\)',
    ])
    expect(fancy).not.toContain('merror')
    expect(fancy.match(/<path /g)?.length).toBeGreaterThanOrEqual(5)
    expect(broken).toContain('data-mjx-error="Missing argument for \\frac"')
    expect(unbalanced).toBe('\\(\\frac{1}{\\)')
  })
})
