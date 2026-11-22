// 宿主状态轮询与事件分发（3.0）：只把 /state 翻译成 conditions 和事实事件。
// 动画选择、优先级、排队、通知都在 anim/machine + runtime。

import { PREFIX, SIZE_MIN, SIZE_MAX, BUBBLE_SCALE_MIN, BUBBLE_SCALE_MAX, SNAP_STRENGTH_MIN, SNAP_STRENGTH_MAX } from '../core/env.js'
import { HAPPY_CHANCE } from '../anim/library.js'

export function createState(deps) {
  var runtime = deps.runtime
  var showBubble = deps.showBubble
  var refreshBubble = deps.refreshBubble
  var scheduleStartup = deps.scheduleStartup
  var settings = deps.settings
  var saveSettings = deps.saveSettings
  var layout = deps.layout
  var repositionForAnchor = deps.repositionForAnchor
  var resolveFlip = deps.resolveFlip
  var applyOpacity = deps.applyOpacity
  var isBubbleShown = deps.isBubbleShown

  var pollTimer = 0
  var pollTimerMs = 0
  var lastState = null
  var toolPlayTimes = []
  var TOOL_MIN_GAP = 1200
  var TOOL_WINDOW = 10000
  var TOOL_WINDOW_MAX = 3

  function canTool() {
    var now = Date.now()
    toolPlayTimes = toolPlayTimes.filter(function (t) { return now - t < TOOL_WINDOW })
    var last = toolPlayTimes.length ? toolPlayTimes[toolPlayTimes.length - 1] : 0
    if (now - last < TOOL_MIN_GAP) return false
    if (toolPlayTimes.length >= TOOL_WINDOW_MAX) return false
    toolPlayTimes.push(now)
    return true
  }

  function applyState(s) {
    if (!s || typeof s !== 'object') return
    var prev = lastState
    lastState = s
    runtime.setSnapshot(s)

    var mode = s.work && s.work.mode
    var low = !!(s.balance && s.balance.low)
    runtime.setConditions({ low: low, work: mode || 'idle' })

    if (!prev) {
      scheduleStartup(s.period === 'peak', low)
    } else {
      if (s.tools && prev.tools) {
        if (s.tools.ok > prev.tools.ok && Math.random() <= HAPPY_CHANCE && canTool()) {
          runtime.fire('tool-success')
        }
        if (s.tools.fail > prev.tools.fail && canTool()) {
          runtime.fire('tool-fail')
        }
      }

      var prevErr = (prev.errors && prev.errors.count) || 0
      var curErr = (s.errors && s.errors.count) || 0
      if (curErr > prevErr) runtime.fire('error')

      if (s.topUpSeq > prev.topUpSeq) runtime.fire('credited')

      var prevTurn = (prev.turnEnd && prev.turnEnd.seq) || 0
      var curTurn = (s.turnEnd && s.turnEnd.seq) || 0
      if (curTurn > prevTurn) {
        var kind = (s.turnEnd && s.turnEnd.kind) || 'completed'
        if (kind === 'completed') {
          showBubble()
        } else {
          runtime.fire('turn-interrupted')
        }
      }

      if (s.periodSeq > prev.periodSeq) {
        runtime.fire(s.period === 'peak' ? 'peak_time' : 'valley_time')
      }
    }

    if (isBubbleShown()) refreshBubble()
  }

  function pollState() {
    fetch(PREFIX + '/state', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (s) { try { applyState(s) } catch (err) {} })
      .catch(function () {})
  }

  function startPolling() {
    pollState()
    setPollInterval(1000)
  }

  function setPollInterval(ms) {
    if (pollTimer && pollTimerMs === ms) return
    if (pollTimer) clearInterval(pollTimer)
    pollTimerMs = ms
    pollTimer = setInterval(pollState, ms)
  }

  function loadHostConfig() {
    fetch(PREFIX + '/config', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (cfg) {
        var s = cfg && cfg.settings
        if (!s) return
        if (s.mirror === 'auto' || s.mirror === 'always' || s.mirror === 'never') settings.mirror = s.mirror
        if (isFinite(Number(s.size))) settings.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(s.size)))
        if (typeof s.bubble === 'boolean') settings.bubble = s.bubble
        if (isFinite(Number(s.bubbleScale))) settings.bubbleScale = Math.min(BUBBLE_SCALE_MAX, Math.max(BUBBLE_SCALE_MIN, Number(s.bubbleScale)))
        if (typeof s.bubbleTiers === 'boolean') settings.bubbleTiers = s.bubbleTiers
        if (isFinite(Number(s.snapStrength))) settings.snapStrength = Math.min(SNAP_STRENGTH_MAX, Math.max(SNAP_STRENGTH_MIN, Number(s.snapStrength)))
        if (isFinite(Number(s.opacity))) settings.opacity = Math.min(1, Math.max(0.3, Number(s.opacity)))
        if (typeof s.sound === 'boolean') settings.sound = s.sound
        if (isFinite(Number(s.volume))) settings.volume = Math.min(1, Math.max(0, Number(s.volume)))
        if (isFinite(Number(s.lowThreshold))) settings.lowThreshold = Math.min(1000000, Math.max(0, Number(s.lowThreshold)))
        if (isFinite(Number(s.idleChatterMs))) settings.idleChatterMs = Math.min(600000, Math.max(0, Number(s.idleChatterMs)))
        if (s.dialogues && typeof s.dialogues === 'object') settings.dialogues = s.dialogues
        layout()
        repositionForAnchor()
        resolveFlip()
        applyOpacity()
        if (isBubbleShown()) refreshBubble()
        saveSettings(true)
      })
      .catch(function () {})
  }

  function dispose() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = 0 }
    pollTimerMs = 0
  }

  return {
    applyState: applyState,
    pollState: pollState,
    startPolling: startPolling,
    setPollInterval: setPollInterval,
    loadHostConfig: loadHostConfig,
    getState: function () { return lastState },
    dispose: dispose,
  }
}
