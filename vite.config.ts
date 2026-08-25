import { defineConfig } from 'vitest/config'
import { localUploads } from './tools/local-uploads'

export default defineConfig({
  plugins: [localUploads()],
  // `sleeves/` lives at the project root, outside src/, so it reads as a plain
  // drop-folder. Vite still needs to serve and hash the PDFs it finds there.
  assetsInclude: ['**/*.pdf'],
  server: {
    // Picking up a newly-dropped PDF requires re-running import.meta.glob, which
    // only happens on a full reload.
    watch: { ignored: ['!**/sleeves/**'] },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
