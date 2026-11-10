<script setup lang="ts">
// 전투 탭 > 배틀: 특수 기능 버튼, 기술 버튼(수동 전투)과 전투 로그
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { moveData, typeEffect, type MoveData } from '../core/battle'
import { GIMMICK_INFO, GIMMICKS, maxMove, maxMoveFx, zEligible, zMove, type Gimmick } from '../core/gimmicks'
import { dexData, TYPE_COLORS } from '../data/dex'
import { findStage, regionOfGimmick } from '../data/stages'
import { useBattleLogStore } from '../stores/battleLog'
import {
  AUTO_GIMMICK_LABELS,
  AUTO_UNLOCK_STAGE,
  heldOf,
  MAX_MOVE_SLOTS,
  maxPpOf,
  ppOf,
  SLOT_DEFEATS,
  teraTypeOf,
  useGameStore,
  type AutoGimmick,
} from '../stores/game'

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

// ---------- 특수 기능 (메가진화·Z기술·다이맥스·테라스탈) ----------
/** 다음 기술과 함께 쓰려고 고른 특수 기능 */
const armed = ref<Gimmick | null>(null)
const options = computed(() => {
  void game.party[0]?.held
  void game.party[0]?.heldSpent
  void game.party[0]?.moves.length
  void game.enemy
  return game.gimmickOptions()
})
watch(options, (list) => {
  if (armed.value && !list.includes(armed.value)) armed.value = null
})
const gimmickButtons = computed(() =>
  GIMMICKS.filter((g) => game.gimmickUnlocked(g)).map((g) => {
    const on = options.value.includes(g)
    let why = ''
    if (!on) {
      if (!game.enemy) why = '전투 중에만 쓸 수 있습니다'
      else if (game.gimmickUsed) why = '특수 기능은 한 전투에 한 번만 쓸 수 있습니다'
      else if (g === 'mega') why = '맞는 메가스톤을 지니고 있어야 합니다'
      else if (g === 'z') why = 'Z크리스탈을 지니고, 같은 타입 공격기를 쓸 수 있어야 합니다'
    }
    const label = g === 'tera' && game.party[0] ? `${GIMMICK_INFO[g].label} · ${dexData.value?.types[teraTypeOf(game.party[0])] ?? ''}` : GIMMICK_INFO[g].label
    return { g, on, label, title: why || GIMMICK_INFO[g].desc }
  }),
)
/** 아직 해금하지 않은 특수 기능 안내 (다음 하나만) */
const nextGimmick = computed(() => {
  const g = GIMMICKS.find((x) => !game.gimmickUnlocked(x))
  return g && game.anyGimmickUnlocked ? `${GIMMICK_INFO[g].label}: ${regionOfGimmick(g)?.title ?? '?'} 입장 시 해금` : ''
})
/** 지금 이어지고 있는 특수 기능 효과 */
const activeText = computed(() => {
  const g = game.gimmickActive
  if (!g) return game.gimmickUsed && game.enemy ? '이번 전투에서 특수 기능을 썼습니다' : ''
  if (g.kind === 'mega') return `메가진화 중 (${me.value?.name ?? ''})`
  if (g.kind === 'dynamax') return `다이맥스 중 · 남은 ${g.turns}턴`
  return `테라스탈 중 · ${dexData.value?.types[g.type] ?? g.type} 타입`
})
function toggleArm(g: Gimmick) {
  armed.value = armed.value === g ? null : g
}
/** 기술 버튼에 보여 줄 실제 기술 (다이맥스 기술·Z기술) */
function viewOf(m: MoveData): { v: MoveData; tag: string } {
  if (m.id === 'struggle') return { v: m, tag: '' }
  if (game.gimmickActive?.kind === 'dynamax' || armed.value === 'dynamax') {
    const v = maxMove(m)
    return { v, tag: v.cls === 'status' ? '상대 공격을 막음' : maxMoveFx(v.type) }
  }
  const held = game.party[0] ? heldOf(game.party[0]) : null
  if (armed.value === 'z' && zEligible(m, held)) return { v: zMove(m), tag: 'Z기술' }
  return { v: m, tag: '' }
}
function useMove(id: string) {
  game.takeTurn(id, armed.value)
  armed.value = null
}

/** 기술칸 8칸: 장착 기술 / 빈 칸 / 잠긴 칸(해금 조건 표시) */
const slots = computed(() => {
  const member = game.party[0]
  const open = member ? game.slotsOf(member) : 1
  const defeats = game.totalDefeats
  return Array.from({ length: MAX_MOVE_SLOTS }, (_, i) => {
    if (i >= open) {
      const need = SLOT_DEFEATS[i - 1]
      const cond = need != null ? `계정 격파 ${Math.min(defeats, need)}/${need}` : '상점에서 해금'
      return { kind: 'locked' as const, cond }
    }
    const id = game.party[0]?.moves[i]
    const m = id ? moveData(id) : null
    if (!m) return { kind: 'empty' as const }
    const { v, tag } = viewOf(m)
    let hint = ''
    if (foe.value && me.value && v.cls !== 'status') {
      const eff = v.type === 'typeless' ? 1 : typeEffect(v.type, foe.value)
      hint = eff === 0 ? '효과 없음' : eff > 1 ? '효과 굉장함' : eff < 1 ? '효과 별로' : ''
    }
    const max = maxPpOf(m.id, member)
    const pp = member ? ppOf(member, m.id) : max
    return { kind: 'move' as const, m, v, tag, special: v !== m, hint, pp, max, out: game.ppActive && pp === 0 }
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

// 자동 전투 중에는 로그를 그리지 않음 (기록은 계속 쌓이고, 끄면 확인 가능)
const hideLog = computed(() => game.auto)

// 로그 자동 스크롤 (탭을 바꾸거나 보고 있는 전투에 줄이 추가될 때, 로그가 다시 보일 때)
const logEl = ref<HTMLElement>()
const latestId = computed(() => log.battles[log.battles.length - 1]?.id)
watch(
  () => [log.current?.id, hideLog.value || log.current?.lines.length],
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

    <!-- 특수 기능: 버튼을 누른 뒤 기술을 고르면 그 턴에 발동 -->
    <div v-if="gimmickButtons.length" class="gimmicks">
      <button
        v-for="b in gimmickButtons"
        :key="b.g"
        type="button"
        class="gimmick"
        :class="[b.g, { armed: armed === b.g }]"
        :disabled="!b.on || !canAct"
        :title="b.title"
        @click="toggleArm(b.g)"
      >
        {{ b.label }}
      </button>
      <label class="auto-gimmick" title="자동 전투에서 특수 기능을 쓸지 (메가진화 > Z기술 > 다이맥스 > 테라스탈 순으로 쓸 수 있는 것)">
        자동
        <select :value="game.autoGimmick" @change="game.setAutoGimmick(($event.target as HTMLSelectElement).value as AutoGimmick)">
          <option v-for="(label, k) in AUTO_GIMMICK_LABELS" :key="k" :value="k">{{ label }}</option>
        </select>
      </label>
      <span v-if="armed" class="gimmick-note">{{ GIMMICK_INFO[armed].label }}: 기술을 고르면 발동합니다</span>
      <span v-else-if="activeText" class="gimmick-note">{{ activeText }}</span>
      <span v-else-if="nextGimmick" class="gimmick-note muted">{{ nextGimmick }}</span>
    </div>

    <div class="moves">
      <template v-for="(s, i) in slots" :key="i">
        <button
          v-if="s.kind === 'move'"
          type="button"
          class="move"
          :style="{ '--c': TYPE_COLORS[s.v.type] ?? '#666' }"
          :class="{ out: s.out, special: s.special }"
          :disabled="!canAct || s.out"
          :title="s.special ? `원래 기술: ${s.m.ko}` : ''"
          @click="useMove(s.m.id)"
        >
          <span class="name">{{ s.v.ko }} <small v-if="s.hint" class="hint">{{ s.hint }}</small></span>
          <span v-if="s.max != null" class="pp" :class="{ low: s.pp != null && s.pp <= s.max / 4 }">PP {{ s.pp }}/{{ s.max }}</span>
          <span class="meta">
            <span class="type">{{ dexData?.types[s.v.type] ?? s.v.type }}</span>
            {{ CLS_LABEL[s.v.cls] }} · 위력 {{ s.v.power ?? '-' }} · 명중 {{ s.v.acc ?? '-' }}
            <template v-if="s.tag"> · {{ s.tag }}</template>
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
      <div class="log-tabs">
        <button
          v-for="b in hideLog ? [] : log.battles"
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
        <p v-if="hideLog" class="empty">자동 전투 중에는 로그를 표시하지 않습니다. 자동 전투를 끄면 최근 전투 기록을 확인할 수 있습니다.</p>
        <p v-else-if="!log.current?.lines.length" class="empty">전투 기록이 여기에 표시됩니다.</p>
        <template v-for="l in hideLog ? [] : (log.current?.lines ?? [])" :key="l.id">
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

.move.special {
  border-color: var(--c);
  background: linear-gradient(135deg, #2a2a33 60%, color-mix(in srgb, var(--c) 30%, #2a2a33));
}

.gimmicks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.gimmick {
  padding: 5px 10px;
  border: 1px solid var(--g);
  border-radius: 999px;
  background: #24242b;
  color: var(--g);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.gimmick:disabled {
  border-color: #3a3a44;
  color: #6a6a76;
  cursor: default;
}

.gimmick.armed {
  background: var(--g);
  color: #18181d;
  box-shadow: 0 0 8px var(--g);
}

.gimmick.mega {
  --g: #c58cff;
}

.gimmick.z {
  --g: #ffcb05;
}

.gimmick.dynamax {
  --g: #ff4a6e;
}

.gimmick.tera {
  --g: #5fe3e8;
}

.auto-gimmick {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #9a9aa6;
  font-size: 11px;
}

.auto-gimmick select {
  padding: 2px 4px;
  border: 1px solid #3a3a44;
  border-radius: 4px;
  background: #24242b;
  color: #ddd;
  font: inherit;
  font-size: 11px;
}

.gimmick-note {
  color: #c8c8d0;
  font-size: 11px;
}

.gimmick-note.muted {
  color: #6a6a76;
}

.slot {
  min-height: 34px;
  justify-content: center;
  align-items: center;
  color: #6a6a76;
  font-size: 13px;
  cursor: default;
}

/* 문구 길이와 상관없이 항상 한 줄 높이 (줄바꿈으로 아래 로그가 출렁이지 않게) */
.status {
  flex: none;
  height: 18px;
  margin: 0;
  overflow: hidden;
  color: #9a9aa6;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 전투 기록이 없어도 탭 줄 높이를 유지 */
.log-tabs {
  flex: none;
  display: flex;
  height: 20px;
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
  scrollbar-gutter: stable;
  padding: 8px 10px;
  border-radius: 6px;
  border-top-left-radius: 0;
  background: #18181d;
  font-size: 13px;
  line-height: 1.6;
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
