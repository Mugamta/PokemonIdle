// PokeAPI CSV 덤프 → public/data/dex/learn-methods.json (알 기술·기술가르침 데이터)
// 사용: node scripts/build-learn-methods.mjs   (CSV는 scripts/.cache/csv 에 없으면 내려받음)
//
// 출력
// - egg:      {포켓몬 id: [기술 번호]}  알 기술 (진화 전 단계의 알 기술 포함, 레벨업으로도 배우는 기술 제외)
// - tutor:    {포켓몬 id: [[기술 번호, [버전 그룹 id]]]}  기술가르침으로 배운 작품
// - levelBy:  {기술 번호: [포켓몬 id]}  어느 작품에서든 레벨업으로 배우는 포켓몬 (알 기술 유전 부모 후보)
// - eggGroups:{포켓몬 id: [알 그룹 id]}  미발견 그룹(아기 포켓몬)은 진화 계열에서 교배 가능한 단계의 그룹
// - gender:   {포켓몬 id: 암컷 비율(0~8, 8분의 n), -1 = 무성}
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const CSV_DIR = path.join(ROOT, '.cache', 'csv')
const OUT = path.join(ROOT, '..', 'public', 'data', 'dex')
const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
const MAX_SPECIES = 1025
// build-dex.mjs 와 같음: 기술 체계가 다른 외전 작품 제외
const EXCLUDED_VG = new Set(['12', '13'])
const NO_EGGS = '15'

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

const [pokemon, species, pmoves, eggGroupRows] = await Promise.all(
  ['pokemon', 'pokemon_species', 'pokemon_moves', 'pokemon_egg_groups'].map(csv),
)

const defaults = pokemon.filter((p) => p.is_default === '1' && Number(p.species_id) <= MAX_SPECIES)
const identOfSpecies = Object.fromEntries(defaults.map((p) => [p.species_id, p.identifier]))
const identOfPokemon = Object.fromEntries(defaults.map((p) => [p.id, p.identifier]))


// 진화 계열: 진화 전 단계 / 같은 계열 전체
const parentOf = {}
for (const s of species) if (s.evolves_from_species_id && identOfSpecies[s.id]) parentOf[identOfSpecies[s.id]] = identOfSpecies[s.evolves_from_species_id]
const ancestors = (id) => {
  const out = []
  for (let p = parentOf[id]; p; p = parentOf[p]) out.push(p)
  return out
}
const familyOf = {}
for (const s of species) {
  const id = identOfSpecies[s.id]
  if (!id) continue
  ;(familyOf[s.evolution_chain_id] ??= []).push(id)
}
const chainOf = Object.fromEntries(species.filter((s) => identOfSpecies[s.id]).map((s) => [identOfSpecies[s.id], s.evolution_chain_id]))

// 성비
const gender = {}
for (const s of species) if (identOfSpecies[s.id]) gender[identOfSpecies[s.id]] = Number(s.gender_rate)

// 알 그룹 (미발견 그룹 아기 포켓몬은 계열에서 교배 가능한 단계의 그룹)
const rawGroups = {}
for (const r of eggGroupRows) {
  const id = identOfSpecies[r.species_id]
  if (id) (rawGroups[id] ??= []).push(r.egg_group_id)
}
const eggGroups = {}
for (const id of Object.values(identOfSpecies)) {
  let g = rawGroups[id] ?? []
  if (g.includes(NO_EGGS)) {
    const fam = familyOf[chainOf[id]] ?? []
    const breeder = fam.find((x) => !(rawGroups[x] ?? [NO_EGGS]).includes(NO_EGGS))
    g = breeder ? rawGroups[breeder] : g
  }
  eggGroups[id] = g.map(Number)
}

// 기술 습득 기록
const levelSet = {} // 포켓몬 → 레벨업 기술
const eggSet = {}
const tutorMap = {} // 포켓몬 → 기술 → 버전 그룹
const levelBy = {}
for (const r of pmoves) {
  const id = identOfPokemon[r.pokemon_id]
  if (!id || EXCLUDED_VG.has(r.version_group_id)) continue
  const mv = Number(r.move_id)
  if (r.pokemon_move_method_id === '1') {
    ;(levelSet[id] ??= new Set()).add(mv)
    ;(levelBy[mv] ??= new Set()).add(id)
  } else if (r.pokemon_move_method_id === '2') (eggSet[id] ??= new Set()).add(mv)
  else if (r.pokemon_move_method_id === '3') {
    const t = (tutorMap[id] ??= {})
    ;(t[mv] ??= new Set()).add(Number(r.version_group_id))
  }
}

const egg = {}
const tutor = {}
for (const id of Object.values(identOfSpecies)) {
  const own = levelSet[id] ?? new Set()
  const moves = new Set()
  for (const x of [id, ...ancestors(id)]) for (const mv of eggSet[x] ?? []) if (!own.has(mv)) moves.add(mv)
  if (moves.size) egg[id] = [...moves].sort((a, b) => a - b)
  const t = tutorMap[id]
  if (t) tutor[id] = Object.entries(t).map(([mv, vgs]) => [Number(mv), [...vgs].sort((a, b) => a - b)]).sort((a, b) => a[0] - b[0])
}

const out = {
  egg,
  tutor,
  levelBy: Object.fromEntries(Object.entries(levelBy).map(([mv, s]) => [mv, [...s]])),
  eggGroups,
  gender,
}
await mkdir(OUT, { recursive: true })
await writeFile(path.join(OUT, 'learn-methods.json'), JSON.stringify(out))
console.log('egg', Object.keys(egg).length, 'tutor', Object.keys(tutor).length, 'levelBy', Object.keys(levelBy).length)

