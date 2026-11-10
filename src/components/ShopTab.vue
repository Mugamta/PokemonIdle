<script setup lang="ts">
// 상점: 회복·몬스터볼·배틀용 도구·지닌 도구·기술머신·진화·육성 아이템 구매, 편의성 기능, 기술칸 추가, 아이템 판매
import { computed, onMounted, ref } from 'vue'
import { dexData, loadDex, loadLearnsets, TYPE_COLORS } from '../data/dex'
import { evoItemUsage } from '../data/evolutions'
import {
  AUTO_CENTER_PERK,
  BOSS_INTRO_PERK,
  DEX_REVEAL_PERK,
  END_HEAL_PERK,
  SLOT_HELD_PERK,
  AI_PERKS,
  CHAIN_PERKS,
  DISPLAY_PERKS,
  SPEED_PERKS,
  STAT_VIEW_PERKS,
  AUTO_HEAL_STEPS,
  AUTO_BALL_STEPS,
  NO_AUTO_BALLS,
  rankAutoBalls,
  ballSpentPerCatch,
  AUTO_ASH_STEPS,
  SACRED_ASH,
  isAutoReviveItem,
  type AutoReviveKey,
  CATEGORY_LABELS,
  EV_BREAK_PERK,
  EV_STAT_MAX,
  EV_TOTAL_MAX,
  evBreak2Price,
  evStatCap,
  EVERSTONE_ITEM,
  EVO_GROUP_LABELS,
  EVO_ITEMS,
  extraSlotPrice,
  gimmickItemOf,
  heldKindPrice,
  heldStackPrice,
  gimmickShopItems,
  PERKS,
  SHOP_ITEMS,
  TRAIN_GROUP_LABELS,
  TRAIN_ITEMS,
  BOTTLE_CAP_LEVEL,
  VITAMIN_EV,
  type AutoHealKey,
  type AutoUseKey,
  type ChainPerk,
  type EvoGroup,
  type TrainGroup,
  type ItemCategory,
  type Perk,
} from '../data/shop'
import { BALL_MAX_MULT, BALL_NOTES, EXP_SHARE_ITEM, FISHING_ROD_ITEM, HELD_GROUP_LABELS, HELD_ITEMS, isRecord, tmShopList, type HeldGroup } from '../data/items'
import ItemIcon from './ItemIcon.vue'
import QuickUseDialog from './QuickUseDialog.vue'
import ScrollTabs from './ScrollTabs.vue'
import HScroll from './HScroll.vue'
import ShopRow from './ShopRow.vue'
import { afterBuy } from './quickUse'
import {
  BASE_SLOTS_MAX,
  canLearnMachine,
  EXTRA_SLOTS,
  HELD_KINDS_MAX,
  HELD_STACK_MAX,
  heldKindsOf,
  heldStackOf,
  PARTY_MAX,
  PP_START_STAGE,
  SLOT_DEFEATS,
  useGameStore,
} from '../stores/game'
import { GIMMICK_INFO, TERA_SHARD_COST, teraShardType, Z_CRYSTALS, type Gimmick } from '../core/gimmicks'
import { regionOfGimmick } from '../data/stages'
import { isConsumableItem, josa } from '../core/battle'

type Sub = 'items' | 'ball' | 'battle' | 'held' | 'heldUse' | 'tm' | 'evo' | 'train' | 'gimmick' | 'growth' | 'judge' | 'perks' | 'slots' | 'heldSlots'
/** 하단 탭: 도구상점(item) / 강화상점(upgrade) */
const props = defineProps<{ kind: 'item' | 'upgrade'; wide?: boolean }>()
const SUB_LABELS: Record<Sub, string> = {
  items: '회복',
  ball: '볼',
  battle: '배틀',
  held: '지속형 도구',
  heldUse: '소모성 도구',
  tm: '기술머신',
  evo: '진화',
  train: '육성',
  gimmick: '특수 기능',
  growth: '육성 강화',
  judge: '판정 강화',
  perks: '편의성',
  slots: '기술칸',
  heldSlots: '도구칸',
}
/** 상단 탭: 비슷한 기능(Sub)을 묶은 것. 묶인 Sub의 분류는 아래 작은 탭으로 나옴 */
const GROUPS: { id: string; label: string; kind: 'item' | 'upgrade'; subs: Sub[] }[] = [
  { id: 'consumable', label: '소모품', kind: 'item', subs: ['items', 'ball', 'battle'] },
  { id: 'held', label: '지속형 도구', kind: 'item', subs: ['held'] },
  { id: 'heldUse', label: '소모성 도구', kind: 'item', subs: ['heldUse'] },
  { id: 'tm', label: '기술머신', kind: 'item', subs: ['tm'] },
  { id: 'evo', label: '진화·변신', kind: 'item', subs: ['evo', 'gimmick'] },
  { id: 'train', label: '육성', kind: 'item', subs: ['train'] },
  { id: 'growth', label: '육성 강화', kind: 'upgrade', subs: ['growth'] },
  { id: 'judge', label: '판정 강화', kind: 'upgrade', subs: ['judge'] },
  { id: 'perks', label: '편의성', kind: 'upgrade', subs: ['perks'] },
  { id: 'slots', label: '칸 추가', kind: 'upgrade', subs: ['slots', 'heldSlots'] },
]
const game = useGameStore()
onMounted(() => {
  loadDex().catch(() => {})
  loadLearnsets().catch(() => {})
})

/** 지닌 도구 분류 (작은 탭 이름) */
const HELD_MINI: { id: HeldGroup; label: string }[] = [
  { id: 'attack', label: '공격·속도' },
  { id: 'defense', label: '방어·회복' },
  { id: 'type', label: '타입 강화' },
  { id: 'gem', label: '주얼' },
  { id: 'berry', label: '나무열매' },
  { id: 'species', label: '전용 도구' },
  { id: 'bad', label: '불리한 효과' },
  { id: 'training', label: '경험치·돈' },
]
/** 지속형(false)·소모성(true) 지닌 도구 중 그 분류에 파는 도구가 있는 것만 */
function heldMini(use: boolean) {
  return HELD_MINI.filter((m) => HELD_ITEMS.some((i) => i.group === m.id && isConsumableItem(i.id) === use))
}
/** 상단 탭 아래의 작은 탭 (분류) */
const MINI: Partial<Record<Sub, { id: string; label: string }[]>> = {
  items: [
    { id: 'heal', label: '체력' },
    { id: 'revive', label: '기절' },
    { id: 'pp', label: 'PP' },
    { id: 'status', label: '상태이상' },
  ],
  held: heldMini(false),
  heldUse: heldMini(true),
  evo: [
    { id: 'stone', label: '진화의 돌' },
    { id: 'trade', label: '통신교환' },
    { id: 'etc', label: '기타' },
  ],
  train: [
    { id: 'ev', label: '노력치 ↑' },
    { id: 'evDown', label: '노력치 ↓' },
    { id: 'exp', label: '경험치' },
    { id: 'pp', label: 'PP' },
    { id: 'ability', label: '특성' },
    { id: 'iv', label: '개체값' },
    { id: 'nature', label: '민트' },
  ],
  perks: [
    { id: 'battle', label: '전투·탐색' },
    { id: 'autoUse', label: '자동 사용' },
    { id: 'info', label: '정보 표시' },
  ],
  gimmick: [
    { id: 'mega', label: '메가스톤' },
    { id: 'z', label: 'Z크리스탈' },
    { id: 'tera', label: '테라피스' },
  ],
}
type Entry = { key: string; sub: Sub; mini?: string; label: string }
/** Sub 하나를 작은 탭 항목들로 펼침 (분류가 있으면 분류마다, 없으면 Sub 자체) */
const entriesOf = (s: Sub): Entry[] =>
  MINI[s]?.map((m) => ({ key: `${s}:${m.id}`, sub: s, mini: m.id, label: m.label })) ?? [
    { key: s, sub: s, label: SUB_LABELS[s] },
  ]
// 특수 기능은 메가진화·Z기술·다이맥스·테라스탈 중 하나라도 해금한 뒤에 나옴
const groups = computed(() =>
  GROUPS.filter((g) => g.kind === props.kind)
    .map((g) => ({
      ...g,
      entries: g.subs.filter((s) => s !== 'gimmick' || game.anyGimmickUnlocked).flatMap(entriesOf),
    }))
    .filter((g) => g.entries.length > 0),
)
const group = ref(groups.value[0]!.id)
/** 상단 탭별로 선택한 작은 탭 (탭을 오가도 유지) */
const picked = ref<Record<string, string>>({})
const curGroup = computed(() => groups.value.find((g) => g.id === group.value) ?? groups.value[0]!)
const curEntry = computed(() => curGroup.value.entries.find((e) => e.key === picked.value[curGroup.value.id]) ?? curGroup.value.entries[0]!)
const miniTabs = computed(() => (curGroup.value.entries.length > 1 ? curGroup.value.entries : null))
const sub = computed(() => curEntry.value.sub)
const cur = computed(() => curEntry.value.mini)
const catItems = computed(() => SHOP_ITEMS.filter((i) => i.category === cur.value))
const balls = SHOP_ITEMS.filter((i) => i.category === 'ball')
const battleItems = SHOP_ITEMS.filter((i) => i.category === 'battle')

const HELD_GROUPS = Object.keys(HELD_GROUP_LABELS) as HeldGroup[]
const heldGroups = computed(() => {
  const use = sub.value === 'heldUse'
  return HELD_GROUPS.map((g) => ({ g, items: HELD_ITEMS.filter((i) => i.group === g && isConsumableItem(i.id) === use) }))
})

// 기술머신: 검색 + 파티가 배울 수 있는 것만
const tmQuery = ref('')
const tmOnlyLearnable = ref(true)
const TYPE_ORDER = Object.keys(TYPE_COLORS)
const tmRows = computed(() => {
  const dex = dexData.value
  if (!dex) return []
  const q = tmQuery.value.trim()
  return tmShopList()
    .map((t) => {
      const move = dex.movesById[t.move]!
      const learners = game.party
        .filter((m) => canLearnMachine(m, t.move))
        .map((m) => ({ name: dex.index.find((p) => p.id === m.species)?.ko ?? m.species, knows: (m.learned ?? m.moves).includes(t.move) }))
      return { ...t, info: move, learners, name: dex.items[t.id]?.ko ?? t.id }
    })
    .filter((r) => (!tmOnlyLearnable.value || r.learners.some((l) => !l.knows)) && (!q || r.info.ko.includes(q) || r.name.includes(q)))
    .sort((a, b) => TYPE_ORDER.indexOf(a.info.type) - TYPE_ORDER.indexOf(b.info.type) || a.info.ko.localeCompare(b.info.ko))
})
const CLS_LABEL = { physical: '물리', special: '특수', status: '변화' }

const EVO_GROUPS: EvoGroup[] = ['stone', 'trade', 'etc']
/** 도감에 등록된(잡은) 포켓몬: 진화 대상 강조·구매 경고 기준 */
const ownedSpecies = computed(() => new Set([...game.caught, ...game.party.map((m) => m.species)]))
/** 진화 아이템 구매: 도감에 쓸 수 있는 포켓몬이 없으면 확인 */
function buyEvoItem(id: string, name: string, usable: boolean) {
  if (!usable && !confirm(`도감에 ${name}(으)로 진화할 수 있는 포켓몬이 없습니다.
그래도 구매할까요?`)) return
  if (game.buyItem(id, 1)) afterBuy(id, 1)
}
const evoGroups = computed(() =>
  EVO_GROUPS.map((g) => ({
    g,
    items: EVO_ITEMS.filter((i) => i.group === g).map((def) => {
      const info = dexData.value?.items[def.id]
      const usage = evoItemUsage(def.id).map((u) => ({ ...u, owned: ownedSpecies.value.has(u.from) }))
      return { def, name: info?.ko ?? def.id, usage, usable: usage.some((u) => u.owned), note: def.note ?? '' }
    }),
  })),
)

const TRAIN_GROUPS = Object.keys(TRAIN_GROUP_LABELS) as TrainGroup[]
const trainGroups = computed(() => TRAIN_GROUPS.map((g) => ({ g, items: TRAIN_ITEMS.filter((i) => i.group === g) })))

const won = (n: number) => `${n.toLocaleString()}원`

// 특수 기능 아이템: 메가스톤(쓰는 포켓몬) · Z크리스탈(타입) · 테라피스(타입)
const gimmickCur = computed(() => cur.value as Gimmick)
const gimmickRows = computed(() => {
  const dex = dexData.value
  const g = gimmickCur.value
  if (!dex || sub.value !== 'gimmick') return []
  return gimmickShopItems(g).map((id) => {
    let users: { name: string; owned: boolean }[] = []
    let type: string | null = null
    if (g === 'mega')
      users = Object.values(dex.forms)
        .filter((f) => f.item === id)
        .map((f) => ({ name: f.ko, owned: ownedSpecies.value.has(f.base) }))
    else if (g === 'z') type = Z_CRYSTALS[id] ?? null
    else type = teraShardType(id)
    return { id, price: gimmickItemOf(id)!.price, users, type }
  })
})

/** 편의성 탭에 나오는 차례 구매 기능, 작은 탭별 (노력치 한계 돌파는 육성 강화 탭) */
const CHAIN_BY_MINI: Record<string, ChainPerk[]> = {
  battle: [...AI_PERKS, ...SPEED_PERKS],
  info: [...DISPLAY_PERKS, ...STAT_VIEW_PERKS],
}
const perkList = computed(() => CHAIN_BY_MINI[cur.value ?? ''] ?? [])
/** 자동 사용 탭에 나오는 아이템 편의성 */
const itemPerks = computed(() => (cur.value === 'autoUse' ? PERKS : []))
/** 노력치 한계 돌파 2 다음 구매 정보 */
const evBreak2 = computed(() => ({
  price: evBreak2Price(game.evBreaks + 1),
  cur: evStatCap(game.evBreaks),
  next: evStatCap(game.evBreaks + 1),
}))

const autoKeyOf = (p: Perk) => p.id.split(':')[1] as AutoUseKey
/** 기절 회복 자동 사용 설정이 있는 기능이면 그 키 */
const reviveKeyOf = (p: Perk): AutoReviveKey | null =>
  p.id === 'autoUse:revive' ? 'revive' : p.id === 'autoUse:reviveAfter' ? 'reviveAfter' : null
const reviveItems = SHOP_ITEMS.filter((i) => isAutoReviveItem(i.id))
/** 체력 자동 회복 기준 설정이 있는 기능이면 그 키 */
const healKeyOf = (p: Perk): AutoHealKey | null =>
  p.id === 'autoUse:heal' ? 'heal' : p.id === 'autoUse:healAfter' ? 'healAfter' : null
const itemName = (id: string) => dexData.value?.items[id]?.ko ?? id
/** 몬스터볼 자동 사용 후보 표시 개수 (전투 중) */
const AUTO_BALL_SHOWN = 5
/** 몬스터볼 자동 사용: 지금 상대 기준 후보 (쓸 순서대로). 야생 포켓몬과 싸우는 중이 아니면 null */
const autoBallNow = computed(() => {
  const opts = game.autoBallOptions()
  return opts && rankAutoBalls(opts, game.autoBall)
})
/** 몬스터볼 자동 사용: 고른 배율을 낼 수 있는 볼 (전투 밖 표시용) */
const autoBallStatic = computed(() =>
  SHOP_ITEMS.filter((i) => i.category === 'ball' && !NO_AUTO_BALLS.includes(i.id) && (BALL_MAX_MULT[i.id] ?? 1) >= game.autoBall),
)
const multText = (m: number) => (Number.isFinite(m) ? `${Math.round(m * 100) / 100}배` : '확정')


/** 파티 슬롯 도구 조건: 도구 종류·같은 도구 개수를 모두 최대로 늘린 파티 포켓몬 수 */
const slotHeldProgress = computed(
  () => game.party.filter((m) => heldKindsOf(m) >= HELD_KINDS_MAX && heldStackOf(m) >= HELD_STACK_MAX).length,
)
/** 지닌 도구 칸: 포켓몬별 도구 종류 수·같은 도구 개수 늘리기 */
const heldSlotRows = computed(() =>
  game.party.map((m, i) => {
    const kinds = heldKindsOf(m)
    const stack = heldStackOf(m)
    return {
      i,
      name: dexData.value?.index.find((p) => p.id === m.species)?.ko ?? m.species,
      level: m.level,
      kinds,
      stack,
      kindsMaxed: kinds >= HELD_KINDS_MAX,
      stackMaxed: stack >= HELD_STACK_MAX,
      kindPrice: heldKindPrice((m.heldKinds ?? 0) + 1),
      stackPrice: heldStackPrice((m.heldStack ?? 0) + 1),
    }
  }),
)

/** 기술칸 추가: 기본 4칸을 모두 연 포켓몬만 */
const slotRows = computed(() =>
  game.party.map((m, i) => {
    const name = dexData.value?.index.find((p) => p.id === m.species)?.ko ?? m.species
    const extra = m.extraSlots ?? 0
    const baseDone = game.baseSlots >= BASE_SLOTS_MAX
    return {
      i,
      name,
      level: m.level,
      slots: game.slotsOf(m),
      maxed: extra >= EXTRA_SLOTS,
      baseDone,
      price: extraSlotPrice(extra + 1),
      need: SLOT_DEFEATS[SLOT_DEFEATS.length - 1]!,
      defeats: game.totalDefeats,
    }
  }),
)
</script>

<template>
  <div class="shop">
    <QuickUseDialog />
    <div class="tabs-head">
      <HScroll class="sub-tabs" :active="curGroup.id">
        <button v-for="g in groups" :key="g.id" type="button" :class="{ active: curGroup.id === g.id }" @click="group = g.id">
          {{ g.label }}
        </button>
      </HScroll>
      <!-- 상단 탭 안의 작은 탭 (분류) -->
      <ScrollTabs v-if="miniTabs" :items="miniTabs" :model-value="curEntry.key" @update:model-value="picked[curGroup.id] = $event" />
    </div>

    <!-- 넓게보기에서는 전투 화면(소지금 표시)이 가려지므로 여기서 보여 줌 -->
    <div v-if="wide" class="wallet">
      <span>소지금</span>
      <strong>{{ won(game.money) }}</strong>
    </div>

    <p v-if="!dexData" class="msg">불러오는 중…</p>

    <!-- 회복 아이템 -->
    <template v-else-if="sub === 'items'">
      <section class="card">
        <h4 class="sec">{{ CATEGORY_LABELS[cur as ItemCategory] }}</h4>
        <ul class="rows">
          <ShopRow v-for="it in catItems" :key="it.id" :id="it.id" :price="it.price" />
        </ul>
      </section>
      <p class="note">
        PP는 {{ PP_START_STAGE }} 스테이지를 클리어한 뒤부터 줄어듭니다. 포켓몬센터에서 회복하면 HP·PP·상태이상이 모두 회복됩니다.
        기절 회복 아이템은 싸울 수 있는 포켓몬이 남아 있을 때 기절한 파티 포켓몬에게 씁니다. 나무열매는 지니게 할 수도 있습니다.
      </p>
    </template>

    <!-- 몬스터볼 -->
    <template v-else-if="sub === 'ball'">
      <section class="card">
        <ul class="rows">
          <ShopRow v-for="it in balls" :key="it.id" :id="it.id" :price="it.price" :note="BALL_NOTES[it.id] ?? ''" />
        </ul>
      </section>
      <p class="note">
        도구 탭 → 사용에서 야생 포켓몬에게 던집니다 (한 턴 소모). 보스는 잡을 수 없습니다. HP가 적을수록, 잠듦·얼음(2.5배)이나
        마비·독·화상(1.5배) 상태일수록 잘 잡힙니다. 잡은 포켓몬은 도감에 기록되고, 파티(최대 6마리)에 자리가 있으면 파티에 들어갑니다.
      </p>
    </template>

    <!-- 배틀용 도구 -->
    <template v-else-if="sub === 'battle'">
      <section class="card">
        <ul class="rows">
          <ShopRow v-for="it in battleItems" :key="it.id" :id="it.id" :price="it.price" />
        </ul>
      </section>
      <p class="note">전투 중 싸우는 포켓몬에게 쓰며 한 턴을 소모합니다. 능력 변화는 전투가 끝나거나 교체하면 사라집니다.</p>
    </template>

    <!-- 지닌 도구 -->
    <template v-else-if="sub === 'held' || sub === 'heldUse'">
      <section v-for="g in heldGroups.filter((x) => x.g === cur)" :key="g.g" class="card">
        <h4 class="sec">{{ HELD_GROUP_LABELS[g.g] }}</h4>
        <ul class="rows">
          <ShopRow v-for="it in g.items" :key="it.id" :id="it.id" :price="it.price" />
        </ul>
      </section>
      <p class="note">
        도구 탭 → 지닌 도구에서 파티 포켓몬에게 지니게 합니다.
        <template v-if="sub === 'heldUse'">
          열매·주얼·기합의띠처럼 한 번 쓰면 사라지는 도구로, 다음 전투가 시작될 때 가방에 같은 도구가 있으면 자동으로 다시 지닙니다.
        </template>
        <template v-else>지니고 있는 동안 효과가 계속되며 써도 사라지지 않습니다.</template>
        날씨·필드·교체에 관련된 도구는 이 게임에서 효과가 없어 팔지 않습니다.
      </p>
    </template>

    <!-- 기술머신 -->
    <template v-else-if="sub === 'tm'">
      <section class="card">
        <div class="tm-filter">
          <input v-model="tmQuery" class="search" type="search" placeholder="기술 이름 검색" />
          <label class="toggle"><input v-model="tmOnlyLearnable" type="checkbox" /> 파티가 새로 배울 수 있는 것만</label>
        </div>
        <p v-if="!tmRows.length" class="msg">조건에 맞는 기술머신이 없습니다.</p>
        <ul v-else class="rows">
          <ShopRow v-for="r in tmRows" :key="r.id" :id="r.id" :price="r.price" :multi="isRecord(r.id)" :label="`${r.info.ko} (${r.name})`">
            <p class="desc item">
              <span class="type" :style="{ background: TYPE_COLORS[r.info.type] }">{{ dexData.types[r.info.type] }}</span>
              {{ CLS_LABEL[r.info.cls] }} · 위력 {{ r.info.power ?? '-' }} · 명중 {{ r.info.acc ?? '-' }} · PP {{ r.info.pp ?? '-' }}
            </p>
            <p v-if="r.learners.length" class="desc item">
              <span class="evo-label">배움</span>
              <template v-for="(l, k) in r.learners" :key="k">
                <span :class="{ owned: !l.knows }">{{ l.name }}</span><template v-if="l.knows"> (이미 배움)</template><template v-if="k < r.learners.length - 1">, </template>
              </template>
            </p>
          </ShopRow>
        </ul>
      </section>
      <p class="note">
        도구 탭 → 기술머신에서 가르칩니다. 기술머신은 한 번 사면 몇 번이든 쓸 수 있고, 기술레코드는 쓰면 사라집니다.
      </p>
    </template>
    <!-- 특수 기능 (메가스톤·Z크리스탈·테라피스) -->
    <template v-else-if="sub === 'gimmick'">
      <section class="card">
        <p v-if="!game.gimmickUnlocked(gimmickCur)" class="msg">
          🔒 {{ josa(GIMMICK_INFO[gimmickCur].label, '은', '는') }} {{ regionOfGimmick(gimmickCur)?.title }}에 들어가면 해금됩니다.
        </p>
        <ul v-else class="rows">
          <ShopRow v-for="r in gimmickRows" :key="r.id" :id="r.id" :price="r.price" :multi="gimmickCur === 'tera'">
            <p v-if="r.users.length" class="desc item">
              <span class="evo-label">메가진화</span>
              <template v-for="(u, k) in r.users" :key="k">
                <span :class="{ owned: u.owned }">{{ u.name }}</span><template v-if="k < r.users.length - 1">, </template>
              </template>
            </p>
            <p v-else-if="r.type" class="desc item">
              <span class="type" :style="{ background: TYPE_COLORS[r.type] }">{{ dexData.types[r.type] }}</span>
            </p>
          </ShopRow>
        </ul>
      </section>
      <p class="note">
        {{ GIMMICK_INFO[gimmickCur].desc }}
        <template v-if="gimmickCur === 'mega'">메가스톤은 도구 탭 → 지닌 도구에서 지니게 합니다. 쓰는 포켓몬 이름이 밝게 표시되면 도감에 있는 포켓몬입니다.</template>
        <template v-else-if="gimmickCur === 'z'">Z크리스탈을 지니게 한 뒤 전투 화면의 Z기술 버튼을 누르고 같은 타입 공격기를 고릅니다. (전용 Z크리스탈은 팔지 않습니다)</template>
        <template v-else>테라피스 {{ TERA_SHARD_COST }}개로 도구 탭 → 테라스탈에서 그 타입으로 테라스탈 타입을 바꿉니다.</template>
        다이맥스는 아이템 없이 쓸 수 있습니다. 특수 기능은 한 전투에 네 가지 중 하나를 한 번만 쓸 수 있습니다.
      </p>
    </template>

    <!-- 육성 강화 (학습장치·노력치 한계 돌파) -->
    <template v-else-if="sub === 'growth'">
      <section class="card">
        <ul class="rows">
          <li>
            <div class="main">
              <ItemIcon :id="EXP_SHARE_ITEM.id" />
              <span class="grow"><strong>{{ itemName(EXP_SHARE_ITEM.id) }}</strong></span>
              <label v-if="game.expShareOwned" class="toggle">
                <input type="checkbox" :checked="game.expShare" @change="game.setExpShare(($event.target as HTMLInputElement).checked)" />
                켜기
              </label>
              <template v-else>
                <span class="price">{{ won(EXP_SHARE_ITEM.price) }}</span>
                <button type="button" class="buy" :disabled="game.money < EXP_SHARE_ITEM.price" @click="game.buyExpShare()">구매</button>
              </template>
            </div>
            <p class="desc item">
              한 번 사면 켜고 끌 수 있는 공용 기능입니다. 켜 두면 싸우지 않은 파티 포켓몬(기절 제외)도 경험치의 절반과 노력치를 얻습니다.
            </p>
          </li>
        </ul>
      </section>
      <section class="card">
        <h4 class="sec">노력치 한계 돌파</h4>
        <ul class="rows">
          <li>
            <div class="main">
              <span class="grow"><strong>{{ EV_BREAK_PERK.label }}</strong></span>
              <span v-if="game.hasPerk(EV_BREAK_PERK.id)" class="owned">구매함</span>
              <template v-else>
                <span class="price">{{ won(EV_BREAK_PERK.price) }}</span>
                <button
                  type="button"
                  class="buy"
                  :disabled="game.money < EV_BREAK_PERK.price"
                  @click="game.buyPerk(EV_BREAK_PERK.id)"
                >
                  구매
                </button>
              </template>
            </div>
            <p class="desc">{{ EV_BREAK_PERK.desc }}</p>
          </li>
          <li>
            <div class="main">
              <span class="grow">
                <strong>노력치 한계 돌파 2</strong>
                <span class="muted">구매 {{ game.evBreaks }}회 · 능력치 하나 {{ evBreak2.cur }}까지</span>
              </span>
              <span class="price">{{ won(evBreak2.price) }}</span>
              <button
                type="button"
                class="buy"
                :disabled="game.money < evBreak2.price || !game.hasPerk(EV_BREAK_PERK.id)"
                @click="game.buyEvBreak2()"
              >
                구매
              </button>
            </div>
            <p class="desc">
              구매할 때마다 모든 노력치의 한계가 {{ EV_STAT_MAX }}의 2배, 3배, …로 늘어납니다. ({{ EV_STAT_MAX }} → {{ EV_STAT_MAX * 2 }} →
              {{ EV_STAT_MAX * 3 }} …) 다음 구매: {{ evBreak2.cur }} → {{ evBreak2.next }}
            </p>
            <p v-if="!game.hasPerk(EV_BREAK_PERK.id)" class="desc">{{ EV_BREAK_PERK.label }}을 먼저 구매해야 합니다.</p>
          </li>
        </ul>
      </section>
    </template>
    <!-- 판정 강화 -->
    <section v-else-if="sub === 'judge'" class="card">
      <ul class="rows">
        <li>
          <div class="main">
            <span class="grow"><strong>{{ END_HEAL_PERK.label }}</strong></span>
            <span v-if="game.hasPerk(END_HEAL_PERK.id)" class="owned">구매함</span>
            <template v-else>
              <span class="price">{{ won(END_HEAL_PERK.price) }}</span>
              <button type="button" class="buy" :disabled="game.money < END_HEAL_PERK.price" @click="game.buyPerk(END_HEAL_PERK.id)">
                구매
              </button>
            </template>
          </div>
          <p class="desc">{{ END_HEAL_PERK.desc }}</p>
        </li>
      </ul>
    </section>
    <!-- 육성 아이템 -->
    <template v-else-if="sub === 'train'">
      <section v-for="g in trainGroups.filter((x) => x.g === cur)" :key="g.g" class="card">
        <h4 class="sec">{{ TRAIN_GROUP_LABELS[g.g] }}</h4>
        <ul class="rows">
          <ShopRow v-for="it in g.items" :key="it.id" :id="it.id" :price="it.price" />
        </ul>
      </section>
      <p class="note">
        육성 아이템은 도구 탭 → 육성에서 파티 포켓몬을 골라 사용하며, 턴을 소모하지 않습니다. 영양제는 1개에 노력치
        {{ VITAMIN_EV }}, 깃털은 1, 열매는 {{ VITAMIN_EV }}씩 내립니다 (능력치 하나 {{ game.evStatCap }}<template v-if="Number.isFinite(game.evTotalCap)">, 합계 {{ EV_TOTAL_MAX }}</template>까지). 병뚜껑은 레벨
        {{ BOTTLE_CAP_LEVEL }} 이상인 포켓몬에게만 쓸 수 있습니다. 하트비늘은 전투 탭 → 기술에서 잊은 기술을 되살릴 때 1개씩 씁니다.
      </p>
    </template>

    <!-- 진화 아이템 -->
    <template v-else-if="sub === 'evo'">
      <section v-if="cur === 'etc'" class="card">
        <ul class="rows">
          <li>
            <div class="main">
              <ItemIcon :id="EVERSTONE_ITEM.id" />
              <span class="grow"><strong>{{ itemName(EVERSTONE_ITEM.id) }}</strong></span>
              <label v-if="game.everstoneOwned" class="toggle">
                <input
                  type="checkbox"
                  :checked="game.everstone"
                  @change="game.setEverstone(($event.target as HTMLInputElement).checked)"
                />
                켜기
              </label>
              <template v-else>
                <span class="price">{{ won(EVERSTONE_ITEM.price) }}</span>
                <button type="button" class="buy" :disabled="game.money < EVERSTONE_ITEM.price" @click="game.buyEverstone()">
                  구매
                </button>
              </template>
            </div>
            <p class="desc item">
              한 번 사면 모든 포켓몬에게 공용으로 적용됩니다. 전투 화면 오른쪽 아래에서 켜고 끌 수 있으며, 켜 두면 레벨업으로
              진화하지 않습니다. (아이템 진화는 가능)
            </p>
          </li>
        </ul>
      </section>
      <section v-for="eg in evoGroups.filter((x) => x.g === cur)" :key="eg.g" class="card">
        <h4 class="sec">{{ EVO_GROUP_LABELS[eg.g] }}</h4>
        <ul class="rows">
          <li v-for="it in eg.items" :key="it.def.id">
            <div class="main">
              <ItemIcon :id="it.def.id" />
              <span class="grow">
                {{ it.name }}
                <span class="muted">보유 {{ game.items[it.def.id] ?? 0 }}</span>
              </span>
              <span class="price">{{ won(it.def.price) }}</span>
              <button
                type="button"
                class="buy"
                :disabled="game.money < it.def.price"
                @click="buyEvoItem(it.def.id, it.name, it.usable)"
              >
                구매
              </button>
            </div>
            <p class="desc item">
              <span class="evo-label">진화</span>
              <template v-for="(u, k) in it.usage" :key="k">
                <span :class="{ owned: u.owned }">{{ u.fromName }}</span> → {{ u.toName }}<template v-if="u.extra"> ({{ u.extra }})</template><template v-if="k < it.usage.length - 1">, </template>
              </template>
            </p>
            <p v-if="it.note" class="desc item">{{ it.note }}</p>
          </li>
        </ul>
      </section>
      <p class="note">진화 아이템은 도구 탭 → 진화에서 사용합니다.</p>
    </template>

    <!-- 편의성 -->
    <section v-else-if="sub === 'perks'" class="card">
      <ul class="rows">
        <li v-if="cur === 'battle'">
          <div class="main">
            <ItemIcon :id="FISHING_ROD_ITEM.id" />
            <span class="grow"><strong>{{ itemName(FISHING_ROD_ITEM.id) }}</strong></span>
            <span v-if="game.rodOwned" class="owned">구매함</span>
            <template v-else>
              <span class="price">{{ won(FISHING_ROD_ITEM.price) }}</span>
              <button type="button" class="buy" :disabled="game.money < FISHING_ROD_ITEM.price" @click="game.buyRod()">구매</button>
            </template>
          </div>
          <p class="desc item">
            수상 스테이지(파도타기·낚시 출현)는 파도타기를 아는 파티 포켓몬이 있거나 낚싯대가 있어야 들어갈 수 있습니다. 한 번 사면 계속 쓸 수 있습니다.
          </p>
        </li>
        <li v-for="p in perkList" :key="p.id">
          <div class="main">
            <span class="grow"><strong>{{ p.label }}</strong></span>
            <span v-if="game.hasPerk(p.id)" class="owned">구매함</span>
            <template v-else>
              <span class="price">{{ won(p.price) }}</span>
              <button
                type="button"
                class="buy"
                :disabled="game.money < p.price || (!!p.requires && !game.hasPerk(p.requires))"
                @click="game.buyPerk(p.id)"
              >
                구매
              </button>
            </template>
          </div>
          <p class="desc">{{ p.desc }}</p>
          <p v-if="p.requires && !game.hasPerk(p.requires) && !game.hasPerk(p.id)" class="desc">
            {{ CHAIN_PERKS.find((x) => x.id === p.requires)?.label }}을 먼저 구매해야 합니다.
          </p>
        </li>
        <li v-if="cur === 'battle'">
          <div class="main">
            <span class="grow"><strong>{{ BOSS_INTRO_PERK.label }}</strong></span>
            <label v-if="game.hasPerk(BOSS_INTRO_PERK.id)" class="toggle">
              <input v-model="game.skipBossIntro" type="checkbox" />
              켜기
            </label>
            <template v-else>
              <span class="price">{{ won(BOSS_INTRO_PERK.price) }}</span>
              <button type="button" class="buy" :disabled="game.money < BOSS_INTRO_PERK.price" @click="game.buyPerk(BOSS_INTRO_PERK.id)">
                구매
              </button>
            </template>
          </div>
          <p class="desc">{{ BOSS_INTRO_PERK.desc }}</p>
        </li>
        <li v-if="cur === 'battle'">
          <div class="main">
            <span class="grow"><strong>{{ AUTO_CENTER_PERK.label }}</strong></span>
            <label v-if="game.hasPerk(AUTO_CENTER_PERK.id)" class="toggle">
              <input v-model="game.autoCenter" type="checkbox" />
              켜기
            </label>
            <template v-else>
              <span class="price">{{ won(AUTO_CENTER_PERK.price) }}</span>
              <button type="button" class="buy" :disabled="game.money < AUTO_CENTER_PERK.price" @click="game.buyPerk(AUTO_CENTER_PERK.id)">
                구매
              </button>
            </template>
          </div>
          <p class="desc">{{ AUTO_CENTER_PERK.desc }}</p>
          <div v-if="game.hasPerk(AUTO_CENTER_PERK.id)" class="opt">
            PP가 바닥나면
            <select v-model="game.autoCenterPriority">
              <option value="item">PP 회복 아이템 우선</option>
              <option value="center">센터 귀환 우선</option>
            </select>
          </div>
          <p v-if="game.hasPerk(AUTO_CENTER_PERK.id) && game.autoCenterPriority === 'item'" class="desc">
            PP 회복 아이템 자동 사용이 켜져 있고 쓸 수 있는 PP 회복 아이템이 있으면 아이템을 쓰고, 없을 때만 센터에 다녀옵니다.
          </p>
        </li>
        <li v-if="cur === 'info'">
          <div class="main">
            <span class="grow"><strong>{{ DEX_REVEAL_PERK.label }}</strong></span>
            <span v-if="game.hasPerk(DEX_REVEAL_PERK.id)" class="owned">구매함</span>
            <template v-else>
              <span class="price">{{ won(DEX_REVEAL_PERK.price) }}</span>
              <button type="button" class="buy" :disabled="game.money < DEX_REVEAL_PERK.price" @click="game.buyPerk(DEX_REVEAL_PERK.id)">
                구매
              </button>
            </template>
          </div>
          <p class="desc">{{ DEX_REVEAL_PERK.desc }}</p>
        </li>
        <li v-for="p in itemPerks" :key="p.id">
          <div class="main">
            <span class="grow"><strong>{{ p.label }}</strong></span>
            <template v-if="game.hasPerk(p.id)">
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="!!game.autoUse[autoKeyOf(p)]"
                  @change="game.setAutoUse(autoKeyOf(p), ($event.target as HTMLInputElement).checked)"
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
          <div v-if="game.hasPerk(p.id) && p.id === 'autoUse:ball'" class="opt">
            보정 배율
            <select :value="game.autoBall" @change="game.setAutoBall(Number(($event.target as HTMLSelectElement).value))">
              <option v-for="t in AUTO_BALL_STEPS" :key="t" :value="t">{{ t === 1 ? '제한 없음' : `${t}배 이상` }}</option>
            </select>
            인 볼 중 가성비 좋은 볼 사용
          </div>
          <template v-if="game.hasPerk(p.id) && p.id === 'autoUse:ball'">
            <template v-if="autoBallNow">
              <p class="desc">
                지금 상대 기준 후보{{ game.caught.includes(game.enemy!.species) ? ' (도감에 있어 던지지 않음)' : '' }}
                <template v-if="autoBallNow.length && autoBallNow[0]!.mult < game.autoBall"> · 기준에 닿는 볼이 없어 배율 순</template>
              </p>
              <p v-if="!autoBallNow.length" class="desc">가진 볼도 없고 살 돈도 없습니다.</p>
              <ol v-else class="ball-cands">
                <li v-for="(o, n) in autoBallNow.slice(0, AUTO_BALL_SHOWN)" :key="o.id" :class="{ pick: n === 0 }">
                  <ItemIcon :id="o.id" :size="20" />
                  <span class="grow">{{ itemName(o.id) }}<small v-if="o.owned" class="muted"> ×{{ o.owned }}</small></span>
                  <span class="muted">{{ multText(o.mult) }} · {{ Math.round(o.chance * 1000) / 10 }}%</span>
                  <span class="price">{{ o.owned ? '가진 것' : `마리당 ${won(Math.round(ballSpentPerCatch(o)))}` }}</span>
                </li>
              </ol>
            </template>
            <p v-else-if="game.autoBall === 1" class="desc">후보: 모든 볼 (상대를 만나면 한 마리 잡는 데 드는 돈이 가장 적은 볼)</p>
            <ol v-else class="ball-cands">
              <li v-for="it in autoBallStatic" :key="it.id">
                <ItemIcon :id="it.id" :size="20" />
                <span class="grow">{{ itemName(it.id) }}<small v-if="game.items[it.id]" class="muted"> ×{{ game.items[it.id] }}</small></span>
                <span class="muted">{{ BALL_NOTES[it.id] }}</span>
                <span class="price">{{ won(it.price) }}</span>
              </li>
            </ol>
          </template>
          <div v-if="game.hasPerk(p.id) && healKeyOf(p)" class="opt">
            HP가
            <select
              :value="game.autoHeal[healKeyOf(p)!].start"
              @change="game.setAutoHeal(healKeyOf(p)!, 'start', Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="t in AUTO_HEAL_STEPS" :key="t" :value="t">{{ t }}%</option>
            </select>
            아래로 떨어지면
            <select
              :value="game.autoHeal[healKeyOf(p)!].target"
              @change="game.setAutoHeal(healKeyOf(p)!, 'target', Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="t in AUTO_HEAL_STEPS.filter((t) => t >= game.autoHeal[healKeyOf(p)!].start)" :key="t" :value="t">
                {{ t }}%
              </option>
            </select>
            까지 회복
          </div>
          <template v-if="game.hasPerk(p.id) && reviveKeyOf(p)">
            <div class="opt">
              가방에 없으면 살 아이템
              <select
                :value="game.autoRevive[reviveKeyOf(p)!].item"
                @change="game.setAutoRevive(reviveKeyOf(p)!, { item: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="it in reviveItems" :key="it.id" :value="it.id">{{ itemName(it.id) }} ({{ won(it.price) }})</option>
              </select>
            </div>
            <div class="opt">
              {{ itemName(SACRED_ASH) }}
              <select
                :value="game.autoRevive[reviveKeyOf(p)!].ashAt"
                @change="game.setAutoRevive(reviveKeyOf(p)!, { ashAt: Number(($event.target as HTMLSelectElement).value) })"
              >
                <option v-for="n in AUTO_ASH_STEPS" :key="n" :value="n">{{ n ? `기절 ${n}마리 이상이면 사용·구매` : '쓰지 않음' }}</option>
              </select>
            </div>
          </template>
        </li>
      </ul>
    </section>

    <!-- 기술칸 -->
    <section v-else-if="sub === 'slots'" class="card">
      <p class="desc top">
        계정 전체에서 {{ SLOT_DEFEATS.join('·') }}마리를 쓰러뜨리면 모든 포켓몬의 기본 기술칸이 늘어납니다.
        기본 4칸이 모두 열리면 포켓몬별로 상점에서 최대 {{ EXTRA_SLOTS }}칸을 더 열 수 있습니다 (도감으로 보내도 기록에 남음).
      </p>
      <p v-if="!slotRows.length" class="msg">파티에 포켓몬이 없습니다.</p>
      <ul v-else class="rows">
        <li v-for="r in slotRows" :key="r.i">
          <div class="main">
            <span class="grow">
              {{ r.name }} <small class="muted">Lv.{{ r.level }} · {{ r.slots }}칸</small>
            </span>
            <span v-if="r.maxed" class="muted">모두 열림</span>
            <span v-else-if="!r.baseDone" class="muted">계정 격파 {{ r.defeats }}/{{ r.need }}</span>
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

    <section v-else-if="sub === 'heldSlots'" class="card">
      <p class="desc top">
        포켓몬별로 지닐 수 있는 도구를 늘립니다 (도감으로 보내도 기록에 남음).
        서로 다른 도구는 기본 1종류에서 최대 {{ HELD_KINDS_MAX }}종류, 같은 도구는 기본 1개에서 최대 {{ HELD_STACK_MAX }}개까지 지닐 수 있습니다.
      </p>
      <p class="desc">
        같은 도구를 여러 개 지니면 효과가 합산됩니다: 배율은 더해지고(구애머리띠 2개 = 1.5배 → 2배, 생명의구슬 2개 = 1.3배 → 1.6배),
        회복량·확률·급소 랭크는 개수만큼 늘어나며, 열매·주얼처럼 쓰면 사라지는 도구는 개수만큼 여러 번 발동합니다.
        서로 다른 도구의 효과는 각각 곱해집니다.
      </p>
      <p v-if="!heldSlotRows.length" class="msg">파티에 포켓몬이 없습니다.</p>
      <ul v-else class="rows">
        <li v-for="r in heldSlotRows" :key="r.i">
          <div class="main">
            <span class="grow">
              {{ r.name }} <small class="muted">Lv.{{ r.level }}</small>
            </span>
          </div>
          <div class="main">
            <span class="grow">도구 종류 <small class="muted">{{ r.kinds }}/{{ HELD_KINDS_MAX }}종류</small></span>
            <span v-if="r.kindsMaxed" class="muted">최대</span>
            <template v-else>
              <span class="price">{{ won(r.kindPrice) }}</span>
              <button type="button" class="buy" :disabled="game.money < r.kindPrice" @click="game.buyHeldKind(r.i)">종류 +1</button>
            </template>
          </div>
          <div class="main">
            <span class="grow">같은 도구 개수 <small class="muted">{{ r.stack }}/{{ HELD_STACK_MAX }}개</small></span>
            <span v-if="r.stackMaxed" class="muted">최대</span>
            <template v-else>
              <span class="price">{{ won(r.stackPrice) }}</span>
              <button type="button" class="buy" :disabled="game.money < r.stackPrice" @click="game.buyHeldStack(r.i)">개수 +1</button>
            </template>
          </div>
        </li>
      </ul>
      <ul class="rows">
        <li>
          <div class="main">
            <span class="grow"><strong>{{ SLOT_HELD_PERK.label }}</strong></span>
            <span v-if="game.slotHeldActive" class="owned">적용 중</span>
            <template v-else-if="game.slotHeldReady">
              <template v-if="game.hasPerk(SLOT_HELD_PERK.id)">
                <button type="button" class="buy" @click="game.buySlotHeld()">다시 적용</button>
              </template>
              <template v-else>
                <span class="price">{{ won(SLOT_HELD_PERK.price) }}</span>
                <button type="button" class="buy" :disabled="game.money < SLOT_HELD_PERK.price" @click="game.buySlotHeld()">구매</button>
              </template>
            </template>
            <span v-else class="muted">조건 미달</span>
          </div>
          <p class="desc">{{ SLOT_HELD_PERK.desc(HELD_KINDS_MAX, HELD_STACK_MAX) }}</p>
          <p v-if="!game.slotHeldActive" class="desc">
            조건: 파티 {{ PARTY_MAX }}마리 모두 도구 {{ HELD_KINDS_MAX }}종류·같은 도구 {{ HELD_STACK_MAX }}개 (총 {{ PARTY_MAX * HELD_KINDS_MAX * HELD_STACK_MAX }}개)까지 지닐 수 있음
            <small class="muted">· 지금 {{ slotHeldProgress }}/{{ PARTY_MAX }}마리</small>
            <template v-if="game.hasPerk(SLOT_HELD_PERK.id)"><br />지닐 수 있는 도구 최대치가 바뀌어 효과가 꺼졌습니다. 새 조건을 채우면 돈을 내지 않고 다시 적용할 수 있습니다.</template>
          </p>
        </li>
      </ul>
    </section>

  </div>
</template>

<style scoped>
.tabs-head {
  position: sticky;
  top: -12px;
  z-index: 1;
  margin: -12px -12px 10px;
  background: #1e1e24;
}


.sub-tabs {
  background: #1e1e24;
  border-bottom: 1px solid #3a3a44;
}

.sub-tabs button {
  flex: 1 0 auto;
  padding: 0 10px;
  white-space: nowrap;
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

.evo-label {
  margin-right: 2px;
  padding: 0 4px;
  border-radius: 3px;
  background: #3a3a44;
  color: #c8c8d0;
  font-size: 11px;
}

.owned {
  color: #ffcb05;
  font-weight: 700;
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

.ball-cands {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  font-size: 12px;
}
.ball-cands li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}
.ball-cands li.pick {
  color: #ffcb05;
  font-weight: 700;
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

.tm-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.search {
  flex: 1;
  min-width: 140px;
  padding: 6px 8px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #1e1e24;
  color: #eee;
  font: inherit;
  font-size: 13px;
}

.type {
  padding: 0 5px;
  border-radius: 3px;
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}
</style>
