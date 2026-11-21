// 状态机全量回归：用假播放器驱动 director，覆盖 base / work / overlay 的所有衔接。
import test from 'node:test'
import assert from 'node:assert/strict'

const { createDirector } = await import('../assets/src/anim/director.js')

const noop = () => {}

function fakePlayer() {
  const calls = []
  let currentName = null
  let ended = null
  const player = {
    play(name, opts) {
      calls.push({ name, fade: opts && opts.fade, loop: !!(opts && opts.loop) })
      currentName = name
      ended = opts && typeof opts.onEnded === 'function' ? opts.onEnded : null
      return true
    },
    replay() { calls.push({ name: currentName, replay: true }) },
    pause: noop, resume: noop, stop: noop, dispose: noop,
    current: () => currentName,
    currentTime: () => 0,
    isPaused: () => false,
  }
  player.calls = calls
  player.end = (name) => {
    const cb = ended
    ended = null
    if (cb) cb(name === undefined ? currentName : name)
  }
  return player
}

function setup({ base = 'Idle', work = null } = {}) {
  const player = fakePlayer()
  const pet = { current: null, segment: null, think: null, afterOverlay: null, enteringSad: false, interactDuration: 5.933 }
  const director = createDirector({
    pet, player, log: noop,
    getAudioEnsure: () => noop,
    getPlaySound: () => noop,
    getStartupHold: () => false,
    setStartupHold: noop,
  })
  director.layers.base = base
  director.layers.work = work
  return { player, pet, director }
}

function withRandom(value, fn) {
  const original = Math.random
  Math.random = () => value
  try { fn() } finally { Math.random = original }
}

test('base：Idle -> Sad_Idle 必先 Sad_Begin', () => {
  const { player, director } = setup({ base: 'Sad_Idle' })
  director.syncAnimation(true)
  assert.equal(player.current(), 'Sad_Begin')
  player.end()
  assert.equal(player.current(), 'Sad_Idle')
  director.dispose()
})

test('base：Sad_Idle 播完 Sad_Begin 后进入循环，不重复入场', () => {
  const { player, director } = setup({ base: 'Sad_Idle' })
  director.syncAnimation(true)
  player.end()
  assert.equal(player.current(), 'Sad_Idle')
  director.syncAnimation(true)
  assert.equal(player.calls.filter((c) => c.name === 'Sad_Begin').length, 1)
  director.dispose()
})

test('base：离开 Sad_Idle 到 Idle', () => {
  const { player, director } = setup({ base: 'Idle' })
  director.layers.base = 'Sad_Idle'
  director.syncAnimation(true)
  player.end()
  assert.equal(player.current(), 'Sad_Idle')
  director.layers.base = 'Idle'
  director.syncAnimation(true)
  assert.equal(player.current(), 'Idle')
  director.dispose()
})

test('overlay：Interact 结束回 Idle', () => {
  const { player, director } = setup()
  director.playSegment()
  assert.equal(player.current(), 'Interact_B')
  player.end()
  assert.equal(player.current(), 'Idle')
  director.dispose()
})

test('overlay：Interact 结束回 Sad_Idle 必先 Sad_Begin', () => {
  const { player, director } = setup({ base: 'Sad_Idle' })
  director.syncAnimation(true)
  player.end() // Sad_Begin -> Sad_Idle
  director.playSegment()
  player.end() // Interact_B -> Sad_Begin
  assert.equal(player.current(), 'Sad_Begin')
  player.end()
  assert.equal(player.current(), 'Sad_Idle')
  director.dispose()
})

test('work：Talk 完整播完才回 Sad_Idle', () => {
  const { player, director } = setup({ base: 'Sad_Idle', work: 'Talk' })
  director.syncAnimation(true)
  assert.equal(player.current(), 'Talk')
  director.layers.work = null
  director.syncAnimation(true) // talkLock 仍应挡住 Sad_Begin
  assert.equal(player.current(), 'Talk')
  player.end()
  assert.equal(player.current(), 'Sad_Begin')
  player.end()
  assert.equal(player.current(), 'Sad_Idle')
  director.dispose()
})

test('work：Talk 中点击交互，结束后回基态而不是重播 Talk', () => {
  const { player, director } = setup({ base: 'Sad_Idle', work: 'Talk' })
  director.syncAnimation(true)
  assert.equal(player.current(), 'Talk')
  director.playSegment()
  assert.equal(player.current(), 'Interact_B')
  player.end() // Interact 结束时 work 仍是 Talk
  assert.equal(player.current(), 'Sad_Begin')
  player.end()
  assert.equal(player.current(), 'Sad_Idle')
  director.dispose()
})

test('work：Talk 被打断的那一轮结束后不再恢复', () => {
  const { player, director } = setup({ base: 'Idle', work: 'Talk' })
  director.syncAnimation(true)
  director.playSegment()
  player.end() // Interact -> Idle（Talk 已被抑制）
  assert.equal(player.current(), 'Idle')

  // 同一轮 work 仍是 Talk，不应重新起 Talk
  director.syncAnimation(true)
  assert.equal(player.current(), 'Idle')

  // work 归零后解除抑制；下一轮 Talk 正常播
  director.layers.work = null
  director.syncAnimation(true)
  director.layers.work = 'Talk'
  director.syncAnimation(true)
  assert.equal(player.current(), 'Talk')
  director.dispose()
})

test('overlay：Talk 期间 Happy 排队，Talk 结束后先 Happy 再回基态', () => {
  const { player, director } = setup({ base: 'Idle', work: 'Talk' })
  director.syncAnimation(true)
  assert.equal(player.current(), 'Talk')
  director.playOverlay('Happy')
  assert.equal(player.current(), 'Talk')
  director.layers.work = null
  player.end() // Talk 结束，兑现 Happy
  assert.equal(player.current(), 'Happy')
  player.end()
  assert.equal(player.current(), 'Idle')
  director.dispose()
})

test('thinking：首次必定触发，播完回 Sad_Idle', () => {
  withRandom(0.9, () => {
    const { player, director } = setup({ base: 'Sad_Idle', work: 'Special_B' })
    director.syncAnimation(true)
    assert.equal(player.current(), 'Special_B')
    const calls = player.calls.length
    director.syncAnimation(true) // 播放期间不重触发
    assert.equal(player.calls.length, calls)
    player.end()
    assert.equal(player.current(), 'Sad_Begin')
    player.end()
    assert.equal(player.current(), 'Sad_Idle')
    director.dispose()
  })
})

test('thinking：Sad_Begin 入场被交互打断后仍能回到 Sad_Idle', () => {
  const { player, director } = setup({ base: 'Sad_Idle' })
  director.syncAnimation(true)
  assert.equal(player.current(), 'Sad_Begin')
  director.playSegment()
  assert.equal(player.current(), 'Interact_B')
  player.end()
  assert.equal(player.current(), 'Sad_Begin')
  player.end()
  assert.equal(player.current(), 'Sad_Idle')
  director.dispose()
})

test('overlay：连续点击只以最后一次 Interact 结束为准', () => {
  const { player, director } = setup()
  director.playSegment()
  director.playSegment()
  assert.equal(player.current(), 'Interact_B')
  player.end()
  assert.equal(player.current(), 'Idle')
  director.dispose()
})
