# dsh-closure-pet

《明日方舟》可露希尔卫戍协议皮肤的 DeepSeek Harness 桌宠插件：动画交互、像素气泡、余额与花费提示。

> 仅个人自用。**不得二次分发**。字体使用 Ark Pixel（SIL OFL 1.1，见 `assets/fonts/OFL.txt`）。

## 结构

```
lib/index.js                  宿主侧：注入、/state、/config、/assets 路由、计费
assets/pet.js                 浏览器侧：渲染、状态机、气泡、音效、设置面板
assets/spine/                 模型（json / atlas / png）
assets/vendor/                Spine 3.8 官方运行时（webgl / canvas）
assets/fonts/                 Ark Pixel 12px + OFL
assets/audio/                 click / fail / coin / turnfail（Opus 56k）
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
| `assets/pet.js`、模型、字体、音效 | 页面 **Ctrl+R** |
| `lib/index.js` | 插件管理里关→开（重新 import 模块） |
| `cordis.patch.yml`（注入行变化） | 重启 DSH |

调试接口挂在 `window.__dshClosurePet`：`play(name)`、`showBubble()`、`settings`、`layers`、`debug`、`startup` 等。

## 动画状态机

| 层 | 用途 |
|---|---|
| `overlay` | 一次性动画：Happy / Sad_Begin / Special_A / Interact |
| `work` | 进行中：Special_B（思考，循环节 1.59–2.10s）/ Talk（输出，强制播完） |
| `base` | 常态：Idle / Sad_Idle（余额偏低） |

触发源：`agent/assistant-stream`、`tools/result`、`agent/error`、`agent/status`、`session/event`（`assistant/message` 计费、`turn/end` 结束）、账户余额（60s 轮询）。

## 开屏演出

首次拿到 `/state` 后等待 **5 秒**（`localStorage['dshcl-startup-delay']` 可改），随后**强制插播**一遍，即使此刻正在思考或输出也会被打断：

1. 峰谷：谷价播 `Special_A`、峰价播 `Sad_Begin`，并出对应文案
2. 间隔 2 秒（`dshcl-startup-gap`）后，余额偏低再播 `Sad_Begin` + 催款文案
3. 演完自动回到原本的工作层（思考/说话）或基础层

## 设置

设置面板（右键桌宠 → 设置）：镜像、大小、气泡、透明度、音效开关与音量。持久化到 `$DSH_HOME/.dshcl.json`（`settings` 与当日 `spend`）。

## 性能

- 空闲（仅基础层）渲染 **30fps**，工作和交互时 60fps
- 页面隐藏时停止渲染，状态轮询从 1s 降到 5s
- 像素气泡按需创建；文本测量有缓存

## 渲染降级

优先 WebGL（`SceneRenderer`）；拿不到 WebGL 上下文时自动切到 **canvas 2D**（`spine-canvas` 的 `SkeletonRenderer`，三角形模式以支持网格附件）。

- 自动：远程桌面 / 老显卡 / 浏览器禁用 WebGL 时
- 手动验证：地址栏加 `?canvas=1`，或控制台 `localStorage.setItem('dshcl-force-canvas','1')` 后刷新
- 降级模式下命中测试改用 `getImageData` 采样，其余行为（拖拽、气泡、贴画）一致

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
