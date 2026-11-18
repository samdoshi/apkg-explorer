import { Decompress } from 'fzstd'
import { PackageError } from './errors'

function isArrayBufferBacked(bytes: Uint8Array): bytes is Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
}

export function hasZstdMagic(bytes: Uint8Array): boolean {
  return bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd
}

/** Streams a zstd-compressed blob through the decoder, returning the output chunks. */
async function decompressChunks(blob: Blob): Promise<Uint8Array<ArrayBuffer>[]> {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  const decoder = new Decompress((chunk) => {
    // fzstd hands out fresh ArrayBuffer-backed arrays; copy only if that ever changes.
    if (chunk.length) chunks.push(isArrayBufferBacked(chunk) ? chunk : new Uint8Array(chunk))
  })
  const reader = blob.stream().getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      decoder.push(value)
    }
    decoder.push(new Uint8Array(0), true)
  } catch (error) {
    if (error instanceof DOMException) throw error
    throw new PackageError('corrupt', 'invalid zstd data')
  }
  return chunks
}

export async function zstdToBytes(blob: Blob): Promise<Uint8Array> {
  const chunks = await decompressChunks(blob)
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export async function zstdToBlob(blob: Blob, type: string): Promise<Blob> {
  const chunks = await decompressChunks(blob)
  return new Blob(chunks, { type })
}
