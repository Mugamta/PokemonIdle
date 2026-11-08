<script setup lang="ts">
// 포켓몬 도트 표시. 설정(기본 도트 / 포켓몬별 선택)에 따라 출처를 고르고,
// PMD 도트는 Idle 애니메이션(아래 방향 줄)을 재생한다.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { formOf } from '../core/gimmicks'
import { loadSprites, resolveVariant, spriteData, spriteUrl, type SpriteVariant } from '../data/sprites'
import { useGameStore } from '../stores/game'

const props = withDefaults(
  defineProps<{
    species: string
    /** 표시 상자 크기 (px) */
    size?: number
    /** 화면에 보일 때만 이미지를 불러옴 (긴 목록용) */
    lazy?: boolean
    /** 설정 대신 이 도트를 표시 (미리보기용) */
    variant?: SpriteVariant
    /** front: 정면 / foe: 전투 상대(좌하단을 바라봄) / back: 내 포켓몬 뒷모습(우상단을 바라봄) */
    pose?: 'front' | 'foe' | 'back'
  }>(),
  { size: 64, lazy: false, pose: 'front' },
)

const PMD_ZOOM = 1.3
const PMD_ROW = { front: 0, foe: 7, back: 3 } as const

/** 뒷모습 이미지가 없으면 앞모습을 좌우 반전 */
const mirrored = computed(() => props.pose === 'back' && !shown.value?.anim && !shown.value?.back)

const game = useGameStore()
onMounted(() => loadSprites().catch(() => {}))

const shown = computed(() => {
  if (props.variant) return props.variant
  const variants = spriteData.value?.variants
  // 메가진화 폼: 폼 도트가 없으면 기본 폼 도트, 도트 선택은 기본 폼의 선택을 따름
  const base = formOf(props.species)?.base
  const list = variants?.[props.species] ?? (base ? variants?.[base] : undefined)
  return resolveVariant(list, game.spriteDefault, game.spriteChoice[props.species] ?? (base && game.spriteChoice[base]) ?? undefined)
})

// 지연 로딩
const el = ref<HTMLElement>()
const visible = ref(!props.lazy)
let observer: IntersectionObserver | undefined
onMounted(() => {
  if (visible.value || !el.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        visible.value = true
        observer?.disconnect()
      }
    },
    { rootMargin: '200px' },
  )
  observer.observe(el.value)
})
onUnmounted(() => observer?.disconnect())

const animStyle = computed(() => {
  const v = shown.value
  if (!v?.anim) return null
  const [w, h, n, ms, rows] = v.anim
  // PMD 방향 줄: 0 아래, 3 우상, 7 좌하
  const row = rows >= 8 ? PMD_ROW[props.pose] : 0
  return {
    width: `${w}px`,
    height: `${h}px`,
    backgroundImage: `url(${spriteUrl(v)})`,
    backgroundPositionY: `${-row * h}px`,
    // PMD 프레임은 여백이 커서 상자보다 조금 크게 그림
    transform: `scale(${(props.size / Math.max(w, h)) * PMD_ZOOM})`,
    '--fw': `${w}px`,
    '--n': n,
    animationDuration: `${Math.max(ms, 100)}ms`,
    animationTimingFunction: `steps(${n})`,
  }
})
</script>

<template>
  <span ref="el" class="sprite" :style="{ width: `${size}px`, height: `${size}px` }">
    <template v-if="visible && shown">
      <span v-if="animStyle" class="anim" :style="animStyle" />
      <img
        v-else
        :src="spriteUrl(shown, pose === 'back')"
        :width="size"
        :height="size"
        :class="{ mirrored }"
        alt=""
        draggable="false"
      />
    </template>
  </span>
</template>

<style scoped>
.sprite {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: none;
  overflow: visible;
}

img,
.anim {
  image-rendering: pixelated;
  pointer-events: none;
}

.mirrored {
  transform: scaleX(-1);
}

.anim {
  position: absolute;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  background-repeat: no-repeat;
  background-position-x: 0;
  animation-name: pmd-idle;
  animation-iteration-count: infinite;
}

@keyframes pmd-idle {
  to {
    background-position-x: calc(var(--fw) * var(--n) * -1);
  }
}
</style>
