// dsh-closure-pet — 硬件挂牌的纯排版逻辑（无 DOM）
//
// 宿主 /hardware 的采样 → 挂牌上的一串段：
//   ● CPU 23%    ● GPU0 99% 10.6/12.0G 57°    ● 内存 41%
//
// 纯函数，浏览器与 node --test 都能直接 import（不碰 document）。

export const PLATE_MAX_ROW_WIDTH = 430
export const PLATE_LINE_HEIGHT = 22
export const PLATE_PADDING_Y = 4
export const PLATE_PADDING_X = 10
export const PLATE_GROUP_GAP = 12
export const PLATE_SEGMENT_GAP = 5
export const PLATE_DOT_SIZE = 5
export const PLATE_FONT_SIZE = 11.3 // 8.5pt

export const LEVEL_WARN = 75
export const LEVEL_ERROR = 90

/** 与宿主 lib/hardware.js 的 levelOf 同一套阈值（两边都有单测互相校验）。 */
export function levelOf(percent) {
  if (percent === null || percent === undefined) return 'idle'
  const v = Number(percent)
  if (!Number.isFinite(v)) return 'idle'
  if (v >= LEVEL_ERROR) return 'error'
  if (v >= LEVEL_WARN) return 'warn'
  return 'ok'
}

export function formatPercent(percent) {
  if (percent === null || percent === undefined) return '--'
  const v = Number(percent)
  if (!Number.isFinite(v)) return '--'
  return Math.round(v) + '%'
}

/** 字节 → 「10.6G」。非数字返回 '--'，负值当缺失。 */
export function formatGigabytes(bytes) {
  // null / undefined 是「没读到」，Number(null) 会变成 0 显示成 0.0G，必须挡掉
  if (bytes === null || bytes === undefined) return '--'
  const v = Number(bytes)
  if (!Number.isFinite(v) || v < 0) return '--'
  return (v / (1024 * 1024 * 1024)).toFixed(1) + 'G'
}

/** GPU 一段的文字：GPU0 99% 10.6/12.0G 57°（缺哪项就省哪项）。 */
export function formatGpuLine(gpu) {
  const g = gpu || {}
  const index = Number.isFinite(Number(g.index)) ? Number(g.index) : 0
  const parts = ['GPU' + index, formatPercent(g.usage)]
  const used = formatGigabytes(g.memUsed)
  const total = formatGigabytes(g.memTotal)
  if (used !== '--' && total !== '--') parts.push(used.replace(/G$/, '') + '/' + total)
  if (Number.isFinite(Number(g.temp)) && g.temp !== null && g.temp !== undefined) {
    parts.push(Math.round(Number(g.temp)) + '\u00b0')
  }
  return parts.join(' ')
}

/** 采样 → 段列表。段顺序：CPU → 每张 GPU → 内存。 */
export function buildSegments(sample) {
  const s = sample || {}
  const segs = [{ key: 'cpu', text: 'CPU ' + formatPercent(s.cpu), level: levelOf(s.cpu) }]
  const gpus = Array.isArray(s.gpus) ? s.gpus : []
  for (let i = 0; i < gpus.length; i++) {
    const g = gpus[i] || {}
    const index = Number.isFinite(Number(g.index)) ? Number(g.index) : i
    segs.push({ key: 'gpu' + index, text: formatGpuLine(g), level: levelOf(g.usage) })
  }
  const memPercent = s.mem && s.mem.percent !== undefined ? s.mem.percent : null
  segs.push({ key: 'mem', text: '内存 ' + formatPercent(memPercent), level: levelOf(memPercent) })
  return segs
}
