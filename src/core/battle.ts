// 전투 계산 (5세대 이후 공식 기준). 상태 저장과 무관한 순수 계산만 담당
import { battleData, STATUS_LABELS, type MoveExtra, type MoveFlag, type StageKey, type Status } from '../data/battle'
import { dexData, learnsets, type DexEntry, type MoveInfo } from '../data/dex'
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

export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTIES: { id: Difficulty; label: string; desc: string }[] = [
  { id: 'easy', label: '쉬움', desc: '상대가 기술을 완전히 무작위로 고릅니다. 경험치 0.75배.' },
  { id: 'normal', label: '보통', desc: '상대가 지금 내 포켓몬에게 가장 강한 기술을 우선 씁니다. 경험치 1배.' },
  {
    id: 'hard',
    label: '어려움',
    desc: '상대가 특성까지 고려해 가장 강한 기술을 씁니다. 야생 포켓몬도 숨겨진 특성을 가질 수 있습니다. 경험치 1.25배.',
  },
]

/** 난이도별 경험치 배율 */
export const DIFFICULTY_EXP: Record<Difficulty, number> = { easy: 0.75, normal: 1, hard: 1.25 }

/** 기술 선택 방식: random = 무작위, strong = 가장 강한 기술, smart = 특성까지 고려 */
export type AiMode = 'random' | 'strong' | 'smart'
export const DIFFICULTY_AI: Record<Difficulty, AiMode> = { easy: 'random', normal: 'strong', hard: 'smart' }

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
}

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
  /** 지닌 도구 identifier (전투 중 사라지면 null) */
  item?: string | null
  vol?: Volatile
  /** 상대가 아는 이 포켓몬의 특성 정보 */
  intel?: AbilityIntel
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

export const speciesOf = (id: string): DexEntry | undefined => dexData.value?.index.find((p) => p.id === id)

export function statsOf(b: Pick<Battler, 'species' | 'level' | 'ivs' | 'evs' | 'nature'>): number[] {
  const sp = speciesOf(b.species)
  return sp ? calcStats(sp.stats, b.level, b.ivs, b.evs, b.nature, b.species) : [1, 1, 1, 1, 1, 1]
}

export const maxHpOf = (b: Pick<Battler, 'species' | 'level' | 'ivs' | 'evs' | 'nature'>) => statsOf(b)[0]!

// ---------- 특성 ----------
/** 지금 가진 특성 (바뀐 특성 우선) */
export const abilityOf = (b: Battler): string | null => b.vol?.ability ?? b.ability ?? null

/** 실제로 효과가 있는 특성. 상대가 화학변화가스면 없음 */
export function activeAbility(b: Battler, foe: Battler): string | null {
  const a = abilityOf(b)
  if (!a) return null
  // 특성가드: 화학변화가스의 영향을 받지 않음
  if (abilityOf(foe) === 'neutralizing-gas' && a !== 'neutralizing-gas' && b.item !== 'ability-shield') return null
  return a
}
const ab = activeAbility
/** 방어 측 특성 (공격 측이 틀깨기 계열이면 무시, 특성가드면 무시되지 않음) */
function defAb(def: Battler, att: Battler): string | null {
  const d = ab(def, att)
  if (!d) return null
  const a = ab(att, def)
  if (a && BREAKERS.has(a) && !UNBREAKABLE.has(d) && def.item !== 'ability-shield') return null
  return d
}

// ---------- 지닌 도구 ----------
const itemKo = (id: string) => dexData.value?.items[id]?.ko ?? id
/** 효과가 있는 지닌 도구 (서투름 특성이면 없음) */
function itemOf(b: Battler, foe?: Battler): string | null {
  if (!b.item) return null
  if ((foe ? ab(b, foe) : abilityOf(b)) === 'klutz') return null
  return b.item
}
const isBerry = (id: string) => id.endsWith('-berry')
/** 열매를 먹을 수 있는지 (상대가 긴장감이면 없음) */
function canEat(b: Battler, foe?: Battler): boolean {
  return !foe || !UNNERVE.has(ab(foe, b) ?? '')
}
/** 도구 사용 후 사라짐. 볼주머니: 열매를 먹으면 HP 1/3 회복, 곡예: 스피드 2배 */
function consumeItem(b: Battler, foe: Battler | undefined, log: string[]) {
  const id = b.item
  if (!id) return
  b.item = null
  const a = foe ? ab(b, foe) : abilityOf(b)
  if (a === 'unburden') (b.vol ??= {}).unburden = true
  if (isBerry(id) && a === 'cheek-pouch' && b.hp > 0 && b.hp < maxHpOf(b)) {
    announce(b, log)
    heal(b, Math.floor(maxHpOf(b) / 3))
    log.push(`${josa(b.name, '은', '는')} 체력을 회복했다!`)
  }
}
/** 진화할 수 있는 포켓몬인지 (진화의휘석) */
const canEvolve = (species: string) => evolutionsOf(species).length > 0
/** 기술을 고를 수 있는지 (구애 도구로 고정 / 돌격조끼면 변화기 불가) */
export function selectableMoves(b: Battler, moves: string[]): string[] {
  const item = itemOf(b)
  let list = moves
  if (item === 'assault-vest') list = list.filter((id) => moveData(id)?.cls !== 'status')
  const lock = b.vol?.choice
  if (lock && item && CHOICE_ITEMS.has(item) && list.includes(lock)) list = [lock]
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

/** 타입 (변환자재 등으로 바뀐 타입 우선) */
export const typesOf = (b: Battler): string[] => b.vol?.types ?? speciesOf(b.species)?.types ?? []
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
  if (a === 'unburden' && b.vol?.unburden && !b.item) s *= 2
  const item = itemOf(b, foe)
  if (item === 'choice-scarf') s = Math.floor(s * 1.5)
  else if (item && SLOW_ITEMS.has(item)) s = Math.floor(s * 0.5)
  else if (item === 'quick-powder' && b.species === 'ditto') s *= 2
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
  const item = itemOf(def, att)
  const grounded = item === 'iron-ball' && type === 'ground'
  return typesOf(def).reduce((acc, t) => {
    const x = chart?.[t] ?? 1
    const ignore = x === 0 && ((scrappy && t === 'ghost') || item === 'ring-target' || (grounded && t === 'flying'))
    return acc * (ignore ? 1 : x)
  }, 1)
}

const isDamaging = (m: MoveData) => m.cls !== 'status' && (m.power != null || m.extra.fixed != null)
/** 자신에게 쓰는 변화기 */
const isSelfMove = (m: MoveData) => m.cls === 'status' && !!(m.extra.self || (m.extra.heal && !m.extra.stats))
/** 회복 기술 (힐링시프트 대상) */
const isHealMove = (m: MoveData) => !!m.extra.heal || (m.extra.drain ?? 0) > 0
/** 부가 효과가 있는 공격기 (우격다짐 대상) */
const hasSecondary = (m: MoveData) => m.cls !== 'status' && (!!m.extra.ail || (!!m.extra.stats && m.extra.chance != null))

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
  const item = itemOf(def, att)
  if (item === 'air-balloon' && type === 'ground' && isDamaging(m)) return { by: 'item', item }
  if (item === 'safety-goggles' && hasFlag(m, 'powder')) return { by: 'item', item }
  if (d) {
    const abs = ABSORB[d]
    // 부유는 공격기만 막음 (검은철구를 지니면 막지 못함)
    if (abs && abs[0] === type && (d !== 'levitate' || (isDamaging(m) && item !== 'iron-ball'))) return { by: 'ability', fx: abs[1] }
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
  const a = ab(att, def)
  const d = defAb(def, att)
  const physical = m.cls === 'physical'

  // 위력
  let power = (m.power ?? 0) * pow
  if (a === 'technician' && (m.power ?? 0) <= 60) power *= 1.5
  if (a && FLAG_POWER[a] && hasFlag(m, FLAG_POWER[a]![0])) power *= FLAG_POWER[a]![1]
  if (a && TYPE_POWER[a] && TYPE_POWER[a]![0] === type) power *= TYPE_POWER[a]![1]
  if (a === 'reckless' && (m.extra.drain ?? 0) < 0) power *= 1.2
  if (a === 'sheer-force' && hasSecondary(m)) power *= 1.3
  if (a === 'analytic' && opts.last) power *= 1.3
  // 도구: 타입 강화·전용 구슬·주얼·힘의머리띠·박식안경·펀치글러브
  const ai = itemOf(att, def)
  if (ai) {
    if (TYPE_BOOST[ai] === type) power *= 1.2
    const orb = ORBS[ai]
    if (orb && orb.species.includes(att.species) && orb.types.includes(type)) power *= 1.2
    if (GEMS[ai] === type && fx == null) power *= 1.3
    if (ai === 'muscle-band' && physical) power *= 1.1
    if (ai === 'wise-glasses' && m.cls === 'special') power *= 1.1
    if (ai === 'punching-glove' && hasFlag(m, 'punch')) power *= 1.1
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
  if (ai === (physical ? 'choice-band' : 'choice-specs')) A *= 1.5
  if (ai === 'light-ball' && att.species.startsWith('pikachu')) A *= 2
  if (ai === 'thick-club' && physical && (att.species.startsWith('cubone') || att.species.startsWith('marowak'))) A *= 2
  if (ai === 'deep-sea-tooth' && !physical && att.species === 'clamperl') A *= 2
  const di = itemOf(def, att)
  if (di === 'eviolite' && canEvolve(def.species)) D *= 1.5
  if (di === 'assault-vest' && !physical) D *= 1.5
  if (di === 'deep-sea-scale' && !physical && def.species === 'clamperl') D *= 2
  if (di === 'metal-powder' && physical && def.species === 'ditto') D *= 2
  A = Math.max(1, Math.floor(A))
  D = Math.max(1, Math.floor(D))

  let dmg = Math.floor(Math.floor((Math.floor((2 * att.level) / 5 + 2) * power * A) / D) / 50) + 2
  if (crit) dmg = Math.floor(dmg * (a === 'sniper' ? 2.25 : 1.5))
  dmg = Math.floor((dmg * rand) / 100)
  if (type !== 'typeless' && typesOf(att).includes(type)) dmg = Math.floor(dmg * (a === 'adaptability' ? 2 : 1.5))
  dmg = Math.floor(dmg * eff)
  if (a === 'tinted-lens' && eff < 1) dmg = Math.floor(dmg * 2)
  // 화상: 물리 데미지 절반 (근성은 제외)
  if (physical && att.status === 'brn' && a !== 'guts') dmg = Math.floor(dmg / 2)
  dmg = Math.floor(dmg * defMult(d, def, m, type, eff))
  // 도구: 달인의띠·생명의구슬·메트로놈 / 반감 열매
  if (ai === 'expert-belt' && eff > 1) dmg = Math.floor(dmg * 1.2)
  if (ai === 'life-orb') dmg = Math.floor(dmg * 1.3)
  if (ai === 'metronome') dmg = Math.floor(dmg * Math.min(2, 1 + 0.2 * (att.vol?.streak ?? 0)))
  if (resistBerryActive(att, def, type, eff)) dmg = Math.floor(dmg / 2)
  return Math.max(1, dmg)
}

/** 반감 열매가 이번 공격에 발동하는지 */
function resistBerryActive(att: Battler, def: Battler, type: string, eff: number): boolean {
  const di = itemOf(def, att)
  const t = di ? RESIST_BERRY[di] : undefined
  return !!t && t === type && (eff > 1 || t === 'normal') && canEat(def, att)
}

function avgHits(att: Battler, def: Battler, m: MoveData) {
  const h = m.extra.hits
  if (!h) return 1
  if (ab(att, def) === 'skill-link') return h[1]
  // 2~5회: 2·3회 35%, 4·5회 15% (속임수주사위: 4~5회)
  if (h[0] === 2 && h[1] === 5) return itemOf(att, def) === 'loaded-dice' ? 4.5 : 3.1
  return (h[0] + h[1]) / 2
}

/** 명중률 (0~1). last = 이번 턴에 나중에 행동 (포커스렌즈) */
function accuracyOf(att: Battler, def: Battler, m: MoveData, last = false): number {
  const a = ab(att, def)
  const d = defAb(def, att)
  if (a === 'no-guard' || ab(def, att) === 'no-guard' || m.acc == null) return 1
  const accStage = d === 'unaware' ? 0 : (att.stages.acc ?? 0)
  const evaStage = a === 'unaware' || a === 'keen-eye' || a === 'minds-eye' || a === 'illuminate' ? 0 : (def.stages.eva ?? 0)
  let acc = (m.acc / 100) * accStageMult(accStage - evaStage)
  if (a === 'compound-eyes') acc *= 1.3
  if (a === 'victory-star') acc *= 1.1
  if (a === 'hustle' && m.cls === 'physical') acc *= 0.8
  if (d === 'wonder-skin' && m.cls === 'status') acc = Math.min(acc, 0.5)
  const ai = itemOf(att, def)
  if (ai === 'wide-lens') acc *= 1.1
  if (ai === 'zoom-lens' && last) acc *= 1.2
  if (att.vol?.micle) acc *= 1.2
  const di = itemOf(def, att)
  if (di && EVASION_ITEMS.has(di)) acc *= 0.9
  return Math.min(1, acc)
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

// ---------- AI ----------
/**
 * 기술 선택.
 * random = 무작위 / strong = 특성을 모른다고 보고 기대 데미지가 가장 큰 기술 /
 * smart = 상대 특성 후보(def.intel)와 자신의 특성까지 고려해 기대 데미지가 가장 큰 기술
 */
export function chooseMove(att: Battler, def: Battler, mode: AiMode): string {
  const moves = selectableMoves(att, att.moves).map(moveData).filter((m): m is MoveData => !!m)
  if (!moves.length) return 'struggle'
  if (mode === 'random') return moves[Math.floor(Math.random() * moves.length)]!.id
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
  }
  let best: MoveData[] = []
  let bestDmg = -Infinity
  for (const m of moves) {
    const d = foes.reduce((sum, f) => sum + Math.min(expectedDamage(me, f, m), f.hp), 0) / foes.length
    if (d > bestDmg + 1e-9) {
      best = [m]
      bestDmg = d
    } else if (Math.abs(d - bestDmg) < 1e-9) best.push(m)
  }
  // 공격기가 하나도 효과가 없으면 (모두 0 이하) 손해 보지 않는 기술 중 무작위
  const pool = bestDmg > 0 ? best : moves.filter((m) => foes.every((f) => expectedDamage(me, f, m) >= 0))
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
    const guard = itemOf(target, source) === 'clear-amulet' ? itemKo('clear-amulet') : (target.vol?.mist ?? 0) > 0 ? itemKo('guard-spec') : null
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
  const item = itemOf(att, def)
  let s = (m.extra.crit ?? 0) + (ab(att, def) === 'super-luck' ? 1 : 0) + (att.vol?.critBoost ?? 0)
  if (item && CRIT_ITEMS.has(item)) s += 1
  if (item && CRIT_SPECIES_ITEMS[item]?.includes(att.species)) s += 2
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
  const item = itemOf(b, foe)
  if (!item || !b.status || !STATUS_BERRY[item]?.includes(b.status) || !canEat(b, foe)) return
  log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹고 ${STATUS_LABELS[b.status]} 상태가 나았다!`)
  cureStatus(b)
  consumeItem(b, foe, log)
}

/** HP가 줄었을 때 발동하는 도구 (회복 열매·핀치 열매) */
function checkHpItems(b: Battler, foe: Battler, log: string[]) {
  const item = itemOf(b, foe)
  if (!item || b.hp <= 0 || (isBerry(item) && !canEat(b, foe))) return
  const max = maxHpOf(b)
  const gluttony = ab(b, foe) === 'gluttony'
  const pinch = b.hp * (gluttony ? 2 : 4) <= max
  const h = HEAL_HELD[item]
  if (h) {
    if (b.hp > max * (gluttony && h.at < 0.5 ? 0.5 : h.at)) return
    const amount = h.frac ? Math.floor(max * h.frac) : h.hp!
    heal(b, amount)
    log.push(`${josa(b.name, '은', '는')} ${ro(itemKo(item))} 체력을 회복했다!`)
    consumeItem(b, foe, log)
    return
  }
  if (!pinch) return
  const stat = PINCH_BERRY[item]
  if (stat) {
    if ((b.stages[stat] ?? 0) >= 6) return
    log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹었다!`)
    changeStage(b, stat, 1, log)
    consumeItem(b, foe, log)
  } else if (item === 'starf-berry') {
    const keys = (['atk', 'def', 'spa', 'spd', 'spe'] as StageKey[]).filter((k) => (b.stages[k] ?? 0) < 6)
    const k = keys[Math.floor(Math.random() * keys.length)]
    if (!k) return
    log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹었다!`)
    changeStage(b, k, 2, log)
    consumeItem(b, foe, log)
  } else if (item === 'lansat-berry') {
    const vol = (b.vol ??= {})
    vol.critBoost = (vol.critBoost ?? 0) + 2
    log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹고 기합이 들어갔다!`)
    consumeItem(b, foe, log)
  } else if (item === 'micle-berry') {
    ;(b.vol ??= {}).micle = true
    log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹고 다음 기술의 명중률이 올라갔다!`)
    consumeItem(b, foe, log)
  }
}

/** 하양허브: 떨어진 능력을 원래대로 */
function checkWhiteHerb(b: Battler, foe: Battler, log: string[]) {
  if (itemOf(b, foe) !== 'white-herb' || b.hp <= 0) return
  const low = (Object.keys(b.stages) as StageKey[]).filter((k) => (b.stages[k] ?? 0) < 0)
  if (!low.length) return
  for (const k of low) b.stages[k] = 0
  log.push(`${josa(b.name, '은', '는')} ${ro(itemKo('white-herb'))} 떨어진 능력을 원래대로 되돌렸다!`)
  consumeItem(b, foe, log)
}

export function cureStatus(b: Pick<Battler, 'status' | 'sleep' | 'toxic'>) {
  b.status = null
  b.sleep = undefined
  b.toxic = undefined
}

/** 행동 전 상태이상 판정. 행동할 수 있으면 true */
function canMove(att: Battler, foe: Battler, log: string[]): boolean {
  switch (att.status) {
    case 'slp':
      if ((att.sleep ?? 0) > 0) {
        // 일찍기상: 2배 빨리 깸
        att.sleep = Math.max(0, (att.sleep ?? 1) - (ab(att, foe) === 'early-bird' ? 2 : 1))
        if (att.sleep > 0 || ab(att, foe) !== 'early-bird') {
          log.push(`${josa(att.name, '은', '는')} 쿨쿨 잠들어 있다.`)
          return false
        }
      }
      cureStatus(att)
      log.push(`${josa(att.name, '은', '는')} 눈을 떴다!`)
      return true
    case 'frz':
      if (Math.random() < 0.2) {
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
function endOfTurn(b: Battler, foe: Battler, log: string[]) {
  if (b.hp <= 0) return
  const max = maxHpOf(b)
  const a = ab(b, foe)
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
  const item = itemOf(b, foe)
  if (item === 'leftovers' || (item === 'black-sludge' && typesOf(b).includes('poison'))) {
    if (b.hp < max) {
      heal(b, Math.floor(max / 16))
      log.push(`${josa(b.name, '은', '는')} ${ro(itemKo(item))} 조금 회복했다!`)
    }
  } else if (item === 'black-sludge' || item === 'sticky-barb') {
    if (indirect(b, foe, Math.floor(max / 8))) log.push(`${josa(b.name, '은', '는')} ${ro(itemKo(item))} 데미지를 입었다!`)
  }
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
  if (item === 'toxic-orb' || item === 'flame-orb') {
    const s: Status = item === 'toxic-orb' ? 'tox' : 'brn'
    if (canInflict(b, s)) inflictStatus(b, s, log, false)
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
  let did = false
  if (ex.heal) {
    const max = maxHpOf(user)
    const before = user.hp
    user.hp = Math.min(max, user.hp + Math.floor((max * ex.heal) / 100))
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

/** 기술 사용. last = 이번 턴에 나중에 행동 (애널라이즈·포커스렌즈), first = 먼저 행동 (풀죽음) */
function useMove(att: Battler, def: Battler, moveId: string, log: string[], last: boolean) {
  const m = moveData(moveId) ?? STRUGGLE
  const ex = m.extra
  const a = ab(att, def)
  const vol = (att.vol ??= {})
  const ai = itemOf(att, def)

  // 메트로놈(도구): 같은 기술을 연속으로 쓴 횟수
  vol.streak = vol.lastMove === m.id ? (vol.streak ?? 0) + 1 : 0
  vol.lastMove = m.id
  // 구애 도구: 처음 쓴 기술로 고정
  if (ai && CHOICE_ITEMS.has(ai) && m.id !== 'struggle' && !vol.choice) vol.choice = m.id

  // 변환자재·리베로: 기술을 쓰기 전에 그 기술의 타입으로 (전투마다 한 번)
  if ((a === 'protean' || a === 'libero') && !vol.protean && m.type !== 'typeless') {
    const t = typesOf(att)
    if (t.length !== 1 || t[0] !== m.type) {
      vol.types = [m.type]
      vol.protean = true
      announce(att, log)
      log.push(`${josa(att.name, '은', '는')} ${typeKo(m.type)} 타입이 되었다!`)
    }
  }
  log.push(`${att.name}의 ${m.ko}!`)

  const selfOnly = isSelfMove(m)
  // 명중 판정 (자신에게 쓰는 변화기는 생략)
  const hit = selfOnly || Math.random() < accuracyOf(att, def, m, last)
  if (!selfOnly && vol.micle) vol.micle = false
  if (!hit) {
    log.push(`그러나 ${att.name}의 공격은 빗나갔다!`)
    // 허탕보험: 빗나가면 스피드 +2
    if (ai === 'blunder-policy' && m.acc != null) {
      log.push(`${josa(itemKo(ai), '이', '가')} 발동했다!`)
      changeStage(att, 'spe', 2, log)
      consumeItem(att, def, log)
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
    applyStatusMove(att, def, m, log)
    afterMove(att, def, m, log)
    return
  }

  // 공격기
  const d = defAb(def, att)
  const contact = hasFlag(m, 'contact')
  // 방호패드: 접촉으로 생기는 효과를 받지 않음
  const contactFx = contact && ai !== 'protective-pads'
  const physical = m.cls === 'physical'
  const hits = ex.hits ? (a === 'skill-link' ? ex.hits[1] : rollHits(ex.hits, ai === 'loaded-dice')) : 1
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
    const berry = resistBerryActive(att, def, type, eff) ? def.item : null
    const gem = att.item && GEMS[att.item] === type && ai === att.item && ex.fixed == null ? att.item : null
    let dmg = Math.min(def.hp, damageOf(att, def, m, 85 + Math.floor(Math.random() * 16), crit, { last }))
    if (gem) {
      log.push(`${ro(itemKo(gem))} ${m.ko}의 위력이 올라갔다!`)
      consumeItem(att, def, log)
    }
    if (berry) {
      log.push(`${ro(itemKo(berry))} ${def.name}에게 주는 데미지가 줄었다!`)
      consumeItem(def, att, log)
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
      const di = itemOf(def, att)
      if ((di === 'focus-sash' && full) || (di === 'focus-band' && Math.random() < 0.1)) {
        dmg = def.hp - 1
        post.push(`${josa(def.name, '은', '는')} ${ro(itemKo(di))} 버텼다!`)
        if (di === 'focus-sash') consumeItem(def, att, post)
      }
    }
    if (defMult(d, def, m, type, eff) !== 1) revealed = true
    hpBeforeLast = def.hp
    def.hp -= dmg
    total += dmg
    landed++
    if (crit) crits++
    // 풍선: 공격을 받으면 터짐
    if (def.item === 'air-balloon' && dmg > 0) {
      post.push(`${def.name}의 ${josa(itemKo('air-balloon'), '이', '가')} 터졌다!`)
      consumeItem(def, att, post)
    }
    // 울퉁불퉁멧: 접촉한 상대에게 최대 HP 1/6 데미지
    if (contactFx && itemOf(def, att) === 'rocky-helmet' && indirect(att, def, Math.floor(maxHpOf(att) / 6)))
      post.push(`${josa(att.name, '은', '는')} ${ro(itemKo('rocky-helmet'))} 데미지를 입었다!`)
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
    const di = itemOf(def, att)
    const hb = di ? HIT_BOOST[di] : undefined
    if (hb && (hb.type ? hb.type === type : hb.cls === m.cls) && (!isBerry(di!) || canEat(def, att)) && (def.stages[hb.stat] ?? 0) < 6) {
      post.push(`${def.name}의 ${josa(itemKo(di!), '이', '가')} 발동했다!`)
      changeStage(def, hb.stat, 1, post)
      consumeItem(def, att, post)
    }
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
        att.item !== 'ability-shield'
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
        ai !== 'safety-goggles' &&
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
    if (chain && d !== 'shield-dust' && di !== 'covert-cloak' && canInflict(def, chain, att) && Math.random() < 0.3) {
      announce(att, post)
      inflictStatus(def, chain, post, false, att)
    }
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
  const di = itemOf(def, att)
  if (total > 0 && di) {
    if (di === 'weakness-policy' && eff > 1 && def.hp > 0 && ex.fixed == null) {
      log.push(`${def.name}의 ${josa(itemKo(di), '이', '가')} 발동했다!`)
      changeStage(def, 'atk', 2, log)
      changeStage(def, 'spa', 2, log)
      consumeItem(def, att, log)
    } else if ((di === 'jaboca-berry' && physical) || (di === 'rowap-berry' && m.cls === 'special')) {
      if (canEat(def, att)) {
        consumeItem(def, att, log)
        if (indirect(att, def, Math.floor(maxHpOf(att) / 8))) log.push(`${josa(att.name, '은', '는')} ${def.name}의 ${ro(itemKo(di))} 데미지를 입었다!`)
      }
    } else if (di === 'enigma-berry' && eff > 1 && def.hp > 0 && canEat(def, att)) {
      heal(def, Math.floor(maxHpOf(def) / 4))
      log.push(`${josa(def.name, '은', '는')} ${ro(itemKo(di))} 체력을 회복했다!`)
      consumeItem(def, att, log)
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
        heal(att, ai === 'big-root' ? Math.floor(amount * 1.3) : amount)
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
    if (ai === 'shell-bell' && att.hp < maxHpOf(att)) {
      heal(att, Math.floor(total / 8))
      log.push(`${josa(att.name, '은', '는')} ${ro(itemKo(ai))} 체력을 조금 회복했다!`)
    }
    if (ai === 'life-orb' && !(a === 'sheer-force' && hasSecondary(m)) && indirect(att, def, Math.floor(maxHpOf(att) / 10)))
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
    if (d === 'color-change' && type !== 'typeless' && !typesOf(def).includes(type)) {
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
    if (ai && FLINCH_ITEMS.has(ai) && !last && ab(def, att) !== 'inner-focus' && d !== 'shield-dust' && di !== 'covert-cloak') {
      if (Math.random() < 0.1 * (a === 'serene-grace' ? 2 : 1)) (def.vol ??= {}).flinch = true
    }
  }

  // 부가 효과 (우격다짐 = 없음, 인분·은밀망토 = 상대에게 거는 효과 없음, 하늘의은총 = 확률 2배)
  if (!(a === 'sheer-force' && hasSecondary(m))) {
    const chanceMult = a === 'serene-grace' ? 2 : 1
    const shield = d === 'shield-dust' || itemOf(def, att) === 'covert-cloak'
    if (ex.stats && (ex.chance == null || Math.random() * 100 < ex.chance * chanceMult)) {
      const target = ex.self ? att : def
      if (target.hp > 0 && (ex.self || !shield)) {
        for (const [key, delta] of ex.stats) if (key !== 'hp') changeStage(target, key, delta, log, ex.self ? undefined : att)
      }
    }
    if (ex.ail && !shield && def.hp > 0 && total > 0 && (ex.ailChance == null || Math.random() * 100 < ex.ailChance * chanceMult)) {
      inflictStatus(def, ex.ail, log, false, att)
    }
  }
  afterMove(att, def, m, log)
}

/** 기술을 쓴 뒤: 목스프레이, 양쪽의 회복 열매·핀치 열매·하양허브 */
function afterMove(att: Battler, def: Battler, m: MoveData, log: string[]) {
  if (itemOf(att, def) === 'throat-spray' && hasFlag(m, 'sound') && att.hp > 0 && (att.stages.spa ?? 0) < 6) {
    log.push(`${att.name}의 ${josa(itemKo('throat-spray'), '이', '가')} 발동했다!`)
    changeStage(att, 'spa', 1, log)
    consumeItem(att, def, log)
  }
  for (const [b, foe] of [[def, att], [att, def]] as const) {
    checkHpItems(b, foe, log)
    checkWhiteHerb(b, foe, log)
  }
}

/** 전투 시작 시 특성 발동 (위협·다운로드·트레이스 등). 빠른 쪽부터. 로그 반환 */
export function onEntry(player: Battler, enemy: Battler): string[] {
  const log: string[] = []
  const ps = speedOf(player, enemy)
  const es = speedOf(enemy, player)
  const order: [Battler, Battler][] = ps >= es ? [[player, enemy], [enemy, player]] : [[enemy, player], [player, enemy]]
  for (const [b, foe] of order) {
    b.vol ??= {}
    const a = ab(b, foe)
    if (!a) continue
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
        if (itemOf(foe, b) === 'adrenaline-orb' && (foe.stages.spe ?? 0) < 6) {
          log.push(`${foe.name}의 ${josa(itemKo('adrenaline-orb'), '이', '가')} 발동했다!`)
          changeStage(foe, 'spe', 1, log)
          consumeItem(foe, b, log)
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
  // 시작 시 발동하지 않았으면 그런 특성은 아님
  for (const b of [player, enemy]) ruleOut(b, (c) => ENTRY_ABILITIES.has(abilityOf(c) ?? ''))
  // 도구: 풍선 / 하양허브 (위협 등으로 떨어진 능력)
  for (const [b, foe] of order) {
    if (itemOf(b, foe) === 'air-balloon') log.push(`${josa(b.name, '은', '는')} ${ro(itemKo('air-balloon'))} 떠 있다!`)
    checkWhiteHerb(b, foe, log)
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

export interface TurnResult {
  lines: string[]
  /** 내 포켓몬이 실제로 기술을 썼는지 (PP 소모 판단용) */
  playerMoved: boolean
  /** 내 기술 PP 소모량 (프레셔 = 2) */
  ppCost: number
}

/** 한 턴 진행. player/enemy 는 직접 변경됨. playerMove = null 이면 내 쪽은 행동하지 않음 (아이템 사용 등) */
export function runTurn(player: Battler, enemy: Battler, playerMove: string | null, enemyMove: string): TurnResult {
  const log: string[] = []
  let playerMoved = false
  const pri = (att: Battler, def: Battler, id: string | null) => {
    const m = id ? moveData(id) : null
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
    const item = itemOf(b, foe)
    if (!id || !item) return 0
    if (LAST_ITEMS.has(item)) return -1
    const pinch = b.hp * (ab(b, foe) === 'gluttony' ? 2 : 4) <= maxHpOf(b)
    if (item === 'custap-berry' && pinch && canEat(b, foe)) {
      log.push(`${josa(b.name, '은', '는')} ${josa(itemKo(item), '을', '를')} 먹고 행동이 빨라졌다!`)
      consumeItem(b, foe, log)
      return 1
    }
    if (item === 'quick-claw' && Math.random() < 0.2) {
      log.push(`${josa(b.name, '은', '는')} ${ro(itemKo(item))} 행동이 빨라졌다!`)
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
  order.forEach(([att, def, move], i) => {
    if (!move || att.hp <= 0 || def.hp <= 0) return
    // 게으름: 두 턴에 한 번만 행동
    const vol = (att.vol ??= {})
    if (ab(att, def) === 'truant') {
      if (vol.loaf) {
        vol.loaf = false
        announce(att, log)
        log.push(`${josa(att.name, '은', '는')} 게으름을 피우고 있다.`)
        return
      }
      vol.loaf = true
    }
    if (!canMove(att, def, log)) return
    // 풀죽음 (왕의징표석 등): 먼저 행동한 상대에게 맞아 이번 턴 행동 불가
    if (vol.flinch) {
      vol.flinch = false
      log.push(`${josa(att.name, '은', '는')} 풀이 죽어 기술을 쓸 수 없다!`)
      if (ab(att, def) === 'steadfast') {
        announce(att, log)
        changeStage(att, 'spe', 1, log)
      }
      return
    }
    if (att === player) playerMoved = true
    // 애널라이즈: 상대가 이미 행동했으면 (나중에 행동)
    useMove(att, def, move, log, i === 1 && !!order[0]![2])
  })
  // 턴 종료: 화상·독·특성 (둘 다 살아 있을 때만)
  if (player.hp > 0 && enemy.hp > 0) {
    for (const [b, foe] of playerFirst ? [[player, enemy], [enemy, player]] : [[enemy, player], [player, enemy]])
      endOfTurn(b!, foe!, log)
  }
  const ppCost = ab(enemy, player) === 'pressure' ? 2 : 1
  return { lines: log, playerMoved, ppCost }
}

// ---------- 기술 배치 ----------
/** 원작 야생 포켓몬 규칙: 해당 레벨까지 배운 레벨업 기술 중 마지막 4개 */
export function wildMoveset(species: string, level: number, vg?: string): string[] {
  const dex = dexData.value
  if (!dex) return []
  let list: [number, number][] | undefined = vg ? battleData.value?.wild[vg]?.[species] : undefined
  if (!list) {
    // 해당 게임 데이터가 없으면 통합 레벨업 기술표로 대신
    list = (learnsets.value?.[species] ?? [])
      .filter((e): e is [number, 'level', number] => e[1] === 'level')
      .map((e) => [e[0], e[2]] as [number, number])
      .sort((a, b) => a[1] - b[1])
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
