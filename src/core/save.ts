// localStorage 저장/불러오기 + 버전 관리 + 문자열 내보내기/가져오기
const SAVE_KEY = 'idle-game-save'
export const SAVE_VERSION = 1

export interface SaveData<T> {
  version: number
  savedAt: number
  state: T
}

/** 초기화·가져오기 직후 새로고침 전까지 자동 저장을 막음 (beforeunload 저장이 덮어쓰지 않도록) */
let locked = false

export function save<T>(state: T): void {
  if (locked) return
  const data: SaveData<T> = { version: SAVE_VERSION, savedAt: Date.now(), state }
  localStorage.setItem(SAVE_KEY, JSON.stringify(data))
}

export function load<T>(): SaveData<T> | null {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SaveData<T>
  } catch {
    return null
  }
}

export function exportSave(): string {
  return btoa(encodeURIComponent(localStorage.getItem(SAVE_KEY) ?? ''))
}

/** 백업 코드로 저장 데이터를 덮어씀. 성공하면 이후 자동 저장을 막음 (새로고침해서 불러와야 함) */
export function importSave(encoded: string): boolean {
  try {
    const raw = decodeURIComponent(atob(encoded.trim()))
    const data = JSON.parse(raw) as Partial<SaveData<unknown>>
    if (!data || typeof data !== 'object' || !data.state || typeof data.state !== 'object') return false
    localStorage.setItem(SAVE_KEY, raw)
    locked = true
    return true
  } catch {
    return false
  }
}

/** 저장 데이터를 모두 지움 (신규 유저 상태). 이후 자동 저장을 막음 (새로고침해서 처음부터 시작) */
export function resetSave(): void {
  localStorage.removeItem(SAVE_KEY)
  locked = true
}

/** 테스트용: 자동 저장 잠금 해제 */
export function unlockSave(): void {
  locked = false
}
