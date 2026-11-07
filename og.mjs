import './mute-auto.mjs'
// SNS 用の画像（og.png 1200x630）と icon.png を作る。遊んでいる一番の山場（ひもを切った直後、勇者がとげの上を飛ぶ）＋題名。音は出さない
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname, PORT = 6275
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH)
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 1200, height: 630 } })
await muteContext(ctx)
const p = await ctx.newPage()
await p.goto(`http://localhost:${PORT}/?lv=11&notut=1`); await p.waitForFunction(() => window.__roperReady)
await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => {
  roper.load(10, { variant: { tie: false } }); roper.dbg.pause(true)
  for (const id of ['vPlay']) document.getElementById(id).hidden = true
  document.getElementById('bMute').hidden = true
  roper.dbg.step(Math.round(3.3 * 60))
  const pt = window.RopeEngine.ropePoint(roper.w, 'A')
  window.RopeEngine.cut(roper.w, 'A'); roper.dbg.step(16)
  roper.w.hero.fear = 1
  roper.dbg.trail([[pt.x - 46, pt.y + 24, 0.09], [pt.x - 22, pt.y + 12, 0.06], [pt.x, pt.y, 0.04], [pt.x + 24, pt.y - 12, 0.02], [pt.x + 48, pt.y - 24, 0]])
  roper.dbg.say('とどけぇぇ', 99)
  const s = 1.2; roper.dbg.setView({ s, ox: 6, oy: -58 * s })
  const d = document.createElement('div'); d.id = 'ogt'
  d.innerHTML = `<p class="a">勇者と宝箱</p><h1>ひもを切れ！</h1><p class="b">切る順番と、切る瞬間。</p><p class="c">基本12面＋上級18面・ブラウザで無料</p>`
  document.body.appendChild(d)
  const st = document.createElement('style'); st.textContent = `
    #ogt{position:fixed;left:450px;top:0;width:750px;height:630px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:0 40px 0 34px;z-index:9}
    #ogt .a{font-family:"RocknRoll One";font-size:40px;background:#fff;color:#111;padding:2px 14px 4px;transform:rotate(-2deg)}
    #ogt h1{font-family:"RocknRoll One";font-weight:400;font-size:104px;line-height:1.05;color:#f2c230;-webkit-text-stroke:12px #0d0a07;paint-order:stroke fill;filter:drop-shadow(0 8px 0 #000);transform:rotate(-2deg);margin:6px 0 4px;white-space:nowrap}
    #ogt .b{font-family:"Shippori Mincho B1";font-weight:600;font-size:44px;color:#fff;text-shadow:0 3px 8px #000}
    #ogt .c{margin-top:22px;font-size:24px;font-weight:700;color:#d8c9b0}`
  document.head.appendChild(st)
})
await p.waitForTimeout(120)
await p.screenshot({ path: `${ROOT}/og.png` })
// アイコン: ひもにぶら下がる勇者
await p.setViewportSize({ width: 192, height: 192 })
await p.evaluate(() => {
  document.getElementById('ogt').remove()
  const c = document.createElement('canvas'); c.width = 192; c.height = 192; c.id = 'ic'; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99'
  document.body.appendChild(c); const g = c.getContext('2d')
  g.fillStyle = '#3a2e25'; g.fillRect(0, 0, 192, 192)
  g.lineCap = 'round'; g.strokeStyle = '#2b1a0c'; g.lineWidth = 12; g.beginPath(); g.moveTo(96, 0); g.lineTo(96, 40); g.stroke(); g.strokeStyle = '#b98a4e'; g.lineWidth = 7.5; g.stroke()
  g.save(); g.translate(96, 186); g.scale(2.55, 2.55); g.translate(-180, -70)
  roper.art.drawHero(g, { x: 180, y: 70, dead: false, fear: 1, joy: 0, wet: 0 }, 0.3, false, true); g.restore()
})
await p.screenshot({ path: `${ROOT}/icon.png` })
await b.close(); server.kill()
console.log('og.png icon.png')
