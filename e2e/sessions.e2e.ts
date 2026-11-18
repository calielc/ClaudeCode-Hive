import assert from 'node:assert/strict'
import { basename } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { eventually, launchHive, row, type Hive } from './app'

describe('the left panel', () => {
  let hive: Hive

  before(async () => {
    hive = await launchHive()
  })
  after(async () => {
    await hive.close()
  })

  test('starts in the home folder of the user and shows it by name', async () => {
    const state = await hive.state()
    assert.deepEqual(state.folders, [hive.fixture.home])
    const label = await hive.page.locator('.folder-row select option:checked').textContent()
    assert.equal(label, basename(hive.fixture.home))
    // With one folder in the list, there is no button to remove it.
    assert.equal(await hive.page.locator('.folder-row .icon-button').count(), 1)
  })

  test('puts the sessions of the last day in an open section and the older ones in a folded section', async () => {
    const { page } = hive
    await row(page, 'Fix login flow').waitFor()
    await row(page, 'Refactor search').waitFor()
    await row(page, 'Write release notes').waitFor()

    const recent = page.locator('h3.collapsible', { hasText: 'Last 24 hours' })
    assert.match((await recent.textContent()) ?? '', /3/)
    assert.equal(await recent.getAttribute('aria-expanded'), 'true')

    const older = page.locator('h3.collapsible', { hasText: 'Older than 1 day' })
    assert.match((await older.textContent()) ?? '', /1/)
    assert.equal(await older.getAttribute('aria-expanded'), 'false')
    assert.equal(await row(page, 'Old idea').count(), 0)

    await older.click()
    await row(page, 'Old idea').waitFor()
    await older.click()
    await eventually(async () => assert.equal(await row(page, 'Old idea').count(), 0))
  })

  test('counts the working, waiting and ready sessions', async () => {
    const counts = hive.page.locator('.counts')
    await eventually(async () => {
      const text = (await counts.textContent()) ?? ''
      assert.match(text, /1\s*Working/)
      assert.match(text, /1\s*Waiting/)
      assert.match(text, /1\s*Ready/)
    })
  })

  test('colors the state dot of each session', async () => {
    const { page } = hive
    await eventually(async () => {
      assert.equal(await row(page, 'Fix login flow').locator('.dot.working').count(), 1)
      assert.equal(await row(page, 'Refactor search').locator('.dot.waiting').count(), 1)
      assert.equal(await row(page, 'Write release notes').locator('.dot.ready').count(), 1)
    })
  })

  test('finds a session by its name', async () => {
    const { page } = hive
    const field = page.locator('.search input')
    await field.fill('release')
    await row(page, 'Write release notes').waitFor()
    await eventually(async () => assert.equal(await row(page, 'Fix login flow').count(), 0))
    assert.equal(await row(page, 'Refactor search').count(), 0)
    await field.fill('')
  })

  test('finds a session by the text of its conversation and marks the result', async () => {
    const { page } = hive
    const field = page.locator('.search input')
    await field.fill('zebra-quartz')
    const result = row(page, 'Refactor search')
    await result.waitFor()
    assert.match((await result.locator('.row-note').textContent()) ?? '', /found in the conversation/)
    assert.equal(await row(page, 'Fix login flow').count(), 0)
  })

  test('clears the search with Escape', async () => {
    const { page } = hive
    const field = page.locator('.search input')
    await field.fill('zebra-quartz')
    await field.press('Escape')
    assert.equal(await field.inputValue(), '')
    await row(page, 'Fix login flow').waitFor()
    await row(page, 'Write release notes').waitFor()
  })

  test('says that no session matches', async () => {
    const { page } = hive
    await page.locator('.search input').fill('no-such-text-anywhere')
    await page.getByText('No session found').waitFor()
    await page.locator('.search input').press('Escape')
  })

  test('offers to install the hooks when they are missing', async () => {
    const usage = hive.page.locator('.usage')
    await eventually(async () => assert.match((await usage.textContent()) ?? '', /Install hooks/))
    assert.match((await usage.textContent()) ?? '', /Usage limits/)
  })
})
