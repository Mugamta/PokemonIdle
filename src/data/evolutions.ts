// 진화 데이터 (public/data/dex/evolutions.json, scripts/build-evolutions.mjs 로 생성)
import { shallowRef } from 'vue'
import type { Phase } from '../core/dayNight'
import { dexData } from './dex'

export interface Evolution {
  /** 진화 후 포켓몬 id */
  to: string
  /** level = 레벨업 시 자동, item = 아이템 사용, cord = 연결의끈 사용 (통신교환 대체) */
  via: 'level' | 'item' | 'cord'
  lv?: number
  /** 친밀도 조건 (FRIENDSHIP_EVOLVE 이상) */
  happy?: 1
  time?: Phase
  /** item: 사용할 아이템 / cord: 연결의끈과 함께 필요한 아이템 */
  item?: string
  /** 이 기술을 배운 상태 */
  move?: string
  /** 이 타입의 기술을 배운 상태 */
  moveType?: string
  /** 1 = 공격 > 방어, -1 = 공격 < 방어, 0 = 같음 */
  stat?: number
}

/** 친밀도 최대치 */
export const FRIENDSHIP_MAX = 255
/** 친밀도 진화 기준 (8세대 이후) */
export const FRIENDSHIP_EVOLVE = 160
/** 통신교환 대신 쓰는 아이템 */
export const LINKING_CORD = 'linking-cord'
/** 레벨업 진화를 막는 공용 기능 (상점에서 구매) */
export const EVERSTONE = 'everstone'

export const evolutions = shallowRef<Record<string, Evolution[]> | null>(null)
let promise: Promise<void> | null = null

export function loadEvolutions(): Promise<void> {
  promise ??= fetch(`${import.meta.env.BASE_URL}data/dex/evolutions.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} evolutions.json`)
      return r.json() as Promise<Record<string, Evolution[]>>
    })
    .then((d) => {
      evolutions.value = d
    })
    .catch((e) => {
      promise = null
      throw e
    })
  return promise
}

export const evolutionsOf = (species: string): Evolution[] => evolutions.value?.[species] ?? []

export interface EvoItemUse {
  /** 진화 전 포켓몬 id */
  from: string
  fromName: string
  toName: string
  /** 함께 필요한 아이템 (예: "금속코트 함께") */
  extra: string
}

/** 이 아이템으로 진화하는 포켓몬 목록 (예: 롱스톤 → 강철톤 (연결의끈 함께)) */
export function evoItemUsage(itemId: string): EvoItemUse[] {
  const ko = (id: string) => dexData.value?.index.find((p) => p.id === id)?.ko ?? id
  const item = (id: string) => dexData.value?.items[id]?.ko ?? id
  const out: EvoItemUse[] = []
  for (const [from, list] of Object.entries(evolutions.value ?? {}))
    for (const e of list) {
      const use = (extra: string) => out.push({ from, fromName: ko(from), toName: ko(e.to), extra })
      if (itemId === LINKING_CORD && e.via === 'cord') use(e.item ? `${item(e.item)} 함께` : '')
      else if (e.item === itemId) use(e.via === 'cord' ? `${item(LINKING_CORD)} 함께` : '')
    }
  return out
}

let familyCache: { src: unknown; map: Map<string, string> } | null = null
/** 진화 계통의 뿌리 포켓몬 id (파이리·리자드·리자몽 → 'charmander'). 진화 데이터가 없으면 자기 자신 */
export function familyRoot(species: string): string {
  const evo = evolutions.value
  if (!evo) return species
  if (familyCache?.src !== evo) {
    const prevo = new Map<string, string>()
    for (const [from, list] of Object.entries(evo)) for (const e of list) if (!prevo.has(e.to)) prevo.set(e.to, from)
    const map = new Map<string, string>()
    for (const id of new Set([...prevo.keys(), ...prevo.values()])) {
      let root = id
      const visited = new Set<string>()
      while (prevo.has(root) && !visited.has(root)) {
        visited.add(root)
        root = prevo.get(root)!
      }
      map.set(id, root)
    }
    familyCache = { src: evo, map }
  }
  return familyCache.map.get(species) ?? species
}
