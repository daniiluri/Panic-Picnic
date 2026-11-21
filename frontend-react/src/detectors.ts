export const MOTION_WIDTH = 96
export const MOTION_HEIGHT = 72
// Lower-frame-rate cameras can see a fast stroke jump straight to the opposite pose.
const reach = MOTION_HEIGHT / 2
const minTravel = MOTION_HEIGHT * 0.05
const handLagMs = 220
const planeSize = MOTION_WIDTH * MOTION_HEIGHT

// Keep the color boundaries between a hand and its background. The small blur
// suppresses sensor grain before looking for the weaker edges in dim light.
function smoothChannels(rgba: Uint8ClampedArray, planes: Uint8Array) {
  if (rgba.length !== planeSize * 4) throw new RangeError('Unexpected camera frame size.')
  const stride = 4 * MOTION_WIDTH
  for (let channel = 0; channel < 3; channel++) {
    for (let y = 1; y < MOTION_HEIGHT - 1; y++) {
      for (let x = 1; x < MOTION_WIDTH - 1; x++) {
        const pos = y * MOTION_WIDTH + x
        const i = pos * 4 + channel
        const top = rgba[i - stride - 4] + 2 * rgba[i - stride] + rgba[i - stride + 4]
        const mid = rgba[i - 4] + 2 * rgba[i] + rgba[i + 4]
        const bottom = rgba[i + stride - 4] + 2 * rgba[i + stride] + rgba[i + stride + 4]
        planes[channel * planeSize + pos] = (top + 2 * mid + bottom) >> 4
      }
    }
  }
}

// Match small textured patches between frames. Still scenery contributes no votes.
// Allow horizontal drift so a hand can travel in an arc.
function verticalTravel(before: Uint8Array, after: Uint8Array, xStart: number, xEnd: number) {
  const votes = new Float32Array(2 * reach + 1)
  let total = 0
  for (let y = 6; y < MOTION_HEIGHT - 5; y += 5) {
    for (let x = xStart; x < xEnd; x += 5) {
      let pos = 0
      let still = 0
      // Only search once, in the channel with the clearest moving edge.
      for (let channel = 0; channel < 3; channel++) {
        const center = channel * planeSize + y * MOTION_WIDTH + x
        let min = 255, max = 0, difference = 0
        for (let row = -2; row <= 2; row += 2) {
          for (let col = -2; col <= 2; col += 2) {
            const i = center + row * MOTION_WIDTH + col
            min = Math.min(min, before[i])
            max = Math.max(max, before[i])
            difference += Math.abs(before[i] - after[i])
          }
        }
        if (max - min >= 10 && difference > still) {
          still = difference
          pos = center
        }
      }
      if (still < 35) continue
      let best = still,
        shift = 0,
        up = still,
        down = still
      for (let dy = Math.max(-reach, 3 - y); dy <= Math.min(reach, MOTION_HEIGHT - 4 - y); dy++) {
        for (let dx = -3; dx <= 3; dx += 3) {
          const offset = dy * MOTION_WIDTH + dx
          // Prefer the closest match when a patch has a repeating texture.
          let error = Math.abs(dy) * 0.5 + Math.abs(dx)
          for (let row = -2; row <= 2; row += 2) {
            const i = pos + row * MOTION_WIDTH
            for (let col = -2; col <= 2; col += 2)
              error += Math.abs(before[i + col] - after[i + col + offset])
          }
          if (dy < 0) up = Math.min(up, error)
          if (dy > 0) down = Math.min(down, error)
          if (error < best) {
            best = error
            shift = dy
          }
        }
      }
      if (!shift || best > still * 0.65) continue
      const confidence = Math.min(still, shift < 0 ? down : up) - best
      if (confidence < 10) continue
      votes[shift + reach] += confidence
      total += confidence
    }
  }
  if (total < 45) return 0
  let weight = 0
  for (let i = 0; i < votes.length; i++) {
    weight += votes[i]
    if (weight >= total / 2) return i - reach
  }
  return 0
}

class Stroke {
  travel = 0
  lastMotion = -Infinity

  add(delta: number, now: number) {
    if (now - this.lastMotion > handLagMs || (delta && Math.sign(delta) !== Math.sign(this.travel)))
      this.travel = 0
    if (delta) {
      this.travel += delta
      this.lastMotion = now
    }
    return Math.abs(this.travel) >= minTravel ? Math.sign(this.travel) : 0
  }
}

export class HandSwaps {
  private before = new Uint8Array(planeSize * 3)
  private current = new Uint8Array(planeSize * 3)
  private lastFrame = -Infinity
  private direction = 0
  private left = new Stroke()
  private right = new Stroke()

  reset() {
    this.lastFrame = -Infinity
    this.direction = 0
    this.left = new Stroke()
    this.right = new Stroke()
  }

  read(rgba: Uint8ClampedArray, now: number) {
    const pixels = this.current
    smoothChannels(rgba, pixels)
    if (now - this.lastFrame > 280) this.reset()
    let hit = false
    if (Number.isFinite(this.lastFrame)) {
      const left = this.left.add(verticalTravel(this.before, pixels, 6, 45), now)
      const right = this.right.add(verticalTravel(this.before, pixels, 52, 90), now)
      if (left && left === -right && left !== this.direction) {
        hit = true
        this.direction = left
        this.left.travel = this.right.travel = 0
      }
    }
    this.current = this.before
    this.before = pixels
    this.lastFrame = now
    return {
      hit,
      level: Math.min(1, (Math.abs(this.left.travel) + Math.abs(this.right.travel)) / 10),
      hint: hit ? 'Switch counted!' : 'Palms up. Lift one hand as you lower the other.',
    }
  }
}

export class SoundGate {
  private peak = 0
  private valley = 0
  private waitingForRise = true
  private lastHit = -Infinity
  readonly threshold: number

  constructor(threshold: number) {
    this.threshold = threshold
  }

  read(level: number, now: number) {
    if (!this.waitingForRise) {
      this.peak = Math.max(this.peak, level)
      // The previous syllable can still be audible when the next one begins.
      if (level > this.peak * 0.78) return false
      this.valley = level
      this.waitingForRise = true
    }

    this.valley = Math.min(this.valley, level)
    const attack = Math.max(this.threshold * 0.25, this.valley * 0.30)
    if (level < this.threshold || level - this.valley < attack) return false

    this.peak = level
    this.waitingForRise = false
    if (now - this.lastHit < 85) return false
    this.lastHit = now
    return true
  }
}
