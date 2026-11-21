import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HandSwaps,
  MOTION_WIDTH as width,
  MOTION_HEIGHT as height,
  SoundGate,
} from '../src/detectors.ts'

// Side-on palms with curled fingers are narrow horizontal shapes in the camera image.
function frame(leftY, rightY, light = 0, shake = 0) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const by = y - shake
      let color = 92 + ((x * 23 + by * 17) % 13)
      const center = x < width / 2 ? width * 0.25 : width * 0.75
      const dy = by - (x < width / 2 ? leftY : rightY)
      if (Math.abs(x - center) < 11 && dy >= 0 && dy < 5) color = 162 + ((x + dy * 5) % 31)
      const index = (y * width + x) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = color + light
      pixels[index + 3] = 255
    }
  }
  return pixels
}

function count(makeFrame, length = 49, offset = 0) {
  const detector = new HandSwaps()
  let hits = 0
  for (let i = 0; i < length; i++)
    if (detector.read(makeFrame(i), (i * 1000) / 30 + offset).hit) hits++
  return hits
}

test('scores each fast palms-up switch with either hand leading, without a pose hold', () => {
  for (const lead of [-1, 1]) {
    const hits = count((i) => {
      const shift = Math.round(6 * lead * Math.cos((Math.PI * i) / 4))
      return frame(40 + shift, 34 - shift)
    })
    assert.equal(hits, 12)
  }
})

test('allows a stagger between hands and different resting heights', () => {
  assert.equal(
    count((i) =>
      frame(
        42 + Math.round(6 * Math.cos((i * Math.PI) / 6)),
        27 - Math.round(5 * Math.cos(((i - 1) * Math.PI) / 6)),
      ),
    ),
    8,
  )
})

// Both palms follow a shallow arc, as hands do when rotating around the elbows.
function cameraFrame(step, ink, background, texture, noise = 0, moving = true) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  const phase = moving ? step * Math.PI / 6 : 0
  let seed = step + 1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const left = x < width / 2
      const side = left ? 1 : -1
      const dx = x - (left ? 25 : width - 25) - side * Math.round(5 * Math.sin(phase))
      const dy = y - 35 - side * Math.round(6 * Math.cos(phase))
      const palm = (dx / 10) ** 2 + (dy / 4) ** 2 < 1
      const detail = palm ? (Math.abs(dx) + Math.abs(dy)) % 9 : (x * 13 + y * 37) % texture
      const index = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const grain = Math.round((2 * seed / 2 ** 32 - 1) * noise)
        pixels[index + channel] = (palm ? ink : background)[channel] + detail + grain
      }
      pixels[index + 3] = 255
    }
  }
  return pixels
}

test('counts eight hand switches when hand and shirt have the same luminance', () => {
  assert.equal(count(i => cameraFrame(i, [156, 96, 96], [84, 132, 96], 8)), 8)
})

test('counts eight low-contrast switches against both plain and textured backgrounds', () => {
  for (const [shade, texture] of [[118, 8], [141, 48]]) {
    assert.equal(count(i => cameraFrame(i, [shade, shade, shade], [103, 103, 103], texture)), 8)
  }
})

test('sensor noise on stationary palms does not score', () => {
  assert.equal(count(i => cameraFrame(i, [130, 130, 130], [100, 100, 100], 24, 10, false)), 0)
})

test('an interrupted feed establishes a fresh baseline before scoring again', () => {
  const d = new HandSwaps()
  assert.equal(d.read(frame(24, 43), 0).hit, false)
  assert.equal(d.read(frame(33, 34), 60).hit, true)
  assert.equal(d.read(frame(24, 43), 650).hit, false)
  d.reset()
  assert.equal(d.read(frame(33, 34), 680).hit, false)
  assert.equal(d.read(frame(24, 43), 720).hit, true)
})

test('quick switches still register at fifteen camera frames per second', () => {
  const d = new HandSwaps()
  let hits = 0
  for (let i = 0; i <= 30; i++) {
    const shift = Math.round(8 * Math.cos((Math.PI * i) / 3))
    if (d.read(frame(37 + shift, 36 - shift), (i * 1000) / 15).hit) hits++
  }
  assert.equal(hits, 10)
})

test('scores large reversals even when only the endpoints reach the camera', () => {
  const detector = new HandSwaps()
  for (let i = 0; i <= 20; i++) {
    const shift = i % 2 ? 16 : -16
    const result = detector.read(frame(34 + shift, 36 - shift), i * 50)
    assert.equal(result.hit, i > 0, `frame ${i}`)
  }
})

test('held poses, one hand, both moving together, jitter, changing light and camera bob score zero', () => {
  for (const scenario of [
    () => frame(29, 44),
    (d) => frame(35 + d, 37),
    (d) => frame(36 + d, 30 + d),
    (d, i) => frame(36 + (i % 2), 30 - (i % 2)),
    (d) => frame(25, 39, d * 3),
    (d) => frame(28, 40, 0, d),
  ]) {
    assert.equal(
      count((i) => scenario(Math.round(7 * Math.cos((i * Math.PI) / 5)), i)),
      0,
    )
  }
})

test('separate close-range sound bursts score; held and quiet signals do not repeat', () => {
  const g = new SoundGate(0.08)
  const samples = [
    [0, 0.01],
    [100, 0.01],
    [150, 0.12],
    [200, 0.15],
    [400, 0.14],
    [500, 0.01],
    [530, 0.11],
    [600, 0.01],
    [700, 0.015],
    [730, 0.14],
  ]
  assert.deepEqual(
    samples.filter(([ms, v]) => g.read(v, ms)).map(([ms]) => ms),
    [150, 530, 730],
  )
})

test('scores quick accents over an audible tail and ignores steady volume and its decay', () => {
  const gate = new SoundGate(0.08)
  const levels = [0.01, 0.18, 0.16, 0.11, 0.16, 0.18, 0.11, 0.17, 0.16, 0.15, 0.15, 0.13, 0.12, 0.11]
  assert.deepEqual(
    levels.flatMap((level, i) => gate.read(level, i * 35) ? [i] : []),
    [1, 4, 7],
  )
})

test('a ripple inside one burst cannot trigger a delayed second hop', () => {
  const gate = new SoundGate(0.08)
  assert.equal(gate.read(0.15, 0), true)
  assert.equal(gate.read(0.09, 20), false)
  assert.equal(gate.read(0.15, 40), false)
  assert.equal(gate.read(0.15, 150), false)
})
