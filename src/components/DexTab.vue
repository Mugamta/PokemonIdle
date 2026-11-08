<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dexData, loadDex, TYPE_COLORS } from '../data/dex'
import { useGameStore } from '../stores/game'
import DexDetail from './DexDetail.vue'
import DexItems from './DexItems.vue'
import PokeSprite from './PokeSprite.vue'

const game = useGameStore()
const error = ref<string | null>(null)
const query = ref('')
const selectedId = ref<string | null>(null)
const scrollTop = ref(0)
const listEl = ref<HTMLElement>()
/** 포켓몬 도감 / 도구 도감 */
const mode = ref<'pokemon' | 'items'>('pokemon')

onMounted(() => loadDex().catch((e) => (error.value = String(e))))

const caughtSet = computed(() => new Set(game.caught))
const filtered = computed(() => {
  const list = dexData.value?.index ?? []
  const q = query.value.trim()
  if (!q) return list
  const n = Number(q)
  return list.filter((p) => (Number.isInteger(n) && n > 0 ? p.num === n : p.ko.includes(q)))
})

function open(id: string) {
  // 상세에서 돌아왔을 때 목록 스크롤 위치를 복원하기 위해 패널 스크롤을 기억
  scrollTop.value = listEl.value?.closest('.panel')?.scrollTop ?? 0
  selectedId.value = id
}

async function back() {
  selectedId.value = null
  await Promise.resolve()
  requestAnimationFrame(() => {
    const panel = listEl.value?.closest('.panel')
    if (panel) panel.scrollTop = scrollTop.value
  })
}
</script>

<template>
  <p v-if="error" class="msg">도감 데이터를 불러오지 못했습니다: {{ error }}</p>
  <p v-else-if="!dexData" class="msg">도감 불러오는 중…</p>

  <DexDetail v-else-if="selectedId" :id="selectedId" @back="back" />

  <div v-else ref="listEl">
    <nav class="modes">
      <button type="button" :class="{ active: mode === 'pokemon' }" @click="mode = 'pokemon'">포켓몬</button>
      <button type="button" :class="{ active: mode === 'items' }" @click="mode = 'items'">도구</button>
    </nav>
    <DexItems v-if="mode === 'items'" />
    <template v-else>
    <header class="header">
      <input v-model="query" class="search" type="search" placeholder="이름 또는 번호 검색" />
      <span class="count">포획 {{ game.caught.length }} / {{ dexData.index.length }}</span>
    </header>
    <ul class="list">
      <li v-for="p in filtered" :key="p.id">
        <button type="button" class="row" @click="open(p.id)">
          <PokeSprite :species="p.id" :size="36" lazy />
          <span class="num">No.{{ String(p.num).padStart(4, '0') }}</span>
          <span class="name">{{ p.ko }}</span>
          <span class="types">
            <span v-for="t in p.types" :key="t" class="type" :style="{ background: TYPE_COLORS[t] }">
              {{ dexData.types[t] }}
            </span>
          </span>
          <span class="ball" :class="{ caught: caughtSet.has(p.id) }" :title="caughtSet.has(p.id) ? '포획' : '미포획'" />
        </button>
      </li>
    </ul>
    <p v-if="!filtered.length" class="msg">검색 결과가 없습니다.</p>
    </template>
  </div>
</template>

<style scoped>
.msg {
  margin: 8px 0;
  color: #6a6a76;
}

.modes {
  display: flex;
  margin: -12px -12px 0;
  background: #1e1e24;
  border-bottom: 1px solid #3a3a44;
}

.modes button {
  flex: 1;
  height: 40px;
  border: none;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.modes button.active {
  color: #fff;
  font-weight: 700;
  box-shadow: inset 0 -2px 0 #ffcb05;
}

.modes + .header {
  margin-top: 0;
}

.modes + div {
  margin-top: 12px;
}

.header {
  position: sticky;
  top: -12px;
  z-index: 1;
  margin: -12px -12px 8px;
  padding: 12px;
  background: #1e1e24;
  display: flex;
  align-items: center;
  gap: 10px;
}

.search {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #2a2a33;
  color: #eee;
  font: inherit;
  font-size: 14px;
}

.count {
  color: #8a8a96;
  font-size: 13px;
  white-space: nowrap;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: none;
  border-radius: 6px;
  background: #2a2a33;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.row:active {
  background: #34343f;
}

.num {
  color: #8a8a96;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.name {
  flex: 1;
  font-size: 15px;
}

.types {
  display: flex;
  gap: 4px;
}

.type {
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.ball {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #4a4a56;
}

.ball.caught {
  border-color: #fff;
  background: linear-gradient(#e33 50%, #fff 50%);
}
</style>
