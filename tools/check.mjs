// 全部の面を node で回す。解き方でクリア・間違いで失敗・何もしないとクリアしない・間合いを変えても同じ
// node tools/check.mjs [面番号]
import { E, LV, sweepLevel } from './sweeplib.mjs'
const only = process.argv[2] ? [Number(process.argv[2]) - 1] : LV.map((_, i) => i)
let bad = 0
const f = x => `${x.state}${x.reason ? '/' + x.reason : ''} t${x.t.toFixed(1)}`
const strip = st => st.map(s => [s[0], s[1]])
for (const i of only) {
  const d = LV[i]
  const s = E.runScript(d, strip(d.solve)), ws = [d.wrong].concat(d.wrongs || []).map(st => E.runScript(d, strip(st))), n = E.runScript(d, [], { limit: 25 })
  const r = sweepLevel(d), robust = r.ns === r.s.length && r.nw === r.w.length
  const ok = s.state === 'clear' && ws.every(w => w.state === 'fail') && n.state !== 'clear' && robust
  if (!ok) bad++
  console.log(`${ok ? 'ok ' : 'NG '} ${String(i + 1).padStart(2)} ${d.key.padEnd(8)} ropes=${d.ropes.length} solve=${f(s)} | wrong=${ws.map(f).join(', ')} | none=${f(n)} | sweep ${r.ns}/${r.s.length} ${r.nw}/${r.w.length}`)
}
process.exit(bad ? 1 : 0)
