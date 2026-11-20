import type { NoteTypeInfo } from './collection'
import { PackageError } from './errors'
import { MediaCache } from './media-cache'
import type { MediaListItem, MediaUse } from './media-usage'
import type { NoteDetail } from './note-detail'
import type { NoteRow } from './note-row'
import type { PackageSummary } from './package'
import type { PackageApi, WorkerResponse } from './worker-protocol'

type Result<M extends keyof PackageApi> = Awaited<ReturnType<PackageApi[M]>>

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: PackageError) => void
}

/**
 * Main-thread handle on one open package. Each package gets its own worker, so
 * disposing the client frees the database and everything else it held.
 */
let nextClientId = 1

export class PackageClient {
  /** Distinguishes one opened file from the next, e.g. for React keys. */
  readonly id = nextClientId++
  /** Media read from this package, as blobs and object URLs (revoked on dispose). */
  readonly media = new MediaCache((name) => this.readMedia(name))
  private readonly worker: Worker
  private readonly noteTypes = new Map<number, Promise<NoteTypeInfo | null>>()
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private disposed = false

  private constructor() {
    this.worker = new Worker(new URL('./package.worker.ts', import.meta.url), {
      type: 'module',
      name: 'package-reader',
    })
    this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      if (response.ok) pending.resolve(response.result)
      else pending.reject(new PackageError(response.error.code, undefined, response.error.message))
    })
    this.worker.addEventListener('error', (event) => {
      this.failAll(new PackageError('internal', event.message || 'the reader stopped'))
    })
  }

  /** Starts a worker and opens the file in it. */
  static async open(file: File): Promise<{ client: PackageClient; summary: PackageSummary }> {
    const client = new PackageClient()
    try {
      const summary = await client.call('open', file)
      return { client, summary }
    } catch (error) {
      client.dispose()
      throw error
    }
  }

  getNotes(noteTypeId: number): Promise<NoteRow[]> {
    return this.call('getNotes', noteTypeId)
  }

  getNote(noteId: number): Promise<NoteDetail | null> {
    return this.call('getNote', noteId)
  }

  /** Note types don't change while a file is open, so each is fetched once. */
  getNoteType(noteTypeId: number): Promise<NoteTypeInfo | null> {
    let noteType = this.noteTypes.get(noteTypeId)
    if (!noteType) {
      noteType = this.call('getNoteType', noteTypeId)
      this.noteTypes.set(noteTypeId, noteType)
    }
    return noteType
  }

  /** The media files with how much each is used (worked out in the worker the first time). */
  getMediaList(): Promise<MediaListItem[]> {
    return this.call('getMediaList')
  }

  /** Where one file from getMediaList() is used. */
  getMediaUse(name: string): Promise<MediaUse> {
    return this.call('getMediaUse', name)
  }

  readMedia(name: string): Promise<Blob | null> {
    return this.call('readMedia', name)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.worker.terminate()
    this.media.dispose()
    this.failAll(new PackageError('internal', 'the file was closed'))
  }

  private call<M extends keyof PackageApi>(
    method: M,
    ...args: Parameters<PackageApi[M]>
  ): Promise<Result<M>> {
    if (this.disposed) return Promise.reject(new PackageError('internal', 'the file was closed'))
    const id = this.nextId++
    return new Promise<Result<M>>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => { resolve(value as Result<M>) }, reject })
      const request = { id, method, args }
      this.worker.postMessage(request)
    })
  }

  private failAll(error: PackageError) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}
