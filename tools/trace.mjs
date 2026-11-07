// 1面を台本どおりに回し、0.25秒ごとの位置と出来事を出す。node tools/trace.mjs <面> [solve|wrong|none] [秒]
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const root = new URL('..', import.meta.url).pathname
vm.runInThisContext(readFileSync(root + 'engine.js', 'utf8')); vm.runInThisContext(readFileSync(root + 'levels.js', 'utf8'))
const E = globalThis.RopeEngine, d = globalThis.LEVELS[Number(process.argv[2]) - 1]
const mode = process.argv[3] || 'solve', steps = (mode === 'none' ? [] : /^w\d/.test(mode) ? d.wrongs[+mode.slice(1)] : d[mode]).map(s => [s[0], s[1]]), lim = Number(process.argv[4] || 14)
const w = E.create(d); E.prepare(w)
let k = 0, base = 0, next = steps.length ? steps[0][1] : 1e9
while (w.t < lim && !(w.state !== 'play' && w.t > w.endAt)) {
  if (k < steps.length && w.t >= base + next - 1e-9) { E.cut(w, steps[k][0]); base = w.t; k++; next = k < steps.length ? steps[k][1] : 1e9 }
  E.step(w)
  for (const e of w.events) if (e.e !== 'land' || e.v > 300) console.log(`  t${w.t.toFixed(2)} ${e.e} ${e.id || e.kind || e.how || ''} ${Math.round(e.x)},${Math.round(e.y)}${e.v ? ' v' + Math.round(e.v) : ''}${e.on ? ' on ' + e.on : ''}`)
  w.events.length = 0
  if (w.frame % 15 === 0) console.log(`t${w.t.toFixed(2)} ${w.state} ` + w.bodies.filter(b => b.alive).map(b => `${b.id}(${Math.round(b.x)},${Math.round(b.y)})`).join(' ') + ' ' + w.walkers.map(m => `M(${Math.round(m.x)}${m.alive ? '' : ' dead'})`).join(' ') + ` hero(${Math.round(w.hero.x)},${Math.round(w.hero.y)}${w.hero.standing ? ' st' : ''})`)
}
console.log(w.state, w.reason)
