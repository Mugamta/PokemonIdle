// 2세대 (pret/pokegold, pret/pokecrystal)
// - constants/trainer_constants.asm : trainerclass 순서 + 클래스 안의 개별 트레이너 상수
// - data/trainers/parties.asm       : 그룹(클래스)별 트레이너 이름·타입·포켓몬
// - data/trainers/class_names.asm   : 클래스 이름
// - data/trainers/dvs.asm           : 클래스별 DV
// - maps/*.asm                      : trainer / loadtrainer 로 등장 장소
import { read, list, speciesId, moveId, itemId, defaultMoves, titleCase, mapLabel, compact } from './common.mjs'

export async function gen2(repo, versionGroup) {
  const [consts, parties, pointers, names, dvs] = await Promise.all([
    read(repo, 'constants/trainer_constants.asm'),
    read(repo, 'data/trainers/parties.asm'),
    read(repo, 'data/trainers/party_pointers.asm'),
    read(repo, 'data/trainers/class_names.asm'),
    read(repo, 'data/trainers/dvs.asm'),
  ])

  // 클래스 순서와 클래스별 트레이너 상수
  const classes = [] // { id, members: [] }
  for (const line of consts.split('\n')) {
    let m
    if ((m = line.match(/^\s*trainerclass (\w+)/))) { if (m[1] !== 'TRAINER_NONE') classes.push({ id: m[1], members: [] }) }
    else if ((m = line.match(/^\s*const (\w+)/)) && classes.length) classes[classes.length - 1].members.push(m[1])
  }
  const classNames = [...names.matchAll(/li "([^"]*)"/g)].map((m) => m[1])
  const groupLabels = [...pointers.matchAll(/^\s*dw (\w+Group)/gm)].map((m) => m[1])
  const dvList = [...dvs.matchAll(/^\s*dn\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/gm)].map((m) => m.slice(1, 5).map(Number))

  // 그룹별 트레이너
  const groups = new Map()
  let cur = null, tr = null
  for (const line of parties.split('\n')) {
    let m
    if ((m = line.match(/^(\w+Group):/))) { cur = []; groups.set(m[1], cur); tr = null; continue }
    if (!cur) continue
    if ((m = line.match(/^\s*db "([^"]*)@",\s*(TRAINERTYPE_\w+)/))) {
      tr = { name: m[1], type: m[2], team: [] }
      cur.push(tr)
      continue
    }
    if (!tr || !(m = line.match(/^\s*db (.+)$/))) continue
    const a = m[1].split(';')[0].split(',').map((s) => s.trim())
    if (a[0] === '-1') { tr = null; continue }
    const mon = { level: Number(a[0]), species: a[1] }
    let i = 2
    if (/ITEM/.test(tr.type)) mon.item = a[i++]
    if (/MOVES/.test(tr.type)) mon.moves = a.slice(i, i + 4)
    tr.team.push(mon)
  }

  const trainers = []
  const byKey = new Map()
  classes.forEach((c, ci) => {
    const list = groups.get(groupLabels[ci]) ?? []
    list.forEach((p, i) => {
      const constId = c.members[i] ?? `${c.id}_${i + 1}`
      const team = p.team.map((mon) => {
        const species = speciesId(mon.species)
        const out = { species, level: mon.level, item: itemId(mon.item) }
        if (mon.moves) out.moves = mon.moves.map(moveId).filter(Boolean)
        else { out.moves = defaultMoves(versionGroup, species, mon.level); out.defaultMoves = true }
        return compact(out)
      })
      const t = {
        id: `${c.id}_${constId}`,
        classId: c.id,
        class: titleCase(classNames[ci]),
        name: p.name === '?' ? null : titleCase(p.name),
        locations: [],
        dv: dvList[ci],
        team,
      }
      trainers.push(t)
      byKey.set(`${c.id}:${constId}`, t)
    })
  })

  for (const f of await list(repo, 'maps')) {
    if (!f.endsWith('.asm')) continue
    const src = await read(repo, `maps/${f}`)
    for (const m of src.matchAll(/^\s*(?:trainer|loadtrainer) (\w+), (\w+)/gm)) {
      const t = byKey.get(`${m[1]}:${m[2]}`)
      const where = mapLabel(f.replace(/\.asm$/, ''))
      if (t && !t.locations.includes(where)) t.locations.push(where)
    }
  }

  for (const t of trainers) {
    if (/^RIVAL/.test(t.classId)) { t.name = 'Silver'; t.class = 'Rival' }
    compact(t)
  }
  return trainers
}
