<script setup lang="ts">
// 브라우저 기본 스크롤바 대신 쓰는 커스텀 세로 스크롤바.
// 상단에 붙어 있는(sticky) 헤더·탭이 있으면 스크롤바 트랙이 그 아래에서 시작한다.
import { onMounted, onUnmounted, ref } from 'vue'

const scroller = ref<HTMLElement>()
const content = ref<HTMLElement>()

/** 트랙 시작 위치 (sticky 헤더 높이) */
const trackTop = ref(0)
const thumbTop = ref(0)
const thumbHeight = ref(0)
const scrollable = ref(false)
const dragging = ref(false)

const MIN_THUMB = 28
/** sticky 요소를 찾을 최대 깊이 (content 기준) */
const MAX_DEPTH = 4

let stickies: HTMLElement[] = []
let raf = 0
let ro: ResizeObserver | undefined
let mo: MutationObserver | undefined

/** content 아래 얕은 깊이에서 position: sticky 요소 수집 */
function collectStickies() {
  const out: HTMLElement[] = []
  const walk = (el: Element, depth: number) => {
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (getComputedStyle(child).position === 'sticky') out.push(child)
      else if (depth < MAX_DEPTH) walk(child, depth + 1)
    }
  }
  if (content.value) walk(content.value, 1)
  stickies = out
}

function measure() {
  raf = 0
  const el = scroller.value
  if (!el) return
  const box = el.getBoundingClientRect()

  // 스크롤 영역 맨 위에 붙어 있는 sticky 요소 중 가장 아래쪽 끝
  let top = 0
  for (const s of stickies) {
    if (!s.isConnected) continue
    const r = s.getBoundingClientRect()
    if (r.height && Math.abs(r.top - box.top) < 2) top = Math.max(top, r.bottom - box.top)
  }
  trackTop.value = Math.round(top)

  const { scrollHeight, clientHeight, scrollTop } = el
  scrollable.value = scrollHeight > clientHeight + 1
  if (!scrollable.value) return
  const track = clientHeight - top
  const h = Math.max(MIN_THUMB, (track * clientHeight) / scrollHeight)
  thumbHeight.value = h
  thumbTop.value = ((track - h) * scrollTop) / (scrollHeight - clientHeight)
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(measure)
}

function refresh() {
  collectStickies()
  schedule()
}

// 썸 드래그
let dragStartY = 0
let dragStartScroll = 0
function onThumbDown(e: PointerEvent) {
  const el = scroller.value
  if (!el) return
  e.preventDefault()
  e.stopPropagation()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragging.value = true
  dragStartY = e.clientY
  dragStartScroll = el.scrollTop
}
function onThumbMove(e: PointerEvent) {
  const el = scroller.value
  if (!dragging.value || !el) return
  const track = el.clientHeight - trackTop.value
  const room = track - thumbHeight.value
  if (room <= 0) return
  el.scrollTop = dragStartScroll + ((e.clientY - dragStartY) * (el.scrollHeight - el.clientHeight)) / room
}
function onThumbUp() {
  dragging.value = false
}

// 트랙 빈 곳 클릭: 그 위치로 이동
function onTrackDown(e: PointerEvent) {
  const el = scroller.value
  if (!el) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const room = rect.height - thumbHeight.value
  if (room <= 0) return
  const ratio = Math.min(1, Math.max(0, (e.clientY - rect.top - thumbHeight.value / 2) / room))
  el.scrollTo({ top: ratio * (el.scrollHeight - el.clientHeight), behavior: 'smooth' })
}

onMounted(() => {
  ro = new ResizeObserver(refresh)
  if (scroller.value) ro.observe(scroller.value)
  if (content.value) ro.observe(content.value)
  // 탭 전환 등으로 내용이 바뀌면 sticky 요소를 다시 찾는다
  mo = new MutationObserver(refresh)
  if (content.value) mo.observe(content.value, { childList: true, subtree: true })
  refresh()
})

onUnmounted(() => {
  ro?.disconnect()
  mo?.disconnect()
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="scroll-panel">
    <div ref="scroller" class="panel" @scroll.passive="schedule">
      <div ref="content"><slot /></div>
    </div>
    <div
      v-show="scrollable"
      class="track"
      :class="{ dragging }"
      :style="{ top: `${trackTop}px` }"
      @pointerdown="onTrackDown"
    >
      <div
        class="thumb"
        :style="{ height: `${thumbHeight}px`, transform: `translateY(${thumbTop}px)` }"
        @pointerdown="onThumbDown"
        @pointermove="onThumbMove"
        @pointerup="onThumbUp"
        @pointercancel="onThumbUp"
      />
    </div>
  </div>
</template>

<style scoped>
.scroll-panel {
  position: relative;
  min-height: 0;
}

.panel {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  scrollbar-width: none;
}

.panel::-webkit-scrollbar {
  display: none;
}

.track {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 2;
  width: 12px;
  padding: 0 3px;
  cursor: pointer;
  touch-action: none;
}

.thumb {
  width: 100%;
  border-radius: 999px;
  background: #4a4a56;
  transition: background 0.15s;
  cursor: grab;
}

.track:hover .thumb,
.track.dragging .thumb {
  background: #7a7a88;
}

.track.dragging .thumb {
  cursor: grabbing;
}
</style>
