// dsh-closure-pet — 动画数据表
//
// 只放数据，不放状态机：状态机在 main.js 里（后续 P1 第二步会拆出 director）。
// LOOP_RANGES 会被调试接口 setLoop 修改，所以导出的是可变对象。

// 循环区间：某些动画整段首尾接不上，只取中间一段做循环（由 tools/loop-finder 取点，本地工具，未入库）
//   from/to 单位秒；null 表示"整套循环"。
export const LOOP_RANGES = {
  // 思考：1.59s 是一次点头的起点，2.10s 是这次点头的收束点。
  // 乒乓只在这 0.51s 内来回，等于把"点一下头"做成无缝循环。
  Special_B: { from: 1.59, to: 2.10 },
}

// 循环模式：'wrap'（到 to 回卷到 from）或 'pingpong'（正放完倒放回来）。
// Special_B 的背景飞行物轨迹首尾对不上（接缝差 4.16%），任何子区间都会有跳变，
// 所以改成乒乓：位置连续、没有接缝，代价是速度方向每 2.67s 反转一次。
export const LOOP_MODES = {
  Special_B: 'thinkcycle',
}

// 思考循环：先正放到 from（点头起点），在 [from,to] 内乒乓一段随机时长，
// 再顺势播到结尾，然后从 0 重新开始下一轮。
export const THINK_NOD_MIN_MS = 1200
export const THINK_NOD_MAX_MS = 3200

// 工具调用成功 → 播 Happy 的概率（失败仍然必播 Sad_Begin）
export const HAPPY_CHANCE = 0.25

