// this will inline wasm bytes and wrap with wasm_exec.js

import { readFile, writeFile } from 'node:fs/promises'

const buf = await readFile('./go/sqldef.wasm')

await writeFile(
  'index.js',
  `import './go/wasm_exec.js'
const buf = new Uint8Array([${[...buf].join(',')}])
const go = new Go()

export default async (t,s1,s2) => {
  const inst = await WebAssembly.instantiate(buf, go.importObject)
  go.run(inst.instance)
  const sqlDefModule = createSqlDefModule()
  const {error, result} = sqlDefModule.diff(t, s1, s2)
  if (error) {
    throw new Error(error)
  }
  return result
}
`
)
