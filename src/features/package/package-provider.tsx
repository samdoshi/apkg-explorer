import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { toPackageError } from './errors'
import { PackageClient } from './package-client'
import { PackageContext, type PackageState } from './package-context'

/** Holds the one open package. Nothing here is saved: a reload starts empty. */
export function PackageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PackageState>({ status: 'empty' })
  const clientRef = useRef<PackageClient | null>(null)
  const latestRequest = useRef(0)

  const open = useCallback(async (file: File) => {
    const request = ++latestRequest.current
    // Free the previous package's worker (and its database) before reading the next one.
    clientRef.current?.dispose()
    clientRef.current = null
    setState({ status: 'opening', fileName: file.name })
    try {
      const { client, summary } = await PackageClient.open(file)
      if (request !== latestRequest.current) {
        client.dispose()
        return false
      }
      clientRef.current = client
      setState({ status: 'ready', summary, client })
      return true
    } catch (error) {
      if (request === latestRequest.current) {
        setState({ status: 'failed', fileName: file.name, error: toPackageError(error).toInfo() })
      }
      return false
    }
  }, [])

  const value = useMemo(() => ({ state, open }), [state, open])
  return <PackageContext value={value}>{children}</PackageContext>
}
