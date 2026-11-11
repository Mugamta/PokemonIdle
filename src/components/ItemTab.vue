<script setup lang="ts">
// 도구 탭: 가방의 아이템 사용·지니게 하기·기술머신·진화·육성·테라스탈 타입·판매
import { computed, onMounted, ref, watch } from 'vue'
import { dexData, loadDex, STAT_LABELS, TYPE_COLORS } from '../data/dex'
import { NATURES } from '../data/natures'
import { evoItemUsage, type Evolution } from '../data/evolutions'
import {
  BOTTLE_CAP_LEVEL,
  CATEGORY_LABELS,
  EVO_ITEMS,
  PP_UP_MAX,
  SHOP_ITEMS,
  sellPrice,
  TRAIN_GROUP_LABELS,
  TRAIN_ITEMS,
  type AutoUseKey,
  type ItemCategory,
  type TrainGroup,
  type TrainItem,
} from '../data/shop'
import {
  canLearnMachine,
  evolutionCondText,
  heldIds,
  isHoldable,
  memberAbility,
  maxPpOf,
  teraTypeOf,
  useGameStore,
  type PartyMember,
} from '../stores/game'
import { TERA_SHARD_COST, teraShardOf, teraShardType } from '../core/gimmicks'
import { abilityInfo, hiddenAbility, normalAbilities } from '../core/abilities'
import { maxHpOf, ro } from '../core/battle'
import { BALL_NOTES, catchChance, isMachine, isRecord } from '../data/items'
import ItemIcon from './ItemIcon.vue'
import ScrollTabs from './ScrollTabs.vue'
import HScroll from './HScroll.vue'

const game = useGameStore()
onMounted(() => loadDex().catch(() => {}))

type Cat = 'use' | 'held' | 'tm' | 'evo' | 'train' | 'tera' | 'sell'
const cats = computed(
  () =>
    [
      { key: 'use', label: '사용' },
      { key: 'held', label: '지닌 도구' },
      { key: 'tm', label: '기술머신' },
      { key: 'evo', label: '진화' },
      { key: 'train', label: '육성' },
      ...(game.gimmickUnlocked('tera') ? [{ key: 'tera', label: '테라스탈' }] : []),
      { key: 'sell', label: '판매' },
    ] as { key: Cat; label: string }[],
)
const catPick = ref<Cat>('use')
const cat = computed<Cat>(() => (cats.value.some((c) => c.key === catPick.value) ? catPick.value : 'use'))
/** 대상 포켓몬을 고르는 분류 */
const needsTarget = computed(() => cat.value !== 'evo' && cat.value !== 'sell')

const species = (id: string) => dexData.value?.index.find((p) => p.id === id)
const moveInfo = (id: string) => dexData.value?.movesById[id]
const itemKo = (id: string) => dexData.value?.items[id]?.ko ?? id
const won = (n: number) => `${n.toLocaleString()}원`

// 사용할 파티 포켓몬 (회복·지닌 도구·기술머신·육성·테라스탈 공통)
const itemTarget = ref(0)
const targetMember = computed(() => game.party[itemTarget.value] ?? game.party[0] ?? null)
const targetIdx = computed(() => (targetMember.value ? game.party.indexOf(targetMember.value) : 0))
/** 최대 HP (싸우는 포켓몬이 다이맥스 중이면 2배) */
const maxHp = (m: PartyMember) => game.memberMaxHp(m)
const hpText = (m: PartyMember) => (m.hp === 0 ? '기절' : `HP ${m.hp ?? maxHp(m)}/${maxHp(m)}`)

/** 아이템 분류 제목 옆에 보일 자동 사용 토글 (체력·기절 회복은 전투 중·전투 후) */
const autoKeysOf = (c: string): AutoUseKey[] =>
  c === 'battle' ? [] : c === 'heal' ? ['heal', 'healAfter'] : c === 'revive' ? ['revive', 'reviveAfter'] : [c as AutoUseKey]

// 사용: 상점 아이템을 분류별로 (가지고 있는 것만)
const CATS: ItemCategory[] = ['heal', 'revive', 'pp', 'status', 'ball', 'battle']
/** 볼: 지금 상대의 예상 포획률 */
const ballChance = (id: string) => {
  const e = game.enemy
  const foe = game.enemyBattler()
  if (!e || !foe || e.boss) return null
  return catchChance(id, game.catchContext(), foe.hp, maxHpOf(foe))
}
/** 분류별 아이템 대상: 기절 회복은 고른 포켓몬이 기절하지 않았으면 기절한 첫 포켓몬에게 */
const catTarget = (c: ItemCategory) => {
  if (c === 'ball' || c === 'battle') return 0
  if (c === 'revive' && targetMember.value?.hp !== 0) {
    const i = game.party.findIndex((m) => m.hp === 0)
    if (i >= 0) return i
  }
  return targetIdx.value
}
const itemGroups = computed(() =>
  CATS.map((c) => {
    const target = catTarget(c)
    const who = game.party[target]
    return {
      cat: c,
      targetName: c === 'revive' && who ? (species(who.species)?.ko ?? who.species) : null,
      items: SHOP_ITEMS.filter((i) => i.category === c && (game.items[i.id] ?? 0) > 0).map((def) => {
        const chance = c === 'ball' ? ballChance(def.id) : null
        const usable = c === 'ball' ? chance != null : !!game.itemEffect(def, target)
        return { def, count: game.items[def.id]!, info: dexData.value?.items[def.id], usable, chance }
      }),
    }
  }).filter((g) => g.items.length),
)
function useShopItem(c: ItemCategory, id: string) {
  game.useItem(id, catTarget(c))
}
const turnNote = computed(() => {
  if (!game.party.length) return ''
  return game.enemy ? '전투 중 - 사용 시 턴 소모 O' : '비전투 - 사용 시 턴 소모 X'
})

// 지닌 도구: 고른 포켓몬이 지닌 도구(여러 종류·같은 도구 여러 개)와 가방의 지닐 수 있는 도구
const heldList = computed(() => {
  const m = targetMember.value
  if (!m) return []
  return heldIds(m).map((id) => ({ id, n: m.held![id]!, spent: m.heldSpent?.[id] ?? 0 }))
})
const heldLimits = computed(() => {
  const m = targetMember.value
  return m ? game.heldLimitsOf(m) : { kinds: 1, stack: 1 }
})
const holdables = computed(() =>
  Object.entries(game.items)
    .filter(([id, n]) => n > 0 && isHoldable(id))
    .map(([id, n]) => ({ id, n, info: dexData.value?.items[id] }))
    .sort((a, b) => (a.info?.ko ?? a.id).localeCompare(b.info?.ko ?? b.id)),
)
const heldPick = ref('')
watch(
  holdables,
  (list) => {
    if (!list.some((h) => h.id === heldPick.value)) heldPick.value = list[0]?.id ?? ''
  },
  { immediate: true },
)
/** 고른 도구를 더 지니게 할 수 없는 이유 (없으면 '') */
const giveBlock = computed(() => {
  const m = targetMember.value
  const id = heldPick.value
  if (!m || !id) return ''
  const n = m.held?.[id] ?? 0
  const { kinds, stack } = game.heldLimitsOf(m)
  const more = game.slotHeldActive ? '' : ' 강화상점에서 늘릴 수 있습니다.'
  if (n > 0 && n >= stack) return `같은 도구는 ${stack}개까지 지닐 수 있습니다.${more}`
  if (!n && heldIds(m).length >= kinds) return `도구는 ${kinds}종류까지 지닐 수 있습니다.${more}`
  return ''
})

// 기술머신: 가지고 있는 기술머신과 고른 포켓몬이 배울 수 있는지
const machines = computed(() => {
  const m = targetMember.value
  return Object.entries(game.items)
    .filter(([id, n]) => n > 0 && isMachine(id))
    .map(([id, n]) => {
      const info = dexData.value?.items[id]
      const move = info?.move ?? ''
      const knows = !!m && (m.learned ?? m.moves).includes(move)
      const can = !!m && !!move && canLearnMachine(m, move)
      return { id, n, name: info?.ko ?? id, move, moveInfo: moveInfo(move), knows, can, record: isRecord(id) }
    })
    .sort((a, b) => Number(b.can && !b.knows) - Number(a.can && !a.knows) || a.name.localeCompare(b.name, 'ko', { numeric: true }))
})
/** 기술머신: 기술칸이 가득 찼을 때 대신 잊을 기술 */
const tmFull = computed(() => !!targetMember.value && targetMember.value.moves.length >= game.slotsOf(targetMember.value))
const tmReplace = ref('')
watch(
  () => targetMember.value?.moves.join(),
  () => {
    const moves = targetMember.value?.moves ?? []
    if (!moves.includes(tmReplace.value)) tmReplace.value = moves[0] ?? ''
  },
  { immediate: true },
)

// 진화 아이템: 가지고 있는 것만, 파티에서 그 아이템으로 진화할 수 있는 포켓몬과 함께
const evoItems = computed(() =>
  EVO_ITEMS.filter((def) => (game.items[def.id] ?? 0) > 0).map((def) => {
    const info = dexData.value?.items[def.id]
    const targets = game.party.flatMap((m, i) =>
      game.itemEvolutions(m, def.id).map((e) => ({
        i,
        e,
        from: species(m.species)?.ko ?? m.species,
        to: species(e.to)?.ko ?? e.to,
        cond: evolutionCondText(e),
        ok: game.canItemEvolve(m, e),
      })),
    )
    return {
      def,
      count: game.items[def.id]!,
      name: info?.ko ?? def.id,
      usage: evoItemUsage(def.id)
        .map((u) => `${u.fromName} → ${u.toName}`)
        .join(', '),
      note: def.note ?? '',
      targets,
    }
  }),
)
function evolveWith(i: number, e: Evolution) {
  game.useEvolutionItem(i, e)
}

// 육성 아이템: 가지고 있는 것만, 고른 파티 포켓몬에게 (턴 소모 없음)
const TRAIN_GROUPS = Object.keys(TRAIN_GROUP_LABELS) as TrainGroup[]
const trainMember = targetMember
/** 아이템별로 고른 대상 (포인트업 = 기술 id, 은색병뚜껑 = 능력치 번호) */
const trainPick = ref<Record<string, number | string>>({})
watch(itemTarget, () => (trainPick.value = {}))
const trainInfo = computed(() => {
  const m = trainMember.value
  if (!m) return ''
  const evTotal = (m.evs ?? []).reduce((a, b) => a + b, 0)
  const cap = Number.isFinite(game.evTotalCap) ? `${evTotal}/${game.evTotalCap}` : `${evTotal} (능력치 하나 ${game.evStatCap}까지)`
  return `Lv.${m.level} · ${NATURES[m.nature]?.ko ?? '-'} · 특성 ${abilityInfo(memberAbility(m))?.ko ?? '-'} · 노력치 합계 ${cap}`
})
const trainGroups = computed(() => {
  const m = trainMember.value
  return TRAIN_GROUPS.map((g) => ({
    g,
    items: TRAIN_ITEMS.filter((i) => i.group === g && !i.recall && (game.items[i.id] ?? 0) > 0).map((def) => {
      let options: { value: number | string; label: string }[] | null = null
      if (m && def.ppUp)
        options = m.moves.map((id) => {
          const ups = m.ppUps?.[id] ?? 0
          return { value: id, label: `${moveInfo(id)?.ko ?? id} (PP ${maxPpOf(id, m) ?? '-'} · ${ups}/${PP_UP_MAX})` }
        })
      if (m && def.iv === 'one') options = STAT_LABELS.map((l, i) => ({ value: i, label: `${l} (${m.ivs?.[i] ?? 0})` }))
      const saved = trainPick.value[def.id]
      const picked =
        options && (saved == null || !options.some((o) => o.value === saved))
          ? (options.find((o) => m && game.trainEffect(m, def, o.value)) ?? options[0])?.value
          : saved
      const usable = !!m && !!game.trainEffect(m, def, picked)
      const why = !usable && m ? trainWhy(m, def) : ''
      return {
        def,
        count: game.items[def.id]!,
        info: dexData.value?.items[def.id],
        options,
        picked,
        usable,
        why,
        multi: g === 'ev' || g === 'evDown' || g === 'exp',
      }
    }),
  })).filter((x) => x.items.length)
})
/** 육성 아이템을 쓸 수 없는 이유 (화면에 표시) */
function trainWhy(m: PartyMember, def: TrainItem): string {
  const name = species(m.species)?.ko ?? m.species
  const abil = (id: string | null) => abilityInfo(id ?? '')?.ko ?? id ?? '-'
  if (def.iv && m.level < BOTTLE_CAP_LEVEL) return `레벨 ${BOTTLE_CAP_LEVEL} 이상만 쓸 수 있습니다.`
  if (def.ability === 'capsule') {
    if (m.hiddenAbility) return `${name}의 특성은 숨겨진 특성이라 특성캡슐로 바꿀 수 없습니다. (특성패치로 일반 특성으로 바꿀 수 있음)`
    const normal = normalAbilities(m.species)
    if (normal.length < 2) return `${name}의 일반 특성은 ${abil(normal[0] ?? null)} 하나뿐이라 바꿀 수 없습니다.`
  }
  if (def.ability === 'patch' && !m.hiddenAbility) {
    const hidden = hiddenAbility(m.species)
    if (!hidden) return `${name}에게는 숨겨진 특성이 없습니다.`
    if (hidden === memberAbility(m)) return `이미 숨겨진 특성(${abil(hidden)})입니다.`
  }
  if (def.exp != null && m.level >= 100) return '이미 레벨 100입니다.'
  if (def.nature && m.nature === def.nature) return '이미 이 성격입니다.'
  if (def.ev != null) return def.ev > 0 ? '이 능력치의 노력치를 더 올릴 수 없습니다.' : '노력치가 0이고 친밀도도 최대입니다.'
  return '지금은 효과가 없습니다.'
}
function useTrain(id: string, target: number | string | undefined, times: number) {
  game.useTrainItem(game.party.indexOf(trainMember.value!), id, target, times)
}

// 테라스탈 타입: 테라피스 TERA_SHARD_COST 개로 바꿈 (테라스탈 해금 후)
const typeKo = (t: string) => dexData.value?.types[t] ?? t
const teraNow = computed(() => (targetMember.value ? teraTypeOf(targetMember.value) : null))
const teraShards = computed(() =>
  Object.entries(game.items)
    .filter(([id, n]) => n > 0 && teraShardType(id))
    .map(([id, n]) => ({ id, n, type: teraShardType(id)! }))
    .sort((a, b) => b.n - a.n),
)
const teraLocked = computed(() => targetIdx.value === 0 && game.gimmickActive?.kind === 'tera')

// 판매: 가방에 있고 팔 수 있는 아이템
const sellRows = computed(() =>
  Object.entries(game.items)
    .filter(([id, n]) => n > 0 && sellPrice(id) > 0)
    .map(([id, n]) => ({ id, n, price: sellPrice(id), name: itemKo(id) }))
    .sort((a, b) => a.name.localeCompare(b.name)),
)
function sell(id: string, n: number) {
  if (n > 1 && !confirm(`${itemKo(id)} ${n}개를 ${won(sellPrice(id) * n)}에 팔까요?`)) return
  game.sellItem(id, n)
}
</script>

<template>
  <div class="items-tab">
    <div class="tabs-head">
      <ScrollTabs :items="cats" :model-value="cat" @update:model-value="catPick = $event as Cat" />
    </div>
    <p v-if="!dexData" class="msg">불러오는 중…</p>
    <section v-else class="card">
      <template v-if="needsTarget">
        <p v-if="cat === 'use'" class="turn-note">{{ turnNote }}</p>
        <p v-if="!game.party.length" class="msg">파티에 포켓몬이 없습니다.</p>
        <HScroll v-else class="members" :active="itemTarget">
          <button
            v-for="(m, i) in game.party"
            :key="i"
            type="button"
            :class="{ active: targetMember === m, fainted: m.hp === 0 }"
            @click="itemTarget = i"
          >
            <span v-if="i === 0" class="lead-mark" title="싸우는 포켓몬">★</span>
            {{ species(m.species)?.ko ?? m.species }} <small>{{ hpText(m) }}</small>
          </button>
        </HScroll>
        <p v-if="targetMember && cat === 'train'" class="item-text train-info">{{ trainInfo }}</p>
      </template>

      <template v-if="cat === 'use'">
        <template v-for="g in itemGroups" :key="g.cat">
          <h4 class="sec">
            {{ CATEGORY_LABELS[g.cat] }}
            <small v-if="g.cat === 'ball'">야생 포켓몬에게</small>
            <small v-else-if="g.cat === 'battle'">싸우는 포켓몬에게 · 전투 중에만</small>
            <small v-else-if="g.cat === 'revive'">{{ game.party.some((m) => m.hp === 0) ? `${g.targetName}에게` : '기절한 포켓몬이 없음' }}</small>
            <template v-for="k in autoKeysOf(g.cat)" :key="k">
              <label v-if="game.hasPerk(`autoUse:${k}`)" class="auto">
                <input
                  type="checkbox"
                  :checked="!!game.autoUse[k]"
                  @change="game.setAutoUse(k, ($event.target as HTMLInputElement).checked)"
                />
                {{ k === 'heal' || k === 'revive' ? '자동 사용 (전투 중)' : k === 'healAfter' || k === 'reviveAfter' ? '자동 사용 (전투 후)' : '자동 사용' }}
              </label>
            </template>
          </h4>
          <ul class="rows">
            <li v-for="it in g.items" :key="it.def.id" class="item-row">
              <div class="item-main">
                <ItemIcon :id="it.def.id" />
                <span class="grow">
                  {{ it.info?.ko ?? it.def.id }} <span class="muted">×{{ it.count }}</span>
                  <span v-if="it.chance != null" class="muted chance">포획률 약 {{ Math.round(it.chance * 100) }}%</span>
                </span>
                <button
                  type="button"
                  class="small-btn"
                  :disabled="!it.usable || !!game.faint"
                  :title="it.usable ? '' : g.cat === 'ball' ? (game.enemy?.trainer ? '트레이너의 포켓몬은 잡을 수 없습니다' : game.enemy?.boss ? '보스는 잡을 수 없습니다' : '야생 포켓몬과 싸울 때만 던질 수 있습니다') : '지금은 효과가 없습니다'"
                  @click="useShopItem(g.cat, it.def.id)"
                >
                  {{ g.cat === 'ball' ? '던지기' : '사용' }}
                </button>
              </div>
              <p v-if="g.cat === 'ball' && BALL_NOTES[it.def.id]" class="item-text">{{ BALL_NOTES[it.def.id] }}</p>
              <p v-else-if="it.info?.text" class="item-text">{{ it.info.text }}</p>
            </li>
          </ul>
        </template>
        <p v-if="!itemGroups.length" class="msg">사용할 수 있는 아이템이 없습니다. 도구상점에서 살 수 있습니다.</p>
      </template>
      <template v-else-if="cat === 'held'">
        <template v-if="targetMember">
          <h4 class="sec">
            {{ game.slotHeldActive ? `${targetIdx + 1}번 슬롯 도구` : '지닌 도구' }}
            <small>{{ species(targetMember.species)?.ko }} · {{ heldList.length }}/{{ heldLimits.kinds }}종류 · 같은 도구 {{ heldLimits.stack }}개까지</small>
          </h4>
          <div v-for="h in heldList" :key="h.id" class="held-box">
            <ItemIcon :id="h.id" />
            <span class="grow">
              {{ itemKo(h.id) }} <strong v-if="h.n > 1">×{{ h.n }}</strong>
              <span v-if="h.spent" class="muted"
                >({{ h.n > 1 ? `${h.spent}개 ` : '' }}이번 전투에서 사용함 · 다음 전투에 가방에 있으면 다시 지님)</span
              >
            </span>
            <button type="button" class="small-btn" :disabled="!!game.faint" @click="game.takeHeld(targetIdx, h.id, 1)">
              {{ h.n > 1 ? '1개 빼기' : '가방에 넣기' }}
            </button>
            <button v-if="h.n > 1" type="button" class="small-btn" :disabled="!!game.faint" @click="game.takeHeld(targetIdx, h.id)">모두 빼기</button>
          </div>
          <p v-if="game.slotHeldActive" class="item-text">파티 슬롯 도구: 이 슬롯에 다른 포켓몬이 들어와도 도구는 슬롯에 그대로 남습니다.</p>
          <div v-if="!heldList.length" class="held-box"><span class="muted grow">지니고 있는 도구가 없습니다.</span></div>
          <div v-if="holdables.length" class="held-box">
            <select v-model="heldPick" class="train-select grow">
              <option v-for="h in holdables" :key="h.id" :value="h.id">{{ h.info?.ko ?? h.id }} (×{{ h.n }})</option>
            </select>
            <button
              type="button"
              class="small-btn"
              :disabled="!heldPick || !!game.faint || !game.canGiveHeld(targetIdx, heldPick)"
              @click="game.giveHeld(targetIdx, heldPick)"
            >
              {{ targetMember.held?.[heldPick] ? '1개 더 지니기' : '지니게 하기' }}
            </button>
          </div>
          <p v-if="giveBlock" class="item-text">{{ giveBlock }}</p>
          <p v-if="heldPick && dexData.items[heldPick]?.text" class="item-text">{{ dexData.items[heldPick]!.text }}</p>
          <p v-if="!holdables.length" class="item-text">가방에 지닐 수 있는 도구가 없습니다. 상점의 지속형·소모성 도구를 사거나 야생 포켓몬에게서 얻을 수 있습니다.</p>
        </template>
      </template>
      <template v-else-if="cat === 'tm'">
        <template v-if="machines.length && targetMember">
          <h4 class="sec">기술머신 <small>턴을 소모하지 않습니다</small></h4>
          <div v-if="tmFull" class="held-box">
            <span class="muted">기술칸이 가득 찼습니다. 대신 잊을 기술</span>
            <select v-model="tmReplace" class="train-select grow">
              <option v-for="id in targetMember.moves" :key="id" :value="id">{{ moveInfo(id)?.ko ?? id }}</option>
            </select>
          </div>
          <ul class="rows">
            <li v-for="t in machines" :key="t.id" class="item-row">
              <div class="item-main">
                <ItemIcon :id="t.id" />
                <span class="grow">
                  {{ t.moveInfo?.ko ?? t.move }} <span class="muted">{{ t.name }}<template v-if="t.record"> ×{{ t.n }}</template></span>
                </span>
                <span v-if="t.moveInfo" class="type" :style="{ background: TYPE_COLORS[t.moveInfo.type] }">{{ dexData.types[t.moveInfo.type] }}</span>
                <button
                  type="button"
                  class="small-btn"
                  :disabled="!t.can || t.knows || !!game.faint"
                  :title="t.knows ? '이미 배운 기술입니다' : t.can ? '' : '이 포켓몬은 배울 수 없습니다'"
                  @click="game.useMachine(targetIdx, t.id, tmFull ? tmReplace : undefined)"
                >
                  {{ t.knows ? '배움' : t.can ? '가르치기' : '못 배움' }}
                </button>
              </div>
            </li>
          </ul>
        </template>
        <p v-if="!machines.length" class="msg">가지고 있는 기술머신이 없습니다. 도구상점에서 살 수 있습니다.</p>
      </template>
      <template v-else-if="cat === 'evo'">
        <template v-if="evoItems.length">
          <h4 class="sec">진화 <small>턴을 소모하지 않습니다</small></h4>
          <ul class="rows">
            <li v-for="it in evoItems" :key="it.def.id" class="item-row">
              <div class="item-main">
                <ItemIcon :id="it.def.id" />
                <span class="grow">{{ it.name }} <span class="muted">×{{ it.count }}</span></span>
              </div>
              <p v-if="it.note" class="item-text">{{ it.note }}</p>
              <div class="evo-targets">
                <span v-if="!it.targets.length" class="muted">파티에 이 아이템으로 진화하는 포켓몬이 없습니다. (진화: {{ it.usage }})</span>
                <button
                  v-for="t in it.targets"
                  :key="`${t.i}-${t.e.to}`"
                  type="button"
                  class="small-btn"
                  :disabled="!t.ok || !!game.faint"
                  :title="t.cond"
                  @click="evolveWith(t.i, t.e)"
                >
                  {{ t.from }} → {{ t.to }}<small v-if="!t.ok"> ({{ t.cond }})</small>
                </button>
              </div>
            </li>
          </ul>
        </template>
        <p v-if="!evoItems.length" class="msg">가지고 있는 진화 아이템이 없습니다.</p>
      </template>
      <template v-else-if="cat === 'train'">
        <template v-if="trainGroups.length">
          <h4 class="sec">육성 <small>턴을 소모하지 않습니다 · {{ species(targetMember?.species ?? '')?.ko }}</small></h4>
          <template v-for="g in trainGroups" :key="g.g">
            <h5 class="train-sec">{{ TRAIN_GROUP_LABELS[g.g] }}</h5>
            <ul class="rows">
              <li v-for="it in g.items" :key="it.def.id" class="item-row">
                <div class="item-main">
                  <ItemIcon :id="it.def.id" />
                  <span class="grow">{{ it.info?.ko ?? it.def.id }} <span class="muted">×{{ it.count }}</span></span>
                  <select
                    v-if="it.options"
                    class="train-select"
                    :value="it.picked"
                    @change="trainPick[it.def.id] = it.options.find((o) => String(o.value) === ($event.target as HTMLSelectElement).value)!.value"
                  >
                    <option v-for="o in it.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                  <button
                    type="button"
                    class="small-btn"
                    :disabled="!it.usable || !!game.faint"
                    :title="it.why"
                    @click="useTrain(it.def.id, it.picked, 1)"
                  >
                    사용
                  </button>
                  <button
                    v-if="it.multi && it.count > 1"
                    type="button"
                    class="small-btn"
                    :disabled="!it.usable || !!game.faint"
                    :title="it.why || '효과가 있는 동안 최대 10개까지 사용합니다'"
                    @click="useTrain(it.def.id, it.picked, 10)"
                  >
                    10개
                  </button>
                </div>
                <p v-if="it.why" class="item-text why">{{ it.why }}</p>
                <p v-if="it.info?.text" class="item-text">{{ it.info.text }}</p>
              </li>
            </ul>
          </template>
        </template>
        <p v-if="!trainGroups.length" class="msg">가지고 있는 육성 아이템이 없습니다.</p>
      </template>
      <template v-else-if="cat === 'tera'">
        <template v-if="targetMember && game.gimmickUnlocked('tera')">
          <h4 class="sec">테라스탈 타입 <small>{{ species(targetMember.species)?.ko }} · 테라피스 {{ TERA_SHARD_COST }}개로 변경 · 턴을 소모하지 않습니다</small></h4>
          <div class="held-box">
            <span class="grow">
              지금
              <span v-if="teraNow" class="type" :style="{ background: TYPE_COLORS[teraNow] }">{{ typeKo(teraNow) }}</span>
              <span v-if="teraLocked" class="muted"> (테라스탈 중에는 바꿀 수 없습니다)</span>
            </span>
          </div>
          <p v-if="!teraShards.length" class="item-text">가방에 테라피스가 없습니다. 상점 → 특수 기능에서 살 수 있습니다.</p>
          <div v-else class="evo-targets">
            <button
              v-for="s in teraShards"
              :key="s.id"
              type="button"
              class="small-btn"
              :disabled="s.n < TERA_SHARD_COST || s.type === teraNow || teraLocked || !!game.faint"
              :title="s.n < TERA_SHARD_COST ? `테라피스가 ${TERA_SHARD_COST - s.n}개 더 필요합니다` : ''"
              @click="game.setTeraType(targetIdx, s.type)"
            >
              <ItemIcon :id="teraShardOf(s.type)" :size="16" />
              {{ ro(typeKo(s.type)) }} ({{ s.n }}/{{ TERA_SHARD_COST }})
            </button>
          </div>
        </template>
      </template>
      <template v-else-if="cat === 'sell'">
        <p v-if="!sellRows.length" class="msg">팔 수 있는 아이템이 없습니다. 야생 포켓몬이 지니고 있던 도구(금구슬 등)는 비싸게 팔 수 있습니다.</p>
        <ul v-else class="rows">
          <li v-for="r in sellRows" :key="r.id" class="item-row">
            <div class="item-main">
              <ItemIcon :id="r.id" lazy />
              <span class="grow">{{ r.name }} <span class="muted">보유 {{ r.n }}</span></span>
              <span class="price">{{ won(r.price) }}</span>
              <button type="button" class="small-btn" @click="sell(r.id, 1)">1개</button>
              <button v-if="r.n > 1" type="button" class="small-btn" @click="sell(r.id, r.n)">모두</button>
            </div>
          </li>
        </ul>
        <p class="item-text">원작 가격의 절반에 팝니다. (상점에서 산 가격보다 원작 가격이 비싸면 상점 가격의 절반)</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.tabs-head {
  position: sticky;
  top: -12px;
  z-index: 1;
  margin: -12px -12px 10px;
}

.price {
  color: #ffcb05;
  font-size: 13px;
  white-space: nowrap;
}

.item-text.why {
  color: #ffb74d;
}

.sec {
  margin: 0 0 6px;
  font-size: 14px;
}

.sec small {
  color: #8a8a96;
  font-size: 11px;
  font-weight: 400;
}

.rows + .sec {
  margin-top: 14px;
}

.rows li.clickable {
  cursor: pointer;
}

.rows li.clickable:hover {
  background: #31313b;
}

.picker .msg {
  margin: 0;
}

.rows li.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.small-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.turn-note {
  margin: 0 0 10px;
  color: #9a9aa6;
  font-size: 12px;
}

.sec .auto {
  display: inline-flex;
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
}

.members button.fainted {
  opacity: 0.55;
}

.lead-mark {
  color: #ffcb05;
}

.held-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 6px 0;
}

.chance {
  margin-left: 4px;
  color: #c8b46a;
}

.small-btn {
  padding: 2px 8px;
  border: 1px solid #3a3a44;
  border-radius: 4px;
  background: #24242c;
  color: #ccc;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.small-btn.heal-quick:not(:disabled) {
  border-color: #b8476e;
  color: #ff9ec0;
}

.msg {
  margin: 8px 0;
  color: #6a6a76;
  font-size: 14px;
}

.members {
  --hs-bg: #2a2a33;
  gap: 6px;
  margin-bottom: 10px;
}

.members button {
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #2a2a33;
  color: #ccc;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.members button.active {
  border-color: #ffcb05;
  color: #fff;
}

.card {
  padding: 12px;
  border-radius: 8px;
  background: #2a2a33;
}

.muted {
  color: #9a9aa6;
  font-size: 13px;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.rows li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid #33333d;
  font-size: 14px;
}

.rows li:last-child {
  border-bottom: none;
}

.grow {
  flex: 1;
}

.type {
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.item-row {
  flex-direction: column;
  align-items: stretch !important;
  gap: 2px !important;
}

.item-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-text {
  margin: 0 0 0 38px;
  color: #8a8a96;
  font-size: 12px;
}

.item-text.train-info {
  margin: -4px 0 6px;
}

.train-sec {
  margin: 10px 0 2px;
  color: #c8c8d0;
  font-size: 12px;
}

.train-select {
  max-width: 45%;
  padding: 2px 4px;
  border: 1px solid #3a3a44;
  border-radius: 4px;
  background: #1e1e24;
  color: #eee;
  font: inherit;
  font-size: 12px;
}

.auto {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}

.rows.evo li {
  padding: 4px 0;
}

.evo-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 0 38px;
}

.evo-targets small {
  color: #8a8a96;
}

.auto.disabled {
  color: #6a6a76;
  cursor: default;
}
</style>
