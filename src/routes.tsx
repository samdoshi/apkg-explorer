import { createHashRouter, Navigate } from 'react-router'
import { AppLayout } from '@/features/app-shell/app-layout'
import { StartScreen } from '@/features/open-file/start-screen'

// Every route in the app lives here. Hash routing keeps GitHub Pages happy
// (no server rewrites needed) and nothing about the URL is sent to the server.
export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <StartScreen /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
