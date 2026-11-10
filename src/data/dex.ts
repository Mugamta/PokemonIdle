// 도감 데이터 (public/data/dex/*.json, scripts/build-dex.mjs 로 생성). 용량이 커서 필요할 때 fetch
import { shallowRef } from 'vue'
import { encountersAt, ENCOUNTERS } from './encounters'
import { ITEM_TEXT } from './itemText'
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
  /** PokeAPI 아이템 분류 (held-items, healing, standard-balls ...) */
  cat?: string
  /** 원작 가격 (없으면 원작에서 팔지 않음) */
  cost?: number
  /** 기술머신: 가르치는 기술 identifier */
  move?: string
}

/** 메가진화·원시회귀 폼 (public/data/dex/forms.json, scripts/build-forms.mjs 로 생성) */
export interface FormEntry {
  /** 폼 id (예: 'charizard-mega-x') */
  id: string
  /** 기본 폼 포켓몬 id */
  base: string
  kind: 'mega' | 'primal'
  ko: string
  types: string[]
  /** hp, atk, def, spa, spd, spe (HP는 기본 폼과 같게 맞춤) */
  stats: number[]
  /** 특성 숫자 id */
  ability: number
  /** 필요한 메가스톤·구슬 */
  item?: string
  /** 메가스톤 대신 배워야 하는 기술 (메가레쿠쟈) */
  move?: string
}

export interface DexData {
  index: DexEntry[]
  /** 키 = 폼 id */
  forms: Record<string, FormEntry>
  /** 키 = 숫자 기술 id */
  moves: Record<string, MoveInfo>
  /** 키 = 기술 identifier */
  movesById: Record<string, MoveInfo>
  abilities: Record<string, { ko: string; text: string }>
  types: Record<string, string>
  /** 키 = 아이템 identifier */
  items: Record<string, ItemInfo>
  /** 야생 포켓몬이 지니고 있는 도구 {포켓몬 id: [[아이템 id, 확률 %]]} */
  wildItems: Record<string, [string, number][]>
}

const load = <T>(file: string): Promise<T> =>
  fetch(`${import.meta.env.BASE_URL}data/dex/${file}`).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${file}`)
    return r.json() as Promise<T>
  })

export const dexData = shallowRef<DexData | null>(null)

let speciesCache: { src: unknown; map: Map<string, DexEntry> } | null = null
/** 포켓몬 정보. 메가진화·원시회귀 폼 id 면 기본 폼 정보에 폼의 이름·타입·능력치·특성을 덮어 돌려줌 */
export function speciesEntry(id: string): DexEntry | undefined {
  const dex = dexData.value
  if (!dex) return undefined
  if (speciesCache?.src !== dex) {
    const map = new Map(dex.index.map((p) => [p.id, p]))
    for (const f of Object.values(dex.forms)) {
      const base = map.get(f.base)
      if (base) map.set(f.id, { ...base, id: f.id, ko: f.ko, types: f.types, stats: f.stats, abilities: [[f.ability]] })
    }
    speciesCache = { src: dex, map }
  }
  return speciesCache.map.get(id)
}
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
    load<DexData['wildItems']>('wild-items.json'),
    load<{ forms: Record<string, Omit<FormEntry, 'id'>>; abilities: DexData['abilities'] }>('forms.json'),
  ]).then(([index, moves, abilities, types, items, wildItems, formData]) => {
    const movesById = Object.fromEntries(Object.values(moves).map((m) => [m.id, m]))
    // 애매한 원작 설명("조금", "크게" 등)을 이 게임의 실제 수치로 교체
    for (const [id, text] of Object.entries(ITEM_TEXT)) if (items[id]) items[id].text = text
    // 폼 전용 특성 이름·설명, 폼 HP는 기본 폼과 같게 (메가진화해도 최대 HP는 그대로)
    for (const [num, a] of Object.entries(formData.abilities)) abilities[num] ??= a
    const forms: Record<string, FormEntry> = {}
    for (const [id, f] of Object.entries(formData.forms)) {
      const base = index.find((p) => p.id === f.base)
      if (base) forms[id] = { ...f, id, stats: [base.stats[0]!, ...f.stats.slice(1)] }
    }
    dexData.value = { index, forms, moves, movesById, abilities, types, items, wildItems }
  })
  return dexPromise
}

export function loadLearnsets(): Promise<void> {
  learnPromise ??= load<Record<string, LearnEntry[]>>('learnsets.json').then((d) => {
    learnsets.value = d
  })
  return learnPromise
}

/** 알 기술·기술가르침 (public/data/dex/learn-methods.json, scripts/build-learn-methods.mjs 로 생성) */
export interface LearnMethods {
  /** {포켓몬 id: [기술 번호]} 알 기술 (진화 전 단계 포함, 레벨업 기술 제외) */
  egg: Record<string, number[]>
  /** {포켓몬 id: [[기술 번호, [버전 그룹 id]]]} */
  tutor: Record<string, [number, number[]][]>
  /** {기술 번호: [포켓몬 id]} 레벨업으로 배우는 포켓몬 (유전 부모 후보) */
  levelBy: Record<string, string[]>
  /** {포켓몬 id: [알 그룹 id]} (15 = 미발견) */
  eggGroups: Record<string, number[]>
  /** {포켓몬 id: 암컷 비율 0~8 (8분의 n), -1 = 무성} */
  gender: Record<string, number>
}
export const learnMethods = shallowRef<LearnMethods | null>(null)
let methodsPromise: Promise<void> | null = null
export function loadLearnMethods(): Promise<void> {
  methodsPromise ??= load<LearnMethods>('learn-methods.json').then((d) => {
    learnMethods.value = d
  })
  return methodsPromise
}

export const STAT_LABELS =['HP', '공격', '방어', '특공', '특방', '스피드']

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
