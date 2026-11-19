import type { Page } from '@playwright/test'
import { expect, expectOnlyApprovedStorage, openWithPicker, saveScreen, test } from './fixtures.ts'

const dataRows = (page: Page) => page.getByRole('row').filter({ has: page.getByRole('cell') })

async function openCountries(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try a sample deck' }).click()
  await page.getByRole('combobox', { name: 'Note type' }).click()
  await page.getByRole('option', { name: /^Country/ }).click()
  await expect(page.getByRole('table', { name: 'Country notes' })).toBeVisible()
}

test('switch note type, sort columns and search', async ({ page }) => {
  await openCountries(page)
  await expect(page.getByRole('columnheader')).toHaveText([
    'Country', 'Capital', 'Flag', 'Anthem', 'Notes', 'Tags', 'Deck', 'Cards', 'Created', 'Modified',
  ])
  await expect(page.getByRole('status')).toHaveText('6 notes')
  // Media fields show their file names.
  await expect(dataRows(page).first()).toContainText('flag-france.png')
  await expect(dataRows(page).first()).toContainText('chime-france.wav')

  const capital = page.getByRole('columnheader', { name: 'Capital' })
  await capital.getByRole('button', { name: 'Capital', exact: true }).click()
  await expect(capital).toHaveAttribute('aria-sort', 'ascending')
  await expect(dataRows(page)).toHaveText([/Amsterdam/, /Berlin/, /Dublin/, /Paris/, /Rome/, /Tokyo/])
  await capital.getByRole('button', { name: 'Capital', exact: true }).click()
  await expect(capital).toHaveAttribute('aria-sort', 'descending')
  await expect(dataRows(page).first()).toContainText('Tokyo')
  await saveScreen(page, 'notes-table')

  const search = page.getByRole('searchbox', { name: 'Search notes' })
  await search.fill('TOKYO asia')
  await expect(page.getByRole('status')).toHaveText('Showing 1 note of 6')
  await expect(dataRows(page)).toHaveText([/Japan/])
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(search).toHaveValue('')
  await expect(dataRows(page)).toHaveCount(6)
})

test('column filters show as chips and rows work from the keyboard', async ({ page }) => {
  await openCountries(page)

  await page.getByRole('button', { name: 'Filter Tags' }).click()
  const tagsFilter = page.getByRole('dialog', { name: 'Filter Tags' })
  await tagsFilter.getByRole('checkbox', { name: 'asia' }).check()
  await expect(page.getByRole('status')).toHaveText('Showing 1 note of 6')
  await saveScreen(tagsFilter, 'filter-tags')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Filter Tags (active)' })).toBeVisible()

  await page.getByRole('button', { name: 'Filter Capital' }).click()
  await page.getByRole('dialog', { name: 'Filter Capital' }).getByRole('textbox', { name: 'Capital contains' }).fill('ber')
  await page.keyboard.press('Escape')
  const chips = page.getByRole('list', { name: 'Active filters' })
  await expect(chips.getByRole('button')).toHaveText(['Tags: asia', 'Capital contains “ber”'])
  await expect(page.getByText('No notes match the search and filters.')).toBeVisible()

  await chips.getByRole('button', { name: 'Remove filter: Tags: asia' }).click()
  await expect(dataRows(page)).toHaveText([/Berlin/])
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(dataRows(page)).toHaveCount(6)

  // Rows are focusable; arrow keys, Home and End move between them. (A click opens the note.)
  await dataRows(page).first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(dataRows(page).nth(1)).toBeFocused()
  await page.keyboard.press('End')
  await expect(dataRows(page).last()).toBeFocused()
  await expect(dataRows(page).last()).toContainText('Netherlands')

  await expectOnlyApprovedStorage(page)
})

test('large decks render only the visible rows', async ({ page }) => {
  await page.goto('./')
  await openWithPicker(page, 'large.apkg')
  await expect(page.getByRole('status')).toHaveText('5,000 notes')
  const table = page.getByRole('table', { name: 'Basic notes' })
  await expect(table).toHaveAttribute('aria-rowcount', '5001')
  await expect(dataRows(page).first()).toContainText('Word 0001')
  expect(await dataRows(page).count()).toBeLessThan(100)

  await dataRows(page).first().focus()
  await page.keyboard.press('End')
  const last = page.getByRole('row', { name: /Word 5000/ })
  await expect(last).toBeFocused()
  expect(await dataRows(page).count()).toBeLessThan(100)

  await page.getByRole('searchbox', { name: 'Search notes' }).fill('word 4321')
  await expect(page.getByRole('status')).toHaveText('Showing 1 note of 5,000')
})
