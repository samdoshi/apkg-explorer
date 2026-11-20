/**
 * A minimal protobuf (proto3) reader for the few Anki messages we need:
 * notetype/field/template configs (schema 18), PackageMetadata and MediaEntries.
 * Varints are decoded as JS numbers, which is exact up to 2^53.
 */

type FieldValue = { wireType: 0; value: number } | { wireType: 2; value: Uint8Array }

const textDecoder = new TextDecoder()

export class ProtoMessage {
  private readonly fields = new Map<number, FieldValue[]>()

  static decode(bytes: Uint8Array): ProtoMessage {
    const message = new ProtoMessage()
    let pos = 0

    const readVarint = (): number => {
      let result = 0
      let multiplier = 1
      for (;;) {
        if (pos >= bytes.length) throw new Error('Truncated protobuf varint')
        const byte = bytes[pos++] ?? 0
        result += (byte & 0x7f) * multiplier
        if (byte < 0x80) return result
        multiplier *= 128
      }
    }

    while (pos < bytes.length) {
      const key = readVarint()
      const fieldNumber = Math.floor(key / 8)
      const wireType = key % 8
      switch (wireType) {
        case 0:
          message.add(fieldNumber, { wireType: 0, value: readVarint() })
          break
        case 1:
          pos += 8
          break
        case 2: {
          const length = readVarint()
          if (pos + length > bytes.length) throw new Error('Truncated protobuf field')
          message.add(fieldNumber, { wireType: 2, value: bytes.subarray(pos, pos + length) })
          pos += length
          break
        }
        case 5:
          pos += 4
          break
        default:
          throw new Error(`Unsupported protobuf wire type ${wireType}`)
      }
    }
    if (pos > bytes.length) throw new Error('Truncated protobuf field')
    return message
  }

  private add(fieldNumber: number, value: FieldValue) {
    const list = this.fields.get(fieldNumber)
    if (list) list.push(value)
    else this.fields.set(fieldNumber, [value])
  }

  private last(fieldNumber: number): FieldValue | undefined {
    return this.fields.get(fieldNumber)?.at(-1)
  }

  /** Whether the field is present, e.g. which member of a oneof is set. */
  has(fieldNumber: number): boolean {
    return this.fields.has(fieldNumber)
  }

  /** A varint field (uint32, uint64, enum, bool). Missing means 0, as in proto3. */
  uint(fieldNumber: number): number {
    const field = this.last(fieldNumber)
    return field?.wireType === 0 ? field.value : 0
  }

  /** An optional varint field: undefined when absent. */
  optionalUint(fieldNumber: number): number | undefined {
    const field = this.last(fieldNumber)
    return field?.wireType === 0 ? field.value : undefined
  }

  string(fieldNumber: number): string {
    const field = this.last(fieldNumber)
    return field?.wireType === 2 ? textDecoder.decode(field.value) : ''
  }

  bytes(fieldNumber: number): Uint8Array {
    const field = this.last(fieldNumber)
    return field?.wireType === 2 ? field.value : new Uint8Array(0)
  }

  /** Every occurrence of a repeated embedded-message field. */
  messages(fieldNumber: number): ProtoMessage[] {
    return (this.fields.get(fieldNumber) ?? [])
      .filter((field) => field.wireType === 2)
      .map((field) => ProtoMessage.decode(field.value))
  }
}
