import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { PackageProvider } from '@/features/package/package-provider'
import { prefetchPages, router } from '@/routes'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <PackageProvider>
      <RouterProvider router={router} />
    </PackageProvider>
  </StrictMode>,
)

// The pages for an open file come after the start screen, but before they're needed.
window.addEventListener('load', prefetchPages, { once: true })
