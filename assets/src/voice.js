// 桌宠语音：按配置里的中文原文查找预先零样本生成的中/日语音文件。
// 语音是否启用、使用中文还是日语，都由右键设置页里的 settings 决定。

import { PREFIX } from './core/env.js'

export function createVoice(getSettings) {
  var manifest = null
  var manifestPromise = null
  var current = null

  function loadManifest() {
    if (manifestPromise) return manifestPromise
    manifestPromise = fetch(PREFIX + '/assets/voice/manifest.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (json) { manifest = json && typeof json === 'object' ? json : {}; return manifest })
      .catch(function () { manifest = {}; return manifest })
    return manifestPromise
  }

  function play(text) {
    var s = getSettings()
    if (!s || !s.voice || !text) return Promise.resolve(0)
    var lang = s.voiceLang === 'ja' ? 'ja' : 'zh'
    var volume = Math.min(1, Math.max(0, Number(s.voiceVolume === undefined ? s.volume : s.voiceVolume) || 0))
    if (volume <= 0.001) return Promise.resolve(0)

    return new Promise(function (resolve) {
      var done = false
      function finish(ms) {
        if (done) return
        done = true
        resolve(Math.max(0, Number(ms) || 0))
      }
      var go = function () {
        if (!manifest) return finish(0)
        var entry = manifest[text]
        if (!entry) return finish(0)
        var file = entry[lang]
        if (!file) return finish(0)
        try {
          if (current) { current.pause(); current = null }
          var audio = new Audio(PREFIX + '/assets/voice/' + file)
          audio.volume = volume
          current = audio
          var readDuration = function () {
            if (Number.isFinite(audio.duration) && audio.duration > 0) finish(audio.duration * 1000)
          }
          audio.addEventListener('loadedmetadata', readDuration)
          audio.addEventListener('error', function () { finish(0) })
          readDuration()
          audio.play().catch(function () {})
          setTimeout(function () { finish(0) }, 3000)
        } catch (err) { finish(0) }
      }
      if (manifest) go()
      else loadManifest().then(go)
    })
  }

  function stop() {
    if (current) { try { current.pause() } catch (err) {} current = null }
  }

  function duration(text) {
    var s = getSettings()
    if (!s || !s.voice || !manifest || !text) return 0
    var lang = s.voiceLang === 'ja' ? 'ja' : 'zh'
    var entry = manifest[text]
    if (!entry) return 0
    var ms = Number(entry[lang + 'Ms'])
    return Number.isFinite(ms) && ms > 0 ? ms : 0
  }

  function getState() {
    var s = getSettings()
    return {
      enabled: !!(s && s.voice),
      lang: s && s.voiceLang === 'ja' ? 'ja' : 'zh',
      manifestReady: !!manifest,
      entries: manifest ? Object.keys(manifest).length : 0,
    }
  }

  return { play: play, duration: duration, stop: stop, getState: getState, load: loadManifest }
}
