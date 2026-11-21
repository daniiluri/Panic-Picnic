import { expect, test } from '@playwright/test'

test('paused games stay unavailable in both languages and players can switch languages mid-match', async ({
  browser,
  baseURL,
}) => {
  const hostContext = await browser.newContext({
    baseURL,
    locale: 'en-US',
    ignoreHTTPSErrors: true,
  })
  const guestContext = await browser.newContext({
    baseURL,
    locale: 'en-US',
    ignoreHTTPSErrors: true,
    viewport: { width: 320, height: 720 },
  })
  try {
    const host = await hostContext.newPage()
    const guest = await guestContext.newPage()
    await Promise.all([host.goto('/'), guest.goto('/')])
    const language = guest.getByRole('combobox', { name: 'Language / Язык' })
    await language.selectOption('ru')
    await guest.reload()
    await expect(guest.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(guest.getByRole('button', { name: 'Войти по коду' })).toBeVisible()
    expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    )

    const catalogs = [
      { page: host, titles: ['Quiz', 'Picnic Open Mic'], status: 'Temporarily unavailable' },
      { page: guest, titles: ['Викторина', 'Открытый микрофон'], status: 'Временно недоступна' },
    ]
    for (const { page, titles, status } of catalogs) {
      for (const title of titles) {
        const button = page.getByRole('button', { name: title, exact: true })
        await expect(button).toBeDisabled()
        const card = page.getByRole('article').filter({ has: button })
        await expect(card.getByText(status, { exact: true })).toBeVisible()
      }
    }

    await host.getByRole('button', { name: 'Create a room', exact: true }).click()
    await host.getByLabel('Your nickname').fill('Camera')
    await host.getByRole('button', { name: 'Create room', exact: true }).click()
    const code = (await host.locator('.room-code').innerText()).replace(/\s/g, '')
    await guest.goto('/?room=' + code)
    await guest.getByLabel('Ваш ник').fill('Огурчик')
    await guest.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(guest.locator('.players')).toContainText('Camera')
    await guest.getByRole('button', { name: 'Я готов!' }).click()
    await host.getByRole('button', { name: 'Start match' }).click()
    for (const { page, titles, status } of catalogs) {
      for (const title of titles) {
        const button = page.getByRole('button', { name: title + ' ' + status, exact: true })
        await expect(button).toBeDisabled()
        await expect(page.locator('.lineup-row').filter({ has: button }).locator('.reorder')).toHaveCount(0)
      }
    }
    await host.getByRole('button', { name: 'Remove 67 Frenzy' }).click()
    await expect(guest.locator('.lineup-toggle[aria-pressed="true"] strong')).toHaveText(['Звукоскок'])
    await host.getByRole('button', { name: 'Launch lineup' }).click()

    await expect(host.getByRole('heading', { name: 'Mic Hop', level: 1 })).toBeVisible()
    await expect(guest.getByRole('heading', { name: 'Звукоскок', level: 1 })).toBeVisible()
    await expect(guest.locator('.warmup-rules')).toContainText('Говорите «ба-ба-ба»')
    await language.selectOption('en')
    await expect(guest.getByRole('heading', { name: 'Mic Hop', level: 1 })).toBeVisible()
    await expect(guest.locator('.warmup-rules')).toHaveText(await host.locator('.warmup-rules').innerText())
    await language.selectOption('ru')
    await expect(guest.getByRole('heading', { name: 'Звукоскок', level: 1 })).toBeVisible()
    await expect(guest.locator('.prep-list')).toContainText('Огурчик')
    await expect(host.locator('html')).toHaveAttribute('lang', 'en')
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()])
  }
})
