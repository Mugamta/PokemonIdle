<script setup lang="ts">
import { computed, ref } from 'vue'
import { phaseAt, useNow, type Phase } from '../core/dayNight'
import { encountersAt, speciesName } from '../data/encounters'
import type { Stage } from '../data/stages'
import { BOSS_DEFEATS, stageSpecies, TRAVEL_MS, useGameStore } from '../stores/game'
import PokeSprite from './PokeSprite.vue'

const props = defineProps<{ stage: Stage }>()

const game = useGameStore()
const now = useNow()

// 보고 있는 출현표 (기본: 현재 시간대). 낮/밤이 같은 장소는 탭을 숨김
const viewPhase = ref<Phase>(phaseAt(now.value))
const hasPhases = computed(() => !!props.stage.encounters && !('all' in props.stage.encounters))
const entries = computed(() =>
  props.stage.encounters ? encountersAt(props.stage.encounters, viewPhase.value) : [],
)

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
    <p v-else class="none">출현 정보 준비 중</p>

    <div class="actions">
      <button v-if="isHere" type="button" class="move" disabled>현재 위치</button>
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
