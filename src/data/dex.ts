// 도감 데이터 (public/data/dex/*.json, scripts/build-dex.mjs 로 생성). 용량이 커서 필요할 때 fetch
import { shallowRef } from 'vue'
import { encountersAt, ENCOUNTERS } from './encounters'
import { REGIONS, type Stage } from './stages'

export interface DexEntry {
  id: string
  num: number
  ko: string
  genus: string
  gen: number
  types: string[]
  /** hp, atk, def, spa, spd, spe */
  stats: number[]
  /** [특성 id] 또는 [특성 id, 1(숨겨진 특성)] */
  abilities: ([number] | [number, 1])[]
  /** 원작 포획률 (0~255) */
  capture: number
  height: number
  weight: number
  /** 기술 데이터가 존재하는(본가에 등장한) 세대 */
  gens: number[]
}

/** [기술 id, 'level', 습득 레벨(0=진화 시)] | [기술 id, 'tm'] | [기술 id, 'gen', 세대들, {세대: 레벨}?] */
export type LearnEntry =
  | [number, 'level', number]
  | [number, 'tm']
  | [number, 'gen', number[], Record<string, number>?]

export interface MoveInfo {
  /** PokeAPI identifier (예: 'fly') */
  id: string
  ko: string
  type: string
  cls: 'physical' | 'special' | 'status'
  power: number | null
  acc: number | null
  pp: number | null
}

export interface ItemInfo {
  ko: string
  /** 가방 주머니: medicine, pokeballs, battle, berries, misc ... */
  pocket: string
  text: string
}

export interface DexData {
  index: DexEntry[]
  /** 키 = 숫자 기술 id */
  moves: Record<string, MoveInfo>
  /** 키 = 기술 identifier */
  movesById: Record<string, MoveInfo>
  abilities: Record<string, { ko: string; text: string }>
  types: Record<string, string>
  /** 키 = 아이템 identifier */
  items: Record<string, ItemInfo>
}

const load = <T>(file: string): Promise<T> =>
  fetch(`${import.meta.env.BASE_URL}data/dex/${file}`).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${file}`)
    return r.json() as Promise<T>
  })

export const dexData = shallowRef<DexData | null>(null)
export const learnsets = shallowRef<Record<string, LearnEntry[]> | null>(null)
let dexPromise: Promise<void> | null = null
let learnPromise: Promise<void> | null = null

export function loadDex(): Promise<void> {
  dexPromise ??= Promise.all([
    load<DexEntry[]>('index.json'),
    load<DexData['moves']>('moves.json'),
    load<DexData['abilities']>('abilities.json'),
    load<DexData['types']>('types.json'),
    load<DexData['items']>('items.json'),
  ]).then(([index, moves, abilities, types, items]) => {
    const movesById = Object.fromEntries(Object.values(moves).map((m) => [m.id, m]))
    dexData.value = { index, moves, movesById, abilities, types, items }
  })
  return dexPromise
}

export function loadLearnsets(): Promise<void> {
  learnPromise ??= load<Record<string, LearnEntry[]>>('learnsets.json').then((d) => {
    learnsets.value = d
  })
  return learnPromise
}

export const STAT_LABELS = ['HP', '공격', '방어', '특공', '특방', '스피드']

export const TYPE_COLORS: Record<string, string> = {
  normal: '#9fa19f', fighting: '#ff8000', flying: '#81b9ef', poison: '#9141cb', ground: '#915121',
  rock: '#afa981', bug: '#91a119', ghost: '#704170', steel: '#60a1b8', fire: '#e62829',
  water: '#2980ef', grass: '#3fa129', electric: '#fac000', psychic: '#ef4179', ice: '#3dcef3',
  dragon: '#5060e1', dark: '#624d4e', fairy: '#ef70ef',
}

/** [1,3,4,5,8] → "1, 3~5, 8세대" */
export function formatGens(gens: number[]): string {
  const parts: string[] = []
  for (let i = 0; i < gens.length; i++) {
    let j = i
    while (j + 1 < gens.length && gens[j + 1] === gens[j]! + 1) j++
    parts.push(i === j ? `${gens[i]}` : `${gens[i]}~${gens[j]}`)
    i = j
  }
  return parts.join(', ') + '세대'
}

export interface Sighting {
  stage: Stage
  min: number
  max: number
  rate: number
  /** 'all' = 낮/밤 공통 */
  phase: 'all' | 'day' | 'night'
  special: boolean
}

/** 출현 데이터가 있는 스테이지 중 이 포켓몬이 나오는 곳 */
export function sightingsOf(speciesId: string): Sighting[] {
  const out: Sighting[] = []
  for (const region of REGIONS) {
    if (!ENCOUNTERS[region.key]) continue
    for (const stage of region.stages) {
      const set = stage.encounters
      if (!set) continue
      const phases = 'all' in set ? (['all'] as const) : (['day', 'night'] as const)
      for (const phase of phases) {
        const e = encountersAt(set, phase === 'all' ? 'day' : phase).find((x) => x.p === speciesId)
        if (e) out.push({ stage, min: e.min, max: e.max, rate: e.rate, phase, special: !!e.special })
      }
    }
  }
  return out
}
