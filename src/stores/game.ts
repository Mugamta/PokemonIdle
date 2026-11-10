import { defineStore } from 'pinia'
import {
  chooseMove,
  cureStatus,
  DIFFICULTY_AI,
  onBattleEnd,
  onEntry,
  expAtLevel,
  expectedDamage,
  expGain,
  moveData,
  maxHpOf,
  movesLearnedAt,
  movesUpToLevel,
  runTurn,
  josa,
  ro,
  selectableMoves,
  speciesOf,
  wildMoveset,
  type Battler,
  type TurnResult,
  type Difficulty,
  DIFFICULTY_EXP,
  type Stages,
  type AbilityIntel,
  type AiMode,
  type Volatile,
  type MoveData,
  onAbilityChange,
} from '../core/battle'
import {
  DYNAMAX_TURNS,
  formOf,
  GIMMICK_INFO,
  GIMMICKS,
  isMegaItem,
  maxMove,
  megaFormFor,
  TERA_SHARD_COST,
  teraShardOf,
  Z_CRYSTALS,
  zEligible,
  zMove,
  type ActiveGimmick,
  type Gimmick,
} from '../core/gimmicks'
import { abilityName, hiddenAbility, normalAbilities, speciesAbilities } from '../core/abilities'
import { phaseAt } from '../core/dayNight'
import { battleData, STATUS_LABELS, type StageKey, type Status } from '../data/battle'
import { dexData, learnsets, STAT_LABELS } from '../data/dex'
import {
  evolutionsOf,
  FRIENDSHIP_EVOLVE,
  FRIENDSHIP_MAX,
  LINKING_CORD,
  type Evolution,
} from '../data/evolutions'
import { calcStats } from '../data/natures'
import { encountersAt, type EncounterSet } from '../data/encounters'
import { HOME_TOWNS, nearestTown } from '../data/mapGraph'
import { NATURES } from '../data/natures'
import type { SpriteDefault } from '../data/sprites'
import {
  AUTO_CENTER_PERK,
  AUTO_CENTER_PP_RATIO,
  type AutoCenterPriority,
  BOSS_INTRO_PERK,
  DEX_REVEAL_PERK,
  BOTTLE_CAP_LEVEL,
  CHAIN_PERKS,
  EV_TOTAL_MAX,
  HEART_SCALE,
  evBreak2Price,
  evStatCap,
  PP_UP_MAX,
  trainItem,
  type TrainItem,
  SPEED_DELAY_MS,
  type SpeedKind,
  AUTO_HEAL_THRESHOLDS,
  DEFAULT_AUTO_BUY,
  EVERSTONE_ITEM,
  extraSlotPrice,
  gimmickItemOf,
  PERKS,
  priceOf,
  prizeMoney,
  SHOP_ITEMS,
  sellPrice,
  shopItem,
  type AutoCategory,
  type ItemCategory,
  type PerkId,
  type ShopItem,
} from '../data/shop'
import {
  catchChance,
  EXP_SHARE_ITEM,
  EXP_SHARE_RATE,
  FRIEND_BALL_FRIENDSHIP,
  isMachine,
  isRecord,
  LUCKY_EGG,
  LUCKY_EGG_MULT,
  LUXURY_BALL,
  MACHO_BRACE,
  MONEY_ITEMS,
  rollCatch,
  SOOTHE_BELL,
  type CatchContext,
} from '../data/items'
import { BATTLE_HELD, POWER_ITEM_EV, POWER_ITEMS } from '../core/items'
import { findStage, migrateLegacyRegionIds, migrateLegacyStageId, REGIONS, type Region, type Stage } from '../data/stages'
import { useBattleLogStore } from './battleLog'

/** 이동 대기 시간 (공중날기 포켓몬이 없을 때) */
export const TRAVEL_MS = 10_000
/** 패배 후 포켓몬센터에서 회복하는 시간 */
export const FAINT_MS = 10_000
/** 회복 버튼으로 스스로 회복하러 갈 때 걸리는 시간 */
export const RETREAT_MS = 5_000
/** 보스 등장 조건: 마지막 보스전 이후 이 스테이지에서 쓰러뜨린 일반 포켓몬 수 */
export const BOSS_DEFEATS = 10
/** 자동 전투가 해금되는 스테이지 (이 스테이지 보스 클리어 시) */
export const AUTO_UNLOCK_STAGE = '1-1'
/** 기술칸 최대 수 */
export const MAX_MOVE_SLOTS = 8
/** 2·3·4번째 기술칸 해금에 필요한, 계정 전체에서 쓰러뜨린 수 */
export const SLOT_DEFEATS = [10, 30, 50]
/** 상점에서 추가로 열 수 있는 기술칸 수 (기본 4칸이 모두 열린 뒤) */
export const EXTRA_SLOTS = MAX_MOVE_SLOTS - 1 - SLOT_DEFEATS.length
/** 기본 기술칸이 모두 열렸을 때의 칸 수 */
export const BASE_SLOTS_MAX = 1 + SLOT_DEFEATS.length

/** 계정 전체 격파 수로 열린 기본 기술칸 수 (1~4) */
export const baseSlotsAt = (totalDefeats: number) => 1 + SLOT_DEFEATS.filter((n) => totalDefeats >= n).length
/** 사용 가능한 기술칸 수 (1~8) */
export function slotsAt(totalDefeats: number, m: Pick<PartyMember, 'extraSlots'>): number {
  const base = baseSlotsAt(totalDefeats)
  return base === BASE_SLOTS_MAX ? Math.min(MAX_MOVE_SLOTS, base + (m.extraSlots ?? 0)) : base
}

/** 이 스테이지를 클리어한 뒤부터 PP가 소모됨 */
export const PP_START_STAGE = '1-1'

/** 기술의 최대 PP (null = 제한 없음). 포인트업 1단계마다 기본 PP의 1/5씩 늘어남 */
export function maxPpOf(moveId: string, m?: Pick<PartyMember, 'ppUps'> | null): number | null {
  const base = dexData.value?.movesById[moveId]?.pp ?? null
  if (base == null) return null
  return base + Math.floor((base * (m?.ppUps?.[moveId] ?? 0)) / 5)
}
/** 남은 PP (null = 제한 없음) */
export function ppOf(m: Pick<PartyMember, 'pp' | 'ppUps'>, moveId: string): number | null {
  const max = maxPpOf(moveId, m)
  return max == null ? null : Math.max(0, Math.min(max, m.pp?.[moveId] ?? max))
}

/** 보스 클리어 후 동작 */
export type StageMode = 'advance' | 'repeat'

/** 자동 전투의 특수 기능 사용: off = 안 씀, boss = 보스전에서만, always = 매 전투 */
export type AutoGimmick = 'off' | 'boss' | 'always'
export const AUTO_GIMMICK_LABELS: Record<AutoGimmick, string> = { off: '안 씀', boss: '보스전만', always: '매 전투' }

/** 스테이지 순서 버전. 2 = 수상 스테이지를 레벨에 맞게 뒤로 옮김, 3 = 같은 지방도 작품별로 나눔 */
const STAGE_ORDER = 3

/** 보스 등장 연출 시간 */
export const BOSS_INTRO_MS = 2400
// 내 기술을 고르는 시간(턴이 끝난 뒤 / 전투 시작 후, 다음 기술 선택까지)과
// 상대가 기술을 고르는 시간(내 기술 선택 후 턴 계산까지)은 battlePickMs,
// 다음 상대 포켓몬을 찾는 시간은 searchMs (상점 속도 가속으로 줄어듦, SPEED_DELAY_MS)

export interface PartyMember {
  /** 포켓몬 id (PokeAPI identifier) */
  species: string
  level: number
  /** 장착한 기술 identifier (기술 슬롯 수까지) */
  moves: string[]
  /** 배운 기술 전체 (장착 기술 + 잊은 기술. 잊은 기술은 하트비늘로 되살림) */
  learned?: string[]
  /** 레벨업·진화로 배우려 했지만 기술칸이 가득 차서 처리를 기다리는 기술 (배운 순서, 맨 앞부터 처리) */
  pending?: string[]
  /** 누적 경험치. 없으면 현재 레벨의 시작값 */
  exp?: number
  /** 성격 id (예: 'adamant') */
  nature: string
  /** 개체값 hp, atk, def, spa, spd, spe (0~31) */
  ivs: number[]
  /** 노력치 hp, atk, def, spa, spd, spe (기본 0~252, 합계 510. 상점 한계 돌파로 늘어남) */
  evs: number[]
  /** 능력치별 전투 노력치 획득 끄기 (노력치 한계 돌파 1 필요) */
  evLocked?: boolean[]
  /** 현재 HP. null/없음 = 최대 HP */
  hp?: number | null
  /** 상점에서 연 추가 기술칸 수 (0~EXTRA_SLOTS) */
  extraSlots?: number
  /** 기술별 남은 PP. 없으면 최대 PP */
  pp?: Record<string, number>
  /** 기술별 포인트업 사용 횟수 (0~3) */
  ppUps?: Record<string, number>
  /** 상태이상 (전투가 끝나도 유지, 포켓몬센터·아이템으로 회복) */
  status?: Status | null
  /** 잠듦: 남은 턴 수 */
  sleep?: number
  /** 맹독: 이번 전투에서 지난 턴 수 */
  toxic?: number
  /** 친밀도 (0~255). 없으면 포켓몬의 기본 친밀도 */
  friendship?: number
  /** 특성: 일반 특성 중 몇 번째인지 (진화해도 같은 번호 유지) */
  abilitySlot?: number
  /** 숨겨진 특성 */
  hiddenAbility?: boolean
  /** 지닌 도구 identifier */
  heldItem?: string | null
  /** 지닌 도구를 이번 전투에서 써서 사라짐 (다음 전투 시작 때 가방에 있으면 다시 지님) */
  heldSpent?: boolean
  /** 잡은 볼 (스타팅·진화 포켓몬은 없음) */
  ball?: string
  /** 테라스탈 타입. 없으면 포켓몬의 첫 번째 타입 */
  teraType?: string
}

const STAGE_LABEL: Record<StageKey, string> = {
  atk: '공격',
  def: '방어',
  spa: '특수공격',
  spd: '특수방어',
  spe: '스피드',
  acc: '명중률',
  eva: '회피율',
}

/** 파티 최대 수 (넘으면 도감에 기록만 됨) */
export const PARTY_MAX = 6

/** 숨겨진 특성의 특성 번호 (DexRecord.abilities) */
export const HIDDEN_ABILITY_SLOT = -1

/**
 * 도감 수집 기록 (포켓몬 종별). 포획하거나 파티에서 도감으로 보낸 개체의 정보를 합침.
 * 도감에서 파티로 불러올 때 이 범위 안에서 골라서 가져옴
 */
export interface DexRecord {
  /** 얻은 성격 id */
  natures: string[]
  /** 얻은 특성: 일반 특성 번호, 숨겨진 특성은 HIDDEN_ABILITY_SLOT */
  abilities: number[]
  /** 능력치별 개체값 최소·최대 */
  ivMin: number[]
  ivMax: number[]
  /** 능력치별 노력치 최소·최대 */
  evMin: number[]
  evMax: number[]
  levelMin: number
  levelMax: number
  friendshipMin: number
  friendshipMax: number
  /** 배운 적 있는 기술 */
  moves: string[]
  /** 기술별 포인트업 사용 횟수 최대 */
  ppUps: Record<string, number>
  /** 상점에서 연 추가 기술칸 최대 */
  extraSlots: number
}

/** 도감에서 파티로 불러올 때 고르는 값 */
export interface SummonChoice {
  nature: string
  /** 특성 번호 (HIDDEN_ABILITY_SLOT = 숨겨진 특성) */
  ability: number
  level: number
  friendship: number
  ivs: number[]
  evs: number[]
  /** 장착할 기술 (나머지 기록된 기술은 잊은 기술로 배운 상태) */
  moves: string[]
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/** 지금 효과가 있는 지닌 도구 (써서 사라졌으면 null) */
export const heldOf = (m: Pick<PartyMember, 'heldItem' | 'heldSpent'>): string | null => (m.heldSpent ? null : (m.heldItem ?? null))

/** 지닐 수 있는(효과가 있는) 도구인지: 전투 효과 또는 경험치·돈·친밀도·노력치 도구 */
export function isHoldable(id: string): boolean {
  return (
    BATTLE_HELD.has(id) ||
    id === LUCKY_EGG ||
    id === SOOTHE_BELL ||
    id === MACHO_BRACE ||
    MONEY_ITEMS.has(id) ||
    id in POWER_ITEMS ||
    id in Z_CRYSTALS ||
    isMegaItem(id)
  )
}

/** 기술머신으로 배울 수 있는지 (그 포켓몬의 기술표에 있는 기술) */
export function canLearnMachine(m: Pick<PartyMember, 'species'>, moveId: string): boolean {
  const num = moveNumOf(moveId)
  return num != null && !!learnsets.value?.[m.species]?.some((e) => e[0] === num)
}
let moveNumCache: { src: unknown; map: Map<string, number> } | null = null
function moveNumOf(id: string): number | undefined {
  const dex = dexData.value
  if (!dex) return undefined
  if (moveNumCache?.src !== dex) moveNumCache = { src: dex, map: new Map(Object.entries(dex.moves).map(([n, v]) => [v.id, Number(n)])) }
  return moveNumCache.map.get(id)
}

/** 파티 포켓몬의 특성 identifier */
export function memberAbility(m: Pick<PartyMember, 'species' | 'abilitySlot' | 'hiddenAbility'>): string | null {
  const normal = normalAbilities(m.species)
  if (m.hiddenAbility) return hiddenAbility(m.species) ?? normal[0] ?? null
  return normal.length ? normal[(m.abilitySlot ?? 0) % normal.length]! : null
}

/** 테라스탈 타입 (정하지 않았으면 포켓몬의 첫 번째 타입) */
export function teraTypeOf(m: Pick<PartyMember, 'species' | 'teraType'>): string {
  return m.teraType ?? speciesOf(m.species)?.types[0] ?? 'normal'
}

/** 친밀도 (저장값이 없으면 포켓몬의 기본 친밀도) */
export const friendshipOf = (m: Pick<PartyMember, 'species' | 'friendship'>) =>
  m.friendship ?? battleData.value?.species[m.species]?.happy ?? 70

/** 진화 조건 판정 (아이템 보유 여부는 제외) */
export function evolutionMet(m: PartyMember, e: Evolution, now = Date.now()): boolean {
  if (e.lv != null && m.level < e.lv) return false
  if (e.happy && friendshipOf(m) < FRIENDSHIP_EVOLVE) return false
  if (e.time && phaseAt(now) !== e.time) return false
  const learned = m.learned ?? m.moves
  if (e.move && !learned.includes(e.move)) return false
  if (e.moveType && !learned.some((id) => dexData.value?.movesById[id]?.type === e.moveType)) return false
  if (e.stat != null) {
    const base = speciesOf(m.species)?.stats
    if (!base) return false
    const [, atk, def] = calcStats(base, m.level, m.ivs ?? [], m.evs ?? [], m.nature, m.species)
    if (Math.sign(atk! - def!) !== e.stat) return false
  }
  return true
}

/** 진화 조건 설명 (예: "Lv.16", "친밀도 160 이상 · 밤") */
export function evolutionCondText(e: Evolution): string {
  const item = (id: string) => dexData.value?.items[id]?.ko ?? id
  const parts: string[] = []
  if (e.via === 'item') parts.push(`${item(e.item!)} 사용`)
  if (e.via === 'cord') parts.push(e.item ? `${item(LINKING_CORD)} + ${item(e.item)} 사용` : `${item(LINKING_CORD)} 사용`)
  if (e.lv != null) parts.push(`Lv.${e.lv}`)
  if (e.happy) parts.push(`친밀도 ${FRIENDSHIP_EVOLVE} 이상`)
  if (e.move) parts.push(`${dexData.value?.movesById[e.move]?.ko ?? e.move} 습득`)
  if (e.moveType) parts.push(`${dexData.value?.types[e.moveType] ?? e.moveType} 타입 기술 습득`)
  if (e.stat != null) parts.push(e.stat > 0 ? '공격 > 방어' : e.stat < 0 ? '공격 < 방어' : '공격 = 방어')
  if (e.time) parts.push(e.time === 'day' ? '낮' : '밤')
  if (e.via === 'level' && parts.length === (e.time ? 1 : 0)) parts.unshift('레벨업')
  return parts.join(' · ')
}

/** 전투 중인 야생 포켓몬 / 보스 */
export interface WildPokemon {
  species: string
  level: number
  nature: string
  ivs: number[]
  /** 현재 HP. null = 최대 HP */
  hp: number | null
  /** 기술 (원작 야생 규칙: 해당 레벨까지 배운 마지막 4개) */
  moves?: string[]
  /** 능력 랭크 */
  stages?: Stages
  boss?: boolean
  status?: Status | null
  sleep?: number
  toxic?: number
  /** 특성 identifier */
  ability?: string | null
  /** 지닌 도구 (원작 야생 포켓몬의 지닌 도구 확률). 쓰러뜨리면 손에 넣음 */
  item?: string | null
  /** 전투 중 상태 (트레이스·타오르는불꽃 등) */
  vol?: Volatile
  /** 내가 아는 이 포켓몬의 특성 정보 (자동 전투 AI 개선 2) */
  intel?: AbilityIntel
}

export interface StageProgress {
  /** 이 스테이지에서 조우한 포켓몬 */
  seen: string[]
  /** 마지막 보스전(승패 무관) 이후 이 스테이지에서 쓰러뜨린 일반 포켓몬 수. BOSS_DEFEATS 에 닿으면 보스 등장 */
  defeats: number
}

/** 패배 후 회복 중 상태 */
export interface FaintState {
  until: number
  /** 회복에 걸리는 전체 시간 (진행 바 표시용) */
  total: number
  /** 회복 버튼으로 스스로 돌아감 (패배가 아님) */
  retreat?: boolean
  /** 회복하러 간 마을 */
  town: string
  /** 포켓몬센터 대신 집에서 회복 (센터가 없는 마을) */
  home: boolean
  /** 회복 후 돌아갈 스테이지 */
  returnTo: string
  /** 공중날기로 패배한 곳으로 바로 돌아감 */
  fly: boolean
}

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const randomNature = () => {
  const natures = Object.keys(NATURES)
  return natures[randInt(0, natures.length - 1)]!
}

/** 스테이지에 일반 출현하는 포켓몬 (낮·밤 합침, 특수 출현 제외) */
export function stageSpecies(set: EncounterSet | undefined): string[] {
  if (!set) return []
  const lists = 'all' in set ? [set.all] : [set.day, set.night]
  return [...new Set(lists.flat().filter((e) => !e.special).map((e) => e.p))]
}

/** 특성 뽑기. hidden = 숨겨진 특성도 후보 (보스·어려움 난이도) */
function rollAbility(species: string, hidden: boolean): string | null {
  const list = speciesAbilities(species, hidden)
  return list.length ? list[randInt(0, list.length - 1)]! : null
}

/** 야생 포켓몬의 지닌 도구 뽑기 (원작 확률). boss = 확률 2배 */
function rollWildItem(species: string, boss: boolean): string | null {
  const list = dexData.value?.wildItems[species] ?? []
  let r = Math.random() * 100
  for (const [item, rate] of list) {
    r -= rate * (boss ? 2 : 1)
    if (r < 0) return item
  }
  return null
}

/** 현재 스테이지·시간대의 출현표에서 출현율 가중치로 한 마리 뽑기 */
function rollWild(stage: Stage, hidden: boolean): WildPokemon | null {
  const set = stage.encounters
  if (!set) return null
  const list = encountersAt(set, phaseAt(Date.now()))
  const total = list.reduce((a, e) => a + e.rate, 0)
  if (!total) return null
  let r = Math.random() * total
  const e = list.find((x) => (r -= x.rate) < 0) ?? list[list.length - 1]!
  const level = randInt(e.min, e.max)
  return {
    species: e.p,
    level,
    nature: randomNature(),
    ivs: Array.from({ length: 6 }, () => randInt(0, 31)),
    hp: null,
    moves: wildMoveset(e.p, level, set.vg),
    ability: rollAbility(e.p, hidden),
    item: rollWildItem(e.p, false),
  }
}

/** 보스: 스테이지 출현 포켓몬 중 종족값 합계가 가장 높은 포켓몬, 최고 레벨 +2, 개체값 20~31 */
function makeBoss(stage: Stage): WildPokemon | null {
  const set = stage.encounters
  if (!set) return null
  const lists = 'all' in set ? [set.all] : [set.day, set.night]
  const entries = lists.flat().filter((e) => !e.special)
  if (!entries.length) return null
  const bst = (id: string) => speciesOf(id)?.stats.reduce((a, b) => a + b, 0) ?? 0
  const top = entries.reduce((a, b) => (bst(b.p) > bst(a.p) ? b : a))
  const level = Math.min(100, Math.max(...entries.map((e) => e.max)) + 2)
  return {
    species: top.p,
    level,
    nature: randomNature(),
    ivs: Array.from({ length: 6 }, () => randInt(20, 31)),
    hp: null,
    moves: wildMoveset(top.p, level, set.vg),
    ability: rollAbility(top.p, true),
    item: rollWildItem(top.p, true),
    boss: true,
  }
}

export const useGameStore = defineStore('game', {
  state: () => ({
    playTimeMs: 0,
    /** 현재 위치한 스테이지 id */
    currentStageId: '1-1',
    /** 스테이지 순서 버전 (저장 데이터 스테이지 id 변환용) */
    stageOrder: STAGE_ORDER as number,
    /** 이동 중일 때 목적지와 도착 시각 */
    travel: null as { to: string; arriveAt: number } | null,
    party: [] as PartyMember[],
    /** 도감 수집 기록 {포켓몬 id: 기록} */
    dexRecords: {} as Record<string, DexRecord>,
    /** 계정 전체에서 쓰러뜨린 포켓몬 수 (기본 기술칸 해금 조건) */
    totalDefeats: 0,
    /** 학습장치 구매 여부 / 켜짐 (공용 기능) */
    expShareOwned: false,
    expShare: false,
    /** 전투 중인 상대 (이동 중이거나 출현 정보가 없으면 null) */
    enemy: null as WildPokemon | null,
    /** 내 포켓몬의 능력 랭크 (전투마다 초기화) */
    playerStages: {} as Stages,
    /** 내 포켓몬의 전투 중 상태 (전투마다 초기화) */
    playerVol: {} as Volatile,
    /** 상대가 아는 내 포켓몬의 특성 정보 (어려움 난이도 AI) */
    playerIntel: null as AbilityIntel | null,
    /** 이번 전투에서 특수 기능(메가진화·Z기술·다이맥스·테라스탈)을 썼는지. 한 전투에 하나를 한 번만 */
    gimmickUsed: false,
    /** 싸우는 포켓몬에게 이어지는 특수 기능 효과 (교체하거나 전투가 끝나면 사라짐) */
    gimmickActive: null as ActiveGimmick | null,
    /** 다음 야생 포켓몬이 나오는 시각 */
    nextEncounterAt: 0,
    /** 패배 후 회복 중 */
    faint: null as FaintState | null,
    /** 스테이지별 진행도 */
    stageProgress: {} as Record<string, StageProgress>,
    /** 보스를 쓰러뜨린 스테이지 */
    clearedStages: [] as string[],
    /** 해금된 지방 id (한 번이라도 도착한 지방). 1번 지방은 처음부터 해금 */
    unlockedRegions: [1] as number[],
    /** 포획한 적 있는 포켓몬 id */
    caught: [] as string[],
    /** 조우한 적 있는 포켓몬 id (보스 포함. 포획·진화로 얻은 포켓몬은 caught 로 판단) */
    seen: [] as string[],
    /** 돈 */
    money: 0,
    /** 보유 아이템 {identifier: 개수} */
    items: {} as Record<string, number>,
    /** 구매한 편의성 기능 */
    perks: [] as PerkId[],
    /** 노력치 한계 돌파 2 구매 횟수 */
    evBreaks: 0,
    /** 분류별 아이템 자동 사용 (편의성 기능 구매 필요) */
    autoUse: {} as Partial<Record<AutoCategory, boolean>>,
    /** 분류별 아이템 자동 구매 (편의성 기능 구매 필요) */
    autoBuy: {} as Partial<Record<AutoCategory, boolean>>,
    /** 분류별 자동 구매 품목 */
    autoBuyItem: { ...DEFAULT_AUTO_BUY } as Record<AutoCategory, string>,
    /** 체력 자동 사용 기준 (최대 HP 대비 %) */
    autoHealAt: 50 as (typeof AUTO_HEAL_THRESHOLDS)[number],
    /** 현재 전투에서 지난 턴 수 (0 = 아직 기술을 쓰지 않음, 아이템 사용 시 턴 소모 판단) */
    battleTurns: 0,
    /** 자동 전투 */
    autoUnlocked: false,
    auto: false,
    /** 보스 클리어 후 동작: advance = 다음 스테이지로 이동, repeat = 현재 스테이지에서 일반 10마리 + 보스 반복 */
    stageMode: 'advance' as StageMode,
    /** 자동 전투에서 특수 기능 사용 */
    autoGimmick: 'always' as AutoGimmick,
    /** 보스 등장 연출 생략 켜짐 (상점 기능 'bossIntro:skip' 구매 필요) */
    skipBossIntro: false,
    /** PP 자동 센터 귀환 켜짐 (상점 기능 'autoCenter:pp' 구매 필요) */
    autoCenter: false,
    /** PP가 바닥났을 때 우선할 것: item = PP 회복 아이템(자동 사용이 켜져 있고 아이템이 있으면), center = 센터 귀환 */
    autoCenterPriority: 'item' as AutoCenterPriority,
    /** 변함없는돌 구매 여부 (공용 기능) */
    everstoneOwned: false,
    /** 변함없는돌 켜짐: 레벨업 진화를 막음 */
    everstone: false,
    /** 설정: 난이도 */
    difficulty: 'normal' as Difficulty,
    /** 설정: 기본 도트 */
    spriteDefault: 'fan' as SpriteDefault,
    /** 설정: 포켓몬별로 고른 도트 {포켓몬 id: 도트 키} */
    spriteChoice: {} as Record<string, string>,
  }),
  getters: {
    canFly: (s) => s.party.some((m) => m.moves.includes('fly')),
    /** PP 소모 여부 (PP_START_STAGE 클리어 후) */
    ppActive: (s) => s.clearedStages.includes(PP_START_STAGE),
    hasPerk: (s) => (id: PerkId) => s.perks.includes(id),
    /** 계정 전체 격파 수로 열린 기본 기술칸 수 (1~4) */
    baseSlots: (s) => baseSlotsAt(s.totalDefeats),
    /** 이 포켓몬이 사용할 수 있는 기술칸 수 (1~8) */
    slotsOf: (s) => (m: Pick<PartyMember, 'extraSlots'>) => slotsAt(s.totalDefeats, m),
    /** 도감 공개 단계: 'full' = 모든 정보, 'sprite' = 도트만 (조우), 'hidden' = ??? (미조우) */
    dexLevel: (s) => {
      const caught = new Set(s.caught)
      const seen = new Set(s.seen)
      const reveal = s.perks.includes('dex:reveal')
      return (id: string): 'full' | 'sprite' | 'hidden' =>
        caught.has(id) || reveal ? 'full' : seen.has(id) ? 'sprite' : 'hidden'
    },
    /** 능력치 하나의 노력치 한계 */
    evStatCap: (s) => evStatCap(s.perks.includes('evBreak:1') ? s.evBreaks : 0),
    /** 노력치 합계 한계 (한계 돌파 1이면 없음) */
    evTotalCap: (s) => (s.perks.includes('evBreak:1') ? Infinity : EV_TOTAL_MAX),
    /** 능력치 표시 단계 (0 = 실능치만) */
    statViewLevel: (s): number => ([4, 3, 2, 1] as const).find((lv) => s.perks.includes(`statView:${lv}`)) ?? 0,
    /** 전투로 얻는 노력치를 끈 능력치인지 (한계 돌파 1 필요) */
    evLockedOf: (s) => (m: PartyMember, i: number) => s.perks.includes('evBreak:1') && !!m.evLocked?.[i],
    /** 보스 등장 연출 생략 (상점 기능 구매 + 켜짐) */
    bossIntroSkipped: (s) => s.skipBossIntro && s.perks.includes('bossIntro:skip'),
    /** 자동 전투 기술 선택 방식 (상점 AI 개선) */
    /** 전투 화면 표시 단계: 0 = 기본, 1 = 비율, 2 = 현재/최대와 비율 */
    displayLevel: (s) => (kind: 'foeHp' | 'exp'): 0 | 1 | 2 =>
      s.perks.includes(`${kind}:full`) ? 2 : s.perks.includes(`${kind}:ratio`) ? 1 : 0,
    /** 속도 가속 단계 (0 = 기본) */
    speedLevel: (s) => (kind: SpeedKind): number =>
      ([4, 3, 2, 1] as const).find((lv) => s.perks.includes(`${kind}Speed:${lv}`)) ?? 0,
    /** 내/상대 기술 선택 대기 시간 */
    battlePickMs(): number {
      return SPEED_DELAY_MS[this.speedLevel('battle')]
    },
    /** 다음 상대 포켓몬을 찾는 시간 */
    searchMs(): number {
      return SPEED_DELAY_MS[this.speedLevel('search')]
    },
    autoAiMode: (s): AiMode => (s.perks.includes('ai:smart') ? 'smart' : s.perks.includes('ai:strong') ? 'strong' : 'random'),
    /** 특수 기능 해금 여부 (해금하는 지방에 들어간 적 있음) */
    gimmickUnlocked: (s) => (g: Gimmick) => REGIONS.some((r) => r.unlocks === g && s.unlockedRegions.includes(r.id)),
    /** 해금한 특수 기능이 하나라도 있음 */
    anyGimmickUnlocked(): boolean {
      return GIMMICKS.some((g) => this.gimmickUnlocked(g))
    },
    /** 해금된 지방이 무대인 세대 목록 */
    unlockedGens: (s) => REGIONS.filter((r) => s.unlockedRegions.includes(r.id)).flatMap((r) => r.gens),
    /** 이동 가능한 지방인지 (히든 지방은 조건 포켓몬 포획 필요) */
    canEnter: (s) => (region: Region) => !region.hidden || s.caught.includes(region.hidden.requiresCaught),
    /** 이동 가능한 스테이지: 지방의 첫 스테이지, 클리어한 스테이지, 클리어한 스테이지의 다음 스테이지 */
    stageUnlocked: (s) => (stageId: string) => {
      const found = findStage(stageId)
      if (!found) return false
      const i = found.region.stages.indexOf(found.stage)
      if (i === 0 || stageId === s.currentStageId || s.clearedStages.includes(stageId)) return true
      return s.clearedStages.includes(found.region.stages[i - 1]!.id)
    },
    progressOf: (s) => (stageId: string): StageProgress => s.stageProgress[stageId] ?? { seen: [], defeats: 0 },
    /** 보스 등장 조건: 마지막 보스전 이후 일반 포켓몬을 BOSS_DEFEATS 마리 쓰러뜨림 */
    bossReady(): (stageId: string) => boolean {
      return (stageId) => !!findStage(stageId)?.stage.encounters && this.progressOf(stageId).defeats >= BOSS_DEFEATS
    },
  },
  actions: {
    tick(deltaMs: number) {
      this.playTimeMs += deltaMs
      const now = Date.now()
      if (this.faint) {
        if (now >= this.faint.until) this.recover()
        return
      }
      if (this.travel && now >= this.travel.arriveAt) this.arrive(this.travel.to)
      if (this.travel || !this.party.length || !battleReady()) return

      // HP 0인 채로 남아 있으면 (이전 버전 저장 데이터 등) 바로 기절 처리
      if (this.party[0]?.hp === 0) {
        this.onPlayerFainted()
        return
      }

      const log = useBattleLogStore()
      this.autoBuyItems()
      // 상대 기술 선택이 끝나면 턴 계산
      if (log.pending) {
        if (!log.isBusy()) this.resolvePending()
        return
      }
      if (!this.enemy) {
        // 전투 사이: PP가 바닥났으면 센터로 (센터 우선이면 아이템보다 먼저), 턴 소모 없이 아이템 자동 사용
        if (this.autoCenterPriority === 'center' && this.autoCenterForPp()) return
        if (this.auto && this.autoUseItem()) return
        if (this.autoCenterForPp()) return
        if (now < this.nextEncounterAt) return
        // 일반 포켓몬을 BOSS_DEFEATS 마리 쓰러뜨리면 다음 조우는 반드시 보스
        if (this.bossReady(this.currentStageId)) this.challengeBoss()
        else this.spawn()
        return
      }
      // 자동 전투: 연출이 끝나면 다음 턴
      if (this.auto && !log.isBusy()) {
        if (this.autoSwitchLead()) return
        if (this.autoUseItem()) return
        const me = this.playerBattler()
        const foe = this.enemyBattler()
        if (!me || !foe) return
        me.moves = this.usableMoves()
        // 특수 기능을 쓸 차례면 실제로 나갈 기술(다이맥스 기술·Z기술)로 비교해 고름
        const g = this.autoGimmickPick()
        const held = heldOf(this.party[0]!)
        const transform =
          g === 'dynamax' || this.gimmickActive?.kind === 'dynamax'
            ? maxMove
            : g === 'z'
              ? (m: MoveData) => (zEligible(m, held) ? zMove(m) : m)
              : undefined
        this.takeTurn(chooseMove(me, foe, this.autoAiMode, transform), g)
      }
    },

    /** 지방을 작품별로 나누기 전 저장 데이터의 스테이지·지방 번호를 현재 번호로 변환 */
    migrateStageIds(savedStageOrder: number) {
      const m = (id: string) => migrateLegacyStageId(id, savedStageOrder)
      this.unlockedRegions = migrateLegacyRegionIds(this.unlockedRegions)
      if (!this.unlockedRegions.includes(1)) this.unlockedRegions.unshift(1)
      this.currentStageId = m(this.currentStageId)
      if (this.travel) this.travel.to = m(this.travel.to)
      if (this.faint) this.faint.returnTo = m(this.faint.returnTo)
      this.clearedStages = [...new Set(this.clearedStages.map(m))]
      this.stageProgress = Object.fromEntries(Object.entries(this.stageProgress).map(([k, v]) => [m(k), v]))
    },
    /** 불러온 저장 데이터 보정 */
    /** savedStageOrder = 저장 데이터의 stageOrder (없으면 이전 순서) */
    validate(savedStageOrder: number | undefined = STAGE_ORDER) {
      // 이전 저장 데이터 호환: 지방을 작품별로 나누기 전(수상 스테이지 재배치 전 포함) 스테이지 id 변환
      if (savedStageOrder < STAGE_ORDER) this.migrateStageIds(savedStageOrder)
      this.stageOrder = STAGE_ORDER
      if (!findStage(this.currentStageId)) this.currentStageId = '1-1'
      if (this.travel && !findStage(this.travel.to)) this.travel = null
      // 이전 저장 데이터 호환: 아이템별 자동사용 설정 시절의 값 정리
      const st = this.$state as unknown as Record<string, unknown>
      delete st.autoUseUnlocked
      // 이전 저장 데이터 호환: 보스 자동 도전 설정 시절의 값 정리
      for (const k of ['autoBoss', 'autoBossSuspended', 'bossFailStreak', 'bossFailLimit']) delete st[k]
      for (const k of Object.keys(this.autoUse)) if (!(k in DEFAULT_AUTO_BUY)) delete (this.autoUse as Record<string, unknown>)[k]
      if (!Array.isArray(this.perks)) this.perks = []
      // 이전 저장 데이터 호환: 전체 조우 기록이 없으면 스테이지별 조우 기록으로 채움
      if (!Array.isArray(this.seen)) this.seen = []
      const seen = new Set(this.seen)
      for (const p of Object.values(this.stageProgress)) for (const id of p.seen ?? []) seen.add(id)
      if (seen.size !== this.seen.length) this.seen = [...seen]
      if (!Number.isInteger(this.evBreaks) || this.evBreaks < 0) this.evBreaks = 0
      // 이전 저장 데이터 호환: 회복·기절 회복이 한 분류였던 시절 → 기절 회복 자동 사용·자동 구매를 따로 나눔
      if (this.perks.includes('autoUse:heal') && !this.perks.includes('autoUse:revive')) {
        this.perks.push('autoUse:revive')
        this.autoUse.revive = !!this.autoUse.heal
      }
      const oldHealBuy = shopItem(this.autoBuyItem?.heal ?? '')
      if (oldHealBuy?.category === 'revive') {
        this.autoBuyItem.revive = oldHealBuy.id
        if (this.perks.includes('autoBuy:heal') && !this.perks.includes('autoBuy:revive')) {
          this.perks.push('autoBuy:revive')
          this.autoBuy.revive = !!this.autoBuy.heal
        }
      }
      this.autoBuyItem = { ...DEFAULT_AUTO_BUY, ...this.autoBuyItem }
      if (!Number.isFinite(this.money)) this.money = 0
      if (this.enemy && !this.enemy.species) this.enemy = null
      if (!this.autoUnlocked) this.auto = false
      if (this.stageMode !== 'repeat') this.stageMode = 'advance'
      if (!['off', 'boss', 'always'].includes(this.autoGimmick)) this.autoGimmick = 'always'
      // 전투 밖에 특수 기능 효과가 남아 있으면 정리 (다이맥스 HP 복구)
      if (!this.enemy) this.endBattleGimmick()
      if (!this.everstoneOwned) this.everstone = false
      if (!this.perks.includes('bossIntro:skip')) this.skipBossIntro = false
      if (!this.perks.includes('autoCenter:pp')) this.autoCenter = false
      if (this.autoCenterPriority !== 'center') this.autoCenterPriority = 'item'
      if (!this.expShareOwned) this.expShare = false
      for (const k of Object.keys(this.autoBuyItem) as AutoCategory[])
        if (shopItem(this.autoBuyItem[k])?.category !== k) this.autoBuyItem[k] = DEFAULT_AUTO_BUY[k]
      // 이전 저장 데이터 호환: 박스 시절 → 박스 포켓몬은 도감 기록으로, 포켓몬별 격파 수 → 계정 격파 수
      const oldBox = Array.isArray(st.box) ? (st.box as PartyMember[]) : []
      delete st.box
      const firstRecords = !this.dexRecords || typeof this.dexRecords !== 'object' || !Object.keys(this.dexRecords).length
      if (!this.dexRecords || typeof this.dexRecords !== 'object') this.dexRecords = {}
      if (!Number.isInteger(this.totalDefeats) || this.totalDefeats < 0) this.totalDefeats = 0
      const legacy = (m: PartyMember) => m as PartyMember & { defeats?: number }
      if (!this.totalDefeats)
        this.totalDefeats = [...this.party, ...oldBox].reduce((a, m) => a + (legacy(m).defeats ?? 0), 0)
      for (const m of [...this.party, ...oldBox]) delete legacy(m).defeats
      if (firstRecords) for (const m of this.party) this.recordToDex(m)
      for (const m of oldBox) this.sendToDexMember(m)
      // 파티가 넘치면 도감으로
      while (this.party.length > PARTY_MAX) this.sendToDexMember(this.party.pop()!)
      for (const m of this.party) if (!m.heldItem) m.heldSpent = false
      // 장착하지 않은 기술은 잊은 기술(learned 에만 있음)로 취급. 대기열은 배운 기술과 겹치지 않게
      for (const m of this.party) {
        const learned = (m.learned ??= [...m.moves])
        if (m.moves.length > this.slotsOf(m)) m.moves = m.moves.slice(0, this.slotsOf(m))
        for (const id of m.moves) if (!learned.includes(id)) learned.push(id)
        if (m.pending) m.pending = [...new Set(m.pending)].filter((id) => !learned.includes(id))
        this.fillFromPending(m, false)
      }
    },

    /**
     * 현재 레벨까지 배울 수 있었던 레벨업 기술을 배운 기술 목록에 채움
     * (스타팅 이전 레벨의 기술, 새 지방 해금으로 생긴 세대 한정 기술). 장착은 바꾸지 않음
     */
    backfillLearned() {
      if (!battleReady()) return
      for (const m of this.party) {
        m.abilitySlot ??= randInt(0, Math.max(0, normalAbilities(m.species).length - 1))
        const learned = (m.learned ??= [...m.moves])
        const pending = m.pending ?? []
        for (const id of movesUpToLevel(m.species, m.level, this.unlockedGens))
          if (!learned.includes(id) && !pending.includes(id)) learned.push(id)
      }
    },

    /** 스타팅 포켓몬 결정 (파티가 비어 있을 때만) */
    chooseStarter(member: PartyMember) {
      if (this.party.length) return
      this.party.push({ ...member, learned: [...member.moves] })
      this.backfillLearned()
      if (!this.caught.includes(member.species)) this.caught.push(member.species)
      this.recordToDex(this.party[0]!)
    },

    moveTo(stageId: string) {
      const target = findStage(stageId)
      if (!target || !this.canEnter(target.region) || !this.stageUnlocked(stageId) || this.faint) return
      if (stageId === this.currentStageId) {
        this.travel = null
        return
      }
      this.endBattleGimmick()
      this.enemy = null
      if (this.canFly) {
        this.arrive(stageId)
      } else {
        this.travel = { to: stageId, arriveAt: Date.now() + TRAVEL_MS }
      }
    },
    arrive(stageId: string) {
      this.currentStageId = stageId
      this.travel = null
      this.endBattleGimmick()
      this.enemy = null
      this.nextEncounterAt = 0
      const region = findStage(stageId)?.region
      if (region && !this.unlockedRegions.includes(region.id)) {
        // 같은 특수 기능을 해금하는 지방이 여럿 (칼로스·호연 ORAS·관동 레츠고 = 메가진화 등) → 처음 해금할 때만 알림
        const newGimmick = !!region.unlocks && !this.gimmickUnlocked(region.unlocks)
        this.unlockedRegions.push(region.id)
        this.backfillLearned()
        if (region.unlocks && newGimmick) {
          const info = GIMMICK_INFO[region.unlocks]
          useBattleLogStore().push(`${ro(region.name)} 들어와 ${josa(info.label, '이', '가')} 해금되었다! ${info.desc}`, 'good')
        }
      }
    },
    cancelTravel() {
      this.travel = null
    },

    // ---------- 전투 ----------
    /** index = 파티 번호 (맨 앞이 아니면 랭크·전투 중 상태 없이 막 나온 상태로 계산) */
    playerBattler(index = 0): Battler | null {
      const m = this.party[index]
      if (!m) return null
      if (index !== 0) {
        const b: Battler = {
          name: speciesOf(m.species)?.ko ?? m.species,
          species: m.species,
          level: m.level,
          nature: m.nature,
          ivs: m.ivs ?? [],
          evs: m.evs ?? [],
          hp: 0,
          moves: m.moves,
          stages: {},
          status: m.status ?? null,
          sleep: m.sleep,
          toxic: 0,
          ability: memberAbility(m),
          item: heldOf(m),
          vol: {},
        }
        b.hp = m.hp ?? maxHpOf(b)
        return b
      }
      const b: Battler = {
        name: speciesOf(m.species)?.ko ?? m.species,
        species: m.species,
        level: m.level,
        nature: m.nature,
        ivs: m.ivs ?? [],
        evs: m.evs ?? [],
        hp: 0,
        moves: m.moves,
        stages: { ...this.playerStages },
        status: m.status ?? null,
        sleep: m.sleep,
        toxic: m.toxic,
        ability: memberAbility(m),
        item: heldOf(m),
        vol: { ...this.playerVol },
        intel: this.playerIntel ? { cands: [...this.playerIntel.cands], known: this.playerIntel.known } : undefined,
      }
      this.applyGimmick(b)
      b.hp = m.hp ?? maxHpOf(b)
      return b
    },
    /** 싸우는 포켓몬의 전투 계산에 특수 기능 효과 반영 (메가진화 폼·다이맥스·테라스탈) */
    applyGimmick(b: Battler) {
      const g = this.gimmickActive
      if (!g) return
      if (g.kind === 'mega') {
        const f = formOf(g.form)
        if (!f) return
        b.species = f.id
        b.name = f.ko
        b.ability = battleData.value?.abilities[f.ability] ?? b.ability
      } else if (g.kind === 'dynamax') b.dynamax = true
      else b.tera = g.type
    },
    /** 파티 포켓몬의 최대 HP (싸우는 포켓몬이 다이맥스 중이면 2배) */
    memberMaxHp(m: PartyMember): number {
      const dynamax = m === this.party[0] && this.gimmickActive?.kind === 'dynamax'
      return maxHpOf({ species: m.species, level: m.level, ivs: m.ivs ?? [], evs: m.evs ?? [], nature: m.nature, dynamax })
    },

    // ---------- 특수 기능 ----------
    /** 지금 싸우는 포켓몬이 쓸 수 있는 특수 기능 (전투 중이고 이번 전투에서 아직 쓰지 않았을 때) */
    gimmickOptions(): Gimmick[] {
      const m = this.party[0]
      if (!m || !this.enemy || this.gimmickUsed || this.faint || m.hp === 0 || !battleReady()) return []
      const held = heldOf(m)
      return GIMMICKS.filter((g) => {
        if (!this.gimmickUnlocked(g)) return false
        if (g === 'mega') return !!megaFormFor(m.species, held, m.learned ?? m.moves)
        if (g === 'z') return !!held && held in Z_CRYSTALS && this.usableMoves().some((id) => zEligible(moveData(id), held))
        return true
      })
    },
    /** 자동 전투에서 이번 턴에 쓸 특수 기능 (우선순위: 메가진화 > Z기술 > 다이맥스 > 테라스탈) */
    autoGimmickPick(): Gimmick | null {
      if (this.autoGimmick === 'off' || (this.autoGimmick === 'boss' && !this.enemy?.boss)) return null
      const opts = this.gimmickOptions()
      return GIMMICKS.find((g) => opts.includes(g)) ?? null
    },
    setAutoGimmick(v: AutoGimmick) {
      this.autoGimmick = v
    },
    /** 특수 기능 발동 (턴 계산 직전) */
    activateGimmick(g: Gimmick) {
      const log = useBattleLogStore()
      const m = this.party[0]!
      const name = speciesOf(m.species)?.ko ?? m.species
      this.gimmickUsed = true
      if (g === 'mega') {
        const f = megaFormFor(m.species, heldOf(m), m.learned ?? m.moves)!
        this.gimmickActive = { kind: 'mega', form: f.id }
        if (f.kind === 'primal') {
          log.push(`${name}의 원시회귀! ${josa(name, '은', '는')} 원시의 모습을 되찾았다!`, 'good')
        } else {
          if (f.item) log.push(`${name}의 ${josa(dexData.value?.items[f.item]?.ko ?? f.item, '과', '와')} 키스톤이 반응했다!`, 'info')
          else log.push(`간절한 소원이 ${name}에게 닿았다!`, 'info')
          log.push(`${josa(name, '은', '는')} ${ro(f.ko)} 메가진화했다!`, 'good')
        }
        // 메가진화한 모습의 특성은 상대에게 드러남
        const a = battleData.value?.abilities[f.ability]
        if (a) this.playerIntel = { cands: [a], known: true }
      } else if (g === 'dynamax') {
        if (m.hp != null) m.hp *= 2
        this.gimmickActive = { kind: 'dynamax', turns: DYNAMAX_TURNS }
        log.push(`${josa(name, '은', '는')} 다이맥스했다!`, 'good')
      } else if (g === 'tera') {
        const t = teraTypeOf(m)
        this.gimmickActive = { kind: 'tera', type: t }
        log.push(`${josa(name, '은', '는')} ${dexData.value?.types[t] ?? t} 타입으로 테라스탈했다!`, 'good')
      } else {
        log.push(`${josa(name, '은', '는')} Z파워를 몸에 둘렀다!`, 'good')
      }
    },
    /** 싸우는 포켓몬의 특수 기능 효과를 끝냄 (교체·전투 종료·다이맥스 턴 종료). 다이맥스면 HP를 원래대로 */
    endGimmick(announce = false) {
      const g = this.gimmickActive
      if (!g) return
      this.gimmickActive = null
      const m = this.party[0]
      if (!m || g.kind !== 'dynamax') return
      if (m.hp != null && m.hp > 0) {
        const half = Math.max(1, Math.ceil(m.hp / 2))
        m.hp = half >= this.memberMaxHp(m) ? null : half
      }
      if (announce) useBattleLogStore().push(`${speciesOf(m.species)?.ko ?? m.species}의 다이맥스가 끝났다!`, 'info')
    },
    /** 전투가 끝났을 때: 특수 기능 효과를 끝내고 다음 전투에서 다시 쓸 수 있게 */
    endBattleGimmick() {
      this.endGimmick()
      this.gimmickUsed = false
    },
    /** 테라피스 TERA_SHARD_COST 개로 테라스탈 타입 변경 (테라스탈 해금 후) */
    setTeraType(memberIndex: number, type: string): boolean {
      const m = this.party[memberIndex]
      const shard = teraShardOf(type)
      if (!m || this.faint || !this.gimmickUnlocked('tera') || teraTypeOf(m) === type) return false
      if ((this.items[shard] ?? 0) < TERA_SHARD_COST || !dexData.value?.types[type]) return false
      // 테라스탈 중에는 바꿀 수 없음
      if (memberIndex === 0 && this.gimmickActive?.kind === 'tera') return false
      this.items[shard]! -= TERA_SHARD_COST
      if (!this.items[shard]) delete this.items[shard]
      m.teraType = type
      const name = speciesOf(m.species)?.ko ?? m.species
      useBattleLogStore().push(`${name}의 테라스탈 타입이 ${ro(dexData.value.types[type]!)} 바뀌었다!`, 'good')
      return true
    },
    enemyBattler(): Battler | null {
      const e = this.enemy
      if (!e) return null
      const sp = speciesOf(e.species)
      const b: Battler = {
        name: `${e.boss ? '보스 ' : '야생 '}${sp?.ko ?? e.species}`,
        species: e.species,
        level: e.level,
        nature: e.nature,
        ivs: e.ivs,
        evs: [0, 0, 0, 0, 0, 0],
        hp: 0,
        moves: e.moves ?? [],
        stages: { ...(e.stages ?? {}) },
        status: e.status ?? null,
        sleep: e.sleep,
        toxic: e.toxic,
        ability: e.ability ?? null,
        item: e.item ?? null,
        vol: { ...e.vol },
        intel: e.intel ? { cands: [...e.intel.cands], known: e.intel.known } : undefined,
      }
      b.hp = e.hp ?? maxHpOf(b)
      return b
    },

    /** 새 상대 등장 (공통 처리) */
    startBattle(enemy: WildPokemon) {
      const log = useBattleLogStore()
      this.refillHeld()
      this.endBattleGimmick()
      this.enemy = enemy
      this.playerStages = {}
      this.playerVol = {}
      this.battleTurns = 0
      // 맹독 턴 수는 전투마다 초기화
      if (this.party[0]?.toxic) this.party[0].toxic = 0
      const p = (this.stageProgress[this.currentStageId] ??= { seen: [], defeats: 0 })
      if (!enemy.boss && !p.seen.includes(enemy.species)) p.seen.push(enemy.species)
      if (!this.seen.includes(enemy.species)) this.seen.push(enemy.species)
      const name = speciesOf(enemy.species)?.ko ?? enemy.species
      log.beginBattle(name, !!enemy.boss)
      log.push(enemy.boss ? `보스 ${josa(name, '이', '가')} 승부를 걸어왔다!` : `앗! 야생 ${josa(name, '이', '가')} 튀어나왔다!`, 'info')
      // 특성 정보: 서로 상대가 가질 수 있는 특성을 후보로 시작
      enemy.intel = { cands: speciesAbilities(enemy.species, !!enemy.boss || this.difficulty === 'hard'), known: false }
      const mine = this.party[0]
      this.playerIntel = mine ? { cands: speciesAbilities(mine.species, true), known: false } : null
      // 전투 시작 시 발동하는 특성 (위협 등)
      const me = this.playerBattler()
      const foe = this.enemyBattler()
      if (me && foe) {
        for (const line of onEntry(me, foe)) log.push(line)
        this.saveBattlers(me, foe)
      }
      // 보스는 등장 연출(BattleScene)이 끝난 뒤 내 기술 선택
      log.pending = null
      log.wait((enemy.boss && !this.bossIntroSkipped ? BOSS_INTRO_MS : 0) + this.battlePickMs)
    },
    /** 전투 계산 결과(랭크·전투 중 상태·특성 정보)를 저장 */
    saveBattlers(me: Battler, foe: Battler) {
      this.playerStages = me.stages
      this.playerVol = me.vol ?? {}
      this.playerIntel = me.intel ?? null
      // 전투 중 써서 사라진 지닌 도구
      const m = this.party[0]
      if (m && heldOf(m) && !me.item) m.heldSpent = true
      const e = this.enemy
      if (!e) return
      e.stages = foe.stages
      e.vol = foe.vol
      e.intel = foe.intel
      e.item = foe.item ?? null
    },
    /** 써서 사라진 지닌 도구: 가방에 같은 도구가 있으면 다시 지님, 없으면 비움 */
    refillHeld() {
      const log = useBattleLogStore()
      for (const m of this.party) {
        if (!m.heldSpent) continue
        m.heldSpent = false
        const id = m.heldItem
        if (id && (this.items[id] ?? 0) > 0) {
          this.takeFromBag(id)
          const name = speciesOf(m.species)?.ko ?? m.species
          log.push(`가방의 ${josa(dexData.value?.items[id]?.ko ?? id, '을', '를')} ${name}에게 다시 지니게 했다.`, 'info')
        } else m.heldItem = null
      }
    },
    /** 가방에서 1개 꺼냄 */
    takeFromBag(id: string) {
      this.items[id] = (this.items[id] ?? 0) - 1
      if ((this.items[id] ?? 0) <= 0) delete this.items[id]
    },
    addToBag(id: string, n = 1) {
      this.items[id] = (this.items[id] ?? 0) + n
    },
    spawn() {
      const stage = findStage(this.currentStageId)?.stage
      const enemy = stage && rollWild(stage, this.difficulty === 'hard')
      if (enemy) this.startBattle(enemy)
      else this.nextEncounterAt = Date.now() + 5000
    },
    challengeBoss() {
      const stage = findStage(this.currentStageId)?.stage
      if (!stage || !this.bossReady(stage.id) || this.faint || this.travel || !battleReady()) return
      const boss = makeBoss(stage)
      if (boss) this.startBattle(boss)
    },

    /** 지금 쓸 수 있는 장착 기술 (PP가 남은 기술) */
    usableMoves(): string[] {
      const m = this.party[0]
      if (!m) return []
      const list = this.ppActive ? m.moves.filter((id) => (ppOf(m, id) ?? 1) > 0) : m.moves
      // 구애 도구로 고정된 기술 / 돌격조끼 (변화기 불가)
      const me = this.playerBattler()
      return me ? selectableMoves(me, list) : list
    },

    /**
     * 파티 포켓몬이 지금 상대에게 줄 수 있는 가장 큰 기대 데미지 (0 이하 = 타격할 기술이 없음).
     * withPp = true 면 PP가 남은 기술만, false 면 PP와 관계없이 장착한 기술 전부
     */
    bestDamageVsFoe(index: number, withPp: boolean): number {
      const m = this.party[index]
      const me = this.playerBattler(index)
      const foe = this.enemyBattler()
      if (!m || !me || !foe || m.hp === 0) return 0
      const list = withPp && this.ppActive ? m.moves.filter((id) => (ppOf(m, id) ?? 1) > 0) : m.moves
      let best = 0
      for (const id of selectableMoves(me, list)) {
        const md = moveData(id)
        if (md) best = Math.max(best, expectedDamage(me, foe, md))
      }
      return best
    },

    /**
     * 자동 교체: 싸우는 포켓몬이 상대를 타격할 기술이 없으면 (PP와 무관하게)
     * 유효한 타격을 줄 수 있는 파티 포켓몬 중 기대 데미지가 가장 큰 포켓몬으로 교체. 교체했으면 true
     */
    autoSwitchLead(): boolean {
      if (!this.enemy || this.faint || this.bestDamageVsFoe(0, false) > 0) return false
      let pick = -1
      let bestDmg = 0
      for (let i = 1; i < this.party.length; i++) {
        const d = this.bestDamageVsFoe(i, true)
        if (d > bestDmg) {
          bestDmg = d
          pick = i
        }
      }
      return pick > 0 && this.setLead(pick)
    },

    /** 한 턴 진행 (수동: 기술 버튼 / 자동: tick). gimmick = 이번 턴에 쓰는 특수 기능 */
    takeTurn(moveId: string, gimmick: Gimmick | null = null) {
      const log = useBattleLogStore()
      if (log.isBusy() || this.faint || !battleReady()) return
      const member = this.party[0]
      if (!member) return
      const usable = this.usableMoves()
      // 발버둥은 쓸 수 있는 기술이 없을 때만
      if (moveId === 'struggle' ? usable.length > 0 : !usable.includes(moveId)) return
      this.queueTurn(moveId, gimmick && this.gimmickOptions().includes(gimmick) ? gimmick : null)
    },

    /** 내 행동을 정하고 상대가 기술을 고를 때까지 대기 (battlePickMs 뒤 tick 에서 턴 계산) */
    queueTurn(playerMove: string | null, gimmick: Gimmick | null = null) {
      const log = useBattleLogStore()
      log.pending = { move: playerMove, gimmick }
      log.wait(this.battlePickMs)
    },
    /** 대기 중인 턴 계산. 그 사이 상대가 사라졌거나 기술을 못 쓰게 됐으면 취소 */
    resolvePending() {
      const log = useBattleLogStore()
      const pending = log.pending
      log.pending = null
      if (!pending || !this.enemy || this.faint || this.travel) return
      const move = pending.move
      if (move && move !== 'struggle' && !this.usableMoves().includes(move)) return
      this.resolveTurn(move, pending.gimmick ?? null)
    },

    /** 턴 계산 후 상태 반영. playerMove = null 이면 내 쪽은 행동하지 않음 (아이템 사용). gimmick = 이번 턴에 쓰는 특수 기능 */
    resolveTurn(playerMove: string | null, gimmick: Gimmick | null = null) {
      const log = useBattleLogStore()
      const member = this.party[0]
      if (!member || !this.enemy || member.hp === 0) return

      // 특수 기능은 턴이 시작될 때 발동 (Z기술은 고른 기술이 Z크리스탈과 같은 타입일 때만)
      let activated: Gimmick | null = null
      if (gimmick && playerMove && this.gimmickOptions().includes(gimmick)) {
        if (gimmick !== 'z' || zEligible(moveData(playerMove), heldOf(member))) {
          this.activateGimmick(gimmick)
          activated = gimmick
        }
      }
      const me = this.playerBattler()
      const foe = this.enemyBattler()
      if (!me || !foe || me.hp <= 0) return
      // 메가진화로 바뀐 특성의 등장 효과 (위협 등)
      if (activated === 'mega') for (const line of onAbilityChange(me, foe)) log.push(line)

      // 실제로 나가는 기술: Z기술 / 다이맥스 중이면 다이맥스 기술 (PP는 원래 기술에서 소모)
      const md = playerMove && playerMove !== 'struggle' ? moveData(playerMove) : null
      const override = md ? (activated === 'z' ? zMove(md) : this.gimmickActive?.kind === 'dynamax' ? maxMove(md) : undefined) : undefined
      const enemyMove = chooseMove(foe, me, DIFFICULTY_AI[this.difficulty])
      const result: TurnResult = runTurn(me, foe, playerMove, enemyMove, override)
      for (const line of result.lines) log.push(line)
      this.battleTurns++

      // PP 소모 (실제로 기술을 썼을 때만)
      if (playerMove && result.playerMoved && this.ppActive) {
        const left = ppOf(member, playerMove)
        if (left != null) (member.pp ??= {})[playerMove] = Math.max(0, left - result.ppCost)
        // 과사열매(지닌 도구): PP가 0이 된 기술의 PP 10 회복
        if (member.pp?.[playerMove] === 0 && me.item === 'leppa-berry' && me.hp > 0) {
          member.pp[playerMove] = Math.min(maxPpOf(playerMove, member) ?? 10, 10)
          me.item = null
          const name = speciesOf(member.species)?.ko ?? member.species
          const move = dexData.value?.movesById[playerMove]?.ko ?? playerMove
          log.push(`${josa(name, '은', '는')} ${ro(dexData.value?.items['leppa-berry']?.ko ?? '과사열매')} ${move}의 PP를 회복했다!`)
        }
      }

      member.hp = me.hp
      member.status = me.status ?? null
      member.sleep = me.sleep
      member.toxic = me.toxic
      this.saveBattlers(me, foe)
      const e = this.enemy!
      e.hp = foe.hp
      e.status = foe.status ?? null
      e.sleep = foe.sleep
      e.toxic = foe.toxic
      // 다이맥스: DYNAMAX_TURNS 턴이 지나면 끝남
      const g = this.gimmickActive
      if (g?.kind === 'dynamax' && member.hp !== 0 && --g.turns <= 0) this.endGimmick(true)
      // 다음 턴: 내 기술 선택
      log.wait(this.battlePickMs)

      if (foe.hp <= 0) this.onEnemyFainted()
      // 같은 턴에 둘 다 쓰러질 수 있음 (반동·독 등)
      if (me.hp <= 0 && member.hp === 0 && !this.faint) this.onPlayerFainted()
    },

    // ---------- 아이템 ----------
    /**
     * 아이템 사용. target = 파티 번호 (회복 아이템만, 기본 = 싸우는 포켓몬).
     * 회복 아이템은 전투 중 첫 기술을 쓴 뒤에는 한 턴을 소모하고, 그 전이나 전투 밖에서는 턴을 소모하지 않음.
     * 몬스터볼·배틀용 도구는 전투 중에만 쓸 수 있고 항상 한 턴을 소모함.
     * 사용했으면 true
     */
    useItem(itemId: string, target = 0): boolean {
      const log = useBattleLogStore()
      const def = shopItem(itemId)
      const member = this.party[target]
      if (!def || !member || (this.items[itemId] ?? 0) <= 0 || this.faint || !battleReady()) return false
      const inBattle = !!this.enemy
      const always = def.category === 'ball' || def.category === 'battle'
      const consumesTurn = inBattle && (always || this.battleTurns > 0)
      if (consumesTurn && log.isBusy()) return false
      if (def.category === 'ball') return this.throwBall(itemId)
      const effect = this.itemEffect(def, target)
      if (!effect) return false

      this.takeFromBag(itemId)
      const itemName = dexData.value?.items[itemId]?.ko ?? itemId
      log.push(`${josa(itemName, '을', '를')} 사용했다! ${effect()}`, 'info')
      if (consumesTurn && this.enemy) this.queueTurn(null)
      return true
    },

    /** 아이템 효과. 쓸모가 없으면 null, 있으면 적용 함수 (결과 문구 반환). target = 파티 번호 */
    itemEffect(def: ShopItem, target = 0): (() => string) | null {
      const m = this.party[target]
      if (!m) return null
      const name = speciesOf(m.species)?.ko ?? m.species
      const max = this.memberMaxHp(m)
      const hp = m.hp ?? max
      const friend = () => {
        if (def.friendship) this.addFriendship(m, def.friendship)
      }
      // 기절 회복 (성스러운분말 = 파티 전원)
      if (def.revive != null) {
        const targets = def.party ? this.party.filter((x) => x.hp === 0) : m.hp === 0 ? [m] : []
        if (!targets.length) return null
        return () => {
          for (const t of targets) {
            const tMax = maxHpOf({ species: t.species, level: t.level, ivs: t.ivs ?? [], evs: t.evs ?? [], nature: t.nature })
            t.hp = def.revive! >= 1 ? null : Math.max(1, Math.floor(tMax * def.revive!))
            cureStatus(t)
          }
          friend()
          const names = targets.map((t) => speciesOf(t.species)?.ko ?? t.species)
          return `${josa(names.join(', '), '이', '가')} 기운을 되찾았다!`
        }
      }
      // 배틀용 도구 (싸우는 포켓몬, 전투 중에만)
      if (def.category === 'battle') {
        if (!this.enemy || target !== 0) return null
        if (def.escape) {
          if (this.enemy.boss) return null
          return () => {
            this.escapeBattle()
            return '무사히 도망쳤다!'
          }
        }
        if (def.stage) {
          const [key, n] = def.stage
          if ((this.playerStages[key] ?? 0) >= 6) return null
          return () => {
            const me = this.playerBattler()!
            const lines: string[] = []
            me.stages[key] = Math.min(6, (me.stages[key] ?? 0) + n)
            this.playerStages = me.stages
            lines.push(`${name}의 ${josa(STAGE_LABEL[key], '이', '가')} 크게 올라갔다!`)
            return lines.join(' ')
          }
        }
        if (def.crit) {
          if ((this.playerVol.critBoost ?? 0) >= 2) return null
          return () => {
            this.playerVol = { ...this.playerVol, critBoost: (this.playerVol.critBoost ?? 0) + def.crit! }
            return `${josa(name, '은', '는')} 의욕이 넘치고 있다!`
          }
        }
        if (def.mist) {
          if ((this.playerVol.mist ?? 0) > 0) return null
          return () => {
            this.playerVol = { ...this.playerVol, mist: def.mist }
            return `${name}의 능력이 떨어지지 않게 되었다!`
          }
        }
        return null
      }
      if (m.hp === 0) return null
      const curable = !!m.status && !!def.cures?.includes(m.status)
      const healable = (def.hp != null || def.hpFrac != null) && hp < max
      if (def.hp != null || def.hpFrac != null || def.cures) {
        if (!healable && !curable) return null
        return () => {
          const parts: string[] = []
          if (healable) {
            const amount = def.hp === 'full' ? max : def.hpFrac != null ? Math.floor(max * def.hpFrac) : (def.hp as number)
            const after = Math.min(max, hp + amount)
            parts.push(`${name}의 체력이 ${after - hp} 회복되었다!`)
            m.hp = after >= max ? null : after
          }
          if (curable) {
            parts.push(`${name}의 ${STATUS_LABELS[m.status!]} 상태가 나았다!`)
            cureStatus(m)
          }
          friend()
          return parts.join(' ')
        }
      }
      if (def.pp) {
        const { amount, target: who } = def.pp
        const missing = m.moves
          .map((id) => ({ id, left: ppOf(m, id), max: maxPpOf(id, m) }))
          .filter((x): x is { id: string; left: number; max: number } => x.left != null && x.max != null && x.left < x.max)
        if (!missing.length) return null
        // 하나만 회복: 남은 PP 비율이 가장 낮은 기술
        const targets = who === 'all' ? missing : [missing.reduce((a, b) => (b.left / b.max < a.left / a.max ? b : a))]
        return () => {
          const pp = (m.pp ??= {})
          for (const t of targets) pp[t.id] = amount === 'full' ? t.max : Math.min(t.max, t.left + amount)
          const moveName = (id: string) => dexData.value?.movesById[id]?.ko ?? id
          return who === 'all' ? `${name}의 기술 PP가 회복되었다!` : `${moveName(targets[0]!.id)}의 PP가 회복되었다!`
        }
      }
      return null
    },

    /** 몬스터볼 던지기 (보스는 잡을 수 없음). 못 잡으면 한 턴 소모 */
    throwBall(ballId: string): boolean {
      const log = useBattleLogStore()
      const e = this.enemy
      const me = this.playerBattler()
      const foe = this.enemyBattler()
      if (!e || !me || !foe || (this.items[ballId] ?? 0) <= 0) return false
      const ballName = dexData.value?.items[ballId]?.ko ?? ballId
      if (e.boss) {
        log.push('보스 포켓몬은 잡을 수 없다!', 'bad')
        return false
      }
      this.takeFromBag(ballId)
      log.push(`${josa(ballName, '을', '를')} 던졌다!`, 'info')
      const { caught, shakes } = rollCatch(ballId, this.catchContext(), foe.hp, maxHpOf(foe))
      if (shakes > 0) log.push(`볼이 ${shakes}번 흔들렸다…`)
      if (caught) {
        this.onEnemyCaught(ballId)
        return true
      }
      const name = speciesOf(e.species)?.ko ?? e.species
      log.push(shakes >= 3 ? '아깝다! 조금만 더하면 잡을 수 있었는데!' : `앗! ${josa(name, '이', '가')} 볼에서 나와 버렸다!`)
      this.queueTurn(null)
      return true
    },
    /** 지금 상대의 포획 판정 정보 */
    catchContext(): CatchContext {
      const e = this.enemy!
      return {
        species: e.species,
        level: e.level,
        myLevel: this.party[0]?.level ?? 1,
        turns: this.battleTurns,
        caught: this.caught.includes(e.species),
        night: phaseAt(Date.now()) === 'night',
        water: findStage(this.currentStageId)?.stage.kind === 'water',
        status: e.status ?? null,
      }
    },

    /** 야생 포켓몬과의 배틀에서 도망 (보상 없음) */
    escapeBattle() {
      if (!this.enemy || this.enemy.boss) return
      this.endBattleGimmick()
      this.enemy = null
      this.playerVol = {}
      this.playerIntel = null
      useBattleLogStore().pending = null
      this.nextEncounterAt = Date.now() + this.searchMs
    },

    /**
     * 파티 화면 회복 버튼용: 다친 포켓몬엔 부족한 만큼을 채우는 가장 싼 체력 회복 아이템,
     * 기절한 포켓몬엔 가장 싼 기절 회복 아이템 (성스러운분은 다른 게 없을 때만). 쓸 게 없으면 null
     */
    quickHealPick(target: number): ShopItem | null {
      const m = this.party[target]
      if (!m) return null
      const owned = (cat: ItemCategory) =>
        SHOP_ITEMS.filter((i) => i.category === cat && (this.items[i.id] ?? 0) > 0 && this.itemEffect(i, target))
      if (m.hp === 0) {
        return [...owned('revive')].sort((a, b) => Number(!!a.party) - Number(!!b.party) || a.price - b.price)[0] ?? null
      }
      const max = this.memberMaxHp(m)
      const hp = m.hp ?? max
      if (hp >= max) return null
      const list = owned('heal').filter((i) => i.hp != null || i.hpFrac != null)
      const amount = (i: ShopItem) => (i.hp === 'full' ? max : i.hpFrac != null ? Math.floor(max * i.hpFrac) : (i.hp ?? 0))
      const enough = [...list].sort((a, b) => a.price - b.price).find((i) => amount(i) >= max - hp)
      return enough ?? [...list].sort((a, b) => amount(b) - amount(a))[0] ?? null
    },

    /** 아이템 자동 사용 (편의성 기능). 사용했으면 true */
    autoUseItem(): boolean {
      const m = this.party[0]
      const me = this.playerBattler()
      if (!m || !me || this.faint) return false
      const owned = (cat: ItemCategory) =>
        SHOP_ITEMS.filter((i) => i.category === cat && (this.items[i.id] ?? 0) > 0 && this.itemEffect(i))
      const on = (cat: AutoCategory) => this.perks.includes(`autoUse:${cat}`) && !!this.autoUse[cat]
      // 전투 중 상대를 타격할 기술이 하나도 없으면 (PP와 무관하게) 회복약·PP 회복은 쓰지 않음
      const useless = !!this.enemy && this.bestDamageVsFoe(0, false) <= 0

      // 1. 체력: 기준 아래면, 부족한 만큼을 채우는 가장 싼 아이템 (없으면 가장 많이 회복하는 아이템)
      const max = maxHpOf(me)
      if (!useless && on('heal') && (me.hp / max) * 100 < this.autoHealAt) {
        const list = owned('heal')
        const need = max - me.hp
        const amount = (i: ShopItem) => (i.hp === 'full' ? max : i.hpFrac != null ? Math.floor(max * i.hpFrac) : (i.hp ?? 0))
        const sorted = [...list].sort((a, b) => a.price - b.price)
        const enough = sorted.find((i) => amount(i) >= need)
        const pick = enough ?? [...list].sort((a, b) => amount(b) - amount(a))[0]
        if (pick && this.useItem(pick.id)) return true
      }
      // 2. 상태이상: 고칠 수 있는 가장 싼 아이템
      if (on('status') && m.status) {
        const pick = [...owned('status')].sort((a, b) => a.price - b.price)[0]
        if (pick && this.useItem(pick.id)) return true
      }
      // 3. PP: PP가 0인 기술이 있으면. 2개 이상이면 전체 회복 아이템 우선
      if (!useless && on('pp') && this.ppActive) {
        const empty = m.moves.filter((id) => ppOf(m, id) === 0).length
        if (empty) {
          const list = owned('pp')
          const prefer = empty >= 2 ? 'all' : 'one'
          const pick = list.find((i) => i.pp?.target === prefer) ?? list[0]
          if (pick && this.useItem(pick.id)) return true
        }
      }
      // 4. 몬스터볼: 도감에 없는 야생 포켓몬이면 가장 잡기 쉬운 볼 (마스터볼·파크볼은 쓰지 않음)
      const e = this.enemy
      if (on('ball') && e && !e.boss && !this.caught.includes(e.species)) {
        const foe = this.enemyBattler()!
        const ctx = this.catchContext()
        const balls = SHOP_ITEMS.filter(
          (i) => i.category === 'ball' && i.id !== 'master-ball' && i.id !== 'park-ball' && (this.items[i.id] ?? 0) > 0,
        )
        const chance = (id: string) => catchChance(id, ctx, foe.hp, maxHpOf(foe))
        const pick = balls.sort((a, b) => chance(b.id) - chance(a.id) || a.price - b.price)[0]
        if (pick && this.useItem(pick.id)) return true
      }
      return false
    },

    /**
     * PP 자동 센터 귀환 (편의성 기능, 자동 전투 중 전투 사이에만):
     * 싸우는 포켓몬의 모든 기술 PP가 AUTO_CENTER_PP_RATIO 미만이면 회복하러 감.
     * 아이템 우선이면, PP 회복 아이템 자동 사용이 켜져 있고 쓸 수 있는 아이템이 있을 때는 가지 않음. 갔으면 true
     */
    autoCenterForPp(): boolean {
      if (!this.auto || !this.autoCenter || !this.perks.includes('autoCenter:pp') || !this.ppActive) return false
      if (this.faint || this.travel || this.enemy) return false
      const m = this.party[0]
      if (!m || m.hp === 0) return false
      const moves = m.moves
        .map((id) => ({ left: ppOf(m, id), max: maxPpOf(id, m) }))
        .filter((x): x is { left: number; max: number } => x.left != null && x.max != null && x.max > 0)
      if (!moves.length || moves.some((x) => x.left >= x.max * AUTO_CENTER_PP_RATIO)) return false
      if (this.autoCenterPriority === 'item' && this.perks.includes('autoUse:pp') && this.autoUse.pp) {
        const hasItem = SHOP_ITEMS.some((i) => i.category === 'pp' && (this.items[i.id] ?? 0) > 0 && this.itemEffect(i))
        if (hasItem) return false
      }
      useBattleLogStore().push('PP가 얼마 남지 않아 회복하러 돌아갔다.', 'info')
      this.goRecover(RETREAT_MS, true)
      return true
    },

    /** 아이템 자동 구매 (편의성 기능): 고른 아이템이 떨어지면 1개 */
    autoBuyItems() {
      for (const cat of Object.keys(DEFAULT_AUTO_BUY) as AutoCategory[]) {
        if (!this.perks.includes(`autoBuy:${cat}`) || !this.autoBuy[cat]) continue
        const id = this.autoBuyItem[cat]
        if (!(this.items[id] ?? 0)) this.buyItem(id, 1)
      }
    },

    // ---------- 지닌 도구 ----------
    /** 가방의 도구를 지니게 함 (지니던 도구는 가방으로) */
    giveHeld(memberIndex: number, itemId: string): boolean {
      const m = this.party[memberIndex]
      if (!m || (this.items[itemId] ?? 0) <= 0 || this.faint) return false
      this.takeHeld(memberIndex)
      this.takeFromBag(itemId)
      m.heldItem = itemId
      m.heldSpent = false
      return true
    },
    /** 지닌 도구를 가방으로 */
    takeHeld(memberIndex: number) {
      const m = this.party[memberIndex]
      if (!m) return
      if (m.heldItem && !m.heldSpent) this.addToBag(m.heldItem)
      m.heldItem = null
      m.heldSpent = false
      if (memberIndex === 0) this.playerVol = { ...this.playerVol, choice: undefined }
    },

    // ---------- 기술머신 ----------
    /**
     * 기술머신으로 기술 가르치기 (기술레코드는 사라짐). 대기열을 거치지 않음:
     * 빈 칸이 있으면 장착, 칸이 가득 차면 replaceId 기술을 잊고 그 자리에 장착
     */
    useMachine(memberIndex: number, itemId: string, replaceId?: string): boolean {
      const m = this.party[memberIndex]
      const move = dexData.value?.items[itemId]?.move
      if (!m || !move || !isMachine(itemId) || (this.items[itemId] ?? 0) <= 0 || this.faint) return false
      if ((m.learned ?? m.moves).includes(move) || !canLearnMachine(m, move)) return false
      const full = m.moves.length >= this.slotsOf(m)
      if (full && (!replaceId || !m.moves.includes(replaceId))) return false
      const itemName = dexData.value?.items[itemId]?.ko ?? itemId
      const name = speciesOf(m.species)?.ko ?? m.species
      useBattleLogStore().push(`${name}에게 ${josa(itemName, '을', '를')} 사용했다!`, 'info')
      if (isRecord(itemId)) this.takeFromBag(itemId)
      if (m.pending) m.pending = m.pending.filter((id) => id !== move)
      this.putMove(m, move, full ? replaceId : undefined)
      return true
    },

    // ---------- 파티·도감 ----------
    /** 파티 포켓몬을 싸우는 포켓몬(맨 앞)으로. 전투 중 첫 기술을 쓴 뒤에는 한 턴을 소모 */
    setLead(index: number): boolean {
      const log = useBattleLogStore()
      const m = this.party[index]
      if (!m || index === 0 || m.hp === 0 || this.faint || !battleReady()) return false
      const consumesTurn = !!this.enemy && this.battleTurns > 0 && (this.party[0]?.hp ?? 1) !== 0
      if (consumesTurn && log.isBusy()) return false
      const prev = this.party[0]!
      this.switchLead(index)
      if (this.enemy) {
        const a = speciesOf(prev.species)?.ko ?? prev.species
        const b = speciesOf(m.species)?.ko ?? m.species
        log.push(prev.hp === 0 ? `가랏! ${b}!` : `${a}, 돌아와! 가랏! ${b}!`, 'info')
        if (consumesTurn) this.queueTurn(null)
      }
      return true
    },
    /** 맨 앞 포켓몬 교체 (전투 중 상태 초기화) */
    switchLead(index: number) {
      // 특수 기능 효과는 교체하면 끝남 (이번 전투에서 다시 쓸 수는 없음)
      this.endGimmick()
      const party = this.party
      ;[party[0], party[index]] = [party[index]!, party[0]!]
      this.playerStages = {}
      this.playerVol = {}
      const lead = party[0]!
      if (lead.toxic) lead.toxic = 0
      this.playerIntel = this.enemy ? { cands: speciesAbilities(lead.species, true), known: false } : null
    },
    /**
     * 파티에서 도감으로 보내기: 성격·특성·개체값·노력치·레벨·친밀도·기술이 도감 기록에 합쳐지고 개체는 사라짐.
     * 싸우는 포켓몬은 전투 중이 아닐 때만
     */
    sendToDex(index: number): boolean {
      const m = this.party[index]
      if (!m || this.party.length <= 1 || this.faint || (index === 0 && this.enemy)) return false
      this.party.splice(index, 1)
      this.sendToDexMember(m)
      if (index === 0) this.switchLead(0)
      return true
    },
    /** 파티에서 빠진 포켓몬을 도감 기록에 합침 (지닌 도구는 가방으로) */
    sendToDexMember(m: PartyMember) {
      this.takeHeldFrom(m)
      this.recordToDex(m)
    },
    /** 포켓몬의 정보를 도감 기록에 합침 */
    recordToDex(m: PartyMember) {
      const normal = normalAbilities(m.species)
      const ability = m.hiddenAbility ? HIDDEN_ABILITY_SLOT : normal.length ? (m.abilitySlot ?? 0) % normal.length : (m.abilitySlot ?? 0)
      const ivs = Array.from({ length: 6 }, (_, i) => m.ivs?.[i] ?? 0)
      const evs = Array.from({ length: 6 }, (_, i) => m.evs?.[i] ?? 0)
      const friendship = friendshipOf(m)
      const moves = [...new Set([...(m.learned ?? []), ...m.moves, ...(m.pending ?? [])])]
      const r = this.dexRecords[m.species]
      if (!r) {
        this.dexRecords[m.species] = {
          natures: [m.nature],
          abilities: [ability],
          ivMin: [...ivs],
          ivMax: [...ivs],
          evMin: [...evs],
          evMax: [...evs],
          levelMin: m.level,
          levelMax: m.level,
          friendshipMin: friendship,
          friendshipMax: friendship,
          moves,
          ppUps: { ...(m.ppUps ?? {}) },
          extraSlots: m.extraSlots ?? 0,
        }
        return
      }
      if (!r.natures.includes(m.nature)) r.natures.push(m.nature)
      if (!r.abilities.includes(ability)) r.abilities.push(ability)
      for (let i = 0; i < 6; i++) {
        r.ivMin[i] = Math.min(r.ivMin[i] ?? ivs[i]!, ivs[i]!)
        r.ivMax[i] = Math.max(r.ivMax[i] ?? ivs[i]!, ivs[i]!)
        r.evMin[i] = Math.min(r.evMin[i] ?? evs[i]!, evs[i]!)
        r.evMax[i] = Math.max(r.evMax[i] ?? evs[i]!, evs[i]!)
      }
      r.levelMin = Math.min(r.levelMin, m.level)
      r.levelMax = Math.max(r.levelMax, m.level)
      r.friendshipMin = Math.min(r.friendshipMin, friendship)
      r.friendshipMax = Math.max(r.friendshipMax, friendship)
      for (const id of moves) if (!r.moves.includes(id)) r.moves.push(id)
      for (const [id, n] of Object.entries(m.ppUps ?? {})) r.ppUps[id] = Math.max(r.ppUps[id] ?? 0, n)
      r.extraSlots = Math.max(r.extraSlots, m.extraSlots ?? 0)
    },
    /** 도감에서 파티로 불러오기: 기록된 범위 밖의 값은 범위 안으로 맞춤. 성공 여부 반환 */
    summonFromDex(species: string, c: SummonChoice): boolean {
      const r = this.dexRecords[species]
      if (!r || this.party.length >= PARTY_MAX || this.faint) return false
      if (!r.natures.includes(c.nature) || !r.abilities.includes(c.ability)) return false
      const level = clamp(Math.round(c.level), r.levelMin, r.levelMax)
      const ivs = r.ivMin.map((min, i) => clamp(Math.round(c.ivs[i] ?? min), min, r.ivMax[i]!))
      // 노력치: 기록 범위 안 + 현재 노력치 한계(능력치별·합계)
      const evs = [0, 0, 0, 0, 0, 0]
      r.evMin.forEach((min, i) => {
        const want = clamp(Math.round(c.evs[i] ?? min), min, r.evMax[i]!)
        evs[i] = Math.min(want, this.evRoom(evs, i))
      })
      const extraSlots = r.extraSlots
      const moves = [...new Set(c.moves)].filter((id) => r.moves.includes(id)).slice(0, slotsAt(this.totalDefeats, { extraSlots }))
      this.party.push({
        species,
        level,
        moves,
        learned: [...r.moves],
        pending: [],
        exp: expAtLevel(species, level),
        nature: c.nature,
        ivs,
        evs,
        hp: null,
        pp: {},
        ppUps: Object.fromEntries(Object.entries(r.ppUps).filter(([id]) => r.moves.includes(id))),
        extraSlots,
        status: null,
        friendship: clamp(Math.round(c.friendship), r.friendshipMin, r.friendshipMax),
        abilitySlot: c.ability === HIDDEN_ABILITY_SLOT ? 0 : c.ability,
        hiddenAbility: c.ability === HIDDEN_ABILITY_SLOT,
        heldItem: null,
      })
      this.backfillLearned()
      return true
    },
    /** 파티에서 빠지는 포켓몬의 지닌 도구는 가방으로 */
    takeHeldFrom(m: PartyMember) {
      if (m.heldItem && !m.heldSpent) this.addToBag(m.heldItem)
      m.heldItem = null
      m.heldSpent = false
    },

    /** 잡은 포켓몬: 도감에 기록 + 파티에 자리가 있으면 파티로 */
    onEnemyCaught(ballId: string) {
      const log = useBattleLogStore()
      const e = this.enemy!
      const name = speciesOf(e.species)?.ko ?? e.species
      this.endBattleGimmick()
      log.push(`신난다! 야생 ${josa(name, '을', '를')} 잡았다!`, 'good')
      const isNew = !this.caught.includes(e.species)
      if (isNew) {
        this.caught.push(e.species)
        log.push(`${name}의 데이터가 새로 도감에 등록되었다!`, 'good')
      }
      // 6세대 이후: 잡아도 경험치를 얻음
      log.recordReward(this.rewardExp(e), 0)
      const p = (this.stageProgress[this.currentStageId] ??= { seen: [], defeats: 0 })
      p.defeats++

      const normal = normalAbilities(e.species)
      const hidden = !!e.ability && e.ability === hiddenAbility(e.species) && !normal.includes(e.ability)
      const slot = Math.max(0, normal.indexOf(e.ability ?? ''))
      const learned = movesUpToLevel(e.species, e.level, this.unlockedGens)
      const moves = (e.moves?.length ? e.moves : learned).slice(-1)
      const caught: PartyMember = {
        species: e.species,
        level: e.level,
        moves,
        learned: [...new Set([...(e.moves ?? []), ...learned])],
        exp: expAtLevel(e.species, e.level),
        nature: e.nature,
        ivs: [...e.ivs],
        evs: [0, 0, 0, 0, 0, 0],
        hp: e.hp,
        status: e.status ?? null,
        abilitySlot: slot,
        hiddenAbility: hidden,
        heldItem: e.item ?? null,
        ball: ballId,
        // 테라스탈 타입: 그 포켓몬의 타입 중 하나
        teraType: (() => {
          const types = speciesOf(e.species)?.types ?? []
          return types[randInt(0, Math.max(0, types.length - 1))]
        })(),
      }
      if (ballId === 'heal-ball') {
        caught.hp = null
        cureStatus(caught)
      }
      if (ballId === 'friend-ball') caught.friendship = FRIEND_BALL_FRIENDSHIP
      if (caught.hp != null && caught.hp >= maxHpOf({ ...caught, ivs: caught.ivs, evs: caught.evs })) caught.hp = null
      this.recordToDex(caught)
      if (this.party.length < PARTY_MAX) {
        this.party.push(caught)
        log.push(`${josa(name, '은', '는')} 파티에 들어갔다!`, 'info')
      } else {
        log.push(`파티가 가득 차서 ${name}의 정보는 도감에 기록되었다.`, 'info')
        if (caught.heldItem) {
          const itemName = dexData.value?.items[caught.heldItem]?.ko ?? caught.heldItem
          log.push(`${josa(name, '이', '가')} 지니고 있던 ${josa(itemName, '은', '는')} 가방에 넣었다.`, 'info')
        }
        this.takeHeldFrom(caught)
      }
      this.enemy = null
      this.playerVol = {}
      this.playerIntel = null
      this.nextEncounterAt = Date.now() + this.searchMs
    },

    /** 경험치·노력치 (싸운 포켓몬 + 학습장치가 켜져 있으면 나머지 파티 절반). 싸운 포켓몬이 얻은 경험치 반환 */
    rewardExp(enemy: WildPokemon): number {
      const lead = this.party[0]!
      const base = expGain(enemy.species, enemy.level, lead.level, !!enemy.boss, DIFFICULTY_EXP[this.difficulty])
      const egg = (m: PartyMember) => (heldOf(m) === LUCKY_EGG ? LUCKY_EGG_MULT : 1)
      const leadExp = Math.floor(base * egg(lead))
      this.gainExp(lead, leadExp)
      this.gainEvs(lead, enemy.species)
      if (this.expShare && this.expShareOwned) {
        for (const m of this.party.slice(1)) {
          if (m.hp === 0) continue
          const amount = expGain(enemy.species, enemy.level, m.level, !!enemy.boss, DIFFICULTY_EXP[this.difficulty])
          this.gainExp(m, Math.max(1, Math.floor(amount * EXP_SHARE_RATE * egg(m))))
          this.gainEvs(m, enemy.species)
        }
      }
      return leadExp
    },
    /** 노력치 (교정깁스 2배, 파워 계열 도구 +8) */
    gainEvs(member: PartyMember, foe: string) {
      const ev = battleData.value?.species[foe]?.ev
      if (!ev) return
      const held = heldOf(member)
      const gain = [...ev].map((v) => v * (held === MACHO_BRACE ? 2 : 1))
      const power = held ? POWER_ITEMS[held] : undefined
      if (power != null) gain[power] = (gain[power] ?? 0) + POWER_ITEM_EV
      const evs = (member.evs ??= [0, 0, 0, 0, 0, 0])
      this.keepHpRatio(member, () => {
        gain.forEach((v, i) => {
          if (!v || this.evLockedOf(member, i)) return
          evs[i] = (evs[i] ?? 0) + Math.min(v, this.evRoom(evs, i))
        })
      })
    },
    buyExpShare(): boolean {
      if (this.expShareOwned || this.money < EXP_SHARE_ITEM.price) return false
      this.money -= EXP_SHARE_ITEM.price
      this.expShareOwned = true
      this.expShare = true
      return true
    },
    setExpShare(on: boolean) {
      if (this.expShareOwned) this.expShare = on
    },

    // ---------- 상점 ----------
    buyItem(itemId: string, count = 1): boolean {
      // 메가스톤·Z크리스탈·테라피스는 그 특수 기능을 해금한 뒤에만
      const gimmickItem = gimmickItemOf(itemId)
      if (gimmickItem && !this.gimmickUnlocked(gimmickItem.gimmick)) return false
      const price = priceOf(itemId)
      if (price == null || count < 1 || this.money < price * count) return false
      this.money -= price * count
      this.items[itemId] = (this.items[itemId] ?? 0) + count
      return true
    },
    /** 가방의 아이템 팔기 */
    sellItem(itemId: string, count = 1): boolean {
      const price = sellPrice(itemId)
      if (price <= 0 || count < 1 || (this.items[itemId] ?? 0) < count) return false
      this.items[itemId]! -= count
      if (!this.items[itemId]) delete this.items[itemId]
      this.money += price * count
      return true
    },
    buyPerk(id: PerkId): boolean {
      const chain = CHAIN_PERKS.find((p) => p.id === id)
      const perk = chain ?? [...PERKS, BOSS_INTRO_PERK, AUTO_CENTER_PERK, DEX_REVEAL_PERK].find((p) => p.id === id)
      if (!perk || this.perks.includes(id) || this.money < perk.price) return false
      if (chain?.requires && !this.perks.includes(chain.requires)) return false
      this.money -= perk.price
      this.perks.push(id)
      if (chain) return true
      if (id === 'bossIntro:skip') {
        this.skipBossIntro = true
        return true
      }
      if (id === 'autoCenter:pp') {
        this.autoCenter = true
        return true
      }
      if (id === 'dex:reveal') return true
      // 사면 바로 켬
      const [kind, cat] = id.split(':') as ['autoUse' | 'autoBuy', AutoCategory]
      this[kind][cat] = true
      return true
    },
    /** 노력치 한계 돌파 2 (여러 번 구매) */
    buyEvBreak2(): boolean {
      const price = evBreak2Price(this.evBreaks + 1)
      if (!this.perks.includes('evBreak:1') || this.money < price) return false
      this.money -= price
      this.evBreaks++
      return true
    },
    /** 노력치를 더 올릴 수 있는 양 (능력치 한계·합계 한계) */
    evRoom(evs: number[], i: number): number {
      const total = evs.reduce((a, b) => a + b, 0)
      return Math.max(0, Math.min(this.evStatCap - (evs[i] ?? 0), this.evTotalCap - total))
    },
    /** 능력치별 전투 노력치 획득 켜기/끄기 */
    setEvLock(memberIndex: number, stat: number, locked: boolean) {
      const m = this.party[memberIndex]
      if (!m || !this.perks.includes('evBreak:1')) return
      const arr = (m.evLocked ??= [false, false, false, false, false, false])
      arr[stat] = locked
    },
    buyEverstone(): boolean {
      if (this.everstoneOwned || this.money < EVERSTONE_ITEM.price) return false
      this.money -= EVERSTONE_ITEM.price
      this.everstoneOwned = true
      this.everstone = true
      return true
    },
    setEverstone(on: boolean) {
      if (this.everstoneOwned) this.everstone = on
    },
    buyExtraSlot(memberIndex: number): boolean {
      const m = this.party[memberIndex]
      if (!m) return false
      const price = extraSlotPrice((m.extraSlots ?? 0) + 1)
      if (this.money < price) return false
      if (!this.unlockExtraSlot(memberIndex)) return false
      this.money -= price
      return true
    },

    onEnemyFainted() {
      const log = useBattleLogStore()
      const enemy = this.enemy!
      const member = this.party[0]!
      const stageId = this.currentStageId
      const name = speciesOf(enemy.species)?.ko ?? enemy.species
      log.push(`${enemy.boss ? '보스 ' : '야생 '}${josa(name, '은', '는')} 쓰러졌다!`, 'good')
      this.endBattleGimmick()

      // 경험치 · 노력치 (행운의알·학습장치·교정깁스·파워 계열 도구)
      const expGot = this.rewardExp(enemy)

      // 상금 (부적금화·행운의향로를 지니고 싸우면 2배)
      const held = heldOf(member)
      const prize = prizeMoney(enemy.level, !!enemy.boss) * (held && MONEY_ITEMS.has(held) ? 2 : 1)
      this.money += prize
      log.push(`상금으로 ${prize.toLocaleString()}원을 받았다!`)
      log.recordReward(expGot, prize)

      // 지니고 있던 도구 획득
      if (enemy.item) {
        this.addToBag(enemy.item)
        const itemName = dexData.value?.items[enemy.item]?.ko ?? enemy.item
        log.push(`${josa(name, '은', '는')} ${josa(itemName, '을', '를')} 지니고 있었다! ${josa(itemName, '을', '를')} 손에 넣었다!`, 'good')
      }

      const p = (this.stageProgress[stageId] ??= { seen: [], defeats: 0 })
      if (enemy.boss) p.defeats = 0
      else p.defeats++
      this.countDefeat()
      this.addFriendship(member, enemy.boss ? 3 : 1)

      // 전투 종료 시 특성 (자연회복·재생력)
      const me = this.playerBattler()
      const foe = this.enemyBattler()
      if (me && foe) {
        const lines = onBattleEnd(me, foe)
        for (const line of lines) log.push(line)
        if (lines.length) {
          member.hp = me.hp >= maxHpOf(me) ? null : me.hp
          if (!me.status) cureStatus(member)
        }
      }

      this.enemy = null
      this.playerVol = {}
      this.playerIntel = null
      this.nextEncounterAt = Date.now() + this.searchMs

      if (enemy.boss) this.onBossCleared(stageId)
    },

    /** 계정 격파 수 증가 → 기본 기술칸 해금 (파티 전체) */
    countDefeat() {
      const before = this.baseSlots
      this.totalDefeats++
      if (this.baseSlots <= before) return
      useBattleLogStore().push(`모든 포켓몬의 기본 기술칸이 ${this.baseSlots}칸으로 늘었다!`, 'good')
      for (const m of this.party) this.fillFromPending(m)
    },

    /** 기술칸이 늘었을 때: 알림 + 대기열 맨 앞 기술부터 자동 장착 */
    onSlotOpened(member: PartyMember) {
      const log = useBattleLogStore()
      const name = speciesOf(member.species)?.ko ?? member.species
      log.push(`${name}의 기술칸이 ${this.slotsOf(member)}칸으로 늘었다!`, 'good')
      this.fillFromPending(member)
    },

    /** 빈 기술칸을 대기열 맨 앞 기술부터 채움 */
    fillFromPending(member: PartyMember, announce = true) {
      const pending = member.pending
      if (!pending?.length) return
      const learned = (member.learned ??= [...member.moves])
      const name = speciesOf(member.species)?.ko ?? member.species
      while (pending.length && member.moves.length < this.slotsOf(member)) {
        const id = pending.shift()!
        if (!learned.includes(id)) learned.push(id)
        if (member.moves.includes(id)) continue
        member.moves.push(id)
        const move = dexData.value?.movesById[id]?.ko ?? id
        if (announce) useBattleLogStore().push(`${josa(name, '은', '는')} ${josa(move, '을', '를')} 배웠다!`, 'good')
      }
    },

    /** 상점용: 기본 4칸을 모두 연 포켓몬의 기술칸 추가 열림. 성공 여부 반환 */
    unlockExtraSlot(memberIndex: number): boolean {
      const m = this.party[memberIndex]
      if (!m || this.baseSlots < BASE_SLOTS_MAX || (m.extraSlots ?? 0) >= EXTRA_SLOTS) return false
      m.extraSlots = (m.extraSlots ?? 0) + 1
      this.onSlotOpened(m)
      return true
    },

    gainExp(member: PartyMember, amount: number) {
      const log = useBattleLogStore()
      const name = speciesOf(member.species)?.ko ?? member.species
      member.exp ??= expAtLevel(member.species, member.level)
      member.exp += amount
      log.push(`${josa(name, '은', '는')} 경험치를 ${amount} 얻었다!`)
      let leveled = false
      const maxHp = () =>
        maxHpOf({ species: member.species, level: member.level, ivs: member.ivs ?? [], evs: member.evs ?? [], nature: member.nature })
      while (member.level < 100 && member.exp >= expAtLevel(member.species, member.level + 1)) {
        const oldMax = maxHp()
        member.level++
        // 최대 HP 증가분만큼 현재 HP도 증가 (원작과 동일)
        if (member.hp != null) member.hp = Math.max(0, member.hp + (maxHp() - oldMax))
        log.push(`${josa(name, '은', '는')} 레벨 ${ro(String(member.level))} 올랐다!`, 'good')
        // 원작 친밀도: 레벨업 시 0~99 +5, 100~199 +3, 200~ +2
        const f = friendshipOf(member)
        this.addFriendship(member, f < 100 ? 5 : f < 200 ? 3 : 2)
        for (const id of movesLearnedAt(member.species, member.level, this.unlockedGens)) this.learnMove(member, id)
        leveled = true
      }
      if (leveled) this.tryLevelEvolution(member)
    },

    /** 친밀도 변화. 오를 때: 평온의방울 1.5배, 럭셔리볼 +1 */
    addFriendship(member: PartyMember, delta: number) {
      if (delta > 0) {
        if (heldOf(member) === SOOTHE_BELL) delta = Math.ceil(delta * 1.5)
        if (member.ball === LUXURY_BALL) delta += 1
      }
      member.friendship = Math.max(0, Math.min(FRIENDSHIP_MAX, friendshipOf(member) + delta))
    },

    // ---------- 진화 ----------
    /** 레벨업 진화: 조건을 만족하는 진화가 있으면 진화 (변함없는돌이 켜져 있으면 안 함). 진화했으면 true */
    tryLevelEvolution(member: PartyMember): boolean {
      if (this.everstone) return false
      const ok = evolutionsOf(member.species).filter((e) => e.via === 'level' && evolutionMet(member, e))
      if (!ok.length) return false
      // 조건이 더 구체적인 진화 우선, 같으면 무작위 (예: 개무소 → 실쿤/카스쿤)
      const score = (e: Evolution) => Object.keys(e).length
      const best = Math.max(...ok.map(score))
      const top = ok.filter((e) => score(e) === best)
      this.evolve(member, top[randInt(0, top.length - 1)]!.to)
      return true
    },

    /** 불러온 직후: 이미 레벨업 진화 조건을 넘긴 포켓몬 진화 (진화 기능 추가 전 저장 데이터) */
    checkEvolutions() {
      if (!battleReady()) return
      for (const m of this.party) this.tryLevelEvolution(m)
    },

    /** 이 아이템(진화의 돌 등·연결의끈)으로 진화하는 방법 */
    itemEvolutions(member: PartyMember, itemId: string): Evolution[] {
      return evolutionsOf(member.species).filter((e) =>
        itemId === LINKING_CORD ? e.via === 'cord' : e.via === 'item' && e.item === itemId,
      )
    },
    /** 아이템 진화가 지금 가능한지 (연결의끈 + 지니던 도구는 둘 다 있어야 함) */
    canItemEvolve(member: PartyMember, e: Evolution): boolean {
      if (e.via === 'level') return false
      const has = (id: string) => (this.items[id] ?? 0) > 0
      if (e.via === 'cord' && (!has(LINKING_CORD) || (e.item && !has(e.item)))) return false
      if (e.via === 'item' && !has(e.item!)) return false
      return evolutionMet(member, e)
    },
    /** 아이템으로 진화 (변함없는돌과 무관하게 가능) */
    useEvolutionItem(memberIndex: number, e: Evolution): boolean {
      const m = this.party[memberIndex]
      if (!m || this.faint || !battleReady() || !evolutionsOf(m.species).includes(e) || !this.canItemEvolve(m, e)) return false
      const used = e.via === 'cord' ? [LINKING_CORD, ...(e.item ? [e.item] : [])] : [e.item!]
      for (const id of used) {
        this.items[id]! -= 1
        if (!this.items[id]) delete this.items[id]
      }
      const names = used.map((id) => dexData.value?.items[id]?.ko ?? id)
      const text = names.length > 1 ? `${josa(names[0]!, '과', '와')} ${names[1]}` : names[0]!
      const name = speciesOf(m.species)?.ko ?? m.species
      useBattleLogStore().push(`${name}에게 ${josa(text, '을', '를')} 사용했다!`, 'info')
      this.evolve(m, e.to)
      return true
    },

    // ---------- 육성 아이템 ----------
    /**
     * 육성 아이템 효과. 쓸모가 없으면 null, 있으면 적용 함수 (결과 문구 반환).
     * target: 은색병뚜껑 = 능력치 번호, 포인트업·포인트맥스 = 기술 id
     */
    trainEffect(member: PartyMember, def: TrainItem, target?: number | string): (() => string) | null {
      const name = speciesOf(member.species)?.ko ?? member.species
      // 노력치 (영양제·깃털·열매)
      if (def.ev != null && def.stat != null) {
        const i = def.stat
        const evs = member.evs ?? [0, 0, 0, 0, 0, 0]
        const cur = evs[i] ?? 0
        const next = def.ev > 0 ? cur + Math.min(def.ev, this.evRoom(evs, i)) : Math.max(0, cur + def.ev)
        // 열매는 노력치가 0이어도 친밀도를 올릴 수 있으면 사용 가능 (원작과 동일)
        const friendUp = def.ev < 0 && friendshipOf(member) < FRIENDSHIP_MAX
        if (next === cur && !friendUp) return null
        return () => {
          const parts: string[] = []
          if (next !== cur) {
            this.keepHpRatio(member, () => {
              const arr = (member.evs ??= [0, 0, 0, 0, 0, 0])
              arr[i] = next
            })
            parts.push(`${name}의 ${STAT_LABELS[i]} 노력치가 ${next > cur ? '올랐다' : '내려갔다'}! (${cur} → ${next})`)
          }
          if (friendUp) {
            const f = friendshipOf(member)
            this.addFriendship(member, f < 100 ? 10 : f < 200 ? 5 : 2)
            parts.push(`${josa(name, '은', '는')} 친밀해졌다!`)
          }
          return parts.join(' ')
        }
      }
      // 경험치 (이상한사탕·경험사탕)
      if (def.exp != null) {
        if (member.level >= 100) return null
        return () => {
          const exp = member.exp ?? expAtLevel(member.species, member.level)
          const amount = def.exp === 'level' ? expAtLevel(member.species, member.level + 1) - exp : (def.exp as number)
          this.gainExp(member, amount)
          return ''
        }
      }
      // PP 최대치 (포인트업·포인트맥스): 장착한 기술 중 하나
      if (def.ppUp != null) {
        const moveId = typeof target === 'string' ? target : null
        const base = moveId ? (dexData.value?.movesById[moveId]?.pp ?? null) : null
        const ups = moveId ? (member.ppUps?.[moveId] ?? 0) : PP_UP_MAX
        // 기본 PP가 1 이하인 기술(스케치 등)은 올릴 수 없음
        if (!moveId || !member.moves.includes(moveId) || base == null || base <= 1 || ups >= PP_UP_MAX) return null
        return () => {
          const before = maxPpOf(moveId, member)!
          const left = ppOf(member, moveId)!
          ;(member.ppUps ??= {})[moveId] = Math.min(PP_UP_MAX, ups + def.ppUp!)
          const after = maxPpOf(moveId, member)!
          // 늘어난 만큼 남은 PP도 늘어남
          if (member.pp?.[moveId] != null) member.pp[moveId] = left + (after - before)
          const move = dexData.value?.movesById[moveId]?.ko ?? moveId
          return `${move}의 PP 최대치가 올랐다! (${before} → ${after})`
        }
      }
      // 특성 (특성캡슐·특성패치)
      if (def.ability) {
        const normal = normalAbilities(member.species)
        const before = memberAbility(member)
        let apply: () => void
        if (def.ability === 'capsule') {
          // 일반 특성이 2개이고 숨겨진 특성이 아닐 때
          if (member.hiddenAbility || normal.length < 2) return null
          apply = () => (member.abilitySlot = ((member.abilitySlot ?? 0) % normal.length) === 0 ? 1 : 0)
        } else if (member.hiddenAbility) {
          // 숨겨진 특성 → 일반 특성 (9세대)
          apply = () => (member.hiddenAbility = false)
        } else {
          const hidden = hiddenAbility(member.species)
          if (!hidden || hidden === before) return null
          apply = () => (member.hiddenAbility = true)
        }
        return () => {
          apply()
          const after = memberAbility(member)
          if (after === before) return `하지만 ${name}의 특성은 바뀌지 않았다.`
          return `${name}의 특성이 ${abilityName(before)}에서 ${ro(abilityName(after))} 바뀌었다!`
        }
      }
      // 개체값 (병뚜껑): 레벨 제한
      if (def.iv) {
        if (member.level < BOTTLE_CAP_LEVEL) return null
        const ivs = member.ivs ?? []
        const stats = def.iv === 'all' ? [0, 1, 2, 3, 4, 5] : typeof target === 'number' ? [target] : []
        const raise = stats.filter((i) => i >= 0 && i < 6 && (ivs[i] ?? 0) < 31)
        if (!raise.length) return null
        return () => {
          this.keepHpRatio(member, () => {
            const arr = (member.ivs ??= [0, 0, 0, 0, 0, 0])
            for (const i of raise) arr[i] = 31
          })
          const what = def.iv === 'all' ? '모든 능력치' : STAT_LABELS[raise[0]!]
          return `${name}의 ${what} 개체값이 최고가 되었다!`
        }
      }
      // 성격 (민트)
      if (def.nature) {
        const to = def.nature
        if (!NATURES[to] || member.nature === to) return null
        return () => {
          this.keepHpRatio(member, () => (member.nature = to))
          return `${name}의 성격이 ${ro(NATURES[to]!.ko)} 바뀌었다!`
        }
      }
      return null
    },

    /**
     * 육성 아이템 사용 (턴을 소모하지 않음). times만큼 효과가 있는 동안 반복.
     * 사용한 개수 반환
     */
    useTrainItem(memberIndex: number, itemId: string, target?: number | string, times = 1): number {
      const def = trainItem(itemId)
      const m = this.party[memberIndex]
      if (!def || !m || this.faint || !battleReady()) return 0
      const log = useBattleLogStore()
      const itemName = dexData.value?.items[itemId]?.ko ?? itemId
      const name = speciesOf(m.species)?.ko ?? m.species
      let used = 0
      while (used < times && (this.items[itemId] ?? 0) > 0) {
        const effect = this.trainEffect(m, def, target)
        if (!effect) break
        this.items[itemId]! -= 1
        if (!this.items[itemId]) delete this.items[itemId]
        log.push(`${name}에게 ${josa(itemName, '을', '를')} 사용했다!`, 'info')
        const text = effect()
        if (text) log.push(text, 'good')
        used++
      }
      return used
    },

    /** 최대 HP가 바뀌는 변화(노력치·개체값·성격): 최대 HP 증감분만큼 현재 HP도 증감 */
    keepHpRatio(member: PartyMember, change: () => void) {
      const maxHp = () => this.memberMaxHp(member)
      const before = maxHp()
      change()
      if (member.hp != null && member.hp > 0) member.hp = Math.max(1, Math.min(maxHp(), member.hp + (maxHp() - before)))
    },

    /** 진화: 포켓몬 변경, 최대 HP 증가분만큼 HP 증가, 진화 시 배우는 기술 습득, 도감 등록 */
    evolve(member: PartyMember, to: string) {
      const log = useBattleLogStore()
      // 메가진화 등 특수 기능 효과 중에 진화하면 효과가 끝남
      if (member === this.party[0]) this.endGimmick()
      const before = speciesOf(member.species)?.ko ?? member.species
      const after = speciesOf(to)?.ko ?? to
      const maxHp = (species: string) =>
        maxHpOf({ species, level: member.level, ivs: member.ivs ?? [], evs: member.evs ?? [], nature: member.nature })
      const oldMax = maxHp(member.species)
      member.species = to
      if (member.hp != null) member.hp = Math.max(0, member.hp + (maxHp(to) - oldMax))
      log.push(`어라…!? ${before}의 모습이…!`, 'info')
      log.push(`축하합니다! ${josa(before, '은', '는')} ${ro(after)} 진화했다!`, 'good')
      if (!this.caught.includes(to)) this.caught.push(to)
      // 진화할 때(레벨 0) · 현재 레벨에 배우는 기술
      for (const lv of [0, member.level]) for (const id of movesLearnedAt(to, lv, this.unlockedGens)) this.learnMove(member, id)
      this.backfillLearned()
    },

    /**
     * 레벨업·진화로 새 기술을 배움: 빈 칸이 있으면 바로 장착,
     * 칸이 가득 찼으면 대기열 맨 뒤에 넣음 (기술 탭에서 맨 앞부터 잊기/교체)
     */
    learnMove(member: PartyMember, moveId: string) {
      const learned = (member.learned ??= [...member.moves])
      const pending = (member.pending ??= [])
      if (learned.includes(moveId) || pending.includes(moveId)) return
      pending.push(moveId)
      this.fillFromPending(member)
      if (!pending.includes(moveId)) return
      const name = speciesOf(member.species)?.ko ?? member.species
      const move = dexData.value?.movesById[moveId]?.ko ?? moveId
      useBattleLogStore().push(
        `${josa(name, '은', '는')} ${josa(move, '을', '를')} 배우고 싶다… 하지만 기술칸이 가득 찼다! (기술 탭에서 처리)`,
        'info',
      )
    },

    /** 기술을 장착 (replaceId 를 주면 그 기술을 잊고 그 자리에). 잊은 기술은 learned 에 남음 */
    putMove(member: PartyMember, moveId: string, replaceId?: string) {
      const learned = (member.learned ??= [...member.moves])
      if (!learned.includes(moveId)) learned.push(moveId)
      const name = speciesOf(member.species)?.ko ?? member.species
      const move = dexData.value?.movesById[moveId]?.ko ?? moveId
      const log = useBattleLogStore()
      const i = replaceId ? member.moves.indexOf(replaceId) : -1
      if (i >= 0) {
        member.moves[i] = moveId
        const old = dexData.value?.movesById[replaceId!]?.ko ?? replaceId!
        log.push(`${josa(name, '은', '는')} ${josa(old, '을', '를')} 깨끗이 잊고 ${josa(move, '을', '를')} 배웠다!`, 'good')
      } else {
        member.moves.push(moveId)
        log.push(`${josa(name, '은', '는')} ${josa(move, '을', '를')} 배웠다!`, 'good')
      }
    },

    /** 대기열 맨 앞 기술을 배우지 않음 (잊은 기술이 되어 하트비늘로 되살릴 수 있음) */
    skipPending(memberIndex: number) {
      const m = this.party[memberIndex]
      const id = m?.pending?.[0]
      if (!m || !id) return
      m.pending!.shift()
      const learned = (m.learned ??= [...m.moves])
      if (!learned.includes(id)) learned.push(id)
      const name = speciesOf(m.species)?.ko ?? m.species
      const move = dexData.value?.movesById[id]?.ko ?? id
      useBattleLogStore().push(`${josa(name, '은', '는')} ${josa(move, '을', '를')} 배우지 않았다.`, 'info')
      this.fillFromPending(m)
    },

    /** 대기열 맨 앞 기술을 장착 기술 oldId 대신 배움 (oldId 는 잊은 기술이 됨) */
    learnPending(memberIndex: number, oldId: string) {
      const m = this.party[memberIndex]
      const id = m?.pending?.[0]
      if (!m || !id || !m.moves.includes(oldId)) return
      m.pending!.shift()
      this.putMove(m, id, oldId)
    },

    /** 하트비늘 1개로 잊은 기술을 되살림: 빈 칸이 있으면 장착, 없으면 oldId 대신 */
    recallMove(memberIndex: number, moveId: string, oldId?: string): boolean {
      const m = this.party[memberIndex]
      if (!m || (this.items[HEART_SCALE] ?? 0) <= 0 || this.faint) return false
      if (!(m.learned ?? []).includes(moveId) || m.moves.includes(moveId)) return false
      const full = m.moves.length >= this.slotsOf(m)
      if (full && (!oldId || !m.moves.includes(oldId))) return false
      this.takeFromBag(HEART_SCALE)
      this.putMove(m, moveId, full ? oldId : undefined)
      return true
    },

    onBossCleared(stageId: string) {
      const log = useBattleLogStore()
      const found = findStage(stageId)
      if (!found) return
      const first = !this.clearedStages.includes(stageId)
      if (first) this.clearedStages.push(stageId)
      log.push(`${found.stage.id} ${found.stage.name} 클리어!`, 'good')
      if (stageId === AUTO_UNLOCK_STAGE && !this.autoUnlocked) {
        this.autoUnlocked = true
        log.push('자동 전투가 해금되었습니다! 전투 화면 왼쪽 위 스위치로 켤 수 있습니다.', 'good')
      }
      // 전진 모드: 다음 스테이지로 진입 (반복 모드는 현재 스테이지에서 일반 BOSS_DEFEATS 마리 + 보스 반복)
      const i = found.region.stages.indexOf(found.stage)
      const next = found.region.stages[i + 1]
      if (this.stageMode === 'advance' && next && this.stageUnlocked(next.id)) {
        log.push(`${next.id} ${ro(next.name)} 이동합니다.`, 'info')
        this.arrive(next.id)
      }
    },

    onPlayerFainted() {
      const log = useBattleLogStore()
      const member = this.party[0]!
      const name = speciesOf(member.species)?.ko ?? member.species
      this.endGimmick()
      log.push(`${josa(name, '은', '는')} 쓰러졌다!`, 'bad')
      this.addFriendship(member, -1)
      member.status = null
      member.sleep = undefined
      member.toxic = undefined
      // 자동 사용(기절 회복): 기절 회복 아이템이 있으면 바로 사용
      if (this.auto && this.perks.includes('autoUse:revive') && this.autoUse.revive) {
        const revive = SHOP_ITEMS.filter((i) => i.revive != null && !i.party && (this.items[i.id] ?? 0) > 0).sort(
          (a, b) => a.price - b.price,
        )[0]
        const effect = revive && this.itemEffect(revive, 0)
        if (revive && effect) {
          this.takeFromBag(revive.id)
          log.push(`${josa(dexData.value?.items[revive.id]?.ko ?? revive.id, '을', '를')} 사용했다! ${effect()}`, 'info')
          this.playerStages = {}
          this.playerVol = {}
          return
        }
      }
      // 싸울 수 있는 파티 포켓몬이 있으면 교체
      const next = this.party.findIndex((m, i) => i > 0 && m.hp !== 0)
      if (next > 0) {
        if (this.enemy) this.setLead(next)
        else this.switchLead(next)
        return
      }
      log.push('눈앞이 캄캄해졌다…', 'bad')
      this.goRecover(FAINT_MS, false)
    },

    /** 회복 버튼: 현재 배틀을 포기하고 회복하러 감 (패배와 같은 처리, 시간만 RETREAT_MS) */
    retreat() {
      if (this.faint || this.travel || !this.party.length) return
      const log = useBattleLogStore()
      log.push(this.enemy ? '배틀을 포기하고 회복하러 돌아갔다.' : '회복하러 돌아갔다.', 'info')
      this.goRecover(RETREAT_MS, true)
    },

    /** 가장 가까운 마을로 회복하러 감. 돌아갈 곳은 공중날기 여부에 따라 결정 */
    goRecover(ms: number, retreat: boolean) {
      if (this.enemy?.boss) this.onBossFailed()
      const lost = findStage(this.currentStageId)
      let town = '포켓몬센터'
      let home = false
      let returnTo = this.currentStageId
      const fly = this.canFly
      if (lost?.region.map) {
        const r = nearestTown(lost.region.map, lost.stage.place)
        if (r) {
          town = r.town.name
          home = HOME_TOWNS.has(town)
          if (!fly) {
            // 마을에서 패배한 곳으로 가는 첫 길목 (이동 가능한 스테이지 중 육지 우선)
            const firstPlace = r.path[0]
            const candidates = lost.region.stages.filter((s) => s.place === firstPlace && this.stageUnlocked(s.id))
            const pick = candidates.find((s) => s.kind === 'land') ?? candidates[0]
            if (pick) returnTo = pick.id
          }
        }
      }
      this.endBattleGimmick()
      this.enemy = null
      this.travel = null
      useBattleLogStore().pending = null
      this.faint = { until: Date.now() + ms, total: ms, retreat, town, home, returnTo, fly }
    },

    /** 회복 완료: 파티 전원 회복 후 돌아감 */
    recover() {
      const f = this.faint
      if (!f) return
      for (const m of this.party) {
        m.hp = null
        m.pp = {}
        cureStatus(m)
      }
      this.playerStages = {}
      this.faint = null
      this.arrive(f.returnTo)
      useBattleLogStore().divider()
      const stage = findStage(f.returnTo)?.stage
      useBattleLogStore().push(`포켓몬이 모두 회복되었다! ${stage ? `${stage.id} ${ro(stage.name)} 돌아왔다.` : ''}`, 'info')
    },

    /** 보스전 패배(포기 포함): 처치 수를 0으로 되돌려 일반 포켓몬 BOSS_DEFEATS 마리를 다시 쓰러뜨려야 보스 재등장 */
    onBossFailed() {
      const p = this.stageProgress[this.currentStageId]
      if (p) p.defeats = 0
    },
    setStageMode(mode: StageMode) {
      this.stageMode = mode
    },
    setAuto(on: boolean) {
      if (!this.autoUnlocked) return
      this.auto = on
    },

    // ---------- 설정 ----------
    /** 포켓몬별 도트 선택. key 가 없으면 기본 설정을 따름 */
    setSprite(speciesId: string, key: string | null) {
      if (key) this.spriteChoice[speciesId] = key
      else delete this.spriteChoice[speciesId]
    },
    setAutoUse(cat: AutoCategory, on: boolean) {
      if (!this.perks.includes(`autoUse:${cat}`)) return
      this.autoUse[cat] = on
    },
    setAutoBuy(cat: AutoCategory, on: boolean) {
      if (!this.perks.includes(`autoBuy:${cat}`)) return
      this.autoBuy[cat] = on
    },
    setAutoBuyItem(cat: AutoCategory, itemId: string) {
      if (shopItem(itemId)?.category === cat) this.autoBuyItem[cat] = itemId
    },
  },
})

/** 전투 계산에 필요한 데이터가 모두 불러와졌는지 */
export const battleReady = () => !!(dexData.value && learnsets.value && battleData.value)
