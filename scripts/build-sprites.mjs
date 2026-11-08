// 포켓몬 도트 이미지를 내려받고, 포켓몬별로 고를 수 있는 도트 목록과 작가 크레딧을 만든다.
// 사용: node scripts/build-sprites.mjs
//
// 출처
//   pmd      PMD Sprite Collab (CC BY-NC 4.0). CHUNSOFT 표기는 공식(불가사의 던전), 그 외는 팬 도트
//            기본 도트 + Alternate / Altcolor / Beta 버전
//   bw       Pokémon Showdown gen5 도트. 1~5세대는 공식(블랙·화이트), 6세대~는 Smogon Sprite Project 팬 도트
//   (PokeAPI 기본 도트는 1~5세대는 BW 와 같고 6세대~는 Smogon 팬 도트와 같아서 따로 받지 않음)
//
// 결과
//   public/sprites/{pmd,bw,bw-back}/...  이미지 (이미 있으면 다시 받지 않음)
//   public/data/sprites.json                  포켓몬별 도트 목록 + 작가 목록
//   CREDITS.md 의 SPRITE-CREDITS 구간         작가별로 묶은 크레딧
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, 'scripts', '.cache', 'sprites')
const OUT_IMG = path.join(ROOT, 'public', 'sprites')
const OUT_JSON = path.join(ROOT, 'public', 'data', 'sprites.json')
const CREDITS_MD = path.join(ROOT, 'CREDITS.md')

const PMD_RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/'
const SHOWDOWN = 'https://play.pokemonshowdown.com/'

/** PMD 에서 함께 제공할 대체 버전 이름 */
const PMD_ALT = /^(Alternate\d*|Altcolor|Beta)$/
const PMD_ALT_LABEL = { Alternate: '대체', Altcolor: '색 보정', Beta: '베타' }

// ---------- 내려받기 ----------

async function fetchRetry(url, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      if (i + 1 >= tries) throw e
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

/** 캐시 파일이 있으면 그대로, 없으면 받아서 저장. 404 는 null (빈 표시 파일로 기억) */
async function cached(file, url) {
  const missing = file + '.404'
  if (existsSync(file)) return readFile(file)
  if (existsSync(missing)) return null
  await mkdir(path.dirname(file), { recursive: true })
  const buf = await fetchRetry(url)
  await writeFile(buf ? file : missing, buf ?? '')
  return buf
}

/** 동시에 limit 개씩 실행 */
async function pool(items, limit, fn) {
  let i = 0
  let done = 0
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const item = items[i++]
      await fn(item)
      if (++done % 100 === 0) process.stdout.write(`  ${done}/${items.length}\r`)
    }
  })
  await Promise.all(workers)
  process.stdout.write(`  ${items.length}/${items.length}\n`)
}

// ---------- PMD AnimData.xml ----------

function parseAnims(xml) {
  const anims = {}
  for (const m of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const body = m[1]
    const tag = (t) => body.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1]
    const name = tag('Name')
    anims[name] = {
      copyOf: tag('CopyOf'),
      w: Number(tag('FrameWidth')),
      h: Number(tag('FrameHeight')),
      durations: [...body.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((d) => Number(d[1])),
    }
  }
  return anims
}

/** Idle 애니메이션 정보 (CopyOf 를 따라감). 반환: { file, w, h, frames, ms } */
function idleAnim(anims) {
  let name = 'Idle'
  for (let i = 0; i < 5 && anims[name]?.copyOf; i++) name = anims[name].copyOf
  const a = anims[name] ?? anims.Walk
  if (!a || !a.w) return null
  if (!anims[name]) name = 'Walk'
  // PMD 는 1/60초 단위
  const ms = Math.round((a.durations.reduce((x, y) => x + y, 0) * 1000) / 60)
  return { file: `${name}-Anim.png`, w: a.w, h: a.h, frames: a.durations.length, ms }
}

// ---------- 작가 ----------

const artists = []
const artistIndex = new Map()
/** 폼 id → 기본 폼 번호 (크레딧 정렬용) */
const formNum = new Map()

/** credit_names.txt: Name \t Discord \t Contact */
async function loadCreditNames() {
  const txt = (await cached(path.join(CACHE, 'credit_names.txt'), PMD_RAW + 'credit_names.txt')).toString('utf8')
  const map = new Map()
  for (const line of txt.split(/\r?\n/).slice(1)) {
    const [name, discord, contact] = line.split('\t')
    if (discord) map.set(discord.trim(), { name: name?.trim(), contact: contact?.trim() })
  }
  return map
}

function artist(key, info) {
  if (!artistIndex.has(key)) {
    artistIndex.set(key, artists.length)
    artists.push(info)
  }
  return artistIndex.get(key)
}

function pmdArtist(key, names) {
  const known = names.get(key)
  const discordId = key.match(/^<@!?(\d+)>$/)?.[1]
  let name = known?.name || (discordId ? `Discord ${discordId}` : key)
  let contact = known?.contact
  // 연락처가 Discord 멘션이면 링크로 쓸 수 없으므로 생략
  if (contact && !/^https?:\/\//.test(contact)) contact = undefined
  const official = key === 'CHUNSOFT'
  if (official) name = 'Spike Chunsoft (Pokémon Mystery Dungeon)'
  return artist(`pmd:${key}`, { name, ...(contact && { url: contact }), ...(official && { official: true }) })
}

// ---------- 메인 ----------

async function main() {
  const dex = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'dex', 'index.json'), 'utf8'))
  console.log(`포켓몬 ${dex.length}종`)

  console.log('PMD tracker.json, Showdown pokedex 받는 중…')
  const tracker = JSON.parse(await cached(path.join(CACHE, 'tracker.json'), PMD_RAW + 'tracker.json'))
  const names = await loadCreditNames()
  const sdDex = JSON.parse(await cached(path.join(CACHE, 'showdown-pokedex.json'), SHOWDOWN + 'data/pokedex.json'))
  const sdIdByNum = new Map()
  for (const [id, p] of Object.entries(sdDex)) {
    if (p.num > 0 && !p.baseSpecies && !sdIdByNum.has(p.num)) sdIdByNum.set(p.num, id)
  }

  const GAMEFREAK = artist('gamefreak', { name: 'Game Freak / The Pokémon Company', official: true })
  const SMOGON = artist('smogon', {
    name: 'Smogon Sprite Project contributors',
    url: 'https://www.smogon.com/forums/threads/smogon-sprite-project.3647722/',
  })

  /** @type {Record<string, any[]>} */
  const variants = {}
  const jobs = []
  for (const p of dex) {
    const list = (variants[p.id] = [])
    const n4 = String(p.num).padStart(4, '0')
    const node = tracker[n4]

    // PMD 기본 + 대체 버전
    if (node) {
      const groups = [{ key: 'pmd', dir: n4, node, label: 'PMD' }]
      for (const [sub, g] of Object.entries(node.subgroups ?? {})) {
        if (PMD_ALT.test(g.name ?? '')) {
          const base = g.name.replace(/\d+$/, '')
          const suffix = g.name.slice(base.length)
          groups.push({ key: `pmd-${sub}`, dir: `${n4}/${sub}`, node: g, label: `PMD ${PMD_ALT_LABEL[base]}${suffix}` })
        }
      }
      for (const g of groups) {
        if (!(g.node.sprite_complete >= 1)) continue
        const credit = g.node.sprite_credit ?? {}
        const keys = [credit.primary, ...(credit.secondary ?? [])].filter(Boolean)
        const v = {
          k: g.key,
          src: 'pmd',
          label: g.label,
          official: credit.primary === 'CHUNSOFT',
          by: keys.map((k) => pmdArtist(k, names)),
        }
        list.push(v)
        jobs.push(async () => {
          const xml = await cached(path.join(CACHE, 'pmd', g.dir, 'AnimData.xml'), `${PMD_RAW}sprite/${g.dir}/AnimData.xml`)
          const anim = xml && idleAnim(parseAnims(xml.toString('utf8')))
          const png = anim && (await cached(path.join(CACHE, 'pmd', g.dir, anim.file), `${PMD_RAW}sprite/${g.dir}/${anim.file}`))
          if (!png) return void (v.missing = true)
          const rel = `pmd/${g.dir.replace('/', '-')}.png`
          await save(rel, png)
          v.file = rel
          // PNG IHDR 의 높이로 방향 줄 수 계산 (보통 8줄: 아래, 우하, 우, 우상, 위, 좌상, 좌, 좌하)
          const rows = Math.max(1, Math.round(png.readUInt32BE(20) / anim.h))
          v.anim = [anim.w, anim.h, anim.frames, anim.ms, rows]
        })
      }
    }

    // Showdown BW 스타일
    const sdId = sdIdByNum.get(p.num)
    if (sdId) {
      const v = {
        k: 'bw',
        src: 'bw',
        label: p.gen <= 5 ? 'BW' : 'BW 스타일',
        official: p.gen <= 5,
        by: [p.gen <= 5 ? GAMEFREAK : SMOGON],
      }
      list.push(v)
      jobs.push(async () => {
        const png = await cached(path.join(CACHE, 'bw', `${sdId}.png`), `${SHOWDOWN}sprites/gen5/${sdId}.png`)
        if (!png) return void (v.missing = true)
        const rel = `bw/${p.num}.png`
        await save(rel, png)
        v.file = rel
        const back = await cached(path.join(CACHE, 'bw-back', `${sdId}.png`), `${SHOWDOWN}sprites/gen5-back/${sdId}.png`)
        if (back) {
          await save(`bw-back/${p.num}.png`, back)
          v.back = `bw-back/${p.num}.png`
        }
      })
    }

  }

  // 메가진화·원시회귀 폼 (public/data/dex/forms.json, scripts/build-forms.mjs 로 생성)
  // PMD: 같은 번호의 Mega / Mega_X / Primal 하위 폴더, Showdown: '기본이름-megax' 등
  const formsFile = path.join(ROOT, 'public', 'data', 'dex', 'forms.json')
  const forms = existsSync(formsFile) ? JSON.parse(await readFile(formsFile, 'utf8')).forms : {}
  const dexById = new Map(dex.map((p) => [p.id, p]))
  for (const [id, f] of Object.entries(forms)) {
    const p = dexById.get(f.base)
    if (!p) continue
    const list = (variants[id] = [])
    formNum.set(id, p.num)
    const suffix = id.match(/-(mega(?:-[xyz])?|primal)$/)[1].replace(/-/g, '_') // mega, mega_x, primal
    const pmdName = suffix.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('_') // Mega, Mega_X, Primal
    const n4 = String(p.num).padStart(4, '0')
    const sub = Object.entries(tracker[n4]?.subgroups ?? {}).find(([, g]) => g.name === pmdName)
    if (sub && sub[1].sprite_complete >= 1) {
      const [subId, g] = sub
      const credit = g.sprite_credit ?? {}
      const keys = [credit.primary, ...(credit.secondary ?? [])].filter(Boolean)
      const v = { k: 'pmd', src: 'pmd', label: 'PMD', official: credit.primary === 'CHUNSOFT', by: keys.map((k) => pmdArtist(k, names)) }
      list.push(v)
      const dir = `${n4}/${subId}`
      jobs.push(async () => {
        const xml = await cached(path.join(CACHE, 'pmd', dir, 'AnimData.xml'), `${PMD_RAW}sprite/${dir}/AnimData.xml`)
        const anim = xml && idleAnim(parseAnims(xml.toString('utf8')))
        const png = anim && (await cached(path.join(CACHE, 'pmd', dir, anim.file), `${PMD_RAW}sprite/${dir}/${anim.file}`))
        if (!png) return void (v.missing = true)
        const rel = `pmd/${dir.replace('/', '-')}.png`
        await save(rel, png)
        v.file = rel
        const rows = Math.max(1, Math.round(png.readUInt32BE(20) / anim.h))
        v.anim = [anim.w, anim.h, anim.frames, anim.ms, rows]
      })
    }
    const sdBase = sdIdByNum.get(p.num)
    if (sdBase) {
      const sdId = `${sdBase}-${suffix.replace(/_/g, '')}` // charizard-megax, kyogre-primal
      const v = { k: 'bw', src: 'bw', label: 'BW 스타일', official: false, by: [SMOGON] }
      list.push(v)
      jobs.push(async () => {
        const png = await cached(path.join(CACHE, 'bw', `${sdId}.png`), `${SHOWDOWN}sprites/gen5/${sdId}.png`)
        if (!png) return void (v.missing = true)
        const rel = `bw/${p.num}-${suffix}.png`
        await save(rel, png)
        v.file = rel
        const back = await cached(path.join(CACHE, 'bw-back', `${sdId}.png`), `${SHOWDOWN}sprites/gen5-back/${sdId}.png`)
        if (back) {
          await save(`bw-back/${p.num}-${suffix}.png`, back)
          v.back = `bw-back/${p.num}-${suffix}.png`
        }
      })
    }
  }

  console.log(`이미지 ${jobs.length}개 처리 중…`)
  await pool(jobs, 12, (job) => job())

  // 받지 못한 도트는 목록에서 제외
  let total = 0
  for (const id of Object.keys(variants)) {
    variants[id] = variants[id].filter((v) => !v.missing)
    total += variants[id].length
    // 도트가 없는 폼은 목록에서 빼서 기본 폼 도트를 쓰게 함
    if (!variants[id].length && formNum.has(id)) delete variants[id]
  }

  // 사용되지 않은 작가 제거 후 번호 재배치
  const used = new Set(Object.values(variants).flatMap((l) => l.flatMap((v) => v.by)))
  const remap = new Map()
  const finalArtists = []
  artists.forEach((a, i) => {
    if (used.has(i)) {
      remap.set(i, finalArtists.length)
      finalArtists.push(a)
    }
  })
  for (const l of Object.values(variants)) for (const v of l) v.by = v.by.map((i) => remap.get(i))

  await writeFile(OUT_JSON, JSON.stringify({ artists: finalArtists, variants }))
  console.log(`도트 ${total}개, 작가 ${finalArtists.length}명 → ${path.relative(ROOT, OUT_JSON)}`)

  await writeCredits(dex, finalArtists, variants)
}

async function save(rel, buf) {
  const file = path.join(OUT_IMG, rel)
  if (existsSync(file)) return
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, buf)
}

/** CREDITS.md 에 작가별 크레딧 구간을 갱신 */
async function writeCredits(dex, artistList, variants) {
  const enName = new Map()
  const tracker = JSON.parse(await readFile(path.join(CACHE, 'tracker.json'), 'utf8'))
  for (const p of dex) enName.set(p.id, tracker[String(p.num).padStart(4, '0')]?.name?.replace(/_/g, ' ').trim() ?? p.id)
  const numOf = new Map([...dex.map((p) => [p.id, p.num]), ...formNum])
  for (const [id] of formNum) enName.set(id, id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))

  const works = artistList.map(() => [])
  for (const [id, list] of Object.entries(variants)) {
    for (const v of list) {
      if (v.src !== 'pmd') continue
      const label = v.k === 'pmd' ? '' : ` (${v.label.replace('PMD ', '')})`
      for (const a of v.by) works[a].push({ num: numOf.get(id), text: `#${String(numOf.get(id)).padStart(4, '0')} ${enName.get(id)}${label}` })
    }
  }

  const lines = []
  lines.push('### PMD Sprite Collab artists', '')
  lines.push('Grouped by artist. Names are taken from SpriteCollab `credit_names.txt`; artists without a registered name are credited by Discord ID, as SpriteCollab does by default.', '')
  const order = artistList
    .map((a, i) => ({ a, i, n: works[i].length }))
    .filter((x) => x.n)
    .sort((x, y) => Number(!!x.a.official) - Number(!!y.a.official) || y.n - x.n || x.a.name.localeCompare(y.a.name))
  for (const { a, i } of order) {
    const name = a.url ? `[${a.name}](${a.url})` : a.name
    const list = works[i].sort((x, y) => x.num - y.num).map((w) => w.text)
    lines.push(`<details><summary><b>${name}</b> (${list.length})</summary>`, '', list.join(', '), '', '</details>', '')
  }
  lines.push('### Pokémon Showdown sprites', '')
  lines.push('- Gen 1–5: official *Pokémon Black / White* sprites © Game Freak / The Pokémon Company.')
  lines.push('- Gen 6+: [Smogon Sprite Project](https://www.smogon.com/forums/threads/smogon-sprite-project.3647722/) contributors (various artists), as distributed by [Pokémon Showdown](https://pokemonshowdown.com/).')

  const START = '<!-- SPRITE-CREDITS:START (scripts/build-sprites.mjs 가 자동 생성) -->'
  const END = '<!-- SPRITE-CREDITS:END -->'
  const md = await readFile(CREDITS_MD, 'utf8')
  const block = `${START}\n${lines.join('\n')}\n${END}`
  const re = /<!-- SPRITE-CREDITS:START[^>]*-->[\s\S]*?<!-- SPRITE-CREDITS:END -->/
  if (!re.test(md)) throw new Error('CREDITS.md 에 SPRITE-CREDITS 구간이 없습니다')
  await writeFile(CREDITS_MD, md.replace(re, block))
  console.log('CREDITS.md 갱신')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
