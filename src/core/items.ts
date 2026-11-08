// 지닌 도구: 전투 판정용 표. 전투 진행(로그·상태 변경)은 core/battle.ts 에서 처리
//
// 구현 범위: 1:1 전투에서 의미가 있는 도구 (위력·능력·명중·급소·우선도·회복·상태이상·능력 변화·접촉 반격 등)
// 미구현: 날씨·필드·교체·벽·구속·헤롱헤롱 등 이 게임 전투에 없는 요소에 의존하는 도구 (지닐 수는 있지만 효과 없음)
import type { StageKey, Status } from '../data/battle'

/** 해당 타입 기술 위력 1.2배 (타입 강화 도구·향로·플레이트) */
export const TYPE_BOOST: Record<string, string> = {
  'silk-scarf': 'normal',
  'black-belt': 'fighting',
  'sharp-beak': 'flying',
  'poison-barb': 'poison',
  'soft-sand': 'ground',
  'hard-stone': 'rock',
  'silver-powder': 'bug',
  'spell-tag': 'ghost',
  'metal-coat': 'steel',
  charcoal: 'fire',
  'mystic-water': 'water',
  'miracle-seed': 'grass',
  magnet: 'electric',
  'twisted-spoon': 'psychic',
  'never-melt-ice': 'ice',
  'dragon-fang': 'dragon',
  'black-glasses': 'dark',
  'fairy-feather': 'fairy',
  'sea-incense': 'water',
  'wave-incense': 'water',
  'odd-incense': 'psychic',
  'rock-incense': 'rock',
  'rose-incense': 'grass',
  'fist-plate': 'fighting',
  'sky-plate': 'flying',
  'toxic-plate': 'poison',
  'earth-plate': 'ground',
  'stone-plate': 'rock',
  'insect-plate': 'bug',
  'spooky-plate': 'ghost',
  'iron-plate': 'steel',
  'flame-plate': 'fire',
  'splash-plate': 'water',
  'meadow-plate': 'grass',
  'zap-plate': 'electric',
  'mind-plate': 'psychic',
  'icicle-plate': 'ice',
  'draco-plate': 'dragon',
  'dread-plate': 'dark',
  'pixie-plate': 'fairy',
}

/** 해당 타입 기술 위력 1.3배, 한 번 쓰면 사라짐 (주얼) */
export const GEMS: Record<string, string> = {
  'normal-gem': 'normal',
  'fighting-gem': 'fighting',
  'flying-gem': 'flying',
  'poison-gem': 'poison',
  'ground-gem': 'ground',
  'rock-gem': 'rock',
  'bug-gem': 'bug',
  'ghost-gem': 'ghost',
  'steel-gem': 'steel',
  'fire-gem': 'fire',
  'water-gem': 'water',
  'grass-gem': 'grass',
  'electric-gem': 'electric',
  'psychic-gem': 'psychic',
  'ice-gem': 'ice',
  'dragon-gem': 'dragon',
  'dark-gem': 'dark',
  'fairy-gem': 'fairy',
}

/** 효과가 굉장한 해당 타입 기술의 데미지 절반, 한 번 쓰면 사라짐 (카리열매는 노말 기술이면 항상) */
export const RESIST_BERRY: Record<string, string> = {
  'occa-berry': 'fire',
  'passho-berry': 'water',
  'wacan-berry': 'electric',
  'rindo-berry': 'grass',
  'yache-berry': 'ice',
  'chople-berry': 'fighting',
  'kebia-berry': 'poison',
  'shuca-berry': 'ground',
  'coba-berry': 'flying',
  'payapa-berry': 'psychic',
  'tanga-berry': 'bug',
  'charti-berry': 'rock',
  'kasib-berry': 'ghost',
  'haban-berry': 'dragon',
  'colbur-berry': 'dark',
  'babiri-berry': 'steel',
  'roseli-berry': 'fairy',
  'chilan-berry': 'normal',
}

/** 전설 포켓몬 전용 구슬: 지닌 포켓몬의 해당 타입 기술 1.2배 */
export const ORBS: Record<string, { species: string[]; types: string[] }> = {
  'adamant-orb': { species: ['dialga'], types: ['dragon', 'steel'] },
  'lustrous-orb': { species: ['palkia'], types: ['dragon', 'water'] },
  'griseous-orb': { species: ['giratina-altered', 'giratina'], types: ['dragon', 'ghost'] },
  'soul-dew': { species: ['latias', 'latios'], types: ['dragon', 'psychic'] },
}

/** HP가 1/4 이하가 되면 능력 랭크 +1 (먹보면 1/2) */
export const PINCH_BERRY: Record<string, StageKey> = {
  'liechi-berry': 'atk',
  'ganlon-berry': 'def',
  'salac-berry': 'spe',
  'petaya-berry': 'spa',
  'apicot-berry': 'spd',
}

/** HP 회복 열매·도구: at = 발동 HP 비율 이하, hp = 회복량 (frac = 최대 HP 비율) */
export const HEAL_HELD: Record<string, { at: number; hp?: number; frac?: number }> = {
  'oran-berry': { at: 1 / 2, hp: 10 },
  'berry-juice': { at: 1 / 2, hp: 20 },
  'sitrus-berry': { at: 1 / 2, frac: 1 / 4 },
  'figy-berry': { at: 1 / 4, frac: 1 / 3 },
  'wiki-berry': { at: 1 / 4, frac: 1 / 3 },
  'mago-berry': { at: 1 / 4, frac: 1 / 3 },
  'aguav-berry': { at: 1 / 4, frac: 1 / 3 },
  'iapapa-berry': { at: 1 / 4, frac: 1 / 3 },
}

/** 상태이상을 고치는 열매 */
export const STATUS_BERRY: Record<string, Status[]> = {
  'cheri-berry': ['par'],
  'chesto-berry': ['slp'],
  'pecha-berry': ['psn', 'tox'],
  'rawst-berry': ['brn'],
  'aspear-berry': ['frz'],
  'lum-berry': ['par', 'slp', 'frz', 'brn', 'psn', 'tox'],
}

/** 공격을 받으면 능력이 오르고 사라지는 도구 (type = 그 타입 기술 / cls = 그 분류 기술) */
export const HIT_BOOST: Record<string, { type?: string; cls?: 'physical' | 'special'; stat: StageKey }> = {
  'absorb-bulb': { type: 'water', stat: 'spa' },
  'cell-battery': { type: 'electric', stat: 'atk' },
  snowball: { type: 'ice', stat: 'atk' },
  'luminous-moss': { type: 'water', stat: 'spd' },
  'kee-berry': { cls: 'physical', stat: 'def' },
  'maranga-berry': { cls: 'special', stat: 'spd' },
}

/** 파워 계열 도구: 전투로 얻는 노력치 +8 (스피드 절반) */
export const POWER_ITEMS: Record<string, number> = {
  'power-weight': 0,
  'power-bracer': 1,
  'power-belt': 2,
  'power-lens': 3,
  'power-band': 4,
  'power-anklet': 5,
}
export const POWER_ITEM_EV = 8

/** 스피드가 절반이 되는 도구 */
export const SLOW_ITEMS = new Set(['iron-ball', 'macho-brace', ...Object.keys(POWER_ITEMS)])

/** 같은 우선도 안에서 항상 나중에 행동 */
export const LAST_ITEMS = new Set(['lagging-tail', 'full-incense'])

/** 기술이 하나로 고정되는 도구 */
export const CHOICE_ITEMS = new Set(['choice-band', 'choice-specs', 'choice-scarf'])

/** 급소 랭크 +1 */
export const CRIT_ITEMS = new Set(['scope-lens', 'razor-claw'])
/** 전용 포켓몬의 급소 랭크 +2 */
export const CRIT_SPECIES_ITEMS: Record<string, string[]> = {
  stick: ['farfetchd', 'sirfetchd', 'farfetchd-galar'],
  leek: ['farfetchd', 'sirfetchd', 'farfetchd-galar'],
  'lucky-punch': ['chansey'],
}

/** 상대의 명중률 0.9배 */
export const EVASION_ITEMS = new Set(['bright-powder', 'lax-incense'])

/** 풀죽게 할 수 있는 도구 (10%) */
export const FLINCH_ITEMS = new Set(['kings-rock', 'razor-fang'])

/** 상대의 긴장감 특성: 열매를 먹을 수 없음 */
export const UNNERVE = new Set(['unnerve', 'as-one-glastrier', 'as-one-spectrier'])

/** 전투에서 효과가 있는 지닌 도구 (도감·상점 표시용. 경험치·돈·노력치·친밀도 도구는 store 에서 처리) */
export const BATTLE_HELD = new Set([
  ...Object.keys(TYPE_BOOST),
  ...Object.keys(GEMS),
  ...Object.keys(RESIST_BERRY),
  ...Object.keys(ORBS),
  ...Object.keys(PINCH_BERRY),
  ...Object.keys(HEAL_HELD),
  ...Object.keys(STATUS_BERRY),
  ...Object.keys(HIT_BOOST),
  ...SLOW_ITEMS,
  ...LAST_ITEMS,
  ...CHOICE_ITEMS,
  ...CRIT_ITEMS,
  ...Object.keys(CRIT_SPECIES_ITEMS),
  ...EVASION_ITEMS,
  ...FLINCH_ITEMS,
  'leftovers', 'black-sludge', 'life-orb', 'expert-belt', 'muscle-band', 'wise-glasses', 'punching-glove', 'metronome',
  'focus-sash', 'focus-band', 'eviolite', 'assault-vest', 'rocky-helmet', 'air-balloon', 'weakness-policy',
  'quick-claw', 'wide-lens', 'zoom-lens', 'shell-bell', 'big-root', 'sticky-barb', 'toxic-orb', 'flame-orb',
  'white-herb', 'light-ball', 'thick-club', 'deep-sea-tooth', 'deep-sea-scale', 'metal-powder', 'quick-powder',
  'protective-pads', 'covert-cloak', 'safety-goggles', 'clear-amulet', 'ability-shield', 'loaded-dice', 'ring-target',
  'throat-spray', 'blunder-policy', 'adrenaline-orb', 'jaboca-berry', 'rowap-berry', 'enigma-berry', 'lansat-berry',
  'starf-berry', 'micle-berry', 'custap-berry', 'leppa-berry',
])
