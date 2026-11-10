// 4세대 (pret/pokediamond, pret/pokeplatinum, pret/pokeheartgold) — 원본이 JSON
// - 디아루가·펄기아: files/poketool/trainer/trdata.json (장소는 맵 데이터가 바이너리라 플래티나의 같은 트레이너 상수에서 빌려옴)
// - 플래티나: res/trainers/data/*.json + generated/trainers.txt(순서), 장소 = res/field/maps/*/events.json·scripts.s
// - 하트골드·소울실버: files/poketool/trainer/trainers.json, 장소 = zone_event의 std_trainer(...) + scr_seq 스크립트
import { read, list, speciesId, moveId, itemId, defaultMoves, compact, ivFromScale } from './common.mjs'

// 전투가 아닌 참조 (격파 플래그 확인, 일지 기록 등)는 장소로 치지 않음
const NOT_BATTLE = /Journal|TrainerFlag|IfDefeated|IfNotDefeated|TrainerScore|BGM|SetFlag|ClearFlag|IfSet|IfUnset/
const battleRefs = (src) =>
  new Set(src.split(/\r?\n/).filter((l) => !NOT_BATTLE.test(l)).flatMap((l) => l.match(/\bTRAINER_[A-Z0-9_]+/g) ?? []))

const cleanName = (s) => (s ?? '').replace(/\{TRNAME\}/g, '').trim() || null
const cleanClass = (s) => (s ?? '').replace(/₧₦/g, 'Pokémon').trim()

/** 'BURNED_TOWER_1F' → 'Burned Tower 1F', 'route_203' → 'Route 203' */
function humanize(s) {
  return s.split('_').filter(Boolean).map((w) =>
    /^(B?\d+F|\d+[A-Z]?|[A-Z]\d*)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase(),
  ).join(' ')
}

function mon(p, versionGroup) {
  const species = speciesId(p.species)
  const out = {
    species,
    form: p.form || undefined,
    level: p.level,
    item: itemId(p.item ?? undefined),
    iv: ivFromScale(p.iv_scale ?? p.difficulty ?? 0),
  }
  const moves = (p.moves ?? []).map(moveId).filter(Boolean)
  if (moves.length) out.moves = moves
  else { out.moves = defaultMoves(versionGroup, species, p.level); out.defaultMoves = true }
  // 하트골드·소울실버: 특성 강제 (1 = 첫째, 2 = 둘째)
  const ab = p.abilityOverride?.match(/ABILITY_OVERRIDE_(\w+)/)?.[1]
  if (ab && ab !== 'OFF') out.abilitySlot = ab === '1' || ab === 'FIRST' ? 1 : ab === '2' || ab === 'SECOND' ? 2 : ab
  return compact(out)
}

async function platinumClassNames() {
  const order = (await read('pokeplatinum', 'generated/trainer_classes.txt')).split(/\r?\n/).filter(Boolean)
  const names = JSON.parse(await read('pokeplatinum', 'res/text/trainer_class_names.json')).messages.map((m) => cleanClass(m.en_US))
  return new Map(order.map((c, i) => [c, names[i]]))
}

export async function platinum() {
  const classNames = await platinumClassNames()
  const order = (await read('pokeplatinum', 'generated/trainers.txt')).split(/\r?\n/).filter(Boolean)
  const files = new Set(await list('pokeplatinum', 'res/trainers/data'))
  const trainers = [], byConst = new Map()
  for (const c of order) {
    const file = c.replace(/^TRAINER_/, '').toLowerCase() + '.json'
    if (!files.has(file)) continue
    const j = JSON.parse(await read('pokeplatinum', `res/trainers/data/${file}`))
    if (!j.party?.length) continue
    const t = {
      id: c.replace(/^TRAINER_/, ''),
      classId: j.class.replace(/^TRAINER_CLASS_/, ''),
      class: classNames.get(j.class) ?? humanize(j.class.replace(/^TRAINER_CLASS_/, '')),
      name: cleanName(j.name),
      double: !!j.double_battle,
      items: (j.items ?? []).map(itemId).filter(Boolean),
      locations: [],
      team: j.party.map((p) => mon(p, 'platinum')),
    }
    trainers.push(t)
    byConst.set(c, t)
  }
  for (const dir of await list('pokeplatinum', 'res/field/maps')) {
    let src = ''
    for (const f of ['events.json', 'scripts.s']) src += await read('pokeplatinum', `res/field/maps/${dir}/${f}`).catch(() => '')
    for (const m of battleRefs(src)) {
      const t = byConst.get(m)
      if (t && !t.locations.includes(humanize(dir))) t.locations.push(humanize(dir))
    }
  }
  return trainers.map(compact)
}

export async function diamondPearl(platinumTrainers) {
  const classNames = await platinumClassNames()
  const { trdata } = JSON.parse(await read('pokediamond', 'files/poketool/trainer/trdata.json'))
  const consts = await read('pokediamond', 'include/constants/trainers.h')
  const constOf = new Map([...consts.matchAll(/#define (TRAINER_\w+)\s+(\d+)/g)].map((m) => [Number(m[2]), m[1]]))
  const platLoc = new Map(platinumTrainers.map((t) => [t.id, t.locations]))
  // 상수 이름이 다르면(CYCLIST_M_AXEL ↔ CYCLIST_AXEL) 클래스 이름 + 트레이너 이름으로 매칭
  const platByName = new Map()
  const nameCount = new Map()
  for (const t of platinumTrainers) {
    if (!t.locations?.length) continue
    const k = `${t.class}|${t.name}`
    if (!platByName.has(k)) platByName.set(k, t.locations)
    nameCount.set(t.name, (nameCount.get(t.name) ?? 0) + 1)
    platByName.set(`|${t.name}`, t.locations)
  }
  // 이름이 하나뿐인 트레이너는 클래스 표기가 달라도(Cyclist♂ ↔ Cyclist) 이름만으로 매칭
  for (const [n, c] of nameCount) if (c > 1) platByName.delete(`|${n}`)
  return trdata.filter((t) => t.party.length).map((t) => {
    const id = (constOf.get(t.index) ?? `TRAINER_${t.index}`).replace(/^TRAINER_/, '')
    const cls = classNames.get(t.class) ?? humanize(t.class.replace(/^TRAINER_CLASS_/, ''))
    const loc = platLoc.get(id)?.length ? platLoc.get(id)
      : platByName.get(`${cls}|${cleanName(t.name)}`) ?? platByName.get(`|${cleanName(t.name)}`)
    return compact({
      id,
      classId: t.class.replace(/^TRAINER_CLASS_/, ''),
      class: cls,
      name: cleanName(t.name),
      double: !!t.doubleBattle,
      items: t.items.map(itemId).filter(Boolean),
      locations: loc ? [...loc] : [],
      locationsApprox: loc?.length ? true : undefined, // 플래티나 기준 장소
      team: t.party.map((p) => mon(p, 'diamond-pearl')),
    })
  })
}

export async function heartgoldSoulsilver() {
  const { trainers: raw } = JSON.parse(await read('pokeheartgold', 'files/poketool/trainer/trainers.json'))
  const consts = await read('pokeheartgold', 'include/constants/trainers.h')
  const constOf = new Map([...consts.matchAll(/#define (TRAINER_\w+)\s+(\d+)/g)].filter((m) => !/INDEX/.test(m[1])).map((m) => [Number(m[2]), m[1]]))
  const classConsts = await read('pokeheartgold', 'include/constants/trainer_class.h')
  const classVal = new Map([...classConsts.matchAll(/#define (TRAINERCLASS_\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]))
  const classNames = JSON.parse(await read('pokeheartgold', 'files/msgdata/msg/msg_0730.json')).messages.map((m) => cleanClass(m.en_US))

  const trainers = [], byConst = new Map()
  raw.forEach((t, index) => {
    if (!t.party?.length) return
    const c = constOf.get(index) ?? `TRAINER_${index}`
    const tr = {
      id: c.replace(/^TRAINER_/, ''),
      classId: t.class.replace(/^TRAINERCLASS_/, ''),
      class: classNames[classVal.get(t.class)] ?? humanize(t.class.replace(/^TRAINERCLASS_/, '')),
      name: cleanName(t.name),
      double: !!t.double,
      items: t.items.map(itemId).filter(Boolean),
      locations: [],
      team: t.party.map((p) => mon(p, 'heartgold-soulsilver')),
    }
    trainers.push(tr)
    byConst.set(c, tr)
  })

  // 존 코드(R30, T22GYM0101 ...) → 맵 이름
  const maps = await read('pokeheartgold', 'include/constants/maps.h')
  const zoneName = new Map([...maps.matchAll(/#define MAP_(\w+)\s+\d+\s*\/\/\s*MAP_(\w+)/g)].map((m) => [m[2], humanize(m[1])]))
  const add = (c, code) => {
    const t = byConst.get(c)
    const where = zoneName.get(code)
    if (t && where && !t.locations.includes(where)) t.locations.push(where)
  }
  const zdir = 'files/fielddata/eventdata/zone_event'
  for (const f of await list('pokeheartgold', zdir)) {
    const code = f.match(/^\d+_(\w+)\.json$/)?.[1]
    if (!code) continue
    const src = await read('pokeheartgold', `${zdir}/${f}`)
    for (const m of src.matchAll(/std_trainer\((TRAINER_\w+)\)/g)) add(m[1], code)
  }
  const sdir = 'files/fielddata/script/scr_seq'
  for (const f of await list('pokeheartgold', sdir)) {
    const code = f.match(/^scr_seq_\d+_(\w+)\.s$/)?.[1]
    if (!code) continue
    const src = await read('pokeheartgold', `${sdir}/${f}`)
    for (const m of battleRefs(src)) add(m, code)
  }
  return trainers.map(compact)
}
