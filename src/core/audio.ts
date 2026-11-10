// 배경음악·효과음: 외부 음원 없이 Web Audio API 로 직접 합성하는 오리지널 칩튠
// AudioContext 가 없는 환경(테스트 등)에서는 모든 함수가 아무것도 하지 않음
import { reactive, watch } from 'vue'

// ---------- 볼륨 설정 (게임 저장 데이터와 별도로 보관) ----------
const SETTINGS_KEY = 'idle-game-audio'

export interface AudioSettings {
  /** 0~1 */
  music: number
  /** 0~1 */
  sfx: number
}

function loadSettings(): AudioSettings {
  const def = { music: 0.5, sfx: 0.6 }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null
    const v = raw ? (JSON.parse(raw) as Partial<AudioSettings>) : {}
    const clamp = (x: unknown, d: number) => (typeof x === 'number' && x >= 0 && x <= 1 ? x : d)
    return { music: clamp(v.music, def.music), sfx: clamp(v.sfx, def.sfx) }
  } catch {
    return def
  }
}

export const audioSettings = reactive<AudioSettings>(loadSettings())

watch(audioSettings, (s) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* 저장 실패는 무시 */
  }
  applyVolumes()
})

// ---------- 오디오 그래프 ----------
let ctx: AudioContext | null = null
let musicBus: GainNode | null = null
let sfxBus: GainNode | null = null
/** 징글이 나올 때 배경음악을 잠시 줄이는 노드 */
let duckGain: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
const pulseWaves = new Map<number, PeriodicWave>()

const MUSIC_MAX = 0.32
const SFX_MAX = 0.55

function getCtx(): AudioContext | null {
  if (ctx) return ctx
  const Ctor: typeof AudioContext | undefined =
    typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  const master = ctx.createDynamicsCompressor()
  master.threshold.value = -12
  master.ratio.value = 4
  master.connect(ctx.destination)
  duckGain = ctx.createGain()
  duckGain.connect(master)
  musicBus = ctx.createGain()
  musicBus.connect(duckGain)
  sfxBus = ctx.createGain()
  sfxBus.connect(master)
  // 1초 분량 화이트 노이즈 (타악기·타격음)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  applyVolumes()
  return ctx
}

function applyVolumes() {
  if (!ctx || !musicBus || !sfxBus) return
  // 사람 귀에 자연스럽도록 제곱 곡선
  musicBus.gain.setTargetAtTime(audioSettings.music ** 2 * MUSIC_MAX, ctx.currentTime, 0.05)
  sfxBus.gain.setTargetAtTime(audioSettings.sfx ** 2 * SFX_MAX, ctx.currentTime, 0.05)
  if (audioSettings.music > 0) startSequencer()
}

/** 듀티비가 다른 펄스파 (패미컴풍 사각파 음색) */
function pulse(duty: number): PeriodicWave {
  const c = ctx!
  let w = pulseWaves.get(duty)
  if (w) return w
  const n = 32
  const real = new Float32Array(n)
  const imag = new Float32Array(n)
  for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty)
  w = c.createPeriodicWave(real, imag)
  pulseWaves.set(duty, w)
  return w
}

type Wave = 'square' | 'pulse25' | 'pulse12' | 'triangle' | 'sine' | 'sawtooth'

function makeOsc(wave: Wave, freq: number, t: number): OscillatorNode {
  const c = ctx!
  const o = c.createOscillator()
  if (wave === 'pulse25') o.setPeriodicWave(pulse(0.25))
  else if (wave === 'pulse12') o.setPeriodicWave(pulse(0.125))
  else o.type = wave
  o.frequency.setValueAtTime(freq, t)
  return o
}

/** 음 하나: 짧은 어택 후 감쇠 */
function tone(
  out: AudioNode,
  wave: Wave,
  freq: number,
  t: number,
  dur: number,
  vol: number,
  opts: { slideTo?: number; release?: number; vibrato?: boolean } = {},
) {
  const c = ctx!
  const o = makeOsc(wave, freq, t)
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur)
  const g = c.createGain()
  const rel = opts.release ?? 0.04
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.005)
  g.gain.setValueAtTime(vol, t + Math.max(0.006, dur - rel))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  if (opts.vibrato && dur > 0.3) {
    const lfo = c.createOscillator()
    const lg = c.createGain()
    lfo.frequency.value = 5.5
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(freq * 0.012, t + dur)
    lfo.connect(lg).connect(o.frequency)
    lfo.start(t)
    lfo.stop(t + dur + 0.02)
  }
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

/** 노이즈 한 번 (filter = 하이패스 주파수) */
function noise(out: AudioNode, t: number, dur: number, vol: number, filter = 1000, type: BiquadFilterType = 'highpass') {
  const c = ctx!
  const s = c.createBufferSource()
  s.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = filter
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(out)
  s.start(t, Math.random() * 0.5)
  s.stop(t + dur + 0.02)
}

function kick(out: AudioNode, t: number, vol: number) {
  tone(out, 'sine', 150, t, 0.12, vol, { slideTo: 40, release: 0.1 })
}

// ---------- 음 이름 ----------
const NOTE_IDX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
/** "C#5", "Bb4" → 주파수 */
function freqOf(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  if (!m) throw new Error(`bad note ${name}`)
  const midi = 12 * (Number(m[3]) + 1) + NOTE_IDX[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  return 440 * 2 ** ((midi - 69) / 12)
}

// ---------- 배경음악 ----------
// 악보: 16분음표 한 칸마다 토큰 하나. 음 이름 = 새 음, '-' = 이어서, '.' = 쉼표
// 드럼: k = 킥, s = 스네어, h = 하이햇, o = 오픈 하이햇
interface Channel {
  wave: Wave
  vol: number
  notes: string
  /** 음 길이 비율 (1 = 끝까지, 0.5 = 스타카토) */
  gate?: number
  vibrato?: boolean
}
interface Track {
  bpm: number
  channels: Channel[]
  drums?: string
  drumVol?: number
}
interface NoteEvent {
  step: number
  len: number
  freq: number
}

function parseChannel(notes: string): { events: NoteEvent[]; steps: number } {
  const tokens = notes.trim().split(/\s+/)
  const events: NoteEvent[] = []
  tokens.forEach((tok, i) => {
    if (tok === '-') {
      const last = events[events.length - 1]
      if (last && last.step + last.len === i) last.len++
      return
    }
    if (tok === '.') return
    events.push({ step: i, len: 1, freq: freqOf(tok) })
  })
  return { events, steps: tokens.length }
}

/** 마디마다 근음을 8분음표로 옥타브 왕복 */
const bassBounce = (roots: string[], oct = 2) =>
  roots.map((r) => `${r}${oct} . ${r}${oct + 1} . `.repeat(4)).join(' ')
/** 마디마다 근음 16분음표 연타 (보스용) */
const bassDrive = (roots: string[], oct = 2) =>
  roots.map((r) => `${r}${oct} ${r}${oct} ${r}${oct + 1} ${r}${oct} `.repeat(4)).join(' ')
/** 화음 구성음을 16분음표로 순환하는 아르페지오 */
const arp = (chords: string[][]) => chords.map((ch) => Array.from({ length: 16 }, (_, i) => ch[i % ch.length]).join(' ')).join(' ')

const TRACKS: Record<string, Track> = {
  // 야생 전투 / 기본: 밝고 경쾌한 C장조
  field: {
    bpm: 132,
    channels: [
      {
        wave: 'pulse25',
        vol: 0.16,
        gate: 0.9,
        vibrato: true,
        notes: [
          'E5 - - G5 - - C6 - B5 - G5 - E5 - - -',
          'A5 - - G5 - - E5 - C5 - D5 - E5 - - -',
          'F5 - - A5 - - C6 - A5 - F5 - G5 - A5 -',
          'G5 - - - D5 - - - B4 - D5 - G5 - - -',
          'E5 - G5 - C6 - - - D6 - C6 - B5 - G5 -',
          'B5 - - - G5 - E5 - G5 - - - B5 - - -',
          'A5 - - C6 - - A5 - F5 - - A5 - G5 - F5',
          'G5 - - - - - - - D5 - F5 - B4 - D5 -',
        ].join(' '),
      },
      {
        wave: 'pulse12',
        vol: 0.05,
        gate: 0.6,
        notes: arp([
          ['C4', 'E4', 'G4', 'E4'],
          ['A3', 'C4', 'E4', 'C4'],
          ['F3', 'A3', 'C4', 'A3'],
          ['G3', 'B3', 'D4', 'B3'],
          ['C4', 'E4', 'G4', 'E4'],
          ['E3', 'G3', 'B3', 'G3'],
          ['F3', 'A3', 'C4', 'A3'],
          ['G3', 'B3', 'D4', 'F4'],
        ]),
      },
      { wave: 'triangle', vol: 0.3, gate: 0.8, notes: bassBounce(['C', 'A', 'F', 'G', 'C', 'E', 'F', 'G']) },
    ],
    drums: 'k . h . s . h . k . h k s . h . '.repeat(8),
    drumVol: 0.5,
  },
  // 보스전: 빠르고 긴박한 A단조
  boss: {
    bpm: 164,
    channels: [
      {
        wave: 'square',
        vol: 0.11,
        gate: 0.85,
        vibrato: true,
        notes: [
          'A5 - A5 - C6 - A5 - E6 - - - D6 - C6 -',
          'C6 - - - A5 - F5 - A5 - C6 - F6 - E6 -',
          'D6 - - - B5 - G5 - B5 - D6 - G6 - F6 -',
          'E6 - - - - - - - G#5 - B5 - E6 - D6 -',
          'C6 - B5 - A5 - - - E5 - A5 - C6 - E6 -',
          'F6 - E6 - D6 - C6 - A5 - - - C6 - - -',
          'D6 - - - F6 - - - A6 - G6 - F6 - E6 -',
          'E6 - - - B5 - - - G#5 - - - E5 - - -',
        ].join(' '),
      },
      {
        wave: 'pulse25',
        vol: 0.05,
        gate: 0.5,
        notes: arp([
          ['A4', 'C5', 'E5'],
          ['F4', 'A4', 'C5'],
          ['G4', 'B4', 'D5'],
          ['E4', 'G#4', 'B4'],
          ['A4', 'C5', 'E5'],
          ['F4', 'A4', 'C5'],
          ['D4', 'F4', 'A4'],
          ['E4', 'G#4', 'B4'],
        ]),
      },
      { wave: 'triangle', vol: 0.32, gate: 0.7, notes: bassDrive(['A', 'F', 'G', 'E', 'A', 'F', 'D', 'E']) },
    ],
    drums: 'k h h h s h k h k h k h s h h o '.repeat(8),
    drumVol: 0.55,
  },
  // 포켓몬센터 회복 중: 느긋한 F장조
  center: {
    bpm: 92,
    channels: [
      {
        wave: 'triangle',
        vol: 0.3,
        gate: 0.95,
        vibrato: true,
        notes: [
          'A5 - - - C6 - - - A5 - - - F5 - - -',
          'F5 - - - A5 - G5 - F5 - - - D5 - - -',
          'D5 - - - F5 - - - Bb5 - - - A5 - G5 -',
          'G5 - - - - - - - E5 - - - C5 - - -',
          'A5 - - - C6 - - - D6 - C6 - A5 - - -',
          'F5 - - - A5 - - - G5 - F5 - D5 - - -',
          'D5 - F5 - Bb5 - - - A5 - G5 - F5 - - -',
          'E5 - - - G5 - - - F5 - - - - - - -',
        ].join(' '),
      },
      {
        wave: 'pulse12',
        vol: 0.04,
        gate: 0.7,
        notes: arp([
          ['F4', 'A4', 'C5', 'A4'],
          ['D4', 'F4', 'A4', 'F4'],
          ['Bb3', 'D4', 'F4', 'D4'],
          ['C4', 'E4', 'G4', 'E4'],
          ['F4', 'A4', 'C5', 'A4'],
          ['D4', 'F4', 'A4', 'F4'],
          ['Bb3', 'D4', 'F4', 'D4'],
          ['C4', 'E4', 'G4', 'Bb4'],
        ]),
      },
      {
        wave: 'triangle',
        vol: 0.22,
        gate: 0.9,
        notes: ['F', 'D', 'Bb', 'C', 'F', 'D', 'Bb', 'C'].map((r) => `${r}2 - - - - - - - ${r}3 - - - - - - -`).join(' '),
      },
    ],
  },
}

export type TrackId = keyof typeof TRACKS

interface Parsed {
  bpm: number
  steps: number
  channels: { ch: Channel; events: NoteEvent[] }[]
  drums: string[]
  drumVol: number
}
const parsedCache = new Map<string, Parsed>()
function parsed(id: string): Parsed {
  let p = parsedCache.get(id)
  if (p) return p
  const t = TRACKS[id]!
  const channels = t.channels.map((ch) => ({ ch, ...parseChannel(ch.notes) }))
  const steps = Math.max(...channels.map((c) => c.steps))
  p = { bpm: t.bpm, steps, channels, drums: t.drums?.trim().split(/\s+/) ?? [], drumVol: t.drumVol ?? 0.5 }
  parsedCache.set(id, p)
  return p
}

// 시퀀서: 짧은 간격으로 조금 앞의 음까지 미리 예약 (look-ahead scheduling)
const LOOKAHEAD = 0.25
let wanted: TrackId | null = null
let playing: { id: TrackId; gain: GainNode; step: number; nextTime: number } | null = null
let timer: ReturnType<typeof setInterval> | undefined

/** 재생할 배경음악 지정 (null = 정지). 바뀌면 짧게 교차 페이드 */
export function playMusic(id: TrackId | null) {
  wanted = id
  if (!ctx || ctx.state !== 'running') return
  if (playing?.id === id) return
  if (playing) {
    const old = playing.gain
    old.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15)
    setTimeout(() => old.disconnect(), 1200)
    playing = null
  }
  if (!id || !musicBus) return
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.4)
  gain.connect(musicBus)
  playing = { id, gain, step: 0, nextTime: ctx.currentTime + 0.1 }
  startSequencer()
}

function startSequencer() {
  if (timer || !ctx) return
  timer = setInterval(schedule, 50)
}

function schedule() {
  const c = ctx
  if (!c || c.state !== 'running') return
  if (!playing) {
    if (wanted) playMusic(wanted)
    if (!playing) return
  }
  // 음소거면 예약하지 않음 (볼륨을 다시 올리면 이어서 재생)
  if (audioSettings.music <= 0) {
    playing.nextTime = c.currentTime + 0.05
    return
  }
  const p = parsed(playing.id)
  const stepDur = 60 / p.bpm / 4
  // 백그라운드에서 돌아오는 등 크게 밀렸으면 지금부터 다시
  if (playing.nextTime < c.currentTime - 0.2) playing.nextTime = c.currentTime + 0.05
  while (playing.nextTime < c.currentTime + LOOKAHEAD) {
    const s = playing.step
    const t = playing.nextTime
    for (const { ch, events } of p.channels) {
      for (const e of events) {
        if (e.step !== s) continue
        tone(playing.gain, ch.wave, e.freq, t, e.len * stepDur * (ch.gate ?? 1), ch.vol, { vibrato: ch.vibrato })
      }
    }
    const d = p.drums[s % (p.drums.length || 1)]
    if (d === 'k') kick(playing.gain, t, p.drumVol)
    else if (d === 's') noise(playing.gain, t, 0.12, p.drumVol * 0.35, 1500)
    else if (d === 'h') noise(playing.gain, t, 0.03, p.drumVol * 0.12, 7000)
    else if (d === 'o') noise(playing.gain, t, 0.12, p.drumVol * 0.12, 6000)
    playing.step = (s + 1) % p.steps
    playing.nextTime += stepDur
  }
}

/** 징글 동안 배경음악을 줄였다가 되돌림 */
function duck(sec: number) {
  if (!ctx || !duckGain) return
  const t = ctx.currentTime
  duckGain.gain.cancelScheduledValues(t)
  duckGain.gain.setTargetAtTime(0.15, t, 0.05)
  duckGain.gain.setTargetAtTime(1, t + sec, 0.3)
}

// ---------- 효과음 ----------
export type SfxId =
  | 'click'
  | 'hit'
  | 'hitSuper'
  | 'hitWeak'
  | 'crit'
  | 'faint'
  | 'playerFaint'
  | 'levelUp'
  | 'evolve'
  | 'throw'
  | 'shake'
  | 'catch'
  | 'breakOut'
  | 'buy'
  | 'heal'
  | 'boss'
  | 'clear'
  | 'learn'

/** 너무 자주 겹치지 않도록 효과음별 마지막 재생 시각 */
const lastPlayed = new Map<SfxId, number>()
const MIN_GAP: Partial<Record<SfxId, number>> = { click: 0.04, hit: 0.06, buy: 0.06, levelUp: 0.4, learn: 0.3 }

/** 효과음 재생. delay = 몇 초 뒤 */
export function sfx(id: SfxId, delay = 0) {
  const c = ctx
  if (!c || !sfxBus || c.state !== 'running' || audioSettings.sfx <= 0) return
  const t = c.currentTime + delay
  const gap = MIN_GAP[id]
  const last = lastPlayed.get(id)
  if (gap && last != null && Math.abs(t - last) < gap) return
  lastPlayed.set(id, t)
  const o = sfxBus
  const seq = (wave: Wave, notes: string[], step: number, vol: number, len = step) =>
    notes.forEach((n, i) => n !== '.' && tone(o, wave, freqOf(n), t + i * step, len, vol))

  switch (id) {
    case 'click':
      tone(o, 'pulse25', 1320, t, 0.035, 0.12)
      break
    case 'hit':
      noise(o, t, 0.12, 0.5, 800)
      tone(o, 'square', 220, t, 0.1, 0.18, { slideTo: 80 })
      break
    case 'hitWeak':
      noise(o, t, 0.08, 0.28, 1500)
      tone(o, 'square', 180, t, 0.07, 0.1, { slideTo: 90 })
      break
    case 'hitSuper':
      noise(o, t, 0.2, 0.6, 500)
      tone(o, 'square', 300, t, 0.16, 0.2, { slideTo: 60 })
      noise(o, t + 0.09, 0.15, 0.45, 900)
      tone(o, 'square', 240, t + 0.09, 0.12, 0.16, { slideTo: 60 })
      break
    case 'crit':
      tone(o, 'pulse25', 1800, t, 0.06, 0.12, { slideTo: 2600 })
      break
    case 'faint':
      tone(o, 'square', 700, t, 0.45, 0.14, { slideTo: 90, release: 0.15 })
      noise(o, t + 0.35, 0.25, 0.25, 300, 'lowpass')
      break
    case 'playerFaint':
      tone(o, 'triangle', 520, t, 0.9, 0.4, { slideTo: 60, release: 0.3 })
      tone(o, 'pulse25', 260, t, 0.9, 0.08, { slideTo: 40, release: 0.3 })
      break
    case 'levelUp':
      duck(0.9)
      seq('pulse25', ['C5', 'E5', 'G5', 'C6'], 0.08, 0.14)
      tone(o, 'pulse25', freqOf('E6'), t + 0.32, 0.35, 0.14, { vibrato: true })
      tone(o, 'triangle', freqOf('C4'), t + 0.32, 0.35, 0.25)
      break
    case 'learn':
      seq('pulse25', ['G5', 'B5', 'D6'], 0.07, 0.12)
      break
    case 'evolve':
      duck(2.6)
      seq('pulse25', ['C5', 'G5', 'E5', 'C6', 'G5', 'E6', 'C6', 'G6'], 0.1, 0.12, 0.09)
      seq('triangle', ['C4', '.', 'G3', '.', 'A3', '.', 'F3', '.'], 0.1, 0.25, 0.2)
      tone(o, 'pulse25', freqOf('C6'), t + 0.85, 0.25, 0.13)
      tone(o, 'pulse25', freqOf('D6'), t + 1.1, 0.25, 0.13)
      tone(o, 'pulse25', freqOf('E6'), t + 1.35, 0.9, 0.14, { vibrato: true })
      tone(o, 'pulse12', freqOf('G5'), t + 1.35, 0.9, 0.08)
      tone(o, 'triangle', freqOf('C4'), t + 1.35, 0.9, 0.28)
      break
    case 'throw':
      tone(o, 'pulse25', 300, t, 0.22, 0.1, { slideTo: 1400 })
      noise(o, t, 0.2, 0.12, 3000)
      break
    case 'shake':
      tone(o, 'square', 420, t, 0.04, 0.12)
      tone(o, 'square', 300, t + 0.06, 0.05, 0.12)
      break
    case 'catch':
      duck(1.2)
      seq('pulse25', ['G5', 'C6', 'E6', 'G6'], 0.07, 0.13)
      tone(o, 'pulse25', freqOf('C7'), t + 0.28, 0.5, 0.11, { vibrato: true })
      tone(o, 'triangle', freqOf('C4'), t + 0.28, 0.5, 0.25)
      break
    case 'breakOut':
      noise(o, t, 0.15, 0.35, 2000)
      tone(o, 'square', 900, t, 0.12, 0.12, { slideTo: 300 })
      break
    case 'buy':
      tone(o, 'pulse25', freqOf('B5'), t, 0.06, 0.12)
      tone(o, 'pulse25', freqOf('E6'), t + 0.06, 0.22, 0.12)
      break
    case 'heal':
      duck(1.6)
      seq('pulse25', ['C5', 'C5', 'G5', 'G5', 'E5', 'C6'], 0.13, 0.12, 0.12)
      tone(o, 'triangle', freqOf('C4'), t, 0.78, 0.22)
      tone(o, 'pulse25', freqOf('E6'), t + 0.78, 0.6, 0.12, { vibrato: true })
      break
    case 'boss':
      for (let i = 0; i < 3; i++) {
        tone(o, 'square', 880, t + i * 0.28, 0.12, 0.13)
        tone(o, 'square', 660, t + i * 0.28 + 0.13, 0.12, 0.13)
      }
      noise(o, t, 0.6, 0.15, 200, 'lowpass')
      break
    case 'clear':
      duck(2.4)
      seq('square', ['C5', '.', 'C5', 'C5', 'G5', '.', '.', '.', 'F5', '.', 'E5', '.', 'D5', '.', 'C5', '.'], 0.09, 0.1, 0.08)
      tone(o, 'square', freqOf('G5'), t + 1.44, 0.7, 0.11, { vibrato: true })
      tone(o, 'pulse12', freqOf('E5'), t + 1.44, 0.7, 0.07)
      tone(o, 'triangle', freqOf('C3'), t + 1.44, 0.7, 0.28)
      break
  }
}

// ---------- 시작 ----------
let installed = false
/**
 * 브라우저 자동 재생 정책 때문에 첫 클릭·키 입력 때 AudioContext 를 켬.
 * 탭이 숨겨지면 멈추고 돌아오면 다시 재생
 */
export function installAudio() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const unlock = () => {
    const c = getCtx()
    if (!c) return
    c.resume()
      .then(() => {
        if (wanted) playMusic(wanted)
      })
      .catch(() => {})
  }
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })
  // 버튼 클릭음 (자동 동작이 아니라 사용자가 누른 경우만)
  window.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest('button, [role="button"], input[type="radio"], input[type="checkbox"]') : null
    if (el && !(el as HTMLButtonElement).disabled) sfx('click')
  })
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) ctx.suspend().catch(() => {})
    else unlock()
  })
}
