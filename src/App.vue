<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { startGameLoop } from './core/gameLoop'
import { load, save } from './core/save'
import { useGameStore } from './stores/game'

const game = useGameStore()
let stopLoop: (() => void) | undefined
let autosave: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  const data = load<typeof game.$state>()
  if (data) game.$patch(data.state)

  stopLoop = startGameLoop((dt) => game.tick(dt))
  autosave = setInterval(() => save(game.$state), 10_000)
  window.addEventListener('beforeunload', () => save(game.$state))
})

onUnmounted(() => {
  stopLoop?.()
  clearInterval(autosave)
})
</script>

<template>
  <main>
    <p>플레이 시간: {{ Math.floor(game.playTimeMs / 1000) }}초</p>
  </main>
</template>
