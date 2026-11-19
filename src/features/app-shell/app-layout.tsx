import { FileArchive, FolderOpen, Layers } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { useOpenPackage } from '@/features/open-file/use-open-package'
import { useWindowFileDrop } from '@/features/open-file/use-window-file-drop'
import { usePackage } from '@/features/package/package-context'
import { cn } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-2.5 py-1.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
    isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
  )

export function AppLayout() {
  const { state } = usePackage()
  const openPackage = useOpenPackage()
  const dragging = useWindowFileDrop((file) => void openPackage(file))
  const onStartScreen = useLocation().pathname === '/'
  const showFileNav = state.status === 'ready' && !onStartScreen

  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-2 px-4 sm:gap-3">
          <Link
            to="/"
            aria-label="APKG Explorer start page"
            className="flex shrink-0 items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Layers className="size-5 text-primary" aria-hidden="true" />
            <span className="hidden sm:inline">APKG Explorer</span>
          </Link>
          {showFileNav && (
            <>
              <nav aria-label="Views" className="flex items-center gap-1 sm:ml-2">
                <NavLink to="/notes" className={navLinkClass}>
                  Notes
                </NavLink>
                <NavLink to="/media" className={navLinkClass}>
                  Media
                </NavLink>
                <NavLink to="/overview" className={navLinkClass}>
                  Overview
                </NavLink>
              </nav>
              <p className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground md:flex">
                <FileArchive className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{state.summary.fileName}</span>
              </p>
              <Button asChild variant="outline" size="sm" className="ml-auto shrink-0">
                <Link to="/" aria-label="Open another file">
                  <FolderOpen data-icon="inline-start" aria-hidden="true" />
                  <span className="hidden sm:inline">Open another file</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
