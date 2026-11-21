import test from 'node:test'
import assert from 'node:assert/strict'

// 模块在加载时读 window / localStorage，所以先放桩再动态 import
const store = {}
globalThis.window = { innerWidth: 1920, innerHeight: 1080 }
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
}
globalThis.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })

const env = await import('../assets/src/core/env.js')
const settingsMod = await import('../assets/src/core/settings.js')
const hit = await import('../assets/src/render/hit-test.js')
const lib = await import('../assets/src/anim/library.js')
const audioMod = await import('../assets/src/audio.js')
const layoutMod = await import('../assets/src/ui/layout.js')

test('env 常量', () => {
  assert.equal(env.FRAME.w, 443.6)
  assert.equal(env.FRAME.h, 373.4)
  assert.equal(env.STARTUP_DELAY, 5000)
  assert.equal(env.INTERACT_SPLIT, 2.1)
})

test('settings 默认值与 localStorage 合并', () => {
  assert.equal(settingsMod.settings.size, 1)
  store['dshcl-settings'] = JSON.stringify({ size: 1.5, mirror: 'never', bubble: false, opacity: 0.8, volume: 0.1 })
  settingsMod.loadSettings()
  assert.equal(settingsMod.settings.size, 1.5)
  assert.equal(settingsMod.settings.mirror, 'never')
  assert.equal(settingsMod.settings.bubble, false)
  assert.equal(settingsMod.settings.opacity, 0.8)
  assert.equal(settingsMod.settings.volume, 0.1)
})

test('静态命中区：尺寸、覆盖率、中心/角落/越界', () => {
  const mask = hit.buildHitMask()
  assert.equal(mask.length, 128 * 108)
  let cells = 0
  for (let i = 0; i < mask.length; i++) cells += mask[i]
  const ratio = cells / mask.length
  assert.ok(ratio > 0.5 && ratio < 0.75, 'mask coverage ' + ratio)
  assert.equal(hit.maskHit(mask, 0.5, 0.4), true)
  assert.equal(hit.maskHit(mask, 0.02, 0.02), false)
  assert.equal(hit.maskHit(mask, 1.2, 0.5), false)
  assert.equal(hit.maskHit(mask, -0.1, 0.5), false)
})

test('动画数据表', () => {
  assert.equal(lib.CLIPS.Idle.loop, true)
  assert.equal(lib.CLIPS.Sad_Idle.loop, true)
  assert.equal(lib.CLIPS.Special_B.loop, undefined)
  assert.equal(lib.CLIPS.Talk.loop, undefined)
  assert.ok(lib.CLIPS.Special_B.duration > 2.5)
  assert.ok(lib.CLIPS.Interact_A.duration + lib.CLIPS.Interact_B.duration > 5.9)
  assert.equal(lib.HAPPY_CHANCE, 0.25)
  assert.ok(lib.THINK_CHANCE > 0 && lib.THINK_CHANCE <= 1)
  assert.deepEqual(lib.INTERACT_ACTIONS, ['Interact_B'])
  assert.ok(lib.CLIP_FADE_MS >= 100 && lib.CLIP_FADE_MS <= 600)
})

test('音效工厂', () => {
  const audio = audioMod.createAudio(() => ({ sound: true, volume: 0.5 }))
  assert.equal(typeof audio.loadSounds, 'function')
  assert.equal(typeof audio.playSound, 'function')
  assert.equal(typeof audio.ensure, 'function')
  assert.deepEqual(audio.getState(), { loaded: {}, ctx: null, enabled: true, volume: 0.5 })
})

test('布局工厂：大小 / 夹取 / 落位 / 吸附 / 镜像', () => {
  const host = { offsetWidth: 450, offsetHeight: 379, style: {} }
  const canvas = { style: {} }
  const pet = { pos: { x: 100, y: 100 }, anchor: { h: 'left', v: 'bottom' }, flipped: false }
  const L = layoutMod.createLayout({ host, canvas, settings: settingsMod.settings, pet })
  assert.deepEqual(L.size(), { w: 450, h: 379 })
  assert.deepEqual(L.clampPos(5000, -10), { x: 1920 - 450, y: 0 })
  L.applyPosition()
  assert.equal(host.style.left, '100px')
  assert.equal(host.style.top, '100px')
  pet.pos = { x: 10, y: 10 }
  L.settle()
  assert.deepEqual(pet.anchor, { h: 'left', v: 'top' })
  assert.deepEqual(pet.pos, { x: 12, y: 12 })
  L.setFlipped(true)
  assert.equal(pet.flipped, true)
  assert.equal(canvas.style.transform, 'scaleX(-1)')
  L.setFlipped(false)
  assert.equal(canvas.style.transform, '')
})

test('吸附强度：0% 不吸，100% 半程，200% 等同旧行为', () => {
  const host = { offsetWidth: 450, offsetHeight: 379, style: {} }
  const canvas = { style: {} }
  const pet = { pos: { x: 100, y: 200 }, anchor: { h: null, v: null }, flipped: false }
  const settings = { ...settingsMod.settings }
  const L = layoutMod.createLayout({ host, canvas, settings, pet })

  settings.snapStrength = 200
  pet.pos = { x: 100, y: 200 }
  pet.anchor = { h: null, v: null }
  L.settle()
  assert.equal(pet.anchor.h, 'left')

  settings.snapStrength = 100
  pet.pos = { x: 150, y: 200 }
  pet.anchor = { h: null, v: null }
  L.settle()
  assert.equal(pet.anchor.h, null)
  pet.pos = { x: 100, y: 200 }
  pet.anchor = { h: null, v: null }
  L.settle()
  assert.equal(pet.anchor.h, 'left')

  settings.snapStrength = 0
  pet.pos = { x: 10, y: 10 }
  pet.anchor = { h: null, v: null }
  L.settle()
  assert.equal(pet.anchor.h, null)
  assert.equal(pet.anchor.v, null)
})
