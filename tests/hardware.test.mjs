import test from 'node:test'
import assert from 'node:assert/strict'

import {
  levelOf, parseGpuCsv, percentOf, createHardwareSampler,
  LEVEL_WARN, LEVEL_ERROR,
} from '../lib/hardware.js'

const GB = 1024 * 1024 * 1024

function fakeOs() {
  let tick = 0
  return {
    cpus() {
      tick += 100
      return [{ times: { user: tick, nice: 0, sys: tick, idle: tick * 4, irq: 0 } }]
    },
    totalmem: () => 16 * GB,
    freemem: () => 4 * GB,
  }
}

function fakeExec(result) {
  const calls = []
  const run = (cmd, args, opts, cb) => {
    calls.push({ cmd, args, opts })
    if (result instanceof Error) cb(result)
    else cb(null, result)
  }
  run.calls = calls
  return run
}

test('levelOf 阈值', () => {
  assert.equal(levelOf(null), 'idle')
  assert.equal(levelOf(0), 'ok')
  assert.equal(levelOf(LEVEL_WARN - 0.1), 'ok')
  assert.equal(levelOf(LEVEL_WARN), 'warn')
  assert.equal(levelOf(LEVEL_ERROR), 'error')
  assert.equal(levelOf(100), 'error')
})

test('percentOf 缺项与非法分母返回 null', () => {
  assert.equal(percentOf(50, 200), 25)
  assert.equal(percentOf(0, 100), 0)
  assert.equal(percentOf(50, 0), null)
  assert.equal(percentOf(null, 100), null)
})

test('parseGpuCsv：跳过坏行，MiB 转字节', () => {
  const gpus = parseGpuCsv([
    '0, NVIDIA RTX 4060, 35, 2900, 8192, 65',
    '1, NVIDIA RTX 4060, 0, [N/A], 8192, [N/A]',
    '',
    'garbage',
  ].join('\n'))
  assert.equal(gpus.length, 2)
  assert.deepEqual(gpus[0], {
    index: 0, name: 'NVIDIA RTX 4060', usage: 35,
    memUsed: 2900 * 1024 * 1024, memTotal: 8192 * 1024 * 1024, temp: 65,
  })
  assert.equal(gpus[1].memUsed, null)
  assert.equal(gpus[1].temp, null)
  assert.deepEqual(parseGpuCsv(null), [])
})

test('sample()：固定形状，GPU 结果缓存/单飞', async () => {
  const exec = fakeExec('0, NVIDIA RTX 4060, 35, 2900, 8192, 65\n')
  const sampler = createHardwareSampler({ os: fakeOs(), execFile: exec, log: () => {} })
  await new Promise((resolve) => setTimeout(resolve, 450))
  const sample = await sampler.sample()
  assert.equal(sample.ok, true)
  assert.equal(typeof sample.cpu, 'number')
  assert.equal(sample.mem.total, 16 * GB)
  assert.equal(sample.gpus.length, 1)
  assert.equal(sample.gpus[0].temp, 65)
  await sampler.sample()
  assert.equal(exec.calls.length, 1, 'GPU 应命中 2s 缓存')
  assert.equal(sampler.debug().gpuCount, 1)
})

test('sample()：nvidia-smi 超时进入 60s 退避，不再重复 fork', async () => {
  const timeout = Object.assign(new Error('Command failed'), { code: null, killed: true, signal: 'SIGTERM' })
  const exec = fakeExec(timeout)
  const sampler = createHardwareSampler({ os: fakeOs(), execFile: exec, log: () => {} })
  const first = await sampler.sample()
  assert.equal(first.gpuError, 'ETIMEDOUT')
  assert.deepEqual(first.gpus, [])
  await sampler.sample()
  assert.equal(exec.calls.length, 1, 'ETIMEDOUT 后应退避')
})

test('sample()：没有 nvidia-smi 时返回空数组而不是抛错', async () => {
  const missing = Object.assign(new Error('spawn nvidia-smi ENOENT'), { code: 'ENOENT' })
  const sampler = createHardwareSampler({ os: fakeOs(), execFile: fakeExec(missing), log: () => {} })
  const sample = await sampler.sample()
  assert.equal(sample.ok, true)
  assert.deepEqual(sample.gpus, [])
  assert.equal(sample.gpuError, 'ENOENT')
})
