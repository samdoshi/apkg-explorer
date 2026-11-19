import { createContext, useContext } from 'react'

/** Whether cards from the open file may run scripts and load web content. */
export interface ContentPermissions {
  scripts: boolean
  web: boolean
  setScripts: (allowed: boolean) => void
  setWeb: (allowed: boolean) => void
}

export const ContentPermissionsContext = createContext<ContentPermissions | null>(null)

export function useContentPermissions(): ContentPermissions {
  const value = useContext(ContentPermissionsContext)
  if (!value) throw new Error('useContentPermissions must be used inside <ContentPermissionsProvider>')
  return value
}
