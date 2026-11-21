// dsh-closure-pet — 硬件状态挂牌（工厂）
//
// 一块很薄的 HUD：CPU / 内存 / GPU 用量与温度，挂在桌宠头顶 8px。
//   · 数据来自宿主 GET /dsh-closure/hardware（宿主侧单飞 + 2s 缓存）
//   · 自己在 2s 节奏上轮询，页面隐藏 / 屏保亮板 / 开关关闭时停采样并隐藏
//   · 纯 DOM，无 canvas：颜色走 --dsw-alias-*，字体继承宿主（皮肤换字体也跟着变）
//
// 依赖注入：settings（settings.plate 是开关）、pet（pos/flipped）、size()。

import { HARDWARE_PATH } from '../shared/protocol.js'
import {
  buildSegments, PLATE_MAX_ROW_WIDTH, PLATE_LINE_HEIGHT, PLATE_PADDING_Y, PLATE_PADDING_X,
  PLATE_GROUP_GAP, PLATE_SEGMENT_GAP, PLATE_DOT_SIZE, PLATE_FONT_SIZE,
} from './plate-format.js'

// 颜色优先跟随宿主主题变量，取不到时退回 dafeiyu 挂牌的配色
var COLORS = {
  ok: { text: 'var(--dsw-alias-label-primary, #F2F7FD)', dot: 'var(--dsw-alias-state-success-primary, #63C8FF)' },
  warn: { text: 'var(--dsw-alias-state-warn-primary, #FFD07A)', dot: 'var(--dsw-alias-state-warn-primary, #FFC65C)' },
  error: { text: 'var(--dsw-alias-state-error-primary, #FF9B9B)', dot: 'var(--dsw-alias-state-error-primary, #FF7A7A)' },
  idle: { text: 'var(--dsw-alias-label-tertiary, #8A97A5)', dot: 'var(--dsw-alias-label-tertiary, #5C6875)' },
}

var POLL_MS = 2000

export function createPlate(deps) {
  var settings = deps.settings
  var pet = deps.pet
  var size = deps.size

  var el = null
  var rowEl = null
  var segNodes = {}
  var timer = 0
  var running = false
  var inflight = false
  var lastSample = null
  var lastSampleAt = 0
  var lastError = null
  var lastPos = null

  function createSeg() {
    var wrap = document.createElement('span')
    wrap.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:' + PLATE_SEGMENT_GAP + 'px',
      'white-space:nowrap',
    ].join(';')
    var dot = document.createElement('span')
    dot.style.cssText = [
      'display:inline-block', 'width:' + PLATE_DOT_SIZE + 'px', 'height:' + PLATE_DOT_SIZE + 'px',
      'border-radius:50%', 'flex:0 0 auto', 'background:' + COLORS.idle.dot,
    ].join(';')
    var text = document.createElement('span')
    text.style.cssText = 'color:' + COLORS.idle.text + ';white-space:nowrap'
    wrap.appendChild(dot)
    wrap.appendChild(text)
    return { wrap: wrap, dot: dot, text: text }
  }

  function ensure() {
    if (el) return
    el = document.createElement('div')
    el.id = 'dsh-closure-pet-plate'
    el.setAttribute('data-cl-pet-plate', '')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'display:none',
      'z-index:2147481998', // 低于气泡(2147481999)、高于皮肤 .cl-scene
      'pointer-events:none', 'user-select:none',
      // fixed + 只给 left 时宽度是 shrink-to-fit，会被右侧剩余空间压成多行 → 明确按内容撑开
      'width:max-content',
      'max-width:' + PLATE_MAX_ROW_WIDTH + 'px',
      'padding:' + PLATE_PADDING_Y + 'px ' + PLATE_PADDING_X + 'px',
      'border-radius:8px',
      'background:rgba(15,19,26,.84)',
      'border:1px solid rgba(255,255,255,.13)',
      'box-shadow:0 4px 14px rgba(0,0,0,.35)',
      'font-size:' + PLATE_FONT_SIZE + 'px',
      'line-height:' + PLATE_LINE_HEIGHT + 'px',
      // 字体族故意不写：继承宿主 / 皮肤设置
      'font-variant-numeric:tabular-nums',
      'letter-spacing:.02em',
      'backdrop-filter:blur(6px)',
      'transition:opacity .18s ease',
      'opacity:0',
    ].join(';')
    rowEl = document.createElement('div')
    rowEl.style.cssText = [
      'display:flex', 'flex-wrap:wrap', 'align-items:center',
      'column-gap:' + PLATE_GROUP_GAP + 'px', 'row-gap:0px',
    ].join(';')
    el.appendChild(rowEl)
    document.body.appendChild(el)
    render(null)
  }

  function render(sample) {
    if (!el) return
    var segs = buildSegments(sample)
    var seen = {}
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i]
      seen[seg.key] = true
      var node = segNodes[seg.key]
      if (!node) {
        node = createSeg()
        segNodes[seg.key] = node
        rowEl.appendChild(node.wrap)
      }
      // 段可以后出现（比如显卡第一帧还没采到）：每次都按顺序重排，避免挤到末尾
      if (rowEl.childNodes[i] !== node.wrap) rowEl.insertBefore(node.wrap, rowEl.childNodes[i] || null)
      var color = COLORS[seg.level] || COLORS.idle
      node.dot.style.background = color.dot
      node.text.style.color = color.text
      node.text.textContent = seg.text
    }
    Object.keys(segNodes).forEach(function (key) {
      if (seen[key]) return
      var stale = segNodes[key]
      if (stale.wrap.parentNode) stale.wrap.parentNode.removeChild(stale.wrap)
      delete segNodes[key]
    })
    position()
  }

  /** 挂在头顶居中；上方放不下就改挂下方，左右都夹在视口里。 */
  function position() {
    if (!el || !pet.pos || !size) return
    var s = size()
    var w = el.offsetWidth || 0
    var h = el.offsetHeight || 0
    if (!w || !h) return
    var left = pet.pos.x + s.w / 2 - w / 2
    var top = pet.pos.y - h - 8
    if (top < 8) top = pet.pos.y + s.h + 8
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8))
    var next = { left: Math.round(left), top: Math.round(top) }
    if (lastPos && lastPos.left === next.left && lastPos.top === next.top) return
    lastPos = next
    el.style.left = next.left + 'px'
    el.style.top = next.top + 'px'
  }

  function shouldPoll() {
    if (settings.plate !== true) return false
    if (!running) return false
    if (document.hidden) return false
    // 屏保亮板期间整块盖住，读数没人看，也别再花 nvidia-smi 的开销
    try { if (document.documentElement.hasAttribute('data-dsh-idle-crt')) return false } catch (err) {}
    return true
  }

  function show() {
    ensure()
    if (el.style.display !== 'block') {
      el.style.display = 'block'
      lastPos = null
    }
    position()
    // 先显示再淡入：display:none 时改 opacity 不会触发过渡
    requestAnimationFrame(function () { if (el) el.style.opacity = '1' })
  }

  function hide() {
    if (!el) return
    el.style.opacity = '0'
    el.style.display = 'none'
    lastPos = null
  }

  function stopTimer() {
    if (!timer) return
    clearInterval(timer)
    timer = 0
  }

  async function poll() {
    if (!shouldPoll()) { sync(); return }
    if (inflight) return
    inflight = true
    try {
      var res = await fetch(HARDWARE_PATH, { cache: 'no-store' })
      if (!res || !res.ok) throw new Error('HTTP ' + ((res && res.status) || 0))
      var data = await res.json()
      if (!data || data.ok !== true) throw new Error('bad payload')
      lastSample = data
      lastSampleAt = Date.now()
      lastError = null
      render(data)
    } catch (err) {
      lastError = String((err && err.message) || err)
      // 采样失败保留上一帧，只是不再刷新（不用 '--' 抹掉刚拿到的读数）
    } finally {
      inflight = false
    }
  }

  /** 开关 / 屏保 / 页面可见性变化后统一收敛到「该不该显示 + 该不该轮询」。 */
  function sync() {
    if (!shouldPoll()) {
      stopTimer()
      hide()
      return
    }
    show()
    if (!timer) {
      timer = setInterval(poll, POLL_MS)
      poll()
    }
  }

  function start() {
    running = true
    sync()
  }

  function pause() {
    running = false
    stopTimer()
    hide()
  }

  function resume() {
    running = true
    sync()
  }

  /** 桌宠被拖动 / 吸附 / 缩放后调用：只挪位置，不重采样。 */
  function follow() {
    if (el && el.style.display === 'block') position()
  }

  function applySettings() {
    if (!settings.plate) {
      stopTimer()
      hide()
      return
    }
    if (running) sync()
  }

  function dispose() {
    stopTimer()
    running = false
    if (el && el.parentNode) el.parentNode.removeChild(el)
    el = null
    rowEl = null
    segNodes = {}
    lastPos = null
    lastSample = null
  }

  function debug() {
    return {
      active: !!(el && el.style.display === 'block'),
      enabled: settings.plate === true,
      running: running,
      lastSampleAt: lastSampleAt,
      lastError: lastError,
      sample: lastSample,
    }
  }

  return {
    start: start, pause: pause, resume: resume,
    follow: follow, applySettings: applySettings,
    dispose: dispose, debug: debug,
    getSample: function () { return lastSample },
  }
}
