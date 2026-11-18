import type { PackageErrorInfo } from './errors'
import type { PackageSummary } from './package'

/** What the package worker can do. Each method runs in the worker. */
export interface PackageApi {
  open(file: File): Promise<PackageSummary>
  readMedia(name: string): Promise<Blob | null>
}

export type WorkerRequest = {
  [M in keyof PackageApi]: { id: number; method: M; args: Parameters<PackageApi[M]> }
}[keyof PackageApi]

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: PackageErrorInfo }
