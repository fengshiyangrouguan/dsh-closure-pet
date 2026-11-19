// dsh-closure-pet — 宿主入口：只做装配
//
// 具体实现：
//   store.js   运行时状态 / 花费 / 持久化 / 余额轮询
//   events.js  DSH 事件订阅
//   inject.js  index 注入行
//   routes.js  HTTP 路由与静态资源
//   period.js  峰谷时段（纯函数）
//   billing.js 计费（纯函数）

import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createStore } from './store.js'
import { registerEvents } from './events.js'
import { registerInject } from './inject.js'
import { createRoutes } from './routes.js'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSET_ROOT = path.join(PACKAGE_ROOT, 'assets')
const PLUGIN_NAME = 'dsh-closure-pet'
const PLUGIN_VERSION = '1.0.0'

export default {
  name: PLUGIN_NAME,

  apply(root) {
    const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
    const store = createStore({ dshHome })
    store.loadConfig()

    // 事件订阅挂在 root 上，插件卸载时由 root 上下文统一释放。
    registerEvents(root, store)

    // 注入行：不依赖任何服务，apply() 一开始就注册；disposer 交给 root.effect。
    const disposeInject = registerInject(root)
    root.effect(() => () => {
      try { disposeInject() } catch (err) { /* 忽略：销毁阶段不再抛 */ }
    })

    // 路由与资源：等 webServer / connection 就绪。
    root.inject(['webServer', 'connection'], (ctx) => {
      createRoutes({
        ctx,
        store,
        packageRoot: PACKAGE_ROOT,
        assetRoot: ASSET_ROOT,
        pluginName: PLUGIN_NAME,
        version: PLUGIN_VERSION,
      })
    })
  },
}
