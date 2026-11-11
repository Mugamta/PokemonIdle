// 배틀시설 엔트리 → public/data/frontier.json (보통·어려움 난이도 상대 포켓몬의 기술·도구·성격)
// 사용: node scripts/build-frontier.mjs
//
// 원본 (우선순위 순):
//   1. 에메랄드 배틀프런티어 (pret/pokeemerald src/data/battle_frontier/battle_frontier_mons.h, 882세트)
//   2. 플래티나 배틀타워·배틀프런티어 (pret/pokeplatinum res/prebuilt/battle/b_tower/btdpm.narc, 951세트)
//   3. 엔트리가 없는 포켓몬: 싱글 배틀 사용률 데이터 (public/data/usage/single-*.json) 의 가장 많이 쓰인 기술·도구·성격
// 저장소는 sparse clone 이라 파일을 체크아웃하지 않고 git show 로 읽음
//
// 출력: { "포켓몬 id": [[기술 4개], 도구 | null, 성격, 출처('e'|'p'|'u')][] }
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { PRET, ROOT, speciesId, moveId, itemId, unknown } from './trainers/common.mjs'

const DATA = path.join(ROOT, '..', 'public', 'data')
const gitShow = (repo, file) =>
  execFileSync('git', ['-c', 'gc.auto=0', '-C', path.join(PRET, repo), 'show', `HEAD:${file}`], { maxBuffer: 64 << 20 })

const json = async (file) => JSON.parse(await readFile(path.join(DATA, file), 'utf8'))
const index = await json('dex/index.json')
const moves = await json('dex/moves.json')
const items = await json('dex/items.json')
const moveIds = new Set(Object.values(moves).map((m) => m.id))
const moveByNum = new Map(Object.entries(moves).map(([n, m]) => [Number(n), m.id]))
const ourIds = new Set(index.map((p) => p.id))
const byNum = new Map(index.map((p) => [p.num, p.id]))

/** PokeAPI 종 식별자 → 이 게임의 포켓몬 id ('deoxys' → 'deoxys-normal') */
function ourSpecies(ident) {
  if (!ident) return null
  if (ourIds.has(ident)) return ident
  return index.find((p) => p.id.startsWith(ident + '-'))?.id ?? null
}

const out = {}
const add = (species, set) => {
  if (!species) return
  const mv = set[0].filter((id) => id && moveIds.has(id))
  if (!mv.length) return
  const item = set[1] && items[set[1]] ? set[1] : null
  ;(out[species] ??= []).push([[...new Set(mv)], item, set[2], set[3]])
}

// ---------- 1. 에메랄드 ----------
{
  const src = gitShow('pokeemerald', 'src/data/battle_frontier/battle_frontier_mons.h').toString('utf8')
  let n = 0
  for (const block of src.split(/\[FRONTIER_MON_\w+\]\s*=\s*\{/).slice(1)) {
    const sp = block.match(/\.species\s*=\s*(SPECIES_\w+)/)?.[1]
    const mv = [...(block.match(/\.moves\s*=\s*\{([^}]*)\}/)?.[1] ?? '').matchAll(/MOVE_\w+/g)].map((m) => moveId(m[0]))
    const it = block.match(/\.itemTableId\s*=\s*BATTLE_FRONTIER_ITEM_(\w+)/)?.[1]
    const nature = block.match(/\.nature\s*=\s*NATURE_(\w+)/)?.[1]?.toLowerCase() ?? 'hardy'
    add(ourSpecies(speciesId(sp)), [mv, it && it !== 'NONE' ? itemId(`ITEM_${it}`) : null, nature, 'e'])
    n++
  }
  console.log(`emerald: ${n}`)
}

// ---------- 2. 플래티나 ----------
{
  const lines = (file) => gitShow('pokeplatinum', file).toString('utf8').split(/\r?\n/).filter(Boolean)
  const itemNames = lines('generated/items.txt')
  const natures = lines('generated/natures.txt').map((s) => s.replace(/^NATURE_/, '').toLowerCase())
  const b = gitShow('pokeplatinum', 'res/prebuilt/battle/b_tower/btdpm.narc')
  // NARC: BTAF(파일 위치표) → BTNF → GMIF(데이터)
  const count = b.readUInt32LE(0x18)
  const fatEnd = 0x10 + b.readUInt32LE(0x14)
  const img = fatEnd + b.readUInt32LE(fatEnd + 4) + 8
  let n = 0
  for (let i = 0; i < count; i++) {
    const s = img + b.readUInt32LE(0x1c + i * 8)
    const num = b.readUInt16LE(s) & 0x7ff
    if (!num) continue
    const mv = [2, 4, 6, 8].map((o) => moveByNum.get(b.readUInt16LE(s + o))).filter(Boolean)
    const it = b.readUInt16LE(s + 12)
    add(byNum.get(num), [mv, it ? itemId(itemNames[it]) : null, natures[b[s + 11]] ?? 'hardy', 'p'])
    n++
  }
  console.log(`platinum: ${n}`)
}

// ---------- 3. 사용률 (엔트리가 없는 포켓몬만) ----------
{
  const strip = (s) => s.replace(/[^a-z0-9]/g, '')
  const byStrip = new Map()
  for (const p of index) {
    byStrip.set(strip(p.id), p.id)
    // 기본 폼 이름만으로도 찾기 ('aegislash' → 'aegislash-shield')
    const base = strip(p.id.split('-')[0])
    if (!byStrip.has(base)) byStrip.set(base, p.id)
  }
  const moveByStrip = new Map([...moveIds].map((id) => [strip(id), id]))
  const itemByStrip = new Map(Object.keys(items).map((id) => [strip(id), id]))
  const usageIndex = await json('usage/index.json')
  let n = 0
  // 최근 데이터 우선
  const formats = Object.values(usageIndex.single ?? {})
    .sort((a, b) => b.month.localeCompare(a.month))
  for (const f of formats) {
    const key = Object.entries(usageIndex.single).find(([, v]) => v === f)[0]
    const data = await json(`usage/single-${key}.json`)
    for (const [sid, u] of Object.entries(data.pokemon)) {
      if (/mega[xyz]?$/.test(sid)) continue
      const species = byStrip.get(sid)
      if (!species || out[species]) continue
      const mv = (u.moves ?? []).map((m) => moveByStrip.get(m)).filter(Boolean)
      const item = (u.items ?? []).map((i) => itemByStrip.get(i)).find(Boolean) ?? null
      add(species, [mv, item, u.nature ?? 'hardy', 'u'])
      if (out[species]) n++
    }
  }
  console.log(`usage: ${n}`)
}

for (const k of ['species', 'moves', 'items']) if (unknown[k].size) console.warn(`unknown ${k}:`, [...unknown[k]].join(' '))
const sorted = Object.fromEntries(Object.entries(out).sort((a, b) => index.findIndex((p) => p.id === a[0]) - index.findIndex((p) => p.id === b[0])))
await writeFile(path.join(DATA, 'frontier.json'), JSON.stringify(sorted))
console.log(`species: ${Object.keys(sorted).length} / ${index.length}`)
