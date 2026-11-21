import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const clientSrc = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8')

test('manifest：dsh.client 与打包后的 ./client 入口', () => {
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.ok(pkg.files.includes('lib'))
  assert.equal(pkg.version, '2.0.0')
})

test('客户端产物：自包含 bundle 注册 shell.overlay', () => {
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

test('不再保留 index 注入回退', () => {
  assert.equal(fs.existsSync(path.join(root, 'lib/inject.js')), false)
  assert.equal(fs.existsSync(path.join(root, 'assets/pet.js')), false)
})
