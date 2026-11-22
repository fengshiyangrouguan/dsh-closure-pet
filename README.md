# dsh-closure-pet

基于《明日方舟》游戏截图二次创作的可露希尔桌宠，运行在 DeepSeek Harness 界面上：透明动画、像素气泡、余额与花费提示。

> **声明**：本插件是个人二次创作，角色形象取自游戏截图，角色形象权利归原权利人；动画为本项目自行制作的透明视频，音效借用自游戏内音效（权利归原权利人）。
> 本插件的代码可按 MIT 许可证使用；角色形象、音效与动画不在 MIT 授权范围内，仅限个人本机娱乐使用，再分发前请自行确认权利。字体使用 Ark Pixel（SIL OFL 1.1，见 `assets/fonts/OFL.txt`）。完整说明见 [`NOTICE.md`](NOTICE.md)。

## 结构

```
lib/index.js                  宿主入口：装配（store / events / routes）
lib/store.js                  运行时状态、花费累计、持久化、余额轮询
lib/events.js                 DSH 事件订阅（session/event、agent/*、tools/result）
lib/routes.js                 /ping、/state、/config、/assets/*
lib/period.js                 峰谷时段（纯函数，北京时间）
lib/billing.js                计费价目与单条消息花费（纯函数）
lib/client.js                 客户端 bundle（esbuild 打包，自包含，注册到 shell.overlay）
assets/src/                   前端源码（打包进 lib/client.js，不直接由宿主提供）
  client-entry.js             客户端 bundle 入口：factory / slot 注册
  main.js                     组合根：DOM、位置、交互、装配
  core/env.js                 常量 / 日志
  core/settings.js            设置读写与持久化
  shared/protocol.js          前后端共享协议（版本 / 路径 / 设置归一化）
  render/hit-test.js          静态命中区（图元 → 128×108 掩码）
  render/video-player.js      透明视频播放：A/B 双缓冲 + 交叉淡化
  anim/library.js             片段表（路径 / 时长 / 循环 / 节奏参数）
  anim/director.js            动画导演（分层状态机 / 分段 / Talk 锁 / 思考掷骰）
  audio.js                    音效（工厂）
  ui/layout.js                位置 / 吸附 / 翻转（工厂）
  ui/panel.js                 设置面板（工厂）
  ui/bubble.js                像素气泡（工厂）
  ui/sticker.js               谷价贴画（工厂）
  input/drag.js               点击 / 拖拽 / 右键（工厂）
  io/state.js                 宿主状态轮询 + applyState 事件分发
assets/video/                 9 段透明动画（888×748，WebM VP9-alpha）
assets/fonts/                 Ark Pixel 12px + OFL
assets/audio/                 click / fail / coin / turnfail（Opus 56k）
tests/                        node --test 用例（宿主纯函数 / 前端模块 / DOM 桩接线）
docs/state-machine.md         状态机 v3 设计稿（三基础 loop + Begin 转场 + one-shot 事件）
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

## 开发

| 改动 | 生效方式 |
|---|---|
| `assets/src/**` | `npm run build:client` 后页面 **Ctrl+R** |
| `assets/video/**`、`assets/audio/**`、字体 | 页面 **Ctrl+R** |
| `lib/index.js` | 插件管理里关→开（重新 import 模块） |
| `lib/client.js` | 由 `npm run build:client` 生成，不手改 |
| `cordis.patch.yml` | 重启 DSH |

> 客户端 bundle 由 DSH 以 `/plugins/dsh-closure-pet/client.js` 提供，热启用/停用无需刷新页面；改了源码就要先重新构建 bundle，再 Ctrl+R。

测试（零依赖，Node 内置 runner）：

```bash
node --test "tests/*.test.mjs"   # 或 npm test
```

- `tests/host-pure.test.mjs`：峰谷/节假日、计费、北京时间归日
- `tests/frontend-pure.test.mjs`：常量、设置合并、静态命中区、片段表、音效/布局工厂
- `tests/frontend-wiring.test.mjs`：DOM 桩下创建面板/气泡/贴画/导演/状态/拖拽，验证依赖注入与监听注册
- `tests/state-machine.test.mjs`：状态机全量回归（base / work / overlay 的所有衔接）
- `tests/video-player.test.mjs`：同名覆盖动画播完后再次触发必须从头重启并重新触发 ended
- `tests/client-artifact.test.mjs`：`lib/client.js` 是自包含 bundle，注册 `shell.overlay` 且不依赖注入回退

调试接口挂在 `window.__dshClosurePet`：`play(name)`、`showBubble()`、`settings`、`layers`、`debug`、`startup`、`dispose()` 等。

## 客户端插件

只有一条加载路径：`package.json` 的 `dsh.client` 把 `lib/client.js` 注册为客户端 bundle，DSH 以 `/plugins/dsh-closure-pet/client.js` 提供并执行它；bundle 自己把组件注册到 `shell.overlay`（frame-wide 浮层），组件挂载时调用 `startPet()` 创建桌宠，卸载时调用返回的 `dispose()`。

- 不再有 `webserver/index-inject` 注入行，也不再有 `/pet.js` 回退路径；
- bundle 是自包含的，不从宿主路由动态 import 前端代码，热启用不依赖宿主路由时序；
- `window.__dshClosurePet` 仍是调试入口，`dispose()` 可手动卸载（停视频、清定时器、移除监听与 DOM）。

## 动画状态机

目标模型是 v3.1（注册式基座，重构中；当前 2.0.1 仍是旧分层实现，完成后替换）：

- 基础状态注册：`idle` / `sad` / `think`，每个状态自带 loop、enter 槽、exit 槽；以后加新状态只注册，不改核心分支。
- 三种基础状态之间的进入/退出全部由 `Sad_Begin` / `Think_Begin` 完成：正放进入，倒放退出；Sad ↔ Think 经 Idle 中转。
- 需要两段转场的跨状态由底层自动倍速；离开 Idle 前要求 Idle 完整播完一轮。
- 事件注册：事件名描述事实，视频可以一个或多个、均匀随机。例如 `credited → celebrate`、`valley_time → happy`、`peak_time → sad_begin（一段难过表情）`、`turn-interrupted → sad_begin`、`interact → interact_1 / interact_2`。
- 每个事件带一个 `notice` 类实例：可以在 `build(ctx)` 里查询余额/峰谷、拼动态富文本、按状态选对话池；通知不再单独注册。
- `lowBalance` 也是普通 one-shot：20 优先级、排队、暂时没有动画（`textOnly`），`LowBalanceNotice` 只发通知、不改任何动画状态。
- 闲时对话 `idleChatter` 也是 one-shot：绑定 `talk`、0 优先级、不排队；`IdleChatterNotice` 按当前 base 从 Idle / Sad_Idle / Think_Idle 的独立池里随机。
- 事件进入一律交叉淡化；同优先级排队，低优先级事件可按注册配置是否排队；事件结束回 base 时播目标状态的 enter，没有 enter 就跳过。
- 思考不再掷骰、不再播完整 `Special_B`：`Special_B` 已拆成 `think_Begin` + `think_Idle`，原段仅作素材备份。
- 不再有 `talkLock`、`startupHold`、`enteringSad`、`afterOverlay` 这些跨函数标志；只有一个 active 片段、一个 `seq`、一个纯 `resolve()`。

完整设计、注册表、优先级、设置页与测试矩阵见 [docs/state-machine.md](docs/state-machine.md)。

触发源：`agent/assistant-stream`、`tools/result`、`agent/error`、`agent/status`、`session/event`（`assistant/message` 计费、`turn/end` 结束）、账户余额（60s 轮询）。

## 开屏演出

开屏不是独立事件，而是 **峰谷价在启动时的一次检定**：首次拿到 `/state` 后等待 5 秒（`localStorage['dshcl-startup-delay']` 可改），随后触发 `peak_time` / `valley_time`，走和运行中完全相同的事件路径，没有单独的 startup 事件层。

1. 峰价播 `peak_time`（一段 `sad_begin` 难过表情），谷价播 `valley_time`（`happy`）；
2. 余额偏低：`lowBalance` 作为 20 优先级、排队的 textOnly 事件出队，只发催款文本；
3. 演完按最新目标回到 `Idle` / `Sad_Idle` / `Think_Idle`，不再有 2 秒空档和 `startupHold`。

## 设置

右键桌宠 → 设置保留高频项：镜像、大小、吸附强度（0%–200%，0% 关闭）、气泡开关、气泡大小（50%–200%，100% 为基准）、更多层次的字体视觉效果（分级排版，默认开）、透明度、音效开关与音量。

目标模型另开独立的「可露希尔桌宠」设置页，放低频项：余额不足阈值、开屏延迟、按**基础状态分开**的闲时对话池（Idle / Sad_Idle / Think_Idle 各一份，不合并），以及按事件分的事件对话池；每份列表用 `+` 添加多条，触发时均匀随机。持久化到 `$DSH_HOME/.dshcl.json`（`settings` 与当日 `spend`）。

## 拖拽

按住桌宠后，页面交互会一直冻结到松手：文字选不中、图片/链接拖不走、下面的元素不 hover 也不会被点穿，指针滑过 iframe 也不会被里面的文档抢走。

实现见 `assets/src/input/drag.js` 的 `beginDragLock` / `endDragLock`：

- 命中桌宠的 `pointerdown`（window 捕获阶段）直接 `preventDefault + stopImmediatePropagation`（选区/焦点/原生拖拽都是这次按下的默认动作，页面也收不到这次按下）
- 按下到松手之间，在捕获阶段拦掉 `mousedown` / `selectstart` / `dragstart`（`pointerdown` 的 `preventDefault` 不保证压掉兼容的 `mousedown`）
- `<html>` 加 `dshcl-dragging`：`user-select:none` + `cursor:grabbing`
- 铺一层透明挡板 `#dsh-closure-pet-drag-shield` 吃掉指针命中
- 松手后吞掉浏览器合成的那一次 `click`（只吞一次，任何新的按下即撤销），避免拖到按钮/链接上松手就点出去
- 窗口失焦 / 切后台 / `pointercancel` 会自动收尾，挡板不会残留

## 性能

- 角色不再逐帧绘制：视频由浏览器解码，主线程只处理位置与交互
- 换片段走双缓冲：前台继续播，后台加载，就绪后再淡化，避免加载空档
- 页面隐藏时暂停视频，状态轮询从 1s 降到 5s
- 像素气泡按需创建；文本测量有缓存
- 命中测试用**静态命中区**（11 个图元 → 128×108 掩码），按下只查表、不读 GPU

## 峰谷时段维护

规则：工作日 09:00–12:00、14:00–18:00 为峰价；其余时间、周末、法定节假日全天谷价，全部按北京时间判定。

节假日表在 `lib/index.js` 的 `HOLIDAY_RANGES`（闭区间），当前收录 2026 全年与 2027 推定日期：

- 官方每年 11 月左右公布下一年调休安排，公布后按实际日期改这两个年份的区间即可
- 未收录的年份只会按“工作日 + 周末”计算（不会算错价，只是少认出节假日）
- `/state` 里的 `holidaysOutdated` 表示当前年份不在表内，可用于提醒更新

## 卸载

1. 在插件管理里关掉（客户端 bundle 会随停用卸载；宿主代码改动才需要重启 DSH）
2. 从 profile 的 `dependencies` 与 `dsh.profile.bundles` 里移除
3. 可选：删掉 `$DSH_HOME/.dshcl.json`（设置与当日花费统计）

前端没有常驻定时器跨页面残留；宿主侧的定时器与路由会在插件销毁时通过 `ctx.effect` 释放。

## 计费口径

`assistant/message` 的 `usage` → `cacheRead×谷/峰价 + input×未命中价 + output×输出价`，价目内置于 `lib/index.js`（每百万 token，`[谷价, 峰价]`）。峰谷按北京时间：周末与节假日全天谷价，工作日 09–12、14–18 为峰时。

## 贡献

- **IPC-Wolf**（<https://github.com/IPC-Wolf>）：拖动时气泡实时跟随与命中区 grab 光标；气泡分级排版、气泡缩放 100% 基准与使用源脚注；边缘吸附强度可调（0%–200%）。
