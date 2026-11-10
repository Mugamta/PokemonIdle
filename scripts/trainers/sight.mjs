// 2인 동시 시선 더블배틀: 필드에서 두 트레이너의 시야가 한 칸에서 겹치면,
// 플레이어가 그 칸에 서는 순간 둘이 함께 승부를 걸어 와 더블배틀이 된다 (에메랄드, 4세대).
// 원작 판정 (pokeemerald src/trainer_see.c CheckForTrainersWantingBattle):
// - 트레이너는 바라보는 방향으로 시야 거리(sight range)만큼 직선으로 본다.
// - 사이 칸이 막혀 있으면(지형 충돌, 다른 오브젝트) 보지 못한다.
// - 더블배틀 트레이너(쌍둥이 등)는 혼자 더블배틀을 하므로 다른 트레이너와 짝이 되지 않는다.
// 바라보는 방향은 이동 타입(LOOK_NORTH_AND_EAST, LOOK_AROUND ...)에서 가능한 방향을 모두 쓴다.
// 걸어 다니는 트레이너는 시작 위치 기준으로 본다.

const STEP = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }
const ALL = ['N', 'S', 'W', 'E']
const WORD = { UP: 'N', NORTH: 'N', DOWN: 'S', SOUTH: 'S', LEFT: 'W', WEST: 'W', RIGHT: 'E', EAST: 'E' }

/**
 * 이동 타입 이름 → 볼 수 있는 방향들
 * (3세대 MOVEMENT_TYPE_FACE_DOWN_AND_UP, 4세대 MOVEMENT_TYPE_LOOK_NORTH_SOUTH_AND_EAST 등)
 */
export function facingDirs(movementType, fallback) {
  const s = (movementType ?? '').replace(/^MOVEMENT_TYPE_/, '')
  if (/LOOK_AROUND|ROTATE|SPIN|WANDER_AROUND|WALK_SEQUENCE|^RANDOM/.test(s)) return ALL
  const dirs = [...new Set(s.split('_').map((w) => WORD[w]).filter(Boolean))]
  if (dirs.length) return dirs
  return fallback ? [fallback] : ['S']
}

/**
 * 한 맵의 오브젝트들 → 시야가 겹치는 트레이너 쌍
 * @param {{ trainer?: string, double?: boolean, x: number, y: number, elevation?: number,
 *           dirs?: string[], range?: number, blocks?: boolean }[]} objects
 *   trainer: 트레이너 상수 (트레이너가 아니면 없음), blocks: 시야를 가리는지 (아이템볼 등은 false)
 * @param {(x: number, y: number, elevation: number) => boolean} [passable] 지형 판정 (없으면 모두 통과)
 * @returns {[string, string][]}
 */
export function sightPairs(objects, passable = () => true) {
  const occupied = new Set(objects.filter((o) => o.blocks !== false).map((o) => `${o.x},${o.y}`))
  const seen = new Map() // 칸 → 그 칸을 보는 트레이너들
  for (const o of objects) {
    if (!o.trainer || o.double || !o.range) continue
    for (const d of o.dirs ?? ALL) {
      const [dx, dy] = STEP[d]
      for (let k = 1; k <= o.range; k++) {
        const x = o.x + dx * k, y = o.y + dy * k
        if (occupied.has(`${x},${y}`) || !passable(x, y, o.elevation ?? 0)) break
        const key = `${x},${y}`
        if (!seen.has(key)) seen.set(key, new Set())
        seen.get(key).add(o.trainer)
      }
    }
  }
  const pairs = new Map()
  for (const who of seen.values()) {
    const list = [...who].sort()
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) pairs.set(`${list[i]}|${list[j]}`, [list[i], list[j]])
  }
  return [...pairs.values()]
}

/** 트레이너 객체들(byConst: 상수 → 트레이너)에 doubleWith 를 기록 */
export function applyPairs(byConst, pairs) {
  for (const [a, b] of pairs) {
    const ta = byConst.get(a), tb = byConst.get(b)
    if (!ta || !tb || ta === tb) continue
    ;(ta.doubleWith ??= []).includes(tb.id) || ta.doubleWith.push(tb.id)
    ;(tb.doubleWith ??= []).includes(ta.id) || tb.doubleWith.push(ta.id)
  }
}

/** 스크립트로 정해진 2인 상대 (태그배틀·멀티배틀). partners = 아군 후보 (스타팅·성별에 따라 다름) */
export function applyScriptedPair(byConst, a, b, partners = []) {
  const ta = byConst.get(a), tb = byConst.get(b)
  if (!ta || !tb) return
  const ally = partners.map((p) => byConst.get(p)).filter(Boolean)
  for (const p of ally) p.ally = true
  // 같은 상대 쌍이 아군만 바꿔 여러 번 나오면 (스타팅별 라이벌 등) 아군 후보를 합침
  const set = (t, other) => {
    const prev = t.pair?.with === other.id ? t.pair.partners ?? [] : []
    const ids = [...new Set([...prev, ...ally.map((p) => p.id)])]
    t.pair = { with: other.id, ...(ids.length ? { partners: ids } : {}) }
  }
  set(ta, tb)
  set(tb, ta)
}
