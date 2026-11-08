<script setup lang="ts">
// 상점: 회복·몬스터볼·배틀용 도구·지닌 도구·기술머신·진화·육성 아이템 구매, 편의성 기능, 기술칸 추가, 아이템 판매
import { computed, onMounted, ref } from 'vue'
import { dexData, loadDex, loadLearnsets, TYPE_COLORS } from '../data/dex'
import { evoItemUsage } from '../data/evolutions'
import {
  BOSS_INTRO_PERK,
  CHAIN_PERKS,
  AUTO_HEAL_THRESHOLDS,
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
  PERKS,
  SHOP_ITEMS,
  sellPrice,
  TRAIN_GROUP_LABELS,
  TRAIN_ITEMS,
  BOTTLE_CAP_LEVEL,
  VITAMIN_EV,
  type AutoCategory,
  type EvoGroup,
  type TrainGroup,
  type ItemCategory,
  type Perk,
} from '../data/shop'
import { BALL_NOTES, EXP_SHARE_ITEM, HELD_GROUP_LABELS, HELD_ITEMS, isRecord, tmShopList, type HeldGroup } from '../data/items'
import ItemIcon from './ItemIcon.vue'
import ShopRow from './ShopRow.vue'
import { baseSlotsOf, canLearnMachine, EXTRA_SLOTS, PP_START_STAGE, SLOT_DEFEATS, slotsOf, useGameStore } from '../stores/game'

type Sub = 'items' | 'ball' | 'battle' | 'held' | 'tm' | 'evo' | 'train' | 'growth' | 'perks' | 'slots' | 'sell'
/** 하단 탭: 도구상점(item) / 강화상점(upgrade) */
const props = defineProps<{ kind: 'item' | 'upgrade' }>()
const UPGRADE_SUBS: Sub[] = ['growth', 'perks', 'slots']
const ALL_SUBS: { id: Sub; label: string }[] = [
  { id: 'items', label: '회복' },
  { id: 'ball', label: '볼' },
  { id: 'battle', label: '배틀' },
  { id: 'held', label: '지닌 도구' },
  { id: 'tm', label: '기술머신' },
  { id: 'evo', label: '진화' },
  { id: 'train', label: '육성' },
  { id: 'growth', label: '육성 강화' },
  { id: 'perks', label: '편의성' },
  { id: 'slots', label: '기술칸' },
  { id: 'sell', label: '판매' },
]
const SUBS = ALL_SUBS.filter((t) => UPGRADE_SUBS.includes(t.id) === (props.kind === 'upgrade'))

const game = useGameStore()
const sub = ref<Sub>(SUBS[0]!.id)
onMounted(() => {
  loadDex().catch(() => {})
  loadLearnsets().catch(() => {})
})

/** 상단 탭 아래의 작은 탭 (분류) */
const MINI: Partial<Record<Sub, { id: string; label: string }[]>> = {
  items: [
    { id: 'heal', label: '체력·기절' },
    { id: 'pp', label: 'PP' },
    { id: 'status', label: '상태이상' },
  ],
  held: [
    { id: 'attack', label: '공격·속도' },
    { id: 'defense', label: '방어·회복' },
    { id: 'type', label: '타입 강화' },
    { id: 'gem', label: '주얼' },
    { id: 'berry', label: '나무열매' },
    { id: 'species', label: '전용 도구' },
    { id: 'bad', label: '불리한 효과' },
    { id: 'training', label: '경험치·돈' },
  ],
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
}
/** 상단 탭별로 선택한 작은 탭 (탭을 오가도 유지) */
const mini = ref<Partial<Record<Sub, string>>>(
  Object.fromEntries(Object.entries(MINI).map(([k, v]) => [k, v![0]!.id])),
)
const miniTabs = computed(() => MINI[sub.value])
const cur = computed(() => mini.value[sub.value])
const catItems = computed(() => SHOP_ITEMS.filter((i) => i.category === cur.value))
const balls = SHOP_ITEMS.filter((i) => i.category === 'ball')
const battleItems = SHOP_ITEMS.filter((i) => i.category === 'battle')

const HELD_GROUPS = Object.keys(HELD_GROUP_LABELS) as HeldGroup[]
const heldGroups = HELD_GROUPS.map((g) => ({ g, items: HELD_ITEMS.filter((i) => i.group === g) }))

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
  game.buyItem(id, 1)
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

/** 편의성 탭에 나오는 차례 구매 기능 (노력치 한계 돌파는 육성 탭) */
const perkList = CHAIN_PERKS.filter((p) => p.id !== EV_BREAK_PERK.id)
/** 노력치 한계 돌파 2 다음 구매 정보 */
const evBreak2 = computed(() => ({
  price: evBreak2Price(game.evBreaks + 1),
  cur: evStatCap(game.evBreaks),
  next: evStatCap(game.evBreaks + 1),
}))

function perkKind(p: Perk) {
  const [kind, cat] = p.id.split(':') as ['autoUse' | 'autoBuy', AutoCategory]
  return { kind, cat }
}
function togglePerk(p: Perk, on: boolean) {
  const { kind, cat } = perkKind(p)
  if (kind === 'autoUse') game.setAutoUse(cat, on)
  else game.setAutoBuy(cat, on)
}
const itemName = (id: string) => dexData.value?.items[id]?.ko ?? id

/** 판매: 가방에 있고 팔 수 있는 아이템 */
const sellRows = computed(() =>
  Object.entries(game.items)
    .filter(([id, n]) => n > 0 && sellPrice(id) > 0)
    .map(([id, n]) => ({ id, n, price: sellPrice(id), name: itemName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name)),
)
function sell(id: string, n: number) {
  if (n > 1 && !confirm(`${itemName(id)} ${n}개를 ${won(sellPrice(id) * n)}에 팔까요?`)) return
  game.sellItem(id, n)
}

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
    <div class="tabs-head">
      <nav class="sub-tabs">
        <button v-for="t in SUBS" :key="t.id" type="button" :class="{ active: sub === t.id }" @click="sub = t.id">
          {{ t.label }}
        </button>
      </nav>
      <!-- 상단 탭 안의 작은 탭 (분류) -->
      <nav v-if="miniTabs" class="mini-tabs">
        <button v-for="m in miniTabs" :key="m.id" type="button" :class="{ active: cur === m.id }" @click="mini[sub] = m.id">
          {{ m.label }}
        </button>
      </nav>
    </div>

    <div class="wallet">
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
        전투 탭 → 아이템에서 야생 포켓몬에게 던집니다 (한 턴 소모). 보스는 잡을 수 없습니다. HP가 적을수록, 잠듦·얼음(2.5배)이나
        마비·독·화상(1.5배) 상태일수록 잘 잡힙니다. 잡은 포켓몬은 파티(최대 6마리) 또는 박스로 갑니다.
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
    <template v-else-if="sub === 'held'">
      <section v-for="g in heldGroups.filter((x) => x.g === cur)" :key="g.g" class="card">
        <h4 class="sec">{{ HELD_GROUP_LABELS[g.g] }}</h4>
        <ul class="rows">
          <ShopRow v-for="it in g.items" :key="it.id" :id="it.id" :price="it.price" />
        </ul>
      </section>
      <p class="note">
        전투 탭 → 아이템 → 지닌 도구에서 파티 포켓몬에게 지니게 합니다. 열매·주얼·기합의띠처럼 한 번 쓰면 사라지는 도구는 다음 전투가
        시작될 때 가방에 같은 도구가 있으면 자동으로 다시 지닙니다. 날씨·필드·교체에 관련된 도구는 이 게임에서 효과가 없어 팔지 않습니다.
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
        전투 탭 → 아이템 → 기술머신에서 가르칩니다. 기술머신은 한 번 사면 몇 번이든 쓸 수 있고, 기술레코드는 쓰면 사라집니다.
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
    <!-- 육성 아이템 -->
    <template v-else-if="sub === 'train'">
      <section v-for="g in trainGroups.filter((x) => x.g === cur)" :key="g.g" class="card">
        <h4 class="sec">{{ TRAIN_GROUP_LABELS[g.g] }}</h4>
        <ul class="rows">
          <ShopRow v-for="it in g.items" :key="it.id" :id="it.id" :price="it.price" />
        </ul>
      </section>
      <p class="note">
        육성 아이템은 전투 탭 → 아이템에서 파티 포켓몬을 골라 사용하며, 턴을 소모하지 않습니다. 영양제는 1개에 노력치
        {{ VITAMIN_EV }}, 깃털은 1, 열매는 {{ VITAMIN_EV }}씩 내립니다 (능력치 하나 {{ game.evStatCap }}<template v-if="Number.isFinite(game.evTotalCap)">, 합계 {{ EV_TOTAL_MAX }}</template>까지). 병뚜껑은 레벨
        {{ BOTTLE_CAP_LEVEL }} 이상인 포켓몬에게만 쓸 수 있습니다.
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
      <p class="note">진화 아이템은 전투 탭 → 아이템에서 사용합니다.</p>
    </template>

    <!-- 편의성 -->
    <section v-else-if="sub === 'perks'" class="card">
      <ul class="rows">
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
        <li>
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
    <section v-else-if="sub === 'slots'" class="card">
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

    <!-- 판매 -->
    <template v-else-if="sub === 'sell'">
      <section class="card">
        <p v-if="!sellRows.length" class="msg">팔 수 있는 아이템이 없습니다. 야생 포켓몬이 지니고 있던 도구(금구슬 등)는 비싸게 팔 수 있습니다.</p>
        <ul v-else class="rows">
          <li v-for="r in sellRows" :key="r.id">
            <div class="main">
              <ItemIcon :id="r.id" lazy />
              <span class="grow">{{ r.name }} <span class="muted">보유 {{ r.n }}</span></span>
              <span class="price">{{ won(r.price) }}</span>
              <button type="button" class="buy" @click="sell(r.id, 1)">1개</button>
              <button v-if="r.n > 1" type="button" class="buy" @click="sell(r.id, r.n)">모두</button>
            </div>
          </li>
        </ul>
      </section>
      <p class="note">원작 가격의 절반에 팝니다. (상점에서 산 가격보다 원작 가격이 비싸면 상점 가격의 절반)</p>
    </template>
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

.mini-tabs {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid #3a3a44;
}

.mini-tabs button {
  flex: 0 0 auto;
  height: 28px;
  padding: 0 12px;
  border: 1px solid #3a3a44;
  border-radius: 999px;
  background: #26262e;
  color: #9a9aa6;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.mini-tabs button.active {
  border-color: #ffcb05;
  background: #ffcb05;
  color: #1e1e24;
  font-weight: 700;
}

.sub-tabs {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
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
