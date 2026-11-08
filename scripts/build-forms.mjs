// 메가진화·원시회귀 폼 데이터 → public/data/dex/forms.json
// 사용: node scripts/build-forms.mjs   (scripts/.cache/csv 의 PokeAPI CSV 사용, build-dex.mjs 를 먼저 실행해 캐시를 채움)
//
// 결과: {
//   forms: { [폼 id]: { base, kind: 'mega' | 'primal', ko, types, stats, ability(숫자 id), item?, move? } },
//   abilities: { [숫자 id]: { ko, text } }   // 도감 데이터(abilities.json)에 없는 폼 전용 특성
// }
// 메가스톤 대응은 public/data/pokemon.json 의 mega.item 과 아래 EXTRA_ITEMS 로 정함
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CSV_DIR = path.join(ROOT, 'scripts', '.cache', 'csv')
const OUT = path.join(ROOT, 'public', 'data', 'dex', 'forms.json')
const KO = '3'

/** pokemon.json 에 없는 폼의 메가스톤 / 진화 조건 */
const EXTRA_ITEMS = {
  'mewtwo-mega-x': 'mewtwonite-x',
  'mewtwo-mega-y': 'mewtwonite-y',
  'latias-mega': 'latiasite',
  'latios-mega': 'latiosite',
  'diancie-mega': 'diancite',
  'heatran-mega': 'heatranite',
  'darkrai-mega': 'darkranite',
  'zygarde-mega': 'zygardite',
  'zeraora-mega': 'zeraorite',
  'magearna-mega': 'magearnite',
  'tatsugiri-curly-mega': 'tatsugirinite',
  'floette-mega': 'floettite',
  'meowstic-male-mega': 'meowsticite',
  'kyogre-primal': 'blue-orb',
  'groudon-primal': 'red-orb',
}
/** 메가스톤 없이 기술로 메가진화 */
const MOVE_MEGA = { 'rayquaza-mega': 'dragon-ascent' }

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

const [pokemon, species, speciesNames, stats, ptypes, types, pabil, abilNames, abilFlavor, abilRows, vgs] = await Promise.all(
  ['pokemon', 'pokemon_species', 'pokemon_species_names', 'pokemon_stats', 'pokemon_types', 'types', 'pokemon_abilities', 'ability_names',
    'ability_flavor_text', 'abilities', 'version_groups'].map(csv),
)
const index = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'dex', 'index.json'), 'utf8'))
const dexAbilities = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'dex', 'abilities.json'), 'utf8'))
const items = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'dex', 'items.json'), 'utf8'))
const sd = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'pokemon.json'), 'utf8'))

const inDex = new Set(index.map((p) => p.id))
const dexByNum = new Map(index.map((p) => [p.num, p]))
const typeKey = Object.fromEntries(types.map((t) => [t.id, t.identifier]))
const nameKo = {}
for (const n of speciesNames) if (n.local_language_id === KO) nameKo[n.pokemon_species_id] = n.name
const statsBy = {}
for (const s of stats) (statsBy[s.pokemon_id] ??= [])[Number(s.stat_id) - 1] = Number(s.base_stat)
const typesBy = {}
for (const t of ptypes) (typesBy[t.pokemon_id] ??= [])[Number(t.slot) - 1] = typeKey[t.type_id]
const abilBy = {}
for (const a of pabil) (abilBy[a.pokemon_id] ??= []).push(a.ability_id)

// 메가스톤: identifier 에서 '-' 를 뺀 이름 → identifier
const itemByFlat = new Map(Object.keys(items).map((id) => [id.replace(/-/g, ''), id]))
const sdItem = new Map()
for (const p of Object.values(sd)) if (p.mega) sdItem.set(`${p.mega.from}|${p.forme}`, p.mega.item)
const flat = (s) => s.replace(/[^a-z0-9]/g, '')

const abilId = Object.fromEntries(abilRows.map((a) => [a.id, a.identifier]))
/** 한국어 이름이 아직 없는 특성: 영어 identifier 를 제목 형식으로 */
const titleCase = (id) => id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
const vgOrder = Object.fromEntries(vgs.map((v) => [v.id, Number(v.order)]))
const abilKo = Object.fromEntries(abilNames.filter((n) => n.local_language_id === KO).map((n) => [n.ability_id, n.name]))
const abilText = {}
for (const f of abilFlavor) {
  if (f.language_id !== KO) continue
  const o = vgOrder[f.version_group_id]
  if (!abilText[f.ability_id] || o > abilText[f.ability_id].o) abilText[f.ability_id] = { o, t: f.flavor_text.replace(/\s+/g, ' ').trim() }
}

const forms = {}
const extraAbilities = {}
const skipped = []
for (const p of pokemon) {
  const m = p.identifier.match(/^(.+)-(mega(?:-([xyz]))?|primal)$/)
  if (!m) continue
  // 기본 폼: 같은 이름의 포켓몬, 없으면 그 종의 대표 폼 (예: pyroar → pyroar-male). 다른 폼의 메가진화는 제외
  const speciesId = species.find((s) => s.id === p.species_id)?.identifier
  const base = inDex.has(m[1]) ? m[1] : m[1] === speciesId ? dexByNum.get(Number(p.species_id))?.id : undefined
  if (!base) {
    skipped.push(`${p.identifier} (기본 폼 ${m[1]} 없음)`)
    continue
  }
  const kind = m[2] === 'primal' ? 'primal' : 'mega'
  const suffix = (m[3] ?? '').toUpperCase()
  const ko = nameKo[p.species_id] ?? base
  // pokemon.json: from = 기본 폼 이름(하이픈 없음), forme = 'Mega' | 'Mega-X'
  const forme = kind === 'primal' ? 'Primal' : suffix ? `Mega-${suffix}` : 'Mega'
  const sdFlat = sdItem.get(`${flat(base)}|${forme}`) ?? sdItem.get(`${flat(base.split('-')[0])}|${forme}`)
  const item = EXTRA_ITEMS[p.identifier] ?? (sdFlat ? itemByFlat.get(sdFlat) : undefined)
  const move = MOVE_MEGA[p.identifier]
  if (!item && !move) {
    skipped.push(`${p.identifier} (메가스톤 모름)`)
    continue
  }
  if (item && !items[item]) {
    skipped.push(`${p.identifier} (아이템 ${item} 없음)`)
    continue
  }
  // 특성 데이터가 없는 폼은 기본 폼의 첫 특성
  const ability = abilBy[p.id] ? Number(abilBy[p.id][0]) : index.find((x) => x.id === base).abilities[0][0]
  if (!dexAbilities[ability]) extraAbilities[ability] = { ko: abilKo[ability] ?? titleCase(abilId[ability] ?? String(ability)), text: abilText[ability]?.t ?? '' }
  forms[p.identifier] = {
    base,
    kind,
    ko: kind === 'primal' ? `원시${ko}` : `메가${ko}${suffix}`,
    types: typesBy[p.id],
    stats: statsBy[p.id],
    ability,
    ...(item && { item }),
    ...(move && { move }),
  }
}

await writeFile(OUT, JSON.stringify({ forms, abilities: extraAbilities }))
console.log(`폼 ${Object.keys(forms).length}개, 추가 특성 ${Object.keys(extraAbilities).length}개 → ${path.relative(ROOT, OUT)}`)
if (skipped.length) console.log('제외:', skipped.join(', '))
