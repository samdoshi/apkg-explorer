import type { NoteTypeInfo } from './collection'
import type { PackageErrorInfo } from './errors'
import type { NoteDetail } from './note-detail'
import type { NoteRow } from './note-row'
import type { PackageSummary } from './package'

/** What the package worker can do. Each method runs in the worker. */
export interface PackageApi {
  open(file: File): Promise<PackageSummary>
  getNotes(noteTypeId: number): Promise<NoteRow[]>
  getNote(noteId: number): Promise<NoteDetail | null>
  getNoteType(noteTypeId: number): Promise<NoteTypeInfo | null>
  readMedia(name: string): Promise<Blob | null>
}

export type WorkerRequest = {
  [M in keyof PackageApi]: { id: number; method: M; args: Parameters<PackageApi[M]> }
}[keyof PackageApi]

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: PackageErrorInfo }
