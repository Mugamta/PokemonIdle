<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { dexData, loadDex, STAT_LABELS, TYPE_COLORS } from '../data/dex'
import { calcStats, NATURES, STAT_KEYS } from '../data/natures'
import { evolutionsOf, evoItemUsage, FRIENDSHIP_EVOLVE, FRIENDSHIP_MAX, type Evolution } from '../data/evolutions'
import {
  BOTTLE_CAP_LEVEL,
  CATEGORY_LABELS,
  EVO_ITEMS,
  PP_UP_MAX,
  HEART_SCALE,
  SHOP_ITEMS,
  TRAIN_GROUP_LABELS,
  TRAIN_ITEMS,
  type AutoCategory,
  type ItemCategory,
  type TrainGroup,
} from '../data/shop'
import {
  canLearnMachine,
  evolutionCondText,
  evolutionMet,
  friendshipOf,
  heldOf,
  isHoldable,
  MAX_MOVE_SLOTS,
  memberAbility,
  maxPpOf,
  ppOf,
  SLOT_DEFEATS,
  teraTypeOf,
  useGameStore,
  type PartyMember,
} from '../stores/game'
import { formOf, megaFormFor, TERA_SHARD_COST, teraShardOf, teraShardType } from '../core/gimmicks'
import { abilityInfo } from '../core/abilities'
import { josa, maxHpOf, ro } from '../core/battle'
import { BALL_NOTES, catchChance, isMachine, isRecord } from '../data/items'
import { findStage } from '../data/stages'
import { useStageViewStore } from '../stores/stageView'
import BattleControls from './BattleControls.vue'
import StageDetail from './StageDetail.vue'
import StageMap from './StageMap.vue'
import ItemIcon from './ItemIcon.vue'
import PokeSprite from './PokeSprite.vue'

type SubTab = 'fight' | 'party' | 'stats' | 'moves' | 'items' | 'map'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'fight', label: '배틀' },
  { id: 'party', label: '파티' },
  { id: 'stats', label: '능력치' },
  { id: 'moves', label: '기술' },
  { id: 'items', label: '아이템' },
  { id: 'map', label: '지도' },
]

const game = useGameStore()
const sub = ref<SubTab>('fight')
const view = useStageViewStore()
// 지도: 열 때 지금 있는 지방·장소를 보여 줌
watch(sub, (t) => {
  if (t !== 'map') return
  const cur = findStage(game.currentStageId)
  if (!cur) return
  if (view.regionId !== cur.region.id) view.selectRegion(cur.region.id)
  if (!view.stageId) view.selectPlace(cur.stage.place)
})
const viewStage = computed(() => view.region.stages.find((s) => s.id === view.stageId) ?? null)
const memberIndex = ref(0)
const error = ref<string | null>(null)

onMounted(() => loadDex().catch((e) => (error.value = String(e))))

const member = computed(() => game.party[memberIndex.value] ?? game.party[0] ?? null)
/** 고른 포켓몬의 특성 */
const ability = computed(() => (member.value && dexData.value ? abilityInfo(memberAbility(member.value)) : null))
const species = (id: string) => dexData.value?.index.find((p) => p.id === id)

const stats = computed(() => {
  const m = member.value
  const sp = m && species(m.species)
  if (!m || !sp) return null
  const actual = calcStats(sp.stats, m.level, m.ivs ?? [], m.evs ?? [], m.nature, m.species)
  const nature = NATURES[m.nature]
  return STAT_KEYS.map((key, i) => {
    const base = sp.stats[i]!
    const iv = m.ivs?.[i] ?? 0
    const ev = m.evs?.[i] ?? 0
    const value = actual[i]!
    const mod = nature?.plus === key ? 'up' : nature?.minus === key ? 'down' : ''
    // 계산식을 열 단위로 쪼개 표로 그려 숫자 위치가 세로로 맞도록 함
    const isHp = key === 'hp'
    const formula =
      isHp && m.species === 'shedinja'
        ? null
        : [
            isHp ? '⌊(' : '⌊(⌊(',
            `2×${base}`,
            `+ ${iv}`,
            `+ ⌊${ev}/4⌋)`,
            `× ${m.level}/100⌋`,
            isHp ? `+ ${m.level} + 10` : `+ 5) × ${mod === 'up' ? '1.1' : mod === 'down' ? '0.9' : '1'}⌋`,
          ]
    return { label: STAT_LABELS[i], base, iv, ev, value, mod, formula, locked: game.evLockedOf(m, i) }
  })
})

/** 친밀도 (0~255) */
const friendship = computed(() => (member.value ? friendshipOf(member.value) : 0))
/** 진화 방법과 현재 충족 여부 */
const evoList = computed(() => {
  const m = member.value
  if (!m) return []
  return evolutionsOf(m.species).map((e) => ({
    e,
    name: species(e.to)?.ko ?? e.to,
    cond: evolutionCondText(e),
    met: evolutionMet(m, e),
  }))
})

const moveInfo = (id: string) => dexData.value?.movesById[id]
const memberIdx = computed(() => (member.value ? game.party.indexOf(member.value) : -1))
/** 기술칸 8칸: 장착 기술 / 빈 칸 / 잠긴 칸 (배틀 화면과 같은 배치) */
const moveSlots = computed(() => {
  const m = member.value
  if (!m) return []
  const open = game.slotsOf(m)
  const defeats = game.totalDefeats
  return Array.from({ length: MAX_MOVE_SLOTS }, (_, i) => {
    if (i >= open) {
      const need = SLOT_DEFEATS[i - 1]
      const cond = need != null ? `계정 격파 ${Math.min(defeats, need)}/${need}` : '상점에서 해금'
      return { kind: 'locked' as const, cond }
    }
    const id = m.moves[i]
    if (!id) return { kind: 'empty' as const }
    return { kind: 'move' as const, id, info: moveInfo(id) }
  })
})
/** 교체하려고 고른 칸 번호 */
const pickedSlot = ref<number | null>(null)
watch([memberIndex, sub], () => (pickedSlot.value = null))
const picked = computed(() => (pickedSlot.value != null ? moveSlots.value[pickedSlot.value] : null))
/** 잊은 기술 (배웠지만 장착하지 않은 기술. 하트비늘로 되살림) */
const forgotten = computed(() => {
  const m = member.value
  if (!m) return []
  return (m.learned ?? m.moves).filter((id) => !m.moves.includes(id)).map((id) => ({ id, info: moveInfo(id) }))
})
/** 레벨업으로 배우려는 기술 대기열 (맨 앞만 처리 가능) */
const pendingList = computed(() => (member.value?.pending ?? []).map((id) => ({ id, info: moveInfo(id) })))
const heartScales = computed(() => game.items[HEART_SCALE] ?? 0)
function clickSlot(i: number) {
  const s = moveSlots.value[i]
  if (!s || s.kind === 'locked') return
  pickedSlot.value = pickedSlot.value === i ? null : i
}
function learnPendingHere() {
  const s = picked.value
  if (s?.kind === 'move') game.learnPending(memberIdx.value, s.id)
  pickedSlot.value = null
}
function recall(id: string) {
  const s = picked.value
  if (!s || s.kind === 'locked') return
  game.recallMove(memberIdx.value, id, s.kind === 'move' ? s.id : undefined)
  pickedSlot.value = null
}

/** 남은 PP 표시 (제한 없는 기술은 빈 문자열) */
function ppText(id: string) {
  const m = member.value
  const max = maxPpOf(id, m)
  return m && max != null ? `PP ${ppOf(m, id)}/${max}` : ''
}

// 아이템 탭: 사용할 파티 포켓몬 (회복·지닌 도구·기술머신·육성 공통)
const itemTarget = ref(0)
const targetMember = computed(() => game.party[itemTarget.value] ?? game.party[0] ?? null)
const targetIdx = computed(() => (targetMember.value ? game.party.indexOf(targetMember.value) : 0))
/** 최대 HP (싸우는 포켓몬이 다이맥스 중이면 2배) */
const maxHp = (m: PartyMember) => game.memberMaxHp(m)
const hpText = (m: PartyMember) => (m.hp === 0 ? '기절' : `HP ${m.hp ?? maxHp(m)}/${maxHp(m)}`)

// 아이템: 상점 아이템을 분류별로 (가지고 있는 것만)
const CATS: ItemCategory[] = ['heal', 'revive', 'pp', 'status', 'ball', 'battle']
/** 볼: 지금 상대의 예상 포획률 */
const ballChance = (id: string) => {
  const e = game.enemy
  const foe = game.enemyBattler()
  if (!e || !foe || e.boss) return null
  return catchChance(id, game.catchContext(), foe.hp, maxHpOf(foe))
}
/** 분류별 아이템 대상: 기절 회복은 고른 포켓몬이 기절하지 않았으면 기절한 첫 포켓몬에게 */
const catTarget = (cat: ItemCategory) => {
  if (cat === 'ball' || cat === 'battle') return 0
  if (cat === 'revive' && targetMember.value?.hp !== 0) {
    const i = game.party.findIndex((m) => m.hp === 0)
    if (i >= 0) return i
  }
  return targetIdx.value
}
const itemGroups = computed(() =>
  CATS.map((cat) => {
    const target = catTarget(cat)
    const who = game.party[target]
    return {
      cat,
      targetName: cat === 'revive' && who ? species(who.species)?.ko ?? who.species : null,
      items: SHOP_ITEMS.filter((i) => i.category === cat && (game.items[i.id] ?? 0) > 0).map((def) => {
        const chance = cat === 'ball' ? ballChance(def.id) : null
        const usable = cat === 'ball' ? chance != null : !!game.itemEffect(def, target)
        return { def, count: game.items[def.id]!, info: dexData.value?.items[def.id], usable, chance }
      }),
    }
  }).filter((g) => g.items.length),
)
// 파티: 다치거나 기절한 포켓몬에게 바로 회복 아이템 사용
const isHurt = (m: PartyMember) => m.hp != null && m.hp < maxHp(m)
const quickHealTitle = (i: number) => {
  const m = game.party[i]
  const pick = game.quickHealPick(i)
  if (!m) return ''
  if (!pick) return m.hp === 0 ? '가방에 기절 회복 아이템이 없습니다' : '가방에 체력 회복 아이템이 없습니다'
  const note = game.enemy && game.battleTurns > 0 ? ' (전투 중에는 한 턴을 소모합니다)' : ''
  return `${itemKo(pick.id)} 사용${note}`
}
function quickHeal(i: number) {
  const pick = game.quickHealPick(i)
  if (pick) game.useItem(pick.id, i)
}
function useShopItem(cat: ItemCategory, id: string) {
  game.useItem(id, catTarget(cat))
}

// 지닌 도구: 고른 포켓몬이 지닌 도구와 가방의 지닐 수 있는 도구
const heldNow = computed(() => targetMember.value?.heldItem ?? null)
const heldSpent = computed(() => !!targetMember.value?.heldSpent)
const holdables = computed(() =>
  Object.entries(game.items)
    .filter(([id, n]) => n > 0 && isHoldable(id))
    .map(([id, n]) => ({ id, n, info: dexData.value?.items[id] }))
    .sort((a, b) => (a.info?.ko ?? a.id).localeCompare(b.info?.ko ?? b.id)),
)
const heldPick = ref('')
watch(holdables, (list) => {
  if (!list.some((h) => h.id === heldPick.value)) heldPick.value = list[0]?.id ?? ''
}, { immediate: true })

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
    return { def, count: game.items[def.id]!, name: info?.ko ?? def.id, usage: evoItemUsage(def.id).map((u) => `${u.fromName} → ${u.toName}`).join(', '), note: def.note ?? '', targets }
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
      let why = ''
      if (!usable && m) why = def.iv && m.level < BOTTLE_CAP_LEVEL ? `레벨 ${BOTTLE_CAP_LEVEL} 이상만 쓸 수 있습니다` : '지금은 효과가 없습니다'
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
function useTrain(id: string, target: number | string | undefined, times: number) {
  game.useTrainItem(game.party.indexOf(trainMember.value!), id, target, times)
}

const turnNote = computed(() => {
  if (!game.party.length) return ''
  if (!game.enemy) return '전투 중이 아니라서 회복 아이템은 턴을 소모하지 않습니다.'
  if (game.battleTurns === 0) return '아직 기술을 쓰기 전이라 회복 아이템은 턴을 소모하지 않습니다. (몬스터볼·배틀용 도구는 항상 한 턴 소모)'
  return '전투 중에 쓰면 한 턴을 소모합니다.'
})

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
// 능력치 탭: 메가진화 (지닌 도구·배운 기술로 메가진화할 수 있는 모습)
const megaInfo = computed(() => {
  const m = member.value
  if (!m || !game.gimmickUnlocked('mega') || !dexData.value) return null
  const now = megaFormFor(m.species, heldOf(m), m.learned ?? m.moves)
  if (now) return { text: `${now.ko} (전투 중 메가진화 가능)`, ok: true }
  const forms = Object.values(dexData.value.forms).filter((f) => f.base === m.species)
  if (!forms.length) return null
  const need = forms.map((f) => `${f.ko}: ${f.item ? itemKo(f.item) : (moveInfo(f.move!)?.ko ?? f.move)} 필요`).join(' · ')
  return { text: need, ok: false }
})

// 파티 → 도감
function sendToDex(i: number) {
  const m = game.party[i]
  if (!m) return
  const name = species(m.species)?.ko ?? m.species
  if (!confirm(`${josa(name, '을', '를')} 도감으로 보낼까요?\n성격·특성·개체값·노력치·레벨·친밀도·기술이 도감 기록에 합쳐지고, 이 포켓몬은 파티에서 사라집니다.`)) return
  if (game.sendToDex(i) && memberIndex.value >= game.party.length) memberIndex.value = 0
}
const itemKo = (id: string) => dexData.value?.items[id]?.ko ?? id

const CLS_LABEL = { physical: '물리', special: '특수', status: '변화' }
</script>

<template>
  <div class="battle" :class="{ fill: sub === 'fight' && dexData }">
    <!-- 상단 하위 탭 -->
    <nav class="sub-tabs">
      <button
        v-for="t in SUB_TABS"
        :key="t.id"
        type="button"
        :class="{ active: sub === t.id }"
        @click="sub = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <p v-if="error" class="msg">데이터를 불러오지 못했습니다: {{ error }}</p>
    <p v-else-if="!dexData" class="msg">불러오는 중…</p>

    <BattleControls v-else-if="sub === 'fight'" />

    <!-- 파티: 순서·싸우는 포켓몬·도감으로 보내기 -->
    <section v-else-if="sub === 'party'" class="card">
      <p v-if="!game.party.length" class="msg">파티에 포켓몬이 없습니다.</p>
      <ul v-else class="party-list">
        <li v-for="(m, i) in game.party" :key="i" :class="{ fainted: m.hp === 0 }">
          <PokeSprite :species="m.species" :size="48" />
          <div class="party-info">
            <div>
              <span v-if="i === 0" class="lead-mark" title="싸우는 포켓몬">★</span>
              <strong>{{ species(m.species)?.ko ?? m.species }}</strong>
              <small class="muted"> Lv.{{ m.level }}</small>
              <span v-if="m.pending?.length" class="pending-badge" :title="`배우려는 기술 ${m.pending.length}개`">새 기술 {{ m.pending.length }}</span>
            </div>
            <div class="muted held-line">
              {{ hpText(m) }} · 지닌 도구
              <template v-if="m.heldItem">
                <ItemIcon :id="m.heldItem" :size="16" />
                {{ itemKo(m.heldItem) }}<template v-if="m.heldSpent"> (사용함)</template>
              </template>
              <template v-else> 없음</template>
            </div>
            <div class="party-actions">
              <button
                v-if="i > 0"
                type="button"
                class="small-btn"
                :disabled="m.hp === 0 || !!game.faint"
                :title="game.enemy && game.battleTurns > 0 ? '전투 중에 교체하면 한 턴을 소모합니다' : ''"
                @click="game.setLead(i)"
              >
                싸우는 포켓몬으로
              </button>
              <button
                v-if="isHurt(m)"
                type="button"
                class="small-btn heal-quick"
                :disabled="!game.quickHealPick(i) || !!game.faint"
                :title="quickHealTitle(i)"
                @click="quickHeal(i)"
              >
                {{ m.hp === 0 ? '살리기' : '회복' }}<template v-if="game.quickHealPick(i)"> · {{ itemKo(game.quickHealPick(i)!.id) }}</template>
              </button>
              <button type="button" class="small-btn" @click="memberIndex = i; sub = 'stats'">능력치</button>
              <button type="button" class="small-btn" @click="memberIndex = i; sub = 'moves'">기술</button>
              <button
                v-if="game.party.length > 1"
                type="button"
                class="small-btn"
                :disabled="(i === 0 && !!game.enemy) || !!game.faint"
                :title="i === 0 && game.enemy ? '싸우는 중에는 보낼 수 없습니다' : '도감 기록에 합쳐지고 파티에서 사라집니다. 지닌 도구는 가방으로 돌아갑니다. 도감에서 기록 범위 안으로 다시 불러올 수 있습니다'"
                @click="sendToDex(i)"
              >
                도감으로
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- 지도: 전투 화면을 보면서 지도 확인·이동 -->
    <template v-else-if="sub === 'map'">
      <div class="map-box">
        <StageMap />
      </div>
      <section v-if="viewStage" class="card">
        <p class="map-stage"><strong>{{ viewStage.id }}</strong> {{ viewStage.name }}</p>
        <StageDetail :key="viewStage.id" :stage="viewStage" />
      </section>
      <p v-else class="msg">지도에서 장소를 고르면 출현 정보와 이동 버튼이 표시됩니다.</p>
    </template>

    <template v-else>
      <!-- 능력치 / 기술: 파티 포켓몬별 -->
      <template v-if="sub !== 'items'">
        <p v-if="!game.party.length" class="msg">파티에 포켓몬이 없습니다.</p>
        <template v-else>
          <div class="members">
            <button
              v-for="(m, i) in game.party"
              :key="i"
              type="button"
              :class="{ active: member === m, fainted: m.hp === 0 }"
              @click="memberIndex = i"
            >
              <span v-if="i === 0" class="lead-mark" title="싸우는 포켓몬">★</span>
              {{ species(m.species)?.ko ?? m.species }} <small>Lv.{{ m.level }}</small>
              <ItemIcon v-if="heldOf(m)" :id="heldOf(m)!" :size="16" />
              <span v-if="m.pending?.length" class="pending-badge" :title="`배우려는 기술 ${m.pending.length}개`">새 기술 {{ m.pending.length }}</span>
            </button>
          </div>

          <section v-if="sub === 'stats' && stats" class="card">
            <div class="card-head">
              <PokeSprite :species="member!.species" :size="56" />
              <strong>{{ species(member!.species)?.ko }}</strong>
              <span class="muted">Lv.{{ member!.level }} · {{ NATURES[member!.nature]?.ko ?? '-' }} · {{ hpText(member!) }}</span>
            </div>
            <p class="muted held-line">
              지닌 도구
              <template v-if="member!.heldItem">
                <ItemIcon :id="member!.heldItem" :size="18" />
                {{ itemKo(member!.heldItem) }}<template v-if="member!.heldSpent"> (사용함)</template>
              </template>
              <template v-else> 없음</template>
            </p>
            <p v-if="ability" class="ability">
              <strong>특성 {{ ability.ko }}</strong><span v-if="member!.hiddenAbility" class="muted"> (숨겨진 특성)</span>
              <span class="muted">{{ ability.text }}</span>
            </p>
            <p v-if="game.gimmickUnlocked('tera')" class="muted held-line">
              테라스탈 타입
              <span class="type" :style="{ background: TYPE_COLORS[teraTypeOf(member!)] }">{{ dexData.types[teraTypeOf(member!)] }}</span>
              <small>(아이템 탭에서 테라피스 {{ TERA_SHARD_COST }}개로 변경)</small>
            </p>
            <p v-if="megaInfo" class="muted held-line" :class="{ 'mega-ok': megaInfo.ok }">메가진화 · {{ megaInfo.text }}</p>
            <p v-if="memberIdx === 0 && game.gimmickActive?.kind === 'mega'" class="muted held-line">
              지금 {{ formOf(game.gimmickActive.form)?.ko }}(으)로 메가진화한 상태입니다. (위 능력치는 원래 모습 기준)
            </p>
            <table class="stats">
              <thead>
                <tr>
                  <th />
                  <th>실능치</th>
                  <th v-if="game.statViewLevel >= 1">종족값</th>
                  <th v-if="game.statViewLevel >= 2">개체값</th>
                  <th v-if="game.statViewLevel >= 3">노력치</th>
                  <th v-if="game.hasPerk('evBreak:1')" title="끄면 전투로 이 능력치의 노력치를 얻지 않습니다">노력치 획득</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(s, i) in stats" :key="s.label">
                  <th>{{ s.label }}</th>
                  <td class="value" :class="s.mod">{{ s.value }}<span v-if="s.mod">{{ s.mod === 'up' ? '▲' : '▼' }}</span></td>
                  <td v-if="game.statViewLevel >= 1">{{ s.base }}</td>
                  <td v-if="game.statViewLevel >= 2">{{ s.iv }}</td>
                  <td v-if="game.statViewLevel >= 3">{{ s.ev }}</td>
                  <td v-if="game.hasPerk('evBreak:1')">
                    <input
                      type="checkbox"
                      :checked="!s.locked"
                      @change="game.setEvLock(memberIdx, i, !($event.target as HTMLInputElement).checked)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="game.statViewLevel >= 4" class="formula">
              <p class="muted">
                HP = ⌊(2×종족값 + 개체값 + ⌊노력치/4⌋) × 레벨/100⌋ + 레벨 + 10<br />
                그 외 = ⌊(⌊(2×종족값 + 개체값 + ⌊노력치/4⌋) × 레벨/100⌋ + 5) × 성격보정⌋ (▲ 1.1 · ▼ 0.9)
              </p>
              <table class="ftable">
                <tbody>
                  <tr v-for="s in stats" :key="s.label">
                    <th>{{ s.label }}</th>
                    <template v-if="s.formula">
                      <td v-for="(part, k) in s.formula" :key="k" :class="`f${k}`">{{ part }}</td>
                    </template>
                    <td v-else colspan="6" class="fnote">껍질몬은 항상 1</td>
                    <td class="fres">= {{ s.value }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="friend">
              <span class="label">친밀도</span>
              <div class="fbar"><span :style="{ width: `${(friendship / FRIENDSHIP_MAX) * 100}%` }" :class="{ full: friendship >= FRIENDSHIP_EVOLVE }" /></div>
              <span class="num">{{ friendship }} / {{ FRIENDSHIP_MAX }}</span>
            </div>

            <h4 class="sec evo-head">진화</h4>
            <p v-if="!evoList.length" class="msg evo-none">더 이상 진화하지 않습니다.</p>
            <ul v-else class="rows evo">
              <li v-for="(v, i) in evoList" :key="i">
                <PokeSprite :species="v.e.to" :size="36" />
                <span class="grow"><strong>{{ v.name }}</strong></span>
                <span class="muted cond" :class="{ met: v.met && v.e.via === 'level' }">{{ v.cond }}</span>
              </li>
            </ul>
            <p v-if="evoList.length && game.everstone" class="msg evo-none">변함없는돌이 켜져 있어 레벨업으로 진화하지 않습니다.</p>
          </section>

          <template v-if="sub === 'moves'">
            <div class="move-grid">
              <template v-for="(s, i) in moveSlots" :key="i">
                <button
                  v-if="s.kind === 'move'"
                  type="button"
                  class="mslot"
                  :class="{ picked: pickedSlot === i }"
                  :style="{ '--c': (s.info && TYPE_COLORS[s.info.type]) ?? '#666' }"
                  @click="clickSlot(i)"
                >
                  <span class="name">{{ s.info?.ko ?? s.id }} <small class="pp">{{ ppText(s.id) }}</small></span>
                  <span v-if="s.info" class="meta">
                    <span class="mtype">{{ dexData.types[s.info.type] }}</span>
                    {{ CLS_LABEL[s.info.cls] }} · 위력 {{ s.info.power ?? '-' }} · 명중 {{ s.info.acc ?? '-' }}
                  </span>
                </button>
                <button
                  v-else-if="s.kind === 'empty'"
                  type="button"
                  class="mslot empty"
                  :class="{ picked: pickedSlot === i }"
                  @click="clickSlot(i)"
                >
                  + 빈 칸
                </button>
                <div v-else class="mslot empty locked">🔒 {{ s.cond }}</div>
              </template>
            </div>

            <!-- 레벨업으로 배우려는 기술 대기열: 맨 앞부터 하나씩 처리 -->
            <section v-if="pendingList.length" class="card pending">
              <h4 class="sec">
                배우려는 기술 <small>{{ pendingList.length }}개 대기 중 · 배운 순서대로 하나씩 처리합니다</small>
              </h4>
              <div class="pending-head mrow">
                <span class="grow"><strong>{{ pendingList[0]!.info?.ko ?? pendingList[0]!.id }}</strong></span>
                <template v-if="pendingList[0]!.info">
                  <span class="type" :style="{ background: TYPE_COLORS[pendingList[0]!.info.type] }">{{ dexData.types[pendingList[0]!.info.type] }}</span>
                  <span class="muted">{{ CLS_LABEL[pendingList[0]!.info.cls] }}</span>
                  <span class="muted num"><small>위력</small> {{ pendingList[0]!.info.power ?? '-' }}</span>
                  <span class="muted num"><small>명중</small> {{ pendingList[0]!.info.acc ?? '-' }}</span>
                </template>
              </div>
              <p class="item-text">위 기술칸에서 잊을 기술을 눌러 교체하거나, 배우지 않을 수 있습니다. 배우지 않은 기술은 잊은 기술이 되어 하트비늘로 되살릴 수 있습니다.</p>
              <p v-if="pendingList.length > 1" class="item-text">
                다음: {{ pendingList.slice(1).map((p) => p.info?.ko ?? p.id).join(' → ') }}
              </p>
              <div class="picker-actions">
                <button type="button" class="small-btn" @click="game.skipPending(memberIdx)">배우지 않기</button>
              </div>
            </section>

            <section class="card picker">
              <p v-if="!picked" class="msg">
                {{ pendingList.length ? '잊을 기술칸을 눌러 주세요.' : '바꿀 기술칸을 눌러 주세요. 잊은 기술은 하트비늘로 되살릴 수 있습니다.' }}
              </p>
              <template v-else>
                <h4 class="sec">
                  {{ pickedSlot! + 1 }}번 칸
                  <small>{{ picked.kind === 'move' ? `${picked.info?.ko ?? picked.id} 대신` : '빈 칸' }}</small>
                </h4>
                <div v-if="picked.kind === 'move' && pendingList.length" class="picker-actions pending-swap">
                  <button type="button" class="small-btn" @click="learnPendingHere">
                    {{ picked.info?.ko ?? picked.id }} 잊고 {{ pendingList[0]!.info?.ko ?? pendingList[0]!.id }} 배우기
                  </button>
                </div>
                <h5 class="train-sec">
                  잊은 기술 되살리기
                  <span class="muted">하트비늘 ×{{ heartScales }} (1개 소모<template v-if="!heartScales"> · 상점 → 육성 → 기술 떠올리기</template>)</span>
                </h5>
                <p v-if="!forgotten.length" class="msg">잊은 기술이 없습니다.</p>
                <ul v-else class="rows mrows">
                  <li
                    v-for="m in forgotten"
                    :key="m.id"
                    :class="{ clickable: heartScales > 0, disabled: !heartScales }"
                    :title="heartScales ? '하트비늘 1개를 써서 이 기술을 장착합니다' : '하트비늘이 없습니다'"
                    @click="heartScales && recall(m.id)"
                  >
                    <span class="grow">{{ m.info?.ko ?? m.id }}</span>
                    <template v-if="m.info">
                      <span class="type" :style="{ background: TYPE_COLORS[m.info.type] }">{{ dexData.types[m.info.type] }}</span>
                      <span class="muted">{{ CLS_LABEL[m.info.cls] }}</span>
                      <span class="muted num"><small>위력</small> {{ m.info.power ?? '-' }}</span>
                      <span class="muted num"><small>명중</small> {{ m.info.acc ?? '-' }}</span>
                    </template>
                  </li>
                </ul>
                <div class="picker-actions">
                  <button type="button" class="small-btn" @click="pickedSlot = null">취소</button>
                </div>
              </template>
            </section>
          </template>
        </template>
      </template>

      <!-- 아이템 -->
      <section v-else class="card">
        <p class="turn-note">{{ turnNote }}</p>
        <div v-if="game.party.length" class="members">
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
        </div>
        <p v-if="targetMember" class="item-text train-info">{{ trainInfo }}</p>
        <p v-if="!Object.keys(game.items).length" class="msg">가지고 있는 아이템이 없습니다. 상점에서 살 수 있습니다.</p>

        <template v-for="g in itemGroups" :key="g.cat">
          <h4 class="sec">
            {{ CATEGORY_LABELS[g.cat] }}
            <small v-if="g.cat === 'ball'">야생 포켓몬에게</small>
            <small v-else-if="g.cat === 'battle'">싸우는 포켓몬에게 · 전투 중에만</small>
            <small v-else-if="g.cat === 'revive'">{{ game.party.some((m) => m.hp === 0) ? `${g.targetName}에게` : '기절한 포켓몬이 없음' }}</small>
            <label v-if="g.cat !== 'battle' && game.hasPerk(`autoUse:${g.cat}`)" class="auto">
              <input
                type="checkbox"
                :checked="!!game.autoUse[g.cat as AutoCategory]"
                @change="game.setAutoUse(g.cat as AutoCategory, ($event.target as HTMLInputElement).checked)"
              />
              자동 사용
            </label>
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
                  :title="it.usable ? '' : g.cat === 'ball' ? (game.enemy?.boss ? '보스는 잡을 수 없습니다' : '야생 포켓몬과 싸울 때만 던질 수 있습니다') : '지금은 효과가 없습니다'"
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

        <!-- 테라스탈 타입 -->
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

        <!-- 지닌 도구 -->
        <template v-if="targetMember">
          <h4 class="sec">지닌 도구 <small>{{ species(targetMember.species)?.ko }}</small></h4>
          <div class="held-box">
            <template v-if="heldNow">
              <ItemIcon :id="heldNow" />
              <span class="grow">
                {{ itemKo(heldNow) }}
                <span v-if="heldSpent" class="muted">(이번 전투에서 사용함 · 다음 전투에 가방에 있으면 다시 지님)</span>
              </span>
              <button type="button" class="small-btn" :disabled="!!game.faint" @click="game.takeHeld(targetIdx)">가방에 넣기</button>
            </template>
            <span v-else class="muted grow">지니고 있는 도구가 없습니다.</span>
          </div>
          <div v-if="holdables.length" class="held-box">
            <select v-model="heldPick" class="train-select grow">
              <option v-for="h in holdables" :key="h.id" :value="h.id">{{ h.info?.ko ?? h.id }} (×{{ h.n }})</option>
            </select>
            <button type="button" class="small-btn" :disabled="!heldPick || !!game.faint" @click="game.giveHeld(targetIdx, heldPick)">
              {{ heldNow ? '바꿔 지니기' : '지니게 하기' }}
            </button>
          </div>
          <p v-if="heldPick && dexData.items[heldPick]?.text" class="item-text">{{ dexData.items[heldPick]!.text }}</p>
          <p v-if="!holdables.length" class="item-text">가방에 지닐 수 있는 도구가 없습니다. 상점의 지닌 도구·나무열매를 사거나 야생 포켓몬에게서 얻을 수 있습니다.</p>
        </template>

        <!-- 기술머신 -->
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
                <p v-if="it.info?.text" class="item-text">{{ it.info.text }}</p>
              </li>
            </ul>
          </template>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* 배틀 하위 탭: 패널 높이에 맞춰 로그가 남은 공간을 채움 (패널 스크롤 없음) */
.battle.fill {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.battle.fill > .controls {
  flex: 1;
  min-height: 0;
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

.move-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 10px;
}

.mslot {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-height: 58px;
  padding: 8px 10px;
  border: 1px solid #3a3a44;
  border-left: 4px solid var(--c, #3a3a44);
  border-radius: 6px;
  background: #2a2a33;
  color: #eee;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mslot.picked {
  border-color: #ffcb05;
  border-left-color: var(--c, #ffcb05);
  background: #2f2c22;
}

.mslot .name {
  font-size: 15px;
  font-weight: 700;
}

.mslot .meta {
  color: #9a9aa6;
  font-size: 11px;
}

.mslot .mtype {
  padding: 0 5px;
  border-radius: 3px;
  background: var(--c);
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.mslot.empty {
  min-height: 34px;
  justify-content: center;
  align-items: center;
  color: #6a6a76;
  font-size: 13px;
}

.mslot.locked {
  cursor: default;
}

.picker .msg {
  margin: 0;
}

.picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}

.picker-actions.pending-swap {
  justify-content: flex-start;
  margin: 0 0 6px;
}

.rows li.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card.pending {
  border-color: #ffcb05;
}

.pending-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.pending-badge {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 8px;
  background: #ffcb05;
  color: #1e1e24;
  font-size: 10px;
  font-weight: 700;
}

.small-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.mslot .pp {
  color: #c8c8d0;
  font-size: 11px;
  font-weight: 400;
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

.party-actions,
.held-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 6px 0;
}

.mega-ok {
  color: #c58cff;
}

.held-line {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 6px 0;
}

.party-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.party-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #3a3a44;
}

.party-list li:last-child {
  border-bottom: none;
}

.party-list li.fainted {
  opacity: 0.55;
}

.party-info {
  flex: 1;
  min-width: 0;
}

.party-info .held-line,
.party-info .party-actions {
  margin: 2px 0;
  font-size: 12px;
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

.sub-tabs {
  position: sticky;
  top: -12px;
  z-index: 1;
  display: flex;
  margin: -12px -12px 10px;
  background: #1e1e24;
  border-bottom: 1px solid #3a3a44;
}

.sub-tabs button {
  flex: 1;
  height: 42px;
  border: none;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.sub-tabs button.active {
  color: #fff;
  font-weight: 700;
  box-shadow: inset 0 -2px 0 #ffcb05;
}

.msg {
  margin: 8px 0;
  color: #6a6a76;
  font-size: 14px;
}

.members {
  display: flex;
  gap: 6px;
  overflow-x: auto;
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

.map-box {
  height: 240px;
  margin-bottom: 8px;
  overflow: hidden;
  border-radius: 8px;
  background: #18181d;
}

.map-stage {
  margin: 0 0 8px;
  font-size: 14px;
}

.map-stage strong {
  margin-right: 4px;
  color: #ffcb05;
}

.ability {
  margin: 0.4rem 0 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.9rem;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.muted {
  color: #9a9aa6;
  font-size: 13px;
}

.formula {
  margin: 8px 0 0;
  font-size: 12px;
  overflow-x: auto;
}
.formula p {
  margin: 0 0 4px;
  line-height: 1.5;
}
.ftable {
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ftable th,
.ftable td {
  padding: 2px 3px;
  text-align: right;
}
.ftable th {
  padding-right: 10px;
  text-align: left;
  font-weight: bold;
}
.ftable td.f0 {
  padding-right: 0;
  color: #8a8a96;
}
.ftable td.f1 {
  padding-left: 0;
}
.ftable td.f5 {
  text-align: left;
}
.ftable td.fnote {
  text-align: left;
  color: #8a8a96;
}
.ftable td.fres {
  padding-left: 8px;
  font-weight: bold;
  color: #fff;
}
.stats {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.stats th,
.stats td {
  padding: 5px 4px;
  text-align: right;
}

.stats thead th {
  color: #8a8a96;
  font-size: 12px;
  font-weight: 400;
}

.stats tbody th {
  text-align: left;
  color: #9a9aa6;
  font-weight: 400;
}

.stats td {
  color: #9a9aa6;
}

.stats td.value {
  color: #fff;
  font-weight: 700;
}

.stats td.value.up {
  color: #ff8a7a;
}

.stats td.value.down {
  color: #7aa8ff;
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

.num {
  font-variant-numeric: tabular-nums;
}

/* 기술 행: 타입·분류·위력·명중이 세로로 맞도록 고정 열 */
.mrows li,
.pending-head.mrow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4.2em 2.4em 4.4em 4.4em;
  gap: 8px;
}
.mrows li > *,
.mrow > * {
  min-width: 0;
}
.mrows .type,
.mrow .type {
  justify-self: center;
}
.mrows .num,
.mrow .num {
  text-align: right;
}

.type {
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.lock-note {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #23232b;
  color: #9a9aa6;
  font-size: 13px;
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

.friend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 13px;
}

.friend .label {
  color: #9a9aa6;
}

.fbar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: #1e1e24;
  overflow: hidden;
}

.fbar span {
  display: block;
  height: 100%;
  background: #ff8fb8;
}

.fbar span.full {
  background: #ff5c93;
}

.evo-head {
  margin-top: 14px !important;
}

.evo-none {
  margin: 4px 0 0;
  font-size: 13px;
}

.rows.evo li {
  padding: 4px 0;
}

.cond {
  text-align: right;
}

.cond.met {
  color: #7ad67a;
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
