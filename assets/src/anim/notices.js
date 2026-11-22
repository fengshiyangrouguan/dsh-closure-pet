// 通知类：每个 one-shot 事件自带的文本/富文本构建器。
// build(ctx) 只读上下文，可以查询余额/峰谷，也可以按 base 选对话池。

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

// 设置页未配置时的兜底文本池；三个状态池保持分开。
export const DEFAULT_DIALOGUES = {
  idle: ['今天也辛苦了，博士。', '需要我帮你整理采购清单吗？'],
  sadIdle: ['预算的事……再想想办法吧。', '别太担心，博士。'],
  thinkIdle: ['让我想想……', '这个方案还可以再优化一下。'],
  lowBalance: ['博士！预算快见底了\n该批经费啦！'],
  credited: ['经费到账~可露希尔继续为你效力！'],
  peakTime: ['开始按原价收费了哦博士~'],
  valleyTime: ['谷时到了，博士~冲啊！'],
  turnInterrupted: ['欸？怎么突然掐断了？'],
  error: ['啧，这次出错了博士……'],
  toolFail: ['工具调用失败了，博士。'],
  interact: ['今天也辛苦了，博士。'],
}

export class CreditedNotice {
  build(ctx) {
    const cur = current(ctx)
    const text = pick(pool(ctx, 'credited', ['经费到账~可露希尔继续为你效力！']), ctx.lastText)
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
    const text = pick(pool(ctx, 'valleyTime', ['谷时到了，博士~冲啊！']), ctx.lastText)
    return simple(text)
  }
}

export class PeakTimeNotice {
  build(ctx) {
    const text = pick(pool(ctx, 'peakTime', ['开始按原价收费了哦博士~']), ctx.lastText)
    return simple(text)
  }
}

export class LowBalanceNotice {
  build(ctx) {
    const text = pick(pool(ctx, 'lowBalance', ['博士！预算快见底了\n该批经费啦！']), ctx.lastText)
    return simple(text, 'fail')
  }
}

export class InterruptedNotice {
  build(ctx) {
    const text = pick(pool(ctx, 'turnInterrupted', ['欸？怎么突然掐断了？']), ctx.lastText)
    return simple(text, 'turnfail')
  }
}

export class ErrorNotice {
  build(ctx) {
    const text = pick(pool(ctx, 'error', ['啧，这次出错了博士……']), ctx.lastText)
    return simple(text, 'turnfail')
  }
}

export class ToolFailNotice {
  build(ctx) {
    const failName = ctx && ctx.lastFailName ? '：' + ctx.lastFailName : ''
    return simple('工具调用失败' + failName, 'fail')
  }
}

export class InteractNotice {
  build(ctx) {
    const cur = current(ctx)
    const balance = cur.balance && cur.balance.total
    const period = cur.period && cur.period.name
    const body = pick(pool(ctx, 'interact', ['今天也辛苦了，博士。']), ctx.lastText)
    const segments = [
      { text: '可露希尔', tier: 'title' },
      { text: body, tier: 'body' },
    ]
    if (isFinite(Number(balance))) segments.push({ text: '余额 ' + money(balance), tier: 'number' })
    if (period) segments.push({ text: period + '价', tier: 'tag' })
    return { segments, sound: 'click' }
  }
}

export class IdleChatterNotice {
  build(ctx) {
    // 三个基础状态各一份池，不合并。
    const key = ctx && ctx.base === 'sad' ? 'sadIdle' : ctx && ctx.base === 'think' ? 'thinkIdle' : 'idle'
    const text = pick(pool(ctx, key, []), ctx.lastText)
    return text ? { text } : null
  }
}
