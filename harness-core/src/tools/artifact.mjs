/**
 * s13：大输出外置 —— 工具结果超过阈值就 swap 成 artifact，
 * 上下文里只留 摘要 + 路径 + sha256（原文可按需取回）。
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

/**
 * @typedef {Object} ArtifactRef
 * @property {string} path
 * @property {string} sha256
 * @property {number} bytes
 * @property {string} summary
 */

/**
 * @param {string} dir artifact 目录
 * @param {string} name 逻辑名（工具名/调用 id）
 * @param {string} content 原文
 * @param {number} threshold 超过多少字符就外置
 * @returns {{content: string, ref?: ArtifactRef}}
 */
export function swapLargeOutput(dir, name, content, threshold = 8000) {
  const bytes = Buffer.byteLength(content ?? '', 'utf8')
  const sha256 = createHash('sha256').update(content ?? '').digest('hex')
  if (bytes <= threshold) return { content: content ?? '' }

  const safe = String(name).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60)
  const file = join(dir, `${safe}-${sha256.slice(0, 12)}.txt`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content ?? '', 'utf8')

  const summary = `${content.slice(0, 200).replace(/\s+/g, ' ')}…`
  const ref = { path: file, sha256, bytes, summary }
  return {
    content: `[大输出已外置] ${summary}\n→ 文件：${file}\n→ sha256：${sha256}\n→ 原文 ${bytes} 字节（需要时用 read 取回）`,
    ref,
  }
}

/** 取回原文并校验 sha256 —— 不静默：校验不过就报错 */
export function readArtifact(path, expectSha) {
  if (!existsSync(path)) throw new Error(`artifact 不存在：${path}`)
  const content = readFileSync(path, 'utf8')
  const actual = createHash('sha256').update(content).digest('hex')
  if (expectSha && actual !== expectSha) {
    throw new Error(`artifact 校验失败：期望 ${expectSha.slice(0, 12)}… 实际 ${actual.slice(0, 12)}…`)
  }
  return content
}
