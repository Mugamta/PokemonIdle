// 화면 하단에 잠깐 떴다 사라지는 짧은 알림 (예: "상처약 10개를 구매했습니다")
import { reactive } from 'vue'

export interface Toast {
  id: number
  text: string
}

const SHOW_MS = 2000
const MAX = 3

export const toasts = reactive<Toast[]>([])
let nextId = 1

export function toast(text: string) {
  const id = nextId++
  toasts.push({ id, text })
  if (toasts.length > MAX) toasts.splice(0, toasts.length - MAX)
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, SHOW_MS)
}
