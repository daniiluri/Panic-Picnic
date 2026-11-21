import { test, expect, type Page, type Browser } from '@playwright/test'

declare global {
  interface Window {
    picnicTracks: MediaStreamTrack[]
    picnicRequests: MediaStreamConstraints[]
  }
}

async function pair(browser: Browser, baseURL: string, denied = false) {
  const contexts = await Promise.all(
    [1280, 375].map((width) =>
      browser.newContext({
        baseURL,
        viewport: { width, height: 844 },
        ignoreHTTPSErrors: true,
        permissions: ['microphone', 'camera'],
      }),
    ),
  )
  for (const ctx of contexts)
    await ctx.addInitScript(
      ({ denied }) => {
        window.picnicTracks = []
        window.picnicRequests = []
        const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async (constraints = {}) => {
          window.picnicRequests.push(constraints)
          if (denied) throw new DOMException('Test permission denied', 'NotAllowedError')
          const stream = await get(constraints)
          window.picnicTracks.push(...stream.getTracks())
          return stream
        }
      },
      { denied },
    )
  const [host, guest] = await Promise.all(contexts.map((ctx) => ctx.newPage()))
  const errors: string[] = []
  for (const page of [host, guest]) {
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== new URL(baseURL).origin)
        errors.push('Unexpected external connection to ' + url.origin)
    })
  }
  await host.goto('/')
  await expect.poll(() => host.evaluate(() => window.picnicRequests.length)).toBe(1)
  await host.getByRole('button', { name: 'Create a room', exact: true }).click()
  await host.getByLabel('Your nickname').fill('Toast')
  await host.getByRole('button', { name: 'Create room', exact: true }).click()
  await expect(host.getByRole('button', { name: 'Start match' })).toBeDisabled()
  const code = (await host.locator('.room-code').innerText()).replace(/\s/g, '')
  await guest.goto('/?room=' + code)
  await guest.getByLabel('Your nickname').fill('Dill')
  await guest.getByRole('button', { name: 'Join room', exact: true }).click()
  await guest.getByRole('button', { name: 'Choose Pop' }).click()
  await expect(guest.getByRole('button', { name: 'Choose Pop' })).toHaveAttribute('aria-pressed', 'true')
  await expect(host.locator('.players li').filter({ hasText: 'Dill' }).getByLabel('Pop')).toBeVisible()
  await guest.getByRole('button', { name: 'I’m ready' }).click()
  await host.getByRole('button', { name: 'Start match' }).click()
  await expect(guest.getByRole('heading', { name: 'Pick the lineup' })).toBeVisible()
  return { host, guest, errors, contexts }
}

async function tracks(page: Page, active: 'audio' | 'video' | null) {
  await expect
    .poll(() =>
      page.evaluate(() => window.picnicTracks.map((t) => [t.kind, t.enabled, t.readyState]).sort()),
    )
    .toEqual([
      ['audio', active === 'audio', 'live'],
      ['video', active === 'video', 'live'],
    ])
}

async function oneRequest(page: Page) {
  expect(
    await page.evaluate(() => window.picnicRequests.map((c) => [!!c.audio, !!c.video])),
  ).toEqual([[true, true]])
}

async function leave(page: Page) {
  await page.getByRole('button', { name: 'Leave room', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Leave room', exact: true }).click()
}

test('one device request and automatic transitions through the whole lineup on desktop and mobile', async ({
  browser,
  baseURL,
}) => {
  const { host, guest, contexts, errors } = await pair(browser, baseURL!)
  try {
    await tracks(host, null)
    await host.getByRole('button', { name: 'Move Mic Hop earlier' }).click()
    await expect(guest.locator('.lineup-toggle[aria-pressed="true"] strong')).toHaveText([
      'Mic Hop',
      '67 Frenzy',
    ])
    await host.getByRole('button', { name: 'Launch lineup' }).click()
    await expect(guest.getByRole('heading', { name: 'Mic Hop', level: 1 })).toBeVisible()
    await expect(guest.getByRole('button', { name: 'Choose Pop' })).toHaveCount(0)
    await tracks(host, 'audio')
    await expect(host.locator('.stage-race canvas')).toBeVisible()
    await expect(host.locator('.up-next')).toContainText('67 Frenzy', { timeout: 36_000 })
    await expect(host.locator('.ranking-name > small').first()).toContainText(' s')
    await tracks(host, null)
    await expect(host.getByText('Palms up. Switch!', { exact: true })).toBeVisible()
    await tracks(host, 'video')
    await expect(host.locator('.device-status b')).toHaveText(/[1-9]\d* practice switches/, {
      timeout: 6500,
    })
    for (const [page, peer] of [[host, 'Dill'], [guest, 'Toast']] as const) {
      await expect(page.getByRole('region', { name: 'Room cameras' })).toBeVisible()
      await expect(page.locator('.camera-tile')).toHaveCount(2)
      const image = page.getByRole('img', { name: peer + '’s live camera' })
      await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      const firstFrame = await image.getAttribute('src')
      await expect(image).not.toHaveAttribute('src', firstFrame!)
    }
    await expect(host.locator('.own-camera .camera-score')).toHaveText(/[1-9]\d*/, { timeout: 18_000 })
    await expect(host.locator('.up-next')).toContainText('The picnic podium', { timeout: 25_000 })
    await expect(host.locator('.camera-wall')).toHaveCount(0)
    await expect(host.getByRole('alert')).toHaveCount(0)
    const switches = await host.locator('.ranking-name > small').allTextContents()
    for (const score of switches)
      expect(parseInt(score)).toBeGreaterThan(process.env.PICNIC_CAMERA_FIXTURE ? 0 : 90)
    await tracks(host, null)
    await expect(guest.getByRole('heading', { name: 'The picnic podium', level: 1 })).toBeVisible()
    await tracks(guest, null)
    await oneRequest(host)
    await oneRequest(guest)
    await expect(guest.getByRole('button', { name: 'Choose Pop' })).toHaveCount(0)
    await tracks(host, null)
    expect(errors).toEqual([])
    await expect(host.getByRole('alert')).toHaveCount(0)
    await host.getByRole('button', { name: 'Play again' }).click()
    await expect(guest.getByRole('button', { name: 'I’m ready' })).toBeVisible()
    await expect(guest.getByRole('button', { name: 'Choose Pop' })).toHaveAttribute('aria-pressed', 'true')
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    )
    await leave(host)
    await expect
      .poll(() => host.evaluate(() => window.picnicTracks.map((t) => t.readyState)))
      .toEqual(['ended', 'ended'])
    await oneRequest(host)
  } finally {
    await Promise.all(contexts.map((ctx) => ctx.close()))
  }
})

test('players who decline devices can watch and reach the podium after a skipped round', async ({
  browser,
  baseURL,
}) => {
  const { host, guest, contexts, errors } = await pair(browser, baseURL!, true)
  try {
    await host.getByRole('button', { name: 'Remove Mic Hop' }).click()
    await host.getByRole('button', { name: 'Launch lineup' }).click()
    await expect(guest.locator('.device-status')).toContainText('camera is unavailable')
    await expect(guest.locator('.round-participation')).toContainText('You’ll watch this round.')
    await expect(guest.locator('.prep-list small')).toHaveText(['Sitting out', 'Sitting out'])
    await expect(guest.getByRole('heading', { name: 'Round skipped' })).toBeVisible()
    await expect(guest.locator('.up-next')).toContainText('The picnic podium')
    await guest.reload()
    await expect(guest.getByRole('heading', { name: 'The picnic podium', level: 1 })).toBeVisible()
    await expect(guest.locator('.ranking li')).toHaveCount(2)
    await expect(guest.locator('.ranking .points')).toHaveText(['0 pts', '0 pts'])
    await oneRequest(host)
    expect(await guest.evaluate(() => window.picnicRequests.length)).toBe(0)
    expect(errors).toEqual([])
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})

test('a player with only a microphone can enable it on arrival', async ({ page }) => {
  await page.context().grantPermissions(['microphone'])
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices
    const list = devices.enumerateDevices.bind(devices)
    const get = devices.getUserMedia.bind(devices)
    window.picnicRequests = []
    devices.enumerateDevices = async () => (await list()).filter((d) => d.kind === 'audioinput')
    devices.getUserMedia = async (constraints = {}) => {
      window.picnicRequests.push(constraints)
      return get(constraints)
    }
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Microphone ready. 67 Frenzy needs a camera.')
  expect(
    await page.evaluate(() => window.picnicRequests.map((c) => [!!c.audio, !!c.video])),
  ).toEqual([[true, false]])
})

test('game rules and room entry keep keyboard focus on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  const rules = page.getByRole('button', { name: 'How to play Mic Hop' })
  await rules.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Mic Hop' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(rules).toBeFocused()

  const join = page.getByRole('button', { name: 'Join with code' })
  await join.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Your nickname')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(join).toBeFocused()
})
