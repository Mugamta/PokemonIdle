<script setup lang="ts">
// 가로로 넘기는 탭 그룹: 넘치면 좌우 화살표, 마우스 드래그·휠·터치로 옆으로 이동
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ items: { key: string; label: string }[]; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [key: string] }>()

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
/** 고른 탭이 가려져 있으면 보이게 (양옆 화살표 자리만큼 여유) */
function reveal() {
  const el = track.value
  const btn = el?.querySelector<HTMLElement>('button.active')
  if (!el || !btn) return
  const pad = 32
  const left = btn.offsetLeft - pad
  const right = btn.offsetLeft + btn.offsetWidth + pad
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
function pick(key: string) {
  if (dragged.value) {
    dragged.value = false
    return
  }
  emit('update:modelValue', key)
}
/** 세로 휠도 옆으로 (넘칠 때만) */
function onWheel(e: WheelEvent) {
  const el = track.value
  if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
  e.preventDefault()
  el.scrollLeft += e.deltaY
}

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(update)
  if (track.value) ro.observe(track.value)
  update()
  reveal()
})
onBeforeUnmount(() => ro?.disconnect())
watch(
  () => [props.modelValue, props.items.map((i) => i.key).join()],
  () => nextTick(() => {
    update()
    reveal()
  }),
)
</script>

<template>
  <div class="scroll-tabs">
    <button v-show="canLeft" type="button" class="arrow left" aria-label="왼쪽으로" @click="scrollStep(-1)">‹</button>
    <nav
      ref="track"
      class="track"
      :class="{ dragging: dragged }"
      @scroll="update"
      @wheel="onWheel"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <button
        v-for="it in items"
        :key="it.key"
        type="button"
        class="tab"
        :class="{ active: it.key === modelValue }"
        @click="pick(it.key)"
      >
        {{ it.label }}
      </button>
    </nav>
    <button v-show="canRight" type="button" class="arrow right" aria-label="오른쪽으로" @click="scrollStep(1)">›</button>
  </div>
</template>

<style scoped>
.scroll-tabs {
  position: relative;
  border-bottom: 1px solid #3a3a44;
  background: #1e1e24;
}

.track {
  position: relative;
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  user-select: none;
}

.track::-webkit-scrollbar {
  display: none;
}

.track.dragging {
  cursor: grabbing;
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

.arrow {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 1;
  width: 32px;
  border: none;
  color: #e0e0e8;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.arrow.left {
  left: 0;
  background: linear-gradient(to right, #1e1e24 60%, transparent);
  text-align: left;
  padding-left: 8px;
}

.arrow.right {
  right: 0;
  background: linear-gradient(to left, #1e1e24 60%, transparent);
  text-align: right;
  padding-right: 8px;
}

.arrow:hover {
  color: #ffcb05;
}
</style>
