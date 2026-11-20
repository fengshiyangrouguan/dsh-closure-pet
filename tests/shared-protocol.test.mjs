import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SCHEMA_VERSION, URL_PREFIX, STATE_PATH, CONFIG_PATH,
  SETTINGS_DEFAULTS, SIZE_MIN, SIZE_MAX, OPACITY_MIN, normalizeSettings,
} from '../assets/src/shared/protocol.js'

test('协议版本与路径', () => {
  assert.ok(Number.isInteger(SCHEMA_VERSION) && SCHEMA_VERSION >= 1)
  assert.equal(URL_PREFIX, '/dsh-closure')
  assert.equal(STATE_PATH, '/dsh-closure/state')
  assert.equal(CONFIG_PATH, '/dsh-closure/config')
})

test('设置默认值', () => {
  assert.deepEqual({ ...SETTINGS_DEFAULTS }, {
    mirror: 'auto', size: 1, bubble: true, bubbleScale: 100, bubbleTiers: true, snapStrength: 200, opacity: 1, sound: true, volume: 0.7,
  })
  assert.ok(SIZE_MIN < SIZE_MAX)
  assert.ok(OPACITY_MIN >= 0 && OPACITY_MIN < 1)
})

test('normalizeSettings 接受合法字段', () => {
  const out = normalizeSettings({ mirror: 'always', size: 1.5, bubble: false, bubbleScale: 150, bubbleTiers: false, snapStrength: 200, opacity: 0.8, sound: false, volume: 0.1 })
  assert.deepEqual(out, { mirror: 'always', size: 1.5, bubble: false, bubbleScale: 150, bubbleTiers: false, snapStrength: 200, opacity: 0.8, sound: false, volume: 0.1 })
})

test('normalizeSettings 夹取越界值', () => {
  const out = normalizeSettings({ size: 99, opacity: 0, volume: 2 })
  assert.equal(out.size, SIZE_MAX)
  assert.equal(out.opacity, OPACITY_MIN)
  assert.equal(out.volume, 1)
  assert.equal(normalizeSettings({ size: -5 }).size, SIZE_MIN)
})

test('normalizeSettings 忽略非法值与缺失字段', () => {
  const base = { mirror: 'never', size: 1.2, bubble: false, opacity: 0.7, sound: false, volume: 0.3 }
  const out = normalizeSettings({ mirror: 'bogus', bubble: 'yes', opacity: 'x' }, base)
  assert.deepEqual(out, base)
  assert.deepEqual(normalizeSettings(null, base), base)
  assert.deepEqual(normalizeSettings({}, base), base)
})

test('normalizeSettings 不修改入参', () => {
  const raw = { size: 5 }
  const base = { ...SETTINGS_DEFAULTS, size: 1 }
  const out = normalizeSettings(raw, base)
  assert.equal(raw.size, 5)
  assert.equal(base.size, 1)
  assert.equal(out.size, SIZE_MAX)
  assert.notEqual(out, base)
})

test('bubbleScale / bubbleTiers 归一化', () => {
  assert.equal(normalizeSettings({ bubbleScale: 10 }).bubbleScale, 50)
  assert.equal(normalizeSettings({ bubbleScale: 999 }).bubbleScale, 200)
  assert.equal(normalizeSettings({ bubbleScale: 150 }).bubbleScale, 150)
  assert.equal(normalizeSettings({ bubbleTiers: false }).bubbleTiers, false)
  assert.equal(normalizeSettings({ bubbleTiers: 'no' }).bubbleTiers, true)
})

test('snapStrength 归一化', () => {
  assert.equal(normalizeSettings({ snapStrength: -5 }).snapStrength, 0)
  assert.equal(normalizeSettings({ snapStrength: 500 }).snapStrength, 200)
  assert.equal(normalizeSettings({ snapStrength: 75 }).snapStrength, 75)
})
