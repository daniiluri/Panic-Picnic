import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

const external = process.env.PICNIC_TEST_URL
const baseURL = external || 'http://127.0.0.1:8071'
const args = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--use-file-for-fake-audio-capture=' + resolve('e2e/pulse.wav'),
  '--use-file-for-fake-video-capture=' +
    (process.env.PICNIC_CAMERA_FIXTURE || resolve('e2e/palms-up.y4m')),
]

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 180_000,
  workers: 1,
  expect: { timeout: 12_000 },
  use: { baseURL, ignoreHTTPSErrors: true, launchOptions: { args }, trace: 'retain-on-failure' },
  webServer: external
    ? undefined
    : {
        command:
          '../.venv/bin/python -m uvicorn backend.main:app --app-dir .. --host 127.0.0.1 --port 8071',
        url: baseURL,
        timeout: 15_000,
        reuseExistingServer: false,
      },
})
