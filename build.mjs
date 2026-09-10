/**
 * Build a single self-contained executable with Node's built-in SEA
 * (Single Executable Applications). No downloads — uses the Node you run it
 * with. Output: dist/hotelier-print-bridge<.exe>.
 *
 *   npm run build
 *
 * The exe is node.exe (~85 MB) with the bundled script appended. For
 * distribution, code-sign it so Windows SmartScreen doesn't warn.
 */
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const isWin = process.platform === 'win32'
const out = join('dist', `hotelier-print-bridge${isWin ? '.exe' : ''}`)
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
const bin = (name) => join('node_modules', '.bin', isWin ? `${name}.cmd` : name)
const sh = (cmd) => execSync(cmd, { stdio: 'inherit' })

mkdirSync('dist', { recursive: true })

console.log('1/4  bundle src/index.js -> src/bundle.js')
sh(`"${bin('esbuild')}" src/index.js --bundle --platform=node --target=node20 --outfile=src/bundle.js`)

console.log('2/4  generate the SEA blob')
sh(`"${process.execPath}" --experimental-sea-config sea-config.json`)

console.log(`3/4  copy the Node binary -> ${out}`)
copyFileSync(process.execPath, out)

console.log('4/4  inject the blob (postject)')
const macho = process.platform === 'darwin' ? ' --macho-segment-name NODE_SEA' : ''
sh(`"${bin('postject')}" "${out}" NODE_SEA_BLOB sea-prep.blob --sentinel-fuse ${FUSE}${macho}`)

for (const f of ['src/bundle.js', 'sea-prep.blob']) if (existsSync(f)) rmSync(f)

console.log(`\nDone -> ${out}`)
console.log('(unsigned — Windows SmartScreen will warn until you code-sign it)')
