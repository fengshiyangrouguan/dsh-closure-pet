// dsh-closure-pet — 硬件挂牌的纯排版逻辑（无 DOM）
//
// 采样 → 挂牌段：CPU 23% · GPU0 35% 2.9/8.0G 65°C · 内存 80%
// 浏览器与 node --test 都直接 import，不碰 document。

export const PLATE_MAX_ROW_WIDTH = 430
export const PLATE_LINE_HEIGHT = 18
export const PLATE_PADDING_Y = 4
export const PLATE_PADDING_X = 8
export const PLATE_GROUP_GAP = 12
export const PLATE_SEGMENT_GAP = 5
export const PLATE_DOT_SIZE = 5
export const PLATE_FONT_SIZE = 10.5

export const LEVEL_WARN = 75
export const LEVEL_ERROR = 90

/** 'dark' / 'light' / 空 / 'light dark' / 'normal' → 'dark' | 'light' | null（null = 交给系统） */
export function normalizeScheme(raw) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim().toLowerCase()
  if (!text || text === 'normal' || text === 'no-preference') return null
  if (text === 'dark') return 'dark'
  if (text === 'light') return 'light'
  if (text.includes('dark') && !text.includes('light')) return 'dark'
  if (text.includes('light') && !text.includes('dark')) return 'light'
  return null
}

export function levelOf(percent) {
  if (percent === null || percent === undefined) return 'idle'
  const value = Number(percent)
  if (!Number.isFinite(value)) return 'idle'
  if (value >= LEVEL_ERROR) return 'error'
  if (value >= LEVEL_WARN) return 'warn'
  return 'ok'
}

export function formatPercent(percent) {
  if (percent === null || percent === undefined) return '--'
  const value = Number(percent)
  if (!Number.isFinite(value)) return '--'
  return Math.round(value) + '%'
}

export function formatGigabytes(bytes) {
  if (bytes === null || bytes === undefined) return '--'
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) return '--'
  return (value / (1024 * 1024 * 1024)).toFixed(1) + 'G'
}

/** GPU 一段：GPU0 35% 2.9/8.0G 65°C；缺哪项就省哪项。 */
export function formatGpuLine(gpu) {
  const g = gpu || {}
  const index = Number.isFinite(Number(g.index)) ? Number(g.index) : 0
  const parts = ['GPU' + index, formatPercent(g.usage)]
  const used = formatGigabytes(g.memUsed)
  const total = formatGigabytes(g.memTotal)
  if (used !== '--' && total !== '--') parts.push(used.replace(/G$/, '') + '/' + total)
  if (Number.isFinite(Number(g.temp)) && g.temp !== null && g.temp !== undefined) {
    parts.push(Math.round(Number(g.temp)) + '\u00b0C')
  }
  return parts.join(' ')
}

/** 段顺序固定：CPU → 每张 GPU → 内存。tone 由挂牌上色使用。 */
export function buildSegments(sample) {
  const s = sample || {}
  const segments = [{
    key: 'cpu',
    tone: 'cpu',
    text: 'CPU ' + formatPercent(s.cpu),
    level: levelOf(s.cpu),
  }]
  const gpus = Array.isArray(s.gpus) ? s.gpus : []
  for (let i = 0; i < gpus.length; i++) {
    const gpu = gpus[i] || {}
    const index = Number.isFinite(Number(gpu.index)) ? Number(gpu.index) : i
    segments.push({
      key: 'gpu' + index,
      tone: 'gpu',
      text: formatGpuLine(gpu),
      level: levelOf(gpu.usage),
    })
  }
  const mem = s.mem && s.mem.percent !== undefined ? s.mem.percent : null
  segments.push({
    key: 'mem',
    tone: 'mem',
    text: '内存 ' + formatPercent(mem),
    level: levelOf(mem),
  })
  return segments
}
