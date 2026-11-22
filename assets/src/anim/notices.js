// 通知类：每个 one-shot 事件自带的文本/富文本构建器。
// build(ctx) 只读上下文，可以查询余额/峰谷，也可以按 base 选对话池。

import DEFAULT_DIALOGUES from '../config/dialogues.json' with { type: 'json' }

function pool(ctx, key, fallback) {
  const list = ctx && ctx.dialogues && ctx.dialogues[key]
  if (Array.isArray(list) && list.length) return list
  return fallback || []
}

function pick(list, avoid) {
  if (!list.length) return ''
  if (list.length === 1) return list[0]
  let out = list[Math.floor(Math.random() * list.length)]
  if (out === avoid) out = list[(list.indexOf(out) + 1) % list.length]
  return out
}

function current(ctx) {
  if (ctx && ctx.query && typeof ctx.query.current === 'function') {
    try { return ctx.query.current() || {} } catch (err) {}
  }
  return {}
}

function money(n) {
  if (!isFinite(Number(n))) return '—'
  return '¥' + Number(n).toFixed(2)
}

function simple(text, sound) {
  return text ? { text: String(text), sound: sound || undefined } : null
}

export class CreditedNotice {
  build(ctx) {
    const cur = current(ctx)
    const text = pick(pool(ctx, 'credited', DEFAULT_DIALOGUES.credited), ctx.lastText)
    return {
      segments: [
        { text: '可露希尔', tier: 'title' },
        { text: text, tier: 'body' },
        { text: '余额 ' + money(cur.balance && cur.balance.total), tier: 'number' },
      ],
      sound: 'coin',
    }
  }
}

export class ValleyTimeNotice {
  build(ctx) {
    const text = pick(pool(ctx, 'valleyTime', DEFAULT_DIALOGUES.valleyTime), ctx.lastText)
    return simple(text)
  }
}

export class PeakTimeNotice {
  build(ctx) {
    const text = pick(pool(ctx, 'peakTime', DEFAULT_DIALOGUES.peakTime), ctx.lastText)
    return simple(text)
  }
}

export class LowBalanceNotice {
  build(ctx) {
    const text = pick(pool(ctx, 'lowBalance', DEFAULT_DIALOGUES.lowBalance), ctx.lastText)
    return simple(text, 'fail')
  }
}

export class InterruptedNotice {
  build(ctx) {
    const text = pick(pool(ctx, 'turnInterrupted', DEFAULT_DIALOGUES.turnInterrupted), ctx.lastText)
    return simple(text, 'turnfail')
  }
}

export class ErrorNotice {
  build(ctx) {
    const text = pick(pool(ctx, 'error', DEFAULT_DIALOGUES.error), ctx.lastText)
    return simple(text, 'turnfail')
  }
}

export class InteractNotice {
  build(ctx) {
    const body = pick(pool(ctx, 'interact', DEFAULT_DIALOGUES.interact), ctx.lastText)
    // 交给气泡的“对话 + 完整信息”混合模式：对话第一行，后面接余额/花费/峰谷。
    return body ? { dialog: body, sound: 'click' } : null
  }
}

export class IdleChatterNotice {
  build(ctx) {
    // 三个基础状态各一份池，不合并。
    const key = ctx && ctx.base === 'sad' ? 'sadIdle' : ctx && ctx.base === 'think' ? 'thinkIdle' : 'idle'
    const text = pick(pool(ctx, key, DEFAULT_DIALOGUES[key] || []), ctx.lastText)
    return text ? { text } : null
  }
}
