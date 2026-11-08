import { defineStore } from 'pinia'
import type { Gimmick } from '../core/gimmicks'

/** 보관하는 최근 전투 수 */
const MAX_BATTLES = 10
/** 전투 하나에 보관하는 로그 줄 수 */
const MAX_LINES = 60

/** divider = 같은 전투 기록 안의 구분선 (예: 패배 후 회복 안내) */
export type LogKind = 'info' | 'good' | 'bad' | 'divider'

export interface LogLine {
  id: number
  text: string
  kind?: LogKind
}

export interface BattleRecord {
  id: number
  /** 상단 탭에 표시할 이름 (상대 포켓몬) */
  label: string
  boss?: boolean
  lines: LogLine[]
}

// 전투 로그(최근 10전투)와 턴 진행 타이밍. 저장하지 않는 화면 상태
export const useBattleLogStore = defineStore('battleLog', {
  state: () => ({
    battles: [] as BattleRecord[],
    /** 보고 있는 전투 id (null = 항상 최신 전투) */
    selected: null as number | null,
    /** 다음 턴을 진행할 수 있는 시각 (연출 대기) */
    readyAt: 0,
    /**
     * 상대가 기술을 고르는 중인 턴 (내 쪽 행동, null = 아이템 사용 등으로 행동 안 함). 준비되면 턴 계산.
     * gimmick = 이번 턴에 쓰는 특수 기능 (메가진화·Z기술·다이맥스·테라스탈)
     */
    pending: null as { move: string | null; gimmick?: Gimmick | null } | null,
    seq: 0,
    /** 최근 전투(쓰러뜨림·포획) 보상: 싸운 포켓몬이 얻은 경험치, 상금 */
    rewards: [] as { exp: number; money: number }[],
  }),
  getters: {
    /** 화면에 보여 줄 전투 기록 */
    /** 최근 MAX_BATTLES 전투의 평균 보상 (기록이 없으면 null) */
    avgReward(state): { exp: number; money: number; n: number } | null {
      const n = state.rewards.length
      if (!n) return null
      const sum = state.rewards.reduce((a, r) => ({ exp: a.exp + r.exp, money: a.money + r.money }), { exp: 0, money: 0 })
      return { exp: Math.round(sum.exp / n), money: Math.round(sum.money / n), n }
    },
    current(state): BattleRecord | null {
      const list = state.battles
      return list.find((b) => b.id === state.selected) ?? list[list.length - 1] ?? null
    },
  },
  actions: {
    /** 연출 대기 중인지 (시간 비교라 getter 대신 함수) */
    isBusy() {
      return Date.now() < this.readyAt
    },
    /** 새 전투 기록 시작 */
    beginBattle(label: string, boss?: boolean) {
      this.battles.push({ id: ++this.seq, label, boss, lines: [] })
      if (this.battles.length > MAX_BATTLES) this.battles.splice(0, this.battles.length - MAX_BATTLES)
      if (this.selected != null && !this.battles.some((b) => b.id === this.selected)) this.selected = null
    },
    push(text: string, kind?: LogKind) {
      if (!this.battles.length) this.beginBattle('기록')
      const lines = this.battles[this.battles.length - 1].lines
      lines.push({ id: ++this.seq, text, kind })
      if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
    },
    /** 현재 전투 기록 안의 구분선 (첫 줄이거나 직전이 구분선이면 생략) */
    divider() {
      const lines = this.battles[this.battles.length - 1]?.lines
      const last = lines?.[lines.length - 1]
      if (last && last.kind !== 'divider') this.push('', 'divider')
    },
    /** 탭 선택 (최신 전투를 고르면 이후 새 전투를 자동으로 따라감) */
    select(id: number) {
      const latest = this.battles[this.battles.length - 1]
      this.selected = latest && latest.id === id ? null : id
    },
    /** 전투 보상 기록 (최근 MAX_BATTLES 개 유지) */
    recordReward(exp: number, money: number) {
      this.rewards.push({ exp, money })
      if (this.rewards.length > MAX_BATTLES) this.rewards.splice(0, this.rewards.length - MAX_BATTLES)
    },
    wait(ms: number) {
      this.readyAt = Date.now() + ms
    },
  },
})
