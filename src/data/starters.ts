// 스타팅 포켓몬 후보 (1~9세대 스타팅 3종씩, 총 27종) 와 뽑기 가중치
// cost = 포켓로그(PokeRogue) 스타팅 비용. 출처: pagefaultgames/pokerogue src/data/balance/species/generation-0N.ts
import { NATURES } from './natures'

export const STARTERS: { id: string; cost: number }[] = [
  { id: 'bulbasaur', cost: 3 }, { id: 'charmander', cost: 3 }, { id: 'squirtle', cost: 3 },
  { id: 'chikorita', cost: 3 }, { id: 'cyndaquil', cost: 3 }, { id: 'totodile', cost: 3 },
  { id: 'treecko', cost: 3 }, { id: 'torchic', cost: 4 }, { id: 'mudkip', cost: 3 },
  { id: 'turtwig', cost: 3 }, { id: 'chimchar', cost: 3 }, { id: 'piplup', cost: 3 },
  { id: 'snivy', cost: 3 }, { id: 'tepig', cost: 3 }, { id: 'oshawott', cost: 3 },
  { id: 'chespin', cost: 3 }, { id: 'fennekin', cost: 3 }, { id: 'froakie', cost: 4 },
  { id: 'rowlet', cost: 3 }, { id: 'litten', cost: 3 }, { id: 'popplio', cost: 4 },
  { id: 'grookey', cost: 3 }, { id: 'scorbunny', cost: 4 }, { id: 'sobble', cost: 3 },
  { id: 'sprigatito', cost: 4 }, { id: 'fuecoco', cost: 4 }, { id: 'quaxly', cost: 4 },
]

/**
 * 가중치 = (1 / 비용)^WEIGHT_EXPONENT. 비용이 높을수록(강할수록) 덜 나옴.
 * 1이면 비용 3: 약 4.0%, 비용 4: 약 3.0% / 2면 약 4.2% : 2.4% / 0이면 모두 동일
 */
export const WEIGHT_EXPONENT = 1

const weightOf = (cost: number) => (1 / cost) ** WEIGHT_EXPONENT
const TOTAL = STARTERS.reduce((s, x) => s + weightOf(x.cost), 0)

/** 후보별 확률 (%) */
export const STARTER_CHANCES = STARTERS.map((s) => ({ ...s, chance: (weightOf(s.cost) / TOTAL) * 100 }))

export const STARTER_LEVEL = 5

export interface StarterRoll {
  id: string
  nature: string
  ivs: number[]
}

export function rollStarter(rand: () => number = Math.random): StarterRoll {
  let r = rand() * TOTAL
  let pick = STARTERS[STARTERS.length - 1]!
  for (const s of STARTERS) {
    r -= weightOf(s.cost)
    if (r < 0) {
      pick = s
      break
    }
  }
  const natures = Object.keys(NATURES)
  return {
    id: pick.id,
    nature: natures[Math.floor(rand() * natures.length)]!,
    ivs: Array.from({ length: 6 }, () => Math.floor(rand() * 32)),
  }
}
