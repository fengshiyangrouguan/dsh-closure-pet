// dsh-closure-pet — 宿主：index 注入行
//
// 内联注入行：自己建 <script>，并吞掉加载失败（插件被关掉时路由已注销，这里只是静默）。
// 启动顺序：等页面 load 后再在空闲时加载 pet.js，避免和 DSH 的 boot / 首屏挂载抢主线程；
// 桌面端只在 Host 启动时收集一次这一行，所以它本身仍必须同步注册。

import { URL_PREFIX } from '../assets/src/shared/protocol.js'

export const INDEX_ROW_TEXT =
  '(function(){try{' +
  'function boot(){try{if(window.__dshClosurePetClientActive)return;var d=document.body||document.head||document.documentElement;if(!d)return;' +
  'var s=document.createElement("script");s.src="' + URL_PREFIX + '/pet.js";' +
  's.onerror=function(){try{console.warn("[closure-pet] 前端脚本加载失败（路由未就绪？）")}catch(e){}};' +
  'd.appendChild(s)}catch(e){}}' +
  'function schedule(){try{if(typeof requestIdleCallback==="function")requestIdleCallback(boot,{timeout:3000});' +
  'else setTimeout(boot,1200)}catch(e){setTimeout(boot,1200)}}' +
  'if(document.readyState==="complete")schedule();else window.addEventListener("load",schedule,{once:true})' +
  '}catch(e){}})()'

/** 注册注入行；返回 disposer（由调用方放进 root.effect 清理）。 */
export function registerInject(root) {
  return root.on('webserver/index-inject', (table) => {
    try {
      if (!Array.isArray(table)) return
      const already = table.some((row) => row && typeof row.text === 'string'
        && row.text.indexOf(URL_PREFIX + '/pet.js') >= 0)
      if (already) return
      table.push({ kind: 'script', placement: 'body', text: INDEX_ROW_TEXT })
    } catch (err) {
      console.warn('[closure-pet] 注入行注册失败：' + String((err && err.message) || err))
    }
  })
}
