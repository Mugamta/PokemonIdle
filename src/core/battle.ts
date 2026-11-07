// 전투 계산 (5세대 이후 공식 기준). 상태 저장과 무관한 순수 계산만 담당
import { battleData, STATUS_LABELS, type MoveExtra, type StageKey, type Status } from '../data/battle'
import { dexData, learnsets, type DexEntry, type MoveInfo } from '../data/dex'
import { calcStats } from '../data/natures'

export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTIES: { id: Difficulty; label: string; desc: string }[] = [
  { id: 'easy', label: '쉬움', desc: '상대가 기술을 완전히 무작위로 고릅니다. 경험치 0.75배.' },
  { id: 'normal', label: '보통', desc: '상대가 지금 내 포켓몬에게 가장 강한 기술을 우선 씁니다. 경험치 1배.' },
  { id: 'hard', label: '어려움', desc: '상대 행동은 지금은 보통과 같습니다. (상대 능력치 보정 추가 예정) 경험치 1.25배.' },
]

/** 난이도별 경험치 배율 */
export const DIFFICULTY_EXP: Record<Difficulty, number> = { easy: 0.75, normal: 1, hard: 1.25 }

export type Stages = Partial<Record<StageKey, number>>

/** 전투 계산에 필요한 한 마리의 상태 */
export interface Battler {
  name: string
  species: string
  level: number
  nature: string
  ivs: number[]
  evs: number[]
  hp: number
  moves: string[]
  stages: Stages
  /** 상태이상 */
  status?: Status | null
  /** 잠듦: 남은 턴 수 */
  sleep?: number
  /** 맹독: 지난 턴 수 (데미지 = n/16) */
  toxic?: number
}

export interface MoveData extends MoveInfo {
  num: number
  extra: MoveExtra
}

/** 기술이 없을 때 쓰는 발버둥 */
const STRUGGLE: MoveData = {
  id: 'struggle',
  ko: '발버둥',
  type: 'typeless',
  cls: 'physical',
  power: 50,
  acc: null,
  pp: null,
  num: 165,
  extra: {},
}

let moveNumById: Map<string, number> | null = null
export function moveData(id: string): MoveData | null {
  if (id === 'struggle') return STRUGGLE
  const dex = dexData.value
  if (!dex) return null
  const info = dex.movesById[id]
  if (!info) return null
  if (!moveNumById) moveNumById = new Map(Object.entries(dex.moves).map(([n, m]) => [m.id, Number(n)]))
  const num = moveNumById.get(id) ?? 0
  return { ...info, num, extra: battleData.value?.moves[num] ?? {} }
}

export const speciesOf = (id: string): DexEntry | undefined => dexData.value?.index.find((p) => p.id === id)

export function statsOf(b: Pick<Battler, 'species' | 'level' | 'ivs' | 'evs' | 'nature'>): number[] {
  const sp = speciesOf(b.species)
  return sp ? calcStats(sp.stats, b.level, b.ivs, b.evs, b.nature, b.species) : [1, 1, 1, 1, 1, 1]
}

export const maxHpOf = (b: Pick<Battler, 'species' | 'level' | 'ivs' | 'evs' | 'nature'>) => statsOf(b)[0]!

// ---------- 랭크 ----------
const STAT_INDEX = { atk: 1, def: 2, spa: 3, spd: 4, spe: 5 } as const
const stageMult = (s: number) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s))
const accStageMult = (s: number) => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s))

function effStat(b: Battler, key: keyof typeof STAT_INDEX, ignore?: 'neg' | 'pos'): number {
  const raw = statsOf(b)[STAT_INDEX[key]]!
  let s = b.stages[key] ?? 0
  if (ignore === 'neg' && s < 0) s = 0
  if (ignore === 'pos' && s > 0) s = 0
  return Math.floor(raw * stageMult(s))
}

/** 스피드 (마비 시 절반) */
export const speedOf = (b: Battler) => Math.floor(effStat(b, 'spe') * (b.status === 'par' ? 0.5 : 1))

// ---------- 상성 ----------
export function typeEffect(moveType: string, defender: Battler): number {
  const chart = battleData.value?.types[moveType]
  const types = speciesOf(defender.species)?.types ?? []
  return types.reduce((m, t) => m * (chart?.[t] ?? 1), 1)
}

const isDamaging = (m: MoveData) => m.cls !== 'status' && (m.power != null || m.extra.fixed != null)

// ---------- 데미지 ----------
/** 한 타의 데미지. rand: 85~100, crit: 급소 여부 */
export function damageOf(att: Battler, def: Battler, m: MoveData, rand: number, crit: boolean): number {
  const eff = m.type === 'typeless' ? 1 : typeEffect(m.type, def)
  if (eff === 0) return 0
  const fx = m.extra.fixed
  if (fx != null) return fx === 'level' ? att.level : fx === 'half' ? Math.max(1, Math.floor(def.hp / 2)) : fx
  const physical = m.cls === 'physical'
  // 급소: 공격 측 불리한 랭크, 방어 측 유리한 랭크 무시
  const a = effStat(att, physical ? 'atk' : 'spa', crit ? 'neg' : undefined)
  const d = effStat(def, physical ? 'def' : 'spd', crit ? 'pos' : undefined)
  let dmg = Math.floor(Math.floor((Math.floor((2 * att.level) / 5 + 2) * (m.power ?? 0) * a) / d) / 50) + 2
  if (crit) dmg = Math.floor(dmg * 1.5)
  dmg = Math.floor((dmg * rand) / 100)
  const attTypes = speciesOf(att.species)?.types ?? []
  if (attTypes.includes(m.type)) dmg = Math.floor(dmg * 1.5)
  dmg = Math.floor(dmg * eff)
  // 화상: 물리 데미지 절반
  if (physical && att.status === 'brn') dmg = Math.floor(dmg / 2)
  return Math.max(1, dmg)
}

const avgHits = (m: MoveData) => {
  const h = m.extra.hits
  if (!h) return 1
  // 2~5회: 2·3회 35%, 4·5회 15%
  return h[0] === 2 && h[1] === 5 ? 3.1 : (h[0] + h[1]) / 2
}

/** 기대 데미지 (명중률·타수 반영, 급소 제외, 난수 평균) */
export function expectedDamage(att: Battler, def: Battler, m: MoveData): number {
  if (!isDamaging(m)) return 0
  const acc = m.acc == null ? 1 : Math.min(1, (m.acc / 100) * accStageMult((att.stages.acc ?? 0) - (def.stages.eva ?? 0)))
  return damageOf(att, def, m, 92.5, false) * avgHits(m) * acc
}

// ---------- AI ----------
export function chooseMove(att: Battler, def: Battler, difficulty: Difficulty): string {
  const moves = att.moves.map(moveData).filter((m): m is MoveData => !!m)
  if (!moves.length) return 'struggle'
  if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)]!.id
  // 보통·어려움: 기대 데미지가 가장 큰 기술 (같으면 무작위), 공격기가 없으면 무작위
  let best: MoveData[] = []
  let bestDmg = 0
  for (const m of moves) {
    const d = Math.min(expectedDamage(att, def, m), def.hp)
    if (d > bestDmg + 1e-9) {
      best = [m]
      bestDmg = d
    } else if (Math.abs(d - bestDmg) < 1e-9) best.push(m)
  }
  const pool = bestDmg > 0 ? best : moves
  return pool[Math.floor(Math.random() * pool.length)]!.id
}

// ---------- 턴 진행 ----------
export type Side = 'player' | 'enemy'

const STAGE_NAMES: Record<StageKey, string> = {
  atk: '공격',
  def: '방어',
  spa: '특수공격',
  spd: '특수방어',
  spe: '스피드',
  acc: '명중률',
  eva: '회피율',
}

/** 숫자 끝자리 읽기의 받침 (0영 1일 3삼 6육 7칠 8팔) */
const DIGIT_BATCHIM: Record<string, number> = { '0': 21, '1': 8, '3': 16, '6': 1, '7': 8, '8': 8 }

/** 마지막 글자의 받침 번호 (0 = 없음). 한글·숫자가 아니면 null */
function batchim(word: string): number | null {
  // 괄호 등 뒤쪽 기호는 무시 (예: "알프의 유적 (바깥)")
  const w = word.replace(/[\s)\]]+$/, '')
  const ch = w[w.length - 1] ?? ''
  if (/\d/.test(ch)) return DIGIT_BATCHIM[ch] ?? 0
  const c = ch.charCodeAt(0)
  if (c < 0xac00 || c > 0xd7a3) return null
  return (c - 0xac00) % 28
}

/** 받침 유무에 따라 조사 선택 (예: josa('피카츄', '은', '는') → '피카츄는') */
export function josa(word: string, withBatchim: string, without: string): string {
  const b = batchim(word)
  return word + (b ? withBatchim : without)
}

/** '으로/로' (받침이 없거나 ㄹ 받침이면 '로') */
export function ro(word: string): string {
  const b = batchim(word)
  return word + (b && b !== 8 ? '으로' : '로')
}

function applyStage(target: Battler, key: StageKey, delta: number, log: string[]) {
  const cur = target.stages[key] ?? 0
  const next = Math.max(-6, Math.min(6, cur + delta))
  const name = `${target.name}의 ${STAGE_NAMES[key]}`
  if (next === cur) {
    log.push(`${josa(name, '은', '는')} 더 ${delta > 0 ? '올라가지' : '떨어지지'} 않는다!`)
    return
  }
  target.stages[key] = next
  const amount = Math.abs(delta) >= 3 ? '매우 크게 ' : Math.abs(delta) === 2 ? '크게 ' : ''
  log.push(`${josa(name, '이', '가')} ${amount}${delta > 0 ? '올라갔다' : '떨어졌다'}!`)
}

const CRIT_CHANCE = [1 / 24, 1 / 8, 1 / 2, 1]
const rollHits = (h: [number, number]) => {
  if (h[0] === 2 && h[1] === 5) {
    const r = Math.random()
    return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5
  }
  return h[0] + Math.floor(Math.random() * (h[1] - h[0] + 1))
}

// ---------- 상태이상 ----------
const STATUS_IMMUNE: Record<Status, string[]> = {
  par: ['electric'],
  slp: [],
  frz: ['ice'],
  brn: ['fire'],
  psn: ['poison', 'steel'],
  tox: ['poison', 'steel'],
}
const INFLICT_MSG: Record<Status, (n: string) => string> = {
  par: (n) => `${josa(n, '은', '는')} 마비되어 기술이 나오기 어려워졌다!`,
  slp: (n) => `${josa(n, '은', '는')} 잠들어 버렸다!`,
  frz: (n) => `${josa(n, '은', '는')} 얼어붙었다!`,
  brn: (n) => `${josa(n, '은', '는')} 화상을 입었다!`,
  psn: (n) => `${josa(n, '은', '는')} 독에 걸렸다!`,
  tox: (n) => `${josa(n, '은', '는')} 맹독을 입었다!`,
}

/** 상태이상을 건다. 성공 여부 반환. direct = 변화기로 직접 건 경우 (실패 메시지 표시) */
export function inflictStatus(target: Battler, s: Status, log: string[], direct: boolean): boolean {
  const types = speciesOf(target.species)?.types ?? []
  if (target.status || STATUS_IMMUNE[s].some((t) => types.includes(t))) {
    if (direct) {
      log.push(
        target.status === s
          ? `${josa(target.name, '은', '는')} 이미 ${STATUS_LABELS[s]} 상태다!`
          : `그러나 ${target.name}에게는 효과가 없었다!`,
      )
    }
    return false
  }
  target.status = s
  if (s === 'slp') target.sleep = 1 + Math.floor(Math.random() * 3)
  if (s === 'tox') target.toxic = 0
  log.push(INFLICT_MSG[s](target.name))
  return true
}

export function cureStatus(b: Pick<Battler, 'status' | 'sleep' | 'toxic'>) {
  b.status = null
  b.sleep = undefined
  b.toxic = undefined
}

/** 행동 전 상태이상 판정. 행동할 수 있으면 true */
function canMove(att: Battler, log: string[]): boolean {
  switch (att.status) {
    case 'slp':
      if ((att.sleep ?? 0) > 0) {
        att.sleep = (att.sleep ?? 1) - 1
        log.push(`${josa(att.name, '은', '는')} 쿨쿨 잠들어 있다.`)
        return false
      }
      cureStatus(att)
      log.push(`${josa(att.name, '은', '는')} 눈을 떴다!`)
      return true
    case 'frz':
      if (Math.random() < 0.2) {
        cureStatus(att)
        log.push(`${att.name}의 얼음이 녹았다!`)
        return true
      }
      log.push(`${josa(att.name, '은', '는')} 얼어버려서 움직일 수 없다!`)
      return false
    case 'par':
      if (Math.random() < 0.25) {
        log.push(`${josa(att.name, '은', '는')} 몸이 저려서 움직일 수 없다!`)
        return false
      }
      return true
    default:
      return true
  }
}

/** 턴 종료 시 화상·독 데미지 */
function residual(b: Battler, log: string[]) {
  if (b.hp <= 0) return
  const max = maxHpOf(b)
  if (b.status === 'brn') {
    b.hp = Math.max(0, b.hp - Math.max(1, Math.floor(max / 16)))
    log.push(`${josa(b.name, '은', '는')} 화상 데미지를 입었다!`)
  } else if (b.status === 'psn' || b.status === 'tox') {
    const n = b.status === 'tox' ? (b.toxic = Math.min(15, (b.toxic ?? 0) + 1)) : 2
    b.hp = Math.max(0, b.hp - Math.max(1, Math.floor((max * n) / 16)))
    log.push(`${josa(b.name, '은', '는')} 독에 의한 데미지를 입었다!`)
  }
}

function useMove(att: Battler, def: Battler, moveId: string, log: string[]) {
  const m = moveData(moveId) ?? STRUGGLE
  log.push(`${att.name}의 ${m.ko}!`)
  const ex = m.extra
  const selfOnly = m.cls === 'status' && (ex.self || (ex.heal && !ex.stats))

  // 명중 판정 (자신에게 쓰는 변화기는 생략)
  if (!selfOnly && m.acc != null) {
    const acc = (m.acc / 100) * accStageMult((att.stages.acc ?? 0) - (def.stages.eva ?? 0))
    if (Math.random() >= acc) {
      log.push(`그러나 ${att.name}의 공격은 빗나갔다!`)
      return
    }
  }

  if (m.cls === 'status') {
    let did = false
    if (ex.heal) {
      const max = maxHpOf(att)
      const before = att.hp
      att.hp = Math.min(max, att.hp + Math.floor((max * ex.heal) / 100))
      log.push(att.hp > before ? `${josa(att.name, '은', '는')} 체력을 회복했다!` : `${att.name}의 체력은 이미 가득하다!`)
      did = true
    }
    for (const [key, delta] of ex.stats ?? []) {
      if (key === 'hp') continue
      applyStage(ex.self ? att : def, key, delta, log)
      did = true
    }
    if (ex.ail) {
      // 전기 타입 변화기(전기자석파 등)는 땅 타입에게 효과 없음
      if (m.type === 'electric' && typeEffect(m.type, def) === 0) log.push(`그러나 ${def.name}에게는 효과가 없었다!`)
      else inflictStatus(def, ex.ail, log, true)
      did = true
    }
    if (!did) log.push('그러나 아무 일도 일어나지 않았다!')
    return
  }

  // 공격기
  const eff = m.type === 'typeless' ? 1 : typeEffect(m.type, def)
  if (eff === 0) {
    log.push(`${def.name}에게는 효과가 없는 것 같다…`)
    return
  }
  const hits = ex.hits ? rollHits(ex.hits) : 1
  let total = 0
  let crits = 0
  let landed = 0
  for (let i = 0; i < hits && def.hp > 0; i++) {
    const crit = ex.fixed == null && Math.random() < CRIT_CHANCE[Math.min(3, ex.crit ?? 0)]!
    const dmg = Math.min(def.hp, damageOf(att, def, m, 85 + Math.floor(Math.random() * 16), crit))
    def.hp -= dmg
    total += dmg
    landed++
    if (crit) crits++
  }
  if (crits) log.push(crits > 1 || landed > 1 ? `급소에 ${crits}번 맞았다!` : '급소에 맞았다!')
  if (ex.fixed == null && eff > 1) log.push('효과가 굉장했다!')
  if (ex.fixed == null && eff < 1) log.push('효과가 별로인 듯하다…')
  if (landed > 1) log.push(`${landed}번 맞았다!`)
  log.push(`${josa(def.name, '은', '는')} ${total}의 데미지를 입었다.`)

  // 흡수 / 반동
  if (ex.drain && total > 0) {
    const amount = Math.max(1, Math.floor((total * Math.abs(ex.drain)) / 100))
    if (ex.drain > 0) {
      att.hp = Math.min(maxHpOf(att), att.hp + amount)
      log.push(`${ro(def.name)}부터 체력을 흡수했다!`)
    } else {
      att.hp = Math.max(0, att.hp - amount)
      log.push(`${josa(att.name, '은', '는')} 반동으로 데미지를 입었다!`)
    }
  }
  if (m.id === 'struggle') {
    att.hp = Math.max(0, att.hp - Math.max(1, Math.floor(maxHpOf(att) / 4)))
    log.push(`${josa(att.name, '은', '는')} 반동으로 데미지를 입었다!`)
  }

  // 불꽃 타입 공격을 맞으면 얼음이 녹음
  if (def.status === 'frz' && m.type === 'fire' && total > 0 && def.hp > 0) {
    cureStatus(def)
    log.push(`${def.name}의 얼음이 녹았다!`)
  }

  // 부가 능력 변화
  if (ex.stats && (ex.chance == null || Math.random() * 100 < ex.chance)) {
    const target = ex.self ? att : def
    if (target.hp > 0) for (const [key, delta] of ex.stats) if (key !== 'hp') applyStage(target, key, delta, log)
  }
  // 부가 상태이상
  if (ex.ail && def.hp > 0 && total > 0 && (ex.ailChance == null || Math.random() * 100 < ex.ailChance)) {
    inflictStatus(def, ex.ail, log, false)
  }
}

export interface TurnResult {
  lines: string[]
  /** 내 포켓몬이 실제로 기술을 썼는지 (PP 소모 판단용) */
  playerMoved: boolean
}

/** 한 턴 진행. player/enemy 는 직접 변경됨. playerMove = null 이면 내 쪽은 행동하지 않음 (아이템 사용 등) */
export function runTurn(player: Battler, enemy: Battler, playerMove: string | null, enemyMove: string): TurnResult {
  const log: string[] = []
  let playerMoved = false
  const pri = (id: string) => moveData(id)?.extra.pri ?? 0
  const pp = playerMove ? pri(playerMove) : 0
  const ep = pri(enemyMove)
  const ps = speedOf(player)
  const es = speedOf(enemy)
  const playerFirst = pp !== ep ? pp > ep : ps !== es ? ps > es : Math.random() < 0.5
  const mine: [Battler, Battler, string | null] = [player, enemy, playerMove]
  const theirs: [Battler, Battler, string | null] = [enemy, player, enemyMove]
  for (const [att, def, move] of playerFirst ? [mine, theirs] : [theirs, mine]) {
    if (!move || att.hp <= 0 || def.hp <= 0) continue
    if (!canMove(att, log)) continue
    if (att === player) playerMoved = true
    useMove(att, def, move, log)
  }
  // 턴 종료: 화상·독 (둘 다 살아 있을 때만)
  if (player.hp > 0 && enemy.hp > 0) {
    for (const b of playerFirst ? [player, enemy] : [enemy, player]) residual(b, log)
  }
  return { lines: log, playerMoved }
}

// ---------- 기술 배치 ----------
/** 원작 야생 포켓몬 규칙: 해당 레벨까지 배운 레벨업 기술 중 마지막 4개 */
export function wildMoveset(species: string, level: number, vg?: string): string[] {
  const dex = dexData.value
  if (!dex) return []
  let list: [number, number][] | undefined = vg ? battleData.value?.wild[vg]?.[species] : undefined
  if (!list) {
    // 해당 게임 데이터가 없으면 통합 레벨업 기술표로 대신
    list = (learnsets.value?.[species] ?? [])
      .filter((e): e is [number, 'level', number] => e[1] === 'level')
      .map((e) => [e[0], e[2]] as [number, number])
      .sort((a, b) => a[1] - b[1])
  }
  const ids: string[] = []
  for (const [num, lv] of list) {
    if (lv > level) continue
    const id = dex.moves[num]?.id
    if (!id) continue
    const i = ids.indexOf(id)
    if (i >= 0) ids.splice(i, 1)
    ids.push(id)
  }
  return ids.slice(-4)
}

/** 레벨업 시 새로 배우는 기술 (해금된 세대의 세대 한정 레벨업 기술 포함) */
export function movesLearnedAt(species: string, level: number, unlockedGens: number[]): string[] {
  const dex = dexData.value
  const list = learnsets.value?.[species]
  if (!dex || !list) return []
  const out: string[] = []
  for (const e of list) {
    let hit = false
    if (e[1] === 'level') hit = e[2] === level
    else if (e[1] === 'gen' && e[3]) {
      const lvs = Object.entries(e[3]).filter(([g]) => unlockedGens.includes(Number(g))).map(([, l]) => l)
      hit = lvs.length > 0 && Math.min(...lvs) === level
    }
    const id = hit ? dex.moves[e[0]]?.id : undefined
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/** 1레벨부터 지정 레벨까지 레벨업으로 배울 수 있는 기술 전체 */
export function movesUpToLevel(species: string, level: number, unlockedGens: number[]): string[] {
  const out: string[] = []
  for (let lv = 0; lv <= level; lv++)
    for (const id of movesLearnedAt(species, lv, unlockedGens)) if (!out.includes(id)) out.push(id)
  return out
}

// ---------- 경험치 ----------
export function expAtLevel(species: string, level: number): number {
  const g = battleData.value?.species[species]?.growth ?? 2
  return battleData.value?.growth[g]?.[Math.max(1, Math.min(100, level))] ?? 0
}

/** 5세대 이후 경험치 공식. trainer = 트레이너(보스) 배틀 1.5배, multiplier = 난이도 등 추가 배율 */
export function expGain(foe: string, foeLevel: number, myLevel: number, trainer: boolean, multiplier = 1): number {
  const b = battleData.value?.species[foe]?.exp ?? 50
  const a = trainer ? 1.5 : 1
  const scale = Math.pow((2 * foeLevel + 10) / (foeLevel + myLevel + 10), 2.5)
  return Math.floor(((a * b * foeLevel) / 5) * scale * multiplier) + 1
}
