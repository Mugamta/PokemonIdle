import { moveSfx, sfx } from '../core/audio'
import { defineStore } from 'pinia'
import {
  chooseMove,
  cureStatus,
  DIFFICULTY_AI,
  DIFFICULTY_AI_OPTS,
  DIFFICULTY_IDS,
  DIFFICULTIES,
  onBattleEnd,
  endOfTurnBenefits,
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
  stackMult,
  statsOf,
  takeHeld,
  wildMoveset,
  type Battler,
  type KoPick,
  type TurnResult,
  type Difficulty,
  DIFFICULTY_EXP,
  type Stages,
  type AbilityIntel,
  type AiMode,
  type Volatile,
  type MoveData,
  onAbilityChange,
  setWeather,
} from '../core/battle'
import {
  DYNAMAX_TURNS,
  formOf,
  GIMMICK_INFO,
  GIMMICKS,
  holdsZCrystal,
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
import { dexData, learnMethods, learnsets, STAT_LABELS } from '../data/dex'
import { SHARD_ITEM, tutorSource, type ShardColor, type TutorCost, type TutorSource } from '../data/tutors'
import {
  evolutions,
  evolutionsOf,
  FRIENDSHIP_EVOLVE,
  FRIENDSHIP_MAX,
  LINKING_CORD,
  type Evolution,
} from '../data/evolutions'
import { calcStats } from '../data/natures'
import { encountersAt, encountersWith, ROD_IDS, type EncounterSet, type RodId, type WaterMethod } from '../data/encounters'
import { HOME_TOWNS, nearestTown } from '../data/mapGraph'
import { NATURES } from '../data/natures'
import type { SpriteDefault } from '../data/sprites'
import {
  AUTO_CENTER_PERK,
  AUTO_DEX_PERK,
  DEX_ADVANCE_PERK,
  AUTO_CENTER_COST_STEPS,
  DEFAULT_AUTO_CENTER_COST,
  OLD_AUTO_CENTER_PP_PRICE,
  PARTY_USE_KEYS,
  PARTY_USE_PERKS,
  type PartyUseKey,
  BOSS_INTRO_PERK,
  DEX_REVEAL_PERK,
  END_HEAL_PERK,
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
  AUTO_HEAL_STEPS,
  DEFAULT_AUTO_HEAL,
  type AutoHealKey,
  type AutoHealRange,
  type AutoUseKey,
  type HealOption,
  healAmountOf,
  pickHealInBattle,
  planHealAfterBattle,
  pickCheapestItem,
  pickAutoBall,
  type BallOption,
  AUTO_BALL_STEPS,
  DEFAULT_AUTO_BALL,
  NO_AUTO_BALLS,
  AUTO_USE_KEYS,
  AUTO_BUY_PRICE,
  type AutoReviveKey,
  type AutoReviveCfg,
  DEFAULT_AUTO_REVIVE,
  AUTO_ASH_STEPS,
  SACRED_ASH,
  isAutoReviveItem,
  EVERSTONE_ITEM,
  extraSlotPrice,
  heldKindPrice,
  heldStackPrice,
  OLD_SLOT_HELD_PRICE,
  gimmickItemOf,
  PERKS,
  priceOf,
  prizeMoney,
  SHOP_ITEMS,
  sellPrice,
  shopItem,
  type ItemCategory,
  type PerkId,
  type ShopItem,
} from '../data/shop'
import {
  catchChance,
  ballMultOf,
  EXP_SHARE_ITEM,
  EXP_SHARE_RATE,
  FRIEND_BALL_FRIENDSHIP,
  isMachine,
  isRecord,
  LUCKY_EGG,
  LUCKY_EGG_MULT,
  LUXURY_BALL,
  MACHO_BRACE,
  rodItem,
  ROD_ITEMS,
  MONEY_ITEMS,
  rollCatch,
  SOOTHE_BELL,
  type CatchContext,
} from '../data/items'
import { BATTLE_HELD, POWER_ITEM_EV, POWER_ITEMS } from '../core/items'
import { DIFFICULTY_EV, DIFFICULTY_LEVEL, difficultyMon } from '../core/difficulty'
import { frontierSets } from '../data/frontier'
import { findStage, stageWeather, migrateLegacyRegionIds, migrateLegacyStageId, REGIONS, type Region, type Stage } from '../data/stages'
import { leagueOf, leagueStage, regionPlayable, requiredLeagueRegion, trainerLabel, type LeagueMon, type LeagueTrainer } from '../data/league'
import { useBattleLogStore } from './battleLog'
import GENDER_RATES from '../data/genderRates.json'

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
export const SLOT_DEFEATS = [5, 10, 15]
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
/** 전진 / 반복 / 도감 (도감 완성 전엔 반복, 완성 후엔 전진. 상점 기능 'stageMode:dex' 필요) */
export type StageMode = 'advance' | 'repeat' | 'dex'

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

/** 성별: 수컷 / 암컷 (무성은 null) */
export type Gender = 'M' | 'F'
export const GENDER_SYMBOL: Record<Gender, string> = { M: '♂', F: '♀' }
/** 암컷 비율 0~8 (8분의 n), -1 = 무성. 폼 id(예: raichu-alola)는 기본 포켓몬 id로 찾음 */
export function genderRate(species: string): number | undefined {
  const rates = GENDER_RATES as Record<string, number>
  let id = species
  for (;;) {
    if (id in rates) return rates[id]
    const cut = id.lastIndexOf('-')
    if (cut < 0) return undefined
    id = id.slice(0, cut)
  }
}
/** 성비대로 성별 뽑기 (무성·정보 없음 = null) */
export function rollGender(species: string): Gender | null {
  const r = genderRate(species)
  if (r == null || r < 0) return null
  return Math.random() * 8 < r ? 'F' : 'M'
}

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
  /** 지닌 도구: identifier → 개수 (종류 수·같은 도구 개수는 이 포켓몬이 있는 파티 슬롯의 한도까지) */
  held?: Record<string, number>
  /** 지닌 도구 중 이번 전투에서 써서 사라진 개수 (다음 전투 시작 때 가방에 있으면 다시 지님) */
  heldSpent?: Record<string, number>
  /** 이전 저장 데이터 호환: 포켓몬별 도구 한도 강화 시절 (불러올 때 파티 슬롯 강화로 옮김) */
  heldKinds?: number
  heldStack?: number
  /** 잡은 볼 (스타팅·진화 포켓몬은 없음) */
  ball?: string
  /** 테라스탈 타입. 없으면 포켓몬의 첫 번째 타입 */
  teraType?: string
  /** 성별 (null = 무성. 없으면 불러올 때 성비대로 정함) */
  gender?: Gender | null
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
  /** 이전 저장 데이터 호환: 포켓몬별 도구 한도 강화 시절 (불러올 때 파티 슬롯 강화로 옮김) */
  heldKinds?: number
  heldStack?: number
  /** 얻은 성별 (알 기술: 등록된 성별은 성비 계산 없이 100%) */
  genders?: Gender[]
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
  /** 성별 (기록된 성별 중) */
  gender?: Gender | null
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/** 이전 저장 데이터 호환: 지닌 도구 하나(heldItem·heldSpent: boolean) → 여러 개(held·heldSpent: 개수) */
function migrateHeld(m: PartyMember) {
  const old = m as unknown as { heldItem?: string | null; heldSpent?: unknown }
  if ('heldItem' in old) {
    const id = old.heldItem
    const spent = old.heldSpent === true
    delete old.heldItem
    m.held = id ? { [id]: 1 } : {}
    m.heldSpent = id && spent ? { [id]: 1 } : undefined
  }
  if (typeof m.heldSpent !== 'object' || m.heldSpent === null) m.heldSpent = undefined
}
/** 지닐 수 있는 도구 종류 수 최대 (기본 1종류, 상점에서 늘림) */
export const HELD_KINDS_MAX = 6
/** 같은 도구를 지닐 수 있는 개수 최대 (기본 1개, 상점에서 늘림) */
export const HELD_STACK_MAX = 3
/** 슬롯 강화 횟수 → 지닐 수 있는 도구 종류 수 */
export const heldKindsOf = (up = 0) => Math.min(HELD_KINDS_MAX, 1 + up)
/** 슬롯 강화 횟수 → 같은 도구를 지닐 수 있는 개수 */
export const heldStackOf = (up = 0) => Math.min(HELD_STACK_MAX, 1 + up)
/** 지금 효과가 있는 지닌 도구: identifier → 개수 (써서 사라진 것 제외, 새 객체) */
export function heldOf(m: Pick<PartyMember, 'held' | 'heldSpent'>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, n] of Object.entries(m.held ?? {})) {
    const left = n - (m.heldSpent?.[id] ?? 0)
    if (left > 0) out[id] = left
  }
  return out
}
/** 지금 효과가 있는 그 도구의 개수 */
export const heldN = (m: Pick<PartyMember, 'held' | 'heldSpent'>, id: string): number =>
  Math.max(0, (m.held?.[id] ?? 0) - (m.heldSpent?.[id] ?? 0))
/** 지닌 도구 identifier 목록 (써서 사라진 것 포함, 지닌 순서) */
export const heldIds = (m: Pick<PartyMember, 'held'>): string[] => Object.keys(m.held ?? {}).filter((id) => (m.held![id] ?? 0) > 0)
/** 파티 슬롯에 묶인 도구 (비어 있는 슬롯에 남은 것) */
export interface SlotHeld {
  held: Record<string, number>
  heldSpent?: Record<string, number>
}
/** 파티를 바꾸는 중 (안쪽 호출은 바깥 호출이 한 번에 처리) */
let slotHeldDepth = 0

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

/** 알 기술 시도 1회 비용 (흉내허브 원작 가격) */
export const EGG_MOVE_PRICE = 30000
const NO_EGGS_GROUP = 15
/** 암컷 비율 (0~1). 무성이면 null */
const femaleRatio = (rate: number | undefined) => (rate == null || rate < 0 ? null : rate / 8)
export interface EggParent {
  species: string
  owned: boolean
  /** 이 부모로 시도할 때 성공 확률 (0~1) */
  chance: number
}
export interface EggMoveOption {
  move: string
  parents: EggParent[]
  /** 소지한 부모 중 가장 높은 성공 확률 (소지한 부모가 없으면 0) */
  chance: number
  best: EggParent | null
}
/**
 * 알 기술: 같은 알 그룹이고 그 기술을 레벨업으로 배우는 포켓몬이 유전 부모.
 * 알은 어미(이 포켓몬 계열의 암컷)에게서 나오고 기술은 아비(부모 후보 수컷)에게서 물려받으므로
 * 성공 확률 = 이 포켓몬의 암컷 비율 × 부모 후보의 수컷 비율
 * (도감에 이 포켓몬의 암컷 / 부모 후보의 수컷이 등록돼 있으면 그쪽은 100%)
 */
export function eggMoveOptions(
  species: string,
  owned: (id: string) => boolean,
  hasGender: (id: string, g: Gender) => boolean = () => false,
): EggMoveOption[] {
  const lm = learnMethods.value
  const dex = dexData.value
  if (!lm || !dex) return []
  const groups = (lm.eggGroups[species] ?? []).filter((g) => g !== NO_EGGS_GROUP)
  // 도감에 암컷/수컷이 등록돼 있으면 성비 계산 없이 100% (무성은 유전 불가)
  const fr = femaleRatio(lm.gender[species])
  const female = fr == null || fr === 0 ? 0 : hasGender(species, 'F') ? 1 : fr
  return (lm.egg[species] ?? []).flatMap((num) => {
    const move = dex.moves[num]?.id
    if (!move) return []
    const parents = (lm.levelBy[num] ?? [])
      .filter((p) => (lm.eggGroups[p] ?? []).some((g) => g !== NO_EGGS_GROUP && groups.includes(g)))
      .map((p) => {
        const f = femaleRatio(lm.gender[p])
        const male = f == null || f === 1 ? 0 : hasGender(p, 'M') ? 1 : 1 - f
        return { species: p, owned: owned(p), chance: female * male }
      })
      .sort((a, b) => Number(b.owned) - Number(a.owned) || b.chance - a.chance)
    const best = parents.filter((p) => p.owned).sort((a, b) => b.chance - a.chance)[0] ?? null
    return [{ move, parents, chance: best?.chance ?? 0, best }]
  })
}
/** 기술가르침: 기술별로 가르쳐 주는 작품·장소 (표에 있는 작품만, 같은 장소·비용은 하나로) */
export function tutorOptions(species: string): { move: string; sources: TutorSource[] }[] {
  const lm = learnMethods.value
  const dex = dexData.value
  if (!lm || !dex) return []
  return (lm.tutor[species] ?? []).flatMap(([num, vgs]) => {
    const move = dex.moves[num]?.id
    if (!move) return []
    const seen = new Set<string>()
    const sources = vgs.flatMap((vg) => {
      const src = tutorSource(vg, move)
      const key = src && JSON.stringify(src)
      if (!src || seen.has(key!)) return []
      seen.add(key!)
      return [src]
    })
    return sources.length ? [{ move, sources }] : []
  })
}
/** 한 턴 효과음에서 공격 사이 간격 (초) */
const HIT_SFX_GAP = 0.4
/** 기술 효과음이 나온 뒤 타격음까지 (초) */
const HIT_SFX_IMPACT = 0.14
/** 이번 턴 공격 효과음이 끝나는 시점 (쓰러짐·레벨업 효과음을 그 뒤에 재생) */
let turnSfxDelay = 0

let moveNumCache: { src: unknown; map: Map<string, number> } | null = null
export function moveNumOf(id: string): number | undefined {
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
  gender?: Gender | null
  ivs: number[]
  /** 현재 HP. null = 최대 HP */
  hp: number | null
  /** 기술 (원작 야생 규칙: 해당 레벨까지 배운 마지막 4개) */
  moves?: string[]
  /** 기술별 남은 PP (없는 기술 = 최대). PP 소모가 시작된 뒤부터 줄어듦 */
  pp?: Record<string, number>
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
  /** 트레이너의 포켓몬 (리그). boss 도 함께 켜짐 (포획·도망 불가, 트레이너 경험치) */
  trainer?: EnemyTrainer
  /** 노력치 (난이도 보정, 없으면 0) */
  evs?: number[]
  /** 난이도 보정으로 지닌 도구: 쓰러뜨리거나 잡아도 얻을 수 없음 */
  noDrop?: boolean
}

/** 난이도별로 따로 기록하는 진행도 (지금 난이도의 진행도는 스토어의 같은 이름 값에 있음) */
export interface DifficultyProgress {
  currentStageId: string
  stageProgress: Record<string, StageProgress>
  clearedStages: string[]
  unlockedRegions: number[]
  leagueCleared: string[]
}
const freshProgress = (): DifficultyProgress => ({
  currentStageId: '1-1',
  stageProgress: {},
  clearedStages: [],
  unlockedRegions: [1],
  leagueCleared: [],
})

/** 도감 보너스: 세대 도감 하나를 모두 잡을 때마다 모든 실능치 +10% (합연산) */
export const DEX_GEN_BOOST = 0.1

/** 상대 포켓몬의 트레이너 정보 */
export interface EnemyTrainer {
  /** 이름 (예: '칸나') */
  name: string
  /** 칭호 (예: '사천왕') */
  title: string
  champion: boolean
  /** 이 트레이너의 몇 번째 포켓몬인지 (0부터) / 전체 마릿수 */
  index: number
  count: number
}

/** 진행 중인 포켓몬 리그 도전 (센터에 가면 초기화) */
export interface LeagueRun {
  /** 리그가 있는 지방 key */
  region: string
  /** 지금 상대 중인 트레이너 (0~4) */
  trainer: number
  /** 그 트레이너의 몇 번째 포켓몬과 싸울 차례인지 */
  mon: number
  /** 챔피언 엔트리 번호 (스타팅에 따라 바뀌는 챔피언) */
  variant: number
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

const ROD_KO: Record<RodId, string> = { 'old-rod': '낡은낚싯대', 'good-rod': '좋은낚싯대', 'super-rod': '대단한낚싯대' }

/** 스테이지 도감 대상: 일반 출현 포켓몬 전체 (수상 스테이지는 모든 조우 방법 포함) */
export function stageDexSpecies(set: EncounterSet | undefined): string[] {
  if (!set) return []
  const extra = Object.values(set.methods ?? {}).flatMap((t) => stageSpecies(t as EncounterSet))
  return [...new Set([...stageSpecies(set), ...extra])]
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

/** 출현표(가진 조우 수단을 반영한 것)에서 현재 시간대·출현율 가중치로 한 마리 뽑기 */
function rollWild(set: EncounterSet | null, hidden: boolean): WildPokemon | null {
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
    gender: rollGender(e.p),
    ivs: Array.from({ length: 6 }, () => randInt(0, 31)),
    hp: null,
    moves: wildMoveset(e.p, level, set.vg),
    ability: rollAbility(e.p, hidden),
    item: rollWildItem(e.p, false),
  }
}

/** 보스: 스테이지 출현 포켓몬 중 종족값 합계가 가장 높은 포켓몬, 최고 레벨 +2, 개체값 20~31 */
function makeBoss(set: EncounterSet | null): WildPokemon | null {
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
    gender: rollGender(top.p),
    ivs: Array.from({ length: 6 }, () => randInt(20, 31)),
    hp: null,
    moves: wildMoveset(top.p, level, set.vg),
    ability: rollAbility(top.p, true),
    item: rollWildItem(top.p, true),
    boss: true,
  }
}

/** 리그 트레이너의 포켓몬: 원작 엔트리 (기술이 전투 데이터에 없으면 그 레벨의 야생 기술), 성격 무보정 */
function makeLeagueMon(t: LeagueTrainer, m: LeagueMon, index: number, count: number): WildPokemon {
  const known = (m.moves ?? []).filter((id) => !!dexData.value?.movesById[id])
  const normal = normalAbilities(m.species)
  const ability = m.abilitySlot != null ? (normal[m.abilitySlot - 1] ?? normal[0] ?? null) : rollAbility(m.species, false)
  return {
    species: m.species,
    level: m.level,
    nature: 'hardy',
    gender: rollGender(m.species),
    ivs: Array.from({ length: 6 }, () => m.iv),
    hp: null,
    moves: known.length ? known : wildMoveset(m.species, m.level),
    ability,
    item: m.item ?? null,
    boss: true,
    trainer: { name: t.name, title: t.title, champion: t.champion, index, count },
  }
}

/**
 * 챔피언 엔트리 고르기 (라이벌 챔피언은 플레이어 스타팅에 따라 바뀜):
 * 에이스(마지막 포켓몬) 타입이 내 선두 포켓몬에게 가장 잘 통하는 엔트리
 */
export function pickVariant(t: LeagueTrainer, lead: string | undefined): number {
  if (t.variants.length < 2 || !lead) return 0
  const mine = speciesOf(lead)?.types ?? []
  const score = (team: LeagueMon[]) => {
    const ace = team[team.length - 1]
    const types = (ace && speciesOf(ace.species)?.types) ?? []
    return Math.max(0, ...types.map((a) => mine.reduce((m, d) => m * (battleData.value?.types[a]?.[d] ?? 1), 1)))
  }
  let best = 0
  t.variants.forEach((v, i) => {
    if (score(v) > score(t.variants[best]!)) best = i
  })
  return best
}

/**
 * 난이도 보정 (보통·어려움): 레벨·노력치를 올리고 배틀시설 엔트리 기반 기술·성격,
 * 어려움이면 기술에 어울리는 도구 (얻을 수 없음)
 */
export function applyDifficulty(e: WildPokemon, diff: Difficulty): WildPokemon {
  if (diff === 'easy') return e
  e.level += DIFFICULTY_LEVEL[diff]
  e.evs = Array.from({ length: 6 }, () => DIFFICULTY_EV[diff])
  const set = difficultyMon(e.species, diff)
  if (set) {
    e.moves = set.moves
    e.nature = set.nature
    if (set.item) {
      e.item = set.item
      e.noDrop = true
    }
  }
  return e
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
    /** 가진 낚싯대 (낡은·좋은·대단한낚싯대) */
    rods: [] as RodId[],
    /** 수상 스테이지에서 쓰는 낚싯대 ('' = 없음) */
    rod: '' as RodId | '',
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
    /** 포켓몬 리그를 제패한 지방 key (다음 지방으로 가는 조건) */
    leagueCleared: [] as string[],
    /** 진행 중인 포켓몬 리그 도전 */
    league: null as LeagueRun | null,
    /** 포획한 적 있는 포켓몬 id */
    caught: [] as string[],
    /** 조우한 적 있는 포켓몬 id (보스 포함. 포획·진화로 얻은 포켓몬은 caught 로 판단) */
    seen: [] as string[],
    /** 돈 */
    money: 0,
    /** 배틀포인트 (기술가르침 비용. 아직 얻는 곳 없음) */
    bp: 0,
    /** 게임코너 코인 (기술가르침 비용. 아직 얻는 곳 없음) */
    coins: 0,
    /** 보유 아이템 {identifier: 개수} */
    items: {} as Record<string, number>,
    /** 구매한 편의성 기능 */
    perks: [] as PerkId[],
    /** 파티 슬롯별로 상점에서 늘린 지닐 수 있는 도구 종류 수 (0~HELD_KINDS_MAX-1) */
    slotHeldKinds: [0, 0, 0, 0, 0, 0] as number[],
    /** 파티 슬롯별로 상점에서 늘린 같은 도구를 지닐 수 있는 개수 (0~HELD_STACK_MAX-1) */
    slotHeldStack: [0, 0, 0, 0, 0, 0] as number[],
    /** 지닌 도구는 파티 슬롯에 묶임: 포켓몬이 없는 슬롯에 남은 도구 (슬롯 번호별) */
    slotHeldSpare: [] as (SlotHeld | null)[],
    /** 노력치 한계 돌파 2 구매 횟수 */
    evBreaks: 0,
    /** 분류별 아이템 자동 사용 (편의성 기능 구매 필요) */
    autoUse: {} as Partial<Record<AutoUseKey, boolean>>,
    /** 몬스터볼 자동 사용 최소 보정 배율 */
    autoBall: DEFAULT_AUTO_BALL,
    /** 체력 자동 회복 시작 기준·목표 (전투 중 / 전투 후, 최대 HP 대비 %) */
    autoHeal: structuredClone(DEFAULT_AUTO_HEAL) as Record<AutoHealKey, AutoHealRange>,
    /** 기절 회복 자동 사용 설정 (전투 중 / 전투 후): 살 아이템, 성스러운분 기준 */
    autoRevive: structuredClone(DEFAULT_AUTO_REVIVE) as Record<AutoReviveKey, AutoReviveCfg>,
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
    /** 자동 센터 귀환 켜짐 (상점 기능 'autoCenter:cost' 구매 필요) */
    autoCenter: false,
    /** 자동 센터 귀환 기준 금액: 전투 후 파티 회복에 드는 돈이 이 이상이면 센터로 */
    autoCenterCost: DEFAULT_AUTO_CENTER_COST,
    /** 도감 자동 보내기 켜짐 (상점 기능 'autoDex:send' 구매 필요) */
    autoDex: false,
    /** 전투 후 파티 전체 회복 켜짐 (상점 기능 'partyUse:*' 구매 필요) */
    partyUse: {} as Partial<Record<PartyUseKey, boolean>>,
    /** 변함없는돌 구매 여부 (공용 기능) */
    everstoneOwned: false,
    /** 변함없는돌 켜짐: 레벨업 진화를 막음 */
    everstone: false,
    /** 지금 진행 중인 난이도 (스테이지 탭 상단에서 바꿈) */
    difficulty: 'easy' as Difficulty,
    /** 지금 난이도가 아닌 난이도들의 진행도 */
    diffProgress: {} as Partial<Record<Difficulty, DifficultyProgress>>,
    /** 난이도별 진행 분리 적용됨 (false = 분리 전 저장 데이터) */
    diffSplit: false,
    /** 설정: 기본 도트 */
    spriteDefault: 'fan' as SpriteDefault,
    /** 설정: 포켓몬별로 고른 도트 {포켓몬 id: 도트 키} */
    spriteChoice: {} as Record<string, string>,
  }),
  getters: {
    /** 전투 중 싸우는 포켓몬이 묶여 교체·도망 불가 (그림자꿰매기 등) */
    leadTrapped: (s): boolean => !!s.enemy && !!s.playerVol.trapped && (s.party[0]?.hp ?? 0) > 0,
    canFly: (s) => s.party.some((m) => m.moves.includes('fly')),
    /** 파도타기를 아는 파티 포켓몬이 있음 */
    canSurf: (s) => s.party.some((m) => m.moves.includes('surf')),
    /** 수상 스테이지에서 쓸 수 있는 조우 방법: 파도타기(파도타기를 아는 파티 포켓몬) + 고른 낚싯대 */
    waterMethods(): WaterMethod[] {
      const out: WaterMethod[] = []
      if (this.canSurf) out.push('surf')
      if (this.rod) out.push(this.rod)
      return out
    },
    /** 이 스테이지에서 실제로 쓰는 출현표 (수상: 가진 수단만 섞음). 출현 정보가 없거나 쓸 수단이 없으면 null */
    stageEncounters(): (stage: Stage) => EncounterSet | null {
      return (stage) => (stage.encounters ? encountersWith(stage.encounters, this.waterMethods) : null)
    },
    /** PP 소모 여부 (PP_START_STAGE 클리어 후) */
    ppActive(): boolean {
      return this.allProgress.some((p) => p.clearedStages.includes(PP_START_STAGE))
    },
    /** 모든 난이도의 진행도 (지금 난이도가 맨 앞) */
    allProgress: (s): DifficultyProgress[] => [
      {
        currentStageId: s.currentStageId,
        stageProgress: s.stageProgress,
        clearedStages: s.clearedStages,
        unlockedRegions: s.unlockedRegions,
        leagueCleared: s.leagueCleared,
      },
      ...DIFFICULTY_IDS.filter((d) => d !== s.difficulty).flatMap((d) => (s.diffProgress[d] ? [s.diffProgress[d]] : [])),
    ],
    /** 어느 난이도에서든 들어가 본 지방 id (특수 기능·세대 기술 해금은 난이도와 상관없이 공용) */
    everUnlockedRegions(): number[] {
      return [...new Set(this.allProgress.flatMap((p) => p.unlockedRegions))]
    },
    /** 모두 잡은 세대 목록 (도감 보너스) */
    completedGens: (s): number[] => {
      const index = dexData.value?.index
      if (!index) return []
      const caught = new Set(s.caught)
      const gens = [...new Set(index.map((p) => p.gen))].sort((a, b) => a - b)
      return gens.filter((g) => index.every((p) => p.gen !== g || caught.has(p.id)))
    },
    /** 도감 보너스 실능치 배율 (0.1 = +10%) */
    dexBoost(): number {
      return Math.round(this.completedGens.length * DEX_GEN_BOOST * 100) / 100
    },
    hasPerk: (s) => (id: PerkId) => s.perks.includes(id),
    /** 지금 있는 스테이지의 필드 날씨 (원작에서 날씨가 있는 장소, 없으면 null) */
    fieldWeather: (s) => stageWeather(s.currentStageId),
    /** 먼저 사야 하는 기능을 모두 샀는지 */
    perkRequirementsMet: (s) => (id: PerkId): boolean => {
      const chainReq = CHAIN_PERKS.find((p) => p.id === id)?.requires
      const partyReq = PARTY_USE_PERKS.find((p) => p.id === id)?.requires
      const req: PerkId[] =
        id === AUTO_CENTER_PERK.id
          ? AUTO_CENTER_PERK.requires
          : id === DEX_ADVANCE_PERK.id
            ? [DEX_ADVANCE_PERK.requires]
            : ([chainReq, partyReq].filter(Boolean) as PerkId[])
      return req.every((r) => s.perks.includes(r))
    },
    /** 도감 모드를 쓸 수 있는지: 도감 완성 후 전진 + 몬스터볼 자동 사용을 사서 켜 둠 */
    dexModeReady: (s) =>
      s.perks.includes(DEX_ADVANCE_PERK.id) && s.perks.includes(DEX_ADVANCE_PERK.requires) && !!s.autoUse.ball,
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
    /**
     * 도감 완성: 도감 기록 + 파티 포켓몬으로 성별(성비상 가능한 것 전부)·성격 전부·특성 전부(숨겨진 특성 포함)·
     * 모든 능력치의 개체값 0~31·친밀도 0~최대를 모두 가지고 있음
     */
    dexComplete: (s) => (id: string): boolean => {
      const sp = speciesOf(id)
      if (!sp) return false
      const r = s.dexRecords[id]
      const members = s.party.filter((m) => m.species === id)
      if (!r && !members.length) return false
      const normalCount = new Set(sp.abilities.filter((a) => !a[1]).map((a) => a[0])).size
      const genders = new Set<Gender>(r?.genders ?? [])
      const natures = new Set(r?.natures ?? [])
      const abilities = new Set(r?.abilities ?? [])
      const ivMin = Array.from({ length: 6 }, (_, i) => r?.ivMin[i] ?? Infinity)
      const ivMax = Array.from({ length: 6 }, (_, i) => r?.ivMax[i] ?? -Infinity)
      let fMin = r?.friendshipMin ?? Infinity
      let fMax = r?.friendshipMax ?? -Infinity
      for (const m of members) {
        if (m.gender) genders.add(m.gender)
        natures.add(m.nature)
        abilities.add(m.hiddenAbility ? HIDDEN_ABILITY_SLOT : normalCount ? (m.abilitySlot ?? 0) % normalCount : (m.abilitySlot ?? 0))
        for (let i = 0; i < 6; i++) {
          const iv = m.ivs?.[i] ?? 0
          ivMin[i] = Math.min(ivMin[i]!, iv)
          ivMax[i] = Math.max(ivMax[i]!, iv)
        }
        const f = friendshipOf(m)
        fMin = Math.min(fMin, f)
        fMax = Math.max(fMax, f)
      }
      const rate = genderRate(id)
      const needGenders: Gender[] = rate == null || rate < 0 ? [] : rate === 0 ? ['M'] : rate === 8 ? ['F'] : ['M', 'F']
      if (!needGenders.every((g) => genders.has(g))) return false
      if (!Object.keys(NATURES).every((n) => natures.has(n))) return false
      for (let i = 0; i < normalCount; i++) if (!abilities.has(i)) return false
      if (sp.abilities.some((a) => a[1]) && !abilities.has(HIDDEN_ABILITY_SLOT)) return false
      if (!ivMin.every((v) => v <= 0) || !ivMax.every((v) => v >= 31)) return false
      return fMin <= 0 && fMax >= FRIENDSHIP_MAX
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
    /** 상대 기술 표시 단계: 0 = 안 보임, 1 = 기술, 2 = 기술과 남은 PP */
    foeMoveView: (s): 0 | 1 | 2 => (s.perks.includes('foeMoves:pp') ? 2 : s.perks.includes('foeMoves:list') ? 1 : 0),
    /** 상대 도구 표시 (지속형/소모성만, 파티에 통찰이 있으면 정확한 도구) */
    foeItemView: (s): boolean => s.perks.includes('foeItem:show'),
    /** 이 파티 슬롯에서 지닐 수 있는 도구 종류 수·같은 도구 개수 */
    heldLimitsAt: (s) => (slot: number): { kinds: number; stack: number } => ({
      kinds: heldKindsOf(s.slotHeldKinds[slot]),
      stack: heldStackOf(s.slotHeldStack[slot]),
    }),
    /** 파티에 이 특성을 가진 포켓몬이 있는지 (위험예지: 상대 기술 전부, 통찰: 상대 도구) */
    partyHasAbility: (s) => (id: string): boolean => s.party.some((m) => memberAbility(m) === id),
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
    /** 자동 전투 AI 개선 3·4: 확정 1타 기술 고르는 기준 */
    autoKoPick: (s): KoPick | undefined => (s.perks.includes('ai:pp') ? 'pp' : s.perks.includes('ai:ko') ? 'effect' : undefined),
    /** 특수 기능 해금 여부 (해금하는 지방에 들어간 적 있음) */
    gimmickUnlocked(): (g: Gimmick) => boolean {
      const ids = this.everUnlockedRegions
      return (g) => REGIONS.some((r) => r.unlocks === g && ids.includes(r.id))
    },
    /** 해금한 특수 기능이 하나라도 있음 */
    anyGimmickUnlocked(): boolean {
      return GIMMICKS.some((g) => this.gimmickUnlocked(g))
    },
    /** 해금된 지방이 무대인 세대 목록 */
    unlockedGens(): number[] {
      const ids = this.everUnlockedRegions
      return REGIONS.filter((r) => ids.includes(r.id)).flatMap((r) => r.gens)
    },
    /** 이동 가능한 지방인지 (히든 지방은 조건 포켓몬 포획 필요) */
    canEnter: (s) => (region: Region) => !region.hidden || s.caught.includes(region.hidden.requiresCaught),
    /**
     * 앞 지방의 포켓몬 리그를 아직 제패하지 않아 들어갈 수 없는 지방.
     * 이미 들어가 본 지방(리그 조건이 생기기 전 저장 데이터 포함)은 열어 둠
     */
    regionLocked: (s) => (region: Region): boolean => {
      if (s.unlockedRegions.includes(region.id)) return false
      const need = requiredLeagueRegion(region)
      return !!need && !s.leagueCleared.includes(need.key)
    },
    /** 리그에 도전할 수 있음: 지방의 모든 스테이지를 클리어 (갈 수 없는 수상 스테이지 제외) */
    leagueReady(): (region: Region) => boolean {
      return (region) =>
        !!leagueOf(region) && region.stages.every((st) => this.clearedStages.includes(st.id) || this.waterLocked(st.id))
    },
    /** 지방의 모든 스테이지에서 지금 만날 수 있는 포켓몬을 다 잡았는지 */
    regionDexReachableDone(): (region: Region) => boolean {
      return (region) => region.stages.every((st) => this.stageDexReachableDone(st) !== false)
    },
    /** 진행 중인 리그에서 지금 상대하는 트레이너 */
    leagueTrainer: (s): LeagueTrainer | null => {
      const run = s.league
      return (run && leagueOf({ key: run.region })?.[run.trainer]) ?? null
    },
    /** 스테이지 출현 포켓몬을 모두 잡았는지 (출현 정보가 없으면 null) */
    stageDexDone: (s) => (stage: Stage): boolean | null => {
      const list = stageDexSpecies(stage.encounters)
      return list.length ? list.every((p) => s.caught.includes(p)) : null
    },
    /** 이 조우 방법들로 만나는 포켓몬 중 아직 안 잡은 포켓몬 */
    uncaughtWith(): (stage: Stage, methods: readonly WaterMethod[]) => string[] {
      return (stage, methods) => {
        const set = stage.encounters && encountersWith(stage.encounters, methods)
        return set ? stageDexSpecies(set).filter((p) => !this.caught.includes(p)) : []
      }
    },
    /**
     * 도감 모드 판정: 가진 수단(파도타기 + 가진 낚싯대 전부)으로 만나는 포켓몬을 모두 잡았는지.
     * 수단이 없어 못 만나는 포켓몬은 빼고 판단 (출현 정보가 없으면 null)
     */
    stageDexReachableDone(): (stage: Stage) => boolean | null {
      return (stage) => {
        if (!stage.encounters) return null
        const methods: WaterMethod[] = [...(this.canSurf ? ['surf' as const] : []), ...this.rods]
        return !this.uncaughtWith(stage, methods).length
      }
    },
    /** 지방의 모든 스테이지를 클리어했는지 */
    regionCleared: (s) => (region: Region) => region.stages.every((st) => s.clearedStages.includes(st.id)),
    /** 지방의 모든 스테이지 출현 포켓몬을 잡았는지 (출현 정보가 없으면 null) */
    regionDexDone: (s) => (region: Region): boolean | null => {
      const list = [...new Set(region.stages.flatMap((st) => stageDexSpecies(st.encounters)))]
      return list.length ? list.every((p) => s.caught.includes(p)) : null
    },
    /**
     * 이동 가능한 스테이지: 지방의 첫 스테이지, 클리어한 스테이지, 클리어한 스테이지의 다음 스테이지.
     * 수상 스테이지는 파도타기 포켓몬이나 낚싯대가 있어야 하고, 진행을 막지 않음 (앞의 수상 스테이지는 건너뛰고 판단)
     */
    stageUnlocked(): (stageId: string) => boolean {
      return (stageId) => {
        const found = findStage(stageId)
        if (!found) return false
        if (stageId === this.currentStageId) return true
        if (this.waterLocked(stageId)) return false
        if (this.clearedStages.includes(stageId)) return true
        const stages = found.region.stages
        for (let j = stages.indexOf(found.stage) - 1; j >= 0; j--) {
          if (this.clearedStages.includes(stages[j]!.id)) return true
          if (stages[j]!.kind !== 'water') return false
        }
        return true
      }
    },
    /** 수상 스테이지 접근 조건(파도타기·낚싯대로 만날 포켓몬이 있어야 함) 때문에 잠긴 스테이지 */
    waterLocked(): (stageId: string) => boolean {
      return (stageId) => {
        const stage = findStage(stageId)?.stage
        return stage?.kind === 'water' && stageId !== this.currentStageId && !!stage.encounters && !this.stageEncounters(stage)
      }
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
      // 전투 계산에 쓰는 필드 날씨 = 지금 있는 스테이지의 날씨
      setWeather(this.fieldWeather)
      if (this.travel || !this.party.length || !battleReady()) return

      // HP 0인 채로 남아 있으면 (이전 버전 저장 데이터 등) 바로 기절 처리
      if (this.party[0]?.hp === 0) {
        this.onPlayerFainted()
        return
      }

      const log = useBattleLogStore()
      // 상대 기술 선택이 끝나면 턴 계산
      if (log.pending) {
        if (!log.isBusy()) this.resolvePending()
        return
      }
      if (!this.enemy) {
        // 전투 사이: 다 키운 포켓몬은 도감으로, 회복 비용이 기준 이상이면 센터로, 아니면 턴 소모 없이 아이템 자동 사용
        // (리그 도전 중에는 자동 센터 귀환을 하지 않음: 센터에 가면 도전 기록이 초기화되므로)
        this.autoSendToDex()
        if (!this.league && this.autoCenterForCost()) return
        if (this.auto && this.autoUseItem()) return
        if (now < this.nextEncounterAt) return
        // 리그 도전 중: 다음 트레이너 포켓몬
        if (this.league) this.sendLeagueMon()
        // 일반 포켓몬을 BOSS_DEFEATS 마리 쓰러뜨리면 다음 조우는 반드시 보스
        else if (this.bossReady(this.currentStageId)) this.challengeBoss()
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
        const member = this.party[0]!
        const opts = { koPick: this.autoKoPick, ppLeft: (id: string) => (this.ppActive ? ppOf(member, id) : null) }
        this.takeTurn(chooseMove(me, foe, this.autoAiMode, transform, opts), g)
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
      // 난이도별 진행 분리 전 저장 데이터: 지금까지의 진행도는 쉬움(분리 전 기본 난이도와 같은 상대)으로
      if (!this.diffSplit) {
        this.difficulty = 'easy'
        this.diffProgress = {}
        this.diffSplit = true
      }
      if (!DIFFICULTY_IDS.includes(this.difficulty)) this.difficulty = 'easy'
      if (!this.diffProgress || typeof this.diffProgress !== 'object') this.diffProgress = {}
      for (const d of DIFFICULTY_IDS) {
        const p = this.diffProgress[d]
        if (!p) continue
        if (d === this.difficulty || typeof p !== 'object') {
          delete this.diffProgress[d]
          continue
        }
        if (!findStage(p.currentStageId)) p.currentStageId = '1-1'
        if (!p.stageProgress || typeof p.stageProgress !== 'object') p.stageProgress = {}
        if (!Array.isArray(p.clearedStages)) p.clearedStages = []
        if (!Array.isArray(p.unlockedRegions)) p.unlockedRegions = [1]
        if (!p.unlockedRegions.includes(1)) p.unlockedRegions.unshift(1)
        if (!Array.isArray(p.leagueCleared)) p.leagueCleared = []
      }
      if (!findStage(this.currentStageId)) this.currentStageId = '1-1'
      if (this.travel && !findStage(this.travel.to)) this.travel = null
      // 이전 저장 데이터 호환: 아이템별 자동사용 설정 시절의 값 정리
      const st = this.$state as unknown as Record<string, unknown>
      delete st.autoUseUnlocked
      // 이전 저장 데이터 호환: 보스 자동 도전 설정 시절의 값 정리
      for (const k of ['autoBoss', 'autoBossSuspended', 'bossFailStreak', 'bossFailLimit']) delete st[k]
      for (const k of Object.keys(this.autoUse))
        if (!AUTO_USE_KEYS.includes(k as AutoUseKey)) delete (this.autoUse as Record<string, unknown>)[k]
      // 이전 저장 데이터 호환: 체력 회복 자동 사용이 전투 중·후 하나였던 시절 → 전투 후 기능도 줌, 기준을 둘 다에 적용
      const legacyHeal = typeof st.autoHealAt === 'number'
      if (legacyHeal) {
        const start = st.autoHealAt as number
        this.autoHeal = { heal: { start, target: 100 }, healAfter: { start, target: 100 } }
        if (this.perks.includes('autoUse:heal') && !this.perks.includes('autoUse:healAfter')) {
          this.perks.push('autoUse:healAfter')
          this.autoUse.healAfter = !!this.autoUse.heal
        }
      }
      delete st.autoHealAt
      this.autoHeal = sanitizeAutoHeal(this.autoHeal)
      if (!Array.isArray(this.perks)) this.perks = []
      // 포켓몬 리그: 제패 기록 정리, 진행 중인 도전이 데이터와 맞지 않으면 취소
      if (!Array.isArray(this.leagueCleared)) this.leagueCleared = []
      const run = this.league
      const runTrainers = run && leagueOf({ key: run.region })
      if (run && (!runTrainers || !runTrainers[run.trainer] || !Number.isInteger(run.mon) || run.mon < 0)) this.league = null
      if (!this.league && this.enemy?.trainer) this.enemy = null
      // 이전 저장 데이터 호환: 전체 조우 기록이 없으면 스테이지별 조우 기록으로 채움
      if (!Array.isArray(this.seen)) this.seen = []
      const seen = new Set(this.seen)
      for (const p of Object.values(this.stageProgress)) for (const id of p.seen ?? []) seen.add(id)
      if (seen.size !== this.seen.length) this.seen = [...seen]
      if (!Number.isInteger(this.evBreaks) || this.evBreaks < 0) this.evBreaks = 0
      if (!Number.isInteger(this.bp) || this.bp < 0) this.bp = 0
      if (!Number.isInteger(this.coins) || this.coins < 0) this.coins = 0
      // 이전 저장 데이터 호환: 회복·기절 회복이 한 분류였던 시절 → 기절 회복 자동 사용·자동 구매를 따로 나눔
      if (legacyHeal && this.perks.includes('autoUse:heal') && !this.perks.includes('autoUse:revive')) {
        this.perks.push('autoUse:revive')
        this.autoUse.revive = !!this.autoUse.heal
      }
      const oldBuyItem = (st.autoBuyItem ?? {}) as Record<string, string>
      const oldHealBuy = shopItem(oldBuyItem.heal ?? '')
      if (oldHealBuy?.category === 'revive') oldBuyItem.revive = oldHealBuy.id
      // 이전 저장 데이터 호환: 기절 회복 자동 구매가 따로 있던 시절 (자동 구매 품목에 기절 회복이 있음)
      // → 전투 후 기능도 주고, 고른 품목을 살 아이템으로
      if ('revive' in oldBuyItem) {
        const item = isAutoReviveItem(oldBuyItem.revive!) ? oldBuyItem.revive! : DEFAULT_AUTO_REVIVE.revive.item
        this.autoRevive = { revive: { item, ashAt: 0 }, reviveAfter: { item, ashAt: 0 } }
        if (this.perks.includes('autoUse:revive') && !this.perks.includes('autoUse:reviveAfter')) {
          this.perks.push('autoUse:reviveAfter')
          this.autoUse.reviveAfter = !!this.autoUse.revive
        }
      }
      this.autoRevive = sanitizeAutoRevive(this.autoRevive)
      // 이전 저장 데이터 호환: 자동 구매가 따로 있던 시절 → 자동 사용에 합쳐졌으므로 산 값을 돌려줌
      for (const old of ['autoBuy:heal', 'autoBuy:pp', 'autoBuy:revive', 'autoBuy:status', 'autoBuy:ball']) {
        const i = (this.perks as string[]).indexOf(old)
        if (i < 0) continue
        this.perks.splice(i, 1)
        this.money += AUTO_BUY_PRICE
      }
      delete st.autoBuy
      delete st.autoBuyItem
      if (!AUTO_BALL_STEPS.includes(this.autoBall)) this.autoBall = DEFAULT_AUTO_BALL
      if (!Number.isFinite(this.money)) this.money = 0
      if (this.enemy && !this.enemy.species) this.enemy = null
      if (!this.autoUnlocked) this.auto = false
      if (this.stageMode === 'dex' ? !this.perks.includes(DEX_ADVANCE_PERK.id) : this.stageMode !== 'repeat') this.stageMode = 'advance'
      if (!['off', 'boss', 'always'].includes(this.autoGimmick)) this.autoGimmick = 'always'
      // 전투 밖에 특수 기능 효과가 남아 있으면 정리 (다이맥스 HP 복구)
      if (!this.enemy) this.endBattleGimmick()
      if (!this.everstoneOwned) this.everstone = false
      if (!this.perks.includes('bossIntro:skip')) this.skipBossIntro = false
      // 이전 저장 데이터 호환: PP 자동 센터 귀환은 자동 센터 귀환(회복 비용 기준)으로 대체됨 → 산 값을 돌려줌
      const oldCenter = (this.perks as string[]).indexOf('autoCenter:pp')
      if (oldCenter >= 0) {
        this.perks.splice(oldCenter, 1)
        this.money += OLD_AUTO_CENTER_PP_PRICE
      }
      delete st.autoCenterPriority
      if (!this.perks.includes(AUTO_CENTER_PERK.id)) this.autoCenter = false
      if (!this.perks.includes(AUTO_DEX_PERK.id)) this.autoDex = false
      if (!AUTO_CENTER_COST_STEPS.includes(this.autoCenterCost)) this.autoCenterCost = DEFAULT_AUTO_CENTER_COST
      if (!this.partyUse || typeof this.partyUse !== 'object') this.partyUse = {}
      for (const k of PARTY_USE_KEYS) if (!this.perks.includes(`partyUse:${k}`)) delete this.partyUse[k]
      if (!this.expShareOwned) this.expShare = false
      // 이전 저장 데이터 호환: 낚싯대가 한 종류(좋은낚싯대)였던 시절
      if (!Array.isArray(this.rods)) this.rods = []
      if (st.rodOwned && !this.rods.includes('good-rod')) this.rods.push('good-rod')
      delete st.rodOwned
      this.rods = ROD_ITEMS.map((r) => r.id).filter((id) => this.rods.includes(id))
      if (!this.rod || !this.rods.includes(this.rod)) this.rod = this.rods[this.rods.length - 1] ?? ''
      // 이전 저장 데이터 호환: 박스 시절 → 박스 포켓몬은 도감 기록으로, 포켓몬별 격파 수 → 계정 격파 수
      const oldBox = Array.isArray(st.box) ? (st.box as PartyMember[]) : []
      for (const m of [...this.party, ...oldBox]) migrateHeld(m)
      delete st.box
      // 지닌 도구 한도는 파티 슬롯별
      const slotUps = (v: unknown, max: number) =>
        Array.from({ length: PARTY_MAX }, (_, i) => {
          const n = Array.isArray(v) ? v[i] : 0
          return Number.isInteger(n) ? Math.min(max - 1, Math.max(0, n)) : 0
        })
      this.slotHeldKinds = slotUps(this.slotHeldKinds, HELD_KINDS_MAX)
      this.slotHeldStack = slotUps(this.slotHeldStack, HELD_STACK_MAX)
      // 이전 저장 데이터 호환: 포켓몬별 도구 한도 강화 → 파티·박스·도감 기록 전체에서 가장 높은 6개를 1~6번 슬롯에
      const oldHolders: { heldKinds?: number; heldStack?: number }[] = [
        ...this.party,
        ...oldBox,
        ...(this.dexRecords && typeof this.dexRecords === 'object' ? Object.values(this.dexRecords) : []),
      ]
      const topUps = (key: 'heldKinds' | 'heldStack') =>
        oldHolders.map((h) => (Number.isInteger(h[key]) ? h[key]! : 0)).sort((a, b) => b - a)
      const oldKinds = topUps('heldKinds')
      const oldStack = topUps('heldStack')
      for (let i = 0; i < PARTY_MAX; i++) {
        this.slotHeldKinds[i] = Math.max(this.slotHeldKinds[i]!, Math.min(HELD_KINDS_MAX - 1, oldKinds[i] ?? 0))
        this.slotHeldStack[i] = Math.max(this.slotHeldStack[i]!, Math.min(HELD_STACK_MAX - 1, oldStack[i] ?? 0))
      }
      for (const h of oldHolders) {
        delete h.heldKinds
        delete h.heldStack
      }
      // 이전 저장 데이터 호환: 파티 슬롯 도구가 따로 산 기능이던 시절 → 기본이 되었으므로 산 값을 돌려줌
      const oldSlotHeld = (this.perks as string[]).indexOf('heldSlot:bind')
      if (oldSlotHeld >= 0) {
        this.perks.splice(oldSlotHeld, 1)
        this.money += OLD_SLOT_HELD_PRICE
      }
      delete st.slotHeldCap
      // 비어 있는 슬롯의 도구 정리, 슬롯 한도를 넘는 도구는 가방으로
      if (!Array.isArray(this.slotHeldSpare)) this.slotHeldSpare = []
      this.slotHeldSpare = Array.from({ length: PARTY_MAX }, (_, i) => {
        const s = this.slotHeldSpare[i]
        if (!s || typeof s.held !== 'object' || i < this.party.length) return null
        this.trimHeld(s, i)
        return heldIds(s).length ? s : null
      })
      this.party.forEach((m, i) => this.trimHeld(m, i))
      // 이전 저장 데이터 호환: 성별이 없던 시절의 파티 포켓몬은 성비대로 정하고 도감에 성별 기록
      for (const m of this.party)
        if (m.gender === undefined) {
          m.gender = rollGender(m.species)
          const r = this.dexRecords?.[m.species]
          if (r && m.gender && !(r.genders ??= []).includes(m.gender)) r.genders.push(m.gender)
        }
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
      this.party.push({ ...member, gender: member.gender !== undefined ? member.gender : rollGender(member.species), learned: [...member.moves] })
      this.backfillLearned()
      if (!this.caught.includes(member.species)) this.caught.push(member.species)
      this.recordToDex(this.party[0]!)
    },

    moveTo(stageId: string) {
      const target = findStage(stageId)
      if (!target || !this.canEnter(target.region) || this.regionLocked(target.region) || !this.stageUnlocked(stageId) || this.faint) return
      if (stageId === this.currentStageId) {
        this.travel = null
        return
      }
      this.quitLeague('리그를 떠났다. 도전 기록이 초기화되었다.')
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
    /**
     * 난이도 바꾸기: 지금 난이도의 진행도를 보관하고 고른 난이도의 진행도로 (처음이면 1번 지방 처음부터).
     * 전투·이동·리그 도전은 취소됨. 회복 중에는 바꿀 수 없음
     */
    setDifficulty(to: Difficulty): boolean {
      if (to === this.difficulty || !DIFFICULTY_IDS.includes(to) || this.faint) return false
      this.quitLeague('난이도를 바꿔 리그 도전 기록이 초기화되었다.')
      this.endBattleGimmick()
      this.enemy = null
      this.travel = null
      this.playerStages = {}
      this.playerVol = {}
      this.playerIntel = null
      const store = this.diffProgress
      store[this.difficulty] = {
        currentStageId: this.currentStageId,
        stageProgress: this.stageProgress,
        clearedStages: this.clearedStages,
        unlockedRegions: this.unlockedRegions,
        leagueCleared: this.leagueCleared,
      }
      const next = store[to] ?? freshProgress()
      delete store[to]
      this.difficulty = to
      this.currentStageId = next.currentStageId
      this.stageProgress = next.stageProgress
      this.clearedStages = next.clearedStages
      this.unlockedRegions = next.unlockedRegions
      this.leagueCleared = next.leagueCleared
      this.nextEncounterAt = 0
      const label = DIFFICULTIES.find((d) => d.id === to)?.label ?? to
      useBattleLogStore().push(`난이도를 ${ro(label)} 바꿨다.`, 'info')
      return true
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
          // 지닌 도구는 슬롯에 묶임: 나오면 맨 앞 슬롯의 도구를 지님
          held: heldOf(this.party[0]!),
          vol: {},
          boost: this.dexBoost,
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
        held: heldOf(m),
        vol: { ...this.playerVol },
        intel: this.playerIntel ? { cands: [...this.playerIntel.cands], known: this.playerIntel.known } : undefined,
        boost: this.dexBoost,
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
    memberMaxHp(m: PartyMember, species = m.species): number {
      const dynamax = m === this.party[0] && this.gimmickActive?.kind === 'dynamax'
      return maxHpOf({ species, level: m.level, ivs: m.ivs ?? [], evs: m.evs ?? [], nature: m.nature, dynamax, boost: this.dexBoost })
    },
    /** 파티 포켓몬의 실능치 (도감 보너스 포함) */
    memberStats(m: Pick<PartyMember, 'species' | 'level' | 'ivs' | 'evs' | 'nature'>): number[] {
      return statsOf({ species: m.species, level: m.level, ivs: m.ivs ?? [], evs: m.evs ?? [], nature: m.nature, boost: this.dexBoost })
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
        if (g === 'z') return holdsZCrystal(held) && this.usableMoves().some((id) => zEligible(moveData(id), held))
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
        name: `${e.trainer ? `${e.trainer.name}의 ` : e.boss ? '보스 ' : '야생 '}${sp?.ko ?? e.species}`,
        species: e.species,
        level: e.level,
        nature: e.nature,
        ivs: e.ivs,
        evs: e.evs ?? [0, 0, 0, 0, 0, 0],
        hp: 0,
        moves: e.moves ?? [],
        stages: { ...(e.stages ?? {}) },
        status: e.status ?? null,
        sleep: e.sleep,
        toxic: e.toxic,
        ability: e.ability ?? null,
        held: e.item ? { [e.item]: 1 } : {},
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
      const tr = enemy.trainer
      log.beginBattle(tr ? `${tr.name}의 ${name}` : name, !!enemy.boss)
      if (tr) {
        if (tr.index === 0) log.push(`${trainerLabel(tr)}${josa(tr.name, '이', '가').slice(tr.name.length)} 승부를 걸어왔다!`, 'info')
        log.push(`${josa(tr.name, '은', '는')} ${josa(name, '을', '를')} 내보냈다! (${tr.index + 1}/${tr.count})`, 'info')
      } else log.push(enemy.boss ? `보스 ${josa(name, '이', '가')} 승부를 걸어왔다!` : `앗! 야생 ${josa(name, '이', '가')} 튀어나왔다!`, 'info')
      if (enemy.boss && (!tr || tr.index === 0)) sfx('boss')
      // 특성 정보: 서로 상대가 가질 수 있는 특성을 후보로 시작
      enemy.intel = { cands: speciesAbilities(enemy.species, !!enemy.boss || this.difficulty !== 'easy'), known: false }
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
      log.wait((enemy.boss && (!tr || tr.index === 0) && !this.bossIntroSkipped ? BOSS_INTRO_MS : 0) + this.battlePickMs)
    },
    /** 전투 계산 결과(랭크·전투 중 상태·특성 정보)를 저장 */
    saveBattlers(me: Battler, foe: Battler) {
      this.playerStages = me.stages
      this.playerVol = me.vol ?? {}
      this.playerIntel = me.intel ?? null
      // 전투 중 써서 사라진 지닌 도구
      const m = this.party[0]
      if (m) {
        for (const [id, n] of Object.entries(heldOf(m))) {
          const used = n - (me.held?.[id] ?? 0)
          if (used > 0) (m.heldSpent ??= {})[id] = (m.heldSpent[id] ?? 0) + used
        }
      }
      const e = this.enemy
      if (!e) return
      e.stages = foe.stages
      e.vol = foe.vol
      e.intel = foe.intel
      e.item = Object.keys(foe.held ?? {}).find((id) => (foe.held![id] ?? 0) > 0) ?? null
    },
    /** 써서 사라진 지닌 도구: 가방에 같은 도구가 있으면 다시 지님, 없으면 비움 */
    refillHeld() {
      const log = useBattleLogStore()
      for (const m of this.party) {
        const spent = m.heldSpent
        if (!spent) continue
        m.heldSpent = undefined
        const held = (m.held ??= {})
        for (const [id, n] of Object.entries(spent)) {
          if (n <= 0) continue
          const refill = Math.min(n, this.items[id] ?? 0)
          for (let i = 0; i < refill; i++) this.takeFromBag(id)
          if (refill > 0) {
            const name = speciesOf(m.species)?.ko ?? m.species
            const itemName = dexData.value?.items[id]?.ko ?? id
            log.push(`가방의 ${josa(itemName, '을', '를')}${refill > 1 ? ` ${refill}개` : ''} ${name}에게 다시 지니게 했다.`, 'info')
          }
          const left = (held[id] ?? 0) - (n - refill)
          if (left > 0) held[id] = left
          else delete held[id]
        }
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
    /** 도감 모드: 고른 낚싯대로 더 잡을 포켓몬이 없으면, 안 잡은 포켓몬이 나오는 가진 낚싯대로 바꿈 */
    dexPickRod(stage: Stage) {
      if (this.stageMode !== 'dex' || !this.dexModeReady || !stage.encounters?.methods || !this.rods.length) return
      const surf: WaterMethod[] = this.canSurf ? ['surf'] : []
      const left = (rod: RodId) => this.uncaughtWith(stage, [...surf, rod]).length
      if (this.rod && left(this.rod)) return
      // 더 좋은 낚싯대부터
      const rod = [...this.rods].reverse().find((r) => r !== this.rod && left(r))
      if (!rod) return
      this.rod = rod
      useBattleLogStore().push(`안 잡은 포켓몬을 찾아 ${ROD_KO[rod]}로 바꿨다.`, 'info')
    },
    spawn() {
      const stage = findStage(this.currentStageId)?.stage
      if (stage) this.dexPickRod(stage)
      const enemy = stage && rollWild(this.stageEncounters(stage), this.difficulty !== 'easy')
      if (enemy) this.startBattle(applyDifficulty(enemy, this.difficulty))
      else this.nextEncounterAt = Date.now() + 5000
    },
    challengeBoss() {
      const stage = findStage(this.currentStageId)?.stage
      if (!stage || !this.bossReady(stage.id) || this.faint || this.travel || !battleReady()) return
      const boss = makeBoss(this.stageEncounters(stage))
      if (boss) this.startBattle(applyDifficulty(boss, this.difficulty))
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
      // 상대도 PP가 남은 기술만 (모두 0이면 발버둥)
      const foeMoves = this.ppActive ? foe.moves.filter((id) => (ppOf(this.enemy!, id) ?? 1) > 0) : foe.moves
      const enemyMove = chooseMove({ ...foe, moves: foeMoves }, me, DIFFICULTY_AI[this.difficulty], undefined, DIFFICULTY_AI_OPTS[this.difficulty])
      const result: TurnResult = runTurn(me, foe, playerMove, enemyMove, override)
      for (const line of result.lines) log.push(line)
      // 효과음: 공격마다 조금씩 간격을 두고, 쓰러짐은 마지막 공격 뒤에
      // 기술 타입별 효과음 → (공격기면) 상성에 따른 타격음
      result.hits.forEach((h, i) => {
        const t = i * HIT_SFX_GAP
        moveSfx(h.type, t, h.status)
        if (h.status) return
        sfx(h.eff > 1 ? 'hitSuper' : h.eff < 1 ? 'hitWeak' : 'hit', t + HIT_SFX_IMPACT)
        if (h.crit) sfx('crit', t + HIT_SFX_IMPACT + 0.05)
      })
      turnSfxDelay = result.hits.length * HIT_SFX_GAP
      this.battleTurns++
      if (enemyMove !== 'struggle' && result.enemyMoved && this.ppActive) {
        const left = ppOf(this.enemy, enemyMove)
        if (left != null) (this.enemy.pp ??= {})[enemyMove] = Math.max(0, left - result.enemyPpCost)
      }

      // PP 소모 (실제로 기술을 썼을 때만)
      if (playerMove && result.playerMoved && this.ppActive) {
        const left = ppOf(member, playerMove)
        if (left != null) (member.pp ??= {})[playerMove] = Math.max(0, left - result.ppCost)
        // 과사열매(지닌 도구): PP가 0이 된 기술의 PP 10 회복
        if (member.pp?.[playerMove] === 0 && (me.held?.['leppa-berry'] ?? 0) > 0 && me.hp > 0) {
          member.pp[playerMove] = Math.min(maxPpOf(playerMove, member) ?? 10, 10)
          takeHeld(me, 'leppa-berry')
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
      turnSfxDelay = 0
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
            const tMax = this.memberMaxHp(t)
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
          if (this.enemy.boss || this.leadTrapped) return null
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
        log.push(e.trainer ? '남의 포켓몬은 잡을 수 없다!' : '보스 포켓몬은 잡을 수 없다!', 'bad')
        return false
      }
      this.takeFromBag(ballId)
      log.push(`${josa(ballName, '을', '를')} 던졌다!`, 'info')
      const { caught, shakes } = rollCatch(ballId, this.catchContext(), foe.hp, maxHpOf(foe))
      if (shakes > 0) log.push(`볼이 ${shakes}번 흔들렸다…`)
      sfx('throw')
      for (let i = 0; i < Math.min(3, shakes); i++) sfx('shake', 0.4 + i * 0.35)
      sfx(caught ? 'catch' : 'breakOut', 0.4 + Math.min(3, shakes) * 0.35)
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
      if (!this.enemy || this.enemy.boss || this.leadTrapped) return
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
      const amount = (i: ShopItem) => healAmountOf(i, max)
      const enough = [...list].sort((a, b) => a.price - b.price).find((i) => amount(i) >= max - hp)
      return enough ?? [...list].sort((a, b) => amount(b) - amount(a))[0] ?? null
    },

    /** 아이템 자동 사용 (편의성 기능). 사용했으면 true */
    autoUseItem(): boolean {
      const m = this.party[0]
      const me = this.playerBattler()
      if (!m || !me || this.faint) return false
      // 0. 전투 후: 기절한 파티 포켓몬 살리기
      if (!this.enemy && this.autoReviveRun('reviveAfter', false)) return true
      const on = (cat: AutoUseKey) => this.perks.includes(`autoUse:${cat}`) && !!this.autoUse[cat]
      // 전투 중 상대를 타격할 기술이 하나도 없으면 (PP와 무관하게) 회복약·PP 회복은 쓰지 않음
      const useless = !!this.enemy && this.bestDamageVsFoe(0, false) <= 0

      // 가방에 없으면 사서 씀 (자동 사용에 포함된 자동 구매)
      const ready = (id: string) => (this.items[id] ?? 0) > 0 || this.buyItem(id, 1)
      // 계획한 아이템을 차례로 씀 (하나라도 썼으면 true)
      const run = (ids: string[], target: number) => {
        let used = false
        for (const id of ids) {
          if (!ready(id) || !this.useItem(id, target)) break
          used = true
        }
        return used
      }
      // 1. 체력: 시작 기준 아래면 목표까지 채움 (없는 아이템은 사서 씀).
      //    전투 중 = 한 개로 가장 잘 채우는 아이템, 전투 후 = 돈이 가장 적게 드는 조합을 한꺼번에
      if (this.enemy) {
        const max = maxHpOf(me)
        const range = this.autoHeal.heal
        if (!useless && on('heal') && (me.hp / max) * 100 < range.start) {
          const need = Math.ceil((max * range.target) / 100) - me.hp
          const pick = pickHealInBattle(this.healOptions(0, this.items, this.money), need)?.id
          if (pick && ready(pick) && this.useItem(pick)) return true
        }
      } else if (on('healAfter') && run(this.recoverPlan(0, 'healAfter', this.items, this.money), 0)) return true
      // 2. 상태이상: 고칠 수 있는 아이템 중 돈이 가장 적게 드는 것 (가진 것은 공짜, 없으면 사서 씀)
      if (on('status') && run(this.recoverPlan(0, 'status', this.items, this.money), 0)) return true
      // 3. PP: PP가 0인 기술이 있으면. 2개 이상이면 전체 회복 아이템 우선 (없으면 가장 싼 것을 사서 씀)
      if (!useless && on('pp') && run(this.recoverPlan(0, 'pp', this.items, this.money), 0)) return true
      // 3-1. 전투 후 파티 전체 회복: 다른 파티 포켓몬도 (체력 → 상태이상 → PP)
      if (!this.enemy) {
        for (const key of PARTY_USE_KEYS) {
          if (!this.partyOn(key)) continue
          for (let t = 1; t < this.party.length; t++) if (run(this.recoverPlan(t, key, this.items, this.money), t)) return true
        }
      }
      // 4. 몬스터볼: 도감에 없는 야생 포켓몬이면 보정 배율이 기준 이상인 볼 중 가성비가 가장 좋은 것
      //    (가진 것은 공짜, 없으면 사서 씀. 마스터볼·파크볼은 쓰지 않음)
      const e = this.enemy
      if (on('ball') && e && !e.boss && !this.caught.includes(e.species)) {
        const pick = pickAutoBall(this.autoBallOptions()!, this.autoBall)
        if (pick && ready(pick) && this.useItem(pick)) return true
      }
      return false
    },

    /** 전투 후 파티 전체 회복이 켜져 있는지 (기본 자동 사용 + 파티 전체 기능 모두 구매·켜짐) */
    partyOn(key: PartyUseKey): boolean {
      return (
        this.perks.includes(`autoUse:${key}`) && !!this.autoUse[key] && this.perks.includes(`partyUse:${key}`) && !!this.partyUse[key]
      )
    },
    /** 체력 회복 아이템 후보 (target 기준 회복량). bag = 가진 개수, money = 쓸 수 있는 돈 */
    healOptions(target: number, bag: Partial<Record<string, number>>, money: number): HealOption[] {
      const m = this.party[target]
      if (!m) return []
      const max = this.memberMaxHp(m)
      return SHOP_ITEMS.filter((i) => i.category === 'heal' && this.itemEffect(i, target)).map((i) => ({
        id: i.id,
        amount: healAmountOf(i, max),
        price: i.price,
        owned: bag[i.id] ?? 0,
        // 친밀도가 떨어지는 아이템은 사지 않음
        buyable: !i.friendship && money >= i.price,
      }))
    },
    /**
     * 자동 사용으로 target 포켓몬에게 쓸 아이템 목록 (전투 후 체력 / 상태이상 / PP). 쓸 게 없으면 빈 목록.
     * bag = 가진 개수, money = 쓸 수 있는 돈 (자동 센터 귀환 비용 계산은 사본과 무한대로 부름). 기절한 포켓몬은 제외
     */
    recoverPlan(target: number, key: PartyUseKey, bag: Partial<Record<string, number>>, money: number): string[] {
      const m = this.party[target]
      if (!m || m.hp === 0) return []
      if (key === 'healAfter') {
        const max = this.memberMaxHp(m)
        const hp = m.hp ?? max
        const range = this.autoHeal.healAfter
        if ((hp / max) * 100 >= range.start) return []
        return planHealAfterBattle(this.healOptions(target, bag, money), Math.ceil((max * range.target) / 100) - hp)
      }
      if (key === 'status') {
        if (!m.status) return []
        const pick = pickCheapestItem(
          SHOP_ITEMS.filter((i) => i.category === 'status' && this.itemEffect(i, target)).map((i) => ({
            id: i.id,
            price: i.price,
            owned: bag[i.id] ?? 0,
            // 친밀도가 떨어지는 아이템은 사지 않음
            buyable: !i.friendship && money >= i.price,
          })),
        )
        return pick ? [pick] : []
      }
      if (!this.ppActive) return []
      const empty = m.moves.filter((id) => ppOf(m, id) === 0).length
      const pick = empty ? this.autoPpPick(empty >= 2 ? 'all' : 'one', target, bag, money) : null
      return pick ? [pick.id] : []
    },
    /**
     * 전투 후 파티 전체를 자동 사용 아이템으로 회복하는 데 드는 돈 (가방에 있는 것은 공짜, 켜져 있는 기능만, 기절한 포켓몬 제외).
     * 싸우는 포켓몬은 기본 자동 사용, 다른 포켓몬은 파티 전체 회복이 켜져 있을 때 계산
     */
    recoverCost(): number {
      const bag: Partial<Record<string, number>> = { ...this.items }
      let cost = 0
      for (const key of PARTY_USE_KEYS) {
        if (!this.perks.includes(`autoUse:${key}`) || !this.autoUse[key]) continue
        const n = this.partyOn(key) ? this.party.length : 1
        for (let t = 0; t < n; t++) {
          for (const id of this.recoverPlan(t, key, bag, Infinity)) {
            if ((bag[id] ?? 0) > 0) bag[id]! -= 1
            else cost += shopItem(id)?.price ?? 0
          }
        }
      }
      return cost
    },

    /** 몬스터볼 자동 사용 후보 (지금 상대 기준 배율·포획률). 잡을 수 있는 야생 포켓몬과 싸우는 중이 아니면 null */
    autoBallOptions(): BallOption[] | null {
      const e = this.enemy
      const foe = e && !e.boss ? this.enemyBattler() : null
      if (!e || !foe) return null
      const ctx = this.catchContext()
      return SHOP_ITEMS.filter((i) => i.category === 'ball' && !NO_AUTO_BALLS.includes(i.id)).map((i) => ({
        id: i.id,
        price: i.price,
        owned: this.items[i.id] ?? 0,
        buyable: this.money >= i.price,
        mult: ballMultOf(i.id, ctx),
        chance: catchChance(i.id, ctx, foe.hp, maxHpOf(foe)),
      }))
    },
    /** 기절 회복 아이템을 target 에게 씀 (가방에 없으면 삼). 썼으면 true */
    autoReviveUse(id: string, target: number): boolean {
      const def = shopItem(id)
      const effect = def && this.itemEffect(def, target)
      if (!effect || (!(this.items[id] ?? 0) && !this.buyItem(id, 1))) return false
      this.takeFromBag(id)
      useBattleLogStore().push(`${josa(dexData.value?.items[id]?.ko ?? id, '을', '를')} 사용했다! ${effect()}`, 'info')
      return true
    },
    /**
     * 기절 회복 자동 사용 (편의성 기능, 턴 소모 없음). 기절한 파티 포켓몬이 기준 이상이면 성스러운분,
     * 아니면 한 마리씩: 가방에 있는 것 중 가장 싼 것 (성스러운분 제외) → 고른 아이템을 사서.
     * leadOnly = 싸우는 포켓몬만 살림 (전투 중). 하나라도 썼으면 true
     */
    autoReviveRun(key: AutoReviveKey, leadOnly: boolean): boolean {
      if (!this.perks.includes(`autoUse:${key}`) || !this.autoUse[key]) return false
      const fainted = this.party.flatMap((m, i) => (m.hp === 0 ? [i] : []))
      if (!fainted.length || (leadOnly && fainted[0] !== 0)) return false
      const cfg = this.autoRevive[key]
      if (cfg.ashAt > 0 && fainted.length >= cfg.ashAt && this.autoReviveUse(SACRED_ASH, fainted[0]!)) return true
      let used = false
      for (const t of leadOnly ? [0] : fainted) {
        const owned = SHOP_ITEMS.filter((i) => isAutoReviveItem(i.id) && (this.items[i.id] ?? 0) > 0).sort((a, b) => a.price - b.price)[0]
        if (!this.autoReviveUse(owned?.id ?? cfg.item, t)) break
        used = true
      }
      return used
    },

    /**
     * PP 자동 사용할 아이템: 가진 것 중 원하는 종류(한 기술/전체) → 살 수 있는 원하는 종류 중 가장 싼 것
     * → 가진 다른 종류 → 살 수 있는 다른 종류 중 가장 싼 것. 없으면 null
     */
    autoPpPick(
      prefer: 'one' | 'all',
      target = 0,
      bagArg?: Partial<Record<string, number>>,
      moneyArg?: number,
    ): ShopItem | null {
      const bag = bagArg ?? this.items
      const money = moneyArg ?? this.money
      const list = SHOP_ITEMS.filter((i) => i.category === 'pp' && this.itemEffect(i, target))
      const owned = list.filter((i) => (bag[i.id] ?? 0) > 0)
      const buyable = list.filter((i) => money >= i.price).sort((a, b) => a.price - b.price)
      const is = (i: ShopItem) => i.pp?.target === prefer
      return owned.find(is) ?? buyable.find(is) ?? owned[0] ?? buyable[0] ?? null
    },

    /**
     * 자동 센터 귀환 (편의성 기능, 자동 전투 중 전투 사이에만):
     * 파티 전체를 자동 사용 아이템으로 회복하는 데 드는 돈이 기준 금액 이상이거나 가진 돈보다 많으면 센터로. 갔으면 true
     */
    autoCenterForCost(): boolean {
      if (!this.auto || !this.autoCenter || !this.perks.includes(AUTO_CENTER_PERK.id)) return false
      if (this.faint || this.travel || this.enemy) return false
      const m = this.party[0]
      if (!m || m.hp === 0) return false
      const cost = this.recoverCost()
      if (cost <= 0 || (cost < this.autoCenterCost && cost <= this.money)) return false
      useBattleLogStore().push(`회복에 ${cost.toLocaleString()}원이 들어 포켓몬센터로 회복하러 돌아갔다.`, 'info')
      this.goRecover(RETREAT_MS, true)
      return true
    },

    // ---------- 지닌 도구 ----------
    /** 이 도구를 1개 더 지니게 할 수 있는지 (종류 수·같은 도구 개수 한도) */
    canGiveHeld(memberIndex: number, itemId: string): boolean {
      const m = this.party[memberIndex]
      if (!m || (this.items[itemId] ?? 0) <= 0 || this.faint) return false
      const n = m.held?.[itemId] ?? 0
      const lim = this.heldLimitsAt(memberIndex)
      if (n > 0) return n < lim.stack
      return heldIds(m).length < lim.kinds
    },
    /** 가방의 도구를 1개 지니게 함 (종류 수·같은 도구 개수 한도 안에서) */
    giveHeld(memberIndex: number, itemId: string): boolean {
      if (!this.canGiveHeld(memberIndex, itemId)) return false
      const m = this.party[memberIndex]!
      this.takeFromBag(itemId)
      const held = (m.held ??= {})
      held[itemId] = (held[itemId] ?? 0) + 1
      if (memberIndex === 0) this.playerVol = { ...this.playerVol, choice: undefined }
      return true
    },
    /** 지닌 도구를 가방으로. n = 개수 (없으면 그 도구 전부). 써서 사라진 것부터 뺌 */
    takeHeld(memberIndex: number, itemId: string, n?: number) {
      const m = this.party[memberIndex]
      const have = m?.held?.[itemId] ?? 0
      if (!m || have <= 0 || this.faint) return
      const take = Math.min(have, n ?? have)
      const spent = m.heldSpent?.[itemId] ?? 0
      const fromSpent = Math.min(spent, take)
      this.addToBag(itemId, take - fromSpent)
      if (fromSpent) {
        if (spent - fromSpent > 0) m.heldSpent![itemId] = spent - fromSpent
        else delete m.heldSpent![itemId]
      }
      if (have - take > 0) m.held![itemId] = have - take
      else delete m.held![itemId]
      if (memberIndex === 0) this.playerVol = { ...this.playerVol, choice: undefined }
    },
    /** 지닌 도구를 모두 가방으로 */
    takeAllHeld(memberIndex: number) {
      const m = this.party[memberIndex]
      if (!m || this.faint) return
      for (const id of Object.keys(m.held ?? {})) this.takeHeld(memberIndex, id)
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

    // ---------- 알 기술·기술가르침 ----------
    /** 알 기술 유전 부모로 인정: 잡은 적 있거나 파티에 있는 포켓몬 */
    ownsSpecies(id: string): boolean {
      return this.caught.includes(id) || this.party.some((m) => m.species === id)
    },
    /** 그 성별이 도감에 등록돼 있는지 (파티 포켓몬 포함) */
    hasGender(id: string, g: Gender): boolean {
      return !!this.dexRecords[id]?.genders?.includes(g) || this.party.some((m) => m.species === id && m.gender === g)
    },
    /** 그 작품 지방의 그 스테이지에 도착한 적 있는지 (지금 있는 곳 / 클리어 / 전투 기록) */
    stageVisited(regionKey: string, stageName: string): boolean {
      const region = REGIONS.find((r) => r.key === regionKey)
      if (!region) return false
      // 어느 난이도에서든 가 본 곳이면 됨
      return this.allProgress.some(
        (p) =>
          p.unlockedRegions.includes(region.id) &&
          region.stages.some(
            (s) => s.name === stageName && (s.id === p.currentStageId || p.clearedStages.includes(s.id) || !!p.stageProgress[s.id]),
          ),
      )
    },
    /** 기술가르침 비용이 부족한 것 (없으면 빈 문자열) */
    tutorShortfall(cost: TutorCost): string {
      if (cost.money && this.money < cost.money) return '돈이 부족합니다'
      if (cost.bp && this.bp < cost.bp) return 'BP가 부족합니다'
      if (cost.coin && this.coins < cost.coin) return '코인이 부족합니다'
      for (const [k, n] of Object.entries(cost.shards ?? {}))
        if (n && (this.items[SHARD_ITEM[k as ShardColor]] ?? 0) < n) return '조각이 부족합니다'
      return ''
    },
    /** 기술가르침으로 기술 장착: 빈 칸이 있으면 장착, 칸이 가득 차면 replaceId 대신 */
    learnByTutor(memberIndex: number, moveId: string, src: TutorSource, replaceId?: string): boolean {
      const m = this.party[memberIndex]
      if (!m || this.faint || (m.learned ?? m.moves).includes(moveId)) return false
      if (!tutorOptions(m.species).some((o) => o.move === moveId && o.sources.some((s) => JSON.stringify(s) === JSON.stringify(src)))) return false
      if (!this.stageVisited(src.region, src.gate) || this.tutorShortfall(src.cost)) return false
      const full = m.moves.length >= this.slotsOf(m)
      if (full && (!replaceId || !m.moves.includes(replaceId))) return false
      const c = src.cost
      if (c.money) this.money -= c.money
      if (c.bp) this.bp -= c.bp
      if (c.coin) this.coins -= c.coin
      for (const [k, n] of Object.entries(c.shards ?? {})) for (let i = 0; i < (n ?? 0); i++) this.takeFromBag(SHARD_ITEM[k as ShardColor])
      if (m.pending) m.pending = m.pending.filter((id) => id !== moveId)
      this.putMove(m, moveId, full ? replaceId : undefined)
      return true
    },
    /**
     * 알 기술 시도 (EGG_MOVE_PRICE 원 소모). 소지한 부모 중 확률이 가장 높은 부모로 시도:
     * 성공하면 장착 (칸이 가득 차면 replaceId 대신), 실패해도 돈은 사라짐
     */
    tryEggMove(memberIndex: number, moveId: string, replaceId?: string): 'success' | 'fail' | null {
      const m = this.party[memberIndex]
      if (!m || this.faint || this.money < EGG_MOVE_PRICE || (m.learned ?? m.moves).includes(moveId)) return null
      const opt = eggMoveOptions(m.species, (id) => this.ownsSpecies(id)).find((o) => o.move === moveId)
      if (!opt?.best || opt.chance <= 0) return null
      const full = m.moves.length >= this.slotsOf(m)
      if (full && (!replaceId || !m.moves.includes(replaceId))) return null
      this.money -= EGG_MOVE_PRICE
      const name = speciesOf(m.species)?.ko ?? m.species
      const parent = speciesOf(opt.best.species)?.ko ?? opt.best.species
      const move = dexData.value?.movesById[moveId]?.ko ?? moveId
      if (Math.random() >= opt.chance) {
        useBattleLogStore().push(`${parent}에게서 ${josa(move, '을', '를')} 물려받지 못했다…`, 'info')
        return 'fail'
      }
      useBattleLogStore().push(`${josa(name, '이', '가')} ${parent}에게서 ${josa(move, '을', '를')} 물려받았다!`, 'info')
      if (m.pending) m.pending = m.pending.filter((id) => id !== moveId)
      this.putMove(m, moveId, full ? replaceId : undefined)
      return 'success'
    },

    // ---------- 파티·도감 ----------
    /** 파티 포켓몬을 싸우는 포켓몬(맨 앞)으로. 전투 중 첫 기술을 쓴 뒤에는 한 턴을 소모 */
    setLead(index: number): boolean {
      const log = useBattleLogStore()
      const m = this.party[index]
      if (!m || index === 0 || m.hp === 0 || this.faint || !battleReady()) return false
      // 그림자꿰매기 등으로 묶여 있으면 교체 불가 (싸우는 포켓몬이 기절했으면 가능)
      if (this.leadTrapped) return false
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
      this.keepSlotHeld(() => {
        ;[party[0], party[index]] = [party[index]!, party[0]!]
      })
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
      this.keepSlotHeld(() => {
        this.party.splice(index, 1)
        this.sendToDexMember(m)
      })
      if (index === 0) this.switchLead(0)
      return true
    },
    /**
     * 도감 자동 보내기: 1번 칸을 뺀 파티 포켓몬 중 최종 진화체(더 진화하지 않음)이면서 친밀도가 최대인 포켓몬을 도감으로 보냄.
     * 보낸 마릿수 반환
     */
    autoSendToDex(): number {
      if (!this.autoDex || !this.perks.includes(AUTO_DEX_PERK.id) || this.faint || !evolutions.value) return 0
      let sent = 0
      for (let i = this.party.length - 1; i >= 1; i--) {
        const m = this.party[i]!
        if (evolutionsOf(m.species).length || friendshipOf(m) < FRIENDSHIP_MAX) continue
        const name = speciesOf(m.species)?.ko ?? m.species
        if (!this.sendToDex(i)) continue
        useBattleLogStore().push(`${josa(name, '은', '는')} 다 자라서 도감으로 보냈다.`, 'info')
        sent++
      }
      return sent
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
          genders: m.gender ? [m.gender] : [],
        }
        return
      }
      if (m.gender && !(r.genders ??= []).includes(m.gender)) r.genders.push(m.gender)
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
      this.keepSlotHeld(() => this.party.push({
        species,
        level,
        moves,
        learned: [...r.moves],
        pending: [],
        exp: expAtLevel(species, level),
        nature: c.nature,
        gender: c.gender && r.genders?.includes(c.gender) ? c.gender : (r.genders?.[0] ?? rollGender(species)),
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
        held: {},
      }))
      this.backfillLearned()
      return true
    },
    /**
     * 지닌 도구는 파티 슬롯에 묶임: 파티를 바꾸는 동안 지닌 도구를 슬롯 번호에 묶어 둠.
     * 바꾼 뒤 각 슬롯의 포켓몬이 그 슬롯의 도구를 지니고, 새로 들어온 포켓몬이 원래 지닌 도구는 가방으로
     */
    keepSlotHeld<T>(fn: () => T): T {
      if (slotHeldDepth > 0) return fn()
      const slots: SlotHeld[] = Array.from({ length: PARTY_MAX }, (_, i) => {
        const m = this.party[i]
        if (!m) return this.slotHeldSpare[i] ?? { held: {} }
        const s = { held: m.held ?? {}, heldSpent: m.heldSpent }
        m.held = {}
        m.heldSpent = undefined
        return s
      })
      slotHeldDepth++
      let r: T
      try {
        r = fn()
      } finally {
        slotHeldDepth--
      }
      const spare: (SlotHeld | null)[] = []
      slots.forEach((s, i) => {
        const m = this.party[i]
        if (m) {
          this.takeHeldFrom(m)
          m.held = s.held
          m.heldSpent = s.heldSpent
        } else spare[i] = heldIds(s).length ? s : null
      })
      this.slotHeldSpare = spare
      return r
    },
    /** 이 슬롯에서 지닐 수 있는 한도를 넘는 지닌 도구는 가방으로 */
    trimHeld(m: Pick<PartyMember, 'held' | 'heldSpent'>, slot: number) {
      const { kinds, stack } = this.heldLimitsAt(slot)
      heldIds(m).forEach((id, k) => {
        const over = k < kinds ? (m.held![id] ?? 0) - stack : (m.held![id] ?? 0)
        if (over <= 0) return
        const spent = m.heldSpent?.[id] ?? 0
        const fromSpent = Math.min(spent, over)
        this.addToBag(id, over - fromSpent)
        if (fromSpent) {
          if (spent - fromSpent > 0) m.heldSpent![id] = spent - fromSpent
          else delete m.heldSpent![id]
        }
        if (m.held![id]! - over > 0) m.held![id] = m.held![id]! - over
        else delete m.held![id]
      })
    },
    /** 파티에서 빠지는 포켓몬의 지닌 도구는 가방으로 */
    takeHeldFrom(m: PartyMember) {
      for (const [id, n] of Object.entries(heldOf(m))) this.addToBag(id, n)
      m.held = {}
      m.heldSpent = undefined
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
      // 난이도 보정으로 레벨 100을 넘는 포켓몬도 잡으면 레벨 100 (노력치는 0부터, 남은 HP 비율은 그대로)
      const level = Math.min(100, e.level)
      const learned = movesUpToLevel(e.species, level, this.unlockedGens)
      const moves = (e.moves?.length ? e.moves : learned).slice(-1)
      const foeMax = maxHpOf({ ...e, evs: e.evs ?? [] })
      const heldItem = e.item && !e.noDrop ? e.item : null
      const caught: PartyMember = {
        species: e.species,
        level,
        moves,
        learned: [...new Set([...(e.moves ?? []), ...learned])],
        exp: expAtLevel(e.species, level),
        nature: e.nature,
        gender: e.gender !== undefined ? e.gender : rollGender(e.species),
        ivs: [...e.ivs],
        evs: [0, 0, 0, 0, 0, 0],
        hp: e.hp,
        status: e.status ?? null,
        abilitySlot: slot,
        hiddenAbility: hidden,
        held: heldItem ? { [heldItem]: 1 } : {},
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
      if (caught.hp != null && (level !== e.level || e.evs)) caught.hp = Math.max(1, Math.round((caught.hp / foeMax) * this.memberMaxHp(caught)))
      if (caught.hp != null && caught.hp >= this.memberMaxHp(caught)) caught.hp = null
      this.recordToDex(caught)
      if (this.party.length < PARTY_MAX) {
        this.keepSlotHeld(() => this.party.push(caught))
        log.push(`${josa(name, '은', '는')} 파티에 들어갔다!`, 'info')
        if (heldItem) {
          const itemName = dexData.value?.items[heldItem]?.ko ?? heldItem
          log.push(`${josa(name, '이', '가')} 지니고 있던 ${josa(itemName, '은', '는')} 가방에 넣었다.`, 'info')
        }
      } else {
        log.push(`파티가 가득 차서 ${name}의 정보는 도감에 기록되었다.`, 'info')
        if (heldItem) {
          const itemName = dexData.value?.items[heldItem]?.ko ?? heldItem
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
      const egg = (m: PartyMember) => stackMult(LUCKY_EGG_MULT, heldN(m, LUCKY_EGG))
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
      const brace = stackMult(2, held[MACHO_BRACE] ?? 0)
      const gain = [...ev].map((v) => Math.floor(v * brace))
      for (const [id, n] of Object.entries(held)) {
        const power = POWER_ITEMS[id]
        if (power != null) gain[power] = (gain[power] ?? 0) + POWER_ITEM_EV * n
      }
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
    /** 낚싯대 구매: 산 낚싯대가 지금 것보다 좋으면 바로 그 낚싯대를 씀 */
    buyRod(id: RodId): boolean {
      const item = rodItem(id)
      if (!item || this.rods.includes(id) || this.money < item.price) return false
      this.money -= item.price
      this.rods.push(id)
      if (!this.rod || ROD_IDS.indexOf(id) > ROD_IDS.indexOf(this.rod)) this.rod = id
      return true
    },
    /** 수상 스테이지에서 쓸 낚싯대 고르기 */
    selectRod(id: RodId) {
      if (this.rods.includes(id)) this.rod = id
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
      sfx('buy')
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
      const perk =
        chain ??
        [...PERKS, ...PARTY_USE_PERKS, BOSS_INTRO_PERK, AUTO_CENTER_PERK, AUTO_DEX_PERK, DEX_ADVANCE_PERK, DEX_REVEAL_PERK, END_HEAL_PERK].find(
          (p) => p.id === id,
        )
      if (!perk || this.perks.includes(id) || this.money < perk.price) return false
      if (!this.perkRequirementsMet(id)) return false
      this.money -= perk.price
      this.perks.push(id)
      if (chain) return true
      if (id === 'bossIntro:skip') {
        this.skipBossIntro = true
        return true
      }
      if (id === AUTO_CENTER_PERK.id) {
        this.autoCenter = true
        return true
      }
      if (id === AUTO_DEX_PERK.id) {
        this.autoDex = true
        this.autoSendToDex()
        return true
      }
      if (id.startsWith('partyUse:')) {
        this.partyUse[id.split(':')[1] as PartyUseKey] = true
        return true
      }
      if (id === DEX_ADVANCE_PERK.id) {
        this.stageMode = 'dex'
        return true
      }
      if (id === 'dex:reveal' || id === END_HEAL_PERK.id) return true
      // 사면 바로 켬
      this.autoUse[id.split(':')[1] as AutoUseKey] = true
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
    /** 이 파티 슬롯의 지닐 수 있는 도구 종류 +1 구매 */
    buyHeldKind(slot: number): boolean {
      const up = this.slotHeldKinds[slot]
      if (up === undefined || heldKindsOf(up) >= HELD_KINDS_MAX) return false
      const price = heldKindPrice(up + 1)
      if (this.money < price) return false
      this.money -= price
      this.slotHeldKinds[slot] = up + 1
      return true
    },
    /** 이 파티 슬롯의 같은 도구를 지닐 수 있는 개수 +1 구매 */
    buyHeldStack(slot: number): boolean {
      const up = this.slotHeldStack[slot]
      if (up === undefined || heldStackOf(up) >= HELD_STACK_MAX) return false
      const price = heldStackPrice(up + 1)
      if (this.money < price) return false
      this.money -= price
      this.slotHeldStack[slot] = up + 1
      return true
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
      log.push(`${enemy.trainer ? `${enemy.trainer.name}의 ` : enemy.boss ? '보스 ' : '야생 '}${josa(name, '은', '는')} 쓰러졌다!`, 'good')
      sfx('faint', turnSfxDelay)
      this.endBattleGimmick()

      // 경험치 · 노력치 (행운의알·학습장치·교정깁스·파워 계열 도구)
      const expGot = this.rewardExp(enemy)

      // 상금 (부적금화·행운의향로를 지니고 싸우면 2배)
      const held = heldOf(member)
      const prizeMult = Object.entries(held).reduce((a, [id, n]) => a * (MONEY_ITEMS.has(id) ? stackMult(2, n) : 1), 1)
      const prize = Math.floor(prizeMoney(enemy.level, !!enemy.boss) * prizeMult)
      this.money += prize
      log.push(`상금으로 ${prize.toLocaleString()}원을 받았다!`)
      log.recordReward(expGot, prize)

      // 지니고 있던 도구 획득 (트레이너의 포켓몬은 제외)
      if (enemy.item && !enemy.trainer && !enemy.noDrop) {
        this.addToBag(enemy.item)
        const itemName = dexData.value?.items[enemy.item]?.ko ?? enemy.item
        log.push(`${josa(name, '은', '는')} ${josa(itemName, '을', '를')} 지니고 있었다! ${josa(itemName, '을', '를')} 손에 넣었다!`, 'good')
      }

      const p = (this.stageProgress[stageId] ??= { seen: [], defeats: 0 })
      if (enemy.trainer) {
        // 리그: 스테이지 진행도는 그대로
      } else if (enemy.boss) p.defeats = 0
      else p.defeats++
      this.countDefeat()
      this.addFriendship(member, enemy.boss ? 3 : 1)

      // 전투 종료 시 특성 (자연회복·재생력). 판정 강화: 그 전에 이로운 턴 종료 효과
      const me = this.playerBattler()
      const foe = this.enemyBattler()
      if (me && foe) {
        const lines = [...(this.perks.includes('judge:endHeal') ? endOfTurnBenefits(me, foe) : []), ...onBattleEnd(me, foe)]
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

      if (enemy.trainer) this.advanceLeague()
      else if (enemy.boss) this.onBossCleared(stageId)
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
      const maxHp = () => this.memberMaxHp(member)
      while (member.level < 100 && member.exp >= expAtLevel(member.species, member.level + 1)) {
        const oldMax = maxHp()
        member.level++
        // 최대 HP 증가분만큼 현재 HP도 증가 (원작과 동일)
        if (member.hp != null) member.hp = Math.max(0, member.hp + (maxHp() - oldMax))
        log.push(`${josa(name, '은', '는')} 레벨 ${ro(String(member.level))} 올랐다!`, 'good')
        sfx('levelUp', turnSfxDelay + 0.3)
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
        delta = Math.ceil(delta * stackMult(1.5, heldN(member, SOOTHE_BELL)))
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
      const maxHp = (species: string) => this.memberMaxHp(member, species)
      const oldMax = maxHp(member.species)
      member.species = to
      if (member.hp != null) member.hp = Math.max(0, member.hp + (maxHp(to) - oldMax))
      log.push(`어라…!? ${before}의 모습이…!`, 'info')
      log.push(`축하합니다! ${josa(before, '은', '는')} ${ro(after)} 진화했다!`, 'good')
      sfx('evolve', turnSfxDelay + 0.8)
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
        sfx('learn', turnSfxDelay + 1.1)
      } else {
        member.moves.push(moveId)
        log.push(`${josa(name, '은', '는')} ${josa(move, '을', '를')} 배웠다!`, 'good')
        sfx('learn', turnSfxDelay + 1.1)
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
      sfx('clear', turnSfxDelay + 0.5)
      if (stageId === AUTO_UNLOCK_STAGE && !this.autoUnlocked) {
        this.autoUnlocked = true
        log.push('자동 전투가 해금되었습니다! 전투 화면 왼쪽 위 스위치로 켤 수 있습니다.', 'good')
      }
      // 전진 모드: 다음 스테이지로 진입 (반복 모드는 현재 스테이지에서 일반 BOSS_DEFEATS 마리 + 보스 반복)
      // 도감 모드: 출현 포켓몬을 모두 잡았으면 전진, 아니면 반복 (출현 정보가 없는 스테이지는 전진)
      //   파도타기·낚싯대가 없어 만날 수 없는 포켓몬은 빼고 판단
      // 수상 스테이지에 들어갈 수 없으면 건너뜀
      const i = found.region.stages.indexOf(found.stage)
      const next = found.region.stages.slice(i + 1).find((st) => st.kind !== 'water' || !!this.stageEncounters(st))
      const dex = this.stageMode === 'dex' && this.dexModeReady
      const advance = this.stageMode === 'advance' || (this.stageMode === 'dex' && (!dex || this.stageDexReachableDone(found.stage) !== false))
      if (!advance) return
      if (dex && this.stageDexDone(found.stage) === false) log.push('파도타기·낚싯대가 없어 만날 수 없는 포켓몬은 건너뜁니다.', 'info')
      // 도감 모드: 같은 지방의 앞 스테이지 중 지금은 더 잡을 수 있는 곳(파도타기·낚싯대를 새로 얻음 등)이 있으면 먼저 거기로,
      //   다 채웠으면 아직 클리어하지 않은 가장 앞 스테이지(진행하던 곳)로 돌아감
      const dexTarget =
        dex &&
        found.region.stages.find(
          (st) =>
            st !== found.stage &&
            this.stageUnlocked(st.id) &&
            (this.stageDexReachableDone(st) === false || !this.clearedStages.includes(st.id)),
        )
      if (dexTarget && dexTarget.id !== next?.id) {
        const back = found.region.stages.indexOf(dexTarget) < i
        log.push(`${dexTarget.id} ${ro(dexTarget.name)} ${back ? '도감을 채우러 돌아갑니다.' : '이동합니다.'}`, 'info')
        this.arrive(dexTarget.id)
        return
      }
      if (next && this.stageUnlocked(next.id)) {
        log.push(`${next.id} ${ro(next.name)} 이동합니다.`, 'info')
        this.arrive(next.id)
        return
      }
      // 지방의 마지막 스테이지까지 끝냄: 리그를 제패했으면 다음 지방으로
      this.advanceRegion(found.region, dex)
    },

    /**
     * 지방을 다 끝냈으면 (모든 스테이지 클리어, 도감 모드면 만날 수 있는 포켓몬도 다 잡음) 다음 지방으로 이동.
     * 리그를 아직 제패하지 않았으면 안내만
     */
    advanceRegion(region: Region, dex: boolean) {
      const done = leagueOf(region) ? this.leagueReady(region) : this.regionCleared(region)
      if (!done) return
      if (dex && !this.regionDexReachableDone(region)) return
      const log = useBattleLogStore()
      const i = REGIONS.findIndex((r) => r.id === region.id)
      const nextRegion = REGIONS.slice(i + 1).find((r) => this.canEnter(r) && regionPlayable(r))
      if (!nextRegion) return
      if (this.regionLocked(nextRegion)) {
        log.push(`${region.title}의 모든 스테이지를 끝냈다! ${ro(nextRegion.name)} 가려면 스테이지 탭에서 다음 지방을 눌러 포켓몬 리그에 도전하자.`, 'info')
        return
      }
      // 아직 클리어하지 않은 가장 앞 스테이지 (모두 클리어했으면 첫 스테이지)
      const stage =
        nextRegion.stages.find((st) => !this.clearedStages.includes(st.id) && this.stageUnlocked(st.id)) ?? nextRegion.stages[0]
      if (!stage) return
      log.push(`${nextRegion.title}의 ${stage.id} ${ro(stage.name)} 이동합니다.`, 'info')
      this.arrive(stage.id)
    },

    // ---------- 포켓몬 리그 ----------
    /** 리그 도전 시작: 리그 장소(챔피언로드)로 바로 가서 사천왕 1번부터. auto = 자동 전투 켜기/끄기 */
    startLeague(regionKey: string, auto?: boolean): boolean {
      const region = REGIONS.find((r) => r.key === regionKey)
      const trainers = region && leagueOf(region)
      const stage = region && leagueStage(region)
      if (!region || !trainers || !stage || this.league || this.faint || !this.party.length || !this.leagueReady(region)) return false
      if (!this.party.some((m) => m.hp !== 0)) return false
      const champion = trainers[trainers.length - 1]!
      this.travel = null
      this.arrive(stage.id)
      this.league = { region: regionKey, trainer: 0, mon: 0, variant: pickVariant(champion, this.party[0]?.species) }
      if (auto !== undefined) this.setAuto(auto)
      const log = useBattleLogStore()
      log.divider()
      log.push(`${region.title} 포켓몬 리그 도전 시작! 사천왕 4명과 챔피언을 연달아 상대한다.`, 'good')
      this.nextEncounterAt = Date.now() + this.searchMs
      return true
    },
    /** 리그 트레이너의 다음 포켓몬을 내보냄 */
    sendLeagueMon() {
      const run = this.league
      const t = this.leagueTrainer
      if (!run || !t) {
        this.league = null
        return
      }
      const team = t.variants[t.champion ? run.variant : 0] ?? t.variants[0]!
      const m = team[run.mon]
      if (!m) return
      this.startBattle(applyDifficulty(makeLeagueMon(t, m, run.mon, team.length), this.difficulty))
    },
    /** 리그 트레이너의 포켓몬을 쓰러뜨린 뒤: 다음 포켓몬 → 다음 트레이너 → 제패 */
    advanceLeague() {
      const run = this.league
      const t = this.leagueTrainer
      if (!run || !t) return
      const log = useBattleLogStore()
      const team = t.variants[t.champion ? run.variant : 0] ?? t.variants[0]!
      run.mon++
      if (run.mon < team.length) return
      log.push(`${trainerLabel(t)}에게 승리했다!`, 'good')
      sfx('clear', turnSfxDelay + 0.5)
      const trainers = leagueOf({ key: run.region })!
      run.trainer++
      run.mon = 0
      const next = trainers[run.trainer]
      if (next) {
        log.push(`다음 상대는 ${trainerLabel(next)}! (${run.trainer + 1}/${trainers.length})`, 'info')
        return
      }
      this.onLeagueWon(run.region)
    },
    /** 리그 제패: 다음 지방 해금. 전진 모드(도감 모드는 도감을 다 채웠으면)면 다음 지방으로 */
    onLeagueWon(regionKey: string) {
      const log = useBattleLogStore()
      const region = REGIONS.find((r) => r.key === regionKey)!
      this.league = null
      const first = !this.leagueCleared.includes(regionKey)
      if (first) this.leagueCleared.push(regionKey)
      log.push(`축하합니다! ${region.title}의 포켓몬 리그를 제패했다!`, 'good')
      const i = REGIONS.findIndex((r) => r.id === region.id)
      const nextRegion = REGIONS.slice(i + 1).find((r) => this.canEnter(r) && regionPlayable(r))
      if (first && nextRegion) log.push(`이제 ${nextRegion.title}에 갈 수 있다!`, 'good')
      const dex = this.stageMode === 'dex' && this.dexModeReady
      if (this.stageMode === 'repeat') return
      if (dex && !this.regionDexReachableDone(region)) {
        // 도감 모드: 아직 잡을 포켓몬이 남은 스테이지로
        const target = region.stages.find((st) => this.stageUnlocked(st.id) && this.stageDexReachableDone(st) === false)
        if (target) {
          log.push(`${target.id} ${ro(target.name)} 도감을 채우러 갑니다.`, 'info')
          this.arrive(target.id)
        }
        return
      }
      this.advanceRegion(region, dex)
    },
    /** 진행 중인 리그 도전을 그만둠 (센터·이동). 이유를 로그에 남김 */
    quitLeague(reason: string) {
      if (!this.league) return
      this.league = null
      if (this.enemy?.trainer) this.enemy = null
      useBattleLogStore().push(reason, 'bad')
    },

    onPlayerFainted() {
      const log = useBattleLogStore()
      const member = this.party[0]!
      const name = speciesOf(member.species)?.ko ?? member.species
      this.endGimmick()
      log.push(`${josa(name, '은', '는')} 쓰러졌다!`, 'bad')
      sfx('playerFaint', turnSfxDelay)
      this.addFriendship(member, -1)
      member.status = null
      member.sleep = undefined
      member.toxic = undefined
      // 자동 사용(기절 회복): 바로 살림 (전투 중이면 싸우던 포켓몬만, 전투 밖이면 기절한 파티 전원)
      if (this.auto && this.autoReviveRun(this.enemy ? 'revive' : 'reviveAfter', !!this.enemy) && member.hp !== 0) {
        this.playerStages = {}
        this.playerVol = {}
        return
      }
      // 싸울 수 있는 파티 포켓몬이 있으면 교체
      const wish = !!this.playerVol?.wish
      const next = this.party.findIndex((m, i) => i > 0 && m.hp !== 0)
      if (next > 0) {
        if (this.enemy) this.setLead(next)
        else this.switchLead(next)
        // 치유소원·초승달춤: 다음에 나온 포켓몬의 HP·상태이상 회복
        const nm = this.party[0]
        if (wish && nm && nm !== member) {
          nm.hp = this.memberMaxHp(nm)
          nm.status = null
          nm.sleep = undefined
          nm.toxic = undefined
          const nn = speciesOf(nm.species)?.ko ?? nm.species
          log.push(`${josa(nn, '은', '는')} 소원을 받아 건강해졌다!`, 'info')
        }
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
      if (this.enemy?.boss && !this.enemy.trainer) this.onBossFailed()
      this.quitLeague('포켓몬센터에 가서 리그 도전 기록이 초기화되었다.')
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
      sfx('heal')
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
      if (mode === 'dex' && !this.perks.includes(DEX_ADVANCE_PERK.id)) return
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
    /** 체력 자동 회복 기준 바꾸기 (목표는 시작 기준 이상으로 맞춤) */
    setAutoHeal(key: AutoHealKey, part: keyof AutoHealRange, value: number) {
      const r = { ...this.autoHeal[key], [part]: value }
      if (r.target < r.start) {
        if (part === 'start') r.target = r.start
        else r.start = r.target
      }
      this.autoHeal = sanitizeAutoHeal({ ...this.autoHeal, [key]: r })
    },
    /** 기절 회복 자동 사용 설정 바꾸기 */
    setAutoRevive(key: AutoReviveKey, cfg: Partial<AutoReviveCfg>) {
      this.autoRevive = sanitizeAutoRevive({ ...this.autoRevive, [key]: { ...this.autoRevive[key], ...cfg } })
    },
    setPartyUse(key: PartyUseKey, on: boolean) {
      if (!this.perks.includes(`partyUse:${key}`)) return
      this.partyUse[key] = on
    },
    setAutoUse(cat: AutoUseKey, on: boolean) {
      if (!this.perks.includes(`autoUse:${cat}`)) return
      this.autoUse[cat] = on
    },
    setAutoBall(rate: number) {
      if (AUTO_BALL_STEPS.includes(rate)) this.autoBall = rate
    },
  },
})

/** 전투 계산에 필요한 데이터가 모두 불러와졌는지 */
/** 체력 자동 회복 기준 보정: 선택지 밖이면 기본값, 목표는 시작 기준 이상 */
/** 기절 회복 자동 사용 설정 보정: 성스러운분·없는 아이템이면 기본값, 기준은 선택지 안 */
function sanitizeAutoRevive(v: unknown): Record<AutoReviveKey, AutoReviveCfg> {
  const src = (v && typeof v === 'object' ? v : {}) as Partial<Record<AutoReviveKey, Partial<AutoReviveCfg>>>
  const fix = (k: AutoReviveKey): AutoReviveCfg => ({
    item: isAutoReviveItem(src[k]?.item ?? '') ? src[k]!.item! : DEFAULT_AUTO_REVIVE[k].item,
    ashAt: AUTO_ASH_STEPS.includes(src[k]?.ashAt as (typeof AUTO_ASH_STEPS)[number]) ? src[k]!.ashAt! : 0,
  })
  return { revive: fix('revive'), reviveAfter: fix('reviveAfter') }
}

function sanitizeAutoHeal(v: unknown): Record<AutoHealKey, AutoHealRange> {
  const ok = (n: unknown): n is number => AUTO_HEAL_STEPS.includes(n as number)
  const src = (v && typeof v === 'object' ? v : {}) as Partial<Record<AutoHealKey, Partial<AutoHealRange>>>
  const fix = (k: AutoHealKey): AutoHealRange => {
    const start = ok(src[k]?.start) ? src[k]!.start! : DEFAULT_AUTO_HEAL[k].start
    const target = ok(src[k]?.target) ? src[k]!.target! : DEFAULT_AUTO_HEAL[k].target
    return { start, target: Math.max(start, target) }
  }
  return { heal: fix('heal'), healAfter: fix('healAfter') }
}

export const battleReady = () => !!(dexData.value && learnsets.value && battleData.value && frontierSets.value)
