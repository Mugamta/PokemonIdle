import { defineStore } from 'pinia'

export const useGameStore = defineStore('game', {
  state: () => ({
    playTimeMs: 0,
  }),
  actions: {
    tick(deltaMs: number) {
      this.playTimeMs += deltaMs
    },
  },
})
