import './mute-auto.mjs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 検証。node verify.mjs（音は出さない。切る操作は全部、ひもの画面座標を本物のマウス・指でなぞる／押す）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5961
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
async function open(browser, opts = {}, q = '') {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('keep')) localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0 + q); await p.waitForFunction(() => window.__roperReady, null, { timeout: 15000 })
  return p
}
// ボタンを本物のマウス・指で押す（CTA は脈打つので座標で押す）
const tap = async (p, sel, touch) => { const r = await p.locator(sel).boundingBox(); if (!r) throw new Error('no box ' + sel); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (touch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y) }
// ひもを横切る線（画面座標）。ひもの向きに直角に 72px
async function swipeLine(p, id) {
  const xy = await p.evaluate(id => roper.ropeXY(id), id)
  expect(xy, 'rope not found ' + id)
  const nx = -xy.ty, ny = xy.tx, L = 36
  return { x0: xy.x - nx * L, y0: xy.y - ny * L, x1: xy.x + nx * L, y1: xy.y + ny * L, x: xy.x, y: xy.y }
}
const cutState = p => p.evaluate(() => roper.w.ropes.map(r => r.id + (r.anyCut ? 1 : 0)).join())
// how: 'mouse'（なぞる）・'touch'（Chromium の指でなぞる。CDP の本物のタッチ）・'tap'（指で押すだけ）
async function cutRope(p, id, how) {
  const s = await swipeLine(p, id)
  const vw = await p.evaluate(() => [innerWidth, innerHeight, document.querySelector('.hud').getBoundingClientRect().bottom])
  expect(s.x > 0 && s.x < vw[0] && s.y > vw[2] && s.y < vw[1], `rope ${id} cut point off screen ${Math.round(s.x)},${Math.round(s.y)}`)
  const before = await p.evaluate(id => roper.w.ropes.find(r => r.id === id).anyCut, id)
  expect(!before, 'already cut ' + id)
  const others = await p.evaluate(id => roper.w.ropes.filter(r => r.id !== id).map(r => r.anyCut), id)
  if (how === 'tap') await p.touchscreen.tap(s.x, s.y)
  else if (how === 'touch') {
    const cdp = p.__cdp || (p.__cdp = await p.context().newCDPSession(p))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.x0, y: s.y0 }] })
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: s.x0 + (s.x1 - s.x0) * k / 8, y: s.y0 + (s.y1 - s.y0) * k / 8 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    await p.mouse.move(s.x0, s.y0); await p.mouse.down()
    await p.mouse.move(s.x1, s.y1, { steps: 8 }); await p.mouse.up()
  }
  const after = await p.evaluate(id => roper.w.ropes.find(r => r.id === id).anyCut, id)
  expect(after, `${how} on rope ${id} did not cut`)
  const others2 = await p.evaluate(id => roper.w.ropes.filter(r => r.id !== id).map(r => r.anyCut), id)
  expect(others.every((v, i) => v === others2[i] || v), `${how} on ${id} also cut another rope`)
}
const finishRun = p => p.evaluate(() => { for (let i = 0; i < 2400 && !roper.sheet; i++) roper.dbg.step(1); return { state: roper.w.state, reason: roper.w.reason, t: +roper.w.t.toFixed(2), sheet: roper.sheet } })
// 台本と同じ間合いで、時間を止めたまま進めて切る
async function playLevel(p, i, steps, how) {
  await p.evaluate(i => { roper.load(i, { variant: { tie: false } }); roper.dbg.pause(true); roper.dbg.settleView() }, i)
  for (const [id, wait] of steps) {
    await p.evaluate(n => roper.dbg.step(n), Math.ceil(wait * 60 - 1e-6))
    if (await p.evaluate(() => roper.w.state !== 'play')) break   // 先に決着したら、残りは切れない
    await cutRope(p, id, how)
  }
  return finishRun(p)
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button,main:not([hidden]) a,#bMute')) { if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue; const r = el.getBoundingClientRect(); if (!r.width) continue; if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  return { H, over: over.slice(0, 6) }
})
const variance = (p, sel) => p.evaluate(sel => {
  const c = document.querySelector(sel), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 13) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
}, sel)
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [430, 932, 'big']]
const N = 12

const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser)
await t('起動時にエラーが出ない・ロード画面が消える', async () => { expect(p.errs.length === 0, p.errs.join('|')); const g = await p.evaluate(() => document.getElementById('boot').classList.contains('gone')); expect(g, 'boot visible') })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect, cta: getComputedStyle(document.getElementById('stage')).touchAction }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none' && r.cta === 'none', JSON.stringify(r))
})
await t('OGP 一式がある', async () => {
  const r = await p.evaluate(() => ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]')))
  expect(r.every(Boolean), JSON.stringify(r))
})
await t('タイトルの後ろで広告みたいに勝手に解く（何か描けている・ひもが切れる）', async () => {
  await p.waitForTimeout(2200); const v = await variance(p, '#stage'); const cut = await p.evaluate(() => roper.w.cuts.length)
  expect(v > 300 && cut >= 1, JSON.stringify({ v, cut })); return v
})
await t('始めるで1面・チュートリアルの指がひもの近くにある', async () => {
  await tap(p, '#bStart')
  const r = await p.evaluate(() => ({ lv: roper.lv, tut: roper.tutor, mode: roper.mode }))
  expect(r.lv === 0 && r.tut && r.mode === 'play', JSON.stringify(r))
  await p.waitForTimeout(200)
  const d = await p.evaluate(() => { const el = document.getElementById('tutor').getBoundingClientRect(), xy = roper.ropeXY('A'); return { dx: Math.round(el.left + 60 - xy.x), dy: Math.round(el.top - xy.y) } })
  expect(Math.abs(d.dx) < 4 && d.dy > 0 && d.dy < 20, JSON.stringify(d)); return d
})
await t('チュートリアルは切ると消える・遊び中の文字は2つまで・音は実際には無音（Chromium）', async () => {
  await p.evaluate(() => roper.dbg.pause(true))
  await cutRope(p, 'A', 'mouse')
  await p.evaluate(() => roper.dbg.step(30))
  const r = await p.evaluate(() => ({ tut: roper.tutor, texts: roper.texts(), ok: window.__muteOk(), calls: window.__soundCalls }))
  expect(!r.tut && r.texts.length <= 2 && r.ok && r.calls > 0, JSON.stringify(r)); return r
})

// ---- 全12面: 本物のなぞりで、解き方ならクリア・間違いなら失敗・何もしないとクリアしない
for (let i = 0; i < N; i++) {
  const d = await p.evaluate(i => ({ solve: window.LEVELS[i].solve, wrong: window.LEVELS[i].wrong }), i)
  await t(`${i + 1}面: 解き方でクリア ${d.solve.map(s => s.join('@')).join('→')}`, async () => {
    const r = await playLevel(p, i, d.solve, 'mouse'); expect(r.state === 'clear' && r.sheet, JSON.stringify(r))
    const nx = await p.evaluate(() => document.getElementById('bNext').textContent); expect(nx === '次へ', nx)
    await p.screenshot({ path: `${ROOT}/shots/lv${i + 1}-clear.png` })
    return r.t
  })
  await t(`${i + 1}面: 間違いで失敗 ${d.wrong.map(s => s.join('@')).join('→')}`, async () => {
    const r = await playLevel(p, i, d.wrong, 'mouse'); expect(r.state === 'fail' && r.sheet, JSON.stringify(r))
    const nx = await p.evaluate(() => [document.getElementById('bNext').textContent, document.getElementById('narr').textContent])
    expect(nx[0] === 'もう一回' && nx[1].length > 4, JSON.stringify(nx))
    await p.screenshot({ path: `${ROOT}/shots/lv${i + 1}-fail.png` })
    return r.reason
  })
  await t(`${i + 1}面: 何もしないとクリアしない（20秒）`, async () => {
    await p.evaluate(i => { roper.load(i, { variant: { tie: false } }); roper.dbg.pause(true); roper.dbg.step(1200) }, i)
    const r = await p.evaluate(() => ({ s: roper.w.state, cuts: roper.w.cuts.length })); expect(r.s !== 'clear' && r.cuts === 0, JSON.stringify(r)); return r.s
  })
}
await t('ひもの無い所をなぞっても・押しても切れない', async () => {
  await p.evaluate(() => { roper.load(0); roper.dbg.pause(true); roper.dbg.settleView() })
  const v = await p.evaluate(() => roper.view)
  await p.mouse.move(v.ox + 230 * v.s, v.oy + 400 * v.s); await p.mouse.down(); await p.mouse.move(v.ox + 330 * v.s, v.oy + 380 * v.s, { steps: 6 }); await p.mouse.up()
  await p.mouse.click(v.ox + 300 * v.s, v.oy + 200 * v.s)
  const n = await p.evaluate(() => roper.w.cuts.length); expect(n === 0, n)
})
await t('押すだけ（クリック）でも切れる', async () => {
  await p.evaluate(() => { roper.load(0); roper.dbg.pause(true); roper.dbg.settleView() })
  const xy = await p.evaluate(() => roper.ropeXY('A')); await p.mouse.click(xy.x + 8, xy.y)
  const n = await p.evaluate(() => roper.w.cuts.map(c => c.id).join()); expect(n === 'A', n)
})
await t('2本まとめてなぞると2本とも切れる', async () => {
  await p.evaluate(() => { roper.load(1); roper.dbg.pause(true); roper.dbg.settleView() })
  const a = await p.evaluate(() => roper.ropeXY('A')), b = await p.evaluate(() => roper.ropeXY('B'))
  await p.mouse.move(a.x - 30, a.y); await p.mouse.down(); await p.mouse.move(b.x + 30, b.y, { steps: 14 }); await p.mouse.up()
  const n = await p.evaluate(() => roper.w.cuts.map(c => c.id).sort().join()); expect(n === 'A,B', n)
})
await t('2回失敗した面は、次に切るひもが光る（ヒント）', async () => {
  const before = await p.evaluate(() => { roper.load(1); return roper.hint })   // 2面は上で1回失敗している
  await playLevel(p, 1, await p.evaluate(() => window.LEVELS[1].wrong), 'mouse')
  const after = await p.evaluate(() => { roper.load(1); return roper.hint })
  expect(before === null && after === 'B', JSON.stringify({ before, after }))
  await p.evaluate(() => roper.dbg.pause(true)); await cutRope(p, 'B', 'mouse'); expect(await p.evaluate(() => roper.hint) === 'A', 'hint moves to next rope')
})
await t('タイミングの面のヒントは、切る時だけ強く光る（7面）', async () => {
  const r = await p.evaluate(() => { roper.dbg.fails(6, 2); roper.load(6); roper.dbg.pause(true); const a = [roper.hint, roper.dbg.hintNow()]; roper.dbg.step(Math.round(3.6 * 60)); a.push(roper.dbg.hintNow()); return a })
  expect(r[0] === 'A' && r[1] === false && r[2] === true, JSON.stringify(r))
})
await t('失敗の語りは最初が「広告では、ここで成功していました。」', async () => {
  const q = await open(browser)
  await q.evaluate(() => { roper.load(0); roper.dbg.pause(true); roper.dbg.settleView() })
  await q.evaluate(() => roper.dbg.step(30)); await cutRope(q, 'B', 'mouse'); await finishRun(q)
  const n = await q.evaluate(() => document.getElementById('narr').textContent); await q.close()
  expect(n === '広告では、ここで成功していました。', n)
})
await t('画像で保存・Xでポスト（失敗の画面）', async () => {
  await playLevel(p, 0, [['B', 0.5]], 'mouse')
  const dl = p.waitForEvent('download', { timeout: 5000 })
  await tap(p, '#bSave'); const d = await dl
  const href = await p.evaluate(() => document.getElementById('bPost').href)
  expect(/rope-rescue-1\.png/.test(d.suggestedFilename()) && /x\.com\/intent\/post/.test(href) && /tom3games\.github\.io%2Frope-rescue/.test(href), d.suggestedFilename() + ' ' + href)
})
await t('まれな変化（ネクタイの魔物）でも落ちない', async () => {
  await p.evaluate(() => { roper.load(4, { variant: { tie: true } }); roper.dbg.pause(true); roper.dbg.settleView() })
  const st = await p.evaluate(() => window.LEVELS[4].solve)
  for (const [id, wait] of st) { await p.evaluate(n => roper.dbg.step(n), Math.ceil(wait * 60 - 1e-6)); await cutRope(p, id, 'mouse') }
  const r = await finishRun(p); await p.screenshot({ path: `${ROOT}/shots/rare.png` })
  expect(r.state === 'clear' && !p.errs.length, JSON.stringify(r) + p.errs.join('|'))
})
await t('12面クリアで最後の画面（絵が描けている・最初から・支援リンク）', async () => {
  const r = await playLevel(p, 11, await p.evaluate(() => window.LEVELS[11].solve), 'mouse'); expect(r.state === 'clear', JSON.stringify(r))
  await tap(p, '#bNext'); await p.waitForTimeout(300)
  const v = await variance(p, '#endCv'), m = await p.evaluate(() => roper.mode), sup = await p.evaluate(() => !!document.getElementById('tmSupport'))
  await p.screenshot({ path: `${ROOT}/shots/end.png` })
  expect(m === 'end' && v > 300 && sup, JSON.stringify({ m, v, sup }))
  await tap(p, '#bAgain'); expect(await p.evaluate(() => roper.mode === 'play' && roper.lv === 0), 'again')
})
await t('English に切り替えると文言が英語', async () => {
  await tap(p, '#bMenu'); await tap(p, '#bLang')
  const r = await p.evaluate(() => [document.getElementById('bStart').textContent, document.getElementById('tl2').textContent])
  await p.screenshot({ path: `${ROOT}/shots/title-en.png` })
  await tap(p, '#bStart')
  const c = await p.evaluate(() => document.getElementById('capT').textContent)
  expect(/Play|Continue/.test(r[0]) && /[A-Za-z]/.test(c), JSON.stringify(r) + c)
  await tap(p, '#bMenu'); await tap(p, '#bLang')
})
await t('ミュートの切り替え', async () => {
  await tap(p, '#bMute'); const a = await p.evaluate(() => Snd.muted); await tap(p, '#bMute'); const b = await p.evaluate(() => Snd.muted)
  expect(a === true && b === false, [a, b])
})
await t('ここまでエラーなし（Chromium）', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---- Chromium のスマホ（本物のタッチでなぞる）で全12面
{
  const q = await open(browser, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  for (let i = 0; i < N; i++) await t(`タッチでなぞって ${i + 1}面クリア`, async () => { const r = await playLevel(q, i, await q.evaluate(i => window.LEVELS[i].solve, i), 'touch'); expect(r.state === 'clear', JSON.stringify(r)) })
  await t('タッチ: エラーなし・無音', async () => { const r = await q.evaluate(() => window.__muteOk()); expect(r && !q.errs.length, q.errs.join('|')) })
  await q.close()
}

// ---- 3サイズ × 全画面で一画面に収まる・切る所が全部画面内で押せる幅
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  const views = {}
  await q.waitForTimeout(400)
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await tap(q, '#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await tap(q, '#bHowClose')
  await tap(q, '#bStages'); views.stages = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-stages.png` }); await tap(q, '#bStBack')
  await tap(q, '#bStart'); await q.waitForTimeout(300); views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await t(`${name}: 全12面のひもの切る所となぞる線が画面内・押せる幅44px以上`, async () => {
    const out = []
    for (let i = 0; i < N; i++) {
      const r = await q.evaluate(i => { roper.load(i); roper.dbg.pause(true); roper.dbg.settleView(); const v = roper.view, hud = document.querySelector('.hud').getBoundingClientRect().bottom; return { pts: roper.w.ropes.map(r => [r.id, roper.ropeXY(r.id)]), s: v.s, top: v.oy, hud, W: innerWidth, H: innerHeight } }, i)
      for (const [id, xy] of r.pts) {
        const nx = -xy.ty * 36, ny = xy.tx * 36
        for (const [x, y] of [[xy.x, xy.y], [xy.x - nx, xy.y - ny], [xy.x + nx, xy.y + ny]]) if (x < 2 || x > r.W - 2 || y < r.hud || y > r.H - 2) out.push(`${i + 1}${id}:${Math.round(x)},${Math.round(y)}`)
      }
      if (r.top < r.hud - 1) out.push(`${i + 1}: world under hud`)
      if (Math.max(14, 23 / r.s) * 2 * r.s < 44) out.push(`${i + 1}: hit ${r.s}`)
    }
    expect(!out.length, out.join(' '))
  })
  await q.evaluate(() => { roper.load(0); roper.dbg.pause(true); roper.dbg.settleView() })
  await cutRope(q, 'B', 'mouse'); await finishRun(q); await q.evaluate(() => roper.dbg.pause(false)); await q.waitForTimeout(700)
  views.fail = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-fail.png` })
  await t(`${name}: 決着の時、勇者が板に隠れない`, async () => {
    const r = await q.evaluate(() => { const v = roper.view, top = document.getElementById('sheet').getBoundingClientRect().top; return { heroY: v.oy + 576 * v.s, top } })
    expect(r.heroY <= r.top + 2, JSON.stringify(r)); return r
  })
  await playLevel(q, 11, await q.evaluate(() => window.LEVELS[11].solve), 'mouse')
  await tap(q, '#bNext'); await q.waitForTimeout(300)
  views.end = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-end.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()

// ---- WebKit（iPhone 相当）: 指で押して切る・マウスでなぞる
const wb = await webkit.launch()
const wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: 始めるをタップして1面を指で切って解く', async () => {
  await tap(wp, '#bStart', true); await wp.evaluate(() => roper.dbg.pause(true))
  await cutRope(wp, 'A', 'tap'); const r = await finishRun(wp)
  expect(r.state === 'clear', JSON.stringify(r))
})
await t('WebKit: 実際には無音（タップで音を鳴らしたあと）', async () => { const r = await wp.evaluate(() => ({ ok: window.__muteOk(), calls: window.__soundCalls })); expect(r.ok && r.calls > 0, JSON.stringify(r)); return r })
for (let i = 1; i < N; i++) {
  await t(`WebKit: ${i + 1}面を指で押して解く`, async () => { const r = await playLevel(wp, i, await wp.evaluate(i => window.LEVELS[i].solve, i), 'tap'); expect(r.state === 'clear', JSON.stringify(r)) })
}
await t('WebKit: マウスでなぞって2面を解く', async () => { const r = await playLevel(wp, 1, await wp.evaluate(() => window.LEVELS[1].solve), 'mouse'); expect(r.state === 'clear', JSON.stringify(r)) })
await wp.screenshot({ path: `${ROOT}/shots/webkit-2.png` })
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
