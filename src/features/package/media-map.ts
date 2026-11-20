import { ProtoMessage } from './protobuf'

export interface MediaFile {
  /** The name cards use to refer to the file, e.g. "flag-france.png". */
  name: string
  /** The zip entry holding the file, e.g. "0". */
  zipName: string
  /** Uncompressed size in bytes, when known. */
  size: number | null
}

/** Legacy packages: JSON object of zip entry name -> media file name. */
export function parseLegacyMediaMap(text: string): MediaFile[] {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) return []
  return Object.entries(parsed).flatMap(([zipName, name]) =>
    typeof name === 'string' ? [{ name, zipName, size: null }] : [],
  )
}

/**
 * Current packages: MediaEntries protobuf. Entry n is stored in zip entry "n"
 * unless it carries legacy_zip_filename (field 255).
 */
export function parseMediaEntries(bytes: Uint8Array): MediaFile[] {
  return ProtoMessage.decode(bytes)
    .messages(1)
    .map((entry, index) => ({
      name: entry.string(1),
      zipName: String(entry.optionalUint(255) ?? index),
      size: entry.uint(2),
    }))
}
