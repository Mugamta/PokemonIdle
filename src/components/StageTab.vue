<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { findStage, REGIONS, stageWeather, type Region } from '../data/stages'
import { DIFFICULTIES, WEATHER_LABELS, type Difficulty } from '../core/battle'
import { useGameStore } from '../stores/game'
import { useStageViewStore } from '../stores/stageView'
import StageDetail from './StageDetail.vue'
import LeagueDialog from './LeagueDialog.vue'

const view = useStageViewStore()
const game = useGameStore()
const showStages = ref(false)

/** 정복한 스테이지 수: 클리어 + 도감 완성 (출현 정보가 없는 스테이지는 클리어만) */
function conquered(region: Region) {
  return region.stages.filter((st) => game.clearedStages.includes(st.id) && game.stageDexDone(st) !== false).length
}

/** 난이도 탭: 난이도마다 진행도가 따로 (도감·파티·가방은 공용) */
const diffInfo = computed(() => DIFFICULTIES.find((d) => d.id === game.difficulty)!)
function pickDifficulty(d: Difficulty) {
  if (d === game.difficulty || game.faint) return
  if (game.league && !confirm('리그 도전 중입니다. 난이도를 바꾸면 도전 기록이 초기화됩니다. 바꿀까요?')) return
  if (!game.setDifficulty(d)) return
  showStages.value = false
  view.selectRegion(findStage(game.currentStageId)?.region.id ?? 1)
}

/** 지금 진행 중인 스테이지가 있는 지방 */
const currentRegionId = computed(() => findStage(game.currentStageId)?.region.id ?? null)

/** 리그 도전 창을 띄운 (잠긴) 지방 */
const leagueFor = ref<Region | null>(null)

function openRegion(region: Region) {
  // 앞 지방의 리그를 제패하지 않은 지방: 리그 도전 창
  if (game.regionLocked(region)) {
    leagueFor.value = region
    return
  }
  view.selectRegion(region.id)
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
  <!-- 난이도 탭 -->
  <nav class="diff-tabs" aria-label="난이도">
    <button
      v-for="d in DIFFICULTIES"
      :key="d.id"
      type="button"
      :class="['diff', d.id, { active: game.difficulty === d.id }]"
      :disabled="!!game.faint && game.difficulty !== d.id"
      :title="game.faint ? '회복 중에는 난이도를 바꿀 수 없습니다' : d.desc"
      @click="pickDifficulty(d.id)"
    >
      {{ d.label }}
    </button>
  </nav>
  <p class="diff-desc">{{ diffInfo.desc }}</p>

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
          :class="{ selected: view.stageId === stage.id, current: game.currentStageId === stage.id }"
          @click="view.toggleStage(stage.id)"
        >
          <span class="stage-id">{{ stage.id }}</span>
          <span class="name">{{ stage.name }}</span>
          <span v-if="stage.kind === 'water'" class="tag water">수상</span>
          <span v-if="stageWeather(stage.id)" class="tag weather" title="이곳에서는 항상 이 날씨로 전투합니다">{{ WEATHER_LABELS[stageWeather(stage.id)!] }}</span>
          <span v-if="game.currentStageId === stage.id" class="tag here">현재</span>
          <span v-if="game.stageDexDone(stage)" class="tag dex" title="출현 포켓몬을 모두 잡았습니다">도감 완성</span>
          <span v-if="game.clearedStages.includes(stage.id)" class="tag cleared">클리어</span>
          <span v-if="game.waterLocked(stage.id)" class="tag lock" title="파도타기 포켓몬이나 이곳에서 쓸 수 있는 낚싯대 필요">🔒</span>
          <span v-else-if="!game.clearedStages.includes(stage.id) && !game.stageUnlocked(stage.id)" class="tag lock">🔒</span>
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
        :class="{ selected: view.regionId === region.id, current: currentRegionId === region.id }"
        @click="openRegion(region)"
      >
        <span class="num">{{ region.id }}</span>
        <span class="name rname">{{ region.name }}<small class="ver">{{ region.version }}</small></span>
        <span v-if="region.hidden" class="tag hidden">히든</span>
        <span v-if="game.regionLocked(region)" class="tag league" title="앞 지방의 포켓몬 리그를 제패해야 갈 수 있습니다">🔒 리그</span>
        <span v-if="game.leagueCleared.includes(region.key)" class="tag champ" title="이 지방의 포켓몬 리그를 제패했습니다">리그 제패</span>
        <span v-if="game.regionDexDone(region)" class="tag dex" title="모든 스테이지의 출현 포켓몬을 잡았습니다">도감 완성</span>
        <span v-if="game.regionCleared(region)" class="tag cleared" title="모든 스테이지를 클리어했습니다">전부 클리어</span>
        <span class="count" title="정복한 스테이지 (클리어 + 도감 완성) / 전체 스테이지">정복 {{ conquered(region) }}/{{ region.stages.length }}개</span>
      </button>
    </li>
  </ul>
  <LeagueDialog v-if="leagueFor" :region="leagueFor" @close="leagueFor = null" />
</template>

<style scoped>
.diff-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.diff {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-radius: 8px;
  background: #2a2a33;
  color: #9a9aa6;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.diff:disabled {
  opacity: 0.5;
  cursor: default;
}
.diff.active.easy {
  background: #2f6b3f;
  color: #fff;
}
.diff.active.normal {
  background: #8a6d00;
  color: #fff;
}
.diff.active.hard {
  background: #7a2f2f;
  color: #fff;
}
.diff-desc {
  margin: 0 0 10px;
  color: #8a8a96;
  font-size: 12px;
  line-height: 1.4;
}

.tag.here {
  background: #4a3f12;
  color: #ffcb05;
}

.tag.cleared {
  background: #2f6b3f;
  color: #fff;
}

.tag.dex {
  background: #7a2f2f;
  color: #fff;
}

.tag.league {
  background: #3a3a44;
  color: #ffcb05;
}

.tag.champ {
  background: #8a6d00;
  color: #fff;
}

.tag.weather {
  background: #3a4a5e;
  color: #cfe6ff;
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

/* 지금 진행 중인 지방·스테이지: 테두리 점멸 */
.item.current {
  animation: current-blink 1.2s ease-in-out infinite;
}
@keyframes current-blink {
  0%,
  100% {
    box-shadow: inset 0 0 0 2px #ffcb05;
  }
  50% {
    box-shadow: inset 0 0 0 2px rgba(255, 203, 5, 0.1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .item.current {
    animation: none;
    box-shadow: inset 0 0 0 2px #ffcb05;
  }
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
/* 지방 이름: 버전은 항상 다음 줄, 넘치면 잘림 */
.rname {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.rname .ver {
  margin-left: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
