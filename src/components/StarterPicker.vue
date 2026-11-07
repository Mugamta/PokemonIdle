<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dexData, learnsets, loadDex, loadLearnsets, TYPE_COLORS } from '../data/dex'
import { calcStats, NATURES } from '../data/natures'
import { rollStarter, STARTER_CHANCES, STARTER_LEVEL, type StarterRoll } from '../data/starters'
import { useGameStore } from '../stores/game'
import { STAT_LABELS } from '../data/dex'
import PokeSprite from './PokeSprite.vue'

const game = useGameStore()
const error = ref<string | null>(null)
const roll = ref<StarterRoll>(rollStarter())
const rerolls = ref(0)
const showTable = ref(false)

onMounted(() => Promise.all([loadDex(), loadLearnsets()]).catch((e) => (error.value = String(e))))

const entry = computed(() => dexData.value?.index.find((p) => p.id === roll.value.id))
const chance = computed(() => STARTER_CHANCES.find((s) => s.id === roll.value.id)!)
const stats = computed(() =>
  entry.value ? calcStats(entry.value.stats, STARTER_LEVEL, roll.value.ivs, [0, 0, 0, 0, 0, 0], roll.value.nature) : [],
)

/** 시작 기술 1개: Lv.5 이하에 자연 습득하는 공격 기술 중 위력이 가장 높은 것 */
const firstMove = computed(() => {
  const data = dexData.value
  const list = learnsets.value?.[roll.value.id]
  if (!data || !list) return null
  const candidates = list
    .filter((m) => m[1] === 'level' && m[2] >= 1 && m[2] <= STARTER_LEVEL)
    .map((m) => data.moves[m[0]]!)
  const attack = candidates.filter((m) => m.power).sort((a, b) => b.power! - a.power!)[0]
  return attack ?? candidates[0] ?? null
})

function reroll() {
  roll.value = rollStarter()
  rerolls.value++
}

function confirm() {
  if (!firstMove.value) return
  game.chooseStarter({
    species: roll.value.id,
    level: STARTER_LEVEL,
    nature: roll.value.nature,
    ivs: roll.value.ivs,
    evs: [0, 0, 0, 0, 0, 0],
    moves: [firstMove.value.id],
  })
}

// 확률표: 세대별로 묶어서 타입·종족값과 함께 표시
const tableGroups = computed(() => {
  const index = dexData.value?.index ?? []
  const groups = new Map<number, { s: (typeof STARTER_CHANCES)[number]; p: (typeof index)[number] }[]>()
  for (const s of STARTER_CHANCES) {
    const p = index.find((x) => x.id === s.id)
    if (!p) continue
    if (!groups.has(p.gen)) groups.set(p.gen, [])
    groups.get(p.gen)!.push({ s, p })
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0])
})
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
</script>

<template>
  <div class="overlay">
    <div class="dialog">
      <h2>스타팅 포켓몬</h2>

      <p v-if="error" class="muted">데이터를 불러오지 못했습니다: {{ error }}</p>
      <p v-else-if="!entry" class="muted">불러오는 중…</p>

      <template v-else>
        <div class="card">
          <div class="sprite"><PokeSprite :species="roll.id" :size="96" /></div>
          <div class="head">
            <span class="num">No.{{ String(entry.num).padStart(4, '0') }}</span>
            <strong class="name">{{ entry.ko }}</strong>
            <span class="muted">Lv.{{ STARTER_LEVEL }}</span>
          </div>
          <div class="types">
            <span v-for="t in entry.types" :key="t" class="type" :style="{ background: TYPE_COLORS[t] }">
              {{ dexData!.types[t] }}
            </span>
            <span class="muted">{{ entry.genus }}</span>
          </div>
          <dl class="info">
            <dt>성격</dt>
            <dd>{{ NATURES[roll.nature]?.ko }}</dd>
            <dt>기술</dt>
            <dd>{{ firstMove?.ko ?? '불러오는 중…' }}</dd>
            <dt>확률</dt>
            <dd>{{ chance.chance.toFixed(1) }}%</dd>
          </dl>
          <table class="stats">
            <thead>
              <tr><th /><th v-for="l in STAT_LABELS" :key="l">{{ l }}</th></tr>
            </thead>
            <tbody>
              <tr><th>실능치</th><td v-for="(v, i) in stats" :key="i">{{ v }}</td></tr>
              <tr class="muted"><th>개체값</th><td v-for="(v, i) in roll.ivs" :key="i">{{ v }}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="actions">
          <button type="button" class="reroll" @click="reroll">다시 뽑기 <small v-if="rerolls">({{ rerolls }})</small></button>
          <button type="button" class="ok" :disabled="!firstMove" @click="confirm">이 포켓몬으로 시작</button>
        </div>

        <button type="button" class="toggle" @click="showTable = !showTable">
          확률표 {{ showTable ? '접기 ▴' : '보기 ▾' }}
        </button>
        <div v-if="showTable" class="table">
          <section v-for="[gen, rows] in tableGroups" :key="gen" class="gen">
            <h3>{{ gen }}세대</h3>
            <div v-for="{ s, p } in rows" :key="s.id" class="row" :class="{ current: s.id === roll.id }">
              <div class="line">
                <span class="grow">{{ p.ko }}</span>
                <span v-for="t in p.types" :key="t" class="type sm" :style="{ background: TYPE_COLORS[t] }">
                  {{ dexData!.types[t] }}
                </span>
                <span class="pct">{{ s.chance.toFixed(1) }}%</span>
              </div>
              <div class="bst">
                <span v-for="(v, i) in p.stats" :key="i">{{ STAT_LABELS[i] }} {{ v }}</span>
                <strong>합계 {{ sum(p.stats) }}</strong>
              </div>
            </div>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sprite {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(10, 10, 14, 0.85);
}

.dialog {
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
  padding: 16px;
  border-radius: 12px;
  background: #1e1e24;
  border: 1px solid #3a3a44;
}

h2 {
  margin: 0 0 12px;
  font-size: 18px;
  text-align: center;
}

.card {
  padding: 12px;
  border-radius: 8px;
  background: #2a2a33;
}

.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.num {
  color: #8a8a96;
  font-size: 13px;
}

.name {
  font-size: 20px;
}

.types {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0;
}

.type {
  padding: 2px 8px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.muted {
  color: #9a9aa6;
  font-size: 13px;
}

.info {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0 0 10px;
  font-size: 14px;
}

.info dt {
  color: #9a9aa6;
}

.info dd {
  margin: 0;
}

.stats {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.stats th,
.stats td {
  padding: 3px 2px;
}

.stats thead th {
  color: #8a8a96;
  font-size: 11px;
  font-weight: 400;
}

.stats tbody th {
  text-align: left;
  color: #9a9aa6;
  font-weight: 400;
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.actions button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}

.reroll {
  background: #3a3a44;
  color: #eee;
}

.ok {
  background: #ffcb05;
  color: #1e1e24;
  font-weight: 700;
}

.ok:disabled {
  opacity: 0.5;
  cursor: default;
}

.toggle {
  width: 100%;
  margin-top: 10px;
  padding: 6px;
  border: none;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.table {
  margin-top: 4px;
  font-size: 13px;
}

.gen + .gen {
  margin-top: 8px;
}

.gen h3 {
  margin: 0 0 2px;
  padding: 0 6px;
  color: #ffcb05;
  font-size: 12px;
}

.row {
  padding: 5px 6px;
  border-radius: 4px;
}

.row.current {
  background: #3a3424;
}

.line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type.sm {
  padding: 1px 5px;
  font-size: 11px;
}

.bst {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin-top: 2px;
  color: #8a8a96;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.bst strong {
  color: #b4b4c0;
  font-weight: 600;
}

.grow {
  flex: 1;
}

.pct {
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
