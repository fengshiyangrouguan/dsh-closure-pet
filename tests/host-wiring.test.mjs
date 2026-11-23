import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

// 用临时 DSH_HOME，避免写到真实的 ~/.dsh
const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-pet-host-'))
process.env.DSH_HOME = tmpHome

const { apply, inject, name } = await import('../lib/index.js')

function makeRoot(routes, cleanups) {
  const handlers = {}
  return {
    handlers,
    name,
    on(ev, fn) { (handlers[ev] || (handlers[ev] = [])).push(fn); return () => {} },
    effect(fn) { cleanups.push(fn()) },
    webServer: { register(route) { routes.push(route); return () => {} } },
    get(service) { return service === 'connection' ? { requestRejection: () => false } : null },
  }
}

function makeRes() {
  const out = { statusCode: 0, headers: {}, body: '' }
  const res = {
    set statusCode(v) { out.statusCode = v },
    get statusCode() { return out.statusCode },
    setHeader(k, v) { out.headers[k.toLowerCase()] = v },
    end(b) { out.body = Buffer.isBuffer(b) ? b.toString('utf8') : String(b || '') },
  }
  return { res, out }
}

function makeReq(method, url, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = { host: '127.0.0.1:4321' }
  return req
}

async function callRoute(routes, pathname, method, body) {
  const route = routes.find((r) => r.path === pathname && r.kind === 'exact')
  assert.ok(route, 'route not registered: ' + pathname)
  const { res, out } = makeRes()
  await route.handler(makeReq(method, pathname, body), res)
  return out
}

test('apply() 注册事件与全部路由', async (t) => {
  const routes = []
  const cleanups = []
  const root = makeRoot(routes, cleanups)
  assert.deepEqual(inject, ['webServer', 'connection'])
  apply(root)

  // 先注册清理，后续断言失败也不会留下轮询定时器
  t.after(async () => {
    for (const d of cleanups) { try { d() } catch (err) {} }
    await fs.rm(tmpHome, { recursive: true, force: true })
  })

  // 事件订阅
  for (const ev of ['session/event', 'agent/assistant-stream', 'tools/result', 'agent/error', 'agent/status']) {
    assert.ok(root.handlers[ev] && root.handlers[ev].length === 1, 'missing event ' + ev)
  }

  const paths = routes.map((r) => r.kind + ' ' + r.path)
  assert.deepEqual(paths, [
    'exact /dsh-closure/ping',
    'exact /dsh-closure/state',
    'exact /dsh-closure/config',
    'exact /dsh-closure/hardware',
    'prefix /dsh-closure/assets',
  ])

  // /state
  const state = await callRoute(routes, '/dsh-closure/state', 'GET')
  assert.equal(state.statusCode, 200)
  const payload = JSON.parse(state.body)
  assert.equal(payload.schemaVersion, 1)
  assert.ok(payload.period === 'peak' || payload.period === 'valley')
  assert.equal(payload.spend.today, 0)
  assert.equal(payload.config.lowThreshold, 10)

  // /config GET：默认设置
  const cfg = await callRoute(routes, '/dsh-closure/config', 'GET')
  const cfgBody = JSON.parse(cfg.body)
  assert.equal(cfgBody.version, 1)
  assert.equal(cfgBody.settings.size, 1)

  // /config PUT：越界值被归一化，并落盘
  const put = await callRoute(routes, '/dsh-closure/config', 'PUT', { settings: { size: 99, opacity: 0, mirror: 'never' } })
  assert.equal(put.statusCode, 200)
  const putBody = JSON.parse(put.body)
  assert.equal(putBody.settings.size, 2)
  assert.equal(putBody.settings.opacity, 0.3)
  assert.equal(putBody.settings.mirror, 'never')
  const saved = JSON.parse(await fs.readFile(path.join(tmpHome, '.dshcl.json'), 'utf8'))
  assert.equal(saved.version, 1)
  assert.equal(saved.settings.size, 2)

  // 局部 PUT 不能丢掉已保存的 dialogues / 闲时配置
  const put2 = await callRoute(routes, '/dsh-closure/config', 'PUT', {
    settings: { dialogues: { idle: ['自定义文本'] }, idleChatterMinutes: 5, idleChatterChance: 0.4 },
  })
  assert.equal(put2.statusCode, 200)
  const saved2 = JSON.parse(await fs.readFile(path.join(tmpHome, '.dshcl.json'), 'utf8'))
  assert.deepEqual(saved2.settings.dialogues, { idle: ['自定义文本'] })
  assert.equal(saved2.settings.idleChatterMinutes, 5)
  assert.equal(saved2.settings.idleChatterChance, 0.4)
  assert.equal(saved2.settings.size, 2, 'partial PUT should keep earlier settings')

  // /hardware：固定形状；无 nvidia-smi 也必须是 200 + gpus: []
  const hw = await callRoute(routes, '/dsh-closure/hardware', 'GET')
  assert.equal(hw.statusCode, 200)
  const hwBody = JSON.parse(hw.body)
  assert.equal(hwBody.ok, true)
  assert.ok(hwBody.cpu === null || typeof hwBody.cpu === 'number')
  assert.equal(typeof hwBody.mem.used, 'number')
  assert.equal(typeof hwBody.mem.total, 'number')
  assert.ok(Array.isArray(hwBody.gpus))
  const hwPost = await callRoute(routes, '/dsh-closure/hardware', 'POST')
  assert.equal(hwPost.statusCode, 405)

  // session/event：assistant/message 计费后 /state 能读到
  const peak = Date.parse('2026-11-19T02:00:00Z')
  root.handlers['session/event'][0](null, {
    type: 'assistant/message',
    time: peak,
    data: {
      usage: { inputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0 }, turn: 1,
      message: { source: { provider: 'deepseek', model: 'deepseek-v4-pro' } },
    },
  })
  const state2 = JSON.parse((await callRoute(routes, '/dsh-closure/state', 'GET')).body)
  assert.ok(state2.spend.today > 0, 'spend.today should increase')
  assert.equal(state2.spend.sources.length, 1)
  assert.equal(state2.spend.sources[0].provider, 'deepseek')
  assert.equal(state2.spend.sources[0].model, 'deepseek-v4-pro')
  assert.ok(state2.spend.sources[0].cost > 0)

  // agent/assistant-stream：thinking
  root.handlers['agent/assistant-stream'][0]({ frame: { type: 'start' } })
  const state3 = JSON.parse((await callRoute(routes, '/dsh-closure/state', 'GET')).body)
  assert.equal(state3.work.mode, 'thinking')
})
