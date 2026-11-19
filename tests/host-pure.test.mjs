import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bjDayKey, computePeriod, nextPeriodChangeAt, holidaysOutdated,
} from '../lib/period.js'
import { priceFor, tokenCount, costOf } from '../lib/billing.js'

// 北京时间 = UTC+8。下列时间点都用 UTC 字符串固定，避免依赖本机时区。
const PEAK = Date.parse('2026-11-19T02:00:00Z')     // 周四 10:00 北京 → 峰
const LUNCH = Date.parse('2026-11-19T05:00:00Z')    // 周四 13:00 北京 → 谷
const WEEKEND = Date.parse('2026-11-21T02:00:00Z')  // 周六 10:00 北京 → 谷
const HOLIDAY = Date.parse('2026-10-01T02:00:00Z')  // 国庆 10:00 北京 → 谷

test('priceFor 按模型名子串匹配（最长优先）', () => {
  assert.deepEqual(priceFor('deepseek-v4-pro'), { hit: [0.15, 0.3], miss: [4.5, 9.0], out: [13.5, 27.0] })
  assert.deepEqual(priceFor('DeepSeek-V4-Flash'), { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] })
  assert.deepEqual(priceFor('unknown-model'), { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] })
})

test('bjDayKey 按北京时间归日', () => {
  assert.equal(bjDayKey(Date.parse('2026-11-19T16:30:00Z')), '2026-11-20') // 北京 00:30
  assert.equal(bjDayKey(Date.parse('2026-11-19T15:59:00Z')), '2026-11-19') // 北京 23:59
})

test('tokenCount 把 cacheRead 计入输入侧', () => {
  assert.equal(tokenCount({ inputTokens: 10, cacheReadTokens: 20, outputTokens: 5 }), 35)
  assert.equal(tokenCount({}), 0)
})

test('costOf 按峰谷取价', () => {
  const usage = { inputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0 }
  assert.equal(costOf(usage, 'deepseek-v4-pro', PEAK), 9.0)   // 未命中峰价 9.0/M
  assert.equal(costOf(usage, 'deepseek-v4-pro', LUNCH), 4.5)  // 未命中谷价 4.5/M
})

test('computePeriod 工作日峰谷 / 周末 / 节假日', () => {
  assert.equal(computePeriod(PEAK), 'peak')
  assert.equal(computePeriod(LUNCH), 'valley')
  assert.equal(computePeriod(Date.parse('2026-11-19T07:00:00Z')), 'peak')   // 15:00 北京
  assert.equal(computePeriod(Date.parse('2026-11-19T10:00:00Z')), 'valley') // 18:00 北京
  assert.equal(computePeriod(WEEKEND), 'valley')
  assert.equal(computePeriod(HOLIDAY), 'valley')
})

test('nextPeriodChangeAt 找到下一个切换点', () => {
  // 10:00 峰 → 12:00 谷
  assert.equal(nextPeriodChangeAt(PEAK), Date.parse('2026-11-19T04:00:00Z'))
  // 13:00 谷 → 14:00 峰
  assert.equal(nextPeriodChangeAt(LUNCH), Date.parse('2026-11-19T06:00:00Z'))
})

test('holidaysOutdated 仅在年份未收录时为真', () => {
  assert.equal(holidaysOutdated(Date.parse('2026-06-01T00:00:00Z')), false)
  assert.equal(holidaysOutdated(Date.parse('2027-06-01T00:00:00Z')), false)
  assert.equal(holidaysOutdated(Date.parse('2030-06-01T00:00:00Z')), true)
})
