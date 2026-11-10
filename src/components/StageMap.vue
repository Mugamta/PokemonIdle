<script setup lang="ts">
import { computed } from 'vue'
import { formatMs, phaseAt, phaseRemaining, useNow } from '../core/dayNight'
import { findStage } from '../data/stages'
import { useGameStore } from '../stores/game'
import { useStageViewStore } from '../stores/stageView'
import RegionMap from './RegionMap.vue'

const view = useStageViewStore()
const game = useGameStore()
const now = useNow()

const region = computed(() => view.region)
const current = computed(() => findStage(game.currentStageId))
const currentPlace = computed(() =>
  current.value?.region.id === region.value.id ? current.value.stage.place : null,
)

const label = computed(() => {
  const stage = region.value.stages.find((s) => s.id === view.stageId)
  if (stage) return `${stage.id}  ${stage.name}`
  return view.placeName
})

const phase = computed(() => phaseAt(now.value))
const travelTarget = computed(() => (game.travel ? findStage(game.travel.to)?.stage : null))
const travelLeft = computed(() =>
  game.travel ? Math.max(0, Math.ceil((game.travel.arriveAt - now.value) / 1000)) : 0,
)
</script>

<template>
  <div class="stage-map">
    <RegionMap
      v-if="region.map"
      :key="region.id"
      :map="region.map"
      :selected="view.placeName"
      :current="currentPlace"
      :label="label"
      @select="view.selectPlace"
    />
    <div v-else class="empty">{{ region.title }} 지도 준비 중</div>

    <!-- 상태 표시: 낮/밤, 현재 위치/이동 -->
    <div class="status">
      <span class="phase" :class="phase">
        {{ phase === 'day' ? '☀ 낮' : '☾ 밤' }} {{ formatMs(phaseRemaining(now)) }}
      </span>
      <span v-if="travelTarget" class="where">→ {{ travelTarget.id }} {{ travelTarget.name }} ({{ travelLeft }}초)</span>
      <span v-else-if="current" class="where">📍 {{ current.stage.id }} {{ current.stage.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.stage-map {
  position: relative;
  height: 100%;
}

.empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: #6a6a76;
}

.status {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  pointer-events: none;
}

.status > span {
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(20, 20, 26, 0.85);
  font-size: 13px;
}

.phase.day {
  color: #ffd76a;
}

.phase.night {
  color: #a9b8ff;
}
</style>
