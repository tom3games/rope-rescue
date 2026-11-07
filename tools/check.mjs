// 全部の面を node で回す。解き方でクリア・間違いで失敗・何もしないとクリアしない・間合いを変えても同じ
// node tools/check.mjs [面番号]
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const root = new URL('..', import.meta.url).pathname
vm.runInThisContext(readFileSync(root + 'engine.js', 'utf8'))
vm.runInThisContext(readFileSync(root + 'levels.js', 'utf8'))
const E = globalThis.RopeEngine, LV = globalThis.LEVELS
const only = process.argv[2] ? [Number(process.argv[2]) - 1] : LV.map((_, i) => i)
let bad = 0
const f = x => `${x.state}${x.reason ? '/' + x.reason : ''} t${x.t.toFixed(1)}`
for (const i of only) {
  const d = LV[i]
  const s = E.runScript(d, d.solve), w = E.runScript(d, d.wrong), n = E.runScript(d, [], { limit: 25 })
  let sweep
  if (d.timing) {
    // 切る時を前後にずらしても、解き方はクリア（人の指は0.25秒くらいずれる）
    sweep = [-0.25, 0.25].map(o => [E.runScript(d, d.solve.map((st, k) => [st[0], st[1] + (k === 0 ? o : 0)])).state, 'fail'])
  } else {
    sweep = [1, 1.6, 2.5, 4, 6].map(sec => [E.runScript(d, d.solve.map(st => [st[0], sec])).state, E.runScript(d, d.wrong.map(st => [st[0], sec])).state])
  }
  const robust = sweep.every(([a, b]) => a === 'clear' && b === 'fail')
  const ok = s.state === 'clear' && w.state === 'fail' && n.state !== 'clear' && robust
  if (!ok) bad++
  console.log(`${ok ? 'ok ' : 'NG '} ${String(i + 1).padStart(2)} ${d.key.padEnd(7)} solve=${f(s)} | wrong=${f(w)} | none=${f(n)} | sweep=${sweep.map(x => x.join('/')).join(' ')}`)
}
process.exit(bad ? 1 : 0)
