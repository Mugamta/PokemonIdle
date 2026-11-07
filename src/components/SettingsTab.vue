<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DIFFICULTIES } from '../core/battle'
import { dexData, loadDex } from '../data/dex'
import { loadSprites, resolveVariant, SPRITE_DEFAULTS, spriteData } from '../data/sprites'
import { useGameStore } from '../stores/game'
import PokeSprite from './PokeSprite.vue'
import SpritePicker from './SpritePicker.vue'

type SubTab = 'game' | 'sprite' | 'credits'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'game', label: '게임' },
  { id: 'sprite', label: '도트' },
  { id: 'credits', label: '크레딧' },
]

const game = useGameStore()
const sub = ref<SubTab>('game')
const error = ref<string | null>(null)
onMounted(() => Promise.all([loadDex(), loadSprites()]).catch((e) => (error.value = String(e))))

// ---------- 포켓몬별 도트 ----------
const query = ref('')
const onlyCustom = ref(false)
const openId = ref<string | null>(null)

const customCount = computed(() => Object.keys(game.spriteChoice).length)
const filtered = computed(() => {
  let list = dexData.value?.index ?? []
  if (onlyCustom.value) list = list.filter((p) => game.spriteChoice[p.id])
  const q = query.value.trim()
  if (!q) return list
  const n = Number(q)
  return list.filter((p) => (Number.isInteger(n) && n > 0 ? p.num === n : p.ko.includes(q)))
})

function currentLabel(id: string) {
  const v = resolveVariant(spriteData.value?.variants[id], game.spriteDefault, game.spriteChoice[id])
  return v?.label ?? '-'
}

function resetAll() {
  if (confirm('포켓몬별로 고른 도트를 모두 기본 설정으로 되돌릴까요?')) game.spriteChoice = {}
}

// ---------- 크레딧: 작가별로 묶기 ----------
const openArtist = ref<number | null>(null)
const credits = computed(() => {
  const data = spriteData.value
  const index = dexData.value?.index
  if (!data || !index) return []
  const ko = new Map(index.map((p) => [p.id, p]))
  const works = data.artists.map(() => [] as { num: number; text: string }[])
  for (const [id, list] of Object.entries(data.variants)) {
    const p = ko.get(id)
    if (!p) continue
    for (const v of list) {
      // 공식(게임프리크) / Smogon 단체 크레딧은 포켓몬 목록 대신 출처 안내로 대체
      if (v.src !== 'pmd') continue
      const label = v.k === 'pmd' ? '' : ` (${v.label.replace('PMD ', '')})`
      for (const a of v.by) works[a]!.push({ num: p.num, text: `${p.ko}${label}` })
    }
  }
  return data.artists
    .map((a, i) => ({ ...a, i, works: works[i]!.sort((x, y) => x.num - y.num) }))
    .filter((a) => a.works.length)
    .sort((x, y) => Number(!!x.official) - Number(!!y.official) || y.works.length - x.works.length)
})
</script>

<template>
  <div class="settings">
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
    <p v-else-if="!dexData || !spriteData" class="msg">불러오는 중…</p>

    <!-- 게임 설정 -->
    <section v-else-if="sub === 'game'" class="card">
      <h3>난이도</h3>
      <label v-for="d in DIFFICULTIES" :key="d.id" class="radio">
        <input v-model="game.difficulty" type="radio" name="difficulty" :value="d.id" />
        <span>
          <strong>{{ d.label }}</strong>
          <small>{{ d.desc }}</small>
        </span>
      </label>
      <p class="hint">언제든 바꿀 수 있으며 다음 턴부터 적용됩니다.</p>

      <h3 class="gap">연출</h3>
      <label class="radio">
        <input v-model="game.skipBossIntro" type="checkbox" />
        <span>
          <strong>보스 등장 연출 생략</strong>
          <small>보스에 도전할 때 경고 화면 없이 바로 전투를 시작합니다.</small>
        </span>
      </label>
    </section>

    <!-- 도트 설정 -->
    <template v-else-if="sub === 'sprite'">
      <section class="card">
        <h3>기본 도트</h3>
        <label v-for="d in SPRITE_DEFAULTS" :key="d.id" class="radio">
          <input v-model="game.spriteDefault" type="radio" name="sprite-default" :value="d.id" />
          <span>
            <strong>{{ d.label }}</strong>
            <small>{{ d.desc }}</small>
          </span>
        </label>
        <p class="hint">해당 도트가 없는 포켓몬은 다른 도트로 대신 표시됩니다.</p>
      </section>

      <section class="card">
        <h3>
          포켓몬별 도트
          <small>개별 설정 {{ customCount }}종</small>
        </h3>
        <div class="tools">
          <input v-model="query" class="search" type="search" placeholder="이름 또는 번호 검색" />
          <label class="check"><input v-model="onlyCustom" type="checkbox" /> 변경한 것만</label>
        </div>
        <button v-if="customCount" type="button" class="link" @click="resetAll">개별 설정 모두 초기화</button>

        <ul class="list">
          <li v-for="p in filtered" :key="p.id">
            <button type="button" class="row" :class="{ open: openId === p.id }" @click="openId = openId === p.id ? null : p.id">
              <PokeSprite :species="p.id" :size="36" lazy />
              <span class="num">No.{{ String(p.num).padStart(4, '0') }}</span>
              <span class="name">{{ p.ko }}</span>
              <span class="cur" :class="{ custom: game.spriteChoice[p.id] }">{{ currentLabel(p.id) }}</span>
            </button>
            <div v-if="openId === p.id" class="picker-wrap">
              <SpritePicker :species="p.id" />
            </div>
          </li>
        </ul>
        <p v-if="!filtered.length" class="msg">검색 결과가 없습니다.</p>
      </section>
    </template>

    <!-- 크레딧 / 저작권 -->
    <template v-else>
      <section class="card notice">
        <h3>저작권 고지</h3>
        <p>
          이 게임은 비상업적 팬 프로젝트이며 닌텐도, 게임프리크, 주식회사 포켓몬, 크리쳐스, 스파이크 춘소프트와 관계가 없습니다.
          포켓몬과 관련된 이름, 캐릭터, 이미지의 저작권과 상표권은 각 권리자에게 있습니다.
        </p>
        <p class="en">
          Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company. This is a non-commercial fan project
          and is not affiliated with or endorsed by them.
        </p>
      </section>

      <section class="card">
        <h3>도트 출처</h3>
        <dl class="sources">
          <dt><a href="https://github.com/PMDCollab/SpriteCollab" target="_blank" rel="noopener">PMD Sprite Collab</a></dt>
          <dd>
            커뮤니티 작가들이 그린 불가사의 던전 스타일 도트 (<a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">CC BY-NC 4.0</a>).
            작가가 Spike Chunsoft인 도트는 공식 불가사의 던전 도트입니다.
          </dd>
          <dt><a href="https://pokemonshowdown.com/" target="_blank" rel="noopener">Pokémon Showdown</a></dt>
          <dd>
            1~5세대: 공식 블랙·화이트 도트 (© Game Freak / The Pokémon Company).<br />
            6세대~: <a href="https://www.smogon.com/forums/threads/smogon-sprite-project.3647722/" target="_blank" rel="noopener">Smogon Sprite Project</a> 작가들의 팬 도트.
          </dd>
          <dt><a href="https://pokeapi.co/" target="_blank" rel="noopener">PokeAPI</a></dt>
          <dd>포켓몬·기술·특성·출현 등 게임 데이터.</dd>
        </dl>
      </section>

      <section class="card">
        <h3>PMD 도트 작가 <small>{{ credits.length }}명</small></h3>
        <p class="hint">이름을 등록하지 않은 작가는 SpriteCollab 기본 방식대로 Discord ID로 표기합니다.</p>
        <ul class="artists">
          <li v-for="a in credits" :key="a.i">
            <button type="button" class="artist" @click="openArtist = openArtist === a.i ? null : a.i">
              <span class="name">{{ a.name }}</span>
              <span v-if="a.official" class="badge">공식</span>
              <span class="count">{{ a.works.length }}</span>
            </button>
            <div v-if="openArtist === a.i" class="works">
              <a v-if="a.url" :href="a.url" target="_blank" rel="noopener" class="url">{{ a.url }}</a>
              <p>{{ a.works.map((w) => w.text).join(', ') }}</p>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sub-tabs {
  display: flex;
  gap: 6px;
}

.sub-tabs button {
  flex: 1;
  padding: 8px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #24242c;
  color: #9a9aa6;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.sub-tabs button.active {
  border-color: #ffcb05;
  color: #fff;
  font-weight: 700;
}

.msg {
  margin: 8px 0;
  color: #6a6a76;
}

.card {
  padding: 12px;
  border-radius: 8px;
  background: #2a2a33;
}

.card h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.card h3 small,
.hint {
  color: #8a8a96;
  font-size: 12px;
  font-weight: 400;
}

.hint {
  margin: 8px 0 0;
}

.card h3.gap {
  margin-top: 18px;
}

.hint.top {
  margin: -4px 0 8px;
}

.seg {
  display: flex;
  gap: 6px;
}

.seg button {
  flex: 1;
  padding: 7px 0;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #24242c;
  color: #9a9aa6;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.seg button.active {
  border-color: #ffcb05;
  color: #fff;
  font-weight: 700;
}

.radio {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
}

.radio input {
  margin-top: 3px;
  accent-color: #ffcb05;
}

.radio span {
  display: flex;
  flex-direction: column;
}

.radio small {
  color: #9a9aa6;
  font-size: 12px;
}

.tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #1e1e24;
  color: #eee;
  font: inherit;
  font-size: 14px;
}

.check {
  color: #9a9aa6;
  font-size: 13px;
  white-space: nowrap;
}

.link {
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: #ff8a80;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.list,
.artists {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row,
.artist {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: #24242c;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.artist {
  padding: 9px 10px;
}

.row.open {
  background: #34343f;
}

.num {
  color: #8a8a96;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.cur {
  color: #8a8a96;
  font-size: 12px;
}

.cur.custom {
  color: #ffcb05;
}

.picker-wrap {
  padding: 8px 0 6px;
}

.count {
  color: #8a8a96;
  font-size: 12px;
}

.badge {
  padding: 0 5px;
  border-radius: 4px;
  background: #3d4a6b;
  font-size: 11px;
}

.works {
  padding: 6px 10px 10px;
  color: #b8b8c2;
  font-size: 12px;
  line-height: 1.6;
}

.works p {
  margin: 0;
}

.url {
  display: block;
  margin-bottom: 4px;
  overflow-wrap: anywhere;
}

.notice p {
  margin: 0 0 8px;
  color: #c8c8d0;
  font-size: 13px;
  line-height: 1.6;
}

.notice .en {
  margin: 0;
  color: #8a8a96;
  font-size: 12px;
}

.sources {
  margin: 0;
  font-size: 13px;
}

.sources dt {
  margin-top: 8px;
  font-weight: 700;
}

.sources dt:first-child {
  margin-top: 0;
}

.sources dd {
  margin: 2px 0 0;
  color: #b8b8c2;
  line-height: 1.6;
}

a {
  color: #81b9ef;
}
</style>
