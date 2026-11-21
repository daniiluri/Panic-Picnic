export const games = {
  frenzy: {
    name: '67 Frenzy',
    kind: 'Camera',
    time: '20 sec',
    art: '/art/frenzy.webp',
    short: 'Palms up. How fast can you switch hands?',
    rules:
      'Hold your palms up like two trays. Lift one hand as the other drops, then reverse. Each switch scores. When play starts, everyone in the room can see your camera. Sit out to watch.',
  },
  quiz: {
    name: 'Quiz',
    art: '/art/quiz.webp',
  },
  hop: {
    name: 'Mic Hop',
    kind: 'Microphone',
    time: '30 sec',
    art: '/art/hop.webp',
    short: 'Make some noise. Hop to the finish.',
    rules:
      'Say “ba-ba-ba” close to your microphone. Each new burst jumps one block, even while the last sound fades. First across twelve blocks wins. At the buzzer, distance decides the remaining places.',
  },
  comedy: {
    name: 'Picnic Open Mic',
    kind: 'Stand-up',
    time: '30 sec per turn',
    art: '/art/comedy.webp',
    short: 'Take the stage. Win the crowd with a joke.',
    rules:
      'Everyone gets 30 seconds on stage. Tell a joke out loud, open your mic to share it with the room, or post one line. The audience can like your set or throw a tomato. A majority of tomatoes starts a volley. The performer with the most likes wins.',
  },
} as const

export type Game = keyof typeof games
export const gameIds = Object.keys(games) as Game[]
export const playableGameIds = ['frenzy', 'hop'] as const satisfies readonly Game[]
export type PlayableGame = (typeof playableGameIds)[number]
export function isPlayableGame(id: Game): id is PlayableGame {
  return playableGameIds.some((playable) => playable === id)
}

export const avatars = [
  { name: 'Dill', color: '#ace957', symbol: '🥒' },
  { name: 'Jam', color: '#ff659b', symbol: '🍓' },
  { name: 'Toast', color: '#ffbf5f', symbol: '🍞' },
  { name: 'Grape', color: '#bb96ff', symbol: '🍇' },
  { name: 'Egg', color: '#fff3b9', symbol: '🥚' },
  { name: 'Pop', color: '#6be0ee', symbol: '🥤' },
]
export type Phase = 'lobby' | 'playlist' | 'setup' | 'play' | 'results' | 'podium'
export type Participation = 'playing' | 'sitting'
export type Reaction = 'like' | 'tomato'
export interface ComedySet {
  performer_id: string
  turn: number
  turns: number
  joke: string | null
  reactions: Record<string, Reaction>
  tomato_threshold: number
  barrage: boolean
}
export interface Player {
  id: string
  name: string
  avatar: number
  connected: boolean
  ready: boolean
  status: Participation | 'pending'
  playing: boolean
  points: number
  award: number
  value: number
  finish_ms: number | null
  sequence: number
}
export interface Room {
  type: 'state'
  code: string
  host: string
  phase: Phase
  game: PlayableGame
  game_index: number
  playlist: PlayableGame[]
  round_id: string
  remaining_ms: number | null
  comedy: ComedySet | null
  skipped: boolean
  players: Player[]
}
export type Command =
  | { type: 'ready'; value: boolean }
  | { type: 'start' | 'launch' | 'rematch' | 'leave' }
  | { type: 'playlist'; games: PlayableGame[] }
  | { type: 'avatar'; index: number }
  | { type: 'participation'; round_id: string; status: Participation }
  | { type: 'pulse'; round_id: string; sequence: number }
  | { type: 'react'; round_id: string; turn: number; reaction: Reaction }
  | { type: 'joke'; round_id: string; turn: number; text: string }
  | { type: 'end_set'; round_id: string; turn: number }
export type Send = (command: Command) => void
export interface Seat {
  code: string
  player_id: string
  token: string
}
