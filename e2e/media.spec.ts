import { expect, expectOnlyApprovedStorage, saveScreen, test } from './fixtures.ts'

const mediaDuration = (element: HTMLElement | SVGElement) =>
  element instanceof HTMLMediaElement ? element.duration : 0

test('the media list filters, sorts and previews files, which download and close with Back', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try a sample deck' }).click()
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Media' }).click()

  await expect(page).toHaveURL(/#\/media$/)
  const status = page.getByRole('status')
  await expect(status).toHaveText(/^16 files · \d+ KB$/)
  const kinds = page.getByRole('radiogroup', { name: 'Kind' })
  await expect(kinds.getByRole('radio')).toHaveText(['All 16', 'Images 9', 'Audio 6', 'Other 1'])
  const table = page.getByRole('table', { name: 'Media files' })
  const rows = table.getByRole('row')
  await expect(rows.nth(1)).toContainText('_globe.svg')
  await saveScreen(page, 'media-list')

  // Images only, smallest first.
  await kinds.getByRole('radio', { name: /^Images/ }).click()
  await expect(status).toHaveText(/^Showing 9 files of 16 · /)
  await table.getByRole('button', { name: 'Size' }).click()
  await expect(rows.nth(1)).toContainText('flag-germany.png')

  await rows.nth(1).click()
  await expect(page).toHaveURL(/#\/media\/flag-germany\.png$/)
  let dialog = page.getByRole('dialog', { name: 'flag-germany.png' })
  await expect(dialog.getByText('Image · PNG · 215 B · File 1 of 9')).toBeVisible()
  await expect(dialog.getByRole('img', { name: 'flag-germany.png' })).not.toHaveJSProperty('naturalWidth', 0)
  await expect(dialog.getByText('150 × 100 pixels')).toBeVisible()
  await saveScreen(dialog, 'media-preview')

  const download = page.waitForEvent('download')
  await dialog.getByRole('link', { name: 'Download' }).click()
  expect((await download).suggestedFilename()).toBe('flag-germany.png')

  // ] and [ step through the list's order; Escape closes and puts focus back on the row.
  // (Focus was on Download, which goes with the old file; the keys still work.)
  await page.keyboard.press(']')
  await expect(page.getByRole('dialog', { name: 'flag-netherlands.png' })).toBeVisible()
  await page.keyboard.press(']')
  dialog = page.getByRole('dialog', { name: '_waves.svg' })
  await expect(dialog.getByRole('img', { name: '_waves.svg' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(table.getByRole('row', { name: /^_waves\.svg/ })).toBeFocused()

  // Audio plays in the preview; Back closes it.
  await kinds.getByRole('radio', { name: /^All/ }).click()
  const search = page.getByRole('searchbox', { name: 'Search media' })
  await search.fill('chime GER')
  await expect(rows).toHaveCount(2)
  await rows.nth(1).click()
  dialog = page.getByRole('dialog', { name: 'chime-germany.wav' })
  await expect.poll(() => dialog.getByLabel('Audio player for chime-germany.wav').evaluate(mediaDuration)).toBeGreaterThan(0)
  await page.goBack()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/#\/media$/)

  // Text files (here, a card's script) show their contents.
  await search.fill('shuffle')
  await rows.nth(1).click()
  dialog = page.getByRole('dialog', { name: '_shuffle.js' })
  await expect(dialog.getByLabel('Contents of _shuffle.js')).toContainText('Options shuffled by a script.')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)

  await search.fill('no such file')
  await expect(page.getByText('No files match the search and filter.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search and filter' }).click()
  await expect(status).toHaveText(/^16 files/)
  await expectOnlyApprovedStorage(page)
})
