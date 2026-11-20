# dsh-closure-pet

《明日方舟》可露希尔卫戍协议皮肤的 DeepSeek Harness 桌宠插件：动画交互、像素气泡、余额与花费提示。

> 仅个人自用。**不得二次分发**。字体使用 Ark Pixel（SIL OFL 1.1，见 `assets/fonts/OFL.txt`）。

## 结构

```
lib/index.js                  宿主入口：装配（store / events / inject / routes）
lib/store.js                  运行时状态、花费累计、持久化、余额轮询
lib/events.js                 DSH 事件订阅（session/event、agent/*、tools/result）
lib/inject.js                 index 注入行
lib/routes.js                 /ping、/pet.js、/state、/config、/assets/*、/src/*
lib/period.js                 峰谷时段（纯函数，北京时间）
lib/billing.js                计费价目与单条消息花费（纯函数）
client.js                     客户端插件产物：注册到 shell.overlay，动态加载 /src/main.js
assets/pet.js                 浏览器入口：动态 import 模块图（经典脚本，兼容旧注入行）
assets/src/                   前端 ES modules
  main.js                     组合根：DOM、渲染循环、状态机、轮询、开屏、实例装配
  core/env.js                 常量 / 日志
  core/settings.js            设置读写与持久化
  shared/protocol.js          前后端共享协议（版本 / 路径 / 设置归一化）
  render/hit-test.js          静态命中区（图元 → 128×108 掩码）
  anim/library.js             动画数据表（循环区间 / 模式 / 参数）
  anim/director.js            动画导演（分层状态机 / 分段 / Talk 锁 / 思考与乒乓）
  audio.js                    音效（工厂）
  ui/layout.js                位置 / 吸附 / 翻转（工厂）
  ui/panel.js                 设置面板（工厂）
  ui/bubble.js                像素气泡（工厂）
  ui/sticker.js               谷价贴画（工厂）
  input/drag.js               点击 / 拖拽 / 右键（工厂）
  io/state.js                 宿主状态轮询 + applyState 事件分发
assets/spine/                 模型（json / atlas / png）
assets/vendor/                Spine 3.8 官方运行时（webgl / canvas）
assets/fonts/                 Ark Pixel 12px + OFL
assets/audio/                 click / fail / coin / turnfail（Opus 56k）
tests/                        node --test 用例（宿主纯函数 / 前端模块 / DOM 桩接线）
cordis.patch.yml              bundle 入口
```

## 安装

### 从仓库安装（推荐）

在 Plugins → Add plugin 里填仓库地址：

```
https://github.com/fengshiyangrouguan/dsh-closure-pet
```

或手动在 profile 的 `package.json` 加依赖，并把插件名加进 `dsh.profile.bundles`：

```json
"dsh-closure-pet": "github:fengshiyangrouguan/dsh-closure-pet"
```

### 本地开发安装

```json
"dsh-closure-pet": "link:<本地路径>/dsh-closure-pet"
```

同样需要把 `dsh-closure-pet` 放进 `dsh.profile.bundles`。

> ⚠️ 本仓库随包带有游戏素材（Spine 模型 / 音效），请把仓库设为 **private**，不要公开分发，详见 `NOTICE.md`。

## 开发

| 改动 | 生效方式 |
|---|---|
| `assets/src/**`、模型、字体、音效 | 页面 **Ctrl+R** |
| `assets/pet.js`（入口，基本不动） | 页面 **Ctrl+R** |
| `lib/index.js` | 插件管理里关→开（重新 import 模块） |
| `cordis.patch.yml`（注入行变化） | 重启 DSH |

> 新增了 `/dsh-closure/src/*` 路由（把 `assets/src/` 暴露给浏览器做 ES module 解析）。从旧版本升级后需要把插件**关→开一次**，再 Ctrl+R；宿主只在加载时注册一次路由。

测试（零依赖，Node 内置 runner）：

```bash
node --test "tests/*.test.mjs"   # 或 npm test
```

- `tests/host-pure.test.mjs`：峰谷/节假日、计费、北京时间归日
- `tests/frontend-pure.test.mjs`：常量、设置合并、静态命中区、动画表、音效/布局工厂
- `tests/frontend-wiring.test.mjs`：DOM 桩下创建面板/气泡/贴画/导演/状态/拖拽，验证依赖注入与监听注册

调试接口挂在 `window.__dshClosurePet`：`play(name)`、`showBubble()`、`settings`、`layers`、`debug`、`startup`、`dispose()` 等。

## 客户端插件与回退

插件有两条加载路径，同一时刻只会生效一条：

1. **客户端插件**（`client.js` + `package.json` 的 `dsh.client`）：DSH 客户端加载器把组件注册到 `shell.overlay`（frame-wide 浮层）；组件挂载时创建容器并动态 `import('/dsh-closure/src/main.js')`，卸载时调用 `__dshClosurePet.dispose()`。加载成功后设置 `window.__dshClosurePetClientActive`。
2. **注入行回退**（`lib/inject.js`）：客户端插件没加载（版本不匹配、加载失败）时，仍通过 `webserver/index-inject` 注入 `/pet.js`；检测到上面的标志就跳过，避免双开。

桌宠 DOM 挂到客户端插件提供的容器里；没有容器时退回 `document.body`。`window.__dshClosurePet.dispose()` 可手动卸载（停 rAF、清定时器、移除监听与 DOM）。

## 动画状态机

| 层 | 用途 |
|---|---|
| `overlay` | 一次性动画：Happy / Sad_Begin / Special_A / Interact |
| `work` | 进行中：Special_B（思考，循环节 1.59–2.10s）/ Talk（输出，强制播完） |
| `base` | 常态：Idle / Sad_Idle（余额偏低） |

触发源：`agent/assistant-stream`、`tools/result`、`agent/error`、`agent/status`、`session/event`（`assistant/message` 计费、`turn/end` 结束）、账户余额（60s 轮询）。

## 开屏演出

首次拿到 `/state` 后等待 **10 秒**（`localStorage['dshcl-startup-delay']` 可改），随后**强制插播**一遍，即使此刻正在思考或输出也会被打断：

1. 峰谷：谷价播 `Special_A`、峰价播 `Sad_Begin`，并出对应文案
2. 间隔 2 秒（`dshcl-startup-gap`）后，余额偏低再播 `Sad_Begin` + 催款文案
3. 演完自动回到原本的工作层（思考/说话）或基础层

## 设置

设置面板（右键桌宠 → 设置）：镜像、大小、气泡开关、气泡大小（50%–200%，100% 为基准）、更多层次的字体视觉效果（分级排版，默认开）、透明度、音效开关与音量。持久化到 `$DSH_HOME/.dshcl.json`（`settings` 与当日 `spend`）。

## 拖拽

按住桌宠后，页面交互会一直冻结到松手：文字选不中、图片/链接拖不走、下面的元素不 hover 也不会被点穿，指针滑过 iframe 也不会被里面的文档抢走。

实现见 `assets/pet.js` 的 `beginDragLock` / `endDragLock`：

- 命中桌宠的 `pointerdown`（window 捕获阶段）直接 `preventDefault + stopImmediatePropagation`（选区/焦点/原生拖拽都是这次按下的默认动作，页面也收不到这次按下）
- 按下到松手之间，在捕获阶段拦掉 `mousedown` / `selectstart` / `dragstart`（`pointerdown` 的 `preventDefault` 不保证压掉兼容的 `mousedown`）
- `<html>` 加 `dshcl-dragging`：`user-select:none` + `cursor:grabbing`
- 铺一层透明挡板 `#dsh-closure-pet-drag-shield` 吃掉指针命中
- 松手后吞掉浏览器合成的那一次 `click`（只吞一次，任何新的按下即撤销），避免拖到按钮/链接上松手就点出去
- 窗口失焦 / 切后台 / `pointercancel` 会自动收尾，挡板不会残留

## 性能

- 空闲（仅基础层）渲染 **30fps**，工作和交互时 60fps
- 页面隐藏时停止渲染，状态轮询从 1s 降到 5s
- 像素气泡按需创建；文本测量有缓存
- 命中测试用**静态命中区**（11 个图元 → 128×108 掩码），按下只查表、不读 GPU；`preserveDrawingBuffer` 已关闭
- WebGL 关闭 MSAA（`antialias:false`）：像素画看不出差别，省掉每帧 4× 采样与 resolve

## 渲染降级

优先 WebGL（`SceneRenderer`）；拿不到 WebGL 上下文时自动切到 **canvas 2D**（`spine-canvas` 的 `SkeletonRenderer`，三角形模式以支持网格附件）。

- 自动：远程桌面 / 老显卡 / 浏览器禁用 WebGL 时
- 手动验证：地址栏加 `?canvas=1`，或控制台 `localStorage.setItem('dshcl-force-canvas','1')` 后刷新
- 降级模式下命中测试仍是同一个静态命中区（与渲染模式无关），拖拽、气泡、贴画行为一致

## 峰谷时段维护

规则：工作日 09:00–12:00、14:00–18:00 为峰价；其余时间、周末、法定节假日全天谷价，全部按北京时间判定。

节假日表在 `lib/index.js` 的 `HOLIDAY_RANGES`（闭区间），当前收录 2026 全年与 2027 推定日期：

- 官方每年 11 月左右公布下一年调休安排，公布后按实际日期改这两个年份的区间即可
- 未收录的年份只会按“工作日 + 周末”计算（不会算错价，只是少认出节假日）
- `/state` 里的 `holidaysOutdated` 表示当前年份不在表内，可用于提醒更新

## 卸载

1. 在插件管理里关掉（注入行要**重启 DSH** 才会消失，桌面端会缓存注入）
2. 从 profile 的 `dependencies` 与 `dsh.profile.bundles` 里移除
3. 可选：删掉 `$DSH_HOME/.dshcl.json`（设置与当日花费统计）

前端没有常驻定时器跨页面残留；宿主侧的定时器与路由会在插件销毁时通过 `ctx.effect` 释放。

## 计费口径

`assistant/message` 的 `usage` → `cacheRead×谷/峰价 + input×未命中价 + output×输出价`，价目内置于 `lib/index.js`（每百万 token，`[谷价, 峰价]`）。峰谷按北京时间：周末与节假日全天谷价，工作日 09–12、14–18 为峰时。
