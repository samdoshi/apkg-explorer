import { useId, useMemo, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { formatCount } from '@/lib/format'
import {
  codePointLabel,
  hasCharacter,
  privateUseCharacters,
  type FontInfo,
  type PrivateUseCharacter,
} from './font-file'
import { coverage, FONT_SAMPLES, type Coverage } from './font-samples'
import { useFontFace } from './use-font-face'

type Has = ((codePoint: number) => boolean) | null

/** Font files: details, sample text in many languages, your own text and private use glyphs. */
export function FontView({ name, blob }: { name: string; blob: Blob }) {
  const font = useFontFace(blob)
  if (font.status === 'loading') return <Spinner aria-label={`Reading ${name}`} />
  if (font.status === 'failed') {
    return (
      <div className="flex max-w-lg flex-col gap-4">
        <p className="text-center text-sm text-muted-foreground">This browser can’t display this font.</p>
        {font.info && <FontDetails info={font.info} />}
      </div>
    )
  }
  return <FontSpecimen name={name} family={font.family} info={font.info} />
}

function FontSpecimen({ name, family, info }: { name: string; family: string; info: FontInfo | null }) {
  const [text, setText] = useState('')
  const inputId = useId()
  const samplesId = useId()
  // Characters the font lacks are drawn by the browser's own fonts, so they're marked.
  const style: CSSProperties = { fontFamily: `"${family}", system-ui, sans-serif` }
  const has: Has = useMemo(() => (info ? (codePoint: number) => hasCharacter(info, codePoint) : null), [info])
  const samples = useMemo(
    () => FONT_SAMPLES.map((sample) => ({ ...sample, coverage: has ? coverage(sample.text, has) : null })),
    [has],
  )
  const shown = samples.filter((sample) => sample.coverage?.hasAny ?? true)
  const absent = samples.filter((sample) => !(sample.coverage?.hasAny ?? true)).map((sample) => sample.language)
  const privateUse = useMemo(() => (info ? privateUseCharacters(info) : []), [info])

  return (
    // Focusable so it can be scrolled from the keyboard.
    <div
      role="region"
      tabIndex={0}
      aria-label={`Preview of ${name}`}
      className="min-h-0 w-full flex-1 self-stretch overflow-y-auto rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-2">
        {info ? (
          <FontDetails info={info} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Couldn’t read this font’s details or which characters it has, so some sample text may be drawn with
            another font.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>Your text</Label>
          <Input
            id={inputId}
            placeholder="Type to try this font"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
            }}
          />
          {text.trim() && (
            <div className="flex flex-col gap-1">
              <SampleText label="Your text" lang="" text={text} coverage={has ? coverage(text, has) : null} style={style} />
            </div>
          )}
        </div>

        <section aria-labelledby={samplesId} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 id={samplesId} className="text-sm font-medium">
              Sample text
            </h3>
            {has && (
              <p className="text-xs text-muted-foreground">
                Faded, underlined characters aren’t in this font: your browser draws them with another one.
              </p>
            )}
          </div>
          <ul aria-label="Sample text" className="flex flex-col gap-4">
            {shown.map((sample) => (
              <li key={sample.language} className="flex flex-col gap-1">
                <SampleText
                  label={sample.language}
                  lang={sample.lang}
                  text={sample.text}
                  coverage={sample.coverage}
                  style={style}
                />
              </li>
            ))}
          </ul>
          {absent.length > 0 && <p className="text-sm text-muted-foreground">Not in this font: {absent.join(', ')}.</p>}
        </section>

        {privateUse.length > 0 && <PrivateUse characters={privateUse} style={{ fontFamily: `"${family}"` }} />}
      </div>
    </div>
  )
}

const SHOWN_MISSING = 12

function SampleText({
  label,
  lang,
  text,
  coverage,
  style,
}: {
  label: string
  lang: string
  text: string
  coverage: Coverage | null
  style: CSSProperties
}) {
  const missing = coverage?.missing ?? []
  const listed = missing.slice(0, SHOWN_MISSING).join(' ')
  const more = missing.length > SHOWN_MISSING ? ` and ${(missing.length - SHOWN_MISSING).toLocaleString('en')} more` : ''
  return (
    <>
      <span className="text-xs text-muted-foreground">
        {label}
        {missing.length > 0 && ` · not in this font: ${listed}${more}`}
      </span>
      <p lang={lang} dir="auto" style={style} className="text-2xl leading-snug wrap-anywhere">
        {coverage
          ? coverage.runs.map((run, index) =>
              run.missing ? (
                <span
                  // Runs are fixed for a given text, so their index is a stable key.
                  key={index}
                  className="text-muted-foreground/60 underline decoration-dotted underline-offset-4"
                >
                  {run.text}
                </span>
              ) : (
                run.text
              ),
            )
          : text}
      </p>
    </>
  )
}

const PRIVATE_USE_STEP = 240

function PrivateUse({ characters, style }: { characters: PrivateUseCharacter[]; style: CSSProperties }) {
  const [limit, setLimit] = useState(PRIVATE_USE_STEP)
  const headingId = useId()
  const first = characters[0]?.codePoint ?? 0xe000
  const remaining = characters.length - limit
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-sm font-medium">
          Private use characters{' '}
          <span className="font-normal text-muted-foreground tabular-nums">{characters.length.toLocaleString('en')}</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Code points with no standard meaning, where fonts keep icons and extra glyphs. A card shows one with the
          character itself or an entity such as <code className="font-mono">&amp;#x{first.toString(16).toUpperCase()};</code>
        </p>
      </div>
      <ul aria-label="Private use characters" className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
        {characters.slice(0, limit).map(({ codePoint, name }) => (
          <li key={codePoint} className="flex min-w-0 flex-col items-center gap-1 rounded-lg border p-2 text-center">
            <span aria-hidden="true" style={style} className="flex h-12 items-center text-4xl leading-none">
              {String.fromCodePoint(codePoint)}
            </span>{' '}
            <span className="font-mono text-xs">{codePointLabel(codePoint)}</span>
            {name && (
              <>
                {' '}
                <span className="w-full truncate text-xs text-muted-foreground" title={name}>
                  {name}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setLimit(limit + PRIVATE_USE_STEP)
          }}
        >
          Show {Math.min(remaining, PRIVATE_USE_STEP).toLocaleString('en')} more
        </Button>
      )}
    </section>
  )
}

function formatLabel(info: FontInfo): string {
  const outlines =
    info.outlines === 'CFF' || info.outlines === 'CFF2'
      ? `PostScript (${info.outlines}) outlines`
      : info.outlines === 'bitmap'
        ? 'bitmap glyphs'
        : info.outlines === 'TrueType'
          ? 'TrueType outlines'
          : null
  const container = {
    sfnt: info.outlines === 'TrueType' ? 'TrueType' : 'OpenType',
    collection: `Collection of ${formatCount(info.fontCount, 'font')} (showing the first)`,
    woff: 'WOFF',
    woff2: 'WOFF2',
  }[info.container]
  // A TrueType file's outlines go without saying.
  return [container, container === 'TrueType' ? null : outlines].filter(Boolean).join(' · ')
}

function FontDetails({ info }: { info: FontInfo }) {
  const rows: [string, string][] = [
    ['Family', info.family ?? 'Not given'],
    ['Style', info.style ?? 'Not given'],
    ['Version', info.version ?? 'Not given'],
    ['Format', formatLabel(info)],
    ['Glyphs', info.glyphCount === null ? 'Not given' : info.glyphCount.toLocaleString('en')],
    ['Characters', info.codePoints.length.toLocaleString('en')],
  ]
  if (info.axes.length > 0) {
    const axes = info.axes.map((axis) => `${axis.name} ${String(axis.min)}–${String(axis.max)}`)
    rows.push(['Variable', axes.join(', ')])
  }
  if (info.colourTables.length > 0) rows.push(['Colour glyphs', info.colourTables.join(', ')])
  return (
    <div className="flex flex-col gap-2">
      <dl aria-label="Font details" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
      {info.copyright && <p className="text-xs whitespace-pre-line text-muted-foreground">{info.copyright}</p>}
    </div>
  )
}
