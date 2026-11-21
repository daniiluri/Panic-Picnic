let context: AudioContext | undefined
export function unlockSound() {
  context ??= new AudioContext()
  if (context.state !== 'running') void context.resume()
  return context
}
export function chime(finish = false) {
  if (!context || context.state !== 'running') return
  const start = context.currentTime
  for (const [i, freq] of (finish ? [523, 659, 784] : [392, 523]).entries()) {
    const tone = context.createOscillator()
    const volume = context.createGain()
    const at = start + i * 0.075
    tone.type = 'triangle'
    tone.frequency.value = freq
    volume.gain.setValueAtTime(0.045, at)
    volume.gain.exponentialRampToValueAtTime(0.001, at + 0.1)
    tone.connect(volume).connect(context.destination)
    tone.start(at)
    tone.stop(at + 0.12)
  }
}
