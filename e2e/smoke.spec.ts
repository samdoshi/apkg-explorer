import { expect, expectOnlyApprovedStorage, saveScreen, test } from './fixtures.ts'

test('start screen loads and saves nothing', async ({ page }) => {
  await page.goto('./')

  await expect(page.getByRole('heading', { level: 1, name: 'Look inside an Anki deck' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'APKG Explorer' })).toBeVisible()
  await saveScreen(page, 'start')
  await saveScreen(page.getByRole('main'), 'start-main')

  // Unknown routes fall back to the start screen.
  await page.goto('./#/no-such-page')
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await expectOnlyApprovedStorage(page)
})
