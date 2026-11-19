// dsh-closure-pet — 浏览器入口
//
// 这里刻意保持「经典脚本」：用动态 import 加载 ES 模块图，
// 这样无论注入行是老的 <script> 还是 <script type="module"> 都能工作。
// 真正的实现在 ./src/ 下（宿主把 /dsh-closure/src/* 映射到 assets/src/*）：
//   core/env.js、core/settings.js、render/hit-test.js、anim/library.js、
//   audio.js、ui/layout.js，以及组合根 src/main.js。
try {
  import('./src/main.js').catch(function (err) {
    try { console.warn('[closure-pet] 前端模块加载失败（/dsh-closure/src/* 路由就绪了吗？）', err) } catch (e) {}
  })
} catch (err) {
  try { console.warn('[closure-pet] 前端模块加载失败', err) } catch (e) {}
}
