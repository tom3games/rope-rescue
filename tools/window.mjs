// 切る時をずらして結果を並べる（タイミングの面の窓を見る）。node tools/window.mjs <面> [何番目の手] [から] [まで]
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const root = new URL('..', import.meta.url).pathname
vm.runInThisContext(readFileSync(root + 'engine.js', 'utf8')); vm.runInThisContext(readFileSync(root + 'levels.js', 'utf8'))
const E = globalThis.RopeEngine, d = globalThis.LEVELS[Number(process.argv[2]) - 1], SRC = process.env.WRONG ? d.wrong : d.solve
const k = Number(process.argv[3] || 0), a = Number(process.argv[4] || 0.4), b = Number(process.argv[5] || 7)
let line = ''
for (let t = a; t <= b + 1e-9; t += 0.1) {
  const s = SRC.map((st, i) => i === k ? [st[0], t] : st)
  const w = E.runScript(d, s)
  line += `${t.toFixed(1)}:${w.state === 'clear' ? 'O' : w.state === 'fail' ? 'x' + w.reason.slice(0, 3) : '-'} `
}
console.log(line)
