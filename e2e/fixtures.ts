import { test as base, expect, type Page } from '@playwright/test'
import { approvedStorage } from './approved-storage.ts'

/**
 * Every test fails on any console error, uncaught page error, or request to
 * another origin. Requests to other origins are also aborted so they never
 * reach the network.
 */
export const test = base.extend<{ guard: undefined }>({
  guard: [
    async ({ page, baseURL }, use) => {
      if (!baseURL) throw new Error('baseURL is not set')
      const appOrigin = new URL(baseURL).origin
      const problems: string[] = []
      const isExternal = (url: string | URL) => {
        const { protocol, origin } = new URL(url)
        return protocol !== 'data:' && protocol !== 'blob:' && origin !== appOrigin
      }

      await page.context().route(isExternal, (route) => route.abort('blockedbyclient'))
      page.context().on('request', (request) => {
        if (isExternal(request.url())) problems.push(`Request to another origin: ${request.url()}`)
      })
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`Console error: ${message.text()}`)
      })
      page.on('pageerror', (error) => problems.push(`Page error: ${error.message}`))

      await use(undefined)

      expect(problems, 'console errors or requests to other origins').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Fails if the browser holds any saved data that isn't on the approved list. */
export async function expectOnlyApprovedStorage(page: Page) {
  const cookies = (await page.context().cookies()).map((cookie) => cookie.name)
  const stored = await page.evaluate(async () => ({
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
    indexedDB: (await indexedDB.databases()).map((db) => db.name ?? '(unnamed)'),
    cacheStorage: await caches.keys(),
  }))
  const unapproved = (found: string[], approved: string[]) =>
    found.filter((name) => !approved.includes(name))

  expect({
    cookies: unapproved(cookies, approvedStorage.cookies),
    localStorage: unapproved(stored.localStorage, approvedStorage.localStorage),
    sessionStorage: unapproved(stored.sessionStorage, approvedStorage.sessionStorage),
    indexedDB: unapproved(stored.indexedDB, approvedStorage.indexedDB),
    cacheStorage: unapproved(stored.cacheStorage, approvedStorage.cacheStorage),
  }, 'unapproved browser storage').toEqual({
    cookies: [],
    localStorage: [],
    sessionStorage: [],
    indexedDB: [],
    cacheStorage: [],
  })
}

export const screenPath = (name: string) => `test-results/screens/${name}.png`
