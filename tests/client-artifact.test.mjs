import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const clientSrc = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8')

test('manifest: dsh.client, ./client and version', () => {
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.ok(pkg.files.includes('lib'))
  assert.match(pkg.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/)
  assert.notEqual(pkg.version, '0.0.0')
})

test('客户端产物：注册 shell.overlay 与 settings.section', () => {
  let def = null
  const fakeWindow = { __ModuleLoader__: { load(d) { def = d } } }
  new Function('window', clientSrc)(fakeWindow)
  assert.ok(def, '应调用 __ModuleLoader__.load')
  assert.equal(def.id, 'dsh-closure-pet')

  const fakeReact = {
    createElement: (type, props, children) => ({ type, props, children }),
    useRef: (v) => ({ current: v }),
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {},
  }
  const plugin = def.factory((name) => {
    assert.equal(name, 'react')
    return fakeReact
  })
  assert.deepEqual(plugin.inject, ['slots'])

  const injected = []
  const registrations = []
  const ctx = {
    slots: {
      inject(key, cb) { injected.push(key); cb() },
      register(options, component) { registrations.push({ options, component }) },
    },
  }
  plugin.apply(ctx)
  assert.ok(injected.includes('shell.overlay'))
  assert.ok(injected.includes('settings.section'))
  const overlay = registrations.find((r) => r.options.name === 'shell.overlay')
  const section = registrations.find((r) => r.options.name === 'settings.section')
  assert.ok(overlay)
  assert.ok(section)
  assert.equal(overlay.options.id, 'dsh-closure-pet')
  assert.equal(section.options.id, 'dsh-closure-pet')
  assert.equal(typeof section.component, 'function')
})

test('不再保留 index 注入回退', () => {
  assert.equal(fs.existsSync(path.join(root, 'lib/inject.js')), false)
  assert.equal(fs.existsSync(path.join(root, 'assets/pet.js')), false)
})
