// 3.0 runtime：执行状态机 effect，把 play / notice / schedule 接到真实 UI。
// 状态机本身不碰 player、bubble、定时器。

import { createMachine } from './machine.js'

export function createRuntime(deps) {
  let snapshot = null
  let lastText = ''
  const timers = new Set()
  const machine = createMachine({ target: 'idle' })

  const ctx = () => {
    const s = snapshot || {}
    const period = s.period || (s.periodSeq && s.period) || null
    return {
      base: machine.state.base.state,
      work: machine.state.work,
      low: machine.state.low,
      period,
      balance: s.balance || null,
      spend: s.spend || null,
      dialogues: (deps.getDialogues && deps.getDialogues()) || {},
      typography: deps.getTypography ? deps.getTypography() : null,
      lastText,
      lastFailName: s.tools && s.tools.lastFailName,
      query: {
        current: () => ({
          balance: s.balance || null,
          period: period ? { name: period === 'peak' ? '峰时' : '谷时', key: period } : null,
          spend: s.spend || null,
        }),
      },
    }
  }

  function execute(effects) {
    for (const effect of effects) {
      if (effect.type === 'play') {
        const id = effect.id
        deps.player.play(effect.clip, {
          id: effect.id,
          loop: effect.loop,
          fade: effect.fade,
          speed: effect.speed,
          range: effect.range,
          onEnded: () => dispatch({ type: 'CLIP_ENDED', id }),
          onError: () => dispatch({ type: 'CLIP_ENDED', id }),
        })
      } else if (effect.type === 'notice') {
        let spec = null
        try { spec = effect.notice && effect.notice.build ? effect.notice.build(ctx()) : null } catch (err) {
          if (deps.log) deps.log('notice build failed', effect.event, err && err.message)
        }
        if (spec) {
          if (spec.text) lastText = spec.text
          if (spec.sound && deps.playSound) deps.playSound(spec.sound)
          if (spec.dialog && deps.showDialog) deps.showDialog(spec.dialog, 4200)
          else if (deps.showNotice) deps.showNotice(spec, effect.event)
        }
      } else if (effect.type === 'schedule') {
        const timer = setTimeout(() => {
          timers.delete(timer)
          dispatch({ type: effect.event, id: effect.id })
        }, effect.delay)
        timers.add(timer)
      }
    }
  }

  function dispatch(event) {
    const effects = machine.dispatch(event)
    execute(effects)
    return effects
  }

  const idleChatterMs = deps.idleChatterMs || 0
  const chatterChance = deps.idleChatterChance === undefined ? 1 : deps.idleChatterChance
  let chatterTimer = 0
  let chatterRate = chatterChance
  function startChatter(ms, chance) {
    if (chatterTimer) { clearInterval(chatterTimer); chatterTimer = 0 }
    chatterRate = chance === undefined ? chatterRate : chance
    if (ms > 0) {
      chatterTimer = setInterval(() => {
        if (Math.random() <= chatterRate) dispatch({ type: 'IDLE_CHATTER_DUE' })
      }, ms)
    }
  }
  startChatter(idleChatterMs, chatterChance)

  return {
    machine,
    getState: () => machine.state,
    setSnapshot: (s) => { snapshot = s },
    setConditions: (cond) => dispatch({ type: 'CONDITIONS', low: !!cond.low, work: cond.work || 'idle' }),
    fire: (name) => dispatch({ type: 'FIRE', name }),
    click: () => { if (deps.ensureAudio) deps.ensureAudio(); return dispatch({ type: 'CLICK' }) },
    startupDue: (peak) => dispatch({ type: 'STARTUP_DUE', peak: !!peak }),
    idleChatterDue: () => dispatch({ type: 'IDLE_CHATTER_DUE' }),
    setIdleChatterConfig: (minutes, chance) => startChatter(Number(minutes) * 60000, Number(chance)),
    dispatch,
    // 旧 debug/UI 的只读投影
    get layers() {
      return {
        base: machine.state.base.state,
        work: machine.state.work,
        overlay: machine.state.active && machine.state.active.kind === 'overlay' ? machine.state.active.event : null,
        clip: machine.state.active ? machine.state.active.clip : null,
        queue: machine.state.queue.map((q) => q.name),
        target: machine.state.target,
      }
    },
    dispose: () => {
      if (chatterTimer) { clearInterval(chatterTimer); chatterTimer = 0 }
      for (const t of timers) clearTimeout(t)
      timers.clear()
    },
  }
}
