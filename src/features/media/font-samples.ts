/** Sample text for the font preview, one line per language (pangrams, or "I can eat glass"). */
export interface FontSample {
  language: string
  /** For the lang attribute: it picks local glyph forms (and fallback fonts) for CJK. */
  lang: string
  text: string
}

export const FONT_SAMPLES: readonly FontSample[] = [
  { language: 'English', lang: 'en', text: 'The quick brown fox jumps over the lazy dog.' },
  { language: 'French', lang: 'fr', text: "Voix ambiguë d'un cœur qui, au zéphyr, préfère les jattes de kiwis." },
  { language: 'German', lang: 'de', text: 'Victor jagt zwölf Boxkämpfer quer über den großen Sylter Deich.' },
  { language: 'Spanish', lang: 'es', text: 'El veloz murciélago hindú comía feliz cardillo y kiwi.' },
  { language: 'Polish', lang: 'pl', text: 'Pchnąć w tę łódź jeża lub ośm skrzyń fig.' },
  { language: 'Czech', lang: 'cs', text: 'Příliš žluťoučký kůň úpěl ďábelské ódy.' },
  { language: 'Turkish', lang: 'tr', text: 'Pijamalı hasta yağız şoföre çabucak güvendi.' },
  { language: 'Vietnamese', lang: 'vi', text: 'Tôi có thể ăn thủy tinh mà không hại gì.' },
  { language: 'Greek', lang: 'el', text: 'Ξεσκεπάζω την ψυχοφθόρα βδελυγμία.' },
  { language: 'Russian', lang: 'ru', text: 'Съешь же ещё этих мягких французских булок, да выпей чаю.' },
  { language: 'Hebrew', lang: 'he', text: 'אני יכול לאכול זכוכית וזה לא מזיק לי.' },
  { language: 'Arabic', lang: 'ar', text: 'أنا قادر على أكل الزجاج و هذا لا يؤلمني.' },
  { language: 'Hindi', lang: 'hi', text: 'मैं काँच खा सकता हूँ और मुझे उससे कोई चोट नहीं पहुंचती.' },
  { language: 'Thai', lang: 'th', text: 'ฉันกินกระจกได้ แต่มันไม่ทำให้ฉันเจ็บ' },
  { language: 'Chinese (Simplified)', lang: 'zh-Hans', text: '我能吞下玻璃而不伤身体。' },
  { language: 'Chinese (Traditional)', lang: 'zh-Hant', text: '我能吞下玻璃而不傷身體。' },
  { language: 'Japanese', lang: 'ja', text: '私はガラスを食べられます。それは私を傷つけません。' },
  { language: 'Korean', lang: 'ko', text: '다람쥐 헌 쳇바퀴에 타고파' },
  { language: 'Digits and symbols', lang: 'en', text: '0123456789 & @ # % € £ ¥ $ + − × ÷ = ( ) [ ] { } “ ” « »' },
]

/** A stretch of text whose characters are all in the font, or all missing from it. */
export interface TextRun {
  text: string
  missing: boolean
}

export interface Coverage {
  runs: TextRun[]
  /** Characters the font lacks, each once, in the order they appear. */
  missing: string[]
  /** Whether the font has any of the text's letters and digits. */
  hasAny: boolean
}

const SPACE = /\s/u
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

/**
 * Splits text by whether the font has each character. Spaces always count as present:
 * any font's (or the fallback's) look the same.
 */
export function coverage(text: string, has: (codePoint: number) => boolean): Coverage {
  const runs: TextRun[] = []
  const missing = new Set<string>()
  let hasAny = false
  for (const char of text) {
    const present = SPACE.test(char) || has(char.codePointAt(0) ?? 0)
    if (!present) missing.add(char)
    else if (LETTER_OR_DIGIT.test(char)) hasAny = true
    const last = runs.at(-1)
    if (last?.missing === !present) last.text += char
    else runs.push({ text: char, missing: !present })
  }
  return { runs, missing: [...missing], hasAny }
}
