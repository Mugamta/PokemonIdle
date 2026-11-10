export type TabId = 'battle' | 'items' | 'shop' | 'upgrade' | 'stage' | 'dex' | 'settings'

export const TABS: { id: TabId; label: string }[] = [
  { id: 'battle', label: '전투' },
  { id: 'items', label: '도구' },
  { id: 'shop', label: '도구상점' },
  { id: 'upgrade', label: '강화상점' },
  { id: 'stage', label: '스테이지' },
  { id: 'dex', label: '도감' },
  { id: 'settings', label: '설정' },
]
