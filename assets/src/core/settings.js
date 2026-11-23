// dsh-closure-pet — 用户设置
//
// settings 是可变对象：面板、宿主配置、默认值都直接改它的字段。
// 持久化有两份：localStorage（浏览器侧，立即生效）+ PUT /config（宿主落盘到 $DSH_HOME/.dshcl.json）。

import { PREFIX, SETTINGS_KEY } from './env.js'
import { SETTINGS_DEFAULTS, normalizeSettings } from '../shared/protocol.js'

export const settings = { ...SETTINGS_DEFAULTS }

export function loadSettings() {
  try {
    var raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return
    var v = JSON.parse(raw)
    if (!v || typeof v !== 'object') return
    Object.assign(settings, normalizeSettings(v, settings))
  } catch (err) {}
}

var saveTimer = 0

export function saveSettings(immediate) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      mirror: settings.mirror, size: settings.size,
      bubble: settings.bubble, bubbleScale: settings.bubbleScale, bubbleTiers: settings.bubbleTiers,
      snapStrength: settings.snapStrength,
      opacity: settings.opacity,
      sound: settings.sound, volume: settings.volume,
      voice: settings.voice, voiceLang: settings.voiceLang, voiceVolume: settings.voiceVolume,
      lowThreshold: settings.lowThreshold,
      idleChatterMinutes: settings.idleChatterMinutes,
      idleChatterChance: settings.idleChatterChance,
      plate: settings.plate,
      platePosition: settings.platePosition,
      dialogues: settings.dialogues || {},
    }))
  } catch (err) {}
  // 同时写回宿主（$DSH_HOME/.dshcl.json），换浏览器/清缓存也能恢复
  clearTimeout(saveTimer)
  var push = function () {
    try {
      var payload = {
        mirror: settings.mirror, size: settings.size,
        bubble: settings.bubble, bubbleScale: settings.bubbleScale, bubbleTiers: settings.bubbleTiers,
        snapStrength: settings.snapStrength,
        opacity: settings.opacity,
        sound: settings.sound, volume: settings.volume,
        voice: settings.voice, voiceLang: settings.voiceLang, voiceVolume: settings.voiceVolume,
      }
      // 宿主配置还没加载时不要提交新字段，避免默认值覆盖用户已保存的文本/配置
      if (settings.hostLoaded) {
        payload.lowThreshold = settings.lowThreshold
        payload.idleChatterMinutes = settings.idleChatterMinutes
        payload.idleChatterChance = settings.idleChatterChance
        payload.plate = settings.plate
        payload.platePosition = settings.platePosition
        payload.dialogues = settings.dialogues || {}
      }
      fetch(PREFIX + '/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      }).catch(function () {})
    } catch (err) {}
  }
  if (immediate) push()
  else saveTimer = setTimeout(push, 400)
}

// 启动时合并浏览器里的旧设置（宿主配置在 boot 后由 loadHostConfig 合并）
loadSettings()
