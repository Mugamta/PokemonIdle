// 상점: 회복 아이템과 편의성 기능
import type { Status } from './battle'

/** 아이템 분류 (자동 사용/구매 단위) */
export type ItemCategory = 'heal' | 'pp' | 'status'
export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  heal: '체력 회복',
  pp: 'PP 회복',
  status: '상태이상 회복',
}

export interface ShopItem {
  /** 아이템 identifier (items.json 키, 이름·설명은 거기서) */
  id: string
  category: ItemCategory
  price: number
  /** HP 회복량. 'full' = 전부 */
  hp?: number | 'full'
  /** PP 회복량과 대상 (one = 가장 PP가 적은 기술 하나) */
  pp?: { amount: number | 'full'; target: 'one' | 'all' }
  /** 고치는 상태이상 */
  cures?: Status[]
}

const ALL_STATUS: Status[] = ['par', 'slp', 'frz', 'brn', 'psn', 'tox']

// 가격은 원작(PokeAPI) 기준, 회복량은 7세대 이후 기준
export const SHOP_ITEMS: ShopItem[] = [
  { id: 'potion', category: 'heal', price: 200, hp: 20 },
  { id: 'super-potion', category: 'heal', price: 700, hp: 60 },
  { id: 'hyper-potion', category: 'heal', price: 1500, hp: 120 },
  { id: 'max-potion', category: 'heal', price: 2500, hp: 'full' },
  { id: 'full-restore', category: 'heal', price: 3000, hp: 'full', cures: ALL_STATUS },
  { id: 'ether', category: 'pp', price: 1200, pp: { amount: 10, target: 'one' } },
  { id: 'max-ether', category: 'pp', price: 2000, pp: { amount: 'full', target: 'one' } },
  { id: 'elixir', category: 'pp', price: 3000, pp: { amount: 10, target: 'all' } },
  { id: 'max-elixir', category: 'pp', price: 4500, pp: { amount: 'full', target: 'all' } },
  { id: 'antidote', category: 'status', price: 200, cures: ['psn', 'tox'] },
  { id: 'paralyze-heal', category: 'status', price: 200, cures: ['par'] },
  { id: 'awakening', category: 'status', price: 200, cures: ['slp'] },
  { id: 'burn-heal', category: 'status', price: 200, cures: ['brn'] },
  { id: 'ice-heal', category: 'status', price: 200, cures: ['frz'] },
  { id: 'full-heal', category: 'status', price: 400, cures: ALL_STATUS },
]
export const shopItem = (id: string) => SHOP_ITEMS.find((i) => i.id === id)

/** 자동 구매 기본 품목 */
export const DEFAULT_AUTO_BUY: Record<ItemCategory, string> = {
  heal: 'potion',
  pp: 'ether',
  status: 'full-heal',
}

/** 편의성 기능 */
export type PerkId = `${'autoUse' | 'autoBuy'}:${ItemCategory}`
export interface Perk {
  id: PerkId
  label: string
  desc: string
  price: number
}
const CATS: ItemCategory[] = ['pp', 'heal', 'status']
const AUTO_USE_DESC: Record<ItemCategory, string> = {
  pp: '자동 전투 중 PP가 0인 기술이 생기면 PP 회복 아이템을 씁니다.',
  heal: '자동 전투 중 HP가 기준 아래로 떨어지면 회복 아이템을 씁니다.',
  status: '자동 전투 중 상태이상에 걸리면 회복 아이템을 씁니다.',
}
export const PERKS: Perk[] = CATS.flatMap((c) => [
  {
    id: `autoUse:${c}` as PerkId,
    label: `${CATEGORY_LABELS[c]} 아이템 자동 사용`,
    desc: AUTO_USE_DESC[c],
    price: 3000,
  },
  {
    id: `autoBuy:${c}` as PerkId,
    label: `${CATEGORY_LABELS[c]} 아이템 자동 구매`,
    desc: '고른 아이템이 다 떨어지면 돈이 있을 때 1개씩 자동으로 삽니다.',
    price: 5000,
  },
])

/** 체력 자동 사용 기준 선택지 (최대 HP 대비 %) */
export const AUTO_HEAL_THRESHOLDS = [25, 50, 75] as const

/** 상점에서 여는 추가 기술칸 가격 (n번째 추가 칸) */
export const extraSlotPrice = (n: number) => 10000 * n

/** 전투 승리 상금 */
export const prizeMoney = (level: number, boss: boolean) => level * (boss ? 100 : 10)
