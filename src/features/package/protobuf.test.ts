import { describe, expect, it } from 'vitest'
import { ProtoMessage } from './protobuf'

const bytes = (...values: number[]) => new Uint8Array(values)

describe('ProtoMessage', () => {
  it('reads varints, strings and repeated messages', () => {
    // field 1 varint 300, field 2 string "hi", field 3 two embedded messages {1: 7}, {1: 8}
    const message = ProtoMessage.decode(
      bytes(0x08, 0xac, 0x02, 0x12, 0x02, 0x68, 0x69, 0x1a, 0x02, 0x08, 0x07, 0x1a, 0x02, 0x08, 0x08),
    )
    expect(message.uint(1)).toBe(300)
    expect(message.string(2)).toBe('hi')
    expect(message.messages(3).map((m) => m.uint(1))).toEqual([7, 8])
  })

  it('treats missing fields as proto3 defaults', () => {
    const message = ProtoMessage.decode(bytes())
    expect(message.uint(1)).toBe(0)
    expect(message.optionalUint(1)).toBeUndefined()
    expect(message.string(2)).toBe('')
    expect(message.messages(3)).toEqual([])
  })

  it('reads large varints and field numbers above 15', () => {
    // field 255 (key = 255 << 3 = 0x7f8 -> 0xf8 0x0f), value 1_709_251_200_000
    const value = 1_709_251_200_000
    const varint: number[] = []
    for (let n = value; ; n = Math.floor(n / 128)) {
      if (n < 128) {
        varint.push(n)
        break
      }
      varint.push((n % 128) | 0x80)
    }
    const message = ProtoMessage.decode(bytes(0xf8, 0x0f, ...varint))
    expect(message.optionalUint(255)).toBe(value)
  })

  it('skips fixed-width fields it does not need', () => {
    // field 1 fixed64, field 2 fixed32, field 3 varint 5
    const message = ProtoMessage.decode(
      bytes(0x09, 1, 2, 3, 4, 5, 6, 7, 8, 0x15, 1, 2, 3, 4, 0x18, 0x05),
    )
    expect(message.uint(3)).toBe(5)
  })

  it('rejects truncated input', () => {
    expect(() => ProtoMessage.decode(bytes(0x12, 0x05, 0x68))).toThrow(/Truncated/)
  })
})
