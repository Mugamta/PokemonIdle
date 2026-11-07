import { defineStore } from 'pinia'
import { REGIONS } from '../data/stages'

// 스테이지 화면의 선택 상태 (지도 ↔ 목록 공유). 저장하지 않는 UI 상태
export const useStageViewStore = defineStore('stageView', {
  state: () => ({
    regionId: 1,
    /** 펼쳐서 보고 있는 스테이지 id */
    stageId: null as string | null,
    /** 지도에서 선택한 장소 이름 (스테이지가 없는 마을 포함) */
    placeName: null as string | null,
  }),
  getters: {
    region: (s) => REGIONS.find((r) => r.id === s.regionId)!,
  },
  actions: {
    selectRegion(id: number) {
      if (this.regionId === id) return
      this.regionId = id
      this.stageId = null
      this.placeName = null
    },
    /** 목록에서 스테이지 선택 (다시 누르면 접힘) */
    toggleStage(id: string) {
      if (this.stageId === id) {
        this.stageId = null
        return
      }
      this.stageId = id
      this.placeName = this.region.stages.find((s) => s.id === id)?.place ?? null
    },
    /** 지도에서 장소 선택 → 그 장소의 첫 스테이지를 펼침 */
    selectPlace(name: string | null) {
      this.placeName = name
      this.stageId = name ? (this.region.stages.find((s) => s.place === name)?.id ?? null) : null
    },
  },
})
