// 构建客户端 bundle：output 是 lib/client.js，直接由 DSH 的 client-modules 提供。
// 只在改前端源码后手动跑；运行时不需要 esbuild。
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [path.join(root, 'assets/src/client-entry.js')],
  outfile: path.join(root, 'lib/client.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'edge100', 'firefox100'],
  legalComments: 'none',
  logLevel: 'info',
})
