import { Navigate, Outlet } from 'react-router'
import { usePackage } from '@/features/package/package-context'

/** Routes inside this need an open file; without one (e.g. after a reload) go to the start. */
export function RequirePackage() {
  const { state } = usePackage()
  if (state.status !== 'ready') return <Navigate to="/" replace />
  return <Outlet />
}
