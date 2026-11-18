import { createContext, useContext } from 'react'
import type { PackageErrorInfo } from './errors'
import type { PackageSummary } from './package'
import type { PackageClient } from './package-client'

export type PackageState =
  | { status: 'empty' }
  | { status: 'opening'; fileName: string }
  | { status: 'ready'; summary: PackageSummary; client: PackageClient }
  | { status: 'failed'; fileName: string; error: PackageErrorInfo }

export interface PackageContextValue {
  state: PackageState
  /** Opens a file, replacing any open package. Resolves true if it opened. */
  open: (file: File) => Promise<boolean>
}

export const PackageContext = createContext<PackageContextValue | null>(null)

export function usePackage(): PackageContextValue {
  const value = useContext(PackageContext)
  if (!value) throw new Error('usePackage must be used inside <PackageProvider>')
  return value
}
