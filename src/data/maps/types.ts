// 격자 타일맵 데이터 형식

/** 장소 종류 (타일 색상 결정) */
export type PlaceKind = 'route' | 'water' | 'forest' | 'cave' | 'building' | 'park' | 'town'

/** [x, y, 너비, 높이] (타일 단위) */
export type Rect = [number, number, number, number]

export interface MapPlace {
  /** 스테이지 이름과 동일해야 연결됨. town은 스테이지가 아닌 지형지물 */
  name: string
  kind: PlaceKind
  rects: Rect[]
}

export interface RegionMap {
  width: number
  height: number
  places: MapPlace[]
}
