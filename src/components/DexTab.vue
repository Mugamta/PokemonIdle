<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { dexData, loadDex, TYPE_COLORS, type DexEntry } from '../data/dex'
import { familyRoot, loadEvolutions } from '../data/evolutions'
import { regionalDexOf } from '../data/regionalDex'
import { findStage, REGIONS } from '../data/stages'
import { useGameStore } from '../stores/game'
import DexDetail from './DexDetail.vue'
import DexItems from './DexItems.vue'
import PokeSprite from './PokeSprite.vue'

const game = useGameStore()
const error = ref<string | null>(null)
const query = ref('')
const selectedId = ref<string | null>(null)
const scrollTop = ref(0)
const listEl = ref<HTMLElement>()
/** 포켓몬 도감 / 도구 도감 */
const mode = ref<'pokemon' | 'items'>('pokemon')
/** 목록 필터: 전체 / 조우(포획 포함) / 포획 / 완성 */
const filter = ref<'all' | 'seen' | 'caught' | 'complete'>('all')
const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'seen', label: '조우' },
  { key: 'caught', label: '포획' },
  { key: 'complete', label: '완성' },
] as const

/** 전국도감은 두 번째 지방에 도달한 뒤에 받음 */
const hasNational = computed(() => game.everUnlockedRegions.length >= 2)

/** 세대 도감 보너스: 세대별 포획 수 / 전체 */
const genProgress = computed(() => {
  const index = dexData.value?.index ?? []
  const gens = [...new Set(index.map((p) => p.gen))].sort((a, b) => a - b)
  return gens.map((g) => {
    const list = index.filter((p) => p.gen === g)
    return { gen: g, caught: list.filter((p) => caughtSet.value.has(p.id)).length, total: list.length }
  })
})
/** 지역도감 / 전국도감 (지역도감이 먼저) */
const scope = ref<'national' | 'regional'>('regional')
/** 지역도감으로 볼 지방 (기본: 지금 있는 지방) */
const regionKey = ref(findStage(game.currentStageId)?.region.key ?? REGIONS[0]!.key)

const caughtSet = computed(() => new Set(game.caught))
/** 포획한 포켓몬이 하나라도 있는 지역도감만 (들어갈 수 없는 히든 지방은 숨김) */
const regionOptions = computed(() => {
  const nums = new Set((dexData.value?.index ?? []).filter((p) => caughtSet.value.has(p.id)).map((p) => p.num))
  return REGIONS.filter((r) => game.canEnter(r) && regionalDexOf(r.key).some((n) => nums.has(n)))
})
/** 보여줄 지방: 고른 지방이 목록에 없으면 첫 지방 */
const activeRegion = computed(
  () => regionOptions.value.find((r) => r.key === regionKey.value)?.key ?? regionOptions.value[0]?.key ?? null,
)
/** 실제로 보여줄 도감 범위 (전국도감 미획득이면 지역도감, 지역도감이 하나도 없으면 전국도감) */
const activeScope = computed<'national' | 'regional'>(() =>
  !hasNational.value ? 'regional' : scope.value === 'regional' && activeRegion.value ? 'regional' : 'national',
)

/** 진화형끼리 묶어서 보기 */
const grouped = ref(localStorage.getItem('dex-grouped') === '1')
watch(grouped, (v) => localStorage.setItem('dex-grouped', v ? '1' : '0'))
/** 묶음 행이 1초마다 다음 진화형으로 바뀌도록 하는 시계 */
const tick = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  Promise.all([loadDex(), loadEvolutions()]).catch((e) => (error.value = String(e)))
  timer = setInterval(() => tick.value++, 1000)
})
onUnmounted(() => clearInterval(timer))

/** 실제로 조우·포획한 포켓몬 (도감 공개 퍽과 무관) */
const seenSet = computed(() => new Set([...game.seen, ...game.caught]))
/** 현재 도감 범위의 포켓몬 (지역도감은 지역도감 번호 순) */
const scoped = computed<{ p: DexEntry; no: number }[]>(() => {
  const index = dexData.value?.index ?? []
  if (activeScope.value === 'national') return index.map((p) => ({ p, no: p.num }))
  const byNum = new Map(index.map((p) => [p.num, p]))
  return regionalDexOf(activeRegion.value ?? '').flatMap((num, i) => {
    const p = byNum.get(num)
    return p ? [{ p, no: i + 1 }] : []
  })
})
const filtered = computed(() => {
  let list = scoped.value
  if (filter.value === 'seen') list = list.filter(({ p }) => seenSet.value.has(p.id))
  else if (filter.value === 'caught') list = list.filter(({ p }) => caughtSet.value.has(p.id))
  else if (filter.value === 'complete') list = list.filter(({ p }) => completeSet.value.has(p.id))
  const q = query.value.trim()
  if (!q) return list
  const n = Number(q)
  // 번호 검색은 보고 있는 도감의 번호, 이름 검색은 조우한 포켓몬만 (미조우 포켓몬의 이름이 드러나지 않도록)
  return list.filter(({ p, no }) =>
    Number.isInteger(n) && n > 0 ? no === n : game.dexLevel(p.id) !== 'hidden' && p.ko.includes(q),
  )
})
const seenCount = computed(() => scoped.value.filter(({ p }) => seenSet.value.has(p.id)).length)
const caughtCount = computed(() => scoped.value.filter(({ p }) => caughtSet.value.has(p.id)).length)
/** 도감 완성 포켓몬 (성별·성격·특성·개체값·친밀도의 모든 범위를 가짐) */
const completeSet = computed(() => new Set(game.caught.filter((id) => game.dexComplete(id))))
const completeCount = computed(() => scoped.value.filter(({ p }) => completeSet.value.has(p.id)).length)
const pad = computed(() => (activeScope.value === 'national' ? 4 : 3))

type Row = { p: DexEntry; no: number }
/** 목록 행: 묶어 보기면 같은 진화 계통끼리 한 행 (계통 중 처음 나오는 번호 자리에) */
const rows = computed<Row[][]>(() => {
  if (!grouped.value) return filtered.value.map((r) => [r])
  const families = new Map<string, Row[]>()
  for (const r of filtered.value) {
    const root = familyRoot(r.p.id)
    const fam = families.get(root)
    if (fam) fam.push(r)
    else families.set(root, [r])
  }
  return [...families.values()]
})
/** 묶음 행에서 지금 보여줄 포켓몬 (공개된 포켓몬만 돌아가며, 모두 미공개면 첫 포켓몬) */
function shown(members: Row[]): Row {
  if (members.length === 1) return members[0]!
  const visible = members.filter(({ p }) => game.dexLevel(p.id) !== 'hidden')
  return visible.length ? visible[tick.value % visible.length]! : members[0]!
}

function open(id: string) {
  if (game.dexLevel(id) !== 'full') return
  // 상세에서 돌아왔을 때 목록 스크롤 위치를 복원하기 위해 패널 스크롤을 기억
  scrollTop.value = listEl.value?.closest('.panel')?.scrollTop ?? 0
  selectedId.value = id
}

async function back() {
  selectedId.value = null
  await Promise.resolve()
  requestAnimationFrame(() => {
    const panel = listEl.value?.closest('.panel')
    if (panel) panel.scrollTop = scrollTop.value
  })
}
</script>

<template>
  <p v-if="error" class="msg">도감 데이터를 불러오지 못했습니다: {{ error }}</p>
  <p v-else-if="!dexData" class="msg">도감 불러오는 중…</p>

  <DexDetail v-else-if="selectedId" :id="selectedId" @back="back" />

  <div v-else ref="listEl">
    <nav class="modes">
      <button type="button" :class="{ active: mode === 'pokemon' }" @click="mode = 'pokemon'">포켓몬</button>
      <button type="button" :class="{ active: mode === 'items' }" @click="mode = 'items'">도구</button>
    </nav>
    <DexItems v-if="mode === 'items'" />
    <template v-else>
    <header class="header">
      <div class="scopes">
        <button
          v-if="regionOptions.length"
          type="button"
          :class="{ active: activeScope === 'regional' }"
          @click="scope = 'regional'"
        >
          지역도감
        </button>
        <button
          v-if="hasNational"
          type="button"
          :class="{ active: activeScope === 'national' }"
          @click="scope = 'national'"
        >
          전국도감
        </button>
        <select
          v-if="activeScope === 'regional' && regionOptions.length"
          :value="activeRegion"
          class="region"
          @change="regionKey = ($event.target as HTMLSelectElement).value"
        >
          <option v-for="r in regionOptions" :key="r.key" :value="r.key">{{ r.title }}</option>
        </select>
      </div>
      <input v-model="query" class="search" type="search" placeholder="이름 또는 번호 검색" />
      <span class="count">조우 {{ seenCount }} · 포획 {{ caughtCount }} · 완성 {{ completeCount }} / {{ scoped.length }}</span>
      <div class="filters">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          type="button"
          :class="{ active: filter === f.key }"
          @click="filter = f.key"
        >
          {{ f.label }}
        </button>
        <button type="button" class="group" :class="{ active: grouped }" @click="grouped = !grouped">진화 묶기</button>
      </div>
    </header>
    <details class="bonus">
      <summary>
        세대 도감 보너스: 모든 실능치 <strong>+{{ Math.round(game.dexBoost * 100) }}%</strong>
        <small>(완성 {{ game.completedGens.length }}/{{ genProgress.length }}세대)</small>
      </summary>
      <p class="bonus-hint">한 세대의 포켓몬을 모두 잡을 때마다 파티 포켓몬의 모든 실능치가 10%씩 오릅니다 (합연산).</p>
      <ul class="gens">
        <li v-for="g in genProgress" :key="g.gen" :class="{ done: g.caught >= g.total }">
          {{ g.gen }}세대 <span>{{ g.caught }}/{{ g.total }}</span>
        </li>
      </ul>
    </details>
    <ul class="list">
      <li v-for="members in rows" :key="members[0]!.p.id">
        <button
          v-for="{ p, no } in [shown(members)]"
          :key="p.id"
          type="button"
          class="row"
          :class="game.dexLevel(p.id)"
          :disabled="game.dexLevel(p.id) !== 'full'"
          @click="open(p.id)"
        >
          <span v-if="game.dexLevel(p.id) === 'hidden'" class="unknown">?</span>
          <PokeSprite v-else :species="p.id" :size="36" lazy />
          <span class="num">No.{{ String(no).padStart(pad, '0') }}</span>
          <span class="name">{{ game.dexLevel(p.id) === 'hidden' ? '???' : p.ko }}</span>
          <span v-if="game.dexLevel(p.id) === 'full'" class="types">
            <span v-for="t in p.types" :key="t" class="type" :style="{ background: TYPE_COLORS[t] }">
              {{ dexData.types[t] }}
            </span>
          </span>
          <span v-if="members.length > 1" class="family" :title="`진화형 ${members.length}마리`">
            <span
              v-for="m in members"
              :key="m.p.id"
              class="dot"
              :class="{ on: m.p.id === p.id, caught: caughtSet.has(m.p.id) }"
            />
          </span>
          <span class="ball" :class="{ caught: caughtSet.has(p.id) }" :title="caughtSet.has(p.id) ? '포획' : '미포획'" />
        </button>
      </li>
    </ul>
    <p v-if="!filtered.length" class="msg">
      {{ query.trim() ? '검색 결과가 없습니다.' : filter === 'caught' ? '아직 포획한 포켓몬이 없습니다.' : filter === 'complete' ? '아직 완성한 포켓몬이 없습니다.' : '아직 조우한 포켓몬이 없습니다.' }}
    </p>
    </template>
  </div>
</template>

<style scoped>
.msg {
  margin: 8px 0;
  color: #6a6a76;
}

.modes {
  display: flex;
  margin: -12px -12px 0;
  background: #1e1e24;
  border-bottom: 1px solid #3a3a44;
}

.modes button {
  flex: 1;
  height: 40px;
  border: none;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.modes button.active {
  color: #fff;
  font-weight: 700;
  box-shadow: inset 0 -2px 0 #ffcb05;
}

.modes + .bonus {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #2a2a33;
  font-size: 13px;
}
.bonus summary {
  cursor: pointer;
}
.bonus strong {
  color: #ffcb05;
}
.bonus small {
  color: #8a8a96;
}
.bonus-hint {
  margin: 6px 0;
  color: #8a8a96;
  font-size: 12px;
}
.gens {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.gens li {
  padding: 3px 6px;
  border-radius: 4px;
  background: #1e1e24;
  font-size: 12px;
}
.gens li span {
  color: #8a8a96;
}
.gens li.done {
  background: #2f6b3f;
}
.gens li.done span {
  color: #fff;
}

.header {
  margin-top: 0;
}

.modes + div {
  margin-top: 12px;
}

.header {
  position: sticky;
  top: -12px;
  z-index: 1;
  margin: -12px -12px 8px;
  padding: 12px;
  background: #1e1e24;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.scopes {
  width: 100%;
  display: flex;
  gap: 6px;
}

.scopes button {
  padding: 5px 12px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #2a2a33;
  color: #9a9aa6;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.scopes button.active {
  border-color: #ffcb05;
  color: #fff;
  font-weight: 700;
}

.region {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #2a2a33;
  color: #eee;
  font: inherit;
  font-size: 13px;
}

.filters {
  width: 100%;
  display: flex;
  gap: 6px;
}

.filters button {
  padding: 4px 12px;
  border: 1px solid #3a3a44;
  border-radius: 999px;
  background: #2a2a33;
  color: #9a9aa6;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.filters button.active {
  border-color: #ffcb05;
  color: #fff;
  font-weight: 700;
}

.filters .group {
  margin-left: auto;
}

.family {
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  max-height: 36px;
  gap: 3px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #4a4a56;
}

.dot.caught {
  background: #8a8a96;
}

.dot.on {
  background: #ffcb05;
}

.search {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #2a2a33;
  color: #eee;
  font: inherit;
  font-size: 14px;
}

.count {
  color: #8a8a96;
  font-size: 13px;
  white-space: nowrap;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: none;
  border-radius: 6px;
  background: #2a2a33;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.row:not(:disabled):active {
  background: #34343f;
}

.row:disabled {
  cursor: default;
}

.row.hidden .name,
.row.hidden .num {
  color: #6a6a76;
}

.unknown {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a4a56;
  font-size: 20px;
  font-weight: 700;
}

.num {
  color: #8a8a96;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.name {
  flex: 1;
  font-size: 15px;
}

.types {
  display: flex;
  gap: 4px;
}

.type {
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.ball {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #4a4a56;
}

.ball.caught {
  border-color: #fff;
  background: linear-gradient(#e33 50%, #fff 50%);
}
</style>
