<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { REGIONS } from '../data/stages'
import { useGameStore } from '../stores/game'
import { useStageViewStore } from '../stores/stageView'
import StageDetail from './StageDetail.vue'

const view = useStageViewStore()
const game = useGameStore()
const showStages = ref(false)

function openRegion(id: number) {
  view.selectRegion(id)
  showStages.value = true
}

// 지도에서 장소를 고르면 목록을 열고 해당 항목으로 스크롤
const listEl = ref<HTMLElement>()
watch(
  () => view.stageId,
  async (id) => {
    if (!id) return
    showStages.value = true
    await nextTick()
    listEl.value
      ?.querySelector<HTMLElement>(`[data-id="${id}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  },
)
</script>

<template>
  <!-- 세부 스테이지 목록 -->
  <div v-if="showStages">
    <header class="header">
      <button type="button" class="back" @click="showStages = false">‹ 지방 목록</button>
      <h2 class="title">{{ view.region.id }}. {{ view.region.title }}</h2>
    </header>
    <ul ref="listEl" class="list">
      <li v-for="stage in view.region.stages" :key="stage.id" :data-id="stage.id" class="stage">
        <button
          type="button"
          class="item clickable"
          :class="{ selected: view.stageId === stage.id }"
          @click="view.toggleStage(stage.id)"
        >
          <span class="stage-id">{{ stage.id }}</span>
          <span class="name">{{ stage.name }}</span>
          <span v-if="stage.kind === 'water'" class="tag water">수상</span>
          <span v-if="game.currentStageId === stage.id" class="tag here">현재</span>
          <span v-if="game.clearedStages.includes(stage.id)" class="tag cleared">클리어</span>
          <span v-else-if="!game.stageUnlocked(stage.id)" class="tag lock">🔒</span>
          <span class="chevron">{{ view.stageId === stage.id ? '▴' : '▾' }}</span>
        </button>
        <StageDetail v-if="view.stageId === stage.id" :stage="stage" />
      </li>
    </ul>
  </div>

  <!-- 지방 목록 -->
  <ul v-else class="list">
    <li v-for="region in REGIONS" :key="region.id">
      <!-- 조건을 만족하지 못한 히든 지방은 이름을 가림 -->
      <div v-if="!game.canEnter(region)" class="item locked">
        <span class="num">{{ region.id }}</span>
        <span class="name">???</span>
        <span class="tag hidden">🔒 히든</span>
      </div>
      <button
        v-else
        type="button"
        class="item clickable"
        :class="{ selected: view.regionId === region.id }"
        @click="openRegion(region.id)"
      >
        <span class="num">{{ region.id }}</span>
        <span class="name">{{ region.name }} <small class="ver">{{ region.version }}</small></span>
        <span v-if="region.hidden" class="tag hidden">히든</span>
        <span class="count">{{ region.stages.length }}개</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.tag.here {
  background: #4a3f12;
  color: #ffcb05;
}

.tag.cleared {
  background: #2f6b3f;
  color: #fff;
}

.tag.lock {
  background: transparent;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stage {
  scroll-margin-top: 48px;
}

.item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: none;
  border-radius: 8px;
  background: #2a2a33;
  color: inherit;
  font: inherit;
  text-align: left;
}

.clickable {
  cursor: pointer;
}

.clickable:active {
  background: #34343f;
}

.item.selected {
  box-shadow: inset 0 0 0 2px #ffcb05;
}

.num {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #ffcb05;
  color: #1e1e24;
  font-weight: 700;
  font-size: 14px;
}

.stage-id {
  min-width: 40px;
  color: #ffcb05;
  font-weight: 700;
  font-size: 14px;
}

.ver {
  margin-left: 4px;
  font-size: 0.8em;
  opacity: 0.7;
}
.name {
  flex: 1;
  font-size: 16px;
}

.count,
.chevron {
  color: #8a8a96;
  font-size: 13px;
}

.tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.item.locked {
  color: #6a6a76;
}

.item.locked .num {
  background: #3a3a44;
  color: #8a8a96;
}

.tag.hidden {
  background: #3d2a5c;
  color: #c9a0ff;
}

.tag.water {
  background: #234a73;
  color: #a8d0ff;
}

/* 패널(.panel)의 padding 12px를 상쇄해 상단에 붙는 고정 헤더 */
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

.title {
  margin: 0;
  font-size: 16px;
}
</style>
