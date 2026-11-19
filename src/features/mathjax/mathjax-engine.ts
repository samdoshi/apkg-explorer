import { mathjax } from '@mathjax/src/js/mathjax.js'
import { LiteElement } from '@mathjax/src/js/adaptors/lite/Element.js'
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js'
import { AssistiveMmlHandler } from '@mathjax/src/js/a11y/assistive-mml.js'
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js'
import { TeX } from '@mathjax/src/js/input/tex.js'
import { SVG } from '@mathjax/src/js/output/svg.js'
import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/js/svg.js'
// Anki's setup: MathJax's default TeX packages plus noerrors and mhchem, with the
// extensions MathJax would otherwise fetch on demand ("autoload") bundled up front.
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js'
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js'
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js'
import '@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js'
import '@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js'
import '@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js'
import '@mathjax/src/js/input/tex/noerrors/NoErrorsConfiguration.js'
import '@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js'
import '@mathjax/src/js/input/tex/action/ActionConfiguration.js'
import '@mathjax/src/js/input/tex/amscd/AmsCdConfiguration.js'
import '@mathjax/src/js/input/tex/bbox/BboxConfiguration.js'
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js'
import '@mathjax/src/js/input/tex/braket/BraketConfiguration.js'
import '@mathjax/src/js/input/tex/bussproofs/BussproofsConfiguration.js'
import '@mathjax/src/js/input/tex/cancel/CancelConfiguration.js'
import '@mathjax/src/js/input/tex/color/ColorConfiguration.js'
import '@mathjax/src/js/input/tex/enclose/EncloseConfiguration.js'
import '@mathjax/src/js/input/tex/extpfeil/ExtpfeilConfiguration.js'
import '@mathjax/src/js/input/tex/html/HtmlConfiguration.js'
import '@mathjax/src/js/input/tex/unicode/UnicodeConfiguration.js'
import '@mathjax/src/js/input/tex/verb/VerbConfiguration.js'

const PACKAGES = [
  'base', 'ams', 'newcommand', 'textmacros', 'noundefined', 'configmacros', 'noerrors', 'mhchem',
  'action', 'amscd', 'bbox', 'boldsymbol', 'braket', 'bussproofs', 'cancel', 'color', 'enclose',
  'extpfeil', 'html', 'unicode', 'verb',
]

/*
 * The font keeps rarer glyph ranges (script, fraktur, arrows, Cyrillic…) in separate files
 * that MathJax asks for by name when a formula needs them. Each one is bundled as its own
 * chunk, so nothing is fetched from anywhere but this app.
 */
const fontFiles = import.meta.glob<unknown>('/node_modules/@mathjax/mathjax-newcm-font/mjs/svg/dynamic/*.js')
const fontFileByName = new Map(
  Object.entries(fontFiles).map(([path, load]) => [path.slice(path.lastIndexOf('/') + 1), load]),
)

mathjax.asyncLoad = (name: string) => {
  const load = fontFileByName.get(name.slice(name.lastIndexOf('/') + 1))
  if (!load) return Promise.reject(new Error(`MathJax asked for ${name}, which isn't bundled`))
  return load()
}

const adaptor = liteAdaptor()
AssistiveMmlHandler(RegisterHTMLHandler(adaptor))

// No font cache: each formula carries its own glyph paths, so formulas stand alone.
const output = new SVG({ fontData: MathJaxNewcmFont, fontCache: 'none' })
const document = mathjax.document('', { InputJax: new TeX({ packages: PACKAGES }), OutputJax: output })

// MathJax's document API is typed loosely; the lite adaptor always works with LiteElements.
function liteElement(node: unknown): LiteElement {
  if (!(node instanceof LiteElement)) throw new Error('MathJax returned something other than an element')
  return node
}

/** Typesets TeX as SVG markup (an <mjx-container> with hidden MathML for screen readers). */
export async function texToSvg(tex: string, display: boolean): Promise<string> {
  const node: unknown = await document.convertPromise(tex, { display })
  return adaptor.outerHTML(liteElement(node))
}

/** The CSS that MathJax's SVG output needs (layout of containers, hidden MathML). */
export function mathCss(): string {
  const sheet: unknown = output.styleSheet(document)
  return adaptor.textContent(liteElement(sheet))
}
