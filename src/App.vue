<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BattleScene from './components/BattleScene.vue'
import BattleTab from './components/BattleTab.vue'
import DexTab from './components/DexTab.vue'
import SettingsTab from './components/SettingsTab.vue'
import ScrollPanel from './components/ScrollPanel.vue'
import ShopTab from './components/ShopTab.vue'
import StageMap from './components/StageMap.vue'
import StarterPicker from './components/StarterPicker.vue'
import StageTab from './components/StageTab.vue'
import TabBar from './components/TabBar.vue'
import { TABS, type TabId } from './components/tabs'
import { installAudio, playMusic } from './core/audio'
import { startGameLoop } from './core/gameLoop'
import { load, save } from './core/save'
import { loadBattle } from './data/battle'
import { loadDex, loadLearnsets } from './data/dex'
import { loadEvolutions } from './data/evolutions'
import { useGameStore } from './stores/game'

const game = useGameStore()
let stopLoop: (() => void) | undefined
let autosave: ReturnType<typeof setInterval> | undefined

const activeTab = ref<TabId>('battle')
/** 저장 데이터 불러오기 완료 여부 (스타팅 선택 창 표시 판단용) */
const loaded = ref(false)
const activeLabel = computed(() => TABS.find((t) => t.id === activeTab.value)?.label)

// 배경음악: 포켓몬센터 회복 중 / 보스전 / 그 외
const music = computed(() => (!loaded.value ? null : game.faint ? 'center' : game.enemy?.boss ? 'boss' : 'field'))
watch(music, (id) => playMusic(id), { immediate: true })

onMounted(() => {
  installAudio()
  const data = load<typeof game.$state>()
  if (data) game.$patch(data.state)
  // stageOrder 가 없는 저장 데이터는 수상 스테이지 재배치 전 순서(1)
  game.validate(data ? (data.state.stageOrder ?? 1) : undefined)
  loaded.value = true
  // 전투에 필요한 데이터 (불러오기 전에는 전투가 진행되지 않음)
  Promise.all([loadDex(), loadLearnsets(), loadBattle(), loadEvolutions()])
    .then(() => {
      game.backfillLearned()
      game.checkEvolutions()
    })
    .catch((e) => console.error(e))

  stopLoop = startGameLoop((dt) => game.tick(dt))
  autosave = setInterval(() => save(game.$state), 10_000)
  window.addEventListener('beforeunload', () => save(game.$state))
})

onUnmounted(() => {
  stopLoop?.()
  clearInterval(autosave)
})
</script>

<template>
  <div class="screen">
    <!-- 상단 영역: 스테이지 탭에서는 지도, 그 외는 전투 화면 -->
    <section class="top">
      <StageMap v-if="activeTab === 'stage'" />
      <BattleScene v-else />
    </section>

    <!-- 하단: 선택된 탭의 내용 -->
    <ScrollPanel class="panel-area">
      <StageTab v-if="activeTab === 'stage'" />
      <DexTab v-else-if="activeTab === 'dex'" />
      <BattleTab v-else-if="activeTab === 'battle'" />
      <SettingsTab v-else-if="activeTab === 'settings'" />
      <ShopTab v-else-if="activeTab === 'shop'" key="shop" kind="item" />
      <ShopTab v-else-if="activeTab === 'upgrade'" key="upgrade" kind="upgrade" />
      <p v-else class="placeholder">{{ activeLabel }}</p>
    </ScrollPanel>

    <TabBar v-model="activeTab" />

    <!-- 파티가 비어 있으면 스타팅 포켓몬 선택 -->
    <StarterPicker v-if="loaded && !game.party.length" />
  </div>
</template>

<style scoped>
.screen {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  height: 100dvh;
  margin: 0 auto;
  background: #1e1e24;
  overflow: hidden;
}

.top {
  flex: 1 1 50%;
  min-height: 0;
}

.panel-area {
  flex: 1 1 50%;
  border-top: 1px solid #3a3a44;
}

.placeholder {
  margin: 0;
  color: #6a6a76;
}
</style>
