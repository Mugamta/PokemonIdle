<script setup lang="ts">
// 도구 도감: 모든 도구를 분류별로 보여 주고, 이 게임에서의 쓰임(상점·효과·판매·야생 포켓몬이 지님)을 표시
import { computed, ref } from 'vue'
import { dexData } from '../data/dex'
import { DEX_ITEM_GROUPS, dexItemGroup, itemUse, wildHolders, type DexItemGroup } from '../data/itemCatalog'
import { useGameStore } from '../stores/game'
import ItemIcon from './ItemIcon.vue'

const game = useGameStore()
const query = ref('')
const group = ref<DexItemGroup | 'all'>('all')
const onlyUsable = ref(false)
const openId = ref<string | null>(null)

/** 이름이 같은 도구(작품별 중복 등록)는 하나만 */
const all = computed(() => {
  const items = dexData.value?.items ?? {}
  const seen = new Set<string>()
  const out: { id: string; ko: string; group: DexItemGroup; text: string }[] = []
  for (const [id, info] of Object.entries(items)) {
    const g = dexItemGroup(id, info)
    const key = `${g}:${info.ko}`
    if (g !== 'machine' && seen.has(key)) continue
    seen.add(key)
    out.push({ id, ko: info.ko, group: g, text: info.text })
  }
  return out
})
const counts = computed(() => {
  const c: Record<string, number> = {}
  for (const it of all.value) c[it.group] = (c[it.group] ?? 0) + 1
  return c
})
const filtered = computed(() => {
  const q = query.value.trim()
  return all.value
    .filter((it) => group.value === 'all' || it.group === group.value)
    .filter((it) => !q || it.ko.includes(q))
    .map((it) => ({ ...it, use: itemUse(it.id) }))
    .filter((it) => !onlyUsable.value || it.use.roles.length)
})
const sections = computed(() =>
  DEX_ITEM_GROUPS.map((g) => ({ ...g, items: filtered.value.filter((it) => it.group === g.id) })).filter((s) => s.items.length),
)
const won = (n: number) => `${n.toLocaleString()}원`
const speciesName = (id: string) => dexData.value?.index.find((p) => p.id === id)?.ko ?? id
const moveOf = (id: string) => {
  const mv = dexData.value?.items[id]?.move
  return mv ? dexData.value?.movesById[mv] : undefined
}
</script>

<template>
  <div>
    <div class="filters">
      <input v-model="query" class="search" type="search" placeholder="도구 이름 검색" />
      <label class="check"><input v-model="onlyUsable" type="checkbox" /> 이 게임에서 쓰이는 것만</label>
    </div>
    <div class="chips">
      <button type="button" :class="{ active: group === 'all' }" @click="group = 'all'">전체 {{ all.length }}</button>
      <button v-for="g in DEX_ITEM_GROUPS" :key="g.id" type="button" :class="{ active: group === g.id }" @click="group = g.id">
        {{ g.label }} {{ counts[g.id] ?? 0 }}
      </button>
    </div>

    <section v-for="s in sections" :key="s.id" class="sec">
      <h4>{{ s.label }} <small>{{ s.items.length }}</small></h4>
      <ul class="list">
        <li v-for="it in s.items" :key="it.id">
          <button type="button" class="row" @click="openId = openId === it.id ? null : it.id">
            <ItemIcon :id="it.id" :size="28" lazy />
            <span class="name">
              {{ it.ko }}
              <small v-if="moveOf(it.id)" class="muted">{{ moveOf(it.id)!.ko }}</small>
            </span>
            <span class="badges">
              <span v-for="r in it.use.roles" :key="r" class="badge use">{{ r.replace(/ \(.*\)$/, '') }}</span>
              <span v-if="!it.use.roles.length" class="badge none">효과 없음</span>
              <span v-if="game.items[it.id]" class="badge own">×{{ game.items[it.id] }}</span>
            </span>
          </button>
          <div v-if="openId === it.id" class="detail">
            <p v-if="it.text">{{ it.text }}</p>
            <p v-if="moveOf(it.id)" class="muted">가르치는 기술: {{ moveOf(it.id)!.ko }}</p>
            <p v-for="r in it.use.roles" :key="r" class="muted">· {{ r }}</p>
            <p v-if="!it.use.roles.length" class="muted">
              이 게임에서는 효과가 없습니다. (날씨·교체·메가진화·콘테스트·필드 이동 등 이 게임에 없는 요소에 쓰이는 도구)
            </p>
            <p class="muted">
              <template v-if="it.use.buy != null">상점 {{ won(it.use.buy) }}</template>
              <template v-else>상점에서 팔지 않음</template>
              <template v-if="it.use.sell"> · 팔면 {{ won(it.use.sell) }}</template>
            </p>
            <p v-if="wildHolders(it.id).length" class="muted">
              지니고 있는 야생 포켓몬 (쓰러뜨리면 얻음):
              {{ wildHolders(it.id).slice(0, 12).map((w) => `${speciesName(w.species)} ${w.rate}%`).join(', ') }}<template
                v-if="wildHolders(it.id).length > 12"
              > 외 {{ wildHolders(it.id).length - 12 }}마리</template>
            </p>
          </div>
        </li>
      </ul>
    </section>
    <p v-if="!sections.length" class="msg">검색 결과가 없습니다.</p>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
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

.check {
  color: #c8c8d0;
  font-size: 13px;
  white-space: nowrap;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}

.chips button {
  padding: 3px 8px;
  border: 1px solid #3a3a44;
  border-radius: 12px;
  background: #2a2a33;
  color: #c8c8d0;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.chips button.active {
  border-color: #ffcb05;
  color: #fff;
}

.sec h4 {
  margin: 12px 0 6px;
  font-size: 14px;
}

.sec h4 small {
  color: #8a8a96;
  font-weight: 400;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: #2a2a33;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.name {
  flex: 1;
  font-size: 14px;
}

.muted {
  color: #8a8a96;
  font-size: 12px;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 3px;
}

.badge {
  padding: 0 5px;
  border-radius: 3px;
  font-size: 11px;
  white-space: nowrap;
}

.badge.use {
  background: #2f4a36;
  color: #b8e6c2;
}

.badge.none {
  background: #33333d;
  color: #7a7a86;
}

.badge.own {
  background: #4a4228;
  color: #ffcb05;
}

.detail {
  margin: 2px 0 4px;
  padding: 6px 10px 8px 46px;
  font-size: 13px;
}

.detail p {
  margin: 2px 0;
}

.msg {
  margin: 8px 0;
  color: #6a6a76;
}
</style>
