<script setup lang="ts">
import { computed, ref } from 'vue'
import { phaseAt, useNow, type Phase } from '../core/dayNight'
import { encountersAt, speciesName, type PhasedEntries, type WaterMethod } from '../data/encounters'
import type { Stage } from '../data/stages'
import { BOSS_DEFEATS, stageSpecies, TRAVEL_MS, useGameStore } from '../stores/game'
import PokeSprite from './PokeSprite.vue'

const props = defineProps<{ stage: Stage }>()

const game = useGameStore()
const now = useNow()

// 수상 스테이지: 보고 있는 출현표 ('use' = 지금 가진 수단(파도타기·고른 낚싯대)으로 만나는 출현표, 그 외 = 조우 방법별)
const METHOD_LABELS: Record<WaterMethod, string> = {
  surf: '파도타기',
  'old-rod': '낡은낚싯대',
  'good-rod': '좋은낚싯대',
  'super-rod': '대단한낚싯대',
}
const viewMethod = ref<'use' | WaterMethod>('use')
const methodList = computed(
  () => Object.keys(props.stage.encounters?.methods ?? {}) as WaterMethod[],
)
const shownSet = computed<PhasedEntries | null>(() => {
  const set = props.stage.encounters
  if (!set) return null
  if (!set.methods) return set
  return viewMethod.value === 'use' ? game.stageEncounters(props.stage) : (set.methods[viewMethod.value] ?? null)
})

// 보고 있는 출현표 (기본: 현재 시간대). 낮/밤이 같은 장소는 탭을 숨김
const viewPhase = ref<Phase>(phaseAt(now.value))
const hasPhases = computed(() => !!shownSet.value && !('all' in shownSet.value))
const entries = computed(() => (shownSet.value ? encountersAt(shownSet.value, viewPhase.value) : []))

const isHere = computed(() => game.currentStageId === props.stage.id)
const unlocked = computed(() => game.stageUnlocked(props.stage.id))
const progress = computed(() => game.progressOf(props.stage.id))
const allSpecies = computed(() => stageSpecies(props.stage.encounters))
const seenCount = computed(() => allSpecies.value.filter((s) => progress.value.seen.includes(s)).length)
const seen = (id: string) => progress.value.seen.includes(id)
const travelingHere = computed(() => game.travel?.to === props.stage.id)
const travelLeft = computed(() =>
  game.travel ? Math.max(0, Math.ceil((game.travel.arriveAt - now.value) / 1000)) : 0,
)
</script>

<template>
  <div class="detail">
    <div v-if="methodList.length" class="method-tabs">
      <button type="button" :class="{ active: viewMethod === 'use' }" @click="viewMethod = 'use'">사용 중</button>
      <button
        v-for="m in methodList"
        :key="m"
        type="button"
        :class="{ active: viewMethod === m, usable: game.waterMethods.includes(m) }"
        :title="game.waterMethods.includes(m) ? '지금 쓰는 조우 방법' : '지금 쓰지 않는 조우 방법'"
        @click="viewMethod = m"
      >
        {{ METHOD_LABELS[m] }}
      </button>
    </div>
    <p v-if="methodList.length && viewMethod === 'use'" class="method-note">
      {{
        game.waterMethods.length
          ? `${game.waterMethods.map((m) => METHOD_LABELS[m]).join(' + ')}${game.waterMethods.length > 1 ? ' (반반 섞음)' : ''}`
          : '파도타기를 아는 파티 포켓몬이나 낚싯대가 없습니다'
      }}
    </p>
    <div v-if="hasPhases" class="phase-tabs">
      <button
        v-for="p in ['day', 'night'] as const"
        :key="p"
        type="button"
        :class="{ active: viewPhase === p }"
        @click="viewPhase = p"
      >
        {{ p === 'day' ? '☀ 낮' : '☾ 밤' }}
        <small v-if="phaseAt(now) === p">(현재)</small>
      </button>
    </div>

    <p v-if="stage.encounters" class="progress">
      조우 {{ seenCount }}/{{ allSpecies.length }} · 보스까지 {{ Math.min(progress.defeats, BOSS_DEFEATS) }}/{{ BOSS_DEFEATS }}
      <span class="muted">— 일반 포켓몬을 {{ BOSS_DEFEATS }}마리 쓰러뜨리면 보스 등장 (보스전 후 다시 0부터)</span>
    </p>
    <ul v-if="entries.length" class="encounters">
      <li v-for="e in entries" :key="e.p" :class="{ special: e.special }">
        <PokeSprite :species="e.p" :size="32" lazy />
        <span class="mon">{{ speciesName(e.p) }}<small v-if="!e.special && seen(e.p)" class="seen"> ✓</small></span>
        <span class="lv">Lv.{{ e.min === e.max ? e.min : `${e.min}~${e.max}` }}</span>
        <span class="rate">{{ e.rate }}%</span>
        <span v-if="e.special" class="badge">특수</span>
      </li>
    </ul>
    <p v-else class="none">
      {{ !stage.encounters ? '출현 정보 준비 중' : '지금 가진 수단으로는 만날 수 있는 포켓몬이 없습니다' }}
    </p>

    <div class="actions">
      <button v-if="isHere" type="button" class="move" disabled>현재 위치</button>
      <button v-else-if="game.waterLocked(stage.id)" type="button" class="move" disabled>
        🔒 파도타기를 아는 파티 포켓몬이나 이곳에서 쓸 수 있는 낚싯대가 있어야 이동 가능
      </button>
      <button v-else-if="!unlocked" type="button" class="move" disabled>🔒 이전 스테이지 보스를 쓰러뜨리면 해금</button>
      <button v-else-if="game.faint" type="button" class="move" disabled>포켓몬 회복 중…</button>
      <template v-else-if="travelingHere">
        <button type="button" class="move" disabled>이동 중… {{ travelLeft }}초</button>
        <button type="button" class="cancel" @click="game.cancelTravel()">취소</button>
      </template>
      <button v-else type="button" class="move" @click="game.moveTo(stage.id)">
        {{ game.canFly ? '공중날기로 즉시 이동' : `이동하기 (${TRAVEL_MS / 1000}초)` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.progress {
  margin: 0 0 6px;
  color: #c8c8d0;
  font-size: 12px;
}

.progress .muted {
  color: #7a7a86;
}

.seen {
  color: #7fe0a0;
}

.detail {
  margin-top: 4px;
  padding: 10px 12px 12px;
  border-radius: 8px;
  background: #23232b;
}

.method-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.method-tabs button {
  padding: 4px 8px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: transparent;
  color: #6a6a76;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.method-tabs button.usable {
  color: #9fd8ff;
}

.method-tabs button:first-child {
  color: #c8c8d0;
}

.method-tabs button.active {
  border-color: #ffcb05;
  color: #fff;
}

.method-note {
  margin: 0 0 6px;
  color: #9a9aa6;
  font-size: 12px;
}

.phase-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.phase-tabs button {
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

.phase-tabs button.active {
  border-color: #ffcb05;
  color: #fff;
}

.encounters {
  list-style: none;
  margin: 0;
  padding: 0;
}

.encounters li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 2px;
  border-bottom: 1px solid #2e2e38;
  font-size: 14px;
}

.encounters li:last-child {
  border-bottom: none;
}

.mon {
  flex: 1;
}

.lv {
  color: #9a9aa6;
  font-size: 13px;
}

.rate {
  min-width: 48px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.special .mon,
.special .rate {
  color: #c9a0ff;
}

.badge {
  padding: 1px 5px;
  border-radius: 4px;
  background: #3d2a5c;
  color: #c9a0ff;
  font-size: 11px;
}

.none {
  margin: 4px 0;
  color: #6a6a76;
  font-size: 14px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.actions button {
  padding: 10px;
  border: none;
  border-radius: 6px;
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}

.move {
  flex: 1;
  background: #ffcb05;
  color: #1e1e24;
  font-weight: 700;
}

.move:disabled {
  background: #3a3a44;
  color: #9a9aa6;
  cursor: default;
}

.cancel {
  background: #3a3a44;
  color: #eee;
}
</style>
