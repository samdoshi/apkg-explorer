import { createHashRouter, Navigate } from 'react-router'
import { Spinner } from '@/components/ui/spinner'
import { AppLayout } from '@/features/app-shell/app-layout'
import { RequirePackage } from '@/features/app-shell/require-package'
import { PageError, PopupError } from '@/features/app-shell/route-error'
import { StartScreen } from '@/features/open-file/start-screen'

/*
 * Pages that need an open file are loaded when first visited, so the start screen comes up
 * without them. prefetchPages() fetches them in the background once it's up.
 */
const notesPage = () => import('@/features/notes-table/notes-page')
const noteDialog = () => import('@/features/card-viewer/note-dialog')
const mediaPage = () => import('@/features/media/media-page')
const mediaPreview = () => import('@/features/media/media-preview')
const overview = () => import('@/features/overview/package-overview')

export function prefetchPages() {
  for (const load of [notesPage, noteDialog, mediaPage, mediaPreview, overview]) {
    // A failure shows when the page is visited (as the route's error message).
    load().catch(() => undefined)
  }
}

// Every route in the app lives here. Hash routing keeps GitHub Pages happy
// (no server rewrites needed) and nothing about the URL is sent to the server.
export const router = createHashRouter([
  {
    element: <AppLayout />,
    // Only if the layout itself fails; the route below keeps the header for anything else.
    errorElement: <PageError />,
    // A reload on a page that's loaded when visited: shown while its code loads (it then
    // goes to the start screen, as nothing is open after a reload).
    hydrateFallbackElement: (
      <div className="flex h-dvh items-center justify-center">
        <Spinner aria-label="Loading" />
      </div>
    ),
    children: [
      {
        // A page that fails while drawing is replaced by a message (see route-error.tsx).
        errorElement: <PageError />,
        children: [
          { index: true, element: <StartScreen /> },
          {
            // Needs an open file; a reload loses it, so these redirect to the start screen.
            element: <RequirePackage />,
            children: [
              { path: 'notes', lazy: { Component: async () => (await notesPage()).NotesIndex } },
              {
                path: 'notes/:noteTypeId',
                lazy: { Component: async () => (await notesPage()).NotesPage },
                // The popup is a child route, so Back (or the Android back gesture) closes it.
                // If it fails, a smaller popup says so over the table.
                children: [
                  {
                    path: ':noteId',
                    lazy: { Component: async () => (await noteDialog()).NoteDialog },
                    errorElement: <PopupError noun="note" />,
                  },
                ],
              },
              {
                path: 'media',
                lazy: { Component: async () => (await mediaPage()).MediaPage },
                // The preview is a child route too; the name is URI-encoded (see mediaPath).
                children: [
                  {
                    path: ':name',
                    lazy: { Component: async () => (await mediaPreview()).MediaPreview },
                    errorElement: <PopupError noun="file" />,
                  },
                ],
              },
              { path: 'overview', lazy: { Component: async () => (await overview()).PackageOverview } },
            ],
          },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])
