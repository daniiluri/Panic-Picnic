import { expect, test, type Locator } from '@playwright/test'

async function textContrast(control: Locator) {
  return control.evaluate((element) => {
    const paint = document.createElement('canvas').getContext('2d')!
    function luminance(color: string) {
      paint.fillStyle = color
      paint.fillRect(0, 0, 1, 1)
      const [r, g, b] = Array.from(paint.getImageData(0, 0, 1, 1).data, (byte) => {
        const value = byte / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const style = getComputedStyle(element)
    const background = luminance(style.backgroundColor)
    const foreground = luminance(style.color)
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
  })
}

test('theme follows the device until a keyboard selection and keeps that choice across tabs and reloads', async ({
  context,
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Dark mode', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')

  const other = await context.newPage()
  await other.emulateMedia({ colorScheme: 'dark' })
  await other.goto('/')
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark')
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
})

test('Russian dark mode fits a narrow header and keeps the same player in the room', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Language / Язык' }).selectOption('ru')
  const toggle = page.getByRole('button', { name: 'Тёмная тема', exact: true })
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  const create = page.getByRole('button', { name: 'Создать комнату', exact: true })
  expect(await textContrast(create)).toBeGreaterThanOrEqual(4.5)
  await create.click()
  const dialog = page.getByRole('dialog', { name: 'Создать комнату' })
  const nickname = dialog.getByLabel('Ваш ник')
  await expect(nickname).toBeFocused()
  expect(await textContrast(dialog)).toBeGreaterThanOrEqual(4.5)
  expect(await textContrast(nickname)).toBeGreaterThanOrEqual(4.5)
  await nickname.fill('Луна')
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(page.locator('.players')).toContainText('Луна')
  const code = (await page.locator('.room-code').innerText()).replace(/\s/g, '')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.room-code')).toHaveText(code)
  await expect(page.locator('.players li')).toHaveCount(1)
  await expect(page.locator('.players')).toContainText('Луна')
})
