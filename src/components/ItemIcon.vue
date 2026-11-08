<script setup lang="ts">
// 아이템 도트 (public/sprites/items, scripts/build-item-sprites.mjs 로 받음). 이미지가 없으면 빈 칸
// 기술머신은 가르치는 기술의 타입별 그림, 피크닉 용품은 공용 그림을 씀
import { computed, ref, watch } from 'vue'
import { dexData } from '../data/dex'

const props = withDefaults(defineProps<{ id: string; size?: number; lazy?: boolean }>(), { size: 30, lazy: false })
const failed = ref(false)
watch(
  () => props.id,
  () => (failed.value = false),
)
const base = import.meta.env.BASE_URL
const file = computed(() => {
  const info = dexData.value?.items[props.id]
  if (info?.pocket === 'machines' || /^(tm|hm|tr)\d/.test(props.id)) {
    if (props.id.startsWith('hm')) return 'hm-normal'
    const type = info?.move ? dexData.value?.movesById[info.move]?.type : undefined
    return `tm-${type ?? 'normal'}`
  }
  if (info?.cat === 'picnic') return 'picnic-set'
  return props.id
})
</script>

<template>
  <span class="item-icon" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="!failed" :src="`${base}sprites/items/${file}.png`" alt="" :loading="lazy ? 'lazy' : undefined" @error="failed = true" />
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
  object-fit: contain;
  image-rendering: pixelated;
}
</style>
