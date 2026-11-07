// 전투 계산용 데이터 (public/data/dex/battle.json, scripts/build-battle.mjs 로 생성)
import { shallowRef } from 'vue'

export type StageKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'acc' | 'eva'

/** 상태이상: 마비 / 잠듦 / 얼음 / 화상 / 독 / 맹독 */
export type Status = 'par' | 'slp' | 'frz' | 'brn' | 'psn' | 'tox'
export const STATUS_LABELS: Record<Status, string> = {
  par: '마비',
  slp: '잠듦',
  frz: '얼음',
  brn: '화상',
  psn: '독',
  tox: '맹독',
}
export const STATUS_COLORS: Record<Status, string> = {
  par: '#c8a400',
  slp: '#8a8a96',
  frz: '#4fb8d8',
  brn: '#e0602a',
  psn: '#9141cb',
  tox: '#6a1f9a',
}

export interface MoveExtra {
  /** 우선도 */
  pri?: number
  /** 능력 변화를 사용자 자신에게 적용 */
  self?: 1
  /** 급소 랭크 보정 */
  crit?: number
  /** 연속기 [최소, 최대] 타수 */
  hits?: [number, number]
  /** 양수 = 준 데미지의 %만큼 회복, 음수 = 반동 */
  drain?: number
  /** 최대 HP의 % 회복 */
  heal?: number
  /** 능력 랭크 변화 */
  stats?: [StageKey | 'hp', number][]
  /** 능력 변화 확률 % (없으면 항상) */
  chance?: number
  /** 상대에게 거는 상태이상 */
  ail?: Status
  /** 상태이상 확률 % (없으면 항상) */
  ailChance?: number
  /** 고정 데미지 */
  fixed?: number | 'level' | 'half'
}

export interface BattleData {
  /** 타입 상성 {공격: {방어: 배율}}, 1배는 생략 */
  types: Record<string, Record<string, number>>
  /** 키 = 숫자 기술 id */
  moves: Record<string, MoveExtra>
  species: Record<string, { exp: number; growth: number; ev: number[] }>
  /** 성장 그룹별 레벨 → 누적 경험치 */
  growth: Record<string, number[]>
  /** 버전 그룹 → 포켓몬 → [기술 id, 레벨][] */
  wild: Record<string, Record<string, [number, number][]>>
}

export const battleData = shallowRef<BattleData | null>(null)
let promise: Promise<void> | null = null

export function loadBattle(): Promise<void> {
  promise ??= fetch(`${import.meta.env.BASE_URL}data/dex/battle.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} battle.json`)
      return r.json() as Promise<BattleData>
    })
    .then((d) => {
      battleData.value = d
    })
    .catch((e) => {
      promise = null
      throw e
    })
  return promise
}
