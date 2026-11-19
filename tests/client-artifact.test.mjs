import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const clientSrc = fs.readFileSync(path.join(root, 'client.js'), 'utf8')
const injectSrc = fs.readFileSync(path.join(root, 'lib/inject.js'), 'utf8')

test('manifest：dsh.client 与 ./client 导出', () => {
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.dsh.client.immediately, true)
  assert.equal(pkg.exports['./client'], './client.js')
  assert.ok(pkg.files.includes('client.js'))
  assert.equal(pkg.version, '1.0.0')
})

test('客户端产物：注册 shell.overlay 的 lazy factory', () => {
  let def = null
  const fakeWindow = { __ModuleLoader__: { load(d) { def = d } } }
  new Function('window', clientSrc)(fakeWindow)
  assert.ok(def, '应调用 __ModuleLoader__.load')
  assert.equal(def.id, 'dsh-closure-pet')

  const fakeReact = {
    createElement: (type, props, children) => ({ type, props, children }),
    useRef: (v) => ({ current: v }),
    useEffect: () => {},
  }
  const plugin = def.factory((name) => {
    assert.equal(name, 'react')
    return fakeReact
  })
  assert.deepEqual(plugin.inject, ['slots'])

  let injectedKey = null
  let registered = null
  const ctx = {
    slots: {
      inject(key, cb) { injectedKey = key; cb() },
      register(options, component) { registered = { options, component } },
    },
  }
  plugin.apply(ctx)
  assert.equal(injectedKey, 'shell.overlay')
  assert.ok(registered)
  assert.equal(registered.options.name, 'shell.overlay')
  assert.equal(registered.options.id, 'dsh-closure-pet')
  assert.equal(typeof registered.component, 'function')
})

test('注入行带客户端插件互斥守卫（回退路径）', () => {
  assert.ok(injectSrc.includes('__dshClosurePetClientActive'))
  assert.ok(injectSrc.includes('/pet.js'))
})
