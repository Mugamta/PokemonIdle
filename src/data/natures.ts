// 성격: 능력치 보정 (+10% / -10%). 출처: public/data/natures.json, names.ko.json
export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

export interface Nature {
  ko: string
  plus: StatKey | null
  minus: StatKey | null
}

export const NATURES: Record<string, Nature> = {
  adamant: { ko: '고집', plus: 'atk', minus: 'spa' },
  bashful: { ko: '수줍음', plus: null, minus: null },
  bold: { ko: '대담', plus: 'def', minus: 'atk' },
  brave: { ko: '용감', plus: 'atk', minus: 'spe' },
  calm: { ko: '차분', plus: 'spd', minus: 'atk' },
  careful: { ko: '신중', plus: 'spd', minus: 'spa' },
  docile: { ko: '온순', plus: null, minus: null },
  gentle: { ko: '얌전', plus: 'spd', minus: 'def' },
  hardy: { ko: '노력', plus: null, minus: null },
  hasty: { ko: '성급', plus: 'spe', minus: 'def' },
  impish: { ko: '장난꾸러기', plus: 'def', minus: 'spa' },
  jolly: { ko: '명랑', plus: 'spe', minus: 'spa' },
  lax: { ko: '촐랑', plus: 'def', minus: 'spd' },
  lonely: { ko: '외로움', plus: 'atk', minus: 'def' },
  mild: { ko: '의젓', plus: 'spa', minus: 'def' },
  modest: { ko: '조심', plus: 'spa', minus: 'atk' },
  naive: { ko: '천진난만', plus: 'spe', minus: 'spd' },
  naughty: { ko: '개구쟁이', plus: 'atk', minus: 'spd' },
  quiet: { ko: '냉정', plus: 'spa', minus: 'spe' },
  quirky: { ko: '변덕', plus: null, minus: null },
  rash: { ko: '덜렁', plus: 'spa', minus: 'spd' },
  relaxed: { ko: '무사태평', plus: 'def', minus: 'spe' },
  sassy: { ko: '건방', plus: 'spd', minus: 'spe' },
  serious: { ko: '성실', plus: null, minus: null },
  timid: { ko: '겁쟁이', plus: 'spe', minus: 'atk' },
}

/**
 * 실능치 계산 (3세대 이후 공식)
 * HP = ⌊(2×종족값 + 개체값 + ⌊노력치/4⌋) × 레벨/100⌋ + 레벨 + 10
 * 그 외 = ⌊(⌊(2×종족값 + 개체값 + ⌊노력치/4⌋) × 레벨/100⌋ + 5) × 성격보정⌋
 */
export function calcStats(base: number[], level: number, ivs: number[], evs: number[], nature: string, speciesId?: string): number[] {
  const n = NATURES[nature]
  return STAT_KEYS.map((key, i) => {
    const core = Math.floor(((2 * base[i]! + (ivs[i] ?? 0) + Math.floor((evs[i] ?? 0) / 4)) * level) / 100)
    if (key === 'hp') return speciesId === 'shedinja' ? 1 : core + level + 10
    const mod = n?.plus === key ? 1.1 : n?.minus === key ? 0.9 : 1
    return Math.floor((core + 5) * mod)
  })
}
