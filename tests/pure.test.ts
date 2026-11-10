// 데이터 없이 동작하는 순수 함수
import { beforeEach, describe, expect, test } from 'vitest'
import { calcStats, NATURES } from '../src/data/natures'
import { josa, ro } from '../src/core/battle'
import { formatMs, PHASE_MS, phaseAt, phaseRemaining } from '../src/core/dayNight'
import { maxPower, teraShardOf, teraShardType, zPower } from '../src/core/gimmicks'
import { exportSave, importSave, load, resetSave, save, SAVE_VERSION, unlockSave } from '../src/core/save'
import { rollStarter, STARTER_CHANCES, STARTERS } from '../src/data/starters'
import { baseSlotsAt, MAX_MOVE_SLOTS, slotsAt } from '../src/stores/game'
import { type HealOption, pickHealInBattle, planHealAfterBattle } from '../src/data/shop'

describe('calcStats (실능치 공식)', () => {
  test('원작 예시와 일치: Lv78 고집 한카리아스', () => {
    // Bulbapedia "Stat" 문서 예시
    const stats = calcStats([108, 130, 95, 80, 85, 102], 78, [24, 12, 30, 16, 23, 5], [74, 190, 91, 48, 84, 23], 'adamant')
    expect(stats).toEqual([289, 278, 193, 135, 171, 171])
  })

  test('껍질몬의 HP는 항상 1', () => {
    expect(calcStats([1, 90, 45, 30, 30, 40], 50, [31, 31, 31, 31, 31, 31], [0, 0, 0, 0, 0, 0], 'hardy', 'shedinja')[0]).toBe(1)
  })

  test('성격 보정은 ±10%, 무보정 성격은 변화 없음', () => {
    const base = [100, 100, 100, 100, 100, 100]
    const ivs = [31, 31, 31, 31, 31, 31]
    const evs = [0, 0, 0, 0, 0, 0]
    const neutral = calcStats(base, 100, ivs, evs, 'hardy')
    expect(new Set(neutral.slice(1)).size).toBe(1)
    for (const [id, n] of Object.entries(NATURES)) {
      const s = calcStats(base, 100, ivs, evs, id)
      expect(s[0]).toBe(neutral[0])
      if (!n.plus) expect(s).toEqual(neutral)
    }
    const adamant = calcStats(base, 100, ivs, evs, 'adamant')
    expect(adamant[1]).toBe(Math.floor(neutral[1]! * 1.1))
    expect(adamant[3]).toBe(Math.floor(neutral[3]! * 0.9))
  })

  test('성격 25종, 상승/하락 능력치가 서로 다름', () => {
    expect(Object.keys(NATURES)).toHaveLength(25)
    for (const n of Object.values(NATURES)) {
      expect(n.plus === null).toBe(n.minus === null)
      if (n.plus) expect(n.plus).not.toBe(n.minus)
    }
  })
})

describe('한국어 조사', () => {
  test.each([
    ['피카츄', '피카츄는', '피카츄로'],
    ['이상해씨', '이상해씨는', '이상해씨로'],
    ['리자몽', '리자몽은', '리자몽으로'],
    ['꼬부기', '꼬부기는', '꼬부기로'],
    ['라이츄', '라이츄는', '라이츄로'],
    ['괴력몬', '괴력몬은', '괴력몬으로'],
    ['돌', '돌은', '돌로'],
    ['1번도로', '1번도로는', '1번도로로'],
    ['도로 3', '도로 3은', '도로 3으로'],
    ['알프의 유적 (바깥)', '알프의 유적 (바깥)은', '알프의 유적 (바깥)으로'],
  ])('%s', (word, eun, euro) => {
    expect(josa(word, '은', '는')).toBe(eun)
    expect(ro(word)).toBe(euro)
  })
})

describe('낮/밤 주기', () => {
  test('5분마다 교대', () => {
    expect(phaseAt(0)).toBe('day')
    expect(phaseAt(PHASE_MS - 1)).toBe('day')
    expect(phaseAt(PHASE_MS)).toBe('night')
    expect(phaseAt(PHASE_MS * 2)).toBe('day')
    expect(phaseRemaining(PHASE_MS + 1000)).toBe(PHASE_MS - 1000)
  })
  test('남은 시간 표시', () => {
    expect(formatMs(0)).toBe('0:00')
    expect(formatMs(61_000)).toBe('1:01')
    expect(formatMs(299_001)).toBe('5:00')
  })
})

describe('특수 기능 수치', () => {
  test('Z기술 위력표', () => {
    expect(zPower(null)).toBe(100)
    expect(zPower(40)).toBe(100)
    expect(zPower(60)).toBe(120)
    expect(zPower(90)).toBe(175)
    expect(zPower(100)).toBe(180)
    expect(zPower(120)).toBe(190)
    expect(zPower(150)).toBe(200)
  })
  test('다이맥스 위력표 (격투·독은 낮음)', () => {
    expect(maxPower(40, 'normal')).toBe(90)
    expect(maxPower(90, 'fire')).toBe(130)
    expect(maxPower(150, 'water')).toBe(150)
    expect(maxPower(40, 'fighting')).toBe(70)
    expect(maxPower(150, 'poison')).toBe(100)
    expect(maxPower(null, 'grass')).toBe(100)
  })
  test('테라피스 id 변환', () => {
    expect(teraShardType(teraShardOf('fire'))).toBe('fire')
    expect(teraShardType('potion')).toBeNull()
  })
})

describe('기술칸', () => {
  test('격파 수에 따라 기본 칸이 늘고, 최대치를 넘지 않음', () => {
    expect(baseSlotsAt(0)).toBe(1)
    expect(baseSlotsAt(5)).toBe(2)
    expect(baseSlotsAt(1_000_000)).toBe(4)
    expect(slotsAt(1_000_000, { extraSlots: 99 })).toBeLessThanOrEqual(MAX_MOVE_SLOTS)
  })
})

describe('스타팅 뽑기', () => {
  test('확률 합 100%', () => {
    expect(STARTER_CHANCES.reduce((a, s) => a + s.chance, 0)).toBeCloseTo(100, 6)
  })
  test('결과가 항상 유효 (경계값 포함)', () => {
    for (const r of [0, 0.5, 0.999999]) {
      const roll = rollStarter(() => r)
      expect(STARTERS.map((s) => s.id)).toContain(roll.id)
      expect(NATURES[roll.nature]).toBeDefined()
      expect(roll.ivs).toHaveLength(6)
      for (const iv of roll.ivs) expect(iv).toBeGreaterThanOrEqual(0), expect(iv).toBeLessThanOrEqual(31)
    }
  })
  test('고정 옵션: 포켓몬 / 성격 / 개체값 31', () => {
    for (const r of [0, 0.5, 0.999999]) {
      expect(rollStarter(() => r, { kind: 'species', id: 'piplup' }).id).toBe('piplup')
      expect(rollStarter(() => r, { kind: 'nature', nature: 'timid' }).nature).toBe('timid')
      expect(rollStarter(() => r, { kind: 'iv', index: 5 }).ivs[5]).toBe(31)
    }
  })
})

describe('저장', () => {
  beforeEach(() => {
    localStorage.clear()
    unlockSave()
  })

  test('저장 → 불러오기', () => {
    expect(load()).toBeNull()
    save({ money: 123, party: [{ species: 'pikachu' }] })
    const data = load<{ money: number }>()
    expect(data?.version).toBe(SAVE_VERSION)
    expect(data?.state.money).toBe(123)
  })

  test('내보내기 → 가져오기 (한글 포함)', () => {
    save({ name: '피카츄' })
    const code = exportSave()
    localStorage.clear()
    expect(importSave(code)).toBe(true)
    expect(load<{ name: string }>()?.state.name).toBe('피카츄')
  })

  test('잘못된 코드는 거부하고 기존 저장을 유지', () => {
    save({ money: 1 })
    expect(importSave('!!!not-base64')).toBe(false)
    expect(importSave(btoa('not json'))).toBe(false)
    expect(load<{ money: number }>()?.state.money).toBe(1)
  })

  test('저장 형식이 아닌 JSON 코드는 거부', () => {
    save({ money: 1 })
    expect(importSave(btoa(encodeURIComponent('{"a":1}')))).toBe(false)
    expect(load<{ money: number }>()?.state.money).toBe(1)
  })

  test('가져오기 후에는 자동 저장이 가져온 데이터를 덮어쓰지 않음', () => {
    save({ money: 5 })
    const code = exportSave()
    save({ money: 999 })
    expect(importSave(code)).toBe(true)
    save({ money: 999 })
    expect(load<{ money: number }>()?.state.money).toBe(5)
  })

  test('초기화하면 저장 데이터가 사라지고 이후 자동 저장도 막힘', () => {
    save({ money: 5 })
    resetSave()
    expect(load()).toBeNull()
    save({ money: 5 })
    expect(load()).toBeNull()
  })

  test('깨진 저장 데이터는 null', () => {
    localStorage.setItem('idle-game-save', '{broken')
    expect(load()).toBeNull()
  })
})

describe('체력 회복 자동 사용 계획', () => {
  const opt = (id: string, amount: number, price: number, owned = 0, buyable = true): HealOption => ({ id, amount, price, owned, buyable })

  test('전투 중: 한 개로 다 채우는 아이템 중 가장 싼 것', () => {
    const opts = [opt('potion', 20, 200), opt('super', 60, 700), opt('hyper', 120, 1500)]
    expect(pickHealInBattle(opts, 50)?.id).toBe('super')
  })
  test('전투 중: 가진 아이템이 다 채우면 사지 않음', () => {
    const opts = [opt('super', 60, 700), opt('hyper', 120, 1500, 1)]
    expect(pickHealInBattle(opts, 50)?.id).toBe('hyper')
  })
  test('전투 중: 다 채우는 게 없으면 가장 많이 회복하는 것', () => {
    const opts = [opt('potion', 20, 200), opt('super', 60, 700)]
    expect(pickHealInBattle(opts, 100)?.id).toBe('super')
  })
  test('전투 후: 돈이 가장 적게 드는 조합', () => {
    // 50 부족: 상처약 3개(600) < 좋은상처약(700)
    const opts = [opt('potion', 20, 200), opt('super', 60, 700)]
    expect(planHealAfterBattle(opts, 50).sort()).toEqual(['potion', 'potion', 'potion'])
  })
  test('전투 후: 가진 아이템을 먼저 쓰고 모자란 만큼만 삼', () => {
    const opts = [opt('potion', 20, 200, 1), opt('super', 60, 700)]
    expect(planHealAfterBattle(opts, 50)).toEqual(['potion', 'potion', 'potion'])
  })
  test('전투 후: 살 수 없으면 가진 것으로 최대한', () => {
    const opts = [opt('potion', 20, 200, 2, false)]
    expect(planHealAfterBattle(opts, 100)).toEqual(['potion', 'potion'])
  })
})

describe('성별', () => {
  test('성비: 폼 id는 기본 포켓몬으로, 무성·한쪽 성별 포켓몬', async () => {
    const { genderRate, rollGender } = await import('../src/stores/game')
    expect(genderRate('pikachu')).toBe(4)
    expect(genderRate('raichu-alola')).toBe(4)
    expect(genderRate('magnemite')).toBe(-1)
    expect(rollGender('magnemite')).toBeNull()
    expect(rollGender('chansey')).toBe('F')
    expect(rollGender('tauros')).toBe('M')
  })
})
