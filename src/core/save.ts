// localStorage 저장/불러오기 + 버전 관리 + 문자열 내보내기/가져오기
const SAVE_KEY = 'idle-game-save'
export const SAVE_VERSION = 1

export interface SaveData<T> {
  version: number
  savedAt: number
  state: T
}

export function save<T>(state: T): void {
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

export function importSave(encoded: string): boolean {
  try {
    const raw = decodeURIComponent(atob(encoded))
    JSON.parse(raw)
    localStorage.setItem(SAVE_KEY, raw)
    return true
  } catch {
    return false
  }
}
