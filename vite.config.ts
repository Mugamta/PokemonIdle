import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// base: './' → GitHub Pages 저장소 이름과 무관하게 상대 경로로 동작
export default defineConfig({
  base: './',
  plugins: [vue()],
})
