// scripts/copy-assets.mjs — 复制静态资源（模板 md）到 lib
// tsc 只编译 .ts，不复制 .md 等静态资源，这里手动复制

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const srcTemplates = path.join(root, 'src', 'templates')
const dstTemplates = path.join(root, 'lib', 'templates')

if (!fs.existsSync(srcTemplates)) {
  console.log('[copy-assets] src/templates 不存在，跳过')
  process.exit(0)
}

fs.mkdirSync(dstTemplates, { recursive: true })

const files = fs.readdirSync(srcTemplates)
for (const file of files) {
  fs.copyFileSync(path.join(srcTemplates, file), path.join(dstTemplates, file))
}

console.log(`[copy-assets] 复制 ${files.length} 个模板文件到 lib/templates/`)
