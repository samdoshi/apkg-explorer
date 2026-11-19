import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base, expect, type Locator, type Page } from '@playwright/test'
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

/**
 * Saves a screenshot of a key screen (a Page) or element (a Locator) to
 * test-results/screens/<name>.png. Animations are stopped so unchanged screens
 * produce identical files, which keeps the "changed screenshots" report honest.
 */
export async function saveScreen(target: Page | Locator, name: string) {
  await target.screenshot({
    path: `test-results/screens/${name}.png`,
    animations: 'disabled',
    caret: 'hide',
  })
}

/**
 * saveScreen for a screen that settles by itself: Chrome's video player shows a loading
 * spinner for about a second after the video has loaded (and freezing animations would
 * keep it). Waits until two screenshots in a row are the same, then saves.
 */
export async function saveSettledScreen(target: Page | Locator, name: string) {
  const shot = () => target.screenshot({ caret: 'hide' })
  await expect.poll(async () => (await shot()).equals(await shot()), { timeout: 10_000 }).toBe(true)
  await saveScreen(target, name)
}

/** Absolute path of a generated test deck in fixtures/. */
export const fixturePath = (name: string) => join(import.meta.dirname, '..', 'fixtures', name)

/** Opens a fixture through the "Open file…" button and the browser's file chooser. */
export async function openWithPicker(page: Page, name: string) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open file…' }).click()
  await (await chooser).setFiles(fixturePath(name))
}

/** Drags a fixture file over `target` and drops it, as if from the desktop. */
export async function dropFile(page: Page, target: Locator, name: string) {
  const bytes = [...(await readFile(fixturePath(name)))]
  const dataTransfer = await page.evaluateHandle(
    ({ bytes, name }) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(bytes)], name))
      return transfer
    },
    { bytes, name },
  )
  await target.dispatchEvent('dragenter', { dataTransfer })
  await expect(page.getByText('Drop to open')).toBeVisible()
  await target.dispatchEvent('drop', { dataTransfer })
}
