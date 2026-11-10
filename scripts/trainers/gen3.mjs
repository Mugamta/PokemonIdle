// 3세대 (pret/pokeruby, pret/pokeemerald, pret/pokefirered)
// - src/data/trainers*.h        : 트레이너 (클래스, 이름, 사용 도구, 더블배틀, 파티 심볼)
// - src/data/trainer_parties.h  : 파티 (개체값 배율, 레벨, 종, 지닌 도구, 기술)
// - src/data/text/trainer_class_names*.h : 클래스 이름
// - data/maps/*/scripts.inc     : trainerbattle 로 등장 장소
// - data/maps/*/map.json, data/layouts/*/map.bin : 시야가 겹치는 트레이너 쌍 (에메랄드 2인 동시 시선 더블)
import { read, readBin, list, speciesId, moveId, itemId, defaultMoves, titleCase, mapLabel, ivFromScale, compact } from './common.mjs'
import { facingDirs, sightPairs, applyPairs, applyScriptedPair } from './sight.mjs'

/** `#define X n` 또는 enum { X, Y, ... } 에서 prefix로 시작하는 상수 값 */
function constants(src, prefix) {
  const out = new Map()
  for (const m of src.matchAll(new RegExp(`#define (${prefix}\\w+)\\s+(0x[0-9A-Fa-f]+|\\d+)`, 'g'))) out.set(m[1], Number(m[2]))
  if (out.size) return out
  for (const block of src.matchAll(/enum\s*\w*\s*\{([^}]*)\}/g)) {
    let v = 0
    for (const raw of block[1].split(',')) {
      const m = raw.replace(/\/\/.*$/gm, '').trim().match(/^(\w+)(?:\s*=\s*(\w+))?/)
      if (!m) continue
      if (m[2] != null) v = Number(m[2])
      if (m[1].startsWith(prefix)) out.set(m[1], v)
      v++
    }
  }
  return out
}

/** 최상위 { ... } 블록들을 잘라냄 */
function blocks(body) {
  const out = []
  let depth = 0, start = -1
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{') { if (depth++ === 0) start = i }
    else if (body[i] === '}' && --depth === 0) out.push(body.slice(start + 1, i))
  }
  return out
}

/**
 * 에메랄드: 맵 오브젝트(data/maps/X/map.json)와 지형(data/layouts/X/map.bin)으로 시야가 겹치는 트레이너 쌍을 찾음
 * map.bin 은 칸마다 u16 (하위 10비트 메타타일, 10~11비트 충돌, 12~15비트 높이)
 */
async function sightDoubles(repo, mapDirs, labelTrainer, byConst) {
  const { layouts } = JSON.parse(await read(repo, 'data/layouts/layouts.json'))
  const layoutOf = new Map(layouts.filter((l) => l.id).map((l) => [l.id, l]))
  for (const dir of mapDirs) {
    let map
    try { map = JSON.parse(await read(repo, `data/maps/${dir}/map.json`)) } catch { continue }
    const events = (map.object_events ?? []).filter((o) => o.x != null)
    if (!events.some((o) => labelTrainer.has(o.script) && o.trainer_type !== 'TRAINER_TYPE_NONE')) continue
    const layout = layoutOf.get(map.layout)
    let passable
    if (layout) {
      const bin = await readBin(repo, layout.blockdata_filepath)
      passable = (x, y, elevation) => {
        if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) return false
        const v = bin.readUInt16LE((y * layout.width + x) * 2)
        if ((v >> 10) & 3) return false
        const h = v >> 12 // 높이 불일치 (IsElevationMismatchAt)
        return !(elevation && h && h !== 15 && h !== elevation)
      }
    }
    const objects = events.map((o) => {
      const c = labelTrainer.get(o.script)
      const sees = c && (o.trainer_type === 'TRAINER_TYPE_NORMAL' || o.trainer_type === 'TRAINER_TYPE_BURIED')
      return {
        trainer: sees ? c : undefined,
        double: sees && !!byConst.get(c)?.double,
        x: o.x, y: o.y, elevation: Number(o.elevation) || 0,
        dirs: o.trainer_type === 'TRAINER_TYPE_BURIED' ? undefined : facingDirs(o.movement_type),
        range: Number(o.trainer_sight_or_berry_tree_id) || 0,
        blocks: !/ITEM_BALL|BERRY_TREE/.test(o.graphics_id),
      }
    })
    applyPairs(byConst, sightPairs(objects, passable))
  }
}

const field = (s, name) => s.match(new RegExp(`\\.${name}\\s*=\\s*([^,\\n]+)`))?.[1]?.trim()

export async function gen3(repo, versionGroup, files) {
  const [trSrc, partySrc, classSrc, constSrc] = await Promise.all([
    read(repo, files.trainers), read(repo, 'src/data/trainer_parties.h'),
    read(repo, files.classNames), read(repo, 'include/constants/trainers.h'),
  ])

  // 클래스 이름: [TRAINER_CLASS_X] = _("...") 또는 순서대로 나열
  const classValue = constants(constSrc, 'TRAINER_CLASS_')
  const className = new Map()
  const indexed = [...classSrc.matchAll(/\[(TRAINER_CLASS_\w+)\]\s*=\s*_\("([^"]*)"\)/g)]
  if (indexed.length) for (const m of indexed) className.set(m[1], m[2])
  else {
    const names = [...classSrc.matchAll(/_\("([^"]*)"\)/g)].map((m) => m[1])
    for (const [k, v] of classValue) className.set(k, names[v])
  }

  // 파티
  const parties = new Map()
  for (const m of partySrc.matchAll(/(\w+)\[\]\s*=\s*\{([\s\S]*?)\};/g)) {
    parties.set(m[1], blocks(m[2]).map((b) => {
      const moves = b.match(/\.moves\s*=\s*\{?([^}\n]*)/)?.[1]
      return {
        iv: Number(field(b, 'iv') ?? 0),
        level: Number(field(b, 'lvl') ?? field(b, 'level')),
        species: field(b, 'species'),
        item: field(b, 'heldItem'),
        moves: moves ? moves.split(',').map((s) => s.trim()).filter(Boolean) : null,
      }
    }))
  }

  const trainers = []
  const byConst = new Map()
  for (const m of trSrc.matchAll(/\[(TRAINER_\w+)\]\s*=\s*\{([\s\S]*?)\n\s*\},/g)) {
    const [, id, b] = m
    const partySym = b.match(/\.party\s*=\s*(?:\w+\((\w+)\)|\{\s*\.\w+\s*=\s*(\w+)\s*\})/)
    const party = parties.get(partySym?.[1] ?? partySym?.[2]) ?? []
    if (!party.length || party[0].species === 'SPECIES_NONE') continue
    const cls = field(b, 'trainerClass')
    const items = (b.match(/\.items\s*=\s*\{([^}]*)\}/)?.[1] ?? '').split(',').map((s) => itemId(s.trim())).filter(Boolean)
    const team = party.map((p) => {
      const species = speciesId(p.species)
      const out = { species, level: p.level, item: itemId(p.item), iv: ivFromScale(p.iv) }
      if (p.moves) out.moves = p.moves.map(moveId).filter(Boolean)
      else { out.moves = defaultMoves(versionGroup, species, p.level); out.defaultMoves = true }
      return compact(out)
    })
    const t = {
      id: id.replace(/^TRAINER_/, ''),
      classId: cls.replace(/^TRAINER_CLASS_/, ''),
      class: titleCase(className.get(cls)),
      name: titleCase(b.match(/\.trainerName\s*=\s*_\("([^"]*)"\)/)?.[1]) || null,
      double: /\.doubleBattle\s*=\s*TRUE/.test(b),
      items,
      locations: [],
      team,
    }
    trainers.push(t)
    byConst.set(id, t)
  }

  // 장소: 맵 폴더의 스크립트, 또는 공용 스크립트(data/scripts/*.inc)의 라벨 접두사(Route3_EventScript_...)
  const mapDirs = new Set(await list(repo, 'data/maps'))
  const sources = [...mapDirs].map((d) => [d, `data/maps/${d}/scripts.inc`])
  for (const f of await list(repo, 'data/scripts')) if (f.endsWith('.inc')) sources.push([null, `data/scripts/${f}`])
  const labelTrainer = new Map() // 스크립트 라벨 → 트레이너 상수 (맵 오브젝트의 script 와 연결)
  for (const [dir, file] of sources) {
    let src
    try { src = await read(repo, file) } catch { continue }
    let label = ''
    const setAB = {} // 멀티배틀: TRAINER_BATTLE_SET_TRAINER_A/B 로 상대 둘을 정함 (에메랄드 바위섬 우주센터)
    for (const line of src.split('\n')) {
      let m
      if ((m = line.match(/^(\w+)::?/))) { label = m[1]; continue }
      const ab = line.match(/trainerbattle\s+TRAINER_BATTLE_SET_TRAINER_([AB]),\s*(TRAINER_\w+)/)
      if (ab) setAB[ab[1]] = ab[2]
      if (!(m = line.match(/trainerbattle\w*\s+(?:TRAINER_BATTLE_\w+,\s*)?(TRAINER_\w+)/))) continue
      if (!labelTrainer.has(label)) labelTrainer.set(label, m[1])
      const where = dir ?? [...mapDirs].find((d) => label.startsWith(d + '_EventScript'))
      const t = byConst.get(m[1])
      if (t && where && !t.locations.includes(mapLabel(where))) t.locations.push(mapLabel(where))
    }
    if (setAB.A && setAB.B) applyScriptedPair(byConst, setAB.A, setAB.B)
  }
  if (files.sightDoubles) await sightDoubles(repo, mapDirs, labelTrainer, byConst)
  // 파이어레드·리프그린 VS 시커 재대결표: 같은 행의 트레이너는 첫 대결과 같은 장소
  const vs = await read(repo, 'src/vs_seeker.c').catch(() => '')
  for (const row of vs.matchAll(/\{\s*\{([^}]*)\}/g)) {
    const ids = [...row[1].matchAll(/TRAINER_\w+/g)].map((m) => m[0])
    const locs = byConst.get(ids[0])?.locations ?? []
    for (const id of ids.slice(1)) {
      const t = byConst.get(id)
      if (t && !t.locations.length) t.locations = [...locs]
    }
  }
  // 재대결 팀(_2 ~ _5)은 첫 대결 장소와 같음
  for (const t of trainers) {
    // 파이어레드·리프그린 라이벌은 이름을 플레이어가 정함 (pret 기본값 TERRY) → 원작 기본 이름
    if (versionGroup === 'firered-leafgreen' && /^(RIVAL|CHAMPION)/.test(t.classId)) t.name = 'Blue'
    const base = t.id.match(/^(.*)_[2-5]$/)
    if (!t.locations.length && base) t.locations = [...(byConst.get(`TRAINER_${base[1]}_1`)?.locations ?? [])]
    compact(t)
  }
  return trainers
}
