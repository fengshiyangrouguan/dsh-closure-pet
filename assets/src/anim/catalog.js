// 注册表：基础状态与 one-shot 事件。
// 事件名描述事实；视频只是绑定。通知类挂在事件上。

import {
  CreditedNotice,
  ValleyTimeNotice,
  PeakTimeNotice,
  LowBalanceNotice,
  InterruptedNotice,
  ErrorNotice,
  ToolFailNotice,
  InteractNotice,
  IdleChatterNotice,
} from './notices.js'

export const BASE_STATES = {
  idle: {
    loop: 'Idle',
    enter: null,
    exit: null,
  },
  sad: {
    loop: 'Sad_Idle',
    enter: 'Sad_Begin',
    exit: 'Sad_Exit',
  },
  think: {
    loop: 'Think_Idle',
    enter: 'Think_Begin',
    exit: 'Think_Exit',
  },
}

export const EVENTS = {
  lowBalance: {
    videos: [],
    textOnly: true,
    priority: 20,
    queue: true,
    notice: new LowBalanceNotice(),
  },

  'tool-success': {
    videos: ['Happy'],
    priority: 30,
    queue: false,
    notice: null,
  },

  talk: {
    videos: ['Talk'],
    priority: 60,
    queue: true,
    persistent: true,
    notice: null,
  },

  'tool-fail': {
    videos: [{ clip: 'Sad_Begin', from: 0.4, to: 1.8 }],
    priority: 70,
    queue: true,
    // 固定格式“工具调用失败：工具名”，不开放文案配置。
    notice: new ToolFailNotice(),
  },

  'turn-interrupted': {
    videos: [{ clip: 'Sad_Begin', from: 0.4, to: 1.8 }],
    priority: 70,
    queue: false,
    notice: new InterruptedNotice(),
  },

  error: {
    videos: [{ clip: 'Sad_Begin', from: 0.4, to: 1.8 }],
    priority: 70,
    queue: true,
    notice: new ErrorNotice(),
  },

  valley_time: {
    videos: ['Happy'],
    priority: 75,
    queue: true,
    notice: new ValleyTimeNotice(),
  },

  peak_time: {
    videos: [{ clip: 'Sad_Begin', from: 0.4, to: 1.8 }],
    priority: 75,
    queue: true,
    notice: new PeakTimeNotice(),
  },

  interact: {
    videos: ['Interact_1', 'Interact_2'],
    priority: 80,
    queue: false,
    fadeIn: 320,
    fadeOut: 320,
    notice: new InteractNotice(),
  },

  credited: {
    videos: ['Celebrate'],
    priority: 100,
    queue: false,
    fadeIn: 320,
    notice: new CreditedNotice(),
  },

  idleChatter: {
    videos: ['Talk'],
    priority: 0,
    queue: false,
    notice: new IdleChatterNotice(),
  },
}

export function getBase(name) {
  return BASE_STATES[name] || null
}

export function getEvent(name) {
  return EVENTS[name] || null
}

export function eventNames() {
  return Object.keys(EVENTS)
}
