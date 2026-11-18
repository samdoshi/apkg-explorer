import { expect, expectOnlyApprovedStorage, screenPath, test } from './fixtures.ts'

test('start screen loads and saves nothing', async ({ page }) => {
  await page.goto('./')

  await expect(page.getByRole('heading', { level: 1, name: 'Look inside an Anki deck' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'APKG Explorer' })).toBeVisible()
  await page.screenshot({ path: screenPath('start') })
  await page.getByRole('main').screenshot({ path: screenPath('start-main') })

  // Unknown routes fall back to the start screen.
  await page.goto('./#/no-such-page')
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await expectOnlyApprovedStorage(page)
})
