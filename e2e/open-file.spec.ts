import {
  dropFile,
  expect,
  expectOnlyApprovedStorage,
  openWithPicker,
  saveScreen,
  test,
} from './fixtures.ts'

test('sample deck opens to its notes and overview, and a reload forgets it', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try a sample deck' }).click()

  // Lands on the note type with the most notes.
  await expect(page).toHaveURL(/#\/notes\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Basic notes' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Basic notes' })).toBeVisible()

  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Overview' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'sample.apkg' })).toBeVisible()
  await expect(page.getByText('Anki 2.1.50+ format')).toBeVisible()
  const totals = page.getByRole('list', { name: 'Totals' })
  await expect(totals).toContainText('23 notes')
  await expect(totals).toContainText('36 cards')
  await expect(totals).toContainText('19 media files')
  const noteTypes = page.getByRole('region', { name: 'Note types' })
  await expect(noteTypes.getByRole('heading', { level: 3 })).toHaveText([
    'Basic',
    'Basic (and reversed card)',
    'Basic (type in the answer)',
    'Cloze',
    'Country',
    'Quiz (shuffled options)',
  ])
  await expect(page.getByRole('region', { name: 'Decks' })).toContainText('Sample::Geography')
  await saveScreen(noteTypes, 'overview-note-types')

  // The start screen offers a way back while the file is open.
  await page.getByRole('link', { name: 'Open another file' }).click()
  await expect(page.getByText('Open now: sample.apkg')).toBeVisible()
  await page.getByRole('link', { name: 'View notes' }).click()
  await expect(page.getByRole('table', { name: 'Basic notes' })).toBeVisible()

  // Nothing is saved: a reload starts from scratch.
  await page.reload()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Look inside an Anki deck' })).toBeVisible()
  await expectOnlyApprovedStorage(page)
})

test('files open from the picker or by dropping, and bad files are explained', async ({ page }) => {
  await page.goto('./')

  await openWithPicker(page, 'legacy-anki2.apkg')
  await expect(page.getByRole('table', { name: 'Basic notes' })).toBeVisible()
  await expect(page.getByRole('banner')).toContainText('legacy-anki2.apkg')

  // Dropping a file anywhere replaces the open one.
  await dropFile(page, page.getByRole('main'), 'legacy-anki21.apkg')
  await expect(page.getByRole('table', { name: 'Basic (and reversed card) notes' })).toBeVisible()
  await expect(page.getByRole('banner')).toContainText('legacy-anki21.apkg')
  await expect(page.getByText('Drop to open')).toBeHidden()

  await page.getByRole('link', { name: 'Open another file' }).click()
  await openWithPicker(page, 'invalid/not-a-zip.apkg')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Couldn’t open not-a-zip.apkg')
  await expect(alert).toContainText("This isn't an Anki package")
  await expect(page).toHaveURL(/#\/$/)
  await saveScreen(alert, 'open-error')
})
