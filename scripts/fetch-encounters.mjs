// PokeAPI에서 스테이지별 야생 출현 원본 데이터를 내려받아 scripts/.cache/encounters-raw.json 으로 저장.
// 사용: node scripts/fetch-encounters.mjs
// 응답은 scripts/.cache/api/ 에 캐시되어 재실행 시 다시 요청하지 않음.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

// 스테이지 이름 → PokeAPI location slug, 사용할 게임 버전
const FRLG = ['firered', 'leafgreen']
const HGSS = ['heartgold', 'soulsilver']
const kr = (n) => `${n}번도로`
const STAGES = {}
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22, 23, 24, 25])
  STAGES[kr(n)] = { loc: `kanto-route-${n}`, versions: FRLG }
for (const n of [19, 20, 21]) STAGES[kr(n)] = { loc: `kanto-sea-route-${n}`, versions: FRLG }
for (const n of [26, 27, 28]) STAGES[kr(n)] = { loc: `kanto-route-${n}`, versions: HGSS }
for (const n of [29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 42, 43, 44, 45, 46])
  STAGES[kr(n)] = { loc: `johto-route-${n}`, versions: HGSS }
for (const n of [40, 41]) STAGES[kr(n)] = { loc: `johto-sea-route-${n}`, versions: HGSS }
Object.assign(STAGES, {
  상록숲: { loc: 'viridian-forest', versions: FRLG },
  달맞이산: { loc: 'mt-moon', versions: FRLG },
  '디그다의 굴': { loc: 'digletts-cave', versions: FRLG },
  돌산터널: { loc: 'rock-tunnel', versions: FRLG },
  포켓몬타워: { loc: 'pokemon-tower', versions: FRLG },
  사파리존: { loc: 'kanto-safari-zone', versions: FRLG },
  쌍둥이섬: { loc: 'seafoam-islands', versions: FRLG },
  포켓몬저택: { loc: 'pokemon-mansion', versions: FRLG },
  무인발전소: { loc: 'kanto-power-plant', versions: FRLG },
  챔피언로드: { loc: 'kanto-victory-road-2', versions: FRLG },
  블루시티동굴: { loc: 'cerulean-cave', versions: FRLG },
  '어둠의 동굴': { loc: 'dark-cave', versions: HGSS },
  모다피의탑: { loc: 'sprout-tower', versions: HGSS },
  '알프의 유적': { loc: 'ruins-of-alph', versions: HGSS },
  연결동굴: { loc: 'union-cave', versions: HGSS },
  야돈의우물: { loc: 'slowpoke-well', versions: HGSS },
  너도밤나무숲: { loc: 'ilex-forest', versions: HGSS },
  자연공원: { loc: 'national-park', versions: HGSS },
  불탄탑: { loc: 'burned-tower', versions: HGSS },
  소용돌이섬: { loc: 'whirl-islands', versions: HGSS },
  절구산: { loc: 'mt-mortar', versions: HGSS },
  분노의호수: { loc: 'lake-of-rage', versions: HGSS },
  얼음샛길: { loc: 'ice-path', versions: HGSS },
  '용의 굴': { loc: 'dragons-den', versions: HGSS },
  방울탑: { loc: 'bell-tower', versions: HGSS },
  은빛산: { loc: 'mt-silver', versions: HGSS },
})

await mkdir(CACHE, { recursive: true })
const out = {}
const species = new Set()
for (const [stage, { loc, versions }] of Object.entries(STAGES)) {
  const location = await get(`location/${loc}`)
  const rows = []
  for (const a of location.areas) {
    const area = await get(a.url)
    for (const pe of area.pokemon_encounters) {
      for (const vd of pe.version_details) {
        if (!versions.includes(vd.version.name)) continue
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
  out[stage] = { loc, versions, rows }
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

await writeFile(path.join(ROOT, '.cache', 'encounters-raw.json'), JSON.stringify({ stages: out, species: speciesInfo }, null, 1))
console.log('\nstages', Object.keys(out).length, 'species', species.size)
