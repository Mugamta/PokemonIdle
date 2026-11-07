// 지도 타일 배치로 장소 간 연결을 계산 (사각형이 맞닿거나 겹치면 연결)
// 패배 시 돌아갈 마을(포켓몬센터)과, 그 마을에서 패배한 장소로 가는 첫 길목을 찾는 데 사용
import type { MapPlace, Rect, RegionMap } from './maps/types'

/** 포켓몬센터가 없는 마을 (원작처럼 집에서 회복) */
export const HOME_TOWNS = new Set(['태초마을', '연두마을'])

const touches = (a: Rect, b: Rect) =>
  a[0] <= b[0] + b[2] && b[0] <= a[0] + a[2] && a[1] <= b[1] + b[3] && b[1] <= a[1] + a[3] &&
  // 모서리 한 점만 닿는 경우는 제외
  !((a[0] + a[2] === b[0] || b[0] + b[2] === a[0]) && (a[1] + a[3] === b[1] || b[1] + b[3] === a[1]))

const cache = new WeakMap<RegionMap, Map<string, Set<string>>>()

function graphOf(map: RegionMap): Map<string, Set<string>> {
  let g = cache.get(map)
  if (g) return g
  g = new Map(map.places.map((p) => [p.name, new Set<string>()]))
  const places = map.places
  for (let i = 0; i < places.length; i++)
    for (let j = i + 1; j < places.length; j++) {
      const a = places[i]!, b = places[j]!
      if (a.rects.some((ra) => b.rects.some((rb) => touches(ra, rb)))) {
        g.get(a.name)!.add(b.name)
        g.get(b.name)!.add(a.name)
      }
    }
  cache.set(map, g)
  return g
}

/**
 * 장소에서 가장 가까운 마을과, 마을 → 장소 경로 (마을 제외, 마지막 = 장소)
 * 연결 정보가 없으면 null
 */
export function nearestTown(map: RegionMap, place: string): { town: MapPlace; path: string[] } | null {
  const g = graphOf(map)
  if (!g.has(place)) return null
  const kind = new Map(map.places.map((p) => [p.name, p]))
  const prev = new Map<string, string | null>([[place, null]])
  const queue = [place]
  while (queue.length) {
    const cur = queue.shift()!
    const p = kind.get(cur)!
    if (p.kind === 'town') {
      // cur(마을)에서 place 방향으로 되짚기
      const path: string[] = []
      for (let n = prev.get(cur); n != null; n = prev.get(n)!) path.push(n)
      return { town: p, path }
    }
    for (const next of g.get(cur)!) {
      if (prev.has(next)) continue
      prev.set(next, cur)
      queue.push(next)
    }
  }
  return null
}
