import test from 'node:test'
import assert from 'node:assert/strict'

import { makeSettingsSection } from '../assets/src/ui/settings-page.js'

function walk(node, out = []) {
  if (!node) return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { for (const n of node) walk(n, out); return out }
  if (node.props) {
    if (typeof node.type === 'function') { walk(node.type(node.props || {}), out); return out }
    if (typeof node.props.children !== 'undefined') walk(node.props.children, out)
    if (node.children) walk(node.children, out)
  }
  return out
}

function collect(node, out = []) {
  if (!node) return out
  if (Array.isArray(node)) { for (const n of node) collect(n, out); return out }
  if (node && node.type) {
    out.push(node)
    if (typeof node.type === 'function') {
      collect(node.type(node.props || {}), out)
      return out
    }
    collect(node.props && node.props.children, out)
    collect(node.children, out)
  }
  return out
}

test('设置页渲染：阈值、状态池、事件池分开', () => {
  const calls = []
  globalThis.window = {
    __dshClosurePet: {
      settings: {
        lowThreshold: 10,
        idleChatterMs: 45000,
        dialogues: { idle: ['你好'], peakTime: ['峰时'] },
      },
      setSettings: (patch) => calls.push(patch),
    },
  }
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  }
  const Section = makeSettingsSection(React)
  const tree = Section({ close: () => {} })
  const text = walk(tree).join(' ')
  for (const label of ['可露希尔桌宠', '余额不足阈值', '闲时对话间隔', '闲时对话触发概率', 'Idle 闲时', 'Sad_Idle 闲时', 'Think_Idle 闲时', '点击交互对话池', '通用池', '到账', '峰时', '谷时', '余额不足']) {
    assert.ok(text.includes(label), 'missing ' + label)
  }
  const values = collect(tree).filter((n) => n.type === 'input').map((n) => String(n.props.value || ''))
  assert.ok(values.includes('今天也辛苦了，博士。'), 'settings page should show config defaults')
  assert.ok(values.includes('博士！预算快见底了\n该批经费啦！'), 'settings page should show lowBalance default')
})

test('设置页：改阈值只 PATCH 改动字段并立即生效', () => {
  const calls = []
  const puts = []
  globalThis.fetch = (url, opts) => { puts.push({ url, body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) }
  globalThis.window = {
    __dshClosurePet: {
      settings: { lowThreshold: 10, idleChatterMinutes: 45, idleChatterChance: 1, dialogues: {} },
      setSettings: (...args) => calls.push(args),
    },
  }
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  }
  const Section = makeSettingsSection(React)
  const tree = Section({ close: () => {} })
  const inputs = collect(tree).filter((n) => n.type === 'input' && n.props.type === 'number')
  assert.ok(inputs.length >= 2)
  inputs[0].props.onChange({ target: { value: '25' } })
  assert.deepEqual(calls[0][0], { lowThreshold: 25 })
  assert.equal(calls[0][1], false)
  assert.deepEqual(puts[0].body, { settings: { lowThreshold: 25 } })
})
