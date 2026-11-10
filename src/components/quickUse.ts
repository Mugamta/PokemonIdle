// 상점에서 산 아이템을 바로 쓸 수 있으면 "바로 사용할까요?" 대화상자를 띄움
import { reactive } from 'vue'
import { STATUS_LABELS } from '../data/battle'
import { dexData, STAT_LABELS } from '../data/dex'
import { isMachine, isRecord } from '../data/items'
import { EVO_ITEMS, shopItem, trainItem } from '../data/shop'
import { speciesOf } from '../core/battle'
import { canLearnMachine, maxPpOf, useGameStore } from '../stores/game'
import { toast } from './toast'

export interface QuickUseOption {
  key: string
  label: string
  sub: string
  run: () => boolean
}

export const quickUse = reactive({ itemId: '' })

const NO_QUICK_CATS = new Set(['ball', 'battle'])

/** 지금 이 아이템을 쓸 수 있는 대상들 (없으면 빈 배열) */
export function quickUseOptions(itemId: string): QuickUseOption[] {
  const game = useGameStore()
  if (!itemId || game.faint || (game.items[itemId] ?? 0) <= 0) return []
  const name = (species: string) => speciesOf(species)?.ko ?? species
  const out: QuickUseOption[] = []

  // 회복·기절·PP·상태이상
  const def = shopItem(itemId)
  if (def && !NO_QUICK_CATS.has(def.category)) {
    if (def.party) {
      const i = game.party.findIndex((m) => m.hp === 0)
      if (i >= 0 && game.itemEffect(def, i)) {
        const names = game.party.filter((m) => m.hp === 0).map((m) => name(m.species))
        out.push({ key: 'party', label: '기절한 파티 전원', sub: names.join(', '), run: () => game.useItem(itemId, i) })
      }
      return out
    }
    game.party.forEach((m, i) => {
      if (!game.itemEffect(def, i)) return
      const max = game.memberMaxHp(m)
      const hp = m.hp ?? max
      const parts = [`HP ${hp}/${max}`]
      if (m.status) parts.push(STATUS_LABELS[m.status])
      if (def.pp) {
        const low = m.moves.filter((id) => {
          const left = m.pp?.[id]
          const full = maxPpOf(id, m)
          return left != null && full != null && left < full
        }).length
        parts.push(`PP 부족한 기술 ${low}개`)
      }
      out.push({ key: `${i}`, label: `${name(m.species)} Lv.${m.level}`, sub: parts.join(' · '), run: () => game.useItem(itemId, i) })
    })
    return out
  }

  // 육성 아이템 (하트비늘은 기술 되살리기용이라 제외)
  const train = trainItem(itemId)
  if (train && !train.recall) {
    game.party.forEach((m, i) => {
      const label = `${name(m.species)} Lv.${m.level}`
      if (train.ppUp) {
        for (const id of m.moves) {
          if (!game.trainEffect(m, train, id)) continue
          const move = dexData.value?.movesById[id]?.ko ?? id
          out.push({ key: `${i}:${id}`, label, sub: `${move} (PP ${maxPpOf(id, m) ?? '-'})`, run: () => game.useTrainItem(i, itemId, id) > 0 })
        }
        return
      }
      if (train.iv === 'one') {
        STAT_LABELS.forEach((stat, s) => {
          if (!game.trainEffect(m, train, s)) return
          out.push({ key: `${i}:${s}`, label, sub: `${stat} 개체값 ${m.ivs?.[s] ?? 0} → 31`, run: () => game.useTrainItem(i, itemId, s) > 0 })
        })
        return
      }
      if (!game.trainEffect(m, train)) return
      const sub = train.stat != null ? `${STAT_LABELS[train.stat]} 노력치 ${m.evs?.[train.stat] ?? 0}` : ''
      out.push({ key: `${i}`, label, sub, run: () => game.useTrainItem(i, itemId) > 0 })
    })
    return out
  }

  // 진화 아이템
  if (EVO_ITEMS.some((e) => e.id === itemId)) {
    game.party.forEach((m, i) => {
      for (const e of game.itemEvolutions(m, itemId)) {
        if (!game.canItemEvolve(m, e)) continue
        out.push({ key: `${i}:${e.to}`, label: `${name(m.species)} → ${name(e.to)}`, sub: '진화', run: () => game.useEvolutionItem(i, e) })
      }
    })
    return out
  }

  // 기술머신: 배울 수 있고 기술칸이 비어 있는 포켓몬
  if (isMachine(itemId)) {
    const move = dexData.value?.items[itemId]?.move
    if (!move) return out
    const moveName = dexData.value?.movesById[move]?.ko ?? move
    game.party.forEach((m, i) => {
      if ((m.learned ?? m.moves).includes(move) || !canLearnMachine(m, move) || m.moves.length >= game.slotsOf(m)) return
      out.push({ key: `${i}`, label: `${name(m.species)} Lv.${m.level}`, sub: `${moveName} 배우기${isRecord(itemId) ? ' (사라짐)' : ''}`, run: () => game.useMachine(i, itemId) })
    })
  }
  return out
}

/** 산 직후 호출: 쓸 대상이 있으면 대화상자를 띄움 */
export function offerQuickUse(itemId: string) {
  if (quickUseOptions(itemId).length) quickUse.itemId = itemId
}

/** 상점에서 아이템을 산 직후: 구매 알림을 띄우고, 바로 쓸 수 있으면 사용 여부를 물음 */
export function afterBuy(itemId: string, count: number) {
  const name = dexData.value?.items[itemId]?.ko ?? itemId
  toast(`${name} ${count}개를 구매했습니다`)
  offerQuickUse(itemId)
}
