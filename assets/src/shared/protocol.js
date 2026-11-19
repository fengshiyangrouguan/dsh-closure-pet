// dsh-closure-pet — 前后端共享协议
//
// 宿主（lib/）与浏览器（assets/src/）都 import 这个文件：
//   · URL 前缀与 /state、/config 路径
//   · 协议版本（/state、/config 响应里带 schemaVersion/version）
//   · 设置默认值与归一化规则（宿主落盘、浏览器 localStorage 共用同一套 clamp）
//
// 该文件必须保持「纯数据 + 纯函数」：浏览器会通过 /dsh-closure/src/shared/protocol.js 加载它。

export const SCHEMA_VERSION = 1

export const URL_PREFIX = '/dsh-closure'
export const STATE_PATH = URL_PREFIX + '/state'
export const CONFIG_PATH = URL_PREFIX + '/config'

export const SIZE_MIN = 0.6
export const SIZE_MAX = 2.0
export const OPACITY_MIN = 0.3

export const SETTINGS_DEFAULTS = Object.freeze({
  mirror: 'auto',
  size: 1,
  bubble: true,
  opacity: 1,
  sound: true,
  volume: 0.7,
})

/**
 * 把外部传进来的设置补丁归一化到合法范围；非法字段保持 base 的值。
 * 不修改入参，返回新对象。
 */
export function normalizeSettings(raw, base) {
  const out = { ...(base || SETTINGS_DEFAULTS) }
  if (!raw || typeof raw !== 'object') return out
  if (raw.mirror === 'auto' || raw.mirror === 'always' || raw.mirror === 'never') out.mirror = raw.mirror
  const size = Number(raw.size)
  if (Number.isFinite(size)) out.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, size))
  if (typeof raw.bubble === 'boolean') out.bubble = raw.bubble
  const opacity = Number(raw.opacity)
  if (Number.isFinite(opacity)) out.opacity = Math.min(1, Math.max(OPACITY_MIN, opacity))
  if (typeof raw.sound === 'boolean') out.sound = raw.sound
  const volume = Number(raw.volume)
  if (Number.isFinite(volume)) out.volume = Math.min(1, Math.max(0, volume))
  return out
}
