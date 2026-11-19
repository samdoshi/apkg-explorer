import { describe, expect, it } from 'vitest'
import { MediaCache } from './media-cache'

function setup(limit: number) {
  const loads: string[] = []
  const files: Record<string, number> = { a: 40, b: 40, c: 40, big: 500 }
  const cache = new MediaCache(async (name) => {
    loads.push(name)
    await Promise.resolve()
    const size = files[name]
    return size === undefined ? null : new Blob([new Uint8Array(size)])
  }, limit)
  return { cache, loads }
}

describe('MediaCache', () => {
  it('loads each file once and hands out object URLs that are revoked on release', async () => {
    const { cache, loads } = setup(1000)
    const first = await cache.acquire(['a', 'b', 'a', 'missing'])
    expect(first.blob('a')?.size).toBe(40)
    expect(first.blob('missing')).toBeNull()
    expect(first.url('missing')).toBeNull()
    const url = first.url('a')
    expect(url).toMatch(/^blob:/)
    expect(first.url('a')).toBe(url)

    const second = await cache.acquire(['a'])
    expect(loads).toEqual(['a', 'b', 'missing'])
    // Each handle has its own URLs, so releasing one doesn't break the other.
    expect(second.url('a')).not.toBe(url)
    first.release()
    expect(first.url('a')).toBeNull()
    expect(second.url('a')).toMatch(/^blob:/)
    second.release()
  })

  it('drops the least recently used files once released ones exceed the limit', async () => {
    const { cache, loads } = setup(100)
    for (const name of ['a', 'b', 'c']) (await cache.acquire([name])).release()
    // 120 bytes > 100: "a" (oldest) was dropped, "b" and "c" are kept.
    expect(cache.size).toBe(80)
    ;(await cache.acquire(['b'])).release()
    ;(await cache.acquire(['a'])).release()
    expect(loads).toEqual(['a', 'b', 'c', 'a'])
    // Now "c" is the oldest, so it goes next.
    ;(await cache.acquire(['c'])).release()
    expect(loads).toEqual(['a', 'b', 'c', 'a', 'c'])
  })

  it('never drops files that are in use, even past the limit', async () => {
    const { cache } = setup(100)
    const handle = await cache.acquire(['big', 'a'])
    expect(cache.size).toBe(540)
    expect(handle.blob('big')?.size).toBe(500)
    handle.release()
    expect(cache.size).toBeLessThanOrEqual(100)
  })

  it('retries a file whose read failed', async () => {
    let fail = true
    const cache = new MediaCache(async () => {
      await Promise.resolve()
      if (fail) throw new Error('worker stopped')
      return new Blob(['x'])
    })
    await expect(cache.acquire(['a'])).rejects.toThrow('worker stopped')
    fail = false
    const handle = await cache.acquire(['a'])
    expect(handle.blob('a')?.size).toBe(1)
  })
})
