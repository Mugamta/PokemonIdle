<script setup lang="ts">
// 상단 전투 화면: 좌하단 내 포켓몬(뒷모습), 우상단 상대 포켓몬(앞모습), 각자의 HP 바
// 좌상단 자동 전투 스위치, 우상단 보스 도전, 패배 시 포켓몬센터 화면
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { phaseAt, useNow } from '../core/dayNight'
import { battleData, STATUS_COLORS, STATUS_LABELS } from '../data/battle'
import { dexData, loadDex, STAT_LABELS, TYPE_COLORS } from '../data/dex'
import { calcStats } from '../data/natures'
import { findStage } from '../data/stages'
import { expAtLevel, moveData, ro } from '../core/battle'
import { formOf } from '../core/gimmicks'
import { useBattleLogStore } from '../stores/battleLog'
import { BOSS_DEFEATS, BOSS_INTRO_MS, maxPpOf, ppOf, useGameStore } from '../stores/game'
import HpBar from './HpBar.vue'
import ItemIcon from './ItemIcon.vue'
import PokemonCenter from './PokemonCenter.vue'
import PokeSprite from './PokeSprite.vue'

const game = useGameStore()
const log = useBattleLogStore()
const now = useNow()
onMounted(() => loadDex().catch(() => {}))

const night = computed(() => phaseAt(now.value) === 'night')
const stage = computed(() => findStage(game.currentStageId)?.stage)
const travelTarget = computed(() => (game.travel ? findStage(game.travel.to)?.stage : null))
const travelLeft = computed(() =>
  game.travel ? Math.max(0, Math.ceil((game.travel.arriveAt - now.value) / 1000)) : 0,
)

const species = (id: string) => dexData.value?.index.find((p) => p.id === id)

function hpInfo(id: string, level: number, ivs: number[], evs: number[], nature: string, hp: number | null | undefined) {
  const sp = species(id)
  if (!sp) return null
  const max = calcStats(sp.stats, level, ivs, evs, nature, id)[0]!
  return { name: sp.ko, max, hp: Math.max(0, Math.min(max, hp ?? max)) }
}

const mine = computed(() => {
  const m = game.party[0]
  if (!m) return null
  const g = game.gimmickActive
  const info = hpInfo(m.species, m.level, m.ivs ?? [], m.evs ?? [], m.nature, null)
  // 다이맥스: 최대 HP 2배 / 메가진화: 메가진화한 모습의 이름·도트
  if (info) {
    if (g?.kind === 'dynamax') info.max *= 2
    info.hp = Math.max(0, Math.min(info.max, m.hp ?? info.max))
  }
  const form = g?.kind === 'mega' ? formOf(g.form) : undefined
  if (info && form) info.name = form.ko
  return {
    member: m,
    info,
    sprite: form?.id ?? m.species,
    dynamax: g?.kind === 'dynamax',
    tera: g?.kind === 'tera' ? g.type : null,
    mega: !!form,
  }
})

/** 다음 레벨까지 경험치: 이번 레벨에서 얻은 양 / 필요한 양 */
const expProgress = computed(() => {
  const m = game.party[0]
  if (!m || m.level >= 100) return null
  const cur = expAtLevel(m.species, m.level)
  const next = expAtLevel(m.species, m.level + 1)
  if (next <= cur) return null
  const need = next - cur
  const have = Math.max(0, Math.min(need, (m.exp ?? cur) - cur))
  return { have, need, ratio: have / need }
})
const expRatio = computed(() => expProgress.value?.ratio ?? 0)
/** 상점 표시 개선에 따른 EXP 문구 */
const expText = computed(() => {
  const lv = game.displayLevel('exp')
  if (!lv || !mine.value) return ''
  const e = expProgress.value
  if (!e) return 'EXP MAX'
  const pct = `${Math.floor(e.ratio * 100)}%`
  return lv === 2 ? `EXP ${e.have.toLocaleString()} / ${e.need.toLocaleString()} (${pct})` : `EXP ${pct}`
})

// 스테이지 진행도 / 보스
const progress = computed(() => game.progressOf(game.currentStageId))
const cleared = computed(() => game.clearedStages.includes(game.currentStageId))
const inBoss = computed(() => !!game.enemy?.boss)

// 보스 등장 연출: 새 보스가 나타난 순간에만 재생 (새로고침으로 불러온 보스전은 생략)
const bossIntro = ref<{ key: number; name: string; level: number } | null>(null)
let introTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => game.enemy,
  (e, old) => {
    if (!e?.boss || e === old || game.bossIntroSkipped) return
    bossIntro.value = { key: Date.now(), name: species(e.species)?.ko ?? e.species, level: e.level }
    clearTimeout(introTimer)
    introTimer = setTimeout(() => (bossIntro.value = null), BOSS_INTRO_MS)
  },
)
onUnmounted(() => clearTimeout(introTimer))

/** 상대를 쓰러뜨리면 받는 노력치 (본가 기준 effort 값) */
const evYield = computed(() => {
  const ev = game.enemy && battleData.value?.species[game.enemy.species]?.ev
  if (!ev) return ''
  return ev
    .map((v, i) => (v ? `${STAT_LABELS[i]} +${v}` : ''))
    .filter(Boolean)
    .join(' · ')
})

// 쓰러뜨린 상대: 다음 포켓몬이 나올 때까지 회색 스프라이트 + HP 0으로 남겨 둠
const fallen = ref<NonNullable<typeof game.enemy> | null>(null)
watch(
  () => game.enemy,
  (e, old) => {
    fallen.value = !e && old && (old.hp ?? 1) <= 0 ? old : null
  },
)
watch(
  () => !!game.faint || !!game.travel || game.currentStageId,
  () => (fallen.value = null),
)

const foe = computed(() => {
  const e = game.enemy ?? fallen.value
  if (!e) return null
  return { enemy: e, info: hpInfo(e.species, e.level, e.ivs, [0, 0, 0, 0, 0, 0], e.nature, e.hp) }
})
const foeFallen = computed(() => !game.enemy && !!fallen.value)
/** 상대 기술 (강화상점 상대 기술 표시 개선, HP 바 아래). 2단계면 남은 PP까지 */
const CLS_LABEL = { physical: '물리', special: '특수', status: '변화' }
const foeMoves = computed(() => {
  const e = game.enemy
  if (!e || !game.foeMoveView) return []
  return (e.moves ?? []).flatMap((id) => {
    const m = moveData(id)
    if (!m) return []
    const max = maxPpOf(id)
    const pp = ppOf(e, id)
    return [{ m, max, pp, out: game.ppActive && pp === 0 }]
  })
})
</script>

<template>
  <div class="scene" :class="{ night, shake: !!bossIntro }">
    <!-- 좌상단: 자동 전투 -->
    <div class="controls">
      <button
        type="button"
        class="switch"
        :class="{ on: game.auto, locked: !game.autoUnlocked }"
        :disabled="!game.autoUnlocked"
        :title="game.autoUnlocked ? '자동 전투' : '1번도로 보스를 쓰러뜨리면 해금됩니다'"
        @click="game.setAuto(!game.auto)"
      >
        <span class="knob" />
        <span class="label">{{ game.autoUnlocked ? '자동' : '🔒 자동' }}</span>
      </button>
      <div v-if="game.autoUnlocked" class="mode-toggle" title="보스를 쓰러뜨린 뒤 다음 스테이지로 갈지, 현재 스테이지에서 일반 10마리 + 보스를 반복할지">
        <button
          type="button"
          :class="{ active: game.stageMode === 'advance' }"
          @click="game.setStageMode('advance')"
        >
          전진
        </button>
        <button
          type="button"
          :class="{ active: game.stageMode === 'repeat' }"
          @click="game.setStageMode('repeat')"
        >
          반복
        </button>
      </div>
    </div>

    <!-- 우상단: 스테이지 진행도 (일반 BOSS_DEFEATS 마리 처치 시 보스 등장) -->
    <div v-if="stage?.encounters && !game.faint" class="stage-box">
      <span v-if="cleared" class="clear">클리어</span>
      <span class="prog">{{ inBoss ? '보스전' : `보스까지 ${Math.min(progress.defeats, BOSS_DEFEATS)}/${BOSS_DEFEATS}` }}</span>
    </div>

    <!-- 상대 -->
    <template v-if="foe">
      <div class="box foe-box">
        <div class="line">
          <span v-if="foe.enemy.boss" class="boss-tag">BOSS</span>
          <span
            v-else
            class="caught-mark"
            :class="{ on: game.caught.includes(foe.enemy.species) }"
            :title="game.caught.includes(foe.enemy.species) ? '도감에 등록된 포켓몬' : '아직 잡지 않은 포켓몬'"
          />
          <strong>{{ foe.info?.name ?? foe.enemy.species }}</strong>
          <span v-if="foe.enemy.status" class="status" :style="{ background: STATUS_COLORS[foe.enemy.status] }">{{ STATUS_LABELS[foe.enemy.status] }}</span>
          <span class="lv">Lv.{{ foe.enemy.level }}</span>
        </div>
        <HpBar v-if="foe.info" :hp="foe.info.hp" :max="foe.info.max" :display="game.displayLevel('foeHp')" />
        <div v-if="game.foeMoveView && game.enemy" class="foe-moves">
          <span v-if="!foeMoves.length" class="foe-none">기술 없음 (발버둥)</span>
          <span
            v-for="f in foeMoves"
            :key="f.m.id"
            class="foe-move"
            :class="{ out: f.out }"
            :style="{ '--c': TYPE_COLORS[f.m.type] ?? '#666' }"
            :title="`${dexData?.types[f.m.type] ?? f.m.type} · ${CLS_LABEL[f.m.cls]} · 위력 ${f.m.power ?? '-'} · 명중 ${f.m.acc ?? '-'}`"
          >
            <span class="foe-name">{{ f.m.ko }}</span>
            <small v-if="game.foeMoveView >= 2 && f.max != null" class="foe-pp" :class="{ low: f.pp != null && f.pp <= f.max / 4 }">
              {{ f.pp }}/{{ f.max }}
            </small>
            <small v-else class="foe-meta">{{ f.m.power ?? '-' }}</small>
          </span>
        </div>
      </div>
      <div class="platform foe-pos" :class="{ 'boss-enter': !!bossIntro, fallen: foeFallen }">
        <PokeSprite :key="foe.enemy.species" :species="foe.enemy.species" :size="96" pose="foe" class="mon" />
        <span v-if="evYield && !foeFallen" class="ev-yield">노력치 {{ evYield }}</span>
      </div>
    </template>

    <!-- 내 포켓몬 -->
    <template v-if="mine">
      <div class="platform mine-pos" :class="{ dynamax: mine.dynamax, tera: !!mine.tera, mega: mine.mega }">
        <PokeSprite :key="mine.sprite" :species="mine.sprite" :size="120" pose="back" class="mon" />
      </div>
      <div class="box mine-box">
        <div class="line">
          <strong>{{ mine.info?.name ?? mine.member.species }}</strong>
          <span v-if="mine.dynamax" class="gimmick-tag dynamax">다이맥스</span>
          <span v-if="mine.tera" class="gimmick-tag tera">테라 {{ dexData?.types[mine.tera] ?? mine.tera }}</span>
          <span v-if="mine.member.status" class="status" :style="{ background: STATUS_COLORS[mine.member.status] }">{{ STATUS_LABELS[mine.member.status] }}</span>
          <span class="lv">Lv.{{ mine.member.level }}</span>
        </div>
        <HpBar v-if="mine.info" :hp="mine.info.hp" :max="mine.info.max" show-numbers />
        <div class="exp"><span :style="{ width: `${expRatio * 100}%` }" /></div>
        <div v-if="expText" class="exp-text">{{ expText }}</div>
      </div>
    </template>

    <!-- 우하단: 변함없는돌 (공용, 레벨업 진화 막기) · 회복 (배틀 포기 후 짧게 회복) -->
    <div v-if="mine" class="br">
      <label
        v-if="game.everstoneOwned"
        class="everstone"
        :class="{ on: game.everstone }"
        title="켜 두면 모든 포켓몬이 레벨업으로 진화하지 않습니다 (아이템 진화는 가능)"
      >
        <input type="checkbox" :checked="game.everstone" @change="game.setEverstone(($event.target as HTMLInputElement).checked)" />
        <ItemIcon id="everstone" :size="20" />
        변함없는돌
      </label>
      <button
        v-if="!game.faint && !game.travel"
        type="button"
        class="heal-btn"
        title="현재 배틀을 포기하고 5초 동안 회복한 뒤 돌아옵니다"
        @click="game.retreat()"
      >
        ✚ 회복
      </button>
    </div>

    <PokemonCenter v-if="game.faint" :faint="game.faint" />

    <!-- 보스 등장 연출 -->
    <div v-if="bossIntro" :key="bossIntro.key" class="boss-intro">
      <div class="flash" />
      <div class="band top"><span>⚠ BOSS BATTLE ⚠ BOSS BATTLE ⚠ BOSS BATTLE ⚠ BOSS BATTLE ⚠ BOSS BATTLE ⚠</span></div>
      <div class="title">
        <small>WARNING</small>
        <strong>보스 {{ bossIntro.name }}</strong>
        <span>Lv.{{ bossIntro.level }}</span>
      </div>
      <div class="band bottom"><span>⚠ BOSS BATTLE ⚠ BOSS BATTLE ⚠ BOSS BATTLE ⚠ BOSS BATTLE ⚠ BOSS BATTLE ⚠</span></div>
    </div>

    <!-- 상태 안내 -->
    <div v-if="travelTarget" class="notice">→ {{ travelTarget.id }} {{ ro(travelTarget.name) }} 이동 중… {{ travelLeft }}초</div>
    <div v-else-if="mine && (!foe || foeFallen) && !game.faint" class="notice">
      {{ stage?.encounters ? '야생 포켓몬을 찾는 중…' : '이 스테이지는 출현 정보가 준비 중입니다' }}
    </div>
    <!-- 좌하단: 최근 전투 평균 보상 · 현재 스테이지 -->
    <div class="bl">
      <div v-if="log.avgReward" class="avg" :title="`최근 ${log.avgReward.n}번 전투(쓰러뜨림·포획)에서 싸운 포켓몬이 얻은 경험치와 상금의 평균`">
        최근 {{ log.avgReward.n }}전 평균 · EXP {{ log.avgReward.exp.toLocaleString() }} · {{ log.avgReward.money.toLocaleString() }}원
      </div>
      <div class="where-row">
        <div v-if="stage && !travelTarget" class="where">{{ stage.id }} {{ stage.name }}</div>
        <div class="money" title="소지금">{{ game.money.toLocaleString() }}원</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status {
  padding: 0 5px;
  border-radius: 3px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.scene {
  position: relative;
  height: 100%;
  overflow: hidden;
  background:
    linear-gradient(to bottom, #8fcbe8 0%, #c4e6f2 45%, #9fd38a 45%, #7cbf68 100%);
}

/* 밤: 배경과 포켓몬만 어둡게 (정보 상자는 그대로) */
.scene.night {
  background: linear-gradient(to bottom, #1c2a4a 0%, #34466e 45%, #3d5e3a 45%, #2f4a2c 100%);
}

.platform {
  transition: filter 1s;
}

.scene.night .platform {
  filter: brightness(0.75);
}

/* 발판 */
.platform {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.platform::before {
  content: '';
  position: absolute;
  bottom: -10px;
  left: 50%;
  translate: -50% 0;
  border-radius: 50%;
  background: rgba(60, 110, 50, 0.55);
  box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.12);
}

.foe-pos {
  top: 22%;
  right: 8%;
  width: 150px;
}

.foe-pos::before {
  width: 150px;
  height: 34px;
}

.mine-pos {
  bottom: 9%;
  left: 4%;
  width: 180px;
}

.mine-pos::before {
  width: 180px;
  height: 40px;
}

.mon {
  position: relative;
}

/* 특수 기능 연출: 다이맥스 = 크고 붉은 빛, 테라스탈 = 결정 빛, 메가진화 = 무지개 빛 */
.mine-pos .mon {
  transition: transform 0.6s, filter 0.6s;
  transform-origin: 50% 100%;
}

.mine-pos.dynamax .mon {
  transform: scale(1.45);
  filter: drop-shadow(0 0 6px #ff3a5e) drop-shadow(0 0 14px rgba(255, 40, 90, 0.7));
}

.mine-pos.tera .mon {
  filter: drop-shadow(0 0 3px #e8ffff) drop-shadow(0 0 10px #5fe3e8) saturate(1.3) brightness(1.08);
}

.mine-pos.tera::after {
  content: '';
  position: absolute;
  bottom: 50px;
  left: 50%;
  width: 46px;
  height: 46px;
  translate: -50% 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(95, 227, 232, 0.6));
  clip-path: polygon(50% 0, 100% 35%, 80% 100%, 20% 100%, 0 35%);
  opacity: 0.35;
  pointer-events: none;
  animation: tera-shine 2.4s ease-in-out infinite;
}

@keyframes tera-shine {
  50% {
    opacity: 0.6;
    translate: -50% -6px;
  }
}

.mine-pos.mega .mon {
  animation: mega-glow 3s linear infinite;
}

@keyframes mega-glow {
  0% {
    filter: drop-shadow(0 0 6px #c58cff);
  }
  33% {
    filter: drop-shadow(0 0 6px #ff8ad8);
  }
  66% {
    filter: drop-shadow(0 0 6px #7ad7ff);
  }
  100% {
    filter: drop-shadow(0 0 6px #c58cff);
  }
}

.gimmick-tag {
  padding: 0 5px;
  border-radius: 3px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
}

.gimmick-tag.dynamax {
  background: #e0244c;
}

.gimmick-tag.tera {
  background: #2aa8b0;
}

/* 쓰러진 상대: 회색 + 살짝 가라앉은 상태로 정지 */
.foe-pos.fallen .mon {
  filter: grayscale(1) brightness(0.8);
  opacity: 0.7;
  transform: translateY(8px);
  transition: filter 0.3s, opacity 0.3s, transform 0.3s;
}

.foe-pos.fallen .mon :deep(.anim) {
  animation-play-state: paused;
}

/* 도트 이미지 아래쪽 여백만큼 내려서 발판 위에 서 있게 함 */
.foe-pos .mon {
  translate: 0 22px;
}

.mine-pos .mon {
  translate: 0 34px;
}

/* ---------- 보스 등장 연출 (총 2.4초) ---------- */
.scene.shake {
  animation: shake 0.45s 0.1s;
}

@keyframes shake {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(-6px, 3px); }
  40% { transform: translate(5px, -4px); }
  60% { transform: translate(-4px, 2px); }
  80% { transform: translate(3px, -2px); }
}

/* 연출 동안 보스는 화면 밖에 있다가 마지막에 미끄러져 들어옴 */
.foe-pos.boss-enter .mon {
  animation: boss-enter 0.6s 1.8s both cubic-bezier(0.2, 0.9, 0.3, 1.2);
}

@keyframes boss-enter {
  from { transform: translateX(260px); filter: brightness(0); }
  70% { filter: brightness(0); }
  to { transform: translateX(0); filter: brightness(1); }
}

.boss-intro {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  pointer-events: none;
  animation: intro-bg 2.4s forwards;
}

@keyframes intro-bg {
  0% { background: rgba(10, 0, 0, 0); }
  10%, 75% { background: rgba(10, 0, 0, 0.7); }
  100% { background: rgba(10, 0, 0, 0); }
}

.flash {
  position: absolute;
  inset: 0;
  background: #fff;
  animation: flash 0.5s forwards;
}

@keyframes flash {
  0%, 30% { opacity: 0.9; }
  100% { opacity: 0; }
}

.band {
  overflow: hidden;
  padding: 4px 0;
  background: repeating-linear-gradient(-45deg, #c62828 0 14px, #8e1b1b 14px 28px);
  border-block: 2px solid #1a0505;
  color: #ffe1e1;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 2px;
  white-space: nowrap;
  animation: band-in 2.4s forwards;
}

.band span {
  display: inline-block;
  animation: scroll 2.4s linear;
}

.band.bottom span {
  animation-direction: reverse;
}

@keyframes band-in {
  0% { transform: scaleY(0); }
  12%, 78% { transform: scaleY(1); }
  100% { transform: scaleY(0); }
}

@keyframes scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-35%); }
}

.title {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #fff;
  text-shadow: 0 2px 0 #5a0d0d, 0 0 12px rgba(255, 60, 60, 0.8);
  animation: title-in 2.4s forwards;
}

.title small {
  color: #ff8a80;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 6px;
  animation: blink 0.4s steps(2) infinite;
}

.title strong {
  font-size: 26px;
  font-weight: 900;
}

.title span {
  font-size: 14px;
  font-weight: 700;
}

@keyframes title-in {
  0%, 8% { opacity: 0; transform: scale(2.2); }
  20% { opacity: 1; transform: scale(1); }
  75% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.9); }
}

@keyframes blink {
  50% { opacity: 0.3; }
}

/* 회복 버튼 */
.br {
  position: absolute;
  right: 12px;
  bottom: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
}

.everstone {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px 2px 4px;
  border-radius: 6px;
  background: rgba(30, 30, 36, 0.75);
  color: #9a9aa6;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.everstone.on {
  color: #fff;
  box-shadow: inset 0 0 0 1px #ffcb05;
}

.everstone input {
  margin: 0;
}

.heal-btn {
  padding: 5px 12px;
  border: 2px solid #5a1f36;
  border-radius: 6px;
  background: #ff9ec4;
  color: #4a1029;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.heal-btn:active {
  transform: translateY(1px);
}

/* 상대 발판 아래: 노력치 보상 */
.ev-yield {
  position: absolute;
  top: calc(100% + 30px);
  left: 50%;
  translate: -50% 0;
  padding: 1px 8px;
  border-radius: 4px;
  background: rgba(30, 30, 36, 0.75);
  color: #e8d9a8;
  font-size: 11px;
  white-space: nowrap;
}

/* 정보 상자 */
.box {
  position: absolute;
  width: 46%;
  max-width: 210px;
  padding: 6px 10px 8px;
  border-radius: 8px;
  background: rgba(30, 30, 36, 0.88);
  color: #eee;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.foe-box {
  top: 52px;
  left: 12px;
}

/* 상대 기술: HP 바 아래 2열 */
.foe-moves {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  margin-top: 5px;
  font-size: 11px;
  line-height: 14px;
}

.foe-none {
  grid-column: 1 / -1;
  color: #8a8a96;
}

.foe-move {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  padding: 1px 4px;
  border-left: 3px solid var(--c);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  color: #ddd;
}

.foe-move.out {
  opacity: 0.5;
}

.foe-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.foe-meta,
.foe-pp {
  flex: none;
  color: #9a9aa6;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.foe-pp.low {
  color: #ff8a80;
}

.caught-mark {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border: 2px solid #8a8a96;
  border-radius: 50%;
}

.caught-mark.on {
  border-color: #fff;
  background: linear-gradient(#e33 50%, #fff 50%);
}

.boss-tag {
  padding: 0 4px;
  border-radius: 3px;
  background: #e04848;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
}

.exp {
  height: 3px;
  margin-top: 4px;
  border-radius: 2px;
  background: #3a3a44;
  overflow: hidden;
}

.exp-text {
  margin-top: 2px;
  color: #8fc9ff;
  font-size: 11px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.exp span {
  display: block;
  height: 100%;
  background: #4fb3ff;
  transition: width 0.4s;
}

/* 자동 전투 스위치 */
.controls {
  position: absolute;
  top: 10px;
  left: 12px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px 0 4px;
  border: 1px solid #3a3a44;
  border-radius: 15px;
  background: rgba(30, 30, 36, 0.88);
  color: #ccc;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.switch .knob {
  width: 36px;
  height: 22px;
  border-radius: 11px;
  background: #555;
  position: relative;
  transition: background 0.2s;
}

.switch .knob::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #eee;
  transition: left 0.2s;
}

.switch.on .knob {
  background: #3ddc6a;
}

.switch.on .knob::after {
  left: 17px;
}

.switch.on {
  color: #fff;
  font-weight: 700;
}

.switch.locked {
  cursor: not-allowed;
  opacity: 0.75;
}

.mode-toggle {
  display: flex;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(30, 30, 36, 0.75);
}

.mode-toggle button {
  padding: 3px 10px;
  border: none;
  background: transparent;
  color: #aaa;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.mode-toggle button.active {
  background: #3ddc6a;
  color: #10301a;
  font-weight: 700;
}

/* 스테이지 진행도 */
.stage-box {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.prog,
.clear {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(30, 30, 36, 0.75);
  color: #ddd;
  font-size: 11px;
}

.clear {
  background: #2f6b3f;
  color: #fff;
}

.mine-box {
  right: 12px;
  bottom: 18%;
}

.line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 14px;
}

.line strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lv {
  color: #c8c8d0;
  font-size: 12px;
}

.notice {
  position: absolute;
  top: 40%;
  left: 50%;
  translate: -50% -50%;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(30, 30, 36, 0.8);
  color: #eee;
  font-size: 13px;
  white-space: nowrap;
}

.bl {
  position: absolute;
  left: 12px;
  bottom: 8px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  pointer-events: none;
}

.avg {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(30, 30, 36, 0.6);
  color: #ffd76a;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  pointer-events: auto;
}

.where {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(30, 30, 36, 0.6);
  color: #ddd;
  font-size: 11px;
}

.where-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.money {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(30, 30, 36, 0.6);
  color: #ffcb05;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  pointer-events: auto;
}
</style>
