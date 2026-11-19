// dsh-closure-pet — 动画导演（分层状态机）
//
// overlay（一次性覆盖） > work（思考/输出） > base（Idle / Sad_Idle）。
// 负责：循环切换、Interact 分段、Talk 锁、一次性覆盖、思考/乒乓的相位参数。
// 每帧推进相位与绘制在 render/loop（目前仍在 main.js 的 frame()）。
// 依赖注入：pet、log、audioEnsure、playSound、getStartupHold/setStartupHold。

import { INTERACT_SPLIT } from '../core/env.js'
import { LOOP_RANGES, LOOP_MODES, THINK_NOD_MIN_MS, THINK_NOD_MAX_MS } from './library.js'

export function createDirector(deps) {
  var pet = deps.pet
  var log = deps.log
  // audio 别名在 main 的组合阶段才赋值（比导演创建晚），所以必须惰性取，不能在这里捕获
  var getAudioEnsure = deps.getAudioEnsure || function () { return deps.audioEnsure }
  var getPlaySound = deps.getPlaySound || function () { return deps.playSound }

  // ————————————————————— 播放（分层）—————————————————————
  // overlay（一次性覆盖） > work（思考/输出） > base（Idle / Sad_Idle）
  var layers = { base: 'Idle', work: null, overlay: null }
  var talkLock = false      // Talk 播放中：状态切换被挂起，强制播完
  var pendingOverlay = null // Talk 期间被挂起的覆盖动画（只留最新一个）

  function desiredName() {
    return layers.overlay || layers.work || layers.base
  }

  function playLoop(name, force) {
    if (!pet.state) return
    if (pet.current === name && !force) return
    if (name !== 'Talk') { talkLock = false; pendingOverlay = null }
    pet.afterOverlay = null
    pet.current = name
    pet.segment = null
    pet.pingpong = null
    pet.state.setAnimation(0, name, true)
  }

  // 循环区间 / 循环模式 / 思考参数 / Happy 概率见 anim/library.js

  function startAnimation(name) {
    if (name !== 'Special_B') pet.think = null
    if (name === 'Talk') return playTalkOnce()
    var mode = LOOP_MODES[name]
    if (mode === 'thinkcycle') return startThinking()
    if (mode === 'pingpong') return playPingPong(name)
    return playLoop(name, true)
  }

  // 思考循环：intro(0→from) → nod(from↔to 随机时长) → outro(→dur) → 回到 intro
  function startThinking() {
    if (!pet.state) return
    playLoop('Special_B', true)
    var entry = pet.state.getCurrent(0)
    if (!entry || !entry.animation) return
    var dur = entry.animation.duration
    var r = LOOP_RANGES.Special_B || { from: 0, to: dur }
    var from = Math.min(Math.max(0, r.from), dur - 0.12)
    var to = Math.min(Math.max(from + 0.05, r.to), dur - 0.002)
    entry.timeScale = 0
    entry.trackTime = 0
    entry.animationLast = 0
    pet.pingpong = null
    pet.think = { stage: 'intro', phase: 0, dir: 1, from: from, to: to, dur: dur, nodUntil: 0 }
    log('think cycle', from.toFixed(2) + '–' + to.toFixed(2), '/ dur', dur.toFixed(2))
  }

  // 乒乓循环：entry.timeScale = 0，由 frame() 手动推进相位，到端点反向。
  // 不用负 timeScale —— 3.8 的 getAnimationTime() 对负值取模会出界。
  // 支持区间：只在 [from, to] 内来回（区间为空时用整段）。
  function playPingPong(name) {
    if (!pet.state) return
    playLoop(name, true)
    var entry = pet.state.getCurrent(0)
    if (!entry || !entry.animation) return
    var dur = Math.max(0.05, entry.animation.duration - 0.002)
    var r = LOOP_RANGES[name]
    var from = r && r.from >= 0 && r.from < dur ? r.from : 0
    var to = r && r.to > from + 0.05 && r.to <= dur ? r.to : dur
    entry.timeScale = 0
    entry.trackTime = from
    entry.animationLast = from
    pet.pingpong = { name: name, from: from, to: to, phase: from, dir: 1 }
    log('pingpong ->', name, from.toFixed(2) + '–' + to.toFixed(2) + 's')
  }

  function syncAnimation(force) {
    if (!pet.state) return
    if (deps.getStartupHold()) return // 开屏空档期：保持当前姿势
    var want = desiredName()
    // Talk 期间**强制播完**：状态变化先挂起，等这一遍说完再切
    if (talkLock && want !== 'Talk') return
    if (!force && pet.current === want) return
    startAnimation(want)
  }

  // Talk 是"表演型"动画：播完一遍再从头播，不在最后一帧硬接第一帧。
  // 并且在播放期间锁住状态切换（talkLock），避免输出中断/工具事件把它掐断。
  function playTalkOnce() {
    if (!pet.state) return null
    pet.current = 'Talk'
    pet.segment = null
    pet.pingpong = null
    pet.afterOverlay = null
    talkLock = true
    var entry = pet.state.setAnimation(0, 'Talk', false)
    if (!entry) { talkLock = false; syncAnimation(true); return null }
    entry.listener = {
      complete: function (trackEntry) {
        if (trackEntry && trackEntry.animation && trackEntry.animation.name !== 'Talk') return
        talkLock = false
        if (layers.work === 'Talk') { playTalkOnce(); return } // 还在输出 → 再完整播一遍
        // 播完后再兑现期间被挂起的覆盖动画（如工具成功/失败）
        if (pendingOverlay) {
          var next = pendingOverlay
          pendingOverlay = null
          playOverlay(next)
          return
        }
        syncAnimation(true)
      },
    }
    return entry
  }

  // Interact 前后两段：切点由常量 INTERACT_SPLIT 决定（2.10s = 第 63 帧，动作回正处）
  function segmentRange(index) {
    var d = pet.interactDuration || 5.93
    var cut = Math.min(Math.max(0.4, INTERACT_SPLIT), d - 0.4)
    if (index === 0) return { from: 0, to: cut }
    return { from: cut, to: d }
  }

  function playSegment() {
    if (!pet.state) return null
    var ensureAudio = getAudioEnsure()
    if (ensureAudio) ensureAudio() // 用户手势里顺手解锁音频
    deps.setStartupHold(false) // 用户点击优先，解除开屏空档保持
    // 开屏演出是强制播放的，这里不取消
    // 用户点击是显式意图：允许打断 Talk
    talkLock = false
    pendingOverlay = null
    var play = getPlaySound()
    if (play) play('click')
    var index = Math.random() < 0.5 ? 0 : 1
    var range = segmentRange(index)
    pet.current = 'Interact'
    pet.afterOverlay = null
    pet.pingpong = null
    layers.overlay = 'Interact'
    var entry = pet.state.setAnimation(0, 'Interact', false)
    if (!entry) { layers.overlay = null; syncAnimation(true); return null }
    entry.trackTime = range.from
    entry.animationLast = range.from
    pet.segment = { entry: entry, to: range.to, index: index }
    log('segment', index === 0 ? 'A' : 'B', range.from.toFixed(2) + '-' + range.to.toFixed(2) + 's')
    return entry
  }

  // 一次性覆盖动画（Happy / Sad_Begin / Special_A …）
  function playOverlay(name, after) {
    if (!pet.state) return null
    deps.setStartupHold(false)
    // Talk 播放中：不打断，先把覆盖动画挂起（只留最新）
    if (talkLock) { pendingOverlay = name; log('overlay queued ->', name); return null }
    layers.overlay = name
    pet.current = name
    pet.pingpong = null
    pet.afterOverlay = typeof after === 'function' ? after : null
    var entry = pet.state.setAnimation(0, name, false)
    if (!entry) {
      layers.overlay = null
      pet.afterOverlay = null
      syncAnimation(true)
      return null
    }
    entry.listener = {
      complete: function (trackEntry) {
        if (trackEntry && trackEntry.animation && trackEntry.animation.name !== name) return
        if (layers.overlay !== name) return
        layers.overlay = null
        var next = pet.afterOverlay
        pet.afterOverlay = null
        if (next) { next(); return }
        syncAnimation(true)
      },
    }
    log('overlay ->', name)
    return entry
  }

  function endSegment() {
    pet.segment = null
    if (layers.overlay === 'Interact') layers.overlay = null
    syncAnimation(true)
  }

  function isIdle() {
    return !layers.overlay && !layers.work && !talkLock && !pet.segment && !pet.pingpong
  }

  // 开屏演出要强制插播：清掉 Talk 锁与挂起的覆盖动画
  function resetLocks() {
    talkLock = false
    pendingOverlay = null
  }

  return {
    layers: layers,
    desiredName: desiredName,
    playLoop: playLoop,
    startAnimation: startAnimation,
    startThinking: startThinking,
    playPingPong: playPingPong,
    syncAnimation: syncAnimation,
    playTalkOnce: playTalkOnce,
    segmentRange: segmentRange,
    playSegment: playSegment,
    playOverlay: playOverlay,
    endSegment: endSegment,
    isIdle: isIdle,
    resetLocks: resetLocks,
  }
}
