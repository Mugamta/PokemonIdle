import { defineStore } from 'pinia'
import {
  chooseMove,
  cureStatus,
  expAtLevel,
  expGain,
  maxHpOf,
  movesLearnedAt,
  movesUpToLevel,
  runTurn,
  josa,
  ro,
  speciesOf,
  wildMoveset,
  type Battler,
  type TurnResult,
  type Difficulty,
  DIFFICULTY_EXP,
  type Stages,
} from '../core/battle'
import { phaseAt } from '../core/dayNight'
import { battleData, STATUS_LABELS, type Status } from '../data/battle'
import { dexData, learnsets } from '../data/dex'
import { encountersAt, type EncounterSet } from '../data/encounters'
import { HOME_TOWNS, nearestTown } from '../data/mapGraph'
import { NATURES } from '../data/natures'
import type { SpriteDefault } from '../data/sprites'
import {
  AUTO_HEAL_THRESHOLDS,
  DEFAULT_AUTO_BUY,
  extraSlotPrice,
  PERKS,
  prizeMoney,
  SHOP_ITEMS,
  shopItem,
  type ItemCategory,
  type PerkId,
  type ShopItem,
} from '../data/shop'
import { findStage, REGIONS, type Region, type Stage } from '../data/stages'
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
/** 2·3·4번째 기술칸 해금에 필요한, 그 포켓몬이 직접 쓰러뜨린 수 */
export const SLOT_DEFEATS = [10, 30, 50]
/** 상점에서 추가로 열 수 있는 기술칸 수 (기본 4칸을 모두 연 포켓몬만) */
export const EXTRA_SLOTS = MAX_MOVE_SLOTS - 1 - SLOT_DEFEATS.length

/** 격파 수로 열린 기본 기술칸 수 (1~4) */
export const baseSlotsOf = (m: Pick<PartyMember, 'defeats'>) =>
  1 + SLOT_DEFEATS.filter((n) => (m.defeats ?? 0) >= n).length
/** 사용 가능한 기술칸 수 (1~8) */
export function slotsOf(m: Pick<PartyMember, 'defeats' | 'extraSlots'>): number {
  const base = baseSlotsOf(m)
  return base === 1 + SLOT_DEFEATS.length ? Math.min(MAX_MOVE_SLOTS, base + (m.extraSlots ?? 0)) : base
}

/** 이 스테이지를 클리어한 뒤부터 PP가 소모됨 */
export const PP_START_STAGE = '1-1'

/** 기술의 최대 PP (null = 제한 없음) */
export const maxPpOf = (moveId: string): number | null => dexData.value?.movesById[moveId]?.pp ?? null
/** 남은 PP (null = 제한 없음) */
export function ppOf(m: Pick<PartyMember, 'pp'>, moveId: string): number | null {
  const max = maxPpOf(moveId)
  return max == null ? null : Math.max(0, Math.min(max, m.pp?.[moveId] ?? max))
}

/** 보스 클리어 후 동작 */
export type StageMode = 'advance' | 'repeat'

/** 보스 등장 연출 시간 */
export const BOSS_INTRO_MS = 2400
/** 연출 대기 (ms) */
const TURN_MS = 1200
const NEXT_ENCOUNTER_MS = 1500

export interface PartyMember {
  /** 포켓몬 id (PokeAPI identifier) */
  species: string
  level: number
  /** 장착한 기술 identifier (기술 슬롯 수까지) */
  moves: string[]
  /** 배운 기술 전체 (장착하지 않은 기술 포함) */
  learned?: string[]
  /** 누적 경험치. 없으면 현재 레벨의 시작값 */
  exp?: number
  /** 성격 id (예: 'adamant') */
  nature: string
  /** 개체값 hp, atk, def, spa, spd, spe (0~31) */
  ivs: number[]
  /** 노력치 hp, atk, def, spa, spd, spe (0~252, 합계 510) */
  evs: number[]
  /** 현재 HP. null/없음 = 최대 HP */
  hp?: number | null
  /** 이 포켓몬이 직접 쓰러뜨린 수 (기술칸 해금 조건) */
  defeats?: number
  /** 상점에서 연 추가 기술칸 수 (0~EXTRA_SLOTS) */
  extraSlots?: number
  /** 기술별 남은 PP. 없으면 최대 PP */
  pp?: Record<string, number>
  /** 상태이상 (전투가 끝나도 유지, 포켓몬센터·아이템으로 회복) */
  status?: Status | null
  /** 잠듦: 남은 턴 수 */
  sleep?: number
  /** 맹독: 이번 전투에서 지난 턴 수 */
  toxic?: number
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

/** 현재 스테이지·시간대의 출현표에서 출현율 가중치로 한 마리 뽑기 */
function rollWild(stage: Stage): WildPokemon | null {
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
    boss: true,
  }
}

export const useGameStore = defineStore('game', {
  state: () => ({
    playTimeMs: 0,
    /** 현재 위치한 스테이지 id */
    currentStageId: '1-1',
    /** 이동 중일 때 목적지와 도착 시각 */
    travel: null as { to: string; arriveAt: number } | null,
    party: [] as PartyMember[],
    /** 전투 중인 상대 (이동 중이거나 출현 정보가 없으면 null) */
    enemy: null as WildPokemon | null,
    /** 내 포켓몬의 능력 랭크 (전투마다 초기화) */
    playerStages: {} as Stages,
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
    /** 돈 */
    money: 0,
    /** 보유 아이템 {identifier: 개수} */
    items: {} as Record<string, number>,
    /** 구매한 편의성 기능 */
    perks: [] as PerkId[],
    /** 분류별 아이템 자동 사용 (편의성 기능 구매 필요) */
    autoUse: {} as Partial<Record<ItemCategory, boolean>>,
    /** 분류별 아이템 자동 구매 (편의성 기능 구매 필요) */
    autoBuy: {} as Partial<Record<ItemCategory, boolean>>,
    /** 분류별 자동 구매 품목 */
    autoBuyItem: { ...DEFAULT_AUTO_BUY } as Record<ItemCategory, string>,
    /** 체력 자동 사용 기준 (최대 HP 대비 %) */
    autoHealAt: 50 as (typeof AUTO_HEAL_THRESHOLDS)[number],
    /** 현재 전투에서 지난 턴 수 (0 = 아직 기술을 쓰지 않음, 아이템 사용 시 턴 소모 판단) */
    battleTurns: 0,
    /** 자동 전투 */
    autoUnlocked: false,
    auto: false,
    /** 보스 클리어 후 동작: advance = 다음 스테이지로 이동, repeat = 현재 스테이지에서 일반 10마리 + 보스 반복 */
    stageMode: 'advance' as StageMode,
    /** 설정: 보스 등장 연출 생략 */
    skipBossIntro: false,
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

      const log = useBattleLogStore()
      this.autoBuyItems()
      if (!this.enemy) {
        // 전투 사이: 턴 소모 없이 아이템 자동 사용
        if (this.auto && this.autoUseItem()) return
        if (now < this.nextEncounterAt) return
        // 일반 포켓몬을 BOSS_DEFEATS 마리 쓰러뜨리면 다음 조우는 반드시 보스
        if (this.bossReady(this.currentStageId)) this.challengeBoss()
        else this.spawn()
        return
      }
      // 자동 전투: 연출이 끝나면 다음 턴
      if (this.auto && !log.isBusy()) {
        if (this.autoUseItem()) return
        const me = this.playerBattler()
        const foe = this.enemyBattler()
        if (!me || !foe) return
        me.moves = this.usableMoves()
        this.takeTurn(chooseMove(me, foe, 'normal'))
      }
    },

    /** 불러온 저장 데이터 보정 */
    validate() {
      if (!findStage(this.currentStageId)) this.currentStageId = '1-1'
      if (this.travel && !findStage(this.travel.to)) this.travel = null
      // 이전 저장 데이터 호환: 아이템별 자동사용 설정 시절의 값 정리
      const st = this.$state as unknown as Record<string, unknown>
      delete st.autoUseUnlocked
      // 이전 저장 데이터 호환: 보스 자동 도전 설정 시절의 값 정리
      for (const k of ['autoBoss', 'autoBossSuspended', 'bossFailStreak', 'bossFailLimit']) delete st[k]
      for (const k of Object.keys(this.autoUse)) if (!(k in DEFAULT_AUTO_BUY)) delete (this.autoUse as Record<string, unknown>)[k]
      if (!Array.isArray(this.perks)) this.perks = []
      this.autoBuyItem = { ...DEFAULT_AUTO_BUY, ...this.autoBuyItem }
      if (!Number.isFinite(this.money)) this.money = 0
      if (this.enemy && !this.enemy.species) this.enemy = null
      if (!this.autoUnlocked) this.auto = false
      if (this.stageMode !== 'repeat') this.stageMode = 'advance'
      for (const m of this.party) {
        m.learned ??= [...m.moves]
        if (m.moves.length > slotsOf(m)) m.moves = m.moves.slice(0, slotsOf(m))
      }
    },

    /**
     * 현재 레벨까지 배울 수 있었던 레벨업 기술을 배운 기술 목록에 채움
     * (스타팅 이전 레벨의 기술, 새 지방 해금으로 생긴 세대 한정 기술). 장착은 바꾸지 않음
     */
    backfillLearned() {
      if (!battleReady()) return
      for (const m of this.party) {
        const learned = (m.learned ??= [...m.moves])
        for (const id of movesUpToLevel(m.species, m.level, this.unlockedGens)) if (!learned.includes(id)) learned.push(id)
      }
    },

    /** 스타팅 포켓몬 결정 (파티가 비어 있을 때만) */
    chooseStarter(member: PartyMember) {
      if (this.party.length) return
      this.party.push({ ...member, learned: [...member.moves] })
      this.backfillLearned()
      if (!this.caught.includes(member.species)) this.caught.push(member.species)
    },

    moveTo(stageId: string) {
      const target = findStage(stageId)
      if (!target || !this.canEnter(target.region) || !this.stageUnlocked(stageId) || this.faint) return
      if (stageId === this.currentStageId) {
        this.travel = null
        return
      }
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
      this.enemy = null
      this.nextEncounterAt = 0
      const region = findStage(stageId)?.region
      if (region && !this.unlockedRegions.includes(region.id)) {
        this.unlockedRegions.push(region.id)
        this.backfillLearned()
      }
    },
    cancelTravel() {
      this.travel = null
    },

    // ---------- 전투 ----------
    playerBattler(): Battler | null {
      const m = this.party[0]
      if (!m) return null
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
      }
      b.hp = m.hp ?? maxHpOf(b)
      return b
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
      }
      b.hp = e.hp ?? maxHpOf(b)
      return b
    },

    /** 새 상대 등장 (공통 처리) */
    startBattle(enemy: WildPokemon) {
      const log = useBattleLogStore()
      this.enemy = enemy
      this.playerStages = {}
      this.battleTurns = 0
      // 맹독 턴 수는 전투마다 초기화
      if (this.party[0]?.toxic) this.party[0].toxic = 0
      const p = (this.stageProgress[this.currentStageId] ??= { seen: [], defeats: 0 })
      if (!enemy.boss && !p.seen.includes(enemy.species)) p.seen.push(enemy.species)
      const name = speciesOf(enemy.species)?.ko ?? enemy.species
      log.divider()
      log.push(enemy.boss ? `보스 ${josa(name, '이', '가')} 승부를 걸어왔다!` : `앗! 야생 ${josa(name, '이', '가')} 튀어나왔다!`, 'info')
      // 보스는 등장 연출(BattleScene)이 끝날 때까지 대기
      log.wait(enemy.boss && !this.skipBossIntro ? BOSS_INTRO_MS : 800)
    },
    spawn() {
      const stage = findStage(this.currentStageId)?.stage
      const enemy = stage && rollWild(stage)
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
      if (!this.ppActive) return m.moves
      return m.moves.filter((id) => (ppOf(m, id) ?? 1) > 0)
    },

    /** 한 턴 진행 (수동: 기술 버튼 / 자동: tick) */
    takeTurn(moveId: string) {
      const log = useBattleLogStore()
      if (log.isBusy() || this.faint || !battleReady()) return
      const member = this.party[0]
      if (!member) return
      const usable = this.usableMoves()
      // 발버둥은 쓸 수 있는 기술이 없을 때만
      if (moveId === 'struggle' ? usable.length > 0 : !usable.includes(moveId)) return
      this.resolveTurn(moveId)
    },

    /** 턴 계산 후 상태 반영. playerMove = null 이면 내 쪽은 행동하지 않음 (아이템 사용) */
    resolveTurn(playerMove: string | null) {
      const log = useBattleLogStore()
      const member = this.party[0]
      const me = this.playerBattler()
      const foe = this.enemyBattler()
      if (!member || !me || !foe || me.hp <= 0) return

      const enemyMove = chooseMove(foe, me, this.difficulty)
      const result: TurnResult = runTurn(me, foe, playerMove, enemyMove)
      for (const line of result.lines) log.push(line)
      this.battleTurns++

      // PP 소모 (실제로 기술을 썼을 때만)
      if (playerMove && result.playerMoved && this.ppActive) {
        const left = ppOf(member, playerMove)
        if (left != null) (member.pp ??= {})[playerMove] = Math.max(0, left - 1)
      }

      member.hp = me.hp
      member.status = me.status ?? null
      member.sleep = me.sleep
      member.toxic = me.toxic
      this.playerStages = me.stages
      const e = this.enemy!
      e.hp = foe.hp
      e.stages = foe.stages
      e.status = foe.status ?? null
      e.sleep = foe.sleep
      e.toxic = foe.toxic
      log.wait(TURN_MS)

      if (foe.hp <= 0) this.onEnemyFainted()
      else if (me.hp <= 0) this.onPlayerFainted()
    },

    // ---------- 아이템 ----------
    /**
     * 아이템 사용 (전투 중인 포켓몬 = 파티 첫 번째).
     * 전투 중 첫 기술을 쓴 뒤에는 한 턴을 소모하고, 그 전이나 전투 밖에서는 턴을 소모하지 않음.
     * 사용했으면 true
     */
    useItem(itemId: string): boolean {
      const log = useBattleLogStore()
      const def = shopItem(itemId)
      const member = this.party[0]
      if (!def || !member || (this.items[itemId] ?? 0) <= 0 || this.faint || !battleReady()) return false
      const consumesTurn = !!this.enemy && this.battleTurns > 0
      if (consumesTurn && log.isBusy()) return false
      const effect = this.itemEffect(def)
      if (!effect) return false

      this.items[itemId]! -= 1
      if (!this.items[itemId]) delete this.items[itemId]
      const itemName = dexData.value?.items[itemId]?.ko ?? itemId
      log.push(`${josa(itemName, '을', '를')} 사용했다! ${effect()}`, 'info')
      if (consumesTurn) this.resolveTurn(null)
      return true
    },

    /** 아이템 효과. 쓸모가 없으면 null, 있으면 적용 함수 (결과 문구 반환) */
    itemEffect(def: ShopItem): (() => string) | null {
      const m = this.party[0]
      const me = this.playerBattler()
      if (!m || !me) return null
      const name = speciesOf(m.species)?.ko ?? m.species
      const max = maxHpOf(me)
      const curable = !!m.status && !!def.cures?.includes(m.status)
      const healable = def.hp != null && me.hp < max
      if (def.hp != null || def.cures) {
        if (!healable && !curable) return null
        return () => {
          const parts: string[] = []
          if (healable) {
            const after = def.hp === 'full' ? max : Math.min(max, me.hp + def.hp!)
            parts.push(`${name}의 체력이 ${after - me.hp} 회복되었다!`)
            m.hp = after >= max ? null : after
          }
          if (curable) {
            parts.push(`${name}의 ${STATUS_LABELS[m.status!]} 상태가 나았다!`)
            cureStatus(m)
          }
          return parts.join(' ')
        }
      }
      if (def.pp) {
        const { amount, target } = def.pp
        const missing = m.moves
          .map((id) => ({ id, left: ppOf(m, id), max: maxPpOf(id) }))
          .filter((x): x is { id: string; left: number; max: number } => x.left != null && x.max != null && x.left < x.max)
        if (!missing.length) return null
        // 하나만 회복: 남은 PP 비율이 가장 낮은 기술
        const targets = target === 'all' ? missing : [missing.reduce((a, b) => (b.left / b.max < a.left / a.max ? b : a))]
        return () => {
          const pp = (m.pp ??= {})
          for (const t of targets) pp[t.id] = amount === 'full' ? t.max : Math.min(t.max, t.left + amount)
          const moveName = (id: string) => dexData.value?.movesById[id]?.ko ?? id
          return target === 'all' ? `${name}의 기술 PP가 회복되었다!` : `${moveName(targets[0]!.id)}의 PP가 회복되었다!`
        }
      }
      return null
    },

    /** 아이템 자동 사용 (편의성 기능). 사용했으면 true */
    autoUseItem(): boolean {
      const m = this.party[0]
      const me = this.playerBattler()
      if (!m || !me || this.faint) return false
      const owned = (cat: ItemCategory) =>
        SHOP_ITEMS.filter((i) => i.category === cat && (this.items[i.id] ?? 0) > 0 && this.itemEffect(i))
      const on = (cat: ItemCategory) => this.perks.includes(`autoUse:${cat}`) && !!this.autoUse[cat]

      // 1. 체력: 기준 아래면, 부족한 만큼을 채우는 가장 싼 아이템 (없으면 가장 많이 회복하는 아이템)
      const max = maxHpOf(me)
      if (on('heal') && (me.hp / max) * 100 < this.autoHealAt) {
        const list = owned('heal')
        const need = max - me.hp
        const enough = list.find((i) => i.hp === 'full' || (i.hp ?? 0) >= need)
        const pick = enough ?? list[list.length - 1]
        if (pick && this.useItem(pick.id)) return true
      }
      // 2. 상태이상: 고칠 수 있는 가장 싼 아이템
      if (on('status') && m.status) {
        const pick = owned('status')[0]
        if (pick && this.useItem(pick.id)) return true
      }
      // 3. PP: PP가 0인 기술이 있으면. 2개 이상이면 전체 회복 아이템 우선
      if (on('pp') && this.ppActive) {
        const empty = m.moves.filter((id) => ppOf(m, id) === 0).length
        if (empty) {
          const list = owned('pp')
          const prefer = empty >= 2 ? 'all' : 'one'
          const pick = list.find((i) => i.pp?.target === prefer) ?? list[0]
          if (pick && this.useItem(pick.id)) return true
        }
      }
      return false
    },

    /** 아이템 자동 구매 (편의성 기능): 고른 아이템이 떨어지면 1개 */
    autoBuyItems() {
      for (const cat of Object.keys(DEFAULT_AUTO_BUY) as ItemCategory[]) {
        if (!this.perks.includes(`autoBuy:${cat}`) || !this.autoBuy[cat]) continue
        const id = this.autoBuyItem[cat]
        if (!(this.items[id] ?? 0)) this.buyItem(id, 1)
      }
    },

    // ---------- 상점 ----------
    buyItem(itemId: string, count = 1): boolean {
      const def = shopItem(itemId)
      if (!def || count < 1 || this.money < def.price * count) return false
      this.money -= def.price * count
      this.items[itemId] = (this.items[itemId] ?? 0) + count
      return true
    },
    buyPerk(id: PerkId): boolean {
      const perk = PERKS.find((p) => p.id === id)
      if (!perk || this.perks.includes(id) || this.money < perk.price) return false
      this.money -= perk.price
      this.perks.push(id)
      // 사면 바로 켬
      const [kind, cat] = id.split(':') as ['autoUse' | 'autoBuy', ItemCategory]
      this[kind][cat] = true
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
      log.push(`${enemy.boss ? '보스 ' : '야생 '}${josa(name, '은', '는')} 쓰러졌다!`, 'good')

      // 경험치 · 노력치
      const gained = expGain(enemy.species, enemy.level, member.level, !!enemy.boss, DIFFICULTY_EXP[this.difficulty])
      this.gainExp(member, gained)
      const ev = battleData.value?.species[enemy.species]?.ev
      if (ev) {
        const evs = (member.evs ??= [0, 0, 0, 0, 0, 0])
        ev.forEach((v, i) => {
          const room = Math.min(252 - evs[i]!, 510 - evs.reduce((a, b) => a + b, 0))
          evs[i] = evs[i]! + Math.max(0, Math.min(v, room))
        })
      }

      // 상금
      const prize = prizeMoney(enemy.level, !!enemy.boss)
      this.money += prize
      log.push(`상금으로 ${prize.toLocaleString()}원을 받았다!`)

      const p = (this.stageProgress[stageId] ??= { seen: [], defeats: 0 })
      if (enemy.boss) p.defeats = 0
      else p.defeats++
      this.countDefeat(member)

      this.enemy = null
      this.nextEncounterAt = Date.now() + NEXT_ENCOUNTER_MS

      if (enemy.boss) this.onBossCleared(stageId)
    },

    /** 포켓몬별 격파 수 증가 → 기술칸 해금 */
    countDefeat(member: PartyMember) {
      const before = slotsOf(member)
      member.defeats = (member.defeats ?? 0) + 1
      if (slotsOf(member) > before) this.onSlotOpened(member)
    },

    /** 기술칸이 늘었을 때: 알림 + 장착하지 않은 기술 중 가장 최근에 배운 기술을 자동 장착 */
    onSlotOpened(member: PartyMember) {
      const log = useBattleLogStore()
      const name = speciesOf(member.species)?.ko ?? member.species
      log.push(`${name}의 기술칸이 ${slotsOf(member)}칸으로 늘었다!`, 'good')
      const spare = (member.learned ?? []).filter((id) => !member.moves.includes(id))
      const pick = spare[spare.length - 1]
      if (pick && member.moves.length < slotsOf(member)) {
        member.moves.push(pick)
        const move = dexData.value?.movesById[pick]?.ko ?? pick
        log.push(`${josa(move, '을', '를')} 새 칸에 장착했다.`, 'info')
      }
    },

    /** 상점용: 기본 4칸을 모두 연 포켓몬의 기술칸 추가 열림. 성공 여부 반환 */
    unlockExtraSlot(memberIndex: number): boolean {
      const m = this.party[memberIndex]
      if (!m || baseSlotsOf(m) < 1 + SLOT_DEFEATS.length || (m.extraSlots ?? 0) >= EXTRA_SLOTS) return false
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
      while (member.level < 100 && member.exp >= expAtLevel(member.species, member.level + 1)) {
        const before = this.playerBattler()
        const oldMax = before ? maxHpOf(before) : 0
        member.level++
        // 최대 HP 증가분만큼 현재 HP도 증가 (원작과 동일)
        if (member.hp != null) {
          const after = this.playerBattler()
          if (after) member.hp = Math.max(0, member.hp + (maxHpOf(after) - oldMax))
        }
        log.push(`${josa(name, '은', '는')} 레벨 ${ro(String(member.level))} 올랐다!`, 'good')
        for (const id of movesLearnedAt(member.species, member.level, this.unlockedGens)) this.learnMove(member, id)
      }
    },

    learnMove(member: PartyMember, moveId: string) {
      const log = useBattleLogStore()
      const learned = (member.learned ??= [...member.moves])
      if (learned.includes(moveId)) return
      learned.push(moveId)
      const name = speciesOf(member.species)?.ko ?? member.species
      const move = dexData.value?.movesById[moveId]?.ko ?? moveId
      if (member.moves.length < slotsOf(member)) {
        member.moves.push(moveId)
        log.push(`${josa(name, '은', '는')} ${josa(move, '을', '를')} 배웠다!`, 'good')
      } else {
        log.push(`${josa(name, '은', '는')} ${josa(move, '을', '를')} 배웠다! (기술 탭에서 장착 가능)`, 'good')
      }
    },

    /** 기술 장착/해제 (기술 탭) */
    equipMove(memberIndex: number, moveId: string) {
      const m = this.party[memberIndex]
      if (!m || !(m.learned ?? m.moves).includes(moveId) || m.moves.includes(moveId)) return
      if (m.moves.length < slotsOf(m)) {
        m.moves.push(moveId)
      }
    },
    unequipMove(memberIndex: number, moveId: string) {
      const m = this.party[memberIndex]
      if (!m || m.moves.length <= 1) return
      m.moves = m.moves.filter((x) => x !== moveId)
    },
    replaceMove(memberIndex: number, oldId: string, newId: string) {
      const m = this.party[memberIndex]
      if (!m || !(m.learned ?? []).includes(newId) || m.moves.includes(newId)) return
      const i = m.moves.indexOf(oldId)
      if (i >= 0) m.moves[i] = newId
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
      log.push(`${josa(name, '은', '는')} 쓰러졌다!`, 'bad')
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
      this.enemy = null
      this.travel = null
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
    setAutoUse(cat: ItemCategory, on: boolean) {
      if (!this.perks.includes(`autoUse:${cat}`)) return
      this.autoUse[cat] = on
    },
    setAutoBuy(cat: ItemCategory, on: boolean) {
      if (!this.perks.includes(`autoBuy:${cat}`)) return
      this.autoBuy[cat] = on
    },
    setAutoBuyItem(cat: ItemCategory, itemId: string) {
      if (shopItem(itemId)?.category === cat) this.autoBuyItem[cat] = itemId
    },
  },
})

/** 전투 계산에 필요한 데이터가 모두 불러와졌는지 */
export const battleReady = () => !!(dexData.value && learnsets.value && battleData.value)
