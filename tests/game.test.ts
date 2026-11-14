// 게임 스토어: 실제 게임 루프(tick)를 가상 시간으로 돌려 전체 흐름 확인
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadAllData } from './helpers'
import { maxHpOf } from '../src/core/battle'
import { load, save } from '../src/core/save'
import { findStage } from '../src/data/stages'
import { EGG_MOVE_PRICE, eggMoveOptions, PARTY_MAX, stageSpecies, tutorOptions, useGameStore, type PartyMember } from '../src/stores/game'
import { loadLearnMethods } from '../src/data/dex'
import { pickAutoBall, rankAutoBalls } from '../src/data/shop'
import { useBattleLogStore } from '../src/stores/battleLog'
import { REGIONS } from '../src/data/stages'

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

describe('낚싯대', () => {
  // 관동(적·녹) 22번도로 (수상): 파도타기 출현 없음, 낚싯대별 출현표만 있음
  const waterStage = () => REGIONS[0]!.stages.find((s) => s.name === '22번도로 (수상)')!

  test('낚싯대마다 출현표가 다르고, 고른 낚싯대로만 낚임', () => {
    const game = useGameStore()
    game.validate()
    const stage = waterStage()
    expect(game.stageEncounters(stage)).toBeNull()
    expect(game.waterLocked(stage.id)).toBe(true)

    game.money = 100_000
    expect(game.buyRod('old-rod')).toBe(true)
    expect(game.rod).toBe('old-rod')
    expect(game.waterLocked(stage.id)).toBe(false)
    const old = game.stageEncounters(stage)!
    expect('all' in old && old.all.map((e) => e.p)).toEqual(['magikarp'])

    expect(game.buyRod('super-rod')).toBe(true)
    expect(game.rod).toBe('super-rod') // 더 좋은 낚싯대를 사면 바로 씀
    const sup = game.stageEncounters(stage)!
    expect('all' in sup && sup.all.map((e) => e.p)).not.toContain('magikarp')

    // 낮은 낚싯대를 나중에 사도 지금 쓰는 낚싯대는 그대로, 직접 고를 수 있음
    expect(game.buyRod('good-rod')).toBe(true)
    expect(game.rod).toBe('super-rod')
    game.selectRod('old-rod')
    expect(game.rod).toBe('old-rod')
    expect(game.buyRod('old-rod')).toBe(false)
  })

  test('파도타기 + 낚싯대 = 두 출현표를 반반 섞음', () => {
    const game = useGameStore()
    game.validate()
    const stage = REGIONS[0]!.stages.find((s) => s.encounters?.methods?.surf && s.encounters.methods['old-rod'])!
    game.chooseStarter(starter('squirtle', ['surf']))
    const surf = game.stageEncounters(stage)!
    game.money = 1000
    game.buyRod('old-rod')
    const both = game.stageEncounters(stage)!
    const sum = (set: typeof both) => ('all' in set ? set.all : set.day).reduce((a, e) => a + e.rate, 0)
    expect(sum(both)).toBeCloseTo(100, 0)
    const rateOf = (set: typeof both, p: string) => ('all' in set ? set.all : set.day).find((e) => e.p === p)?.rate ?? 0
    const top = ('all' in surf ? surf.all : surf.day)[0]!
    expect(rateOf(both, top.p)).toBeLessThan(top.rate)
    expect(rateOf(both, 'magikarp')).toBeGreaterThan(0)
  })

  test('낚싯대가 한 종류였던 저장 데이터 → 좋은낚싯대', () => {
    const game = useGameStore()
    game.$patch({ rodOwned: true } as never)
    game.validate()
    expect(game.rods).toEqual(['good-rod'])
    expect(game.rod).toBe('good-rod')
    expect((game.$state as unknown as Record<string, unknown>).rodOwned).toBeUndefined()
  })
})

describe('지닌 도구 여러 개', () => {
  test('종류·개수 한도 안에서만 지니고, 강화상점에서 한도를 늘림', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    game.items = { leftovers: 5, 'choice-band': 2 }
    expect(game.giveHeld(0, 'leftovers')).toBe(true)
    expect(game.giveHeld(0, 'leftovers')).toBe(false) // 같은 도구 1개까지
    expect(game.giveHeld(0, 'choice-band')).toBe(false) // 1종류까지
    game.money = 1_000_000
    expect(game.buyHeldKind(0)).toBe(true)
    expect(game.buyHeldStack(0)).toBe(true)
    expect(game.giveHeld(0, 'choice-band')).toBe(true)
    expect(game.giveHeld(0, 'leftovers')).toBe(true)
    expect(game.party[0]!.held).toEqual({ leftovers: 2, 'choice-band': 1 })
    expect(game.items.leftovers).toBe(3)
    game.takeHeld(0, 'leftovers', 1)
    expect(game.party[0]!.held!.leftovers).toBe(1)
    expect(game.items.leftovers).toBe(4)
    game.takeAllHeld(0)
    expect(game.party[0]!.held).toEqual({})
    expect(game.items).toEqual({ leftovers: 5, 'choice-band': 2 })
  })

  test('지닌 도구와 한도는 파티 슬롯에 묶임', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    for (const sp of ['squirtle', 'bulbasaur', 'pidgey', 'rattata', 'caterpie']) game.party.push({ ...starter(sp), held: {}, hp: null })
    game.money = 10_000_000
    expect(game.buyHeldKind(1)).toBe(true)
    expect(game.buyHeldKind(5)).toBe(true)
    expect(game.slotHeldKinds).toEqual([0, 1, 0, 0, 0, 1])
    game.items = { leftovers: 3, 'choice-band': 2 }
    expect(game.giveHeld(0, 'leftovers')).toBe(true)
    expect(game.giveHeld(1, 'choice-band')).toBe(true)
    expect(game.giveHeld(1, 'leftovers')).toBe(true) // 2번 슬롯은 2종류
    // 맨 앞 교체: 도구는 슬롯에 남음
    expect(game.setLead(1)).toBe(true)
    expect(game.party[0]!.species).toBe('squirtle')
    expect(game.party[0]!.held).toEqual({ leftovers: 1 })
    expect(game.party[1]!.held).toEqual({ 'choice-band': 1, leftovers: 1 })
    // 도감으로 보내면 뒤 포켓몬이 앞으로 당겨져 그 슬롯의 도구를 지니고, 빈 슬롯(6번)에 도구가 남음
    expect(game.giveHeld(5, 'leftovers')).toBe(true)
    game.party[2]!.held = { leftovers: 1 }
    game.items.leftovers = 0
    expect(game.sendToDex(2)).toBe(true)
    expect(game.party.map((m) => m.held)).toEqual([{ leftovers: 1 }, { 'choice-band': 1, leftovers: 1 }, { leftovers: 1 }, {}, {}])
    expect(game.slotHeldSpare[5]?.held).toEqual({ leftovers: 1 })
    expect(game.items.leftovers).toBe(0)
    // 새 포켓몬이 들어오면 빈 슬롯의 도구를 지님
    game.recordToDex({ ...starter('bulbasaur') })
    const r = game.dexRecords.bulbasaur!
    expect(
      game.summonFromDex('bulbasaur', {
        nature: r.natures[0]!,
        ability: r.abilities[0]!,
        level: 5,
        friendship: r.friendshipMin,
        ivs: r.ivMin,
        evs: r.evMin,
        moves: [],
      }),
    ).toBe(true)
    expect(game.party[5]!.held).toEqual({ leftovers: 1 })
    expect(game.slotHeldSpare[5]).toBeFalsy()
    // 한도는 들어온 포켓몬과 무관하게 6번 슬롯의 한도 (2종류)
    game.items = { 'choice-band': 2 }
    expect(game.giveHeld(5, 'choice-band')).toBe(true)
    expect(game.giveHeld(5, 'choice-band')).toBe(false)
  })

  test('이전 저장 데이터: 포켓몬별 한도 강화는 가장 높은 값부터 슬롯에, 파티 슬롯 도구는 환불', () => {
    const game = useGameStore()
    game.$patch({
      money: 0,
      party: [
        { ...starter(), heldKinds: 1, held: { leftovers: 2, 'choice-band': 1, 'life-orb': 1 } },
        { ...starter('squirtle'), heldKinds: 5, heldStack: 2, held: {} },
      ],
      dexRecords: { bulbasaur: { heldKinds: 3, heldStack: 1 } },
      perks: ['heldSlot:bind'] as never,
      slotHeldCap: '6x3',
      slotHeldSpare: [null, null, { held: { 'life-orb': 1 } }],
    } as never)
    game.validate()
    expect(game.slotHeldKinds).toEqual([5, 3, 1, 0, 0, 0])
    expect(game.slotHeldStack).toEqual([2, 1, 0, 0, 0, 0])
    expect(game.perks).not.toContain('heldSlot:bind')
    expect(game.money).toBe(1_000_000)
    expect(game.party[0]!.held).toEqual({ leftovers: 2, 'choice-band': 1, 'life-orb': 1 })
    expect('heldKinds' in game.party[1]!).toBe(false)
    expect(game.slotHeldSpare[2]?.held).toEqual({ 'life-orb': 1 })
  })

  test('슬롯 한도를 넘는 도구는 가방으로', () => {
    const game = useGameStore()
    game.$patch({ party: [{ ...starter(), held: { leftovers: 2, 'choice-band': 1 } }] })
    game.validate()
    expect(game.party[0]!.held).toEqual({ leftovers: 1 })
    expect(game.items).toEqual({ leftovers: 1, 'choice-band': 1 })
  })

  test('써서 사라진 도구는 가방에 있는 만큼 다시 지님', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    const m = game.party[0]!
    game.slotHeldStack[0] = 2
    m.held = { 'sitrus-berry': 3 }
    m.heldSpent = { 'sitrus-berry': 2 }
    game.items = { 'sitrus-berry': 1 }
    game.refillHeld()
    expect(m.held).toEqual({ 'sitrus-berry': 2 })
    expect(m.heldSpent).toBeUndefined()
    expect(game.items['sitrus-berry']).toBeUndefined()
  })

  test('이전 저장 데이터(지닌 도구 하나) 변환', () => {
    const game = useGameStore()
    game.$patch({ party: [{ ...starter(), heldItem: 'leftovers', heldSpent: true } as unknown as PartyMember] })
    game.validate()
    expect(game.party[0]!.held).toEqual({ leftovers: 1 })
    expect(game.party[0]!.heldSpent).toEqual({ leftovers: 1 })
    expect('heldItem' in game.party[0]!).toBe(false)
  })
})

describe('상대 PP', () => {
  const wild = (moves: string[]) => ({
    species: 'rattata',
    level: 50,
    nature: 'hardy',
    ivs: [31, 31, 31, 31, 31, 31],
    hp: null,
    moves,
  })

  test('PP 소모가 시작되면 상대도 기술을 쓸 때마다 PP가 줄어듦', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter({ ...starter('snorlax', ['splash']), level: 100 })
    game.clearedStages.push('1-1')
    game.startBattle(wild(['tackle']))
    game.resolveTurn('splash')
    expect(game.enemy?.pp?.tackle).toBe(34)
  })

  test('상대 기술 PP가 모두 0이면 발버둥', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter({ ...starter('snorlax', ['splash']), level: 100 })
    game.clearedStages.push('1-1')
    game.startBattle({ ...wild(['tackle']), pp: { tackle: 0 } })
    game.resolveTurn('splash')
    expect(game.enemy?.pp?.tackle).toBe(0)
    // 발버둥 반동 (최대 HP의 1/4)
    expect(game.enemy!.hp).toBeLessThan(maxHpOf(game.enemyBattler()!))
  })

  test('PP 소모 시작 전에는 상대 PP도 줄지 않음', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter({ ...starter('snorlax', ['splash']), level: 100 })
    game.startBattle(wild(['tackle']))
    game.resolveTurn('splash')
    expect(game.enemy?.pp?.tackle).toBeUndefined()
  })
})

describe('체력 자동 회복 (전투 중·전투 후)', () => {
  test('이전 저장 데이터: 하나였던 기능을 전투 중·후 둘 다로, 기준도 둘 다에', () => {
    const game = useGameStore()
    game.perks = ['autoUse:heal']
    game.autoUse = { heal: true }
    ;(game.$state as unknown as Record<string, unknown>).autoHealAt = 75
    game.validate()
    expect(game.perks).toContain('autoUse:healAfter')
    expect(game.autoUse.healAfter).toBe(true)
    expect(game.autoHeal).toEqual({ heal: { start: 75, target: 100 }, healAfter: { start: 75, target: 100 } })
    expect('autoHealAt' in game.$state).toBe(false)
  })

  test('목표는 시작 기준 아래로 내려가지 않음', () => {
    const game = useGameStore()
    game.setAutoHeal('heal', 'target', 30)
    expect(game.autoHeal.heal).toEqual({ start: 30, target: 30 })
    game.setAutoHeal('heal', 'start', 80)
    expect(game.autoHeal.heal).toEqual({ start: 80, target: 80 })
  })

  test('전투 후: 목표까지 돈이 가장 적게 드는 조합을 사서 한꺼번에 씀', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    const m = game.party[0]!
    const max = maxHpOf({ species: m.species, level: m.level, ivs: m.ivs!, evs: m.evs!, nature: m.nature })
    m.hp = 1
    game.perks.push('autoUse:healAfter')
    game.autoUse.healAfter = true
    game.money = 100000
    expect(game.autoUseItem()).toBe(true)
    expect(m.hp ?? max).toBe(max)
    expect(game.money).toBeLessThan(100000)
  })

  test('전투 후 기능만 있으면 전투 중에는 쓰지 않음 (기능이 꺼진 쪽은 무시)', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    game.party[0]!.hp = 1
    game.items.potion = 5
    game.perks.push('autoUse:heal')
    game.autoUse.heal = true
    // 전투 밖: 전투 후 기능이 없으므로 쓰지 않음
    expect(game.autoUseItem()).toBe(false)
    expect(game.items.potion).toBe(5)
  })
})

describe('자동 사용에 합쳐진 자동 구매', () => {
  test('이전 저장 데이터: 자동 구매 기능은 모두 없애고 산 값을 돌려줌', () => {
    const game = useGameStore()
    const st = game.$state as unknown as Record<string, unknown>
    game.perks.push('autoUse:ball')
    ;(game.perks as string[]).push('autoBuy:heal', 'autoBuy:pp', 'autoBuy:status', 'autoBuy:ball')
    st.autoBuy = { heal: true, status: true, ball: true }
    st.autoBuyItem = { ball: 'great-ball', status: 'full-heal' }
    game.money = 0
    game.validate()
    expect(game.perks).toEqual(['autoUse:ball'])
    expect(game.money).toBe(20000)
    expect(st.autoBuy).toBeUndefined()
    expect(st.autoBuyItem).toBeUndefined()
  })

  const ballOpt = (id: string, mult: number, chance: number, price: number, owned = 0) => ({
    id,
    mult,
    chance,
    price,
    owned,
    buyable: true,
  })
  test('몬스터볼 고르기: 보정 배율이 기준 이상인 볼 중 한 마리 잡는 데 드는 돈이 가장 적은 것', () => {
    const opts = [ballOpt('poke', 1, 0.3, 200), ballOpt('great', 1.5, 0.5, 600), ballOpt('ultra', 2, 0.8, 800)]
    expect(pickAutoBall(opts, 1)).toBe('poke') // 200/0.3 < 600/0.5 < 800/0.8
    expect(pickAutoBall(opts, 1.5)).toBe('ultra') // 800/0.8 = 1000 < 600/0.5 = 1200
    // 가진 볼은 공짜
    expect(pickAutoBall([...opts.slice(0, 2), ballOpt('ultra', 2, 0.8, 800, 1)], 1)).toBe('ultra')
    // 기준에 닿는 볼이 없으면 배율이 가장 높은 것
    expect(pickAutoBall(opts, 3)).toBe('ultra')
    // 포획률이 낮은 상대라도 배율 기준은 만족함
    expect(pickAutoBall([ballOpt('poke', 1, 0.01, 200), ballOpt('great', 1.5, 0.02, 600)], 1.5)).toBe('great')
    // 살 수도 없고 가진 것도 없으면 null
    expect(pickAutoBall([{ ...ballOpt('poke', 1, 0.3, 200), buyable: false }], 1)).toBeNull()
  })

  test('몬스터볼 후보 목록: 기준 이상인 볼만 가성비 순, 없으면 배율 순', () => {
    const opts = [ballOpt('poke', 1, 0.3, 200), ballOpt('great', 1.5, 0.5, 600), ballOpt('ultra', 2, 0.8, 800)]
    expect(rankAutoBalls(opts, 1.5).map((o) => o.id)).toEqual(['ultra', 'great'])
    expect(rankAutoBalls(opts, 3).map((o) => o.id)).toEqual(['ultra', 'great', 'poke'])
  })

  test('몬스터볼: 도감에 없는 야생 포켓몬에게 가진 볼을 먼저, 없으면 사서 던짐', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter({ ...starter('snorlax', ['splash']), level: 100 })
    game.perks.push('autoUse:ball')
    game.autoUse.ball = true
    game.setAutoBall(1)
    game.money = 10000
    const wild = { species: 'rattata', level: 50, nature: 'hardy', ivs: [31, 31, 31, 31, 31, 31], hp: null, moves: ['tackle'] }
    game.items['poke-ball'] = 1
    game.startBattle(wild)
    useBattleLogStore().readyAt = 0
    expect(game.autoUseItem()).toBe(true)
    expect(game.items['poke-ball'] ?? 0).toBe(0)
    expect(game.money).toBe(10000)
    // 가방에 볼이 없으면 가장 가성비 좋은 볼(몬스터볼·프레셔스볼 200원)을 사서 던짐
    // (첫 볼로 잡혔을 수도 있으므로 도감·전투 상태를 되돌림)
    useBattleLogStore().pending = null
    game.enemy = null
    game.caught = []
    game.startBattle(wild)
    useBattleLogStore().readyAt = 0
    expect(game.autoUseItem()).toBe(true)
    expect(game.money).toBe(10000 - 200)
  })

  test('상태이상: 가방에 없으면 고칠 수 있는 것 중 가장 싼 아이템을 사서 씀', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    game.clearedStages.push('1-1')
    const m = game.party[0]!
    m.status = 'psn'
    game.perks.push('autoUse:status')
    game.autoUse.status = true
    game.money = 10000
    expect(game.autoUseItem()).toBe(true)
    expect(m.status).toBeFalsy()
    expect(game.money).toBe(10000 - 100) // 복숭열매
  })

  test('상태이상: 가진 것이 있으면 사지 않고 씀', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    const m = game.party[0]!
    m.status = 'psn'
    game.items['full-heal'] = 1
    game.perks.push('autoUse:status')
    game.autoUse.status = true
    game.money = 10000
    expect(game.autoUseItem()).toBe(true)
    expect(m.status).toBeFalsy()
    expect(game.money).toBe(10000)
    expect(game.items['full-heal'] ?? 0).toBe(0)
  })

  test('PP: 가방에 없으면 가장 싼 아이템을 사서 씀', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    game.clearedStages.push('1-1')
    const m = game.party[0]!
    m.pp = { scratch: 0 }
    game.perks.push('autoUse:pp')
    game.autoUse.pp = true
    game.money = 10000
    expect(game.autoUseItem()).toBe(true)
    expect(game.money).toBe(10000 - 300) // 과사열매
    expect(m.pp.scratch).toBeGreaterThan(0)
  })
})

describe('기절 회복 자동 사용·구매 (전투 중·전투 후)', () => {
  const party3 = (game: ReturnType<typeof useGameStore>) => {
    game.validate()
    game.chooseStarter(starter())
    game.party.push(starter('bulbasaur'), starter('squirtle'))
  }

  test('이전 저장 데이터: 전투 후 기능도 주고, 고른 품목을 살 아이템으로, 자동 구매는 환불', () => {
    const game = useGameStore()
    ;(game.perks as string[]).push('autoUse:revive', 'autoBuy:revive')
    game.autoUse.revive = true
    ;(game.$state as unknown as Record<string, unknown>).autoBuyItem = { revive: 'max-revive' }
    game.money = 0
    game.validate()
    expect(game.perks).toEqual(['autoUse:revive', 'autoUse:reviveAfter'])
    expect(game.autoUse.reviveAfter).toBe(true)
    expect(game.autoRevive.revive.item).toBe('max-revive')
    expect(game.autoRevive.reviveAfter.item).toBe('max-revive')
    expect(game.money).toBe(5000)
  })

  test('새 저장 데이터: 전투 중 기능만 사면 전투 후 기능은 생기지 않음', () => {
    const game = useGameStore()
    game.validate()
    game.perks.push('autoUse:revive', 'autoUse:heal')
    game.validate()
    expect(game.perks).toEqual(['autoUse:revive', 'autoUse:heal'])
  })

  test('살 아이템으로 성스러운분은 고를 수 없음', () => {
    const game = useGameStore()
    game.setAutoRevive('revive', { item: 'sacred-ash' })
    expect(game.autoRevive.revive.item).toBe('revive')
    game.setAutoRevive('revive', { item: 'max-revive' })
    expect(game.autoRevive.revive.item).toBe('max-revive')
  })

  test('전투 후: 기절한 파티 포켓몬마다 가진 것 먼저, 없으면 고른 아이템을 사서', () => {
    const game = useGameStore()
    party3(game)
    game.party[1]!.hp = 0
    game.party[2]!.hp = 0
    game.items['max-revive'] = 1
    game.perks.push('autoUse:reviveAfter')
    game.autoUse.reviveAfter = true
    game.money = 10000
    expect(game.autoUseItem()).toBe(true)
    expect(game.party[1]!.hp).not.toBe(0)
    expect(game.party[2]!.hp).not.toBe(0)
    expect(game.items['max-revive'] ?? 0).toBe(0)
    expect(game.money).toBe(10000 - 2000) // 기절 회복 1개 구매
  })

  test('전투 후: 기절한 수가 기준 이상이면 성스러운분을 사서 모두 살림', () => {
    const game = useGameStore()
    party3(game)
    game.party[1]!.hp = 0
    game.party[2]!.hp = 0
    game.perks.push('autoUse:reviveAfter')
    game.autoUse.reviveAfter = true
    game.setAutoRevive('reviveAfter', { ashAt: 2 })
    game.money = 60000
    expect(game.autoUseItem()).toBe(true)
    expect(game.party.every((m) => m.hp !== 0)).toBe(true)
    expect(game.money).toBe(10000)
  })

  test('기준 미만이면 성스러운분을 쓰지 않음', () => {
    const game = useGameStore()
    party3(game)
    game.party[1]!.hp = 0
    game.items['sacred-ash'] = 1
    game.perks.push('autoUse:reviveAfter')
    game.autoUse.reviveAfter = true
    game.setAutoRevive('reviveAfter', { ashAt: 2 })
    game.money = 10000
    expect(game.autoUseItem()).toBe(true)
    expect(game.items['sacred-ash']).toBe(1)
    expect(game.money).toBe(8000)
  })
})

describe('전투 후 파티 전체 회복·자동 센터 귀환', () => {
  const setup = () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    game.party.push(starter('bulbasaur'), starter('squirtle'))
    game.perks.push('autoUse:healAfter', 'autoUse:status', 'autoUse:pp')
    game.autoUse = { healAfter: true, status: true, pp: true }
    return game
  }

  test('파티 전체 기능은 기본 자동 사용을 산 뒤에만 살 수 있고, 사면 켜짐', () => {
    const game = useGameStore()
    game.validate()
    game.money = 100000
    expect(game.buyPerk('partyUse:status')).toBe(false)
    game.perks.push('autoUse:status')
    expect(game.buyPerk('partyUse:status')).toBe(true)
    expect(game.partyUse.status).toBe(true)
  })

  test('파티 전체 기능이 켜져 있으면 다른 파티 포켓몬의 상태이상도 고침 (기절한 포켓몬 제외)', () => {
    const game = setup()
    game.party[1]!.status = 'psn'
    game.party[2]!.status = 'psn'
    game.party[2]!.hp = 0
    game.money = 10000
    // 파티 전체 기능 없음: 싸우는 포켓몬만
    expect(game.autoUseItem()).toBe(false)
    game.perks.push('partyUse:status')
    game.partyUse.status = true
    expect(game.autoUseItem()).toBe(true)
    expect(game.party[1]!.status).toBeFalsy()
    expect(game.party[2]!.status).toBe('psn')
    expect(game.autoUseItem()).toBe(false)
  })

  test('자동 센터 귀환은 파티 전체 기능 셋을 모두 산 뒤에만 살 수 있음', () => {
    const game = setup()
    game.money = 100000
    game.perks.push('partyUse:healAfter', 'partyUse:status')
    expect(game.buyPerk('autoCenter:cost')).toBe(false)
    game.perks.push('partyUse:pp')
    expect(game.buyPerk('autoCenter:cost')).toBe(true)
    expect(game.autoCenter).toBe(true)
  })

  test('회복 비용: 가진 아이템은 공짜, 파티 전체 기능이 켜진 쪽만 다른 포켓몬까지', () => {
    const game = setup()
    game.party[0]!.status = 'psn'
    game.party[1]!.status = 'psn'
    expect(game.recoverCost()).toBe(100) // 싸우는 포켓몬 복슝열매 1개
    game.items['pecha-berry'] = 1
    expect(game.recoverCost()).toBe(0)
    game.perks.push('partyUse:status')
    game.partyUse.status = true
    expect(game.recoverCost()).toBe(100) // 가진 1개는 싸우는 포켓몬, 1개는 사야 함
  })

  test('회복 비용이 기준 이상이거나 가진 돈보다 많으면 센터로, 아니면 아이템 사용', () => {
    const game = setup()
    game.perks.push('partyUse:healAfter', 'partyUse:status', 'partyUse:pp', 'autoCenter:cost')
    game.partyUse = { healAfter: true, status: true, pp: true }
    game.autoCenter = true
    game.auto = true
    for (const m of game.party) m.status = 'psn'
    game.money = 100000
    game.autoCenterCost = 1000
    expect(game.recoverCost()).toBe(300)
    expect(game.autoCenterForCost()).toBe(false)
    game.money = 200
    expect(game.autoCenterForCost()).toBe(true)
    expect(game.faint).not.toBeNull()
  })

  test('이전 저장 데이터: PP 자동 센터 귀환은 없애고 산 값을 돌려줌', () => {
    const game = useGameStore()
    ;(game.perks as string[]).push('autoCenter:pp')
    game.autoCenter = true
    ;(game.$state as unknown as Record<string, unknown>).autoCenterPriority = 'center'
    game.money = 0
    game.validate()
    expect(game.perks).toEqual([])
    expect(game.money).toBe(5000)
    expect(game.autoCenter).toBe(false)
    expect('autoCenterPriority' in game.$state).toBe(false)
  })
})

describe('도감 자동 보내기', () => {
  test('1번 칸을 뺀 최종 진화체 + 친밀도 최대 포켓몬만 전투 사이에 도감으로 보냄', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter({ ...starter('charizard'), friendship: 255 })
    game.party.push(
      { ...starter('blastoise'), friendship: 255 },
      { ...starter('venusaur'), friendship: 254 },
      { ...starter('charmeleon'), friendship: 255 },
      { ...starter('pikachu'), friendship: 255, held: { leftovers: 1 } },
    )
    game.money = 100000
    expect(game.buyPerk('autoDex:send')).toBe(true)
    expect(game.autoDex).toBe(true)
    // 피카츄는 라이츄로 진화할 수 있으므로 남음, 1번 칸 리자몽도 남음
    expect(game.party.map((m) => m.species)).toEqual(['charizard', 'venusaur', 'charmeleon', 'pikachu'])
    expect(game.dexRecords.blastoise?.friendshipMax).toBe(255)
    game.party[1]!.friendship = 255
    game.autoDex = false
    expect(game.autoSendToDex()).toBe(0)
    game.autoDex = true
    game.enemy = null
    run(game, 200)
    expect(game.party.map((m) => m.species)).toEqual(['charizard', 'charmeleon', 'pikachu'])
  })
})

describe('도감 완성 후 전진', () => {
  test('몬스터볼 자동 사용을 산 뒤에만 살 수 있고, 꺼져 있으면 쓸 수 없음', () => {
    const game = useGameStore()
    game.validate()
    game.money = 100000
    expect(game.buyPerk('stageMode:dex')).toBe(false)
    game.perks.push('autoUse:ball')
    expect(game.buyPerk('stageMode:dex')).toBe(true)
    expect(game.dexModeReady).toBe(false)
    game.autoUse.ball = true
    expect(game.dexModeReady).toBe(true)
  })

  test('파도타기·낚싯대가 없어 못 만나는 포켓몬은 도감 모드 판정에서 뺌', () => {
    const game = useGameStore()
    game.validate()
    const stage = REGIONS[0]!.stages.find((s) => s.encounters?.methods?.surf && s.encounters.methods['old-rod'])!
    game.chooseStarter(starter('squirtle', ['surf']))
    const surfOnly = stageSpecies(game.stageEncounters(stage)!)
    game.caught = [...surfOnly]
    expect(game.stageDexDone(stage)).toBe(false)
    expect(game.stageDexReachableDone(stage)).toBe(true)
    game.money = 1000
    game.buyRod('old-rod')
    expect(game.stageDexReachableDone(stage)).toBe(false)
  })

  test('도감 모드: 가진 낚싯대 전부로 판정하고, 고른 낚싯대로 더 잡을 게 없으면 다른 낚싯대로 바꿈', () => {
    const game = useGameStore()
    game.validate()
    const methodsOf = (s: (typeof REGIONS)[number]['stages'][number]) => s.encounters?.methods
    const only = (s: (typeof REGIONS)[number]['stages'][number]) => {
      const old = stageSpecies(methodsOf(s)!['old-rod'] as never)
      const sup = stageSpecies(methodsOf(s)!['super-rod'] as never)
      return old.filter((p) => !sup.includes(p))
    }
    const stage = REGIONS.flatMap((r) => r.stages).find((s) => methodsOf(s)?.['old-rod'] && methodsOf(s)?.['super-rod'] && only(s).length)!
    game.chooseStarter(starter())
    game.perks.push('autoUse:ball', 'stageMode:dex')
    game.autoUse.ball = true
    game.stageMode = 'dex'
    game.money = 100000
    game.buyRod('old-rod')
    game.buyRod('super-rod')
    expect(game.rod).toBe('super-rod')
    game.caught = stageSpecies(methodsOf(stage)!['super-rod'] as never)
    expect(game.stageDexReachableDone(stage)).toBe(false) // 낡은낚싯대로만 나오는 포켓몬이 남음
    game.dexPickRod(stage)
    expect(game.rod).toBe('old-rod')
    game.caught.push(...only(stage))
    expect(game.stageDexReachableDone(stage)).toBe(true)
  })

  test('도감 모드: 앞 스테이지에 지금 잡을 수 있는 포켓몬이 남았으면 돌아가고, 다 채우면 진행하던 곳으로', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    game.perks.push('autoUse:ball', 'stageMode:dex')
    game.autoUse.ball = true
    game.stageMode = 'dex'
    const land = REGIONS[0]!.stages.filter((s) => s.kind === 'land' && s.encounters)
    const all = (s: (typeof land)[number]) => game.uncaughtWith(s, ['surf', 'old-rod', 'good-rod', 'super-rod'])
    // 근처(앞 스테이지 ~ 3칸 뒤) 다른 스테이지에는 안 나오는 포켓몬이 있는 스테이지
    const stages = REGIONS[0]!.stages
    const onlyIn = (s: (typeof land)[number]) => {
      const j = stages.indexOf(s)
      const others = [...stages.slice(0, j), ...stages.slice(j + 1, j + 4)].flatMap(all)
      return all(s).find((p) => !others.includes(p))
    }
    const early = land.find((s) => onlyIn(s))!
    const i = stages.indexOf(early)
    const cur = stages[i + 2]!
    const frontier = stages[i + 3]!
    const missing = onlyIn(early)!
    game.caught = [...new Set(stages.slice(0, i + 3).flatMap(all))].filter((p) => p !== missing)
    game.clearedStages = stages.slice(0, i + 2).map((s) => s.id)
    game.currentStageId = cur.id
    game.onBossCleared(cur.id)
    expect(game.currentStageId).toBe(early.id)
    game.caught.push(missing)
    game.onBossCleared(early.id)
    expect(game.currentStageId).toBe(frontier.id)
  })
})

describe('알 기술·기술가르침', () => {
  beforeAll(loadLearnMethods)

  test('알 기술: 부모를 잡은 적 있어야 하고, 확률 = 암컷 비율 × 부모 수컷 비율', () => {
    const game = useGameStore()
    game.validate()
    game.party = [starter('cinderace', ['tackle'])]
    const hjk = () => eggMoveOptions('cinderace', (id) => game.ownsSpecies(id)).find((o) => o.move === 'high-jump-kick')!
    expect(hjk().parents.some((p) => p.species === 'hitmonlee')).toBe(true)
    expect(hjk().best).toBeNull()
    expect(game.tryEggMove(0, 'high-jump-kick')).toBeNull()
    game.caught.push('hitmonlee')
    // 에이스번 암컷 1/8 × 시라소몬 수컷 100%
    expect(hjk().chance).toBeCloseTo(1 / 8)
    game.money = EGG_MOVE_PRICE
    vi.spyOn(Math, 'random').mockReturnValue(0.05)
    expect(game.tryEggMove(0, 'high-jump-kick', 'tackle')).toBe('success')
    vi.restoreAllMocks()
    expect(game.money).toBe(0)
    expect(game.party[0]!.moves).toContain('high-jump-kick')
  })

  test('알 기술 실패해도 돈은 사라짐', () => {
    const game = useGameStore()
    game.validate()
    game.party = [starter('cinderace', ['tackle'])]
    game.caught.push('hitmonlee')
    game.money = EGG_MOVE_PRICE
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    expect(game.tryEggMove(0, 'high-jump-kick', 'tackle')).toBe('fail')
    vi.restoreAllMocks()
    expect(game.money).toBe(0)
    expect(game.party[0]!.moves).not.toContain('high-jump-kick')
  })

  test('기술가르침: 그 작품 지방의 도시 너머 스테이지에 도착해야 함, 비용 소모', () => {
    const game = useGameStore()
    game.validate()
    game.party = [starter('charizard', ['scratch'])]
    const opt = tutorOptions('charizard').find((o) => o.move === 'blast-burn')!
    const src = opt.sources.find((s) => s.region === 'sinnoh-dp')!
    expect(game.learnByTutor(0, 'blast-burn', src)).toBe(false)
    const region = REGIONS.find((r) => r.key === 'sinnoh-dp')!
    const gate = region.stages.find((s) => s.name === src.gate)!
    game.unlockedRegions.push(region.id)
    game.clearedStages.push(gate.id)
    expect(game.learnByTutor(0, 'blast-burn', src, 'scratch')).toBe(true)
    expect(game.party[0]!.moves).toContain('blast-burn')
  })

  test('기술가르침: BP 부족하면 배울 수 없음', () => {
    const game = useGameStore()
    game.validate()
    game.party = [starter('pikachu', ['thunder-shock'])]
    const src = tutorOptions('pikachu').flatMap((o) => o.sources.map((s) => ({ move: o.move, s }))).find((x) => x.s.cost.bp)!
    const region = REGIONS.find((r) => r.key === src.s.region)!
    game.unlockedRegions.push(region.id)
    game.clearedStages.push(region.stages.find((s) => s.name === src.s.gate)!.id)
    expect(game.learnByTutor(0, src.move, src.s)).toBe(false)
    game.bp = src.s.cost.bp!
    expect(game.learnByTutor(0, src.move, src.s, 'thunder-shock')).toBe(true)
    expect(game.bp).toBe(0)
  })
})

describe('포켓몬 리그', () => {
  const kanto = () => REGIONS[0]!
  const johto = () => REGIONS[1]!
  /** 리그 트레이너 포켓몬을 바로 쓰러뜨림 */
  function beatMon(game: ReturnType<typeof useGameStore>) {
    game.enemy!.hp = 0
    game.onEnemyFainted()
  }

  test('앞 지방 리그를 제패해야 다음 지방에 들어갈 수 있고, 이미 가 본 지방은 열려 있음', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    expect(game.regionLocked(kanto())).toBe(false)
    expect(game.regionLocked(johto())).toBe(true)
    game.moveTo(johto().stages[0]!.id)
    expect(game.travel).toBeNull()
    expect(game.currentStageId).toBe('1-1')
    game.leagueCleared.push(kanto().key)
    expect(game.regionLocked(johto())).toBe(false)
    // 리그 조건이 생기기 전에 가 본 지방
    game.leagueCleared = []
    game.unlockedRegions.push(REGIONS[2]!.id)
    expect(game.regionLocked(REGIONS[2]!)).toBe(false)
  })

  test('모든 스테이지를 클리어해야 도전 가능, 사천왕 4명 + 챔피언 연전 후 제패하면 다음 지방으로 이동', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter('mewtwo', ['psychic']))
    game.party[0]!.level = 100
    expect(game.startLeague(kanto().key)).toBe(false)
    game.clearedStages = kanto().stages.map((s) => s.id)
    expect(game.leagueReady(kanto())).toBe(true)
    expect(game.startLeague(kanto().key, false)).toBe(true)
    expect(game.league).toMatchObject({ region: kanto().key, trainer: 0, mon: 0 })
    run(game, 5000)
    expect(game.enemy?.trainer?.name).toBe('칸나')
    expect(game.enemy?.boss).toBe(true)
    // 트레이너 포켓몬은 잡을 수 없음
    game.items['master-ball'] = 1
    expect(game.throwBall('master-ball')).toBe(false)
    let guard = 0
    while (game.league && guard++ < 40) {
      if (!game.enemy) game.sendLeagueMon()
      beatMon(game)
    }
    expect(game.league).toBeNull()
    expect(game.leagueCleared).toContain(kanto().key)
    expect(findStage(game.currentStageId)?.region.id).toBe(johto().id)
  })

  test('센터에 가면(패배·회복 버튼) 도전 기록이 초기화됨', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    game.clearedStages = kanto().stages.map((s) => s.id)
    game.startLeague(kanto().key)
    game.sendLeagueMon()
    beatMon(game)
    expect(game.league?.mon).toBe(1)
    game.retreat()
    expect(game.league).toBeNull()
    expect(game.leagueCleared).toEqual([])
  })

  test('마지막 스테이지를 클리어하면: 리그 제패 전엔 머물고, 제패 후엔 다음 지방으로 (도감 모드는 도감을 다 채운 뒤)', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    const stages = kanto().stages
    const last = stages[stages.length - 1]!
    game.clearedStages = stages.map((s) => s.id)
    game.currentStageId = last.id
    game.onBossCleared(last.id)
    expect(game.currentStageId).toBe(last.id)
    game.leagueCleared.push(kanto().key)
    game.onBossCleared(last.id)
    expect(findStage(game.currentStageId)?.region.id).toBe(johto().id)

    // 도감 모드: 못 잡은 포켓몬이 있으면 다음 지방으로 가지 않음
    game.perks.push('autoUse:ball', 'stageMode:dex')
    game.autoUse.ball = true
    game.stageMode = 'dex'
    game.currentStageId = last.id
    game.caught = stageSpecies(game.stageEncounters(last)!)
    game.onBossCleared(last.id)
    expect(findStage(game.currentStageId)?.region.id).toBe(kanto().id)
  })

  test('저장 데이터의 잘못된 리그 진행은 정리', () => {
    const game = useGameStore()
    game.league = { region: 'nowhere', trainer: 0, mon: 0, variant: 0 }
    game.validate()
    expect(game.league).toBeNull()
    expect(game.leagueCleared).toEqual([])
  })
})

describe('포켓몬 리그 (화면 값)', () => {
  test('반응형 프록시로 넘어온 지방도 제패해야 할 리그를 찾음', async () => {
    const { reactive } = await import('vue')
    const { requiredLeagueRegion } = await import('../src/data/league')
    expect(requiredLeagueRegion(reactive(REGIONS[1]!) as never)?.key).toBe(REGIONS[0]!.key)
  })
})

describe('난이도별 진행', () => {
  test('난이도마다 진행도가 따로이고, 다시 돌아오면 이어서 진행', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    expect(game.difficulty).toBe('easy')
    game.clearedStages.push('1-1', '1-2')
    game.currentStageId = '1-3'
    expect(game.setDifficulty('hard')).toBe(true)
    expect(game.currentStageId).toBe('1-1')
    expect(game.clearedStages).toEqual([])
    // PP 소모·특수 기능 등 계정 기능은 어느 난이도에서 열었든 공용
    expect(game.ppActive).toBe(true)
    // 파티·도감은 공용
    expect(game.party).toHaveLength(1)
    game.setDifficulty('easy')
    expect(game.currentStageId).toBe('1-3')
    expect(game.clearedStages).toEqual(['1-1', '1-2'])
    expect(Object.keys(game.diffProgress)).toEqual(['hard'])
  })

  test('난이도 분리 전 저장 데이터: 진행도는 쉬움으로', () => {
    const game = useGameStore()
    game.$patch({ difficulty: 'hard', clearedStages: ['1-1'], currentStageId: '1-2' } as never)
    game.validate()
    expect(game.difficulty).toBe('easy')
    expect(game.clearedStages).toEqual(['1-1'])
    expect(game.currentStageId).toBe('1-2')
    expect(game.diffSplit).toBe(true)
  })

  test('어려움: 레벨 +100, 노력치 504, 얻을 수 없는 도구 / 잡으면 레벨 100에 도구 없음', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter('mewtwo', ['psychic']))
    game.setDifficulty('hard')
    game.spawn()
    const e = game.enemy!
    expect(e.level).toBeGreaterThan(100)
    expect(e.evs).toEqual([504, 504, 504, 504, 504, 504])
    expect(e.item).toBeTruthy()
    expect(e.noDrop).toBe(true)
    game.onEnemyCaught('poke-ball')
    const caught = game.party[1]!
    expect(caught.level).toBe(100)
    expect(caught.held).toEqual({})
    expect(caught.evs).toEqual([0, 0, 0, 0, 0, 0])
  })

  test('보통: 레벨 +50, 노력치 252', () => {
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter())
    game.setDifficulty('normal')
    game.spawn()
    expect(game.enemy!.level).toBeGreaterThan(50)
    expect(game.enemy!.evs).toEqual([252, 252, 252, 252, 252, 252])
  })

  test('세대 도감을 모두 잡으면 실능치 +10%씩', async () => {
    const { dexData } = await import('../src/data/dex')
    const game = useGameStore()
    game.validate()
    game.chooseStarter(starter('bulbasaur'))
    const base = game.memberMaxHp(game.party[0]!)
    game.caught = dexData.value!.index.filter((p) => p.gen <= 2).map((p) => p.id)
    expect(game.completedGens).toEqual([1, 2])
    expect(game.dexBoost).toBe(0.2)
    expect(game.memberMaxHp(game.party[0]!)).toBe(Math.floor(base * 1.2))
    expect(game.playerBattler()!.boost).toBe(0.2)
  })
})
