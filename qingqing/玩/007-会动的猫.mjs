#!/usr/bin/env node
// 玩 · 007 · 会动的猫
//
// 一个只有 20 行的终端动画。不需要任何依赖，node 直接跑。
//
// 用法：
//   node 007-会动的猫.mjs          # 一直眨眼，Ctrl+C 退出
//   node 007-会动的猫.mjs 10       # 眨 10 下就停
//
// 为什么写它：字符画在 Markdown 里要往下滚才动；
// 在终端里，它自己会动。

const 帧 = [
  `
    ╱▔▔╲
   ( ◕  ◕ )
    ╲ ▽ ╱
     ╰──╯
`,
  `
    ╱▔▔╲
   ( ◕  ‿ )
    ╲ ▽ ╱
     ╰──╯
`,
  `
    ╱▔▔╲
   ( ‿  ‿ )
    ╲ ▽ ╱
     ╰──╯
`,
  `
    ╱▔▔╲
   ( ◕  ◕ )
    ╲ ▽ ╱
     ╰──╯
`,
]

const 次数 = Number(process.argv[2] || Infinity)
let i = 0

const 清屏 = () => process.stdout.write('\x1b[2J\x1b[H')

const 播 = () => {
  清屏()
  console.log(帧[i % 帧.length])
  console.log(`\n   —— 第 ${i + 1} 帧${Number.isFinite(次数) ? ' / ' + 次数 : ''}`)
  i++
  if (i >= 次数) {
    process.stdout.write('\x1b[?25h') // 把光标还回去
    console.log('\n   猫玩累了，睡了。\n')
    process.exit(0)
  }
}

process.stdout.write('\x1b[?25l') // 藏光标，免得闪
播()
const t = setInterval(播, 400)
process.on('SIGINT', () => {
  clearInterval(t)
  process.stdout.write('\x1b[?25h')
  console.log('\n   猫被叫醒了。\n')
  process.exit(0)
})
