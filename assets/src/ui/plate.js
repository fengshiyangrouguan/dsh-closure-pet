// dsh-closure-pet — 硬件状态挂牌（像素风 HUD）
//
// CPU / 内存 / GPU 读数来自 GET /dsh-closure/hardware。
// 挂在桌宠上方或下方（设置里可选，默认下方），页面隐藏、屏保亮板或开关关闭时停采样。

import { HARDWARE_PATH } from '../shared/protocol.js'
import {
  buildSegments, normalizeScheme,
  PLATE_MAX_ROW_WIDTH, PLATE_LINE_HEIGHT, PLATE_PADDING_Y, PLATE_PADDING_X,
  PLATE_GROUP_GAP, PLATE_SEGMENT_GAP, PLATE_DOT_SIZE, PLATE_FONT_SIZE,
} from './plate-format.js'

var POLL_MS = 2000
var FETCH_TIMEOUT_MS = 2500
var GAP = 8
var CHAMFER = 5

var PALETTES = {
  dark: {
    surface: '#24112f', border: '#7a3fa0', drop: '#0b0610',
    text: '#f4e7c3', cpu: '#b98cff', gpu: '#ff6b7a', mem: '#ffd166',
    ok: '#7ee787', warn: '#ffd166', error: '#ff5d73', idle: '#8e7aa6',
  },
  light: {
    surface: '#ffffff', border: '#a77bd0', drop: '#d9c2f0',
    text: '#2d1b3d', cpu: '#6d3b9e', gpu: '#b23a48', mem: '#8a6400',
    ok: '#2f8f5b', warn: '#b7791f', error: '#b23a48', idle: '#9a86b8',
  },
}

function detectScheme() {
  try {
    var root = document.documentElement
    var scheme = normalizeScheme(root.style && root.style.colorScheme)
    if (scheme) return scheme
    scheme = normalizeScheme(root.getAttribute('data-theme') || root.getAttribute('data-color-scheme'))
    if (scheme) return scheme
    try {
      scheme = normalizeScheme(window.getComputedStyle(root).colorScheme)
      if (scheme) return scheme
    } catch (err) {}
    if (root.classList) {
      if (root.classList.contains('dark')) return 'dark'
      if (root.classList.contains('light')) return 'light'
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch (err) {}
  return 'light'
}

export function createPlate(deps) {
  var settings = deps.settings
  var pet = deps.pet
  var size = deps.size
  var container = deps.container

  var el = null
  var boxEl = null
  var rowEl = null
  var segNodes = {}
  var timer = 0
  var running = false
  var inflight = null
  var lastSample = null
  var lastError = null
  var lastPos = null
  var theme = detectScheme()
  var palette = PALETTES[theme]
  var mediaQuery = null
  var themeObserver = null

  function createSeg() {
    var wrap = document.createElement('span')
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:' + PLATE_SEGMENT_GAP + 'px;white-space:nowrap'
    var dot = document.createElement('span')
    dot.style.cssText = [
      'display:inline-block',
      'width:' + PLATE_DOT_SIZE + 'px',
      'height:' + PLATE_DOT_SIZE + 'px',
      'flex:0 0 auto',
      'background:' + palette.idle,
    ].join(';')
    var text = document.createElement('span')
    text.style.cssText = 'color:' + palette.text + ';white-space:nowrap'
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
    el.setAttribute('data-cl-pet-plate-scheme', theme)
    el.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'display:none',
      'z-index:2147482001',
      'pointer-events:none', 'user-select:none',
      'width:max-content',
      'max-width:' + PLATE_MAX_ROW_WIDTH + 'px',
      'font-family:ui-monospace,"Cascadia Mono",Consolas,monospace',
      'font-size:' + PLATE_FONT_SIZE + 'px',
      'line-height:' + PLATE_LINE_HEIGHT + 'px',
      'font-variant-numeric:tabular-nums',
      'letter-spacing:0',
      'image-rendering:pixelated',
    ].join(';')
    boxEl = document.createElement('div')
    boxEl.style.cssText = [
      'padding:2px',
      'border-radius:0',
      'clip-path:polygon(' + CHAMFER + 'px 0,calc(100% - ' + CHAMFER + 'px) 0,100% ' + CHAMFER + 'px,100% calc(100% - ' + CHAMFER + 'px),calc(100% - ' + CHAMFER + 'px) 100%,' + CHAMFER + 'px 100%,0 calc(100% - ' + CHAMFER + 'px),0 ' + CHAMFER + 'px)',
    ].join(';')
    rowEl = document.createElement('div')
    rowEl.style.cssText = [
      'display:flex', 'flex-wrap:wrap', 'align-items:center',
      'column-gap:' + PLATE_GROUP_GAP + 'px', 'row-gap:0px',
      'padding:' + PLATE_PADDING_Y + 'px ' + PLATE_PADDING_X + 'px',
      'clip-path:polygon(3px 0,calc(100% - 3px) 0,100% 3px,100% calc(100% - 3px),calc(100% - 3px) 100%,3px 100%,0 calc(100% - 3px),0 3px)',
    ].join(';')
    boxEl.appendChild(rowEl)
    el.appendChild(boxEl)
    ;(container || document.body).appendChild(el)
    applyPalette()
    render(null)
  }

  function applyPalette() {
    if (!el) return
    el.setAttribute('data-cl-pet-plate-scheme', theme)
    el.style.filter = 'drop-shadow(4px 4px 0 ' + palette.drop + ')'
    el.style.color = palette.text
    if (boxEl) boxEl.style.background = palette.border
    if (rowEl) rowEl.style.background = palette.surface
  }

  function syncTheme() {
    var next = detectScheme()
    if (next === theme) return
    theme = next
    palette = PALETTES[theme]
    applyPalette()
    render(lastSample)
  }

  function render(sample) {
    if (!el) return
    var segments = buildSegments(sample)
    var seen = {}
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i]
      seen[seg.key] = true
      var node = segNodes[seg.key]
      if (!node) {
        node = createSeg()
        segNodes[seg.key] = node
        rowEl.appendChild(node.wrap)
      }
      if (rowEl.childNodes[i] !== node.wrap) rowEl.insertBefore(node.wrap, rowEl.childNodes[i] || null)
      node.dot.style.background = palette[seg.level] || palette.idle
      node.text.style.color = palette[seg.tone] || palette.text
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

  function position() {
    if (!el || !pet.pos || !size) return
    var s = size()
    var w = el.offsetWidth || 0
    var h = el.offsetHeight || 0
    if (!w || !h) return

    var wantsTop = settings.platePosition === 'top'
    var top = wantsTop ? pet.pos.y - h - GAP : pet.pos.y + s.h + GAP
    if (wantsTop && top < 8) top = pet.pos.y + s.h + GAP
    if (!wantsTop && top + h > window.innerHeight - 8) top = pet.pos.y - h - GAP

    var left = pet.pos.x + s.w / 2 - w / 2
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
  }

  function hide() {
    if (!el) return
    el.style.display = 'none'
    lastPos = null
  }

  function abortInflight() {
    if (inflight) {
      try { inflight.abort() } catch (err) {}
      inflight = null
    }
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = 0 }
  }

  async function poll() {
    if (!shouldPoll() || inflight) return
    var controller = typeof AbortController === 'function' ? new AbortController() : null
    inflight = controller
    var timeout = controller ? setTimeout(function () { try { controller.abort() } catch (err) {} }, FETCH_TIMEOUT_MS) : 0
    try {
      var res = await fetch(HARDWARE_PATH, { cache: 'no-store', signal: controller ? controller.signal : undefined })
      if (!res || !res.ok) throw new Error('HTTP ' + ((res && res.status) || 0))
      var data = await res.json()
      if (!data || data.ok !== true) throw new Error('bad payload')
      lastSample = data
      lastError = null
      render(data)
    } catch (err) {
      lastError = String((err && err.message) || err)
    } finally {
      if (timeout) clearTimeout(timeout)
      if (inflight === controller) inflight = null
    }
  }

  function sync() {
    if (!shouldPoll()) {
      abortInflight()
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

  function watchTheme() {
    if (!mediaQuery) {
      try {
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', syncTheme)
        else if (mediaQuery.addListener) mediaQuery.addListener(syncTheme)
      } catch (err) { mediaQuery = null }
    }
    if (!themeObserver) {
      try {
        themeObserver = new MutationObserver(syncTheme)
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['style', 'class', 'data-theme', 'data-color-scheme', 'data-ds-theme-source'],
        })
      } catch (err) { themeObserver = null }
    }
  }

  function unwatchTheme() {
    try {
      if (mediaQuery) {
        if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', syncTheme)
        else if (mediaQuery.removeListener) mediaQuery.removeListener(syncTheme)
      }
    } catch (err) {}
    mediaQuery = null
    try { if (themeObserver) themeObserver.disconnect() } catch (err) {}
    themeObserver = null
  }

  function start() {
    running = true
    watchTheme()
    syncTheme()
    sync()
  }

  function pause() {
    running = false
    abortInflight()
    stopTimer()
    hide()
  }

  function resume() {
    running = true
    watchTheme()
    syncTheme()
    sync()
  }

  function follow() {
    if (el && el.style.display === 'block') position()
  }

  function applySettings() {
    if (!settings.plate) {
      abortInflight()
      stopTimer()
      hide()
      return
    }
    if (running) sync()
  }

  function dispose() {
    abortInflight()
    stopTimer()
    unwatchTheme()
    running = false
    if (el && el.parentNode) el.parentNode.removeChild(el)
    el = null
    boxEl = null
    rowEl = null
    segNodes = {}
    lastSample = null
    lastPos = null
  }

  function debug() {
    return {
      active: !!(el && el.style.display === 'block'),
      enabled: settings.plate === true,
      position: settings.platePosition || 'bottom',
      theme: theme,
      running: running,
      lastError: lastError,
      sample: lastSample,
    }
  }

  return {
    start: start,
    pause: pause,
    resume: resume,
    follow: follow,
    applySettings: applySettings,
    dispose: dispose,
    debug: debug,
    getSample: function () { return lastSample },
  }
}
