import { expect, expectOnlyApprovedStorage, saveScreen, saveSettledScreen, test } from './fixtures.ts'

const mediaDuration = (element: HTMLElement | SVGElement) =>
  element instanceof HTMLMediaElement ? element.duration : 0

/** The statuses of the fonts the preview has added to the page. */
const previewFonts = (element: HTMLElement | SVGElement) =>
  [...element.ownerDocument.fonts].filter((face) => face.family.includes('apkg-font-preview')).map((face) => face.status)

test('the media list filters, sorts and previews files, which download and close with Back', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try a sample deck' }).click()
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Media' }).click()

  await expect(page).toHaveURL(/#\/media$/)
  const status = page.getByRole('status')
  await expect(status).toHaveText(/^19 files · \d+ KB$/)
  const kinds = page.getByRole('radiogroup', { name: 'Kind' })
  await expect(kinds.getByRole('radio')).toHaveText(['All 19', 'Images 9', 'Audio 6', 'Video 1', 'Fonts 1', 'Other 2'])
  const table = page.getByRole('table', { name: 'Media files' })
  const rows = table.getByRole('row')
  await expect(rows.nth(1)).toContainText('_country.css')
  await saveScreen(page, 'media-list')

  // Images only, smallest first.
  await kinds.getByRole('radio', { name: /^Images/ }).click()
  await expect(status).toHaveText(/^Showing 9 files of 19 · /)
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

  // Video and audio play in the preview; Back closes it.
  await kinds.getByRole('radio', { name: /^Video/ }).click()
  await rows.nth(1).click()
  dialog = page.getByRole('dialog', { name: 'mandelbrot.webm' })
  await expect(dialog.getByText('Video · WEBM · 75 KB · File 1 of 1')).toBeVisible()
  await expect.poll(() => dialog.getByLabel('Video player for mandelbrot.webm').evaluate(mediaDuration)).toBeCloseTo(4, 1)
  await saveSettledScreen(dialog, 'media-video')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
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

  // Fonts: details, sample text marking what the font lacks, your own text, private use glyphs.
  await search.fill('')
  await kinds.getByRole('radio', { name: /^Fonts/ }).click()
  await rows.nth(1).click()
  dialog = page.getByRole('dialog', { name: '_pixel.ttf' })
  await expect(dialog.getByText(/^Font · TTF · [\d.]+ KB · File 1 of 1$/)).toBeVisible()
  await expect(dialog.getByLabel('Font details')).toContainText(
    'FamilySample PixelStyleRegularVersionVersion 1.000FormatTrueTypeGlyphs53Characters78',
  )
  const samples = dialog.getByRole('list', { name: 'Sample text' }).getByRole('listitem')
  await expect(samples).toHaveCount(9)
  await expect(samples.first()).toHaveText('EnglishThe quick brown fox jumps over the lazy dog.')
  await expect(samples.nth(1)).toContainText('French · not in this font: ë œ é è')
  await expect(dialog.getByText(/^Not in this font: Greek, Russian, .*, Japanese, Korean\.$/)).toBeVisible()
  await dialog.getByLabel('Your text').fill('Anki 暗記')
  await expect(dialog.getByText('Your text · not in this font: 暗 記')).toBeVisible()
  await expect(dialog.getByRole('list', { name: 'Private use characters' }).getByRole('listitem')).toHaveText([
    /U\+E000 star$/,
    /U\+E001 heart$/,
    /U\+E002 music$/,
    /U\+E003 check$/,
    /U\+E004 globe$/,
    /U\+F0000 diamond$/,
  ])
  await expect.poll(() => dialog.getByLabel('Font details').evaluate(previewFonts)).toEqual(['loaded'])
  await saveScreen(dialog, 'media-font')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  // The font is only on the page while it's previewed.
  await expect.poll(() => table.evaluate(previewFonts)).toEqual([])

  await search.fill('no such file')
  await expect(page.getByText('No files match the search and filter.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search and filter' }).click()
  await expect(status).toHaveText(/^19 files/)
  await expectOnlyApprovedStorage(page)
})
