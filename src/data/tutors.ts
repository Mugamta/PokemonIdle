// 기술가르침 (작품별 장소·조건·비용)
// 원본 데이터(PokeAPI)에는 "어느 작품에서 가르침으로 배우는지"만 있고 장소·비용은 없어 직접 작성함.
// - region: 그 작품의 지방 key (stages.ts)
// - gate:   "그 도시에 도착했다"고 볼 스테이지 이름 (그 도시를 지나야만 갈 수 있는 스테이지)
// - cost:   free / money(원) / bp / coin / shards {색: 개수}
// 정확하지 않은 장소·비용에는 `// 확인필요` 를 달아 둠. BP·코인·조각은 아직 얻는 곳이 없음 (나중에 채움)
import { REGIONS } from './stages'

export type ShardColor = 'red' | 'blue' | 'yellow' | 'green'
export interface TutorCost {
  money?: number
  bp?: number
  coin?: number
  shards?: Partial<Record<ShardColor, number>>
}
export interface TutorSource {
  region: string
  place: string
  gate: string
  cost: TutorCost
}

export const SHARD_ITEM: Record<ShardColor, string> = {
  red: 'red-shard',
  blue: 'blue-shard',
  yellow: 'yellow-shard',
  green: 'green-shard',
}
export const SHARD_KO: Record<ShardColor, string> = { red: '빨강조각', blue: '파랑조각', yellow: '노랑조각', green: '초록조각' }

const FREE: TutorCost = {}
const ULTIMATE = ['frenzy-plant', 'blast-burn', 'hydro-cannon']
const PLEDGE = ['grass-pledge', 'fire-pledge', 'water-pledge']
const SPECIAL = ['draco-meteor', 'secret-sword', 'relic-song', 'dragon-ascent', 'volt-tackle']

/** 버전 그룹(PokeAPI id) → 기술별 가르침 정보. 기술 목록에 없으면 default */
interface VgTutors {
  default: TutorSource
  moves?: Record<string, TutorSource>
}
const each = (ids: string[], src: TutorSource) => Object.fromEntries(ids.map((id) => [id, src]))

// 에메랄드 배틀프런티어 BP // 확인필요 (비용)
const EM_FRONTIER: Record<string, number> = {
  'soft-boiled': 16, 'seismic-toss': 24, 'dream-eater': 24, 'mega-punch': 24, 'mega-kick': 48, 'body-slam': 48,
  'rock-slide': 48, counter: 48, 'thunder-wave': 48, 'swords-dance': 48, 'defense-curl': 16, snore: 24,
  'mud-slap': 24, swift: 24, 'icy-wind': 24, endure: 48, 'psych-up': 48, 'ice-punch': 48, 'thunder-punch': 48, 'fire-punch': 48,
}

const VG: Record<number, VgTutors> = {
  // 크리스탈: 금빛시티 게임코너 (불꽃·번개·냉동 기술)
  4: { default: { region: 'johto-c', place: '금빛시티 게임코너', gate: '35번도로', cost: { coin: 4000 } } },
  // 에메랄드: 배틀프런티어(BP) + 각지의 1회용 가르침
  6: {
    default: { region: 'hoenn-e', place: '호연 각지의 기술 가르침', gate: '117번도로', cost: FREE }, // 확인필요 (도시별 장소)
    moves: Object.fromEntries(
      Object.entries(EM_FRONTIER).map(([id, bp]) => [id, { region: 'hoenn-e', place: '배틀프런티어', gate: '챔피언로드', cost: { bp } }]),
    ),
  },
  // 파이어레드·리프그린: 각지의 무료 가르침, 궁극 기술은 2섬 땅끝곶
  7: {
    default: { region: 'kanto-frlg', place: '관동 각지의 기술 가르침', gate: '돌산터널', cost: FREE }, // 확인필요 (도시별 장소)
    moves: {
      ...each(ULTIMATE, { region: 'kanto-frlg', place: '2섬 땅끝곶', gate: 'Cape Brink', cost: FREE }),
      'mega-punch': { region: 'kanto-frlg', place: '4번도로', gate: '4번도로', cost: FREE },
      'mega-kick': { region: 'kanto-frlg', place: '4번도로', gate: '4번도로', cost: FREE },
      'rock-slide': { region: 'kanto-frlg', place: '돌산터널', gate: '돌산터널', cost: FREE },
      'double-edge': { region: 'kanto-frlg', place: '챔피언로드', gate: '챔피언로드', cost: FREE },
    },
  },
  // 디아루가·펄기아: 궁극 기술 228번도로, 용성군 210번도로
  8: {
    default: { region: 'sinnoh-dp', place: '228번도로', gate: '228번도로', cost: FREE },
    moves: { 'draco-meteor': { region: 'sinnoh-dp', place: '210번도로', gate: '210번도로', cost: FREE } },
  },
  // 플라티나: 212번도로 등 조각 가르침
  9: {
    default: { region: 'sinnoh-pt', place: '212번도로 기술 가르침', gate: '212번도로', cost: { shards: { red: 2, blue: 2, yellow: 2, green: 2 } } }, // 확인필요 (장소별·비용)
    moves: {
      ...each(ULTIMATE, { region: 'sinnoh-pt', place: '228번도로', gate: '228번도로', cost: FREE }),
      'draco-meteor': { region: 'sinnoh-pt', place: '210번도로', gate: '210번도로', cost: FREE },
    },
  },
  // 하트골드·소울실버: 배틀프런티어 BP, 궁극 기술·용성군은 검은먹시티
  10: {
    default: { region: 'johto-hgss', place: '배틀프런티어', gate: '40번도로', cost: { bp: 40 } }, // 확인필요 (비용)
    moves: each([...ULTIMATE, 'draco-meteor'], { region: 'johto-hgss', place: '검은먹시티', gate: '45번도로', cost: FREE }),
  },
  // 블랙·화이트: 맹세 기술·궁극 기술·용성군 무료
  11: { default: { region: 'unova-bw', place: '하나지방 기술 가르침', gate: '6번도로', cost: FREE } }, // 확인필요 (장소)
  // 블랙2·화이트2: 조각 가르침 (물풍경시티 등)
  14: {
    default: { region: 'unova-b2w2', place: '물풍경시티 기술 가르침', gate: '6번도로', cost: { shards: { red: 4, blue: 4 } } }, // 확인필요 (장소별·비용)
    moves: each([...ULTIMATE, ...PLEDGE, ...SPECIAL], { region: 'unova-b2w2', place: '하나지방 기술 가르침', gate: '6번도로', cost: FREE }),
  },
  // X·Y: 맹세 기술·궁극 기술·용성군 무료
  15: { default: { region: 'kalos-xy', place: '칼로스지방 기술 가르침', gate: '13번도로', cost: FREE } }, // 확인필요 (장소)
  // 오메가루비·알파사파이어: 보라시티 BP 가르침
  16: {
    default: { region: 'hoenn-oras', place: '보라시티 기술 가르침', gate: '117번도로', cost: { bp: 16 } }, // 확인필요 (비용)
    moves: each([...ULTIMATE, ...PLEDGE, ...SPECIAL], { region: 'hoenn-oras', place: '호연지방 기술 가르침', gate: '117번도로', cost: FREE }),
  },
  // 썬·문: 궁극 기술·맹세 기술·용성군 무료
  17: { default: { region: 'alola-sm', place: '알로라지방 기술 가르침', gate: '텐캐럿힐', cost: FREE } }, // 확인필요 (장소)
  // 울트라썬·울트라문: 섬마다 BP 가르침
  18: {
    default: { region: 'alola-usum', place: '알로라 섬의 기술 가르침', gate: '텐캐럿힐', cost: { bp: 16 } }, // 확인필요 (장소별·비용)
    moves: each([...ULTIMATE, ...PLEDGE, ...SPECIAL], { region: 'alola-usum', place: '알로라지방 기술 가르침', gate: '텐캐럿힐', cost: FREE }),
  },
  // 레츠고: 파트너 기술 무료
  19: { default: { region: 'kanto-lgpe', place: '파트너 기술 가르침', gate: '16번도로', cost: FREE } }, // 확인필요 (장소)
  // 소드·실드 (+갑옷의 외딴섬): 무료
  20: { default: { region: 'galar-swsh', place: '가라르지방 기술 가르침', gate: '6번도로', cost: FREE } }, // 확인필요 (장소·비용)
  // 브릴리언트 다이아몬드·샤이닝 펄
  23: {
    default: { region: 'sinnoh-bdsp', place: '228번도로', gate: '228번도로', cost: FREE },
    moves: { 'draco-meteor': { region: 'sinnoh-bdsp', place: '210번도로', gate: '210번도로', cost: FREE } },
  },
  // 레전드 아르세우스: 은두마을 기술 가르침 // 확인필요 (장소 이름·공적 포인트 비용)
  24: { default: { region: 'hisui', place: '히스이지방 기술 가르침', gate: '흑요 들판', cost: FREE } },
  // 스칼렛·바이올렛
  25: { default: { region: 'paldea-sv', place: '팔데아지방 기술 가르침', gate: '티스푼 오솔길', cost: FREE } }, // 확인필요
}

/** 이 작품에서 이 기술을 가르쳐 주는 곳 (데이터가 없는 작품이면 undefined) */
export function tutorSource(vg: number, moveId: string): TutorSource | undefined {
  const t = VG[vg]
  return t ? (t.moves?.[moveId] ?? t.default) : undefined
}

/** 표에 쓰인 지방·스테이지 이름이 실제로 있는지 (테스트용) */
export function tutorTableProblems(): string[] {
  const out: string[] = []
  for (const [vg, t] of Object.entries(VG)) {
    for (const src of [t.default, ...Object.values(t.moves ?? {})]) {
      const region = REGIONS.find((r) => r.key === src.region)
      if (!region) out.push(`${vg}: 지방 ${src.region} 없음`)
      else if (!region.stages.some((s) => s.name === src.gate)) out.push(`${vg}: ${src.region} 에 스테이지 ${src.gate} 없음`)
    }
  }
  return [...new Set(out)]
}

/** 작품 이름 (지방 이름 포함) */
export function tutorRegionTitle(src: TutorSource): string {
  return REGIONS.find((r) => r.key === src.region)?.title ?? src.region
}

/** 비용 표시 */
export function tutorCostText(c: TutorCost): string {
  const parts: string[] = []
  if (c.money) parts.push(`${c.money.toLocaleString()}원`)
  if (c.bp) parts.push(`${c.bp} BP`)
  if (c.coin) parts.push(`코인 ${c.coin.toLocaleString()}개`)
  for (const [k, n] of Object.entries(c.shards ?? {})) if (n) parts.push(`${SHARD_KO[k as ShardColor]} ${n}개`)
  return parts.length ? parts.join(' · ') : '무료'
}
