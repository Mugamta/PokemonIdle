<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { PlaceKind, RegionMap } from '../data/maps/types'

const props = defineProps<{
  map: RegionMap
  /** 선택한 장소 이름 */
  selected: string | null
  /** 현재 위치한 장소 이름 (지도에 마커 표시) */
  current: string | null
  /** 선택 장소 설명 (지도 하단에 표시) */
  label: string | null
}>()
const emit = defineEmits<{ select: [name: string | null] }>()

const TILE = 12

const COLORS: Record<PlaceKind, string> = {
  route: '#c9a66b',
  water: '#3d7fc4',
  forest: '#2f7d3a',
  cave: '#8a7560',
  building: '#9b6fc0',
  park: '#6cbf5a',
  town: '#e8e8ee',
}

// 장소별 타일 목록 (rect를 개별 칸으로 분해해 도트 느낌으로 그림)
const places = computed(() =>
  props.map.places.map((place) => {
    const cells: { x: number; y: number }[] = []
    for (const [x, y, w, h] of place.rects)
      for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) cells.push({ x: i, y: j })
    return { ...place, cells, color: COLORS[place.kind] }
  }),
)

const selectedPlace = computed(() => places.value.find((p) => p.name === props.selected) ?? null)
const currentMarker = computed(() => {
  const place = props.map.places.find((p) => p.name === props.current)
  if (!place) return null
  const [x, y, w, h] = place.rects[0]!
  return { cx: (x + w / 2) * TILE - 0.5, cy: (y + h / 2) * TILE - 0.5 }
})

const scroller = ref<HTMLElement>()

function centerOn(name: string | null, smooth: boolean) {
  const el = scroller.value
  const place = props.map.places.find((p) => p.name === name)
  if (!el || !place) return
  const [x, y, w, h] = place.rects[0]!
  el.scrollTo({
    left: (x + w / 2) * TILE - el.clientWidth / 2,
    top: (y + h / 2) * TILE - el.clientHeight / 2,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

// 마우스 드래그로 지도 이동 (터치는 기본 스크롤 사용). 드래그 후에는 클릭 선택을 무시
let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null
let suppressClick = false
const dragging = ref(false)

function onPointerDown(e: PointerEvent) {
  suppressClick = false
  if (e.pointerType !== 'mouse' || !scroller.value) return
  const el = scroller.value
  drag = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false }
}

function onPointerMove(e: PointerEvent) {
  if (!drag || !scroller.value) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  if (!drag.moved && Math.hypot(dx, dy) < 4) return
  drag.moved = true
  dragging.value = true
  scroller.value.scrollLeft = drag.left - dx
  scroller.value.scrollTop = drag.top - dy
}

function onPointerUp() {
  suppressClick = !!drag?.moved
  drag = null
  dragging.value = false
}

function select(name: string | null) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  emit('select', name)
}

watch(
  () => props.selected,
  (name) => centerOn(name, true),
)

onMounted(async () => {
  await nextTick()
  centerOn(props.selected ?? props.current, false)
})
</script>

<template>
  <div class="map-wrap">
    <div
      ref="scroller"
      class="scroller"
      :class="{ dragging }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <svg
        :width="map.width * TILE"
        :height="map.height * TILE"
        class="map"
        shape-rendering="crispEdges"
      >
        <defs>
          <pattern id="ground" :width="TILE" :height="TILE" patternUnits="userSpaceOnUse">
            <rect :width="TILE - 1" :height="TILE - 1" fill="#22302a" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ground)" @click="select(null)" />

        <g
          v-for="place in places"
          :key="place.name"
          class="place"
          :class="{ selected: place.name === selected }"
          @click="select(place.name)"
        >
          <rect
            v-for="(c, i) in place.cells"
            :key="i"
            :x="c.x * TILE"
            :y="c.y * TILE"
            :width="TILE - 1"
            :height="TILE - 1"
            :fill="place.color"
          />
        </g>

        <!-- 선택 테두리 -->
        <g v-if="selectedPlace" class="outline">
          <rect
            v-for="(r, i) in selectedPlace.rects"
            :key="i"
            :x="r[0] * TILE - 2"
            :y="r[1] * TILE - 2"
            :width="r[2] * TILE + 3"
            :height="r[3] * TILE + 3"
          />
        </g>
        <!-- 현재 위치 마커 -->
        <g v-if="currentMarker" class="marker">
          <circle :cx="currentMarker.cx" :cy="currentMarker.cy" r="7" class="pulse" />
          <circle :cx="currentMarker.cx" :cy="currentMarker.cy" r="4" class="dot" />
        </g>
      </svg>
    </div>

    <div v-if="label" class="label">{{ label }}</div>
    <slot />
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  height: 100%;
}

.scroller {
  height: 100%;
  overflow: auto;
  background: #1a221e;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #4a4a56 transparent;
  user-select: none;
}

.scroller.dragging {
  cursor: grabbing;
}

.map {
  display: block;
}

.place {
  cursor: pointer;
}

.place:not(.selected) {
  opacity: 0.85;
}

.outline rect {
  fill: none;
  stroke: #ffcb05;
  stroke-width: 2;
  pointer-events: none;
}

.marker {
  pointer-events: none;
}

.marker .dot {
  fill: #ff5a5a;
  stroke: #fff;
  stroke-width: 1.5;
}

.marker .pulse {
  fill: none;
  stroke: #ff5a5a;
  stroke-width: 2;
  animation: pulse 1.4s ease-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}

@keyframes pulse {
  from {
    opacity: 1;
    transform: scale(0.6);
  }
  to {
    opacity: 0;
    transform: scale(1.6);
  }
}

.label {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(20, 20, 26, 0.85);
  font-size: 14px;
  white-space: pre;
  pointer-events: none;
}
</style>
