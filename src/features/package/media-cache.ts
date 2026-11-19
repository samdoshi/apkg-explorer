/** Media files one card (or preview) is using. */
export interface MediaHandle {
  /** The file's contents, or null if the package doesn't have it. */
  blob: (name: string) => Blob | null
  /** An object URL for the file, created on first use and revoked on release. */
  url: (name: string) => string | null
  /** Revokes this handle's object URLs and lets the cache drop the files when it needs room. */
  release: () => void
}

interface Entry {
  /** Settles to null if the package doesn't have the file. */
  promise: Promise<Blob | null>
  /** Undefined while loading. */
  blob: Blob | null | undefined
  /** Handles currently using the file; in-use files are never dropped. */
  users: number
}

export const MEDIA_CACHE_LIMIT = 64 * 1024 * 1024

/**
 * Media read from the package on demand. Files stay cached between cards, least
 * recently used dropped first, until the ones not in use add up to more than `limit`
 * bytes. Stored (uncompressed) files are slices of the original File, so they cost
 * little; decompressed ones are real memory, which is what the limit is for.
 */
export class MediaCache {
  private readonly load: (name: string) => Promise<Blob | null>
  private readonly limit: number
  /** Map order is recency: oldest first. */
  private readonly entries = new Map<string, Entry>()
  private disposed = false

  constructor(load: (name: string) => Promise<Blob | null>, limit = MEDIA_CACHE_LIMIT) {
    this.load = load
    this.limit = limit
  }

  /** Loads the named files and keeps them until the handle is released. */
  async acquire(names: Iterable<string>): Promise<MediaHandle> {
    const unique = [...new Set(names)]
    const entries = unique.map((name) => this.use(name))
    const urls = new Map<string, string>()
    let released = false
    const release = () => {
      if (released) return
      released = true
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
      for (const entry of entries) entry.users--
      this.trim()
    }

    let blobs: (Blob | null)[]
    try {
      blobs = await Promise.all(entries.map((entry) => entry.promise))
    } catch (error) {
      release()
      throw error
    }
    const byName = new Map(unique.map((name, index) => [name, blobs[index] ?? null]))
    return {
      blob: (name) => byName.get(name) ?? null,
      url: (name) => {
        const blob = byName.get(name)
        if (!blob || released) return null
        let url = urls.get(name)
        if (!url) {
          url = URL.createObjectURL(blob)
          urls.set(name, url)
        }
        return url
      },
      release,
    }
  }

  /** Total size of the cached files (in use or not). */
  get size(): number {
    let total = 0
    for (const entry of this.entries.values()) total += entry.blob?.size ?? 0
    return total
  }

  dispose() {
    this.disposed = true
    this.entries.clear()
  }

  private use(name: string): Entry {
    let entry = this.entries.get(name)
    if (entry) {
      this.entries.delete(name)
    } else {
      const created: Entry = { promise: Promise.resolve(null), blob: undefined, users: 0 }
      created.promise = this.load(name).then(
        (blob) => {
          created.blob = this.disposed ? null : blob
          return created.blob
        },
        (error: unknown) => {
          // Forget failures so the next card can try again.
          if (this.entries.get(name) === created) this.entries.delete(name)
          throw error
        },
      )
      entry = created
    }
    entry.users++
    if (!this.disposed) this.entries.set(name, entry)
    return entry
  }

  private trim() {
    let total = this.size
    for (const [name, entry] of this.entries) {
      if (total <= this.limit) break
      if (entry.users > 0 || entry.blob === undefined) continue
      this.entries.delete(name)
      total -= entry.blob?.size ?? 0
    }
  }
}
