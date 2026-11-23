// dsh-closure-pet — 前后端共享协议
//
// 宿主（lib/）与浏览器（assets/src/）都 import 这个文件：
//   · URL 前缀与 /state、/config 路径
//   · 协议版本（/state、/config 响应里带 schemaVersion/version）
//   · 设置默认值与归一化规则（宿主落盘、浏览器 localStorage 共用同一套 clamp）
//
// 该文件必须保持「纯数据 + 纯函数」：宿主直接 import，浏览器侧由 esbuild 打进 lib/client.js。

export const SCHEMA_VERSION = 1

export const URL_PREFIX = '/dsh-closure'
export const STATE_PATH = URL_PREFIX + '/state'
export const CONFIG_PATH = URL_PREFIX + '/config'

export const SIZE_MIN = 0.6
export const SIZE_MAX = 2.0
export const OPACITY_MIN = 0.3
export const BUBBLE_SCALE_MIN = 50
export const BUBBLE_SCALE_MAX = 200
export const BUBBLE_SCALE_BASE = 100 // 100% = 气泡排版的基准尺寸，缩放系数 = scale / 100
export const SNAP_STRENGTH_MIN = 0
export const SNAP_STRENGTH_MAX = 200

// 设置页低频项
export const LOW_THRESHOLD_DEFAULT = 10
export const IDLE_CHATTER_MINUTES_DEFAULT = 10
export const IDLE_CHATTER_CHANCE_DEFAULT = 0.5
export const DIALOGUE_KEYS = [
  'idle', 'sadIdle', 'thinkIdle',
  'lowBalance', 'credited', 'peakTime', 'valleyTime',
  'turnInterrupted', 'error', 'toolSuccess', 'turnEnd', 'interact',
]

export function normalizeDialogues(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const key of DIALOGUE_KEYS) {
    const list = raw[key]
    if (!Array.isArray(list)) continue
    const rows = list
      .map((item) => String(item == null ? '' : item).trim())
      .filter(Boolean)
      .slice(0, 40)
      .map((item) => item.slice(0, 200))
    if (rows.length) out[key] = rows
  }
  return out
}

export const SETTINGS_DEFAULTS = Object.freeze({
  mirror: 'auto',
  size: 1,
  bubble: true,
  // 气泡缩放：100% 为基准；50%–200%
  bubbleScale: BUBBLE_SCALE_BASE,
  // 分级排版：金额大、辅助信息小的多字号排版（关掉后统一字号）
  bubbleTiers: true,
  // 边缘吸附强度：200% = 旧行为（屏幕外侧 1/4），0% = 不吸附
  snapStrength: SNAP_STRENGTH_MAX,
  opacity: 1,
  sound: true,
  volume: 0.7,
  voice: false,
  voiceLang: 'zh',
  voiceVolume: 0.7,
  lowThreshold: LOW_THRESHOLD_DEFAULT,
  idleChatterMinutes: IDLE_CHATTER_MINUTES_DEFAULT,
  idleChatterChance: IDLE_CHATTER_CHANCE_DEFAULT,
  dialogues: {},
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
  const bubbleScale = Number(raw.bubbleScale)
  if (Number.isFinite(bubbleScale)) {
    out.bubbleScale = Math.min(BUBBLE_SCALE_MAX, Math.max(BUBBLE_SCALE_MIN, bubbleScale))
  }
  if (typeof raw.bubbleTiers === 'boolean') out.bubbleTiers = raw.bubbleTiers
  const snapStrength = Number(raw.snapStrength)
  if (Number.isFinite(snapStrength)) {
    out.snapStrength = Math.min(SNAP_STRENGTH_MAX, Math.max(SNAP_STRENGTH_MIN, snapStrength))
  }
  const opacity = Number(raw.opacity)
  if (Number.isFinite(opacity)) out.opacity = Math.min(1, Math.max(OPACITY_MIN, opacity))
  if (typeof raw.sound === 'boolean') out.sound = raw.sound
  const volume = Number(raw.volume)
  if (Number.isFinite(volume)) out.volume = Math.min(1, Math.max(0, volume))
  if (typeof raw.voice === 'boolean') out.voice = raw.voice
  if (raw.voiceLang === 'zh' || raw.voiceLang === 'ja') out.voiceLang = raw.voiceLang
  const voiceVolume = Number(raw.voiceVolume)
  if (Number.isFinite(voiceVolume)) out.voiceVolume = Math.min(1, Math.max(0, voiceVolume))
  const lowThreshold = Number(raw.lowThreshold)
  if (Number.isFinite(lowThreshold)) out.lowThreshold = Math.min(1000000, Math.max(0, lowThreshold))
  const idleChatterMinutes = Number(raw.idleChatterMinutes)
  if (Number.isFinite(idleChatterMinutes)) out.idleChatterMinutes = Math.min(1440, Math.max(0, idleChatterMinutes))
  const idleChatterChance = Number(raw.idleChatterChance)
  if (Number.isFinite(idleChatterChance)) out.idleChatterChance = Math.min(1, Math.max(0, idleChatterChance))
  if (raw.dialogues && typeof raw.dialogues === 'object') {
    out.dialogues = { ...normalizeDialogues(out.dialogues), ...normalizeDialogues(raw.dialogues) }
  }
  return out
}
