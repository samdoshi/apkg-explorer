export type PackageErrorCode =
  | 'not-zip'
  | 'no-collection'
  | 'newer-version'
  | 'corrupt'
  | 'unreadable'
  | 'internal'

export interface PackageErrorInfo {
  code: PackageErrorCode
  message: string
}

const messages: Record<PackageErrorCode, string> = {
  'not-zip': "This isn't an Anki package. Choose an .apkg or .colpkg file exported from Anki.",
  'no-collection': 'This zip file has no Anki collection inside, so there is nothing to show.',
  'newer-version':
    'This file was made by a newer version of Anki than this app understands.',
  corrupt: 'The collection inside this file is damaged and could not be read.',
  unreadable:
    "The file couldn't be read. If it changed on disk after you chose it, open it again.",
  internal: 'Something went wrong while reading this file.',
}

export class PackageError extends Error {
  readonly code: PackageErrorCode

  /** `message` overrides the standard text, e.g. when rebuilding an error sent from the worker. */
  constructor(code: PackageErrorCode, detail?: string, message?: string) {
    super(message ?? (detail ? `${messages[code]} (${detail})` : messages[code]))
    this.name = 'PackageError'
    this.code = code
  }

  toInfo(): PackageErrorInfo {
    return { code: this.code, message: this.message }
  }
}

/** Converts anything thrown while reading a package into a user-facing error. */
export function toPackageError(error: unknown): PackageError {
  if (error instanceof PackageError) return error
  if (error instanceof DOMException && error.name === 'NotReadableError') {
    return new PackageError('unreadable')
  }
  const detail = error instanceof Error ? error.message : String(error)
  return new PackageError('internal', detail)
}
