import type { Page } from '@playwright/test'
import { expect, expectOnlyApprovedStorage, saveScreen, test } from './fixtures.ts'

async function openSample(page: Page, noteType: RegExp) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try a sample deck' }).click()
  await page.getByRole('combobox', { name: 'Note type' }).click()
  await page.getByRole('option', { name: noteType }).click()
}

const mediaDuration = (element: HTMLElement | SVGElement) =>
  element instanceof HTMLMediaElement ? element.duration : 0

test('a note opens with its cards, steps through the table order and closes with Back', async ({ page }) => {
  await openSample(page, /^Country/)
  // Sorted by capital, the popup steps Amsterdam, Berlin, Dublin…
  await page.getByRole('button', { name: 'Capital', exact: true }).click()
  await page.getByRole('cell', { name: 'Germany', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Germany' })).toBeVisible()
  await expect(page).toHaveURL(/#\/notes\/\d+\/\d+$/)
  await expect(dialog.getByText('Country · Note 2 of 6')).toBeVisible()
  await expect(dialog.getByRole('tab')).toHaveText(['Capital', 'Flag', 'Note'])

  const front = page.getByTitle('Front of Capital').contentFrame()
  const back = page.getByTitle('Back of Capital').contentFrame()
  await expect(front.getByText('What is the capital of Germany?')).toBeVisible()
  await expect(back.getByText('Berlin')).toBeVisible()
  // Media comes from the package: the flag image and the anthem's player.
  await expect(back.getByRole('img')).not.toHaveJSProperty('naturalWidth', 0)
  await expect.poll(() => back.getByLabel('Audio: chime-germany.wav').evaluate(mediaDuration)).toBeGreaterThan(0)
  await expect(dialog.getByLabel('Card details')).toContainText('DeckSample::GeographyStateReview')
  await saveScreen(dialog, 'card-popup')

  await page.keyboard.press(']')
  await expect(dialog.getByRole('heading', { name: 'Ireland' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Previous note' }).click()
  await expect(dialog.getByRole('heading', { name: 'Germany' })).toBeVisible()
  await dialog.getByRole('tab', { name: 'Note' }).click()
  const fields = page.getByTitle('Note fields').contentFrame()
  await expect(fields.getByText('Bonn was the capital of West Germany until 1990.')).toBeVisible()

  // Back closes the popup and puts focus back on the note's row; Enter reopens it.
  await page.goBack()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/#\/notes\/\d+$/)
  const row = page.getByRole('row', { name: /^Germany/ })
  await expect(row).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('heading', { name: 'Germany' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expectOnlyApprovedStorage(page)
})

test('scripts and web content stay blocked, with a notice, until allowed', async ({ page }) => {
  await openSample(page, /^Quiz/)
  await page.getByRole('cell', { name: 'Which is the largest planet?' }).click()
  const dialog = page.getByRole('dialog')
  const quiz = page.getByTitle('Front of Card 1').contentFrame()
  await expect(dialog.getByText('This card has scripts (blocked).')).toBeVisible()
  await expect(quiz.getByText('Jupiter')).toBeVisible()
  await expect(quiz.getByText('Options shuffled by a script.')).toHaveCount(0)
  await saveScreen(dialog, 'card-scripts-blocked')

  // "View scripts" shows the inline code and the package script file's code, read on demand.
  await dialog.getByRole('button', { name: 'View scripts' }).click()
  const scripts = page.getByRole('dialog', { name: 'Scripts in this card' })
  await expect(scripts.getByRole('listitem')).toHaveText([
    /^Script file _shuffle\.jsFound in: Front.*function shuffle\(list\)/s,
    /^ScriptFound in: Front.*shuffle\(document\.getElementById\('options'\)\);$/s,
  ])
  await saveScreen(scripts, 'card-scripts-view')
  await scripts.getByRole('button', { name: 'Allow scripts' }).click()
  await expect(scripts).toHaveCount(0)
  await expect(dialog.getByText('This card has scripts (allowed for this file).')).toBeVisible()
  await expect(quiz.getByText('Options shuffled by a script.')).toBeVisible()
  await page.keyboard.press('Escape')

  // A web image is replaced by a placeholder; so is a file the package doesn't have.
  await page.getByRole('combobox', { name: 'Note type' }).click()
  await page.getByRole('option', { name: /^Basic 7 notes/ }).click()
  await page.getByRole('cell', { name: 'This card shows an image from the web.' }).click()
  const back = page.getByTitle('Back of Card 1').contentFrame()
  await expect(dialog.getByText('This card loads content from example.com (blocked).')).toBeVisible()
  await expect(back.getByText('Blocked image from example.com')).toBeVisible()
  await dialog.getByRole('button', { name: 'View remote URLs' }).click()
  const web = page.getByRole('dialog', { name: 'Web content in this card' })
  await expect(web.getByRole('heading', { name: 'example.com' })).toBeVisible()
  await expect(web.getByRole('listitem')).toHaveText(['ImageFound in: Back' + 'https://example.com/remote-diagram.png'])
  // Escape closes only the list; the note stays open, with focus back on the button.
  await page.keyboard.press('Escape')
  await expect(web).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'View remote URLs' })).toBeFocused()
  await page.keyboard.press(']')
  await expect(back.getByText('Missing image: missing-picture.png')).toBeVisible()
  await expectOnlyApprovedStorage(page)
})

test('maths is typeset by MathJax, which loads only when a card has maths', async ({ page }) => {
  const engine: string[] = []
  page.on('request', (request) => {
    if (/\/mathjax-engine-[^/]+\.js$/.test(request.url())) engine.push(request.url())
  })
  await openSample(page, /^Basic 7 notes/)
  await page.getByRole('cell', { name: 'What is the chemical symbol for gold?' }).click()
  await expect(page.getByTitle('Back of Card 1').contentFrame().getByText('Au (from Latin aurum)')).toBeVisible()
  expect(engine).toEqual([])
  await page.keyboard.press('Escape')

  await page.getByRole('cell', { name: 'State the quadratic formula.' }).click()
  const dialog = page.getByRole('dialog')
  const back = page.getByTitle('Back of Card 1').contentFrame()
  // Drawn as SVG, with MathML for screen readers; the TeX itself is gone.
  await expect(back.getByRole('math')).toHaveCount(1)
  await expect(back.getByText('\\frac')).toHaveCount(0)
  expect(engine).toHaveLength(1)
  await saveScreen(dialog, 'card-maths')
  await expectOnlyApprovedStorage(page)
})
