<script setup lang="ts">
// 상점 상품 한 줄: 아이콘 · 이름 · 보유 수 · 가격 · 1개/10개 구매 · 설명
import { computed } from 'vue'
import { dexData } from '../data/dex'
import { useGameStore } from '../stores/game'
import ItemIcon from './ItemIcon.vue'

const props = withDefaults(defineProps<{ id: string; price: number; note?: string; multi?: boolean; label?: string }>(), {
  note: '',
  multi: true,
  label: '',
})
const game = useGameStore()
const info = computed(() => dexData.value?.items[props.id])
const won = (n: number) => `${n.toLocaleString()}원`
</script>

<template>
  <li>
    <div class="main">
      <ItemIcon :id="id" lazy />
      <span class="grow">
        {{ label || info?.ko || id }}
        <span class="muted">보유 {{ game.items[id] ?? 0 }}</span>
      </span>
      <span class="price">{{ won(price) }}</span>
      <button type="button" class="buy" :disabled="game.money < price" @click="game.buyItem(id, 1)">1개</button>
      <button v-if="multi" type="button" class="buy" :disabled="game.money < price * 10" @click="game.buyItem(id, 10)">10개</button>
    </div>
    <p v-if="note" class="desc item note-line">{{ note }}</p>
    <p v-if="info?.text" class="desc item">{{ info.text }}</p>
    <slot />
  </li>
</template>

<style scoped>
li {
  padding: 8px 0;
  border-bottom: 1px solid #33333d;
  font-size: 14px;
}

li:last-child {
  border-bottom: none;
}

.main {
  display: flex;
  align-items: center;
  gap: 6px;
}

.grow {
  flex: 1;
}

.muted {
  color: #9a9aa6;
  font-size: 12px;
}

.price {
  color: #ffcb05;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.buy {
  padding: 3px 9px;
  border: 1px solid #4a4a56;
  border-radius: 4px;
  background: #34343f;
  color: #eee;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.buy:disabled {
  opacity: 0.4;
  cursor: default;
}

.desc {
  margin: 2px 0 0 36px;
  color: #8a8a96;
  font-size: 12px;
}

.note-line {
  color: #c8b46a;
}
</style>
