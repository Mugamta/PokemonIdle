// 낮/밤 주기: 실제 시간 기준 5분마다 교대 (낮 5분 → 밤 5분 → ...)
import { ref } from 'vue'

export type Phase = 'day' | 'night'
export const PHASE_MS = 5 * 60 * 1000

export function phaseAt(now: number): Phase {
  return Math.floor(now / PHASE_MS) % 2 === 0 ? 'day' : 'night'
}

/** 현재 단계가 끝날 때까지 남은 시간(ms) */
export function phaseRemaining(now: number): number {
  return PHASE_MS - (now % PHASE_MS)
}

// 화면 표시용 공용 시계 (1초 간격 갱신)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

export function useNow() {
  timer ??= setInterval(() => (now.value = Date.now()), 1000)
  return now
}

export function formatMs(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
