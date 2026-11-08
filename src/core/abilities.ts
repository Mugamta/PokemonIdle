// 특성: 이름·배정·판정용 표. 전투 진행(로그·상태 변경)은 core/battle.ts 에서 처리
//
// 구현 범위: 1:1 전투에서 의미가 있는 특성 (데미지·상성·무효·명중·급소·우선도·능력 변화·상태이상·접촉 반격·턴 종료 효과 등)
// 미구현: 날씨·필드·교체·지닌 도구·성별·혼란·풀죽음 등 이 게임 전투에 없는 요소에 의존하는 특성 (배정은 되지만 효과 없음)
import { battleData, type MoveFlag, type StageKey, type Status } from '../data/battle'
import { dexData } from '../data/dex'

let numById: Map<string, string> | null = null
/** 특성 이름·설명 (도감 데이터) */
export function abilityInfo(id: string | null | undefined): { ko: string; text: string } | null {
  const map = battleData.value?.abilities
  if (!id || !map) return null
  numById ??= new Map(Object.entries(map).map(([n, a]) => [a, n]))
  const num = numById.get(id)
  return (num && dexData.value?.abilities[num]) || null
}
/** 특성 한글 이름 */
export const abilityName = (id: string | null | undefined): string => abilityInfo(id)?.ko ?? id ?? '-'

/** 포켓몬이 가질 수 있는 특성 identifier. hidden = 숨겨진 특성 포함 */
export function speciesAbilities(species: string, hidden: boolean): string[] {
  const entry = dexData.value?.index.find((p) => p.id === species)
  const map = battleData.value?.abilities
  if (!entry || !map) return []
  const out = entry.abilities.filter((a) => hidden || !a[1]).map((a) => map[a[0]]).filter((a): a is string => !!a)
  return [...new Set(out)]
}

/** 일반 특성 목록 (숨겨진 특성 제외) */
export const normalAbilities = (species: string) => speciesAbilities(species, false)
/** 숨겨진 특성 (없으면 null) */
export function hiddenAbility(species: string): string | null {
  const entry = dexData.value?.index.find((p) => p.id === species)
  const h = entry?.abilities.find((a) => a[1])
  return (h && battleData.value?.abilities[h[0]]) || null
}

// ---------- 분류 ----------
/** 상대 특성을 무시하고 기술을 씀 */
export const BREAKERS = new Set(['mold-breaker', 'teravolt', 'turboblaze'])
/** 틀깨기로도 무시되지 않는 방어 특성 */
export const UNBREAKABLE = new Set(['shadow-shield', 'prism-armor', 'full-metal-body', 'comatose', 'neutralizing-gas'])
/** 따라하기·미라 등으로 복사·덮어쓸 수 없는 특성 */
export const UNCOPYABLE = new Set([
  'trace', 'multitype', 'stance-change', 'schooling', 'comatose', 'shields-down', 'disguise', 'rks-system',
  'battle-bond', 'power-construct', 'ice-face', 'gulp-missile', 'neutralizing-gas', 'hunger-switch', 'zero-to-hero',
  'commander', 'imposter', 'illusion', 'receiver', 'power-of-alchemy', 'wonder-guard', 'mummy', 'lingering-aroma',
  'protosynthesis', 'quark-drive', 'tera-shift', 'as-one-glastrier', 'as-one-spectrier',
])
/** 전투 시작 시 발동하는 특성 (발동하지 않았으면 후보에서 제외) */
export const ENTRY_ABILITIES = new Set([
  'intimidate', 'download', 'intrepid-sword', 'dauntless-shield', 'trace', 'supersweet-syrup', 'pressure',
  'mold-breaker', 'teravolt', 'turboblaze', 'neutralizing-gas', 'slow-start', 'comatose', 'sword-of-ruin',
  'beads-of-ruin', 'tablets-of-ruin', 'vessel-of-ruin', 'unnerve', 'frisk', 'anticipation', 'forewarn',
])

/** 체력이 1/3 이하일 때 해당 타입 기술 1.5배 */
export const PINCH: Record<string, string> = { overgrow: 'grass', blaze: 'fire', torrent: 'water', swarm: 'bug' }
/** 노말 기술을 다른 타입으로 바꾸고 1.2배 */
export const SKIN: Record<string, string> = {
  aerilate: 'flying',
  pixilate: 'fairy',
  refrigerate: 'ice',
  galvanize: 'electric',
}
/** 특정 타입 기술 위력 배율 */
export const TYPE_POWER: Record<string, [string, number]> = {
  steelworker: ['steel', 1.5],
  'steely-spirit': ['steel', 1.5],
  'dragons-maw': ['dragon', 1.5],
  transistor: ['electric', 1.3],
  'rocky-payload': ['rock', 1.5],
  'water-bubble': ['water', 2],
}
/** 특정 플래그 기술 위력 배율 */
export const FLAG_POWER: Record<string, [MoveFlag, number]> = {
  'iron-fist': ['punch', 1.2],
  'strong-jaw': ['bite', 1.5],
  'mega-launcher': ['pulse', 1.5],
  sharpness: ['slicing', 1.5],
  'tough-claws': ['contact', 1.3],
  'punk-rock': ['sound', 1.3],
}

/** 타입 기술을 무효로 하고 효과를 얻는 특성 */
export type AbsorbEffect = { heal: true } | { stat: StageKey; n: number } | { flash: true } | { none: true }
export const ABSORB: Record<string, [string, AbsorbEffect]> = {
  'volt-absorb': ['electric', { heal: true }],
  'water-absorb': ['water', { heal: true }],
  'dry-skin': ['water', { heal: true }],
  'earth-eater': ['ground', { heal: true }],
  'lightning-rod': ['electric', { stat: 'spa', n: 1 }],
  'storm-drain': ['water', { stat: 'spa', n: 1 }],
  'motor-drive': ['electric', { stat: 'spe', n: 1 }],
  'sap-sipper': ['grass', { stat: 'atk', n: 1 }],
  'well-baked-body': ['fire', { stat: 'def', n: 2 }],
  'flash-fire': ['fire', { flash: true }],
  levitate: ['ground', { none: true }],
}
/** 플래그 기술을 무효로 하는 특성 */
export const FLAG_IMMUNE: Record<string, MoveFlag> = {
  bulletproof: 'ballistics',
  soundproof: 'sound',
  overcoat: 'powder',
}
/** 상대의 우선도 기술을 막는 특성 */
export const PRIORITY_BLOCK = new Set(['queenly-majesty', 'dazzling', 'armor-tail'])

/** 상태이상 면역 특성 */
export const STATUS_IMMUNE_AB: Record<string, Status[]> = {
  limber: ['par'],
  insomnia: ['slp'],
  'vital-spirit': ['slp'],
  'sweet-veil': ['slp'],
  immunity: ['psn', 'tox'],
  'pastel-veil': ['psn', 'tox'],
  'water-veil': ['brn'],
  'water-bubble': ['brn'],
  'thermal-exchange': ['brn'],
  'magma-armor': ['frz'],
  comatose: ['par', 'slp', 'frz', 'brn', 'psn', 'tox'],
  'purifying-salt': ['par', 'slp', 'frz', 'brn', 'psn', 'tox'],
}

/** 상대에 의한 능력 하락을 막는 특성 (all = 전부) */
export const DROP_BLOCK: Record<string, StageKey[] | 'all'> = {
  'clear-body': 'all',
  'white-smoke': 'all',
  'full-metal-body': 'all',
  'hyper-cutter': ['atk'],
  'big-pecks': ['def'],
  'keen-eye': ['acc'],
  illuminate: ['acc'],
  'minds-eye': ['acc'],
}

/** 접촉하면 확률로 상대를 상태이상으로 만듦 */
export const CONTACT_STATUS: Record<string, Status> = { static: 'par', 'flame-body': 'brn', 'poison-point': 'psn' }

/** 공격을 받으면 능력이 변하는 특성: 조건 판정 (type = 실제 기술 타입) */
export const HIT_STAT: Record<string, { when: (type: string, physical: boolean) => boolean; stats: [StageKey, number][] }> = {
  justified: { when: (t) => t === 'dark', stats: [['atk', 1]] },
  rattled: { when: (t) => t === 'bug' || t === 'dark' || t === 'ghost', stats: [['spe', 1]] },
  stamina: { when: () => true, stats: [['def', 1]] },
  'weak-armor': { when: (_, p) => p, stats: [['def', -1], ['spe', 2]] },
  'water-compaction': { when: (t) => t === 'water', stats: [['def', 2]] },
  'steam-engine': { when: (t) => t === 'fire' || t === 'water', stats: [['spe', 6]] },
  'thermal-exchange': { when: (t) => t === 'fire', stats: [['atk', 1]] },
}
