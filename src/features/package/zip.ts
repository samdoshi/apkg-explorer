import {
  BlobReader,
  BlobWriter,
  configure,
  ZipReader,
  type FileEntry,
} from '@zip.js/zip.js/index-native.js'
import { PackageError } from './errors'

// We already run inside a worker, and the browser's DecompressionStream handles deflate.
configure({ useWebWorkers: false })

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const STORED = 0

/** Reads only the zip's central directory: entry names, sizes and offsets. */
export async function readZipEntries(file: Blob): Promise<Map<string, FileEntry>> {
  let entries
  try {
    entries = await new ZipReader(new BlobReader(file)).getEntries()
  } catch (error) {
    if (error instanceof DOMException) throw error
    throw new PackageError('not-zip')
  }
  const files = new Map<string, FileEntry>()
  for (const entry of entries) {
    if (!entry.directory) files.set(entry.filename, entry)
  }
  return files
}

/**
 * The entry's uncompressed content. Stored entries come back as a slice of the
 * original file, so nothing is copied into memory until the slice is read.
 */
export async function readZipEntry(file: Blob, entry: FileEntry, type = ''): Promise<Blob> {
  if (entry.compressionMethod === STORED && !entry.encrypted) {
    const header = new DataView(await file.slice(entry.offset, entry.offset + 30).arrayBuffer())
    if (header.byteLength < 30 || header.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) {
      throw new PackageError('corrupt', `bad zip entry ${entry.filename}`)
    }
    const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true)
    return file.slice(start, start + entry.compressedSize, type)
  }
  return entry.getData(new BlobWriter(type))
}
