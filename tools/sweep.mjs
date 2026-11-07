// 切る間合いを細かく変えて、解き方はクリア・間違いは失敗になるかを数える。node tools/sweep.mjs [面] [-v]
// 基本の面: 順番の面は全部の手を 0.8〜6秒の7通り、タイミングの面は最初の手を ±0.3秒。上級の面は sweeplib.mjs の説明どおり
import { LV, sweepLevel } from './sweeplib.mjs'
const only = process.argv[2] && /^\d+$/.test(process.argv[2]) ? [Number(process.argv[2]) - 1] : LV.map((_, i) => i), verbose = process.argv.includes('-v')
let bad = 0, runs = 0
for (const i of only) {
  const d = LV[i], r = sweepLevel(d)
  runs += r.s.length + r.w.length
  if (r.ns < r.s.length || r.nw < r.w.length) bad++
  console.log(`${String(i + 1).padStart(2)} ${d.key.padEnd(8)} ${d.adv ? 'adv   ' : d.timing ? 'timing' : 'order '} solve clear ${r.ns}/${r.s.length}  wrong fail ${r.nw}/${r.w.length}`)
  if (verbose || r.ns < r.s.length || r.nw < r.w.length) {
    for (const [st, w] of r.s) if (w.state !== 'clear') console.log('   solve NG', JSON.stringify(st), w.state, w.reason)
    for (const [st, w] of r.w) if (w.state !== 'fail') console.log('   wrong NG', JSON.stringify(st), w.state)
  }
}
console.log(`${runs} runs, ${bad} levels NG`)
process.exit(bad ? 1 : 0)
