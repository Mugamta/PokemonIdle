// 지역도감 순서 (regionalDex.json, scripts/build-regional-dex.mjs 로 생성)
// 지방 key → 전국도감 번호 목록. 배열 순서 + 1 = 지역도감 번호
import RAW from './regionalDex.json'

export const REGIONAL_DEX: Record<string, number[]> = RAW

/** 지방의 지역도감 (없으면 빈 목록) */
export function regionalDexOf(regionKey: string): number[] {
  return REGIONAL_DEX[regionKey] ?? []
}
