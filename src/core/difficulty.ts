// 난이도별 상대 포켓몬 보정 (보통·어려움): 레벨·노력치·기술·도구·성격
// 기술·도구·성격은 배틀시설 엔트리(src/data/frontier.ts)를 바탕으로, 엔트리가 없으면 배울 수 있는 기술로 조합
import { dexData, learnsets, type DexEntry } from '../data/dex'
import { evolutionsOf } from '../data/evolutions'
import { frontierSets, type FrontierSet } from '../data/frontier'
import { NATURES } from '../data/natures'
import { CHARGE_MOVES, moveData, RECHARGE_MOVES, SELF_KO_MOVES, speciesOf, type Difficulty, type MoveData } from './battle'
import { BATTLE_HELD, CHOICE_ITEMS, PINCH_BERRY, TYPE_BOOST } from './items'

/** 난이도별 상대 레벨 보정 (상한 없음) */
export const DIFFICULTY_LEVEL: Record<Difficulty, number> = { easy: 0, normal: 50, hard: 100 }
/** 난이도별 상대 노력치 (모든 능력치) */
export const DIFFICULTY_EV: Record<Difficulty, number> = { easy: 0, normal: 252, hard: 504 }

/** 상대 혼자서는 쓸모가 없는 기술 (교체가 필요한 기술 등). 보통·어려움 상대의 기술로는 쓰지 않음 */
const BANNED = new Set(['struggle', 'healing-wish', 'lunar-dance', 'perish-song'])

/**
 * 조건이 맞아야 성공하는 공격기 (꿈먹기 = 상대가 잠듦, 트림 = 열매를 먹음 등).
 * 엔트리에 있으면 쓰지만, 배울 수 있는 기술로 채울 때는 거의 고르지 않음
 */
const CONDITIONAL = new Set([
  'dream-eater', 'belch', 'last-resort', 'synchronoise', 'snore', 'shell-trap', 'focus-punch', 'fake-out',
  'first-impression', 'burn-up', 'double-shock', 'future-sight', 'doom-desire',
])

/** 부작용에 따른 공격기 점수 배율 (자폭·반동으로 쉼·2턴 기술·HP 소모) */
function drawback(m: MoveData): number {
  if (SELF_KO_MOVES.has(m.id) || m.id === 'final-gambit') return 0.3
  if (CONDITIONAL.has(m.id)) return 0.2
  if (RECHARGE_MOVES.has(m.id)) return 0.6
  if (CHARGE_MOVES[m.id]) return m.id === 'electro-shot' ? 0.8 : 0.55
  if (m.id === 'steel-beam' || m.id === 'mind-blown' || m.id === 'chloroblast') return 0.75
  if (m.id === 'rollout' || m.id === 'ice-ball') return 1.5
  return 1
}

/** 엔트리에 있으면 그대로 쓰는 도구 (그 외는 기술에 맞춰 고름) */
const GOOD_ITEMS = new Set([
  ...CHOICE_ITEMS, ...Object.keys(TYPE_BOOST), ...Object.keys(PINCH_BERRY),
  'leftovers', 'black-sludge', 'lum-berry', 'sitrus-berry', 'life-orb', 'expert-belt', 'focus-sash', 'assault-vest',
  'eviolite', 'weakness-policy', 'rocky-helmet', 'white-herb', 'shell-bell', 'light-ball', 'thick-club', 'scope-lens',
  'razor-claw', 'muscle-band', 'wise-glasses', 'air-balloon',
])

export interface DifficultyMon {
  moves: string[]
  item: string | null
  nature: string
}

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!

/** 레벨업·기술머신 등으로 배울 수 있는 모든 기술 */
function learnable(species: string): MoveData[] {
  const dex = dexData.value
  const out = new Map<string, MoveData>()
  for (const e of learnsets.value?.[species] ?? []) {
    const id = dex?.moves[e[0]]?.id
    const m = id && moveData(id)
    if (m) out.set(m.id, m)
  }
  return [...out.values()]
}

/** 공격기 점수 (위력 × 명중 × 자속 × 공격·특공 중 높은 쪽과 맞는지). 공격기가 아니면 0 */
function attackScore(sp: DexEntry, m: MoveData): number {
  if (m.cls === 'status' || !m.power || BANNED.has(m.id)) return 0
  const atk = sp.stats[1]!
  const spa = sp.stats[3]!
  const ex = m.extra
  const hits = ex.hits ? (ex.hits[0] === 2 && ex.hits[1] === 5 ? 3.1 : (ex.hits[0] + ex.hits[1]) / 2) : 1
  let p = m.power * hits * ((m.acc ?? 100) / 100)
  if (sp.types.includes(m.type)) p *= 1.5
  const fit = (m.cls === 'physical' ? atk : spa) / Math.max(atk, spa, 1)
  p *= fit * fit
  if ((ex.drain ?? 0) < 0) p *= 0.9
  if (ex.self && ex.chance == null && ex.stats?.some(([, n]) => n < 0)) p *= 0.8
  return p * drawback(m)
}

type StatusKind = 'setup' | 'ail' | 'heal' | 'drop'
/** 능력 변화 변화기로 치는 능력치 (명중률·회피율만 바꾸는 기술은 제외) */
const MAIN_STATS = new Set(['atk', 'def', 'spa', 'spd', 'spe'])
/** 이 게임에서 효과가 있는 변화기의 종류 (없으면 null) */
function statusKind(m: MoveData): StatusKind | null {
  if (m.cls !== 'status' || BANNED.has(m.id)) return null
  // 잠자기(+잠꼬대)·길동무: 엔트리에 있으면 그대로 씀
  if (m.id === 'rest' || m.id === 'sleep-talk') return 'heal'
  if (m.id === 'destiny-bond') return 'drop'
  const ex = m.extra
  if (ex.heal && !ex.stats) return 'heal'
  if (ex.ail) return 'ail'
  if (ex.stats && ex.self && ex.stats.some(([k, n]) => MAIN_STATS.has(k) && n > 0)) return 'setup'
  if (ex.stats && !ex.self && ex.stats.some(([k, n]) => MAIN_STATS.has(k) && n <= -2)) return 'drop'
  return null
}

/** 공격기를 n개까지 채움: 점수 순으로, 먼저 아직 없는 타입부터 */
function fillAttacks(sp: DexEntry, chosen: MoveData[], pool: MoveData[], n: number): MoveData[] {
  const out = [...chosen]
  const ranked = pool
    .filter((m) => attackScore(sp, m) > 0 && !out.some((c) => c.id === m.id))
    .sort((a, b) => attackScore(sp, b) - attackScore(sp, a))
  for (const pass of [0, 1]) {
    for (const m of ranked) {
      if (out.length >= n) return out
      if (out.some((c) => c.id === m.id)) continue
      if (pass === 0 && out.some((c) => c.cls !== 'status' && c.type === m.type)) continue
      out.push(m)
    }
  }
  return out
}

/** 공격·특공 중 높은 쪽 기준의 성격 (스피드가 빠르면 스피드 보정) */
function autoNature(sp: DexEntry): string {
  const physical = sp.stats[1]! >= sp.stats[3]!
  const fast = sp.stats[5]! >= 80
  return physical ? (fast ? 'jolly' : 'adamant') : fast ? 'timid' : 'modest'
}

/** 엔트리가 없을 때 고르는 변화기 (능력 상승 > 상태이상 > 회복, 튼튼하면 회복도) */
function autoStatus(sp: DexEntry, pool: MoveData[]): MoveData[] {
  const physical = sp.stats[1]! >= sp.stats[3]!
  const main = physical ? 'atk' : 'spa'
  const boost = (m: MoveData) => (m.extra.stats ?? []).reduce((a, [k, n]) => a + (k === main ? n * 2 : k === 'spe' ? n : 0), 0)
  const setups = pool.filter((m) => statusKind(m) === 'setup' && boost(m) > 0).sort((a, b) => boost(b) - boost(a))
  const ails = pool.filter((m) => statusKind(m) === 'ail' && (m.acc ?? 100) >= 75)
  const heals = pool.filter((m) => statusKind(m) === 'heal' && (m.extra.heal ?? 0) >= 50)
  const bulky = sp.stats[0]! + sp.stats[2]! + sp.stats[4]! >= 270
  const out: MoveData[] = []
  const kinds = [setups.length && 'setup', ails.length && 'ail'].filter(Boolean)
  const kind = kinds.length ? pick(kinds) : null
  if (kind === 'setup') out.push(setups[0]!)
  else if (kind === 'ail') out.push(pick(ails))
  if (heals.length && (bulky || !out.length)) out.push(pick(heals))
  return out
}

/** 어려움: 기술에 어울리는 도구 */
function autoItem(sp: DexEntry, moves: MoveData[]): string {
  const status = moves.filter((m) => m.cls === 'status')
  const physical = moves.filter((m) => m.cls === 'physical').length >= moves.filter((m) => m.cls === 'special').length
  const bulky = sp.stats[0]! + sp.stats[2]! + sp.stats[4]! >= 270
  const poison = sp.types.includes('poison')
  const rest = poison ? 'black-sludge' : 'leftovers'
  if (evolutionsOf(sp.id).length && Math.random() < 0.6) return 'eviolite'
  if (!status.length) {
    const opts = [physical ? 'choice-band' : 'choice-specs', 'life-orb', 'expert-belt']
    const spe = sp.stats[5]!
    if (spe >= 70 && spe <= 110) opts.push('choice-scarf', 'choice-scarf')
    if (bulky) opts.push('assault-vest', 'assault-vest')
    return pick(opts)
  }
  if (status.some((m) => statusKind(m) === 'setup')) return pick(['lum-berry', 'life-orb', rest, 'sitrus-berry'])
  if (status.some((m) => statusKind(m) === 'heal')) return rest
  return pick([rest, 'sitrus-berry', 'lum-berry'])
}

/**
 * 난이도 보정 엔트리. 보통: 엔트리의 공격기 + 배울 수 있는 고위력기 (도구는 원래대로) /
 * 어려움: 엔트리 그대로(효과 없는 변화기는 공격기로 바꿈) + 어울리는 도구. 쉬움이거나 데이터가 없으면 null
 */
export function difficultyMon(species: string, diff: Difficulty): DifficultyMon | null {
  if (diff === 'easy') return null
  const sp = speciesOf(species)
  if (!sp || !dexData.value) return null
  const sets = frontierSets.value?.[species] ?? []
  const set: FrontierSet | undefined = sets.length ? pick(sets) : undefined
  const fromSet = (set?.[0] ?? []).map((id) => moveData(id)).filter((m): m is MoveData => !!m)
  const pool = [...learnable(species), ...sets.flatMap((s) => s[0]).map((id) => moveData(id)).filter((m): m is MoveData => !!m)]
  let chosen: MoveData[]
  if (diff === 'normal') chosen = fromSet.filter((m) => attackScore(sp, m) > 0)
  else if (set) chosen = fromSet.filter((m) => attackScore(sp, m) > 0 || statusKind(m))
  else chosen = autoStatus(sp, pool)
  chosen = fillAttacks(sp, chosen.slice(0, 4), pool, 4)
  if (!chosen.some((m) => attackScore(sp, m) > 0)) return null
  const nature = set && NATURES[set[2]] ? set[2] : autoNature(sp)
  let item: string | null = null
  if (diff === 'hard') item = set?.[1] && GOOD_ITEMS.has(set[1]) && BATTLE_HELD.has(set[1]) ? set[1] : autoItem(sp, chosen)
  return { moves: chosen.map((m) => m.id), item, nature }
}
