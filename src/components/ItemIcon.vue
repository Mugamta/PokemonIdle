<script setup lang="ts">
// 아이템 도트 (public/sprites/items, scripts/build-item-sprites.mjs 로 받음). 이미지가 없으면 빈 칸
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{ id: string; size?: number }>(), { size: 30 })
const failed = ref(false)
watch(
  () => props.id,
  () => (failed.value = false),
)
const base = import.meta.env.BASE_URL
</script>

<template>
  <span class="item-icon" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="!failed" :src="`${base}sprites/items/${id}.png`" alt="" @error="failed = true" />
  </span>
</template>

<style scoped>
.item-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.item-icon img {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
</style>
