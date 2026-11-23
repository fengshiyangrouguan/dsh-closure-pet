// dsh-closure-pet — 宿主：硬件采样
//
// 只服务 GET /dsh-closure/hardware，供桌宠挂牌显示：
//   · CPU：os.cpus() 两次快照求差；窗口不足时返回上一次有效值
//   · 内存：total - free
//   · GPU：nvidia-smi，单飞 + 2s 缓存；无命令/超时退避 60s，失败降级成空数组
//
// 采样器不持有定时器，插件卸载时没有常驻任务。

import os from 'node:os'
import { execFile as nodeExecFile } from 'node:child_process'

export const GPU_CACHE_MS = 2000
export const GPU_RETRY_MS = 60000
export const GPU_TIMEOUT_MS = 1500
export const CPU_MIN_WINDOW_MS = 400
export const LEVEL_WARN = 75
export const LEVEL_ERROR = 90

const GPU_ARGS = [
  '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu',
  '--format=csv,noheader,nounits',
]

/** 用量 → 档位。缺读数算 idle，不算告警。 */
export function levelOf(percent) {
  if (percent === null || percent === undefined) return 'idle'
  const v = Number(percent)
  if (!Number.isFinite(v)) return 'idle'
  if (v >= LEVEL_ERROR) return 'error'
  if (v >= LEVEL_WARN) return 'warn'
  return 'ok'
}

function numberOrNull(raw) {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (!text || text === '[N/A]' || text === 'N/A') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/** 解析 nvidia-smi --format=csv,noheader,nounits；坏行跳过。 */
export function parseGpuCsv(stdout) {
  const out = []
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const cols = line.split(',').map((col) => col.trim())
    if (cols.length < 6) continue
    const index = numberOrNull(cols[0])
    if (index === null) continue
    const mib = (value) => (value === null ? null : Math.round(value * 1024 * 1024))
    out.push({
      index,
      name: cols[1] || 'GPU',
      usage: numberOrNull(cols[2]),
      memUsed: mib(numberOrNull(cols[3])),
      memTotal: mib(numberOrNull(cols[4])),
      temp: numberOrNull(cols[5]),
    })
  }
  return out
}

/** 百分比（一位小数）；分母无效返回 null。 */
export function percentOf(used, total) {
  if (used === null || used === undefined || total === null || total === undefined) return null
  const u = Number(used)
  const t = Number(total)
  if (!Number.isFinite(u) || !Number.isFinite(t) || t <= 0) return null
  return Math.min(100, Math.max(0, Math.round((u / t) * 1000) / 10))
}

function round1(value) {
  return Math.round(value * 10) / 10
}

function snapshotCpus(osImpl) {
  let idle = 0
  let total = 0
  for (const cpu of osImpl.cpus() || []) {
    const times = cpu.times || {}
    const n = (key) => Number(times[key]) || 0
    const idleTime = n('idle') + n('iowait')
    idle += idleTime
    total += n('user') + n('nice') + n('sys') + n('irq') + n('softirq') + n('steal') + idleTime
  }
  return { idle, total, at: Date.now() }
}

function gpuErrorOf(err) {
  if (!err) return 'nvidia-smi 不可用'
  if (err.killed || err.signal === 'SIGTERM') return 'ETIMEDOUT'
  return String(err.code || err.message || 'nvidia-smi 失败').slice(0, 120)
}

export function createHardwareSampler(opts = {}) {
  const osImpl = opts.os || os
  const execFile = opts.execFile || nodeExecFile
  const log = opts.log || (() => {})

  let cpuPrev = snapshotCpus(osImpl)
  let lastCpu = null
  let gpuCacheAt = 0
  let gpuCache = { gpus: [], error: null }
  let gpuPending = null
  let gpuRetryAt = 0
  let loggedError = null
  let lastSampleAt = 0

  function sampleCpu() {
    const cur = snapshotCpus(osImpl)
    const elapsed = cur.at - cpuPrev.at
    const idleDelta = cur.idle - cpuPrev.idle
    const totalDelta = cur.total - cpuPrev.total
    cpuPrev = cur
    if (elapsed < CPU_MIN_WINDOW_MS || totalDelta <= 0) return lastCpu
    lastCpu = round1(Math.min(100, Math.max(0, (1 - idleDelta / totalDelta) * 100)))
    return lastCpu
  }

  function sampleMem() {
    const total = osImpl.totalmem()
    const used = Math.max(0, total - osImpl.freemem())
    return { used, total, percent: percentOf(used, total) }
  }

  function queryGpu() {
    return new Promise((resolve) => {
      try {
        execFile(
          'nvidia-smi',
          GPU_ARGS,
          { windowsHide: true, timeout: GPU_TIMEOUT_MS },
          (err, stdout) => {
            if (err) resolve({ gpus: [], error: gpuErrorOf(err) })
            else resolve({ gpus: parseGpuCsv(stdout), error: null })
          },
        )
      } catch (err) {
        resolve({ gpus: [], error: gpuErrorOf(err) })
      }
    })
  }

  async function sampleGpu() {
    const now = Date.now()
    if (now < gpuRetryAt) return gpuCache
    if (now - gpuCacheAt < GPU_CACHE_MS) return gpuCache
    if (gpuPending) return gpuPending
    gpuPending = queryGpu().then((result) => {
      gpuCacheAt = Date.now()
      gpuCache = result
      if (result.error === 'ENOENT' || result.error === 'ETIMEDOUT') {
        gpuRetryAt = Date.now() + GPU_RETRY_MS
      }
      if (result.error && result.error !== loggedError) {
        loggedError = result.error
        log('GPU 采样降级：' + result.error)
      }
      return result
    }).finally(() => {
      gpuPending = null
    })
    return gpuPending
  }

  async function sample() {
    const cpu = sampleCpu()
    const mem = sampleMem()
    const gpu = await sampleGpu()
    lastSampleAt = Date.now()
    return { ok: true, at: lastSampleAt, cpu, mem, gpus: gpu.gpus, gpuError: gpu.error }
  }

  function debug() {
    return { lastSampleAt, gpuError: gpuCache.error, gpuCachedAt: gpuCacheAt, gpuCount: gpuCache.gpus.length }
  }

  return { sample, debug }
}
