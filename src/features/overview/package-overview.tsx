import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePackage } from '@/features/package/package-context'
import type { PackageFormat, PackageSummary } from '@/features/package/package'
import { formatBytes, formatCount } from '@/lib/format'

const formatLabels: Record<PackageFormat, string> = {
  anki21b: 'Anki 2.1.50+ format',
  anki21: 'Anki 2.1 format',
  anki2: 'Anki 2.0 format',
}

/** #/overview: what's in the open package (format, counts, note types, decks). */
export function PackageOverview() {
  const { state } = usePackage()
  if (state.status !== 'ready') return null
  return <Overview summary={state.summary} />
}

function Overview({ summary }: { summary: PackageSummary }) {
  const stats = [
    formatCount(summary.noteCount, 'note'),
    formatCount(summary.cardCount, 'card'),
    formatCount(summary.mediaCount, 'media file'),
    formatCount(summary.noteTypes.length, 'note type'),
  ]
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      <title>{`${summary.fileName} · APKG Explorer`}</title>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight break-all">{summary.fileName}</h1>
        <p className="text-sm text-muted-foreground">
          {formatLabels[summary.format]} · {formatBytes(summary.fileSize)}
        </p>
        <ul aria-label="Totals" className="flex flex-wrap gap-2 pt-1">
          {stats.map((stat) => (
            <li key={stat}>
              <Badge variant="secondary">{stat}</Badge>
            </li>
          ))}
        </ul>
      </div>

      <section aria-labelledby="note-types-heading" className="space-y-3">
        <h2 id="note-types-heading" className="text-lg font-semibold">
          Note types
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.noteTypes.map((noteType) => (
            <li key={noteType.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <h3>{noteType.name}</h3>
                    {noteType.isImageOcclusion ? (
                      <Badge variant="outline">Image occlusion</Badge>
                    ) : (
                      noteType.kind === 'cloze' && <Badge variant="outline">Cloze</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {formatCount(noteType.noteCount, 'note')} ·{' '}
                    {formatCount(noteType.cardCount, 'card')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <NameList label="Fields" names={noteType.fieldNames} />
                  <NameList label="Card types" names={noteType.templateNames} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="decks-heading" className="space-y-3">
        <h2 id="decks-heading" className="text-lg font-semibold">
          Decks
        </h2>
        <ul className="divide-y rounded-xl border">
          {summary.decks.map((deck) => (
            <li key={deck.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 break-words">{deck.name}</span>
                {deck.filtered && (
                  <Badge variant="outline" title="Its cards are borrowed from their home decks">
                    Filtered
                  </Badge>
                )}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {formatCount(deck.cardCount, 'card')}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function NameList({ label, names }: { label: string; names: string[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <ul aria-label={label} className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <li key={name}>
            <Badge variant="outline" className="font-normal">
              {name}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
