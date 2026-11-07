// PokeAPI CSV → public/data/dex/battle.json (전투 계산용 데이터)
// 사용: node scripts/build-battle.mjs   (CSV는 scripts/.cache/csv 에 없으면 내려받음)
//
// 내용
//   types   타입 상성 {공격 타입: {방어 타입: 배율}} (1배는 생략)
//   moves   기술 추가 정보 {기술 id: {pri, self, crit, hits, drain, heal, stats, chance, ail, ailChance, fixed}}
//   species 포켓몬별 {exp: 기초 경험치, growth: 성장 그룹, ev: 노력치 보상 [6]}
//   growth  성장 그룹별 레벨 1~100 누적 경험치 [101] (0번 = 사용 안 함)
//   wild    버전 그룹별 야생 포켓몬 레벨업 기술 {vg: {포켓몬 id: [[기술 id, 레벨], ...]}}
//           출현표(src/data/encounters/*.json)에 나오는 포켓몬·버전 그룹만
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const CSV_DIR = path.join(ROOT, '.cache', 'csv')
const OUT = path.join(ROOT, '..', 'public', 'data', 'dex', 'battle.json')
const ENC_DIR = path.join(ROOT, '..', 'src', 'data', 'encounters')
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

const [types, efficacy, moves, meta, metaStats, pokemon, species, stats, experience, pmoves, vgs] = await Promise.all(
  ['types', 'type_efficacy', 'moves', 'move_meta', 'move_meta_stat_changes', 'pokemon', 'pokemon_species',
    'pokemon_stats', 'experience', 'pokemon_moves', 'version_groups'].map(csv),
)

// ---------- 타입 상성 ----------
const typeKey = Object.fromEntries(types.map((t) => [t.id, t.identifier]))
const typeChart = {}
for (const e of efficacy) {
  const f = Number(e.damage_factor) / 100
  if (f === 1) continue
  ;(typeChart[typeKey[e.damage_type_id]] ??= {})[typeKey[e.target_type_id]] = f
}

// ---------- 기술 ----------
// 고정 데미지 기술: 숫자 = 고정값, 'level' = 사용자 레벨, 'half' = 상대 현재 HP 절반
const FIXED = {
  'sonic-boom': 20,
  'dragon-rage': 40,
  'seismic-toss': 'level',
  'night-shade': 'level',
  'super-fang': 'half',
  'natures-madness': 'half',
  ruination: 'half',
}
// 능력치 id → 랭크 키
const STAT = { 1: 'hp', 2: 'atk', 3: 'def', 4: 'spa', 5: 'spd', 6: 'spe', 7: 'acc', 8: 'eva' }
// 자신에게 쓰는 기술 대상 (user, users-field, user-or-ally, user-and-allies, entire-field 중 자신 강화류)
const SELF_TARGETS = new Set(['4', '5', '7', '13'])
// move_meta_categories: 7 = 데미지 + 자신 능력 상승 (2 = net-good-stats 는 상대 능력 하락도 포함하므로 대상으로 판단)
const SELF_CATEGORIES = new Set(['7'])

// move_meta_ailments id → 상태이상 (혼란 등 일시적 상태는 제외)
const AILMENT = { 1: 'par', 2: 'slp', 3: 'frz', 4: 'brn', 5: 'psn' }
// 맹독 기술 (PokeAPI 는 독과 구분하지 않음)
const TOXIC = new Set(['toxic', 'poison-fang', 'malignant-chain'])

const metaBy =Object.fromEntries(meta.map((m) => [m.move_id, m]))
const statsBy = {}
for (const s of metaStats) (statsBy[s.move_id] ??= []).push([STAT[s.stat_id], Number(s.change)])

const moveOut = {}
for (const m of moves) {
  if (Number(m.id) >= 10000) continue
  const mm = metaBy[m.id]
  const o = {}
  const pri = Number(m.priority || 0)
  if (pri) o.pri = pri
  if (mm) {
    if (Number(mm.crit_rate)) o.crit = Number(mm.crit_rate)
    if (mm.min_hits) o.hits = [Number(mm.min_hits), Number(mm.max_hits)]
    if (Number(mm.drain)) o.drain = Number(mm.drain)
    if (Number(mm.healing)) o.heal = Number(mm.healing)
    if (statsBy[m.id]) {
      o.stats = statsBy[m.id]
      if (SELF_CATEGORIES.has(mm.meta_category_id) || SELF_TARGETS.has(m.target_id)) o.self = 1
      // 변화기는 확률 0 = 항상. 공격기의 부가 효과는 stat_chance %
      if (Number(mm.stat_chance)) o.chance = Number(mm.stat_chance)
    }
  }
  // 상태이상: 상대에게 거는 것만 (잠자기 같은 자신 대상 제외). 변화기는 확률 0 = 항상
  if (mm && AILMENT[mm.meta_ailment_id] && !SELF_TARGETS.has(m.target_id)) {
    o.ail = TOXIC.has(m.identifier) ? 'tox' : AILMENT[mm.meta_ailment_id]
    if (Number(mm.ailment_chance)) o.ailChance = Number(mm.ailment_chance)
  }
  if (FIXED[m.identifier] != null) o.fixed = FIXED[m.identifier]
  if (Object.keys(o).length) moveOut[m.id] = o
}

// ---------- 포켓몬: 경험치·노력치 ----------
const speciesById = Object.fromEntries(species.map((s) => [s.id, s]))
const evBy = {}
for (const s of stats) (evBy[s.pokemon_id] ??= [0, 0, 0, 0, 0, 0])[Number(s.stat_id) - 1] = Number(s.effort)
const speciesOut = {}
const pokemonIdByName = {}
for (const p of pokemon) {
  pokemonIdByName[p.identifier] = p.id
  if (p.is_default !== '1' || Number(p.species_id) > MAX_SPECIES) continue
  speciesOut[p.identifier] = {
    exp: Number(p.base_experience || 0),
    growth: Number(speciesById[p.species_id].growth_rate_id),
    ev: evBy[p.id],
  }
}

// ---------- 성장 그룹 ----------
const growth = {}
for (const e of experience) (growth[e.growth_rate_id] ??= [0])[Number(e.level)] = Number(e.experience)

// ---------- 야생 포켓몬 레벨업 기술 ----------
const needed = {} // vg → Set(포켓몬)
for (const f of await readdir(ENC_DIR)) {
  if (!f.endsWith('.json')) continue
  const data = JSON.parse(await readFile(path.join(ENC_DIR, f), 'utf8'))
  for (const s of Object.values(data.stages))
    for (const t of [s.all, s.day, s.night]) t?.forEach((e) => (needed[s.vg] ??= new Set()).add(e.p))
}
const vgId = Object.fromEntries(vgs.map((v) => [v.identifier, v.id]))
const wild = {}
for (const [vg, set] of Object.entries(needed)) {
  const id = vgId[vg]
  if (!id) throw new Error(`버전 그룹 없음: ${vg}`)
  const pids = new Map([...set].map((name) => [pokemonIdByName[name], name]))
  const out = (wild[vg] = {})
  for (const r of pmoves) {
    if (r.version_group_id !== id || r.pokemon_move_method_id !== '1' || !pids.has(r.pokemon_id)) continue
    ;(out[pids.get(r.pokemon_id)] ??= []).push([Number(r.move_id), Number(r.level), Number(r.order || 0)])
  }
  for (const [name, list] of Object.entries(out)) {
    list.sort((a, b) => a[1] - b[1] || a[2] - b[2])
    out[name] = list.map(([m, lv]) => [m, lv])
  }
  for (const name of set) if (!out[name]) console.warn(`  ${vg}: ${name} 레벨업 기술 없음`)
}

await writeFile(OUT, JSON.stringify({ types: typeChart, moves: moveOut, species: speciesOut, growth, wild }))
console.log(
  `types ${Object.keys(typeChart).length}, moves ${Object.keys(moveOut).length}, species ${Object.keys(speciesOut).length},`,
  `growth ${Object.keys(growth).length}, wild ${Object.entries(wild).map(([k, v]) => `${k}:${Object.keys(v).length}`).join(' ')}`,
)
