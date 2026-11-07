// 1面の、ひもを切る全部の順番（部分集合も）を回して、クリアする順番を数える（抜け道さがし）。node tools/orders.mjs <面> [間合い秒,...] [最大本数]
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const root = new URL('..', import.meta.url).pathname
vm.runInThisContext(readFileSync(root + 'engine.js', 'utf8')); vm.runInThisContext(readFileSync(root + 'levels.js', 'utf8'))
const E = globalThis.RopeEngine, d = globalThis.LEVELS[Number(process.argv[2]) - 1]
const waits = (process.argv[3] || '1,2.5').split(',').map(Number), maxN = Number(process.argv[4] || 6)
const ids = d.ropes.map(r => r.id), wins = {}
let n = 0
function rec(seq) {
  if (seq.length) for (const wt of waits) {
    n++
    const w = E.runScript(d, seq.map(id => [id, wt]))
    if (w.state === 'clear') (wins[seq.join('')] = wins[seq.join('')] || []).push(wt)
  }
  if (seq.length >= maxN) return
  for (const id of ids) if (!seq.includes(id)) rec(seq.concat(id))
}
rec([])
console.log(`${d.key}: ${n} runs, clear by: ` + (Object.entries(wins).map(([k, v]) => `${k}@${v.join('/')}`).join('  ') || 'none'))
