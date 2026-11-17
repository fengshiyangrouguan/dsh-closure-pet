// dsh-closure-pet — 可露希尔桌宠插件（宿主侧）
//
// P0 阶段的全部职责只有两件：
//   1. 往 `webserver/index-inject` 表里推**一行内联 script**，由它自己去建 <script src>；
//      —— 桌面端在宿主启动时**只收集一次**注入表（dsh-desktop-host/lib/index.js:346
//         `injections: ctx.webServer.collectIndexInjections()`），所以这一行必须在 apply() 里
//         **同步、立即**注册，绝不能等到某个 service 就绪。
//      —— 用内联 script 而不是 `script-src` 行：桌面壳对 `script-src` 是 `await loadScript(src)`，
//         失败会 reject 掉 __DSH_BOOT_READY__ ⇒ 整个应用起不来。内联行自己吞 onerror，路由不在也安全。
//   2. 注册同源 HTTP 路由，把前端脚本与静态资源发出去（`file://` 不行）。

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSET_ROOT = path.join(PACKAGE_ROOT, 'assets')
const URL_PREFIX = '/dsh-closure'

// 宿主持久化：设置 + 当日花费都写这里（node_modules 可能只读，所以写到 DSH_HOME）
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CONFIG_PATH = path.join(DSH_HOME, '.dshcl.json')

// 计费价目（元 / 百万 token），数组下标 0=谷价 1=峰价，与 DeepSeek 峰谷计费一致。
// 键是模型名子串，按长度降序匹配（避免 "pro" 误伤别的模型）。
const PRICES = {
  'deepseek-v4-pro': { hit: [0.15, 0.3], miss: [4.5, 9.0], out: [13.5, 27.0] },
  'deepseek-flash': { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
  'deepseek-v4-flash': { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
  'deepseek-v4-flash-vision-exp': { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
}
const DEFAULT_PRICE = { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] }

function priceFor(model) {
  const m = String(model || '').toLowerCase()
  for (const key of Object.keys(PRICES).sort((a, b) => b.length - a.length)) {
    if (m.indexOf(key) !== -1) return PRICES[key]
  }
  return DEFAULT_PRICE
}

/** 北京时间的 YYYY-MM-DD（用于按天归零）。 */
function bjDayKey(ts = Date.now()) {
  return new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

/** 一条 assistant/message 的 token 总量（cache 计入输入侧）。 */
function tokenCount(usage) {
  return (Number(usage.inputTokens) || 0)
    + (Number(usage.cacheReadTokens) || 0)
    + (Number(usage.outputTokens) || 0)
}

/** 一条 assistant/message 的花费（元）。价目按事件发生时刻的峰谷档取。 */
function costOf(usage, model, ts) {
  const price = priceFor(model)
  const off = computePeriod(ts) === 'peak' ? 1 : 0
  const cache = Number(usage.cacheReadTokens) || 0
  const input = Number(usage.inputTokens) || 0
  const output = Number(usage.outputTokens) || 0
  return (cache / 1e6) * price.hit[off] + (input / 1e6) * price.miss[off] + (output / 1e6) * price.out[off]
}

const PLUGIN_NAME = 'dsh-closure-pet'
const P0_VERSION = '0.4.0'

// 内联注入行：自己建 <script>，并吞掉加载失败（插件被关掉时路由已注销，这里只是静默）。
// 启动顺序：等页面 load 后再在空闲时加载 pet.js，避免和 DSH 的 boot / 首屏挂载抢主线程；
// 桌面端只在 Host 启动时收集一次这一行，所以它本身仍必须同步注册。
const INDEX_ROW_TEXT =
  '(function(){try{' +
  'function boot(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
  'var s=document.createElement("script");s.src="' + URL_PREFIX + '/pet.js";' +
  's.onerror=function(){try{console.warn("[closure-pet] 前端脚本加载失败（路由未就绪？）")}catch(e){}};' +
  'd.appendChild(s)}catch(e){}}' +
  'function schedule(){try{if(typeof requestIdleCallback==="function")requestIdleCallback(boot,{timeout:3000});' +
  'else setTimeout(boot,1200)}catch(e){setTimeout(boot,1200)}}' +
  'if(document.readyState==="complete")schedule();else window.addEventListener("load",schedule,{once:true})' +
  '}catch(e){}})()'

const CONTENT_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.atlas': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/** 只认回环主机名；用于拒绝 DNS 重绑定与跨站写入。 */
function isLoopbackHostname(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  return Number(m[1]) === 127 && [m[2], m[3], m[4]].every((x) => Number(x) <= 255)
}

// ————————————————————— 峰谷时段 —————————————————————
// 规则（与 DeepSeek 计费一致）：工作日 09:00–12:00 / 14:00–18:00 为峰价；
// 其余时间、周末、法定节假日全天为谷价。全部按**北京时间**判定，与本机时区无关。
const PEAK_WINDOWS = [[9, 12], [14, 18]]

// 法定节假日（含调休，闭区间，北京时间日期）：节假日全天谷价。
// ⚠️ 官方每年 11 月左右公布下一年安排，公布后按新的调休日改这里的区间即可。
//    未列出的年份 = 只按"周末谷价"计算，不会算错价，只是少认出节假日。
const HOLIDAY_RANGES = [
  // ——— 2026 ———
  ['2026-01-01', '2026-01-03'], // 元旦
  ['2026-02-15', '2026-02-22'], // 春节（除夕 02-16，初一 02-17）
  ['2026-04-04', '2026-04-06'], // 清明
  ['2026-05-01', '2026-05-05'], // 劳动节
  ['2026-06-19', '2026-06-21'], // 端午
  ['2026-09-25', '2026-09-27'], // 中秋
  ['2026-10-01', '2026-10-07'], // 国庆
  // ——— 2027（按农历节令推定，待官方调休公布后校准）———
  ['2027-01-01', '2027-01-03'], // 元旦
  ['2027-02-05', '2027-02-11'], // 春节（除夕 02-05，初一 02-06）
  ['2027-04-03', '2027-04-05'], // 清明（04-05）
  ['2027-05-01', '2027-05-05'], // 劳动节
  ['2027-06-09', '2027-06-11'], // 端午（06-09）
  ['2027-09-15', '2027-09-17'], // 中秋（09-15）
  ['2027-10-01', '2027-10-07'], // 国庆
]

const HOLIDAY_VALLEY = Object.create(null)
for (const [from, to] of HOLIDAY_RANGES) {
  const start = Date.parse(from + 'T00:00:00Z')
  const end = Date.parse(to + 'T00:00:00Z')
  for (let t = start; t <= end; t += 86400000) {
    HOLIDAY_VALLEY[new Date(t).toISOString().slice(0, 10)] = 1
  }
}

/** 当前是否存在超出已收录范围的年份（用于前端提示"节假日表需更新"）。 */
function holidaysOutdated(ts = Date.now()) {
  const year = String(bjDate(ts).getUTCFullYear())
  return !HOLIDAY_RANGES.some(([from]) => from.startsWith(year))
}

function bjDate(ts) {
  return new Date(ts + 8 * 3600 * 1000)
}

function computePeriod(ts = Date.now()) {
  const bj = bjDate(ts)
  const dow = bj.getUTCDay() // 0=周日
  if (dow === 0 || dow === 6) return 'valley'
  if (HOLIDAY_VALLEY[bj.toISOString().slice(0, 10)]) return 'valley'
  const hour = bj.getUTCHours() + bj.getUTCMinutes() / 60
  for (const [from, to] of PEAK_WINDOWS) {
    if (hour >= from && hour < to) return 'peak'
  }
  return 'valley'
}

/** 下一个峰谷切换时刻（epoch ms）；12 天内找不到就返回 null。 */
function nextPeriodChangeAt(ts = Date.now()) {
  const cur = computePeriod(ts)
  const dayStart = Math.floor((ts + 8 * 3600 * 1000) / 86400000) * 86400000 - 8 * 3600 * 1000
  for (let d = 0; d <= 12; d++) {
    for (const edge of [0, 9, 12, 14, 18]) {
      const cand = dayStart + d * 86400000 + edge * 3600 * 1000
      if (cand <= ts + 1000) continue
      if (computePeriod(cand) !== cur) return cand
    }
  }
  return null
}

// ————————————————————— 余额阈值 —————————————————————
const LOW_THRESHOLD = 10   // 低于这个数（元）算"余额不足"
const LOW_EXIT_RATIO = 1.2 // 退出阈值 = 10 * 1.2，带迟滞防抖
const TOPUP_DELTA = 5      // 一次上涨超过 5 元 → 认为充值成功

export default {
  name: PLUGIN_NAME,

  apply(root) {
    const rowDisposers = []
    let routeDiag = { state: 'pending' }
    let bootedAt = Date.now()

    // ————————————————————— 运行时状态 —————————————————————
    // 前端每秒拉一次；用计数器（而不是布尔）让前端能识别"事件发生了几次"，
    // 轮询丢一帧也不会漏掉事件。
    const runtime = {
      seq: 0,
      period: computePeriod(),
      periodChangedAt: 0,
      periodSeq: 0,
      workMode: 'idle',      // idle | thinking | outputting
      workSince: Date.now(),
      outputUntil: 0,
      agentRunning: false,
      tools: { ok: 0, fail: 0, lastOkAt: 0, lastFailAt: 0, lastFailName: '', lastFailMessage: '' },
      errors: { count: 0, lastAt: 0, message: '' },
      turnEndSeq: 0,
      turnEnd: null,
      topUpSeq: 0,
      topUpAt: 0,
      balance: null,         // { ok, stale, low, total, recharge, bonus, currency, fetchedAt }
      balancePolls: 0,
      lowStreak: 0,
      lastLow: false,
      lastTotal: null,
      // —— 计费（当日花费 / 本轮花费）——
      spend: {
        day: bjDayKey(),
        today: 0,
        tokensToday: 0,
        turn: null,
        turnAmount: 0,
        turnTokens: 0,
        lastTurn: null,
      },
      // —— 持久化设置（前端可以改，宿主写 $DSH_HOME/.dshcl.json）——
      settings: { mirror: 'auto', size: 1, bubble: true, opacity: 1, sound: true, volume: 0.7 },
    }

    function bump() { runtime.seq = Date.now() }

    function setWork(mode) {
      if (runtime.workMode === mode) return
      runtime.workMode = mode
      runtime.workSince = Date.now()
      bump()
    }

    // ————————————————————— 计费 —————————————————————
    function noteSpend(cost, tokens, turn) {
      const sp = runtime.spend
      const day = bjDayKey()
      if (sp.day !== day) {
        sp.day = day
        sp.today = 0
        sp.tokensToday = 0
      }
      if (typeof turn === 'number' && turn !== sp.turn) {
        if (sp.turn !== null) {
          sp.lastTurn = {
            turn: sp.turn,
            amount: Number(sp.turnAmount.toFixed(6)),
            tokens: sp.turnTokens,
          }
        }
        sp.turn = turn
        sp.turnAmount = 0
        sp.turnTokens = 0
      }
      sp.today += cost
      sp.tokensToday += tokens
      sp.turnAmount += cost
      sp.turnTokens += tokens
      bump()
      scheduleSave()
    }

    // ————————————————————— 配置持久化 —————————————————————
    let configSaveTimer = null
    let configSaving = false
    let configLoaded = false

    function configPayload() {
      return { version: 1, settings: runtime.settings, spend: runtime.spend }
    }

    async function writeConfigNow() {
      if (configSaving) return
      configSaving = true
      try {
        await fs.mkdir(DSH_HOME, { recursive: true })
        const tmp = CONFIG_PATH + '.tmp'
        await fs.writeFile(tmp, JSON.stringify(configPayload(), null, 2), 'utf8')
        await fs.rename(tmp, CONFIG_PATH)
      } catch (err) {
        console.warn('[closure-pet] 写配置失败：' + String((err && err.message) || err))
      } finally {
        configSaving = false
      }
    }

    function scheduleSave() {
      if (configSaveTimer) return
      configSaveTimer = setTimeout(() => { configSaveTimer = null; writeConfigNow() }, 1500)
    }

    async function loadConfig() {
      try {
        const raw = await fs.readFile(CONFIG_PATH, 'utf8')
        const cfg = JSON.parse(raw)
        const s = cfg && cfg.settings
        if (s && typeof s === 'object') {
          if (s.mirror === 'auto' || s.mirror === 'always' || s.mirror === 'never') runtime.settings.mirror = s.mirror
          if (Number.isFinite(Number(s.size))) runtime.settings.size = Math.min(2, Math.max(0.6, Number(s.size)))
          if (typeof s.bubble === 'boolean') runtime.settings.bubble = s.bubble
          if (Number.isFinite(Number(s.opacity))) runtime.settings.opacity = Math.min(1, Math.max(0.3, Number(s.opacity)))
          if (typeof s.sound === 'boolean') runtime.settings.sound = s.sound
          if (Number.isFinite(Number(s.volume))) runtime.settings.volume = Math.min(1, Math.max(0, Number(s.volume)))
        }
        const sp = cfg && cfg.spend
        if (sp && sp.day === bjDayKey()) {
          runtime.spend.today = Number(sp.today) || 0
          runtime.spend.tokensToday = Number(sp.tokensToday) || 0
          if (sp.lastTurn) runtime.spend.lastTurn = sp.lastTurn
        }
        configLoaded = true
        bump()
      } catch (err) { /* 没文件就是首次运行 */ }
    }
    loadConfig()

    // 会话事件：assistant/message 带 usage → 计一笔花费；turn/end → 结束通知
    try {
      root.on('session/event', (session, event) => {
        try {
          if (!event) return
          if (event.type === 'turn/end') {
            const d = event.data || {}
            const reason = d.reason || {}
            runtime.turnEndSeq++
            runtime.turnEnd = {
              seq: runtime.turnEndSeq,
              kind: String(reason.kind || 'completed'),
              turn: typeof d.turn === 'number' ? d.turn : null,
              at: Date.now(),
            }
            bump()
            return
          }
          if (event.type !== 'assistant/message') return
          const d = event.data || {}
          const usage = d.usage
          if (!usage) return
          const model = d.message && d.message.source && d.message.source.model
          noteSpend(costOf(usage, model, event.time || Date.now()), tokenCount(usage), d.turn)
        } catch (err) { /* 计费失败不影响宿主 */ }
      })
    } catch (err) { console.warn('[closure-pet] 无法订阅 session/event：' + String((err && err.message) || err)) }

    // 模型流：start / reasoning-delta = 思考，text-delta = 输出，end = 收尾
    try {
      root.on('agent/assistant-stream', (payload) => {
        try {
          const frame = payload && payload.frame
          if (!frame) return
          if (frame.type === 'start') {
            runtime.agentRunning = true
            setWork('thinking')
            return
          }
          if (frame.type === 'end') {
            if (runtime.workMode === 'outputting') setWork('thinking')
            return
          }
          const chunk = frame.chunk
          if (!chunk) return
          if (chunk.type === 'text-delta') {
            runtime.outputUntil = Date.now() + 800
            setWork('outputting')
          } else if (chunk.type === 'reasoning-delta') {
            setWork('thinking')
          } else if (chunk.type === 'finish') {
            runtime.outputUntil = 0
          }
        } catch (err) { /* 事件处理失败不影响宿主 */ }
      })
    } catch (err) { console.warn('[closure-pet] 无法订阅 agent/assistant-stream：' + String(err && err.message || err)) }

    // 工具结果：成功/失败各自计数（前端做限流后播放 Happy / Sad_Begin）
    try {
      root.on('tools/result', (exec, result) => {
        try {
          if (result && result.isError) {
            runtime.tools.fail++
            runtime.tools.lastFailAt = Date.now()
            runtime.tools.lastFailName = String((exec && exec.name) || '')
            const failure = result.error || {}
            runtime.tools.lastFailMessage = String(failure.message || failure.info && failure.info.code || '').slice(0, 60)
          } else {
            runtime.tools.ok++
            runtime.tools.lastOkAt = Date.now()
          }
          bump()
        } catch (err) {}
      })
    } catch (err) { console.warn('[closure-pet] 无法订阅 tools/result：' + String(err && err.message || err)) }

    // 模型/轮次级错误：给气泡一个"出错"来源
    try {
      root.on('agent/error', (payload) => {
        try {
          const err0 = payload && payload.error
          let message = ''
          if (err0 && typeof err0 === 'object') message = String(err0.message || err0.code || '')
          else message = String(err0 || '')
          runtime.errors.count++
          runtime.errors.lastAt = Date.now()
          runtime.errors.message = message.slice(0, 60)
          bump()
        } catch (err) {}
      })
    } catch (err) { console.warn('[closure-pet] 无法订阅 agent/error：' + String(err && err.message || err)) }

    // agent 状态：idle 时收尾（切回基础层）
    try {
      root.on('agent/status', (payload) => {
        try {
          const running = payload && payload.status === 'running'
          runtime.agentRunning = !!running
          if (!running && runtime.workMode !== 'idle') setWork('idle')
          bump()
        } catch (err) {}
      })
    } catch (err) { console.warn('[closure-pet] 无法订阅 agent/status：' + String(err && err.message || err)) }

    root.effect(() => () => {
      for (const dispose of rowDisposers) {
        try { dispose() } catch (err) { /* 忽略：插件销毁阶段的清理失败不该再抛 */ }
      }
    })

    // ① 注入行：不依赖任何服务，apply() 一开始就注册。
    rowDisposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        const already = table.some((row) => row && typeof row.text === 'string'
          && row.text.indexOf(URL_PREFIX + '/pet.js') >= 0)
        if (already) return
        table.push({ kind: 'script', placement: 'body', text: INDEX_ROW_TEXT })
      } catch (err) {
        console.warn('[closure-pet] 注入行注册失败：' + String((err && err.message) || err))
      }
    }))

    // ② 路由与资源：等 webServer / connection 就绪。
    root.inject(['webServer', 'connection'], (ctx) => {
      const disposers = []
      ctx.effect(() => () => {
        for (const dispose of disposers) {
          try { dispose() } catch (err) { /* 同上 */ }
        }
      })

      const hostFence = (() => {
        try {
          const conn = typeof ctx.get === 'function' ? ctx.get('connection') : ctx.connection
          return conn && typeof conn.requestRejection === 'function' ? conn : null
        } catch (err) { return null }
      })()

      /** 返回 true 表示已拒绝并结束响应。 */
      function reject(req, res) {
        const deny = (code) => {
          try { res.statusCode = code; res.end() } catch (err) { /* 已断开 */ }
          return true
        }
        try {
          const headers = req.headers || {}
          // 插件自带的轻量校验：跨站标记、Origin 与 Host 不同源一律拒。
          if (String(headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return deny(403)
          const origin = headers.origin
          if (typeof origin === 'string' && origin && origin !== 'null') {
            let originUrl = null
            try { originUrl = new URL(origin) } catch (err) { return deny(403) }
            if (originUrl.host.toLowerCase() !== String(headers.host || '').toLowerCase()) return deny(403)
          }
          if (!hostFence) {
            // 没有宿主栅栏时，只服务回环 Host（正常客户端与 curl 都满足）。
            let hostUrl = null
            try { hostUrl = new URL('http://' + String(headers.host || '')) } catch (err) { return deny(403) }
            if (!isLoopbackHostname(hostUrl.hostname)) return deny(403)
            return false
          }
          const code = hostFence.requestRejection(req)
          if (code === undefined || code === null || code === false) return false
          return deny(typeof code === 'number' ? code : 403)
        } catch (err) {
          return deny(403) // 校验器自己出错 → fail closed
        }
      }

      function register(route) {
        const inner = route.handler
        const wrapped = { ...route, handler: async (req, res) => {
          if (reject(req, res)) return
          try {
            return await inner(req, res)
          } catch (err) {
            console.warn('[closure-pet] 路由处理失败 ' + route.path + '：' + String((err && err.message) || err))
            try { res.statusCode = 500; res.end('internal error') } catch (e2) { /* 已断开 */ }
          }
        } }
        disposers.push(ctx.webServer.register(wrapped))
      }

      function send(res, status, type, body) {
        res.statusCode = status
        res.setHeader('Content-Type', type)
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.end(body)
      }

      async function serveFile(res, file) {
        let bytes
        try {
          bytes = await fs.readFile(file)
        } catch (err) {
          send(res, 404, 'text/plain; charset=utf-8', 'not found')
          return
        }
        send(res, 200, CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', bytes)
      }

      // 探针：证明宿主侧路由活着。
      register({
        kind: 'exact',
        path: URL_PREFIX + '/ping',
        handler: async (req, res) => {
          const payload = {
            ok: true,
            plugin: PLUGIN_NAME,
            version: P0_VERSION,
            phase: 'P4',
            uptimeMs: Date.now() - bootedAt,
            node: process.versions.node,
            electron: process.versions.electron || null,
            resourcePath: PACKAGE_ROOT,
            routes: [`${URL_PREFIX}/pet.js`, `${URL_PREFIX}/ping`, `${URL_PREFIX}/assets/*`],
            ts: new Date().toISOString(),
          }
          send(res, 200, 'application/json; charset=utf-8', JSON.stringify(payload, null, 2))
        },
      })

      // 前端挂件脚本。
      register({
        kind: 'exact',
        path: URL_PREFIX + '/pet.js',
        handler: (req, res) => serveFile(res, path.join(ASSET_ROOT, 'pet.js')),
      })

      // ————————————————————— P4：状态聚合 —————————————————————
      // 前端每秒轮询，字段全部是"当前值 + 计数器"，前端靠计数器增量识别事件。
      register({
        kind: 'exact',
        path: URL_PREFIX + '/state',
        handler: (req, res) => {
          const payload = {
            seq: runtime.seq,
            ts: Date.now(),
            period: runtime.period,
            periodSeq: runtime.periodSeq,
            periodChangedAt: runtime.periodChangedAt,
            periodNextChangeAt: nextPeriodChangeAt(),
            periodHolidays: Object.keys(HOLIDAY_VALLEY),
            holidaysOutdated: holidaysOutdated(),
            work: { mode: runtime.workMode, since: runtime.workSince },
            tools: { ...runtime.tools },
            errors: { ...runtime.errors },
            turnEnd: { seq: runtime.turnEndSeq, ...(runtime.turnEnd || {}) },
            topUpSeq: runtime.topUpSeq,
            topUpAt: runtime.topUpAt,
            agentRunning: runtime.agentRunning,
            balance: runtime.balance,
            spend: {
              day: runtime.spend.day,
              today: Number(runtime.spend.today.toFixed(6)),
              tokensToday: runtime.spend.tokensToday,
              turn: runtime.spend.turn,
              turnAmount: Number(runtime.spend.turnAmount.toFixed(6)),
              turnTokens: runtime.spend.turnTokens,
              lastTurn: runtime.spend.lastTurn,
            },
            config: { lowThreshold: LOW_THRESHOLD },
          }
          send(res, 200, 'application/json; charset=utf-8', JSON.stringify(payload))
        },
      })

      // 设置读写：前端把改动用 PUT 传过来，宿主落盘到 $DSH_HOME/.dshcl.json
      register({
        kind: 'exact',
        path: URL_PREFIX + '/config',
        handler: async (req, res) => {
          const method = String(req.method || 'GET').toUpperCase()
          if (method === 'GET') {
            const body = JSON.stringify({ ok: true, settings: runtime.settings, spend: runtime.spend })
            send(res, 200, 'application/json; charset=utf-8', body)
            return
          }
          if (method !== 'PUT' && method !== 'POST') {
            send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
            return
          }
          let raw = ''
          try {
            raw = await new Promise((resolve, reject) => {
              let size = 0
              const chunks = []
              req.on('data', (c) => {
                size += c.length
                if (size > 8192) { reject(new Error('body too large')); req.destroy(); return }
                chunks.push(c)
              })
              req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
              req.on('error', reject)
            })
          } catch (err) {
            send(res, 400, 'text/plain; charset=utf-8', 'bad body')
            return
          }
          let patch = null
          try { patch = JSON.parse(raw) } catch (err) { patch = null }
          if (!patch || typeof patch !== 'object') {
            send(res, 400, 'text/plain; charset=utf-8', 'bad json')
            return
          }
          const s = patch.settings && typeof patch.settings === 'object' ? patch.settings : patch
          if (s.mirror === 'auto' || s.mirror === 'always' || s.mirror === 'never') runtime.settings.mirror = s.mirror
          if (Number.isFinite(Number(s.size))) runtime.settings.size = Math.min(2, Math.max(0.6, Number(s.size)))
          if (typeof s.bubble === 'boolean') runtime.settings.bubble = s.bubble
          if (Number.isFinite(Number(s.opacity))) runtime.settings.opacity = Math.min(1, Math.max(0.3, Number(s.opacity)))
          if (typeof s.sound === 'boolean') runtime.settings.sound = s.sound
          if (Number.isFinite(Number(s.volume))) runtime.settings.volume = Math.min(1, Math.max(0, Number(s.volume)))
          bump()
          try { await writeConfigNow() } catch (err) {}
          send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, settings: runtime.settings }))
        },
      })

      // 峰谷边沿：15s 检查一次（时段切换是整点，不需要更密）
      const periodTimer = setInterval(() => {
        try {
          const next = computePeriod()
          if (next === runtime.period) return
          runtime.period = next
          runtime.periodChangedAt = Date.now()
          runtime.periodSeq++
          bump()
        } catch (err) {}
      }, 15000)
      disposers.push(() => clearInterval(periodTimer))

      // 余额轮询：60s 一次；失败保留旧值并标 stale，绝不把失败当 0
      const numOr = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
      function walletSum(list, currency) {
        return list
          .filter((w) => w && String(w.currency || 'CNY') === currency && numOr(w.balance) !== null)
          .reduce((sum, w) => sum + Number(w.balance), 0)
      }

      async function pollBalance() {
        let account = null
        try { account = typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : null } catch (err) { account = null }
        if (!account || typeof account.getBalance !== 'function') {
          runtime.balance = {
            ok: false, stale: true, low: false, total: null, recharge: null, bonus: null,
            currency: 'CNY', fetchedAt: Date.now(), reason: 'no-account-service',
          }
          return
        }
        let result = null
        try {
          result = await account.getBalance({
            version: String(process.env.DSH_CLIENT_VERSION || process.env.DSH_VERSION || '') || 'unknown',
            locale: 'zh_CN',
            timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
          })
        } catch (err) {
          runtime.balance = {
            ...(runtime.balance || {}), ok: false, stale: true, fetchedAt: Date.now(),
            reason: 'getBalance error: ' + String((err && err.message) || err).slice(0, 120),
          }
          return
        }
        if (!result) {
          // 未登录：保留上一次的 low（不清零），只标记 signedOut
          runtime.balance = {
            ok: false, stale: false, low: !!runtime.lastLow, total: null, recharge: null, bonus: null,
            currency: 'CNY', fetchedAt: Date.now(), signedOut: true,
          }
          return
        }
        if (result.status !== 'ready') {
          runtime.balance = {
            ...(runtime.balance || {}), ok: false, stale: true, fetchedAt: Date.now(), reason: 'status=' + String(result.status),
          }
          return
        }

        const normal = Array.isArray(result.value) ? result.value : []
        const bonus = Array.isArray(result.bonusWallets) ? result.bonusWallets : []
        const all = normal.concat(bonus).filter((w) => w && numOr(w.balance) !== null)
        if (all.length === 0) {
          runtime.balance = {
            ...(runtime.balance || {}), ok: false, stale: true, fetchedAt: Date.now(), reason: 'no-wallets',
          }
          return
        }
        const currency = String((all.find((w) => String(w.currency) === 'CNY') || all[0]).currency || 'CNY')
        const recharge = walletSum(normal, currency)
        const bonusSum = walletSum(bonus, currency)
        const total = Number((recharge + bonusSum).toFixed(6))

        runtime.balancePolls++
        // 低余额判定：进入用单次读数（`< T` 立即算低），退出用迟滞（`>= T*1.2`）。
        // ⚠️ 不能用"连续 2 次才算低"：插件重载后 streak 归零，第一次读数会被判成
        //    low=false，前端就会误弹一次"余额恢复"。
        const prevLow = !!runtime.lastLow
        const low = prevLow ? total < LOW_THRESHOLD * LOW_EXIT_RATIO : total < LOW_THRESHOLD
        runtime.lastLow = low

        // 充值成功：相对上次读数上涨超过阈值；或从"不足"恢复
        const recovered = runtime.lastTotal !== null && (total - runtime.lastTotal) >= TOPUP_DELTA
        const recoveredFromLow = prevLow && !low
        if (recovered || recoveredFromLow) {
          runtime.topUpSeq++
          runtime.topUpAt = Date.now()
          bump()
        }
        runtime.lastTotal = total

        runtime.balance = {
          ok: true, stale: false, low,
          total, recharge: Number(recharge.toFixed(6)), bonus: Number(bonusSum.toFixed(6)),
          currency, fetchedAt: Date.now(),
        }
        bump()
      }

      const firstBalanceTimer = setTimeout(() => { pollBalance().catch(() => {}) }, 2500)
      const balanceTimer = setInterval(() => { pollBalance().catch(() => {}) }, 60000)
      disposers.push(() => { clearTimeout(firstBalanceTimer); clearInterval(balanceTimer) })

      // 静态资源前缀（Spine 模型 / 贴图 / 语音，P1 起使用）。
      // ⚠️ 前缀**不能带尾斜杠**：DSH 的 webServer 判定条件是
      //    `pathname === prefix || pathname.startsWith(prefix + '/')`
      //    注册成 '/dsh-closure/assets/' 时，'/dsh-closure/assets/vendor/x.js' 永远匹配不到（会 404）。
      const ASSET_BASE = URL_PREFIX + '/assets'
      register({
        kind: 'prefix',
        path: ASSET_BASE,
        handler: (req, res) => {
          let rel
          try {
            rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
              .slice(ASSET_BASE.length)
              .replace(/^\/+/, '')
          } catch (err) {
            send(res, 400, 'text/plain; charset=utf-8', 'bad path')
            return
          }
          if (!rel) {
            send(res, 404, 'text/plain; charset=utf-8', 'not found')
            return
          }
          const file = path.resolve(ASSET_ROOT, rel)
          if (file !== ASSET_ROOT && !file.startsWith(ASSET_ROOT + path.sep)) {
            send(res, 403, 'text/plain; charset=utf-8', 'forbidden')
            return
          }
          return serveFile(res, file)
        },
      })

      routeDiag = { state: 'registered', at: new Date().toISOString() }
      bootedAt = Date.now()
      console.info('[closure-pet] P0 路由已注册：' + URL_PREFIX + '/ping, /pet.js, /assets/*'
        + (hostFence ? '' : '（注意：宿主信任栅栏不可用，已启用回环校验）'))
    })
  },
}
