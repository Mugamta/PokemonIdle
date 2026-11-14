// 전투 계산 (5세대 이후 공식 기준). 상태 저장과 무관한 순수 계산만 담당
import { battleData, STATUS_LABELS, type MoveExtra, type MoveFlag, type StageKey, type Status } from '../data/battle'
import { dexData, learnsets, speciesEntry, type DexEntry, type MoveInfo } from '../data/dex'
import { calcStats } from '../data/natures'
import {
  ABSORB,
  abilityName,
  BREAKERS,
  CONTACT_STATUS,
  DROP_BLOCK,
  ENTRY_ABILITIES,
  FLAG_IMMUNE,
  FLAG_POWER,
  HIT_STAT,
  PINCH,
  PRIORITY_BLOCK,
  SKIN,
  speciesAbilities,
  STATUS_IMMUNE_AB,
  TYPE_POWER,
  UNBREAKABLE,
  UNCOPYABLE,
} from './abilities'
import {
  CHOICE_ITEMS,
  CRIT_ITEMS,
  CRIT_SPECIES_ITEMS,
  EVASION_ITEMS,
  FLINCH_ITEMS,
  GEMS,
  HEAL_HELD,
  HIT_BOOST,
  LAST_ITEMS,
  ORBS,
  PINCH_BERRY,
  RESIST_BERRY,
  SLOW_ITEMS,
  STATUS_BERRY,
  TYPE_BOOST,
  UNNERVE,
} from './items'
import { evolutionsOf } from '../data/evolutions'
import { MAX_GUARD } from './gimmicks'

export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTY_IDS: Difficulty[] = ['easy', 'normal', 'hard']
export const DIFFICULTIES: { id: Difficulty; label: string; desc: string }[] = [
  { id: 'easy', label: '쉬움', desc: '원작 그대로의 상대. 상대는 지금 내 포켓몬에게 가장 강한 기술을 씁니다.' },
  {
    id: 'normal',
    label: '보통',
    desc: '상대 레벨 +50, 모든 노력치 252. 배틀시설 엔트리 기반의 고위력기를 쓰고, 특성까지 고려해 확정 1타를 노립니다. 야생 포켓몬도 숨겨진 특성을 가질 수 있습니다.',
  },
  {
    id: 'hard',
    label: '어려움',
    desc: '상대 레벨 +100, 모든 노력치 504. 고위력기와 변화기(능력 상승·상태이상·회복)를 함께 쓰고, 모든 포켓몬이 기술에 어울리는 도구를 지닙니다 (쓰러뜨려도 얻을 수 없음).',
  },
]

/** 난이도별 경험치 배율 */
export const DIFFICULTY_EXP: Record<Difficulty, number> = { easy: 1, normal: 1, hard: 1 }

/** 기술 선택 방식: random = 무작위, strong = 가장 강한 기술, smart = 특성까지 고려 */
export type AiMode = 'random' | 'strong' | 'smart'
export const DIFFICULTY_AI: Record<Difficulty, AiMode> = { easy: 'strong', normal: 'smart', hard: 'smart' }
/** 난이도별 상대 기술 선택 옵션 (보통 이상: 확정 1타 우선, 어려움: 변화기도 씀) */
export const DIFFICULTY_AI_OPTS: Record<Difficulty, ChooseOpts> = {
  easy: {},
  normal: { koPick: 'effect' },
  hard: { koPick: 'effect', status: true },
}

export type Stages = Partial<Record<StageKey, number>>

/** 전투 중에만 유지되는 상태 (전투마다 초기화) */
export interface Volatile {
  /** 바뀐 특성 (트레이스·미라 등) */
  ability?: string
  /** 바뀐 타입 (변환자재·변색) */
  types?: string[]
  /** 타오르는불꽃 발동 */
  flashFire?: boolean
  /** 끝낸 턴 수 (슬로스타트·가속) */
  turns?: number
  /** 게으름: 다음 턴은 쉼 */
  loaf?: boolean
  /** 변환자재·리베로를 이번 전투에서 사용함 */
  protean?: boolean
  /** 탈: 이미 벗겨짐 */
  busted?: boolean
  /** 구애 도구로 고정된 기술 */
  choice?: string
  /** 급소 랭크 보정 (크리티컬커터·랑사열매) */
  critBoost?: number
  /** 이펙트가드: 상대에 의한 능력 하락을 막는 남은 턴 수 */
  mist?: number
  /** 이번 턴 풀죽음 */
  flinch?: boolean
  /** 미클열매: 다음 기술 명중률 1.2배 */
  micle?: boolean
  /** 애슈열매: 이번 턴 먼저 행동 */
  custap?: boolean
  /** 메트로놈(도구): 마지막으로 쓴 기술과 연속 사용 횟수 */
  lastMove?: string
  streak?: number
  /** 곡예: 도구를 잃어 스피드 2배 */
  unburden?: boolean
  /** 다이월: 이번 턴 상대의 기술을 막음 */
  protect?: boolean
  /** 그림자꿰매기 등에 맞아 교체·도망 불가 (교체하면 풀림) */
  trapped?: boolean
  /** 2턴 기술: 힘을 모으는 중인 기술 (다음 턴 자동으로 사용) */
  charge?: string
  /** 공중날기·구멍파기·다이빙·섀도다이브: 화면에서 사라져 대부분의 기술이 맞지 않음 */
  semi?: Semi
  /** 이번 행동은 모아 둔 기술을 쓰는 턴 */
  releasing?: boolean
  /** 파괴광선 등: 다음 턴은 반동으로 움직일 수 없음 */
  recharge?: boolean
  /** 구르기·아이스볼: 연속으로 맞힌 횟수와 이어서 쓰는 기술 */
  rollout?: number
  rolloutMove?: string
  /** 이번 전투에서 기술을 쓴 적 있음 (속이기·만나자마자) */
  acted?: boolean
  /** 이번 전투에서 쓴 기술 (비장의무기) */
  used?: string[]
  /** 이번 전투에서 나무열매를 먹음 (트림) */
  ateBerry?: boolean
  /** 비축하기 횟수 (최대 3) */
  stockpile?: number
  /** 이번 턴 공격을 받음 (힘껏펀치) / 물리 공격을 받음 (트랩셸) */
  hurt?: boolean
  hurtPhys?: boolean
  /** 부리캐논: 이번 턴 부리를 가열 중 (접촉한 상대는 화상) */
  beak?: boolean
  /** 미래예지·파멸의소원: 남은 턴 수, 데미지, 기술 이름 */
  future?: { left: number; dmg: number; move: string }
  /** 멸망의노래: 남은 카운트 (0이 되면 쓰러짐) */
  perish?: number
  /** 길동무: 다음에 기술을 쓰기 전에 상대 공격으로 쓰러지면 상대도 쓰러짐 */
  destinyBond?: boolean
  /** 치유소원·초승달춤: 다음에 나오는 포켓몬의 HP·상태이상 회복 */
  wish?: boolean
}

/** 화면에서 사라진 상태: 하늘 / 땅속 / 물속 / 사라짐 */
export type Semi = 'sky' | 'dig' | 'dive' | 'shadow'

/** 상대가 알고 있는 이 포켓몬의 특성 정보 (자동 전투 AI 용) */
export interface AbilityIntel {
  /** 아직 가능성이 남은 특성 */
  cands: string[]
  /** 특성이 드러남 */
  known: boolean
}

/** 전투 계산에 필요한 한 마리의 상태 */
export interface Battler {
  name: string
  species: string
  level: number
  nature: string
  ivs: number[]
  evs: number[]
  hp: number
  moves: string[]
  stages: Stages
  /** 상태이상 */
  status?: Status | null
  /** 잠듦: 남은 턴 수 */
  sleep?: number
  /** 맹독: 지난 턴 수 (데미지 = n/16) */
  toxic?: number
  /** 특성 identifier */
  ability?: string | null
  /** 지닌 도구: identifier → 개수 (여러 종류·같은 도구 여러 개. 전투 중 쓰면 줄어듦) */
  held?: Record<string, number>
  vol?: Volatile
  /** 상대가 아는 이 포켓몬의 특성 정보 */
  intel?: AbilityIntel
  /** 테라스탈한 타입 */
  tera?: string | null
  /** 다이맥스 중 (최대 HP 2배) */
  dynamax?: boolean
  /** 실능치 배율 보정 (도감 완성 보너스: 0.1 = +10%) */
  boost?: number
}

export interface MoveData extends MoveInfo {
  num: number
  extra: MoveExtra
}

/** 기술이 없을 때 쓰는 발버둥 */
const STRUGGLE: MoveData = {
  id: 'struggle',
  ko: '발버둥',
  type: 'typeless',
  cls: 'physical',
  power: 50,
  acc: null,
  pp: null,
  num: 165,
  extra: { fl: ['contact'] },
}

let moveNumById: Map<string, number> | null = null
export function moveData(id: string): MoveData | null {
  if (id === 'struggle') return STRUGGLE
  const dex = dexData.value
  if (!dex) return null
  const info = dex.movesById[id]
  if (!info) return null
  if (!moveNumById) moveNumById = new Map(Object.entries(dex.moves).map(([n, m]) => [m.id, Number(n)]))
  const num = moveNumById.get(id) ?? 0
  return { ...info, num, extra: battleData.value?.moves[num] ?? {} }
}

/** 포켓몬 정보 (메가진화·원시회귀 폼 포함) */
export const speciesOf = (id: string): DexEntry | undefined => speciesEntry(id)

type StatSource = Pick<Battler, 'species' | 'level' | 'ivs' | 'evs' | 'nature'> & { boost?: number }
export function statsOf(b: StatSource): number[] {
  const sp = speciesOf(b.species)
  if (!sp) return [1, 1, 1, 1, 1, 1]
  return boostStats(calcStats(sp.stats, b.level, b.ivs, b.evs, b.nature, b.species), b.boost, b.species)
}
/** 실능치에 배율 보정 적용 (껍질몬의 HP 1은 그대로) */
export function boostStats(stats: number[], boost: number | undefined, species?: string): number[] {
  if (!boost) return stats
  return stats.map((v, i) => (i === 0 && species === 'shedinja' ? v : Math.floor(v * (1 + boost))))
}

/** 최대 HP (다이맥스 중이면 2배) */
export const maxHpOf = (b: StatSource & { dynamax?: boolean }) =>
  statsOf(b)[0]! * (b.dynamax ? 2 : 1)

// ---------- 특성 ----------
/** 지금 가진 특성 (바뀐 특성 우선) */
export const abilityOf = (b: Battler): string | null => b.vol?.ability ?? b.ability ?? null

/** 실제로 효과가 있는 특성. 상대가 화학변화가스면 없음 */
export function activeAbility(b: Battler, foe: Battler): string | null {
  const a = abilityOf(b)
  if (!a) return null
  // 특성가드: 화학변화가스의 영향을 받지 않음
  if (abilityOf(foe) === 'neutralizing-gas' && a !== 'neutralizing-gas' && !holds(b, 'ability-shield')) return null
  return a
}
const ab = activeAbility

// ---------- 날씨 ----------
/** 필드 날씨 (원작에서 날씨가 있는 장소: 비·모래바람·싸라기눈·안개). 장소마다 고정 */
export type Weather = 'rain' | 'sand' | 'hail' | 'fog'
export const WEATHER_LABELS: Record<Weather, string> = { rain: '비', sand: '모래바람', hail: '싸라기눈', fog: '안개' }
const WEATHER_START: Record<Weather, string> = {
  rain: '비가 계속 내리고 있다.',
  sand: '모래바람이 세차게 불고 있다.',
  hail: '싸라기눈이 계속 내리고 있다.',
  fog: '안개가 깊게 끼어 있다.',
}
let fieldWeather: Weather | null = null
/** 지금 싸우는 장소의 날씨 (게임 스토어가 현재 스테이지 기준으로 설정) */
export function setWeather(w: Weather | null) {
  fieldWeather = w
}
/** 실제로 적용되는 날씨 (날씨부정·에어록이면 없음) */
function weatherOf(x: Battler, y: Battler): Weather | null {
  if (!fieldWeather) return null
  for (const [a, b] of [[x, y], [y, x]] as const) {
    const t = ab(a, b)
    if (t === 'cloud-nine' || t === 'air-lock') return null
  }
  return fieldWeather
}
/** 날씨볼: 날씨에 따라 타입이 바뀌고 위력 2배 (안개는 노말 그대로) */
const WEATHER_BALL_TYPE: Record<Weather, string> = { rain: 'water', sand: 'rock', hail: 'ice', fog: 'normal' }
/** 날씨에서 반드시 맞는 기술 */
const WEATHER_SURE_HIT: Record<Weather, string[]> = { rain: ['thunder', 'hurricane', 'bleakwind-storm', 'wildbolt-storm', 'sandsear-storm'], sand: [], hail: ['blizzard'], fog: [] }
/** 맑음 이외의 날씨에서 위력이 절반인 기술 */
const SOLAR_MOVES = new Set(['solar-beam', 'solar-blade'])
/** 맑음 이외의 날씨에서 회복량이 1/4인 기술 */
const SUN_HEAL_MOVES = new Set(['moonlight', 'synthesis', 'morning-sun'])
/** 날씨 데미지를 받지 않는 특성 */
const WEATHER_DMG_IMMUNE: Record<'sand' | 'hail', string[]> = {
  sand: ['sand-veil', 'sand-rush', 'sand-force', 'overcoat'],
  hail: ['ice-body', 'snow-cloak', 'slush-rush', 'overcoat'],
}
const WEATHER_DMG_TYPES: Record<'sand' | 'hail', string[]> = { sand: ['rock', 'ground', 'steel'], hail: ['ice'] }
/** 방어 측 특성 (공격 측이 틀깨기 계열이면 무시, 특성가드면 무시되지 않음) */
function defAb(def: Battler, att: Battler): string | null {
  const d = ab(def, att)
  if (!d) return null
  const a = ab(att, def)
  if (a && BREAKERS.has(a) && !UNBREAKABLE.has(d) && !holds(def, 'ability-shield')) return null
  return d
}

// ---------- 지닌 도구 ----------
// 여러 종류를 함께 지닐 수 있고(서로 다른 도구의 배율은 곱연산), 같은 도구도 여러 개 지닐 수 있음:
// 같은 도구의 배율은 합연산(1.5배 2개 = 2배), 고정량·확률·랭크는 개수만큼, 소모형은 개수만큼 여러 번 발동
const itemKo = (id: string) => dexData.value?.items[id]?.ko ?? id
/** 그 도구를 지니고 있는지 (서투름과 관계없이) */
function holds(b: Battler, id: string): boolean {
  return (b.held?.[id] ?? 0) > 0
}
/** 지닌 도구 개수 합 */
export const heldTotal = (held: Record<string, number> | undefined | null): number =>
  Object.values(held ?? {}).reduce((a, n) => a + Math.max(0, n), 0)
const klutzed = (b: Battler, foe?: Battler) => (foe ? ab(b, foe) : abilityOf(b)) === 'klutz'
/** 효과가 있는 지닌 도구 목록 (서투름 특성이면 없음) */
function itemsOf(b: Battler, foe?: Battler): string[] {
  if (!b.held || klutzed(b, foe)) return []
  return Object.keys(b.held).filter((id) => b.held![id]! > 0)
}
/** 효과가 있는 그 도구의 개수 (서투름 특성이면 0) */
function nItem(b: Battler, id: string, foe?: Battler): number {
  const n = b.held?.[id] ?? 0
  return n > 0 && !klutzed(b, foe) ? n : 0
}
/** 같은 도구 n개의 배율 (합연산): 1.5배 2개 = 2배. 1보다 작은 배율은 나누는 값을 합연산 (0.5배 2개 = 1/3배) */
export function stackMult(m: number, n: number): number {
  if (n <= 0) return 1
  return m >= 1 ? 1 + (m - 1) * n : 1 / (1 + (1 / m - 1) * n)
}
/** 그 도구 배율 (지닌 개수 반영, 없으면 1) */
const itemMult = (b: Battler, id: string, m: number, foe?: Battler) => stackMult(m, nItem(b, id, foe))
/** 조건에 맞는 도구들의 개수 합 */
const nItems = (b: Battler, foe: Battler | undefined, test: (id: string) => boolean) =>
  itemsOf(b, foe).reduce((a, id) => a + (test(id) ? b.held![id]! : 0), 0)
const isBerry = (id: string) => id.endsWith('-berry')
/** 한 번 쓰면 사라지는 도구 (나무열매·주얼 외) */
const SINGLE_USE_ITEMS = new Set([
  'focus-sash', 'air-balloon', 'white-herb', 'mental-herb', 'power-herb', 'mirror-herb', 'weakness-policy',
  'blunder-policy', 'throat-spray', 'adrenaline-orb', 'absorb-bulb', 'cell-battery', 'snowball', 'luminous-moss',
  'red-card', 'eject-button', 'eject-pack', 'room-service', 'booster-energy',
  'electric-seed', 'grassy-seed', 'misty-seed', 'psychic-seed',
])
/** 소모성 도구인지 (아니면 지속형) */
export const isConsumableItem = (id: string) => isBerry(id) || id.endsWith('-gem') || SINGLE_USE_ITEMS.has(id)
/** 열매를 먹을 수 있는지 (상대가 긴장감이면 없음) */
function canEat(b: Battler, foe?: Battler): boolean {
  return !foe || !UNNERVE.has(ab(foe, b) ?? '')
}
/** 도구 1개 사용 후 사라짐. 볼주머니: 열매를 먹으면 HP 1/3 회복, 곡예: 도구가 모두 사라지면 스피드 2배 */
function consumeItem(b: Battler, id: string, foe: Battler | undefined, log: string[]) {
  if (!takeHeld(b, id)) return
  if (isBerry(id)) (b.vol ??= {}).ateBerry = true
  const a = foe ? ab(b, foe) : abilityOf(b)
  if (a === 'unburden' && !heldTotal(b.held)) (b.vol ??= {}).unburden = true
  if (isBerry(id) && a === 'cheek-pouch' && b.hp > 0 && b.hp < maxHpOf(b)) {
    announce(b, log)
    heal(b, Math.floor(maxHpOf(b) / 3))
    log.push(`${josa(b.name, '은', '는')} 체력을 회복했다!`)
  }
}
/** 지닌 도구 1개를 없앰 (효과 없이). 없앴으면 true */
export function takeHeld(b: Pick<Battler, 'held'>, id: string): boolean {
  const n = b.held?.[id] ?? 0
  if (n <= 0) return false
  if (n === 1) delete b.held![id]
  else b.held![id] = n - 1
  return true
}
/** 진화할 수 있는 포켓몬인지 (진화의휘석) */
const canEvolve = (species: string) => evolutionsOf(species).length > 0
/** 기술을 고를 수 있는지 (구애 도구로 고정 / 돌격조끼면 변화기 불가) */
export function selectableMoves(b: Battler, moves: string[]): string[] {
  let list = moves
  if (nItem(b, 'assault-vest')) list = list.filter((id) => moveData(id)?.cls !== 'status')
  // 다이맥스 중에는 구애 도구 고정이 풀림
  const lock = b.dynamax ? undefined : b.vol?.choice
  if (lock && itemsOf(b).some((id) => CHOICE_ITEMS.has(id)) && list.includes(lock)) list = [lock]
  return list
}

/** 특성 발동 표시. 상대에게 특성이 드러남 */
function announce(b: Battler, log: string[]) {
  const a = abilityOf(b)
  if (!a) return
  log.push(`[${b.name}의 ${abilityName(a)}]`)
  if (b.intel) b.intel.known = true
}

/** 특성 후보 중 지금 관찰한 결과와 맞지 않는 것을 제외 (test = 이 후보였다면 다른 일이 일어났는지) */
function ruleOut(b: Battler, test: (cand: Battler) => boolean, base: Battler = b) {
  const it = b.intel
  if (!it || it.known) return
  const left = it.cands.filter((c) => !test(withAbility(base, c)))
  // 모순(관찰과 맞는 후보가 없음)이면 정보를 버리지 않고 그대로 둠
  if (left.length) it.cands = left
}
const withAbility = (b: Battler, a: string | null): Battler => ({ ...b, ability: a, vol: { ...b.vol, ability: undefined } })

/** 타입 (테라스탈 > 변환자재 등으로 바뀐 타입 > 원래 타입) */
export const typesOf = (b: Battler): string[] => (b.tera ? [b.tera] : (b.vol?.types ?? speciesOf(b.species)?.types ?? []))
/** 테라스탈 전 타입 (자속 보정 판정) */
const baseTypesOf = (b: Battler): string[] => b.vol?.types ?? speciesOf(b.species)?.types ?? []

/**
 * 자속 보정 (적응력 반영). 테라스탈: 테라스탈 타입 기술 1.5배, 원래 타입과도 같으면 2배,
 * 원래 타입 기술은 테라스탈해도 1.5배 유지
 */
function stabOf(att: Battler, type: string, a: string | null): number {
  if (type === 'typeless') return 1
  const orig = baseTypesOf(att).includes(type)
  const adapt = a === 'adaptability'
  if (att.tera && att.tera === type) return orig ? (adapt ? 2.25 : 2) : adapt ? 2 : 1.5
  return orig ? (adapt ? 2 : 1.5) : 1
}
const typeKo = (t: string) => dexData.value?.types[t] ?? t
const hasFlag = (m: MoveData, f: MoveFlag) => !!m.extra.fl?.includes(f)

// ---------- 랭크 ----------
const STAT_INDEX = { atk: 1, def: 2, spa: 3, spd: 4, spe: 5 } as const
const stageMult = (s: number) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s))
const accStageMult = (s: number) => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s))

function effStat(b: Battler, key: keyof typeof STAT_INDEX, ignore?: 'neg' | 'pos' | 'all'): number {
  const raw = statsOf(b)[STAT_INDEX[key]]!
  let s = b.stages[key] ?? 0
  if (ignore === 'all' || (ignore === 'neg' && s < 0) || (ignore === 'pos' && s > 0)) s = 0
  return Math.floor(raw * stageMult(s))
}

/** 스피드 (마비 시 절반, 속보·슬로스타트 반영) */
export function speedOf(b: Battler, foe?: Battler): number {
  const a = foe ? ab(b, foe) : abilityOf(b)
  let s = effStat(b, 'spe')
  if (a === 'quick-feet' && b.status) s = Math.floor(s * 1.5)
  else if (b.status === 'par') s = Math.floor(s * 0.5)
  if (a === 'slow-start' && (b.vol?.turns ?? 0) < 5) s = Math.floor(s * 0.5)
  if (a === 'unburden' && b.vol?.unburden && !heldTotal(b.held)) s *= 2
  // 날씨: 쓱쓱·모래헤치기·눈치우기
  const w = foe ? weatherOf(b, foe) : null
  if ((w === 'rain' && a === 'swift-swim') || (w === 'sand' && a === 'sand-rush') || (w === 'hail' && a === 'slush-rush')) s *= 2
  for (const id of itemsOf(b, foe)) {
    const n = b.held![id]!
    if (id === 'choice-scarf') s = Math.floor(s * stackMult(1.5, n))
    else if (SLOW_ITEMS.has(id)) s = Math.floor(s * stackMult(0.5, n))
    else if (id === 'quick-powder' && b.species === 'ditto') s = Math.floor(s * stackMult(2, n))
  }
  return s
}

// ---------- 상성 ----------
/** 기본 타입 상성 (특성 제외) */
export function typeEffect(moveType: string, defender: Battler): number {
  const chart = battleData.value?.types[moveType]
  return typesOf(defender).reduce((m, t) => m * (chart?.[t] ?? 1), 1)
}

/** 실제 기술 타입과 위력 배율 (노말스킨·스카이스킨 등) */
function moveTypeOf(att: Battler, def: Battler, m: MoveData): { type: string; pow: number } {
  if (m.type === 'typeless') return { type: m.type, pow: 1 }
  if (m.id === 'natural-gift') {
    const b = giftBerry(att, def)
    return { type: b ? (NATURAL_GIFT[b]?.[0] ?? 'normal') : 'normal', pow: 1 }
  }
  const w = weatherOf(att, def)
  if (m.id === 'weather-ball' && w) return { type: WEATHER_BALL_TYPE[w], pow: 2 }
  const a = ab(att, def)
  if (a === 'normalize') return { type: 'normal', pow: 1.2 }
  if (a && SKIN[a] && m.type === 'normal') return { type: SKIN[a]!, pow: 1.2 }
  if (a === 'liquid-voice' && hasFlag(m, 'sound')) return { type: 'water', pow: 1 }
  return { type: m.type, pow: 1 }
}

/** 상성 배율 (배짱·심안: 노말·격투 기술로 고스트 타입 공격 가능) */
function effOf(att: Battler, def: Battler, type: string): number {
  if (type === 'typeless') return 1
  const chart = battleData.value?.types[type]
  const a = ab(att, def)
  const scrappy = (a === 'scrappy' || a === 'minds-eye') && (type === 'normal' || type === 'fighting')
  // 겨냥표적: 타입 무효 없음 / 검은철구: 땅 타입 기술이 비행 타입에게 맞음
  const grounded = !!nItem(def, 'iron-ball', att) && type === 'ground'
  const target = !!nItem(def, 'ring-target', att)
  return typesOf(def).reduce((acc, t) => {
    const x = chart?.[t] ?? 1
    const ignore = x === 0 && ((scrappy && t === 'ghost') || target || (grounded && t === 'flying'))
    return acc * (ignore ? 1 : x)
  }, 1)
}

const isDamaging = (m: MoveData) => m.cls !== 'status' && (m.power != null || m.extra.fixed != null || VAR_POWER.has(m.id))
/** 자신(또는 필드)에게 쓰는 변화기 */
const isSelfMove = (m: MoveData) =>
  m.cls === 'status' && (!!(m.extra.self || (m.extra.heal && !m.extra.stats)) || SELF_STATUS.has(m.id))

// ---------- 특수한 기술 ----------
/** 위력이 상황에 따라 정해지는 공격기 (데이터에 위력이 없음) */
const VAR_POWER = new Set(['spit-up', 'natural-gift', 'fling', 'final-gambit'])
/** 상대를 대상으로 하지 않는 변화기 */
const SELF_STATUS = new Set(['rest', 'destiny-bond', 'perish-song', 'healing-wish', 'lunar-dance', 'sleep-talk', 'stockpile', 'swallow'])
/** 쓴 다음 턴은 반동으로 움직일 수 없는 기술 */
export const RECHARGE_MOVES = new Set([
  'hyper-beam', 'giga-impact', 'blast-burn', 'frenzy-plant', 'hydro-cannon', 'rock-wrecker', 'roar-of-time',
  'prismatic-laser', 'eternabeam', 'meteor-assault',
])
/** 2턴 기술: 첫 턴에 힘을 모으고 다음 턴에 공격 */
export const CHARGE_MOVES: Record<string, { msg: string; semi?: Semi; stats?: [StageKey, number][] }> = {
  'solar-beam': { msg: '빛을 흡수했다!' },
  'solar-blade': { msg: '빛을 흡수했다!' },
  'skull-bash': { msg: '목을 움츠렸다!', stats: [['def', 1]] },
  'razor-wind': { msg: '주위의 공기를 소용돌이치게 했다!' },
  'sky-attack': { msg: '강렬한 빛에 휩싸였다!' },
  'freeze-shock': { msg: '차가운 빛에 휩싸였다!' },
  'ice-burn': { msg: '얼어붙는 공기에 휩싸였다!' },
  geomancy: { msg: '파워를 모으고 있다!' },
  'meteor-beam': { msg: '우주의 힘이 넘쳐흐른다!', stats: [['spa', 1]] },
  'electro-shot': { msg: '전기를 모았다!', stats: [['spa', 1]] },
  fly: { msg: '하늘 높이 날아올랐다!', semi: 'sky' },
  bounce: { msg: '높이 뛰어올랐다!', semi: 'sky' },
  'sky-drop': { msg: '하늘 높이 날아올랐다!', semi: 'sky' },
  dig: { msg: '땅으로 파고들었다!', semi: 'dig' },
  dive: { msg: '물속으로 숨었다!', semi: 'dive' },
  'shadow-force': { msg: '순식간에 모습을 감췄다!', semi: 'shadow' },
  'phantom-force': { msg: '순식간에 모습을 감췄다!', semi: 'shadow' },
}
/** 사라진 상대에게도 맞는 기술 (double = 위력 2배) */
const SEMI_HIT: Record<Semi, { hit: string[]; double: string[] }> = {
  sky: { hit: ['gust', 'twister', 'thunder', 'sky-uppercut', 'hurricane', 'smack-down', 'thousand-arrows'], double: ['gust', 'twister'] },
  dig: { hit: ['earthquake', 'magnitude', 'fissure'], double: ['earthquake', 'magnitude'] },
  dive: { hit: ['surf', 'whirlpool'], double: ['surf', 'whirlpool'] },
  shadow: { hit: [], double: [] },
}
/** 쓰면 자신이 쓰러지는 공격기 (축축 특성이면 쓸 수 없음) */
export const SELF_KO_MOVES = new Set(['explosion', 'self-destruct', 'misty-explosion'])
/** 쓰면 자신의 최대 HP 절반을 잃는 기술 */
const HALF_COST_MOVES = new Set(['steel-beam', 'mind-blown', 'chloroblast'])
/** 2턴 뒤에 맞는 기술 */
const FUTURE_MOVES = new Set(['future-sight', 'doom-desire'])
/** 맞힌 상대를 풀죽게 하는 확률 (%) */
const FLINCH_MOVES: Record<string, number> = { 'fake-out': 100, snore: 30 }
/** 행동 전에 준비하는 기술 (우선도 -3): 턴 시작 시 문구 */
const PREP_MOVES: Record<string, string> = {
  'focus-punch': '집중력을 높이고 있다!',
  'shell-trap': '트랩셸을 설치했다!',
  'beak-blast': '부리를 가열하기 시작했다!',
}
/** 잠꼬대로 나오지 않는 기술 */
const NO_SLEEP_TALK = new Set(['sleep-talk', 'focus-punch', 'shell-trap', 'beak-blast', 'belch', 'struggle', ...Object.keys(CHARGE_MOVES)])

/** 자연의은혜: 나무열매 → [타입, 위력] (목록에 없는 열매는 노말 80) */
const NATURAL_GIFT: Record<string, [string, number]> = {
  'cheri-berry': ['fire', 80], 'chesto-berry': ['water', 80], 'pecha-berry': ['electric', 80], 'rawst-berry': ['grass', 80],
  'aspear-berry': ['ice', 80], 'leppa-berry': ['fighting', 80], 'oran-berry': ['poison', 80], 'persim-berry': ['ground', 80],
  'lum-berry': ['flying', 80], 'sitrus-berry': ['psychic', 80], 'figy-berry': ['bug', 80], 'wiki-berry': ['rock', 80],
  'mago-berry': ['ghost', 80], 'aguav-berry': ['dragon', 80], 'iapapa-berry': ['dark', 80],
  'occa-berry': ['fire', 80], 'passho-berry': ['water', 80], 'wacan-berry': ['electric', 80], 'rindo-berry': ['grass', 80],
  'yache-berry': ['ice', 80], 'chople-berry': ['fighting', 80], 'kebia-berry': ['poison', 80], 'shuca-berry': ['ground', 80],
  'coba-berry': ['flying', 80], 'payapa-berry': ['psychic', 80], 'tanga-berry': ['bug', 80], 'charti-berry': ['rock', 80],
  'kasib-berry': ['ghost', 80], 'haban-berry': ['dragon', 80], 'colbur-berry': ['dark', 80], 'babiri-berry': ['steel', 80],
  'chilan-berry': ['normal', 80], 'roseli-berry': ['fairy', 80],
  'liechi-berry': ['grass', 100], 'ganlon-berry': ['ice', 100], 'salac-berry': ['fighting', 100], 'petaya-berry': ['poison', 100],
  'apicot-berry': ['ground', 100], 'lansat-berry': ['flying', 100], 'starf-berry': ['psychic', 100], 'enigma-berry': ['bug', 100],
  'micle-berry': ['rock', 100], 'custap-berry': ['ghost', 100], 'jaboca-berry': ['dragon', 100], 'rowap-berry': ['dark', 100],
}
/** 내던지기: 도구 → 위력 (목록에 없는 도구는 30, 나무열매는 10) */
const FLING_POWER: Record<string, number> = {
  'iron-ball': 130, 'hard-stone': 100, 'rare-bone': 100, 'room-service': 100, 'thick-club': 90,
  'assault-vest': 80, 'quick-claw': 80, 'sticky-barb': 80, 'weakness-policy': 80, 'blunder-policy': 80,
  'poison-barb': 70, 'dragon-fang': 70, 'rocky-helmet': 60, eviolite: 40,
  'power-herb': 10, 'white-herb': 10, 'mental-herb': 10, 'choice-band': 10, 'choice-specs': 10, 'choice-scarf': 10,
  'focus-sash': 10, leftovers: 10, 'expert-belt': 10, 'air-balloon': 10,
}
/** 내던지기로 맞힌 상대에게 거는 상태이상 */
const FLING_STATUS: Record<string, Status> = { 'flame-orb': 'brn', 'toxic-orb': 'tox', 'light-ball': 'par', 'poison-barb': 'psn' }

/** 자연의은혜에 쓰는 나무열매 (없으면 undefined) */
function giftBerry(b: Battler, foe: Battler): string | undefined {
  if (klutzed(b, foe)) return undefined
  return itemsOf(b, foe).find(isBerry)
}
/** 내던지기로 던지는 도구 (없으면 undefined) */
function flingItem(b: Battler, foe: Battler): string | undefined {
  if (klutzed(b, foe)) return undefined
  return itemsOf(b, foe)[0]
}
/** 상황에 따라 정해지는 위력 (해당 없으면 null) */
function variablePower(att: Battler, def: Battler, m: MoveData): number | null {
  const vol = att.vol ?? {}
  switch (m.id) {
    case 'spit-up':
      return 100 * (vol.stockpile ?? 0)
    case 'natural-gift': {
      const b = giftBerry(att, def)
      return b ? (NATURAL_GIFT[b]?.[1] ?? 80) : 0
    }
    case 'fling': {
      const it = flingItem(att, def)
      return it ? (FLING_POWER[it] ?? (isBerry(it) ? 10 : 30)) : 0
    }
    case 'rollout':
    case 'ice-ball':
      return (m.power ?? 30) * 2 ** Math.min(4, vol.rolloutMove === m.id ? (vol.rollout ?? 0) : 0)
  }
  return null
}

/** 쓸 수 없는 상황이면 실패 문구 (쓸 수 있으면 null). prevMove = 직전에 쓴 기술 */
function failReason(att: Battler, def: Battler, m: MoveData, prevMove: string | undefined): string | null {
  const vol = att.vol ?? {}
  const fail = '그러나 실패했다!'
  const noEffect = `${def.name}에게는 효과가 없는 것 같다…`
  switch (m.id) {
    case 'dream-eater':
      return def.status === 'slp' || ab(def, att) === 'comatose' ? null : noEffect
    case 'fake-out':
    case 'first-impression':
      return vol.acted ? fail : null
    case 'last-resort': {
      const others = att.moves.filter((id) => id !== 'last-resort')
      return others.length && others.every((id) => vol.used?.includes(id)) ? null : fail
    }
    case 'belch':
      return vol.ateBerry ? null : fail
    case 'snore':
    case 'sleep-talk':
      return att.status === 'slp' || ab(att, def) === 'comatose' ? null : fail
    case 'spit-up':
    case 'swallow':
      return vol.stockpile ? null : fail
    case 'stockpile':
      return (vol.stockpile ?? 0) >= 3 ? fail : null
    case 'synchronoise':
      return typesOf(def).some((t) => typesOf(att).includes(t)) ? null : noEffect
    case 'burn-up':
      return typesOf(att).includes('fire') ? null : fail
    case 'double-shock':
      return typesOf(att).includes('electric') ? null : fail
    case 'natural-gift':
      return giftBerry(att, def) ? null : fail
    case 'fling':
      return flingItem(att, def) ? null : fail
    case 'rest': {
      const a = ab(att, def)
      if (att.hp >= maxHpOf(att) || att.status === 'slp' || a === 'insomnia' || a === 'vital-spirit' || a === 'comatose') return fail
      return null
    }
    case 'destiny-bond':
      return prevMove === 'destiny-bond' ? fail : null
    case 'future-sight':
    case 'doom-desire':
      return def.vol?.future ? fail : null
    case 'perish-song':
      return att.vol?.perish != null && def.vol?.perish != null ? fail : null
  }
  return null
}
/** 축축: 자폭 계열·깜짝헤드를 쓸 수 없음 */
const dampBlocks = (att: Battler, def: Battler, m: MoveData) =>
  (SELF_KO_MOVES.has(m.id) || m.id === 'mind-blown') && (ab(att, def) === 'damp' || defAb(def, att) === 'damp')
/** 2턴 기술을 모으지 않고 바로 쓰는지 (비가 올 때 일렉트로빔) */
const chargeSkipped = (att: Battler, def: Battler, m: MoveData) => m.id === 'electro-shot' && weatherOf(att, def) === 'rain'
/** 회복 기술 (힐링시프트 대상) */
const isHealMove = (m: MoveData) => !!m.extra.heal || (m.extra.drain ?? 0) > 0
/** 부가 효과가 있는 공격기 (우격다짐 대상) */
const hasSecondary = (m: MoveData) =>
  m.cls !== 'status' && (!!m.extra.ail || !!m.extra.trap || (!!m.extra.stats && m.extra.chance != null))

/** 우선도 (짓궂은마음·질풍날개·힐링시프트 반영) */
export function priorityOf(att: Battler, def: Battler, m: MoveData): number {
  const a = ab(att, def)
  let p = m.extra.pri ?? 0
  if (a === 'prankster' && m.cls === 'status') p += 1
  if (a === 'gale-wings' && m.type === 'flying' && att.hp >= maxHpOf(att)) p += 1
  if (a === 'triage' && isHealMove(m)) p += 3
  return p
}

/** 기술이 막히는 이유. null = 막히지 않음 */
type Block = { by: 'type' } | { by: 'ability'; fx?: AbsorbFx } | { by: 'dark' } | { by: 'item'; item: string }
type AbsorbFx = (typeof ABSORB)[string][1]
function blockOf(att: Battler, def: Battler, m: MoveData, type: string, eff: number): Block | null {
  if (isSelfMove(m)) return null
  const d = defAb(def, att)
  if (nItem(def, 'air-balloon', att) && type === 'ground' && isDamaging(m)) return { by: 'item', item: 'air-balloon' }
  if (nItem(def, 'safety-goggles', att) && hasFlag(m, 'powder')) return { by: 'item', item: 'safety-goggles' }
  const ironBall = !!nItem(def, 'iron-ball', att)
  if (d) {
    const abs = ABSORB[d]
    // 부유는 공격기만 막음 (검은철구를 지니면 막지 못함)
    if (abs && abs[0] === type && (d !== 'levitate' || (isDamaging(m) && !ironBall))) return { by: 'ability', fx: abs[1] }
    if (d === 'wind-rider' && hasFlag(m, 'wind')) return { by: 'ability', fx: { stat: 'atk', n: 1 } }
    if (d === 'wonder-guard' && isDamaging(m) && type !== 'typeless' && eff <= 1) return { by: 'ability' }
    if (FLAG_IMMUNE[d] && hasFlag(m, FLAG_IMMUNE[d]!)) return { by: 'ability' }
    if (d === 'good-as-gold' && m.cls === 'status') return { by: 'ability' }
    if (PRIORITY_BLOCK.has(d) && priorityOf(att, def, m) > 0) return { by: 'ability' }
  }
  if (ab(att, def) === 'prankster' && m.cls === 'status' && typesOf(def).includes('dark')) return { by: 'dark' }
  if (isDamaging(m) && eff === 0) return { by: 'type' }
  return null
}

/** 방어 측 특성의 데미지 배율 (d = 방어 측 특성) */
function defMult(d: string | null, def: Battler, m: MoveData, type: string, eff: number): number {
  if (!d) return 1
  const physical = m.cls === 'physical'
  switch (d) {
    case 'thick-fat':
      return type === 'fire' || type === 'ice' ? 0.5 : 1
    case 'heatproof':
    case 'water-bubble':
      return type === 'fire' ? 0.5 : 1
    case 'purifying-salt':
      return type === 'ghost' ? 0.5 : 1
    case 'filter':
    case 'solid-rock':
    case 'prism-armor':
      return eff > 1 ? 0.75 : 1
    case 'multiscale':
    case 'shadow-shield':
      return def.hp >= maxHpOf(def) ? 0.5 : 1
    case 'ice-scales':
      return m.cls === 'special' ? 0.5 : 1
    case 'fluffy':
      return (hasFlag(m, 'contact') ? 0.5 : 1) * (type === 'fire' ? 2 : 1)
    case 'punk-rock':
      return hasFlag(m, 'sound') ? 0.5 : 1
    case 'dry-skin':
      return type === 'fire' ? 1.25 : 1
    case 'fur-coat':
      return physical ? 0.5 : 1
    case 'marvel-scale':
      return physical && def.status ? 2 / 3 : 1
    default:
      return 1
  }
}

// ---------- 데미지 ----------
export interface DamageOpts {
  /** 이번 턴에 나중에 행동 (애널라이즈) */
  last?: boolean
}

/** 한 타의 데미지. rand: 85~100, crit: 급소 여부 */
export function damageOf(att: Battler, def: Battler, m: MoveData, rand: number, crit: boolean, opts: DamageOpts = {}): number {
  const { type, pow } = moveTypeOf(att, def, m)
  const eff = effOf(att, def, type)
  if (eff === 0) return 0
  const fx = m.extra.fixed
  if (fx != null) return fx === 'level' ? att.level : fx === 'half' ? Math.max(1, Math.floor(def.hp / 2)) : fx
  // 목숨걸기: 자신의 남은 HP만큼
  if (m.id === 'final-gambit') return Math.max(1, att.hp)
  const a = ab(att, def)
  const d = defAb(def, att)
  const physical = m.cls === 'physical'

  // 위력 (테라스탈 타입 기술은 위력 60 미만이면 60, 연속기·선제기 제외)
  let basePower = variablePower(att, def, m) ?? m.power ?? 0
  // 사라진 상대에게 맞는 기술: 위력 2배 (공중날기 중에 회오리 등)
  const semi = def.vol?.semi
  if (semi && SEMI_HIT[semi].double.includes(m.id)) basePower *= 2
  if (att.tera === type && m.power != null && basePower < 60 && !m.extra.hits && (m.extra.pri ?? 0) <= 0) basePower = 60
  let power = basePower * pow
  if (a === 'technician' && (m.power ?? 0) <= 60) power *= 1.5
  if (a && FLAG_POWER[a] && hasFlag(m, FLAG_POWER[a]![0])) power *= FLAG_POWER[a]![1]
  if (a && TYPE_POWER[a] && TYPE_POWER[a]![0] === type) power *= TYPE_POWER[a]![1]
  if (a === 'reckless' && (m.extra.drain ?? 0) < 0) power *= 1.2
  if (a === 'sheer-force' && hasSecondary(m)) power *= 1.3
  if (a === 'analytic' && opts.last) power *= 1.3
  // 날씨: 솔라빔 위력 절반 / 모래바람의 모래의힘
  const w = weatherOf(att, def)
  if (w && SOLAR_MOVES.has(m.id)) power *= 0.5
  if (w === 'sand' && a === 'sand-force' && (type === 'rock' || type === 'ground' || type === 'steel')) power *= 1.3
  // 도구: 타입 강화·전용 구슬·주얼·힘의머리띠·박식안경·펀치글러브
  // (주얼은 소모형이라 여러 개여도 한 번에 하나만 1.3배)
  let gem = false
  for (const id of itemsOf(att, def)) {
    const n = att.held![id]!
    if (TYPE_BOOST[id] === type) power *= stackMult(1.2, n)
    const orb = ORBS[id]
    if (orb && orb.species.includes(att.species) && orb.types.includes(type)) power *= stackMult(1.2, n)
    if (GEMS[id] === type && !gem) {
      power *= 1.3
      gem = true
    }
    if (id === 'muscle-band' && physical) power *= stackMult(1.1, n)
    if (id === 'wise-glasses' && m.cls === 'special') power *= stackMult(1.1, n)
    if (id === 'punching-glove' && hasFlag(m, 'punch')) power *= stackMult(1.1, n)
  }
  power = Math.max(1, Math.floor(power))

  // 공격·방어 (천진: 상대 랭크 무시, 급소: 불리한 랭크 무시)
  const atkIgnore = d === 'unaware' ? 'all' : crit ? 'neg' : undefined
  const defIgnore = a === 'unaware' ? 'all' : crit ? 'pos' : undefined
  let A = effStat(att, physical ? 'atk' : 'spa', atkIgnore)
  let D = effStat(def, physical ? 'def' : 'spd', defIgnore)
  const maxHp = maxHpOf(att)
  if (physical) {
    if (a === 'huge-power' || a === 'pure-power') A *= 2
    if (a === 'hustle' || a === 'gorilla-tactics') A *= 1.5
    if (a === 'guts' && att.status) A *= 1.5
    if (a === 'toxic-boost' && (att.status === 'psn' || att.status === 'tox')) A *= 1.5
    if (a === 'slow-start' && (att.vol?.turns ?? 0) < 5) A *= 0.5
  } else if (a === 'flare-boost' && att.status === 'brn') A *= 1.5
  if (a === 'defeatist' && att.hp * 2 <= maxHp) A *= 0.5
  if (a && PINCH[a] === type && att.hp * 3 <= maxHp) A *= 1.5
  if (att.vol?.flashFire && type === 'fire' && a === 'flash-fire') A *= 1.5
  // 재앙 특성: 자신 이외의 능력 0.75배
  const dRaw = ab(def, att)
  if (dRaw === (physical ? 'tablets-of-ruin' : 'vessel-of-ruin') && a !== dRaw) A *= 0.75
  if (a === (physical ? 'sword-of-ruin' : 'beads-of-ruin') && dRaw !== a) D *= 0.75
  // 도구: 구애머리띠·구애안경·전용 도구 / 진화의휘석·돌격조끼·전용 도구
  A *= itemMult(att, physical ? 'choice-band' : 'choice-specs', 1.5, def)
  if (att.species.startsWith('pikachu')) A *= itemMult(att, 'light-ball', 2, def)
  if (physical && (att.species.startsWith('cubone') || att.species.startsWith('marowak'))) A *= itemMult(att, 'thick-club', 2, def)
  if (!physical && att.species === 'clamperl') A *= itemMult(att, 'deep-sea-tooth', 2, def)
  if (canEvolve(def.species)) D *= itemMult(def, 'eviolite', 1.5, att)
  if (!physical) D *= itemMult(def, 'assault-vest', 1.5, att)
  if (!physical && def.species === 'clamperl') D *= itemMult(def, 'deep-sea-scale', 2, att)
  // 모래바람: 바위 타입 특수방어 1.5배
  if (!physical && w === 'sand' && typesOf(def).includes('rock')) D *= 1.5
  if (physical && def.species === 'ditto') D *= itemMult(def, 'metal-powder', 2, att)
  A = Math.max(1, Math.floor(A))
  D = Math.max(1, Math.floor(D))

  let dmg = Math.floor(Math.floor((Math.floor((2 * att.level) / 5 + 2) * power * A) / D) / 50) + 2
  // 비: 물 기술 1.5배, 불꽃 기술 절반
  if (w === 'rain' && type === 'water') dmg = Math.floor(dmg * 1.5)
  if (w === 'rain' && type === 'fire') dmg = Math.floor(dmg * 0.5)
  if (crit) dmg = Math.floor(dmg * (a === 'sniper' ? 2.25 : 1.5))
  dmg = Math.floor((dmg * rand) / 100)
  const stab = stabOf(att, type, a)
  if (stab !== 1) dmg = Math.floor(dmg * stab)
  dmg = Math.floor(dmg * eff)
  if (a === 'tinted-lens' && eff < 1) dmg = Math.floor(dmg * 2)
  // 화상: 물리 데미지 절반 (근성은 제외)
  if (physical && att.status === 'brn' && a !== 'guts') dmg = Math.floor(dmg / 2)
  dmg = Math.floor(dmg * defMult(d, def, m, type, eff))
  // 도구: 달인의띠·생명의구슬·메트로놈 / 반감 열매
  if (eff > 1) dmg = Math.floor(dmg * itemMult(att, 'expert-belt', 1.2, def))
  dmg = Math.floor(dmg * itemMult(att, 'life-orb', 1.3, def))
  dmg = Math.floor(dmg * itemMult(att, 'metronome', Math.min(2, 1 + 0.2 * (att.vol?.streak ?? 0)), def))
  if (resistBerryOf(att, def, type, eff)) dmg = Math.floor(dmg / 2)
  return Math.max(1, dmg)
}

/** 이번 공격에 발동하는 반감 열매 (없으면 undefined) */
function resistBerryOf(att: Battler, def: Battler, type: string, eff: number): string | undefined {
  if (!canEat(def, att)) return undefined
  return itemsOf(def, att).find((id) => {
    const t = RESIST_BERRY[id]
    return t === type && (eff > 1 || t === 'normal')
  })
}

function avgHits(att: Battler, def: Battler, m: MoveData) {
  const h = m.extra.hits
  if (!h) return 1
  if (ab(att, def) === 'skill-link') return h[1]
  // 2~5회: 2·3회 35%, 4·5회 15% (속임수주사위: 4~5회)
  if (h[0] === 2 && h[1] === 5) return nItem(att, 'loaded-dice', def) ? 4.5 : 3.1
  return (h[0] + h[1]) / 2
}

/** 명중률 (0~1). last = 이번 턴에 나중에 행동 (포커스렌즈) */
function accuracyOf(att: Battler, def: Battler, m: MoveData, last = false): number {
  const a = ab(att, def)
  const d = defAb(def, att)
  if (a === 'no-guard' || ab(def, att) === 'no-guard' || m.acc == null) return 1
  const w = weatherOf(att, def)
  if (w && WEATHER_SURE_HIT[w].includes(m.id)) return 1
  const accStage = d === 'unaware' ? 0 : (att.stages.acc ?? 0)
  const evaStage = a === 'unaware' || a === 'keen-eye' || a === 'minds-eye' || a === 'illuminate' ? 0 : (def.stages.eva ?? 0)
  let acc = (m.acc / 100) * accStageMult(accStage - evaStage)
  if (a === 'compound-eyes') acc *= 1.3
  if (a === 'victory-star') acc *= 1.1
  if (a === 'hustle' && m.cls === 'physical') acc *= 0.8
  if (d === 'wonder-skin' && m.cls === 'status') acc = Math.min(acc, 0.5)
  // 날씨: 안개 명중률 0.6배 / 모래숨기·눈숨기 회피
  if (w === 'fog') acc *= 0.6
  if ((w === 'sand' && d === 'sand-veil') || (w === 'hail' && d === 'snow-cloak')) acc *= 0.8
  acc *= itemMult(att, 'wide-lens', 1.1, def)
  if (last) acc *= itemMult(att, 'zoom-lens', 1.2, def)
  if (att.vol?.micle) acc *= 1.2
  for (const id of itemsOf(def, att)) if (EVASION_ITEMS.has(id)) acc *= stackMult(0.9, def.held![id]!)
  return Math.min(1, acc)
}

/**
 * 화면 표시용 실제 명중률 (0~1, 명중 판정이 없는 기술은 null).
 * 상대 특성은 드러났을 때만, 상대 도구는 foeItems 일 때만 반영 (포커스렌즈처럼 행동 순서에 따른 보정은 제외)
 */
export function shownAccuracy(att: Battler, def: Battler, m: MoveData, foeItems: boolean): number | null {
  if (m.acc == null) return null
  let d = def.intel?.known ? def : withAbility(def, null)
  if (!foeItems) d = { ...d, held: {} }
  return accuracyOf(att, d, m)
}

/** 기대 데미지 (명중률·타수·특성 반영, 급소 제외, 난수 평균). 흡수 특성에 막히면 회복량만큼 음수 */
export function expectedDamage(att: Battler, def: Battler, m: MoveData): number {
  if (!isDamaging(m)) return 0
  const { type } = moveTypeOf(att, def, m)
  const blk = blockOf(att, def, m, type, effOf(att, def, type))
  if (blk) {
    if (blk.by === 'item') return 0
    if (blk.by === 'ability' && blk.fx && 'heal' in blk.fx) return -Math.min(Math.floor(maxHpOf(def) / 4), maxHpOf(def) - def.hp)
    return blk.by === 'ability' && blk.fx && !('none' in blk.fx) ? -1 : 0
  }
  return damageOf(att, def, m, 92.5, false) * avgHits(att, def, m) * accuracyOf(att, def, m)
}

/**
 * 최소 난수·급소 없음·최소 타수로도 상대를 쓰러뜨리는지 (확정 1타).
 * 탈·옹골참·기합의띠(HP가 가득할 때)에 버티는 경우는 확정 아님. 기합의머리띠(확률)는 무시
 */
export function surelyKo(att: Battler, def: Battler, m: MoveData): boolean {
  if (!isDamaging(m) || def.hp <= 0) return false
  const { type } = moveTypeOf(att, def, m)
  const eff = effOf(att, def, type)
  if (eff === 0 || blockOf(att, def, m, type, eff)) return false
  const h = m.extra.hits
  const hits = !h ? 1 : ab(att, def) === 'skill-link' ? h[1] : h[0] === 2 && h[1] === 5 && nItem(att, 'loaded-dice', def) ? 4 : h[0]
  const d = defAb(def, att)
  const maxHp = maxHpOf(def)
  let hp = def.hp
  let busted = !!def.vol?.busted
  let sashes = nItem(def, 'focus-sash', att)
  for (let i = 0; i < hits; i++) {
    if (d === 'disguise' && !busted) {
      busted = true
      hp = Math.max(1, hp - Math.floor(maxHp / 8))
      continue
    }
    const dmg = damageOf(att, { ...def, hp }, m, 85, false)
    if (dmg >= hp) {
      const full = hp >= maxHp
      if (full && d === 'sturdy') hp = 1
      else if (full && sashes > 0) {
        sashes--
        hp = 1
      } else return true
    } else hp -= dmg
  }
  return false
}

/**
 * 부가 효과의 이로움 (클수록 좋음): 흡수 회복·자신 능력 상승·상대 능력 하락·상대 상태이상·묶기는 +,
 * 반동·자신 능력 하락은 -
 */
function sideEffectScore(att: Battler, def: Battler, m: MoveData): number {
  const ex = m.extra
  let s = (ex.drain ?? 0) / 100
  if (ex.stats) {
    const p = (ex.chance ?? 100) / 100
    const flip = ex.self && ab(att, def) === 'contrary' ? -1 : 1
    for (const [k, n] of ex.stats) if (k !== 'hp') s += (ex.self ? n * flip : -n) * 0.25 * p
  }
  if (ex.ail) s += (ex.ailChance ?? 100) / 100
  if (ex.trap) s += 0.1
  return s
}

/** 확정 1타 기술 고르기: effect = 명중률 → 부가 효과 / pp = 명중률 → 남은 PP → 부가 효과 */
export type KoPick = 'effect' | 'pp'
export interface ChooseOpts {
  /** 상대를 확정 1타 낼 수 있는 기술이 있으면 그중에서 고름 (smart 에서만) */
  koPick?: KoPick
  /** 남은 PP (null = 제한 없음) */
  ppLeft?: (id: string) => number | null
  /** 상황에 맞으면 변화기(회복·상태이상·능력 상승)도 씀 */
  status?: boolean
}

/**
 * 지금 쓸 만한 변화기 (없으면 null): HP가 절반 이하면 회복, 상대가 상태이상이 아니면 상태이상,
 * HP가 넉넉하면 능력 상승(올릴 능력이 모두 +2 미만일 때), 상대 능력 크게 내리기
 */
/** 이번 턴에 바로 맞지 않는 기술 (2턴 기술의 첫 턴·미래예지·힘껏펀치·트랩셸) */
function delayedHit(me: Battler, foe: Battler, m: MoveData): boolean {
  if (CHARGE_MOVES[m.id] && !me.vol?.charge && !chargeSkipped(me, foe, m) && !nItem(me, 'power-herb', foe)) return true
  return FUTURE_MOVES.has(m.id) || m.id === 'focus-punch' || m.id === 'shell-trap'
}

/**
 * 부작용이 있는 공격기의 가치 배율 (AI 용, 1 = 부작용 없음). e = 기대 데미지.
 * 자폭 계열은 쓰러뜨릴 수 있거나 HP가 얼마 안 남았을 때만, 반동으로 쉬는 기술은 쓰러뜨릴 수 있을 때 우대
 */
function drawbackFactor(me: Battler, foe: Battler, m: MoveData, e: number): number {
  const hp = me.hp / maxHpOf(me)
  const ko = e >= foe.hp
  if (SELF_KO_MOVES.has(m.id) || m.id === 'final-gambit') return ko || hp <= 0.3 ? 1 : 0.1
  if (RECHARGE_MOVES.has(m.id)) return ko ? 1 : 0.55
  if (HALF_COST_MOVES.has(m.id)) return ko ? 1 : hp > 0.5 ? 0.7 : 0.25
  if (m.id === 'shell-trap') return 0.3
  if (delayedHit(me, foe, m)) return CHARGE_MOVES[m.id]?.semi ? 0.6 : 0.5
  return 1
}

function statusPick(me: Battler, foe: Battler, moves: MoveData[]): MoveData | null {
  const hp = me.hp / maxHpOf(me)
  const picks: { m: MoveData; w: number }[] = []
  for (const m of moves) {
    if (m.cls !== 'status') continue
    const ex = m.extra
    // 특수한 변화기: 잠자기 = HP가 적을 때 / 추억의선물·길동무 = 쓰러지기 직전 / 멸망의노래·치유소원·초승달춤은 쓰지 않음
    if (m.id === 'rest') {
      if (hp <= 0.4) picks.push({ m, w: 4 })
      continue
    }
    if (m.id === 'memento' || m.id === 'destiny-bond') {
      if (hp <= 0.25) picks.push({ m, w: 3 })
      continue
    }
    if (m.id === 'perish-song' || m.id === 'healing-wish' || m.id === 'lunar-dance' || m.id === 'sleep-talk') continue
    const { type } = moveTypeOf(me, foe, m)
    if (blockOf(me, foe, m, type, effOf(me, foe, type))) continue
    if (ex.heal && !ex.stats) {
      if (hp <= 0.5) picks.push({ m, w: 4 })
    } else if (ex.ail) {
      if (m.type === 'electric' && typeEffect(m.type, foe) === 0) continue
      if (canInflict(foe, ex.ail, me) && defAb(foe, me) !== 'magic-bounce') picks.push({ m, w: 3 })
    } else if (ex.stats && ex.self) {
      if (ab(me, foe) === 'contrary' || hp < 0.6) continue
      const ups = ex.stats.filter(([k, n]) => k in STAT_INDEX && n > 0)
      if (ups.length && ups.every(([k]) => (me.stages[k as StageKey] ?? 0) < 2)) picks.push({ m, w: 2 })
    } else if (ex.stats && !ex.self) {
      const drops = ex.stats.filter(([k, n]) => k in STAT_INDEX && n <= -2)
      if (hp >= 0.7 && drops.length && drops.every(([k]) => (foe.stages[k as StageKey] ?? 0) > -2)) picks.push({ m, w: 1 })
    }
  }
  if (!picks.length || Math.random() < 0.25) return null
  const top = Math.max(...picks.map((p) => p.w))
  const list = picks.filter((p) => p.w === top)
  return list[Math.floor(Math.random() * list.length)]!.m
}

// ---------- AI ----------
/**
 * 기술 선택.
 * random = 무작위 / strong = 특성을 모른다고 보고 기대 데미지가 가장 큰 기술 /
 * smart = 상대 특성 후보(def.intel)와 자신의 특성까지 고려해 기대 데미지가 가장 큰 기술
 * (opts.koPick 이면 확정 1타 기술이 있을 때 그중에서 고름)
 */
export function chooseMove(
  att: Battler,
  def: Battler,
  mode: AiMode,
  transform?: (m: MoveData) => MoveData,
  opts: ChooseOpts = {},
): string {
  const all = selectableMoves(att, att.moves).map(moveData).filter((m): m is MoveData => !!m)
  // 지금 쓰면 실패하는 기술(꿈먹기·속이기 등)은 빼고 고름
  const usable = all.filter((m) => !failReason(att, def, m, att.vol?.lastMove))
  const moves = usable.length ? usable : all
  // 다이맥스 기술처럼 실제로 나가는 기술로 비교 (돌려주는 것은 원래 기술 id)
  const real = new Map(moves.map((m) => [m, transform ? transform(m) : m]))
  const exp = (me: Battler, f: Battler, m: MoveData) => expectedDamage(me, f, real.get(m)!)
  if (!moves.length) return 'struggle'
  if (mode === 'random') return moves[Math.floor(Math.random() * moves.length)]!.id
  // 잠들어 있으면 잠꼬대
  if (att.status === 'slp' && (att.sleep ?? 0) > 0 && moves.some((m) => m.id === 'sleep-talk')) return 'sleep-talk'
  // 비교 대상: strong 은 양쪽 특성을 없는 것으로, smart 는 상대 특성 후보 각각 (같은 확률로 가정)
  let me = att
  let foes: Battler[]
  if (mode === 'strong') {
    me = withAbility(att, null)
    foes = [withAbility(def, null)]
  } else {
    // 드러난 특성은 그대로, 아니면 남은 후보들 (정보가 없으면 그 포켓몬이 가질 수 있는 모든 특성)
    const it = def.intel
    const cands: (string | null)[] = it?.known ? [abilityOf(def)] : it?.cands.length ? it.cands : speciesAbilities(def.species, true)
    foes = (cands.length ? cands : [null]).map((c) => withAbility(def, c))
    // 확정 1타: 어떤 특성 후보든 쓰러뜨리는 기술 중에서 명중률 → (남은 PP) → 부가 효과 순
    if (opts.koPick) {
      // 이번 턴에 바로 맞지 않는 기술(2턴 기술·미래예지·힘껏펀치 등)은 확정 1타로 치지 않음
      const ko = moves.filter((m) => !delayedHit(me, def, real.get(m)!) && foes.every((f) => surelyKo(me, f, real.get(m)!)))
      if (ko.length) {
        const avg = (fn: (f: Battler) => number) => foes.reduce((s, f) => s + fn(f), 0) / foes.length
        const keys = (m: MoveData): number[] => {
          const r = real.get(m)!
          const acc = Math.round(avg((f) => accuracyOf(me, f, r)) * 1000)
          const fx = avg((f) => sideEffectScore(me, f, r))
          if (opts.koPick !== 'pp') return [acc, fx]
          const pp = opts.ppLeft?.(m.id)
          return [acc, pp == null ? Infinity : pp, fx]
        }
        const scored = ko.map((m) => ({ m, k: keys(m) }))
        const cmp = (a: number[], b: number[]) => {
          for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 1e-9) return a[i]! - b[i]!
          return 0
        }
        const top = scored.reduce((b, x) => (cmp(x.k, b.k) > 0 ? x : b)).k
        const list = scored.filter((x) => cmp(x.k, top) === 0)
        return list[Math.floor(Math.random() * list.length)]!.m.id
      }
    }
  }
  if (opts.status) {
    const sm = statusPick(me, foes[0]!, moves)
    if (sm) return sm.id
  }
  let best: MoveData[] = []
  let bestDmg = -Infinity
  for (const m of moves) {
    const d =
      foes.reduce((sum, f) => {
        const e = Math.min(exp(me, f, m), f.hp)
        return sum + (e > 0 ? e * drawbackFactor(me, f, real.get(m)!, e) : e)
      }, 0) / foes.length
    if (d > bestDmg + 1e-9) {
      best = [m]
      bestDmg = d
    } else if (Math.abs(d - bestDmg) < 1e-9) best.push(m)
  }
  // 공격기가 하나도 효과가 없으면 (모두 0 이하) 손해 보지 않는 기술 중 무작위
  const pool = bestDmg > 0 ? best : moves.filter((m) => foes.every((f) => exp(me, f, m) >= 0))
  const list = pool.length ? pool : moves
  return list[Math.floor(Math.random() * list.length)]!.id
}

// ---------- 턴 진행 ----------
export type Side = 'player' | 'enemy'

const STAGE_NAMES: Record<StageKey, string> = {
  atk: '공격',
  def: '방어',
  spa: '특수공격',
  spd: '특수방어',
  spe: '스피드',
  acc: '명중률',
  eva: '회피율',
}

/** 숫자 끝자리 읽기의 받침 (0영 1일 3삼 6육 7칠 8팔) */
const DIGIT_BATCHIM: Record<string, number> = { '0': 21, '1': 8, '3': 16, '6': 1, '7': 8, '8': 8 }

/** 마지막 글자의 받침 번호 (0 = 없음). 한글·숫자가 아니면 null */
function batchim(word: string): number | null {
  // 괄호 등 뒤쪽 기호는 무시 (예: "알프의 유적 (바깥)")
  const w = word.replace(/[\s)\]]+$/, '')
  const ch = w[w.length - 1] ?? ''
  if (/\d/.test(ch)) return DIGIT_BATCHIM[ch] ?? 0
  const c = ch.charCodeAt(0)
  if (c < 0xac00 || c > 0xd7a3) return null
  return (c - 0xac00) % 28
}

/** 받침 유무에 따라 조사 선택 (예: josa('피카츄', '은', '는') → '피카츄는') */
export function josa(word: string, withBatchim: string, without: string): string {
  const b = batchim(word)
  return word + (b ? withBatchim : without)
}

/** '으로/로' (받침이 없거나 ㄹ 받침이면 '로') */
export function ro(word: string): string {
  const b = batchim(word)
  return word + (b && b !== 8 ? '으로' : '로')
}

/** 랭크 변화 그대로 적용 (특성 판정 없음) */
function applyStage(target: Battler, key: StageKey, delta: number, log: string[]): boolean {
  const cur = target.stages[key] ?? 0
  const next = Math.max(-6, Math.min(6, cur + delta))
  const name = `${target.name}의 ${STAGE_NAMES[key]}`
  if (next === cur) {
    log.push(`${josa(name, '은', '는')} 더 ${delta > 0 ? '올라가지' : '떨어지지'} 않는다!`)
    return false
  }
  target.stages[key] = next
  const n = Math.abs(next - cur)
  const amount = n >= 3 ? '매우 크게 ' : n === 2 ? '크게 ' : ''
  log.push(`${josa(name, '이', '가')} ${amount}${delta > 0 ? '올라갔다' : '떨어졌다'}!`)
  return true
}

/**
 * 랭크 변화 (특성 반영). source = 변화를 일으킨 상대 (자신의 기술·특성이면 생략).
 * 심술꾸러기·단순·클리어바디류·미러아머·오기·승기 처리
 */
function changeStage(target: Battler, key: StageKey, delta: number, log: string[], source?: Battler) {
  const other = source ?? target
  const t = source ? defAb(target, source) : ab(target, other)
  if (t === 'contrary') delta = -delta
  if (t === 'simple') delta *= 2
  if (source && delta < 0) {
    // 클리어참·이펙트가드: 상대에 의한 능력 하락을 막음
    const guard = nItem(target, 'clear-amulet', source) ? itemKo('clear-amulet') : (target.vol?.mist ?? 0) > 0 ? itemKo('guard-spec') : null
    if (guard) {
      log.push(`${target.name}의 ${josa(STAGE_NAMES[key], '은', '는')} ${guard}의 효과로 떨어지지 않는다!`)
      return
    }
    const block = t ? DROP_BLOCK[t] : undefined
    if (block === 'all' || block?.includes(key)) {
      announce(target, log)
      log.push(`${target.name}의 ${josa(STAGE_NAMES[key], '은', '는')} 떨어지지 않는다!`)
      return
    }
    if (t === 'mirror-armor') {
      announce(target, log)
      changeStage(source, key, delta, log)
      return
    }
    const ok = applyStage(target, key, delta, log)
    ruleOut(target, (c) => {
      const x = abilityOf(c)
      const b = x ? DROP_BLOCK[x] : undefined
      return b === 'all' || !!b?.includes(key) || x === 'mirror-armor' || x === 'defiant' || x === 'competitive' || x === 'contrary' || x === 'simple'
    })
    if (ok && (t === 'defiant' || t === 'competitive')) {
      announce(target, log)
      applyStage(target, t === 'defiant' ? 'atk' : 'spa', 2, log)
    }
    return
  }
  applyStage(target, key, delta, log)
}

const CRIT_CHANCE = [1 / 24, 1 / 8, 1 / 2, 1]
/** 급소 랭크 (기술·특성·도구·크리티컬커터) */
function critStageOf(att: Battler, def: Battler, m: MoveData): number {
  let s = (m.extra.crit ?? 0) + (ab(att, def) === 'super-luck' ? 1 : 0) + (att.vol?.critBoost ?? 0)
  s += nItems(att, def, (id) => CRIT_ITEMS.has(id))
  s += 2 * nItems(att, def, (id) => !!CRIT_SPECIES_ITEMS[id]?.includes(att.species))
  return Math.min(3, s)
}
const rollHits = (h: [number, number], dice = false) => {
  if (h[0] === 2 && h[1] === 5) {
    if (dice) return Math.random() < 0.5 ? 4 : 5
    const r = Math.random()
    return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5
  }
  return h[0] + Math.floor(Math.random() * (h[1] - h[0] + 1))
}

// ---------- 상태이상 ----------
const STATUS_IMMUNE: Record<Status, string[]> = {
  par: ['electric'],
  slp: [],
  frz: ['ice'],
  brn: ['fire'],
  psn: ['poison', 'steel'],
  tox: ['poison', 'steel'],
}
const INFLICT_MSG: Record<Status, (n: string) => string> = {
  par: (n) => `${josa(n, '은', '는')} 마비되어 기술이 나오기 어려워졌다!`,
  slp: (n) => `${josa(n, '은', '는')} 잠들어 버렸다!`,
  frz: (n) => `${josa(n, '은', '는')} 얼어붙었다!`,
  brn: (n) => `${josa(n, '은', '는')} 화상을 입었다!`,
  psn: (n) => `${josa(n, '은', '는')} 독에 걸렸다!`,
  tox: (n) => `${josa(n, '은', '는')} 맹독을 입었다!`,
}

const abilityBlocksStatus = (a: string | null, s: Status) => !!a && !!STATUS_IMMUNE_AB[a]?.includes(s)

/** 상태이상에 걸릴 수 있는지 (메시지 없음) */
function canInflict(target: Battler, s: Status, source?: Battler): boolean {
  if (target.status) return false
  const corrosion = source && ab(source, target) === 'corrosion' && (s === 'psn' || s === 'tox')
  if (!corrosion && STATUS_IMMUNE[s].some((t) => typesOf(target).includes(t))) return false
  return !abilityBlocksStatus(source ? defAb(target, source) : abilityOf(target), s)
}

/**
 * 상태이상을 건다. 성공 여부 반환. direct = 변화기로 직접 건 경우 (실패 메시지 표시).
 * source = 상태이상을 건 상대 (부식·싱크로·틀깨기 판정)
 */
export function inflictStatus(target: Battler, s: Status, log: string[], direct: boolean, source?: Battler): boolean {
  const types = typesOf(target)
  const corrosion = source && ab(source, target) === 'corrosion' && (s === 'psn' || s === 'tox')
  const typeImmune = !corrosion && STATUS_IMMUNE[s].some((t) => types.includes(t))
  const ta = source ? defAb(target, source) : abilityOf(target)
  if (target.status || typeImmune) {
    if (direct) {
      log.push(
        target.status === s
          ? `${josa(target.name, '은', '는')} 이미 ${STATUS_LABELS[s]} 상태다!`
          : `그러나 ${target.name}에게는 효과가 없었다!`,
      )
    }
    return false
  }
  if (abilityBlocksStatus(ta, s)) {
    if (direct) {
      announce(target, log)
      log.push(`그러나 ${target.name}에게는 효과가 없었다!`)
    }
    return false
  }
  target.status = s
  if (s === 'slp') target.sleep = 1 + Math.floor(Math.random() * 3)
  if (s === 'tox') target.toxic = 0
  log.push(INFLICT_MSG[s](target.name))
  const syncable = s !== 'slp' && s !== 'frz'
  if (source) ruleOut(target, (c) => abilityBlocksStatus(abilityOf(c), s) || (syncable && abilityOf(c) === 'synchronize'))
  // 싱크로: 독·마비·화상을 건 상대에게도
  if (source && ta === 'synchronize' && syncable) {
    announce(target, log)
    inflictStatus(source, s, log, false)
  }
  checkStatusBerry(target, source, log)
  return true
}

/** 상태이상을 고치는 열매 */
function checkStatusBerry(b: Battler, foe: Battler | undefined, log: string[]) {
  const status = b.status
  if (!status || !canEat(b, foe)) return
  const item = itemsOf(b, foe).find((id) => STATUS_BERRY[id]?.includes(status))
  if (!item) return
  log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹고 ${STATUS_LABELS[status]} 상태가 나았다!`)
  cureStatus(b)
  consumeItem(b, item, foe, log)
}

/** HP가 줄었을 때 발동하는 도구 (회복 열매·핀치 열매). 종류마다 한 번에 1개씩 */
function checkHpItems(b: Battler, foe: Battler, log: string[]) {
  for (const id of itemsOf(b, foe)) hpItem(b, foe, id, log)
}
function hpItem(b: Battler, foe: Battler, item: string, log: string[]) {
  if (b.hp <= 0 || (isBerry(item) && !canEat(b, foe))) return
  const max = maxHpOf(b)
  const gluttony = ab(b, foe) === 'gluttony'
  const pinch = b.hp * (gluttony ? 2 : 4) <= max
  const h = HEAL_HELD[item]
  if (h) {
    if (b.hp > max * (gluttony && h.at < 0.5 ? 0.5 : h.at)) return
    const amount = h.frac ? Math.floor(max * h.frac) : h.hp!
    heal(b, amount)
    log.push(`${josa(b.name, '은', '는')} ${ro(itemKo(item))} 체력을 회복했다!`)
    consumeItem(b, item, foe, log)
    return
  }
  if (!pinch) return
  const stat = PINCH_BERRY[item]
  if (stat) {
    if ((b.stages[stat] ?? 0) >= 6) return
    log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹었다!`)
    changeStage(b, stat, 1, log)
    consumeItem(b, item, foe, log)
  } else if (item === 'starf-berry') {
    const keys = (['atk', 'def', 'spa', 'spd', 'spe'] as StageKey[]).filter((k) => (b.stages[k] ?? 0) < 6)
    const k = keys[Math.floor(Math.random() * keys.length)]
    if (!k) return
    log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹었다!`)
    changeStage(b, k, 2, log)
    consumeItem(b, item, foe, log)
  } else if (item === 'lansat-berry') {
    const vol = (b.vol ??= {})
    vol.critBoost = (vol.critBoost ?? 0) + 2
    log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹고 기합이 들어갔다!`)
    consumeItem(b, item, foe, log)
  } else if (item === 'micle-berry') {
    ;(b.vol ??= {}).micle = true
    log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹고 다음 기술의 명중률이 올라갔다!`)
    consumeItem(b, item, foe, log)
  }
}

/** 하양허브: 떨어진 능력을 원래대로 */
function checkWhiteHerb(b: Battler, foe: Battler, log: string[]) {
  if (!nItem(b, 'white-herb', foe) || b.hp <= 0) return
  const low = (Object.keys(b.stages) as StageKey[]).filter((k) => (b.stages[k] ?? 0) < 0)
  if (!low.length) return
  for (const k of low) b.stages[k] = 0
  log.push(`${josa(b.name, '은', '는')} ${ro(itemKo('white-herb'))} 떨어진 능력을 원래대로 되돌렸다!`)
  consumeItem(b, 'white-herb', foe, log)
}

export function cureStatus(b: Pick<Battler, 'status' | 'sleep' | 'toxic'>) {
  b.status = null
  b.sleep = undefined
  b.toxic = undefined
}

/** 행동 전 상태이상 판정. 행동할 수 있으면 true */
function canMove(att: Battler, foe: Battler, log: string[], moveId: string): boolean {
  switch (att.status) {
    case 'slp':
      if ((att.sleep ?? 0) > 0) {
        // 일찍기상: 2배 빨리 깸
        att.sleep = Math.max(0, (att.sleep ?? 1) - (ab(att, foe) === 'early-bird' ? 2 : 1))
        if (att.sleep > 0 || ab(att, foe) !== 'early-bird') {
          log.push(`${josa(att.name, '은', '는')} 쿨쿨 잠들어 있다.`)
          // 잠꼬대·코골기: 잠든 채로 쓸 수 있음
          return moveId === 'sleep-talk' || moveId === 'snore'
        }
      }
      cureStatus(att)
      log.push(`${josa(att.name, '은', '는')} 눈을 떴다!`)
      return true
    case 'frz':
      // 화염볼 등: 얼어 있어도 스스로 녹이고 공격
      if (Math.random() < 0.2 || moveData(moveId)?.extra.thaw) {
        cureStatus(att)
        log.push(`${att.name}의 얼음이 녹았다!`)
        return true
      }
      log.push(`${josa(att.name, '은', '는')} 얼어버려서 움직일 수 없다!`)
      return false
    case 'par':
      if (Math.random() < 0.25) {
        log.push(`${josa(att.name, '은', '는')} 몸이 저려서 움직일 수 없다!`)
        return false
      }
      return true
    default:
      return true
  }
}

/** HP 감소 (매직가드 = 공격 이외의 데미지 무효). 실제로 줄었으면 true */
function indirect(b: Battler, foe: Battler, amount: number): boolean {
  if (ab(b, foe) === 'magic-guard') return false
  b.hp = Math.max(0, b.hp - Math.max(1, amount))
  return true
}
function heal(b: Battler, amount: number): number {
  const before = b.hp
  b.hp = Math.min(maxHpOf(b), b.hp + Math.max(1, amount))
  return b.hp - before
}

/** 턴 종료 시 화상·독 데미지와 특성 효과 */
/** 턴 종료 시 시간차 효과: 미래예지·파멸의소원이 맞음, 멸망의노래 카운트 */
function delayedEffects(b: Battler, log: string[]) {
  const vol = b.vol
  if (!vol || b.hp <= 0) return
  const f = vol.future
  if (f && --f.left <= 0) {
    vol.future = undefined
    log.push(`${josa(b.name, '은', '는')} ${f.move} 공격을 받았다!`)
    if (f.dmg > 0) {
      const dmg = Math.min(b.hp, f.dmg)
      b.hp -= dmg
      log.push(`${josa(b.name, '은', '는')} ${dmg}의 데미지를 입었다.`)
    } else log.push(`${b.name}에게는 효과가 없는 것 같다…`)
  }
  if (vol.perish != null && b.hp > 0) {
    vol.perish--
    log.push(`${b.name}의 멸망 카운트가 ${josa(String(vol.perish), '이', '가')} 되었다!`)
    if (vol.perish <= 0) {
      vol.perish = undefined
      b.hp = 0
    }
  }
}

function endOfTurn(b: Battler, foe: Battler, log: string[]) {
  if (b.hp <= 0) return
  const max = maxHpOf(b)
  const a = ab(b, foe)
  weatherEndOfTurn(b, foe, log, false)
  if (b.hp <= 0) return
  if (b.status === 'brn') {
    if (indirect(b, foe, Math.floor(max / 16))) log.push(`${josa(b.name, '은', '는')} 화상 데미지를 입었다!`)
  } else if (b.status === 'psn' || b.status === 'tox') {
    const n = b.status === 'tox' ? (b.toxic = Math.min(15, (b.toxic ?? 0) + 1)) : 2
    if (a === 'poison-heal') {
      if (b.hp < max) {
        announce(b, log)
        heal(b, Math.floor(max / 8))
        log.push(`${josa(b.name, '은', '는')} 독으로 체력을 회복했다!`)
      }
    } else if (indirect(b, foe, Math.floor((max * n) / 16))) log.push(`${josa(b.name, '은', '는')} 독에 의한 데미지를 입었다!`)
  }
  if (b.hp <= 0) return
  // 도구: 먹다남은음식·검은오물·끈적끈적바늘
  for (const item of itemsOf(b, foe)) {
    if (b.hp <= 0) break
    const n = b.held![item]!
    if (item === 'leftovers' || (item === 'black-sludge' && typesOf(b).includes('poison'))) {
      if (b.hp < max) {
        heal(b, Math.floor((max * n) / 16))
        log.push(`${josa(b.name, '은', '는')} ${ro(itemKo(item))} 조금 회복했다!`)
      }
    } else if (item === 'black-sludge' || item === 'sticky-barb') {
      if (indirect(b, foe, Math.floor((max * n) / 8))) log.push(`${josa(b.name, '은', '는')} ${ro(itemKo(item))} 데미지를 입었다!`)
    }
  }
  if (b.hp <= 0) return
  checkHpItems(b, foe, log)
  if (b.hp <= 0) return
  const vol = (b.vol ??= {})
  vol.flinch = false
  if (vol.mist) {
    vol.mist--
    if (!vol.mist) log.push(`${b.name}의 ${itemKo('guard-spec')} 효과가 사라졌다!`)
  }
  const turns = vol.turns ?? 0
  if (a === 'speed-boost' && turns >= 0) {
    announce(b, log)
    applyStage(b, 'spe', 1, log)
  }
  if (a === 'shed-skin' && b.status && Math.random() < 1 / 3) {
    announce(b, log)
    log.push(`${b.name}의 ${STATUS_LABELS[b.status]} 상태가 나았다!`)
    cureStatus(b)
  }
  if (a === 'moody') {
    const keys: StageKey[] = ['atk', 'def', 'spa', 'spd', 'spe']
    const up = keys.filter((k) => (b.stages[k] ?? 0) < 6)
    const u = up[Math.floor(Math.random() * up.length)]
    const down = keys.filter((k) => k !== u && (b.stages[k] ?? 0) > -6)
    const d = down[Math.floor(Math.random() * down.length)]
    announce(b, log)
    if (u) applyStage(b, u, 2, log)
    if (d) applyStage(b, d, -1, log)
  }
  vol.turns = turns + 1
  if (a === 'slow-start' && vol.turns === 5) {
    announce(b, log)
    log.push(`${josa(b.name, '은', '는')} 드디어 제 컨디션을 되찾았다!`)
  }
  // 맹독구슬·화염구슬: 턴이 끝날 때 상태이상
  const orb = nItem(b, 'toxic-orb', foe) ? 'toxic-orb' : nItem(b, 'flame-orb', foe) ? 'flame-orb' : null
  if (orb) {
    const s: Status = orb === 'toxic-orb' ? 'tox' : 'brn'
    if (canInflict(b, s)) inflictStatus(b, s, log, false)
  }
}

/**
 * 턴 종료 날씨 효과: 모래바람·싸라기눈 데미지, 젖은접시·건조피부·아이스바디 회복, 촉촉바디.
 * benefitsOnly = 이로운 것만 (판정 강화: 상대를 쓰러뜨린 턴)
 */
function weatherEndOfTurn(b: Battler, foe: Battler, log: string[], benefitsOnly: boolean) {
  const w = weatherOf(b, foe)
  if (!w || b.hp <= 0) return
  const max = maxHpOf(b)
  const a = ab(b, foe)
  if (w === 'sand' || w === 'hail') {
    if (a === 'ice-body' && w === 'hail') {
      if (b.hp < max) {
        announce(b, log)
        heal(b, Math.floor(max / 16))
        log.push(`${josa(b.name, '은', '는')} 체력을 조금 회복했다!`)
      }
      return
    }
    if (benefitsOnly) return
    const immune =
      typesOf(b).some((t) => WEATHER_DMG_TYPES[w].includes(t)) ||
      WEATHER_DMG_IMMUNE[w].includes(a ?? '') ||
      !!nItem(b, 'safety-goggles', foe)
    if (!immune && indirect(b, foe, Math.floor(max / 16)))
      log.push(`${josa(b.name, '은', '는')} ${w === 'sand' ? '모래바람' : '싸라기눈'}에 의한 데미지를 입었다!`)
    return
  }
  if (w !== 'rain') return
  if ((a === 'rain-dish' || a === 'dry-skin') && b.hp < max) {
    announce(b, log)
    heal(b, Math.floor(max / (a === 'dry-skin' ? 8 : 16)))
    log.push(`${josa(b.name, '은', '는')} 체력을 회복했다!`)
  }
  if (a === 'hydration' && b.status) {
    announce(b, log)
    log.push(`${b.name}의 ${STATUS_LABELS[b.status]} 상태가 나았다!`)
    cureStatus(b)
  }
}

/** 타입 기술 흡수 특성 효과 */
function applyAbsorb(def: Battler, fx: AbsorbFx | undefined, log: string[]) {
  announce(def, log)
  if (fx && 'heal' in fx) {
    if (heal(def, Math.floor(maxHpOf(def) / 4)) > 0) log.push(`${josa(def.name, '은', '는')} 체력을 회복했다!`)
    else log.push(`${def.name}에게는 효과가 없는 것 같다…`)
  } else if (fx && 'stat' in fx) {
    changeStage(def, fx.stat, fx.n, log)
  } else if (fx && 'flash' in fx) {
    ;(def.vol ??= {}).flashFire = true
    log.push(`${def.name}의 불꽃 타입 기술의 위력이 올라갔다!`)
  } else {
    log.push(`${def.name}에게는 효과가 없는 것 같다…`)
  }
}

/** 변화기 효과. user = 효과를 주는 쪽, target = 받는 쪽 (매직미러면 서로 바뀜) */
function applyStatusMove(user: Battler, target: Battler, m: MoveData, log: string[]) {
  const ex = m.extra
  const uvol = (user.vol ??= {})
  switch (m.id) {
    case 'rest':
      user.hp = maxHpOf(user)
      cureStatus(user)
      user.status = 'slp'
      user.sleep = 2
      log.push(`${josa(user.name, '은', '는')} 잠들어 체력을 회복했다!`)
      return
    case 'destiny-bond':
      uvol.destinyBond = true
      log.push(`${josa(user.name, '은', '는')} 상대를 길동무로 삼으려 하고 있다.`)
      return
    case 'perish-song':
      for (const b of [user, target]) {
        if (b.vol?.perish != null) continue
        if (b !== user && defAb(b, user) === 'soundproof') {
          announce(b, log)
          continue
        }
        ;(b.vol ??= {}).perish = 4
      }
      log.push('멸망의노래를 들은 포켓몬은 3턴 후에 쓰러진다!')
      return
    case 'healing-wish':
    case 'lunar-dance':
      uvol.wish = true
      log.push(`${josa(user.name, '은', '는')} 다음 포켓몬을 위해 소원을 빌었다!`)
      return
    case 'stockpile':
      uvol.stockpile = (uvol.stockpile ?? 0) + 1
      log.push(`${josa(user.name, '은', '는')} ${uvol.stockpile}개 비축했다!`)
      break
  }
  let did = false
  if (ex.heal) {
    const max = maxHpOf(user)
    const before = user.hp
    // 달빛·광합성·아침햇살: 맑음 이외의 날씨에서는 1/4 / 꿀꺽: 비축한 수만큼 (1/4·1/2·전부)
    const pct =
      m.id === 'swallow' ? [0, 25, 50, 100][Math.min(3, uvol.stockpile ?? 0)]! : SUN_HEAL_MOVES.has(m.id) && weatherOf(user, target) ? 25 : ex.heal
    user.hp = Math.min(max, user.hp + Math.floor((max * pct) / 100))
    log.push(user.hp > before ? `${josa(user.name, '은', '는')} 체력을 회복했다!` : `${user.name}의 체력은 이미 가득하다!`)
    did = true
  }
  for (const [key, delta] of ex.stats ?? []) {
    if (key === 'hp') continue
    if (ex.self) changeStage(user, key, delta, log)
    else changeStage(target, key, delta, log, user)
    did = true
  }
  if (ex.ail) {
    // 전기 타입 변화기(전기자석파 등)는 땅 타입에게 효과 없음
    if (m.type === 'electric' && typeEffect(m.type, target) === 0) log.push(`그러나 ${target.name}에게는 효과가 없었다!`)
    else inflictStatus(target, ex.ail, log, true, user)
    did = true
  }
  if (!did) log.push('그러나 아무 일도 일어나지 않았다!')
}

/**
 * 기술 사용. last = 이번 턴에 나중에 행동 (애널라이즈·포커스렌즈).
 * override = 실제로 나가는 기술 (Z기술·다이맥스 기술). 없으면 moveId 그대로
 */
function useMove(att: Battler, def: Battler, moveId: string, log: string[], last: boolean, override?: MoveData) {
  const vol = (att.vol ??= {})
  const prev = vol.lastMove
  // 길동무는 다음에 기술을 쓰면 풀림
  vol.destinyBond = false
  const m = override ?? moveData(moveId) ?? STRUGGLE
  const defHp = def.hp
  const thrown = m.id === 'fling' ? flingItem(att, def) : undefined
  const gift = m.id === 'natural-gift' ? giftBerry(att, def) : undefined
  moveOutcome = 'hit'
  useMoveInner(att, def, moveId, log, last, override, prev)
  const out = moveOutcome as MoveOutcome
  vol.acted = true
  if (!(vol.used ??= []).includes(moveId)) vol.used.push(moveId)
  if (out === 'charge') return

  if (out !== 'fail') {
    // 내던지기: 던진 도구에 따라 상태이상·풀죽음, 도구는 사라짐 / 자연의은혜: 열매가 사라짐
    if (thrown) {
      const st = FLING_STATUS[thrown]
      if (out === 'hit' && def.hp > 0) {
        if (st && canInflict(def, st, att)) inflictStatus(def, st, log, false, att)
        if ((thrown === 'kings-rock' || thrown === 'razor-fang') && !last) (def.vol ??= {}).flinch = true
      }
      consumeItem(att, thrown, def, log)
    }
    if (gift) consumeItem(att, gift, def, log)
    // 철제광선·깜짝헤드·클로로블라스트: 최대 HP 절반을 잃음
    if (HALF_COST_MOVES.has(m.id) && att.hp > 0 && indirect(att, def, Math.ceil(maxHpOf(att) / 2)))
      log.push(`${josa(att.name, '은', '는')} 몸이 깎였다!`)
    // 자폭 계열·추억의선물·치유소원·초승달춤: 자신이 쓰러짐 / 목숨걸기: 맞혔을 때만
    if (SELF_KO_MOVES.has(m.id) || m.id === 'memento' || m.id === 'healing-wish' || m.id === 'lunar-dance') att.hp = 0
    if (m.id === 'final-gambit' && out === 'hit') att.hp = 0
    // 파괴광선 등: 맞혔으면 다음 턴 움직일 수 없음
    if (RECHARGE_MOVES.has(m.id) && out === 'hit' && att.hp > 0) vol.recharge = true
    // 토해내기·꿀꺽: 비축이 사라지고 비축으로 오른 방어·특수방어도 원래대로
    if ((m.id === 'spit-up' || m.id === 'swallow') && vol.stockpile) {
      const n = vol.stockpile
      vol.stockpile = 0
      for (const k of ['def', 'spd'] as const) att.stages[k] = Math.max(-6, (att.stages[k] ?? 0) - n)
      log.push(`${att.name}의 비축 효과가 사라졌다!`)
    }
    // 불사르기·전광쌍격: 자신의 불꽃·전기 타입이 사라짐
    if ((m.id === 'burn-up' || m.id === 'double-shock') && out === 'hit' && !att.tera) {
      const lose = m.id === 'burn-up' ? 'fire' : 'electric'
      const left = typesOf(att).filter((t) => t !== lose)
      vol.types = left.length ? left : ['typeless']
      log.push(`${att.name}의 ${typeKo(lose)} 타입이 사라졌다!`)
    }
  }
  // 구르기·아이스볼: 맞히면 다음 턴에도 이어서 (최대 5턴, 위력 2배씩)
  if (m.id === 'rollout' || m.id === 'ice-ball') {
    const n = (vol.rolloutMove === m.id ? (vol.rollout ?? 0) : 0) + 1
    if (out === 'hit' && n < 5 && att.hp > 0) {
      vol.rollout = n
      vol.rolloutMove = moveId
    } else {
      vol.rollout = undefined
      vol.rolloutMove = undefined
    }
  }
  // 길동무: 길동무 상태인 상대를 공격으로 쓰러뜨리면 자신도 쓰러짐
  if (defHp > 0 && def.hp <= 0 && def.vol?.destinyBond && att.hp > 0) {
    def.vol.destinyBond = false
    att.hp = 0
    log.push(`${josa(def.name, '은', '는')} ${josa(att.name, '을', '를')} 길동무로 삼았다!`)
  }
}

/** useMoveInner 의 결과: 맞힘(또는 효과 있음) / 빗나감·막힘 / 실패(쓸 수 없음) / 2턴 기술의 모으는 턴 */
type MoveOutcome = 'hit' | 'miss' | 'fail' | 'charge'
let moveOutcome: MoveOutcome = 'hit'

function useMoveInner(
  att: Battler,
  def: Battler,
  moveId: string,
  log: string[],
  last: boolean,
  override: MoveData | undefined,
  prevMove: string | undefined,
) {
  const m = override ?? moveData(moveId) ?? STRUGGLE
  const ex = m.extra
  const a = ab(att, def)
  const vol = (att.vol ??= {})
  const aHas = (id: string) => nItem(att, id, def)

  // 메트로놈(도구): 같은 기술을 연속으로 쓴 횟수
  vol.streak = vol.lastMove === m.id ? (vol.streak ?? 0) + 1 : 0
  vol.lastMove = m.id
  // 구애 도구: 처음 쓴 기술로 고정
  if (itemsOf(att, def).some((id) => CHOICE_ITEMS.has(id)) && m.id !== 'struggle' && !vol.choice && !att.dynamax) vol.choice = moveId

  // 변환자재·리베로: 기술을 쓰기 전에 그 기술의 타입으로 (전투마다 한 번)
  if ((a === 'protean' || a === 'libero') && !vol.protean && m.type !== 'typeless' && !att.tera) {
    const t = typesOf(att)
    if (t.length !== 1 || t[0] !== m.type) {
      vol.types = [m.type]
      vol.protean = true
      announce(att, log)
      log.push(`${josa(att.name, '은', '는')} ${typeKo(m.type)} 타입이 되었다!`)
    }
  }
  log.push(`${att.name}의 ${m.ko}!`)

  // 쓸 수 없는 상황 (꿈먹기·속이기·비장의무기·트림 등)
  const fail = (msg: string) => {
    log.push(msg)
    moveOutcome = 'fail'
  }
  const why = failReason(att, def, m, prevMove)
  if (why) return fail(why)
  if (dampBlocks(att, def, m)) {
    const damp = ab(att, def) === 'damp' ? att : def
    announce(damp, log)
    return fail(`${damp.name}의 축축 때문에 ${josa(m.ko, '을', '를')} 쓸 수 없다!`)
  }
  if (m.id === 'focus-punch' && vol.hurt) return fail(`${josa(att.name, '은', '는')} 집중이 흐트러져서 기술을 쓸 수 없었다!`)
  if (m.id === 'shell-trap' && !vol.hurtPhys) return fail('그러나 트랩셸이 작동하지 않았다!')
  // 잠꼬대: 다른 기술 중 하나를 무작위로 씀
  if (m.id === 'sleep-talk') {
    const opts = att.moves.filter((id) => !NO_SLEEP_TALK.has(id) && moveData(id))
    if (!opts.length) return fail('그러나 실패했다!')
    return useMoveInner(att, def, opts[Math.floor(Math.random() * opts.length)]!, log, last, undefined, prevMove)
  }
  // 2턴 기술: 첫 턴은 힘을 모음 (파워풀허브가 있으면 바로 공격)
  const charge = override ? undefined : CHARGE_MOVES[m.id]
  if (charge && !vol.releasing) {
    if (!chargeSkipped(att, def, m)) log.push(`${josa(att.name, '은', '는')} ${charge.msg}`)
    for (const [k, n] of charge.stats ?? []) changeStage(att, k, n, log)
    if (!chargeSkipped(att, def, m)) {
      if (aHas('power-herb')) {
        log.push(`${josa(att.name, '은', '는')} ${ro(itemKo('power-herb'))} 힘이 넘쳐흐른다!`)
        consumeItem(att, 'power-herb', def, log)
      } else {
        vol.charge = moveId
        vol.semi = charge.semi
        moveOutcome = 'charge'
        return
      }
    }
  }
  // 미래예지·파멸의소원: 2턴 뒤 턴이 끝날 때 맞음 (데미지는 지금 계산)
  if (FUTURE_MOVES.has(m.id)) {
    const { type } = moveTypeOf(att, def, m)
    const dmg = effOf(att, def, type) === 0 ? 0 : damageOf(att, def, m, 85 + Math.floor(Math.random() * 16), false)
    ;(def.vol ??= {}).future = { left: 3, dmg, move: m.ko }
    log.push(m.id === 'future-sight' ? `${josa(att.name, '은', '는')} 미래를 내다보았다!` : `${josa(att.name, '은', '는')} 파멸의소원을 빌었다!`)
    return
  }

  // 다이월: 이번 턴 상대의 기술을 막음
  if (m.id === MAX_GUARD.id) {
    vol.protect = true
    log.push(`${josa(att.name, '은', '는')} 방어 태세에 들어갔다!`)
    return
  }
  const selfOnly = isSelfMove(m)
  if (!selfOnly && def.vol?.protect) {
    // 섀도다이브·고스트다이브: 방어를 풀고 공격
    if (m.id === 'shadow-force' || m.id === 'phantom-force') {
      def.vol.protect = false
      log.push(`${def.name}의 방어가 풀렸다!`)
    } else {
      log.push(`${josa(def.name, '은', '는')} 공격으로부터 몸을 지켰다!`)
      moveOutcome = 'miss'
      return
    }
  }
  // 공중날기·구멍파기 등으로 사라진 상대: 일부 기술만 맞음 (노가드면 맞음)
  const hidden = def.vol?.semi
  if (!selfOnly && hidden && !SEMI_HIT[hidden].hit.includes(m.id) && a !== 'no-guard' && ab(def, att) !== 'no-guard') {
    log.push(`그러나 ${att.name}의 공격은 빗나갔다!`)
    moveOutcome = 'miss'
    return
  }
  // 명중 판정 (자신에게 쓰는 변화기는 생략)
  const hit = selfOnly || Math.random() < accuracyOf(att, def, m, last)
  if (!selfOnly && vol.micle) vol.micle = false
  if (!hit) {
    moveOutcome = 'miss'
    log.push(`그러나 ${att.name}의 공격은 빗나갔다!`)
    // 허탕보험: 빗나가면 스피드 +2
    if (aHas('blunder-policy') && m.acc != null) {
      log.push(`${josa(itemKo('blunder-policy'), '이', '가')} 발동했다!`)
      changeStage(att, 'spe', 2, log)
      consumeItem(att, 'blunder-policy', def, log)
    }
    return
  }

  const { type } = moveTypeOf(att, def, m)
  const eff = effOf(att, def, type)
  const breaks = !!a && BREAKERS.has(a)
  const blk = blockOf(att, def, m, type, eff)
  if (blk) {
    if (blk.by === 'ability') {
      if (blk.fx) applyAbsorb(def, blk.fx, log)
      else {
        announce(def, log)
        log.push(`${def.name}에게는 효과가 없는 것 같다…`)
      }
    } else if (blk.by === 'item') {
      log.push(`${josa(def.name, '은', '는')} ${ro(itemKo(blk.item))} 공격을 막았다!`)
    } else log.push(`${def.name}에게는 효과가 없는 것 같다…`)
    moveOutcome = 'miss'
    return
  }

  if (m.cls === 'status') {
    // 매직미러: 상대에게 쓰는 변화기를 되받아침
    if (!selfOnly && defAb(def, att) === 'magic-bounce') {
      announce(def, log)
      log.push(`${josa(def.name, '은', '는')} ${josa(m.ko, '을', '를')} 되받아쳤다!`)
      applyStatusMove(def, att, m, log)
      return
    }
    if (!selfOnly && !breaks) ruleOut(def, (c) => blockOf(att, c, m, type, eff) != null || abilityOf(c) === 'magic-bounce')
    turnHits?.push({ def: selfOnly ? att : def, eff: 0, crit: false, type, status: true })
    applyStatusMove(att, def, m, log)
    afterMove(att, def, m, log)
    return
  }

  // 공격기
  const d = defAb(def, att)
  const contact = hasFlag(m, 'contact')
  // 방호패드: 접촉으로 생기는 효과를 받지 않음
  const contactFx = contact && !aHas('protective-pads')
  const physical = m.cls === 'physical'
  const hits = ex.hits ? (a === 'skill-link' ? ex.hits[1] : rollHits(ex.hits, !!aHas('loaded-dice'))) : 1
  const post: string[] = []
  const halfBefore = def.hp * 2 > maxHpOf(def)
  const before: Battler = { ...def, stages: { ...def.stages } }
  let total = 0
  let crits = 0
  let landed = 0
  let revealed = false
  let hpBeforeLast = def.hp
  let resisted = false
  for (let i = 0; i < hits && def.hp > 0 && att.hp > 0; i++) {
    // 탈: 첫 공격을 막고 최대 HP 1/8 감소
    if (d === 'disguise' && !def.vol?.busted) {
      ;(def.vol ??= {}).busted = true
      announce(def, log)
      log.push(`${def.name}의 탈이 대신 공격을 받았다!`)
      def.hp = Math.max(1, def.hp - Math.floor(maxHpOf(def) / 8))
      log.push(`${def.name}의 탈이 벗겨졌다!`)
      revealed = true
      landed++
      continue
    }
    const noCrit = d === 'battle-armor' || d === 'shell-armor'
    const merciless = a === 'merciless' && (def.status === 'psn' || def.status === 'tox')
    const crit = ex.fixed == null && !noCrit && (merciless || Math.random() < CRIT_CHANCE[critStageOf(att, def, m)]!)
    const berry = resistBerryOf(att, def, type, eff)
    const gem = ex.fixed == null ? itemsOf(att, def).find((id) => GEMS[id] === type) : undefined
    let dmg = Math.min(def.hp, damageOf(att, def, m, 85 + Math.floor(Math.random() * 16), crit, { last }))
    if (gem) {
      log.push(`${ro(itemKo(gem))} ${m.ko}의 위력이 올라갔다!`)
      consumeItem(att, gem, def, log)
    }
    if (berry) {
      log.push(`${ro(itemKo(berry))} ${def.name}에게 주는 데미지가 줄었다!`)
      consumeItem(def, berry, att, log)
      resisted = true
    }
    const full = def.hp >= maxHpOf(def)
    // 옹골참: HP가 가득할 때 한 번에 쓰러지지 않음
    if (d === 'sturdy' && full && dmg >= def.hp) {
      dmg = def.hp - 1
      announce(def, post)
      post.push(`${josa(def.name, '은', '는')} 공격을 버텼다!`)
      revealed = true
    } else if (dmg >= def.hp) {
      // 기합의띠 (HP가 가득할 때) · 기합의머리띠 (10%)
      const di =
        full && nItem(def, 'focus-sash', att)
          ? 'focus-sash'
          : Math.random() < 0.1 * nItem(def, 'focus-band', att)
            ? 'focus-band'
            : null
      if (di) {
        dmg = def.hp - 1
        post.push(`${josa(def.name, '은', '는')} ${ro(itemKo(di))} 버텼다!`)
        if (di === 'focus-sash') consumeItem(def, di, att, post)
      }
    }
    if (defMult(d, def, m, type, eff) !== 1) revealed = true
    hpBeforeLast = def.hp
    def.hp -= dmg
    total += dmg
    landed++
    if (crit) crits++
    // 풍선: 공격을 받으면 터짐
    if (holds(def, 'air-balloon') && dmg > 0) {
      post.push(`${def.name}의 ${josa(itemKo('air-balloon'), '이', '가')} 터졌다!`)
      consumeItem(def, 'air-balloon', att, post)
    }
    // 울퉁불퉁멧: 접촉한 상대에게 최대 HP 1/6 데미지
    const helmets = contactFx ? nItem(def, 'rocky-helmet', att) : 0
    if (helmets && indirect(att, def, Math.floor((maxHpOf(att) * helmets) / 6)))
      post.push(`${josa(att.name, '은', '는')} ${ro(itemKo('rocky-helmet'))} 데미지를 입었다!`)
    // 부리캐논 가열 중인 상대에게 접촉하면 화상
    if (contactFx && def.vol?.beak && canInflict(att, 'brn', def)) inflictStatus(att, 'brn', post, false, def)
    if (def.hp <= 0) break
    // 맞을 때 능력이 변하는 특성
    if (crit && d === 'anger-point') {
      announce(def, post)
      def.stages.atk = 6
      post.push(`${josa(def.name, '은', '는')} 공격이 최대로 올라갔다!`)
      revealed = true
    }
    const hs = d ? HIT_STAT[d] : undefined
    if (hs?.when(type, physical)) {
      announce(def, post)
      for (const [k, n] of hs.stats) changeStage(def, k, n, post)
      revealed = true
    }
    if (d === 'cotton-down') {
      announce(def, post)
      changeStage(att, 'spe', -1, post, def)
      revealed = true
    }
    // 맞을 때 능력이 오르는 도구 (구근·충전지·눈덩이·빛이끼·악키열매·타라프열매)
    for (const hi of itemsOf(def, att)) {
      const hb = HIT_BOOST[hi]
      if (hb && (hb.type ? hb.type === type : hb.cls === m.cls) && (!isBerry(hi) || canEat(def, att)) && (def.stages[hb.stat] ?? 0) < 6) {
        post.push(`${def.name}의 ${josa(itemKo(hi), '이', '가')} 발동했다!`)
        changeStage(def, hb.stat, 1, post)
        consumeItem(def, hi, att, post)
      }
    }
    const cloak = !!nItem(def, 'covert-cloak', att)
    // 접촉 반격 (공격 측 특성은 무시되지 않음)
    const dd = ab(def, att)
    if (contactFx && dd) {
      if (dd === 'rough-skin' || dd === 'iron-barbs') {
        announce(def, post)
        if (indirect(att, def, Math.floor(maxHpOf(att) / 8))) post.push(`${josa(att.name, '은', '는')} 상처를 입었다!`)
        revealed = true
      } else if (dd === 'gooey' || dd === 'tangling-hair') {
        announce(def, post)
        changeStage(att, 'spe', -1, post, def)
        revealed = true
      } else if (
        (dd === 'mummy' || dd === 'lingering-aroma') &&
        abilityOf(att) !== dd &&
        !UNCOPYABLE.has(abilityOf(att) ?? '') &&
        !holds(att, 'ability-shield')
      ) {
        announce(def, post)
        ;(att.vol ??= {}).ability = dd
        post.push(`${att.name}의 특성이 ${abilityName(dd)}${dd === 'mummy' ? '가' : '이'} 되었다!`)
        revealed = true
      } else if (CONTACT_STATUS[dd] && canInflict(att, CONTACT_STATUS[dd]!, def) && Math.random() < 0.3) {
        announce(def, post)
        inflictStatus(att, CONTACT_STATUS[dd]!, post, false, def)
      } else if (
        dd === 'effect-spore' &&
        !typesOf(att).includes('grass') &&
        ab(att, def) !== 'overcoat' &&
        !aHas('safety-goggles') &&
        Math.random() < 0.3
      ) {
        const s = (['psn', 'par', 'slp'] as Status[])[Math.floor(Math.random() * 3)]!
        if (canInflict(att, s, def)) {
          announce(def, post)
          inflictStatus(att, s, post, false, def)
        }
      }
    }
    // 공격 측 특성: 독수(접촉)·독사슬 (은밀망토면 막힘)
    const chain = (contactFx && a === 'poison-touch' ? 'psn' : a === 'toxic-chain' ? 'tox' : null) as Status | null
    if (chain && d !== 'shield-dust' && !cloak && canInflict(def, chain, att) && Math.random() < 0.3) {
      announce(att, post)
      inflictStatus(def, chain, post, false, att)
    }
  }
  if (total > 0) {
    turnHits?.push({ def, eff: ex.fixed == null ? eff : 1, crit: crits > 0, type })
    // 힘껏펀치·트랩셸 판정용
    const dv = (def.vol ??= {})
    dv.hurt = true
    if (physical) dv.hurtPhys = true
  }
  if (crits) log.push(crits > 1 || landed > 1 ? `급소에 ${crits}번 맞았다!` : '급소에 맞았다!')
  if (ex.fixed == null && eff > 1) log.push('효과가 굉장했다!')
  if (ex.fixed == null && eff < 1) log.push('효과가 별로인 듯하다…')
  // 데미지를 줄인 특성 표시 (내열·필터 등)
  if (d && total > 0 && defMult(d, def, m, type, eff) !== 1 && def.hp > 0) announce(def, log)
  if (landed > 1) log.push(`${landed}번 맞았다!`)
  if (total > 0) log.push(`${josa(def.name, '은', '는')} ${total}의 데미지를 입었다.`)
  log.push(...post)

  // 관찰 결과로 특성 후보 줄이기: 이 공격에 반응했어야 할 특성 제외
  if (!breaks && !revealed && total > 0 && !resisted) {
    ruleOut(def, (c) => {
      const x = abilityOf(c)
      if (blockOf(att, c, m, type, eff) != null) return true
      if (defMult(x, c, m, type, eff) !== 1) return true
      if (x === 'disguise' && !before.vol?.busted) return true
      if (x === 'sturdy' && c.hp >= maxHpOf(c) && total >= c.hp) return true
      if (x && HIT_STAT[x]?.when(type, physical) && def.hp > 0) return true
      if (x === 'cotton-down' && def.hp > 0) return true
      if (contactFx && (x === 'rough-skin' || x === 'iron-barbs' || x === 'gooey' || x === 'tangling-hair')) return true
      return false
    }, before)
  }

  // 맞은 쪽 도구: 약점보험 / 자보열매·애터열매 / 의문열매
  const dHas = (id: string) => nItem(def, id, att)
  if (total > 0) {
    if (dHas('weakness-policy') && eff > 1 && def.hp > 0 && ex.fixed == null) {
      log.push(`${def.name}의 ${josa(itemKo('weakness-policy'), '이', '가')} 발동했다!`)
      changeStage(def, 'atk', 2, log)
      changeStage(def, 'spa', 2, log)
      consumeItem(def, 'weakness-policy', att, log)
    }
    const counter = physical ? 'jaboca-berry' : m.cls === 'special' ? 'rowap-berry' : null
    if (counter && dHas(counter) && canEat(def, att)) {
      consumeItem(def, counter, att, log)
      if (indirect(att, def, Math.floor(maxHpOf(att) / 8))) log.push(`${josa(att.name, '은', '는')} ${def.name}의 ${ro(itemKo(counter))} 데미지를 입었다!`)
    }
    if (dHas('enigma-berry') && eff > 1 && def.hp > 0 && canEat(def, att)) {
      heal(def, Math.floor(maxHpOf(def) / 4))
      log.push(`${josa(def.name, '은', '는')} ${ro(itemKo('enigma-berry'))} 체력을 회복했다!`)
      consumeItem(def, 'enigma-berry', att, log)
    }
  }

  // 흡수 / 반동 (큰뿌리: 흡수량 1.3배)
  if (ex.drain && total > 0) {
    const amount = Math.max(1, Math.floor((total * Math.abs(ex.drain)) / 100))
    if (ex.drain > 0) {
      if (ab(def, att) === 'liquid-ooze') {
        announce(def, log)
        if (indirect(att, def, amount)) log.push(`${josa(att.name, '은', '는')} 해감액을 흡수했다!`)
      } else {
        heal(att, Math.floor(amount * itemMult(att, 'big-root', 1.3, def)))
        log.push(`${ro(def.name)}부터 체력을 흡수했다!`)
      }
    } else if (a !== 'rock-head' && indirect(att, def, amount)) {
      log.push(`${josa(att.name, '은', '는')} 반동으로 데미지를 입었다!`)
    }
  }
  if (m.id === 'struggle' && indirect(att, def, Math.floor(maxHpOf(att) / 4))) {
    log.push(`${josa(att.name, '은', '는')} 반동으로 데미지를 입었다!`)
  }
  // 조개껍질방울: 준 데미지의 1/8 회복 / 생명의구슬: 최대 HP 1/10 반동 (우격다짐으로 부가 효과가 사라지면 없음)
  if (total > 0 && att.hp > 0) {
    const bells = aHas('shell-bell')
    if (bells && att.hp < maxHpOf(att)) {
      heal(att, Math.floor((total * bells) / 8))
      log.push(`${josa(att.name, '은', '는')} ${ro(itemKo('shell-bell'))} 체력을 조금 회복했다!`)
    }
    const orbs = aHas('life-orb')
    if (orbs && !(a === 'sheer-force' && hasSecondary(m)) && indirect(att, def, Math.floor((maxHpOf(att) * orbs) / 10)))
      log.push(`${josa(att.name, '은', '는')} 생명이 조금 깎였다!`)
  }

  // 쓰러뜨렸을 때: 유폭·내용물분출
  if (def.hp <= 0 && total > 0) {
    const dd = ab(def, att)
    if (dd === 'aftermath' && contact) {
      announce(def, log)
      if (indirect(att, def, Math.floor(maxHpOf(att) / 4))) log.push(`${josa(att.name, '은', '는')} 데미지를 입었다!`)
    } else if (dd === 'innards-out') {
      announce(def, log)
      if (indirect(att, def, hpBeforeLast)) log.push(`${josa(att.name, '은', '는')} 데미지를 입었다!`)
    }
  }

  if (def.hp > 0 && total > 0) {
    // 불꽃 타입 공격을 맞으면 얼음이 녹음
    if (def.status === 'frz' && type === 'fire') {
      cureStatus(def)
      log.push(`${def.name}의 얼음이 녹았다!`)
    }
    // 변색: 맞은 기술의 타입으로
    if (d === 'color-change' && type !== 'typeless' && !typesOf(def).includes(type) && !def.tera) {
      ;(def.vol ??= {}).types = [type]
      announce(def, log)
      log.push(`${josa(def.name, '은', '는')} ${typeKo(type)} 타입이 되었다!`)
    }
    // 발끈·분노의껍질: HP가 절반 아래로
    if (halfBefore && def.hp * 2 <= maxHpOf(def)) {
      if (d === 'berserk') {
        announce(def, log)
        changeStage(def, 'spa', 1, log)
      } else if (d === 'anger-shell') {
        announce(def, log)
        for (const [k, n] of [['atk', 1], ['spa', 1], ['spe', 1], ['def', -1], ['spd', -1]] as [StageKey, number][])
          changeStage(def, k, n, log)
      }
    }
    // 왕의징표석·예리한이빨: 먼저 행동했으면 10% 확률로 풀죽음 (정신력이면 무효)
    const flinch = nItems(att, def, (id) => FLINCH_ITEMS.has(id))
    if (flinch && !last && ab(def, att) !== 'inner-focus' && d !== 'shield-dust' && !dHas('covert-cloak')) {
      if (Math.random() < 0.1 * flinch * (a === 'serene-grace' ? 2 : 1)) (def.vol ??= {}).flinch = true
    }
  }

  // 부가 효과 (우격다짐 = 없음, 인분·은밀망토 = 상대에게 거는 효과 없음, 하늘의은총 = 확률 2배)
  if (!(a === 'sheer-force' && hasSecondary(m))) {
    const chanceMult = a === 'serene-grace' ? 2 : 1
    const shield = d === 'shield-dust' || !!dHas('covert-cloak')
    if (ex.stats && (ex.chance == null || Math.random() * 100 < ex.chance * chanceMult)) {
      const target = ex.self ? att : def
      if (target.hp > 0 && (ex.self || !shield)) {
        for (const [key, delta] of ex.stats) if (key !== 'hp') changeStage(target, key, delta, log, ex.self ? undefined : att)
      }
    }
    if (ex.ail && !shield && def.hp > 0 && total > 0 && (ex.ailChance == null || Math.random() * 100 < ex.ailChance * chanceMult)) {
      inflictStatus(def, ex.ail, log, false, att)
    }
    // 속이기·코골기: 먼저 맞히면 풀죽음 (정신력이면 무효)
    const fl = FLINCH_MOVES[m.id]
    if (fl && !last && !shield && def.hp > 0 && total > 0 && ab(def, att) !== 'inner-focus' && Math.random() * 100 < fl * chanceMult)
      (def.vol ??= {}).flinch = true
    // 교체·도망 봉쇄 (고스트 타입은 걸리지 않음)
    if (ex.trap && !shield && def.hp > 0 && total > 0 && !def.vol?.trapped && !typesOf(def).includes('ghost')) {
      ;(def.vol ??= {}).trapped = true
      log.push(`${josa(def.name, '은', '는')} 이제 도망칠 수 없다!`)
    }
  }
  afterMove(att, def, m, log)
}

/** 기술을 쓴 뒤: 목스프레이, 양쪽의 회복 열매·핀치 열매·하양허브 */
function afterMove(att: Battler, def: Battler, m: MoveData, log: string[]) {
  if (nItem(att, 'throat-spray', def) && hasFlag(m, 'sound') && att.hp > 0 && (att.stages.spa ?? 0) < 6) {
    log.push(`${att.name}의 ${josa(itemKo('throat-spray'), '이', '가')} 발동했다!`)
    changeStage(att, 'spa', 1, log)
    consumeItem(att, 'throat-spray', def, log)
  }
  for (const [b, foe] of [[def, att], [att, def]] as const) {
    checkHpItems(b, foe, log)
    checkWhiteHerb(b, foe, log)
  }
}

/** 전투 시작 시 특성 발동 (위협·다운로드·트레이스 등). 빠른 쪽부터. 로그 반환 */
export function onEntry(player: Battler, enemy: Battler): string[] {
  const log: string[] = []
  if (fieldWeather) log.push(WEATHER_START[fieldWeather])
  const ps = speedOf(player, enemy)
  const es = speedOf(enemy, player)
  const order: [Battler, Battler][] = ps >= es ? [[player, enemy], [enemy, player]] : [[enemy, player], [player, enemy]]
  for (const [b, foe] of order) entryEffect(b, foe, log)
  // 시작 시 발동하지 않았으면 그런 특성은 아님
  for (const b of [player, enemy]) ruleOut(b, (c) => ENTRY_ABILITIES.has(abilityOf(c) ?? ''))
  // 도구: 풍선 / 하양허브 (위협 등으로 떨어진 능력)
  for (const [b, foe] of order) {
    if (nItem(b, 'air-balloon', foe)) log.push(`${josa(b.name, '은', '는')} ${ro(itemKo('air-balloon'))} 떠 있다!`)
    checkWhiteHerb(b, foe, log)
  }
  return log
}

/** 메가진화 등으로 특성이 바뀌었을 때: 등장 시 발동하는 특성 (위협 등). 로그 반환 */
export function onAbilityChange(b: Battler, foe: Battler): string[] {
  const log: string[] = []
  entryEffect(b, foe, log)
  checkWhiteHerb(foe, b, log)
  return log
}

/** 등장 시 발동하는 특성 하나 처리 */
function entryEffect(b: Battler, foe: Battler, log: string[]) {
    b.vol ??= {}
    const a = ab(b, foe)
    if (!a) return
    switch (a) {
      case 'intimidate': {
        announce(b, log)
        const t = ab(foe, b)
        if (t === 'inner-focus' || t === 'oblivious' || t === 'own-tempo' || t === 'scrappy') {
          announce(foe, log)
          log.push(`${josa(foe.name, '은', '는')} 위협에 넘어가지 않았다!`)
        } else if (t === 'guard-dog') {
          announce(foe, log)
          applyStage(foe, 'atk', 1, log)
        } else {
          changeStage(foe, 'atk', -1, log, b)
          if (t === 'rattled') {
            announce(foe, log)
            applyStage(foe, 'spe', 1, log)
          }
        }
        // 주눅구슬: 위협을 받으면 스피드 +1
        if (nItem(foe, 'adrenaline-orb', b) && (foe.stages.spe ?? 0) < 6) {
          log.push(`${foe.name}의 ${josa(itemKo('adrenaline-orb'), '이', '가')} 발동했다!`)
          changeStage(foe, 'spe', 1, log)
          consumeItem(foe, 'adrenaline-orb', b, log)
        }
        break
      }
      case 'download': {
        announce(b, log)
        changeStage(b, effStat(foe, 'def') < effStat(foe, 'spd') ? 'atk' : 'spa', 1, log)
        break
      }
      case 'intrepid-sword':
        announce(b, log)
        changeStage(b, 'atk', 1, log)
        break
      case 'dauntless-shield':
        announce(b, log)
        changeStage(b, 'def', 1, log)
        break
      case 'supersweet-syrup':
        announce(b, log)
        changeStage(foe, 'eva', -1, log, b)
        break
      case 'trace': {
        const f = abilityOf(foe)
        if (f && !UNCOPYABLE.has(f)) {
          announce(b, log)
          b.vol.ability = f
          log.push(`${josa(b.name, '은', '는')} ${foe.name}의 ${josa(abilityName(f), '을', '를')} 트레이스했다!`)
        }
        break
      }
      case 'pressure':
        announce(b, log)
        log.push(`${josa(b.name, '은', '는')} 프레셔를 발산하고 있다!`)
        break
      case 'mold-breaker':
      case 'teravolt':
      case 'turboblaze':
        announce(b, log)
        log.push(`${josa(b.name, '은', '는')} 틀을 깼다!`)
        break
      case 'neutralizing-gas':
        announce(b, log)
        log.push('주위가 화학변화가스로 가득 찼다!')
        break
      case 'slow-start':
        announce(b, log)
        log.push(`${josa(b.name, '은', '는')} 컨디션이 좋지 않다!`)
        break
      case 'comatose':
        announce(b, log)
        log.push(`${josa(b.name, '은', '는')} 꾸벅꾸벅 졸고 있다!`)
        break
      case 'sword-of-ruin':
      case 'beads-of-ruin':
      case 'tablets-of-ruin':
      case 'vessel-of-ruin': {
        const stat = { 'sword-of-ruin': '방어', 'beads-of-ruin': '특수방어', 'tablets-of-ruin': '공격', 'vessel-of-ruin': '특수공격' }[a]
        announce(b, log)
        log.push(`${b.name}의 재앙으로 주위의 ${josa(stat, '이', '가')} 약해졌다!`)
        break
      }
      case 'unnerve':
      case 'frisk':
      case 'anticipation':
      case 'forewarn':
        announce(b, log)
        break
    }
}

/** 상대를 쓰러뜨려 전투가 끝난 턴의 턴 종료 효과 중 이로운 것만 (판정 강화) */
export function endOfTurnBenefits(b: Battler, foe: Battler): string[] {
  const log: string[] = []
  if (b.hp <= 0) return log
  weatherEndOfTurn(b, foe, log, true)
  const max = maxHpOf(b)
  const a = ab(b, foe)
  if (a === 'poison-heal' && (b.status === 'psn' || b.status === 'tox') && b.hp < max) {
    announce(b, log)
    heal(b, Math.floor(max / 8))
    log.push(`${josa(b.name, '은', '는')} 독으로 체력을 회복했다!`)
  }
  for (const item of itemsOf(b, foe)) {
    if (item !== 'leftovers' && !(item === 'black-sludge' && typesOf(b).includes('poison'))) continue
    if (b.hp >= max) break
    heal(b, Math.floor((max * b.held![item]!) / 16))
    log.push(`${josa(b.name, '은', '는')} ${ro(itemKo(item))} 조금 회복했다!`)
  }
  if (a === 'shed-skin' && b.status && Math.random() < 1 / 3) {
    announce(b, log)
    log.push(`${b.name}의 ${STATUS_LABELS[b.status]} 상태가 나았다!`)
    cureStatus(b)
  }
  return log
}

/** 전투가 끝났을 때 (이긴 쪽). 자연회복·재생력 */
export function onBattleEnd(b: Battler, foe: Battler): string[] {
  const log: string[] = []
  const a = ab(b, foe)
  if (a === 'natural-cure' && b.status) {
    announce(b, log)
    log.push(`${b.name}의 ${STATUS_LABELS[b.status]} 상태가 나았다!`)
    cureStatus(b)
  }
  if (a === 'regenerator' && b.hp > 0 && b.hp < maxHpOf(b)) {
    announce(b, log)
    heal(b, Math.floor(maxHpOf(b) / 3))
    log.push(`${josa(b.name, '은', '는')} 체력을 회복했다!`)
  }
  return log
}

/** 이번 턴에 들어간 공격 (효과음용). def = 맞은 쪽 */
let turnHits: { def: Battler; eff: number; crit: boolean; type: string; status?: boolean }[] | null = null

export interface TurnHit {
  /** 맞은 쪽 */
  target: 'player' | 'enemy'
  /** 타입 상성 배율 (고정 데미지는 1) */
  eff: number
  crit: boolean
  /** 기술 타입 (특성·테라 등으로 바뀐 실제 타입) */
  type: string
  /** 변화기 (데미지 없음) */
  status?: boolean
}

export interface TurnResult {
  lines: string[]
  /** 데미지를 준 공격·성공한 변화기 순서대로 (효과음용) */
  hits: TurnHit[]
  /** 내 포켓몬이 실제로 기술을 썼는지 (PP 소모 판단용) */
  playerMoved: boolean
  /** 내 기술 PP 소모량 (프레셔 = 2) */
  ppCost: number
  /** 상대가 실제로 기술을 썼는지 */
  enemyMoved: boolean
  /** 상대 기술 PP 소모량 (내 포켓몬이 프레셔면 2) */
  enemyPpCost: number
}

/**
 * 한 턴 진행. player/enemy 는 직접 변경됨. playerMove = null 이면 내 쪽은 행동하지 않음 (아이템 사용 등).
 * playerOverride = 내 포켓몬이 실제로 쓰는 기술 (Z기술·다이맥스 기술, PP는 playerMove 에서 소모)
 */
export function runTurn(
  player: Battler,
  enemy: Battler,
  playerMove: string | null,
  enemyMove: string,
  playerOverride?: MoveData,
): TurnResult {
  const log: string[] = []
  const hits: NonNullable<typeof turnHits> = []
  turnHits = hits
  let playerMoved = false
  let enemyMoved = false
  // 다이월·이번 턴 맞았는지는 그 턴에만
  for (const b of [player, enemy]) {
    if (!b.vol) continue
    b.vol.protect = false
    b.vol.hurt = b.vol.hurtPhys = b.vol.beak = false
  }
  // 2턴 기술의 두 번째 턴·구르기 연속 사용: 고른 기술 대신 이어서 씀 (PP 소모 없음)
  const forcedOf = (b: Battler) => b.vol?.charge ?? b.vol?.rolloutMove
  const playerForced = playerMove != null ? forcedOf(player) : undefined
  const enemyForced = forcedOf(enemy)
  if (playerForced) {
    playerMove = playerForced
    playerOverride = undefined
  }
  if (enemyForced) enemyMove = enemyForced
  const pri = (att: Battler, def: Battler, id: string | null) => {
    const m = att === player && playerOverride && id ? playerOverride : id ? moveData(id) : null
    return m ? priorityOf(att, def, m) : 0
  }
  const pp = pri(player, enemy, playerMove)
  const ep = pri(enemy, player, enemyMove)
  // 같은 우선도 안에서 늑장·균사의힘(변화기)은 나중에
  const lagging = (b: Battler, foe: Battler, id: string | null) => {
    const a = ab(b, foe)
    return a === 'stall' || (a === 'mycelium-might' && !!id && moveData(id)?.cls === 'status') ? 1 : 0
  }
  const pl = lagging(player, enemy, playerMove)
  const el = lagging(enemy, player, enemyMove)
  // 같은 우선도 안에서 먼저/나중에 행동하는 도구: 애슈열매·선제공격손톱 (+1) / 느림보꼬리·만복향로 (-1)
  const itemOrder = (b: Battler, foe: Battler, id: string | null) => {
    if (b.vol) b.vol.flinch = false
    if (!id || !itemsOf(b, foe).length) return 0
    if (nItems(b, foe, (x) => LAST_ITEMS.has(x))) return -1
    const pinch = b.hp * (ab(b, foe) === 'gluttony' ? 2 : 4) <= maxHpOf(b)
    if (nItem(b, 'custap-berry', foe) && pinch && canEat(b, foe)) {
      log.push(`${josa(b.name, '은', '는')} ${josa(itemKo('custap-berry'), '을', '를')} 먹고 행동이 빨라졌다!`)
      consumeItem(b, 'custap-berry', foe, log)
      return 1
    }
    if (Math.random() < 0.2 * nItem(b, 'quick-claw', foe)) {
      log.push(`${josa(b.name, '은', '는')} ${ro(itemKo('quick-claw'))} 행동이 빨라졌다!`)
      return 1
    }
    return 0
  }
  const pq = itemOrder(player, enemy, playerMove)
  const eq = itemOrder(enemy, player, enemyMove)
  const ps = speedOf(player, enemy)
  const es = speedOf(enemy, player)
  const playerFirst =
    pp !== ep ? pp > ep : pq !== eq ? pq > eq : pl !== el ? pl < el : ps !== es ? ps > es : Math.random() < 0.5
  const mine: [Battler, Battler, string | null] = [player, enemy, playerMove]
  const theirs: [Battler, Battler, string | null] = [enemy, player, enemyMove]
  const order = playerFirst ? [mine, theirs] : [theirs, mine]
  // 힘껏펀치·트랩셸·부리캐논: 턴이 시작될 때 준비
  for (const [b, , move] of order) {
    if (!move || b.hp <= 0 || b.vol?.recharge || !PREP_MOVES[move]) continue
    log.push(`${josa(b.name, '은', '는')} ${PREP_MOVES[move]}`)
    if (move === 'beak-blast') (b.vol ??= {}).beak = true
  }
  /** 행동하지 못하면 모으던 기술·연속 기술이 끊김 */
  const breakLock = (v: Volatile) => {
    v.charge = v.semi = v.rolloutMove = undefined
    v.rollout = undefined
  }
  order.forEach(([att, def, move], i) => {
    if (!move || att.hp <= 0 || def.hp <= 0) return
    const vol = (att.vol ??= {})
    // 파괴광선 등의 반동
    if (vol.recharge) {
      vol.recharge = false
      log.push(`${josa(att.name, '은', '는')} 공격의 반동으로 움직일 수 없다!`)
      return
    }
    // 게으름: 두 턴에 한 번만 행동
    if (ab(att, def) === 'truant') {
      if (vol.loaf) {
        vol.loaf = false
        announce(att, log)
        log.push(`${josa(att.name, '은', '는')} 게으름을 피우고 있다.`)
        breakLock(vol)
        return
      }
      vol.loaf = true
    }
    if (!canMove(att, def, log, move)) return breakLock(vol)
    // 풀죽음 (왕의징표석 등): 먼저 행동한 상대에게 맞아 이번 턴 행동 불가 (다이맥스 중에는 풀죽지 않음)
    if (vol.flinch && att.dynamax) vol.flinch = false
    if (vol.flinch) {
      vol.flinch = false
      log.push(`${josa(att.name, '은', '는')} 풀이 죽어 기술을 쓸 수 없다!`)
      if (ab(att, def) === 'steadfast') {
        announce(att, log)
        changeStage(att, 'spe', 1, log)
      }
      breakLock(vol)
      return
    }
    const forced = att === player ? playerForced : enemyForced
    if (att === player) playerMoved = !forced
    else enemyMoved = !forced
    // 모아 둔 기술을 씀: 사라진 상태에서 돌아옴
    if (vol.charge) {
      vol.releasing = true
      vol.charge = undefined
      vol.semi = undefined
    }
    // 애널라이즈: 상대가 이미 행동했으면 (나중에 행동)
    useMove(att, def, move, log, i === 1 && !!order[0]![2], att === player ? playerOverride : undefined)
    vol.releasing = false
  })
  // 턴 종료: 화상·독·특성 → 미래예지·멸망의노래 (둘 다 살아 있을 때만)
  if (player.hp > 0 && enemy.hp > 0) {
    const ends = playerFirst ? [[player, enemy], [enemy, player]] : [[enemy, player], [player, enemy]]
    for (const [b, foe] of ends) endOfTurn(b!, foe!, log)
    for (const [b] of ends) delayedEffects(b!, log)
  }
  for (const b of [player, enemy]) if (b.vol) b.vol.beak = false
  const ppCost = ab(enemy, player) === 'pressure' ? 2 : 1
  const enemyPpCost = ab(player, enemy) === 'pressure' ? 2 : 1
  turnHits = null
  return {
    lines: log,
    hits: hits.map((h) => ({ target: h.def === player ? 'player' : 'enemy', eff: h.eff, crit: h.crit, type: h.type, status: h.status })),
    playerMoved,
    ppCost,
    enemyMoved,
    enemyPpCost,
  }
}

// ---------- 기술 배치 ----------
/** 버전 그룹 → 세대 (야생 기술 배치에서 세대 한정 레벨업 기술 판단) */
const VG_GEN: Record<string, number> = {
  'red-blue': 1, yellow: 1,
  'gold-silver': 2, crystal: 2,
  'ruby-sapphire': 3, emerald: 3, 'firered-leafgreen': 3,
  'diamond-pearl': 4, platinum: 4, 'heartgold-soulsilver': 4,
  'black-white': 5, 'black-2-white-2': 5,
  'x-y': 6, 'omega-ruby-alpha-sapphire': 6,
  'sun-moon': 7, 'ultra-sun-ultra-moon': 7, 'lets-go-pikachu-lets-go-eevee': 7,
  'sword-shield': 8, 'brilliant-diamond-shining-pearl': 8, 'legends-arceus': 8,
  'scarlet-violet': 9,
}

/** 원작 야생 포켓몬 규칙: 해당 레벨까지 배운 레벨업 기술 중 마지막 4개 */
export function wildMoveset(species: string, level: number, vg?: string): string[] {
  const dex = dexData.value
  if (!dex) return []
  let list: [number, number][] | undefined = vg ? battleData.value?.wild[vg]?.[species] : undefined
  if (!list) {
    // 해당 게임 데이터가 없으면 통합 레벨업 기술표로 대신 (그 게임 세대에서만 배우는 레벨업 기술 포함)
    const gen = vg ? VG_GEN[vg] : undefined
    list = []
    for (const e of learnsets.value?.[species] ?? []) {
      if (e[1] === 'level') list.push([e[0], e[2]])
      else if (e[1] === 'gen' && e[3]) {
        const lv = gen != null ? e[3][gen] : undefined
        if (lv != null) list.push([e[0], lv])
      }
    }
    list.sort((a, b) => a[1] - b[1])
  }
  const ids: string[] = []
  for (const [num, lv] of list) {
    if (lv > level) continue
    const id = dex.moves[num]?.id
    if (!id) continue
    const i = ids.indexOf(id)
    if (i >= 0) ids.splice(i, 1)
    ids.push(id)
  }
  // 그 레벨까지 배운 기술이 없으면 (통합 기술표는 최신 작품 습득 레벨 기준) 가장 일찍 배우는 공격 기술
  if (!ids.length) {
    const first = list.find(([num]) => dex.moves[num]?.power) ?? list[0]
    const id = first && dex.moves[first[0]]?.id
    if (id) ids.push(id)
  }
  return ids.slice(-4)
}

/** 레벨업 시 새로 배우는 기술 (해금된 세대의 세대 한정 레벨업 기술 포함) */
export function movesLearnedAt(species: string, level: number, unlockedGens: number[]): string[] {
  const dex = dexData.value
  const list = learnsets.value?.[species]
  if (!dex || !list) return []
  const out: string[] = []
  for (const e of list) {
    let hit = false
    if (e[1] === 'level') hit = e[2] === level
    else if (e[1] === 'gen' && e[3]) {
      const lvs = Object.entries(e[3]).filter(([g]) => unlockedGens.includes(Number(g))).map(([, l]) => l)
      hit = lvs.length > 0 && Math.min(...lvs) === level
    }
    const id = hit ? dex.moves[e[0]]?.id : undefined
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/** 1레벨부터 지정 레벨까지 레벨업으로 배울 수 있는 기술 전체 */
export function movesUpToLevel(species: string, level: number, unlockedGens: number[]): string[] {
  const out: string[] = []
  for (let lv = 0; lv <= level; lv++)
    for (const id of movesLearnedAt(species, lv, unlockedGens)) if (!out.includes(id)) out.push(id)
  return out
}

// ---------- 경험치 ----------
export function expAtLevel(species: string, level: number): number {
  const g = battleData.value?.species[species]?.growth ?? 2
  return battleData.value?.growth[g]?.[Math.max(1, Math.min(100, level))] ?? 0
}

/** 5세대 이후 경험치 공식. trainer = 트레이너(보스) 배틀 1.5배, multiplier = 난이도 등 추가 배율 */
export function expGain(foe: string, foeLevel: number, myLevel: number, trainer: boolean, multiplier = 1): number {
  const b = battleData.value?.species[foe]?.exp ?? 50
  const a = trainer ? 1.5 : 1
  const scale = Math.pow((2 * foeLevel + 10) / (foeLevel + myLevel + 10), 2.5)
  return Math.floor(((a * b * foeLevel) / 5) * scale * multiplier) + 1
}
