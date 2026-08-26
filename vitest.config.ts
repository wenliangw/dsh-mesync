// vitest.config.ts — 单元测试配置
// 手动配置 @/ alias 指向 src（避免依赖 vite-tsconfig-paths）

import { defineConfig } from 'vitest/config'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
})