// dsh-closure-pet — 宿主：硬件采样
//
// 只服务 GET /dsh-closure/hardware，给桌宠的「硬件状态挂牌」供数：
//   · CPU / 内存：os 模块同步读，单次 <0.2ms，直接算
//   · GPU：要起 nvidia-smi 子进程（40–60ms），必须单飞 + 缓存，
//     失败一律降级成 gpus: []，绝不把错误变成 500
//
// 阈值跟 dafeiyu 的挂牌一致：>=90 error、>=75 warn、其余 ok、读数缺失 idle。

import os from 'node:os'
import { execFile } from 'node:child_process'

export const GPU_CACHE_MS = 2000
export const GPU_RETRY_MS = 60000
export const GPU_TIMEOUT_MS = 1500
export const GPU_QUERY_FIELDS = 'index,name,utilization.gpu,memory.used,memory.total,temperature.gpu'
// 采样窗口太短（刚启动、连续两次请求）算出来的百分比没有意义
export const CPU_MIN_WINDOW_MS = 400

export const LEVEL_WARN = 75
export const LEVEL_ERROR = 90

/** 用量 → 档位。null / NaN（读数缺失）算 idle，不当成告警。 */
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
  const v = Number(text)
  return Number.isFinite(v) ? v : null
}

/** 解析 `nvidia-smi --format=csv,noheader,nounits` 输出；坏行跳过，不抛错。 */
export function parseGpuCsv(stdout) {
  const out = []
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const cols = line.split(',').map((c) => c.trim())
    if (cols.length < 6) continue
    const index = numberOrNull(cols[0])
    if (index === null) continue
    // nvidia-smi 的显存单位是 MiB；这里统一换成字节，前端只按字节格式化
    const mibToBytes = (v) => (v === null ? null : Math.round(v * 1024 * 1024))
    out.push({
      index,
      name: cols[1] || 'GPU',
      usage: numberOrNull(cols[2]),
      memUsed: mibToBytes(numberOrNull(cols[3])),
      memTotal: mibToBytes(numberOrNull(cols[4])),
      temp: numberOrNull(cols[5]),
    })
  }
  return out
}

/** 百分比（保留一位小数）；分母非法时返回 null。 */
export function percentOf(used, total) {
  // null 表示「这项没读到」，不能当成 0（否则没插显卡时会显示成 0% 而不是 --）
  if (used === null || used === undefined || total === null || total === undefined) return null
  const u = Number(used)
  const t = Number(total)
  if (!Number.isFinite(u) || !Number.isFinite(t) || t <= 0) return null
  return Math.min(100, Math.max(0, Math.round((u / t) * 1000) / 10))
}

function round1(v) {
  return Math.round(v * 10) / 10
}

function snapshotCpus() {
  let idle = 0
  let total = 0
  for (const cpu of os.cpus() || []) {
    const t = cpu.times || {}
    idle += Number(t.idle) || 0
    total += (Number(t.user) || 0) + (Number(t.nice) || 0) + (Number(t.sys) || 0)
      + (Number(t.idle) || 0) + (Number(t.irq) || 0)
  }
  return { idle, total, at: Date.now() }
}

/**
 * 采样器：CPU 用两次快照求差，GPU 单飞 + 2s 缓存。
 * 不持有定时器：谁请求谁采样，插件卸载时没有残留。
 */
export function createHardwareSampler(opts) {
  const log = (opts && opts.log) || function () {}

  let cpuPrev = snapshotCpus()
  let gpuAt = 0
  let gpuGpus = []
  let gpuError = null
  let gpuPending = null
  let gpuUnavailable = false
  let gpuRetryAt = 0
  let lastSampleAt = 0

  function sampleCpu() {
    const cur = snapshotCpus()
    const dt = cur.at - cpuPrev.at
    const dIdle = cur.idle - cpuPrev.idle
    const dTotal = cur.total - cpuPrev.total
    cpuPrev = cur
    if (dt < CPU_MIN_WINDOW_MS || !(dTotal > 0)) return null
    return round1(Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100)))
  }

  function sampleMem() {
    const total = os.totalmem()
    const free = os.freemem()
    const used = Math.max(0, total - free)
    return { used, total, percent: percentOf(used, total) }
  }

  function runNvidiaSmi() {
    return new Promise((resolve) => {
      try {
        execFile(
          'nvidia-smi',
          ['--query-gpu=' + GPU_QUERY_FIELDS, '--format=csv,noheader,nounits'],
          { windowsHide: true, timeout: GPU_TIMEOUT_MS },
          (err, stdout) => {
            if (err) {
              const code = String((err && err.code) || '')
              resolve({ gpus: [], error: code || String((err && err.message) || 'nvidia-smi 失败').slice(0, 120) })
              return
            }
            resolve({ gpus: parseGpuCsv(stdout), error: null })
          },
        )
      } catch (err) {
        resolve({ gpus: [], error: String((err && err.message) || 'nvidia-smi 不可用').slice(0, 120) })
      }
    })
  }

  async function sampleGpu() {
    const now = Date.now()
    if (now - gpuAt < GPU_CACHE_MS) return { gpus: gpuGpus, error: gpuError }
    if (gpuPending) return gpuPending
    // 机器上根本没有 nvidia-smi：退避一分钟，别每 2s 再 fork 一次
    if (gpuUnavailable && now < gpuRetryAt) return { gpus: [], error: gpuError }
    gpuPending = runNvidiaSmi().then(
      (r) => {
        gpuAt = Date.now()
        gpuGpus = r.gpus
        gpuError = r.error
        gpuUnavailable = r.error === 'ENOENT' || r.error === 'ETIMEDOUT'
        if (gpuUnavailable) gpuRetryAt = Date.now() + GPU_RETRY_MS
        gpuPending = null
        return { gpus: r.gpus, error: r.error }
      },
      (err) => {
        gpuPending = null
        gpuAt = Date.now()
        gpuError = String((err && err.message) || 'nvidia-smi 失败').slice(0, 120)
        return { gpus: [], error: gpuError }
      },
    )
    return gpuPending
  }

  async function sample() {
    const cpu = sampleCpu()
    const mem = sampleMem()
    const gpu = await sampleGpu()
    lastSampleAt = Date.now()
    if (gpu.error && gpu.error !== 'ENOENT') log('GPU 采样降级：' + gpu.error)
    return {
      ok: true,
      at: lastSampleAt,
      cpu,
      mem,
      gpus: gpu.gpus,
      gpuError: gpu.error,
    }
  }

  function debug() {
    return { lastSampleAt, gpuError, gpuCachedAt: gpuAt, gpuCount: gpuGpus.length }
  }

  return { sample, debug }
}
