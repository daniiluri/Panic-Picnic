type Listener = (image: Blob) => void

export function createCameraInbox() {
  const listeners = new Map<string, Listener>()
  const decoder = new TextDecoder()
  return {
    receive(packet: ArrayBuffer) {
      const bytes = new Uint8Array(packet)
      const ownerEnd = bytes.indexOf(10)
      const roundEnd = bytes.indexOf(10, ownerEnd + 1)
      if (ownerEnd < 1 || roundEnd <= ownerEnd + 1) return
      const key = decoder.decode(bytes.subarray(0, roundEnd))
      listeners.get(key)?.(new Blob([bytes.subarray(roundEnd + 1)], { type: 'image/jpeg' }))
    },
    subscribe(owner: string, round: string, show: Listener) {
      const key = owner + '\n' + round
      listeners.set(key, show)
      return () => {
        listeners.delete(key)
      }
    },
  }
}

export interface CameraFeed {
  publish: (round: string, image: Blob) => void
  subscribe: (owner: string, round: string, show: Listener) => () => void
}
