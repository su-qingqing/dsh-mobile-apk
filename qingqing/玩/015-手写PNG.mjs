#!/usr/bin/env node
// 玩 · 015 · 手写 PNG
//
// 不装任何库，不用任何画图软件 —— 直接按 PNG 的字节格式拼出一张图。
// 跑完之后会得到 店.png，打开就能看见。
//
// 用法：node 015-手写PNG.mjs

import zlib from 'node:zlib'
import fs from 'node:fs'

const W = 96
const H = 96

// ── 画布：RGBA 像素 ─────────────────────────────
const 画布 = new Uint8Array(W * H * 4)
const 点 = (x, y, [r, g, b, a = 255]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  画布[i] = r; 画布[i + 1] = g; 画布[i + 2] = b; 画布[i + 3] = a
}
const 矩形 = (x0, y0, x1, y1, 色) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) 点(x, y, 色)
}

// ── 天空：从夜到黄昏的竖向渐变 ────────────────────
const 混 = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const 夜 = [22, 22, 39]
const 黄 = [232, 168, 124]
for (let y = 0; y < H; y++) {
  const t = y / H
  const 色 = 混(夜, 黄, t * t)
  for (let x = 0; x < W; x++) 点(x, y, 色)
}

// ── 月亮 ────────────────────────────────────────
for (let y = 6; y <= 18; y++) for (let x = 76; x <= 88; x++) {
  const d = Math.hypot(x - 82, y - 12)
  if (d <= 6) 点(x, y, [253, 246, 227])
}

// ── 地面 ────────────────────────────────────────
矩形(0, 72, W - 1, H - 1, [27, 26, 36])

// ── 店的墙 ──────────────────────────────────────
矩形(26, 44, 70, 71, [61, 58, 79])

// ── 屋顶（三角）──
for (let y = 30; y <= 44; y++) {
  const 半 = (y - 30) * 1.6
  for (let x = Math.round(48 - 半); x <= Math.round(48 + 半); x++) 点(x, y, [43, 40, 56])
}

// ── 招牌 ────────────────────────────────────────
矩形(36, 36, 60, 41, [255, 216, 155])

// ── 门（暖光）──
矩形(43, 56, 53, 71, [255, 227, 163])
// 门框
for (let y = 56; y <= 71; y++) { 点(42, y, [43, 40, 56]); 点(54, y, [43, 40, 56]) }

// ── 左窗亮 / 右窗暗 ─────────────────────────────
矩形(30, 50, 37, 56, [255, 227, 163])
矩形(59, 50, 66, 56, [120, 100, 96])

// ── 猫（门口右边，一小团）──
const 猫色 = [18, 18, 26]
矩形(63, 66, 70, 70, 猫色)                    // 身子
矩形(64, 62, 68, 66, 猫色)                    // 头
点(65, 63, [255, 216, 155])                   // 左眼
点(67, 63, [255, 216, 155])                   // 右眼

// ── PNG 编码 ────────────────────────────────────
const crc表 = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crc表[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const 块 = (类型, 数据) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(数据.length)
  const type = Buffer.from(类型, 'ascii')
  const body = Buffer.concat([type, 数据])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, c])
}

const 签名 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8   // 位深
ihdr[9] = 6   // RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

// 每行前面加一个 filter 字节（0 = 不过滤）
const 原始 = Buffer.alloc(H * (1 + W * 4))
for (let y = 0; y < H; y++) {
  原始[y * (1 + W * 4)] = 0
  原始.set(画布.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1)
}
const idat = zlib.deflateSync(原始, { level: 9 })

const png = Buffer.concat([签名, 块('IHDR', ihdr), 块('IDAT', idat), 块('IEND', Buffer.alloc(0))])
fs.writeFileSync(new URL('./015-店.png', import.meta.url), png)
console.log('写好了：015-店.png（' + png.length + ' 字节，' + W + '×' + H + '）')
