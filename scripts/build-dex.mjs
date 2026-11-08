// PokeAPI CSV 덤프 → public/data/dex/*.json (도감 데이터)
// 사용: node scripts/build-dex.mjs   (CSV는 scripts/.cache/csv 에 없으면 내려받음)
//
// 기술 분류 (포켓몬마다)
// - 등장한 이후 모든 세대에서 배울 수 있는 기술 (= 공통)
//     · 어느 세대에서든 레벨업으로 배운 적 있음 → 'level' : 가장 최근 작품의 습득 레벨로 자연 습득
//     · 레벨업 기록 없음 (기술머신/교습/알 등으로만) → 'tm'
// - 일부 세대에서만 배울 수 있는 기술 → 'gen' : 해당 세대 지방이 해금되어 있으면 습득 가능
// "포켓몬이 등장한 세대" = 그 포켓몬의 기술 데이터가 존재하는 세대 (본가에 미등장한 세대는 제외)
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const CSV_DIR = path.join(ROOT, '.cache', 'csv')
const OUT = path.join(ROOT, '..', 'public', 'data', 'dex')
const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
const KO = '3'
const MAX_SPECIES = 1025
// 기술 데이터가 없거나 체계가 다른 외전 작품 제외
const EXCLUDED_VG = new Set(['12', '13']) // colosseum, xd

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

const [pokemon, species, speciesNames, stats, ptypes, typeNames, pabil, abilNames, abilFlavor, pmoves, vgs, moves, moveNames] =
  await Promise.all(
    ['pokemon', 'pokemon_species', 'pokemon_species_names', 'pokemon_stats', 'pokemon_types', 'type_names',
      'pokemon_abilities', 'ability_names', 'ability_flavor_text', 'pokemon_moves', 'version_groups', 'moves', 'move_names'].map(csv),
  )

const vgGen = Object.fromEntries(vgs.map((v) => [v.id, Number(v.generation_id)]))
const vgOrder = Object.fromEntries(vgs.map((v) => [v.id, Number(v.order)]))
const typeKey = Object.fromEntries(
  (await csv('types')).map((t) => [t.id, t.identifier]),
)
const typeKo = Object.fromEntries(typeNames.filter((t) => t.local_language_id === KO).map((t) => [typeKey[t.type_id], t.name]))

// 기본 폼만 (species id ≤ 1025)
const defaults = pokemon.filter((p) => p.is_default === '1' && Number(p.species_id) <= MAX_SPECIES)
const speciesById = Object.fromEntries(species.map((s) => [s.id, s]))
const nameKo = {}, genusKo = {}
for (const n of speciesNames) if (n.local_language_id === KO) { nameKo[n.pokemon_species_id] = n.name; genusKo[n.pokemon_species_id] = n.genus }

const statsBy = {}
for (const s of stats) (statsBy[s.pokemon_id] ??= [])[Number(s.stat_id) - 1] = Number(s.base_stat)
const typesBy = {}
for (const t of ptypes) (typesBy[t.pokemon_id] ??= [])[Number(t.slot) - 1] = typeKey[t.type_id]
const abilBy = {}
for (const a of pabil) (abilBy[a.pokemon_id] ??= []).push([Number(a.ability_id), a.is_hidden === '1' ? 1 : 0, Number(a.slot)])

const defaultIds = new Set(defaults.map((p) => p.id))
const movesBy = {}
for (const m of pmoves) {
  if (!defaultIds.has(m.pokemon_id) || EXCLUDED_VG.has(m.version_group_id)) continue
  ;(movesBy[m.pokemon_id] ??= []).push(m)
}

const index = []
const learnsets = {}
const usedMoves = new Set()
const usedAbilities = new Set()
const stat = { level: 0, tm: 0, gen: 0 }

for (const p of defaults) {
  const sp = speciesById[p.species_id]
  const rows = movesBy[p.id] ?? []
  const availableGens = new Set(rows.map((r) => vgGen[r.version_group_id]))

  // 기술별: 배울 수 있는 세대, 레벨업 기록(최신 작품 우선)
  const byMove = {}
  for (const r of rows) {
    const m = (byMove[r.move_id] ??= { gens: new Set(), level: null, levelOrder: -1, levelByGen: {} })
    const gen = vgGen[r.version_group_id]
    m.gens.add(gen)
    if (r.pokemon_move_method_id === '1') {
      const lv = Number(r.level)
      if (vgOrder[r.version_group_id] > m.levelOrder) { m.level = lv; m.levelOrder = vgOrder[r.version_group_id] }
      m.levelByGen[gen] = Math.min(m.levelByGen[gen] ?? 999, lv)
    }
  }
  const list = []
  for (const [moveId, m] of Object.entries(byMove)) {
    const common = [...availableGens].every((g) => m.gens.has(g))
    usedMoves.add(moveId)
    if (common && m.level != null) { list.push([Number(moveId), 'level', m.level]); stat.level++ }
    else if (common) { list.push([Number(moveId), 'tm']); stat.tm++ }
    else {
      const gens = [...m.gens].sort((a, b) => a - b)
      // 세대 한정 기술도 레벨업으로 배우던 세대가 있으면 참고용 레벨 기록 {세대: 레벨}
      const lv = Object.keys(m.levelByGen).length ? m.levelByGen : undefined
      list.push(lv ? [Number(moveId), 'gen', gens, lv] : [Number(moveId), 'gen', gens]); stat.gen++
    }
  }
  const CAT = { level: 0, tm: 1, gen: 2 }
  list.sort((a, b) => CAT[a[1]] - CAT[b[1]] || (a[1] === 'level' ? a[2] - b[2] : 0) || a[0] - b[0])
  learnsets[p.identifier] = list

  for (const a of abilBy[p.id] ?? []) usedAbilities.add(String(a[0]))
  index.push({
    id: p.identifier,
    num: Number(p.species_id),
    ko: nameKo[p.species_id] ?? p.identifier,
    genus: genusKo[p.species_id] ?? '',
    gen: Number(sp.generation_id),
    types: typesBy[p.id],
    stats: statsBy[p.id], // hp, atk, def, spa, spd, spe
    abilities: (abilBy[p.id] ?? []).sort((a, b) => a[2] - b[2]).map(([id, hidden]) => (hidden ? [id, 1] : [id])),
    capture: Number(sp.capture_rate),
    height: Number(p.height) / 10, // m
    weight: Number(p.weight) / 10, // kg
    gens: [...availableGens].sort((a, b) => a - b),
  })
}
index.sort((a, b) => a.num - b.num)

// 기술 정보
const DMG = { 1: 'status', 2: 'physical', 3: 'special' }
const moveKo = Object.fromEntries(moveNames.filter((n) => n.local_language_id === KO).map((n) => [n.move_id, n.name]))
const moveInfo = {}
for (const m of moves) {
  if (!usedMoves.has(m.id)) continue
  moveInfo[m.id] = {
    id: m.identifier,
    ko: moveKo[m.id] ?? m.identifier,
    type: typeKey[m.type_id],
    cls: DMG[m.damage_class_id],
    power: m.power ? Number(m.power) : null,
    acc: m.accuracy ? Number(m.accuracy) : null,
    pp: m.pp ? Number(m.pp) : null,
  }
}

// 특성 정보 (설명은 가장 최근 작품의 한국어 문구)
const abilKo = Object.fromEntries(abilNames.filter((n) => n.local_language_id === KO).map((n) => [n.ability_id, n.name]))
const abilText = {}
for (const f of abilFlavor) {
  if (f.language_id !== KO) continue
  const o = vgOrder[f.version_group_id]
  if (!abilText[f.ability_id] || o > abilText[f.ability_id].o) abilText[f.ability_id] = { o, t: f.flavor_text.replace(/\s+/g, ' ').trim() }
}
const abilities = {}
for (const id of usedAbilities) abilities[id] = { ko: abilKo[id] ?? id, text: abilText[id]?.t ?? '' }

// 아이템 (한국어 이름이 있는 것만). 키 = PokeAPI identifier
const [items, itemNames, itemFlavor, itemCats, itemPockets] = await Promise.all(
  ['items', 'item_names', 'item_flavor_text', 'item_categories', 'item_pockets'].map(csv),
)
const pocketOf = Object.fromEntries(itemCats.map((c) => [c.id, c.pocket_id]))
const pocketName = Object.fromEntries(itemPockets.map((p) => [p.id, p.identifier]))
const itemKo = Object.fromEntries(itemNames.filter((n) => n.local_language_id === KO).map((n) => [n.item_id, n.name]))
const itemText = {}
for (const f of itemFlavor) {
  if (f.language_id !== KO) continue
  const o = vgOrder[f.version_group_id]
  if (!itemText[f.item_id] || o > itemText[f.item_id].o) itemText[f.item_id] = { o, t: f.flavor_text.replace(/\s+/g, ' ').trim() }
}
const catName = Object.fromEntries(itemCats.map((c) => [c.id, c.identifier]))
// 기술머신: 아이템마다 설명 문구가 나온 작품 이전 중 가장 최근 작품에서 가르치는 기술 (없으면 가장 최근 작품)
const machines = await csv('machines')
const machineMove = {}
const score = (o, textO) => (textO == null || o <= textO ? 1000 + o : o)
for (const m of machines) {
  const o = vgOrder[m.version_group_id] ?? Number(m.version_group_id)
  const s = score(o, itemText[m.item_id]?.o)
  if (!machineMove[m.item_id] || s > machineMove[m.item_id].s) machineMove[m.item_id] = { s, move: m.move_id }
}
const moveIdent = Object.fromEntries(moves.map((m) => [m.id, m.identifier]))
const itemInfo = {}
const itemIdent = {}
for (const it of items) {
  itemIdent[it.id] = it.identifier
  if (!itemKo[it.id]) continue
  const info = { ko: itemKo[it.id], pocket: pocketName[pocketOf[it.category_id]] ?? 'misc', text: itemText[it.id]?.t ?? '' }
  info.cat = catName[it.category_id] ?? 'other'
  if (Number(it.cost) > 0) info.cost = Number(it.cost)
  const mv = machineMove[it.id] && moveIdent[machineMove[it.id].move]
  if (mv) info.move = mv
  itemInfo[it.identifier] = info
}

// 야생 포켓몬이 지니고 있는 도구 (가장 최근 버전 기준): {포켓몬 id: [[아이템 id, 확률 %]]}
const pokemonItems = await csv('pokemon_items')
const pokeIdent = Object.fromEntries(pokemon.map((p) => [p.id, p.identifier]))
const latestVer = {}
for (const r of pokemonItems) latestVer[r.pokemon_id] = Math.max(latestVer[r.pokemon_id] ?? 0, Number(r.version_id))
const wildItems = {}
for (const r of pokemonItems) {
  if (Number(r.version_id) !== latestVer[r.pokemon_id]) continue
  const p = pokeIdent[r.pokemon_id]
  const item = itemIdent[r.item_id]
  if (!p || !item || !itemInfo[item]) continue
  ;(wildItems[p] ??= []).push([item, Number(r.rarity)])
}

await mkdir(OUT, { recursive: true })
await writeFile(path.join(OUT, 'items.json'), JSON.stringify(itemInfo))
await writeFile(path.join(OUT, 'wild-items.json'), JSON.stringify(wildItems))
await writeFile(path.join(OUT, 'index.json'), JSON.stringify(index))
await writeFile(path.join(OUT, 'learnsets.json'), JSON.stringify(learnsets))
await writeFile(path.join(OUT, 'moves.json'), JSON.stringify(moveInfo))
await writeFile(path.join(OUT, 'abilities.json'), JSON.stringify(abilities))
await writeFile(path.join(OUT, 'types.json'), JSON.stringify(typeKo))
console.log('pokemon', index.length, 'moves', Object.keys(moveInfo).length, 'abilities', Object.keys(abilities).length, stat)
