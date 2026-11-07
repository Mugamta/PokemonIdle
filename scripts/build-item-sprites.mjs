// 아이템 도트 이미지를 내려받는다 (원작 가방 아이콘, PokeAPI sprites 저장소)
// 사용: node scripts/build-item-sprites.mjs
//
// 대상: src/data/shop.ts 의 SHOP_ITEMS 에 있는 아이템 (id = PokeAPI 아이템 identifier)
// 결과: public/sprites/items/{id}.png (이미 있으면 다시 받지 않음)
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'sprites', 'items')
const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/'

const shop = await readFile(path.join(ROOT, 'src', 'data', 'shop.ts'), 'utf8')
const ids = [...new Set([...shop.matchAll(/\{ id: '([a-z0-9-]+)'/g)].map((m) => m[1]))]

await mkdir(OUT, { recursive: true })
let got = 0
const missing = []
for (const id of ids) {
  const file = path.join(OUT, `${id}.png`)
  if (existsSync(file)) continue
  const res = await fetch(`${BASE}${id}.png`)
  if (!res.ok) {
    missing.push(id)
    continue
  }
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  got++
}
console.log(`아이템 ${ids.length}개 중 새로 받음 ${got}개${missing.length ? `, 없음: ${missing.join(', ')}` : ''}`)
