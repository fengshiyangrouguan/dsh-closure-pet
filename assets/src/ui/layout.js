// dsh-closure-pet — 位置 / 吸附 / 翻转
//
// 全是「读 host 尺寸 + 写 host 的 left/top / canvas 的 transform」的薄封装。
// 依赖注入：host、canvas、settings、pet（可变状态对象）。
// 注意：hideBubble 不在这里，它属于气泡模块。

import { MARGIN, POS_KEY } from '../core/env.js'

export function createLayout(deps) {
  var host = deps.host
  var canvas = deps.canvas
  var settings = deps.settings
  var pet = deps.pet

  function size() {
    return { w: host.offsetWidth || 0, h: host.offsetHeight || 0 }
  }

  function clampPos(x, y) {
    var s = size()
    var maxX = Math.max(0, window.innerWidth - s.w)
    var maxY = Math.max(0, window.innerHeight - s.h)
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) }
  }

  function applyPosition() {
    if (!pet.pos) return
    host.style.left = Math.round(pet.pos.x) + 'px'
    host.style.top = Math.round(pet.pos.y) + 'px'
  }

  function setFlipped(next) {
    var value = !!next
    if (pet.flipped === value) return
    pet.flipped = value
    canvas.style.transform = value ? 'scaleX(-1)' : ''
  }

  function applyOpacity() {
    canvas.style.opacity = String(settings.opacity)
  }

  // 镜像设置：auto = 贴左缘朝内翻转；always / never = 固定
  function resolveFlip() {
    if (settings.mirror === 'always') { setFlipped(true); return }
    if (settings.mirror === 'never') { setFlipped(false); return }
    setFlipped(pet.anchor && pet.anchor.h === 'left')
  }

  function defaultPos() {
    var s = size()
    return clampPos(window.innerWidth - s.w - 16, window.innerHeight - s.h - MARGIN)
  }

  function loadPos() {
    try {
      var raw = localStorage.getItem(POS_KEY)
      if (!raw) return null
      var v = JSON.parse(raw)
      if (!v || typeof v.x !== 'number' || typeof v.y !== 'number') return null
      return v
    } catch (err) { return null }
  }

  function savePos() {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({
        x: Math.round(pet.pos.x), y: Math.round(pet.pos.y),
        h: pet.anchor.h, v: pet.anchor.v, flipped: pet.flipped,
      }))
    } catch (err) {}
  }

  function placeFromStorage() {
    var saved = loadPos()
    var s = size()
    if (saved) {
      pet.anchor = { h: saved.h || null, v: saved.v || null }
      var x = saved.x
      var y = saved.y
      if (saved.h === 'right') x = window.innerWidth - s.w - MARGIN
      if (saved.h === 'left') x = MARGIN
      if (saved.v === 'bottom') y = window.innerHeight - s.h - MARGIN
      if (saved.v === 'top') y = MARGIN
      pet.pos = clampPos(x, y)
    } else {
      pet.pos = defaultPos()
      pet.anchor = { h: 'right', v: 'bottom' }
    }
    resolveFlip()
    applyPosition()
  }

  function repositionForAnchor() {
    var s = size()
    var x = pet.pos ? pet.pos.x : window.innerWidth - s.w - MARGIN
    var y = pet.pos ? pet.pos.y : window.innerHeight - s.h - MARGIN
    if (pet.anchor && pet.anchor.h === 'right') x = window.innerWidth - s.w - MARGIN
    if (pet.anchor && pet.anchor.h === 'left') x = MARGIN
    if (pet.anchor && pet.anchor.v === 'bottom') y = window.innerHeight - s.h - MARGIN
    if (pet.anchor && pet.anchor.v === 'top') y = MARGIN
    pet.pos = clampPos(x, y)
    applyPosition()
  }

  function settle() {
    var s = size()
    var cx = pet.pos.x + s.w / 2
    var cy = pet.pos.y + s.h / 2
    var h = null
    var v = null
    if (cx < window.innerWidth / 4) h = 'left'
    else if (cx > window.innerWidth * 3 / 4) h = 'right'
    if (cy < window.innerHeight / 4) v = 'top'
    else if (cy > window.innerHeight * 3 / 4) v = 'bottom'

    var targetX = h === 'left' ? MARGIN : h === 'right' ? window.innerWidth - s.w - MARGIN : pet.pos.x
    var targetY = v === 'top' ? MARGIN : v === 'bottom' ? window.innerHeight - s.h - MARGIN : pet.pos.y
    host.style.transition = 'left .22s cubic-bezier(.34,1.56,.64,1), top .22s cubic-bezier(.34,1.56,.64,1), opacity .35s ease'
    pet.pos = clampPos(targetX, targetY)
    pet.anchor = { h: h, v: v }
    resolveFlip()
    applyPosition()
    savePos()
  }

  return {
    size: size,
    clampPos: clampPos,
    applyPosition: applyPosition,
    setFlipped: setFlipped,
    applyOpacity: applyOpacity,
    resolveFlip: resolveFlip,
    defaultPos: defaultPos,
    loadPos: loadPos,
    savePos: savePos,
    placeFromStorage: placeFromStorage,
    repositionForAnchor: repositionForAnchor,
    settle: settle,
  }
}
