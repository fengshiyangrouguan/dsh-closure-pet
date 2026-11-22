import test from 'node:test'
import assert from 'node:assert/strict'

// ---- 最小 DOM 桩：只覆盖这两个工厂在“创建/注册”阶段会碰到的 API ----
const listeners = []
globalThis.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  __dshClosurePet: { phase: 'running' },
  addEventListener: (t) => listeners.push('win:' + t),
  removeEventListener: () => {},
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  AudioContext: null,
}
globalThis.document = {
  hidden: false,
  body: { appendChild: () => {}, contains: () => false },
  head: { appendChild: () => {} },
  documentElement: { classList: { add: () => {}, remove: () => {} } },
  createElement: () => ({
    style: {}, dataset: {}, appendChild: () => {}, setAttribute: () => {},
    addEventListener: () => {}, getAnimations: () => [], textContent: '',
  }),
  createElementNS: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
  addEventListener: (t) => listeners.push('doc:' + t),
  getElementById: () => null,
  fonts: { load: () => Promise.resolve() },
}
globalThis.localStorage = { getItem: () => null, setItem: () => {} }
globalThis.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })

const { settings } = await import('../assets/src/core/settings.js')
const { createPanel } = await import('../assets/src/ui/panel.js')
const { createBubble } = await import('../assets/src/ui/bubble.js')
const { createSticker } = await import('../assets/src/ui/sticker.js')
const { createDirector } = await import('../assets/src/anim/director.js')
const { createState } = await import('../assets/src/io/state.js')
const { createDrag } = await import('../assets/src/input/drag.js')

const noop = () => {}
const pet = { pos: { x: 100, y: 100 }, anchor: { h: 'left', v: 'bottom' }, flipped: false }

function fakePlayer() {
  const calls = []
  const player = {
    currentName: null,
    onEnded: null,
    play(name, opts) {
      calls.push({ name, loop: !!(opts && opts.loop), fade: opts && opts.fade })
      player.currentName = name
      player.onEnded = opts && opts.onEnded
      return true
    },
    replay() { calls.push({ name: player.currentName, replay: true }); return true },
    pause: noop, resume: noop, stop: noop, dispose: noop,
    current: () => player.currentName,
    currentTime: () => 0,
    isPaused: () => false,
  }
  player.calls = calls
  return player
}

const baseDeps = {
  settings, saveSettings: noop, resolveFlip: noop, layout: noop, repositionForAnchor: noop,
  applyOpacity: noop, hideBubble: noop, audioEnsure: noop, loadSounds: noop, playSound: noop,
  size: () => ({ w: 450, h: 379 }), pet, resetPosition: noop,
  getState: () => null,
}

test('设置面板工厂：API 与初始状态', () => {
  const panel = createPanel(baseDeps)
  assert.equal(typeof panel.open, 'function')
  assert.equal(typeof panel.close, 'function')
  assert.equal(typeof panel.isOpen, 'function')
  assert.equal(typeof panel.contains, 'function')
  assert.equal(panel.isOpen(), false)
  assert.equal(panel.contains({}), false)
})

test('气泡工厂：API 与初始隐藏', () => {
  const bubble = createBubble(baseDeps)
  assert.equal(typeof bubble.show, 'function')
  assert.equal(typeof bubble.refresh, 'function')
  assert.equal(typeof bubble.hide, 'function')
  assert.equal(typeof bubble.isShown, 'function')
  assert.equal(bubble.isShown(), false)
})

test('贴画工厂：show', () => {
  const sticker = createSticker(baseDeps)
  assert.equal(typeof sticker.show, 'function')
})

test('导演工厂：层、空闲判断、锁清理', () => {
  const director = createDirector({
    pet: { current: null, segment: null, think: null, afterOverlay: null, interactDuration: 5.933 },
    player: fakePlayer(), log: noop, audioEnsure: noop, playSound: noop,
    getStartupHold: () => false, setStartupHold: noop,
  })
  assert.equal(director.layers.base, 'Idle')
  assert.equal(director.layers.work, null)
  assert.equal(director.isIdle(), true)
  director.layers.work = 'Talk'
  assert.equal(director.isIdle(), false)
  director.resetLocks() // 不应抛错
  assert.equal(typeof director.syncAnimation, 'function')
  assert.equal(typeof director.playSegment, 'function')
  assert.equal(typeof director.playOverlay, 'function')
})

test('状态工厂：只把 /state 翻译成 conditions/事件，开屏只调度一次', () => {
  let startupCalls = 0
  const conditions = []
  const fires = []
  const runtime = {
    setSnapshot: noop,
    setConditions: (c) => conditions.push(c),
    fire: (name) => fires.push(name),
  }
  const state = createState({
    runtime, showBubble: noop, refreshBubble: noop,
    scheduleStartup: () => { startupCalls++ }, settings, saveSettings: noop,
    layout: noop, repositionForAnchor: noop, resolveFlip: noop, applyOpacity: noop,
    isBubbleShown: () => false,
  })
  assert.equal(state.getState(), null)
  state.applyState(null)
  state.applyState({
    work: { mode: 'thinking' }, balance: { ok: true, low: true }, period: 'peak', periodSeq: 0,
    tools: { ok: 0, fail: 0 }, errors: { count: 0 }, topUpSeq: 0, turnEnd: { seq: 0 },
  })
  assert.deepEqual(conditions[0], { low: true, work: 'thinking' })
  assert.equal(startupCalls, 1)
  state.applyState({
    work: { mode: 'idle' }, balance: { ok: true, low: true }, period: 'peak', periodSeq: 0,
    tools: { ok: 0, fail: 0 }, errors: { count: 0 }, topUpSeq: 0, turnEnd: { seq: 0 },
  })
  assert.deepEqual(conditions[1], { low: true, work: 'idle' })
  assert.equal(startupCalls, 1)
})

test('状态工厂：错误/周期/到账只触发事实事件，不直接播动画', () => {
  const fires = []
  const runtime = {
    setSnapshot: noop,
    setConditions: noop,
    fire: (name) => fires.push(name),
  }
  const state = createState({
    runtime, showBubble: noop, refreshBubble: noop,
    scheduleStartup: noop, settings, saveSettings: noop,
    layout: noop, repositionForAnchor: noop, resolveFlip: noop, applyOpacity: noop,
    isBubbleShown: () => false,
  })
  const base = {
    balance: { ok: true, low: false }, period: 'valley', periodSeq: 0,
    tools: { ok: 0, fail: 0 }, errors: { count: 0 }, topUpSeq: 0,
    turnEnd: { seq: 0 }, work: { mode: 'idle' },
  }
  state.applyState(base)
  state.applyState({ ...base, errors: { count: 1, message: 'boom' } })
  assert.deepEqual(fires, ['error'])
  state.applyState({ ...base, errors: { count: 1 }, period: 'peak', periodSeq: 1 })
  assert.deepEqual(fires, ['error', 'peak_time'])
})

test('拖拽工厂：注册 8 个全局监听并暴露状态', () => {
  const drag = createDrag({
    hitTest: () => false, pet, host: { style: {} },
    clampPos: (x, y) => ({ x, y }), applyPosition: noop, settle: noop,
    refreshBubble: noop, playSegment: noop, showBubble: noop, showValleySticker: noop,
    openPanel: noop, closePanel: noop, panelIsOpen: () => false, insidePanel: () => false,
  })
  for (const w of ['win:pointerdown', 'win:pointermove', 'win:pointerup', 'win:pointercancel', 'win:blur', 'win:click', 'doc:contextmenu', 'doc:keydown']) {
    assert.ok(listeners.includes(w), 'missing ' + w)
  }
  assert.equal(drag.isDragging(), false)
  drag.cancelDrag() // 没有拖拽时也不应抛错
})
test('导演工厂：audio/playSound 惰性依赖（点击时不再抛 audioEnsure）', () => {
  let ensureCalls = 0
  let playCalls = 0
  let ensureFn
  let playFn
  const player = fakePlayer()
  const director = createDirector({
    pet: { current: null, segment: null, think: null, afterOverlay: null, interactDuration: 5.933 },
    player,
    log: noop,
    // 模拟 main：创建导演时 audio 别名还没赋值，之后才可用
    getAudioEnsure: () => ensureFn,
    getPlaySound: () => playFn,
    getStartupHold: () => false,
    setStartupHold: noop,
  })
  assert.doesNotThrow(() => director.playSegment())
  assert.ok(player.calls.length === 1)
  ensureFn = () => { ensureCalls++ }
  playFn = (name) => { playCalls++; assert.equal(name, 'click') }
  director.playSegment()
  assert.equal(ensureCalls, 1)
  assert.equal(playCalls, 1)
})

test('导演工厂：只有交互动画结束回状态层才淡化', () => {
  const player = fakePlayer()
  const p = { current: null, segment: null, think: null, afterOverlay: null, interactDuration: 5.933 }
  const director = createDirector({
    pet: p, player, log: noop, audioEnsure: noop, playSound: noop,
    getStartupHold: () => false, setStartupHold: noop,
  })
  director.playSegment()
  assert.equal(player.currentName, 'Interact_B')
  assert.equal(player.calls.at(-1).fade, 0)
  player.onEnded(player.currentName)
  assert.equal(player.currentName, 'Idle')
  assert.equal(player.calls.at(-1).fade, 320)
  director.dispose()
})

test('导演工厂：思考掷中时播一遍完整动画后回待机', () => {
  const player = fakePlayer()
  const p = { current: 'Idle', segment: null, think: null, afterOverlay: null, interactDuration: 5.933 }
  const director = createDirector({
    pet: p, player, log: noop, audioEnsure: noop, playSound: noop,
    getStartupHold: () => false, setStartupHold: noop,
  })
  const originalRandom = Math.random
  Math.random = () => 0.1
  try {
    director.layers.work = 'Special_B'
    director.syncAnimation(true)
    assert.equal(player.currentName, 'Special_B')
    const callsWhilePlaying = player.calls.length
    director.syncAnimation(true)
    assert.equal(player.calls.length, callsWhilePlaying, '播放思考动画期间不应重触发')
    player.onEnded('Special_B')
    assert.equal(player.currentName, 'Idle')
    assert.equal(p.think.mode, 'idle')
    // 这一轮结束：即使状态仍在思考，也不应重播
    director.syncAnimation(true)
    assert.equal(player.currentName, 'Idle')
  } finally {
    Math.random = originalRandom
  }
  director.dispose()
})

test('导演工厂：任何状态回 Sad_Idle 前都先播 Sad_Begin', () => {
  const player = fakePlayer()
  const p = { current: 'Happy', segment: null, think: null, afterOverlay: null, interactDuration: 5.933 }
  const director = createDirector({
    pet: p, player, log: noop, audioEnsure: noop, playSound: noop,
    getStartupHold: () => false, setStartupHold: noop,
  })
  director.layers.base = 'Sad_Idle'
  director.syncAnimation(true)
  assert.equal(player.currentName, 'Sad_Begin')
  const calls = player.calls.length
  director.syncAnimation(true) // 入场播放期间不重复
  assert.equal(player.calls.length, calls)
  player.onEnded('Sad_Begin')
  assert.equal(player.currentName, 'Sad_Idle')
  director.dispose()
})

test('导演工厂：低余额交互动画结束先 Sad_Begin 再 Sad_Idle', () => {
  const player = fakePlayer()
  const p = { current: 'Sad_Idle', segment: null, think: null, afterOverlay: null, interactDuration: 5.933 }
  const director = createDirector({
    pet: p, player, log: noop, audioEnsure: noop, playSound: noop,
    getStartupHold: () => false, setStartupHold: noop,
  })
  director.layers.base = 'Sad_Idle'
  director.playSegment()
  assert.equal(player.currentName, 'Interact_B')
  player.onEnded(player.currentName)
  assert.equal(player.currentName, 'Sad_Begin')
  assert.equal(player.calls.at(-1).fade, 320)
  player.onEnded('Sad_Begin')
  assert.equal(player.currentName, 'Sad_Idle')
  director.dispose()
})

test('导演工厂：思考结束回低余额先 Sad_Begin 再 Sad_Idle', () => {
  const player = fakePlayer()
  const p = { current: 'Sad_Idle', segment: null, think: null, afterOverlay: null, interactDuration: 5.933 }
  const director = createDirector({
    pet: p, player, log: noop, audioEnsure: noop, playSound: noop,
    getStartupHold: () => false, setStartupHold: noop,
  })
  const originalRandom = Math.random
  Math.random = () => 0.9 // 首次必定触发，后续才是 50%
  try {
    director.layers.base = 'Sad_Idle'
    director.layers.work = 'Special_B'
    director.syncAnimation(true)
    assert.equal(player.currentName, 'Special_B')
    player.onEnded('Special_B')
    assert.equal(player.currentName, 'Sad_Begin')
    player.onEnded('Sad_Begin')
    assert.equal(player.currentName, 'Sad_Idle')
  } finally {
    Math.random = originalRandom
  }
  director.dispose()
})

test('导演工厂：Talk 播完前不插 Sad_Begin', () => {
  const player = fakePlayer()
  const p = { current: 'Sad_Idle', segment: null, think: null, afterOverlay: null, interactDuration: 5.933 }
  const director = createDirector({
    pet: p, player, log: noop, audioEnsure: noop, playSound: noop,
    getStartupHold: () => false, setStartupHold: noop,
  })
  director.layers.base = 'Sad_Idle'
  director.layers.work = 'Talk'
  director.syncAnimation(true)
  assert.equal(player.currentName, 'Talk')

  // 输出状态先结束，但 Talk 还要完整播完；此时不能提前起 Sad_Begin
  director.layers.work = null
  director.syncAnimation(true)
  assert.equal(player.currentName, 'Talk')

  player.onEnded('Talk')
  assert.equal(player.currentName, 'Sad_Begin')
  player.onEnded('Sad_Begin')
  assert.equal(player.currentName, 'Sad_Idle')
  director.dispose()
})

test('导演工厂：思考首次必定触发完整动画', () => {
  const player = fakePlayer()
  const p = { current: 'Idle', segment: null, think: null, afterOverlay: null, interactDuration: 5.933 }
  const director = createDirector({
    pet: p, player, log: noop, audioEnsure: noop, playSound: noop,
    getStartupHold: () => false, setStartupHold: noop,
  })
  const originalRandom = Math.random
  Math.random = () => 0.9 // 首次不掷骰；后续这个值才会 miss
  try {
    director.layers.work = 'Special_B'
    director.syncAnimation(true)
    assert.equal(player.currentName, 'Special_B')
    player.onEnded('Special_B')
    assert.equal(player.currentName, 'Idle')
    assert.equal(p.think.mode, 'idle')
  } finally {
    Math.random = originalRandom
  }
  director.dispose()
})

test('导演工厂：Talk 播完重播、覆盖排队', () => {
  const player = fakePlayer()
  const p = { current: null, segment: null, think: null, afterOverlay: null, interactDuration: 5.933 }
  const director = createDirector({
    pet: p, player, log: noop, audioEnsure: noop, playSound: noop,
    getStartupHold: () => false, setStartupHold: noop,
  })
  director.layers.work = 'Talk'
  director.syncAnimation(true)
  assert.equal(player.currentName, 'Talk')
  director.playOverlay('Happy')
  assert.equal(player.currentName, 'Talk')
  director.layers.work = null
  player.onEnded('Talk')
  assert.equal(player.currentName, 'Happy')
  director.dispose()
})
