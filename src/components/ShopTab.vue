<script setup lang="ts">
// 상점: 회복 아이템 구매, 편의성 기능(자동 사용·자동 구매), 기술칸 추가
import { computed, onMounted, ref } from 'vue'
import { dexData, loadDex } from '../data/dex'
import {
  AUTO_HEAL_THRESHOLDS,
  CATEGORY_LABELS,
  extraSlotPrice,
  PERKS,
  SHOP_ITEMS,
  type ItemCategory,
  type Perk,
} from '../data/shop'
import ItemIcon from './ItemIcon.vue'
import { baseSlotsOf, EXTRA_SLOTS, PP_START_STAGE, SLOT_DEFEATS, slotsOf, useGameStore } from '../stores/game'

type Sub = 'items' | 'perks' | 'slots'
const SUBS: { id: Sub; label: string }[] = [
  { id: 'items', label: '회복 아이템' },
  { id: 'perks', label: '편의성' },
  { id: 'slots', label: '기술칸' },
]

const game = useGameStore()
const sub = ref<Sub>('items')
onMounted(() => loadDex().catch(() => {}))

const CATS: ItemCategory[] = ['heal', 'pp', 'status']
const groups = computed(() =>
  CATS.map((cat) => ({
    cat,
    items: SHOP_ITEMS.filter((i) => i.category === cat).map((def) => ({ def, info: dexData.value?.items[def.id] })),
  })),
)

const won = (n: number) => `${n.toLocaleString()}원`

function perkKind(p: Perk) {
  const [kind, cat] = p.id.split(':') as ['autoUse' | 'autoBuy', ItemCategory]
  return { kind, cat }
}
function togglePerk(p: Perk, on: boolean) {
  const { kind, cat } = perkKind(p)
  if (kind === 'autoUse') game.setAutoUse(cat, on)
  else game.setAutoBuy(cat, on)
}
const itemName = (id: string) => dexData.value?.items[id]?.ko ?? id

/** 기술칸 추가: 기본 4칸을 모두 연 포켓몬만 */
const slotRows = computed(() =>
  game.party.map((m, i) => {
    const name = dexData.value?.index.find((p) => p.id === m.species)?.ko ?? m.species
    const extra = m.extraSlots ?? 0
    const baseDone = baseSlotsOf(m) >= 1 + SLOT_DEFEATS.length
    return {
      i,
      name,
      level: m.level,
      slots: slotsOf(m),
      maxed: extra >= EXTRA_SLOTS,
      baseDone,
      price: extraSlotPrice(extra + 1),
      need: SLOT_DEFEATS[SLOT_DEFEATS.length - 1]!,
      defeats: m.defeats ?? 0,
    }
  }),
)
</script>

<template>
  <div class="shop">
    <nav class="sub-tabs">
      <button v-for="t in SUBS" :key="t.id" type="button" :class="{ active: sub === t.id }" @click="sub = t.id">
        {{ t.label }}
      </button>
    </nav>

    <div class="wallet">
      <span>소지금</span>
      <strong>{{ won(game.money) }}</strong>
    </div>

    <p v-if="!dexData" class="msg">불러오는 중…</p>

    <!-- 회복 아이템 -->
    <template v-else-if="sub === 'items'">
      <section v-for="g in groups" :key="g.cat" class="card">
        <h4 class="sec">{{ CATEGORY_LABELS[g.cat] }}</h4>
        <ul class="rows">
          <li v-for="it in g.items" :key="it.def.id">
            <div class="main">
              <ItemIcon :id="it.def.id" />
              <span class="grow">
                {{ it.info?.ko ?? it.def.id }}
                <span class="muted">보유 {{ game.items[it.def.id] ?? 0 }}</span>
              </span>
              <span class="price">{{ won(it.def.price) }}</span>
              <button type="button" class="buy" :disabled="game.money < it.def.price" @click="game.buyItem(it.def.id, 1)">
                1개
              </button>
              <button
                type="button"
                class="buy"
                :disabled="game.money < it.def.price * 10"
                @click="game.buyItem(it.def.id, 10)"
              >
                10개
              </button>
            </div>
            <p v-if="it.info?.text" class="desc item">{{ it.info.text }}</p>
          </li>
        </ul>
      </section>
      <p class="note">
        PP는 {{ PP_START_STAGE }} 스테이지를 클리어한 뒤부터 줄어듭니다. 포켓몬센터에서 회복하면 HP·PP·상태이상이 모두 회복됩니다.
      </p>
    </template>

    <!-- 편의성 -->
    <section v-else-if="sub === 'perks'" class="card">
      <ul class="rows">
        <li v-for="p in PERKS" :key="p.id">
          <div class="main">
            <span class="grow"><strong>{{ p.label }}</strong></span>
            <template v-if="game.hasPerk(p.id)">
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="!!game[perkKind(p).kind][perkKind(p).cat]"
                  @change="togglePerk(p, ($event.target as HTMLInputElement).checked)"
                />
                켜기
              </label>
            </template>
            <template v-else>
              <span class="price">{{ won(p.price) }}</span>
              <button type="button" class="buy" :disabled="game.money < p.price" @click="game.buyPerk(p.id)">구매</button>
            </template>
          </div>
          <p class="desc">{{ p.desc }}</p>
          <!-- 세부 설정 -->
          <div v-if="game.hasPerk(p.id) && perkKind(p).kind === 'autoBuy'" class="opt">
            구매할 아이템
            <select
              :value="game.autoBuyItem[perkKind(p).cat]"
              @change="game.setAutoBuyItem(perkKind(p).cat, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="it in SHOP_ITEMS.filter((i) => i.category === perkKind(p).cat)" :key="it.id" :value="it.id">
                {{ itemName(it.id) }} ({{ won(it.price) }})
              </option>
            </select>
          </div>
          <div v-if="game.hasPerk(p.id) && p.id === 'autoUse:heal'" class="opt">
            HP가
            <select v-model.number="game.autoHealAt">
              <option v-for="t in AUTO_HEAL_THRESHOLDS" :key="t" :value="t">{{ t }}%</option>
            </select>
            아래로 떨어지면 사용
          </div>
        </li>
      </ul>
    </section>

    <!-- 기술칸 -->
    <section v-else class="card">
      <p class="desc top">
        이 포켓몬으로 {{ SLOT_DEFEATS.join('·') }}마리를 쓰러뜨려 기본 4칸을 모두 연 포켓몬은 상점에서 최대
        {{ EXTRA_SLOTS }}칸을 더 열 수 있습니다.
      </p>
      <p v-if="!slotRows.length" class="msg">파티에 포켓몬이 없습니다.</p>
      <ul v-else class="rows">
        <li v-for="r in slotRows" :key="r.i">
          <div class="main">
            <span class="grow">
              {{ r.name }} <small class="muted">Lv.{{ r.level }} · {{ r.slots }}칸</small>
            </span>
            <span v-if="r.maxed" class="muted">모두 열림</span>
            <span v-else-if="!r.baseDone" class="muted">격파 {{ r.defeats }}/{{ r.need }}</span>
            <template v-else>
              <span class="price">{{ won(r.price) }}</span>
              <button type="button" class="buy" :disabled="game.money < r.price" @click="game.buyExtraSlot(r.i)">
                칸 추가
              </button>
            </template>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.sub-tabs {
  position: sticky;
  top: -12px;
  z-index: 1;
  display: flex;
  margin: -12px -12px 10px;
  background: #1e1e24;
  border-bottom: 1px solid #3a3a44;
}

.sub-tabs button {
  flex: 1;
  height: 42px;
  border: none;
  background: transparent;
  color: #9a9aa6;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.sub-tabs button.active {
  color: #fff;
  font-weight: 700;
  box-shadow: inset 0 -2px 0 #ffcb05;
}

.wallet {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #2f2c22;
  color: #e8d9a8;
  font-size: 13px;
}

.wallet strong {
  color: #ffcb05;
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}

.card {
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 8px;
  background: #2a2a33;
}

.sec {
  margin: 0 0 6px;
  font-size: 14px;
}

.msg {
  margin: 8px 0;
  color: #6a6a76;
  font-size: 14px;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.rows li {
  padding: 8px 0;
  border-bottom: 1px solid #33333d;
  font-size: 14px;
}

.rows li:last-child {
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
  margin: 2px 0 0;
  color: #8a8a96;
  font-size: 12px;
}

.desc.item {
  margin-left: 36px;
}

.desc.top {
  margin: 0 0 6px;
}

.note {
  margin: 0;
  color: #8a8a96;
  font-size: 12px;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}

.opt {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: #c8c8d0;
  font-size: 12px;
}

.opt select {
  padding: 2px 4px;
  border: 1px solid #3a3a44;
  border-radius: 4px;
  background: #1e1e24;
  color: #eee;
  font: inherit;
  font-size: 12px;
}
</style>
