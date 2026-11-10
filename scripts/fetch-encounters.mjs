// PokeAPI에서 스테이지별 야생 출현 원본 데이터를 내려받아 scripts/.cache/encounters-raw.json 으로 저장.
// 사용: node scripts/fetch-encounters.mjs
// 응답은 scripts/.cache/api/ 에 캐시되어 재실행 시 다시 요청하지 않음.
// 내려받을 장소·버전은 scripts/encounter-groups.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GROUPS } from './encounter-groups.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const CACHE = path.join(ROOT, '.cache', 'api')
const API = 'https://pokeapi.co/api/v2/'

async function get(url) {
  const rel = url.replace(API, '').replace(/\/$/, '').replace(/[/?=&]/g, '_')
  const file = path.join(CACHE, rel + '.json')
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'))
  const res = await fetch(url.startsWith('http') ? url : API + url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const data = await res.json()
  await writeFile(file, JSON.stringify(data))
  return data
}

// slug → 그 장소를 쓰는 지방들의 버전
const wanted = new Map()
for (const g of GROUPS)
  for (const [, slugs] of g.stages)
    for (const slug of [slugs].flat()) {
      if (!wanted.has(slug)) wanted.set(slug, new Set())
      g.versions.forEach((v) => wanted.get(slug).add(v))
    }

await mkdir(CACHE, { recursive: true })
const locations = {}
const species = new Set()
for (const [loc, versions] of wanted) {
  const location = await get(`location/${loc}`)
  const rows = []
  for (const a of location.areas) {
    const area = await get(a.url)
    for (const pe of area.pokemon_encounters) {
      for (const vd of pe.version_details) {
        if (!versions.has(vd.version.name)) continue
        for (const d of vd.encounter_details) {
          rows.push({
            area: a.name,
            pokemon: pe.pokemon.name,
            version: vd.version.name,
            method: d.method.name,
            min: d.min_level,
            max: d.max_level,
            chance: d.chance,
            conditions: d.condition_values.map((c) => c.name),
          })
          species.add(pe.pokemon.name)
        }
      }
    }
  }
  if (!rows.length) console.warn(`\n출현 데이터 없음: ${loc}`)
  locations[loc] = rows
  process.stdout.write('.')
}

// 포켓몬 한국어 이름 / 도감번호 / 전설·환상 여부
const speciesInfo = {}
for (const name of species) {
  const pk = await get(`pokemon/${name}`)
  const sp = await get(pk.species.url)
  speciesInfo[name] = {
    num: sp.id,
    ko: sp.names.find((n) => n.language.name === 'ko')?.name ?? name,
    legendary: sp.is_legendary || sp.is_mythical,
    captureRate: sp.capture_rate,
  }
}

await writeFile(path.join(ROOT, '.cache', 'encounters-raw.json'), JSON.stringify({ locations, species: speciesInfo }))
console.log('\nlocations', Object.keys(locations).length, 'species', species.size)
