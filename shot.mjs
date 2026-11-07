import './mute-auto.mjs'
// 面を撮って目で見る（音は出さない）。node shot.mjs <面...> [--after=秒] [--cut=A,B]
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname, PORT = 6272
mkdirSync(ROOT + '/shots', { recursive: true })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const args = process.argv.slice(2), lvs = args.filter(a => /^\d+$/.test(a)).map(Number)
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')))
const b = await chromium.launch(MUTE_LAUNCH)
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/?notut=1`); await p.waitForFunction(() => window.__roperReady, null, { timeout: 15000 })
for (const lv of lvs) {
  await p.evaluate(i => { roper.load(i - 1, { variant: { tie: false } }); roper.dbg.pause(true); roper.dbg.settleView() }, lv)
  await p.evaluate(() => roper.dbg.step(20))
  await p.screenshot({ path: `${ROOT}/shots/lv${lv}-0.png` })
  const cuts = (opt.cut || '').split(',').filter(Boolean), after = Number(opt.after || 1.5)
  let k = 1
  for (const id of cuts) {
    await p.evaluate(([id, n]) => { window.RopeEngine.cut(roper.w, id); roper.dbg.step(n) }, [id, Math.round(after * 60)])
    await p.screenshot({ path: `${ROOT}/shots/lv${lv}-${k++}.png` })
  }
}
console.log(errs.length ? errs.join('\n') : 'no errors')
await b.close(); server.kill()
