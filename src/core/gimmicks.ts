// 특수 기능: 메가진화(6세대) · Z기술(7세대) · 다이맥스(8세대) · 테라스탈(9세대)
// 각 기능은 그 세대가 무대인 지방에 처음 들어가면 해금되고, 한 전투에 네 가지 중 하나를 한 번만 쓸 수 있음.
// 이 파일은 판정용 표와 순수 계산만 담당. 전투 중 상태 변경은 stores/game.ts, 데미지 계산은 core/battle.ts
//
// 미구현: 거다이맥스, 전용 Z크리스탈(피카츄Z 등), 변화기 Z기술, 날씨·필드를 만드는 다이맥스 기술의 날씨·필드 효과
import type { MoveExtra, StageKey } from '../data/battle'
import { dexData, type FormEntry } from '../data/dex'
import type { MoveData } from './battle'

export type Gimmick = 'mega' | 'z' | 'dynamax' | 'tera'
export const GIMMICKS: Gimmick[] = ['mega', 'z', 'dynamax', 'tera']

export const GIMMICK_INFO: Record<Gimmick, { label: string; gen: number; desc: string }> = {
  mega: {
    label: '메가진화',
    gen: 6,
    desc: '맞는 메가스톤을 지닌 포켓몬이 전투 중 메가진화합니다. 전투가 끝나거나 교체할 때까지 능력치·타입·특성이 바뀝니다.',
  },
  z: {
    label: 'Z기술',
    gen: 7,
    desc: 'Z크리스탈을 지닌 포켓몬이 같은 타입 공격기를 한 번 Z기술로 씁니다. 위력이 크게 오르고 반드시 맞습니다.',
  },
  dynamax: {
    label: '다이맥스',
    gen: 8,
    desc: '3턴 동안 HP가 2배가 되고, 공격기는 다이맥스 기술(반드시 맞고 부가 효과로 능력 변화), 변화기는 다이월(상대 공격을 막음)이 됩니다.',
  },
  tera: {
    label: '테라스탈',
    gen: 9,
    desc: '전투가 끝나거나 교체할 때까지 테라스탈 타입 하나가 됩니다. 테라스탈 타입 기술은 자속 보정을 받고, 원래 타입과 같으면 2배가 됩니다.',
  },
}

/** 한 전투에서 쓴 특수 기능 중 지금 효과가 이어지는 것 (Z기술은 그 턴에 끝나므로 없음) */
export type ActiveGimmick =
  | { kind: 'mega'; form: string }
  | { kind: 'dynamax'; turns: number }
  | { kind: 'tera'; type: string }

/** 다이맥스 지속 턴 수 */
export const DYNAMAX_TURNS = 3

// ---------- 메가진화 ----------
/** 폼 정보 (메가진화·원시회귀) */
export const formOf = (id: string): FormEntry | undefined => dexData.value?.forms[id]

/** 이 포켓몬이 지닌 도구·배운 기술로 메가진화할 수 있는 폼 (없으면 undefined) */
export function megaFormFor(species: string, held: Record<string, number> | null | undefined, learned: string[]): FormEntry | undefined {
  const forms = dexData.value?.forms
  if (!forms) return undefined
  return Object.values(forms).find(
    (f) => f.base === species && (f.item ? (held?.[f.item] ?? 0) > 0 : !!f.move && learned.includes(f.move)),
  )
}

/** 메가스톤·원시회귀 구슬인지 */
export function isMegaItem(id: string): boolean {
  const forms = dexData.value?.forms
  return !!forms && Object.values(forms).some((f) => f.item === id)
}

// ---------- Z기술 ----------
/** 타입 Z크리스탈 → 타입 (전용 Z크리스탈은 미구현) */
export const Z_CRYSTALS: Record<string, string> = {
  'normalium-z--held': 'normal',
  'firium-z--held': 'fire',
  'waterium-z--held': 'water',
  'electrium-z--held': 'electric',
  'grassium-z--held': 'grass',
  'icium-z--held': 'ice',
  'fightinium-z--held': 'fighting',
  'poisonium-z--held': 'poison',
  'groundium-z--held': 'ground',
  'flyinium-z--held': 'flying',
  'psychium-z--held': 'psychic',
  'buginium-z--held': 'bug',
  'rockium-z--held': 'rock',
  'ghostium-z--held': 'ghost',
  'dragonium-z--held': 'dragon',
  'darkinium-z--held': 'dark',
  'steelium-z--held': 'steel',
  'fairium-z--held': 'fairy',
}

const Z_MOVE_KO: Record<string, string> = {
  normal: '울트라대시어택',
  fighting: '전력무쌍격렬권',
  flying: '파이널다이브클래시',
  poison: '애시드포이즌딜리트',
  ground: '라이징랜드오버',
  rock: '월즈엔드폴',
  bug: '절대포식회전참',
  ghost: '무한암야로의유인',
  steel: '초월나선연격',
  fire: '다이내믹풀플레임',
  water: '슈퍼아쿠아토네이도',
  grass: '블룸샤인엑스트라',
  electric: '스파킹기가볼트',
  psychic: '맥시멈사이브레이커',
  ice: '레이징지오프리즈',
  dragon: '얼티메이트드래곤번',
  dark: '블랙홀이클립스',
  fairy: '래디얼엣지스톰',
}

/** Z기술 위력 (원래 기술 위력 기준, 위력이 정해지지 않은 공격기는 100) */
export function zPower(power: number | null): number {
  if (power == null) return 100
  if (power <= 55) return 100
  if (power <= 65) return 120
  if (power <= 75) return 140
  if (power <= 85) return 160
  if (power <= 95) return 175
  if (power <= 100) return 180
  if (power <= 110) return 185
  if (power <= 125) return 190
  if (power <= 135) return 195
  return 200
}

/** Z크리스탈로 Z기술이 되는 기술인지 (같은 타입 공격기) */
export function zEligible(m: MoveData | null | undefined, held: Record<string, number> | null | undefined): boolean {
  if (!m || m.cls === 'status' || m.id === 'struggle' || !held) return false
  return Object.keys(held).some((id) => (held[id] ?? 0) > 0 && Z_CRYSTALS[id] === m.type)
}
/** Z크리스탈을 지니고 있는지 */
export const holdsZCrystal = (held: Record<string, number> | null | undefined): boolean =>
  !!held && Object.keys(held).some((id) => (held[id] ?? 0) > 0 && id in Z_CRYSTALS)

/** Z기술 (반드시 맞고 부가 효과·접촉 없음, 우선도 0) */
export function zMove(m: MoveData): MoveData {
  return {
    ...m,
    id: `z:${m.id}`,
    ko: Z_MOVE_KO[m.type] ?? m.ko,
    power: zPower(m.power),
    acc: null,
    pp: null,
    extra: {},
  }
}

// ---------- 다이맥스 ----------
type MaxFx = { stat: StageKey; n: number; self: boolean }
const MAX_MOVES: Record<string, { ko: string; fx?: MaxFx }> = {
  normal: { ko: '다이어택', fx: { stat: 'spe', n: -1, self: false } },
  fighting: { ko: '다이너클', fx: { stat: 'atk', n: 1, self: true } },
  flying: { ko: '다이제트', fx: { stat: 'spe', n: 1, self: true } },
  poison: { ko: '다이애시드', fx: { stat: 'spa', n: 1, self: true } },
  ground: { ko: '다이어스', fx: { stat: 'spd', n: 1, self: true } },
  rock: { ko: '다이로크' },
  bug: { ko: '다이웜', fx: { stat: 'spa', n: -1, self: false } },
  ghost: { ko: '다이할로우', fx: { stat: 'def', n: -1, self: false } },
  steel: { ko: '다이스틸', fx: { stat: 'def', n: 1, self: true } },
  fire: { ko: '다이번' },
  water: { ko: '다이스트림' },
  grass: { ko: '다이그래스' },
  electric: { ko: '다이썬더' },
  psychic: { ko: '다이사이코' },
  ice: { ko: '다이아이스' },
  dragon: { ko: '다이드라군', fx: { stat: 'atk', n: -1, self: false } },
  dark: { ko: '다이아크', fx: { stat: 'spd', n: -1, self: false } },
  fairy: { ko: '다이페어리' },
}

/** 다이맥스 기술 위력 (격투·독은 낮은 표). 위력이 정해지지 않은 공격기는 100 (격투·독 75) */
export function maxPower(power: number | null, type: string): number {
  const low = type === 'fighting' || type === 'poison'
  if (power == null) return low ? 75 : 100
  const steps: [number, number, number][] = [
    [40, 90, 70],
    [50, 100, 75],
    [60, 110, 80],
    [70, 120, 85],
    [100, 130, 90],
    [140, 140, 95],
  ]
  const s = steps.find(([max]) => power <= max)
  return s ? (low ? s[2] : s[1]) : low ? 100 : 150
}

/** 다이월: 이번 턴 상대의 기술을 막음 (우선도 +4) */
export const MAX_GUARD: MoveData = {
  id: 'max-guard',
  ko: '다이월',
  type: 'normal',
  cls: 'status',
  power: null,
  acc: null,
  pp: null,
  num: 743,
  extra: { pri: 4, self: 1 },
}

/** 다이맥스 중에 쓰는 기술: 공격기 → 다이맥스 기술, 변화기 → 다이월 */
export function maxMove(m: MoveData): MoveData {
  if (m.cls === 'status') return MAX_GUARD
  const type = m.type === 'typeless' ? 'normal' : m.type
  const def = MAX_MOVES[type] ?? { ko: '다이어택' }
  const extra: MoveExtra = def.fx ? { stats: [[def.fx.stat, def.fx.n]], ...(def.fx.self && { self: 1 as const }) } : {}
  return {
    ...m,
    id: `max:${m.id}`,
    ko: def.ko,
    type,
    power: maxPower(m.power, type),
    acc: null,
    pp: null,
    extra,
  }
}

/** 다이맥스 기술의 부가 효과 설명 (예: "상대 스피드 -1") */
export function maxMoveFx(type: string): string {
  const fx = MAX_MOVES[type]?.fx
  if (!fx) return ''
  const names: Record<string, string> = { atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' }
  return `${fx.self ? '자신' : '상대'} ${names[fx.stat]} ${fx.n > 0 ? '+' : ''}${fx.n}`
}

// ---------- 테라스탈 ----------
/** 테라피스 → 타입 */
export const teraShardType = (id: string): string | null => (id.endsWith('-tera-shard') ? id.slice(0, -'-tera-shard'.length) : null)
export const teraShardOf = (type: string) => `${type}-tera-shard`
/** 테라스탈 타입을 바꾸는 데 필요한 테라피스 수 */
export const TERA_SHARD_COST = 50
