import { describe, expect, it } from 'vitest'
import { finishField, finishSide } from './card-html'
import { clozeNumbers, clozeOnly, revealCloze, stripClozes } from './cloze'
import { buildFieldMap, renderCard } from './template'
import { fieldIsEmpty, furigana, hint, kana, kanji, stripHtml } from './template-filters'

const fields = (entries: Record<string, string>) => new Map(Object.entries(entries))

function render(front: string, back: string, values: Record<string, string>, ord = 0, isCloze = false) {
  return renderCard({ front, back, fields: fields(values), ord, isCloze })
}

describe('template fields and conditionals', () => {
  it('fills in fields, FrontSide and conditionals', () => {
    const card = render(
      '{{Front}}{{#Extra}} ({{Extra}}){{/Extra}}{{^Extra}} (no extra){{/Extra}}',
      '{{FrontSide}}<hr id=answer>{{ Back }}',
      { Front: 'Q', Back: 'A', Extra: '<br><div></div> ' },
    )
    expect(card.question).toBe('Q (no extra)')
    expect(card.answer).toBe('Q (no extra)<hr id=answer>A')
    expect(render('{{#Extra}}[{{Extra}}]{{/Extra}}', '', { Extra: 'x' }).question).toBe('[x]')
  })

  it('treats only whitespace, <br> and <div> as empty', () => {
    expect(fieldIsEmpty(' <br/> <div></div>\n')).toBe(true)
    expect(fieldIsEmpty('&nbsp;')).toBe(false)
    expect(fieldIsEmpty('<img src="a.png">')).toBe(false)
  })

  it('adds special fields, letting real fields with the same name win', () => {
    const map = buildFieldMap({
      fieldNames: ['Front', 'Card'],
      fieldValues: ['Q', 'mine'],
      tags: ['a', 'b'],
      noteTypeName: 'Basic',
      deckName: 'Top::Sub',
      templateName: 'Card 1',
      flag: 2,
      cardId: 42,
      ord: 1,
    })
    const card = renderCard({
      front: '{{Tags}}|{{Type}}|{{Deck}}|{{Subdeck}}|{{CardFlag}}|{{Card}}|{{CardID}}|{{#c2}}two{{/c2}}{{#c1}}one{{/c1}}',
      back: '',
      fields: map,
      ord: 1,
      isCloze: false,
    })
    expect(card.question).toBe('a b|Basic|Top::Sub|Sub|flag2|mine|42|two')
  })

  it('shows template mistakes as a message, like Anki', () => {
    expect(render('{{Fronnt}}', '', { Front: 'Q' }).question).toContain(
      'Found &#39;{{Fronnt}}&#39;, but there is no field called &#39;Fronnt&#39;',
    )
    expect(render('{{#Front}}x', '', { Front: 'Q' }).question).toContain('Missing &#39;{{/Front}}&#39;')
    expect(render('{{#A}}{{/B}}', '', { A: '1' }).question).toContain('but expected &#39;{{/A}}&#39;')
    expect(render('x{{/A}}', '', { A: '1' }).question).toContain('but missing &#39;{{#A}}&#39;')
    expect(render('{{Front', '', { Front: 'Q' }).question).toContain('Missing &#39;}}&#39;')
    // The back still renders when the front is broken.
    expect(render('{{Nope}}', '{{Back}}', { Back: 'A' }).answer).toBe('A')
  })

  it('says when the front of a card would be blank', () => {
    expect(render('{{Front}}', '', { Front: '' }).question).toContain('The front of this card is blank.')
    expect(render('{{#Extra}}{{Front}}{{/Extra}}', '', { Front: 'Q', Extra: '' }).question).toContain('blank')
    expect(render('{{^Extra}}{{Front}}{{/Extra}}', '', { Front: 'Q', Extra: '' }).question).toBe('Q')
  })

  it('supports the old <% %> delimiters', () => {
    expect(render('{{=<% %>=}}<%Front%> {{Front}}', '', { Front: 'Q' }).question).toBe('Q {{Front}}')
  })
})

describe('template filters', () => {
  it('converts furigana, kana and kanji, leaving sound tags alone', () => {
    const text = '日本語[にほんご]を 話[はな]します[sound:a.mp3]'
    expect(furigana(text)).toBe(
      '<ruby><rb>日本語</rb><rt>にほんご</rt></ruby>を<ruby><rb>話</rb><rt>はな</rt></ruby>します[sound:a.mp3]',
    )
    expect(kana(text)).toBe('にほんごをはなします[sound:a.mp3]')
    expect(kanji(text)).toBe('日本語を話します[sound:a.mp3]')
    expect(furigana('a&nbsp;b[c]')).toBe('a<ruby><rb>b</rb><rt>c</rt></ruby>')
  })

  it('applies filters innermost first and passes unknown ones through', () => {
    const values = { Word: '<b>漢字[かんじ]</b>' }
    expect(render('{{text:kana:Word}}', '', values).question).toBe('かんじ')
    expect(render('{{myaddon:Word}}', '', values).question).toBe(values.Word)
    expect(render('{{tts en_US voices=x:Word}}', '', { Word: 'hi' }).question).toBe('hi')
    expect(render('{{Word}}{{tts-voices:}}', '', { Word: 'hi' }).question).toBe('hi')
  })

  it('strips HTML for the text filter and builds script-free hints', () => {
    expect(stripHtml('<b>a</b><!-- c -->&amp;b')).toBe('a&b')
    expect(hint('<i>tip</i>', 'Notes & more')).toBe(
      '<details class="hint"><summary>Notes &amp; more</summary><div class="hint"><i>tip</i></div></details>',
    )
    expect(hint('  ', 'Notes')).toBe('  ')
  })
})

describe('clozes', () => {
  const text = '{{c1::Canberra::city}} is the capital of {{c2::Australia}}.'

  it('hides the active deletion on the question and reveals it on the answer', () => {
    expect(revealCloze(text, 1, true)).toBe(
      '<span class="cloze" data-cloze="Canberra" data-ordinal="1">[city]</span> is the capital of ' +
        '<span class="cloze-inactive" data-ordinal="2">Australia</span>.',
    )
    expect(revealCloze(text, 2, false)).toBe(
      '<span class="cloze-inactive" data-ordinal="1">Canberra</span> is the capital of ' +
        '<span class="cloze" data-ordinal="2">Australia</span>.',
    )
    expect(revealCloze(text, 3, true)).toBe('')
  })

  it('handles nested and shared deletions', () => {
    const nested = '{{c1::Photosynthesis turns {{c2::light}} energy}} into chemical energy.'
    expect(revealCloze(nested, 1, true)).toBe(
      '<span class="cloze" data-cloze="Photosynthesis turns light energy" data-ordinal="1">[...]</span> into chemical energy.',
    )
    expect(revealCloze(nested, 2, true)).toBe(
      '<span class="cloze-inactive" data-ordinal="1">Photosynthesis turns ' +
        '<span class="cloze" data-cloze="light" data-ordinal="2">[...]</span> energy</span> into chemical energy.',
    )
    expect(revealCloze('{{c1,3::x}}', 3, false)).toBe('<span class="cloze" data-ordinal="1,3">x</span>')
    expect([...clozeNumbers(`${nested} {{c1,3::x}}`)].sort()).toEqual([1, 2, 3])
    expect(stripClozes(nested)).toBe('Photosynthesis turns light energy into chemical energy.')
  })

  it('keeps stray and unclosed markers as text', () => {
    expect(revealCloze('a }} {{c1::b}}', 1, false)).toBe('a }} <span class="cloze" data-ordinal="1">b</span>')
    expect(revealCloze('{{c1::b}} {{c1::open::hint', 1, false)).toBe(
      '<span class="cloze" data-ordinal="1">b</span> {{c1::open::hint',
    )
  })

  it('renders cloze cards and says when a card has no deletion', () => {
    const values = { Text: text, Extra: 'More' }
    const card = render('{{cloze:Text}}', '{{cloze:Text}}<br>{{Extra}}', values, 1, true)
    expect(card.question).toContain('[...]')
    expect(card.answer).toContain('<span class="cloze" data-ordinal="2">Australia</span>.<br>More')
    expect(render('{{cloze:Text}}', '', values, 4, true).question).toContain('No cloze 5 found on card.')
  })

  it('lists only this card’s deletions for cloze-only', () => {
    expect(clozeOnly('{{c1::a}} {{c2::b}} {{c1::c::hint}}', 1, false)).toBe('a, c')
    expect(clozeOnly('{{c1::a}} {{c2::b}} {{c1::c::hint}}', 1, true)).toBe('[...], [hint]')
  })
})

describe('finishing a side', () => {
  const values = fields({ Back: 'gracias <b>!</b>', Text: '{{c1::Rome}} and {{c2::Italy}}' })

  it('shows a disabled answer box on the question and the expected answer on the back', () => {
    const card = render('{{Front}} {{type:Back}}', '{{type:Back}} {{type:cloze:Text}}', {
      Front: 'Q',
      Back: 'gracias <b>!</b>',
      Text: '{{c1::Rome}} and {{c2::Italy}}',
    }, 1)
    expect(finishSide(card.question, { question: true, fields: values, cardNumber: 2 })).toContain(
      '<input type="text" id="typeans" disabled',
    )
    expect(finishSide(card.answer, { question: false, fields: values, cardNumber: 2 })).toBe(
      '<code id="typeans">gracias !</code> <code id="typeans">Italy</code>',
    )
  })

  it('turns sound tags into players and tts tags into text', () => {
    expect(finishSide('[sound:a "b".mp3][anki:tts lang=en_US]Hello[/anki:tts][sound:clip.mp4]', {
      question: true,
      fields: values,
      cardNumber: 1,
    })).toBe(
      '<audio controls preload="metadata" src="a &quot;b&quot;.mp3" aria-label="Audio: a &quot;b&quot;.mp3"></audio>' +
        'Hello<video controls preload="metadata" src="clip.mp4" aria-label="Video: clip.mp4"></video>',
    )
    expect(finishField('x [sound:a.mp3]')).toContain('<audio controls')
  })
})
