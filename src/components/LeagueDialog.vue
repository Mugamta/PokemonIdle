<script setup lang="ts">
// 잠긴 지방을 눌렀을 때: 앞 지방의 포켓몬 리그를 제패해야 한다는 안내 + 도전 창
// (상대할 사천왕·챔피언 엔트리, 자동 전투 여부, 내 파티 확인)
import { computed, ref } from 'vue'
import { speciesOf } from '../core/battle'
import { leagueOf, requiredLeagueRegion } from '../data/league'
import type { Region } from '../data/stages'
import { pickVariant, useGameStore } from '../stores/game'
import HpBar from './HpBar.vue'
import PokeSprite from './PokeSprite.vue'

const props = defineProps<{ region: Region }>()
const emit = defineEmits<{ close: [] }>()
const game = useGameStore()

/** 제패해야 하는 리그의 지방 */
const home = computed(() => requiredLeagueRegion(props.region))
const trainers = computed(() => (home.value ? (leagueOf(home.value) ?? []) : []))
const ready = computed(() => !!home.value && game.leagueReady(home.value))
const clearedCount = computed(
  () => home.value?.stages.filter((st) => game.clearedStages.includes(st.id) || game.waterLocked(st.id)).length ?? 0,
)
/** 챔피언 엔트리: 지금 선두 포켓몬 기준으로 고름 (도전 중이면 정해진 엔트리) */
const variant = computed(() => {
  const champ = trainers.value[trainers.value.length - 1]
  if (!champ) return 0
  if (game.league?.region === home.value?.key) return game.league!.variant
  return pickVariant(champ, game.party[0]?.species)
})
const teamOf = (i: number) => {
  const t = trainers.value[i]!
  return t.variants[t.champion ? variant.value : 0] ?? t.variants[0]!
}

const auto = ref(game.auto)
const busy = computed(() => !!game.faint || !!game.league)
const noParty = computed(() => !game.party.some((m) => m.hp !== 0))
const reason = computed(() => {
  if (game.league) return '이미 포켓몬 리그에 도전 중입니다.'
  if (game.faint) return '회복 중에는 도전할 수 없습니다.'
  if (noParty.value) return '싸울 수 있는 포켓몬이 없습니다.'
  return ''
})

function challenge() {
  if (!home.value) return
  if (game.startLeague(home.value.key, game.autoUnlocked ? auto.value : undefined)) emit('close')
}
const hpOf = (i: number) => {
  const m = game.party[i]!
  const max = game.memberMaxHp(m)
  return { hp: m.hp ?? max, max }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true">
      <strong class="title">포켓몬 리그 도전</strong>
      <p v-if="home" class="desc">
        <b>{{ region.title }}</b>에 가려면 <b>{{ home.title }}</b>의 포켓몬 리그를 제패해야 합니다.
      </p>

      <p v-if="home && !ready" class="note">
        먼저 {{ home.title }}의 모든 스테이지를 클리어하세요. ({{ clearedCount }}/{{ home.stages.length }})
      </p>

      <template v-if="home">
        <h3>상대</h3>
        <p class="muted">사천왕 4명과 챔피언을 연달아 상대합니다. 트레이너 사이에 회복하지 않으며, 포켓몬센터에 가면(패배·회복 버튼 포함) 처음부터 다시 도전해야 합니다. 가방 아이템은 쓸 수 있습니다.</p>
        <ol class="trainers">
          <li v-for="(t, i) in trainers" :key="t.id" :class="{ now: game.league?.region === home.key && game.league.trainer === i, done: game.league?.region === home.key && game.league.trainer > i }">
            <div class="who">
              <span class="order">{{ i + 1 }}</span>
              <span class="ttl">{{ t.title }}</span>
              <strong>{{ t.name }}</strong>
            </div>
            <ul class="team">
              <li v-for="(m, j) in teamOf(i)" :key="j" :title="speciesOf(m.species)?.ko ?? m.species">
                <PokeSprite :species="m.species" :size="36" lazy />
                <small>Lv.{{ m.level }}</small>
              </li>
            </ul>
          </li>
        </ol>

        <template v-if="ready">
          <h3>내 파티</h3>
          <ul class="party">
            <li v-for="(m, i) in game.party" :key="i" :class="{ fainted: m.hp === 0 }">
              <PokeSprite :species="m.species" :size="36" />
              <div class="pinfo">
                <span>{{ speciesOf(m.species)?.ko ?? m.species }} <small class="muted">Lv.{{ m.level }}</small></span>
                <HpBar :hp="hpOf(i).hp" :max="hpOf(i).max" :display="1" />
              </div>
            </li>
          </ul>

          <label v-if="game.autoUnlocked" class="auto">
            <input v-model="auto" type="checkbox" />
            자동 전투로 도전
          </label>
          <p v-if="reason" class="note">{{ reason }}</p>
        </template>
      </template>

      <div class="actions">
        <button v-if="ready" type="button" class="go" :disabled="busy || noParty" @click="challenge">도전</button>
        <button type="button" class="later" @click="emit('close')">{{ ready ? '취소' : '닫기' }}</button>
      </div>
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
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 14px;
  border: 1px solid #3a3a44;
  border-radius: 12px;
  background: #1e1e24;
  color: #eee;
}

.title {
  font-size: 16px;
}

.desc {
  margin: 8px 0 0;
  font-size: 14px;
}

h3 {
  margin: 14px 0 4px;
  font-size: 14px;
  color: #ffcb05;
}

.muted {
  margin: 0 0 6px;
  color: #9a9aa6;
  font-size: 12px;
}

.note {
  margin: 8px 0 0;
  color: #ffcb05;
  font-size: 12px;
}

.trainers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.trainers > li {
  padding: 6px 8px;
  border-radius: 8px;
  background: #2a2a33;
}

.trainers > li.now {
  box-shadow: inset 0 0 0 2px #ffcb05;
}

.trainers > li.done {
  opacity: 0.5;
}

.who {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.order {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #ffcb05;
  color: #1e1e24;
  font-size: 12px;
  font-weight: 700;
}

.ttl {
  color: #9a9aa6;
  font-size: 12px;
}

.team {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.team li {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 44px;
}

.team small {
  color: #c8c8d0;
  font-size: 10px;
}

.party {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.party li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.party li.fainted {
  opacity: 0.5;
}

.pinfo {
  flex: 1;
  min-width: 0;
}

.auto {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 14px;
  cursor: pointer;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.actions button {
  flex: 1;
  height: 36px;
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}

.go {
  border: none;
  background: #ffcb05;
  color: #1e1e24;
  font-weight: 700;
}

.go:disabled {
  opacity: 0.4;
  cursor: default;
}

.later {
  border: 1px solid #3a3a44;
  background: transparent;
  color: #c8c8d0;
}
</style>
