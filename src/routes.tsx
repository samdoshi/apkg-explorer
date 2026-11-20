import { createHashRouter, Navigate } from 'react-router'
import { AppLayout } from '@/features/app-shell/app-layout'
import { RequirePackage } from '@/features/app-shell/require-package'
import { PageError, PopupError } from '@/features/app-shell/route-error'
import { NoteDialog } from '@/features/card-viewer/note-dialog'
import { MediaPage } from '@/features/media/media-page'
import { MediaPreview } from '@/features/media/media-preview'
import { NotesIndex, NotesPage } from '@/features/notes-table/notes-page'
import { StartScreen } from '@/features/open-file/start-screen'
import { PackageOverview } from '@/features/overview/package-overview'

// Every route in the app lives here. Hash routing keeps GitHub Pages happy
// (no server rewrites needed) and nothing about the URL is sent to the server.
export const router = createHashRouter([
  {
    element: <AppLayout />,
    // Only if the layout itself fails; the route below keeps the header for anything else.
    errorElement: <PageError />,
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
              { path: 'notes', element: <NotesIndex /> },
              {
                path: 'notes/:noteTypeId',
                element: <NotesPage />,
                // The popup is a child route, so Back (or the Android back gesture) closes it.
                // If it fails, a smaller popup says so over the table.
                children: [{ path: ':noteId', element: <NoteDialog />, errorElement: <PopupError noun="note" /> }],
              },
              {
                path: 'media',
                element: <MediaPage />,
                // The preview is a child route too; the name is URI-encoded (see mediaPath).
                children: [{ path: ':name', element: <MediaPreview />, errorElement: <PopupError noun="file" /> }],
              },
              { path: 'overview', element: <PackageOverview /> },
            ],
          },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])
