// 테스트 환경: 게임이 fetch 로 불러오는 public/ 데이터를 디스크에서 직접 읽어 돌려줌
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PUBLIC_DIR = resolve(__dirname, '../public')

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  // BASE_URL('./' 또는 '/') 뒤의 경로만 사용
  const rel = url.replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/^\.?\//, '')
  try {
    const body = await readFile(resolve(PUBLIC_DIR, rel), 'utf8')
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
  } catch {
    return new Response('not found', { status: 404 })
  }
}) as typeof fetch
