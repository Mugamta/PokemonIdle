<script setup lang="ts">
import { computed } from 'vue'

/** showNumbers: 현재/최대, display: 1 = 비율만, 2 = 현재/최대와 비율 */
const props = defineProps<{ hp: number; max: number; showNumbers?: boolean; display?: 0 | 1 | 2 }>()

const ratio = computed(() => (props.max > 0 ? Math.max(0, Math.min(1, props.hp / props.max)) : 0))
/** 원작처럼 50% 초과 초록, 20% 초과 노랑, 그 이하 빨강 */
const color = computed(() => (ratio.value > 0.5 ? 'green' : ratio.value > 0.2 ? 'yellow' : 'red'))
/** 비율(%) 표시: 남은 HP가 있으면 0%로 보이지 않게 */
const pct = computed(() => {
  const p = Math.floor(ratio.value * 100)
  return props.hp > 0 ? Math.max(1, p) : 0
})
const text = computed(() => {
  if (props.display === 2) return `${props.hp} / ${props.max} (${pct.value}%)`
  if (props.display === 1) return `${pct.value}%`
  if (props.showNumbers) return `${props.hp} / ${props.max}`
  return ''
})
</script>

<template>
  <div class="hp">
    <span class="tag">HP</span>
    <span class="track">
      <span class="fill" :class="color" :style="{ width: `${ratio * 100}%` }" />
    </span>
  </div>
  <div v-if="text" class="numbers">{{ text }}</div>
</template>

<style scoped>
.hp {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag {
  padding: 0 4px;
  border-radius: 3px;
  background: #f0b429;
  color: #3a2a00;
  font-size: 10px;
  font-weight: 800;
  line-height: 14px;
}

.track {
  flex: 1;
  height: 8px;
  border: 1px solid #111;
  border-radius: 4px;
  background: #444;
  overflow: hidden;
}

.fill {
  display: block;
  height: 100%;
  transition: width 0.4s ease-out, background-color 0.4s;
}

.fill.green {
  background: #3ddc6a;
}

.fill.yellow {
  background: #f5c542;
}

.fill.red {
  background: #f0533e;
}

.numbers {
  margin-top: 2px;
  color: #c8c8d0;
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
