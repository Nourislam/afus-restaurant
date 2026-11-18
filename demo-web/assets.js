// The program's own files put into the demo's in-memory disk, at the paths the
// main process reads them from. Today that is the storefront's own assets; the
// list is a glob so a new file needs no change here.
import { seed } from './shims/fs.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

const ROOT = '/app/dist-electron/main'
const texts = import.meta.glob(['../src/main/**/*.{sql,json,txt,md,css,svg}'], { query: '?raw', import: 'default', eager: true })
const binaries = import.meta.glob('../src/main/**/*.{webp,png,jpg,jpeg,woff2,woff,ttf,ico}', { query: '?url', import: 'default', eager: true })

/* '../src/main/x/y' -> '/app/dist-electron/main/x/y' */
const at = (file) => `${ROOT}/${file.replace(/^(\.\.\/)*src\/main\//, '')}`

export async function loadAssets(onProgress = () => {}) {
  for (const [file, text] of Object.entries(texts)) seed(at(file), text)

  /* SQLite itself. The program looks for it on disk next to its dependencies
     and hands the bytes to sql.js, so the demo puts it exactly where it looks
     rather than going round the program's own code. */
  const wasm = await fetch(sqlWasmUrl)
  seed('/afus/node_modules/sql.js/dist/sql-wasm.wasm', new Uint8Array(await wasm.arrayBuffer()))

  const list = Object.entries(binaries)
  if (list.length === 0) {
    onProgress(1)
    return
  }
  let done = 0
  await Promise.all(
    list.map(async ([file, url]) => {
      try {
        const res = await fetch(url)
        if (res.ok) seed(at(file), new Uint8Array(await res.arrayBuffer()))
      } catch {
        /* a missing picture only leaves its place empty */
      }
      onProgress(++done / list.length)
    })
  )
}
