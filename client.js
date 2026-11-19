// dsh-closure-pet — 客户端插件（DSH Web）
//
// 由 DSH 的客户端模块加载器执行：注册一个 lazy factory，把桌宠挂到 `shell.overlay`
// （frame-wide 浮层，在滚动容器之外）。真正的渲染逻辑仍是宿主 /src/* 提供的 ES modules，
// 这里只负责：创建挂载容器 → 动态 import → 卸载时 dispose。
//
// 与宿主侧注入行（webserver/index-inject）互斥：本文件成功加载后会设置
// window.__dshClosurePetClientActive，注入行检测到它就跳过，避免双开。
// 如果客户端插件加载失败（例如版本不匹配），注入行仍是回退路径。
window.__ModuleLoader__.load({
  id: 'dsh-closure-pet',
  factory(require) {
    const React = require('react')
    let instance = 0

    function PetLayer() {
      const ref = React.useRef(null)
      React.useEffect(() => {
        const node = ref.current
        if (!node) return
        const mountEl = document.createElement('div')
        mountEl.id = 'dsh-closure-pet-mount'
        // display:contents：不参与布局，子元素（position:fixed 的桌宠）仍相对视口
        mountEl.style.cssText = 'display:contents'
        node.appendChild(mountEl)
        window.__dshClosurePetMount = { container: mountEl }

        const seq = ++instance
        // 带 query 的 URL 让 React StrictMode 的「卸载→重挂」能拿到新的模块实例
        import('/dsh-closure/src/main.js?m=' + seq).then(function () {
          if (seq === instance) window.__dshClosurePetClientActive = true
        }).catch(function (err) {
          try { console.warn('[closure-pet] 客户端模块加载失败，注入行会回退', err) } catch (e) {}
        })

        return function () {
          if (seq !== instance) return
          window.__dshClosurePetClientActive = false
          window.__dshClosurePetMount = null
          const api = window.__dshClosurePet
          if (api && typeof api.dispose === 'function') {
            try { api.dispose() } catch (e) {}
          }
          try { delete window.__dshClosurePet } catch (e) { window.__dshClosurePet = undefined }
          if (mountEl.parentNode) mountEl.parentNode.removeChild(mountEl)
        }
      }, [])
      return React.createElement('div', {
        ref: ref,
        style: { position: 'fixed', left: 0, top: 0, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none' },
      })
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-closure-pet',
            order: 100,
          }, PetLayer)
        })
      },
    }
  },
})
