// 아이템 도트 이미지를 내려받는다 (원작 가방 아이콘, PokeAPI sprites 저장소)
// 사용: node scripts/build-item-sprites.mjs
//
// 대상: public/data/dex/items.json 의 모든 아이템 (id = PokeAPI 아이템 identifier)
//       기술머신은 아이템별 이미지가 없어서 타입별 이미지(tm-fire.png 등)를 받음
// 결과: public/sprites/items/{id}.png (이미 있으면 다시 받지 않음, 원본에 없는 아이템은 건너뜀)
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'sprites', 'items')
const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/'
const TYPES = ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass',
  'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy']

const items = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'dex', 'items.json'), 'utf8'))
const ids = [
  // 피크닉 용품은 모두 같은 그림이라 picnic-set 하나만 받음 (ItemIcon 에서 대신 씀)
  ...Object.entries(items)
    .filter(([k, v]) => v.pocket !== 'machines' && (v.cat !== 'picnic' || k === 'picnic-set'))
    .map(([k]) => k),
  ...TYPES.map((t) => `tm-${t}`),
  'hm-normal',
]

await mkdir(OUT, { recursive: true })
let got = 0
const missing = []
const queue = ids.filter((id) => !existsSync(path.join(OUT, `${id}.png`)))
// 동시에 8개씩
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const res = await fetch(`${BASE}${id}.png`)
      if (!res.ok) {
        missing.push(id)
        continue
      }
      await writeFile(path.join(OUT, `${id}.png`), Buffer.from(await res.arrayBuffer()))
      got++
    }
  }),
)
console.log(`아이템 ${ids.length}개 중 새로 받음 ${got}개, 원본에 없음 ${missing.length}개`)
