// 포켓몬 리그(사천왕 4명 + 챔피언) 데이터 → src/data/league.json
// 사용: node scripts/build-league.mjs (public/data/trainers/*.json 을 먼저 만들어 둘 것: build-trainers.mjs)
//
// 지방(작품) key → 도전 순서대로 5명. 첫 대전 엔트리만 씀 (재대결 엔트리 제외)
// 챔피언이 플레이어 스타팅에 따라 엔트리가 바뀌는 작품(라이벌 챔피언)은 variants 에 모두 넣음
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(ROOT, '..', 'public', 'data', 'trainers')
const OUT = path.join(ROOT, '..', 'src', 'data', 'league.json')

// [작품 파일, [트레이너 id 또는 id 목록(스타팅별 변형)] ]
const LEAGUES = {
  'kanto-rby': ['red-blue', ['LORELEI_1', 'BRUNO_1', 'AGATHA_1', 'LANCE_1', ['RIVAL3_1', 'RIVAL3_2', 'RIVAL3_3']]],
  'johto-gs': ['gold-silver', ['WILL_WILL1', 'KOGA_KOGA1', 'BRUNO_BRUNO1', 'KAREN_KAREN1', 'CHAMPION_LANCE']],
  'johto-c': ['crystal', ['WILL_WILL1', 'KOGA_KOGA1', 'BRUNO_BRUNO1', 'KAREN_KAREN1', 'CHAMPION_LANCE']],
  'hoenn-rs': ['ruby-sapphire', ['SIDNEY', 'PHOEBE', 'GLACIA', 'DRAKE', 'STEVEN']],
  'hoenn-e': ['emerald', ['SIDNEY', 'PHOEBE', 'GLACIA', 'DRAKE', 'WALLACE']],
  'kanto-frlg': [
    'firered-leafgreen',
    [
      'ELITE_FOUR_LORELEI',
      'ELITE_FOUR_BRUNO',
      'ELITE_FOUR_AGATHA',
      'ELITE_FOUR_LANCE',
      ['CHAMPION_FIRST_SQUIRTLE', 'CHAMPION_FIRST_BULBASAUR', 'CHAMPION_FIRST_CHARMANDER'],
    ],
  ],
  'sinnoh-dp': [
    'diamond-pearl',
    ['ELITE_FOUR_AARON_AARON', 'ELITE_FOUR_BERTHA_BERTHA', 'ELITE_FOUR_FLINT_FLINT', 'ELITE_FOUR_LUCIEN_LUCIAN', 'CHAMPION_CYNTHIA'],
  ],
  'sinnoh-pt': ['platinum', ['ELITE_FOUR_AARON', 'ELITE_FOUR_BERTHA', 'ELITE_FOUR_FLINT', 'ELITE_FOUR_LUCIAN', 'CHAMPION_CYNTHIA']],
  'johto-hgss': [
    'heartgold-soulsilver',
    ['ELITE_FOUR_WILL_WILL', 'ELITE_FOUR_KOGA_KOGA', 'ELITE_FOUR_BRUNO_BRUNO', 'ELITE_FOUR_KAREN_KAREN', 'CHAMPION_LANCE'],
  ],
}

/** 1·2세대 DV(0~15) → 개체값, 3·4세대는 이미 0~31 */
const ivOf = (t, m) => (m.iv != null ? m.iv : t.dv ? Math.min(31, Math.round((t.dv.reduce((a, b) => a + b, 0) / t.dv.length) * 2)) : 0)

function mon(t, m) {
  const out = { species: m.species, level: m.level, iv: ivOf(t, m) }
  if (m.moves?.length) out.moves = m.moves
  if (m.item) out.item = m.item
  if (typeof m.abilitySlot === 'number') out.abilitySlot = m.abilitySlot
  return out
}

const files = {}
const out = {}
for (const [key, [file, ids]] of Object.entries(LEAGUES)) {
  files[file] ??= JSON.parse(await readFile(path.join(SRC, `${file}.json`), 'utf8'))
  const byId = new Map(files[file].trainers.map((t) => [t.id, t]))
  out[key] = ids.map((id) => {
    const list = (Array.isArray(id) ? id : [id]).map((i) => {
      const t = byId.get(i)
      if (!t) throw new Error(`${file}: ${i} 없음`)
      return t
    })
    const t = list[0]
    return {
      id: t.classId,
      name: t.nameKo ?? t.name,
      title: t.classKo ?? t.class,
      champion: /champion/i.test(t.class),
      variants: list.map((v) => v.team.map((m) => mon(v, m))),
    }
  })
}
await writeFile(OUT, JSON.stringify(out, null, 1) + '\n')
console.log(`league.json: ${Object.keys(out).length}개 지방`)
