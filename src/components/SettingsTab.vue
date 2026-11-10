<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { audioSettings } from '../core/audio'
import { DIFFICULTIES } from '../core/battle'
import { exportSave, importSave, resetSave, save } from '../core/save'
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

// ---------- 데이터 백업 / 초기화 ----------
const backupCode = ref('')
const importCode = ref('')
const dataMsg = ref('')
/** 지금 상태를 저장한 뒤 백업 코드 생성 */
function makeBackup() {
  save(game.$state)
  backupCode.value = exportSave()
  dataMsg.value = ''
}
async function copyBackup() {
  if (!backupCode.value) makeBackup()
  try {
    await navigator.clipboard.writeText(backupCode.value)
    dataMsg.value = '백업 코드를 복사했습니다.'
  } catch {
    dataMsg.value = '복사하지 못했습니다. 코드 칸을 직접 선택해 복사해 주세요.'
  }
}
function downloadBackup() {
  makeBackup()
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  const url = URL.createObjectURL(new Blob([backupCode.value], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `pokemon-idle-backup-${stamp}.txt`
  a.click()
  URL.revokeObjectURL(url)
  dataMsg.value = '백업 파일을 저장했습니다.'
}
function applyImport(code: string) {
  if (!code.trim()) return
  if (!confirm('백업 데이터를 불러올까요?\n지금 진행 중인 데이터는 백업 데이터로 덮어써집니다.')) return
  if (!importSave(code)) {
    dataMsg.value = '올바른 백업 코드가 아닙니다.'
    return
  }
  location.reload()
}
async function importFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) applyImport(await file.text())
}
function resetData() {
  if (!confirm('모든 게임 데이터를 지우고 처음부터 시작할까요?\n포켓몬·도감·아이템·돈·강화·설정이 모두 사라지며 되돌릴 수 없습니다.')) return
  if (!confirm('정말 초기화할까요? 필요하면 먼저 백업해 두세요.')) return
  resetSave()
  location.reload()
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
    <template v-else-if="sub === 'game'">
      <section class="card">
        <h3>난이도</h3>
        <label v-for="d in DIFFICULTIES" :key="d.id" class="radio">
          <input v-model="game.difficulty" type="radio" name="difficulty" :value="d.id" />
          <span>
            <strong>{{ d.label }}</strong>
            <small>{{ d.desc }}</small>
          </span>
        </label>
        <p class="hint">언제든 바꿀 수 있으며 다음 턴부터 적용됩니다.</p>
      </section>

      <section class="card">
        <h3>사운드</h3>
        <label class="volume">
          <span>배경음악</span>
          <input v-model.number="audioSettings.music" type="range" min="0" max="1" step="0.05" />
          <output>{{ Math.round(audioSettings.music * 100) }}</output>
        </label>
        <label class="volume">
          <span>효과음</span>
          <input v-model.number="audioSettings.sfx" type="range" min="0" max="1" step="0.05" />
          <output>{{ Math.round(audioSettings.sfx * 100) }}</output>
        </label>
        <p class="hint">브라우저 정책상 화면을 한 번 누른 뒤부터 소리가 납니다. 0으로 두면 꺼집니다.</p>
      </section>

      <section class="card">
        <h3>데이터 백업</h3>
        <p class="hint top">백업 코드나 파일을 다른 브라우저·기기에서 불러오면 이어서 플레이할 수 있습니다.</p>
        <div class="data-btns">
          <button type="button" class="btn" @click="copyBackup">백업 코드 복사</button>
          <button type="button" class="btn" @click="downloadBackup">백업 파일 저장</button>
        </div>
        <textarea
          v-if="backupCode"
          class="code"
          readonly
          rows="3"
          :value="backupCode"
          @focus="($event.target as HTMLTextAreaElement).select()"
        />
        <h3 class="gap">백업 불러오기</h3>
        <textarea v-model="importCode" class="code" rows="3" placeholder="백업 코드를 붙여 넣으세요" />
        <div class="data-btns">
          <button type="button" class="btn" :disabled="!importCode.trim()" @click="applyImport(importCode)">코드로 불러오기</button>
          <label class="btn">
            파일에서 불러오기
            <input type="file" accept=".txt,text/plain" hidden @change="importFile" />
          </label>
        </div>
        <p v-if="dataMsg" class="hint">{{ dataMsg }}</p>
      </section>

      <section class="card">
        <h3>데이터 초기화</h3>
        <p class="hint top">모든 진행 상황을 지우고 신규 유저처럼 스타팅 포켓몬 선택부터 다시 시작합니다.</p>
        <button type="button" class="btn danger-btn" @click="resetData">데이터 초기화</button>
      </section>
    </template>

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
.volume {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 14px;
}

.volume span {
  width: 64px;
  flex: none;
}

.volume input {
  flex: 1;
  accent-color: #ffcb05;
}

.volume output {
  width: 28px;
  text-align: right;
  color: #9a9aa6;
  font-size: 13px;
}

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

.data-btns {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.btn {
  flex: 1;
  padding: 8px 0;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #24242c;
  color: #eee;
  font: inherit;
  font-size: 13px;
  text-align: center;
  cursor: pointer;
}

.btn:disabled {
  color: #6a6a76;
  cursor: default;
}

.code {
  box-sizing: border-box;
  width: 100%;
  margin-top: 6px;
  padding: 6px 8px;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  background: #1e1e24;
  color: #c8c8d0;
  font: 11px/1.4 ui-monospace, monospace;
  word-break: break-all;
  resize: vertical;
}

.danger-btn {
  width: 100%;
  border-color: #6b2f2f;
  color: #ff8a80;
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
