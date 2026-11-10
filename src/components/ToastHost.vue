<script setup lang="ts">
// 하단 탭 바로 위에 짧은 알림을 쌓아서 보여 줌
import { toasts } from './toast'
</script>

<template>
  <TransitionGroup tag="div" name="toast" class="toast-host" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast">{{ t.text }}</div>
  </TransitionGroup>
</template>

<style scoped>
.toast-host {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(64px + env(safe-area-inset-bottom));
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
}

.toast {
  max-width: 90%;
  padding: 6px 14px;
  border-radius: 16px;
  background: rgba(20, 20, 26, 0.92);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  color: #f2f2f2;
  font-size: 13px;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.toast-leave-active {
  position: absolute;
}

.toast-move {
  transition: transform 0.25s;
}
</style>
