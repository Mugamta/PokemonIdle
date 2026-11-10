// 트레이너 데이터 변환 공통 도구
// - pret 상수(SPECIES_NIDORAN_M, MOVE_THUNDERSHOCK, ITEM_ORAN_BERRY ...) → PokeAPI 식별자
// - 원작 규칙대로의 기본 기술 계산 (기술을 지정하지 않은 트레이너 포켓몬)
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const PRET = path.join(ROOT, '.cache', 'pret')
const CSV_DIR = path.join(ROOT, '.cache', 'csv')

export const read = (repo, file) => readFile(path.join(PRET, repo, file), 'utf8')
export const readBin = (repo, file) => readFile(path.join(PRET, repo, file))
export const list = (repo, dir) => readdir(path.join(PRET, repo, dir))

function parseCsv(text) {
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}
const csv = async (name) => parseCsv(await readFile(path.join(CSV_DIR, name + '.csv'), 'utf8'))

const key = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

// pret 표기와 PokeAPI 표기가 글자만으로는 맞지 않는 것들
const MOVE_ALIAS = {
  HIJUMPKICK: 'high-jump-kick', FAINTATTACK: 'feint-attack', SMELLINGSALT: 'smelling-salts',
  VICEGRIP: 'vise-grip', PSYCHICM: 'psychic', SANDATTACK: 'sand-attack', BUBBLEBEAM: 'bubble-beam',
  SOLARBEAM: 'solar-beam', DOUBLEEDGE: 'double-edge', SELFDESTRUCT: 'self-destruct', CONVERSION2: 'conversion-2',
  DRAGONBREATH: 'dragon-breath', EXTREMESPEED: 'extreme-speed', ANCIENTPOWER: 'ancient-power',
  DYNAMICPUNCH: 'dynamic-punch', SONICBOOM: 'sonic-boom', THUNDERPUNCH: 'thunder-punch', THUNDERSHOCK: 'thunder-shock',
  POISONPOWDER: 'poison-powder', SLEEPPOWDER: 'sleep-powder', STUNSPORE: 'stun-spore', SMOKESCREEN: 'smokescreen',
  DOUBLESLAP: 'double-slap', WILLOWISP: 'will-o-wisp', GRASSWHISTLE: 'grass-whistle', ROCKSMASH: 'rock-smash',
}
const SPECIES_ALIAS = { NIDORANF: 'nidoran-f', NIDORANM: 'nidoran-m', MRMIME: 'mr-mime', MIMEJR: 'mime-jr', UNOWN: 'unown' }
const ITEM_ALIAS = {
  // 2세대 열매 (PokeAPI 식별자)
  PSNCUREBERRY: 'psncureberry', PRZCUREBERRY: 'przcureberry', BURNTBERRY: 'burnt-berry', ICEBERRY: 'ice-berry',
  MINTBERRY: 'mint-berry', MIRACLEBERRY: 'miracleberry', MYSTERYBERRY: 'mysteryberry', GOLDBERRY: 'gold-berry',
  BITTERBERRY: 'bitter-berry', BERRY: 'berry', POLKADOTBOW: 'polkadot-bow', PINKBOW: 'pink-bow',
  BLACKGLASSES: 'black-glasses', NEVERMELTICE: 'never-melt-ice', TWISTEDSPOON: 'twisted-spoon',
  SILVERPOWDER: 'silver-powder', DEEPSEATOOTH: 'deep-sea-tooth', DEEPSEASCALE: 'deep-sea-scale',
  BRIGHTPOWDER: 'bright-powder', KINGSROCK: 'kings-rock', BLACKBELT: 'black-belt', BERSERKGENE: 'berserk-gene',
  XDEFEND: 'x-defense', XSPECIAL: 'x-sp-atk', FULLRESTORE: 'full-restore', HYPERPOTION: 'hyper-potion',
  SUPERPOTION: 'super-potion', MAXPOTION: 'max-potion', FULLHEAL: 'full-heal', XACCURACY: 'x-accuracy',
  GUARDSPEC: 'guard-spec', DIREHIT: 'dire-hit', XATTACK: 'x-attack', XSPEED: 'x-speed', XDEFENSE: 'x-defense',
  XSPATK: 'x-sp-atk', XSPDEF: 'x-sp-def', LEFTOVERS: 'leftovers', QUICKCLAW: 'quick-claw',
}

const [species, moves, items, pokemonMoves, vgs, pokemon] = await Promise.all(
  ['pokemon_species', 'moves', 'items', 'pokemon_moves', 'version_groups', 'pokemon'].map(csv),
)

const speciesByKey = new Map(species.map((s) => [key(s.identifier), s.identifier]))
const moveByKey = new Map(moves.filter((m) => Number(m.id) < 10000).map((m) => [key(m.identifier), m.identifier]))
const itemByKey = new Map(items.map((i) => [key(i.identifier), i.identifier]))
const moveIdent = new Map(moves.map((m) => [m.id, m.identifier]))
const speciesIdOf = new Map(species.map((s) => [s.identifier, s.id]))
const defaultPokemonOf = new Map(pokemon.filter((p) => p.is_default === '1').map((p) => [p.species_id, p.id]))
const vgIdOf = new Map(vgs.map((v) => [v.identifier, v.id]))

/** 변환하지 못한 상수 (버전별 보고용) */
export const unknown = { species: new Set(), moves: new Set(), items: new Set() }

const strip = (s, prefix) => s.replace(prefix, '')

export function speciesId(raw) {
  if (!raw) return null
  const k = key(strip(raw, /^SPECIES_/))
  const id = SPECIES_ALIAS[k] ?? speciesByKey.get(k)
  if (!id) unknown.species.add(raw)
  return id ?? raw.toLowerCase()
}

export function moveId(raw) {
  if (!raw) return null
  const s = strip(raw, /^MOVE_/)
  if (s === 'NONE' || s === 'NO_MOVE' || s === '0') return null
  const k = key(s)
  const id = MOVE_ALIAS[k] ?? moveByKey.get(k)
  if (!id) unknown.moves.add(raw)
  return id ?? raw.toLowerCase()
}

export function itemId(raw) {
  if (!raw) return null
  const s = strip(raw, /^ITEM_/)
  if (s === 'NONE' || s === 'NO_ITEM' || s === '0' || s === 'null') return null
  const k = key(s)
  const id = ITEM_ALIAS[k] ?? itemByKey.get(k)
  if (!id) unknown.items.add(raw)
  return id ?? raw.toLowerCase()
}

// 버전 그룹별 레벨업 기술표: `${vg}:${pokemonId}` → [{ level, move }]
const levelup = new Map()
for (const r of pokemonMoves) {
  if (r.pokemon_move_method_id !== '1') continue
  const k = `${r.version_group_id}:${r.pokemon_id}`
  let list = levelup.get(k)
  if (!list) levelup.set(k, (list = []))
  list.push({ level: Number(r.level), order: Number(r.order || 0), move: moveIdent.get(r.move_id) })
}
for (const list of levelup.values()) list.sort((a, b) => a.level - b.level || a.order - b.order)

/**
 * 원작 규칙의 기본 기술: 해당 레벨까지 레벨업으로 배우는 기술을 순서대로 배우고,
 * 4개가 넘으면 가장 오래된 기술부터 잊는다.
 */
export function defaultMoves(versionGroup, species, level) {
  const pid = defaultPokemonOf.get(speciesIdOf.get(species))
  const list = levelup.get(`${vgIdOf.get(versionGroup)}:${pid}`)
  if (!list) return []
  const known = []
  for (const { level: l, move } of list) {
    if (l > level) break
    if (known.includes(move)) continue
    known.push(move)
    if (known.length > 4) known.shift()
  }
  return known
}

/** 'BUG CATCHER' → 'Bug Catcher', 'POKéMANIAC' → 'Pokémaniac', 'JR.TRAINER♂' → 'Jr.Trainer♂' */
export function titleCase(s) {
  if (!s) return s
  return s
    .replace(/\{PKMN\}|<PKMN>|<PK><MN>/gi, 'PKMN')
    .toLowerCase()
    .replace(/(^|[\s.&'-])([a-zé])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\bPkmn\b/g, 'Pokémon')
}

/** 'Route30BerryHouse' → 'Route 30 Berry House', 'route_202' → 'Route 202' */
export function mapLabel(s) {
  return s
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim()
}

/** 개체값 0~255 배율(3·4세대) → 0~31 */
export const ivFromScale = (n) => Math.floor((Number(n) * 31) / 255)

/** 안 쓰는 키 정리 */
export function compact(o) {
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v == null || v === false || (Array.isArray(v) && v.length === 0)) delete o[k]
  }
  return o
}
