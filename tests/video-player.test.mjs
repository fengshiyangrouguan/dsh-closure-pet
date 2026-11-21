// 视频播放器回归：同名覆盖动画播完后再次触发，必须从头重启并重新触发 ended。
import test from 'node:test'
import assert from 'node:assert/strict'

function fakeVideo() {
  const video = {
    className: '',
    classList: { add() {}, remove() {} },
    muted: false,
    defaultMuted: false,
    playsInline: false,
    autoplay: false,
    preload: '',
    loop: false,
    onended: null,
    src: '',
    readyState: 2,
    ended: false,
    paused: false,
    currentTime: 0,
    _ready: null,
    setAttribute() {},
    addEventListener(type, cb) { if (type === 'loadeddata') video._ready = cb },
    removeEventListener() {},
    load() { if (video._ready) video._ready() },
    play() { video.paused = false; return Promise.resolve() },
    pause() { video.paused = true },
  }
  return video
}

const videos = []
globalThis.document = {
  getElementById: () => null,
  createElement(tag) {
    if (tag === 'video') {
      const v = fakeVideo()
      videos.push(v)
      return v
    }
    return { id: '', textContent: '', style: {} }
  },
  head: { appendChild() {} },
}
globalThis.URL = {
  createObjectURL: () => 'blob:test',
  revokeObjectURL() {},
}
globalThis.fetch = () => Promise.resolve({ ok: true, blob: () => Promise.resolve({}) })

const { createVideoPlayer } = await import('../assets/src/render/video-player.js')
const stage = { style: { setProperty() {} }, appendChild() {} }

test('同名覆盖动画 ended 后再次 play 会从头重启', async () => {
  const player = createVideoPlayer({ stage, baseUrl: '/assets/video/', log() {} })
  let firstEnded = 0
  let secondEnded = 0
  player.play('Special_A', { onEnded: () => { firstEnded++ } })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const video = player.video()
  assert.ok(video)

  // 第一遍播完：ended 已触发，元素停在末帧
  video.ended = true
  video.paused = true
  video.currentTime = 2

  player.play('Special_A', { onEnded: () => { secondEnded++ } })
  assert.equal(video.currentTime, 0, '同名的 ended 视频必须回到第 0 帧')
  assert.equal(video.paused, false, '必须重新播放')

  video.ended = false
  video.onended()
  assert.equal(firstEnded, 0)
  assert.equal(secondEnded, 1)
  player.dispose()
})
