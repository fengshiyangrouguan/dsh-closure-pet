import test from 'node:test'
import assert from 'node:assert/strict'

import {
  levelOf, formatPercent, formatGigabytes, formatGpuLine, buildSegments,
  PLATE_MAX_ROW_WIDTH, PLATE_FONT_SIZE,
} from '../assets/src/ui/plate-format.js'
import { levelOf as hostLevelOf } from '../lib/hardware.js'

test('客户端与服务端 levelOf 阈值一致', () => {
  for (const v of [null, 0, 40, 74.9, 75, 89.9, 90, 100]) {
    assert.equal(levelOf(v), hostLevelOf(v), 'levelOf(' + v + ')')
  }
})

test('formatPercent 缺项显示 --', () => {
  assert.equal(formatPercent(23.4), '23%')
  assert.equal(formatPercent(0), '0%')
  assert.equal(formatPercent(100), '100%')
  assert.equal(formatPercent(null), '--')
})

test('formatGigabytes 换成 G 且一位小数', () => {
  assert.equal(formatGigabytes(11373000000), '10.6G')
  assert.equal(formatGigabytes(12884000000), '12.0G')
  assert.equal(formatGigabytes(null), '--')
})

test('formatGpuLine 缺项省略，不出现 undefined', () => {
  const full = { index: 0, name: 'RTX 4090', usage: 99, memUsed: 11373000000, memTotal: 12884000000, temp: 57 }
  assert.equal(formatGpuLine(full), 'GPU0 99% 10.6/12.0G 57°')
  const noTemp = { index: 1, usage: 4, memUsed: null, memTotal: null, temp: null }
  assert.equal(formatGpuLine(noTemp), 'GPU1 4%')
  const nothing = { index: 2 }
  assert.equal(formatGpuLine(nothing), 'GPU2 --')
})

test('buildSegments 顺序是 CPU → GPU… → 内存，等级跟着阈值走', () => {
  const sample = {
    ok: true,
    cpu: 23.4,
    mem: { used: 4100000000, total: 10000000000, percent: 41 },
    gpus: [
      { index: 0, usage: 99, memUsed: 11373000000, memTotal: 12884000000, temp: 57 },
      { index: 1, usage: 76, memUsed: null, memTotal: null, temp: null },
    ],
  }
  const segs = buildSegments(sample)
  assert.deepEqual(segs.map((s) => s.key), ['cpu', 'gpu0', 'gpu1', 'mem'])
  assert.equal(segs[0].text, 'CPU 23%')
  assert.equal(segs[0].level, 'ok')
  assert.equal(segs[1].level, 'error')
  assert.equal(segs[2].level, 'warn')
  assert.equal(segs[2].text, 'GPU1 76%')
  assert.equal(segs[3].text, '内存 41%')
})

test('buildSegments 无样本 / 无显卡时只给 CPU + 内存占位', () => {
  const segs = buildSegments(null)
  assert.deepEqual(segs.map((s) => s.key), ['cpu', 'mem'])
  assert.equal(segs[0].text, 'CPU --')
  assert.equal(segs[0].level, 'idle')
  assert.equal(segs[1].text, '内存 --')
  const noGpu = buildSegments({ ok: true, cpu: 10, mem: { percent: 20 }, gpus: [] })
  assert.deepEqual(noGpu.map((s) => s.key), ['cpu', 'mem'])
})

test('排版常量与设计稿一致', () => {
  assert.equal(PLATE_MAX_ROW_WIDTH, 430)
  assert.equal(PLATE_FONT_SIZE, 11.3)
})
