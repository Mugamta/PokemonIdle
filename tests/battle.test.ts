// 전투 계산 (core/battle.ts)
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { battler, loadAllData } from './helpers'
import {
  chooseMove,
  damageOf,
  endOfTurnBenefits,
  expAtLevel,
  expectedDamage,
  expGain,
  maxHpOf,
  moveData,
  movesUpToLevel,
  runTurn,
  setWeather,
  speedOf,
  stackMult,
  surelyKo,
  typeEffect,
  wildMoveset,
  type Battler,
} from '../src/core/battle'
import { maxMove, zMove } from '../src/core/gimmicks'

beforeAll(loadAllData)

const full = (b: Battler) => ((b.hp = maxHpOf(b)), b)
const mv = (id: string) => {
  const m = moveData(id)
  if (!m) throw new Error(`기술 없음: ${id}`)
  return m
}

describe('타입 상성', () => {
  test.each([
    ['water', 'charmander', 2],
    ['fire', 'squirtle', 0.5],
    ['normal', 'gastly', 0],
    ['electric', 'diglett', 0],
    ['grass', 'charizard', 0.25],
    ['ice', 'dragonite', 4],
    ['fighting', 'pikachu', 1],
  ] as const)('%s → %s = %s배', (type, species, mult) => {
    expect(typeEffect(type, battler(species, 50, []))).toBe(mult)
  })

  test('테라스탈하면 테라스탈 타입으로 판정', () => {
    expect(typeEffect('water', battler('charmander', 50, [], { tera: 'grass' }))).toBe(0.5)
  })
})

describe('데미지 공식', () => {
  // Lv50 피카츄 10만볼트 → Lv50 꼬부기 (개체값 31, 노력치 0, 무보정)
  // 특공 70, 특방 84: ⌊⌊22×90×70/84⌋/50⌋+2 = 35 → 자속 1.5 → 52 → 효과 굉장 2배 → 104
  const att = () => full(battler('pikachu', 50, ['thunderbolt']))
  const def = () => full(battler('squirtle', 50, ['tackle']))

  test('손계산 값과 일치 (난수 최대)', () => {
    expect(damageOf(att(), def(), mv('thunderbolt'), 100, false)).toBe(104)
  })

  test('난수 85~100 범위, 급소는 더 큼', () => {
    const lo = damageOf(att(), def(), mv('thunderbolt'), 85, false)
    const hi = damageOf(att(), def(), mv('thunderbolt'), 100, false)
    expect(lo).toBeLessThan(hi)
    expect(lo).toBeGreaterThanOrEqual(Math.floor(hi * 0.85) - 2)
    expect(damageOf(att(), def(), mv('thunderbolt'), 100, true)).toBeGreaterThan(hi)
  })

  test('무효 타입은 0', () => {
    expect(damageOf(att(), full(battler('diglett', 50, [])), mv('thunderbolt'), 100, false)).toBe(0)
  })

  test('특성: 부유는 땅 기술 무효, 틀깨기면 맞음', () => {
    const eq = mv('earthquake')
    const levitate = full(battler('bronzong', 50, [], { ability: 'levitate' }))
    const plain = full(battler('rhydon', 50, ['earthquake']))
    const breaker = full(battler('rhydon', 50, ['earthquake'], { ability: 'mold-breaker' }))
    expect(expectedDamage(plain, levitate, eq)).toBe(0)
    expect(expectedDamage(breaker, levitate, eq)).toBeGreaterThan(0)
  })

  test('능력 랭크 +2 면 데미지 약 2배', () => {
    const base = damageOf(att(), def(), mv('thunderbolt'), 100, false)
    const boosted = damageOf({ ...att(), stages: { spa: 2 } }, def(), mv('thunderbolt'), 100, false)
    expect(boosted / base).toBeGreaterThan(1.8)
    expect(boosted / base).toBeLessThan(2.2)
  })

  test('고정 데미지 기술 (지구던지기 = 레벨)', () => {
    expect(damageOf(full(battler('machop', 37, [])), def(), mv('seismic-toss'), 100, false)).toBe(37)
  })
})

describe('스피드', () => {
  test('마비면 절반, 구애스카프면 1.5배', () => {
    const b = full(battler('jolteon', 50, []))
    const s = speedOf(b)
    expect(speedOf({ ...b, status: 'par' })).toBe(Math.floor(s * 0.5))
    expect(speedOf({ ...b, held: { 'choice-scarf': 1 } })).toBe(Math.floor(s * 1.5))
  })
})

describe('지닌 도구 여러 개', () => {
  const att = () => full(battler('machamp', 50, ['cross-chop']))
  const def = () => full(battler('snorlax', 50, ['splash']))

  test('같은 도구 배율은 합연산, 1보다 작은 배율은 나누는 값을 합연산', () => {
    expect(stackMult(1.5, 1)).toBe(1.5)
    expect(stackMult(1.5, 2)).toBe(2)
    expect(stackMult(1.3, 2)).toBeCloseTo(1.6)
    expect(stackMult(0.5, 2)).toBeCloseTo(1 / 3)
    expect(stackMult(2, 0)).toBe(1)
  })

  test('구애스카프 2개 = 스피드 2배', () => {
    const b = full(battler('jolteon', 50, []))
    expect(speedOf({ ...b, held: { 'choice-scarf': 2 } })).toBe(Math.floor(speedOf(b) * 2))
  })

  test('구애머리띠 2개는 2배, 다른 도구(생명의구슬)와는 곱연산', () => {
    const m = mv('cross-chop')
    const base = damageOf(att(), def(), m, 100, false)
    const band2 = damageOf({ ...att(), held: { 'choice-band': 2 } }, def(), m, 100, false)
    const band1orb1 = damageOf({ ...att(), held: { 'choice-band': 1, 'life-orb': 1 } }, def(), m, 100, false)
    expect(band2 / base).toBeGreaterThan(1.9)
    expect(band2 / base).toBeLessThan(2.1)
    expect(band1orb1 / base).toBeGreaterThan(1.5 * 1.3 - 0.1)
    expect(band1orb1 / base).toBeLessThan(1.5 * 1.3 + 0.1)
  })

  test('소모형 도구는 개수만큼 발동 (기합의띠 2개)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      const me = full(battler('mewtwo', 100, ['psychic']))
      const foe = full(battler('caterpie', 5, ['tackle']))
      foe.held = { 'focus-sash': 2 }
      runTurn(me, foe, 'psychic', 'tackle')
      expect(foe.hp).toBe(1)
      expect(foe.held['focus-sash']).toBe(1)
      foe.hp = maxHpOf(foe)
      runTurn(me, foe, 'psychic', 'tackle')
      expect(foe.hp).toBe(1)
      expect(foe.held['focus-sash']).toBeUndefined()
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('AI 기술 선택', () => {
  test('strong: 효과가 굉장한 기술을 고름', () => {
    const me = full(battler('pikachu', 50, ['thunder-shock', 'quick-attack', 'thunderbolt', 'growl']))
    const foe = full(battler('gyarados', 50, ['tackle']))
    for (let i = 0; i < 20; i++) expect(chooseMove(me, foe, 'strong')).toBe('thunderbolt')
  })

  test('smart: 상대 특성(부유)을 고려해 땅 기술을 피함', () => {
    const me = full(battler('rhydon', 50, ['earthquake', 'rock-slide']))
    const foe = full(battler('bronzong', 50, [], { ability: 'levitate', intel: { cands: ['levitate'], known: true } }))
    for (let i = 0; i < 20; i++) expect(chooseMove(me, foe, 'smart')).toBe('rock-slide')
  })

  test('기술이 없으면 발버둥', () => {
    expect(chooseMove(full(battler('pikachu', 50, [])), full(battler('squirtle', 50, [])), 'strong')).toBe('struggle')
  })

  describe('확정 1타 기술 고르기 (AI 개선 3·4)', () => {
    const moves = ['thunder', 'psychic', 'drain-punch', 'close-combat']
    const me = () => full(battler('mewtwo', 100, moves))
    const foe = (o: Partial<Battler> = {}) =>
      full(battler('rattata', 5, [], { ability: 'run-away', intel: { cands: ['run-away'], known: true }, ...o }))

    test('surelyKo: 최소 난수로도 쓰러뜨리면 확정, 옹골참·기합의띠(HP 가득)면 아님', () => {
      expect(surelyKo(me(), foe(), mv('psychic'))).toBe(true)
      expect(surelyKo(me(), foe({ ability: 'sturdy' }), mv('psychic'))).toBe(false)
      expect(surelyKo(me(), foe({ held: { 'focus-sash': 1 } }), mv('psychic'))).toBe(false)
      expect(surelyKo(full(battler('rattata', 5, [])), full(battler('snorlax', 100, [])), mv('tackle'))).toBe(false)
    })

    test('effect: 명중률 높은 것 중 이로운 부가 효과(흡수) 우선, 반동·능력 하락은 뒤로', () => {
      for (let i = 0; i < 20; i++) expect(chooseMove(me(), foe(), 'smart', undefined, { koPick: 'effect' })).toBe('drain-punch')
    })

    test('pp: 명중률이 같으면 남은 PP가 많은 기술 우선', () => {
      const pp: Record<string, number> = { thunder: 10, psychic: 9, 'drain-punch': 2, 'close-combat': 5 }
      for (let i = 0; i < 20; i++)
        expect(chooseMove(me(), foe(), 'smart', undefined, { koPick: 'pp', ppLeft: (id) => pp[id]! })).toBe('psychic')
    })

    test('확정 1타 기술이 없으면 원래대로 가장 강한 기술', () => {
      const tough = full(battler('blissey', 100, [], { ability: 'natural-cure', intel: { cands: ['natural-cure'], known: true } }))
      expect(chooseMove(me(), tough, 'smart', undefined, { koPick: 'effect' })).toBe(chooseMove(me(), tough, 'smart'))
    })
  })

  test('random: 항상 가진 기술 중 하나', () => {
    const moves = ['tackle', 'growl', 'ember']
    const me = full(battler('charmander', 10, moves))
    for (let i = 0; i < 30; i++) expect(moves).toContain(chooseMove(me, full(battler('pidgey', 10, [])), 'random'))
  })
})

describe('턴 진행', () => {
  test('빠른 쪽이 먼저 공격하고, 쓰러지면 상대는 행동하지 않음', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      const fast = full(battler('mewtwo', 100, ['psychic']))
      const slow = full(battler('caterpie', 2, ['tackle']))
      const r = runTurn(fast, slow, 'psychic', 'tackle')
      expect(slow.hp).toBe(0)
      expect(fast.hp).toBe(maxHpOf(fast))
      expect(r.playerMoved).toBe(true)
      expect(r.lines.length).toBeGreaterThan(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  test('playerMove = null 이면 내 쪽은 행동하지 않음', () => {
    const me = full(battler('pikachu', 30, ['thunderbolt']))
    const foe = full(battler('rattata', 30, ['tackle']))
    const foeHp = foe.hp
    const r = runTurn(me, foe, null, 'tackle')
    expect(r.playerMoved).toBe(false)
    expect(foe.hp).toBe(foeHp)
  })

  test('무작위 대전 200회: HP 범위 유지, 오류 없이 끝남', () => {
    const roster: [string, string[]][] = [
      ['charizard', ['flamethrower', 'air-slash', 'dragon-claw', 'earthquake']],
      ['blastoise', ['surf', 'ice-beam', 'bite', 'protect']],
      ['venusaur', ['giga-drain', 'sludge-bomb', 'sleep-powder', 'leech-seed']],
      ['gengar', ['shadow-ball', 'hypnosis', 'thunderbolt', 'will-o-wisp']],
      ['snorlax', ['body-slam', 'rest', 'yawn', 'curse']],
      ['ferrothorn', ['gyro-ball', 'leech-seed', 'protect', 'thunder-wave']],
    ]
    for (let n = 0; n < 200; n++) {
      const [a, am] = roster[n % roster.length]!
      const [b, bm] = roster[(n * 7 + 3) % roster.length]!
      const p = full(battler(a, 50, am, { name: '나' }))
      const e = full(battler(b, 50, bm, { name: '적' }))
      for (let turn = 0; turn < 100 && p.hp > 0 && e.hp > 0; turn++) {
        runTurn(p, e, chooseMove(p, e, 'smart'), chooseMove(e, p, 'random'))
        for (const x of [p, e]) {
          expect(Number.isInteger(x.hp), `${a} vs ${b}`).toBe(true)
          expect(x.hp).toBeGreaterThanOrEqual(0)
          expect(x.hp).toBeLessThanOrEqual(maxHpOf(x))
        }
      }
    }
  })
})

describe('특수 기능', () => {
  test('Z기술: 위력 상승, 반드시 맞음', () => {
    const z = zMove(mv('thunderbolt'))
    expect(z.power).toBe(175)
    expect(z.acc).toBeNull()
  })
  test('다이맥스 기술: 같은 타입, 위력 상승', () => {
    const m = maxMove(mv('flamethrower'))
    expect(m.type).toBe('fire')
    expect(m.power).toBe(130)
  })
  test('다이맥스하면 최대 HP 2배', () => {
    const b = battler('snorlax', 50, [])
    expect(maxHpOf({ ...b, dynamax: true })).toBe(maxHpOf(b) * 2)
  })
})

describe('기술 배치·경험치', () => {
  test('야생 기술: 최대 4개, 실제 존재하는 기술', () => {
    const moves = wildMoveset('pidgey', 20, 'firered-leafgreen')
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.length).toBeLessThanOrEqual(4)
    for (const id of moves) expect(moveData(id)).not.toBeNull()
  })

  test('원작 기술표가 없는 게임: 그 세대에서만 배우는 레벨업 기술도 반영', () => {
    expect(wildMoveset('sentret', 2, 'gold-silver')).toContain('tackle')
    expect(wildMoveset('beldum', 50, 'ruby-sapphire')).toEqual(['take-down'])
    expect(wildMoveset('beedrill', 10, 'gold-silver')).toContain('fury-attack')
  })

  test('그 레벨까지 배운 기술이 없으면 가장 일찍 배우는 공격 기술', () => {
    expect(wildMoveset('pidgey', 2, 'red-blue')).toEqual(['gust'])
  })

  test('레벨업 기술 목록은 레벨이 오를수록 늘어남', () => {
    const lo = movesUpToLevel('charmander', 10, [1])
    const hi = movesUpToLevel('charmander', 40, [1])
    expect(hi.length).toBeGreaterThan(lo.length)
    for (const id of lo) expect(hi).toContain(id)
  })

  test('누적 경험치는 레벨에 따라 증가, Lv100에서 끝', () => {
    for (const sp of ['pidgey', 'charmander', 'magikarp', 'dragonite']) {
      let prev = -1
      for (let lv = 1; lv <= 100; lv++) {
        const e = expAtLevel(sp, lv)
        expect(e, `${sp} Lv${lv}`).toBeGreaterThan(prev)
        prev = e
      }
      expect(expAtLevel(sp, 101)).toBe(expAtLevel(sp, 100))
    }
  })

  test('경험치 획득: 양수, 트레이너 1.5배, 배율 반영', () => {
    const wild = expGain('pidgey', 10, 10, false)
    expect(wild).toBeGreaterThan(0)
    expect(expGain('pidgey', 10, 10, true)).toBeGreaterThan(wild)
    expect(expGain('pidgey', 10, 10, false, 2)).toBeGreaterThan(wild)
    // 상대 레벨이 내 레벨보다 낮을수록 적게
    expect(expGain('pidgey', 10, 50, false)).toBeLessThan(wild)
  })
})

describe('스타팅 전용기 부가 효과', () => {
  // 상대는 맞아도 쓰러지지 않게 고레벨, 내 쪽이 먼저 행동하도록 기술은 'splash'
  const tank = (species = 'snorlax') => full(battler(species, 100, ['splash']))

  test('플레어송: 자신의 특수공격 +1', () => {
    const me = full(battler('skeledirge', 50, ['torch-song']))
    runTurn(me, tank(), 'torch-song', 'splash')
    expect(me.stages.spa).toBe(1)
  })

  test('아쿠아스텝: 자신의 스피드 +1, 접촉 기술', () => {
    const me = full(battler('quaquaval', 50, ['aqua-step']))
    runTurn(me, tank(), 'aqua-step', 'splash')
    expect(me.stages.spe).toBe(1)
    expect(mv('aqua-step').extra.fl).toContain('contact')
  })

  test('트릭플라워: 반드시 급소', () => {
    for (let i = 0; i < 20; i++) {
      const r = runTurn(full(battler('meowscarada', 50, ['flower-trick'])), tank(), 'flower-trick', 'splash')
      expect(r.lines.some((l) => l.includes('급소'))).toBe(true)
    }
  })

  test('그림자꿰매기: 상대가 묶임, 고스트 타입은 안 묶임', () => {
    // 고스트 기술이라 노말 타입(잠만보)에는 안 맞음 → 망나뇽으로
    const foe = tank('dragonite')
    runTurn(full(battler('decidueye', 50, ['spirit-shackle'])), foe, 'spirit-shackle', 'splash')
    expect(foe.vol?.trapped).toBe(true)
    const ghost = tank('dusknoir')
    runTurn(full(battler('decidueye', 50, ['spirit-shackle'])), ghost, 'spirit-shackle', 'splash')
    expect(ghost.vol?.trapped).toBeFalsy()
  })
})

test('화염볼: 얼어 있어도 녹이고 공격', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5) // 자연 해동(20%)은 실패, 명중(90%)은 성공
  try {
    const me = full(battler('cinderace', 50, ['pyro-ball'], { status: 'frz' }))
    const foe = full(battler('snorlax', 100, ['splash']))
    runTurn(me, foe, 'pyro-ball', 'splash')
    expect(me.status).toBeFalsy()
    expect(foe.hp).toBeLessThan(maxHpOf(foe))
  } finally {
    vi.restoreAllMocks()
  }
})

describe('판정 강화: 전투가 끝난 턴의 이로운 턴 종료 효과', () => {
  test('먹다남은음식은 회복하고, 화상 데미지는 받지 않음', () => {
    const b = battler('snorlax', 50, ['tackle'], { held: { leftovers: 1 }, status: 'brn' })
    const max = maxHpOf(b)
    b.hp = 100
    const lines = endOfTurnBenefits(b, full(battler('pikachu', 50, ['tackle'])))
    expect(b.hp).toBe(100 + Math.floor(max / 16))
    expect(b.status).toBe('brn')
    expect(lines.length).toBe(1)
  })
  test('독 상태의 일반 포켓몬은 아무 일도 없음', () => {
    const b = battler('snorlax', 50, ['tackle'], { status: 'psn' })
    b.hp = 100
    expect(endOfTurnBenefits(b, full(battler('pikachu', 50, ['tackle'])))).toEqual([])
    expect(b.hp).toBe(100)
  })
  test('독 타입이 아니면 검은오물로 회복하지 않음 (데미지도 없음)', () => {
    const b = battler('snorlax', 50, ['tackle'], { held: { 'black-sludge': 1 } })
    b.hp = 100
    endOfTurnBenefits(b, full(battler('pikachu', 50, ['tackle'])))
    expect(b.hp).toBe(100)
  })
})

describe('필드 날씨', () => {
  afterEach(() => setWeather(null))
  const sq = () => full(battler('squirtle', 50, ['water-gun']))
  const ch = () => full(battler('charmander', 50, ['ember']))

  test('비: 물 기술 1.5배, 불꽃 기술 절반', () => {
    const water = damageOf(sq(), ch(), mv('water-gun'), 100, false)
    const fire = damageOf(ch(), sq(), mv('ember'), 100, false)
    setWeather('rain')
    expect(damageOf(sq(), ch(), mv('water-gun'), 100, false)).toBeGreaterThan(water * 1.4)
    expect(damageOf(ch(), sq(), mv('ember'), 100, false)).toBeLessThan(fire * 0.6)
  })

  test('날씨부정이 있으면 날씨 효과 없음', () => {
    const water = damageOf(sq(), ch(), mv('water-gun'), 100, false)
    setWeather('rain')
    const golduck = full(battler('charmander', 50, ['ember'], { ability: 'cloud-nine' }))
    expect(damageOf(sq(), golduck, mv('water-gun'), 100, false)).toBe(water)
  })

  test('쓱쓱: 비에서 스피드 2배', () => {
    const b = full(battler('lotad', 50, ['tackle'], { ability: 'swift-swim' }))
    const foe = ch()
    const base = speedOf(b, foe)
    setWeather('rain')
    expect(speedOf(b, foe)).toBe(base * 2)
  })

  test('안개: 명중률 0.6배', () => {
    const base = expectedDamage(sq(), ch(), mv('water-gun'))
    setWeather('fog')
    expect(expectedDamage(sq(), ch(), mv('water-gun'))).toBeCloseTo(base * 0.6, 0)
  })

  test('모래바람: 바위·땅·강철 외에는 턴 종료 시 1/16 데미지', () => {
    setWeather('sand')
    const p = full(battler('squirtle', 50, ['tackle']))
    const e = full(battler('geodude', 50, ['tackle']))
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const r = runTurn(p, e, null, 'tackle')
    vi.restoreAllMocks()
    expect(r.lines.some((l) => l.includes('모래바람에 의한 데미지'))).toBe(true)
    expect(e.hp).toBe(maxHpOf(e))
  })

  test('날씨볼: 비에서 물 타입·위력 2배', () => {
    const att = full(battler('castform', 50, ['weather-ball']))
    const def = ch()
    const normal = damageOf(att, def, mv('weather-ball'), 100, false)
    setWeather('rain')
    // 물 타입(효과 굉장 2배) × 위력 2배 × 비 1.5배 ÷ 노말 자속(1.5배) 없어짐 = 4배
    expect(damageOf(att, def, mv('weather-ball'), 100, false)).toBeGreaterThan(normal * 3.5)
  })
})

describe('난이도 엔트리', () => {
  test('보통은 공격기만, 어려움은 도구를 지님', async () => {
    const { difficultyMon } = await import('../src/core/difficulty')
    const { moveData } = await import('../src/core/battle')
    for (let i = 0; i < 20; i++) {
      const n = difficultyMon('garchomp', 'normal')!
      expect(n.moves.length).toBe(4)
      expect(n.moves.every((id) => moveData(id)!.cls !== 'status')).toBe(true)
      expect(n.item).toBeNull()
      const h = difficultyMon('garchomp', 'hard')!
      expect(h.item).toBeTruthy()
    }
    expect(difficultyMon('garchomp', 'easy')).toBeNull()
  })

  test('어려움 AI: HP가 낮으면 회복, 상대가 멀쩡하면 상태이상', () => {
    const me = battler('garchomp', 60, ['earthquake', 'toxic', 'recover'])
    const foe = battler('blissey', 100, ['tackle'])
    foe.hp = maxHpOf(foe)
    me.hp = Math.floor(maxHpOf(me) * 0.3)
    const picks = new Set(Array.from({ length: 50 }, () => chooseMove(me, foe, 'smart', undefined, { status: true })))
    expect(picks.has('recover')).toBe(true)
    me.hp = maxHpOf(me)
    const picks2 = new Set(Array.from({ length: 50 }, () => chooseMove(me, foe, 'smart', undefined, { status: true })))
    expect(picks2.has('toxic')).toBe(true)
    expect(picks2.has('recover')).toBe(false)
  })
})
