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
  await p.screenshot({ path: `shots/live-${name}.png` })
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
