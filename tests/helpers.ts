import { loadBattle } from '../src/data/battle'
import { loadDex, loadLearnsets } from '../src/data/dex'
import { loadEvolutions } from '../src/data/evolutions'
import { loadFrontier } from '../src/data/frontier'
import type { Battler } from '../src/core/battle'

/** 게임 실행 시 App.vue 가 불러오는 데이터 전체 */
export const loadAllData = () => Promise.all([loadDex(), loadLearnsets(), loadBattle(), loadEvolutions(), loadFrontier()])

/** 테스트용 전투 포켓몬 (개체값 31, 노력치 0, 무보정 성격) */
export function battler(species: string, level: number, moves: string[], extra: Partial<Battler> = {}): Battler {
  const b: Battler = {
    name: species,
    species,
    level,
    nature: 'hardy',
    ivs: [31, 31, 31, 31, 31, 31],
    evs: [0, 0, 0, 0, 0, 0],
    hp: 0,
    moves,
    stages: {},
    ...extra,
  }
  return b
}
