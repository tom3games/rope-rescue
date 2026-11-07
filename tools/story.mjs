import '../mute-auto.mjs'
// 失敗（または解き方）の決着の瞬間を面ごとに撮る（音は出さない）。node tools/story.mjs [--solve] [--after=秒]  出力は STORY_OUT か shots/story
import { MUTE_LAUNCH, muteContext } from '../mute.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = new URL('..', import.meta.url).pathname, PORT = 6273
const OUT = process.env.STORY_OUT || ROOT + 'shots/story'
mkdirSync(OUT, { recursive: true })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const args = process.argv.slice(2), solve = args.includes('--solve'), after = Number((args.find(a => a.startsWith('--after=')) || '--after=0.5').slice(8))
const b = await chromium.launch(MUTE_LAUNCH)
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } })
await muteContext(ctx)
const p = await ctx.newPage()
await p.goto(`http://localhost:${PORT}/?notut=1`); await p.waitForFunction(() => window.__roperReady)
const N = await p.evaluate(() => window.LEVELS.length)
for (let i = 0; i < N; i++) {
  await p.evaluate(([i, solve, after]) => {
    roper.load(i, { variant: { tie: false } }); roper.dbg.pause(true); roper.dbg.settleView()
    const d = window.LEVELS[i], st = solve ? d.solve : d.wrong, w = roper.w
    let k = 0, base = 0
    for (let f = 0; f < 3000; f++) {
      if (k < st.length && w.t >= base + st[k][1] - 1e-9 && w.state === 'play') { window.RopeEngine.cut(w, st[k][0]); base = w.t; k++ }
      roper.dbg.step(1)
      if (w.state !== 'play') { roper.dbg.step(Math.round(after * 60)); break }
    }
  }, [i, solve, after])
  await p.screenshot({ path: `${OUT}/${solve ? 's' : 'w'}${i + 1}.png` })
}
await b.close(); server.kill()
console.log(OUT)
