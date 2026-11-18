import { Layers } from 'lucide-react'
import { Link, Outlet } from 'react-router'

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-4">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Layers className="size-5 text-primary" aria-hidden="true" />
            APKG Explorer
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
