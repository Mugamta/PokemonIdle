// 배틀시설 엔트리 (public/data/frontier.json, scripts/build-frontier.mjs 로 생성)
// 에메랄드 배틀프런티어 · 플래티나 배틀타워 엔트리, 엔트리가 없는 포켓몬은 싱글 배틀 사용률 데이터
import { shallowRef } from 'vue'

/** [기술들, 도구 | null, 성격, 출처 ('e' = 에메랄드, 'p' = 플래티나, 'u' = 사용률)] */
export type FrontierSet = [string[], string | null, string, 'e' | 'p' | 'u']

export const frontierSets = shallowRef<Record<string, FrontierSet[]> | null>(null)
let promise: Promise<void> | null = null

export function loadFrontier(): Promise<void> {
  promise ??= fetch(`${import.meta.env.BASE_URL}data/frontier.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} frontier.json`)
      return r.json() as Promise<Record<string, FrontierSet[]>>
    })
    .then((d) => {
      frontierSets.value = d
    })
    .catch((e) => {
      promise = null
      throw e
    })
  return promise
}
