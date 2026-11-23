import test from 'node:test'
import assert from 'node:assert/strict'

const plays = []
globalThis.Audio = class {
  constructor(src) { this.src = src; this.volume = 0; this.duration = 5 }
  addEventListener() {}
  pause() {}
  play() { plays.push(this); return Promise.resolve() }
}
globalThis.fetch = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({
    '你好': { zh: 'a.ogg', ja: 'a_ja.ogg', zhMs: 2000, jaMs: 4000 },
  }),
})

const { createVoice } = await import('../assets/src/voice.js')

test('voice 按当前语言选预生成文件', async () => {
  const settings = { voice: true, voiceLang: 'ja', volume: 0.9, voiceVolume: 0.4 }
  const voice = createVoice(() => settings)
  await voice.load()
  assert.equal(voice.duration('你好'), 4000)
  const ms = await voice.play('你好')
  assert.equal(plays.length, 1)
  assert.match(plays[0].src, /a_ja\.ogg$/)
  assert.equal(plays[0].volume, 0.4)
  assert.equal(ms, 5000)
})

test('voice 关闭时不播放', async () => {
  const settings = { voice: false, voiceLang: 'zh', volume: 0.5 }
  const voice = createVoice(() => settings)
  await voice.load()
  const before = plays.length
  voice.play('你好')
  assert.equal(plays.length, before)
})
