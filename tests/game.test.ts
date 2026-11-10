// 게임 스토어: 실제 게임 루프(tick)를 가상 시간으로 돌려 전체 흐름 확인
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadAllData } from './helpers'
import { load, save } from '../src/core/save'
import { findStage } from '../src/data/stages'
import { PARTY_MAX, useGameStore, type PartyMember } from '../src/stores/game'

beforeAll(loadAllData)

let now = Date.UTC(2026, 0, 1)
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
})
afterEach(() => vi.useRealTimers())

const starter = (species = 'charmander', moves = ['scratch']): PartyMember => ({
  species,
  level: 5,
  nature: 'hardy',
  ivs: [31, 31, 31, 31, 31, 31],
  evs: [0, 0, 0, 0, 0, 0],
  moves,
})

/** 가상 시간을 ms 만큼 진행하며 100ms 마다 tick (App.vue 의 게임 루프와 같음) */
function run(game: ReturnType<typeof useGameStore>, ms: number, step = 100) {
  for (let t = 0; t < ms; t += step) {
    now += step
    vi.setSystemTime(now)
    game.tick(step)
  }
}

/** 상태 전체에서 NaN·Infinity 찾기 */
function badNumbers(v: unknown, path = 'state', out: string[] = []): string[] {
  if (typeof v === 'number' && !Number.isFinite(v) && v !== Infinity) out.push(`${path} = ${v}`)
  else if (typeof v === 'number' && Number.isNaN(v)) out.push(`${path} = NaN`)
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) badNumbers(x, `${path}.${k}`, out)
  return out
}

describe('스타팅', () => {
  test('스타팅 포켓몬 선택: 파티·포획·도감 기록', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    expect(game.party).toHaveLength(1)
    expect(game.caught).toContain('charmander')
    expect(game.dexRecords.charmander).toBeDefined()
    expect(game.party[0]!.learned).toContain('scratch')
  })

  test('파티가 있으면 다시 고를 수 없음', () => {
    const game = useGameStore()
    game.chooseStarter(starter())
    game.chooseStarter(starter('squirtle', ['tackle']))
    expect(game.party.map((m) => m.species)).toEqual(['charmander'])
  })
})

describe('게임 루프 시뮬레이션', () => {
  test('자동 전투 30분: 야생 포켓몬을 쓰러뜨리고 경험치·돈이 늘어남', () => {
    vi.spyOn(console, 'error')
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    game.autoUnlocked = true
    game.setAuto(true)

    run(game, 30 * 60_000)

    expect(console.error).not.toHaveBeenCalled()
    expect(game.totalDefeats).toBeGreaterThan(0)
    expect(game.party[0]!.level).toBeGreaterThan(5)
    expect(game.money).toBeGreaterThan(0)
    expect(game.seen.length).toBeGreaterThan(0)
    expect(game.playTimeMs).toBe(30 * 60_000)
    expect(findStage(game.currentStageId)).not.toBeNull()
    expect(badNumbers(game.$state)).toEqual([])
    for (const m of game.party) {
      expect(m.hp == null || (m.hp >= 0 && Number.isInteger(m.hp))).toBe(true)
      expect(m.moves.length).toBeGreaterThan(0)
      expect(m.moves.length).toBeLessThanOrEqual(game.slotsOf(m))
    }
    vi.restoreAllMocks()
  })

  test('데이터가 아직 없으면 전투가 진행되지 않음 (파티 없음)', () => {
    const game = useGameStore()
    game.validate()
    run(game, 60_000)
    expect(game.enemy).toBeNull()
    expect(game.totalDefeats).toBe(0)
  })
})

describe('저장 데이터', () => {
  test('저장 → 새 세션에서 불러오기 → 같은 상태', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    game.autoUnlocked = true
    game.setAuto(true)
    run(game, 5 * 60_000)
    // 불러올 때 적용되는 보정(빈 값 채우기 등)을 원본에도 적용해 비교
    game.validate()
    save(game.$state)
    const before = JSON.parse(JSON.stringify(game.$state))

    setActivePinia(createPinia())
    const loaded = useGameStore()
    const data = load<typeof loaded.$state>()!
    loaded.$patch(data.state)
    loaded.validate(data.state.stageOrder ?? 1)
    expect(loaded.party).toEqual(before.party)
    expect(loaded.money).toBe(before.money)
    expect(loaded.totalDefeats).toBe(before.totalDefeats)
    expect(loaded.currentStageId).toBe(before.currentStageId)
  })

  test('잘못된 값이 들어간 저장 데이터를 보정', () => {
    const game = useGameStore()
    game.$patch({
      currentStageId: '999-999',
      money: NaN,
      auto: true,
      autoUnlocked: false,
      evBreaks: -3,
      totalDefeats: -1,
      party: Array.from({ length: PARTY_MAX + 2 }, () => starter('pidgey', ['tackle'])),
    })
    game.validate()
    expect(findStage(game.currentStageId)).not.toBeNull()
    expect(game.money).toBe(0)
    expect(game.auto).toBe(false)
    expect(game.evBreaks).toBe(0)
    expect(game.totalDefeats).toBe(0)
    expect(game.party.length).toBeLessThanOrEqual(PARTY_MAX)
  })

  test('지방을 작품별로 나누기 전(stageOrder 1) 저장 데이터 변환', () => {
    const game = useGameStore()
    game.$patch({ currentStageId: '1-3', clearedStages: ['1-1', '1-2'], unlockedRegions: [1, 2] })
    game.validate(1)
    expect(findStage(game.currentStageId)).not.toBeNull()
    for (const id of game.clearedStages) expect(findStage(id)).not.toBeNull()
    expect(game.unlockedRegions).toContain(1)
  })
})

describe('상점', () => {
  test('돈이 있으면 구매, 없으면 실패', () => {
    const game = useGameStore()
    game.validate()
    game.money = 250
    expect(game.buyItem('potion')).toBe(true)
    expect(game.items.potion).toBe(1)
    expect(game.money).toBe(50)
    expect(game.buyItem('potion')).toBe(false)
    expect(game.money).toBe(50)
  })
})
