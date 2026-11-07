import './mute-auto.mjs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
import { chromium, webkit } from 'playwright'
import { execSync } from 'node:child_process'
// 個人のアカウント名は公開リポジトリに書かない。実行時に gh から取る
const OWNER = (() => { try { return execSync('gh api user -q .login', { encoding: 'utf8' }).trim().toLowerCase() } catch { return '' } })()
const URL0 = 'https://tom3games.github.io/rope-rescue/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(bt === chromium ? MUTE_LAUNCH : {}), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__roperReady, null, { timeout: 15000 })
  // ---- 遊びの通し（タイトルから遊ぶ、1面のひもを指でなぞる・押す、クリアの板）
  { const r = await p.locator('#bStart').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2) }
  await p.waitForTimeout(400)
  const xy = await p.evaluate(() => roper.ropeXY(roper.w.def.solve[0][0]))
  if (opts.hasTouch) await p.touchscreen.tap(xy.x, xy.y)
  else { await p.mouse.move(xy.x - 36, xy.y); await p.mouse.down(); await p.mouse.move(xy.x + 36, xy.y, { steps: 8 }); await p.mouse.up() }
  await p.waitForFunction(() => roper.sheet, null, { timeout: 20000 }).catch(() => errs.push('no result sheet'))
  out.push(`${name}: state=${await p.evaluate(() => roper.w.state)} muteOk=${await p.evaluate(() => window.__muteOk())}`)
  // ---- 上級の1面（23面 門・4本）を、時間を止めて台本の間合いで、本物のマウス／指で切る
  const hard = await p.evaluate(() => { roper.load(22, { variant: { tie: false } }); roper.dbg.pause(true); roper.dbg.settleView(); return window.LEVELS[22].solve })
  for (const [id, wait] of hard) {
    await p.evaluate(n => roper.dbg.step(n), Math.ceil(wait * 60 - 1e-6))
    const sw = await p.evaluate(id => {
      const E = window.RopeEngine, w = roper.w, v = roper.view, pt = E.ropePoint(w, id), top = document.querySelector('.hud').getBoundingClientRect().bottom
      const segX = (ax, ay, bx, by, cx, cy, dx, dy) => { const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return false; const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1 }
      const sx = x => v.ox + x * v.s, sy = y => v.oy + y * v.s, b = Math.atan2(pt.tx, -pt.ty), X = sx(pt.x), Y = sy(pt.y)
      for (const a of [b, 0, b + 0.45, b - 0.45, b + 0.9, b - 0.9]) {
        const x0 = X - Math.cos(a) * 36, y0 = Y - Math.sin(a) * 36, x1 = X + Math.cos(a) * 36, y1 = Y + Math.sin(a) * 36
        if (Math.min(y0, y1) < top + 1 || Math.min(x0, x1) < 2 || Math.max(x0, x1) > innerWidth - 2) continue
        if (w.ropes.every(q => { if (q.anyCut) return true; let hit = false; for (let j = 0; j < q.n; j++) { const a0 = E.nodePos(q, j), a1 = E.nodePos(q, j + 1); if (segX(x0, y0, x1, y1, sx(a0.x), sy(a0.y), sx(a1.x), sy(a1.y))) { hit = true; break } } return hit === (q.id === id) })) return { x0, y0, x1, y1, X, Y }
      }
      return { X, Y }
    }, id)
    if (opts.hasTouch) await p.touchscreen.tap(sw.X, sw.Y)
    else { await p.mouse.move(sw.x0, sw.y0); await p.mouse.down(); await p.mouse.move(sw.x1, sw.y1, { steps: 8 }); await p.mouse.up() }
  }
  const hr = await p.evaluate(() => { for (let i = 0; i < 2400 && !roper.sheet; i++) roper.dbg.step(1); return roper.w.state + ' cuts=' + roper.w.cuts.map(c => c.id).join('') })
  out.push(`${name}: lv23 ${hr}`)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const ad = await p.evaluate(async () => { const h = await (await fetch(location.pathname + '?t=' + Date.now())).text(), d = await (await fetch('data.js?t=' + Date.now())).text(); return /広告/.test(h + d + document.body.innerText) })
  out.push(`${name}: title=${await p.title()} adText=${ad ? 'FOUND' : 'none'}`)
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
const b = await chromium.launch(MUTE_LAUNCH), p = await b.newPage()
for (const u of ['https://github.com/tom3games/rope-rescue', 'https://github.com/tom3games/rope-rescue/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} owner=${OWNER && (await p.content()).toLowerCase().includes(OWNER) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
