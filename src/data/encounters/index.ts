// 스테이지별 야생 출현표. JSON은 scripts/build-encounters.mjs 로 생성 (직접 수정 금지)
// 파일 이름 = 지방 key (예: kanto-rby.json)

export interface EncounterEntry {
  /** 포켓몬 id (PokeAPI 이름) */
  p: string
  min: number
  max: number
  /** 출현율 % */
  rate: number
  /** 특수 조건 출현 (0.1% 고정) */
  special?: true
}

/** 낮/밤 출현표가 같으면 all, 다르면 day/night */
export type PhasedEntries = { all: EncounterEntry[] } | { day: EncounterEntry[]; night: EncounterEntry[] }

/** 수상 스테이지의 조우 방법: 파도타기 / 낡은·좋은·대단한낚싯대 */
export type WaterMethod = 'surf' | 'old-rod' | 'good-rod' | 'super-rod'
export const ROD_IDS = ['old-rod', 'good-rod', 'super-rod'] as const
export type RodId = (typeof ROD_IDS)[number]

/** all / day·night = 모든 조우 방법을 합친 전체 출현표 */
export type EncounterSet = {
  place: string
  kind: 'land' | 'water'
  /** 출현 데이터의 버전 그룹 (예: 'firered-leafgreen'). 야생 포켓몬 기술 배치 기준 */
  vg: string
  /** 수상 스테이지: 조우 방법별 출현표 (가진 수단에 따라 섞어서 씀) */
  methods?: Partial<Record<WaterMethod, PhasedEntries>>
} & PhasedEntries

export interface RegionEncounters {
  species: Record<string, { num: number; ko: string }>
  /** 스테이지 이름 (스토리 진행 순서) */
  order: string[]
  stages: Record<string, EncounterSet>
}

const files = import.meta.glob<RegionEncounters>('./*.json', { eager: true, import: 'default' })

/** 키 = 지방 key */
export const ENCOUNTERS: Record<string, RegionEncounters> = Object.fromEntries(
  Object.entries(files).map(([file, data]) => [file.replace(/^\.\/|\.json$/g, ''), data]),
)

export function encountersAt(set: PhasedEntries, phase: 'day' | 'night'): EncounterEntry[] {
  return 'all' in set ? set.all : set[phase]
}

/**
 * 쓸 수 있는 조우 방법만으로 만든 출현표. 방법마다 같은 비중으로 섞음
 * (예: 파도타기 + 좋은낚싯대 = 각각 50%). 육지 스테이지(methods 없음)는 그대로.
 * 쓸 수 있는 방법의 출현 데이터가 없으면 null
 */
export function encountersWith(set: EncounterSet, usable: readonly WaterMethod[]): EncounterSet | null {
  if (!set.methods) return set
  const tables = usable.map((m) => set.methods![m]).filter((t): t is PhasedEntries => !!t)
  if (!tables.length) return null
  const merge = (phase: 'day' | 'night'): EncounterEntry[] => {
    const out = new Map<string, EncounterEntry>()
    for (const t of tables)
      for (const e of encountersAt(t, phase)) {
        const rate = e.rate / tables.length
        const cur = out.get(e.p)
        if (!cur) out.set(e.p, { ...e, rate })
        else {
          cur.rate += rate
          cur.min = Math.min(cur.min, e.min)
          cur.max = Math.max(cur.max, e.max)
          if (!e.special) delete cur.special
        }
      }
    return [...out.values()]
      .map((e) => ({ ...e, rate: Math.round(e.rate * 10) / 10 }))
      .sort((a, b) => Number(!!a.special) - Number(!!b.special) || b.rate - a.rate)
  }
  const day = merge('day')
  const night = merge('night')
  const phased: PhasedEntries = JSON.stringify(day) === JSON.stringify(night) ? { all: day } : { day, night }
  return { place: set.place, kind: set.kind, vg: set.vg, ...phased }
}

export function speciesName(id: string): string {
  for (const r of Object.values(ENCOUNTERS)) if (r.species[id]) return r.species[id].ko
  return id
}
