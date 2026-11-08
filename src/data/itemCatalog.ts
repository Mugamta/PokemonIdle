// 도구 도감: 모든 도구를 분류하고, 이 게임에서 어떻게 쓰이는지 표시
import { BATTLE_HELD, POWER_ITEMS } from '../core/items'
import { dexData, type ItemInfo } from './dex'
import { BALL_NOTES, EXP_SHARE_ITEM, heldItem, isMachine, LUCKY_EGG, MACHO_BRACE, MONEY_ITEMS, SOOTHE_BELL, tmPrice } from './items'
import { EVERSTONE_ITEM, evoItem, priceOf, sellPrice, shopItem, trainItem } from './shop'

export type DexItemGroup =
  | 'medicine'
  | 'ball'
  | 'battle'
  | 'held'
  | 'berry'
  | 'train'
  | 'evolution'
  | 'machine'
  | 'valuable'
  | 'mega'
  | 'key'
  | 'etc'

export const DEX_ITEM_GROUPS: { id: DexItemGroup; label: string; cats: string[] }[] = [
  { id: 'medicine', label: '회복약', cats: ['healing', 'status-cures', 'revival', 'pp-recovery', 'flutes'] },
  { id: 'ball', label: '몬스터볼', cats: ['standard-balls', 'special-balls', 'apricorn-balls'] },
  { id: 'battle', label: '배틀용 도구·탐험 도구', cats: ['stat-boosts', 'miracle-shooter', 'spelunking'] },
  {
    id: 'held',
    label: '지닌 도구',
    cats: [
      'held-items', 'choice', 'type-enhancement', 'plates', 'species-specific', 'bad-held-items', 'effort-training',
      'training', 'jewels', 'memories', 'scarves',
    ],
  },
  { id: 'berry', label: '나무열매', cats: ['medicine', 'picky-healing', 'type-protection', 'in-a-pinch', 'other', 'baking-only', 'catching-bonus'] },
  { id: 'train', label: '육성 (영양제·민트·사탕 등)', cats: ['vitamins', 'nature-mints', 'effort-drop', 'species-candies'] },
  { id: 'evolution', label: '진화 도구', cats: ['evolution'] },
  { id: 'machine', label: '기술머신·기술레코드', cats: ['all-machines'] },
  { id: 'valuable', label: '귀중품·화석·수집품', cats: ['loot', 'collectibles', 'dex-completion'] },
  { id: 'mega', label: '메가스톤·Z크리스탈·다이맥스·테라스탈', cats: ['mega-stones', 'z-crystals', 'dynamax-crystals', 'tera-shard'] },
  { id: 'key', label: '중요한 물건', cats: ['gameplay', 'plot-advancement', 'event-items', 'unused', 'apricorn-box', 'data-cards'] },
  {
    id: 'etc',
    label: '기타 (메일·비료·요리 재료 등)',
    cats: ['all-mail', 'mulch', 'curry-ingredients', 'sandwich-ingredients', 'picnic', 'tm-materials'],
  },
]
const groupByCat = new Map(DEX_ITEM_GROUPS.flatMap((g) => g.cats.map((c) => [c, g.id] as const)))

export function dexItemGroup(id: string, info: ItemInfo): DexItemGroup {
  if (isMachine(id) || info.pocket === 'machines') return 'machine'
  // 이름이 열매인 도구는 열매로 (교배용·포획 보조 열매 포함)
  if (id.endsWith('-berry') && info.cat !== 'effort-drop') return 'berry'
  return groupByCat.get(info.cat ?? '') ?? (info.pocket === 'key' ? 'key' : 'etc')
}

/** 이 게임에서 효과가 있는 지닌 도구 */
export const isHeldEffective = (id: string) =>
  BATTLE_HELD.has(id) || id === LUCKY_EGG || id === SOOTHE_BELL || id === MACHO_BRACE || MONEY_ITEMS.has(id) || id in POWER_ITEMS

/** 이 게임에서의 쓰임 (도감 배지) */
export interface ItemUse {
  /** 상점에서 살 수 있음 */
  buy?: number
  /** 상점에 팔 수 있음 */
  sell?: number
  /** 효과 요약 (없으면 이 게임에서는 효과 없음) */
  roles: string[]
}
export function itemUse(id: string): ItemUse {
  const roles: string[] = []
  const s = shopItem(id)
  if (s) {
    if (s.category === 'ball') roles.push(`포획${BALL_NOTES[id] ? ` (${BALL_NOTES[id]})` : ''}`)
    else if (s.category === 'battle') roles.push(s.escape ? '야생 배틀에서 도망' : '전투 중 사용')
    else if (s.revive != null) roles.push('기절 회복')
    else roles.push('회복')
  }
  if (evoItem(id) || id === 'linking-cord') roles.push('진화')
  if (id === EVERSTONE_ITEM.id) roles.push('레벨업 진화 막기 (공용 기능)')
  if (trainItem(id)) roles.push('육성')
  if (isHeldEffective(id)) roles.push('지닌 도구')
  if (tmPrice(id) != null) roles.push('기술 가르치기')
  if (id === EXP_SHARE_ITEM.id) roles.push('경험치 나누기 (공용 기능)')
  const buy = priceOf(id) ?? (id === EXP_SHARE_ITEM.id ? EXP_SHARE_ITEM.price : undefined)
  const sell = sellPrice(id)
  if (!roles.length && sell > 0) roles.push('상점에 팔기')
  return { buy, sell: sell > 0 ? sell : undefined, roles }
}

/** 야생 포켓몬이 지니고 있는 도구 → 그 포켓몬 목록 */
let wildBy: { src: unknown; map: Map<string, { species: string; rate: number }[]> } | null = null
export function wildHolders(itemId: string): { species: string; rate: number }[] {
  const dex = dexData.value
  if (!dex) return []
  if (wildBy?.src !== dex) {
    const map = new Map<string, { species: string; rate: number }[]>()
    for (const [species, list] of Object.entries(dex.wildItems))
      for (const [item, rate] of list) (map.get(item) ?? map.set(item, []).get(item)!).push({ species, rate })
    wildBy = { src: dex, map }
  }
  return wildBy.map.get(itemId) ?? []
}

/** 지닌 도구 상점 목록에 있는지 */
export const inHeldShop = (id: string) => !!heldItem(id)
