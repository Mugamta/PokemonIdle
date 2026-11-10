<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { dexData, learnsets, loadDex, loadLearnsets, TYPE_COLORS } from '../data/dex'
import { loadBattle } from '../data/battle'
import { evolutionsOf, loadEvolutions } from '../data/evolutions'
import { moveEffectText } from '../data/moveText'
import { calcStats, NATURES } from '../data/natures'
import { rollStarter, STARTER_CHANCES, STARTER_LEVEL, STARTERS, type StarterRoll } from '../data/starters'
import { useGameStore } from '../stores/game'
import { STAT_LABELS } from '../data/dex'
import PokeSprite from './PokeSprite.vue'

const game = useGameStore()
const error = ref<string | null>(null)
const roll = ref<StarterRoll>(rollStarter())
const rerolls = ref(0)
const showTable = ref(false)

onMounted(() =>
  Promise.all([loadDex(), loadLearnsets(), loadEvolutions(), loadBattle()])
    .then(() => startSpin())
    .catch((e) => (error.value = String(e))),
)

// ── 슬롯머신 연출 ──
// 포켓몬이 멈춘 뒤 성격이 돌기 시작하고, 성격이 멈춘 뒤 개체값(6칸)이 돌기 시작한다.
// 개체값은 함께 돌다가 한 칸씩 멈춘다. 멈추기 직전엔 점점 느려짐.
const SKIP_KEY = 'pokemonidle.skipStarterAnim'
const skipAnim = ref(localStorage.getItem(SKIP_KEY) === '1')
function toggleSkip() {
  skipAnim.value = !skipAnim.value
  localStorage.setItem(SKIP_KEY, skipAnim.value ? '1' : '0')
  if (skipAnim.value) finishSpin()
}

const NATURE_KEYS = Object.keys(NATURES)
const randOf = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]!

/** 슬롯별 [돌기 시작, 멈춤] (ms). 0 포켓몬, 1 성격, 2~7 개체값 */
const SLOT_TIMES: [number, number][] = [
  [0, 1400],
  [1400, 2300],
  ...Array.from({ length: 6 }, (_, i) => [2300, 3000 + i * 200] as [number, number]),
]
const SLOT_STOPS = SLOT_TIMES.map(([, stop]) => stop)
/** 아직 순서가 안 와서 대기 중인 슬롯 ('?' 표시) */
const waiting = ref<boolean[]>(SLOT_STOPS.map(() => false))
/** 대기 또는 회전 중인 슬롯 */
const spinning = ref<boolean[]>(SLOT_STOPS.map(() => false))
const isSpinning = computed(() => spinning.value.some(Boolean))
const shownId = ref(roll.value.id)
const shownNature = ref(roll.value.nature)
const shownIvs = ref<number[]>([...roll.value.ivs])

let raf = 0
function finishSpin() {
  cancelAnimationFrame(raf)
  raf = 0
  shownId.value = roll.value.id
  shownNature.value = roll.value.nature
  shownIvs.value = [...roll.value.ivs]
  spinning.value = SLOT_STOPS.map(() => false)
  waiting.value = SLOT_STOPS.map(() => false)
}

function startSpin() {
  if (skipAnim.value) return finishSpin()
  cancelAnimationFrame(raf)
  const start = performance.now()
  const nextAt = SLOT_STOPS.map(() => 0)
  spinning.value = SLOT_STOPS.map(() => true)
  waiting.value = SLOT_TIMES.map(([begin]) => begin > 0)
  const frame = (now: number) => {
    const t = now - start
    const state = [...spinning.value]
    const wait = [...waiting.value]
    SLOT_TIMES.forEach(([begin, stop], i) => {
      if (!state[i]) return
      if (t < begin) return
      wait[i] = false
      if (t >= stop) {
        state[i] = false
        if (i === 0) shownId.value = roll.value.id
        else if (i === 1) shownNature.value = roll.value.nature
        else shownIvs.value[i - 2] = roll.value.ivs[i - 2]!
        return
      }
      if (t < nextAt[i]!) return
      // 진행도에 따라 교체 간격을 50ms → 300ms 로 늘림
      const p = (t - begin) / (stop - begin)
      nextAt[i] = t + 50 + 250 * p ** 3
      if (i === 0) shownId.value = randOf(STARTERS).id
      else if (i === 1) shownNature.value = randOf(NATURE_KEYS)
      else shownIvs.value[i - 2] = Math.floor(Math.random() * 32)
    })
    spinning.value = state
    waiting.value = wait
    raf = state.some(Boolean) ? requestAnimationFrame(frame) : 0
  }
  raf = requestAnimationFrame(frame)
}
onUnmounted(() => cancelAnimationFrame(raf))

const showFinal = ref(false)
/** 화면에 표시할 포켓몬: '최종진화 보기' 중이면 최종진화 모습 (포켓몬 슬롯이 멈춘 뒤에만) */
const viewId = computed(() => (showFinal.value && !spinning.value[0] && finalEvos.value[0]?.id) || shownId.value)
const viewingFinal = computed(() => viewId.value !== shownId.value)
const entry = computed(() => dexData.value?.index.find((p) => p.id === viewId.value))
const chance = computed(() => STARTER_CHANCES.find((s) => s.id === shownId.value)!)
/** 실능치 표시 레벨 (노력치 0 기준) */
const STAT_LEVELS = [STARTER_LEVEL, 50, 100]
const statRows = computed(() =>
  entry.value
    ? STAT_LEVELS.map((lv) => ({
        lv,
        values: calcStats(entry.value!.stats, lv, shownIvs.value, [0, 0, 0, 0, 0, 0], shownNature.value),
      }))
    : [],
)

// ── 최종진화 보기: 카드의 도트·이름·타입·실능치를 최종진화 기준으로 바꿔 표시 ──
/** 진화 트리의 끝(더 이상 진화하지 않는 포켓몬)들. 분기 진화면 여러 개 */
const finalEvos = computed(() => {
  const index = dexData.value?.index ?? []
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const next = evolutionsOf(id).map((e) => e.to).filter((to) => index.some((p) => p.id === to))
    if (!next.length) out.push(id)
    else next.forEach(walk)
  }
  walk(roll.value.id)
  return out
    .filter((id) => id !== roll.value.id)
    .map((id) => index.find((p) => p.id === id)!)
})

// ── 전용기: 전용기 데이터가 따로 없으므로 '이 진화 계열만 배울 수 있는 기술' 로 계산 ──
/** 기술 번호 → 배울 수 있는 포켓몬 목록 */
const moveLearners = computed(() => {
  const map = new Map<number, string[]>()
  for (const [sp, list] of Object.entries(learnsets.value ?? {}))
    for (const m of list) {
      const arr = map.get(m[0]) ?? []
      if (arr.at(-1) !== sp) arr.push(sp)
      map.set(m[0], arr)
    }
  return map
})
const signatureMoves = computed(() => {
  const data = dexData.value
  if (!data || !learnsets.value) return []
  const line = new Set<string>()
  const walk = (id: string) => {
    if (line.has(id)) return
    line.add(id)
    evolutionsOf(id).forEach((e) => walk(e.to))
  }
  walk(shownId.value)
  const ko = (id: string) => data.index.find((p) => p.id === id)?.ko ?? id
  const out: { move: NonNullable<typeof firstMove.value>; how: string; effect: string }[] = []
  for (const [moveId, sps] of moveLearners.value) {
    if (!sps.every((sp) => line.has(sp))) continue
    const move = data.moves[moveId]
    if (!move) continue
    // 배우는 방법: 첫 번째 습득 포켓몬 기준 (레벨 0 = 진화 시)
    const sp = sps[0]!
    const e = learnsets.value[sp]!.find((m) => m[0] === moveId)!
    const how = e[1] === 'level' ? (e[2] === 0 ? '진화 시' : `Lv.${e[2]}`) : e[1] === 'tm' ? '기술머신' : '습득'
    out.push({ move, how: `${ko(sp)} ${how}`, effect: moveEffectText(move.id, moveId) })
  }
  return out
})

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
  startSpin()
}

function confirm() {
  if (!firstMove.value || isSpinning.value) return
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
      <div class="title">
        <h2>스타팅 포켓몬</h2>
        <button type="button" class="skip" :class="{ on: skipAnim }" @click="toggleSkip">
          {{ skipAnim ? '☑' : '☐' }} 연출 스킵
        </button>
      </div>

      <p v-if="error" class="muted">데이터를 불러오지 못했습니다: {{ error }}</p>
      <p v-else-if="!entry" class="muted">불러오는 중…</p>

      <template v-else>
        <div class="card">
          <div class="sprite slot" :class="{ spin: spinning[0] }"><PokeSprite :species="viewId" :size="96" /></div>
          <button
            v-if="finalEvos.length"
            type="button"
            class="final-btn"
            :class="{ on: showFinal }"
            :disabled="spinning[0]"
            @click="showFinal = !showFinal"
          >
            최종진화 {{ showFinal ? '숨기기' : '보기' }}
          </button>
          <div class="head slot" :class="{ spin: spinning[0] }">
            <span class="num">No.{{ String(entry.num).padStart(4, '0') }}</span>
            <strong class="name">{{ entry.ko }}</strong>
            <span v-if="viewingFinal" class="final-tag">최종진화</span>
            <span class="muted">Lv.{{ STARTER_LEVEL }}</span>
          </div>
          <div class="types">
            <span v-for="t in entry.types" :key="t" class="type" :style="{ background: TYPE_COLORS[t] }">
              {{ dexData!.types[t] }}
            </span>
            <span class="muted">{{ entry.genus }}</span>
          </div>
          <div class="info-row">
          <dl class="info">
            <dt>성격</dt>
            <dd><span class="slot" :class="{ spin: spinning[1] && !waiting[1], wait: waiting[1] }">{{ waiting[1] ? '???' : NATURES[shownNature]?.ko }}</span></dd>
            <dt>기술</dt>
            <dd>{{ spinning[0] ? '…' : (firstMove?.ko ?? '불러오는 중…') }}</dd>
            <dt>확률</dt>
            <dd>{{ spinning[0] ? '…' : `${chance.chance.toFixed(1)}%` }}</dd>
          </dl>
          <div v-if="!spinning[0] && signatureMoves.length" class="sig">
            <span class="sig-label">전용기</span>
            <div v-for="s in signatureMoves" :key="s.move.id" class="sig-move">
              <span class="type sm" :style="{ background: TYPE_COLORS[s.move.type] }">{{ dexData!.types[s.move.type] }}</span>
              <strong>{{ s.move.ko }}</strong>
              <small>{{ s.how }}</small>
              <span class="sig-spec">
                위력 {{ s.move.power ?? '-' }} · 명중 {{ s.move.acc ?? '-' }} · PP {{ s.move.pp ?? '-' }}
              </span>
              <span v-if="s.effect" class="sig-effect">{{ s.effect }}</span>
            </div>
          </div>
          </div>
          <table class="stats">
            <thead>
              <tr><th /><th v-for="l in STAT_LABELS" :key="l">{{ l }}</th></tr>
            </thead>
            <tbody>
              <tr class="muted">
                <th>개체값</th>
                <td v-for="(v, i) in shownIvs" :key="i">
                  <span
                    class="slot"
                    :class="{ spin: spinning[i + 2] && !waiting[i + 2], wait: waiting[i + 2], max: !spinning[i + 2] && v === 31 }"
                    >{{ waiting[i + 2] ? '?' : v }}</span
                  >
                </td>
              </tr>
              <tr v-for="(r, ri) in statRows" :key="r.lv" :class="{ first: ri === 0 }">
                <th>실능치 <small>Lv.{{ r.lv }}</small></th>
                <td v-for="(v, i) in r.values" :key="i">{{ waiting[1] || waiting[i + 2] ? '?' : v }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="actions">
          <button type="button" class="reroll" :disabled="isSpinning" @click="reroll">다시 뽑기 <small v-if="rerolls">({{ rerolls }})</small></button>
          <button type="button" class="ok" :disabled="!firstMove || isSpinning" @click="confirm">이 포켓몬으로 시작</button>
        </div>

        <button type="button" class="toggle" @click="showTable = !showTable">
          확률표 {{ showTable ? '접기 ▴' : '보기 ▾' }}
        </button>
        <div v-if="showTable" class="table">
          <section v-for="[gen, rows] in tableGroups" :key="gen" class="gen">
            <h3>{{ gen }}세대</h3>
            <div v-for="{ s, p } in rows" :key="s.id" class="row" :class="{ current: !spinning[0] && s.id === roll.id }">
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
  overflow-x: hidden;
  overflow-y: auto;
  padding: 16px;
  border-radius: 12px;
  background: #1e1e24;
  border: 1px solid #3a3a44;
}

h2 {
  margin: 0;
  font-size: 18px;
  text-align: center;
}

.title {
  position: relative;
  margin-bottom: 12px;
}

.skip {
  position: absolute;
  top: 50%;
  right: 0;
  translate: 0 -50%;
  padding: 3px 8px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.skip.on {
  border-color: #ffcb05;
  color: #ffcb05;
}

.slot {
  display: inline-block;
  transition: color 0.2s;
}

.slot.spin {
  color: #ffcb05;
  animation: slot-roll 0.12s linear infinite;
}

.sprite.slot.spin {
  animation: slot-roll-big 0.12s linear infinite;
}

.slot.wait {
  color: #6a6a76;
}

.slot:not(.spin):not(.wait) {
  animation: slot-stop 0.25s ease-out;
}

/* 이름 줄은 전체 폭이라 확대하면 넘침 → 왼쪽 기준으로 살짝만 */
.head.slot:not(.spin) {
  transform-origin: left center;
  animation-name: slot-stop-sm;
}

@keyframes slot-stop-sm {
  0% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

.slot.max {
  color: #ffcb05;
  font-weight: 700;
}

@keyframes slot-roll {
  0% { transform: translateY(-3px); opacity: 0.6; }
  50% { transform: translateY(3px); opacity: 1; }
  100% { transform: translateY(-3px); opacity: 0.6; }
}

@keyframes slot-roll-big {
  0% { transform: translateY(-6px); filter: blur(1px); }
  50% { transform: translateY(6px); filter: blur(1px); }
  100% { transform: translateY(-6px); filter: blur(1px); }
}

@keyframes slot-stop {
  0% { transform: scale(1.25); }
  100% { transform: scale(1); }
}

.card {
  position: relative;
  padding: 12px;
  border-radius: 8px;
  background: #2a2a33;
}

.final-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 3px 8px;
  border: 1px solid #4a4a56;
  border-radius: 6px;
  background: #1e1e24;
  color: #b4b4c0;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.final-btn.on {
  border-color: #ffcb05;
  color: #ffcb05;
}

.final-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.final-tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: #3a3424;
  color: #ffcb05;
  font-size: 11px;
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

.info-row {
  display: flex;
  gap: 12px;
  /* 전용기 유무·길이와 관계없이 카드 크기가 같도록 고정 높이 (넘치면 전용기 칸만 스크롤) */
  height: 116px;
  margin: 0 0 10px;
}

.info-row .info {
  flex: none;
  margin: 0;
}

.sig {
  flex: 1;
  min-width: 0;
  max-height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  font-size: 13px;
}

.sig-label {
  color: #9a9aa6;
  font-size: 11px;
}

.sig-move {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 2px 6px;
  text-align: right;
}

.sig-spec,
.sig-effect {
  width: 100%;
  font-size: 11px;
}

.sig-spec {
  color: #c4c4d0;
  font-variant-numeric: tabular-nums;
}

.sig-effect {
  color: #9a9aa6;
  line-height: 1.35;
}

.sig-move + .sig-move {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #3a3a44;
}

.sig-move small {
  width: 100%;
  color: #8a8a96;
  font-size: 11px;
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

.stats tbody tr.first > * {
  border-top: 1px solid #3a3a44;
}

.stats tbody th small {
  color: #7a7a86;
  font-size: 10px;
}

.stats tbody th {
  white-space: nowrap;
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

.reroll:disabled,
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
