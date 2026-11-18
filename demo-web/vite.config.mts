/**
 * The web demo (npm run build:demo -> dist-demo/): Afus Restaurant's own main
 * process, preload and window in one browser page, with Electron and Node
 * played by ./shims. Nothing leaves the page and nothing is kept.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SHIMS = resolve(HERE, 'shims')
const PKG = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))

/**
 * `__dirname` of each main-process file, as the in-memory disk knows it. The
 * program uses it to find its own files next to the built bundle.
 */
function nodePaths() {
  return {
    name: 'afus-demo-node-paths',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.startsWith(resolve(ROOT, 'src/main')) || !/\.(m?ts|c?js)$/.test(id)) return null
      if (!/__dirname|__filename/.test(code)) return null
      return code
        .replace(/\b__dirname\b/g, JSON.stringify('/app/dist-electron/main'))
        .replace(/\b__filename\b/g, JSON.stringify('/app/dist-electron/main/index.js'))
    }
  }
}

export default defineConfig({
  root: HERE,
  base: './',
  plugins: [nodePaths(), react()],
  define: { __AFUS_VERSION__: JSON.stringify(PKG.version) },
  resolve: {
    alias: [
      { find: '@shared', replacement: resolve(ROOT, 'src/shared') },
      { find: '@renderer', replacement: resolve(ROOT, 'src/renderer/src') },
      { find: /^electron$/, replacement: resolve(SHIMS, 'electron.js') },
      { find: /^(node:)?fs$/, replacement: resolve(SHIMS, 'fs.js') },
      { find: /^(node:)?fs\/promises$/, replacement: resolve(SHIMS, 'fs.js') },
      { find: /^(node:)?path$/, replacement: resolve(SHIMS, 'path.js') },
      { find: /^(node:)?os$/, replacement: resolve(SHIMS, 'os.js') },
      { find: /^(node:)?crypto$/, replacement: resolve(SHIMS, 'crypto.js') },
      { find: /^(node:)?(http|https|net|child_process|zlib|worker_threads)$/, replacement: resolve(SHIMS, 'empty.js') },
      { find: /^sql\.js$/, replacement: resolve(SHIMS, 'sqljs.js') }
    ]
  },
  build: {
    outDir: resolve(ROOT, 'dist-demo'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: resolve(HERE, 'index.html') },
    chunkSizeWarningLimit: 6000
  }
})
