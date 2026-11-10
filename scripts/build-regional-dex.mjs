// PokeAPI CSV(pokemon_dex_numbers) → src/data/regionalDex.json (지방별 지역도감 순서)
// 사용: node scripts/build-regional-dex.mjs   (CSV는 scripts/.cache/csv 에 없으면 내려받음)
// 결과: { [지방 key]: 전국도감 번호[] } — 배열 순서 = 지역도감 번호 순서 (index + 1 = 지역도감 번호)
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const CSV_DIR = path.join(ROOT, '.cache', 'csv')
const OUT = path.join(ROOT, '..', 'src', 'data', 'regionalDex.json')
const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
const MAX_SPECIES = 1025

// 지방 key (src/data/stages.ts) → PokeAPI pokedex identifier (여러 개면 이어 붙이고 중복 제거)
const DEXES = {
  'kanto-rby': ['kanto'],
  'johto-gs': ['original-johto'],
  'johto-c': ['original-johto'],
  'hoenn-rs': ['hoenn'],
  'hoenn-e': ['hoenn'],
  'kanto-frlg': ['kanto'],
  'sinnoh-dp': ['original-sinnoh'],
  'sinnoh-pt': ['extended-sinnoh'],
  'johto-hgss': ['updated-johto'],
  'unova-bw': ['original-unova'],
  'unova-b2w2': ['updated-unova'],
  'kalos-xy': ['kalos-central', 'kalos-coastal', 'kalos-mountain'],
  'hoenn-oras': ['updated-hoenn'],
  'alola-sm': ['original-alola'],
  'alola-usum': ['updated-alola'],
  'kanto-lgpe': ['letsgo-kanto'],
  'galar-swsh': ['galar', 'isle-of-armor', 'crown-tundra'],
  'sinnoh-bdsp': ['original-sinnoh'],
  'paldea-sv': ['paldea', 'kitakami', 'blueberry'],
  hisui: ['hisui'],
}

async function csv(name) {
  const file = path.join(CSV_DIR, name + '.csv')
  if (!existsSync(file)) {
    await mkdir(CSV_DIR, { recursive: true })
    const res = await fetch(BASE + name + '.csv')
    if (!res.ok) throw new Error(`${res.status} ${name}`)
    await writeFile(file, await res.text())
  }
  const [head, ...rows] = (await readFile(file, 'utf8')).trim().split(/\r?\n/).map((l) => l.split(','))
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

const [pokedexes, numbers] = await Promise.all([csv('pokedexes'), csv('pokemon_dex_numbers')])
const dexId = Object.fromEntries(pokedexes.map((d) => [d.identifier, d.id]))
const byDex = {}
for (const n of numbers) (byDex[n.pokedex_id] ??= []).push([Number(n.pokedex_number), Number(n.species_id)])

const out = {}
for (const [key, names] of Object.entries(DEXES)) {
  const list = []
  for (const name of names) {
    const id = dexId[name]
    if (!id || !byDex[id]) throw new Error(`pokedex 없음: ${name}`)
    for (const [, sp] of byDex[id].sort((a, b) => a[0] - b[0]))
      if (sp <= MAX_SPECIES && !list.includes(sp)) list.push(sp)
  }
  out[key] = list
  console.log(key.padEnd(12), list.length)
}
await writeFile(OUT, JSON.stringify(out) + '\n')
console.log('→', path.relative(process.cwd(), OUT))
