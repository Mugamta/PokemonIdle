// 생성된 데이터(JSON)와 스테이지 구성이 서로 맞물리는지
import { beforeAll, describe, expect, test } from 'vitest'
import { loadAllData } from './helpers'
import { battleData } from '../src/data/battle'
import { dexData, learnsets, speciesEntry } from '../src/data/dex'
import { encountersAt, ENCOUNTERS } from '../src/data/encounters'
import { evolutions } from '../src/data/evolutions'
import { EVO_ITEMS, SHOP_ITEMS } from '../src/data/shop'
import { findStage, migrateLegacyRegionIds, migrateLegacyStageId, REGIONS } from '../src/data/stages'
import { STARTERS, STARTER_LEVEL } from '../src/data/starters'
import { wildMoveset } from '../src/core/battle'
import { GIMMICKS } from '../src/core/gimmicks'
import { regionOfGimmick } from '../src/data/stages'
import { tutorTableProblems } from '../src/data/tutors'

beforeAll(loadAllData)

const allStages = () => REGIONS.flatMap((r) => r.stages.map((s) => ({ region: r, stage: s })))
const dex = () => dexData.value!

describe('데이터 불러오기', () => {
  test('모든 데이터가 로드됨', () => {
    expect(dex().index.length).toBeGreaterThan(1000)
    expect(Object.keys(dex().moves).length).toBeGreaterThan(700)
    expect(learnsets.value).toBeTruthy()
    expect(battleData.value).toBeTruthy()
    expect(evolutions.value).toBeTruthy()
  })

  test('타입 상성표: 18타입, 대표 상성', () => {
    const t = battleData.value!.types
    expect(Object.keys(dex().types).filter((k) => k in t).length).toBeGreaterThanOrEqual(18)
    expect(t.water!.fire).toBe(2)
    expect(t.fire!.water).toBe(0.5)
    expect(t.normal!.ghost).toBe(0)
    expect(t.electric!.ground).toBe(0)
    expect(t.dragon!.fairy).toBe(0)
  })

  test('포켓몬 id 중복 없음, 능력치 6개', () => {
    const ids = dex().index.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of dex().index) {
      expect(p.stats, p.id).toHaveLength(6)
      expect(p.types.length, p.id).toBeGreaterThan(0)
    }
  })
})

describe('스테이지', () => {
  test('지방 id 연속, 스테이지 id 중복 없음, 형식 "지방-순번"', () => {
    REGIONS.forEach((r, i) => expect(r.id).toBe(i + 1))
    const ids = allStages().map(({ stage }) => stage.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const { region, stage } of allStages()) {
      expect(stage.id).toMatch(new RegExp(`^${region.id}-[0-9]+$`))
      expect(findStage(stage.id)?.stage).toBe(stage)
    }
  })

  test('모든 지방에 스테이지가 있음', () => {
    for (const r of REGIONS) expect(r.stages.length, r.title).toBeGreaterThan(0)
  })

  test('출현 데이터가 있는 지방은 모든 스테이지에 출현표가 있음', () => {
    for (const r of REGIONS) {
      if (!ENCOUNTERS[r.key]) continue
      for (const s of r.stages) expect(s.encounters, `${r.key} ${s.id} ${s.name}`).toBeDefined()
    }
  })

  test('출현 포켓몬이 도감에 있고, 레벨·확률이 정상', () => {
    const problems: string[] = []
    for (const { region, stage } of allStages()) {
      const set = stage.encounters
      if (!set) continue
      for (const phase of ['day', 'night'] as const) {
        const list = encountersAt(set, phase)
        if (!list.length) problems.push(`${stage.id} ${phase}: 출현 없음`)
        for (const e of list) {
          if (!speciesEntry(e.p)) problems.push(`${stage.id}: 도감에 없는 ${e.p}`)
          if (!(e.min >= 1 && e.max <= 100 && e.min <= e.max)) problems.push(`${stage.id}: ${e.p} 레벨 ${e.min}~${e.max}`)
          if (!(e.rate > 0)) problems.push(`${stage.id}: ${e.p} 확률 ${e.rate}`)
        }
        const sum = list.filter((e) => !e.special).reduce((a, e) => a + e.rate, 0)
        // 원작 데이터 반올림 오차 허용
        if (sum < 90 || sum > 101) problems.push(`${region.key} ${stage.id} ${stage.name} ${phase}: 확률 합 ${sum}`)
      }
    }
    expect(problems).toEqual([])
  })

  test('출현 포켓몬은 야생 기술 배치가 1개 이상', () => {
    const problems: string[] = []
    for (const { stage } of allStages()) {
      const set = stage.encounters
      if (!set) continue
      for (const phase of ['day', 'night'] as const)
        for (const e of encountersAt(set, phase)) {
          const moves = wildMoveset(e.p, e.min, set.vg)
          if (!moves.length) problems.push(`${stage.id} ${e.p} Lv${e.min}`)
          if (moves.length > 4) problems.push(`${stage.id} ${e.p}: 기술 ${moves.length}개`)
        }
    }
    expect([...new Set(problems)]).toEqual([])
  })

  test('특수 기능마다 해금 지방이 있음', () => {
    for (const g of GIMMICKS) expect(regionOfGimmick(g), g).toBeDefined()
  })

  test('이전 저장 데이터의 스테이지 id 변환 결과가 실제 스테이지', () => {
    for (const order of [1, 2])
      for (let r = 1; r <= 9; r++)
        for (let n = 1; n <= 40; n++) {
          const id = migrateLegacyStageId(`${r}-${n}`, order)
          if (id !== `${r}-${n}`) expect(findStage(id), `${order}: ${r}-${n} → ${id}`).not.toBeNull()
        }
    for (const id of migrateLegacyRegionIds([1, 2, 3, 4, 5, 6, 7, 8, 9]))
      expect(REGIONS.some((r) => r.id === id)).toBe(true)
  })
})

describe('스타팅 포켓몬', () => {
  test.each(STARTERS.map((s) => s.id))('%s: 도감에 있고 시작 기술이 있음', (id) => {
    expect(speciesEntry(id)).toBeDefined()
    const first = (learnsets.value![id] ?? []).filter((m) => m[1] === 'level' && m[2] >= 1 && m[2] <= STARTER_LEVEL)
    expect(first.length).toBeGreaterThan(0)
  })
})

describe('진화', () => {
  test('진화 전·후 포켓몬과 필요 아이템이 모두 존재', () => {
    const problems: string[] = []
    for (const [from, list] of Object.entries(evolutions.value!)) {
      if (!speciesEntry(from)) problems.push(`진화 전 ${from}`)
      for (const e of list) {
        if (!speciesEntry(e.to)) problems.push(`${from} → ${e.to}`)
        if (e.item && !dex().items[e.item]) problems.push(`${from}: 아이템 ${e.item}`)
        if (e.move && !dex().movesById[e.move]) problems.push(`${from}: 기술 ${e.move}`)
        if (e.via === 'level' && e.lv != null && !(e.lv >= 1 && e.lv <= 100)) problems.push(`${from}: Lv ${e.lv}`)
      }
    }
    expect(problems).toEqual([])
  })

  test('대표 진화: 파이리 Lv16 → 리자드', () => {
    expect(evolutions.value!.charmander).toContainEqual(expect.objectContaining({ to: 'charmeleon', via: 'level', lv: 16 }))
  })
})

describe('상점', () => {
  test('상품 id 중복 없음, 가격 양수, 아이템 데이터 존재', () => {
    const items = [...SHOP_ITEMS, ...EVO_ITEMS]
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const i of items) {
      expect(i.price, i.id).toBeGreaterThan(0)
      expect(dex().items[i.id], i.id).toBeDefined()
    }
  })
})

describe('기술가르침 표', () => {
  test('지방 key·도착 판정 스테이지 이름이 실제로 있음', () => {
    expect(tutorTableProblems()).toEqual([])
  })
})
