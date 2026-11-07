<script setup lang="ts">
// 한 포켓몬의 도트 선택: 사용 가능한 도트를 미리보기와 작가 이름으로 나열
import { computed, onMounted } from 'vue'
import { artistNames, defaultVariant, loadSprites, spriteData } from '../data/sprites'
import { useGameStore } from '../stores/game'
import PokeSprite from './PokeSprite.vue'

const props = defineProps<{ species: string }>()

const game = useGameStore()
onMounted(() => loadSprites().catch(() => {}))

const list = computed(() => spriteData.value?.variants[props.species] ?? [])
const choice = computed(() => game.spriteChoice[props.species])
const fallback = computed(() => defaultVariant(list.value, game.spriteDefault))
</script>

<template>
  <p v-if="!spriteData" class="muted">도트 목록 불러오는 중…</p>
  <p v-else-if="!list.length" class="muted">사용할 수 있는 도트가 없습니다.</p>
  <div v-else class="picker">
    <button type="button" class="opt default" :class="{ active: !choice }" @click="game.setSprite(species, null)">
      <span class="label">기본 설정 따르기</span>
      <small class="muted">현재: {{ fallback?.label }}</small>
    </button>
    <button
      v-for="v in list"
      :key="v.k"
      type="button"
      class="opt"
      :class="{ active: choice === v.k }"
      @click="game.setSprite(species, v.k)"
    >
      <PokeSprite :species="species" :variant="v" :size="72" />
      <span class="label">
        {{ v.label }}
        <span class="badge" :class="v.official ? 'official' : 'fan'">{{ v.official ? '공식' : '팬' }}</span>
      </span>
      <small class="by">{{ artistNames(v) }}</small>
    </button>
  </div>
</template>

<style scoped>
.muted {
  margin: 0;
  color: #8a8a96;
  font-size: 13px;
}

.picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 6px;
}

.opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border: 1px solid #3a3a44;
  border-radius: 8px;
  background: #24242c;
  color: inherit;
  font: inherit;
  cursor: pointer;
  overflow: hidden;
}

.opt.default {
  justify-content: center;
  min-height: 72px;
}

.opt.active {
  border-color: #ffcb05;
  background: #2f2c22;
}

.label {
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

.badge {
  display: inline-block;
  margin-left: 2px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 400;
  vertical-align: 1px;
}

.badge.official {
  background: #3d4a6b;
}

.badge.fan {
  background: #5b3d6b;
}

.by {
  max-width: 100%;
  color: #9a9aa6;
  font-size: 11px;
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
