// dsh-closure-pet — 前端桌宠（P3.5：渲染 + 拖拽/吸附 + 设置面板 + 交互动画分段）
//
// 行为约定（沿用鲸鱼挂件）：
//   · 位移² < 9（<3px）= 点击，否则 = 拖拽
//   · 拖拽 1:1 跟手，松手 settle() 滑向吸附位（横/纵轴各按 1/4 区独立判定）
//   · 按下桌宠到松手之间「冻结」页面交互：不选区、不拖图、不悬停高亮、不点穿
//   · 一律 left/top 像素定位；位置存 localStorage['dshcl-pos']
//
// 设置项（存 localStorage['dshcl-settings']，右键桌宠打开面板）：
//   · mirror: 'auto' | 'always' | 'never'  —— 镜像（自动=贴左缘时朝内翻转）
//   · size:   0.6 – 2.0                    —— 桌宠大小
//
// 交互动画：Interact 共 5.93s，按动作节奏在中点切成前后两段，
//   点击时随机播其中一段，播完用 0.35s 交叉淡化（blendspace 等价物）回 Idle。
(function () {
  if (window.__dshClosurePet) return
  window.__dshClosurePet = { phase: 'boot' }

  var PREFIX = '/dsh-closure'
  var MODEL = 'ac_s_closur_spine'
  var CANVAS_W = 300
  // 取景框：不是骨架自带的 authoring viewport（425.32×333.22），
  // 而是「所有动画真实顶点范围的并集」（tools/measure-bounds.mjs 实测）：
  // Happy 抬手时高度到 373.4，比作者视口高出 40，用视口取景会被裁掉。
  var FRAME = { x: -229.1, y: -10.6, w: 443.6, h: 373.4 }
  var FRAMING = 1.04
  var MARGIN = 12
  var POS_KEY = 'dshcl-pos'
  var SETTINGS_KEY = 'dshcl-settings'
  var DRAG_THRESHOLD_SQ = 9
  var SIZE_MIN = 0.6
  var SIZE_MAX = 2.0
  var BLEND_BACK = 0.35
  // Interact 前后段的分界（秒）：2.10s = 30fps 第 63 帧，动作回正的中心点。
  // 一次取点后固定下来，不再放进设置面板（要调就改这里，或用 tools/scrub-server.mjs 重新取点）。
  var INTERACT_SPLIT = 2.10
  // 从 Interact 回到 Idle 的混合时长（秒）：短到看不出叠影，又能消掉硬切的顿感
  var INTERACT_MIX = 0.18
  // 开屏演出：首屏 10s 后强制插播一遍「峰谷 → 余额」（localStorage 可覆盖等待与空档）
  function numOverride(key, fallback) {
    var raw
    try { raw = localStorage.getItem(key) } catch (e) { return fallback }
    if (raw === null || raw === '') return fallback
    var v = Number(raw)
    return isFinite(v) && v >= 0 ? v : fallback
  }
  var STARTUP_DELAY = numOverride('dshcl-startup-delay', 5000)
  var STARTUP_GAP = numOverride('dshcl-startup-gap', 2000)

  var log = function () { try { console.info.apply(console, ['[closure-pet]'].concat([].slice.call(arguments))) } catch (e) {} }
  var warn = function () { try { console.warn.apply(console, ['[closure-pet]'].concat([].slice.call(arguments))) } catch (e) {} }

  // ————————————————————— 设置 —————————————————————
  var settings = { mirror: 'auto', size: 1, bubble: true, opacity: 1, sound: true, volume: 0.7 }
  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY)
      if (!raw) return
      var v = JSON.parse(raw)
      if (!v || typeof v !== 'object') return
      if (v.mirror === 'auto' || v.mirror === 'always' || v.mirror === 'never') settings.mirror = v.mirror
      var s = Number(v.size)
      if (isFinite(s)) settings.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, s))
      if (typeof v.bubble === 'boolean') settings.bubble = v.bubble
      var o = Number(v.opacity)
      if (isFinite(o)) settings.opacity = Math.min(1, Math.max(0.3, o))
      if (typeof v.sound === 'boolean') settings.sound = v.sound
      var vol = Number(v.volume)
      if (isFinite(vol)) settings.volume = Math.min(1, Math.max(0, vol))
    } catch (err) {}
  }

  var saveTimer = 0
  function saveSettings(immediate) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        mirror: settings.mirror, size: settings.size,
        bubble: settings.bubble, opacity: settings.opacity,
        sound: settings.sound, volume: settings.volume,
      }))
    } catch (err) {}
    // 同时写回宿主（$DSH_HOME/.dshcl.json），换浏览器/清缓存也能恢复
    clearTimeout(saveTimer)
    var push = function () {
      try {
        fetch(PREFIX + '/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: settings }),
        }).catch(function () {})
      } catch (err) {}
    }
    if (immediate) push()
    else saveTimer = setTimeout(push, 400)
  }
  loadSettings()

  // ————————————————————— DOM —————————————————————
  var host = document.createElement('div')
  host.id = 'dsh-closure-pet'
  host.style.cssText = [
    'position:fixed', 'left:0', 'top:0',
    'z-index:2147482000', 'pointer-events:none',
    'user-select:none', 'opacity:0', 'will-change:transform',
    'transition:opacity .35s ease',
  ].join(';')

  var canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;width:100%;height:100%;transition:transform .28s ease'
  host.appendChild(canvas)

  var note = document.createElement('div')
  note.style.cssText = 'display:none;font:11px/1.4 ui-sans-serif,system-ui,"Microsoft YaHei",sans-serif;color:#ff8f8f;text-align:center;max-width:280px'
  host.appendChild(note)

  function mount() {
    if (!document.body || document.getElementById('dsh-closure-pet')) return
    document.body.appendChild(host)
  }
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount, { once: true })

  function fail(text) {
    window.__dshClosurePet.phase = 'failed'
    window.__dshClosurePet.error = text
    note.textContent = text
    note.style.display = 'block'
    host.style.opacity = '1'
    warn(text)
  }

  var pet = {
    skeleton: null, state: null, stateData: null, renderer: null, gl: null, camera: null,
    raf: 0, lastTime: 0, current: null, segment: null, frames: 0, afterOverlay: null,
    interactDuration: 0,
    flipped: false,
    pos: null, anchor: null,
  }

  // ————————————————————— 尺寸 / 相机 —————————————————————
  function layout() {
    if (!pet.skeleton) return
    var dpr = Math.min(window.devicePixelRatio || 1, 2)
    var cssW = Math.round(CANVAS_W * settings.size)
    var cssH = Math.round(cssW * (FRAME.h / FRAME.w))
    host.style.width = cssW + 'px'
    host.style.height = cssH + 'px'
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)

    var cw = canvas.width
    var ch = canvas.height
    if (pet.mode === 'canvas') {
      // 2D 降级：世界坐标 (x, y) → 画布像素，Y 轴翻转
      var cscale = Math.max(cw / (FRAME.w * FRAMING), ch / (FRAME.h * FRAMING))
      var fcx = FRAME.x + FRAME.w / 2
      var fcy = FRAME.y + FRAME.h / 2
      pet.canvasScale = cscale
      pet.canvasTx = cw / 2 - fcx * cscale
      pet.canvasTy = ch / 2 + fcy * cscale
      applyPosition()
      return
    }
    // ⚠️ Spine 3.8 的 OrthoCamera.zoom 是**乘**在正交边界上的：
    //     projection = ortho(zoom * -vw/2, zoom * vw/2, zoom * -vh/2, zoom * vh/2)
    //   ⇒ 可见世界宽度 = zoom * 画布宽度。所以要"装下 FRAME 这个世界尺寸"，
    //     zoom 必须是 (目标世界尺寸 / 画布尺寸)，取两轴中较大的那个。
    var zoom = Math.max((FRAME.w * FRAMING) / cw, (FRAME.h * FRAMING) / ch)
    var cam = pet.camera
    cam.setViewport(cw, ch)
    cam.zoom = zoom
    cam.position.x = FRAME.x + FRAME.w / 2
    cam.position.y = FRAME.y + FRAME.h / 2
    pet.gl.viewport(0, 0, cw, ch)
    pet.gl.clearColor(0, 0, 0, 0)
    applyPosition()
  }

  // ————————————————————— 位置 / 吸附 / 翻转 —————————————————————
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

  function hideBubble() {
    bubbleShown = false
    if (bubbleEl) {
      try {
        bubbleEl.getAnimations().forEach(function (a) { a.cancel() })
      } catch (err) {}
      bubbleEl.style.opacity = '0'
    }
    if (bubbleTickTimer) { clearInterval(bubbleTickTimer); bubbleTickTimer = 0 }
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

  // ————————————————————— 命中测试（alpha 采样）—————————————————————
  // 不能用 spine.SkeletonBounds：它只认手工绘制的 BoundingBoxAttachment，
  // 方舟模型一个都没有 ⇒ 永远判定未命中。
  function hitTest(clientX, clientY) {
    if (!pet.skeleton) return false
    if (pet.mode === 'canvas') {
      // 2D 降级：直接读像素 alpha
      var rect2 = canvas.getBoundingClientRect()
      if (!rect2.width || !rect2.height) return false
      var cxp = Math.floor(((clientX - rect2.left) / rect2.width) * canvas.width)
      var cyp = Math.floor(((clientY - rect2.top) / rect2.height) * canvas.height)
      if (cxp < 0 || cyp < 0 || cxp >= canvas.width || cyp >= canvas.height) return false
      if (pet.flipped) cxp = canvas.width - 1 - cxp
      try {
        var data = pet.ctx.getImageData(cxp, cyp, 1, 1).data
        return data[3] > 24
      } catch (err) {
        return true // 读不到像素时退化成"整块可点"
      }
    }
    if (!pet.gl) return false
    var rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return false
    var px = Math.floor(((clientX - rect.left) / rect.width) * canvas.width)
    var py = Math.floor(((clientY - rect.top) / rect.height) * canvas.height)
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return false
    if (pet.flipped) px = canvas.width - 1 - px
    var gl = pet.gl
    var win = 5
    var half = 2
    var x0 = Math.max(0, Math.min(canvas.width - win, px - half))
    var y0 = Math.max(0, Math.min(canvas.height - win, canvas.height - py - half - 1))
    var buf = new Uint8Array(win * win * 4)
    try { gl.readPixels(x0, y0, win, win, gl.RGBA, gl.UNSIGNED_BYTE, buf) } catch (err) { return false }
    for (var i = 3; i < buf.length; i += 4) if (buf[i] > 24) return true
    return false
  }

  // ————————————————————— 播放（分层）—————————————————————
  // overlay（一次性覆盖） > work（思考/输出） > base（Idle / Sad_Idle）
  var layers = { base: 'Idle', work: null, overlay: null }
  var talkLock = false      // Talk 播放中：状态切换被挂起，强制播完
  var pendingOverlay = null // Talk 期间被挂起的覆盖动画（只留最新一个）

  function desiredName() {
    return layers.overlay || layers.work || layers.base
  }

  function playLoop(name, force) {
    if (!pet.state) return
    if (pet.current === name && !force) return
    if (name !== 'Talk') { talkLock = false; pendingOverlay = null }
    pet.afterOverlay = null
    pet.current = name
    pet.segment = null
    pet.pingpong = null
    pet.state.setAnimation(0, name, true)
  }

  // 循环区间：某些动画整段首尾接不上，只取中间一段做循环（由 tools/loop-finder 取点）
  //   from/to 单位秒；null 表示"整套循环"。
  var LOOP_RANGES = {
    // 思考：1.59s 是一次点头的起点，2.10s 是这次点头的收束点。
    // 乒乓只在这 0.51s 内来回，等于把"点一下头"做成无缝循环。
    Special_B: { from: 1.59, to: 2.10 },
  }
  // 循环模式：'wrap'（到 to 回卷到 from）或 'pingpong'（正放完倒放回来）。
  // Special_B 的背景飞行物轨迹首尾对不上（接缝差 4.16%），任何子区间都会有跳变，
  // 所以改成乒乓：位置连续、没有接缝，代价是速度方向每 2.67s 反转一次。
  var LOOP_MODES = {
    Special_B: 'thinkcycle',
  }
  // 思考循环：先正放到 from（点头起点），在 [from,to] 内乒乓一段随机时长，
  // 再顺势播到结尾，然后从 0 重新开始下一轮。
  var THINK_NOD_MIN_MS = 1200
  var THINK_NOD_MAX_MS = 3200
  // 工具调用成功 → 播 Happy 的概率（失败仍然必播 Sad_Begin）
  var HAPPY_CHANCE = 0.25

  function startAnimation(name) {
    if (name !== 'Special_B') pet.think = null
    if (name === 'Talk') return playTalkOnce()
    var mode = LOOP_MODES[name]
    if (mode === 'thinkcycle') return startThinking()
    if (mode === 'pingpong') return playPingPong(name)
    return playLoop(name, true)
  }

  // 思考循环：intro(0→from) → nod(from↔to 随机时长) → outro(→dur) → 回到 intro
  function startThinking() {
    if (!pet.state) return
    playLoop('Special_B', true)
    var entry = pet.state.getCurrent(0)
    if (!entry || !entry.animation) return
    var dur = entry.animation.duration
    var r = LOOP_RANGES.Special_B || { from: 0, to: dur }
    var from = Math.min(Math.max(0, r.from), dur - 0.12)
    var to = Math.min(Math.max(from + 0.05, r.to), dur - 0.002)
    entry.timeScale = 0
    entry.trackTime = 0
    entry.animationLast = 0
    pet.pingpong = null
    pet.think = { stage: 'intro', phase: 0, dir: 1, from: from, to: to, dur: dur, nodUntil: 0 }
    log('think cycle', from.toFixed(2) + '–' + to.toFixed(2), '/ dur', dur.toFixed(2))
  }

  // 乒乓循环：entry.timeScale = 0，由 frame() 手动推进相位，到端点反向。
  // 不用负 timeScale —— 3.8 的 getAnimationTime() 对负值取模会出界。
  // 支持区间：只在 [from, to] 内来回（区间为空时用整段）。
  function playPingPong(name) {
    if (!pet.state) return
    playLoop(name, true)
    var entry = pet.state.getCurrent(0)
    if (!entry || !entry.animation) return
    var dur = Math.max(0.05, entry.animation.duration - 0.002)
    var r = LOOP_RANGES[name]
    var from = r && r.from >= 0 && r.from < dur ? r.from : 0
    var to = r && r.to > from + 0.05 && r.to <= dur ? r.to : dur
    entry.timeScale = 0
    entry.trackTime = from
    entry.animationLast = from
    pet.pingpong = { name: name, from: from, to: to, phase: from, dir: 1 }
    log('pingpong ->', name, from.toFixed(2) + '–' + to.toFixed(2) + 's')
  }

  function syncAnimation(force) {
    if (!pet.state) return
    if (startupHold) return // 开屏空档期：保持当前姿势
    var want = desiredName()
    // Talk 期间**强制播完**：状态变化先挂起，等这一遍说完再切
    if (talkLock && want !== 'Talk') return
    if (!force && pet.current === want) return
    startAnimation(want)
  }

  // Talk 是"表演型"动画：播完一遍再从头播，不在最后一帧硬接第一帧。
  // 并且在播放期间锁住状态切换（talkLock），避免输出中断/工具事件把它掐断。
  function playTalkOnce() {
    if (!pet.state) return null
    pet.current = 'Talk'
    pet.segment = null
    pet.pingpong = null
    pet.afterOverlay = null
    talkLock = true
    var entry = pet.state.setAnimation(0, 'Talk', false)
    if (!entry) { talkLock = false; syncAnimation(true); return null }
    entry.listener = {
      complete: function (trackEntry) {
        if (trackEntry && trackEntry.animation && trackEntry.animation.name !== 'Talk') return
        talkLock = false
        if (layers.work === 'Talk') { playTalkOnce(); return } // 还在输出 → 再完整播一遍
        // 播完后再兑现期间被挂起的覆盖动画（如工具成功/失败）
        if (pendingOverlay) {
          var next = pendingOverlay
          pendingOverlay = null
          playOverlay(next)
          return
        }
        syncAnimation(true)
      },
    }
    return entry
  }

  // Interact 前后两段：切点由常量 INTERACT_SPLIT 决定（2.10s = 第 63 帧，动作回正处）
  function segmentRange(index) {
    var d = pet.interactDuration || 5.93
    var cut = Math.min(Math.max(0.4, INTERACT_SPLIT), d - 0.4)
    if (index === 0) return { from: 0, to: cut }
    return { from: cut, to: d }
  }

  function playSegment() {
    if (!pet.state) return null
    audioEnsure() // 用户手势里顺手解锁音频
    startupHold = false // 用户点击优先，解除开屏空档保持
    // 开屏演出是强制播放的，这里不取消
    // 用户点击是显式意图：允许打断 Talk
    talkLock = false
    pendingOverlay = null
    playSound('click')
    var index = Math.random() < 0.5 ? 0 : 1
    var range = segmentRange(index)
    pet.current = 'Interact'
    pet.afterOverlay = null
    pet.pingpong = null
    layers.overlay = 'Interact'
    var entry = pet.state.setAnimation(0, 'Interact', false)
    if (!entry) { layers.overlay = null; syncAnimation(true); return null }
    entry.trackTime = range.from
    entry.animationLast = range.from
    pet.segment = { entry: entry, to: range.to, index: index }
    log('segment', index === 0 ? 'A' : 'B', range.from.toFixed(2) + '-' + range.to.toFixed(2) + 's')
    return entry
  }

  // 一次性覆盖动画（Happy / Sad_Begin / Special_A …）
  function playOverlay(name, after) {
    if (!pet.state) return null
    startupHold = false
    // Talk 播放中：不打断，先把覆盖动画挂起（只留最新）
    if (talkLock) { pendingOverlay = name; log('overlay queued ->', name); return null }
    layers.overlay = name
    pet.current = name
    pet.pingpong = null
    pet.afterOverlay = typeof after === 'function' ? after : null
    var entry = pet.state.setAnimation(0, name, false)
    if (!entry) {
      layers.overlay = null
      pet.afterOverlay = null
      syncAnimation(true)
      return null
    }
    entry.listener = {
      complete: function (trackEntry) {
        if (trackEntry && trackEntry.animation && trackEntry.animation.name !== name) return
        if (layers.overlay !== name) return
        layers.overlay = null
        var next = pet.afterOverlay
        pet.afterOverlay = null
        if (next) { next(); return }
        syncAnimation(true)
      },
    }
    log('overlay ->', name)
    return entry
  }

  function endSegment() {
    pet.segment = null
    if (layers.overlay === 'Interact') layers.overlay = null
    syncAnimation(true)
  }

  // 性能：空闲（只有基础层循环）时降到 30fps，有交互/工作动画时保持 60fps。
  var FPS_IDLE = 30
  var FPS_ACTIVE = 60
  var frameAcc = 0

  function isIdleNow() {
    return !layers.overlay && !layers.work && !pet.segment && !pet.pingpong && !drag && !talkLock
  }

  function frame(now) {
    pet.raf = requestAnimationFrame(frame)
    if (!pet.lastTime) pet.lastTime = now
    var dt = Math.min((now - pet.lastTime) / 1000, 1 / 30)
    pet.lastTime = now

    // 空闲降帧：累积到 1/30 才真正 update+draw 一次（动画速度不变）
    frameAcc += dt
    var step = 1 / (isIdleNow() ? FPS_IDLE : FPS_ACTIVE)
    if (frameAcc < step - 0.002) return
    dt = frameAcc
    frameAcc = 0

    pet.state.update(dt)
    // 思考循环：手动推相位（entry.timeScale 已置 0，update 不会自己走）
    if (pet.think && pet.current === 'Special_B') {
      var th = pet.think
      if (th.stage === 'intro') {
        th.phase += dt
        if (th.phase >= th.from) {
          th.phase = th.from
          th.stage = 'nod'
          th.dir = 1
          th.nodUntil = Date.now() + THINK_NOD_MIN_MS + Math.random() * (THINK_NOD_MAX_MS - THINK_NOD_MIN_MS)
        }
      } else if (th.stage === 'nod') {
        th.phase += dt * th.dir
        if (th.phase >= th.to) { th.phase = th.to; th.dir = -1 }
        else if (th.phase <= th.from) { th.phase = th.from; th.dir = 1 }
        if (Date.now() >= th.nodUntil) th.stage = 'outro'
      } else {
        th.phase += dt
        if (th.phase >= th.dur) { th.stage = 'intro'; th.phase = 0; th.dir = 1 }
      }
      var thEntry = pet.state.getCurrent(0)
      if (thEntry) thEntry.trackTime = Math.min(th.phase, th.dur - 0.002)
    }

    // 乒乓：手动推相位（entry.timeScale 已置 0，update 不会自己走）
    if (pet.pingpong && pet.current === pet.pingpong.name) {
      var pp = pet.pingpong
      pp.phase += dt * pp.dir
      if (pp.phase >= pp.to) { pp.phase = pp.to; pp.dir = -1 }
      else if (pp.phase <= pp.from) { pp.phase = pp.from; pp.dir = 1 }
      var ppEntry = pet.state.getCurrent(0)
      if (ppEntry) ppEntry.trackTime = pp.phase
    }
    pet.state.apply(pet.skeleton)
    pet.skeleton.updateWorldTransform()

    if (pet.segment && pet.segment.entry.trackTime >= pet.segment.to) endSegment()

    // 循环区间（wrap 模式）：到 to 就回卷到 from（保持相位，不重新 setAnimation）
    // 乒乓模式下由上面的相位逻辑接管，这里必须跳过，否则会在端点被强行拉回起点。
    var loopMode = LOOP_MODES[pet.current]
    var range = LOOP_RANGES[pet.current]
    if ((!loopMode || loopMode === 'wrap') && range && range.to > range.from + 0.05) {
      var cur = pet.state.getCurrent(0)
      if (cur && cur.trackTime >= range.to) {
        var span = range.to - range.from
        cur.trackTime = range.from + ((cur.trackTime - range.to) % span)
      }
    }

    if (pet.mode === 'canvas') {
      // 2D 降级渲染
      var ctx2 = pet.ctx
      ctx2.setTransform(1, 0, 0, 1, 0, 0)
      ctx2.clearRect(0, 0, canvas.width, canvas.height)
      ctx2.setTransform(pet.canvasScale, 0, 0, -pet.canvasScale, pet.canvasTx, pet.canvasTy)
      ctx2.imageSmoothingEnabled = true
      try { pet.renderer.draw(pet.skeleton) } catch (err) { /* 单帧绘制失败不影响循环 */ }
      pet.frames++
      return
    }

    var gl = pet.gl
    gl.clear(gl.COLOR_BUFFER_BIT)
    pet.renderer.begin()
    pet.renderer.drawSkeleton(pet.skeleton, false)
    pet.renderer.end()
    pet.frames++
  }

  function start() {
    pet.raf = requestAnimationFrame(frame)
    host.style.opacity = '1'
    window.__dshClosurePet.phase = 'running'
  }

  function stop() {
    if (pet.raf) cancelAnimationFrame(pet.raf)
    pet.raf = 0
    pet.lastTime = 0
  }

  // ————————————————————— 设置面板 —————————————————————
  var panel = null
  function panelIsOpen() { return !!(panel && panel.style.display === 'block') }

  function buildPanel() {
    panel = document.createElement('div')
    panel.id = 'dsh-closure-pet-settings'
    panel.style.cssText = [
      'position:fixed', 'z-index:2147482001', 'display:none',
      'pointer-events:auto', 'min-width:196px', 'padding:10px 12px',
      'border-radius:10px', 'font:12px/1.6 ui-sans-serif,system-ui,"Microsoft YaHei",sans-serif',
      'background:rgba(26,28,36,.97)', 'color:#e7eaf3',
      'border:1px solid rgba(255,255,255,.14)',
      'box-shadow:0 10px 30px rgba(0,0,0,.45)',
    ].join(';')

    function row(label) {
      var el = document.createElement('div')
      el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin:4px 0'
      var name = document.createElement('span')
      name.textContent = label
      name.style.cssText = 'color:#aab2c8'
      el.appendChild(name)
      panel.appendChild(el)
      return el
    }

    // 镜像
    var mirrorRow = row('镜像')
    var segBox = document.createElement('span')
    segBox.style.cssText = 'display:inline-flex;border:1px solid rgba(255,255,255,.18);border-radius:7px;overflow:hidden'
    var mirrorButtons = {}
    ;[['auto', '自动'], ['always', '始终'], ['never', '不镜像']].forEach(function (pair) {
      var btn = document.createElement('button')
      btn.textContent = pair[1]
      btn.dataset.value = pair[0]
      btn.style.cssText = 'padding:3px 9px;border:0;background:transparent;color:#cfd6e6;font:inherit;cursor:pointer'
      btn.addEventListener('click', function () {
        settings.mirror = pair[0]
        saveSettings()
        resolveFlip()
        syncMirrorButtons()
      })
      mirrorButtons[pair[0]] = btn
      segBox.appendChild(btn)
    })
    mirrorRow.appendChild(segBox)
    function syncMirrorButtons() {
      Object.keys(mirrorButtons).forEach(function (k) {
        var on = settings.mirror === k
        mirrorButtons[k].style.background = on ? 'rgba(125,134,255,.85)' : 'transparent'
        mirrorButtons[k].style.color = on ? '#fff' : '#cfd6e6'
      })
    }

    // 大小
    var sizeRow = row('大小')
    var sizeWrap = document.createElement('span')
    sizeWrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px'
    var slider = document.createElement('input')
    slider.type = 'range'
    slider.min = String(SIZE_MIN)
    slider.max = String(SIZE_MAX)
    slider.step = '0.05'
    slider.value = String(settings.size)
    slider.style.cssText = 'width:96px;accent-color:#7d86ff;cursor:pointer'
    var sizeText = document.createElement('span')
    sizeText.style.cssText = 'width:34px;text-align:right;color:#cfd6e6'
    sizeText.textContent = Math.round(settings.size * 100) + '%'
    var saveTimer = 0
    slider.addEventListener('input', function () {
      settings.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(slider.value) || 1))
      sizeText.textContent = Math.round(settings.size * 100) + '%'
      layout()
      repositionForAnchor()
      clearTimeout(saveTimer)
      saveTimer = setTimeout(saveSettings, 250)
    })
    sizeWrap.appendChild(slider)
    sizeWrap.appendChild(sizeText)
    sizeRow.appendChild(sizeWrap)

    // 气泡开关
    var bubbleRow = row('气泡')
    var bubbleBtn = document.createElement('button')
    bubbleBtn.style.cssText = 'padding:3px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.18);' +
      'background:rgba(255,255,255,.06);color:#dfe4f0;font:inherit;cursor:pointer'
    function syncBubbleBtn() {
      bubbleBtn.textContent = settings.bubble ? '开' : '关'
      bubbleBtn.style.background = settings.bubble ? 'rgba(125,134,255,.85)' : 'rgba(255,255,255,.06)'
      bubbleBtn.style.color = settings.bubble ? '#fff' : '#dfe4f0'
    }
    bubbleBtn.addEventListener('click', function () {
      settings.bubble = !settings.bubble
      syncBubbleBtn()
      saveSettings(true)
      if (!settings.bubble) hideBubble()
    })
    syncBubbleBtn()
    bubbleRow.appendChild(bubbleBtn)

    // 透明度
    var opaRow = row('透明度')
    var opaWrap = document.createElement('span')
    opaWrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px'
    var opaSlider = document.createElement('input')
    opaSlider.type = 'range'
    opaSlider.min = '0.3'
    opaSlider.max = '1'
    opaSlider.step = '0.05'
    opaSlider.value = String(settings.opacity)
    opaSlider.style.cssText = 'width:96px;accent-color:#7d86ff;cursor:pointer'
    var opaText = document.createElement('span')
    opaText.style.cssText = 'width:38px;text-align:right;color:#cfd6e6'
    opaText.textContent = Math.round(settings.opacity * 100) + '%'
    opaSlider.addEventListener('input', function () {
      settings.opacity = Math.min(1, Math.max(0.3, Number(opaSlider.value) || 1))
      opaText.textContent = Math.round(settings.opacity * 100) + '%'
      applyOpacity()
      saveSettings(false)
    })
    opaWrap.appendChild(opaSlider)
    opaWrap.appendChild(opaText)
    opaRow.appendChild(opaWrap)

    // 音效：开关 + 音量
    var soundRow = row('音效')
    var soundWrap = document.createElement('span')
    soundWrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px'
    var soundBtn = document.createElement('button')
    soundBtn.style.cssText = 'padding:3px 9px;border-radius:7px;border:1px solid rgba(255,255,255,.18);' +
      'background:rgba(255,255,255,.06);color:#dfe4f0;font:inherit;cursor:pointer'
    function syncSoundBtn() {
      soundBtn.textContent = settings.sound ? '开' : '关'
      soundBtn.style.background = settings.sound ? 'rgba(125,134,255,.85)' : 'rgba(255,255,255,.06)'
      soundBtn.style.color = settings.sound ? '#fff' : '#dfe4f0'
    }
    soundBtn.addEventListener('click', function () {
      settings.sound = !settings.sound
      syncSoundBtn()
      saveSettings(true)
      if (settings.sound) { audioEnsure(); loadSounds(); playSound('click') }
    })
    syncSoundBtn()
    var volSlider = document.createElement('input')
    volSlider.type = 'range'
    volSlider.min = '0'
    volSlider.max = '1'
    volSlider.step = '0.05'
    volSlider.value = String(settings.volume)
    volSlider.style.cssText = 'width:74px;accent-color:#7d86ff;cursor:pointer'
    var volText = document.createElement('span')
    volText.style.cssText = 'width:34px;text-align:right;color:#cfd6e6'
    volText.textContent = Math.round(settings.volume * 100) + '%'
    volSlider.addEventListener('input', function () {
      settings.volume = Math.min(1, Math.max(0, Number(volSlider.value) || 0))
      volText.textContent = Math.round(settings.volume * 100) + '%'
      saveSettings(false)
    })
    volSlider.addEventListener('change', function () { if (settings.sound) { audioEnsure(); playSound('click') } })
    soundWrap.appendChild(soundBtn)
    soundWrap.appendChild(volSlider)
    soundWrap.appendChild(volText)
    soundRow.appendChild(soundWrap)

    // 操作
    var actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:8px;margin-top:9px'
    function action(label, fn) {
      var b = document.createElement('button')
      b.textContent = label
      b.style.cssText = 'flex:1;padding:5px 8px;border-radius:7px;border:1px solid rgba(255,255,255,.18);' +
        'background:rgba(255,255,255,.06);color:#dfe4f0;font:inherit;cursor:pointer'
      b.addEventListener('click', fn)
      actions.appendChild(b)
    }
    action('重置位置', function () { resetPosition() })
    action('完成', function () { closePanel() })
    panel.appendChild(actions)

    document.body.appendChild(panel)
    syncMirrorButtons()
    return { syncMirrorButtons: syncMirrorButtons, slider: slider, sizeText: sizeText }
  }

  var panelApi = null
  function openPanel() {
    if (!panel) panelApi = buildPanel()
    if (panelApi) {
      panelApi.slider.value = String(settings.size)
      panelApi.sizeText.textContent = Math.round(settings.size * 100) + '%'
      panelApi.syncMirrorButtons()
    }
    panel.style.display = 'block'
    // 放在桌宠上方；下方放不下就放下方
    var s = size()
    var pw = panel.offsetWidth
    var ph = panel.offsetHeight
    var left = Math.min(Math.max(8, pet.pos.x + s.w / 2 - pw / 2), window.innerWidth - pw - 8)
    var top = pet.pos.y - ph - 8
    if (top < 8) top = Math.min(window.innerHeight - ph - 8, pet.pos.y + s.h + 8)
    panel.style.left = Math.round(left) + 'px'
    panel.style.top = Math.round(top) + 'px'
  }

  function closePanel() {
    if (panel) panel.style.display = 'none'
  }

  // ————————————————————— 交互：点击 / 拖拽 / 右键 —————————————————————
  // 拖动时要把页面其它交互「冻住」：文字被框选、图片/链接被原生拖走、悬停高亮乱闪，
  // 甚至指针滑到 iframe 上就被里面的文档抢走。五道闸，从源头到兜底：
  //   1. 命中桌宠的 pointerdown 直接 preventDefault + 阻断传播 —— 选区、焦点、
  //      原生拖拽都是这次按下的默认动作；页面的 pointerdown 监听也不再收到它；
  //   2. 按下到松手之间，在捕获阶段拦掉 mousedown / selectstart / dragstart
  //      （pointerdown 的 preventDefault 并不保证压掉兼容的 mousedown，必须再兜一层）；
  //   3. <html class="dshcl-dragging"> 期间 user-select:none、光标 grabbing；
  //   4. 铺一层透明挡板吃掉指针命中：页面收不到 hover，iframe / webview 也抢不走指针；
  //   5. 松手后吞掉浏览器顺手合成的那一次 click，避免"拖到按钮上松手就点出去了"。
  var drag = null
  var dragShield = null
  var dragStyle = null
  // 一次性开关：只吞「桌宠松手后紧跟的那个 click」，任何新的 pointerdown 都会撤销它
  var swallowClick = false
  var SHIELD_ID = 'dsh-closure-pet-drag-shield'
  var BLOCK_EVENTS = ['mousedown', 'selectstart', 'dragstart']
  var TOUCH_OPTS = { capture: true, passive: false }

  function blockDragEvent(e) {
    e.preventDefault()
    e.stopPropagation()
  }

  function ensureDragStyle() {
    if (dragStyle || !document.head) return
    dragStyle = document.createElement('style')
    dragStyle.id = 'dsh-closure-pet-drag-style'
    dragStyle.textContent = [
      'html.dshcl-dragging,html.dshcl-dragging body{',
      '-webkit-user-select:none !important;user-select:none !important;',
      'cursor:grabbing !important}',
      'html.dshcl-dragging *{cursor:grabbing !important}',
      // body 上的 -webkit-user-drag 不继承，图片和链接要单独点名
      'html.dshcl-dragging img,html.dshcl-dragging a{-webkit-user-drag:none !important}',
      // 触摸屏：手势开始后再改 touch-action 对本次手势无效，这里只对后续手势兜底
      'html.dshcl-dragging{touch-action:none !important;overscroll-behavior:contain}',
    ].join('')
    document.head.appendChild(dragStyle)
  }

  function beginDragLock(e) {
    ensureDragStyle()
    document.documentElement.classList.add('dshcl-dragging')
    if (!dragShield) {
      dragShield = document.createElement('div')
      dragShield.id = SHIELD_ID
      dragShield.setAttribute('aria-hidden', 'true')
      dragShield.style.cssText = [
        'position:fixed', 'left:0', 'top:0', 'width:100%', 'height:100%',
        'z-index:2147483000', 'pointer-events:auto', 'cursor:grabbing',
        'background:transparent', 'touch-action:none',
      ].join(';')
      ;(document.body || document.documentElement).appendChild(dragShield)
    }
    for (var i = 0; i < BLOCK_EVENTS.length; i++) {
      window.addEventListener(BLOCK_EVENTS[i], blockDragEvent, true)
    }
    window.addEventListener('touchmove', blockDragEvent, TOUCH_OPTS)
    // 这一下按下是桌宠的：连页面自己的 pointerdown 监听也不该收到（否则它们可能
    // setPointerCapture 把指针抢走，挡板就白铺了）。先 preventDefault 才能取消
    // 光标/选区/原生拖拽的默认动作；stopImmediatePropagation 连 window 上后注册的
    // 监听一起挡掉（比我们更早注册的监听拦不住，那是拿不到的先后顺序）。
    if (e) {
      try { e.preventDefault() } catch (err) {}
      try { e.stopImmediatePropagation() } catch (err) {}
    }
  }

  function endDragLock() {
    document.documentElement.classList.remove('dshcl-dragging')
    for (var i = 0; i < BLOCK_EVENTS.length; i++) {
      window.removeEventListener(BLOCK_EVENTS[i], blockDragEvent, true)
    }
    window.removeEventListener('touchmove', blockDragEvent, TOUCH_OPTS)
    if (dragShield && dragShield.parentNode) dragShield.parentNode.removeChild(dragShield)
    dragShield = null
  }

  function insidePanel(target) {
    return !!(panel && target && panel.contains(target))
  }

  // 放在 window 捕获阶段：比页面自己的 document/元素级监听都早，
  // 命中桌宠时才能把这次按下完整"截胡"（阻断传播后页面收不到它）。
  window.addEventListener('pointerdown', function (e) {
    if (window.__dshClosurePet.phase !== 'running') return
    // 只要出现新的按下，就说明用户有了新意图：撤销上次松手留下的 click 吞口
    swallowClick = false
    if (insidePanel(e.target)) return
    if (e.button !== 0) return
    if (!hitTest(e.clientX, e.clientY)) {
      if (panelIsOpen()) closePanel()
      return
    }
    // 命中桌宠：这一次按下归桌宠，先冻住页面，页面不能拿它去选区 / 拖图 / 点按钮
    beginDragLock(e)
    var closedPanel = panelIsOpen()
    if (closedPanel) closePanel()
    drag = {
      pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      originX: pet.pos.x, originY: pet.pos.y,
      moved: false,
      // 面板刚被这一下关掉：只冻结页面，不进入拖拽（免得"关面板"顺手把桌宠拖走）
      passive: closedPanel,
    }
    if (!closedPanel) host.style.transition = 'none'
  }, true)

  window.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.pointerId) return
    // 拖拽全程吃掉指针的默认动作（选区、文本光标、原生拖拽都从这儿开始）
    if (e.cancelable) { try { e.preventDefault() } catch (err) {} }
    if (drag.passive) return
    var dx = e.clientX - drag.startX
    var dy = e.clientY - drag.startY
    if (!drag.moved && dx * dx + dy * dy >= DRAG_THRESHOLD_SQ) {
      drag.moved = true
    }
    if (!drag.moved) return
    pet.pos = clampPos(drag.originX + dx, drag.originY + dy)
    applyPosition()
  }, true)

  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return
    var wasDrag = drag.moved
    var passive = drag.passive
    drag = null
    endDragLock()
    // 松手后浏览器还会补一次 click；标记一下，让紧跟其后的那一下被吞掉。
    // pointercancel 不会合成 click，别把标记留到下一次真实点击。
    swallowClick = !(e && e.type === 'pointercancel')
    if (passive) return
    host.style.transition = 'opacity .35s ease'
    if (wasDrag) { settle(); refreshBubble() }
    else if (!pet.segment) {
      playSegment()
      showBubble() // 点击顺带把气泡叫出来
      showValleySticker() // 谷价时再弹一下 −50% 贴画
    }
  }

  // 拖拽中窗口失焦 / 切到后台：pointerup 可能永远不来，必须手动收尾，否则挡板会留在页面上
  function cancelDrag() {
    if (!drag) return
    var wasDrag = drag.moved
    drag = null
    endDragLock()
    host.style.transition = 'opacity .35s ease'
    if (wasDrag) { settle(); refreshBubble() }
  }

  window.addEventListener('pointerup', endDrag, true)
  window.addEventListener('pointercancel', endDrag, true)
  window.addEventListener('blur', cancelDrag)

  // 吞掉"按下桌宠 → 松手"之后浏览器合成的那一次 click：
  // 否则桌宠正好压着按钮/链接时，拖完一松手就把下面的东西点出去了。
  // 只吞一次：任何新的 pointerdown 都会撤销标记，不会连累用户的下一次真实点击。
  // 放在 window 捕获阶段，页面自己的 click 监听（含 document 捕获级）都收不到这一下。
  window.addEventListener('click', function (e) {
    if (!swallowClick) return
    swallowClick = false
    if (insidePanel(e.target)) return
    e.preventDefault()
    e.stopImmediatePropagation()
  }, true)

  document.addEventListener('contextmenu', function (e) {
    if (window.__dshClosurePet.phase !== 'running') return
    if (insidePanel(e.target)) return
    if (!hitTest(e.clientX, e.clientY)) return
    e.preventDefault()
    openPanel()
  }, true)

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panelIsOpen()) closePanel()
  }, true)

  // ————————————————————— 视口变化 —————————————————————
  var resizeTimer = 0
  window.addEventListener('resize', function () {
    if (window.__dshClosurePet.phase !== 'running') return
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(function () { layout(); repositionForAnchor() }, 200)
  })

  document.addEventListener('visibilitychange', function () {
    if (window.__dshClosurePet.phase !== 'running') return
    if (document.hidden) {
      cancelDrag() // 切后台时可能收不到 pointerup，先把挡板和拦截器撤掉
      stop()
      setPollInterval(5000) // 后台没必要 1s 拉一次状态
    } else {
      pet.lastTime = 0
      frameAcc = 0
      pet.raf = requestAnimationFrame(frame)
      setPollInterval(1000)
      pollState()
    }
  })

  function resetPosition() {
    pet.pos = defaultPos()
    pet.anchor = { h: 'right', v: 'bottom' }
    host.style.transition = 'left .22s ease, top .22s ease, opacity .35s ease'
    resolveFlip()
    applyPosition()
    savePos()
  }

  // ————————————————————— 音效 —————————————————————
  // 音频取自游戏内 autochess 皮肤的 UI 音效（无人声），转成 56k Opus。
  // 浏览器自动播放策略：AudioContext 初始 suspended，首次点击时 resume。
  var SOUND_FILES = ['click', 'fail', 'coin', 'turnfail']
  var audioCtx = null
  var soundBuffers = {}
  var soundLoaded = false

  function audioEnsure() {
    if (!audioCtx) {
      try {
        var Ctor = window.AudioContext || window.webkitAudioContext
        if (Ctor) audioCtx = new Ctor()
      } catch (err) { audioCtx = null }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      try { audioCtx.resume().catch(function () {}) } catch (err) {}
    }
    return audioCtx
  }

  function loadSounds() {
    if (soundLoaded) return
    soundLoaded = true
    var ctx = audioEnsure()
    if (!ctx) return
    SOUND_FILES.forEach(function (name) {
      soundBuffers[name] = null // 占位：加载中
      fetch(PREFIX + '/assets/audio/' + name + '.ogg', { cache: 'force-cache' })
        .then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))) })
        .then(function (buf) { return ctx.decodeAudioData(buf) })
        .then(function (decoded) { soundBuffers[name] = decoded })
        .catch(function () { delete soundBuffers[name] })
    })
  }

  function playSound(name) {
    if (!settings.sound) return
    if (settings.volume <= 0.01) return
    var ctx = audioEnsure()
    if (!ctx) return
    var buf = soundBuffers[name]
    if (buf === undefined) { loadSounds(); return }
    if (!buf) return // 还在加载
    try {
      var src = ctx.createBufferSource()
      var gain = ctx.createGain()
      src.buffer = buf
      gain.gain.value = Math.min(1, Math.max(0, settings.volume))
      src.connect(gain)
      gain.connect(ctx.destination)
      src.start(0)
    } catch (err) {}
  }

  // ————————————————————— 气泡（像素风）—————————————————————
  // 结构：一个 fixed 容器里放「SVG 背景（像素边框 + 硬阴影）+ 文本层」，
  // 文本用 Ark Pixel 12px 像素字体；整体 pointer-events:none，不挡下面 UI。
  var BUBBLE_FONT = '"ArkPixel12", ui-monospace, monospace'
  // 像素字体是 12px 设计的矢量轮廓：只有按整数倍渲染才严格清晰，
  // 所以用 24px（2×）—— 16px 那种 1.33× 会出现粗细不均。
  var BUBBLE_SIZE = 24
  var BUBBLE_LINE = 28
  var BUBBLE_PAD = 12
  var BUBBLE_HIDE_MS = 5200
  var BUBBLE_CORNER = 6
  var TAIL_W = 14
  var TAIL_H = 10
  var bubbleEl = null
  var bubbleTextEl = null
  var bubbleTailEl = null
  var bubbleSvg = null
  var bubbleW = 0
  var bubbleH = 0
  var bubbleHideTimer = 0
  var bubbleTickTimer = 0
  var bubbleEventText = ''
  var bubbleEventUntil = 0
  var bubbleMode = 'info'   // 'event'（事件反馈，过期即收）| 'info'（点击查看，常驻 5.2s）

  function ensureFont() {
    if (document.getElementById('dsh-closure-pet-font')) return
    var st = document.createElement('style')
    st.id = 'dsh-closure-pet-font'
    st.textContent = '@font-face{font-family:ArkPixel12;src:url("' + PREFIX
      + '/assets/fonts/ark-pixel-12px-zh_hans.woff2") format("woff2");font-display:block}'
    document.head.appendChild(st)
    // 字体是异步加载的：加载完重排一次，避免用回退字体量错宽度
    try {
      document.fonts.load('12px ArkPixel12').then(function () {
        if (bubbleShown) refreshBubble()
      }).catch(function () {})
    } catch (err) {}
  }

  function ensureBubble() {
    if (bubbleEl) return
    bubbleEl = document.createElement('div')
    bubbleEl.id = 'dsh-closure-pet-bubble'
    bubbleEl.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'z-index:2147481999',
      'pointer-events:none', 'opacity:0',
      'transform-origin:center bottom',
      'filter:none',
    ].join(';')

    bubbleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    bubbleSvg.setAttribute('shape-rendering', 'crispEdges')
    bubbleSvg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible'
    bubbleEl.appendChild(bubbleSvg)

    bubbleTextEl = document.createElement('div')
    bubbleTextEl.style.cssText = [
      'position:absolute', 'white-space:pre',
      'font-family:' + BUBBLE_FONT,
      'font-size:' + BUBBLE_SIZE + 'px',
      'line-height:' + BUBBLE_LINE + 'px',
      'color:#20232a', 'letter-spacing:0',
      '-webkit-font-smoothing:none', 'font-smooth:never',
      'text-rendering:geometricPrecision',
    ].join(';')
    bubbleEl.appendChild(bubbleTextEl)

    document.body.appendChild(bubbleEl)
  }

  var BUBBLE_MAX_W = 330 // 单行最大宽度（CSS px），超出按字符折行

  function measureText(text) {
    var cv = measureText._cv || (measureText._cv = document.createElement('canvas'))
    var ctx = cv.getContext('2d')
    ctx.font = BUBBLE_SIZE + 'px ' + BUBBLE_FONT
    return ctx.measureText(text).width
  }

  /** 按像素宽度折行：优先在空格处断（英文），中文按字符断 */
  function wrapText(text, maxWidth) {
    if (measureText(text) <= maxWidth) return [text]
    var out = []
    var cur = ''
    var lastSpace = -1
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i)
      if (cur && measureText(cur + ch) > maxWidth) {
        if (lastSpace > 0 && measureText(cur.slice(0, lastSpace)) > maxWidth * 0.45) {
          out.push(cur.slice(0, lastSpace))
          cur = cur.slice(lastSpace + 1) + ch
        } else {
          out.push(cur)
          cur = ch
        }
        lastSpace = -1
      } else {
        cur += ch
      }
      if (ch === ' ') lastSpace = cur.length - 1
    }
    if (cur) out.push(cur)
    return out
  }

  // 像素气泡外框：四角切 4px 斜角；尾巴默认朝下（气泡在桌宠上方），
  // 桌面边缘放不下时气泡翻到下方，尾巴改为朝上。
  function bubblePath(w, h, tailX, tailUp) {
    var c = BUBBLE_CORNER
    var t = TAIL_H
    var tw = TAIL_W
    if (!tailUp) {
      var bodyH = h - t
      return [
        'M', c, 0, 'H', w - c, 'V', c, 'H', w, 'V', bodyH - c, 'H', w - c, 'V', bodyH,
        'H', tailX + tw, 'V', h, 'H', tailX, 'V', bodyH,
        'H', c, 'V', bodyH - c, 'H', 0, 'V', c, 'Z',
      ].join(' ')
    }
    var top = t
    return [
      'M', c, top, 'H', tailX, 'V', 0, 'H', tailX + tw, 'V', top,
      'H', w - c, 'V', top + c, 'H', w, 'V', h - c, 'H', w - c, 'V', h,
      'H', c, 'V', h - c, 'H', 0, 'V', top + c, 'H', c, 'Z',
    ].join(' ')
  }

  function renderBubble(lines, tailCenterX, tailUp) {
    ensureFont()
    ensureBubble()
    // 折行规则：
    //   1) 文本里**显式写的 `\n` 优先作为硬换行**（调用方自己控制分行）；
    //   2) 每段再按像素宽度软折行，避免单行把气泡拉得过宽。
    // 之前没有第 1 步：`\n` 被当成普通字符参与测量，整句按宽度硬切，
    // 于是"第二段"开头又被切一次，看起来像多空了一行。
    var wrapped = []
    for (var li = 0; li < lines.length; li++) {
      var segments = String(lines[li]).split(/\r?\n/)
      for (var si = 0; si < segments.length; si++) {
        var parts = wrapText(segments[si], BUBBLE_MAX_W)
        for (var pi = 0; pi < parts.length; pi++) wrapped.push(parts[pi])
      }
    }
    lines = wrapped
    var widest = 0
    for (var i = 0; i < lines.length; i++) widest = Math.max(widest, measureText(lines[i]))
    var w = Math.ceil(widest) + BUBBLE_PAD * 2 + 4
    var h = lines.length * BUBBLE_LINE + BUBBLE_PAD * 2 + TAIL_H
    // 对齐到偶数像素，保证像素边缘清晰
    w = Math.ceil(w / 2) * 2
    h = Math.ceil(h / 2) * 2
    bubbleW = w
    bubbleH = h
    // 容器本身没有内容流（子元素全是绝对定位），必须显式给尺寸
    bubbleEl.style.width = (w + 6) + 'px'
    bubbleEl.style.height = (h + 6) + 'px'

    var tailX = Math.round(Math.min(
      Math.max(8, (tailCenterX || w / 2) - TAIL_W / 2),
      w - TAIL_W - 8,
    ))
    bubbleSvg.setAttribute('width', String(w + 6))
    bubbleSvg.setAttribute('height', String(h + 6))
    bubbleSvg.setAttribute('viewBox', `0 0 ${w + 6} ${h + 6}`)
    bubbleSvg.innerHTML =
      '<path d="' + bubblePath(w, h, tailX, tailUp) + '" fill="#000" fill-opacity=".32" transform="translate(3,3)"/>' +
      '<path d="' + bubblePath(w, h, tailX, tailUp) + '" fill="#ffffff" stroke="#20232a" stroke-width="2"/>'

    bubbleTextEl.style.left = (BUBBLE_PAD + 2) + 'px'
    bubbleTextEl.style.top = ((tailUp ? TAIL_H : 0) + BUBBLE_PAD + 1) + 'px'
    bubbleTextEl.textContent = lines.join('\n')
  }

  function fmtMoney(value, currency) {
    if (value === null || value === undefined) return '--'
    var n = Number(value)
    if (!isFinite(n)) return '--'
    return (currency === 'USD' ? '$' : '¥') + n.toFixed(2)
  }

  /** HH:MM:SS（倒计时显示用） */
  function hhmmss(ms) {
    var totalMinutes = Math.max(0, Math.round(ms / 60000))
    var pad = function (n) { return String(n).padStart(2, '0') }
    var h = Math.floor(totalMinutes / 60)
    var m = totalMinutes % 60
    return pad(h) + '时' + pad(m) + '分'
  }
  function bubbleLines() {
    // 事件反馈期间**只显示反馈内容**，不掺余额/花费/峰谷
    if (bubbleEventText && Date.now() < bubbleEventUntil) return [bubbleEventText]
    var lines = []
    var s = lastState
    var b = s && s.balance
    if (b && b.ok) {
      lines.push('余额 ' + fmtMoney(b.total, b.currency) + (b.low ? ' 要花光了哦！' : '') + (b.stale ? ' 未刷新' : ''))
    } else if (b && b.signedOut) {
      lines.push('博士还没有登录CLSR哦')
    } else {
      lines.push('嗯……余额数据还没同步')
    }
    if (s) {
      var sp = s.spend
      if (sp) {
        var parts = ['今天花掉 ' + fmtMoney(sp.today, 'CNY')]
        if (Number(sp.turnAmount) > 0) parts.push('本轮消耗 ' + fmtMoney(sp.turnAmount, 'CNY'))
        lines.push(parts.join(' · '))
      }
      var peak = s.period === 'peak'
      var left = s.periodNextChangeAt ? Math.max(0, s.periodNextChangeAt - Date.now()) : null
      lines.push((peak ? '峰时' : '谷时') + (left !== null ? ' 距' + (peak ? '谷时' : '峰时') + hhmmss(left) : ''))
    }
    return lines
  }

  function placeBubble() {
    if (!bubbleEl || !pet.pos) return { tailCenter: bubbleW / 2, below: false }
    var s = size()
    var centerX = pet.pos.x + s.w / 2
    // 尾巴不放在正中：气泡主体朝屏幕内侧展开，尾巴落在宽度的 32% / 68% 处
    var ratio = centerX < window.innerWidth / 2 ? 0.32 : 0.68
    var left = Math.round(centerX - bubbleW * ratio)
    left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - bubbleW - 8))
    var top = Math.round(pet.pos.y - bubbleH - 2)
    var below = top < 8
    if (below) top = Math.round(pet.pos.y + s.h + 2)
    bubbleEl.style.left = left + 'px'
    bubbleEl.style.top = top + 'px'
    // 弹出动画的轴心：在桌宠上方时用底边，翻到下方时用顶边
    bubbleEl.style.transformOrigin = below ? 'center top' : 'center bottom'
    // 尾巴仍然指向桌宠中心；气泡被夹到边缘时跟着偏移，但保证不贴边
    var tailCenter = Math.min(
      Math.max(TAIL_W / 2 + 8, centerX - left),
      Math.max(TAIL_W / 2 + 8, bubbleW - TAIL_W / 2 - 8),
    )
    return { tailCenter: tailCenter, below: below }
  }

  function refreshBubble() {
    if (!pet.skeleton || !pet.pos) return
    ensureFont()
    ensureBubble()
    var lines = bubbleLines()
    // 1) 先按占位尾巴量出尺寸；2) 用真实尺寸判定上下/左右；3) 用正确尾巴重画再落位
    renderBubble(lines, 0, false)
    var pos = placeBubble()
    renderBubble(lines, pos.tailCenter, pos.below)
    placeBubble()
  }

  // 气泡显隐动画：像从桌宠头顶"冒"出来（底部为轴心），带一点回弹
  var bubbleShown = false
  function popBubbleIn() {
    if (!bubbleEl) return
    bubbleEl.style.opacity = '1'
    try { bubbleEl.getAnimations().forEach(function (a) { a.cancel() }) } catch (err) {}
    try {
      bubbleEl.animate([
        { opacity: 0, transform: 'scale(.62,.7) translateY(10px)' },
        { opacity: 1, transform: 'scale(1.06,1.03) translateY(-2px)', offset: 0.62 },
        { opacity: 1, transform: 'scale(.98,1.01) translateY(1px)', offset: 0.8 },
        { opacity: 1, transform: 'scale(1,1) translateY(0)' },
      ], { duration: 320, easing: 'cubic-bezier(.22,1.5,.36,1)', fill: 'forwards' })
    } catch (err) {}
  }

  function popBubbleOut() {
    if (!bubbleEl) return
    try {
      bubbleEl.getAnimations().forEach(function (a) { a.cancel() })
      bubbleEl.animate([
        { opacity: 1, transform: 'scale(1,1)' },
        { opacity: 0, transform: 'scale(.92,.94) translateY(4px)' },
      ], { duration: 180, easing: 'ease-in', fill: 'forwards' })
    } catch (err) {}
    bubbleEl.style.opacity = '0'
  }

  function showBubble(eventText, eventMs) {
    if (!settings.bubble) return
    ensureFont()
    var wasVisible = bubbleShown
    if (eventText) {
      bubbleEventText = eventText
      bubbleEventUntil = Date.now() + (eventMs || 3600)
      bubbleMode = 'event'
    } else {
      bubbleMode = 'info'
    }
    refreshBubble()
    bubbleShown = true
    // 新内容才重新"弹"一次；只是刷新数字时不打断动画
    if (!wasVisible || eventText) popBubbleIn()
    else bubbleEl.style.opacity = '1'
    clearTimeout(bubbleHideTimer)
    // ⚠️ 事件气泡到"文字过期"就收起，**不能**拖到 5.2s：
    //    否则过期后内容会回落成余额/花费，看起来像"思考中突然弹余额"。
    var hideIn = bubbleMode === 'event'
      ? Math.max(700, bubbleEventUntil - Date.now())
      : BUBBLE_HIDE_MS
    bubbleHideTimer = setTimeout(function () {
      bubbleShown = false
      popBubbleOut()
      if (bubbleTickTimer) { clearInterval(bubbleTickTimer); bubbleTickTimer = 0 }
    }, hideIn)
    if (!bubbleTickTimer) {
      bubbleTickTimer = setInterval(function () {
        if (!bubbleShown) {
          clearInterval(bubbleTickTimer); bubbleTickTimer = 0
          return
        }
        // 事件文字已过期 → 直接收气泡（不显示常规内容）
        if (bubbleMode === 'event' && Date.now() > bubbleEventUntil) {
          bubbleShown = false
          popBubbleOut()
          clearInterval(bubbleTickTimer); bubbleTickTimer = 0
          return
        }
        refreshBubble()
      }, 1000)
    }
  }

  // ————————————————————— 谷价贴画（−50% 扫描线）—————————————————————
  // 只在谷价时段、点击桌宠时弹一下：像素风绿底 + 横向扫描线 + 像素字体。
  // 画布按 6× 绘制（40×24 逻辑像素 → 240×144 设备像素），保证像素边缘锐利。
  var STICKER_BASE_W = 40
  var STICKER_H = 24           // 逻辑像素高
  var STICKER_SCALE = 3        // 逻辑 → CSS（3×），设备像素再 ×DPR
  var stickerEl = null
  var stickerCanvas = null
  var stickerReady = false
  var stickerW = 120           // 动态计算后的 CSS 尺寸
  var stickerH = 72

  function drawSticker() {
    var LOG_H = STICKER_H
    var S = STICKER_SCALE * 2 // 设备像素 / 逻辑像素
    var cv = stickerCanvas
    var ctx = cv.getContext('2d')

    // 先按 12px 量一次文字宽度，再决定逻辑宽度（左右各留 7px）
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.font = '12px ArkPixel12, monospace'
    var tw = 0
    try { tw = ctx.measureText('-99%').width } catch (err) { tw = 30 }
    var LOG_W = Math.max(STICKER_BASE_W, Math.ceil(tw) + 14)

    stickerW = LOG_W * STICKER_SCALE
    stickerH = LOG_H * STICKER_SCALE
    cv.width = LOG_W * S
    cv.height = LOG_H * S
    cv.style.width = stickerW + 'px'
    cv.style.height = stickerH + 'px'
    if (stickerEl) {
      stickerEl.style.width = stickerW + 'px'
      stickerEl.style.height = stickerH + 'px'
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.scale(S, S)
    ctx.imageSmoothingEnabled = false

    // 底：橄榄绿
    ctx.fillStyle = '#3f6a12'
    ctx.fillRect(0, 0, LOG_W, LOG_H)
    // 横向扫描线（每 2 个逻辑像素一条）
    ctx.fillStyle = 'rgba(0,0,0,.22)'
    for (var y = 0; y < LOG_H; y += 2) ctx.fillRect(0, y, LOG_W, 1)
    // 顶部一道高光
    ctx.fillStyle = 'rgba(255,255,255,.10)'
    ctx.fillRect(0, 0, LOG_W, 1)
    // 双层描边
    ctx.strokeStyle = '#2a4506'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, LOG_W - 1, LOG_H - 1)
    ctx.strokeStyle = 'rgba(182,242,74,.28)'
    ctx.strokeRect(1.5, 1.5, LOG_W - 3, LOG_H - 3)

    // 文字 −99%
    ctx.fillStyle = '#b6f24a'
    ctx.font = '12px ArkPixel12, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('-99%', LOG_W / 2, LOG_H / 2 + 0.5)

    // 底部一条亮线（扫描线残留感）
    ctx.fillStyle = 'rgba(182,242,74,.5)'
    ctx.fillRect(6, LOG_H - 4, LOG_W - 12, 1)
  }

  function ensureSticker() {
    if (stickerEl) return
    stickerCanvas = document.createElement('canvas')
    stickerEl = document.createElement('div')
    stickerEl.id = 'dsh-closure-pet-sticker'
    // z-index 与桌宠同级但后插入 → 盖在桌宠身上（"贴"上去）
    stickerEl.style.cssText = [
      'position:fixed', 'z-index:2147482000', 'pointer-events:none',
      'display:none', 'will-change:transform,opacity',
      'image-rendering:pixelated',
    ].join(';')
    stickerCanvas.style.cssText = 'display:block;image-rendering:pixelated'
    stickerEl.appendChild(stickerCanvas)
    document.body.appendChild(stickerEl)
  }

  function showValleySticker() {
    var s = lastState
    if (!s || s.period !== 'valley') return // 只在谷价弹
    if (!settings.bubble) return             // 跟气泡同一个"减少干扰"开关
    ensureSticker()
    if (!stickerReady) {
      try {
        document.fonts.load('12px ArkPixel12').then(function () {
          drawSticker(); stickerReady = true
        }).catch(function () { drawSticker(); stickerReady = true })
      } catch (err) { drawSticker(); stickerReady = true }
      drawSticker()
      stickerReady = true
    }

    var petSize = size()
    var cx = pet.pos.x + petSize.w / 2
    // 贴着角色本体（而不是画布边缘）：右侧时贴左半身，左侧时贴右半身
    var leftOfPet = cx > window.innerWidth / 2
    var left = leftOfPet ? Math.round(cx - stickerW - 8) : Math.round(cx + 8)
    left = Math.min(Math.max(8, left), window.innerWidth - stickerW - 8)
    var top = Math.round(pet.pos.y + petSize.h * 0.18)
    top = Math.min(Math.max(8, top), window.innerHeight - stickerH - 8)
    stickerEl.style.left = left + 'px'
    stickerEl.style.top = top + 'px'
    stickerEl.style.display = 'block'

    try {
      stickerEl.getAnimations().forEach(function (a) { a.cancel() })
      // 从下往上"飘"出来：一条连续的贝塞尔上升曲线，没有中途停顿
      //   · transform 全程单调上浮（26px → -40px），用 ease-out 贝塞尔收尾
      //   · 透明度只在前 18% 淡入，后 45% 开始随上浮一起淡出
      stickerEl.animate([
        { opacity: 0, transform: 'translateY(26px) scale(.94)', easing: 'cubic-bezier(.18,.89,.32,1)' },
        { opacity: 1, transform: 'translateY(6px) scale(1)', offset: 0.18, easing: 'cubic-bezier(.25,.8,.35,1)' },
        { opacity: 1, transform: 'translateY(-14px) scale(1.02)', offset: 0.52, easing: 'cubic-bezier(.4,0,.7,.5)' },
        { opacity: 0, transform: 'translateY(-42px) scale(1.04)', offset: 1 },
      ], { duration: 1000, easing: 'linear', fill: 'forwards' }).onfinish = function () {
        if (stickerEl) stickerEl.style.display = 'none'
      }
    } catch (err) {
      // 老内核没有 WAAPI：退化成直接显示 1s
      stickerEl.style.opacity = '1'
      setTimeout(function () { if (stickerEl) stickerEl.style.display = 'none' }, 1000)
    }
  }

  // ————————————————————— P4：宿主状态轮询 —————————————————————
  // 每秒拉 /dsh-closure/state；用计数器增量识别事件（轮询丢帧也不会漏）。
  var pollTimer = 0
  var pollTimerMs = 0
  var lastState = null
  var toolPlayTimes = []
  var TOOL_MIN_GAP = 1200      // 同类事件最小间隔
  var TOOL_WINDOW = 10000      // 限流窗口
  var TOOL_WINDOW_MAX = 3      // 窗口内最多播几次
  var lowBalance = false

  function toolOverlay(name) {
    if (layers.overlay === 'Interact') return false // 用户点击优先
    // 成功是"概率性庆祝"，失败仍然必报
    if (name === 'Happy' && Math.random() > HAPPY_CHANCE) return false
    var now = Date.now()
    toolPlayTimes = toolPlayTimes.filter(function (t) { return now - t < TOOL_WINDOW })
    var last = toolPlayTimes.length ? toolPlayTimes[toolPlayTimes.length - 1] : 0
    if (now - last < TOOL_MIN_GAP) return false
    if (toolPlayTimes.length >= TOOL_WINDOW_MAX) return false
    toolPlayTimes.push(now)
    playOverlay(name)
    return true
  }

  // ————————————————————— 开屏时序 —————————————————————
  // 常量（STARTUP_DELAY / STARTUP_GAP）定义在文件顶部的可调参数区。
  //
  // 语义：延迟到点后**强制插播**——不管当下是否在思考/输出、是否有覆盖动画，
  // 都先演一遍开屏（峰谷 → 可选余额），演完再回到原本的工作层/基础层。
  var startupTimer = 0
  var startupPending = null
  var startupHold = false // 开屏两段之间的空档：暂停状态驱动的动画切换

  function scheduleStartup(peak, low) {
    startupPending = { peak: !!peak, low: !!low }
    clearTimeout(startupTimer)
    startupTimer = setTimeout(runStartup, STARTUP_DELAY)
  }

  function cancelStartup() {
    if (startupTimer) clearTimeout(startupTimer)
    startupTimer = 0
    startupPending = null
  }

  function runStartup() {
    startupTimer = 0
    var p = startupPending
    startupPending = null
    if (!p || !pet.state) return
    // 强制插播：清掉 Talk 锁与挂起的覆盖动画，立刻把开屏演出来
    talkLock = false
    pendingOverlay = null
    playOverlay(p.peak ? 'Sad_Begin' : 'Special_A', function () {
      if (!p.low) { syncAnimation(true); return }
      // 空档 STARTUP_GAP：保持上一段姿势不动（syncAnimation 会被 startupHold 挡住），
      // 避免轮询把基础层切上来，导致"难过→点头→再难过"的抖动。
      startupHold = true
      setTimeout(function () {
        startupHold = false
        if (layers.overlay) return // 空档里已经有别的覆盖动画了，不打断
        playOverlay('Sad_Begin')
        showBubble('博士！预算快见底了\n该批经费啦！')
        playSound('fail')
      }, STARTUP_GAP)
    })
    showBubble(p.peak ? '开始按原价收费了哦博士~' : '可露希尔大减价时间到~\n冲啊博士！')
  }

  function applyState(s) {
    if (!s || typeof s !== 'object') return
    var prev = lastState
    lastState = s
    var first = !prev

    var mode = s.work && s.work.mode
    layers.work = mode === 'outputting' ? 'Talk' : (mode === 'thinking' ? 'Special_B' : null)

    // 余额状态只在**读到真实数据**时切换；读取失败/未登录时保持原状态，
    // 否则一次失败读数会被误判成"余额恢复"。
    var balanceOk = !!(s.balance && s.balance.ok)
    var low = !!(s.balance && s.balance.low)
    if (first) {
      lowBalance = low
      layers.base = low ? 'Sad_Idle' : 'Idle'
      // 启动时序延迟播放：等客户端首屏稳定后再演（默认 10s，
      // localStorage 的 dshcl-startup-delay 可覆盖，方便调试）
      scheduleStartup(s.period === 'peak', low)
    } else if (balanceOk && low !== lowBalance) {
      lowBalance = low
      layers.base = low ? 'Sad_Idle' : 'Idle'
      // 变低 → 难过一次；恢复 → 充值成功式（Special_A），不是难过
      playOverlay(low ? 'Sad_Begin' : 'Special_A')
      // 若同一轮还带 topUpSeq，交给下面的"充值到账"分支报，避免两句话打架
      var sameTickTopUp = s.topUpSeq > ((prev && prev.topUpSeq) || 0)
      if (low || !sameTickTopUp) showBubble(low ? '博士！预算快见底了\n该批经费啦！' : '经费到账\n可露希尔继续为你效力~')
      playSound(low ? 'fail' : 'coin')
    }

    if (prev) {
      if (s.tools && prev.tools) {
        // 工具成功：只保留概率性的 Happy 动画，不出气泡、不播音效
        if (s.tools.ok > prev.tools.ok) toolOverlay('Happy')
        if (s.tools.fail > prev.tools.fail && toolOverlay('Sad_Begin')) {
          showBubble('工具调用失败' + (s.tools.lastFailName ? '：' + s.tools.lastFailName : ''))
          playSound('fail')
        }
      }
      // 模型/轮次级错误：只报反馈内容（气泡此时不显示余额/花费）
      var prevErrCount = (prev.errors && prev.errors.count) || 0
      var curErrCount = (s.errors && s.errors.count) || 0
      if (curErrCount > prevErrCount) {
        var errMsg = String((s.errors && s.errors.message) || '').slice(0, 40)
        playOverlay('Sad_Begin')
        showBubble('出错了' + (errMsg ? '：' + errMsg : ''), 4600)
        playSound('fail')
      }
      if (s.topUpSeq > prev.topUpSeq) {
        playOverlay('Special_A')
        showBubble('感谢惠顾~\n采购部随时欢迎下次光临！')
        playSound('coin')
      }
      // 本轮结束（turn/end）：完成 / 中断 / 出错各给一句反馈
      var prevTurnEnd = (prev.turnEnd && prev.turnEnd.seq) || 0
      var curTurnEnd = (s.turnEnd && s.turnEnd.seq) || 0
      if (curTurnEnd > prevTurnEnd) {
        var kind = (s.turnEnd && s.turnEnd.kind) || 'completed'
        if (kind === 'completed') {
          // 完成不播动画、不播音效，只把信息对话框叫出来（余额/今日/本轮/峰谷）
          showBubble()
        } else if (kind === 'error') {
          playOverlay('Sad_Begin')
          showBubble('啧，这次出错了博士……')
          playSound('turnfail')
        } else {
          playOverlay('Sad_Begin')
          showBubble('欸？怎么突然掐断了？')
          playSound('turnfail')
        }
      }
      if (s.periodSeq > prev.periodSeq) {
        playOverlay(s.period === 'peak' ? 'Sad_Begin' : 'Special_A') // 谷时用 Special_A（充值式），不用 Happy
        showBubble(s.period === 'peak' ? '开始按原价收费了哦博士~' : '可露希尔大减价时间到~\n冲啊博士！')
      }
    }
    // 气泡开着的时候顺带刷新数字（余额 / 倒计时）
    if (bubbleShown) refreshBubble()
    syncAnimation(false)
  }

  function pollState() {
    fetch(PREFIX + '/state', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (s) { try { applyState(s) } catch (err) {} })
      .catch(function () { /* 路由不可用就纯待机，不报错 */ })
  }

  function startPolling() {
    pollState()
    setPollInterval(1000)
  }

  // 前台 1s 轮询；后台降到 5s（省电，且后台本来就看不到）
  function setPollInterval(ms) {
    if (pollTimer && pollTimerMs === ms) return
    if (pollTimer) clearInterval(pollTimer)
    pollTimerMs = ms
    pollTimer = setInterval(pollState, ms)
  }

  // 宿主侧持久化设置（$DSH_HOME/.dshcl.json）优先于 localStorage
  function loadHostConfig() {
    fetch(PREFIX + '/config', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (cfg) {
        var s = cfg && cfg.settings
        if (!s) return
        if (s.mirror === 'auto' || s.mirror === 'always' || s.mirror === 'never') settings.mirror = s.mirror
        if (isFinite(Number(s.size))) settings.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(s.size)))
        if (typeof s.bubble === 'boolean') settings.bubble = s.bubble
        if (isFinite(Number(s.opacity))) settings.opacity = Math.min(1, Math.max(0.3, Number(s.opacity)))
        if (typeof s.sound === 'boolean') settings.sound = s.sound
        if (isFinite(Number(s.volume))) settings.volume = Math.min(1, Math.max(0, Number(s.volume)))
        layout()
        repositionForAnchor()
        resolveFlip()
        applyOpacity()
        saveSettings(true)
      })
      .catch(function () { /* 宿主不可用就沿用 localStorage */ })
  }

  // ————————————————————— 启动 —————————————————————
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = function () { resolve() }
      s.onerror = function () { reject(new Error('script load failed: ' + src)) }
      document.head.appendChild(s)
    })
  }

  function fetchText(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status)
      return r.text()
    })
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image()
      img.onload = function () { resolve(img) }
      img.onerror = function () { reject(new Error('image load failed: ' + url)) }
      img.src = url
    })
  }

  ;(async function boot() {
    try {
      // 1) 探测 WebGL：不可用（远程桌面 / 老显卡 / 禁用）就走 canvas 2D 降级
      var forceCanvas = /[?&]canvas=1/.test(location.search) ||
        (function () { try { return localStorage.getItem('dshcl-force-canvas') === '1' } catch (e) { return false } })()
      var gl = null
      if (!forceCanvas) {
        try {
          gl = canvas.getContext('webgl', {
            alpha: true, antialias: true, premultipliedAlpha: false,
            preserveDrawingBuffer: true, // hitTest 要 readPixels，必须保留绘制缓冲
          })
        } catch (err) { gl = null }
      }

      var texts = await Promise.all([
        fetchText(PREFIX + '/assets/spine/' + MODEL + '.atlas'),
        fetchText(PREFIX + '/assets/spine/' + MODEL + '.json'),
      ])
      var image = await loadImage(PREFIX + '/assets/spine/' + MODEL + '.png')

      var atlas, data, skeleton
      if (gl) {
        await loadScript(PREFIX + '/assets/vendor/spine-webgl.js')
        if (!window.spine || !window.spine.webgl) throw new Error('spine-webgl 未挂载到 window.spine')
        pet.gl = gl
        pet.mode = 'gl'
        var context = new spine.webgl.ManagedWebGLRenderingContext(gl)
        atlas = new spine.TextureAtlas(texts[0], function () {
          return new spine.webgl.GLTexture(context, image)
        })
        data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(texts[1]))
        skeleton = new spine.Skeleton(data)
      } else {
        log('WebGL 不可用 → 使用 canvas 2D 降级')
        await loadScript(PREFIX + '/assets/vendor/spine-canvas.js')
        if (!window.spine || !window.spine.canvas) throw new Error('spine-canvas 未挂载到 window.spine')
        pet.mode = 'canvas'
        pet.ctx = canvas.getContext('2d')
        atlas = new spine.TextureAtlas(texts[0], function () {
          return new spine.canvas.CanvasTexture(image)
        })
        data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(texts[1]))
        skeleton = new spine.Skeleton(data)
        pet.mode = 'canvas'
      }

      var stateData = new spine.AnimationStateData(data)
      var names = data.animations.map(function (a) { return a.name })
      // Idle / 工作层 / 基础层之间互相切换用 0.18s；Interact 单独处理（进入 0、返回 INTERACT_MIX）
      var motion = ['Idle', 'Special_B', 'Talk', 'Happy', 'Sad_Begin', 'Sad_Idle', 'Special_A']
        .filter(function (n) { return names.indexOf(n) >= 0 })
      for (var i = 0; i < motion.length; i++) {
        for (var j = i + 1; j < motion.length; j++) {
          stateData.setMix(motion[i], motion[j], 0.18)
          stateData.setMix(motion[j], motion[i], 0.18)
        }
      }
      stateData.setMix('Idle', 'Interact', 0)
      stateData.setMix('Interact', 'Idle', INTERACT_MIX)
      motion.forEach(function (n) {
        stateData.setMix('Interact', n, 0.16)
        stateData.setMix(n, 'Interact', 0.16)
      })

      var state = new spine.AnimationState(stateData)
      var interact = data.animations.filter(function (a) { return a.name === 'Interact' })[0]
      pet.interactDuration = interact ? interact.duration : 5.93

      pet.skeleton = skeleton
      pet.state = state
      pet.stateData = stateData
      if (pet.mode === 'gl') {
        pet.renderer = new spine.webgl.SceneRenderer(canvas, context, false)
        pet.camera = pet.renderer.camera
      } else {
        pet.renderer = new spine.canvas.SkeletonRenderer(pet.ctx)
        pet.renderer.triangleRendering = true // 3.8 canvas 渲染器默认只画 RegionAttachment，网格需要三角形模式
      }

      layout()
      placeFromStorage()
      applyOpacity()
      playLoop('Idle', true)
      start()
      startPolling()
      loadHostConfig()
      loadSounds()
      log('启动完成', names.length, 'animations · size', settings.size, '· mirror', settings.mirror)

      window.__dshClosurePet = {
        phase: 'running',
        animations: names,
        play: function (name, loop) {
          layers.overlay = null   // 手动播放视为最高优先级，先清掉覆盖层
          pet.segment = null
          loop ? playLoop(name, true) : playSegment2(name)
        },
        segments: function () { return [segmentRange(0), segmentRange(1)] },
        openPanel: openPanel,
        closePanel: closePanel,
        get settings() { return { mirror: settings.mirror, size: settings.size, bubble: settings.bubble, opacity: settings.opacity, sound: settings.sound, volume: settings.volume } },
        get split() { return INTERACT_SPLIT },
        setSettings: function (patch) {
          if (patch) {
            if (patch.mirror) settings.mirror = patch.mirror
            if (patch.size) settings.size = Number(patch.size)
            if (typeof patch.bubble === 'boolean') settings.bubble = patch.bubble
            if (patch.opacity) settings.opacity = Number(patch.opacity)
            if (typeof patch.sound === 'boolean') settings.sound = patch.sound
            if (patch.volume !== undefined) settings.volume = Number(patch.volume)
          }
          saveSettings(true); layout(); repositionForAnchor(); resolveFlip(); applyOpacity()
          if (!settings.bubble) hideBubble()
        },
        resetPosition: resetPosition,
        hitTest: hitTest,
        applyState: applyState, // 调试用：手动灌一份 /state 数据
        showBubble: showBubble,
        showValleySticker: showValleySticker,
        hideBubble: hideBubble,
        get layers() { return { base: layers.base, work: layers.work, overlay: layers.overlay } },
        get loops() { return LOOP_RANGES },
        get sounds() {
          var out = {}
          Object.keys(soundBuffers).forEach(function (k) { out[k] = !!soundBuffers[k] })
          return { loaded: out, ctx: audioCtx ? audioCtx.state : null, enabled: settings.sound, volume: settings.volume }
        },
        playSound: playSound,
        runStartup: runStartup,
        cancelStartup: cancelStartup,
        get startup() { return { pending: !!startupPending, delay: STARTUP_DELAY, gap: STARTUP_GAP } },
        setLoop: function (name, from, to) {
          if (from === null || from === undefined) delete LOOP_RANGES[name]
          else LOOP_RANGES[name] = { from: Number(from), to: Number(to) }
          return LOOP_RANGES[name] || null
        },
        get trackTime() {
          var cur = pet.state && pet.state.getCurrent(0)
          return cur ? cur.trackTime : null
        },
        // 调试：把某个动画冻结在指定时刻并立刻画一帧（用于检查取景是否裁切）
        poseAt: function (name, time) {
          if (!pet.state) return null
          stop()
          layers.overlay = null
          pet.segment = null
          pet.pingpong = null
          pet.current = name
          pet.state.clearTracks()
          pet.skeleton.setToSetupPose()
          pet.skeleton.setSlotsToSetupPose()
          var e = pet.state.setAnimation(0, name, false)
          if (e) { e.trackTime = time; e.animationLast = time }
          pet.state.update(0)
          pet.state.apply(pet.skeleton)
          pet.skeleton.updateWorldTransform()
          var gl = pet.gl
          gl.clear(gl.COLOR_BUFFER_BIT)
          pet.renderer.begin()
          pet.renderer.drawSkeleton(pet.skeleton, false)
          pet.renderer.end()
          return { name: name, time: time }
        },
        resume: function () { pet.lastTime = 0; if (!pet.raf) pet.raf = requestAnimationFrame(frame) },
        get lastState() { return lastState },
        get animation() {
          var cur = pet.state && pet.state.getCurrent(0)
          return cur && cur.animation ? cur.animation.name : null
        },
        get segmentInfo() { return pet.segment ? { to: pet.segment.to, index: pet.segment.index } : null },
        get position() { return pet.pos && { x: pet.pos.x, y: pet.pos.y, flipped: pet.flipped } },
        get debug() {
          var cam = pet.camera
          var vp = null
          try { vp = Array.from(pet.gl.getParameter(pet.gl.VIEWPORT)) } catch (err) { vp = String(err) }
          return {
            mode: pet.mode,
            dpr: Math.min(window.devicePixelRatio || 1, 2),
            cssW: host.offsetWidth, cssH: host.offsetHeight,
            canvasW: canvas.width, canvasH: canvas.height,
            glViewport: vp,
            frames: pet.frames,
            zoom: cam && cam.zoom, camPos: cam && { x: cam.position.x, y: cam.position.y },
            camViewport: cam && { w: cam.viewportWidth, h: cam.viewportHeight },
            settings: { mirror: settings.mirror, size: settings.size },
          }
        },
      }
    } catch (err) {
      fail('桌宠加载失败：' + String((err && err.message) || err))
    }
  })()

  // 调试用：按名字播一段单次动画（Interact 走分段逻辑）
  function playSegment2(name) {
    if (name === 'Interact') return playSegment()
    return playOverlay(name)
  }
})()
