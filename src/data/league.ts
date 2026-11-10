// 포켓몬 리그: 지방(작품)별 사천왕 4명 + 챔피언. 데이터는 scripts/build-league.mjs 로 생성
import LEAGUE_JSON from './league.json'
import { REGIONS, type Region, type Stage } from './stages'

export interface LeagueMon {
  species: string
  level: number
  /** 개체값 (전 능력치 같은 값) */
  iv: number
  moves?: string[]
  item?: string
  /** 특성 칸 (1·2). 없으면 무작위 */
  abilitySlot?: number
}

export interface LeagueTrainer {
  id: string
  /** 이름 (예: '칸나') */
  name: string
  /** 칭호 (예: '사천왕', '챔피언') */
  title: string
  champion: boolean
  /** 엔트리. 플레이어 스타팅에 따라 바뀌는 챔피언(라이벌)은 여러 개 */
  variants: LeagueMon[][]
}

const LEAGUES = LEAGUE_JSON as Record<string, LeagueTrainer[]>

/** 지방의 리그 (사천왕 → 챔피언 순서). 데이터가 없는 지방은 undefined */
export const leagueOf = (region: Pick<Region, 'key'>): LeagueTrainer[] | undefined => LEAGUES[region.key]

/** 출현 데이터가 있어 플레이할 수 있는 지방 */
export const regionPlayable = (region: Region): boolean => region.stages.some((s) => !!s.encounters)

/**
 * 이 지방에 들어가려면 제패해야 하는 리그의 지방: 앞쪽 지방 중 리그가 있는 가장 가까운 지방.
 * 첫 지방·히든 지방은 null
 */
export function requiredLeagueRegion(region: Region): Region | null {
  if (region.hidden) return null
  // id 로 찾음 (화면에서 넘어온 반응형 프록시는 REGIONS 의 원본과 다른 객체)
  const i = REGIONS.findIndex((r) => r.id === region.id)
  for (let j = i - 1; j >= 0; j--) if (!REGIONS[j]!.hidden && leagueOf(REGIONS[j]!)) return REGIONS[j]!
  return null
}

/** 리그 도전 장소: 그 지방의 챔피언로드 (없으면 마지막 육지 스테이지) */
export function leagueStage(region: Region): Stage | undefined {
  const land = region.stages.filter((s) => s.kind === 'land')
  return land.find((s) => s.place === '챔피언로드') ?? land[land.length - 1] ?? region.stages[region.stages.length - 1]
}

/** 트레이너 표시 이름 (예: '사천왕 칸나') */
export const trainerLabel = (t: Pick<LeagueTrainer, 'title' | 'name'>) => `${t.title} ${t.name}`
