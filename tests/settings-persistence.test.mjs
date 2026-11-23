import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.localStorage = { getItem: () => null, setItem: () => {} }
const calls = []
globalThis.fetch = (url, opts) => {
  calls.push(JSON.parse(opts.body))
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
}

const { settings, saveSettings } = await import('../assets/src/core/settings.js')

test('宿主配置未加载时 saveSettings 不提交 dialogues/新字段', () => {
  calls.length = 0
  settings.hostLoaded = false
  settings.dialogues = { idle: ['用户文本'] }
  saveSettings(true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].settings.dialogues, undefined)
  assert.equal(calls[0].settings.idleChatterMinutes, undefined)
})

test('宿主配置加载后 saveSettings 提交完整低频配置', () => {
  calls.length = 0
  settings.hostLoaded = true
  settings.dialogues = { idle: ['用户文本'] }
  settings.idleChatterMinutes = 5
  settings.idleChatterChance = 0.4
  saveSettings(true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].settings.dialogues, { idle: ['用户文本'] })
  assert.equal(calls[0].settings.idleChatterMinutes, 5)
  assert.equal(calls[0].settings.idleChatterChance, 0.4)
})
