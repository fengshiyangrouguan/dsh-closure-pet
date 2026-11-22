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
  for (const label of ['可露希尔桌宠', '余额不足阈值', 'Idle 闲时', 'Sad_Idle 闲时', 'Think_Idle 闲时', '到账', '峰时', '谷时', '余额不足']) {
    assert.ok(text.includes(label), 'missing ' + label)
  }
})

test('设置页：改阈值会通过 setSettings 持久化', () => {
  const calls = []
  globalThis.window = {
    __dshClosurePet: {
      settings: { lowThreshold: 10, idleChatterMs: 45000, dialogues: {} },
      setSettings: (patch) => calls.push(patch),
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
  assert.deepEqual(calls[0], { lowThreshold: 25 })
})
