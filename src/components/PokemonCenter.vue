<script setup lang="ts">
// 패배 후 회복 화면: 포켓몬센터(또는 집) 그림 + 남은 시간 + 돌아갈 곳 안내
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ro } from '../core/battle'
import { findStage } from '../data/stages'
import { FAINT_MS, type FaintState } from '../stores/game'

const props = defineProps<{ faint: FaintState }>()

// 진행 바를 부드럽게 갱신
const now = ref(Date.now())
let raf = 0
const loop = () => {
  now.value = Date.now()
  raf = requestAnimationFrame(loop)
}
onMounted(() => (raf = requestAnimationFrame(loop)))
onUnmounted(() => cancelAnimationFrame(raf))

const left = computed(() => Math.max(0, props.faint.until - now.value))
const progress = computed(() => 1 - left.value / (props.faint.total ?? FAINT_MS))
const returnStage = computed(() => findStage(props.faint.returnTo)?.stage)
const place = computed(() => (props.faint.home ? `${props.faint.town} 집` : `${props.faint.town} 포켓몬센터`))
</script>

<template>
  <div class="center">
    <svg class="art" viewBox="0 0 160 110" aria-hidden="true">
      <!-- 땅 -->
      <rect x="0" y="96" width="160" height="14" fill="#7cbf68" />
      <template v-if="!faint.home">
        <!-- 포켓몬센터 -->
        <rect x="22" y="40" width="116" height="58" fill="#f4f1ea" stroke="#3a3a44" stroke-width="2" />
        <polygon points="16,42 80,14 144,42" fill="#e04848" stroke="#3a3a44" stroke-width="2" />
        <rect x="16" y="40" width="128" height="8" fill="#c73a3a" stroke="#3a3a44" stroke-width="2" />
        <circle cx="80" cy="30" r="9" fill="#fff" stroke="#3a3a44" stroke-width="2" />
        <text x="80" y="34.5" text-anchor="middle" font-size="12" font-weight="900" fill="#e04848">P</text>
        <rect x="34" y="56" width="22" height="16" fill="#9fd4f0" stroke="#3a3a44" stroke-width="2" />
        <rect x="104" y="56" width="22" height="16" fill="#9fd4f0" stroke="#3a3a44" stroke-width="2" />
        <rect x="66" y="62" width="28" height="36" fill="#6fb6e0" stroke="#3a3a44" stroke-width="2" />
        <line x1="80" y1="62" x2="80" y2="98" stroke="#3a3a44" stroke-width="2" />
      </template>
      <template v-else>
        <!-- 집 -->
        <rect x="40" y="48" width="80" height="50" fill="#f4e7d0" stroke="#3a3a44" stroke-width="2" />
        <polygon points="32,50 80,18 128,50" fill="#5a7fd1" stroke="#3a3a44" stroke-width="2" />
        <rect x="50" y="60" width="20" height="16" fill="#9fd4f0" stroke="#3a3a44" stroke-width="2" />
        <rect x="86" y="66" width="20" height="32" fill="#a0703c" stroke="#3a3a44" stroke-width="2" />
      </template>
      <!-- 회복 표시 -->
      <g class="heal">
        <circle cx="62" cy="10" r="3" fill="#ff9ec4" />
        <circle cx="80" cy="6" r="3" fill="#ff9ec4" />
        <circle cx="98" cy="10" r="3" fill="#ff9ec4" />
      </g>
    </svg>

    <p class="title">{{ faint.retreat ? '회복하러 돌아가는 중' : '눈앞이 캄캄해졌다!' }}</p>
    <p class="desc">
      {{ ro(place) }} 달려가 포켓몬을 회복하는 중…
    </p>
    <div class="bar"><span :style="{ width: `${progress * 100}%` }" /></div>
    <p class="desc small">
      {{ Math.ceil(left / 1000) }}초 후
      <template v-if="returnStage">
        {{ faint.fly ? '공중날기로' : '' }} {{ returnStage.id }} {{ ro(returnStage.name) }} 돌아갑니다
      </template>
    </p>
  </div>
</template>

<style scoped>
.center {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  background: rgba(20, 20, 26, 0.92);
  color: #eee;
  text-align: center;
}

.art {
  width: 180px;
  height: auto;
}

.heal {
  animation: heal 1.2s ease-in-out infinite;
}

@keyframes heal {
  0%,
  100% {
    opacity: 0.2;
    transform: translateY(4px);
  }
  50% {
    opacity: 1;
    transform: translateY(0);
  }
}

.title {
  margin: 4px 0 0;
  font-size: 16px;
  font-weight: 700;
}

.desc {
  margin: 0;
  color: #c8c8d0;
  font-size: 13px;
}

.desc.small {
  color: #9a9aa6;
  font-size: 12px;
}

.bar {
  width: 70%;
  max-width: 260px;
  height: 8px;
  border-radius: 4px;
  background: #3a3a44;
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  background: #ff9ec4;
}
</style>
