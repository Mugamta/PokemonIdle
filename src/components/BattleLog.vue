<script setup lang="ts">
// 전투 탭 > 기록: 전투별 로그
import { computed, nextTick, ref, watch } from 'vue'
import HScroll from './HScroll.vue'
import { useBattleLogStore } from '../stores/battleLog'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const log = useBattleLogStore()

// 자동 전투 중에는 로그를 그리지 않음 (기록은 계속 쌓이고, 끄면 확인 가능)
const hideLog = computed(() => game.auto)

// 로그 자동 스크롤 (탭을 바꾸거나 보고 있는 전투에 줄이 추가될 때, 로그가 다시 보일 때)
const logEl = ref<HTMLElement>()
const latestId = computed(() => log.battles[log.battles.length - 1]?.id)
watch(
  () => [log.current?.id, hideLog.value || log.current?.lines.length],
  async () => {
    await nextTick()
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  },
  { immediate: true },
)
</script>

<template>
  <div class="log-wrap">
    <HScroll class="log-tabs" :active="log.current?.id">
      <button
        v-for="b in hideLog ? [] : log.battles"
        :key="b.id"
        type="button"
        class="log-tab"
        :class="{ active: b.id === log.current?.id, boss: b.boss, live: b.id === latestId }"
        :title="b.id === latestId ? '현재 전투' : ''"
        @click="log.select(b.id)"
      >
        {{ b.label }}
      </button>
    </HScroll>
    <div ref="logEl" class="log">
      <p v-if="hideLog" class="empty">자동 전투 중에는 로그를 표시하지 않습니다. 자동 전투를 끄면 최근 전투 기록을 확인할 수 있습니다.</p>
      <p v-else-if="!log.current?.lines.length" class="empty">전투 기록이 여기에 표시됩니다.</p>
      <template v-for="l in hideLog ? [] : (log.current?.lines ?? [])" :key="l.id">
        <hr v-if="l.kind === 'divider'" class="divider" />
        <p v-else :class="l.kind">{{ l.text }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.log-wrap {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 전투 기록이 없어도 탭 줄 높이를 유지 */
.log-tabs {
  --hs-arrow-size: 16px;
  flex: none;
  height: 20px;
  gap: 2px;
}

.log-tab {
  flex: none;
  padding: 2px 8px;
  border: none;
  border-radius: 5px 5px 0 0;
  background: #24242b;
  color: #7a7a86;
  font: inherit;
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}

.log-tab.boss {
  color: #d9a441;
}

.log-tab.live::after {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-left: 4px;
  border-radius: 50%;
  background: #7fe0a0;
  vertical-align: middle;
}

.log-tab.active {
  background: #18181d;
  color: #eee;
  font-weight: 700;
}

.log-tab.boss.active {
  color: #ffcb05;
}

.log {
  flex: 1;
  min-height: 72px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 8px 10px;
  border-radius: 6px;
  border-top-left-radius: 0;
  background: #18181d;
  font-size: 13px;
  line-height: 1.6;
}

.log p {
  margin: 0;
  color: #c8c8d0;
}

.log .info {
  color: #81b9ef;
}

.log .good {
  color: #7fe0a0;
}

.log .bad {
  color: #ff8a80;
}

.log .divider {
  margin: 6px 0;
  border: none;
  border-top: 1px dashed #3a3a48;
}

.log .empty {
  color: #6a6a76;
}
</style>
