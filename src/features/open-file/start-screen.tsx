import { FileArchive, ShieldCheck } from 'lucide-react'

export function StartScreen() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-4 py-12">
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Look inside an Anki deck
        </h1>
        <p className="text-pretty text-muted-foreground">
          Browse the notes, cards and media in an <code className="font-mono">.apkg</code> file.
        </p>
      </div>

      <section
        aria-labelledby="open-file-heading"
        className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center"
      >
        <FileArchive className="size-10 text-muted-foreground" aria-hidden="true" />
        <h2 id="open-file-heading" className="font-medium">
          Open a deck
        </h2>
        <p className="text-sm text-muted-foreground">
          Opening files arrives in the next build step.
        </p>
      </section>

      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        Your file stays on this device. Nothing is uploaded or saved.
      </p>
    </div>
  )
}
