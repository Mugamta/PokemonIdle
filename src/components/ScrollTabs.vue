<script setup lang="ts">
// 가로로 넘기는 탭 그룹: 넘치면 좌우 화살표, 마우스 드래그·휠·터치로 옆으로 이동 (HScroll)
import HScroll from './HScroll.vue'

defineProps<{ items: { key: string; label: string }[]; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [key: string] }>()
</script>

<template>
  <HScroll class="scroll-tabs" :active="modelValue">
    <button
      v-for="it in items"
      :key="it.key"
      type="button"
      class="tab"
      :class="{ active: it.key === modelValue }"
      @click="emit('update:modelValue', it.key)"
    >
      {{ it.label }}
    </button>
  </HScroll>
</template>

<style scoped>
.scroll-tabs {
  position: relative;
  border-bottom: 1px solid #3a3a44;
  background: #1e1e24;
}


.tab {
  flex: 0 0 auto;
  height: 36px;
  padding: 0 14px;
  border: none;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}

.tab:hover {
  color: #d0d0d8;
}

.tab.active {
  color: #ffcb05;
  font-weight: 700;
  box-shadow: inset 0 -2px 0 #ffcb05;
}

</style>
