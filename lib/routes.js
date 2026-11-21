// dsh-closure-pet — 宿主：HTTP 路由与静态资源
//
// 注册 /ping、/state、/config、/assets/*。
// 源校验：跨站标记、Origin 与 Host 不同源、宿主信任栅栏（connection.requestRejection）三层，
// 没有栅栏时退化成只服务回环 Host。所有资源 no-store，方便改前端直接 Ctrl+R。

import fs from 'node:fs/promises'
import path from 'node:path'

import { computePeriod, nextPeriodChangeAt, holidaysOutdated, HOLIDAY_VALLEY } from './period.js'
import { LOW_THRESHOLD } from './store.js'
import { SCHEMA_VERSION, URL_PREFIX, normalizeSettings } from '../assets/src/shared/protocol.js'

const CONTENT_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.atlas': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/** 只认回环主机名；用于拒绝 DNS 重绑定与跨站写入。 */
export function isLoopbackHostname(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  return Number(m[1]) === 127 && [m[2], m[3], m[4]].every((x) => Number(x) <= 255)
}

export function createRoutes(opts) {
  const ctx = opts.ctx
  const store = opts.store
  const runtime = store.runtime
  const packageRoot = opts.packageRoot
  const assetRoot = opts.assetRoot
  const pluginName = opts.pluginName
  const pluginVersion = opts.version

  const bootedAt = Date.now()
  const disposers = []
  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try { dispose() } catch (err) { /* 插件销毁阶段的清理失败不该再抛 */ }
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
        plugin: pluginName,
        version: pluginVersion,
        uptimeMs: Date.now() - bootedAt,
        node: process.versions.node,
        electron: process.versions.electron || null,
        resourcePath: packageRoot,
        routes: [`${URL_PREFIX}/ping`, `${URL_PREFIX}/state`, `${URL_PREFIX}/config`, `${URL_PREFIX}/assets/*`],
        ts: new Date().toISOString(),
      }
      send(res, 200, 'application/json; charset=utf-8', JSON.stringify(payload, null, 2))
    },
  })

  // 前端挂件脚本不再由宿主注入：客户端 bundle 自己完成挂载。

  // ————————————————————— 状态聚合 —————————————————————
  // 前端每秒轮询，字段全部是"当前值 + 计数器"，前端靠计数器增量识别事件。
  register({
    kind: 'exact',
    path: URL_PREFIX + '/state',
    handler: (req, res) => {
      const payload = {
        seq: runtime.seq,
        schemaVersion: SCHEMA_VERSION,
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
          // 使用源拆分（当日累计，按花费降序；前端只取前几条）
          sources: Object.keys(runtime.spend.bySource || {})
            .map((k) => {
              const r = runtime.spend.bySource[k] || {}
              return {
                provider: String(r.provider || '未知'),
                model: String(r.model || '未知'),
                cost: Number(Number(r.cost || 0).toFixed(6)),
                tokens: Number(r.tokens) || 0,
              }
            })
            .filter((r) => r.cost > 0)
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 8),
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
        const body = JSON.stringify({ ok: true, version: SCHEMA_VERSION, settings: runtime.settings, spend: runtime.spend })
        send(res, 200, 'application/json; charset=utf-8', body)
        return
      }
      if (method !== 'PUT' && method !== 'POST') {
        send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
        return
      }
      let raw = ''
      try {
        raw = await new Promise((resolve, rejectBody) => {
          let size = 0
          const chunks = []
          req.on('data', (c) => {
            size += c.length
            if (size > 8192) { rejectBody(new Error('body too large')); req.destroy(); return }
            chunks.push(c)
          })
          req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
          req.on('error', rejectBody)
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
      Object.assign(runtime.settings, normalizeSettings(s, runtime.settings))
      store.bump()
      try { await store.writeConfigNow() } catch (err) {}
      send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, version: SCHEMA_VERSION, settings: runtime.settings }))
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
      store.bump()
    } catch (err) {}
  }, 15000)
  disposers.push(() => clearInterval(periodTimer))

  // 余额轮询：60s 一次
  function pollBalanceTick() {
    let account = null
    try {
      account = typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : null
    } catch (err) { account = null }
    return store.pollBalance(account).catch(() => {})
  }
  const firstBalanceTimer = setTimeout(pollBalanceTick, 2500)
  const balanceTimer = setInterval(pollBalanceTick, 60000)
  disposers.push(() => { clearTimeout(firstBalanceTimer); clearInterval(balanceTimer) })

  // 静态资源前缀（视频 / 字体 / 音频）。
  // ⚠️ 前缀**不能带尾斜杠**：DSH 的 webServer 判定条件是
  //    `pathname === prefix || pathname.startsWith(prefix + '/')`
  //    注册成 '/dsh-closure/assets/' 时，'/dsh-closure/assets/audio/x.ogg' 永远匹配不到（会 404）。
  function serveTree(basePath, rootDir) {
    register({
      kind: 'prefix',
      path: basePath,
      handler: (req, res) => {
        let rel
        try {
          rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
            .slice(basePath.length)
            .replace(/^\/+/, '')
        } catch (err) {
          send(res, 400, 'text/plain; charset=utf-8', 'bad path')
          return
        }
        if (!rel) {
          send(res, 404, 'text/plain; charset=utf-8', 'not found')
          return
        }
        const file = path.resolve(rootDir, rel)
        if (file !== rootDir && !file.startsWith(rootDir + path.sep)) {
          send(res, 403, 'text/plain; charset=utf-8', 'forbidden')
          return
        }
        return serveFile(res, file)
      },
    })
  }
  serveTree(URL_PREFIX + '/assets', assetRoot)

  console.info('[closure-pet] 路由已注册：' + URL_PREFIX + '/ping, /state, /config, /assets/*'
    + (hostFence ? '' : '（注意：宿主信任栅栏不可用，已启用回环校验）'))

  return { disposers }
}
