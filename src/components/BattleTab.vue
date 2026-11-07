<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { dexData, loadDex, STAT_LABELS, TYPE_COLORS } from '../data/dex'
import { calcStats, NATURES, STAT_KEYS } from '../data/natures'
import { CATEGORY_LABELS, SHOP_ITEMS, type ItemCategory } from '../data/shop'
import { MAX_MOVE_SLOTS, maxPpOf, ppOf, SLOT_DEFEATS, slotsOf, useGameStore } from '../stores/game'
import BattleControls from './BattleControls.vue'
import ItemIcon from './ItemIcon.vue'
import PokeSprite from './PokeSprite.vue'

type SubTab = 'fight' | 'stats' | 'moves' | 'items'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'fight', label: '배틀' },
  { id: 'stats', label: '능력치' },
  { id: 'moves', label: '기술' },
  { id: 'items', label: '아이템' },
]

const game = useGameStore()
const sub = ref<SubTab>('fight')
const memberIndex = ref(0)
const error = ref<string | null>(null)

onMounted(() => loadDex().catch((e) => (error.value = String(e))))

const member = computed(() => game.party[memberIndex.value] ?? game.party[0] ?? null)
const species = (id: string) => dexData.value?.index.find((p) => p.id === id)

const stats = computed(() => {
  const m = member.value
  const sp = m && species(m.species)
  if (!m || !sp) return null
  const actual = calcStats(sp.stats, m.level, m.ivs ?? [], m.evs ?? [], m.nature, m.species)
  const nature = NATURES[m.nature]
  return STAT_KEYS.map((key, i) => ({
    label: STAT_LABELS[i],
    base: sp.stats[i]!,
    iv: m.ivs?.[i] ?? 0,
    ev: m.evs?.[i] ?? 0,
    value: actual[i]!,
    mod: nature?.plus === key ? 'up' : nature?.minus === key ? 'down' : '',
  }))
})

const moveInfo = (id: string) => dexData.value?.movesById[id]
const memberIdx = computed(() => (member.value ? game.party.indexOf(member.value) : -1))
/** 기술칸 8칸: 장착 기술 / 빈 칸 / 잠긴 칸 (배틀 화면과 같은 배치) */
const moveSlots = computed(() => {
  const m = member.value
  if (!m) return []
  const open = slotsOf(m)
  const defeats = m.defeats ?? 0
  return Array.from({ length: MAX_MOVE_SLOTS }, (_, i) => {
    if (i >= open) {
      const need = SLOT_DEFEATS[i - 1]
      const cond = need != null ? `격파 ${Math.min(defeats, need)}/${need}` : '상점에서 해금'
      return { kind: 'locked' as const, cond }
    }
    const id = m.moves[i]
    if (!id) return { kind: 'empty' as const }
    return { kind: 'move' as const, id, info: moveInfo(id) }
  })
})
/** 교체하려고 고른 칸 번호 */
const pickedSlot = ref<number | null>(null)
watch([memberIndex, sub], () => (pickedSlot.value = null))
const picked = computed(() => (pickedSlot.value != null ? moveSlots.value[pickedSlot.value] : null))
/** 배웠지만 장착하지 않은 기술 */
const spare = computed(() => {
  const m = member.value
  if (!m) return []
  return (m.learned ?? m.moves).filter((id) => !m.moves.includes(id)).map((id) => ({ id, info: moveInfo(id) }))
})
function clickSlot(i: number) {
  const s = moveSlots.value[i]
  if (!s || s.kind === 'locked') return
  pickedSlot.value = pickedSlot.value === i ? null : i
}
function choose(id: string) {
  const s = picked.value
  if (!s) return
  if (s.kind === 'move') game.replaceMove(memberIdx.value, s.id, id)
  else if (s.kind === 'empty') game.equipMove(memberIdx.value, id)
  pickedSlot.value = null
}
function unequipPicked() {
  const s = picked.value
  if (s?.kind === 'move') game.unequipMove(memberIdx.value, s.id)
  pickedSlot.value = null
}

/** 남은 PP 표시 (제한 없는 기술은 빈 문자열) */
function ppText(id: string) {
  const m = member.value
  const max = maxPpOf(id)
  return m && max != null ? `PP ${ppOf(m, id)}/${max}` : ''
}

// 아이템: 상점 아이템을 분류별로 (가지고 있는 것만)
const CATS: ItemCategory[] = ['heal', 'pp', 'status']
const itemGroups = computed(() =>
  CATS.map((cat) => ({
    cat,
    items: SHOP_ITEMS.filter((i) => i.category === cat && (game.items[i.id] ?? 0) > 0).map((def) => ({
      def,
      count: game.items[def.id]!,
      info: dexData.value?.items[def.id],
      usable: !!game.itemEffect(def),
    })),
  })).filter((g) => g.items.length),
)
const turnNote = computed(() => {
  if (!game.party.length) return ''
  const name = species(game.party[0]!.species)?.ko ?? ''
  const who = `${name}에게 사용합니다.`
  if (!game.enemy) return `${who} 전투 중이 아니라서 턴을 소모하지 않습니다.`
  if (game.battleTurns === 0) return `${who} 아직 기술을 쓰기 전이라 턴을 소모하지 않습니다.`
  return `${who} 전투 중에 사용하면 한 턴을 소모합니다.`
})

const CLS_LABEL = { physical: '물리', special: '특수', status: '변화' }
</script>

<template>
  <div class="battle" :class="{ fill: sub === 'fight' && dexData }">
    <!-- 상단 하위 탭 -->
    <nav class="sub-tabs">
      <button
        v-for="t in SUB_TABS"
        :key="t.id"
        type="button"
        :class="{ active: sub === t.id }"
        @click="sub = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <p v-if="error" class="msg">데이터를 불러오지 못했습니다: {{ error }}</p>
    <p v-else-if="!dexData" class="msg">불러오는 중…</p>

    <BattleControls v-else-if="sub === 'fight'" />

    <template v-else>
      <!-- 능력치 / 기술: 파티 포켓몬별 -->
      <template v-if="sub !== 'items'">
        <p v-if="!game.party.length" class="msg">파티에 포켓몬이 없습니다.</p>
        <template v-else>
          <div class="members">
            <button
              v-for="(m, i) in game.party"
              :key="i"
              type="button"
              :class="{ active: member === m }"
              @click="memberIndex = i"
            >
              {{ species(m.species)?.ko ?? m.species }} <small>Lv.{{ m.level }}</small>
            </button>
          </div>

          <section v-if="sub === 'stats' && stats" class="card">
            <div class="card-head">
              <PokeSprite :species="member!.species" :size="56" />
              <strong>{{ species(member!.species)?.ko }}</strong>
              <span class="muted">Lv.{{ member!.level }} · {{ NATURES[member!.nature]?.ko ?? '-' }}</span>
            </div>
            <table class="stats">
              <thead>
                <tr><th /><th>실능치</th><th>종족값</th><th>개체값</th><th>노력치</th></tr>
              </thead>
              <tbody>
                <tr v-for="s in stats" :key="s.label">
                  <th>{{ s.label }}</th>
                  <td class="value" :class="s.mod">{{ s.value }}<span v-if="s.mod">{{ s.mod === 'up' ? '▲' : '▼' }}</span></td>
                  <td>{{ s.base }}</td>
                  <td>{{ s.iv }}</td>
                  <td>{{ s.ev }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <template v-else-if="sub === 'moves'">
            <div class="move-grid">
              <template v-for="(s, i) in moveSlots" :key="i">
                <button
                  v-if="s.kind === 'move'"
                  type="button"
                  class="mslot"
                  :class="{ picked: pickedSlot === i }"
                  :style="{ '--c': (s.info && TYPE_COLORS[s.info.type]) ?? '#666' }"
                  @click="clickSlot(i)"
                >
                  <span class="name">{{ s.info?.ko ?? s.id }} <small class="pp">{{ ppText(s.id) }}</small></span>
                  <span v-if="s.info" class="meta">
                    <span class="mtype">{{ dexData.types[s.info.type] }}</span>
                    {{ CLS_LABEL[s.info.cls] }} · 위력 {{ s.info.power ?? '-' }} · 명중 {{ s.info.acc ?? '-' }}
                  </span>
                </button>
                <button
                  v-else-if="s.kind === 'empty'"
                  type="button"
                  class="mslot empty"
                  :class="{ picked: pickedSlot === i }"
                  @click="clickSlot(i)"
                >
                  + 빈 칸
                </button>
                <div v-else class="mslot empty locked">🔒 {{ s.cond }}</div>
              </template>
            </div>

            <section class="card picker">
              <p v-if="!picked" class="msg">바꿀 기술칸을 눌러 주세요.</p>
              <template v-else>
                <h4 class="sec">
                  {{ pickedSlot! + 1 }}번 칸
                  <small>{{ picked.kind === 'move' ? `${picked.info?.ko ?? picked.id} 대신 장착할 기술` : '장착할 기술' }}</small>
                </h4>
                <p v-if="!spare.length" class="msg">장착하지 않은 기술이 없습니다. 레벨이 오르면 새 기술을 배웁니다.</p>
                <ul v-else class="rows">
                  <li v-for="m in spare" :key="m.id" class="clickable" @click="choose(m.id)">
                    <span class="grow">{{ m.info?.ko ?? m.id }}</span>
                    <template v-if="m.info">
                      <span class="type" :style="{ background: TYPE_COLORS[m.info.type] }">{{ dexData.types[m.info.type] }}</span>
                      <span class="muted">{{ CLS_LABEL[m.info.cls] }}</span>
                      <span class="muted num">위력 {{ m.info.power ?? '-' }}</span>
                      <span class="muted num">명중 {{ m.info.acc ?? '-' }}</span>
                    </template>
                  </li>
                </ul>
                <div class="picker-actions">
                  <button
                    v-if="picked.kind === 'move' && member!.moves.length > 1"
                    type="button"
                    class="small-btn"
                    @click="unequipPicked"
                  >
                    이 칸 비우기
                  </button>
                  <button type="button" class="small-btn" @click="pickedSlot = null">취소</button>
                </div>
              </template>
            </section>
          </template>
        </template>
      </template>

      <!-- 아이템 -->
      <section v-else class="card">
        <p class="turn-note">{{ turnNote }}</p>
        <p v-if="!itemGroups.length" class="msg">가지고 있는 아이템이 없습니다. 상점에서 살 수 있습니다.</p>
        <template v-for="g in itemGroups" :key="g.cat">
          <h4 class="sec">
            {{ CATEGORY_LABELS[g.cat] }}
            <label v-if="game.hasPerk(`autoUse:${g.cat}`)" class="auto">
              <input
                type="checkbox"
                :checked="!!game.autoUse[g.cat]"
                @change="game.setAutoUse(g.cat, ($event.target as HTMLInputElement).checked)"
              />
              자동 사용
            </label>
          </h4>
          <ul class="rows">
            <li v-for="it in g.items" :key="it.def.id" class="item-row">
              <div class="item-main">
                <ItemIcon :id="it.def.id" />
                <span class="grow">{{ it.info?.ko ?? it.def.id }} <span class="muted">×{{ it.count }}</span></span>
                <button
                  type="button"
                  class="small-btn"
                  :disabled="!it.usable || !!game.faint"
                  :title="it.usable ? '' : '지금은 효과가 없습니다'"
                  @click="game.useItem(it.def.id)"
                >
                  사용
                </button>
              </div>
              <p v-if="it.info?.text" class="item-text">{{ it.info.text }}</p>
            </li>
          </ul>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* 배틀 하위 탭: 패널 높이에 맞춰 로그가 남은 공간을 채움 (패널 스크롤 없음) */
.battle.fill {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.battle.fill > .controls {
  flex: 1;
  min-height: 0;
}

.sec {
  margin: 0 0 6px;
  font-size: 14px;
}

.sec small {
  color: #8a8a96;
  font-size: 11px;
  font-weight: 400;
}

.rows + .sec {
  margin-top: 14px;
}

.rows li.clickable {
  cursor: pointer;
}

.rows li.clickable:hover {
  background: #31313b;
}

.move-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 10px;
}

.mslot {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-height: 58px;
  padding: 8px 10px;
  border: 1px solid #3a3a44;
  border-left: 4px solid var(--c, #3a3a44);
  border-radius: 6px;
  background: #2a2a33;
  color: #eee;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mslot.picked {
  border-color: #ffcb05;
  border-left-color: var(--c, #ffcb05);
  background: #2f2c22;
}

.mslot .name {
  font-size: 15px;
  font-weight: 700;
}

.mslot .meta {
  color: #9a9aa6;
  font-size: 11px;
}

.mslot .mtype {
  padding: 0 5px;
  border-radius: 3px;
  background: var(--c);
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.mslot.empty {
  min-height: 34px;
  justify-content: center;
  align-items: center;
  color: #6a6a76;
  font-size: 13px;
}

.mslot.locked {
  cursor: default;
}

.picker .msg {
  margin: 0;
}

.picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}

.small-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.mslot .pp {
  color: #c8c8d0;
  font-size: 11px;
  font-weight: 400;
}

.turn-note {
  margin: 0 0 10px;
  color: #9a9aa6;
  font-size: 12px;
}

.sec .auto {
  display: inline-flex;
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
}

.small-btn {
  padding: 2px 8px;
  border: 1px solid #3a3a44;
  border-radius: 4px;
  background: #24242c;
  color: #ccc;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

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

.msg {
  margin: 8px 0;
  color: #6a6a76;
  font-size: 14px;
}

.members {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-bottom: 10px;
}

.members button {
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #2a2a33;
  color: #ccc;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.members button.active {
  border-color: #ffcb05;
  color: #fff;
}

.card {
  padding: 12px;
  border-radius: 8px;
  background: #2a2a33;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.muted {
  color: #9a9aa6;
  font-size: 13px;
}

.stats {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.stats th,
.stats td {
  padding: 5px 4px;
  text-align: right;
}

.stats thead th {
  color: #8a8a96;
  font-size: 12px;
  font-weight: 400;
}

.stats tbody th {
  text-align: left;
  color: #9a9aa6;
  font-weight: 400;
}

.stats td {
  color: #9a9aa6;
}

.stats td.value {
  color: #fff;
  font-weight: 700;
}

.stats td.value.up {
  color: #ff8a7a;
}

.stats td.value.down {
  color: #7aa8ff;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.rows li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid #33333d;
  font-size: 14px;
}

.rows li:last-child {
  border-bottom: none;
}

.grow {
  flex: 1;
}

.num {
  font-variant-numeric: tabular-nums;
}

.type {
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.lock-note {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #23232b;
  color: #9a9aa6;
  font-size: 13px;
}

.item-row {
  flex-direction: column;
  align-items: stretch !important;
  gap: 2px !important;
}

.item-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-text {
  margin: 0 0 0 38px;
  color: #8a8a96;
  font-size: 12px;
}

.auto {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}

.auto.disabled {
  color: #6a6a76;
  cursor: default;
}
</style>
