// 3.0 注册式状态机契约测试：基础 loop、Idle 屏障、事件优先级/排队、通知类、回 base enter。
import test from 'node:test'
import assert from 'node:assert/strict'

import { createMachine } from '../assets/src/anim/machine.js'

const noop = () => {}

function effects(machine, event) {
  return machine.dispatch(event)
}

function playEffects(fx) {
  return fx.filter((e) => e.type === 'play')
}

function noticeEffects(fx) {
  return fx.filter((e) => e.type === 'notice')
}

function ended(machine, fx, index) {
  const play = playEffects(fx)[index || 0]
  assert.ok(play, 'expected a play effect')
  return machine.dispatch({ type: 'CLIP_ENDED', id: play.id })
}

test('初始进入 Idle，等一轮后才进入 Sad', () => {
  const m = createMachine({ target: 'idle' })
  let fx = effects(m, { type: 'CONDITIONS', low: true, work: 'idle' })
  assert.equal(playEffects(fx)[0].clip, 'Idle')
  assert.equal(playEffects(fx)[0].loop, true)
  assert.equal(playEffects(fx).length, 1)
  const idleId = playEffects(fx)[0].id

  // Idle 未完成，不切 Sad
  fx = effects(m, { type: 'IDLE_DONE', id: idleId })
  assert.equal(playEffects(fx)[0].clip, 'Sad_Begin')
})

test('Sad 播完进入 Sad_Idle，再以反向 exit 回 Idle', () => {
  const m = createMachine({ target: 'sad' })
  let fx = effects(m, { type: 'CONDITIONS', low: true, work: 'idle' })
  assert.equal(playEffects(fx)[0].clip, 'Idle')
  fx = effects(m, { type: 'IDLE_DONE', id: m.state.active.id })
  assert.equal(playEffects(fx)[0].clip, 'Sad_Begin')
  fx = ended(m, fx)
  assert.equal(playEffects(fx)[0].clip, 'Sad_Idle')

  fx = effects(m, { type: 'CONDITIONS', low: false, work: 'idle' })
  assert.equal(playEffects(fx)[0].clip, 'Sad_Exit')
})

test('one-shot 结束回 base 时播 enter，不等待 Idle 一轮', () => {
  const m = createMachine({ target: 'sad' })
  let fx = effects(m, { type: 'CONDITIONS', low: true, work: 'idle' })
  fx = effects(m, { type: 'IDLE_DONE', id: m.state.active.id })
  fx = ended(m, fx) // Sad_Idle
  assert.equal(m.state.base.state, 'sad')

  fx = effects(m, { type: 'FIRE', name: 'valley_time' })
  assert.equal(playEffects(fx)[0].clip, 'Happy')
  fx = ended(m, fx)
  // Happy 结束 -> 目标 sad 的 enter
  assert.equal(playEffects(fx)[0].clip, 'Sad_Begin')
})

test('peak_time / valley_time 是独立事件，都排队', () => {
  const m = createMachine({ target: 'idle', work: 'outputting' })
  let fx = effects(m, { type: 'CONDITIONS', low: false, work: 'outputting' })
  assert.equal(playEffects(fx)[0].clip, 'Talk')
  const talkId = playEffects(fx)[0].id

  fx = effects(m, { type: 'FIRE', name: 'peak_time' })
  assert.equal(playEffects(fx).length, 0)
  assert.equal(m.state.queue.length, 1)

  fx = effects(m, { type: 'FIRE', name: 'valley_time' })
  assert.equal(m.state.queue.length, 2)

  // Talk 播完，work 仍 outputting -> 重播 Talk，price 继续排队
  fx = effects(m, { type: 'CLIP_ENDED', id: talkId })
  assert.equal(playEffects(fx)[0].clip, 'Talk')
  assert.equal(m.state.queue.length, 2)
})

test('price 排队在 Talk 后，Talk 结束并停播后按优先级出队', () => {
  const m = createMachine({ target: 'idle', work: 'outputting' })
  let fx = effects(m, { type: 'CONDITIONS', low: false, work: 'outputting' })
  assert.equal(playEffects(fx)[0].clip, 'Talk')
  const talkId = playEffects(fx)[0].id
  effects(m, { type: 'FIRE', name: 'peak_time' })
  effects(m, { type: 'FIRE', name: 'valley_time' })

  // work 结束，Talk 这一遍播完后不再重播
  effects(m, { type: 'CONDITIONS', low: false, work: 'idle' })
  fx = effects(m, { type: 'CLIP_ENDED', id: talkId })
  // 两个 price 同为 75，FIFO：peak 先出
  assert.equal(playEffects(fx)[0].clip, 'Sad_Begin')
})

test('lowBalance 是 textOnly：不发 play、只发 notice，不改 base', () => {
  const m = createMachine({ target: 'idle' })
  effects(m, { type: 'CONDITIONS', low: false, work: 'idle' })
  const before = m.state.base.state
  const fx = effects(m, { type: 'CONDITIONS', low: true, work: 'idle' })
  // 条件变化只改 target，lowBalance 事件进入队列后出队
  const lowFx = effects(m, { type: 'FIRE', name: 'lowBalance' })
  assert.equal(playEffects(lowFx).length, 0)
  assert.equal(noticeEffects(lowFx).length, 1)
  assert.equal(m.state.base.state, before)
})

test('同一优先级排队：第二个 credited 等第一个结束', () => {
  const m = createMachine({ target: 'idle' })
  effects(m, { type: 'CONDITIONS', low: false, work: 'idle' })
  let fx = effects(m, { type: 'FIRE', name: 'credited' })
  assert.equal(playEffects(fx)[0].clip, 'Celebrate')

  fx = effects(m, { type: 'FIRE', name: 'credited' })
  assert.equal(playEffects(fx).length, 0)
  assert.equal(m.state.queue.length, 1)
})

test('低优先级 idleChatter 不打断转场', () => {
  const m = createMachine({ target: 'sad' })
  let fx = effects(m, { type: 'CONDITIONS', low: true, work: 'idle' })
  assert.equal(m.state.active.clip, 'Idle')
  const idleId = m.state.active.id
  fx = effects(m, { type: 'IDLE_DONE', id: idleId })
  assert.equal(playEffects(fx)[0].clip, 'Sad_Begin')

  const before = m.state.active.id
  const after = effects(m, { type: 'IDLE_CHATTER_DUE' })
  assert.equal(after.length, 0)
  assert.equal(m.state.active.id, before)
})
