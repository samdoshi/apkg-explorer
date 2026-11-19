import { Navigate, Outlet } from 'react-router'
import { ContentPermissionsProvider } from '@/features/card-viewer/content-permissions-provider'
import { usePackage } from '@/features/package/package-context'

/** Routes inside this need an open file; without one (e.g. after a reload) go to the start. */
export function RequirePackage() {
  const { state } = usePackage()
  if (state.status !== 'ready') return <Navigate to="/" replace />
  // Keyed by file: allowing scripts or web content lasts until another file opens.
  return (
    <ContentPermissionsProvider key={state.client.id}>
      <Outlet />
    </ContentPermissionsProvider>
  )
}
