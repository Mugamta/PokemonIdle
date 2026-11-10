// 상점: 회복 아이템과 편의성 기능
import { isMegaItem, teraShardType, Z_CRYSTALS, type Gimmick } from '../core/gimmicks'
import type { StageKey, Status } from './battle'
import { dexData } from './dex'
import { heldItem, tmPrice } from './items'

/** 아이템 분류 (전투 탭 아이템 목록 단위) */
export type ItemCategory = 'heal' | 'revive' | 'pp' | 'status' | 'ball' | 'battle'
export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  heal: '체력 회복',
  revive: '기절 회복',
  pp: 'PP 회복',
  status: '상태이상 회복',
  ball: '몬스터볼',
  battle: '배틀용 도구',
}
/** 자동 사용 기능이 있는 분류 */
export type AutoCategory = 'heal' | 'revive' | 'pp' | 'status' | 'ball'
/** 자동 사용 기능: 분류별 + 체력·기절 회복은 전투 중(heal·revive)·전투 후(healAfter·reviveAfter)로 나뉨 */
export type AutoUseKey = AutoCategory | 'healAfter' | 'reviveAfter'
export const AUTO_USE_KEYS: AutoUseKey[] = ['pp', 'heal', 'healAfter', 'revive', 'reviveAfter', 'status', 'ball']
/** 체력 자동 회복 설정이 있는 기능 */
export type AutoHealKey = 'heal' | 'healAfter'
/** 기절 회복 자동 사용 설정이 있는 기능 */
export type AutoReviveKey = 'revive' | 'reviveAfter'

export interface ShopItem {
  /** 아이템 identifier (items.json 키, 이름·설명은 거기서) */
  id: string
  category: ItemCategory
  price: number
  /** HP 회복량. 'full' = 전부 */
  hp?: number | 'full'
  /** HP 회복량 (최대 HP 대비 비율) */
  hpFrac?: number
  /** 기절한 포켓몬을 살림 (회복 HP 비율). party = 파티 전원 */
  revive?: number
  party?: boolean
  /** PP 회복량과 대상 (one = 가장 PP가 적은 기술 하나) */
  pp?: { amount: number | 'full'; target: 'one' | 'all' }
  /** 고치는 상태이상 */
  cures?: Status[]
  /** 친밀도 변화 (한방약은 써서 친밀도가 내려감) */
  friendship?: number
  /** 배틀용 도구: 능력 랭크 변화 */
  stage?: [StageKey, number]
  /** 배틀용 도구: 급소 랭크 +n (크리티컬커터) */
  crit?: number
  /** 배틀용 도구: 상대에 의한 능력 하락을 n턴 동안 막음 (이펙트가드) */
  mist?: number
  /** 야생 포켓몬과의 배틀에서 도망 (삐삐인형 등) */
  escape?: boolean
}

const ALL_STATUS: Status[] = ['par', 'slp', 'frz', 'brn', 'psn', 'tox']

// 가격은 원작(PokeAPI) 기준, 회복량은 7세대 이후 기준. 원작에서 팔지 않는 아이템은 임의로 정함
export const SHOP_ITEMS: ShopItem[] = [
  { id: 'potion', category: 'heal', price: 200, hp: 20 },
  { id: 'oran-berry', category: 'heal', price: 80, hp: 10 },
  { id: 'berry-juice', category: 'heal', price: 200, hp: 20 },
  { id: 'sweet-heart', category: 'heal', price: 300, hp: 20 },
  { id: 'fresh-water', category: 'heal', price: 200, hp: 30 },
  { id: 'soda-pop', category: 'heal', price: 300, hp: 50 },
  { id: 'super-potion', category: 'heal', price: 700, hp: 60 },
  { id: 'energy-powder', category: 'heal', price: 500, hp: 60, friendship: -5 },
  { id: 'lemonade', category: 'heal', price: 400, hp: 70 },
  { id: 'moomoo-milk', category: 'heal', price: 600, hp: 100 },
  { id: 'hyper-potion', category: 'heal', price: 1500, hp: 120 },
  { id: 'energy-root', category: 'heal', price: 1200, hp: 120, friendship: -10 },
  { id: 'sitrus-berry', category: 'heal', price: 200, hpFrac: 1 / 4 },
  { id: 'figy-berry', category: 'heal', price: 300, hpFrac: 1 / 3 },
  { id: 'wiki-berry', category: 'heal', price: 300, hpFrac: 1 / 3 },
  { id: 'mago-berry', category: 'heal', price: 300, hpFrac: 1 / 3 },
  { id: 'aguav-berry', category: 'heal', price: 300, hpFrac: 1 / 3 },
  { id: 'iapapa-berry', category: 'heal', price: 300, hpFrac: 1 / 3 },
  { id: 'max-potion', category: 'heal', price: 2500, hp: 'full' },
  { id: 'full-restore', category: 'heal', price: 3000, hp: 'full', cures: ALL_STATUS },
  { id: 'revive', category: 'revive', price: 2000, revive: 1 / 2 },
  { id: 'max-revive', category: 'revive', price: 4000, revive: 1 },
  { id: 'revival-herb', category: 'revive', price: 2800, revive: 1, friendship: -15 },
  { id: 'max-honey', category: 'revive', price: 4000, revive: 1 },
  { id: 'sacred-ash', category: 'revive', price: 50000, revive: 1, party: true },
  { id: 'ether', category: 'pp', price: 1200, pp: { amount: 10, target: 'one' } },
  { id: 'leppa-berry', category: 'pp', price: 300, pp: { amount: 10, target: 'one' } },
  { id: 'max-ether', category: 'pp', price: 2000, pp: { amount: 'full', target: 'one' } },
  { id: 'elixir', category: 'pp', price: 3000, pp: { amount: 10, target: 'all' } },
  { id: 'max-elixir', category: 'pp', price: 4500, pp: { amount: 'full', target: 'all' } },
  { id: 'antidote', category: 'status', price: 200, cures: ['psn', 'tox'] },
  { id: 'pecha-berry', category: 'status', price: 100, cures: ['psn', 'tox'] },
  { id: 'paralyze-heal', category: 'status', price: 200, cures: ['par'] },
  { id: 'cheri-berry', category: 'status', price: 100, cures: ['par'] },
  { id: 'awakening', category: 'status', price: 200, cures: ['slp'] },
  { id: 'chesto-berry', category: 'status', price: 100, cures: ['slp'] },
  { id: 'blue-flute', category: 'status', price: 300, cures: ['slp'] },
  { id: 'burn-heal', category: 'status', price: 200, cures: ['brn'] },
  { id: 'rawst-berry', category: 'status', price: 100, cures: ['brn'] },
  { id: 'ice-heal', category: 'status', price: 200, cures: ['frz'] },
  { id: 'aspear-berry', category: 'status', price: 100, cures: ['frz'] },
  { id: 'heal-powder', category: 'status', price: 300, cures: ALL_STATUS, friendship: -5 },
  { id: 'pewter-crunchies', category: 'status', price: 250, cures: ALL_STATUS },
  { id: 'lava-cookie', category: 'status', price: 350, cures: ALL_STATUS },
  { id: 'old-gateau', category: 'status', price: 350, cures: ALL_STATUS },
  { id: 'casteliacone', category: 'status', price: 350, cures: ALL_STATUS },
  { id: 'lumiose-galette', category: 'status', price: 350, cures: ALL_STATUS },
  { id: 'shalour-sable', category: 'status', price: 350, cures: ALL_STATUS },
  { id: 'big-malasada', category: 'status', price: 350, cures: ALL_STATUS },
  { id: 'rage-candy-bar', category: 'status', price: 350, cures: ALL_STATUS },
  { id: 'full-heal', category: 'status', price: 400, cures: ALL_STATUS },
  { id: 'lum-berry', category: 'status', price: 500, cures: ALL_STATUS },
  // 몬스터볼 (포획 보정은 data/items.ts 의 ballRate)
  { id: 'poke-ball', category: 'ball', price: 200 },
  { id: 'premier-ball', category: 'ball', price: 200 },
  { id: 'great-ball', category: 'ball', price: 600 },
  { id: 'ultra-ball', category: 'ball', price: 800 },
  { id: 'net-ball', category: 'ball', price: 1000 },
  { id: 'dive-ball', category: 'ball', price: 1000 },
  { id: 'nest-ball', category: 'ball', price: 1000 },
  { id: 'repeat-ball', category: 'ball', price: 1000 },
  { id: 'timer-ball', category: 'ball', price: 1000 },
  { id: 'dusk-ball', category: 'ball', price: 1000 },
  { id: 'quick-ball', category: 'ball', price: 1000 },
  { id: 'heal-ball', category: 'ball', price: 300 },
  { id: 'luxury-ball', category: 'ball', price: 3000 },
  { id: 'level-ball', category: 'ball', price: 1500 },
  { id: 'lure-ball', category: 'ball', price: 1500 },
  { id: 'moon-ball', category: 'ball', price: 1500 },
  { id: 'friend-ball', category: 'ball', price: 1500 },
  { id: 'love-ball', category: 'ball', price: 1500 },
  { id: 'heavy-ball', category: 'ball', price: 1500 },
  { id: 'fast-ball', category: 'ball', price: 1500 },
  { id: 'sport-ball', category: 'ball', price: 1500 },
  { id: 'safari-ball', category: 'ball', price: 1500 },
  { id: 'dream-ball', category: 'ball', price: 3000 },
  { id: 'beast-ball', category: 'ball', price: 3000 },
  { id: 'cherish-ball', category: 'ball', price: 3000 },
  { id: 'park-ball', category: 'ball', price: 100000 },
  { id: 'master-ball', category: 'ball', price: 300000 },
  // 배틀용 도구 (7세대 이후: 능력 2단계)
  { id: 'x-attack', category: 'battle', price: 1000, stage: ['atk', 2] },
  { id: 'x-defense', category: 'battle', price: 2000, stage: ['def', 2] },
  { id: 'x-sp-atk', category: 'battle', price: 1000, stage: ['spa', 2] },
  { id: 'x-sp-def', category: 'battle', price: 2000, stage: ['spd', 2] },
  { id: 'x-speed', category: 'battle', price: 1000, stage: ['spe', 2] },
  { id: 'x-accuracy', category: 'battle', price: 1000, stage: ['acc', 2] },
  { id: 'dire-hit', category: 'battle', price: 1000, crit: 2 },
  { id: 'guard-spec', category: 'battle', price: 1500, mist: 5 },
  { id: 'poke-doll', category: 'battle', price: 300, escape: true },
  { id: 'fluffy-tail', category: 'battle', price: 100, escape: true },
  { id: 'poke-toy', category: 'battle', price: 100, escape: true },
]
export const shopItem = (id: string) => SHOP_ITEMS.find((i) => i.id === id)

/** 진화 아이템 분류 */
export type EvoGroup = 'stone' | 'trade' | 'etc'
export const EVO_GROUP_LABELS: Record<EvoGroup, string> = {
  stone: '진화의 돌',
  trade: '통신교환 (연결의끈과 함께 쓰는 도구)',
  etc: '기타 진화 아이템',
}
export interface EvoItem {
  id: string
  group: EvoGroup
  price: number
  /** 추가 설명 (진화 대상 목록은 진화 데이터에서 자동으로 만듦) */
  note?: string
}

// 가격은 원작(PokeAPI) 기준. 원작에서 팔지 않거나 다른 조건을 대체하는 아이템은 임의로 정함
export const EVO_ITEMS: EvoItem[] = [
  { id: 'fire-stone', group: 'stone', price: 3000 },
  { id: 'water-stone', group: 'stone', price: 3000 },
  { id: 'thunder-stone', group: 'stone', price: 3000 },
  { id: 'leaf-stone', group: 'stone', price: 3000 },
  { id: 'ice-stone', group: 'stone', price: 3000 },
  { id: 'moon-stone', group: 'stone', price: 3000 },
  { id: 'sun-stone', group: 'stone', price: 3000 },
  { id: 'shiny-stone', group: 'stone', price: 3000 },
  { id: 'dusk-stone', group: 'stone', price: 3000 },
  { id: 'dawn-stone', group: 'stone', price: 3000 },
  { id: 'linking-cord', group: 'trade', price: 8000, note: '통신교환 대신 사용합니다. 도구를 지니고 교환하던 포켓몬은 그 도구도 함께 있어야 합니다.' },
  { id: 'kings-rock', group: 'trade', price: 5000 },
  { id: 'metal-coat', group: 'trade', price: 2000 },
  { id: 'dragon-scale', group: 'trade', price: 2000 },
  { id: 'up-grade', group: 'trade', price: 2000 },
  { id: 'dubious-disc', group: 'trade', price: 2000 },
  { id: 'protector', group: 'trade', price: 2000 },
  { id: 'electirizer', group: 'trade', price: 2000 },
  { id: 'magmarizer', group: 'trade', price: 2000 },
  { id: 'reaper-cloth', group: 'trade', price: 2000 },
  { id: 'deep-sea-tooth', group: 'trade', price: 2000 },
  { id: 'deep-sea-scale', group: 'trade', price: 2000 },
  { id: 'prism-scale', group: 'trade', price: 2000 },
  { id: 'sachet', group: 'trade', price: 2000 },
  { id: 'whipped-dream', group: 'trade', price: 2000 },
  { id: 'oval-stone', group: 'etc', price: 2000 },
  { id: 'razor-claw', group: 'etc', price: 5000 },
  { id: 'razor-fang', group: 'etc', price: 5000 },
  { id: 'tart-apple', group: 'etc', price: 2200 },
  { id: 'sweet-apple', group: 'etc', price: 2200 },
  { id: 'syrupy-apple', group: 'etc', price: 2200 },
  { id: 'cracked-pot', group: 'etc', price: 1600 },
  { id: 'unremarkable-teacup', group: 'etc', price: 1600 },
  { id: 'strawberry-sweet', group: 'etc', price: 500 },
  { id: 'black-augurite', group: 'etc', price: 3000 },
  { id: 'peat-block', group: 'etc', price: 3000 },
  { id: 'auspicious-armor', group: 'etc', price: 3000 },
  { id: 'malicious-armor', group: 'etc', price: 3000 },
  { id: 'metal-alloy', group: 'etc', price: 3000 },
  { id: 'scroll-of-darkness', group: 'etc', price: 10000 },
  { id: 'leaders-crest', group: 'etc', price: 3000, note: '원작: 대장의징표를 지닌 절각참을 3번 쓰러뜨림' },
  { id: 'gimmighoul-coin', group: 'etc', price: 20000, note: '원작: 코인 999개' },
]
export const evoItem = (id: string) => EVO_ITEMS.find((i) => i.id === id)

/** 변함없는돌: 한 번 사면 전투 화면에서 켜고 끌 수 있는 공용 기능 */
export const EVERSTONE_ITEM = { id: 'everstone', price: 3000 }

/** 육성 아이템 분류 */
export type TrainGroup = 'ev' | 'evDown' | 'exp' | 'pp' | 'move' | 'ability' | 'iv' | 'nature'
export const TRAIN_GROUP_LABELS: Record<TrainGroup, string> = {
  ev: '노력치 올리기 (영양제·깃털)',
  evDown: '노력치 내리기 (열매)',
  exp: '레벨·경험치',
  pp: 'PP 최대치',
  move: '기술 떠올리기',
  ability: '특성',
  iv: '개체값 (병뚜껑)',
  nature: '민트 (성격)',
}
export interface TrainItem {
  id: string
  group: TrainGroup
  price: number
  /** 노력치를 바꾸는 능력치 번호 (0 hp ~ 5 spe) */
  stat?: number
  /** 노력치 변화량 (내리기 열매는 음수) */
  ev?: number
  /** 경험치. 'level' = 다음 레벨까지 (이상한사탕) */
  exp?: number | 'level'
  /** 포인트업 = 1단계, 포인트맥스 = 최대(3단계)까지 */
  ppUp?: 1 | 3
  /** 특성캡슐 = 일반 특성끼리 교체, 특성패치 = 숨겨진 특성으로 (숨겨진 특성이면 일반 특성으로) */
  ability?: 'capsule' | 'patch'
  /** 은색병뚜껑 = 능력치 하나, 금색병뚜껑 = 전부 개체값 31 */
  iv?: 'one' | 'all'
  /** 민트: 바꿀 성격 */
  nature?: string
  /** 하트비늘: 잊은 기술 하나를 다시 장착 (전투 탭 → 기술에서 사용) */
  recall?: boolean
}

/** 잊은 기술을 되살리는 아이템 */
export const HEART_SCALE = 'heart-scale'

/** 노력치 기본 한계: 능력치 하나 / 합계 */
export const EV_STAT_MAX = 252
export const EV_TOTAL_MAX = 510

/** 영양제 1개당 노력치 / 깃털 1개당 노력치 / 열매 1개당 감소량 (8세대 이후 기준) */
export const VITAMIN_EV = 10
/** 병뚜껑을 쓸 수 있는 레벨 (9세대 기준) */
export const BOTTLE_CAP_LEVEL = 50
/** 포인트업 최대 단계 */
export const PP_UP_MAX = 3

// 가격은 원작(PokeAPI) 기준. 원작에서 돈으로 팔지 않는 아이템(민트·특성패치·병뚜껑)은 임의로 정함
export const TRAIN_ITEMS: TrainItem[] = [
  { id: 'hp-up', group: 'ev', price: 10000, stat: 0, ev: VITAMIN_EV },
  { id: 'protein', group: 'ev', price: 10000, stat: 1, ev: VITAMIN_EV },
  { id: 'iron', group: 'ev', price: 10000, stat: 2, ev: VITAMIN_EV },
  { id: 'calcium', group: 'ev', price: 10000, stat: 3, ev: VITAMIN_EV },
  { id: 'zinc', group: 'ev', price: 10000, stat: 4, ev: VITAMIN_EV },
  { id: 'carbos', group: 'ev', price: 10000, stat: 5, ev: VITAMIN_EV },
  { id: 'health-wing', group: 'ev', price: 300, stat: 0, ev: 1 },
  { id: 'muscle-wing', group: 'ev', price: 300, stat: 1, ev: 1 },
  { id: 'resist-wing', group: 'ev', price: 300, stat: 2, ev: 1 },
  { id: 'genius-wing', group: 'ev', price: 300, stat: 3, ev: 1 },
  { id: 'clever-wing', group: 'ev', price: 300, stat: 4, ev: 1 },
  { id: 'swift-wing', group: 'ev', price: 300, stat: 5, ev: 1 },
  { id: 'pomeg-berry', group: 'evDown', price: 80, stat: 0, ev: -VITAMIN_EV },
  { id: 'kelpsy-berry', group: 'evDown', price: 80, stat: 1, ev: -VITAMIN_EV },
  { id: 'qualot-berry', group: 'evDown', price: 80, stat: 2, ev: -VITAMIN_EV },
  { id: 'hondew-berry', group: 'evDown', price: 80, stat: 3, ev: -VITAMIN_EV },
  { id: 'grepa-berry', group: 'evDown', price: 80, stat: 4, ev: -VITAMIN_EV },
  { id: 'tamato-berry', group: 'evDown', price: 80, stat: 5, ev: -VITAMIN_EV },
  { id: 'rare-candy', group: 'exp', price: 10000, exp: 'level' },
  { id: 'exp-candy-xs', group: 'exp', price: 20, exp: 100 },
  { id: 'exp-candy-s', group: 'exp', price: 240, exp: 800 },
  { id: 'exp-candy-m', group: 'exp', price: 1000, exp: 3000 },
  { id: 'exp-candy-l', group: 'exp', price: 3000, exp: 10000 },
  { id: 'exp-candy-xl', group: 'exp', price: 10000, exp: 30000 },
  { id: 'pp-up', group: 'pp', price: 10000, ppUp: 1 },
  { id: 'pp-max', group: 'pp', price: 30000, ppUp: 3 },
  { id: HEART_SCALE, group: 'move', price: 1000, recall: true },
  { id: 'ability-capsule', group: 'ability', price: 10000, ability: 'capsule' },
  { id: 'ability-patch', group: 'ability', price: 50000, ability: 'patch' },
  { id: 'bottle-cap', group: 'iv', price: 20000, iv: 'one' },
  { id: 'gold-bottle-cap', group: 'iv', price: 100000, iv: 'all' },
  { id: 'lonely-mint', group: 'nature', price: 10000, nature: 'lonely' },
  { id: 'adamant-mint', group: 'nature', price: 10000, nature: 'adamant' },
  { id: 'naughty-mint', group: 'nature', price: 10000, nature: 'naughty' },
  { id: 'brave-mint', group: 'nature', price: 10000, nature: 'brave' },
  { id: 'bold-mint', group: 'nature', price: 10000, nature: 'bold' },
  { id: 'impish-mint', group: 'nature', price: 10000, nature: 'impish' },
  { id: 'lax-mint', group: 'nature', price: 10000, nature: 'lax' },
  { id: 'relaxed-mint', group: 'nature', price: 10000, nature: 'relaxed' },
  { id: 'modest-mint', group: 'nature', price: 10000, nature: 'modest' },
  { id: 'mild-mint', group: 'nature', price: 10000, nature: 'mild' },
  { id: 'rash-mint', group: 'nature', price: 10000, nature: 'rash' },
  { id: 'quiet-mint', group: 'nature', price: 10000, nature: 'quiet' },
  { id: 'calm-mint', group: 'nature', price: 10000, nature: 'calm' },
  { id: 'gentle-mint', group: 'nature', price: 10000, nature: 'gentle' },
  { id: 'careful-mint', group: 'nature', price: 10000, nature: 'careful' },
  { id: 'sassy-mint', group: 'nature', price: 10000, nature: 'sassy' },
  { id: 'timid-mint', group: 'nature', price: 10000, nature: 'timid' },
  { id: 'hasty-mint', group: 'nature', price: 10000, nature: 'hasty' },
  { id: 'jolly-mint', group: 'nature', price: 10000, nature: 'jolly' },
  { id: 'naive-mint', group: 'nature', price: 10000, nature: 'naive' },
  { id: 'serious-mint', group: 'nature', price: 10000, nature: 'serious' },
]
export const trainItem = (id: string) => TRAIN_ITEMS.find((i) => i.id === id)

// ---------- 특수 기능 아이템 (그 기능을 해금한 뒤에 판매) ----------
/** 원작에서 돈으로 팔지 않아 임의로 정한 가격 */
export const MEGA_STONE_PRICE = 30000
/** 원시회귀 구슬 (쪽빛구슬·주홍구슬) */
export const PRIMAL_ORB_PRICE = 50000
export const Z_CRYSTAL_PRICE = 20000
/** 테라피스 (원작 가격). 테라스탈 타입을 바꾸려면 TERA_SHARD_COST 개 필요 */
export const TERA_SHARD_PRICE = 500

/** 특수 기능 아이템이면 그 기능과 가격 */
export function gimmickItemOf(id: string): { gimmick: Gimmick; price: number } | undefined {
  if (id in Z_CRYSTALS) return { gimmick: 'z', price: Z_CRYSTAL_PRICE }
  if (teraShardType(id) && dexData.value?.items[id]) return { gimmick: 'tera', price: TERA_SHARD_PRICE }
  if (isMegaItem(id)) return { gimmick: 'mega', price: id.endsWith('-orb') ? PRIMAL_ORB_PRICE : MEGA_STONE_PRICE }
  return undefined
}

/** 상점에서 파는 특수 기능 아이템 (다이맥스는 아이템이 필요 없음) */
export function gimmickShopItems(g: Gimmick): string[] {
  const dex = dexData.value
  if (!dex) return []
  if (g === 'z') return Object.keys(Z_CRYSTALS).filter((id) => dex.items[id])
  if (g === 'tera') return Object.keys(dex.items).filter((id) => teraShardType(id))
  if (g === 'mega') {
    // 메가진화하는 포켓몬의 도감 번호 순
    const num = new Map(dex.index.map((p) => [p.id, p.num]))
    const forms = Object.values(dex.forms).filter((f) => f.item && dex.items[f.item])
    forms.sort((a, b) => (num.get(a.base) ?? 0) - (num.get(b.base) ?? 0))
    return [...new Set(forms.map((f) => f.item!))]
  }
  return []
}

/** 상점 판매 가격 (회복·볼·배틀·진화·육성·지닌 도구·기술머신·특수 기능) */
export const priceOf = (id: string): number | undefined =>
  shopItem(id)?.price ?? evoItem(id)?.price ?? trainItem(id)?.price ?? heldItem(id)?.price ?? tmPrice(id) ?? gimmickItemOf(id)?.price

/** 상점에 되파는 가격: 원작 가격과 상점 가격 중 낮은 쪽의 절반 (0 = 팔 수 없음) */
export function sellPrice(id: string): number {
  const cost = dexData.value?.items[id]?.cost ?? 0
  const price = priceOf(id)
  return Math.floor(Math.min(cost, price ?? Infinity) / 2)
}

/** 편의성 기능 */
export type ItemPerkId = `autoUse:${AutoUseKey}`
/**
 * 자동 전투 AI 개선: strong = 가장 강한 기술, smart = 특성까지 고려 (strong 필요),
 * ko = 확정 1타 기술 중 명중률·부가 효과 (smart 필요), pp = 확정 1타 기술 중 남은 PP (ko 필요)
 */
export type AiPerkId = 'ai:strong' | 'ai:smart' | 'ai:ko' | 'ai:pp'
/** 전투 화면 표시 개선: ratio = 비율, full = 현재/최대와 비율 (ratio 필요) / 상대 기술: list = 기술, pp = 남은 PP (list 필요) */
export type DisplayPerkId = `${'foeHp' | 'exp'}:${'ratio' | 'full'}` | `foeMoves:${'list' | 'pp'}` | 'foeItem:show'
/** 속도 가속: battle = 기술 선택 대기, search = 상대 포켓몬 찾는 시간. 1~4단계 */
export type SpeedKind = 'battle' | 'search'
export type SpeedLevel = 1 | 2 | 3 | 4
export type SpeedPerkId = `${SpeedKind}Speed:${SpeedLevel}`
/** 능력치 표시 개선: 1 종족값, 2 개체값, 3 노력치, 4 실능치 계산식 */
export type StatViewLevel = 1 | 2 | 3 | 4
export type StatViewPerkId = `statView:${StatViewLevel}`
/** 노력치 한계 돌파 1: 합계 한계(510) 없음 + 능력치별 노력치 획득 끄기 */
export type EvBreakPerkId = 'evBreak:1'
/** 차례대로 사는 기능 (먼저 사야 하는 기능이 있을 수 있음) */
export type ChainPerkId = AiPerkId | DisplayPerkId | SpeedPerkId | StatViewPerkId | EvBreakPerkId
/** 보스 등장 연출 생략 (켜고 끌 수 있음) */
export type ToggleUtilPerkId = 'bossIntro:skip' | 'autoCenter:pp'
export type DexPerkId = 'dex:reveal'
/** 판정 강화: 원래 게임 규칙보다 유리하게 판정하는 기능 */
export type JudgePerkId = 'judge:endHeal'
/** 지닌 도구를 포켓몬이 아닌 파티 슬롯에 묶음 */
export type SlotHeldPerkId = 'heldSlot:bind'
export type PerkId = ItemPerkId | ChainPerkId | ToggleUtilPerkId | DexPerkId | JudgePerkId | SlotHeldPerkId
export interface Perk {
  id: PerkId
  label: string
  desc: string
  price: number
}
/** 자동 구매 기능 가격 (자동 구매가 자동 사용과 따로 있던 시절에 산 것은 이 값을 돌려줌) */
export const AUTO_BUY_PRICE = 5000
const AUTO_USE_DESC: Record<AutoUseKey, string> = {
  pp: '자동 전투 중 PP가 0인 기술이 생기면 PP 회복 아이템을 씁니다. 가방에 없으면 돈이 있을 때 가장 싼 아이템을 사서 씁니다. (0인 기술이 2개 이상이면 전체 회복 아이템)',
  heal: '자동 전투 중 HP가 시작 기준 아래로 떨어지면 목표 HP를 한 개로 가장 잘 채우는 아이템을 씁니다. 가방에 없으면 돈이 있을 때 사서 씁니다. (턴 소모, 친밀도가 떨어지는 아이템은 사지 않음)',
  healAfter:
    '자동 전투 중 전투가 끝났을 때 HP가 시작 기준 아래면 돈이 가장 적게 드는 아이템 조합으로 목표 HP까지 채웁니다. 가방에 없으면 돈이 있을 때 사서 씁니다. (턴 소모 없음, 친밀도가 떨어지는 아이템은 사지 않음)',
  revive:
    '자동 전투 중 싸우던 포켓몬이 기절하면 바로 기절 회복 아이템을 씁니다. 가방에 있는 것 중 가장 싼 것을 쓰고, 없으면 고른 아이템을 사서 씁니다. 기절한 파티 포켓몬이 기준 이상이면 성스러운분으로 모두 살립니다.',
  reviveAfter:
    '자동 전투 중 전투가 끝났을 때 기절한 파티 포켓몬을 모두 살립니다. 가방에 있는 것 중 가장 싼 것을 쓰고, 없으면 고른 아이템을 사서 씁니다. 기절한 포켓몬이 기준 이상이면 성스러운분으로 모두 살립니다.',
  status:
    '자동 전투 중 상태이상에 걸리면 그 상태이상을 고치는 아이템 중 돈이 가장 적게 드는 것을 씁니다. 가방에 없으면 돈이 있을 때 사서 씁니다. (가진 것 먼저, 친밀도가 떨어지는 아이템은 사지 않음)',
  ball: '자동 전투 중 도감에 없는 야생 포켓몬을 만나면 몬스터볼을 던집니다. 지금 상대에 대한 보정 배율이 기준 이상인 볼 중 한 마리 잡는 데 돈이 가장 적게 드는(가성비가 좋은) 것을 쓰고, 가방에 없으면 돈이 있을 때 사서 씁니다. 기준에 닿는 볼이 없으면 배율이 가장 높은 볼을 씁니다. (가진 것 먼저, 마스터볼·파크볼은 쓰지 않음)',
}
const AUTO_USE_LABELS: Record<AutoUseKey, string> = {
  pp: 'PP 회복 아이템 자동 사용·구매',
  heal: '체력 회복 아이템 자동 사용·구매 (전투 중)',
  healAfter: '체력 회복 아이템 자동 사용·구매 (전투 후)',
  revive: '기절 회복 아이템 자동 사용·구매 (전투 중)',
  reviveAfter: '기절 회복 아이템 자동 사용·구매 (전투 후)',
  status: '상태이상 회복 아이템 자동 사용·구매',
  ball: '몬스터볼 자동 사용·구매 (자동 포획)',
}
export const PERKS: Perk[] = [
  ...AUTO_USE_KEYS.map((c) => ({
    id: `autoUse:${c}` as ItemPerkId,
    label: AUTO_USE_LABELS[c],
    desc: AUTO_USE_DESC[c],
    price: c === 'ball' ? 10000 : 3000,
  })),
]

/** 켜고 끄는 단독 편의성 기능 */
export const BOSS_INTRO_PERK = {
  id: 'bossIntro:skip' as ToggleUtilPerkId,
  label: '보스 등장 연출 생략',
  desc: '보스에 도전할 때 경고 화면 없이 바로 전투를 시작합니다. 사면 켜지며, 이곳에서 켜고 끌 수 있습니다.',
  price: 3000,
}

/** PP 자동 센터 귀환: 싸우는 포켓몬의 모든 기술 PP가 이 비율 미만이면 회복하러 감 */
export const AUTO_CENTER_PP_RATIO = 0.1
/** PP가 바닥났을 때 PP 회복 아이템과 센터 귀환 중 무엇을 먼저 쓸지 */
export type AutoCenterPriority = 'item' | 'center'
export const AUTO_CENTER_PERK = {
  id: 'autoCenter:pp' as ToggleUtilPerkId,
  label: 'PP 자동 센터 귀환',
  desc: '자동 전투 중 전투가 끝났을 때 싸우는 포켓몬의 모든 기술 PP가 10% 미만이면 자동으로 포켓몬센터에 다녀옵니다. (보스전 진행도는 유지)',
  price: 5000,
}

/** 도감 정보 공개: 포획하지 않은 포켓몬(조우하지 않은 포켓몬 포함)의 도감 정보를 모두 볼 수 있음 */
export const DEX_REVEAL_PERK = {
  id: 'dex:reveal' as DexPerkId,
  label: '도감 정보 공개',
  desc: '조우하지 않은 포켓몬을 포함해, 포획하지 않은 모든 포켓몬의 도감 정보(도트·타입·종족값·특성·출현 장소·기술)를 볼 수 있습니다.',
  price: 50000,
}

/** 판정 강화: 상대를 쓰러뜨려 전투가 끝난 턴에도 이로운 턴 종료 효과(회복·상태이상 치유)가 발동 */
export const END_HEAL_PERK = {
  id: 'judge:endHeal' as JudgePerkId,
  label: '턴 종료 회복 판정',
  desc:
    '원래는 상대를 쓰러뜨려 전투가 끝나면 그 턴의 턴 종료 효과가 발동하지 않지만, 이로운 효과만 발동하게 합니다. ' +
    '(먹다남은음식·검은오물(독 타입)·포이즌힐 회복, 탈피의 상태이상 치유. 화상·독 데미지 등 해로운 효과는 발동하지 않음)',
  price: 20000,
}

/** 자동 전투 AI 개선 (차례대로 구매) */
export interface ChainPerk<Id extends ChainPerkId = ChainPerkId> extends Omit<Perk, 'id'> {
  id: Id
  /** 먼저 사야 하는 기능 */
  requires?: Id
}
export type AiPerk = ChainPerk<AiPerkId>
export const AI_PERKS: AiPerk[] = [
  {
    id: 'ai:strong',
    label: '자동 전투 AI 개선 1',
    desc: '자동 전투에서 기술을 무작위로 고르는 대신, 상대에게 가장 강한 기술(상성·자속·명중률 반영)을 씁니다.',
    price: 5000,
  },
  {
    id: 'ai:smart',
    label: '자동 전투 AI 개선 2',
    desc:
      '특성까지 고려해 가장 강한 기술을 씁니다. (예: 부유 특성에는 틀깨기가 아니면 땅 타입 기술을 쓰지 않음) ' +
      '상대 특성이 여러 가지일 수 있으면 직접 써 보며 알게 된 정보로 판단합니다.',
    price: 20000,
    requires: 'ai:strong',
  },
  {
    id: 'ai:ko',
    label: '자동 전투 AI 개선 3',
    desc:
      '상대를 확정 1타로 쓰러뜨릴 수 있는 기술이 있으면, 그중 명중률이 가장 높은 기술을 씁니다. ' +
      '명중률이 같으면 자신에게 이롭고 상대에게 해로운 부가 효과(흡수 회복·능력 변화·상태이상)가 있는 기술을, 반동·자신 능력 하락이 있는 기술은 나중에 고릅니다.',
    price: 50000,
    requires: 'ai:smart',
  },
  {
    id: 'ai:pp',
    label: '자동 전투 AI 개선 4',
    desc: '확정 1타로 쓰러뜨릴 수 있는 기술 중 명중률이 같으면 남은 PP가 가장 많은 기술을 먼저 씁니다. (그다음 부가 효과)',
    price: 100000,
    requires: 'ai:ko',
  },
]

/** 전투 화면 표시 개선 (항목별로 차례대로 구매) */
export const DISPLAY_PERKS: ChainPerk<DisplayPerkId>[] = [
  {
    id: 'foeHp:ratio',
    label: '상대 포켓몬 HP 표시 개선 1',
    desc: '상대 포켓몬의 HP를 비율(%)로 표시합니다.',
    price: 3000,
  },
  {
    id: 'foeHp:full',
    label: '상대 포켓몬 HP 표시 개선 2',
    desc: '상대 포켓몬의 HP를 현재 체력/최대 체력과 비율(%)로 표시합니다.',
    price: 10000,
    requires: 'foeHp:ratio',
  },
  {
    id: 'exp:ratio',
    label: 'EXP 표시 개선 1',
    desc: '다음 레벨까지의 경험치를 비율(%)로 표시합니다.',
    price: 3000,
  },
  {
    id: 'exp:full',
    label: 'EXP 표시 개선 2',
    desc: '다음 레벨까지의 경험치를 현재 EXP/필요 EXP와 비율(%)로 표시합니다.',
    price: 10000,
    requires: 'exp:ratio',
  },
  {
    id: 'foeMoves:list',
    label: '상대 기술 표시 개선 1',
    desc:
      '전투 화면의 상대 HP 바 아래에 상대 포켓몬의 첫 번째 기술(타입 색·위력)을 표시합니다. 마우스를 올리면 분류·명중도 보입니다. ' +
      '나머지 기술은 ???로 가려지며, 파티에 위험예지 특성을 가진 포켓몬이 있으면 모든 기술을 볼 수 있습니다.',
    price: 5000,
  },
  {
    id: 'foeMoves:pp',
    label: '상대 기술 표시 개선 2',
    desc: '상대 포켓몬 기술의 남은 PP도 함께 표시합니다. (상대도 내 포켓몬과 같은 규칙으로 PP를 소모하며, 모두 떨어지면 발버둥을 씁니다)',
    price: 10000,
    requires: 'foeMoves:list',
  },
  {
    id: 'foeItem:show',
    label: '상대 도구 표시',
    desc:
      '전투 화면에 상대 포켓몬이 지속형 도구나 소모성 도구(나무열매·주얼·기합의띠 등)를 가졌는지 표시합니다. ' +
      '파티에 통찰 특성을 가진 포켓몬이 있으면 가진 도구를 정확히 알 수 있습니다.',
    price: 5000,
  },
]
/** 속도 가속 단계별 대기 시간 (0단계 = 기본) */
export const SPEED_DELAY_MS = [1000, 750, 500, 250, 0] as const
const SPEED_PRICES = [5000, 15000, 40000, 100000]
const SPEED_LEVELS: SpeedLevel[] = [1, 2, 3, 4]
const speedDesc = (kind: SpeedKind, lv: SpeedLevel) => {
  const ms = SPEED_DELAY_MS[lv]
  return kind === 'battle'
    ? ms
      ? `내 기술을 고르는 시간과 상대가 기술을 고르는 시간을 각각 ${ms / 1000}초로 줄입니다.`
      : '내 기술을 고르는 시간과 상대가 기술을 고르는 시간의 대기를 없앱니다.'
    : ms
      ? `다음 상대 포켓몬을 찾는 시간을 ${ms / 1000}초로 줄입니다.`
      : '다음 상대 포켓몬을 찾는 대기를 없앱니다.'
}
export const SPEED_PERKS: ChainPerk<SpeedPerkId>[] = (['battle', 'search'] as SpeedKind[]).flatMap((kind) =>
  SPEED_LEVELS.map((lv) => ({
    id: `${kind}Speed:${lv}` as SpeedPerkId,
    label: `${kind === 'battle' ? '배틀' : '탐색'} 속도 가속 ${lv}`,
    desc: speedDesc(kind, lv),
    price: SPEED_PRICES[lv - 1],
    requires: lv > 1 ? (`${kind}Speed:${lv - 1}` as SpeedPerkId) : undefined,
  })),
)

/** 능력치 표시 개선 (전투 탭 → 능력치, 차례대로 구매) */
export const STAT_VIEW_PERKS: ChainPerk<StatViewPerkId>[] = [
  {
    id: 'statView:1',
    label: '능력치 표시 개선 1',
    desc: '능력치 화면에 종족값을 표시합니다.',
    price: 3000,
  },
  {
    id: 'statView:2',
    label: '능력치 표시 개선 2',
    desc: '능력치 화면에 개체값을 표시합니다.',
    price: 5000,
    requires: 'statView:1',
  },
  {
    id: 'statView:3',
    label: '능력치 표시 개선 3',
    desc: '능력치 화면에 노력치를 표시합니다.',
    price: 5000,
    requires: 'statView:2',
  },
  {
    id: 'statView:4',
    label: '능력치 표시 개선 4',
    desc: '능력치 화면에 종족값·개체값·노력치·레벨·성격으로 실능치를 계산하는 식을 표시합니다.',
    price: 10000,
    requires: 'statView:3',
  },
]

/** 노력치 한계 돌파 1 */
export const EV_BREAK_PERK: ChainPerk<EvBreakPerkId> = {
  id: 'evBreak:1',
  label: '노력치 한계 돌파 1',
  desc:
    `노력치 합계 한계(${EV_TOTAL_MAX})가 사라져 모든 노력치를 한계(${EV_STAT_MAX})까지 올릴 수 있습니다. ` +
    '전투 탭 → 능력치에서 포켓몬별로 특정 능력치의 노력치를 전투로 얻지 않도록 끌 수 있습니다.',
  price: 50000,
}

export const CHAIN_PERKS: ChainPerk[] = [...AI_PERKS, ...DISPLAY_PERKS, ...STAT_VIEW_PERKS, ...SPEED_PERKS, EV_BREAK_PERK]

/** 노력치 한계 돌파 2: n번째 구매 가격 (여러 번 구매, 한계 돌파 1 필요) */
export const evBreak2Price = (n: number) => 100000 * 2 ** (n - 1)
/** 능력치 하나의 노력치 한계 (한계 돌파 2 구매 횟수 반영: 252, 504, 756, …) */
export const evStatCap = (breaks: number) => EV_STAT_MAX * (1 + breaks)

/** 체력 자동 회복 시작 기준·목표 선택지 (최대 HP 대비 %) */
export const AUTO_HEAL_STEPS = Array.from({ length: 20 }, (_, i) => (i + 1) * 5)
/** 체력 자동 회복 설정: HP가 start% 아래로 떨어지면 target%까지 채움 (target >= start) */
export interface AutoHealRange {
  start: number
  target: number
}
export const DEFAULT_AUTO_HEAL: Record<AutoHealKey, AutoHealRange> = {
  heal: { start: 50, target: 100 },
  healAfter: { start: 50, target: 100 },
}

/** 몬스터볼 자동 사용: 최소 보정 배율 선택지 (1 = 모든 볼) */
export const AUTO_BALL_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 8]
export const DEFAULT_AUTO_BALL = 1
/** 몬스터볼 자동 사용에 쓰지 않는 볼 */
export const NO_AUTO_BALLS = ['master-ball', 'park-ball']

/** 파티 전원을 살리는 기절 회복 아이템 (자동 사용은 따로 정한 기준일 때만) */
export const SACRED_ASH = 'sacred-ash'
/** 기절 회복 자동 사용 설정: item = 가방에 없을 때 살 아이템, ashAt = 기절한 포켓몬이 이만큼 이상이면 성스러운분 (0 = 안 씀) */
export interface AutoReviveCfg {
  item: string
  ashAt: number
}
/** 성스러운분 기준 선택지 (기절한 포켓몬 수, 0 = 안 씀) */
export const AUTO_ASH_STEPS = [0, 2, 3, 4, 5, 6] as const
export const DEFAULT_AUTO_REVIVE: Record<AutoReviveKey, AutoReviveCfg> = {
  revive: { item: 'revive', ashAt: 0 },
  reviveAfter: { item: 'revive', ashAt: 0 },
}
/** 기절 회복 자동 사용으로 살 수 있는 아이템 (성스러운분 제외) */
export const isAutoReviveItem = (id: string) => {
  const i = SHOP_ITEMS.find((x) => x.id === id)
  return !!i && i.category === 'revive' && !i.party
}

/** 체력 회복 아이템 자동 사용 후보: 가진 개수와 살 수 있는지 (가진 것은 돈이 들지 않음) */
export interface HealOption {
  id: string
  /** 이 포켓몬에게 회복되는 양 */
  amount: number
  price: number
  owned: number
  buyable: boolean
}

/** 아이템 한 개로 회복되는 양 */
export const healAmountOf = (i: ShopItem, max: number): number =>
  i.hp === 'full' ? max : i.hpFrac != null ? Math.floor(max * i.hpFrac) : (i.hp ?? 0)

/** 비용 비교: 먼저 쓰는 돈, 같으면 쓰는 아이템의 값어치 (가진 비싼 아이템을 아낌) */
type HealCost = { spent: number; value: number }
const cheaper = (a: HealCost, b: HealCost) => a.spent - b.spent || a.value - b.value
const costOf = (o: Pick<HealOption, 'price' | 'owned'>): HealCost => ({ spent: o.owned > 0 ? 0 : o.price, value: o.price })

/**
 * 가장 싼 아이템 하나 (상태이상 회복 자동 사용): 가진 것은 공짜, 아니면 살 수 있는 것 중 가장 싼 것
 * (같으면 값어치가 낮은 것). 쓸 수 있는 게 없으면 null
 */
export function pickCheapestItem(opts: Omit<HealOption, 'amount'>[]): string | null {
  const usable = opts.filter((o) => o.owned > 0 || o.buyable)
  return usable.sort((a, b) => cheaper(costOf(a), costOf(b)))[0]?.id ?? null
}

/** 몬스터볼 자동 사용 후보: 지금 상대에 대한 보정 배율·포획률 (0~1) */
export interface BallOption extends Omit<HealOption, 'amount'> {
  mult: number
  chance: number
}

/**
 * 몬스터볼 자동 사용: 보정 배율이 minMult 이상인 볼 중 한 마리 잡는 데 드는 돈(가격 ÷ 포획률)이
 * 가장 적은 것 (가진 것은 공짜, 같으면 값어치 ÷ 포획률이 낮은 것). 기준에 닿는 볼이 없으면 배율이 가장 높은 것.
 * 쓸 수 있는 게 없으면 null
 */
export function pickAutoBall(opts: BallOption[], minMult: number): string | null {
  return rankAutoBalls(opts, minMult)[0]?.id ?? null
}

/** 한 마리 잡는 데 드는 돈 (가진 볼은 0) */
export const ballSpentPerCatch = (o: BallOption): number => (o.owned > 0 ? 0 : o.price) / o.chance

/**
 * 몬스터볼 자동 사용 후보를 쓸 순서대로: 보정 배율이 minMult 이상인 볼을 가성비 순으로.
 * 기준에 닿는 볼이 없으면 쓸 수 있는 볼을 배율이 높은 순으로 (첫 번째만 실제로 씀)
 */
export function rankAutoBalls(opts: BallOption[], minMult: number): BallOption[] {
  const usable = opts.filter((o) => o.chance > 0 && (o.owned > 0 || o.buyable))
  const perCatch = (o: BallOption): HealCost => {
    const c = costOf(o)
    return { spent: c.spent / o.chance, value: c.value / o.chance }
  }
  const byCost = (a: BallOption, b: BallOption) => cheaper(perCatch(a), perCatch(b))
  const enough = usable.filter((o) => o.mult >= minMult).sort(byCost)
  if (enough.length) return enough
  return usable.sort((a, b) => b.mult - a.mult || byCost(a, b))
}

/**
 * 전투 중 자동 회복: 한 개로 부족한 HP를 모두 채우는 아이템 중 돈이 가장 적게 드는 것
 * (가진 것은 공짜, 같으면 값어치가 낮은 것). 다 채우는 게 없으면 가장 많이 회복하는 것
 */
export function pickHealInBattle(opts: HealOption[], need: number): HealOption | null {
  const usable = opts.filter((o) => o.amount > 0 && (o.owned > 0 || o.buyable))
  const enough = usable.filter((o) => o.amount >= need).sort((a, b) => cheaper(costOf(a), costOf(b)))
  if (enough.length) return enough[0]!
  return usable.sort((a, b) => b.amount - a.amount || cheaper(costOf(a), costOf(b)))[0] ?? null
}

/**
 * 전투 후 자동 회복: 부족한 HP를 모두 채우는 아이템 조합 중 돈이 가장 적게 드는 것
 * (가진 것은 공짜, 같으면 값어치 합이 낮은 것). 다 채울 수 없으면 가진 것으로 최대한 채움.
 * 반환: 쓸 아이템 id 목록 (가진 것 먼저)
 */
export function planHealAfterBattle(opts: HealOption[], need: number): string[] {
  if (need <= 0) return []
  type Node = { id: string; prev: Node | null }
  type Cell = HealCost & { plan: Node | null }
  // best[h] = HP를 h 이상 채우는 가장 싼 조합
  const best: (Cell | null)[] = Array.from({ length: need + 1 }, () => null)
  best[0] = { spent: 0, value: 0, plan: null }
  const relax = (h: number, o: HealOption, spent: number) => {
    const from = best[Math.max(0, h - o.amount)]
    if (!from) return
    const c: Cell = { spent: from.spent + spent, value: from.value + o.price, plan: { id: o.id, prev: from.plan } }
    const cur = best[h]
    if (!cur || cheaper(c, cur) < 0) best[h] = c
  }
  for (const o of opts) {
    if (o.amount <= 0) continue
    // 가진 것: 한 개씩 (필요한 만큼만)
    const copies = Math.min(o.owned, Math.ceil(need / o.amount))
    for (let k = 0; k < copies; k++) for (let h = need; h >= 1; h--) relax(h, o, 0)
    // 살 수 있는 것: 몇 개든
    if (o.buyable) for (let h = 1; h <= need; h++) relax(h, o, o.price)
  }
  // 다 채울 수 없으면 (살 수 없음) 가장 많이 채우는 조합
  let h = need
  while (h > 0 && !best[h]) h--
  const ids: string[] = []
  for (let n = best[h]!.plan; n; n = n.prev) ids.push(n.id)
  const left = new Map(opts.map((o) => [o.id, o.owned]))
  const bag: string[] = []
  const buy: string[] = []
  for (const id of ids) {
    const n = left.get(id) ?? 0
    if (n > 0) {
      left.set(id, n - 1)
      bag.push(id)
    } else buy.push(id)
  }
  return [...bag, ...buy]
}

/** 상점에서 여는 추가 기술칸 가격 (n번째 추가 칸) */
export const extraSlotPrice = (n: number) => 10000 * n
/**
 * 파티 슬롯 도구: 지닌 도구가 포켓몬이 아닌 파티 슬롯에 묶임.
 * 파티 6마리가 모두 도구 종류·같은 도구 개수를 최대로 늘렸을 때 살 수 있고,
 * 최대치(종류×개수)가 바뀌면 효과가 꺼져 새 최대치로 조건을 다시 채워야 함
 */
export const SLOT_HELD_PERK = {
  id: 'heldSlot:bind' as SlotHeldPerkId,
  label: '파티 슬롯 도구',
  desc: (kinds: number, stack: number) =>
    `지닌 도구를 포켓몬이 아닌 파티 슬롯에 장착합니다. 슬롯마다 도구를 ${kinds}종류, 같은 도구 ${stack}개까지 고를 수 있고, ` +
    '슬롯의 포켓몬을 바꾸면(싸우는 포켓몬 교체·도감으로 보내기·불러오기·포획) 새로 들어온 포켓몬이 그 슬롯의 도구를 그대로 지닙니다. ' +
    '비어 있는 슬롯의 도구도 그대로 남습니다. 새로 들어온 포켓몬이 원래 지니고 있던 도구는 가방에 들어갑니다.',
  price: 1000000,
}

/** 지닐 수 있는 도구 종류 n번째 추가 가격 (포켓몬별) */
export const heldKindPrice = (n: number) => 20000 * n
/** 같은 도구를 지닐 수 있는 개수 n번째 추가 가격 (포켓몬별) */
export const heldStackPrice = (n: number) => 50000 * n

/** 전투 승리 상금 */
export const prizeMoney = (level: number, boss: boolean) => level * (boss ? 100 : 10)
