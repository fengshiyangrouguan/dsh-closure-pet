// dsh-closure-pet — 像素气泡（工厂）
//
// 结构：一个 fixed 容器里放「SVG 背景（像素边框 + 硬阴影）+ 文本层」，
// 文本用 Ark Pixel 12px 像素字体；整体 pointer-events:none，不挡下面 UI。
// 依赖注入：getState() 读 /state、pet、size()、settings。

import { PREFIX } from '../core/env.js'

export function createBubble(deps) {
  var getState = deps.getState
  var pet = deps.pet
  var size = deps.size
  var settings = deps.settings

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

  function hideBubble() {
    bubbleShown = false
    if (bubbleEl) {
      try { bubbleEl.getAnimations().forEach(function (a) { a.cancel() }) } catch (err) {}
      bubbleEl.style.opacity = '0'
    }
    if (bubbleTickTimer) { clearInterval(bubbleTickTimer); bubbleTickTimer = 0 }
  }
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
    var s = getState()
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

  function dispose() {
    hideBubble()
    if (bubbleHideTimer) { clearTimeout(bubbleHideTimer); bubbleHideTimer = 0 }
    if (bubbleTickTimer) { clearInterval(bubbleTickTimer); bubbleTickTimer = 0 }
    if (bubbleEl && bubbleEl.parentNode) bubbleEl.parentNode.removeChild(bubbleEl)
    bubbleEl = null
    bubbleTextEl = null
    bubbleTailEl = null
    bubbleSvg = null
  }

  return { show: showBubble, refresh: refreshBubble, hide: hideBubble, dispose: dispose, isShown: function () { return bubbleShown } }
}
