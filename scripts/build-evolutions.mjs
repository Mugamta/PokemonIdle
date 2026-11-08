// PokeAPI CSV → public/data/dex/evolutions.json (진화 데이터)
// 사용: node scripts/build-evolutions.mjs   (CSV는 scripts/.cache/csv 에 없으면 내려받음)
//
// 결과: {진화 전 포켓몬 id: Evo[]}  (기본 폼만, 지역 폼 전용 진화 제외)
//   Evo = { to, via, lv?, happy?, time?, item?, move?, moveType?, stat? }
//   via   'level' 레벨업 시 자동 (lv·happy·time·move·moveType·stat 조건)
//         'item'  아이템 사용 (item, time 조건)
//         'cord'  연결의끈 사용 (통신교환 대체). item 이 있으면 그 아이템도 함께 필요(지니고 교환하던 도구)
//   stat  1 = 공격 > 방어, -1 = 공격 < 방어, 0 = 같음
//
// 게임에 없는 조건 처리
//   · 장소(자기장·이끼바위·얼음바위): 다른 진화 방법이 없으면 원작 최신작 기준 진화의 돌로 대체
//   · 걸음 수·아름다움·비·거꾸로 들기·파티 조건·멀티플레이: 조건 무시 (레벨 조건만 적용)
//     단, 같은 포켓몬으로 진화하는 다른 방법이 있으면 그 방법만 사용
//   · 성별: 성별이 없으므로 무시
//   · 대장의징표(깨써는 대도 3번 격파)·모으령의코인(999개): 아이템 1개 사용으로 대체
//   · 껍질(아이템 없이 빈 칸) · 지역 폼 전용 · 멜메탈(사탕 400개): 제외
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const CSV_DIR = path.join(ROOT, '.cache', 'csv')
const OUT = path.join(ROOT, '..', 'public', 'data', 'dex', 'evolutions.json')
const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
const MAX_SPECIES = 1025

function parseCsv(text) {
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

async function csv(name) {
  const file = path.join(CSV_DIR, name + '.csv')
  if (!existsSync(file)) {
    await mkdir(CSV_DIR, { recursive: true })
    const res = await fetch(BASE + name + '.csv')
    if (!res.ok) throw new Error(`${res.status} ${name}`)
    await writeFile(file, await res.text())
  }
  return parseCsv(await readFile(file, 'utf8'))
}

const [evolutions, species, pokemon, forms, items, moves, types] = await Promise.all(
  ['pokemon_evolution', 'pokemon_species', 'pokemon', 'pokemon_forms', 'items', 'moves', 'types'].map(csv),
)

const speciesById = Object.fromEntries(species.map((s) => [s.id, s]))
const itemKey = Object.fromEntries(items.map((i) => [i.id, i.identifier]))
const moveKey = Object.fromEntries(moves.map((m) => [m.id, m.identifier]))
const typeKey = Object.fromEntries(types.map((t) => [t.id, t.identifier]))
// 포켓몬 id = 기본 폼의 pokemon identifier (도감·전투 데이터와 같은 키)
const defaultPokemon = {}
for (const p of pokemon) if (p.is_default === '1') defaultPokemon[p.species_id] = p
const defaultPokemonIds = new Set(Object.values(defaultPokemon).map((p) => p.id))
// 기본 포켓몬의 기본 폼
const defaultForms = new Set(forms.filter((f) => f.is_default === '1' && defaultPokemonIds.has(f.pokemon_id)).map((f) => f.id))

// 장소 진화 대체 아이템 (원작 최신작 기준)
const LOCATION_ITEM = { magnezone: 'thunder-stone', probopass: 'thunder-stone', vikavolt: 'thunder-stone', leafeon: 'leaf-stone', glaceon: 'ice-stone', crabominable: 'ice-stone' }
// 조건을 무시하는 필드 (게임에 없는 조건)
const IGNORED = ['minimum_steps', 'minimum_beauty', 'needs_overworld_rain', 'turn_upside_down', 'party_species_id', 'party_type_id', 'needs_multiplayer', 'gender_id', 'condition_expression', 'percentage_chance', 'minimum_affection']
// 특수 기믹 대체 아이템: 깨써는 대도를 3번 쓰러뜨림 → 대장의징표, 코인 999개 → 모으령의코인
const SPECIAL_ITEM = { 15: 'leaders-crest', 16: 'gimmighoul-coin' }
const set = (v) => v !== '' && v != null

const out = {}
const skipped = []
for (const e of evolutions) {
  const to = speciesById[e.evolved_species_id]
  if (!to || Number(to.id) > MAX_SPECIES || !to.evolves_from_species_id) continue
  const fromP = defaultPokemon[to.evolves_from_species_id]
  const toP = defaultPokemon[to.id]
  if (!fromP || !toP) continue
  // 지역 폼 전용 진화 제외
  if (set(e.required_pokemon_form_id) && !defaultForms.has(e.required_pokemon_form_id)) continue
  if (set(e.evolved_pokemon_form_id) && !defaultForms.has(e.evolved_pokemon_form_id)) continue
  if (set(e.region_id)) { skipped.push(`${toP.identifier}(지역)`); continue }

  const trig = e.evolution_trigger_id
  const evo = { to: toP.identifier }
  let ignored = IGNORED.filter((k) => set(e[k]) && e[k] !== '0').length > 0
  const time = ['day', 'night'].includes(e.time_of_day) ? e.time_of_day : e.time_of_day === 'full-moon' ? 'night' : null

  if (trig === '1' || trig === '10') {
    // 레벨업 (도구를 지니고 레벨업 = 그 도구를 사용)
    if (set(e.held_item_id)) {
      evo.via = 'item'
      evo.item = itemKey[e.held_item_id]
    } else if (set(e.location_id) || set(e.near_special_rock) && e.near_special_rock !== '0') {
      if (!LOCATION_ITEM[toP.identifier]) { skipped.push(`${toP.identifier}(장소)`); continue }
      evo.via = 'item'
      evo.item = LOCATION_ITEM[toP.identifier]
    } else {
      evo.via = 'level'
      if (set(e.minimum_level)) evo.lv = Number(e.minimum_level)
      if (set(e.minimum_happiness) || set(e.minimum_affection)) evo.happy = 1
      if (set(e.known_move_id)) evo.move = moveKey[e.known_move_id]
      if (set(e.known_move_type_id)) evo.moveType = typeKey[e.known_move_type_id]
      if (set(e.relative_physical_stats)) evo.stat = Number(e.relative_physical_stats)
    }
  } else if (trig === '3') {
    evo.via = 'item'
    evo.item = itemKey[e.trigger_item_id]
  } else if (trig === '2') {
    evo.via = 'cord'
    if (set(e.held_item_id)) evo.item = itemKey[e.held_item_id]
  } else if (trig === '5') {
    // 빙빙 돌기 (마빌크): 사탕공예를 사용
    evo.via = 'item'
    evo.item = itemKey[e.held_item_id] ?? 'strawberry-sweet'
  } else if (SPECIAL_ITEM[trig]) {
    // 특수 기믹 → 관련 아이템 사용으로 대체
    evo.via = 'item'
    evo.item = SPECIAL_ITEM[trig]
  } else if (trig === '11' || trig === '12' || trig === '14') {
    // 특정 기술을 여러 번 사용 → 그 기술을 배운 상태에서 레벨업
    evo.via = 'level'
    evo.move = moveKey[e.used_move_id]
  } else {
    skipped.push(`${toP.identifier}(trigger ${trig})`)
    continue
  }
  // 아이템 진화는 아이템 사용 자체가 조건 (지니고 레벨업하던 시간대 조건 제외)
  if (time && evo.via === 'level') evo.time = time
  evo.ignored = ignored
  ;(out[fromP.identifier] ??= []).push(evo)
}

// 정리: 같은 진화 대상에 조건 무시 없는 방법이 있으면 무시한 방법은 제거, 중복 제거
const result = {}
let count = 0
for (const [from, list] of Object.entries(out)) {
  const kept = []
  for (const to of [...new Set(list.map((x) => x.to))]) {
    const same = list.filter((x) => x.to === to)
    const exact = same.filter((x) => !x.ignored)
    const pick = exact.length ? exact : same
    const seen = new Set()
    for (const { ignored, ...evo } of pick) {
      const key = JSON.stringify(evo)
      if (seen.has(key)) continue
      seen.add(key)
      kept.push(evo)
      count++
    }
  }
  result[from] = kept
}

await mkdir(path.dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(result))
const items_ = new Set(Object.values(result).flat().filter((e) => e.item).map((e) => e.item))
console.log(`진화 전 ${Object.keys(result).length}종, 진화 방법 ${count}개, 아이템 ${items_.size}종`)
console.log('아이템:', [...items_].join(' '))
console.log('제외:', [...new Set(skipped)].join(' '))
