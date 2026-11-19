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
    pet: { state: null }, log: noop, audioEnsure: noop, playSound: noop,
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

test('状态工厂：轮询事件映射与开屏只调度一次', () => {
  let startupCalls = 0
  const layers = { base: 'Idle', work: null, overlay: null }
  const state = createState({
    layers, playOverlay: noop, syncAnimation: noop, showBubble: noop, refreshBubble: noop,
    playSound: noop, scheduleStartup: () => { startupCalls++ }, settings, saveSettings: noop,
    layout: noop, repositionForAnchor: noop, resolveFlip: noop, applyOpacity: noop,
    isBubbleShown: () => false,
  })
  assert.equal(state.getState(), null)
  state.applyState(null) // 非法输入不应抛错
  state.applyState({
    work: { mode: 'thinking' }, balance: { ok: true, low: true }, period: 'peak', periodSeq: 0,
    tools: { ok: 0, fail: 0 }, errors: { count: 0 }, topUpSeq: 0, turnEnd: { seq: 0 },
  })
  assert.equal(layers.work, 'Special_B')
  assert.equal(layers.base, 'Sad_Idle')
  assert.equal(startupCalls, 1)
  assert.notEqual(state.getState(), null)
  state.applyState({
    work: { mode: 'idle' }, balance: { ok: true, low: true }, period: 'peak', periodSeq: 0,
    tools: { ok: 0, fail: 0 }, errors: { count: 0 }, topUpSeq: 0, turnEnd: { seq: 0 },
  })
  assert.equal(layers.work, null)
  assert.equal(startupCalls, 1)
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
  const fakeState = {
    setAnimation: () => ({ trackTime: 0, animationLast: 0, animation: { duration: 5 } }),
    getCurrent: () => null,
  }
  const director = createDirector({
    pet: { state: fakeState, interactDuration: 5.93 },
    log: noop,
    // 模拟 main：创建导演时 audio 别名还没赋值，之后才可用
    getAudioEnsure: () => ensureFn,
    getPlaySound: () => playFn,
    getStartupHold: () => false,
    setStartupHold: noop,
  })
  assert.doesNotThrow(() => director.playSegment())
  ensureFn = () => { ensureCalls++ }
  playFn = (name) => { playCalls++; assert.equal(name, 'click') }
  director.playSegment()
  assert.equal(ensureCalls, 1)
  assert.equal(playCalls, 1)
})
