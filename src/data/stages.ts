// 스테이지 데이터.
// 지방 = 스테이지 번호 (예: 1스테이지 = 관동지방 적·녹·청·피카츄). 같은 지방도 작품별로 나눔.
// 육로로 이어진 지방은 하나로 묶음 (금·은 등의 성도지방에 엔딩 후 관동 포함)
// 세부 스테이지 = 지방 내 야생 포켓몬 출현 장소를 스토리 진행 순으로 나열 (예: 1-1 = 1번도로)
// 한국어 지명 출처: WikiDex "Lista de localizaciones en todos los idiomas"
//   출처에 한국어 표기가 없어 추정한 지명에는 `// 확인필요` 주석을 달아둠
import type { Gimmick } from '../core/gimmicks'
import { ENCOUNTERS, type EncounterSet } from './encounters'
import { KANTO_JOHTO_MAP, KANTO_MAP } from './maps/kantoJohto'
import { LEGACY_REGIONS, LEGACY_V1, LEGACY_V2 } from './legacyStages'
import type { RegionMap } from './maps/types'

export interface Stage {
  /** "지방번호-순번" (예: "1-1") */
  id: string
  /** 표시 이름 (예: "4번도로 (수상)") */
  name: string
  /** 지도상의 장소 이름 */
  place: string
  /** 육지(풀숲·동굴) / 수상(파도타기·낚시) */
  kind: 'land' | 'water'
  /** 출현표. 데이터가 아직 없는 지방은 undefined */
  encounters?: EncounterSet
}

export interface Region {
  id: number
  key: string
  /** 지방 이름 (예: '관동지방') */
  name: string
  /** 작품 이름 (예: '적·녹·청·피카츄') */
  version: string
  /** 표시용 전체 이름 (예: '관동지방 (적·녹·청·피카츄)') */
  title: string
  /** 이 지방이 무대인 세대 (지방 해금 시 해당 세대 한정 기술 습득 가능) */
  gens: number[]
  stages: Stage[]
  /** 타일맵. 아직 없는 지방은 undefined */
  map?: RegionMap
  /** 히든 지방: 지정한 포켓몬을 포획해야 이동 가능 */
  hidden?: { requiresCaught: string }
  /** 처음 들어가면 해금되는 특수 기능 (메가진화·Z기술·다이맥스·테라스탈) */
  unlocks?: Gimmick
}

const routes = (...nums: number[]) => nums.map((n) => `${n}번도로`)


// 출현 데이터가 없는 지방의 장소 목록 (데이터가 있는 지방은 encounters/<key>.json 의 order)
const KANTO = [
  ...routes(1, 22, 2),
  '상록숲',
  ...routes(3),
  '달맞이산',
  ...routes(4, 24, 25, 5, 6, 11),
  '디그다의 굴',
  ...routes(9, 10),
  '돌산터널',
  ...routes(8, 7),
  '포켓몬타워',
  ...routes(12, 13, 14, 15),
  '사파리존',
  ...routes(16, 17, 18, 19, 20),
  '쌍둥이섬',
  '포켓몬저택',
  ...routes(21),
  '무인발전소',
  ...routes(23),
  '챔피언로드',
  '블루시티동굴',
]
const HOENN = [
  ...routes(101, 103, 102, 104),
  '등화숲',
  ...routes(116),
  '금잔터널',
  ...routes(105, 106),
  '바위 동굴',
  ...routes(107, 108, 109, 110, 117, 111, 112),
  '불꽃샛길',
  ...routes(113, 114),
  '유성의 폭포',
  '울퉁불퉁 산길',
  ...routes(115, 118, 119, 120, 121),
  '송화산',
  ...routes(122, 123, 124, 125),
  '여울의 동굴',
  ...routes(126, 127, 128),
  '해저동굴',
  ...routes(129, 130, 131, 132, 133, 134),
  '하늘기둥',
  '챔피언로드',
]
const SINNOH = [
  ...routes(201, 202, 203),
  '무쇠탄갱',
  ...routes(204, 205),
  '골짜기발전소',
  '영원의 숲',
  ...routes(211, 206),
  '험한 샛길',
  ...routes(207),
  '천관산',
  ...routes(208, 209),
  '신수유적',
  ...routes(210, 215, 214, 213, 212),
  '대습초원',
  ...routes(218),
  '강철섬',
  '입지호수',
  '진실호수',
  ...routes(216, 217),
  '예지호수',
  '창기둥',
  ...routes(219, 220, 221, 222, 223),
  '챔피언로드',
  ...routes(224, 225, 226, 227, 228, 229, 230),
  '귀혼동굴',
  '하드마운틴',
]
const UNOVA = [
  ...routes(1, 2),
  '꿈터',
  ...routes(3),
  '바람개비숲',
  ...routes(4),
  '리조트데저트',
  ...routes(5, 16, 6),
  '전기돌동굴',
  ...routes(7),
  '타워오브해븐',
  '태엽산',
  ...routes(8),
  '설화의 습지초원',
  '용나선탑',
  ...routes(9, 10),
  '챔피언로드',
  ...routes(11, 12, 13, 14, 15),
  '자이언트홀',
]
const KALOS = [
  ...routes(2),
  '백단숲',
  ...routes(3, 22, 4, 5, 6, 7),
  '땅이음의 동굴',
  ...routes(8, 9),
  '반짝임의 동굴',
  ...routes(10, 11),
  '비춤의 동굴',
  ...routes(12),
  '아쥐르만',
  ...routes(13, 14, 15, 16),
  '프로스트케이브',
  ...routes(17, 18),
  '끝의 동굴',
  ...routes(19, 20, 21),
  '챔피언로드',
]
const ALOLA = [
  ...routes(1, 2),
  '우거진 동굴',
  ...routes(3),
  '멜레멜레 화원',
  '바다연결동굴',
  '텐캐럿힐',
  ...routes(4, 5),
  '잔잔한물가언덕',
  ...routes(6),
  '셰이드정글',
  ...routes(7),
  '벨라화산공원',
  ...routes(8),
  '나시・아일랜드',
  ...routes(10),
  '호쿠라니큰산',
  ...routes(11, 12, 13),
  '하이나사막',
  ...routes(14, 15, 16),
  '울라울라 화원',
  ...routes(17),
  '포니들판',
  '포니옛길',
  '포니수림',
  '포니대협곡',
  '라나키라마운틴',
  '포니광야',
  '포니험로',
  '엔드케이브',
]
const GALAR = [
  ...routes(1, 2),
  '화창한 초원',
  '터검니호 동쪽',
  '터검니호 서쪽',
  '감시탑 유적지',
  '햇살비추는숲',
  ...routes(3),
  '가라르광산',
  ...routes(4, 5),
  '엔진 리버사이드',
  '제2광산',
  '모래먼지구덩이',
  '너클 구릉',
  ...routes(6),
  '루미너스메이즈숲',
  ...routes(7, 8, 9),
  '루트나인터널',
  ...routes(10),
]
const PALDEA = [
  '티스푼 오솔길',
  '남부 에리어 1', // 확인필요 (에리어 표기 전체)
  '남부 에리어 2',
  '남부 에리어 4',
  '남부 에리어 3',
  '남부 에리어 5',
  '남부 에리어 6',
  '동부 에리어 1',
  '동부 에리어 2',
  '동부 에리어 3',
  '서부 에리어 1',
  '로스트 사막',
  '서부 에리어 2',
  '서부 에리어 3',
  '누룽지 숲길',
  '표식의 나무숲',
  '나페산',
  '푸르피케 산길',
  '북부 에리어 1',
  '북부 에리어 2',
  '북부 에리어 3',
  '오야 호수',
  '에리어 제로',
]

// 같은 지방도 작품(버전)별로 나눔. 스토리가 같은 버전 쌍(+피카츄판)은 하나로 묶고 출현표를 섞음
// 순서 = 발매 순 (히든 지방은 맨 뒤)
const RAW: {
  key: string
  gens: number[]
  name: string
  /** 작품 이름 */
  version: string
  /** 출현 데이터가 없는 지방의 장소 목록 */
  stages?: string[]
  map?: RegionMap
  hidden?: Region['hidden']
  unlocks?: Gimmick
}[] = [
  { key: 'kanto-rby', gens: [1], name: '관동지방', version: '적·녹·청·피카츄', map: KANTO_MAP },
  { key: 'johto-gs', gens: [2], name: '성도지방', version: '금·은', map: KANTO_JOHTO_MAP },
  { key: 'johto-c', gens: [2], name: '성도지방', version: '크리스탈', map: KANTO_JOHTO_MAP },
  { key: 'hoenn-rs', gens: [3], name: '호연지방', version: '루비·사파이어' },
  { key: 'hoenn-e', gens: [3], name: '호연지방', version: '에메랄드' },
  { key: 'kanto-frlg', gens: [3], name: '관동지방', version: '파이어레드·리프그린', map: KANTO_MAP },
  { key: 'sinnoh-dp', gens: [4], name: '신오지방', version: '디아루가·펄기아' },
  { key: 'sinnoh-pt', gens: [4], name: '신오지방', version: '플라티나' },
  { key: 'johto-hgss', gens: [4], name: '성도지방', version: '하트골드·소울실버', map: KANTO_JOHTO_MAP },
  { key: 'unova-bw', gens: [5], name: '하나지방', version: '블랙·화이트', stages: UNOVA },
  // 확인필요: 블랙2·화이트2 고유 장소(19·20번도로, 산길마을 일대 등) 미반영. 블랙·화이트 목록 임시 사용
  { key: 'unova-b2w2', gens: [5], name: '하나지방', version: '블랙2·화이트2', stages: UNOVA },
  { key: 'kalos-xy', gens: [6], name: '칼로스지방', version: 'X·Y', unlocks: 'mega', stages: KALOS },
  { key: 'hoenn-oras', gens: [6], name: '호연지방', version: '오메가루비·알파사파이어', unlocks: 'mega', stages: HOENN },
  { key: 'alola-sm', gens: [7], name: '알로라지방', version: '썬·문', unlocks: 'z', stages: ALOLA },
  { key: 'alola-usum', gens: [7], name: '알로라지방', version: '울트라썬·울트라문', unlocks: 'z', stages: ALOLA },
  { key: 'kanto-lgpe', gens: [7], name: '관동지방', version: '레츠고! 피카츄·레츠고! 이브이', unlocks: 'mega', stages: KANTO, map: KANTO_MAP },
  { key: 'galar-swsh', gens: [8], name: '가라르지방', version: '소드·실드', unlocks: 'dynamax', stages: GALAR },
  { key: 'sinnoh-bdsp', gens: [8], name: '신오지방', version: '브릴리언트 다이아몬드·샤이닝 펄', stages: SINNOH },
  // 팔데아는 번호 도로 대신 "에리어" 구역 체계. 오픈월드라 진행 순서는 권장 레벨 기준 근사치
  { key: 'paldea-sv', gens: [9], name: '팔데아지방', version: '스칼렛·바이올렛', unlocks: 'tera', stages: PALDEA },
  // 히든 지방: 아르세우스 포획 후 이동 가능. 레전드 아르세우스(8세대) 무대
  {
    key: 'hisui',
    gens: [8],
    name: '히스이지방',
    version: '레전드 아르세우스',
    hidden: { requiresCaught: 'arceus' },
    stages: ['흑요 들판', '홍련 습지', '군청 해안', '천관산 기슭', '순백 동토'],
  },
]

// 출현 데이터가 있는 지방: 데이터의 순서대로 육지/수상 스테이지 (수상만 있는 바닷길 등은 장소 이름 그대로)
// 없는 지방: 장소 이름만 나열
function buildStages(regionId: number, regionKey: string, names: string[] = []): Stage[] {
  const data = ENCOUNTERS[regionKey]
  const list: Omit<Stage, 'id'>[] = data
    ? data.order.map((key) => {
        const set = data.stages[key]!
        const name = set.kind === 'water' && !data.stages[set.place] ? set.place : key
        return { name, place: set.place, kind: set.kind, encounters: set }
      })
    : names.map((name) => ({ name, place: name, kind: 'land' as const }))
  return reorderWater(list).map((s, i) => ({ ...s, id: `${regionId}-${i + 1}` }))
}

/** 출현 레벨: max = 최고 레벨 (보스 레벨 기준), avg = 출현율 가중 평균 최고 레벨 */
function levels(set: EncounterSet | undefined): { max: number; avg: number } {
  if (!set) return { max: 0, avg: 0 }
  const lists = 'all' in set ? [set.all] : [set.day, set.night]
  const list = lists.flat().filter((e) => !e.special)
  const total = list.reduce((a, e) => a + e.rate, 0)
  return {
    max: Math.max(0, ...list.map((e) => e.max)),
    avg: total ? list.reduce((a, e) => a + e.rate * e.max, 0) / total : 0,
  }
}

/**
 * 수상 스테이지(낚싯대 출현 포함이라 레벨이 높음)를 뒤로 미룸:
 * 원래 위치 이후에서 최고 레벨·평균 레벨이 모두 수상 스테이지 이상인 첫 육지 스테이지 바로 뒤로 옮김
 * (평균도 보는 이유: 돌산터널처럼 드물게 고레벨이 나오는 곳에 붙지 않도록).
 * 그런 육지 스테이지가 없으면 원래 위치 그대로
 */
function reorderWater<T extends Omit<Stage, 'id'>>(list: T[]): T[] {
  const lv = list.map((s) => levels(s.encounters))
  const after = new Map<number, T[]>()
  const out: T[] = []
  list.forEach((s, i) => {
    if (s.kind === 'water') {
      const j = list.findIndex(
        (x, k) => k > i && x.kind === 'land' && lv[k]!.max >= lv[i]!.max && lv[k]!.avg >= lv[i]!.avg,
      )
      if (j >= 0) {
        if (!after.has(j)) after.set(j, [])
        after.get(j)!.push(s)
        return
      }
    }
    out.push(s, ...(after.get(i) ?? []))
  })
  return out
}

export const REGIONS: Region[] = RAW.map((r, i) => ({
  id: i + 1,
  key: r.key,
  name: r.name,
  version: r.version,
  title: `${r.name} (${r.version})`,
  gens: r.gens,
  map: r.map,
  hidden: r.hidden,
  unlocks: r.unlocks,
  stages: buildStages(i + 1, r.key, r.stages),
}))

const regionByKey = (key: string) => REGIONS.find((r) => r.key === key)

/**
 * 지방을 작품별로 나누기 전 저장 데이터(stageOrder 1·2)의 스테이지 id → 현재 id.
 * 관동·성도는 이름이 같은 스테이지로 (관동 → 적·녹·청·피카츄, 성도 → 금·은), 나머지 지방은 해당 지방의 첫 스테이지로
 */
export function migrateLegacyStageId(oldId: string, stageOrder: number): string {
  const [r, n] = oldId.split('-').map(Number) as [number, number]
  const keys = LEGACY_REGIONS[r - 1]
  if (!keys) return oldId
  const name = r === 1 ? (stageOrder === 1 ? LEGACY_V1 : LEGACY_V2)[n - 1] : undefined
  for (const key of keys) {
    const hit = regionByKey(key)?.stages.find((s) => s.name === name)
    if (hit) return hit.id
  }
  return regionByKey(keys[0]!)?.stages[0]?.id ?? oldId
}

/** 이전 저장 데이터의 해금 지방 번호 → 현재 번호 */
export function migrateLegacyRegionIds(ids: number[]): number[] {
  const keys = ids.flatMap((id) => LEGACY_REGIONS[id - 1] ?? [])
  return [...new Set(keys.map((k) => regionByKey(k)?.id).filter((id): id is number => id != null))]
}

export function findStage(id: string): { region: Region; stage: Stage } | null {
  for (const region of REGIONS) {
    const stage = region.stages.find((s) => s.id === id)
    if (stage) return { region, stage }
  }
  return null
}

/** 특수 기능을 해금하는 지방 */
export const regionOfGimmick = (g: Gimmick): Region | undefined => REGIONS.find((r) => r.unlocks === g)

/** 세대 → 그 세대가 무대인 지방들 (작품별) */
export function regionsOfGen(gen: number): Region[] {
  return REGIONS.filter((r) => r.gens.includes(gen))
}
