// scripts/.cache/encounters-raw.json (fetch-encounters.mjs 결과) → src/data/encounters/kantoJohto.json
// 사용: node scripts/build-encounters.mjs
//
// 규칙
// - 육지 스테이지 = 풀숲/동굴(walk) + 박치기 + 바위깨기, 수상 스테이지 "OO (수상)" = 파도타기 + 낚시
// - 낮/밤 출현표를 따로 만듦. 원작 아침+낮 → 낮, 밤 → 밤. 시간 구분 없는 게임(FRLG)은 낮=밤
// - 구역(층)·버전별 출현표는 평균내어 하나로 합침. 레벨 차이가 큰 구역은 SPLITS로 별도 스테이지
// - vg: 출현 데이터를 가져온 게임의 버전 그룹 (야생 포켓몬 기술 배치 기준)
// - 특수 조건(대량발생, 라디오, 요일, 벌레잡기대회, 도감 완성 후, 고정 심볼 등)으로만 나오는
//   일반 포켓몬은 출현율 0.1% 고정. 전설/환상, 선물/교환 포켓몬은 제외
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const raw = JSON.parse(await readFile(path.join(ROOT, '.cache', 'encounters-raw.json'), 'utf8'))

const SPECIAL_RATE = 0.1

// 조우 방법별 가중치 (스테이지 내 방법이 여러 개일 때 비율)
const LAND_WEIGHTS = { walk: 0.8, headbutt: 0.1, 'rock-smash': 0.1 }
const WATER_WEIGHTS = { surf: 0.4, 'old-rod': 0.2, 'good-rod': 0.2, 'super-rod': 0.2 }
const SPECIAL_METHODS = new Set(['static', 'pokeflute', 'squirt-bottle'])
const EXCLUDED_METHODS = new Set(['gift', 'npc-trade'])

// 레벨 차이가 커서 분리하는 구역. 키 = 원래 스테이지(장소) 이름
const SPLITS = {
  '어둠의 동굴': [
    { name: '어둠의 동굴', areas: ['dark-cave-violet-city-entrance'] },
    { name: '어둠의 동굴 (검은먹시티 쪽)', areas: ['dark-cave-blackthorn-city-entrance'] },
  ],
  연결동굴: [
    { name: '연결동굴', areas: ['union-cave-1f', 'union-cave-b1f'] },
    { name: '연결동굴 B2F', areas: ['union-cave-b2f'] },
  ],
  야돈의우물: [
    { name: '야돈의우물', areas: ['slowpoke-well-1f'] },
    { name: '야돈의우물 B1F', areas: ['slowpoke-well-b1f'] },
  ],
  절구산: [
    { name: '절구산', areas: ['mt-mortar-1f', 'mt-mortar-b1f', 'mt-mortar-lower-cave'] },
    { name: '절구산 (위층 동굴)', areas: ['mt-mortar-upper-cave'] },
  ],
  '알프의 유적': [
    { name: '알프의 유적', areas: ['ruins-of-alph-interior-a', 'ruins-of-alph-interior-b', 'ruins-of-alph-interior-c', 'ruins-of-alph-interior-d'] },
    { name: '알프의 유적 (바깥)', areas: ['ruins-of-alph-outside'] },
  ],
}

const dimOf = (c) =>
  c.startsWith('time-') ? 'time'
  : c.startsWith('radio-') ? 'radio'
  : c.startsWith('swarm-') ? 'swarm'
  : c.startsWith('bug-catching-contest-') ? 'contest'
  : c.startsWith('headbutt-tree-') ? 'tree'
  : c.startsWith('story-progress-') ? 'story'
  : c.startsWith('weekday-') ? 'weekday'
  : c

// 일반(비특수) 상황에서 각 조건 차원이 가질 수 있는 값. 여러 개면 평균
function normalOptions(dim, phase) {
  switch (dim) {
    case 'time': return phase === 'day' ? ['time-morning', 'time-day'] : ['time-night']
    case 'radio': return ['radio-off']
    case 'swarm': return ['swarm-no']
    case 'contest': return ['bug-catching-contest-no']
    case 'tree': return ['headbutt-tree-common', 'headbutt-tree-rare']
    case 'story': return ['story-progress-before-national-dex']
    default: return [null] // weekday 등: 일반 상황에서는 해당 조건이 성립하지 않음
  }
}

function cartesian(lists) {
  return lists.reduce((acc, l) => acc.flatMap((a) => l.map((x) => [...a, x])), [[]])
}

// 한 그룹(버전·구역·방법)의 일반 출현 비율 {pokemon: share(0~1)} 과 레벨, 적용된 행 집합
function groupShares(rows, phase) {
  const dims = [...new Set(rows.flatMap((r) => r.conditions.map(dimOf)))]
  const contexts = cartesian(dims.map((d) => normalOptions(d, phase).map((v) => [d, v])))
  const shares = {}
  const levels = {}
  const used = new Set()
  let n = 0
  for (const ctx of contexts) {
    const chosen = new Map(ctx)
    const applicable = rows.filter((r) => r.conditions.every((c) => chosen.get(dimOf(c)) === c))
    const total = applicable.reduce((s, r) => s + r.chance, 0)
    if (!total) continue
    n++
    for (const r of applicable) {
      used.add(r)
      shares[r.pokemon] = (shares[r.pokemon] ?? 0) + r.chance / total
      const lv = (levels[r.pokemon] ??= [r.min, r.max])
      lv[0] = Math.min(lv[0], r.min)
      lv[1] = Math.max(lv[1], r.max)
    }
  }
  for (const k in shares) shares[k] /= n || 1
  return { shares, levels, used }
}

function buildTable(rows, weights, phase) {
  const byMethod = {}
  for (const r of rows) if (weights[r.method] != null) (byMethod[r.method] ??= []).push(r)
  const methods = Object.keys(byMethod)
  const wSum = methods.reduce((s, m) => s + weights[m], 0)

  const rate = {}
  const levels = {}
  const used = new Set()
  for (const m of methods) {
    // 버전·구역별 그룹 평균
    const groups = {}
    for (const r of byMethod[m]) (groups[`${r.version}|${r.area}`] ??= []).push(r)
    const gs = Object.values(groups).map((g) => groupShares(g, phase)).filter((g) => Object.keys(g.shares).length)
    for (const g of gs) {
      g.used.forEach((r) => used.add(r))
      for (const [p, s] of Object.entries(g.shares)) {
        rate[p] = (rate[p] ?? 0) + (s / gs.length) * (weights[m] / wSum)
        const lv = (levels[p] ??= [...g.levels[p]])
        lv[0] = Math.min(lv[0], g.levels[p][0])
        lv[1] = Math.max(lv[1], g.levels[p][1])
      }
    }
  }
  return { rate, levels, used }
}

function finalize(normal, specials) {
  const specialList = Object.entries(specials).filter(([p]) => !(p in normal.rate))
  const scale = 100 - SPECIAL_RATE * specialList.length
  const out = Object.entries(normal.rate)
    .map(([p, r]) => ({ p, min: normal.levels[p][0], max: normal.levels[p][1], rate: Math.round(r * scale * 10) / 10 }))
    .sort((a, b) => b.rate - a.rate)
  for (const [p, lv] of specialList) out.push({ p, min: lv[0], max: lv[1], rate: SPECIAL_RATE, special: true })
  return out
}

function buildStage(rows, weights) {
  const normals = { day: buildTable(rows, weights, 'day'), night: buildTable(rows, weights, 'night') }
  if (!Object.keys(normals.day.rate).length && !Object.keys(normals.night.rate).length) return null
  // 특수: 낮/밤 어느 일반 상황에서도 적용되지 않은 행 + 고정 심볼류 (육지 스테이지에만)
  const usedAny = new Set([...normals.day.used, ...normals.night.used])
  const specials = {}
  for (const r of rows) {
    const isSpecialMethod = SPECIAL_METHODS.has(r.method)
    if (isSpecialMethod ? weights !== LAND_WEIGHTS : weights[r.method] == null || usedAny.has(r)) continue
    if (raw.species[r.pokemon].legendary) continue
    const lv = (specials[r.pokemon] ??= [r.min, r.max])
    lv[0] = Math.min(lv[0], r.min)
    lv[1] = Math.max(lv[1], r.max)
  }
  // 낮/밤 어느 쪽에서든 일반 출현하는 포켓몬은 특수에서 제외
  for (const p of [...Object.keys(normals.day.rate), ...Object.keys(normals.night.rate)]) delete specials[p]
  const tables = { day: finalize(normals.day, specials), night: finalize(normals.night, specials) }
  if (JSON.stringify(tables.day) === JSON.stringify(tables.night)) return { all: tables.day }
  return tables
}

// 출현 데이터의 게임 → 버전 그룹 (야생 포켓몬 기술 배치에 사용)
const VG = { firered: 'firered-leafgreen', leafgreen: 'firered-leafgreen', heartgold: 'heartgold-soulsilver', soulsilver: 'heartgold-soulsilver' }

const stages = {}
const usedSpecies = new Set()
for (const [place, { rows: allRows, versions }] of Object.entries(raw.stages)) {
  const vg = VG[versions[0]]
  const rows = allRows.filter((r) => !EXCLUDED_METHODS.has(r.method))
  const parts = SPLITS[place] ?? [{ name: place, areas: null }]
  for (const part of parts) {
    const partRows = part.areas ? rows.filter((r) => part.areas.includes(r.area)) : rows
    const land = buildStage(partRows, LAND_WEIGHTS)
    if (land) stages[part.name] = { place, kind: 'land', vg, ...land }
  }
  const water = buildStage(rows, WATER_WEIGHTS)
  if (water) stages[`${place} (수상)`] = { place, kind: 'water', vg, ...water }
}
for (const s of Object.values(stages))
  for (const t of [s.all, s.day, s.night]) t?.forEach((e) => usedSpecies.add(e.p))

const species = {}
for (const p of [...usedSpecies].sort((a, b) => raw.species[a].num - raw.species[b].num))
  species[p] = { num: raw.species[p].num, ko: raw.species[p].ko }

const outDir = path.join(ROOT, '..', 'src', 'data', 'encounters')
await mkdir(outDir, { recursive: true })
await writeFile(path.join(outDir, 'kantoJohto.json'), JSON.stringify({ species, stages }))
console.log('stages', Object.keys(stages).length, 'species', Object.keys(species).length)
