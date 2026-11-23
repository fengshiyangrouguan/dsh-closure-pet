import test from 'node:test'
import assert from 'node:assert/strict'

import {
  levelOf, formatPercent, formatGigabytes, formatGpuLine, buildSegments, normalizeScheme,
  PLATE_MAX_ROW_WIDTH, PLATE_FONT_SIZE,
} from '../assets/src/ui/plate-format.js'
import { levelOf as hostLevelOf } from '../lib/hardware.js'

test('客户端与服务端 levelOf 阈值一致', () => {
  for (const value of [null, 0, 40, 74.9, 75, 89.9, 90, 100]) {
    assert.equal(levelOf(value), hostLevelOf(value), 'levelOf(' + value + ')')
  }
})

test('数值格式化：百分比、内存、温度', () => {
  assert.equal(formatPercent(23.4), '23%')
  assert.equal(formatPercent(0), '0%')
  assert.equal(formatPercent(null), '--')
  assert.equal(formatGigabytes(2900 * 1024 * 1024), '2.8G')
  assert.equal(formatGigabytes(null), '--')
  assert.equal(formatGpuLine({ index: 0, usage: 35, memUsed: 2900 * 1024 * 1024, memTotal: 8192 * 1024 * 1024, temp: 65 }), 'GPU0 35% 2.8/8.0G 65°C')
  assert.equal(formatGpuLine({ index: 1, usage: 4 }), 'GPU1 4%')
})

test('buildSegments 顺序固定：CPU → GPU… → 内存', () => {
  const segments = buildSegments({
    cpu: 23.4,
    mem: { percent: 80 },
    gpus: [
      { index: 0, usage: 35, temp: 65 },
      { index: 1, usage: 76 },
    ],
  })
  assert.deepEqual(segments.map((s) => s.key), ['cpu', 'gpu0', 'gpu1', 'mem'])
  assert.deepEqual(segments.map((s) => s.tone), ['cpu', 'gpu', 'gpu', 'mem'])
  assert.equal(segments[0].text, 'CPU 23%')
  assert.equal(segments[1].level, 'ok')
  assert.equal(segments[2].level, 'warn')
  assert.equal(segments[3].text, '内存 80%')
})

test('无样本时只显示 CPU / 内存占位', () => {
  const segments = buildSegments(null)
  assert.deepEqual(segments.map((s) => s.text), ['CPU --', '内存 --'])
  assert.deepEqual(segments.map((s) => s.level), ['idle', 'idle'])
})

test('主题值只接受明确 light/dark，light dark / normal 交给系统', () => {
  assert.equal(normalizeScheme('dark'), 'dark')
  assert.equal(normalizeScheme(' light '), 'light')
  assert.equal(normalizeScheme('light dark'), null)
  assert.equal(normalizeScheme('normal'), null)
  assert.equal(normalizeScheme(''), null)
  assert.equal(normalizeScheme(null), null)
})

test('挂牌排版常量保持紧凑', () => {
  assert.equal(PLATE_MAX_ROW_WIDTH, 430)
  assert.equal(PLATE_FONT_SIZE, 10.5)
})
