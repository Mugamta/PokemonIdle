// 포켓몬 도트 목록 (public/data/sprites.json, scripts/build-sprites.mjs 로 생성)
import { shallowRef } from 'vue'

export type SpriteSource = 'pmd' | 'bw'

export interface SpriteVariant {
  /** 포켓몬 안에서 고유한 키: 'pmd' | 'pmd-0005' | 'bw' */
  k: string
  src: SpriteSource
  label: string
  /** 공식 도트 여부 (false = 팬 도트) */
  official: boolean
  /** 작가 번호 (SpriteData.artists) */
  by: number[]
  /** public/sprites/ 기준 경로 */
  file: string
  /** 뒷모습 이미지 (BW). PMD 는 시트의 방향 줄을 사용 */
  back?: string
  /** PMD 애니메이션: [프레임 너비, 높이, 프레임 수, 한 바퀴 ms, 방향 줄 수] */
  anim?: [number, number, number, number, number]
}

export interface SpriteArtist {
  name: string
  url?: string
  official?: boolean
}

export interface SpriteData {
  artists: SpriteArtist[]
  /** 키 = 포켓몬 id */
  variants: Record<string, SpriteVariant[]>
}

/** 설정의 '기본 도트' 선택지 */
export type SpriteDefault = 'fan' | 'official' | SpriteSource

export const SPRITE_DEFAULTS: { id: SpriteDefault; label: string; desc: string }[] = [
  { id: 'fan', label: '팬 도트 우선', desc: '팬이 그린 도트가 있으면 그것을, 없으면 공식 도트를 씁니다.' },
  { id: 'pmd', label: 'PMD', desc: '불가사의 던전 스타일 애니메이션 도트 (PMD Sprite Collab).' },
  { id: 'bw', label: 'BW 스타일', desc: '블랙·화이트 도트. 6세대부터는 Smogon 팬 도트입니다.' },
  { id: 'official', label: '공식 도트 우선', desc: '공식 도트(불가사의 던전, 블랙·화이트)가 있으면 그것을, 없으면 팬 도트를 씁니다.' },
]

export const SOURCE_NAMES: Record<SpriteSource, string> = {
  pmd: 'PMD Sprite Collab',
  bw: 'Pokémon Showdown',
}

export const spriteData = shallowRef<SpriteData | null>(null)
let promise: Promise<void> | null = null

export function loadSprites(): Promise<void> {
  promise ??= fetch(`${import.meta.env.BASE_URL}data/sprites.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} sprites.json`)
      return r.json() as Promise<SpriteData>
    })
    .then((d) => {
      spriteData.value = d
    })
    .catch((e) => {
      promise = null
      throw e
    })
  return promise
}

export const spriteUrl = (v: SpriteVariant, back = false) =>
  `${import.meta.env.BASE_URL}sprites/${back && v.back ? v.back : v.file}`

/** 기본 설정별 출처 우선순위 */
const ORDER: Record<SpriteSource, SpriteSource[]> = {
  pmd: ['pmd', 'bw'],
  bw: ['bw', 'pmd'],
}

/** 기본 설정에 따라 고른 도트 (개별 선택 무시) */
export function defaultVariant(list: SpriteVariant[], pref: SpriteDefault): SpriteVariant | undefined {
  if (pref === 'fan') {
    const fan = list.filter((v) => !v.official)
    // PMD 기본 > PMD 대체 버전 > BW 스타일 순 (목록 순서가 이미 그렇게 정렬되어 있음)
    return fan[0] ?? defaultVariant(list, 'pmd')
  }
  if (pref === 'official') {
    // BW(블랙·화이트) > PMD 공식 순, 공식이 없으면 BW 스타일 팬 도트
    return list.find((v) => v.official && v.src === 'bw') ?? list.find((v) => v.official) ?? defaultVariant(list, 'bw')
  }
  for (const src of ORDER[pref]) {
    const v = list.find((x) => x.src === src)
    if (v) return v
  }
  return list[0]
}

/** 실제로 보여줄 도트: 개별 선택 > 기본 설정 */
export function resolveVariant(
  list: SpriteVariant[] | undefined,
  pref: SpriteDefault,
  choice?: string,
): SpriteVariant | undefined {
  if (!list?.length) return undefined
  return (choice && list.find((v) => v.k === choice)) || defaultVariant(list, pref)
}

export function artistNames(v: SpriteVariant): string {
  const artists = spriteData.value?.artists ?? []
  return v.by.map((i) => artists[i]?.name ?? '?').join(', ')
}
