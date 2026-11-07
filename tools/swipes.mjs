// 台本の各手で、切る瞬間のなぞる線（ひもに直角・片側 R）が他のひもを横切らないか・画面の枠内か。node tools/swipes.mjs [面] [R=40]
import { E, LV } from './sweeplib.mjs'
const only = process.argv[2] && /^\d+$/.test(process.argv[2]) ? [Number(process.argv[2]) - 1] : LV.map((_, i) => i), R = Number(process.argv[3] || 40)
function segX(ax, ay, bx, by, cx, cy, dx, dy) { const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return false; const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1 }
// ひもの切る所を通る線を、直角→横→斜め…の順に試し、そのひもだけを横切る最初の線を返す（verify.mjs と同じ考え）
export function pickSwipe(w, id, R) {
  const p = E.ropePoint(w, id), base = Math.atan2(p.tx, -p.ty)
  for (const a of [base, 0, base + 0.45, base - 0.45, base + 0.9, base - 0.9, base + 1.3, base - 1.3]) {
    const nx = Math.cos(a), ny = Math.sin(a), x0 = p.x - nx * R, y0 = p.y - ny * R, x1 = p.x + nx * R, y1 = p.y + ny * R
    if (Math.min(x0, x1) < 2 || Math.max(x0, x1) > 358 || Math.min(y0, y1) < 4 || Math.max(y0, y1) > 598) continue
    let clash = false
    for (const r of w.ropes) { if (r.anyCut) continue; let hit = false; for (let j = 0; j < r.n; j++) { const q0 = E.nodePos(r, j), q1 = E.nodePos(r, j + 1); if (segX(x0, y0, x1, y1, q0.x, q0.y, q1.x, q1.y)) { hit = true; break } } if (hit !== (r.id === id)) { clash = true; break } }
    if (!clash) return { x0, y0, x1, y1 }
  }
  return null
}
let bad = 0
for (const i of only) {
  const d = LV[i], out = []
  for (const [name, st] of [['solve', d.solve]].concat([d.wrong].concat(d.wrongs || []).map((w, k) => ['wrong' + k, w]))) {
    const w = E.create(d); E.prepare(w)
    let k = 0, base = 0
    while (w.t < 60 && k < st.length && w.state === 'play') {
      if (w.t >= base + st[k][1] - 1e-9) {
        const id = st[k][0], sw = pickSwipe(w, id, R)
        if (!sw) out.push(`${name}:${id} no clean swipe`)
        E.cut(w, id); base = w.t; k++
      }
      E.step(w); w.events.length = 0
    }
  }
  const u = [...new Set(out)]
  if (u.length) bad++
  console.log(`${String(i + 1).padStart(2)} ${d.key.padEnd(8)} ${u.length ? u.join('  ') : 'ok'}`)
}
process.exit(bad ? 1 : 0)
