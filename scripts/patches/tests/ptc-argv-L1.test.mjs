// ptc-argv-L1.test.mjs — PTC 子进程堆参数移出 argv + 可执行文件守卫的静态回归（缺陷 C 的更深一层）。
//
// 现象：模型在 PTC 里连最简代码块都失败，报
//   code run failed (worker-exit): Node process exited before completing (1):
//   error: expected absolute path: "--max-old-space-size=512"
// 真因：产物 index.js:947 `...packaged ? [] : [heapFlag],` ⇒ packaged===false 时 heapFlag 落在 argv[1]；
// 而 executable 若被解析成安卓系统链接器（direct exec 被拒时壳侧改走 /system/bin/linker64，
// process.execPath 随之被污染），linker64 把第一个非选项参数当程序路径，heapFlag 排在它前面
// ⇒ linker64 自己报 expected absolute path 并退出，Node 从未被加载。
//
// 修法：① heapFlag 永不进 argv，改由 env.NODE_OPTIONS 无条件下发；
//       ② executable 必须是绝对路径且不是系统动态链接器（fails loud，不静默回退、不猜替代路径）。
//
// 本测试对**工厂夹具**（构建期同一批 tgz 写出，与快照引擎树逐字节同源）断言，实测四条反证均判红。
// 用法：node scripts/patches/tests/ptc-argv-L1.test.mjs
import { mkdtempSync, mkdirSync, readFileSync, rmSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { versionedFixture } from './lib/fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')

const failures = []
/** Assert one condition, recording the failure instead of throwing so every check reports. */
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || detail === undefined ? '' : ' -> ' + detail))
  if (!ok) failures.push(label)
}

const MARKER = 'dsh-mobile ptc argv heap via NODE_OPTIONS (L1)'
const TARGET_REL = 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/index.js'
const FIXTURE = versionedFixture('dsh-ptc-runtime-node', 'lib', 'index.js')
const FIXTURE_PKG = versionedFixture('dsh-ptc-runtime-node', 'package.json')
const APPLY = readFileSync(join(repoRoot, 'scripts', 'patches', 'apply-patches.mjs'), 'utf8')
const REGISTRY = JSON.parse(readFileSync(join(repoRoot, 'scripts', 'patches', 'registry.json'), 'utf8'))
const RAW = readFileSync(FIXTURE, 'utf8')

// 断言用施加后的结果，**驱动生产入口** apply-patches.mjs（--only ptc-argv-L1），不在测试里复刻替换逻辑。
// 旧版这里是一份本地重放，锚点写死成 rc.2 的 this.config.nodeExecutable。alpha.5 把该字段收进
// this.config.launch（nodeExecutable -> launch.executable；bootstrapArgs 的 cfg 参数随之改变），
// 生产侧 apply-patches.mjs:835-836 已按目标源码分档，而这份副本没有 ⇒ 测试与产物不同代、直接判红
// （实测 GHA run 38975648587「构建 APK」步：4 项未声明失败，本文件占 2 项）。
// 复刻逻辑 = 测副本；改为驱动真 CLI 后，上游再改字段名也不会让本测试失真。
function patchedWithProductionCli() {
  const scratch = mkdtempSync(join(tmpdir(), 'ptc-argv-L1-'))
  try {
    const target = join(scratch, TARGET_REL)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(FIXTURE, target)
    // 真实引擎树里 <pkg>/package.json 恒在 lib/ 的上一级；scratch 树按同一形态铺。
    copyFileSync(FIXTURE_PKG, join(dirname(dirname(target)), 'package.json'))
    const r = spawnSync(process.execPath,
      [join(repoRoot, 'scripts', 'patches', 'apply-patches.mjs'), scratch,
        '--apply', '--scope', 'engine', '--only', 'ptc-argv-L1'], { encoding: 'utf8' })
    if (r.status !== 0) {
      throw new Error((r.stdout + r.stderr).trim().split('\n').slice(-2).join(' | ') || 'apply-patches 退出码非 0')
    }
    return readFileSync(target, 'utf8')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

// ── (a) 旧形态必须真实存在于夹具里（证明锚点不是空转）───────────────────────
check('夹具里存在旧形态 argv 项 `...packaged ? [] : [heapFlag],`',
  RAW.includes('...packaged ? [] : [heapFlag],'))
check('夹具里 heapFlag 由 maxOldGenerationSizeMb 构造（heapFlag 定义在场）',
  RAW.includes('const heapFlag = `--max-old-space-size=${this.config.maxOldGenerationSizeMb}`;'))
// ★版本分档（2026-10-17）：断言按夹具实际形态取，不写死某一代 —— 写死正是本测试此前失真的原因。
// alpha.5 把启动配置收进 this.config.launch（nodeExecutable -> launch.executable）。
const HAS_ALPHA5_FIELD = RAW.includes('resolveExecutable(this.config.launch.executable,')
const HAS_RC2_FIELD = RAW.includes('resolveExecutable(this.config.nodeExecutable, void 0, signal)')
check('夹具形态恰好命中一档（nodeExecutable / launch.executable 不同时在场）',
  HAS_ALPHA5_FIELD !== HAS_RC2_FIELD, `alpha5=${HAS_ALPHA5_FIELD} rc2=${HAS_RC2_FIELD}`)
const EXEC_REF = HAS_ALPHA5_FIELD ? 'this.config.launch.executable' : 'this.config.nodeExecutable'
check('夹具里 executable 由 resolveExecutable 解析（守卫有用武之地）',
  RAW.includes(`resolveExecutable(${EXEC_REF}, void 0, signal)`), EXEC_REF)

// 施加走生产入口；它失败就意味着「补丁面与这一代夹具不同代」，立即判红并把最后两行错误打出来。
const OUT = (() => {
  try { return patchedWithProductionCli() } catch (e) {
    console.log('FAIL  生产入口 apply-patches.mjs --only ptc-argv-L1 施加成功 -> ' + e.message)
    process.exit(1)
  }
})()

// ── (b) marker 在场 ────────────────────────────────────────────────────────
check('施加后 marker 在场', OUT.includes(MARKER))

// ── (c) argv 内不再含 heapFlag ─────────────────────────────────────────────
const argvBlock = OUT.slice(OUT.indexOf('const argv = ['), OUT.indexOf('const argv = [') + 260)
check('施加后 argv 构造块不再含 heapFlag', !argvBlock.includes('heapFlag'), argvBlock.replace(/\t/g, '\\t').slice(0, 160))
check('施加后旧 argv 项已消失', !OUT.includes('...packaged ? [] : [heapFlag],'))

// ── (d) env.NODE_OPTIONS = heapFlag 无条件在场 ─────────────────────────────
const envAt = OUT.indexOf('env.NODE_OPTIONS = heapFlag;')
check('施加后 env.NODE_OPTIONS = heapFlag 在场', envAt >= 0)
// 无条件：紧随其后的第一个 if (packaged) 只应包含 DSH_PTC_RUNTIME_NODE。
const afterEnv = OUT.slice(envAt, envAt + 200)
check('NODE_OPTIONS 赋值在 if (packaged) 之前（无条件）',
  afterEnv.indexOf('env.NODE_OPTIONS = heapFlag;') < afterEnv.indexOf('if (packaged) {'))
check('DSH_PTC_RUNTIME_NODE 仍只在 packaged 分支内',
  /if \(packaged\) \{\s*\n\s*env\.DSH_PTC_RUNTIME_NODE = "1";/.test(OUT))

// ── (e) 两条守卫在场 ───────────────────────────────────────────────────────
check('绝对值守卫在场（isAbsolute + not an absolute path）',
  OUT.includes('!isAbsolute(executable)') && OUT.includes('not an absolute path'))
check('系统链接器守卫在场（linker/ld.so 正则 + 点名错误）',
  OUT.includes('system dynamic linker') && OUT.includes('linker(?:64)?') && OUT.includes('ld\\.so'))
check('守卫用 ptc-runtime-node: 前缀（措辞与既有 isAbsolute 校验一致）',
  (OUT.match(/ptc-runtime-node: resolved node executable/g) || []).length === 2)
check('守卫是 fails loud（抛错），不是静默回退',
  OUT.includes("throw new Error('ptc-runtime-node: resolved node executable is not an absolute path")
  && OUT.includes("throw new Error('ptc-runtime-node: resolved node executable is the system dynamic linker"))

// ── (f) 补丁面自洽：registry 条目 + apply-patches 锚点/复查 ─────────────────
const reg = REGISTRY.patches.find((p) => p.id === 'ptc-argv-L1')
check('registry 登记 ptc-argv-L1（scope=engine）', !!reg && reg.scope === 'engine', JSON.stringify(reg && reg.id))
check('registry marker 与 IMPL 一致', !!reg && reg.marker === MARKER)
check('registry target 指向 ptc-runtime-node/lib/index.js',
  !!reg && reg.target === 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/index.js')
check('apply-patches 里 IMPL 的 OLD 锚点含旧 argv 项', APPLY.includes('...packaged ? [] : [heapFlag],'))
check('apply-patches 对 executable 字段分档（两代都认，不写死）',
  APPLY.includes('this.config.launch.executable') && APPLY.includes('this.config.nodeExecutable'))
check('apply-patches 锚点未命中时抛可执行指引',
  APPLY.includes('ptc-argv 锚点未命中') && APPLY.includes('引擎升级后请人工核对'))
check('apply-patches 写回后自查 marker', APPLY.includes("if (!s.includes('" + MARKER + "')) throw new Error('ptc-argv 复核失败"))

console.log(failures.length === 0 ? '\nALL PASS' : '\nFAILED ' + failures.length + ': ' + failures.join('; '))
process.exit(failures.length === 0 ? 0 : 1)
