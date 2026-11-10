<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  dexData,
  formatGens,
  learnsets,
  loadLearnsets,
  sightingsOf,
  STAT_LABELS,
  TYPE_COLORS,
  type LearnEntry,
} from '../data/dex'
import { artistNames, loadSprites, resolveVariant, spriteData } from '../data/sprites'
import { regionsOfGen } from '../data/stages'
import { useGameStore } from '../stores/game'
import PokeSprite from './PokeSprite.vue'
import DexSummon from './DexSummon.vue'
import SpritePicker from './SpritePicker.vue'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ back: [] }>()

const game = useGameStore()
const learnError = ref<string | null>(null)
onMounted(() => loadLearnsets().catch((e) => (learnError.value = String(e))))
onMounted(() => loadSprites().catch(() => {}))

const showPicker = ref(false)
const sprite = computed(() =>
  resolveVariant(spriteData.value?.variants[props.id], game.spriteDefault, game.spriteChoice[props.id]),
)

const data = computed(() => dexData.value!)
const entry = computed(() => data.value.index.find((p) => p.id === props.id)!)
const caught = computed(() => game.caught.includes(props.id))
const ownedLevels = computed(() => game.party.filter((m) => m.species === props.id).map((m) => m.level))
const statTotal = computed(() => entry.value.stats.reduce((a, b) => a + b, 0))
const sightings = computed(() => sightingsOf(props.id))

// 기술: 레벨업(공통) / 기술머신(공통, 레벨업 기록 없음) / 세대 한정
type Tab = 'level' | 'tm' | 'gen'
const moveTab = ref<Tab>('level')
const moves = computed(() => {
  const list = learnsets.value?.[props.id] ?? []
  return {
    level: list.filter((m): m is [number, 'level', number] => m[1] === 'level'),
    tm: list.filter((m): m is [number, 'tm'] => m[1] === 'tm'),
    gen: list.filter((m): m is Extract<LearnEntry, [number, 'gen', ...unknown[]]> => m[1] === 'gen'),
  }
})
const TAB_LABELS: Record<Tab, string> = { level: '레벨업', tm: '기술머신', gen: '세대 한정' }

const unlockedGens = computed(() => new Set(game.unlockedGens))
function genUnlocked(gens: number[]) {
  return gens.some((g) => unlockedGens.value.has(g))
}
/** 잠긴 세대 한정 기술: 해금에 필요한 지방 이름들 */
function requiredRegions(gens: number[]) {
  const names = gens.flatMap((g) => regionsOfGen(g).map((r) => r.title))
  return [...new Set(names)].join(' / ')
}
function genLevels(lv?: Record<string, number>) {
  if (!lv) return ''
  return Object.entries(lv)
    .map(([g, l]) => `${g}세대 Lv.${l || '진화'}`)
    .join(', ')
}

const moveInfo = (id: number) => data.value.moves[id]
const CLS_LABEL = { physical: '물리', special: '특수', status: '변화' }
const PHASE_LABEL = { all: '', day: '낮', night: '밤' }
</script>

<template>
  <div class="detail">
    <header class="header">
      <button type="button" class="back" @click="emit('back')">‹ 목록</button>
      <span class="num">No.{{ String(entry.num).padStart(4, '0') }}</span>
      <h2 class="title">{{ entry.ko }}</h2>
      <span class="ball" :class="{ caught }" />
    </header>

    <!-- 도트 -->
    <section class="card sprite-card">
      <PokeSprite :species="id" :size="112" />
      <div class="sprite-info">
        <template v-if="sprite">
          <span>{{ sprite.label }} <small class="muted">{{ sprite.official ? '공식' : '팬' }} 도트</small></span>
          <small class="muted">도트: {{ artistNames(sprite) }}</small>
        </template>
        <button type="button" class="sprite-btn" @click="showPicker = !showPicker">
          {{ showPicker ? '닫기' : '도트 변경' }}
        </button>
      </div>
    </section>
    <section v-if="showPicker" class="card">
      <SpritePicker :species="id" />
    </section>

    <!-- 기본 정보 -->
    <section class="card">
      <div class="types">
        <span v-for="t in entry.types" :key="t" class="type" :style="{ background: TYPE_COLORS[t] }">
          {{ data.types[t] }}
        </span>
        <span class="genus">{{ entry.genus }}</span>
      </div>
      <dl class="info">
        <dt>포획</dt>
        <dd :class="caught ? 'yes' : 'no'">{{ caught ? '포획함' : '미포획' }}</dd>
        <dt>보유 레벨</dt>
        <dd>{{ ownedLevels.length ? ownedLevels.map((l) => `Lv.${l}`).join(', ') : '-' }}</dd>
        <dt>첫 등장</dt>
        <dd>{{ entry.gen }}세대</dd>
        <dt>키 / 몸무게</dt>
        <dd>{{ entry.height }}m / {{ entry.weight }}kg</dd>
      </dl>
    </section>

    <DexSummon v-if="caught" :id="id" />

    <!-- 종족값 -->
    <section class="card">
      <h3>종족값 <small>합계 {{ statTotal }}</small></h3>
      <div v-for="(v, i) in entry.stats" :key="i" class="stat">
        <span class="label">{{ STAT_LABELS[i] }}</span>
        <span class="value">{{ v }}</span>
        <span class="bar"><span :style="{ width: `${Math.min(100, (v / 200) * 100)}%` }" /></span>
      </div>
    </section>

    <!-- 특성 -->
    <section class="card">
      <h3>특성</h3>
      <div v-for="[aid, hidden] in entry.abilities" :key="aid" class="ability">
        <div>
          <strong>{{ data.abilities[aid]?.ko }}</strong>
          <span v-if="hidden" class="tag">숨겨진 특성</span>
        </div>
        <p>{{ data.abilities[aid]?.text }}</p>
      </div>
    </section>

    <!-- 출현 장소 -->
    <section class="card">
      <h3>출현 장소</h3>
      <ul v-if="sightings.length" class="rows">
        <li v-for="(s, i) in sightings" :key="i">
          <span class="sid">{{ s.stage.id }}</span>
          <span class="grow">{{ s.stage.name }}</span>
          <span v-if="s.phase !== 'all'" class="phase">{{ PHASE_LABEL[s.phase] }}</span>
          <span class="muted">Lv.{{ s.min === s.max ? s.min : `${s.min}~${s.max}` }}</span>
          <span class="rate" :class="{ special: s.special }">{{ s.rate }}%</span>
        </li>
      </ul>
      <p v-else class="muted">현재 출현 정보가 있는 스테이지에서는 나오지 않습니다.</p>
    </section>

    <!-- 배울 수 있는 기술 -->
    <section class="card">
      <h3>배울 수 있는 기술</h3>
      <div class="tabs">
        <button
          v-for="t in ['level', 'tm', 'gen'] as const"
          :key="t"
          type="button"
          :class="{ active: moveTab === t }"
          @click="moveTab = t"
        >
          {{ TAB_LABELS[t] }} <small>{{ moves[t].length }}</small>
        </button>
      </div>
      <p class="hint">
        <template v-if="moveTab === 'level'">등장 이후 모든 세대에서 배울 수 있는 기술. 레벨이 오르면 자연 습득합니다.</template>
        <template v-else-if="moveTab === 'tm'">모든 세대에서 배울 수 있지만 레벨업으로는 배우지 않는 기술 (기술머신·교습 등).</template>
        <template v-else>일부 세대에서만 배울 수 있는 기술. 해당 세대의 지방이 해금되어 있으면 배울 수 있습니다.</template>
      </p>

      <p v-if="learnError" class="muted">기술 데이터를 불러오지 못했습니다: {{ learnError }}</p>
      <p v-else-if="!learnsets" class="muted">불러오는 중…</p>
      <ul v-else class="rows moves">
        <template v-if="moveTab === 'level'">
          <li v-for="[mid, , lv] in moves.level" :key="mid">
            <span class="lvl">{{ lv === 0 ? '진화' : `Lv.${lv}` }}</span>
            <span class="grow">{{ moveInfo(mid)?.ko }}</span>
            <span class="type sm" :style="{ background: TYPE_COLORS[moveInfo(mid)!.type] }">{{ data.types[moveInfo(mid)!.type] }}</span>
            <span class="muted pw">{{ CLS_LABEL[moveInfo(mid)!.cls] }} {{ moveInfo(mid)?.power ?? '-' }}</span>
          </li>
        </template>
        <template v-else-if="moveTab === 'tm'">
          <li v-for="[mid] in moves.tm" :key="mid">
            <span class="grow">{{ moveInfo(mid)?.ko }}</span>
            <span class="type sm" :style="{ background: TYPE_COLORS[moveInfo(mid)!.type] }">{{ data.types[moveInfo(mid)!.type] }}</span>
            <span class="muted pw">{{ CLS_LABEL[moveInfo(mid)!.cls] }} {{ moveInfo(mid)?.power ?? '-' }}</span>
          </li>
        </template>
        <template v-else>
          <li v-for="[mid, , gens, lv] in moves.gen" :key="mid" class="gen-row" :class="{ locked: !genUnlocked(gens) }">
            <div class="line">
              <span class="grow">{{ genUnlocked(gens) ? '' : '🔒 ' }}{{ moveInfo(mid)?.ko }}</span>
              <span class="type sm" :style="{ background: TYPE_COLORS[moveInfo(mid)!.type] }">{{ data.types[moveInfo(mid)!.type] }}</span>
              <span class="muted pw">{{ CLS_LABEL[moveInfo(mid)!.cls] }} {{ moveInfo(mid)?.power ?? '-' }}</span>
            </div>
            <div class="sub">
              {{ formatGens(gens) }}
              <template v-if="lv"> · {{ genLevels(lv) }}</template>
              <template v-if="!genUnlocked(gens)"> · {{ requiredRegions(gens) }} 해금 필요</template>
            </div>
          </li>
        </template>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.sprite-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sprite-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.sprite-btn {
  margin-top: 4px;
  padding: 5px 12px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #24242c;
  color: #ddd;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.header {
  position: sticky;
  top: -12px;
  z-index: 1;
  margin: -12px -12px 8px;
  padding: 12px;
  background: #1e1e24;
  display: flex;
  align-items: center;
  gap: 8px;
}

.back {
  border: none;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 0;
}

.num {
  color: #8a8a96;
  font-size: 13px;
}

.title {
  flex: 1;
  margin: 0;
  font-size: 17px;
}

.card {
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 8px;
  background: #2a2a33;
}

h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #ffcb05;
}

h3 small {
  margin-left: 6px;
  color: #9a9aa6;
  font-weight: 400;
}

.types {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.type {
  padding: 2px 8px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.type.sm {
  padding: 1px 5px;
  font-size: 11px;
}

.genus {
  color: #9a9aa6;
  font-size: 13px;
}

.info {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: 14px;
}

.info dt {
  color: #9a9aa6;
}

.info dd {
  margin: 0;
}

.info .yes {
  color: #7be38b;
}

.info .no {
  color: #9a9aa6;
}

.stat {
  display: grid;
  grid-template-columns: 48px 32px 1fr;
  align-items: center;
  gap: 8px;
  margin: 3px 0;
  font-size: 13px;
}

.stat .label {
  color: #9a9aa6;
}

.stat .value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.bar {
  height: 8px;
  border-radius: 4px;
  background: #1e1e24;
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  background: #ffcb05;
}

.ability + .ability {
  margin-top: 8px;
}

.ability p {
  margin: 2px 0 0;
  color: #b4b4c0;
  font-size: 13px;
}

.tag {
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #3d2a5c;
  color: #c9a0ff;
  font-size: 11px;
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
  padding: 6px 0;
  border-bottom: 1px solid #33333d;
  font-size: 14px;
}

.rows li:last-child {
  border-bottom: none;
}

.grow {
  flex: 1;
}

.sid {
  color: #ffcb05;
  font-size: 13px;
  font-weight: 700;
}

.phase {
  color: #a9b8ff;
  font-size: 12px;
}

.muted {
  color: #9a9aa6;
  font-size: 13px;
}

.rate {
  min-width: 44px;
  text-align: right;
}

.rate.special {
  color: #c9a0ff;
}

.tabs {
  display: flex;
  gap: 6px;
}

.tabs button {
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

.tabs button.active {
  border-color: #ffcb05;
  color: #fff;
}

.hint {
  margin: 8px 0 4px;
  color: #8a8a96;
  font-size: 12px;
}

.lvl {
  min-width: 44px;
  color: #ffcb05;
  font-size: 13px;
}

.pw {
  min-width: 56px;
  text-align: right;
}

.gen-row {
  flex-direction: column;
  align-items: stretch !important;
  gap: 2px !important;
}

.gen-row .line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gen-row .sub {
  color: #8a8a96;
  font-size: 12px;
}

.gen-row.locked .grow {
  color: #8a8a96;
}

.ball {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #4a4a56;
}

.ball.caught {
  border-color: #fff;
  background: linear-gradient(#e33 50%, #fff 50%);
}
</style>
