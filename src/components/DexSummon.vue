<script setup lang="ts">
// 도감 수집 기록 + 파티로 불러오기 (기록된 성격·특성 중 선택, 개체값·노력치·레벨·친밀도는 기록 범위 안에서 선택)
import { computed, reactive, ref, watch } from 'vue'
import { abilityName, hiddenAbility, normalAbilities } from '../core/abilities'
import { dexData, STAT_LABELS, TYPE_COLORS } from '../data/dex'
import { josa, ro } from '../core/battle'
import { calcStats, NATURES, STAT_KEYS } from '../data/natures'
import { GENDER_SYMBOL, HIDDEN_ABILITY_SLOT, PARTY_MAX, slotsAt, useGameStore, type Gender, type SummonChoice } from '../stores/game'

const props = defineProps<{ id: string }>()
const game = useGameStore()

const record = computed(() => game.dexRecords[props.id])
const entry = computed(() => dexData.value?.index.find((p) => p.id === props.id))
const slots = computed(() => (record.value ? slotsAt(game.totalDefeats, { extraSlots: record.value.extraSlots }) : 1))

const GENDER_LABEL: Record<Gender, string> = { M: `${GENDER_SYMBOL.M} 수컷`, F: `${GENDER_SYMBOL.F} 암컷` }
const choice = reactive<SummonChoice>({ gender: null, nature: '', ability: 0, level: 1, friendship: 0, ivs: [], evs: [], moves: [] })
const message = ref('')

/** 노력치를 합계 한계 안으로 줄임 (뒤 능력치부터) */
function fitEvs(evs: number[], keep = -1) {
  const r = record.value
  if (!r) return
  for (let i = 0; i < 6; i++) evs[i] = Math.max(r.evMin[i]!, Math.min(r.evMax[i]!, game.evStatCap, evs[i] ?? 0))
  let over = evs.reduce((a, b) => a + b, 0) - game.evTotalCap
  for (let i = 5; i >= 0 && over > 0; i--) {
    if (i === keep) continue
    const cut = Math.min(over, evs[i]! - r.evMin[i]!)
    evs[i]! -= cut
    over -= cut
  }
  if (over > 0 && keep >= 0) evs[keep]! -= Math.min(over, evs[keep]! - r.evMin[keep]!)
}

/** 모든 값을 기록된 최대로 (기술은 마지막에 배운 순서로 기술칸 수만큼) */
function pickBest() {
  const r = record.value
  if (!r) return
  if (!r.natures.includes(choice.nature)) choice.nature = r.natures[0]!
  if (!r.abilities.includes(choice.ability)) choice.ability = r.abilities[0]!
  if (!choice.gender || !r.genders?.includes(choice.gender)) choice.gender = r.genders?.[0] ?? null
  choice.level = r.levelMax
  choice.friendship = r.friendshipMax
  choice.ivs = [...r.ivMax]
  choice.evs = [...r.evMax]
  fitEvs(choice.evs)
  choice.moves = r.moves.slice(-slots.value)
}
watch([() => props.id, () => !!record.value], () => {
  message.value = ''
  pickBest()
}, { immediate: true })

const natureLabel = (id: string) => {
  const n = NATURES[id]
  if (!n) return id
  if (!n.plus || !n.minus) return `${n.ko} (무보정)`
  return `${n.ko} (${STAT_LABELS[STAT_KEYS.indexOf(n.plus)]}↑ ${STAT_LABELS[STAT_KEYS.indexOf(n.minus)]}↓)`
}
const abilityLabel = (slot: number) =>
  slot === HIDDEN_ABILITY_SLOT ? `${abilityName(hiddenAbility(props.id))} (숨겨진 특성)` : abilityName(normalAbilities(props.id)[slot] ?? null)

const evTotal = computed(() => choice.evs.reduce((a, b) => a + b, 0))
const stats = computed(() =>
  entry.value ? calcStats(entry.value.stats, choice.level, choice.ivs, choice.evs, choice.nature, props.id) : [],
)
const moveInfo = (id: string) => dexData.value?.movesById[id]

function setEv(i: number, v: number) {
  choice.evs[i] = v
  fitEvs(choice.evs, i)
}
function toggleMove(id: string) {
  const i = choice.moves.indexOf(id)
  if (i >= 0) choice.moves.splice(i, 1)
  else if (choice.moves.length < slots.value) choice.moves.push(id)
}

const blocked = computed(() =>
  game.party.length >= PARTY_MAX ? `파티가 가득 찼습니다 (${PARTY_MAX}마리)` : game.faint ? '회복 중에는 불러올 수 없습니다' : '',
)
function summon() {
  const name = entry.value?.ko ?? props.id
  message.value = game.summonFromDex(props.id, { ...choice, ivs: [...choice.ivs], evs: [...choice.evs], moves: [...choice.moves] })
    ? `${josa(name, '이', '가')} Lv.${ro(String(choice.level))} 파티에 들어갔습니다.`
    : '불러오지 못했습니다.'
}
</script>

<template>
  <section class="card">
    <h3>수집 기록 <small v-if="record">파티로 불러오기</small></h3>
    <p v-if="!record" class="muted">
      기록이 없습니다. 포획하거나 파티에서 도감으로 보내면 성격·특성·개체값·노력치·레벨·친밀도·기술이 기록됩니다.
    </p>
    <template v-else>
      <h4>성격 <small>{{ record.natures.length }} / {{ Object.keys(NATURES).length }}</small></h4>
      <div class="chips">
        <button
          v-for="n in record.natures"
          :key="n"
          type="button"
          :class="{ active: choice.nature === n }"
          @click="choice.nature = n"
        >
          {{ natureLabel(n) }}
        </button>
      </div>

      <h4>특성</h4>
      <div class="chips">
        <button
          v-for="a in record.abilities"
          :key="a"
          type="button"
          :class="{ active: choice.ability === a }"
          @click="choice.ability = a"
        >
          {{ abilityLabel(a) }}
        </button>
      </div>

      <template v-if="record.genders?.length">
        <h4>성별</h4>
        <div class="chips">
          <button
            v-for="g in record.genders"
            :key="g"
            type="button"
            :class="{ active: choice.gender === g }"
            @click="choice.gender = g"
          >
            {{ GENDER_LABEL[g] }}
          </button>
        </div>
      </template>

      <h4>레벨 · 친밀도</h4>
      <div class="sliders">
        <label class="srow">
          <span class="label">레벨</span>
          <input v-model.number="choice.level" type="range" :min="record.levelMin" :max="record.levelMax" :disabled="record.levelMin === record.levelMax" />
          <span class="val">{{ choice.level }}</span>
          <span class="range">{{ record.levelMin }}~{{ record.levelMax }}</span>
        </label>
        <label class="srow">
          <span class="label">친밀도</span>
          <input
            v-model.number="choice.friendship"
            type="range"
            :min="record.friendshipMin"
            :max="record.friendshipMax"
            :disabled="record.friendshipMin === record.friendshipMax"
          />
          <span class="val">{{ choice.friendship }}</span>
          <span class="range">{{ record.friendshipMin }}~{{ record.friendshipMax }}</span>
        </label>
      </div>

      <h4>개체값</h4>
      <div class="sliders">
        <label v-for="(label, i) in STAT_LABELS" :key="i" class="srow">
          <span class="label">{{ label }}</span>
          <input v-model.number="choice.ivs[i]" type="range" :min="record.ivMin[i]" :max="record.ivMax[i]" :disabled="record.ivMin[i] === record.ivMax[i]" />
          <span class="val">{{ choice.ivs[i] }}</span>
          <span class="range">{{ record.ivMin[i] }}~{{ record.ivMax[i] }}</span>
        </label>
      </div>

      <h4>노력치 <small :class="{ over: evTotal >= game.evTotalCap }">합계 {{ evTotal }}<template v-if="Number.isFinite(game.evTotalCap)"> / {{ game.evTotalCap }}</template></small></h4>
      <div class="sliders">
        <label v-for="(label, i) in STAT_LABELS" :key="i" class="srow">
          <span class="label">{{ label }}</span>
          <input
            type="range"
            :value="choice.evs[i]"
            :min="record.evMin[i]"
            :max="record.evMax[i]"
            :disabled="record.evMin[i] === record.evMax[i]"
            @input="setEv(i, Number(($event.target as HTMLInputElement).value))"
          />
          <span class="val">{{ choice.evs[i] }}</span>
          <span class="range">{{ record.evMin[i] }}~{{ record.evMax[i] }}</span>
        </label>
      </div>

      <h4>능력치 미리보기</h4>
      <div class="preview">
        <span v-for="(v, i) in stats" :key="i"><small>{{ STAT_LABELS[i] }}</small> {{ v }}</span>
      </div>

      <h4>장착할 기술 <small>{{ choice.moves.length }} / {{ slots }}칸 · 고르지 않은 기술은 잊은 기술로 배운 상태</small></h4>
      <ul class="moves">
        <li v-for="mid in record.moves" :key="mid">
          <button
            type="button"
            :class="{ active: choice.moves.includes(mid) }"
            :disabled="!choice.moves.includes(mid) && choice.moves.length >= slots"
            @click="toggleMove(mid)"
          >
            <span class="grow">{{ moveInfo(mid)?.ko ?? mid }}</span>
            <span
              v-if="moveInfo(mid)"
              class="type"
              :style="{ background: TYPE_COLORS[moveInfo(mid)!.type] }"
            >{{ dexData?.types[moveInfo(mid)!.type] }}</span>
          </button>
        </li>
      </ul>

      <div class="actions">
        <button type="button" class="ghost" @click="pickBest">모두 최대로</button>
        <button type="button" class="go" :disabled="!!blocked" :title="blocked" @click="summon">파티로 불러오기</button>
      </div>
      <p v-if="blocked" class="muted">{{ blocked }}</p>
      <p v-if="message" class="msg">{{ message }}</p>
    </template>
  </section>
</template>

<style scoped>
.card {
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 8px;
  background: #2a2a33;
}

h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #ffcb05;
}

h3 small,
h4 small {
  margin-left: 6px;
  color: #9a9aa6;
  font-weight: 400;
}

h4 small.over {
  color: #ffcb05;
}

h4 {
  margin: 12px 0 6px;
  font-size: 13px;
  color: #ddd;
}

.muted {
  color: #8a8a96;
  font-size: 12px;
}

.msg {
  margin: 8px 0 0;
  color: #7fd17f;
  font-size: 13px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chips button,
.moves button,
.actions button {
  padding: 5px 10px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: transparent;
  color: #bbb;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.chips button.active,
.moves button.active {
  border-color: #ffcb05;
  color: #fff;
  background: #3a3520;
}

.sliders {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.srow {
  display: grid;
  grid-template-columns: 52px 1fr 34px 60px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.srow .label {
  color: #9a9aa6;
}

.srow input {
  width: 100%;
  accent-color: #ffcb05;
}

.srow .val {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.srow .range {
  color: #777;
  font-size: 11px;
}

.preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.preview small {
  color: #9a9aa6;
}

.moves {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.moves button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
}

.moves button:disabled {
  opacity: 0.4;
  cursor: default;
}

.grow {
  flex: 1;
  min-width: 0;
}

.type {
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.actions .go {
  border-color: #ffcb05;
  color: #ffcb05;
}

.actions .go:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
