import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import { PackageError, toPackageError } from './errors'
import { AnkiPackage } from './package'
import type { PackageApi, WorkerRequest, WorkerResponse } from './worker-protocol'

// Runs in a dedicated worker: owns the open package and its SQLite database.

const sqlReady = initSqlJs({ locateFile: () => sqlWasmUrl })
let current: AnkiPackage | null = null

function requirePackage(): AnkiPackage {
  if (!current) throw new PackageError('internal', 'no package is open')
  return current
}

const api: PackageApi = {
  async open(file) {
    current?.close()
    current = null
    current = await AnkiPackage.open(file, file.name, await sqlReady)
    return current.summary()
  },
  async getNotes(noteTypeId) {
    return Promise.resolve(requirePackage().notes(noteTypeId))
  },
  async getNote(noteId) {
    return Promise.resolve(requirePackage().note(noteId))
  },
  async getNoteType(noteTypeId) {
    return Promise.resolve(requirePackage().noteType(noteTypeId))
  },
  async getMediaList() {
    return Promise.resolve(requirePackage().mediaList())
  },
  async readMedia(name) {
    return requirePackage().readMedia(name)
  },
}

function handle(request: WorkerRequest): Promise<unknown> {
  switch (request.method) {
    case 'open':
      return api.open(...request.args)
    case 'getNotes':
      return api.getNotes(...request.args)
    case 'getNote':
      return api.getNote(...request.args)
    case 'getNoteType':
      return api.getNoteType(...request.args)
    case 'getMediaList':
      return api.getMediaList(...request.args)
    case 'readMedia':
      return api.readMedia(...request.args)
  }
}

globalThis.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  handle(request).then(
    (result) => {
      globalThis.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse)
    },
    (error: unknown) => {
      const info = toPackageError(error).toInfo()
      globalThis.postMessage({ id: request.id, ok: false, error: info } satisfies WorkerResponse)
    },
  )
})
