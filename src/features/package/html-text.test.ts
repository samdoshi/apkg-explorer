import { describe, expect, it } from 'vitest'
import { decodeEntities, htmlToText } from './html-text'

describe('htmlToText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(htmlToText('What is <b>gold</b>?<br>Symbol:<div>Au</div>')).toEqual({
      text: 'What is gold? Symbol: Au',
      media: [],
    })
  })

  it('collects images and sounds as media references', () => {
    expect(htmlToText('Paris<br><img class="x" src="flag-france.png"> [sound:chime.wav]')).toEqual({
      text: 'Paris',
      media: [
        { kind: 'image', name: 'flag-france.png' },
        { kind: 'audio', name: 'chime.wav' },
      ],
    })
    expect(htmlToText("<img src='a&amp;b.jpg'><video src=clip.webm></video>").media).toEqual([
      { kind: 'image', name: 'a&b.jpg' },
      { kind: 'video', name: 'clip.webm' },
    ])
  })

  it('drops scripts, styles, comments and inline SVG drawings', () => {
    const html =
      'a<script>alert(1)</script>b<style>.x{}</style>c<!-- note -->d' +
      '<svg xmlns="http://www.w3.org/2000/svg"><text>H L</text></svg>e'
    expect(htmlToText(html).text).toBe('abcde')
  })

  it('keeps furigana and cloze markup as written', () => {
    expect(htmlToText('漢字[かんじ]を{{c1::書く}}').text).toBe('漢字[かんじ]を{{c1::書く}}')
  })

  it('decodes named and numeric entities', () => {
    expect(decodeEntities('299&nbsp;792&nbsp;458 &amp; &lt;x&gt; &#233;&#x1F600; &unknown;')).toBe(
      '299 792 458 & <x> é😀 &unknown;',
    )
  })
})
