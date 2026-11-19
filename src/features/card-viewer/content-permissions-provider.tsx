import { useMemo, useState, type ReactNode } from 'react'
import { ContentPermissionsContext } from './content-permissions'

/**
 * Holds the open file's permissions in memory only. Keyed by file where it's used, so
 * they reset when another file opens; a reload resets them too. Nothing is saved.
 */
export function ContentPermissionsProvider({ children }: { children: ReactNode }) {
  const [scripts, setScripts] = useState(false)
  const [web, setWeb] = useState(false)
  const value = useMemo(() => ({ scripts, web, setScripts, setWeb }), [scripts, web])
  return <ContentPermissionsContext value={value}>{children}</ContentPermissionsContext>
}
