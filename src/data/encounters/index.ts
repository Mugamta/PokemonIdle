// 스테이지별 야생 출현표. JSON은 scripts/build-encounters.mjs 로 생성 (직접 수정 금지)
import kantoJohto from './kantoJohto.json'

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
export type EncounterSet = {
  place: string
  kind: 'land' | 'water'
  /** 출현 데이터의 버전 그룹 (예: 'firered-leafgreen'). 야생 포켓몬 기술 배치 기준 */
  vg: string
} & ({ all: EncounterEntry[] } | { day: EncounterEntry[]; night: EncounterEntry[] })

export interface RegionEncounters {
  species: Record<string, { num: number; ko: string }>
  stages: Record<string, EncounterSet>
}

/** 키 = 지방 key */
export const ENCOUNTERS: Record<string, RegionEncounters> = {
  'kanto-johto': kantoJohto as RegionEncounters,
}

export function encountersAt(set: EncounterSet, phase: 'day' | 'night'): EncounterEntry[] {
  return 'all' in set ? set.all : set[phase]
}

export function speciesName(id: string): string {
  for (const r of Object.values(ENCOUNTERS)) if (r.species[id]) return r.species[id].ko
  return id
}
