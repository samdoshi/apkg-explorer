import { useEffect, useState } from 'react'
import { toPackageError } from './errors'

export type PackageData<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  /** `message` is user-facing (see errors.ts). */
  | { status: 'failed'; message: string }

/**
 * Something read from the open package, such as `() => client.getNotes(id)`. Wrap `load` in
 * useCallback: a new function starts again from loading, and a result that arrives after
 * it's been replaced is ignored.
 */
export function usePackageData<T>(load: () => Promise<T>): PackageData<T> {
  const [loaded, setLoaded] = useState<{ load: () => Promise<T>; result: PackageData<T> } | null>(null)

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setLoaded({ load, result: { status: 'ready', data } })
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ load, result: { status: 'failed', message: toPackageError(error).message } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [load])

  return loaded?.load === load ? loaded.result : { status: 'loading' }
}
