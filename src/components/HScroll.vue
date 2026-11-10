<script setup lang="ts">
// 가로로 넘기는 줄 (탭·버튼 묶음): 스크롤바 대신 넘치면 좌우 화살표, 마우스 드래그·휠·터치로 옆으로 이동.
// 안의 .active 요소가 가려지면 보이게 끌어온다. 화살표 뒤 그라데이션 색은 --hs-bg 로 바탕색에 맞춘다.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ /** 바뀌면 .active 를 다시 보이게 함 */ active?: unknown }>()

const track = ref<HTMLElement | null>(null)
const canLeft = ref(false)
const canRight = ref(false)

function update() {
  const el = track.value
  if (!el) return
  canLeft.value = el.scrollLeft > 1
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}
function scrollStep(dir: -1 | 1) {
  const el = track.value
  if (el) el.scrollBy({ left: dir * Math.max(80, el.clientWidth * 0.7), behavior: 'smooth' })
}
/** 고른 항목이 가려져 있으면 보이게 (양옆 화살표 자리만큼 여유) */
function reveal() {
  const el = track.value
  const item = el?.querySelector<HTMLElement>(':scope > .active')
  if (!el || !item) return
  const pad = 32
  const left = item.offsetLeft - pad
  const right = item.offsetLeft + item.offsetWidth + pad
  if (left < el.scrollLeft) el.scrollTo({ left, behavior: 'smooth' })
  else if (right > el.scrollLeft + el.clientWidth) el.scrollTo({ left: right - el.clientWidth, behavior: 'smooth' })
}

// 마우스 드래그로 옆으로 이동 (터치는 브라우저 기본 스크롤). 드래그한 뒤의 클릭은 무시
let drag: { x: number; left: number; id: number } | null = null
const dragged = ref(false)
function onDown(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !track.value) return
  drag = { x: e.clientX, left: track.value.scrollLeft, id: e.pointerId }
  dragged.value = false
}
function onMove(e: PointerEvent) {
  const el = track.value
  if (!drag || !el || e.pointerId !== drag.id) return
  const dx = e.clientX - drag.x
  if (!dragged.value && Math.abs(dx) < 5) return
  if (!dragged.value) {
    dragged.value = true
    el.setPointerCapture(e.pointerId)
  }
  el.scrollLeft = drag.left - dx
}
function onUp(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  drag = null
  if (track.value?.hasPointerCapture(e.pointerId)) track.value.releasePointerCapture(e.pointerId)
}
function onClickCapture(e: MouseEvent) {
  if (!dragged.value) return
  dragged.value = false
  e.stopPropagation()
  e.preventDefault()
}
/** 세로 휠도 옆으로 (넘칠 때만) */
function onWheel(e: WheelEvent) {
  const el = track.value
  if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
  e.preventDefault()
  el.scrollLeft += e.deltaY
}

let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null
onMounted(() => {
  const el = track.value
  ro = new ResizeObserver(update)
  if (el) {
    ro.observe(el)
    // 항목이 늘거나 줄면 화살표 다시 계산
    mo = new MutationObserver(update)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
  }
  update()
  reveal()
})
onBeforeUnmount(() => {
  ro?.disconnect()
  mo?.disconnect()
})
watch(
  () => props.active,
  () => nextTick(() => {
    update()
    reveal()
  }),
)
</script>

<template>
  <div class="hscroll">
    <button v-show="canLeft" type="button" class="hs-arrow left" aria-label="왼쪽으로" @click="scrollStep(-1)">‹</button>
    <div
      ref="track"
      class="hs-track"
      :class="{ dragging: dragged }"
      @scroll="update"
      @wheel="onWheel"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @click.capture="onClickCapture"
    >
      <slot />
    </div>
    <button v-show="canRight" type="button" class="hs-arrow right" aria-label="오른쪽으로" @click="scrollStep(1)">›</button>
  </div>
</template>

<style scoped>
.hscroll {
  position: relative;
  min-width: 0;
}

.hs-track {
  position: relative;
  display: flex;
  gap: inherit;
  height: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  user-select: none;
}

.hs-track::-webkit-scrollbar {
  display: none;
}

.hs-track.dragging {
  cursor: grabbing;
}

.hs-arrow {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: 32px;
  padding: 0;
  border: none;
  color: #e0e0e8;
  font: inherit;
  font-size: var(--hs-arrow-size, 22px);
  line-height: 1;
  cursor: pointer;
}

.hs-arrow.left {
  left: 0;
  background: linear-gradient(to right, var(--hs-bg, #1e1e24) 60%, transparent);
  text-align: left;
  padding-left: 6px;
}

.hs-arrow.right {
  right: 0;
  background: linear-gradient(to left, var(--hs-bg, #1e1e24) 60%, transparent);
  text-align: right;
  padding-right: 6px;
}

.hs-arrow:hover {
  color: #ffcb05;
}
</style>
