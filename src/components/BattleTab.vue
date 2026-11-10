<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { dexData, learnMethods, loadDex, loadLearnMethods, STAT_LABELS, TYPE_COLORS } from '../data/dex'
import { tutorCostText, tutorRegionTitle } from '../data/tutors'
import { calcStats, NATURES, STAT_KEYS } from '../data/natures'
import { evolutionsOf, FRIENDSHIP_EVOLVE, FRIENDSHIP_MAX } from '../data/evolutions'
import { HEART_SCALE } from '../data/shop'
import { isMachine, isRecord, tmShopList } from '../data/items'
import {
  canLearnMachine,
  EGG_MOVE_PRICE,
  eggMoveOptions,
  moveNumOf,
  GENDER_SYMBOL,
  tutorOptions,
  evolutionCondText,
  evolutionMet,
  friendshipOf,
  heldIds,
  heldOf,
  MAX_MOVE_SLOTS,
  memberAbility,
  maxPpOf,
  ppOf,
  SLOT_DEFEATS,
  teraTypeOf,
  useGameStore,
  type PartyMember,
} from '../stores/game'
import { formOf, megaFormFor, TERA_SHARD_COST } from '../core/gimmicks'
import { abilityInfo } from '../core/abilities'
import { josa } from '../core/battle'
import { moveEffectText } from '../data/moveText'
import { findStage } from '../data/stages'
import { useStageViewStore } from '../stores/stageView'
import BattleControls from './BattleControls.vue'
import HScroll from './HScroll.vue'
import HpBar from './HpBar.vue'
import StageDetail from './StageDetail.vue'
import StageMap from './StageMap.vue'
import ItemIcon from './ItemIcon.vue'
import PokeSprite from './PokeSprite.vue'

type SubTab = 'fight' | 'party' | 'stats' | 'moves' | 'map'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'fight', label: '배틀' },
  { id: 'party', label: '파티' },
  { id: 'stats', label: '능력치' },
  { id: 'moves', label: '기술' },
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

onMounted(() => {
  loadDex().catch((e) => (error.value = String(e)))
  loadLearnMethods().catch((e) => (error.value = String(e)))
})

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

/** 성격으로 오르고 내리는 능력치 이름 (변화 없는 성격이면 null) */
const natureMods = computed(() => {
  const n = member.value && NATURES[member.value.nature]
  if (!n?.plus || !n.minus || n.plus === n.minus) return null
  const label = (k: string) => STAT_LABELS[STAT_KEYS.indexOf(k as (typeof STAT_KEYS)[number])]
  return { up: label(n.plus), down: label(n.minus) }
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
/** 기술 교체 하위 탭: 자력기(잊은 기술 되살리기) / 기술머신 / 알 기술 / 기술가르침 */
type LearnTab = 'self' | 'tm' | 'egg' | 'tutor'
const learnTab = ref<LearnTab>('self')

/** 알 기술: 아직 배우지 않은 것. 유전 부모 후보와 소지한 부모 기준 성공 확률 */
const eggRows = computed(() => {
  const m = member.value
  if (!m || !learnMethods.value) return []
  const known = m.learned ?? m.moves
  return eggMoveOptions(m.species, (id) => game.ownsSpecies(id), (id, g) => game.hasGender(id, g))
    .filter((o) => !known.includes(o.move))
    .map((o) => ({ ...o, info: moveInfo(o.move) }))
    .sort((a, b) => b.chance - a.chance || (a.info?.ko ?? a.move).localeCompare(b.info?.ko ?? b.move, 'ko'))
})
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`
const speciesKo = (id: string) => species(id)?.ko ?? id
/** 부모 후보 표시: 소지한 부모 먼저, 최대 3마리 */
function parentText(o: (typeof eggRows.value)[number]) {
  if (!o.parents.length) return '유전 부모 없음'
  if (o.best) return `부모 ${speciesKo(o.best.species)} · 확률 ${pct(o.chance)}`
  const names = o.parents.slice(0, 3).map((p) => speciesKo(p.species))
  return `부모 후보 ${names.join(', ')}${o.parents.length > 3 ? ` 외 ${o.parents.length - 3}` : ''} (미보유)`
}
function eggBlock(o: (typeof eggRows.value)[number]): string {
  if (!o.parents.length) return '이 기술을 물려줄 수 있는 포켓몬이 없습니다'
  if (!o.best) return '부모 후보를 잡은 적이 없습니다'
  if (o.chance <= 0) return '성비 때문에 유전할 수 없습니다'
  if (game.money < EGG_MOVE_PRICE) return '돈이 부족합니다'
  return ''
}
function tryEgg(o: (typeof eggRows.value)[number]) {
  const s = picked.value
  if (!s || s.kind === 'locked' || eggBlock(o)) return
  if (game.tryEggMove(memberIdx.value, o.move, s.kind === 'move' ? s.id : undefined) === 'success') pickedSlot.value = null
}

/** 기술가르침: 아직 배우지 않은 것. 조건을 만족하는 장소(없으면 첫 장소) */
const tutorRows = computed(() => {
  const m = member.value
  if (!m || !learnMethods.value) return []
  const known = m.learned ?? m.moves
  return tutorOptions(m.species)
    .filter((o) => !known.includes(o.move))
    .map((o) => {
      const states = o.sources.map((src) => {
        const open = game.stageVisited(src.region, src.gate)
        return { src, open, short: open ? game.tutorShortfall(src.cost) : '' }
      })
      const pick = states.find((x) => x.open && !x.short) ?? states.find((x) => x.open) ?? states[0]!
      return { move: o.move, info: moveInfo(o.move), ...pick, more: o.sources.length - 1 }
    })
    .sort((a, b) => Number(b.open && !b.short) - Number(a.open && !a.short) || (a.info?.ko ?? a.move).localeCompare(b.info?.ko ?? b.move, 'ko'))
})
type TutorRow = (typeof tutorRows.value)[number]
function tutorBlock(t: TutorRow): string {
  if (!t.open) return `${tutorRegionTitle(t.src)}의 ${t.src.gate}에 도착해야 합니다`
  return t.short
}
function teachTutor(t: TutorRow) {
  const s = picked.value
  if (!s || s.kind === 'locked' || tutorBlock(t)) return
  if (game.learnByTutor(memberIdx.value, t.move, t.src, s.kind === 'move' ? s.id : undefined)) pickedSlot.value = null
}
// 기술 목록 필터: 타입 / 분류 (네 탭 공통, 포켓몬을 바꿔도 유지)
const typeFilter = ref('')
const clsFilter = ref<'' | 'physical' | 'special' | 'status'>('')
const filterOn = computed(() => !!typeFilter.value || !!clsFilter.value)
const FILTER_EMPTY = '필터에 맞는 기술이 없습니다.'
const TYPE_OPTIONS = Object.keys(TYPE_COLORS)
function passFilter<T extends { info?: { type: string; cls: string } }>(list: T[]): T[] {
  if (!filterOn.value) return list
  return list.filter((x) => x.info && (!typeFilter.value || x.info.type === typeFilter.value) && (!clsFilter.value || x.info.cls === clsFilter.value))
}
const fForgotten = computed(() => passFilter(forgotten.value))
const fMachines = computed(() => passFilter(learnableMachines.value))
const fEgg = computed(() => passFilter(eggRows.value))
const fTutor = computed(() => passFilter(tutorRows.value))
const LEARN_TABS = computed(() => [
  { id: 'self' as const, label: '자력기', n: fForgotten.value.length },
  { id: 'tm' as const, label: '기술머신', n: fMachines.value.length },
  { id: 'egg' as const, label: '알 기술', n: fEgg.value.length },
  { id: 'tutor' as const, label: '기술가르침', n: fTutor.value.length },
])
/**
 * 이 포켓몬이 기술머신으로 새로 배울 수 있는 기술 전체 (기술마다 한 줄).
 * 가지고 있으면 그 머신(기술머신 우선)을 쓰고, 없으면 상점 머신을 사서 씀
 */
const learnableMachines = computed(() => {
  const m = member.value
  const dex = dexData.value
  if (!m || !dex) return []
  const known = m.learned ?? m.moves
  // 기술별 보유 머신 (기술레코드보다 기술머신 우선)
  const owned = new Map<string, { id: string; n: number }>()
  for (const [id, n] of Object.entries(game.items)) {
    const move = n > 0 && isMachine(id) ? dex.items[id]?.move : undefined
    if (!move) continue
    const cur = owned.get(move)
    if (!cur) owned.set(move, { id, n })
    else owned.set(move, { id: isRecord(cur.id) && !isRecord(id) ? id : cur.id, n: cur.n + n })
  }
  return tmShopList()
    .filter((t) => !known.includes(t.move) && canLearnMachine(m, t.move))
    .map((t) => {
      const have = owned.get(t.move)
      const id = have?.id ?? t.id
      return { id, buyId: t.id, price: t.price, n: have?.n ?? 0, name: dex.items[id]?.ko ?? id, move: t.move, info: moveInfo(t.move), record: isRecord(id) }
    })
    .sort((a, b) => (a.info?.ko ?? a.move).localeCompare(b.info?.ko ?? b.move, 'ko'))
})
type MachineRow = (typeof learnableMachines.value)[number]
const won = (n: number) => `${n.toLocaleString()}원`
/** 기술머신 사용 확인 다이얼로그 (기술 상세 정보 + 사용 / 구매 후 사용) */
const tmDialog = ref<MachineRow | null>(null)
const tmEffect = computed(() => {
  const t = tmDialog.value
  const num = t && moveNumOf(t.move)
  return t && num != null ? moveEffectText(t.move, num) : ''
})
watch([memberIdx, pickedSlot], () => (tmDialog.value = null))
function confirmTm() {
  const t = tmDialog.value
  tmDialog.value = null
  if (t) teach(t)
}
function teach(t: MachineRow) {
  const s = picked.value
  if (!s || s.kind === 'locked' || game.faint) return
  let id = t.id
  if (t.n <= 0) {
    if (!game.buyItem(t.buyId)) return
    id = t.buyId
  }
  game.useMachine(memberIdx.value, id, s.kind === 'move' ? s.id : undefined)
  pickedSlot.value = null
}

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

/** 최대 HP (싸우는 포켓몬이 다이맥스 중이면 2배) */
const maxHp = (m: PartyMember) => game.memberMaxHp(m)
const hpText = (m: PartyMember) => (m.hp === 0 ? '기절' : `HP ${m.hp ?? maxHp(m)}/${maxHp(m)}`)
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
              <span v-if="m.gender" class="gender" :class="m.gender"> {{ GENDER_SYMBOL[m.gender] }}</span>
              <small class="muted"> Lv.{{ m.level }}</small>
              <span v-if="m.pending?.length" class="pending-badge" :title="`배우려는 기술 ${m.pending.length}개`">새 기술 {{ m.pending.length }}</span>
            </div>
            <div class="muted held-line">
              {{ hpText(m) }} · 지닌 도구
              <template v-if="heldIds(m).length">
                <span v-for="id in heldIds(m)" :key="id" class="held-chip">
                  <ItemIcon :id="id" :size="16" />
                  {{ itemKo(id) }}<template v-if="m.held![id]! > 1"> ×{{ m.held![id] }}</template
                  ><template v-if="m.heldSpent?.[id]"> (사용함{{ m.held![id]! > 1 ? ` ${m.heldSpent[id]}개` : '' }})</template>
                </span>
              </template>
              <template v-else> 없음</template>
            </div>
            <div class="party-actions">
              <button
                type="button"
                class="small-btn"
                :disabled="i === 0 || m.hp === 0 || !!game.faint || game.leadTrapped"
                :title="
                  i === 0
                    ? '지금 싸우고 있는 포켓몬입니다'
                    : game.leadTrapped
                    ? '싸우는 포켓몬이 묶여 있어 교체할 수 없습니다'
                    : game.enemy && game.battleTurns > 0
                      ? '전투 중에 교체하면 한 턴을 소모합니다'
                      : ''
                "
                @click="game.setLead(i)"
              >
                교체
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
      <p v-if="!game.party.length" class="msg">파티에 포켓몬이 없습니다.</p>
      <template v-else>
        <HScroll class="members" :active="memberIndex">
          <button
            v-for="(m, i) in game.party"
            :key="i"
            type="button"
            :class="{ active: member === m, fainted: m.hp === 0 }"
            @click="memberIndex = i"
          >
            <span v-if="i === 0" class="lead-mark" title="싸우는 포켓몬">★</span>
            {{ species(m.species)?.ko ?? m.species }} <small>Lv.{{ m.level }}</small>
            <ItemIcon v-for="id in Object.keys(heldOf(m))" :key="id" :id="id" :size="16" />
            <span v-if="m.pending?.length" class="pending-badge" :title="`배우려는 기술 ${m.pending.length}개`">새 기술 {{ m.pending.length }}</span>
          </button>
        </HScroll>

        <section v-if="sub === 'stats' && stats" class="card">
          <div class="card-head">
            <PokeSprite :species="member!.species" :size="56" />
            <div class="head-main">
              <div class="head-title">
                <strong class="head-name">{{ species(member!.species)?.ko }}</strong>
                <span v-if="member!.gender" class="gender" :class="member!.gender">{{ GENDER_SYMBOL[member!.gender] }}</span>
                <span class="lv-badge">Lv.{{ member!.level }}</span>
                <span v-if="member!.hp === 0" class="faint-badge">기절</span>
              </div>
              <div class="head-hp">
                <HpBar :hp="member!.hp ?? maxHp(member!)" :max="maxHp(member!)" show-numbers />
              </div>
            </div>
          </div>
          <dl class="info">
            <div class="info-row">
              <dt>성격</dt>
              <dd>
                <span class="chip">{{ NATURES[member!.nature]?.ko ?? '-' }}</span>
                <template v-if="natureMods">
                  <small class="nat up">{{ natureMods.up }} ▲</small>
                  <small class="nat down">{{ natureMods.down }} ▼</small>
                </template>
                <small v-else class="muted">능력 변화 없음</small>
              </dd>
            </div>
            <div v-if="ability" class="info-row">
              <dt>특성</dt>
              <dd class="col">
                <span class="ab-name">
                  <strong>{{ ability.ko }}</strong>
                  <span v-if="member!.hiddenAbility" class="chip hidden-ab">숨겨진 특성</span>
                </span>
                <span class="desc">{{ ability.text }}</span>
              </dd>
            </div>
            <div class="info-row">
              <dt>지닌 도구</dt>
              <dd>
                <template v-if="heldIds(member!).length">
                  <span v-for="id in heldIds(member!)" :key="id" class="chip held-chip">
                    <ItemIcon :id="id" :size="18" />
                    {{ itemKo(id) }}<template v-if="member!.held![id]! > 1"> ×{{ member!.held![id] }}</template
                    ><template v-if="member!.heldSpent?.[id]"> (사용함{{ member!.held![id]! > 1 ? ` ${member!.heldSpent[id]}개` : '' }})</template>
                  </span>
                </template>
                <span v-else class="muted">없음</span>
              </dd>
            </div>
            <div v-if="game.gimmickUnlocked('tera')" class="info-row">
              <dt>테라스탈</dt>
              <dd>
                <span class="type" :style="{ background: TYPE_COLORS[teraTypeOf(member!)] }">{{ dexData.types[teraTypeOf(member!)] }}</span>
                <small class="muted">도구 탭에서 테라피스 {{ TERA_SHARD_COST }}개로 변경</small>
              </dd>
            </div>
            <div v-if="megaInfo" class="info-row">
              <dt>메가진화</dt>
              <dd class="muted" :class="{ 'mega-ok': megaInfo.ok }">{{ megaInfo.text }}</dd>
            </div>
          </dl>
          <p v-if="memberIdx === 0 && game.gimmickActive?.kind === 'mega'" class="muted held-line">
            지금 {{ formOf(game.gimmickActive.form)?.ko }}(으)로 메가진화한 상태입니다. (위 능력치는 원래 모습 기준)
          </p>
          <h4 class="sec stat-head">능력치</h4>
          <table class="stats">
            <thead>
              <tr>
                <th />
                <th>실능치</th>
                <th>종족값</th>
                <th>개체값</th>
                <th>노력치</th>
                <th title="끄면 전투로 이 능력치의 노력치를 얻지 않습니다">노력치 획득</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, i) in stats" :key="s.label">
                <th>{{ s.label }}</th>
                <td class="value" :class="s.mod">{{ s.value }}<span v-if="s.mod">{{ s.mod === 'up' ? '▲' : '▼' }}</span></td>
                <td :class="{ unknown: game.statViewLevel < 1 }">{{ game.statViewLevel >= 1 ? s.base : '???' }}</td>
                <td :class="{ unknown: game.statViewLevel < 2 }">{{ game.statViewLevel >= 2 ? s.iv : '???' }}</td>
                <td :class="{ unknown: game.statViewLevel < 3 }">{{ game.statViewLevel >= 3 ? s.ev : '???' }}</td>
                <td v-if="game.hasPerk('evBreak:1')">
                  <input
                    type="checkbox"
                    :checked="!s.locked"
                    @change="game.setEvLock(memberIdx, i, !($event.target as HTMLInputElement).checked)"
                  />
                </td>
                <td v-else class="unknown">???</td>
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
                <span class="muted num"><small>PP</small> {{ pendingList[0]!.info.pp ?? '-' }}</span>
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
              <div class="learn-tabs">
                <button v-for="t in LEARN_TABS" :key="t.id" type="button" :class="{ active: learnTab === t.id }" @click="learnTab = t.id">
                  {{ t.label }} <small>{{ t.n }}</small>
                </button>
              </div>
              <div class="move-filter">
                <select v-model="typeFilter" class="type-select" :style="typeFilter ? { background: TYPE_COLORS[typeFilter], color: '#fff' } : {}">
                  <option value="">모든 타입</option>
                  <option v-for="ty in TYPE_OPTIONS" :key="ty" :value="ty">{{ dexData?.types[ty] ?? ty }}</option>
                </select>
                <div class="cls-btns">
                  <button
                    v-for="c in ['', 'physical', 'special', 'status'] as const"
                    :key="c"
                    type="button"
                    :class="{ active: clsFilter === c }"
                    @click="clsFilter = c"
                  >
                    {{ c ? CLS_LABEL[c] : '전체' }}
                  </button>
                </div>
                <button v-if="filterOn" type="button" class="small-btn" @click="(typeFilter = ''), (clsFilter = '')">초기화</button>
              </div>
              <template v-if="learnTab === 'egg'">
                <h5 class="train-sec">
                  알 기술 물려받기
                  <span class="muted">1회 {{ won(EGG_MOVE_PRICE) }} (흉내허브) · 확률 = 이 포켓몬 암컷 비율 × 부모 수컷 비율 (도감에 등록된 성별은 100%) · 소지금 {{ won(game.money) }}</span>
                </h5>
                <p v-if="!learnMethods" class="msg">불러오는 중…</p>
                <p v-else-if="!fEgg.length" class="msg">{{ filterOn && eggRows.length ? FILTER_EMPTY : '새로 물려받을 수 있는 알 기술이 없습니다.' }}</p>
                <ul v-else class="rows mrows">
                  <li
                    v-for="o in fEgg"
                    :key="o.move"
                    :class="{ clickable: !eggBlock(o), disabled: !!eggBlock(o) }"
                    :title="eggBlock(o) || `${won(EGG_MOVE_PRICE)}을 내고 ${pct(o.chance)} 확률로 물려받습니다 (실패해도 돈은 사라짐)`"
                    @click="tryEgg(o)"
                  >
                    <span class="tm-name">
                      <span class="tm-move">{{ o.info?.ko ?? o.move }}</span>
                      <small class="tm-meta" :class="{ 'buy-tag': !!o.best && o.chance > 0 }">{{ parentText(o) }}</small>
                    </span>
                    <template v-if="o.info">
                      <span class="type" :style="{ background: TYPE_COLORS[o.info.type] }">{{ dexData.types[o.info.type] }}</span>
                      <span class="muted">{{ CLS_LABEL[o.info.cls] }}</span>
                      <span class="muted num"><small>위력</small> {{ o.info.power ?? '-' }}</span>
                      <span class="muted num"><small>명중</small> {{ o.info.acc ?? '-' }}</span>
                      <span class="muted num"><small>PP</small> {{ o.info.pp ?? '-' }}</span>
                    </template>
                  </li>
                </ul>
              </template>
              <template v-else-if="learnTab === 'tutor'">
                <h5 class="train-sec">
                  기술가르침
                  <span class="muted">소지금 {{ won(game.money) }} · BP {{ game.bp }} · 코인 {{ game.coins.toLocaleString() }}</span>
                </h5>
                <p v-if="!learnMethods" class="msg">불러오는 중…</p>
                <p v-else-if="!fTutor.length" class="msg">{{ filterOn && tutorRows.length ? FILTER_EMPTY : '기술가르침으로 새로 배울 수 있는 기술이 없습니다.' }}</p>
                <ul v-else class="rows mrows">
                  <li
                    v-for="t in fTutor"
                    :key="t.move"
                    :class="{ clickable: !tutorBlock(t), disabled: !!tutorBlock(t) }"
                    :title="tutorBlock(t) || `${tutorRegionTitle(t.src)} ${t.src.place}에서 배웁니다 (${tutorCostText(t.src.cost)})`"
                    @click="teachTutor(t)"
                  >
                    <span class="tm-name">
                      <span class="tm-move">{{ t.info?.ko ?? t.move }}</span>
                      <small class="tm-meta">
                        {{ t.src.place }} · {{ tutorCostText(t.src.cost) }}<template v-if="t.more"> · 외 {{ t.more }}곳</template>
                      </small>
                      <small class="tm-meta" :class="{ 'buy-tag': !t.open }">
                        {{ t.open ? tutorRegionTitle(t.src) : `${tutorRegionTitle(t.src)} ${t.src.gate} 도착 필요` }}
                      </small>
                    </span>
                    <template v-if="t.info">
                      <span class="type" :style="{ background: TYPE_COLORS[t.info.type] }">{{ dexData.types[t.info.type] }}</span>
                      <span class="muted">{{ CLS_LABEL[t.info.cls] }}</span>
                      <span class="muted num"><small>위력</small> {{ t.info.power ?? '-' }}</span>
                      <span class="muted num"><small>명중</small> {{ t.info.acc ?? '-' }}</span>
                      <span class="muted num"><small>PP</small> {{ t.info.pp ?? '-' }}</span>
                    </template>
                  </li>
                </ul>
              </template>
              <template v-else-if="learnTab === 'tm'">
                <h5 class="train-sec">
                  기술머신으로 가르치기
                  <span class="muted">소지금 {{ won(game.money) }}</span>
                </h5>
                <p v-if="!fMachines.length" class="msg">{{ filterOn && learnableMachines.length ? FILTER_EMPTY : '기술머신으로 새로 배울 수 있는 기술이 없습니다.' }}</p>
                <ul v-else class="rows mrows">
                  <li
                    v-for="t in fMachines"
                    :key="t.move"
                    class="clickable"
                    @click="tmDialog = t"
                  >
                    <span class="tm-name">
                      <span class="tm-move">{{ t.info?.ko ?? t.move }}</span>
                      <small class="tm-meta">
                        {{ t.name }} · 보유 {{ t.n }}
                      </small>
                    </span>
                    <template v-if="t.info">
                      <span class="type" :style="{ background: TYPE_COLORS[t.info.type] }">{{ dexData.types[t.info.type] }}</span>
                      <span class="muted">{{ CLS_LABEL[t.info.cls] }}</span>
                      <span class="muted num"><small>위력</small> {{ t.info.power ?? '-' }}</span>
                      <span class="muted num"><small>명중</small> {{ t.info.acc ?? '-' }}</span>
                      <span class="muted num"><small>PP</small> {{ t.info.pp ?? '-' }}</span>
                    </template>
                  </li>
                </ul>
              </template>
              <template v-else>
                <h5 class="train-sec">
                  잊은 기술 되살리기
                  <span class="muted">하트비늘 {{ heartScales }}개 보유 · 1개씩 소모<template v-if="!heartScales"> (도구상점 → 육성 → 기술에서 구매)</template></span>
                </h5>
                <p v-if="!fForgotten.length" class="msg">{{ filterOn && forgotten.length ? FILTER_EMPTY : '잊은 기술이 없습니다.' }}</p>
                <ul v-else class="rows mrows">
                  <li
                    v-for="m in fForgotten"
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
                      <span class="muted num"><small>PP</small> {{ m.info.pp ?? '-' }}</span>
                    </template>
                  </li>
                </ul>
              </template>
              <div class="picker-actions">
                <button type="button" class="small-btn" @click="pickedSlot = null">취소</button>
              </div>
            </template>
          </section>

          <!-- 기술머신 확인 다이얼로그 -->
          <div v-if="tmDialog && picked" class="overlay" @click.self="tmDialog = null">
            <div class="dialog" role="dialog" aria-modal="true">
              <div class="dlg-head">
                <strong class="dlg-title">{{ tmDialog.info?.ko ?? tmDialog.move }}</strong>
                <span v-if="tmDialog.info" class="type" :style="{ background: TYPE_COLORS[tmDialog.info.type] }">{{ dexData.types[tmDialog.info.type] }}</span>
              </div>
              <dl v-if="tmDialog.info" class="dlg-stats">
                <div><dt>분류</dt><dd>{{ CLS_LABEL[tmDialog.info.cls] }}</dd></div>
                <div><dt>위력</dt><dd>{{ tmDialog.info.power ?? '-' }}</dd></div>
                <div><dt>명중</dt><dd>{{ tmDialog.info.acc ?? '-' }}</dd></div>
                <div><dt>PP</dt><dd>{{ tmDialog.info.pp ?? '-' }}</dd></div>
              </dl>
              <p class="dlg-desc">{{ tmEffect || '추가 효과 없음' }}</p>
              <p class="muted dlg-line">
                {{ tmDialog.name }} · 보유 {{ tmDialog.n }}<template v-if="tmDialog.record"> · 1개 소모</template>
              </p>
              <p class="muted dlg-line">
                {{ species(member!.species)?.ko }}의 {{ pickedSlot! + 1 }}번 칸{{ picked.kind === 'move' ? ` (${picked.info?.ko ?? picked.id} 대신)` : ' (빈 칸)' }}에 가르칩니다.
              </p>
              <p v-if="tmDialog.n <= 0" class="dlg-line" :class="game.money >= tmDialog.price ? 'buy-tag' : 'warn'">
                {{ game.money >= tmDialog.price ? `${won(tmDialog.price)}에 사서 바로 사용합니다.` : `소지금이 부족합니다 (${won(tmDialog.price)} 필요)` }}
              </p>
              <div class="dlg-actions">
                <button type="button" class="small-btn" @click="tmDialog = null">취소</button>
                <button
                  type="button"
                  class="small-btn primary"
                  :disabled="!!game.faint || (tmDialog.n <= 0 && game.money < tmDialog.price)"
                  @click="confirmTm"
                >
                  {{ tmDialog.n > 0 ? '사용' : `구매 후 사용 (${won(tmDialog.price)})` }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* 기술 교체: 자력기 / 기술머신 탭 */
.learn-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.learn-tabs button {
  flex: 1;
  padding: 6px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.learn-tabs button.active {
  border-color: #ffcb05;
  color: #fff;
}

/* 기술 목록 필터: 타입 선택 + 물리/특수/변화 */
.move-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.type-select {
  padding: 4px 6px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #1e1e26;
  color: #ddd;
  font: inherit;
  font-size: 12px;
}

.cls-btns {
  display: flex;
  flex: 1;
  gap: 4px;
}

.cls-btns button {
  flex: 1;
  padding: 4px 0;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.cls-btns button.active {
  border-color: #ffcb05;
  color: #fff;
}

/* 기술머신 줄: 기술 이름 / 머신·보유·가격 두 줄 */
.tm-name {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tm-move,
.tm-meta {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tm-meta {
  color: #8a8a96;
  font-size: 11px;
}

.buy-tag {
  color: #ffb74d;
}

/* 기술머신 확인 다이얼로그 */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(10, 10, 14, 0.7);
}

.dialog {
  width: 100%;
  max-width: 360px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 14px;
  border: 1px solid #3a3a44;
  border-radius: 12px;
  background: #1e1e24;
  color: #eee;
}

.dlg-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dlg-title {
  font-size: 17px;
}

.dlg-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin: 10px 0;
}

.dlg-stats div {
  padding: 6px 4px;
  border-radius: 6px;
  background: #2a2a33;
  text-align: center;
}

.dlg-stats dt {
  color: #8a8a96;
  font-size: 11px;
}

.dlg-stats dd {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.dlg-desc {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #2a2a33;
  font-size: 13px;
  line-height: 1.5;
}

.dlg-line {
  margin: 4px 0;
  font-size: 12px;
}

.dlg-line.warn {
  color: #ff8a80;
}

.dlg-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 12px;
}

.small-btn.primary:not(:disabled) {
  border-color: #ffcb05;
  color: #ffcb05;
}

.item-text.why {
  color: #ffb74d;
}

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
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 6px 0;
}

.held-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.held-chip:not(.chip) + .held-chip::before {
  content: '·';
  margin-right: 2px;
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
  gap: 10px;
  margin-bottom: 10px;
  padding: 6px 10px 8px 4px;
  border-radius: 8px;
  background: #23232b;
}

.head-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.head-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.head-name {
  font-size: 17px;
}

.gender {
  font-weight: 700;
}

.gender.M {
  color: #6aa8ff;
}

.gender.F {
  color: #ff7aa8;
}

.lv-badge {
  padding: 1px 6px;
  border-radius: 4px;
  background: #ffcb05;
  color: #1e1e24;
  font-size: 12px;
  font-weight: 700;
}

.faint-badge {
  padding: 1px 6px;
  border-radius: 4px;
  background: #7a2f2f;
  color: #fff;
  font-size: 12px;
}

.head-hp {
  font-size: 12px;
}

/* 성격·특성·도구 등: 왼쪽 라벨 + 오른쪽 내용 */
.info {
  margin: 0 0 12px;
  border: 1px solid #3a3a44;
  border-radius: 8px;
  overflow: hidden;
}

.info-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: start;
}

.info-row + .info-row {
  border-top: 1px solid #34343e;
}

.info dt {
  padding: 7px 10px;
  background: #23232b;
  color: #8a8a96;
  font-size: 12px;
  line-height: 20px;
}

.info dd {
  margin: 0;
  padding: 7px 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  font-size: 13px;
  line-height: 20px;
}

.info dd.col {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.info .chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  border-radius: 4px;
  background: #3a3a46;
  color: #eee;
  font-size: 12px;
}

.info .chip.hidden-ab {
  background: #3d2a5c;
  color: #c9a0ff;
  font-size: 11px;
}

.ab-name {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info .desc {
  color: #9a9aa6;
  font-size: 12px;
  line-height: 1.5;
}

.nat {
  font-size: 12px;
}

.nat.up {
  color: #ff8a7a;
}

.nat.down {
  color: #7aa8ff;
}

.stat-head {
  margin-top: 4px;
}

.stats td.unknown {
  color: #5a5a66;
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
  grid-template-columns: minmax(0, 1fr) 4.2em 2.4em 4em 4em 3.2em;
  gap: 6px;
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
