// 間合いを変えて回す共通の部品（check.mjs・sweep.mjs が使う）
// 上級の面（adv）: solve の各手に 3つ目の印。無し = 0.8〜6秒のどれでも、'w' = その秒数以上ならいつでも、't' = その時の前後0.3秒
// 間違い（wrong と wrongs）は、印の無い手を 0.8〜6秒の同じ間合いにそろえて全部失敗すること
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const root = new URL('..', import.meta.url).pathname
vm.runInThisContext(readFileSync(root + 'engine.js', 'utf8')); vm.runInThisContext(readFileSync(root + 'levels.js', 'utf8'))
export const E = globalThis.RopeEngine, LV = globalThis.LEVELS
export const W = [0.8, 1, 1.3, 2, 2.7, 4, 6], O = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3], WAIT = [0, 0.4, 1, 2, 3.5]
const strip = st => st.map(s => [s[0], s[1]])
export function solveVariants(d) {
  if (!d.adv) return d.timing ? O.map(o => strip(d.solve).map((s, k) => [s[0], s[1] + (k === 0 ? o : 0)])) : W.map(v => strip(d.solve).map(s => [s[0], v]))
  const out = [strip(d.solve)]
  d.solve.forEach((s, k) => {
    const set = s[2] === 't' ? O.map(o => s[1] + o) : s[2] === 'w' ? WAIT.map(o => s[1] + o) : W
    for (const v of set) out.push(strip(d.solve).map((q, j) => j === k ? [q[0], v] : q))
  })
  for (const v of W) out.push(d.solve.map(q => [q[0], q[2] ? q[1] : v]))
  return out
}
export function wrongVariants(d) {
  const list = [d.wrong].concat(d.wrongs || [])
  if (!d.adv) return d.timing ? [strip(d.wrong)] : W.map(v => strip(d.wrong).map(s => [s[0], v]))
  const out = []
  for (const st of list) { out.push(strip(st)); if (!st.some(s => s[2])) for (const v of W) out.push(st.map(q => [q[0], v])); else for (const v of W) out.push(st.map(q => [q[0], q[2] ? q[1] : v])) }
  return out
}
export function sweepLevel(d) {
  const s = solveVariants(d).map(st => [st, E.runScript(d, st)])
  const w = wrongVariants(d).map(st => [st, E.runScript(d, st)])
  return { s, w, ns: s.filter(x => x[1].state === 'clear').length, nw: w.filter(x => x[1].state === 'fail').length }
}
