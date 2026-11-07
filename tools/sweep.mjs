// 切る間合いを細かく変えて、解き方はクリア・間違いは失敗になるかを数える。node tools/sweep.mjs
// 順番の面: 全部の手の間合いを 0.8〜6秒の7通りに。タイミングの面: 最初の手を ±0.3秒まで 0.1秒刻みでずらす
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const root = new URL('..', import.meta.url).pathname
vm.runInThisContext(readFileSync(root + 'engine.js', 'utf8')); vm.runInThisContext(readFileSync(root + 'levels.js', 'utf8'))
const E = globalThis.RopeEngine, LV = globalThis.LEVELS
const W = [0.8, 1, 1.3, 2, 2.7, 4, 6], O = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]
let bad = 0
LV.forEach((d, i) => {
  const vary = (st, v) => d.timing ? st.map((s, k) => [s[0], s[1] + (k === 0 ? v : 0)]) : st.map(s => [s[0], v])
  const s = (d.timing ? O : W).map(v => E.runScript(d, vary(d.solve, v)).state)
  const w = d.timing ? [E.runScript(d, d.wrong).state] : W.map(v => E.runScript(d, vary(d.wrong, v)).state)
  const ns = s.filter(x => x === 'clear').length, nw = w.filter(x => x === 'fail').length
  if (ns < s.length || nw < w.length) bad++
  console.log(`${String(i + 1).padStart(2)} ${d.key.padEnd(7)} ${d.timing ? 'timing' : 'order '} solve clear ${ns}/${s.length}  wrong fail ${nw}/${w.length}`)
})
process.exit(bad ? 1 : 0)
