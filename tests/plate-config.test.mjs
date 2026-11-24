import test from 'node:test'
import assert from 'node:assert/strict'

import { SETTINGS_DEFAULTS } from '../assets/src/shared/protocol.js'
import { createState } from '../assets/src/io/state.js'

const noop = () => {}

test('宿主配置恢复硬件挂牌开关与位置，并通知挂牌', async () => {
  globalThis.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      settings: { plate: true, platePosition: 'top' },
    }),
  })
  const settings = { ...SETTINGS_DEFAULTS }
  let applied = 0
  const state = createState({
    runtime: {},
    refreshBubble: noop,
    scheduleStartup: noop,
    settings,
    saveSettings: noop,
    layout: noop,
    repositionForAnchor: noop,
    resolveFlip: noop,
    applyOpacity: noop,
    applyPlate: () => { applied++ },
    isBubbleShown: () => false,
  })
  state.loadHostConfig()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(settings.plate, true)
  assert.equal(settings.platePosition, 'top')
  assert.equal(applied, 1)
})
