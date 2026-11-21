// dsh-closure-pet — 宿主入口：只做装配
//
// 具体实现：
//   store.js   运行时状态 / 花费 / 持久化 / 余额轮询
//   events.js  DSH 事件订阅
//   routes.js  HTTP 路由与静态资源
//   period.js  峰谷时段（纯函数）
//   billing.js 计费（纯函数）

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createStore } from './store.js'
import { registerEvents } from './events.js'
import { createRoutes } from './routes.js'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSET_ROOT = path.join(PACKAGE_ROOT, 'assets')
const PLUGIN_NAME = 'dsh-closure-pet'

/** 插件行 id（与 package.json / cordis.patch.yml 一致） */
export const name = PLUGIN_NAME

/** 路由与源校验需要 webServer，桌面 Helper 的站点地址需要 connection。 */
export const inject = ['webServer', 'connection']

/** Host 半侧插件主体：服务就绪后注册路由与事件。 */
export function apply(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const store = createStore({ dshHome })
  store.loadConfig()

  // 事件订阅挂在 root 上，插件卸载时由 root 上下文统一释放。
  registerEvents(root, store)

  // inject 已保证 webServer / connection 就绪，这里直接注册，不再绕 root.inject。
  createRoutes({
    ctx: root,
    store,
    packageRoot: PACKAGE_ROOT,
    assetRoot: ASSET_ROOT,
    pluginName: PLUGIN_NAME,
    version: pkg.version,
  })
}
