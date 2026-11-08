// 지닌 도구 상점 목록 · 몬스터볼 포획 보정 · 기술머신
import { dexData } from './dex'
import { evolutionsOf } from './evolutions'
import type { Status } from './battle'

// ---------- 지닌 도구 ----------
export type HeldGroup = 'attack' | 'defense' | 'type' | 'gem' | 'berry' | 'species' | 'bad' | 'training'
export const HELD_GROUP_LABELS: Record<HeldGroup, string> = {
  attack: '공격·속도',
  defense: '방어·회복·능력 변화',
  type: '타입 강화 (1.2배)',
  gem: '주얼 (한 번, 1.3배)',
  berry: '나무열매 (반감·핀치 등)',
  species: '전용 도구',
  bad: '불리한 효과 (특성·전략용)',
  training: '경험치·돈·친밀도·노력치',
}
export interface HeldItem {
  id: string
  group: HeldGroup
  price: number
}

const g = (group: HeldGroup, price: number, ids: string[]): HeldItem[] => ids.map((id) => ({ id, group, price }))
// 가격은 원작(PokeAPI) 기준. 원작에서 돈으로 팔지 않는 도구는 임의로 정함
export const HELD_ITEMS: HeldItem[] = [
  ...g('attack', 4000, [
    'choice-band', 'choice-specs', 'choice-scarf', 'life-orb', 'expert-belt', 'muscle-band', 'wise-glasses', 'metronome',
    'scope-lens', 'razor-claw', 'wide-lens', 'zoom-lens', 'quick-claw', 'kings-rock', 'razor-fang', 'throat-spray',
    'blunder-policy',
  ]),
  ...g('attack', 15000, ['punching-glove']),
  ...g('attack', 20000, ['loaded-dice']),
  ...g('defense', 4000, [
    'leftovers', 'black-sludge', 'shell-bell', 'big-root', 'focus-sash', 'focus-band', 'eviolite', 'assault-vest',
    'rocky-helmet', 'air-balloon', 'bright-powder', 'white-herb', 'weakness-policy', 'adrenaline-orb', 'absorb-bulb',
    'cell-battery', 'snowball', 'luminous-moss', 'protective-pads', 'safety-goggles',
  ]),
  ...g('defense', 5000, ['lax-incense']),
  ...g('defense', 20000, ['covert-cloak', 'ability-shield']),
  ...g('defense', 30000, ['clear-amulet']),
  ...g('type', 1000, [
    'silk-scarf', 'black-belt', 'sharp-beak', 'poison-barb', 'soft-sand', 'hard-stone', 'silver-powder', 'spell-tag',
    'charcoal', 'mystic-water', 'miracle-seed', 'magnet', 'twisted-spoon', 'never-melt-ice', 'dragon-fang',
    'black-glasses', 'fairy-feather',
  ]),
  ...g('type', 2000, ['sea-incense', 'wave-incense', 'odd-incense', 'rock-incense', 'rose-incense']),
  ...g('type', 1000, [
    'fist-plate', 'sky-plate', 'toxic-plate', 'earth-plate', 'stone-plate', 'insect-plate', 'spooky-plate', 'iron-plate',
    'flame-plate', 'splash-plate', 'meadow-plate', 'zap-plate', 'mind-plate', 'icicle-plate', 'draco-plate', 'dread-plate',
    'pixie-plate',
  ]),
  ...g('gem', 200, [
    'fire-gem', 'water-gem', 'electric-gem', 'grass-gem', 'ice-gem', 'fighting-gem', 'poison-gem', 'ground-gem',
    'flying-gem', 'psychic-gem', 'bug-gem', 'rock-gem', 'ghost-gem', 'dark-gem', 'steel-gem', 'dragon-gem', 'fairy-gem',
  ]),
  ...g('gem', 4000, ['normal-gem']),
  ...g('berry', 500, [
    'occa-berry', 'passho-berry', 'wacan-berry', 'rindo-berry', 'yache-berry', 'chople-berry', 'kebia-berry', 'shuca-berry',
    'coba-berry', 'payapa-berry', 'tanga-berry', 'charti-berry', 'kasib-berry', 'haban-berry', 'colbur-berry',
    'babiri-berry', 'roseli-berry', 'chilan-berry',
  ]),
  ...g('berry', 1000, ['liechi-berry', 'ganlon-berry', 'salac-berry', 'petaya-berry', 'apicot-berry', 'kee-berry', 'maranga-berry']),
  ...g('berry', 2000, ['lansat-berry', 'starf-berry', 'micle-berry', 'custap-berry', 'jaboca-berry', 'rowap-berry', 'enigma-berry']),
  ...g('species', 1000, ['light-ball', 'thick-club', 'stick', 'lucky-punch', 'metal-powder', 'quick-powder']),
  ...g('species', 2000, ['deep-sea-tooth', 'deep-sea-scale']),
  ...g('species', 10000, ['adamant-orb', 'lustrous-orb', 'griseous-orb', 'soul-dew']),
  ...g('bad', 4000, ['toxic-orb', 'flame-orb', 'iron-ball', 'lagging-tail', 'sticky-barb', 'ring-target']),
  ...g('bad', 5000, ['full-incense']),
  ...g('training', 3000, ['macho-brace', 'power-weight', 'power-bracer', 'power-belt', 'power-lens', 'power-band', 'power-anklet']),
  ...g('training', 4000, ['soothe-bell']),
  ...g('training', 10000, ['lucky-egg', 'amulet-coin']),
  ...g('training', 11000, ['luck-incense']),
]
export const heldItem = (id: string) => HELD_ITEMS.find((i) => i.id === id)

/** 전투 밖에서 효과가 있는 지닌 도구 (game store 에서 처리) */
export const LUCKY_EGG = 'lucky-egg'
export const LUCKY_EGG_MULT = 1.5
export const MONEY_ITEMS = new Set(['amulet-coin', 'luck-incense'])
export const SOOTHE_BELL = 'soothe-bell'
export const MACHO_BRACE = 'macho-brace'
/** 학습장치: 한 번 사면 켜고 끌 수 있는 공용 기능. 싸우지 않은 파티 포켓몬도 경험치 절반 */
export const EXP_SHARE_ITEM = { id: 'exp-share', price: 30000 }
export const EXP_SHARE_RATE = 0.5

// ---------- 기술머신 ----------
/** 기술머신·비전머신·기술레코드 */
export const isMachine = (id: string) => /^(tm|hm|tr)\d/.test(id)
/** 기술레코드는 쓰면 사라짐 (기술머신·비전머신은 몇 번이든 사용) */
export const isRecord = (id: string) => /^tr\d/.test(id)
/** 기술머신 가격 (원작 가격, 없으면 3000원). 가르칠 기술 데이터가 없으면 undefined */
export function tmPrice(id: string): number | undefined {
  if (!isMachine(id)) return undefined
  const info = dexData.value?.items[id]
  if (!info?.move || !dexData.value?.movesById[info.move]) return undefined
  return info.cost ?? 3000
}
/** 상점에 파는 기술머신: 기술마다 하나 (가장 싼 것, 기술레코드보다 기술머신 우선) */
export function tmShopList(): { id: string; move: string; price: number }[] {
  const items = dexData.value?.items
  if (!items) return []
  const byMove = new Map<string, { id: string; move: string; price: number }>()
  for (const id of Object.keys(items)) {
    const price = tmPrice(id)
    const move = items[id]!.move
    if (price == null || !move) continue
    const cur = byMove.get(move)
    const rank = (x: { id: string; price: number }) => (isRecord(x.id) ? 1e9 : 0) + x.price
    if (!cur || rank({ id, price }) < rank(cur)) byMove.set(move, { id, move, price })
  }
  return [...byMove.values()]
}

// ---------- 몬스터볼 ----------
export interface CatchContext {
  species: string
  level: number
  /** 던지는 쪽 포켓몬 레벨 */
  myLevel: number
  /** 지금까지 진행한 턴 수 */
  turns: number
  /** 이미 잡은 적 있음 */
  caught: boolean
  night: boolean
  /** 수상 스테이지 */
  water: boolean
  status: Status | null
}
const ULTRA_BEASTS = new Set([
  'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord', 'poipole', 'naganadel',
  'stakataka', 'blacephalon',
])
/** 볼 보정: mult = 포획률 배율, add = 포획률 가감 (헤비볼), certain = 반드시 잡힘 */
export function ballRate(ball: string, c: CatchContext): { mult: number; add: number; certain?: boolean } {
  const sp = dexData.value?.index.find((p) => p.id === c.species)
  const types = sp?.types ?? []
  switch (ball) {
    case 'master-ball':
    case 'park-ball':
      return { mult: 1, add: 0, certain: true }
    case 'great-ball':
    case 'sport-ball':
    case 'safari-ball':
      return { mult: 1.5, add: 0 }
    case 'ultra-ball':
      return { mult: 2, add: 0 }
    case 'net-ball':
      return { mult: types.includes('water') || types.includes('bug') ? 3.5 : 1, add: 0 }
    case 'dive-ball':
      return { mult: c.water ? 3.5 : 1, add: 0 }
    case 'lure-ball':
      return { mult: c.water ? 4 : 1, add: 0 }
    case 'nest-ball':
      return { mult: Math.max(1, (41 - c.level) / 10), add: 0 }
    case 'repeat-ball':
      return { mult: c.caught ? 3.5 : 1, add: 0 }
    case 'timer-ball':
      return { mult: Math.min(4, 1 + (c.turns * 1229) / 4096), add: 0 }
    case 'dusk-ball':
      return { mult: c.night ? 3 : 1, add: 0 }
    case 'quick-ball':
      return { mult: c.turns === 0 ? 5 : 1, add: 0 }
    case 'level-ball':
      return { mult: c.myLevel >= c.level * 4 ? 8 : c.myLevel >= c.level * 2 ? 4 : c.myLevel > c.level ? 2 : 1, add: 0 }
    case 'moon-ball':
      return { mult: evolutionsOf(c.species).some((e) => e.item === 'moon-stone') ? 4 : 1, add: 0 }
    case 'fast-ball':
      return { mult: (sp?.stats[5] ?? 0) >= 100 ? 4 : 1, add: 0 }
    case 'heavy-ball': {
      const w = sp?.weight ?? 0
      return { mult: 1, add: w >= 300 ? 30 : w >= 200 ? 20 : w >= 100 ? 0 : -20 }
    }
    case 'dream-ball':
      return { mult: c.status === 'slp' ? 4 : 1, add: 0 }
    case 'beast-ball':
      return { mult: ULTRA_BEASTS.has(c.species) ? 5 : 0.1, add: 0 }
    default:
      return { mult: 1, add: 0 }
  }
}
/** 볼 효과 설명 (상점·도감 표시용) */
export const BALL_NOTES: Record<string, string> = {
  'master-ball': '반드시 잡힙니다.',
  'park-ball': '반드시 잡힙니다.',
  'great-ball': '포획률 1.5배',
  'sport-ball': '포획률 1.5배',
  'safari-ball': '포획률 1.5배',
  'ultra-ball': '포획률 2배',
  'net-ball': '물·벌레 타입 3.5배',
  'dive-ball': '수상 스테이지 3.5배',
  'lure-ball': '수상 스테이지 4배',
  'nest-ball': '레벨이 낮을수록 (최대 4배)',
  'repeat-ball': '잡은 적 있는 포켓몬 3.5배',
  'timer-ball': '턴이 지날수록 (최대 4배)',
  'dusk-ball': '밤 3배',
  'quick-ball': '첫 턴 5배',
  'level-ball': '내 포켓몬 레벨이 높을수록 (최대 8배)',
  'moon-ball': '달의돌로 진화하는 포켓몬 4배',
  'fast-ball': '스피드 종족값 100 이상 4배',
  'heavy-ball': '무거울수록 포획률 증가 (100kg 미만은 감소)',
  'dream-ball': '잠든 포켓몬 4배',
  'beast-ball': '울트라비스트 5배, 그 외 0.1배',
  'heal-ball': '잡은 포켓몬의 HP·상태이상 회복',
  'luxury-ball': '잡은 포켓몬이 친해지기 쉬움 (친밀도 상승 +1)',
  'friend-ball': '잡은 포켓몬의 친밀도 150',
}
export const LUXURY_BALL = 'luxury-ball'
export const FRIEND_BALL_FRIENDSHIP = 150

/** 포획 판정 (6세대 이후 공식 + 8세대 저레벨 보정). 흔들린 횟수(0~3)와 성공 여부 */
export function rollCatch(ball: string, c: CatchContext, hp: number, maxHp: number): { caught: boolean; shakes: number } {
  const r = ballRate(ball, c)
  if (r.certain) return { caught: true, shakes: 3 }
  const sp = dexData.value?.index.find((p) => p.id === c.species)
  const rate = Math.max(1, Math.min(255, (sp?.capture ?? 45) + r.add))
  const statusMult = c.status === 'slp' || c.status === 'frz' ? 2.5 : c.status ? 1.5 : 1
  const lowLevel = c.level < 20 ? (30 - c.level) / 10 : 1
  const a = Math.floor((((3 * maxHp - 2 * hp) * rate * r.mult) / (3 * maxHp)) * statusMult * lowLevel)
  if (a >= 255) return { caught: true, shakes: 3 }
  const b = Math.floor(65536 / Math.pow(255 / Math.max(1, a), 3 / 16))
  let shakes = 0
  for (let i = 0; i < 4; i++) {
    if (Math.floor(Math.random() * 65536) >= b) return { caught: false, shakes: Math.min(3, shakes) }
    shakes++
  }
  return { caught: true, shakes: 3 }
}
/** 포획 확률 근사 (자동 포획에서 볼을 고를 때) */
export function catchChance(ball: string, c: CatchContext, hp: number, maxHp: number): number {
  const r = ballRate(ball, c)
  if (r.certain) return 1
  const sp = dexData.value?.index.find((p) => p.id === c.species)
  const rate = Math.max(1, Math.min(255, (sp?.capture ?? 45) + r.add))
  const statusMult = c.status === 'slp' || c.status === 'frz' ? 2.5 : c.status ? 1.5 : 1
  const lowLevel = c.level < 20 ? (30 - c.level) / 10 : 1
  const a = (((3 * maxHp - 2 * hp) * rate * r.mult) / (3 * maxHp)) * statusMult * lowLevel
  if (a >= 255) return 1
  const b = 65536 / Math.pow(255 / Math.max(1, a), 3 / 16)
  return Math.pow(b / 65536, 4)
}
