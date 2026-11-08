<script setup lang="ts">
// 전투 탭 > 배틀: 기술 버튼(수동 전투)과 전투 로그
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { moveData, typeEffect } from '../core/battle'
import { dexData, TYPE_COLORS } from '../data/dex'
import { findStage } from '../data/stages'
import { useBattleLogStore } from '../stores/battleLog'
import { AUTO_UNLOCK_STAGE, MAX_MOVE_SLOTS, maxPpOf, ppOf, SLOT_DEFEATS, slotsOf, useGameStore } from '../stores/game'

const game = useGameStore()
const log = useBattleLogStore()

// 연출 대기 표시용 시계 (100ms)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 100)))
onUnmounted(() => clearInterval(timer))
const busy = computed(() => now.value < log.readyAt)

const me = computed(() => {
  void game.party[0]?.hp
  void game.playerStages
  return game.playerBattler()
})
const foe = computed(() => {
  void game.enemy?.hp
  void game.enemy?.stages
  return game.enemyBattler()
})

/** 기술칸 8칸: 장착 기술 / 빈 칸 / 잠긴 칸(해금 조건 표시) */
const slots = computed(() => {
  const member = game.party[0]
  const open = member ? slotsOf(member) : 1
  const defeats = member?.defeats ?? 0
  return Array.from({ length: MAX_MOVE_SLOTS }, (_, i) => {
    if (i >= open) {
      const need = SLOT_DEFEATS[i - 1]
      const cond = need != null ? `격파 ${Math.min(defeats, need)}/${need}` : '상점에서 해금'
      return { kind: 'locked' as const, cond }
    }
    const id = game.party[0]?.moves[i]
    const m = id ? moveData(id) : null
    if (!m) return { kind: 'empty' as const }
    let hint = ''
    if (foe.value && me.value && m.cls !== 'status') {
      const eff = m.type === 'typeless' ? 1 : typeEffect(m.type, foe.value)
      hint = eff === 0 ? '효과 없음' : eff > 1 ? '효과 굉장함' : eff < 1 ? '효과 별로' : ''
    }
    const max = maxPpOf(m.id, member)
    const pp = member ? ppOf(member, m.id) : max
    return { kind: 'move' as const, m, hint, pp, max, out: game.ppActive && pp === 0 }
  })
})
/** 모든 기술의 PP가 0이면 발버둥 */
const struggling = computed(() => !!game.party[0] && game.usableMoves().length === 0)

const canAct = computed(() => !!foe.value && !game.auto && !game.faint && !game.travel && !busy.value)
const status = computed(() => {
  if (game.faint) return '포켓몬센터에서 회복 중입니다.'
  if (game.travel) return '이동 중입니다.'
  if (!game.enemy) return '야생 포켓몬을 찾는 중…'
  if (log.pending) return '상대가 기술을 고르는 중…'
  if (game.auto) return busy.value ? '기술을 고르는 중…' : '자동 전투 중입니다. 상단 왼쪽 스위치로 끌 수 있습니다.'
  return busy.value ? '…' : '기술을 골라 주세요.'
})
const autoHint = computed(() => {
  if (game.autoUnlocked) return ''
  const s = findStage(AUTO_UNLOCK_STAGE)?.stage
  return `튜토리얼: 기술 버튼을 눌러 직접 싸워 보세요. ${s?.name ?? AUTO_UNLOCK_STAGE}에서 모든 포켓몬을 만나거나 10마리를 쓰러뜨리면 보스에 도전할 수 있고, 보스를 쓰러뜨리면 자동 전투가 해금됩니다.`
})

const CLS_LABEL = { physical: '물리', special: '특수', status: '변화' }

// 로그 자동 스크롤 (탭을 바꾸거나 보고 있는 전투에 줄이 추가될 때)
const logEl = ref<HTMLElement>()
const latestId = computed(() => log.battles[log.battles.length - 1]?.id)
watch(
  () => [log.current?.id, log.current?.lines.length],
  async () => {
    await nextTick()
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  },
  { immediate: true },
)
</script>

<template>
  <div class="controls">
    <p v-if="autoHint" class="tutorial">{{ autoHint }}</p>

    <div class="moves">
      <template v-for="(s, i) in slots" :key="i">
        <button
          v-if="s.kind === 'move'"
          type="button"
          class="move"
          :style="{ '--c': TYPE_COLORS[s.m.type] ?? '#666' }"
          :class="{ out: s.out }"
          :disabled="!canAct || s.out"
          @click="game.takeTurn(s.m.id)"
        >
          <span class="name">{{ s.m.ko }} <small v-if="s.hint" class="hint">{{ s.hint }}</small></span>
          <span v-if="s.max != null" class="pp" :class="{ low: s.pp != null && s.pp <= s.max / 4 }">PP {{ s.pp }}/{{ s.max }}</span>
          <span class="meta">
            <span class="type">{{ dexData?.types[s.m.type] ?? s.m.type }}</span>
            {{ CLS_LABEL[s.m.cls] }} · 위력 {{ s.m.power ?? '-' }} · 명중 {{ s.m.acc ?? '-' }}
          </span>
        </button>
        <div v-else-if="s.kind === 'empty'" class="move slot">빈 칸 (기술 탭에서 장착)</div>
        <div v-else class="move slot locked">🔒 {{ s.cond }}</div>
      </template>
    </div>
    <button
      v-if="struggling"
      type="button"
      class="move struggle"
      :disabled="!canAct"
      @click="game.takeTurn('struggle')"
    >
      <span class="name">발버둥</span>
      <span class="meta">쓸 수 있는 기술이 없습니다. 반동으로 최대 HP의 1/4 데미지를 받습니다.</span>
    </button>
    <p class="status">{{ status }}</p>

    <div class="log-wrap">
      <div v-if="log.battles.length" class="log-tabs">
        <button
          v-for="b in log.battles"
          :key="b.id"
          type="button"
          class="log-tab"
          :class="{ active: b.id === log.current?.id, boss: b.boss, live: b.id === latestId }"
          :title="b.id === latestId ? '현재 전투' : ''"
          @click="log.select(b.id)"
        >
          {{ b.label }}
        </button>
      </div>
      <div ref="logEl" class="log">
        <p v-if="!log.current?.lines.length" class="empty">전투 기록이 여기에 표시됩니다.</p>
        <template v-for="l in log.current?.lines ?? []" :key="l.id">
          <hr v-if="l.kind === 'divider'" class="divider" />
          <p v-else :class="l.kind">{{ l.text }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tutorial {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid #5a4a1a;
  border-radius: 6px;
  background: #2f2a1c;
  color: #e8d9a8;
  font-size: 12px;
  line-height: 1.5;
}

.moves {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.move {
  position: relative;
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

.move:disabled {
  cursor: default;
  opacity: 0.55;
}

.move:not(:disabled):active {
  background: #34343f;
}

.move .name {
  font-size: 15px;
  font-weight: 700;
}

.move .meta {
  color: #9a9aa6;
  font-size: 11px;
}

.move .type {
  padding: 0 5px;
  border-radius: 3px;
  background: var(--c);
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.move .hint {
  color: #ffcb05;
  font-size: 11px;
  font-weight: 400;
}

.move .pp {
  position: absolute;
  top: 7px;
  right: 8px;
  color: #c8c8d0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.move .pp.low {
  color: #ff8a80;
}

.move.out .pp {
  color: #ff5a4a;
  font-weight: 700;
}

.struggle {
  --c: #b0b0b8;
  width: 100%;
}

.slot {
  min-height: 34px;
  justify-content: center;
  align-items: center;
  color: #6a6a76;
  font-size: 13px;
  cursor: default;
}

.status {
  margin: 0;
  color: #9a9aa6;
  font-size: 12px;
  text-align: center;
}

.log-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.log-tabs {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.log-tabs::-webkit-scrollbar {
  display: none;
}

.log-tab {
  flex: none;
  padding: 2px 8px;
  border: none;
  border-radius: 5px 5px 0 0;
  background: #24242b;
  color: #7a7a86;
  font: inherit;
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}

.log-tab.boss {
  color: #d9a441;
}

.log-tab.live::after {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-left: 4px;
  border-radius: 50%;
  background: #7fe0a0;
  vertical-align: middle;
}

.log-tab.active {
  background: #18181d;
  color: #eee;
  font-weight: 700;
}

.log-tab.boss.active {
  color: #ffcb05;
}

.log {
  flex: 1;
  min-height: 72px;
  overflow-y: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: #18181d;
  font-size: 13px;
  line-height: 1.6;
}

.log-tabs + .log {
  border-top-left-radius: 0;
}

.log p {
  margin: 0;
  color: #c8c8d0;
}

.log .info {
  color: #81b9ef;
}

.log .good {
  color: #7fe0a0;
}

.log .bad {
  color: #ff8a80;
}

.log .divider {
  margin: 6px 0;
  border: none;
  border-top: 1px dashed #3a3a48;
}

.log .empty {
  color: #6a6a76;
}
</style>
