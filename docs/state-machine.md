# 动画状态机 v3.1（注册式基座）

> 状态：设计稿，尚未替换 `assets/src/anim/director.js`。
> 当前发布版 2.0.1 仍是旧的分层实现；本文定义重构目标，后续只按这个基座扩展，不再在旧分支上打补丁。

## 1. 目标

把「播什么、怎么转、什么时候淡入、概率怎么抽」全部收进底层，对外只暴露两类接口：

- **基础状态**：可注册；每个状态自带 loop、enter 槽、exit 槽。
- **一次性事件**：可注册；事件名描述事实，绑定的视频可以是一个或多个，底层负责随机。

上层只做：

```js
setBase('sad')        // 或由 target 推导
fire('credited')      // 事实事件
```

不再直接调用 `play` / `playOverlay` / `syncAnimation`。

## 2. 动画资产

### 2.1 基础 loop

| 状态 key | loop 视频 | 时长 |
|---|---|---:|
| `idle` | `idle.webm` | 1.4667s |
| `sad` | `sad_idle.webm` | 2.1333s |
| `think` | `think_idle.webm` | 2.1333s |

### 2.2 基础转场槽

| 状态 key | enter 槽 | exit 槽 | 说明 |
|---|---|---|---|
| `sad` | `sad_enter.webm`（`Sad_Begin` 正放） | `sad_exit.webm`（倒放） | 1 秒级双向 |
| `think` | `think_enter.webm`（`think_Begin` 正放） | `think_exit.webm`（倒放） | 1.5667s |

`Idle` 没有 enter/exit；它是所有状态的转场 hub。

### 2.3 事件视频

| Spine 动画 | 运行时视频 | 时长 | 用途 |
|---|---|---:|---|
| `Happy` | `happy.webm` | 2.8333s | 峰价、工具成功 |
| `celebrate` | `celebrate.webm` | 2.0s | 到账/谷价/充值 |
| `Talk` | `talk.webm` | 5.0s | 输出 |
| `Interact_1` | `interact_1.webm` | 2.2333s | 点击交互池 |
| `Interact_2` | `interact_2.webm` | 2.1333s | 点击交互池 |
| `Sad_Begin` | `sad_begin.webm` | 2.5667s | 也可作为事件视频，结束在 Sad 姿势 |

`Special_B` 已拆成 `think_Begin` + `think_Idle`，原段只作素材备份，不进入运行时片段表。

## 3. 注册式模型

### 3.1 BaseRegistry

```js
registerBaseState('sad', {
  loop: 'sad_idle',
  enter: 'sad_enter',
  exit: 'sad_exit',
  // 默认经 idle 中转；有直达转场时再写 transitions
  via: 'idle',
})
```

字段：

- `loop`：该状态的循环视频 key；
- `enter` / `exit`：进入/退出槽位的视频 key，底层负责正放/倒放或倍速；
- `via`：默认 `'idle'`，表示任何非直达转场都经过 Idle；
- `transitions`（可选）：`{ otherState: { clip, speed } }`，用于以后加直达转场；
- `priority`：基础状态之间不抢优先级，只做目标推导。

注册时必须校验：

- `loop`、`enter`、`exit` 对应的视频都在片段表里；
- enter/exit 成对存在，否则禁止注册；
- key 唯一。

### 3.2 EventRegistry

```js
registerEvent('credited', {
  videos: ['celebrate'],       // 一个或多个；多个时均匀随机
  priority: 100,
  fadeIn: 320,                 // 事件进入一律交叉淡化
  fadeOut: 0,
  persistent: false,
  notice: new CreditedNotice(),
})

registerEvent('interact', {
  videos: ['interact_1', 'interact_2'],
  priority: 80,
  fadeIn: 320,
  fadeOut: 320,
  notice: new InteractNotice(),
})

registerEvent('talk', {
  videos: ['talk'],
  priority: 60,
  queue: true,
  persistent: true,
  notice: new TalkNotice(),   // 可为 null
})
```

字段：

- `videos`：视频池；元素可以是 `'clip'` 或 `{ clip, from, to }`（复用一段动画，例如 `sad_begin` 的难过表情）；多个时均匀随机；`textOnly:true` 时允许为空；
- `priority`：数字越大越优先；
- `queue`：`true` 表示不抢当前动画、进队列；`false` 表示高优先级可插队、低优先级丢弃；
- `textOnly`：只发通知、不设置任何动画状态；出队即完成，不进入 `CLIP_ENDED`；
- `notice`：一个通知类实例，事件真正开始时调用 `notice.build(ctx)`，返回文本/富文本片段/音效；
- `fadeIn` / `fadeOut`：进入/退出淡化；
- `persistent`：Talk 这类“播完若条件仍在就重播”的事件。

`notice.build(ctx)` 拿到的是只读上下文，可以查询动态信息：

```js
ctx = {
  base, work, low, period,
  balance, spend,
  dialogues,          // 设置页文本池
  typography,         // 分层字体配置
  query: { ... },     // 余额/峰谷/花费等只读接口
}
```

返回：

```js
{
  text: '...',                 // 纯文本
  segments: [                  // 可选，分层字体
    { text: '可露希尔', tier: 'title' },
    { text: '：余额 ', tier: 'body' },
    { text: '¥3.20', tier: 'number' },
  ],
  sound: 'fail',
}
```

事件名描述事实，视频名只是绑定：

```js
registerEvent('credited', {
  videos: ['celebrate'],
  priority: 100,
  notice: new CreditedNotice(),
})

registerEvent('valley_time', {
  videos: ['happy'],
  priority: 75,
  queue: true,
  notice: new ValleyTimeNotice(),
})

registerEvent('peak_time', {
  videos: [{ clip: 'sad_begin', from: 0.4, to: 1.8 }],
  priority: 75,
  queue: true,
  notice: new PeakTimeNotice(),
})

registerEvent('lowBalance', {
  videos: [],
  textOnly: true,
  priority: 20,
  queue: true,
  notice: new LowBalanceNotice(),
})

registerEvent('turn-interrupted', {
  videos: [{ clip: 'sad_begin', from: 0.4, to: 1.8 }],
  priority: 70,
  queue: false,
  notice: new InterruptedNotice(),
})

registerEvent('interact', {
  videos: ['interact_1', 'interact_2'],
  priority: 80,
  queue: false,
  notice: new InteractNotice(), // 可查询余额/峰谷，拼动态文本
})

registerEvent('idleChatter', {
  videos: ['talk'],
  priority: 0,
  queue: false,
  notice: new IdleChatterNotice(), // 按当前 base 选对话池
})
```

- `peak_time` / `valley_time` 不改变基础状态；
- `turn-interrupted` 是已有的“中断对话”表现，优先级 70，绑定 `sad_begin`；
- `lowBalance` 是普通 one-shot，`videos:[]` + `textOnly:true`，只发通知；
- `idleChatter` 绑定 Talk 动画，优先级 0、不排队；没有 active 时随机说一句，有 active 时直接丢弃；
- 通知不是列表，而是事件自己的一个类；查询、拼文本、随机选池都在类里完成；
- 没有独立的 `notify()` 注册层。

## 4. 状态模型

```js
state = {
  target: 'idle' | 'sad' | 'think',

  base: {
    state: 'idle' | 'sad' | 'think',
    transition: null | {
      id,
      clip,
      to,          // 转场结束后的 base 状态
      speed,       // 1.0 或快速转场的倍率
    },
    idleCycleDone: boolean, // 当前 Idle 是否已完整播完一轮
  },

  overlay: null | {
    id,
    event,         // 'credited' / 'peak_time' / ...
    clip,          // null 表示 textOnly
    persistent: boolean,
    priority: number,
    queue: boolean,
  },

  queue: {
    events: [],         // priority desc + FIFO
  },

  seq: 0, // 所有 id 的唯一来源
}
```

- `target` 只由条件推导，不直接播放。
- `base.state` 是当前基础状态；`transition` 非空时画面是转场。
- `overlay` 非空时，基础层挂起。
- `activeClip = overlay?.clip ?? base.transition?.clip ?? loopOf(base.state)`；`textOnly` 事件的 `clip` 为 null，不占画面。
- 通知不单独存在；它是 `overlay` 所属事件注册项里的 `notice` 类实例，事件真正开始时调用一次。

## 5. 基础层引擎

### 5.1 目标推导

```js
target = work === 'thinking' ? 'think'
       : low                 ? 'sad'
       :                       'idle'
```

优先级：**思考 > 低余额 > 普通**。思考结束且余额低，自然落回 `sad`。

余额从低恢复为正常时**不再播充值动画、气泡或音效**；只改变 target，由底层的正常转场回 Idle。到账由 `credited` 事件负责。

### 5.2 转场路径

默认所有状态经 Idle 中转：

| from | to | 路径 |
|---|---|---|
| idle | sad | `sad_enter` |
| sad | idle | `sad_exit` |
| idle | think | `think_enter` |
| think | idle | `think_exit` |
| sad | think | `sad_exit` → Idle → `think_enter` |
| think | sad | `think_exit` → Idle → `sad_enter` |

### 5.3 倍速规则

- 单段直达：`speed = 1.0`
- 需要两段 enter/exit 的跨状态：两段转场统一 `speed = 1.75`
- Idle 本身**不加速**：Idle 必须完整播完一轮。

`speed` 由底层根据路径长度自动决定，外部不传。

### 5.4 Idle 完成屏障

**所有基础状态之间的切换（base→base）**都要求当前 Idle 完整播完一轮：

1. 每次进入 Idle 播 `idle` loop；
2. 必须完整播放一轮；
3. `IDLE_CYCLE_DONE` 之后才允许离开 Idle，进入下一个 base；
4. Sad ↔ Think 的跨状态也一样：`sad_exit` 到 Idle 后，等满一轮 Idle 再 `think_enter`。

事件可以插队；事件结束后重新进入 Idle，并重新计一轮。

实现上可以：

- 进入 Idle 时记录 `idleUntil = now + Idle.duration`；
- 在 `resolve()` 里如果 `base.state === 'idle' && !idleCycleDone`，保持 loop；
- 收到 `IDLE_CYCLE_DONE` 后置 `idleCycleDone = true`，再 `resolve()`。

### 5.5 转场结束

```js
CLIP_ENDED(transition.id):
  base.state = transition.to
  base.transition = null
  if (base.state === 'idle') { idleCycleDone = false; startIdleCycle() }
  resolve()
```

## 6. 事件引擎

### 6.1 三类输入

不要把三类东西混成同一种“事件”：

| 类型 | 例子 | 进入哪 |
|---|---|---|
| 条件 | `low=true/false`、`work=thinking/outputting` | 只改 `target` |
| 状态转场 | `idle→sad`、`sad→think` | 基础层 enter/exit 槽 |
| 动画事件 | `peak_time`、`valley_time`、`credited`、`talk`、`interact`、`lowBalance`、`turn-interrupted` | 事件注册表 + 优先级 |

`lowBalance` 也是普通 one-shot，不做特殊条件通知：

- `low=true` 只改 `target='sad'`，并 `fire('lowBalance')`；
- `lowBalance` 注册为 `{ priority:20, queue:true, videos:[], textOnly:true }`；
- 出队时只发通知，**不更改任何动画状态**；
- 通知文本从 `dialogues.lowBalance` 列表随机；
- 等 `sad_enter` 真正开始时，动画才进入 Sad。

余额恢复：只改 `target`，不播任何动画/气泡/音效。

### 6.2 优先级与排队

```text
0    base
20   lowBalance        (queue, textOnly)
30   tool-success
60   talk
70   tool-fail / error (queue)
70   turn-interrupted
75   peak_time / valley_time (queue)
80   interact
100  credited
```

`peak_time`、`valley_time`、`credited`、`lowBalance`、`turn-interrupted` 都是独立事件；数字只是优先级。

规则：

- 事件注册时有 `queue` 字段：
  - `queue: true`：不抢当前动画，进队列；
  - `queue: false`：高优先级可以插队，低优先级直接丢弃。
- 新事件进来：
  - 没有 active：直接开始；
  - `queue: true`：入队；
  - `queue: false` 且 `priority > active.priority`：插队，当前事件取消；
  - `queue: false` 且 `priority === active.priority`：入队（同优先级排队）；
  - `queue: false` 且 `priority < active.priority`：丢弃。
- 队列顺序：`priority` 从高到低；同优先级按到达顺序 FIFO。
- 当前事件结束后弹出队首；出队前再检查一次是否仍有效（例如 talk 需要 work 仍是 outputting）。

`lowBalance` 优先级 20 且 `queue:true`：不会打断 Talk，等轮到它时只发通知；因为 `textOnly`，它瞬间完成，不影响 base。

`tool-success` 这类低优先级事件默认 `queue: false`，但可以单独打开 `queue: true`，用于“虽然低优先级但用户需要知道”的情况。

`tool-fail` / `error` 和 `peak_time` / `valley_time` 标了 `(queue)`，即使优先级高于 Talk，也**不打断 Talk**，而是等 Talk 播完再出。

`turn-interrupted` 70 非排队，用于打断当前对话/Talk。

`credited` 100 默认不排队，直接插队。

### 6.3 通知类

通知是事件注册项里的一个类实例，不再拆成独立注册层，也不是列表：

```js
registerEvent('lowBalance', {
  videos: [],
  textOnly: true,
  priority: 20,
  queue: true,
  notice: new LowBalanceNotice(),
})

registerEvent('peak_time', {
  videos: [{ clip: 'sad_begin', from: 0.4, to: 1.8 }],
  priority: 75,
  queue: true,
  notice: new PeakTimeNotice(),
})
```

`notice.build(ctx)` 在事件真正开始（出队）时调用，返回文本/富文本/音效：

```js
class InteractNotice {
  build(ctx) {
    const { balance, period } = ctx.query.current()
    return {
      segments: [
        { text: '可露希尔', tier: 'title' },
        { text: '：当前余额 ', tier: 'body' },
        { text: formatMoney(balance), tier: 'number' },
        { text: `，${period.name}价`, tier: 'body' },
      ],
      sound: 'coin',
    }
  }
}
```

- 事件排队时，通知跟着等；事件被丢弃时通知也不出；
- `textOnly` 事件没有动画，`build` 完即完成，不进入 `CLIP_ENDED`，不改变 base；
- 通知文本/随机池/查询逻辑全部封装在类里，外部只注册事件，不需要知道设置页的池结构；
- `IdleChatterNotice.build(ctx)` 按 `ctx.base` 选择 `ctx.dialogues.idle/sadIdle/thinkIdle`，随机一条；这条随机逻辑也在类内；
- 分层字体通过 `segments[].tier` 传给气泡渲染器；
- 不再有 `notify()` 注册表，也没有“通知队列”：排队的是事件，通知只是事件属性。

### 6.4 淡化

- 事件进入：一律 `fadeIn = 320ms` 交叉淡化；
- 事件退出：默认硬切；`interact` 使用 `fadeOut = 320ms`；
- 基础转场：一律硬切，不淡化；
- 高优先级插队：按新事件的 `fadeIn` 淡入。

### 6.5 视频池随机

- `videos` 长度 1：直接播；
- 长度 > 1：均匀随机，尽量不与上一段相同；
- 同一事件池里的视频应当语义一致；不一致时注册报错。

### 6.6 事件结束

所有 one-shot 的结束姿势都是 Idle 起始姿势。事件结束后不直接播目标 loop，而是走目标状态的 enter 槽：

```js
CLIP_ENDED(overlay.id):
  base.state = 'idle'       // 事件结束在 Idle 起始姿势
  base.transition = null
  overlay = null
  enterBase(target)         // sad/think 播 enter；idle 直接 loop
```

`enterBase(next)`：

```js
if (next === 'idle') return play('idle', { loop: true })
const slot = BaseRegistry[next].enter
if (slot) return play(slot)   // 目标状态没配置 enter 就跳过
return play(BaseRegistry[next].loop, { loop: true })
```

- 从 one-shot 回 base **不等待 Idle 完整一轮**；Idle 屏障只用于 base→base 切换；
- 目标状态没有 enter 槽时跳过 enter，直接 loop；
- 如果事件期间 target 变了，结束后按最新 target 选 enter；
- `interact` 额外在 enter 前做 320ms 淡出；
- `textOnly` 事件不产生 `CLIP_ENDED`，通知完直接走 `enterBase(target)`。

### 6.7 Talk

- `talk` 是 `persistent: true` 事件，注册为 `queue:true`；
- 出队前校验 `work === 'outputting'`，否则丢弃；
- `CLIP_ENDED` 时若 work 仍是 outputting 且未被更高优先级打断，重播；
- 点击进入 `interact`（80），取消本轮 Talk；work 离开 outputting 后清掉取消标记；
- Talk 期间峰谷/低余额只更新 target，或触发更高优先级事件，不直接改 base；
- `peak_time` / `valley_time` 虽然优先级 75 高于 talk 60，但它们是 `queue:true`，所以会等 Talk 播完再出。

### 6.8 交互

- `interact` 池：`interact_1` / `interact_2`，均匀随机；
- 优先级 80，可打断 Talk（60）和普通事件；
- 结束后 `fadeOut:320`，再按 target 走 enter；没有 enter 就跳过。

## 7. 开屏

开屏只是**启动时自动做一次峰谷检定**，不是事件层，也没有 `startup` 优先级：

```js
STARTUP_DUE -> fire(peak ? 'peak_time' : 'valley_time')
```

- `STARTUP_DUE` 是定时器/调度器，不是注册事件；
- 它只负责在开屏延迟后触发一次 `peak_time` 或 `valley_time`；
- 被触发的是普通事件，走各自 75 优先级、`queue:true` 的排队规则；
- 不存在“startup 遇到同优先级 peak/valley”的比较，它们不在同一层。

播放：

- 峰价：`peak_time` → `sad_begin` 的一段难过表情；
- 谷价：`valley_time` → `happy`；
- 低余额：`lowBalance` 作为 20 优先级、排队、`textOnly` 的事件出队，`LowBalanceNotice` 只发催款文本，动画状态不变；base 随后按 target 正常进入 `sad`；
- 非低余额：事件结束后 `enterBase('idle')`；
- 不再有 `startupHold`、`afterOverlay`、`source:'startup'` 或第二段 `Sad_Begin`。

## 8. 设置页

在 DSH 设置里新增独立「可露希尔桌宠」页面，只放低频配置：

- 余额不足阈值（`lowThreshold`，默认 10）；
- 开屏延迟（`startupDelay`，默认 5000ms）；
- **闲时随机对话池，按基础状态分列表，不合并**：
  - `dialogues.idle`：Idle 时的闲聊；
  - `dialogues.sadIdle`：Sad_Idle 时的闲聊；
  - `dialogues.thinkIdle`：Think_Idle 时的闲聊；
  - 触发入口是 `idleChatter` one-shot：绑定 `talk` 动画、优先级 0、不排队；`IdleChatterNotice` 按当前 base 选对应池并随机一条；
- **事件对话池，按事件分列表**：
  - `dialogues.credited`、`dialogues.peakTime`、`dialogues.valleyTime`、`dialogues.lowBalance`、`dialogues.turnInterrupted`、`dialogues.toolFail`、`dialogues.toolSuccess`、`dialogues.turnEnd`；
  - 每个事件自己的 `notice` 类决定怎么取、怎么拼、怎么随机；
- 每个列表支持 `+` 添加多条；触发时均匀随机一条，避免连续重复；
- 其余高频项（大小、透明度、气泡）保留右键面板。

`lowBalance` 不特殊处理：

- 它是普通 one-shot，`priority:20`、`queue:true`、`textOnly:true`；
- 出队时调用 `LowBalanceNotice.build(ctx)`，只发文本/音效；
- 不改变任何动画状态；
- 余额条件仍然只负责把 `target` 设为 `sad`，随后 `sad_enter` 正常进场。

配置持久化到 `$DSH_HOME/.dshcl.json` 的 `settings` 与 `dialogues`。

余额恢复分支删除：

- `low === false` 只更新 target；
- 不再播 `celebrate`、不再出“经费到账”气泡、不再播 coin；
- 到账统一走 `credited` 事件。

## 9. 不变量

1. 任意时刻只有一个 active 片段。
2. 没有 overlay、没有 transition 时，base 必须是一个 loop 且在播。
3. 所有事件结束后，base 回到 Idle 姿势，再通过目标状态的 enter 槽回到 base；没有 enter 则直接 loop。
4. 旧 id 的 `CLIP_ENDED` 不得改变状态。
5. transition 只在没有 overlay 时启动。
6. base→base 切换时，Idle 未完整播完一轮不允许离开；one-shot 回 base 直接走 enter，不等 Idle 轮次。
7. 事件优先级只由 registry 的 `priority` 决定，不在业务分支里手写比较。

## 10. 测试

### 10.1 注册表

- 注册缺少 loop/enter/exit 的状态 → 报错；
- 注册空 `videos` 且没有 `textOnly:true` 的事件 → 报错；
- `textOnly` 事件出队后不产生 `play` effect，base 保持不变；
- 同一事件池视频的 `end` 不一致 → 报错；
- 事件名与视频名不要求相同。

### 10.2 基础转场

- 3×3 目标矩阵；
- sad→think / think→sad 使用倍速，且经过 Idle；
- Idle 完成屏障：未满一轮不切；
- target 在转场中变化：不中断当前转场，结束后按最新目标继续。

### 10.3 事件

- 事件进入交叉淡化；
- 高优先级插队、同优先级排队、低优先级丢弃（除非 `queue:true`）；
- 视频池随机且避开上一段；
- `peak_time` / `valley_time` 复用 `sad_begin` 片段，不改变 base；
- `lowBalance` textOnly：只出文本，不产生动画 effect；
- `turn-interrupted` 70 绑定 `sad_begin`；
- Talk 重播、点击打断；
- `interact_1/2` 随机。

### 10.4 集成

- 冷启动低余额前后两种顺序；
- 事件结束回 Idle → 按 target 进 Sad/Think；
- 设置页闲时对话池按 Idle / Sad_Idle / Think_Idle 分列表，事件文本按事件分列表；
- 假 video / 假 loader 验证 generation 丢弃。

## 11. 与 dsh-pet 的对照

参考项目：<https://github.com/PC2005-cloud/dsh-pet>

值得借：

- `animation.ts` 只管 A/B 双缓冲、blob、generation；
- `cues.ts` 把“播完之后做什么”做成纯 `EndedCue`；
- `animation.test.ts` 用假 video / 假 loader 做契约测试；
- 模态状态（睡眠）拆成独立 `sleepMachine`。

不照搬：

- 100+ 片段按权重随机抽下一条；
- React refs 驱动的动画状态；
- 多宠物、物理、睡眠等。

我们的注册式基座比它的随机链更适合“三基础状态 + 事实事件”的场景：扩展新状态/新事件只注册，不改核心分支。

## 12. 迁移

1. 建 `BaseRegistry` / `EventRegistry` 与纯 `reduce/resolve`，先用假 video 测试；
2. 导入 `think_Begin` / `think_Idle` / `celebrate` / `interact_1` / `interact_2`，补 `sad_exit` / `think_exit` 倒放；
3. 替换 startup / thinking / talk / interact；
4. 设置页接入 `dialogues` 与 `lowThreshold`，删除余额恢复分支；
5. 浏览器回归后再发版。

## 13. 已定与待实现细节

已定：

- 跨状态转场倍率 1.75；
- 所有基础状态之间的切换都等当前 Idle 完整播完一轮；
- 同优先级事件排队；低优先级事件通过 `queue` 逐事件配置；
- 通知是事件里的 `notice` 类实例，不单独注册、不单独排队；
- `valley_time` 绑定 `happy`，`peak_time` 绑定 `sad_begin` 的一段难过表情；两者都不改变基础状态；
- `lowBalance` 是普通 one-shot：20 优先级、排队、`textOnly`，不改任何动画状态；
- 中断对话 `turn-interrupted` 是 one-shot：70 优先级、绑定 `sad_begin`；
- 闲时对话 `idleChatter` 是 one-shot：绑定 `talk`，0 优先级、不排队，`IdleChatterNotice` 按当前 base 选对应池；
- 设置页闲时对话池按 Idle / Sad_Idle / Think_Idle 分列表，不合并；事件文本按事件分列表；
- one-shot 回 base 时播目标状态的 enter；没有 enter 槽就跳过；
- 开屏只是启动时触发一次 `peak_time` / `valley_time`，不是独立事件层，也没有 `source:'startup'`。

待实现时再定：

1. `tool-success` 默认 `queue:false` 还是 `true`？
2. 高优先级插队时，已经在队列里的低优先级事件保留还是清空？
3. `peak_time` / `turn-interrupted` 复用 `sad_begin` 的精确 `from/to` 区间；
4. `notice.build(ctx)` 返回空文本时，是完全静默还是仍播音效；
5. Talk 被 `credited`（100）插队后，work 仍在 outputting 时是否重新起一轮 Talk。
