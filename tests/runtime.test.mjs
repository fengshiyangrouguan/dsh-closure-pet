import test from 'node:test'
import assert from 'node:assert/strict'

import { createRuntime } from '../assets/src/anim/runtime.js'

function harness() {
  const plays = []
  const notices = []
  const dialogs = []
  const player = {
    play(name, opts) {
      plays.push({ name, opts })
      return true
    },
  }
  const rt = createRuntime({
    player,
    log: () => {},
    showNotice: (spec, event) => notices.push({ spec, event }),
    showDialog: (text) => dialogs.push(text),
    getDialogues: () => ({
      credited: ['经费到账'],
      lowBalance: ['余额见底'],
      idle: ['今天也辛苦了'],
      sadIdle: ['别难过'],
      thinkIdle: ['在想事情'],
      interact: ['今天也辛苦了'],
    }),
  })
  return { rt, plays, notices, dialogs, player }
}

function lastPlay(plays) {
  return plays[plays.length - 1]
}

test('credited 事件播放 Celebrate 并调用通知类', () => {
  const h = harness()
  h.rt.fire('credited')
  assert.equal(lastPlay(h.plays).name, 'Celebrate')
  assert.equal(h.notices.length, 1)
  assert.equal(h.notices[0].event, 'credited')
  assert.ok(h.notices[0].spec.segments.length > 0)
})

test('lowBalance 是 textOnly：不产生 play，只发通知', () => {
  const h = harness()
  const before = h.plays.length
  h.rt.fire('lowBalance')
  assert.equal(h.plays.length, before)
  assert.equal(h.notices.length, 1)
  assert.equal(h.notices[0].event, 'lowBalance')
  assert.equal(h.notices[0].spec.text, '余额见底')
})

test('事件结束回调按 id 推进，旧 id 不生效', () => {
  const h = harness()
  h.rt.fire('credited')
  const first = lastPlay(h.plays)
  // 旧 id 结束不应推进
  h.rt.dispatch({ type: 'CLIP_ENDED', id: first.opts.id - 1 })
  assert.equal(h.rt.machine.state.active.event, 'credited')
  first.opts.onEnded()
  assert.equal(h.rt.machine.state.active.kind, 'base')
  assert.equal(h.rt.machine.state.active.clip, 'Idle')
})

test('idleChatter 按当前 base 取对应池', () => {
  const h = harness()
  h.rt.machine.state.base.state = 'sad'
  h.rt.idleChatterDue()
  assert.equal(lastPlay(h.plays).name, 'Talk')
  assert.equal(h.notices.length, 1)
  assert.equal(h.notices[0].spec.text, '别难过')
})

test('interact 用完整信息气泡 + 对话，而不是独立 segments', () => {
  const h = harness()
  h.rt.fire('interact')
  assert.match(lastPlay(h.plays).name, /^Interact_[12]$/)
  assert.equal(h.dialogs.length, 1)
  assert.equal(h.dialogs[0], '今天也辛苦了')
  assert.equal(h.notices.length, 0)
})
