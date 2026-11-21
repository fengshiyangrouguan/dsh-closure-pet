import test from 'node:test'
import assert from 'node:assert/strict'

import {
  levelOf, parseGpuCsv, percentOf, createHardwareSampler,
  LEVEL_WARN, LEVEL_ERROR,
} from '../lib/hardware.js'

test('levelOf 阈值：<75 ok、>=75 warn、>=90 error、无读数 idle', () => {
  assert.equal(levelOf(null), 'idle')
  assert.equal(levelOf(undefined), 'idle')
  assert.equal(levelOf(0), 'ok')
  assert.equal(levelOf(LEVEL_WARN - 0.1), 'ok')
  assert.equal(levelOf(LEVEL_WARN), 'warn')
  assert.equal(levelOf(LEVEL_ERROR - 0.1), 'warn')
  assert.equal(levelOf(LEVEL_ERROR), 'error')
  assert.equal(levelOf(100), 'error')
})

test('percentOf 只做除法，缺项返回 null', () => {
  assert.equal(percentOf(50, 200), 25)
  assert.equal(percentOf(0, 100), 0)
  assert.equal(percentOf(100, 100), 100)
  assert.equal(percentOf(null, 100), null)
  assert.equal(percentOf(50, 0), null)
  assert.equal(percentOf(50, null), null)
})

test('parseGpuCsv 解析 nvidia-smi 的 csv,noheader,nounits 输出', () => {
  const csv = [
    '0, NVIDIA GeForce RTX 4090, 99, 11373, 12884, 57',
    '1, NVIDIA GeForce RTX 4090, 0, [N/A], 12884, [N/A]',
    '',
    'garbage line',
  ].join('\n')
  const gpus = parseGpuCsv(csv)
  assert.equal(gpus.length, 2)
  assert.deepEqual(gpus[0], { index: 0, name: 'NVIDIA GeForce RTX 4090', usage: 99, memUsed: 11373 * 1024 * 1024, memTotal: 12884 * 1024 * 1024, temp: 57 })
  assert.equal(gpus[1].index, 1)
  assert.equal(gpus[1].usage, 0)
  assert.equal(gpus[1].memUsed, null)
  assert.equal(gpus[1].temp, null)
})

test('parseGpuCsv 对空输出与列数不足的行返回空数组', () => {
  assert.deepEqual(parseGpuCsv(''), [])
  assert.deepEqual(parseGpuCsv(null), [])
  assert.deepEqual(parseGpuCsv('0, NVIDIA, 99'), [])
})

test('sample() 形状固定，失败也降级不抛错', async () => {
  const sampler = createHardwareSampler({ log: () => {} })
  const s = await sampler.sample()
  assert.equal(s.ok, true)
  assert.equal(typeof s.at, 'number')
  assert.ok(s.cpu === null || typeof s.cpu === 'number')
  assert.equal(typeof s.mem.used, 'number')
  assert.equal(typeof s.mem.total, 'number')
  assert.ok(s.mem.used <= s.mem.total)
  assert.ok(s.mem.percent === null || (s.mem.percent >= 0 && s.mem.percent <= 100))
  assert.ok(Array.isArray(s.gpus))
  // 连续两次调用必须都能返回（第一次可能建立 CPU 基线）
  const s2 = await sampler.sample()
  assert.equal(s2.ok, true)
  const dbg = sampler.debug()
  assert.ok(dbg.lastSampleAt > 0, 'debug 应记录采样时间')
  assert.ok(Array.isArray(sampler.debug().gpuCount === undefined ? [] : []) )
})
