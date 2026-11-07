export type TabId = 'battle' | 'shop' | 'stage' | 'party' | 'dex' | 'settings'

export const TABS: { id: TabId; label: string }[] = [
  { id: 'battle', label: '전투' },
  { id: 'shop', label: '상점' },
  { id: 'stage', label: '스테이지' },
  { id: 'party', label: '파티' },
  { id: 'dex', label: '도감' },
  { id: 'settings', label: '설정' },
]
