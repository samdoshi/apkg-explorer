import { createHashRouter, Navigate } from 'react-router'
import { AppLayout } from '@/features/app-shell/app-layout'
import { RequirePackage } from '@/features/app-shell/require-package'
import { NoteDialog } from '@/features/card-viewer/note-dialog'
import { NotesIndex, NotesPage } from '@/features/notes-table/notes-page'
import { StartScreen } from '@/features/open-file/start-screen'
import { PackageOverview } from '@/features/overview/package-overview'

// Every route in the app lives here. Hash routing keeps GitHub Pages happy
// (no server rewrites needed) and nothing about the URL is sent to the server.
export const router = createHashRouter([
  {
    element: <AppLayout />,
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
            children: [{ path: ':noteId', element: <NoteDialog /> }],
          },
          { path: 'overview', element: <PackageOverview /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
