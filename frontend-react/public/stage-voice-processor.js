// Send 100 ms of mono speech per packet, independent of the microphone's native sample rate.
class StageVoiceProcessor extends AudioWorkletProcessor {
  phase = 0
  sum = 0
  count = 0
  index = 0
  pcm = new DataView(new ArrayBuffer(3200))

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    for (const sample of channel) {
      this.sum += sample
      this.count++
      this.phase += 16000
      if (this.phase < sampleRate) continue
      const value = Math.max(-1, Math.min(1, this.sum / this.count))
      this.sum = this.count = 0
      do {
        this.phase -= sampleRate
        this.pcm.setInt16(this.index * 2, Math.round(value * 32767), true)
        if (++this.index === 1600) {
          this.port.postMessage(this.pcm.buffer, [this.pcm.buffer])
          this.pcm = new DataView(new ArrayBuffer(3200))
          this.index = 0
        }
      } while (this.phase >= sampleRate)
    }
    return true
  }
}
registerProcessor('picnic-stage-voice', StageVoiceProcessor)
