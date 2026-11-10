<script setup lang="ts">
// 상점 구매 직후 "바로 사용할까요?": 쓸 수 있는 파티 포켓몬(·기술·능력치) 목록
import { computed, watch } from 'vue'
import { dexData } from '../data/dex'
import { shopItem } from '../data/shop'
import { josa } from '../core/battle'
import { useGameStore } from '../stores/game'
import ItemIcon from './ItemIcon.vue'
import { quickUse, quickUseOptions } from './quickUse'

const game = useGameStore()
const options = computed(() => quickUseOptions(quickUse.itemId))
const itemName = computed(() => dexData.value?.items[quickUse.itemId]?.ko ?? quickUse.itemId)
const count = computed(() => game.items[quickUse.itemId] ?? 0)
/** 전투 중 첫 기술을 쓴 뒤엔 회복 아이템이 한 턴을 소모함 */
const turnNote = computed(() => !!shopItem(quickUse.itemId) && !!game.enemy && game.battleTurns > 0)
// 다 썼거나 더 쓸 대상이 없으면 닫힘
watch(options, (list) => {
  if (!list.length) close()
})
function close() {
  quickUse.itemId = ''
}
</script>

<template>
  <div v-if="quickUse.itemId && options.length" class="overlay" @click.self="close">
    <div class="dialog" role="dialog" aria-modal="true">
      <div class="head">
        <ItemIcon :id="quickUse.itemId" />
        <div>
          <strong>{{ josa(itemName, '을', '를') }} 바로 사용할까요?</strong>
          <p class="muted">보유 {{ count }}개 · 누를 때마다 1개씩 사용</p>
        </div>
      </div>
      <p v-if="turnNote" class="note">전투 중이라 사용하면 한 턴을 소모합니다.</p>
      <ul class="list">
        <li v-for="o in options" :key="o.key">
          <button type="button" @click="o.run()">
            <span class="label">{{ o.label }}</span>
            <span v-if="o.sub" class="sub">{{ o.sub }}</span>
          </button>
        </li>
      </ul>
      <button type="button" class="later" @click="close">나중에</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(10, 10, 14, 0.7);
}

.dialog {
  width: 100%;
  max-width: 360px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 14px;
  border: 1px solid #3a3a44;
  border-radius: 12px;
  background: #1e1e24;
  color: #eee;
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.head p {
  margin: 2px 0 0;
}

.muted {
  color: #9a9aa6;
  font-size: 12px;
}

.note {
  margin: 8px 0 0;
  color: #ffcb05;
  font-size: 12px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
  padding: 0;
  list-style: none;
}

.list button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #4a4a56;
  border-radius: 6px;
  background: #2a2a33;
  color: #eee;
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.list button:hover {
  border-color: #ffcb05;
}

.sub {
  color: #9a9aa6;
  font-size: 12px;
}

.later {
  width: 100%;
  height: 36px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: transparent;
  color: #c8c8d0;
  font: inherit;
  cursor: pointer;
}
</style>
