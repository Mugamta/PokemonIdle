// 본가 트레이너 데이터 → public/data/trainers/<버전>.json
// 사용: node scripts/build-trainers.mjs
//
// 원본: pret 디컴파일 저장소 (scripts/.cache/pret 에 sparse clone, 없으면 내려받음)
//   1세대 pokered(적·녹·청)/pokeyellow, 2세대 pokegold/pokecrystal,
//   3세대 pokeruby/pokeemerald/pokefirered, 4세대 pokediamond/pokeplatinum/pokeheartgold
// 포켓몬·기술·도구는 PokeAPI 식별자 (scripts/.cache/csv, build-dex.mjs 와 같은 CSV)
//
// 한국어: 클래스와 주요 인물만 공식 한국어 이름을 붙임 (scripts/trainers/ko.mjs).
// 한국어판이 없었던 작품의 일반 트레이너 이름 등 공식 한국어가 없는 이름은 영문판 이름을 그대로 씀.
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { PRET, ROOT, unknown } from './trainers/common.mjs'
import { gen1 } from './trainers/gen1.mjs'
import { gen2 } from './trainers/gen2.mjs'
import { gen3 } from './trainers/gen3.mjs'
import { platinum, diamondPearl, heartgoldSoulsilver } from './trainers/gen4.mjs'
import { canonClass, canonName, classKo, nameKo } from './trainers/ko.mjs'

const OUT = path.join(ROOT, '..', 'public', 'data', 'trainers')

// sparse checkout 할 경로 (트레이너·맵 스크립트만)
const REPOS = {
  pokered: ['/constants/', '/data/trainers/', '/data/maps/objects/'],
  pokeyellow: ['/constants/', '/data/trainers/', '/data/maps/objects/'],
  pokegold: ['/constants/', '/data/trainers/', '/maps/*.asm'],
  pokecrystal: ['/constants/', '/data/trainers/', '/maps/*.asm'],
  pokeruby: ['/include/constants/', '/src/data/trainer*', '/src/data/text/trainer_class_names_en.h', '/data/maps/*/scripts.inc', '/data/scripts/'],
  pokeemerald: ['/include/constants/', '/src/data/trainer*', '/src/data/text/trainer_class_names.h', '/data/maps/*/scripts.inc', '/data/scripts/',
    '/data/maps/*/map.json', '/data/layouts/'], // 맵 오브젝트 위치·지형 충돌 (2인 동시 시선 더블)
  pokefirered: ['/include/constants/', '/src/data/trainer*', '/src/data/text/trainer_class_names.h', '/data/maps/*/scripts.inc', '/data/scripts/', '/src/vs_seeker.c'],
  pokediamond: ['/files/poketool/trainer/', '/include/constants/'],
  pokeplatinum: ['/res/trainers/data/', '/res/text/trainer_class_names.json', '/generated/', '/res/field/maps/'],
  pokeheartgold: ['/files/poketool/trainer/', '/include/constants/', '/files/fielddata/eventdata/', '/files/fielddata/script/scr_seq/', '/files/msgdata/msg/msg_0730.json'],
}

function ensureRepos() {
  for (const [repo, paths] of Object.entries(REPOS)) {
    const dir = path.join(PRET, repo)
    const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } })
    if (!existsSync(dir)) {
      console.log(`clone pret/${repo}`)
      execFileSync('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', `https://github.com/pret/${repo}.git`, dir], { stdio: 'inherit' })
    }
    git('sparse-checkout', 'set', '--no-cone', ...paths)
    git('checkout', '-q', 'HEAD')
  }
}

const sha = (repo) => execFileSync('git', ['-C', path.join(PRET, repo), 'rev-parse', '--short', 'HEAD']).toString().trim()

// 같은 데이터를 쓰는 버전은 한 파일로 (versions: PokeAPI version 식별자)
// sightDoubles: 두 트레이너 시야가 겹치면 더블배틀 (에메랄드만. 루비·사파이어, 파이어레드·리프그린은 차례로 싱글배틀)
const GEN3_FILES = (trainers, classNames, opts = {}) => ({ trainers, classNames, ...opts })
const BUILDS = [
  { id: 'red-blue', gen: 1, versions: ['red', 'blue'], repo: 'pokered', run: () => gen1('pokered', 'red-blue') },
  { id: 'yellow', gen: 1, versions: ['yellow'], repo: 'pokeyellow', run: () => gen1('pokeyellow', 'yellow') },
  { id: 'gold-silver', gen: 2, versions: ['gold', 'silver'], repo: 'pokegold', run: () => gen2('pokegold', 'gold-silver') },
  { id: 'crystal', gen: 2, versions: ['crystal'], repo: 'pokecrystal', run: () => gen2('pokecrystal', 'crystal') },
  { id: 'ruby-sapphire', gen: 3, versions: ['ruby', 'sapphire'], repo: 'pokeruby',
    run: () => gen3('pokeruby', 'ruby-sapphire', GEN3_FILES('src/data/trainers_en.h', 'src/data/text/trainer_class_names_en.h')) },
  { id: 'emerald', gen: 3, versions: ['emerald'], repo: 'pokeemerald',
    run: () => gen3('pokeemerald', 'emerald', GEN3_FILES('src/data/trainers.h', 'src/data/text/trainer_class_names.h', { sightDoubles: true })) },
  { id: 'firered-leafgreen', gen: 3, versions: ['firered', 'leafgreen'], repo: 'pokefirered',
    run: () => gen3('pokefirered', 'firered-leafgreen', GEN3_FILES('src/data/trainers.h', 'src/data/text/trainer_class_names.h')) },
  { id: 'platinum', gen: 4, versions: ['platinum'], repo: 'pokeplatinum', run: () => platinum() },
  { id: 'diamond-pearl', gen: 4, versions: ['diamond', 'pearl'], repo: 'pokediamond', run: (done) => diamondPearl(done.platinum) },
  { id: 'heartgold-soulsilver', gen: 4, versions: ['heartgold', 'soulsilver'], repo: 'pokeheartgold', run: () => heartgoldSoulsilver() },
]

/** 전 세대 공통 후처리: 미사용 표시, 재대결 팀 장소 상속, 한국어 이름 */
function finish(trainers, gen) {
  const byId = new Map(trainers.map((t) => [t.id, t]))
  for (const t of trainers) {
    // pret 의 더미 트레이너 (자리만 있는 데이터, 4세대 기본 이름 'Mickey')
    if (/DUMMY|_UNUSED$/.test(t.id) || (gen === 4 && t.name === 'Mickey')) t.unused = true
    if (!t.locations?.length) {
      const base = t.id.replace(/(_REMATCH(_\d+)?|_\d+)$/, '')
      const from = byId.get(base) ?? byId.get(`${base}_1`)
      if (from && from !== t && from.locations?.length) { t.locations = [...from.locations]; t.locationsInherited = true }
    }
    t.class = canonClass(t.class)
    t.name = canonName(t.name)
    t.classKo = classKo(t.class)
    t.nameKo = nameKo(t.name, t.class, t.classId)
  }
  // 보기 좋은 키 순서
  return trainers.map(({ id, classId, class: cls, classKo: ck, name, nameKo: nk, ...rest }) =>
    Object.fromEntries(Object.entries({ id, classId, class: cls, classKo: ck, name, nameKo: nk, ...rest }).filter(([, v]) => v != null)),
  )
}

if (!process.argv.includes('--offline')) ensureRepos()
await mkdir(OUT, { recursive: true })
const done = {}
const index = []
for (const b of BUILDS) {
  const raw = await b.run(done)
  done[b.id.replace(/-.*/, '')] = raw
  done[b.id] = raw
  const trainers = finish(raw, b.gen)
  const file = { version: b.id, gen: b.gen, versions: b.versions, source: `pret/${b.repo}@${sha(b.repo)}`, trainers }
  await writeFile(path.join(OUT, `${b.id}.json`), JSON.stringify(file))
  const used = trainers.filter((t) => !t.unused)
  index.push({
    version: b.id, gen: b.gen, versions: b.versions, file: `${b.id}.json`,
    trainers: used.length, unused: trainers.length - used.length,
    noLocation: used.filter((t) => !t.locations?.length).length,
  })
  console.log(`${b.id.padEnd(22)} ${String(used.length).padStart(4)}명 (미사용 ${trainers.length - used.length}, 장소 없음 ${index.at(-1).noLocation})`)
}
await writeFile(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2))

for (const [k, s] of Object.entries(unknown)) if (s.size) console.warn(`변환 못 한 ${k}:`, [...s].join(', '))
