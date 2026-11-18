import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { PackageProvider } from '@/features/package/package-provider'
import { router } from '@/routes'
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
