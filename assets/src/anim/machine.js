// 注册式动画状态机（纯逻辑）。
// 只管「现在该播谁」和「播完接谁」；播放器/气泡/定时器由 runtime 执行 effect。

import { CLIPS } from './library.js'
import { BASE_STATES, EVENTS } from './catalog.js'

const FAST = 1.75

function clipOf(name) {
  return CLIPS[name] || null
}

function eventClip(def) {
  if (!def || !def.videos || !def.videos.length) return null
  const item = def.videos[Math.floor(Math.random() * def.videos.length)]
  return typeof item === 'string' ? { clip: item } : item
}

export function createMachine(opts) {
  opts = opts || {}
  const idleMs = (CLIPS.Idle && CLIPS.Idle.duration ? CLIPS.Idle.duration : 1.47) * 1000
  const s = {
    target: opts.target || 'idle',
    base: { state: 'idle', idleReady: false },
    active: null,
    queue: [],
    seq: 0,
    low: !!opts.low,
    work: opts.work || 'idle',
    talkBlocked: false,
    fadeNext: 0,
  }

  function nextId() { return ++s.seq }

  function play(id, clip, loop, fade, speed, range) {
    const c = clipOf(clip)
    return {
      type: 'play',
      id,
      clip,
      loop: !!loop,
      fade: fade || 0,
      speed: speed || 1,
      range: range || null,
      src: c ? c.src : null,
    }
  }

  function beginBaseLoop(name, fx) {
    const b = BASE_STATES[name]
    if (!b) return
    const id = nextId()
    s.base.state = name
    s.base.idleReady = name !== 'idle'
    s.active = { id, kind: 'base', clip: b.loop, loop: true }
    fx.push(play(id, b.loop, true, s.fadeNext))
    s.fadeNext = 0
    if (name === 'idle') {
      fx.push({ type: 'schedule', id, event: 'IDLE_DONE', delay: idleMs })
    }
  }

  function startTransition(from, to, fx) {
    let clip = null
    let toState = to
    if (from === 'idle' && to !== 'idle') {
      clip = BASE_STATES[to] && BASE_STATES[to].enter
      toState = to
    } else if (from !== 'idle' && to === 'idle') {
      clip = BASE_STATES[from] && BASE_STATES[from].exit
      toState = 'idle'
    } else if (from !== 'idle' && to !== 'idle') {
      clip = BASE_STATES[from] && BASE_STATES[from].exit
      toState = 'idle'
    }

    // 目标状态没配 enter/exit：允许跳过。
    if (!clip || !clipOf(clip)) {
      s.base.state = toState
      s.active = null
      if (toState === 'idle') {
        beginBaseLoop('idle', fx)
      } else {
        beginBaseLoop(toState, fx)
      }
      return
    }

    const id = nextId()
    const speed = s.target !== toState ? FAST : 1
    s.active = { id, kind: 'transition', clip, to: toState, speed }
    fx.push(play(id, clip, false, s.fadeNext, speed))
    s.fadeNext = 0
  }

  function enterBaseAfterEvent(fx) {
    s.base.state = 'idle'
    s.base.idleReady = true
    s.active = null
    if (s.queue.length && startNextQueued(fx)) return
    if (s.work === 'outputting' && !s.talkBlocked && startEvent('talk', fx)) return
    if (s.target === 'idle') beginBaseLoop('idle', fx)
    else startTransition('idle', s.target, fx)
  }

  function finishOverlay(fx) {
    const ev = s.active
    s.active = null
    if (ev && ev.event === 'interact') s.fadeNext = EVENTS.interact.fadeOut || 0
    if (ev && ev.persistent && s.work === 'outputting' && !s.talkBlocked) {
      // Talk 再播一遍，新 id；通知不重复。
      const def = EVENTS[ev.event]
      const item = eventClip(def)
      if (item && item.clip && clipOf(item.clip)) {
        const id = nextId()
        s.active = { id, kind: 'overlay', event: ev.event, clip: item.clip, priority: def.priority, persistent: true }
        fx.push(play(id, item.clip, false, 0))
        return      }
    }
    if (s.queue.length && startNextQueued(fx)) {
      s.fadeNext = 0
      return
    }
    enterBaseAfterEvent(fx)
  }

  function startEvent(name, fx) {
    const def = EVENTS[name]
    if (!def) return false
    const id = nextId()
    const item = def.textOnly ? null : eventClip(def)
    s.active = {
      id,
      kind: 'overlay',
      event: name,
      clip: item ? item.clip : null,
      range: item && item.from !== undefined ? item : null,
      priority: def.priority || 0,
      persistent: !!def.persistent,
      textOnly: !!def.textOnly,
    }
    if (def.notice) fx.push({ type: 'notice', id, event: name, notice: def.notice })
    if (def.textOnly) {
      // 理论上由 fire() 处理；这里只发通知，不占用画面。
      s.active = null
      return true
    }
    if (!item || !item.clip || !clipOf(item.clip)) {
      s.active = null
      enterBaseAfterEvent(fx)
      return true
    }
    fx.push(play(id, item.clip, false, def.fadeIn || 0, 1, item.from !== undefined ? item : null))
    return true
  }

  function startNextQueued(fx) {
    if (!s.queue.length) return false
    s.queue.sort(function (a, b) {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.at - b.at
    })
    const next = s.queue.shift()
    const def = EVENTS[next.name]
    if (def && def.textOnly) {
      const id = nextId()
      if (def.notice) fx.push({ type: 'notice', id, event: next.name, notice: def.notice })
      return startNextQueued(fx)
    }
    return startEvent(next.name, fx)
  }

  function fire(name, fx) {
    const def = EVENTS[name]
    if (!def) return false
    const priority = def.priority || 0

    // textOnly 没有动画：不占用 active、不改 base；只在当前没有 overlay 时直接发。
    if (def.textOnly) {
      if (s.active && s.active.kind === 'overlay') {
        if (def.queue) {
          s.queue.push({ name, priority, at: ++s.seq })
          return false
        }
        if (priority > (s.active.priority || 0)) {
          // 更高优先级也等一下当前事件结束；textOnly 不插动画。
          s.queue.push({ name, priority, at: ++s.seq })
          return false
        }
        return false
      }
      const id = nextId()
      if (def.notice) fx.push({ type: 'notice', id, event: name, notice: def.notice })
      return true
    }

    if (!s.active || s.active.kind === 'base') {
      s.active = null
      return startEvent(name, fx)
    }

    // base transition 可以被正常事件打断；0 优先级的闲时事件不打断转场。
    if (s.active.kind === 'transition') {
      if (priority <= 0) return false
      s.active = null
      return startEvent(name, fx)
    }

    // 当前是 overlay
    if (def.queue) {
      s.queue.push({ name, priority, at: ++s.seq })
      return false
    }
    if (priority > (s.active.priority || 0)) {
      s.active = null
      return startEvent(name, fx)
    }
    if (priority === (s.active.priority || 0)) {
      s.queue.push({ name, priority, at: ++s.seq })
      return false
    }
    return false
  }

  function resolve(fx) {
    if (s.active) {
      if (s.active.kind !== 'base') return
      if (s.base.state === s.target) return
      if (s.base.state === 'idle' && !s.base.idleReady) return
      startTransition(s.base.state, s.target, fx)
      return
    }

    if (s.queue.length) {
      if (startNextQueued(fx)) return
    }

    if (s.work === 'outputting' && !s.talkBlocked) {
      if (startEvent('talk', fx)) return
    }

    if (s.base.state !== s.target) {
      if (s.base.state === 'idle' && !s.base.idleReady) {
        beginBaseLoop('idle', fx)
        return
      }
      startTransition(s.base.state, s.target, fx)
      return
    }
    beginBaseLoop(s.base.state, fx)
  }

  function dispatch(event, fx) {
    fx = fx || []
    if (!event || !event.type) return fx
    if (event.type === 'CONDITIONS') {
      const wasLow = s.low
      s.work = event.work || 'idle'
      s.low = !!event.low
      s.target = s.work === 'thinking' ? 'think' : s.low ? 'sad' : 'idle'
      if (s.work !== 'outputting') s.talkBlocked = false
      if (!wasLow && s.low) fire('lowBalance', fx)
      resolve(fx)
      return fx
    }
    if (event.type === 'FIRE') {
      fire(event.name, fx)
      return fx
    }
    if (event.type === 'CLICK') {
      if (s.work === 'outputting') s.talkBlocked = true
      fire('interact', fx)
      return fx
    }
    if (event.type === 'STARTUP_DUE') {
      fire(event.peak ? 'peak_time' : 'valley_time', fx)
      return fx
    }
    if (event.type === 'IDLE_CHATTER_DUE') {
      if (s.active && s.active.kind !== 'base') return fx
      fire('idleChatter', fx)
      return fx
    }
    if (event.type === 'IDLE_DONE') {
      if (s.active && s.active.kind === 'base' && s.active.id === event.id && s.base.state === 'idle') {
        s.base.idleReady = true
        resolve(fx)
      }
      return fx
    }
    if (event.type === 'CLIP_ENDED') {
      if (!s.active || s.active.id !== event.id) return fx
      if (s.active.kind === 'overlay') {
        finishOverlay(fx)
        return fx
      }
      if (s.active.kind === 'transition') {
        s.base.state = s.active.to
        s.base.idleReady = s.base.state !== 'idle'
        s.active = null
        resolve(fx)
      }
      return fx
    }
    return fx
  }

  return { state: s, dispatch, fire: (name) => dispatch({ type: 'FIRE', name }) }
}
