import { FileArchive, FolderOpen, Layers } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { useOpenPackage } from '@/features/open-file/use-open-package'
import { useWindowFileDrop } from '@/features/open-file/use-window-file-drop'
import { usePackage } from '@/features/package/package-context'

export function AppLayout() {
  const { state } = usePackage()
  const openPackage = useOpenPackage()
  const dragging = useWindowFileDrop((file) => void openPackage(file))
  const onStartScreen = useLocation().pathname === '/'

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-4">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Layers className="size-5 text-primary" aria-hidden="true" />
            APKG Explorer
          </Link>
          {state.status === 'ready' && !onStartScreen && (
            <>
              <p className="ml-2 hidden min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground sm:flex">
                <FileArchive className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{state.summary.fileName}</span>
              </p>
              <Button asChild variant="outline" size="sm" className="ml-auto">
                <Link to="/">
                  <FolderOpen data-icon="inline-start" aria-hidden="true" />
                  Open another file
                </Link>
              </Button>
            </>
          )}
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
        >
          <div className="flex size-full items-center justify-center rounded-2xl border-4 border-dashed border-primary text-lg font-medium">
            Drop to open
          </div>
        </div>
      )}
    </div>
  )
}
