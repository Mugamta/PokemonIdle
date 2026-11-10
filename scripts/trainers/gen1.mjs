// 1세대 (pret/pokered, pret/pokeyellow)
// - data/trainers/parties.asm : 클래스별 파티 목록 (주석 = 등장 장소)
// - data/trainers/names.asm   : 클래스 이름
// - data/trainers/special_moves.asm : 관장·사천왕 등의 고정 기술
import { read, list, speciesId, moveId, defaultMoves, titleCase, mapLabel, compact } from './common.mjs'

const DV = [9, 8, 8, 8] // 1세대 트레이너 포켓몬 DV (공격, 방어, 스피드, 특수) 고정

const GYM_ORDER = ['BROCK', 'MISTY', 'LT_SURGE', 'ERIKA', 'KOGA', 'SABRINA', 'BLAINE', 'GIOVANNI']
const STARTER_MOVE = { venusaur: 'mega-drain', charizard: 'fire-blast', blastoise: 'blizzard' }

/** 'BrockData' → 'BROCK', 'LtSurgeData' → 'LT_SURGE', 'JrTrainerMData' → 'JR_TRAINER_M' */
const labelToConst = (l) =>
  l.replace(/Data$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toUpperCase()

export async function gen1(repo, versionGroup) {
  const [parties, names, special] = await Promise.all([
    read(repo, 'data/trainers/parties.asm'),
    read(repo, 'data/trainers/names.asm'),
    read(repo, 'data/trainers/special_moves.asm'),
  ])
  const classNames = [...names.matchAll(/li "([^"]*)"/g)].map((m) => m[1])
  const pointers = [...parties.matchAll(/^\s*dw (\w+Data)/gm)].map((m) => m[1])

  // 라벨별 파티 목록
  const groups = new Map()
  let cur = null, loc = null
  for (const line of parties.split('\n')) {
    let m
    if ((m = line.match(/^(\w+Data):/))) { cur = []; groups.set(m[1], cur); loc = null; continue }
    if (!cur) continue
    if ((m = line.match(/^;\s*(.+)$/))) { loc = m[1].trim(); continue }
    if ((m = line.match(/^\s*db (.+)$/))) {
      const t = m[1].split(';')[0].split(',').map((s) => s.trim()).filter(Boolean)
      if (t[t.length - 1] === '0') t.pop()
      const team = []
      if (t[0] === '$FF') for (let i = 1; i + 1 < t.length; i += 2) team.push({ level: Number(t[i]), species: t[i + 1] })
      else for (let i = 1; i < t.length; i++) team.push({ level: Number(t[0]), species: t[i] })
      cur.push({ loc, team })
    }
  }

  const trainers = []
  const byKey = new Map()
  pointers.forEach((label, ci) => {
    const cls = labelToConst(label)
    const list = groups.get(label) ?? []
    list.forEach((p, i) => {
      const team = p.team.map((mon) => {
        const species = speciesId(mon.species)
        return { species, level: mon.level, moves: defaultMoves(versionGroup, species, mon.level), defaultMoves: true }
      })
      const t = {
        id: `${cls}_${i + 1}`,
        classId: cls,
        class: titleCase(classNames[ci]),
        name: null,
        locations: p.loc && !/unused/i.test(p.loc) ? [p.loc] : [],
        unused: /unused/i.test(p.loc ?? '') || undefined,
        dv: DV,
        team,
      }
      trainers.push(t)
      byKey.set(`${cls}:${i + 1}`, t)
    })
  })

  const setMove = (t, monIdx, slot, raw) => {
    const mon = t?.team[monIdx]
    if (!mon) return
    const mv = moveId(raw)
    while (mon.moves.length <= slot) mon.moves.push(null)
    mon.moves[slot] = mv
    mon.defaultMoves = false
  }

  if (/SpecialTrainerMoves/.test(special)) {
    // 피카츄 버전: db 클래스, 번호 / db 몇 번째 포켓몬, 몇 번째 기술, 기술 (모두 1부터)
    let t = null
    for (const line of special.split('\n')) {
      const m = line.match(/^\s*db (.+)$/)
      if (!m) continue
      const a = m[1].split(';')[0].split(',').map((s) => s.trim())
      if (a.length === 2) t = byKey.get(`${a[0]}:${Number(a[1])}`)
      else if (a.length === 3) setMove(t, Number(a[0]) - 1, Number(a[1]) - 1, a[2])
    }
  } else {
    // 적·녹·청: 관장 고정 기술 (n번째 포켓몬의 3번째 기술) + 사천왕 (5번째 포켓몬의 3번째 기술)
    const lone = [...special.split('TeamMoves')[0].matchAll(/^\s*db (\d+), (\w+)/gm)]
    lone.forEach((m, i) => {
      const cls = GYM_ORDER[i]
      const t = byKey.get(`${cls}:${cls === 'GIOVANNI' ? 3 : 1}`)
      setMove(t, Number(m[1]), 2, m[2])
    })
    for (const m of special.split('TeamMoves')[1].matchAll(/^\s*db (\w+),\s*(\w+)/gm)) {
      for (const t of trainers.filter((x) => x.classId === m[1])) setMove(t, 4, 2, m[2])
    }
    for (const t of trainers.filter((x) => x.classId === 'RIVAL3')) {
      setMove(t, 0, 2, 'SKY_ATTACK')
      const last = t.team[t.team.length - 1]
      if (STARTER_MOVE[last.species]) setMove(t, t.team.length - 1, 2, STARTER_MOVE[last.species])
    }
  }

  // 주석에 장소가 없는 트레이너는 맵 오브젝트(OPP_클래스, 번호)에서 장소를 찾음
  for (const f of await list(repo, 'data/maps/objects')) {
    const src = await read(repo, `data/maps/objects/${f}`)
    for (const m of src.matchAll(/OPP_(\w+), (\d+)/g)) {
      const t = byKey.get(`${m[1]}:${Number(m[2])}`)
      if (t && !t.locations.length) t.locations.push(mapLabel(f.replace(/\.asm$/, '')))
    }
  }

  // 1세대는 관장·사천왕이 클래스 자체 → 이름과 역할로 나눔
  const ELITE = ['LORELEI', 'BRUNO', 'AGATHA', 'LANCE']
  for (const t of trainers) {
    if (/^RIVAL/.test(t.classId)) {
      t.name = 'Blue'
      t.class = t.classId === 'RIVAL3' ? 'Champion' : 'Rival'
    } else if (GYM_ORDER.includes(t.classId) || ELITE.includes(t.classId)) {
      t.name = t.class
      t.class = ELITE.includes(t.classId) ? 'Elite Four'
        : t.classId === 'GIOVANNI' && t.id !== 'GIOVANNI_3' ? 'Rocket Boss' : 'Gym Leader'
    } else if (t.classId === 'PROF_OAK') {
      t.name = 'Oak'
    }
    for (const mon of t.team) {
      mon.moves = mon.moves.filter(Boolean) // 빈 칸이 있던 자리에 고정 기술이 들어간 경우
      compact(mon)
    }
    compact(t)
  }
  return trainers
}
