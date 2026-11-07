import { defineStore } from 'pinia'

/** 한 번에 보관하는 전투 로그 줄 수 */
const MAX_LINES = 40

/** divider = 전투 사이 구분선 */
export type LogKind = 'info' | 'good' | 'bad' | 'divider'

// 전투 로그와 턴 진행 타이밍. 저장하지 않는 화면 상태
export const useBattleLogStore = defineStore('battleLog', {
  state: () => ({
    lines: [] as { id: number; text: string; kind?: LogKind }[],
    /** 다음 턴을 진행할 수 있는 시각 (연출 대기) */
    readyAt: 0,
    seq: 0,
  }),
  actions: {
    /** 연출 대기 중인지 (시간 비교라 getter 대신 함수) */
    isBusy() {
      return Date.now() < this.readyAt
    },
    push(text: string, kind?: LogKind) {
      this.lines.push({ id: ++this.seq, text, kind })
      if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES)
    },
    /** 새 전투 시작 전 구분선 (첫 줄이거나 직전이 구분선이면 생략) */
    divider() {
      const last = this.lines[this.lines.length - 1]
      if (last && last.kind !== 'divider') this.push('', 'divider')
    },
    wait(ms: number) {
      this.readyAt = Date.now() + ms
    },
  },
})
