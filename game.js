// ひもを切れ！勇者と宝箱。描画・画面・音・入力。物理は engine.js、面は levels.js、文言は data.js
;(function () {
  'use strict'
  window.__jsUp = true
  const E = window.RopeEngine, LV = window.LEVELS
  const $ = id => document.getElementById(id)
  const URL0 = 'https://tom3games.github.io/rope-rescue/'
  const Q = new URLSearchParams(location.search)
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch (e) { return d } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} },
  }
  let lang = store.get('roper_lang', null) || ((navigator.language || 'ja').indexOf('ja') === 0 ? 'ja' : 'en')
  let T = TXT[lang]
  const coarse = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window

  // ---- 状態
  const cv = $('stage'), ctx = cv.getContext('2d')
  let dpr = 1, VW = 0, VH = 0
  const view = { s: 1, ox: 0, oy: 0 }, target = { s: 1, ox: 0, oy: 0 }
  let mode = 'boot', world = null, lvIdx = 0, paused = false
  let acc = 0, lastT = performance.now(), clock = 0
  let bg = null
  const fx = [], trail = []
  let bubble = null, shake = 0, sheetOn = false, tutorOn = false, hintOn = false
  let best = store.get('roper_best', 0)
  const fails = store.get('roper_fails', {})
  let sessionFails = 0, totalFails = store.get('roper_totalFails', 0)
  let demo = null
  let muted = store.get('roper_mute', false)

  // ---- 音（録音素材だけ）
  Snd.def({
    cut: ['snd/cut1.mp3', 'snd/cut2.mp3', 'snd/cut3.mp3'], creak: ['snd/creak1.mp3', 'snd/creak2.mp3'],
    wood: ['snd/wood1.mp3', 'snd/wood2.mp3'], thud: ['snd/thud1.mp3', 'snd/thud2.mp3'], open: 'snd/open.mp3', clank: 'snd/clank.mp3',
    splash: ['snd/splash1.mp3', 'snd/splash2.mp3', 'snd/splash3.mp3'],
    steam: ['snd/steam1.mp3', 'snd/steam2.mp3'], stone: ['snd/stone1.mp3', 'snd/stone2.mp3', 'snd/stone3.mp3'],
    coin: ['snd/coin1.mp3', 'snd/coin2.mp3', 'snd/coin3.mp3'],
    grunt: ['snd/grunt1.mp3', 'snd/grunt2.mp3', 'snd/grunt3.mp3'], bub: ['snd/bub1.mp3', 'snd/bub2.mp3', 'snd/bub3.mp3'],
    boom: 'snd/boom.mp3', crack: 'snd/crack.mp3', scream: ['snd/scream1.mp3', 'snd/scream2.mp3'],
    j_win: 'snd/j_win.mp3', j_lose: 'snd/j_lose.mp3', j_end: 'snd/j_end.mp3', click: 'snd/click.mp3',
    boing: ['snd/boing1.mp3', 'snd/boing2.mp3'], plank: ['snd/plank1.mp3', 'snd/plank2.mp3'],
  })
  Snd.muted = muted
  let audioOn = false, lavaLoop = false
  function audioStart() {
    if (audioOn) { Snd.init(); return }
    audioOn = true; Snd.init(); Snd.setMute(muted)
    Snd.loop('amb', 'snd/amb_cave.mp3', 0.32)
    Snd.loop('bgm', 'snd/bgm.mp3', 0.15)
  }
  const thr = {}
  function play(name, o, gap) { const n = performance.now(); if (gap && thr[name] && n - thr[name] < gap) return; thr[name] = n; if (mode === 'play' || o && o.ui) Snd.play(name, o || {}) }

  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
  const pick = a => a[Math.floor(Math.random() * a.length)]

  // ---- 配置
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1); VW = innerWidth; VH = innerHeight
    cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr)
    calcTarget(); Object.assign(view, target); bg = null
  }
  function calcTarget() {
    let top = 0, bottom = 0
    if (mode === 'play') {
      const hud = document.querySelector('.hud'); top = hud.getBoundingClientRect().bottom + 2; bottom = 6
      if (sheetOn) bottom = Math.max(bottom, VH - $('sheet').getBoundingClientRect().top + 4)
    } else if (mode === 'title') { top = document.querySelector('.logo').getBoundingClientRect().bottom + 4; bottom = VH - $('bStart').getBoundingClientRect().top + 14 }
    const aw = VW - 8, ah = Math.max(120, VH - top - bottom)
    const s = Math.min(aw / E.W, ah / E.H)
    target.s = s; target.ox = (VW - E.W * s) / 2; target.oy = mode === 'play' ? top + Math.min(10, (ah - E.H * s) / 2) : top + (ah - E.H * s) / 2
  }

  // ---- 絵: 背景と壁（面ごとに1回）
  function drawStatic(c, w, seed) {
    const R = rng(seed + 7)
    c.save()
    c.fillStyle = '#3a2e25'; c.fillRect(0, 0, E.W, E.H)
    for (let y = 0, row = 0; y < E.H; y += 22, row++) {
      for (let x = (row % 2) * -20; x < E.W; x += 40) {
        const v = R(); c.fillStyle = `rgb(${56 + v * 14 | 0},${45 + v * 11 | 0},${36 + v * 8 | 0})`
        c.fillRect(x + 1, y + 1, 38, 20)
      }
    }
    for (const [tx, ty] of w.def.torches || [[60, 90], [300, 380]]) {
      const g = c.createRadialGradient(tx, ty, 4, tx, ty, 130); g.addColorStop(0, 'rgba(255,170,80,.30)'); g.addColorStop(1, 'rgba(255,170,80,0)')
      c.fillStyle = g; c.fillRect(tx - 130, ty - 130, 260, 260)
    }
    for (const P of w.polys) if (P.kind === 'wall' || P.kind === 'frame' || P.kind === 'floor') drawStone(c, P, R, false)
    for (const P of w.polys) if (P.kind === 'spikes') drawSpikes(c, P)
    const v = c.createLinearGradient(0, 0, 0, E.H); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.2)')
    c.fillStyle = v; c.fillRect(0, 0, E.W, E.H)
    for (const r of w.ropes) if (r.A.fixed) drawAnchor(c, r.A.x, r.A.y)
    c.restore()
  }
  function polyPath(c, P) { c.beginPath(); P.pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath() }
  function drawStone(c, P, R, cracked) {
    c.save(); polyPath(c, P); c.fillStyle = cracked ? '#a8957a' : '#85745f'; c.fill(); c.clip()
    const x0 = Math.max(-10, P.x0), x1 = Math.min(E.W + 10, P.x1), y0 = Math.max(-10, P.y0), y1 = Math.min(E.H + 10, P.y1)
    for (let y = Math.floor(y0 / 18) * 18; y < y1; y += 18) {
      for (let x = Math.floor(x0 / 32) * 32 - (Math.floor(y / 18) % 2) * 16; x < x1; x += 32) {
        const v = R(); c.fillStyle = cracked ? `rgb(${160 + v * 20 | 0},${142 + v * 18 | 0},${116 + v * 14 | 0})` : `rgb(${118 + v * 24 | 0},${103 + v * 20 | 0},${84 + v * 16 | 0})`
        c.fillRect(x + 1.2, y + 1.2, 29.6, 15.6)
        c.fillStyle = 'rgba(255,240,210,.10)'; c.fillRect(x + 1.2, y + 1.2, 29.6, 2.4)
      }
    }
    if (cracked) {
      c.strokeStyle = '#3b2c1e'; c.lineWidth = 1.8; c.beginPath()
      const cx = (P.x0 + P.x1) / 2, h = P.y1 - P.y0
      c.moveTo(cx - 2, P.y0); c.lineTo(cx + 5, P.y0 + h * 0.2); c.lineTo(cx - 4, P.y0 + h * 0.42); c.lineTo(cx + 4, P.y0 + h * 0.66); c.lineTo(cx - 3, P.y1)
      c.moveTo(cx + 5, P.y0 + h * 0.2); c.lineTo(P.x1, P.y0 + h * 0.14); c.moveTo(cx - 4, P.y0 + h * 0.42); c.lineTo(P.x0, P.y0 + h * 0.5); c.moveTo(cx + 4, P.y0 + h * 0.66); c.lineTo(P.x1, P.y0 + h * 0.74); c.stroke()
    }
    c.restore()
    c.save(); polyPath(c, P); c.strokeStyle = '#211910'; c.lineWidth = 2.4; c.lineJoin = 'round'; c.stroke()
    c.strokeStyle = cracked ? '#d8c6a6' : '#bba98c'; c.lineWidth = 2
    for (const e of P.edges) if (e.ny < -0.5) { c.beginPath(); c.moveTo(e.ax - e.nx * 2, e.ay - e.ny * 2); c.lineTo(e.bx - e.nx * 2, e.by - e.ny * 2); c.stroke() }
    c.restore()
  }
  function drawSpikes(c, P) {
    const y0 = P.y0, y1 = P.y1
    c.save(); c.fillStyle = '#2a211a'; c.fillRect(P.x0, y1 - 4, P.x1 - P.x0, 4)
    for (let x = P.x0; x < P.x1 - 2; x += 12) {
      c.beginPath(); c.moveTo(x, y1); c.lineTo(x + 6, y0 - 6); c.lineTo(x + 12, y1); c.closePath()
      c.fillStyle = '#9aa3a8'; c.fill(); c.strokeStyle = '#1b130c'; c.lineWidth = 1.4; c.stroke()
      c.fillStyle = '#e4ecef'; c.beginPath(); c.moveTo(x + 6, y0 - 5); c.lineTo(x + 7.6, y1 - 3); c.lineTo(x + 6, y1 - 3); c.fill()
    }
    c.restore()
  }
  // バネ: 台・ばね・板。跳ねた直後は縮む
  function drawSpring(c, P, fl) {
    fl = fl == null ? E.FLOOR : fl
    // 床から板の下までの台（傾いていても浮いて見えないように）
    const ca = Math.cos(P.ang), sa = Math.sin(P.ang), hw = P.sw / 2
    const lx = P.cx - ca * hw + sa * 12, ly = P.cy - sa * hw + ca * 12, rx = P.cx + ca * hw + sa * 12, ry = P.cy + sa * hw + ca * 12
    c.save(); c.beginPath(); c.moveTo(lx + 4, ly); c.lineTo(rx - 4, ry); c.lineTo(rx - 4, fl); c.lineTo(lx + 4, fl); c.closePath()
    c.fillStyle = '#3a3d42'; c.fill(); c.strokeStyle = '#15110d'; c.lineWidth = 1.6; c.stroke()
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.beginPath(); for (let x = Math.min(lx, rx) + 10; x < Math.max(lx, rx) - 6; x += 12) { c.moveTo(x, fl - 2); c.lineTo(x, Math.max(ly, ry) - 4) } c.stroke()
    c.restore()
    c.save(); c.translate(P.cx, P.cy); c.rotate(P.ang)
    const sq = P.squash || 0, top = -5 + sq * 5
    c.fillStyle = '#4b4f55'; c.strokeStyle = '#15110d'; c.lineWidth = 1.6
    c.beginPath(); c.roundRect(-hw + 4, 8, P.sw - 8, 6, 2); c.fill(); c.stroke()
    for (const sx of [-hw * 0.55, 0, hw * 0.55]) {
      c.beginPath(); c.moveTo(sx, 8)
      for (let i = 1; i <= 4; i++) c.lineTo(sx + (i % 2 ? -5 : 5), 8 - (8 - top - 2) * i / 4)
      c.strokeStyle = '#15110d'; c.lineWidth = 3.4; c.stroke(); c.strokeStyle = '#c9ced4'; c.lineWidth = 1.6; c.stroke()
    }
    c.fillStyle = '#d23b2a'; c.beginPath(); c.roundRect(-hw, top - 4, P.sw, 6, 2); c.fill(); c.strokeStyle = '#15110d'; c.lineWidth = 1.8; c.stroke()
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-hw + 3, top - 3, P.sw - 6, 1.6)
    c.restore()
  }
  // 木の板
  function drawPlank(c, P) {
    c.save(); polyPath(c, P); c.fillStyle = '#9c6b3a'; c.fill(); c.clip()
    c.strokeStyle = 'rgba(60,35,15,.55)'; c.lineWidth = 1
    for (let x = P.x0 + 28; x < P.x1; x += 30) { c.beginPath(); c.moveTo(x, P.y0 - 20); c.lineTo(x + 2, P.y1 + 20); c.stroke() }
    c.strokeStyle = 'rgba(255,220,170,.25)'; c.beginPath(); for (const e of P.edges) if (e.ny < -0.5) { c.moveTo(e.ax, e.ay + 2.2); c.lineTo(e.bx, e.by + 2.2) } c.stroke()
    c.restore()
    c.save(); polyPath(c, P); c.strokeStyle = '#2b1a0c'; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke()
    c.fillStyle = '#3b2c1e'; for (let x = P.x0 + 8; x < P.x1 - 4; x += 30) { const y = topAt(P, x); c.beginPath(); c.arc(x, y + 5, 1.3, 0, 6.2832); c.fill() }
    c.restore()
  }
  function topAt(P, x) { let best = P.y1; for (const e of P.edges) if (e.ny < -0.5 && x >= Math.min(e.ax, e.bx) && x <= Math.max(e.ax, e.bx)) best = Math.min(best, e.ay + (e.by - e.ay) * (x - e.ax) / ((e.bx - e.ax) || 1)); return best }
  function drawAnchor(c, x, y) {
    c.save()
    c.fillStyle = '#4b4f55'; c.strokeStyle = '#15110d'; c.lineWidth = 1.6
    c.beginPath(); c.roundRect(x - 9, y - 7, 18, 7, 2); c.fill(); c.stroke()
    c.fillStyle = '#9aa0a6'; c.beginPath(); c.arc(x - 5, y - 3.5, 1.4, 0, 6.2832); c.arc(x + 5, y - 3.5, 1.4, 0, 6.2832); c.fill()
    c.strokeStyle = '#15110d'; c.lineWidth = 4; c.beginPath(); c.arc(x, y + 3, 4.2, 0, 6.2832); c.stroke()
    c.strokeStyle = '#8d939a'; c.lineWidth = 2; c.stroke()
    c.restore()
  }
  function makeBg(w) {
    const k = Math.max(1, view.s * dpr), c = document.createElement('canvas')
    c.width = Math.ceil(E.W * k); c.height = Math.ceil(E.H * k)
    const g = c.getContext('2d'); g.scale(k, k); drawStatic(g, w, w.def.seed || lvIdx * 31 + 3)
    return { c, w }
  }

  // ---- 絵: 動く物
  function drawLava(c, w, t) {
    for (const L of w.lavas) {
      c.save()
      if (L.stone) {
        c.fillStyle = '#3e3732'; c.fillRect(L.x, L.y - 2, L.w, E.H - L.y + 2)
        const R = rng(L.x | 0)
        for (let x = L.x; x < L.x + L.w; x += 11) { c.fillStyle = `rgb(${70 + R() * 30 | 0},${62 + R() * 26 | 0},${56 + R() * 22 | 0})`; c.beginPath(); c.arc(x + 5, L.y + 2 + R() * 6, 5 + R() * 3, 0, 6.2832); c.fill() }
        c.strokeStyle = '#1b130c'; c.lineWidth = 2; c.beginPath(); c.moveTo(L.x, L.y - 2); c.lineTo(L.x + L.w, L.y - 2); c.stroke()
        if (L.hotT != null && t - L.hotT < 2.5) { c.globalAlpha = 1 - (t - L.hotT) / 2.5; c.fillStyle = '#f2520f'; for (let x = L.x + 6; x < L.x + L.w; x += 23) c.fillRect(x, L.y + 6, 9, 2) }
      } else {
        const gl = c.createLinearGradient(0, L.y - 120, 0, L.y); gl.addColorStop(0, 'rgba(255,90,20,0)'); gl.addColorStop(1, 'rgba(255,90,20,.26)'); c.fillStyle = gl; c.fillRect(L.x - 20, L.y - 120, L.w + 40, 120)
        const g = c.createLinearGradient(0, L.y - 4, 0, E.H); g.addColorStop(0, '#ffb53a'); g.addColorStop(0.25, '#f2520f'); g.addColorStop(1, '#7c1804')
        c.beginPath(); c.moveTo(L.x, E.H)
        for (let x = L.x; x <= L.x + L.w + 0.1; x += 6) c.lineTo(x, L.y - 2 + Math.sin(t * 2.4 + x * 0.12) * 1.6)
        c.lineTo(L.x + L.w, E.H); c.closePath(); c.fillStyle = g; c.fill()
        c.fillStyle = '#ffe08a'
        for (let i = 0; i < L.w / 22; i++) { const k = (t * 0.6 + i * 0.37) % 1, x = L.x + 8 + ((i * 47) % (L.w - 12)); c.globalAlpha = Math.sin(k * Math.PI); c.beginPath(); c.arc(x, L.y + 2 - k * 4, 1.6 + k * 2, 0, 6.2832); c.fill() }
        c.globalAlpha = 1
        c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,110,20,.10)'; c.fillRect(L.x - 6, L.y - 16, L.w + 12, 18)
      }
      c.restore()
    }
  }
  function ropePieces(r) {
    const out = []; let cur = [E.nodePos(r, 0)]
    for (let i = 0; i < r.n; i++) {
      if (r.cut[i]) { if (cur.length > 1) out.push(cur); cur = [E.nodePos(r, i + 1)] } else cur.push(E.nodePos(r, i + 1))
    }
    if (cur.length > 1) out.push(cur)
    return out
  }
  function strokeRope(c, pc) {
    c.beginPath(); pc.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))
    c.strokeStyle = '#2b1a0c'; c.lineWidth = 5.4; c.stroke()
    c.strokeStyle = '#b98a4e'; c.lineWidth = 3.4; c.stroke()
    c.strokeStyle = '#7a5428'; c.lineWidth = 1.3; c.setLineDash([2.2, 3.6]); c.stroke(); c.setLineDash([])
  }
  function drawRopes(c, w, t, hint) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'
    for (const r of w.ropes) {
      const pieces = ropePieces(r)
      if (hint && hint === r.id && !r.anyCut) {
        const p = E.ropePoint(w, r.id), now = hintNow()
        c.strokeStyle = now ? `rgba(255,246,200,${0.55 + 0.3 * Math.sin(t * 14)})` : 'rgba(255,246,200,.16)'; c.lineWidth = now ? 18 : 12
        for (const pc of pieces) { c.beginPath(); pc.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)); c.stroke() }
        c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, 15 + 3 * Math.sin(t * 6), 0, 6.2832); c.stroke()
      }
      for (const pc of pieces) strokeRope(c, pc)
      for (let i = 0; i < r.n; i++) if (r.cut[i]) for (const k of [i, i + 1]) {   // 切り口のほつれ
        const q = E.nodePos(r, k); c.strokeStyle = '#d9b27a'; c.lineWidth = 1.2
        c.beginPath(); c.moveTo(q.x - 2.5, q.y + 2.5); c.lineTo(q.x, q.y); c.lineTo(q.x + 2.5, q.y + 2.8); c.stroke()
      }
    }
    c.restore()
  }
  function sline(c, pts, wOut, wIn, colIn) {
    c.lineCap = 'round'; c.lineJoin = 'round'
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))
    c.strokeStyle = '#1b130c'; c.lineWidth = wOut; c.stroke(); c.strokeStyle = colIn; c.lineWidth = wIn; c.stroke()
  }
  function shape(c, fill, f, lw) { c.beginPath(); f(); c.fillStyle = fill; c.fill(); c.lineWidth = lw || 1.6; c.strokeStyle = '#1b130c'; c.stroke() }
  // 勇者（足元が原点）
  function drawHero(c, h, t, win, hang, wt) {
    const dead = h.dead, how = h.how, dt = dead ? (wt != null ? wt : t) - h.deadT : 0
    const mode = dead ? 'dead' : win ? 'win' : hang ? 'hang' : h.fear > 0.35 ? 'fear' : h.joy > 0.15 ? 'joy' : h.wet > 0.2 ? 'wet' : 'idle'
    const char = dead && (how === 'lava' || how === 'bomb')
    const scared = mode === 'fear' || (mode === 'hang' && h.fear > 0.3)
    const skin = char ? '#3b322c' : '#f0bf8c', shirt = char ? '#302824' : '#f6f1e6', shorts = char ? '#28211d' : '#9a8453', boot = char ? '#1d1815' : '#5a3b22'
    c.save(); c.translate(h.x, h.y)
    let jy = 0, sx = 0
    if (mode === 'fear') sx = Math.sin(t * 55) * 1.3 * h.fear
    if (mode === 'win') jy = -Math.abs(Math.sin(t * 6)) * 12
    if (mode === 'joy') jy = -Math.abs(Math.sin(t * 10)) * 3
    if (mode === 'idle') jy = Math.sin(t * 2.4) * 0.5
    if (dead && how === 'bomb') jy = -Math.max(0, Math.sin(Math.min(1, dt * 2) * Math.PI)) * 18
    c.translate(sx, jy)
    if (dead && (how === 'monster' || how === 'spike')) { const a = Math.min(1, dt * 5); c.translate(0, -2); c.rotate(-a * 1.45); c.translate(a * 6, 0) }
    if (dead && how === 'squash') c.scale(1 + Math.min(1.3, dt * 16), Math.max(0.28, 1 - dt * 12))   // 岩の下から手足がはみ出す
    const kick = mode === 'hang' ? Math.sin(t * (scared ? 16 : 5)) * (scared ? 4 : 1.5) : 0
    shape(c, boot, () => { c.roundRect(-11 + kick, -6, 9, 6, 2); c.roundRect(2 - kick, -6, 9, 6, 2) })
    shape(c, skin, () => { c.rect(-8 + kick * 0.6, -12, 5, 6); c.rect(3 - kick * 0.6, -12, 5, 6) })
    shape(c, shorts, () => { c.roundRect(-11, -20, 22, 9, 2) })
    const arms = mode === 'hang' ? [[[-10, -33], [-12, -45], [-8, -57]], [[10, -33], [12, -45], [8, -57]]]
      : mode === 'fear' ? [[[-10, -33], [-15, -42], [-10, -51]], [[10, -33], [15, -42], [10, -51]]]
        : mode === 'joy' || mode === 'win' ? [[[-10, -33], [-18, -44], [-21, -56]], [[10, -33], [18, -44], [21, -56]]]
          : mode === 'wet' ? [[[-10, -33], [-4, -27], [6, -30]], [[10, -33], [4, -27], [-6, -30]]]
            : dead && how === 'monster' ? [[[-10, -33], [-20, -38], [-27, -36]], [[10, -33], [19, -26], [24, -22]]]
              : [[[-10, -33], [-14, -26], [-14, -19]], [[10, -33], [14, -26], [14, -19]]]
    shape(c, shirt, () => { c.moveTo(-9, -37); c.quadraticCurveTo(-13, -26, -11, -19); c.lineTo(11, -19); c.quadraticCurveTo(14, -27, 9, -37); c.closePath() })
    if (!char) { c.strokeStyle = '#d8cfbf'; c.lineWidth = 1; c.beginPath(); c.moveTo(-5, -37); c.lineTo(-4, -31); c.moveTo(5, -37); c.lineTo(4, -31); c.stroke() }
    for (const a of arms) { sline(c, a, 6.6, 3.8, skin); shape(c, skin, () => c.arc(a[2][0], a[2][1], 2.8, 0, 6.2832), 1.3) }
    const hy = -47
    shape(c, skin, () => { c.arc(-11.5, hy + 1, 2.6, 0, 6.2832); c.moveTo(14.1, hy + 1); c.arc(11.5, hy + 1, 2.6, 0, 6.2832) })
    shape(c, skin, () => c.arc(0, hy, 11.5, 0, 6.2832))
    if (dead && how === 'bomb') {
      shape(c, '#1c1714', () => { for (let i = 0; i < 7; i++) { const a = Math.PI + i * Math.PI / 6; c.moveTo(Math.cos(a) * 11 + 5, hy - 3 + Math.sin(a) * 11); c.arc(Math.cos(a) * 11, hy - 3 + Math.sin(a) * 11, 5, 0, 6.2832) } })
    } else {
      c.save(); if (dead && (how === 'lava' || how === 'squash')) { c.translate(4, -Math.min(34, dt * 60)); c.rotate(Math.min(0.6, dt)) }
      shape(c, '#c9b07a', () => c.ellipse(0, hy - 4, 17, 3.6, 0, 0, 6.2832))
      shape(c, '#dcc590', () => { c.arc(0, hy - 4.5, 12, Math.PI, 0); c.closePath() })
      c.fillStyle = '#6b4a2a'; c.fillRect(-11.6, hy - 7.2, 23.2, 2.8)
      c.restore()
    }
    const ey = hy + 1, blink = !dead && (t % 3.3) < 0.12
    c.lineCap = 'round'; c.strokeStyle = '#1b130c'; c.fillStyle = '#1b130c'
    if (dead && (how === 'monster' || how === 'spike' || how === 'squash' || how === 'fall')) {
      c.lineWidth = 1.6; c.beginPath(); for (const ex of [-4.5, 4.5]) { c.moveTo(ex - 2, ey - 2); c.lineTo(ex + 2, ey + 2); c.moveTo(ex + 2, ey - 2); c.lineTo(ex - 2, ey + 2) } c.stroke()
    } else if (char) {
      c.fillStyle = '#fff'; for (const ex of [-4.5, 4.5]) { c.beginPath(); c.arc(ex, ey, (t * 2 % 2) < 0.1 ? 0.4 : 2.2, 0, 6.2832); c.fill() }
    } else if (mode === 'joy' || mode === 'win') {
      c.lineWidth = 1.8; c.beginPath(); for (const ex of [-4.5, 4.5]) { c.moveTo(ex - 2.6, ey + 1); c.quadraticCurveTo(ex, ey - 3, ex + 2.6, ey + 1) } c.stroke()
    } else if (mode === 'wet') {
      c.lineWidth = 1.6; c.beginPath(); c.moveTo(-7, ey - 2); c.lineTo(-3, ey); c.lineTo(-7, ey + 2); c.moveTo(7, ey - 2); c.lineTo(3, ey); c.lineTo(7, ey + 2); c.stroke()
    } else if (blink) {
      c.lineWidth = 1.5; c.beginPath(); c.moveTo(-7, ey); c.lineTo(-2, ey); c.moveTo(2, ey); c.lineTo(7, ey); c.stroke()
    } else {
      const big = scared ? 3.6 : 2.7, pr = scared ? 0.9 : 1.5
      for (const ex of [-4.5, 4.5]) { shape(c, '#fff', () => c.arc(ex, ey, big, 0, 6.2832), 1.1); c.fillStyle = '#1b130c'; c.beginPath(); c.arc(ex + (scared ? 0 : 0.6), ey + (mode === 'hang' ? 1.2 : 0.3), pr, 0, 6.2832); c.fill() }
      if (scared) { c.lineWidth = 1.5; c.beginPath(); c.moveTo(-8, ey - 6); c.lineTo(-2, ey - 7.5); c.moveTo(8, ey - 6); c.lineTo(2, ey - 7.5); c.stroke() }
    }
    if (!char) shape(c, '#e3a473', () => c.arc(0, hy + 5, 2.4, 0, 6.2832), 1.1)
    c.fillStyle = char ? '#0f0c0a' : '#2a1a10'
    c.beginPath(); c.moveTo(0, hy + 6.5); c.bezierCurveTo(-4, hy + 5, -9, hy + 6, -11, hy + 9.5); c.bezierCurveTo(-12, hy + 11, -13.5, hy + 10, -13, hy + 8.4)
    c.bezierCurveTo(-11, hy + 12, -5, hy + 11, 0, hy + 9.4); c.bezierCurveTo(5, hy + 11, 11, hy + 12, 13, hy + 8.4); c.bezierCurveTo(13.5, hy + 10, 12, hy + 11, 11, hy + 9.5); c.bezierCurveTo(9, hy + 6, 4, hy + 5, 0, hy + 6.5); c.fill()
    const my = hy + 12.4
    if (scared || (dead && how !== 'bomb')) { c.fillStyle = '#5a1410'; c.beginPath(); c.ellipse(0, my + 0.6, 2.6, 3.2, 0, 0, 6.2832); c.fill() }
    else if (mode === 'joy' || mode === 'win') { c.fillStyle = '#7a1f16'; c.beginPath(); c.moveTo(-4.5, my - 1); c.quadraticCurveTo(0, my + 5.5, 4.5, my - 1); c.closePath(); c.fill() }
    else if (mode === 'hang') { c.strokeStyle = '#5a1410'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-3, my + 1); c.lineTo(3, my + 1); c.stroke() }
    if (scared) { c.fillStyle = '#7cc6ff'; c.beginPath(); c.moveTo(14, hy - 6); c.quadraticCurveTo(17.5, hy - 1, 14, hy); c.quadraticCurveTo(10.5, hy - 1, 14, hy - 6); c.fill() }
    if (mode === 'wet') { c.fillStyle = '#7cc6ff'; for (let i = 0; i < 3; i++) { const yy = hy - 8 + ((t * 30 + i * 9) % 26); c.beginPath(); c.arc(-14 + i * 14, yy, 1.4, 0, 6.2832); c.fill() } }
    if (char) { c.fillStyle = 'rgba(70,64,60,.55)'; for (let i = 0; i < 4; i++) { const k = (t * 0.7 + i * 0.25) % 1; c.beginPath(); c.arc(-6 + i * 4 + Math.sin(k * 7 + i) * 3, hy - 14 - k * 30, 3 + k * 6, 0, 6.2832); c.fill() } }
    c.restore()
  }
  function drawMonster(c, b, t, ghost) {
    c.save(); c.translate(b.x, b.y)
    if (ghost) { c.globalAlpha = ghost.a; if (ghost.rot) c.rotate(ghost.rot); if (ghost.how === 'squash') c.scale(1.5, 0.35) }
    c.scale(b.face < 0 ? -1 : 1, 1)
    if (b.sc) c.scale(b.sc, b.sc)
    const walk = !ghost && b.moving ? Math.sin(t * 12) : 0
    const body = ghost && ghost.how === 'burn' ? '#2c2522' : '#4f8a62'
    const belly = ghost && ghost.how === 'burn' ? '#3a322e' : '#9bc785'
    shape(c, '#22301f', () => { c.ellipse(-7, 13 + Math.max(0, walk), 4.5, 2.6, 0, 0, 6.2832); c.moveTo(11.5, 13); c.ellipse(7, 13 + Math.max(0, -walk), 4.5, 2.6, 0, 0, 6.2832) })
    shape(c, '#eadfc4', () => { c.moveTo(-9, -10); c.lineTo(-12, -20); c.lineTo(-3, -13); c.moveTo(3, -14); c.lineTo(8, -22); c.lineTo(10, -11) }, 1.3)
    shape(c, body, () => c.ellipse(0, 0 - Math.abs(walk) * 0.8, 16, 14, 0, 0, 6.2832))
    c.fillStyle = belly; c.beginPath(); c.ellipse(3, 5, 9, 6.5, 0, 0, 6.2832); c.fill()
    const dead = !!ghost
    if (b.sleep && !dead) {   // 寝ている: 目を閉じて、Z が上がる
      c.strokeStyle = '#1b130c'; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath(); for (const ex of [1, 9]) { c.moveTo(ex - 3, -4); c.quadraticCurveTo(ex, -1.5, ex + 3, -4) } c.stroke()
      c.fillStyle = '#2a0f0c'; c.beginPath(); c.ellipse(6, 5, 3, 1.6, 0, 0, 6.2832); c.fill()
      c.restore(); c.save(); c.translate(b.x, b.y)
      c.font = '700 11px sans-serif'; c.textAlign = 'center'; c.lineJoin = 'round'
      for (let i = 0; i < 3; i++) { const k = (t * 0.45 + i / 3) % 1; c.globalAlpha = Math.sin(k * Math.PI); c.lineWidth = 3; c.strokeStyle = '#1b130c'; c.strokeText('Z', 10 + k * 14, -18 - k * 26); c.fillStyle = '#e8f0ff'; c.fillText('Z', 10 + k * 14, -18 - k * 26) }
      c.restore(); return
    }
    for (const ex of [1, 9]) {
      if (dead) { c.strokeStyle = '#1b130c'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(ex - 2, -6); c.lineTo(ex + 2, -2); c.moveTo(ex + 2, -6); c.lineTo(ex - 2, -2); c.stroke(); continue }
      shape(c, '#fff8e6', () => c.arc(ex, -4, 3.6, 0, 6.2832), 1.1); c.fillStyle = '#7a1010'; c.beginPath(); c.arc(ex + 1, -3.6, 1.7, 0, 6.2832); c.fill()
    }
    if (!dead) { c.strokeStyle = '#1b130c'; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(-3, -10); c.lineTo(5, -7); c.moveTo(13, -9.5); c.lineTo(7, -7); c.stroke() }
    c.fillStyle = '#2a0f0c'; c.beginPath(); c.moveTo(-3, 3); c.quadraticCurveTo(6, 10, 14, 2); c.closePath(); c.fill()
    c.fillStyle = '#fff8e6'; c.beginPath(); c.moveTo(0, 3.6); c.lineTo(2, 7); c.lineTo(4, 4.4); c.moveTo(9, 4.4); c.lineTo(11, 7); c.lineTo(12.5, 3.2); c.fill()
    if (b.tie) {   // まれに来る、ネクタイの魔物
      c.strokeStyle = '#1b130c'; c.lineWidth = 1.2; c.beginPath(); c.arc(1, -4, 4.6, 0, 6.2832); c.moveTo(13.6, -4); c.arc(9, -4, 4.6, 0, 6.2832); c.moveTo(5.6, -4); c.lineTo(4.4, -4); c.stroke()
      shape(c, '#8b2a2a', () => { c.moveTo(4, 9); c.lineTo(7, 9); c.lineTo(8, 17); c.lineTo(5.5, 20); c.lineTo(3, 17); c.closePath() }, 1.1)
    }
    c.restore()
  }
  function drawBomb(c, b, t, lit) {
    c.save(); c.translate(b.x, b.y)
    shape(c, '#2a2a2f', () => c.arc(0, 0, 12, 0, 6.2832), 1.8)
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(-4, -4, 3.8, 0, 6.2832); c.fill()
    shape(c, '#8a8a90', () => c.rect(-4, -15, 8, 4.5), 1.3)
    c.strokeStyle = '#7a5a33'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -15); c.quadraticCurveTo(7, -20, 4, -24); c.stroke()
    if (lit) { const f = 4.5; c.fillStyle = '#ffe36a'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? f * 0.4 : f; c.lineTo(4 + Math.cos(a) * r, -24 + Math.sin(a) * r) } c.closePath(); c.fill() }
    c.restore()
  }
  function drawChest(c, x, y, open) {
    c.save(); c.translate(x, y)
    if (open) {   // 開いた宝箱から金貨の光
      const g = c.createRadialGradient(0, -12, 2, 0, -12, 40); g.addColorStop(0, 'rgba(255,225,110,.8)'); g.addColorStop(1, 'rgba(255,225,110,0)'); c.fillStyle = g; c.fillRect(-40, -52, 80, 80)
    }
    shape(c, '#8a5426', () => c.roundRect(-16, -4, 32, 18, 2), 1.8)
    c.fillStyle = '#6b3d18'; c.fillRect(-15, 3, 30, 2); c.fillRect(-15, 9, 30, 1.6)
    if (open) {
      shape(c, '#f2c230', () => { c.ellipse(0, -4, 14, 4, 0, 0, 6.2832) }, 1.2)
      c.fillStyle = '#fff6c9'; for (const [a, b] of [[-6, -6], [3, -7], [8, -5]]) { c.beginPath(); c.arc(a, b, 1.6, 0, 6.2832); c.fill() }
      shape(c, '#9a6230', () => { c.moveTo(-16, -4); c.lineTo(-18, -20); c.quadraticCurveTo(0, -27, 18, -20); c.lineTo(16, -4); c.closePath() }, 1.8)
    } else {
      shape(c, '#9a6230', () => { c.moveTo(-16, -3); c.lineTo(-16, -9); c.quadraticCurveTo(0, -18, 16, -9); c.lineTo(16, -3); c.closePath() }, 1.8)
    }
    c.fillStyle = '#e2a72e'; c.strokeStyle = '#1b130c'; c.lineWidth = 1.2
    for (const bx of [-12, 9]) { c.fillRect(bx, open ? -4 : -14, 3.5, open ? 18 : 28); c.strokeRect(bx, open ? -4 : -14, 3.5, open ? 18 : 28) }
    shape(c, '#f2c230', () => c.roundRect(-3.5, -6, 7, 8, 1.5), 1.2)
    c.fillStyle = '#1b130c'; c.fillRect(-0.8, -3.6, 1.6, 3)
    c.restore()
  }
  function drawBoulder(c, b) {
    c.save(); c.translate(b.x, b.y); c.rotate(b.rot || 0)
    const r = b.r
    shape(c, '#7d756c', () => { const n = 9; for (let i = 0; i < n; i++) { const a = i / n * 6.2832, k = r * (0.92 + 0.1 * Math.sin(i * 2.7)); i ? c.lineTo(Math.cos(a) * k, Math.sin(a) * k) : c.moveTo(Math.cos(a) * k, Math.sin(a) * k) } c.closePath() }, 2)
    c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.ellipse(-5, -7, 7, 4, -0.5, 0, 6.2832); c.fill()
    c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(5, 8, 9, 5, -0.4, 0, 6.2832); c.fill()
    c.strokeStyle = '#3d3732'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-3, -2); c.lineTo(4, 2); c.lineTo(3, 9); c.moveTo(4, 2); c.lineTo(11, -2); c.stroke()
    c.restore()
  }
  function drawBucket(c, b) {
    c.save(); c.translate(b.x, b.y)
    c.strokeStyle = '#1b130c'; c.lineWidth = 2.6; c.beginPath(); c.arc(0, -6, 11, Math.PI * 1.05, Math.PI * 1.95); c.stroke()
    c.strokeStyle = '#8d939a'; c.lineWidth = 1.3; c.stroke()
    shape(c, '#a0703c', () => { c.moveTo(-12, -6); c.lineTo(12, -6); c.lineTo(9, 13); c.lineTo(-9, 13); c.closePath() }, 1.8)
    c.fillStyle = '#5b5f64'; c.fillRect(-11.4, -2, 22.8, 2.6); c.fillRect(-9.8, 7, 19.6, 2.6)
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; c.beginPath(); for (const x of [-5, 0, 5]) { c.moveTo(x, -5); c.lineTo(x * 0.8, 12) } c.stroke()
    if (b.full) { shape(c, '#3d97e3', () => c.ellipse(0, -6, 11, 3, 0, 0, 6.2832), 1.3); c.fillStyle = '#9fd4ff'; c.beginPath(); c.ellipse(-3, -6.6, 4, 1, 0, 0, 6.2832); c.fill() }
    c.restore()
  }
  function drawCage(c, b, t) {
    c.save()
    drawMonster(c, { x: b.x, y: b.y + 2, face: 1, sc: 0.82, tie: b.tie }, t)
    c.translate(b.x, b.y)
    const bars = () => { c.beginPath(); c.roundRect(-20, -19, 40, 39, 4); for (const x of [-10, 0, 10]) { c.moveTo(x, -19); c.lineTo(x, 20) } }
    c.strokeStyle = '#1b130c'; c.lineWidth = 4.4; bars(); c.stroke()
    c.strokeStyle = '#7d848c'; c.lineWidth = 2.2; bars(); c.stroke()
    c.restore()
  }
  function drawBodies(c, w, t) {
    for (const b of w.bodies) {
      if (!b.alive) continue
      if (b.kind === 'chest') drawChest(c, b.x, b.y, w.state === 'clear')
      else if (b.kind === 'boulder') drawBoulder(c, b)
      else if (b.kind === 'bucket') drawBucket(c, b)
      else if (b.kind === 'bomb') drawBomb(c, b, t, false)
      else if (b.kind === 'cage') drawCage(c, b, t)
    }
    for (const d of w.def.deco || []) if (d.kind === 'chest') drawChest(c, d.x, d.y - 14, w.state === 'clear')
  }
  function drawFx(c, t) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], k = (t - f.t0) / f.life
      if (k >= 1) { fx.splice(i, 1); continue }
      if (f.k === 'puff') { c.fillStyle = `rgba(${f.col},${(1 - k) * f.a})`; c.beginPath(); c.arc(f.x + f.vx * k, f.y + f.vy * k, f.r * (0.6 + k), 0, 6.2832); c.fill() }
      else if (f.k === 'spark') {
        const x = f.x + f.vx * k, y = f.y + f.vy * k - 20 * k, r = 4 * (1 - k)
        c.fillStyle = '#fff3a0'; c.beginPath(); c.moveTo(x, y - r * 2); c.lineTo(x + r * 0.5, y - r * 0.5); c.lineTo(x + r * 2, y); c.lineTo(x + r * 0.5, y + r * 0.5); c.lineTo(x, y + r * 2); c.lineTo(x - r * 0.5, y + r * 0.5); c.lineTo(x - r * 2, y); c.lineTo(x - r * 0.5, y - r * 0.5); c.fill()
      } else if (f.k === 'drop') {
        const x = f.x + f.vx * k, y = f.y + f.vy * k + 260 * k * k; c.fillStyle = `rgba(61,151,227,${1 - k})`; c.beginPath(); c.arc(x, y, 2.6, 0, 6.2832); c.fill()
      } else if (f.k === 'chip') {
        const x = f.x + f.vx * k, y = f.y + f.vy * k + 300 * k * k; c.save(); c.translate(x, y); c.rotate(k * 8 + f.r); c.fillStyle = f.col; c.globalAlpha = 1 - k; c.fillRect(-3, -2, 6, 4); c.restore()
      } else if (f.k === 'boom') {
        c.fillStyle = `rgba(255,${200 - k * 150 | 0},80,${1 - k})`; c.beginPath(); c.arc(f.x, f.y, 20 + k * 70, 0, 6.2832); c.fill()
        c.strokeStyle = `rgba(255,255,230,${1 - k})`; c.lineWidth = 6 * (1 - k); c.beginPath(); c.arc(f.x, f.y, 30 + k * 90, 0, 6.2832); c.stroke()
      } else if (f.k === 'snap') {   // 切った瞬間の白い筋
        c.strokeStyle = `rgba(255,255,255,${1 - k})`; c.lineWidth = 2.4 * (1 - k); c.lineCap = 'round'
        c.beginPath(); for (let j = 0; j < 4; j++) { const a = j * 1.57 + 0.6; c.moveTo(f.x + Math.cos(a) * 4, f.y + Math.sin(a) * 4); c.lineTo(f.x + Math.cos(a) * (8 + k * 12), f.y + Math.sin(a) * (8 + k * 12)) } c.stroke()
      } else if (f.k === 'sinkchest') {   // 溶岩に沈んでいく宝箱
        c.save(); c.beginPath(); c.rect(f.x - 30, f.y - 60, 60, 72); c.clip()
        c.globalAlpha = 1 - k * 0.5; drawChest(c, f.x, f.y + k * 34, false); c.restore()
        c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(f.x, f.y + 12, 2, f.x, f.y + 12, 34); g.addColorStop(0, `rgba(255,140,40,${0.6 * (1 - k)})`); g.addColorStop(1, 'rgba(255,140,40,0)'); c.fillStyle = g; c.fillRect(f.x - 36, f.y - 24, 72, 72); c.restore()
      } else if (f.k === 'mghost') {
        const b = f.b, how = f.how
        const g = { a: 1 - k, how, rot: how === 'blast' ? k * 9 : 0 }
        const o = { x: b.x + (how === 'blast' ? f.vx * k : 0), y: b.y + (how === 'burn' ? k * 10 : how === 'blast' ? -60 * k + 120 * k * k : 0), face: b.face, tie: b.tie }
        drawMonster(c, o, t, g)
      }
    }
  }
  function addFx(k, x, y, o) { fx.push(Object.assign({ k, x, y, t0: clock, life: 0.8, vx: 0, vy: 0, r: 4, a: 0.7, col: '230,230,230' }, o || {})); if (fx.length > 300) fx.shift() }
  function drawTrail(c) {
    while (trail.length && clock - trail[0].t > 0.3) trail.shift()
    if (trail.length < 2) return
    c.save(); c.lineCap = 'round'
    for (let i = trail.length - 1; i > 0; i--) {
      const a = trail[i], b = trail[i - 1], k = 1 - (clock - a.t) / 0.25
      if (k <= 0 || Math.hypot(a.x - b.x, a.y - b.y) > 120) continue
      c.strokeStyle = `rgba(255,255,255,${k * 0.9})`; c.lineWidth = 5 * k + 1; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(a.x, a.y); c.stroke()
    }
    c.restore()
  }
  function drawBubble(c, w) {
    if (!bubble || clock - bubble.t0 > bubble.dur) { bubble = null; return }
    const h = w.hero, fs = 12.5
    c.save(); c.font = `${fs}px "RocknRoll One",sans-serif`
    const tw = c.measureText(bubble.text).width, bw = tw + 16, bh = fs + 12
    const up = !!h.body && !h.dead   // ぶら下がっている時は足の下に出す
    let x = Math.max(26 + bw / 2, Math.min(E.W - 26 - bw / 2, h.x)), y = up ? h.y + 24 : h.y - 82
    if (h.dead && (h.how === 'monster' || h.how === 'squash' || h.how === 'spike')) y = h.y - 50
    if (!up) y = Math.max(28, y)
    c.fillStyle = '#fff'; c.strokeStyle = '#1b130c'; c.lineWidth = 2
    c.beginPath(); c.roundRect(x - bw / 2, y - bh / 2, bw, bh, 7)
    if (up) { c.moveTo(h.x - 4, y - bh / 2); c.lineTo(h.x, y - bh / 2 - 8); c.lineTo(h.x + 5, y - bh / 2) } else { c.moveTo(h.x - 4, y + bh / 2); c.lineTo(h.x, y + bh / 2 + 8); c.lineTo(h.x + 5, y + bh / 2) }
    c.fill(); c.stroke()
    c.fillStyle = '#fff'; c.fillRect(h.x - 3, up ? y - bh / 2 - 0.5 : y + bh / 2 - 2.5, 7, 3)
    c.fillStyle = '#1b130c'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(bubble.text, x, y + 1)
    c.restore()
  }
  function say(text, dur) { bubble = { text, t0: clock, dur: dur || Math.max(1.2, 0.9 + text.length * 0.1) } }
  function drawTorches(c, w, t) {
    for (const [tx, ty] of w.def.torches || [[60, 90], [300, 380]]) {
      c.fillStyle = '#4a3220'; c.fillRect(tx - 2, ty, 4, 14)
      const f = 1 + 0.15 * Math.sin(t * 13 + tx) + 0.1 * Math.sin(t * 29 + ty)
      c.fillStyle = '#ff8a1e'; c.beginPath(); c.ellipse(tx, ty - 4 * f, 4.4, 7 * f, 0, 0, 6.2832); c.fill()
      c.fillStyle = '#ffe08a'; c.beginPath(); c.ellipse(tx, ty - 2.5 * f, 2.2, 4 * f, 0, 0, 6.2832); c.fill()
    }
  }
  function drawWorld(c, w, t, bgc, opt) {
    opt = opt || {}
    c.save(); c.beginPath(); c.rect(0, 0, E.W, E.H); c.clip()
    if (bgc) c.drawImage(bgc, 0, 0, E.W, E.H); else drawStatic(c, w, 9)
    drawTorches(c, w, t)
    const R = rng(77)
    for (const P of w.polys) if (P.kind === 'cracked' && !P.gone) drawStone(c, P, R, true)
    for (const P of w.polys) { if (P.kind === 'plank' && !P.gone) drawPlank(c, P); else if (P.kind === 'spring') { drawSpring(c, P); if (!opt.thumb) P.squash = Math.max(0, (P.squash || 0) - 0.08) } }
    drawLava(c, w, t)
    drawRopes(c, w, t, opt.thumb ? null : hintRope())
    drawBodies(c, w, t)
    for (const m of w.walkers) if (m.alive) drawMonster(c, { x: m.x, y: m.y - 15, face: m.face, moving: m.moving, tie: m.tie, sleep: m.wait > 0 }, t)
    const h = w.hero
    drawHero(c, h, t, w.state === 'clear', !!h.body && !h.dead, w.t)
    for (const b of w.bodies) if (b.alive && b.kind === 'boulder' && Math.abs(b.x - h.x) < 40 && b.y > h.y - 80) drawBoulder(c, b)   // 勇者の上に落ちた岩は前に
    if (!opt.thumb) { drawFx(c, t); drawTrail(c); drawBubble(c, w) }
    c.restore()
  }
  function hintRope() {
    if (!hintOn || !world || world.state !== 'play' || mode !== 'play') return null
    for (const st of world.def.solve) { const r = world.ropes.find(q => q.id === st[0]); if (r && !r.anyCut) return r.id }
    return null
  }
  // タイミングの面のヒント: 台本の時刻の前後0.3秒だけ「今」と光らせる
  // 上級の面は手ごとの印: 't' は前後0.3秒だけ、'w' はその秒数を過ぎたら強く光る
  function hintNow() {
    const id = hintRope(); if (!id) return true
    const d = world.def, k = d.solve.findIndex(st => st[0] === id), st = d.solve[k]
    const flag = d.adv ? st[2] : d.timing ? 't' : null
    if (!flag) return true
    const base = world.cuts.length ? world.cuts[world.cuts.length - 1].t : 0, dt = world.t - base - st[1]
    return flag === 'w' ? dt > -0.3 : dt > -0.3 && dt < 0.3
  }

  // ---- 面を始める
  function load(i, o) {
    o = o || {}
    lvIdx = Math.max(0, Math.min(LV.length - 1, i))
    const d = LV[lvIdx]
    const hasM = (d.monsters || []).length > 0 || (d.things || []).some(t => t.kind === 'cage')
    const variant = { tie: hasM && Math.random() < 1 / 7 }
    if (o.variant) Object.assign(variant, o.variant)
    world = E.create(d, { variant })
    for (const b of world.bodies) if (b.kind === 'cage') b.tie = !!variant.tie
    E.prepare(world)
    bg = null; fx.length = 0; trail.length = 0; bubble = null; shake = 0; sheetOn = false; saidMonster = false; saidFear = false; prevState = 'play'
    $('sheet').hidden = true; $('stamp').textContent = ''; $('stamp').className = ''
    $('lvNum').textContent = T.level(lvIdx + 1)
    $('capT').textContent = T.names[lvIdx] || ''
    hintOn = (fails[lvIdx] || 0) >= 2
    tutorOn = lvIdx === 0 && !Q.has('notut') && (fails[0] || 0) < 3 && best < 1
    $('capT').parentElement.style.visibility = tutorOn ? 'hidden' : ''
    $('tutorT').textContent = coarse ? T.tutor : T.tutorPc
    $('tutor').hidden = !tutorOn
    acc = 0; lastT = performance.now()
    const w0 = world
    if (!tutorOn) setTimeout(() => { if (world === w0 && world.cuts.length === 0 && mode === 'play') say(pick(world.hero.body ? T.hero.hangStart : T.hero.start)) }, 700)
    if (window.TM) TM.start()
    calcTarget(); Object.assign(view, target)
  }

  // ---- 画面切り替え
  function show(m) {
    mode = m
    for (const id of ['vTitle', 'vStages', 'vHow', 'vPlay', 'vEnd']) $(id).hidden = true
    const map = { title: 'vTitle', stages: 'vStages', how: 'vHow', play: 'vPlay', end: 'vEnd' }
    if (map[m]) $(map[m]).hidden = false
    document.body.classList.toggle('playing', m === 'play')
    $('bMute').hidden = false
    if (m === 'title') startDemo()
    calcTarget(); Object.assign(view, target); bg = null
  }
  function applyLang() {
    T = TXT[lang]; document.documentElement.lang = lang
    $('tl1').textContent = T.title1; $('tl2').textContent = T.title2; $('tl2').style.fontSize = lang === 'en' ? 'min(10.5vw,50px)' : ''; $('tl3').textContent = T.titleSub
    $('bStart').textContent = best > 0 && best < LV.length ? T.cont : T.start
    $('bStages').textContent = T.stages; $('bHow').textContent = T.how; $('bLang').textContent = T.lang
    $('stH').textContent = T.stages; $('bStBack').textContent = T.back
    $('howH').textContent = T.howH; $('howLead').textContent = T.howLead; $('bHowClose').textContent = T.back
    $('howFoot').textContent = T.howFoot; $('lPrivacy').textContent = T.privacy
    $('tabB').textContent = T.tabBase; $('tabA').textContent = T.tabAdv
    $('bSave').textContent = T.save; $('bPost').textContent = T.post; $('bEndSave').textContent = T.save; $('bEndPost').textContent = T.post
    $('bAgain').textContent = T.again
    if (world) { $('capT').textContent = T.names[lvIdx]; $('tutorT').textContent = coarse ? T.tutor : T.tutorPc }
    const ul = $('howList'); ul.textContent = ''
    for (const [k, s] of T.howList) { const li = document.createElement('li'), c = document.createElement('canvas'); c.width = 88; c.height = 88; drawIcon(c, k); const sp = document.createElement('span'); sp.textContent = s; li.append(c, sp); ul.append(li) }
  }
  function drawIcon(cvs, k) {
    const c = cvs.getContext('2d'); c.scale(2, 2); c.fillStyle = '#3a2e25'; c.fillRect(0, 0, 44, 44)
    if (k === 'rope') {
      c.save(); c.lineCap = 'round'; strokeRope(c, [{ x: 22, y: 0 }, { x: 22, y: 14 }]); strokeRope(c, [{ x: 22, y: 20 }, { x: 22, y: 26 }])
      c.strokeStyle = '#fff'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(6, 22); c.lineTo(38, 12); c.stroke(); c.restore()
      drawChest(c, 22, 34, false)
    }
    if (k === 'chest') drawChest(c, 22, 28, true)
    if (k === 'lava') {
      const g = c.createLinearGradient(0, 30, 0, 44); g.addColorStop(0, '#ffb53a'); g.addColorStop(0.3, '#f2520f'); g.addColorStop(1, '#7c1804')
      c.fillStyle = g; c.fillRect(0, 30, 22, 14); c.fillStyle = '#3e3732'; c.fillRect(22, 30, 22, 14); c.fillStyle = '#5d554e'; for (const x of [25, 33, 40]) { c.beginPath(); c.arc(x, 32, 3.4, 0, 6.2832); c.fill() }
      drawBucket(c, { x: 30, y: 15, full: true })
    }
    if (k === 'monster') { c.save(); c.translate(22, 26); c.scale(1.1, 1.1); c.translate(-22, -26); drawMonster(c, { x: 22, y: 26, face: -1 }, 0); c.restore() }
    if (k === 'boulder') { drawBoulder(c, { x: 22, y: 24, r: 15 }) }
    if (k === 'bomb') drawBomb(c, { x: 22, y: 28 }, 0.2, true)
    if (k === 'spring') {
      const a = 0.42, P = { cx: 16, cy: 34, sw: 24, ang: a, squash: 0 }
      drawSpring(c, P, 44)
      c.save(); c.lineCap = 'round'; c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.setLineDash([2.4, 2.6]); c.beginPath(); c.moveTo(18, 26); c.quadraticCurveTo(28, 6, 40, 12); c.stroke(); c.restore()
      const pl = E.makePoly(E.rectPoly(26, 30, 18, 5), 'plank'); drawPlank(c, pl)
    }
  }
  const NBASE = LV.filter(d => !d.adv).length
  let stTab = null
  function openStages(tab) {
    show('stages')
    if (tab == null) tab = stTab != null ? stTab : best >= NBASE ? 1 : 0
    stTab = tab
    $('tabB').classList.toggle('on', tab === 0); $('tabA').classList.toggle('on', tab === 1)
    $('tabB').setAttribute('aria-selected', tab === 0); $('tabA').setAttribute('aria-selected', tab === 1)
    const g = $('grid'); g.textContent = ''; g.classList.toggle('adv', tab === 1)
    LV.forEach((d, i) => {
      if (!!d.adv !== (tab === 1)) return
      const b = document.createElement('button'), c = document.createElement('canvas')
      c.width = 120; c.height = 200
      const w = E.create(d), x = c.getContext('2d'); x.scale(120 / 360, 200 / 600); drawWorld(x, w, 0, null, { thumb: true })
      const n = document.createElement('b'); n.textContent = i + 1
      b.append(c, n); if (i < best) b.append(document.createElement('i'))
      const lock = i > best && !Q.has('all')
      if (lock) b.classList.add('lock')
      b.disabled = lock
      b.onclick = () => { click(); show('play'); load(i) }
      b.setAttribute('aria-label', `${i + 1} ${T.names[i]}`)
      g.append(b)
    })
  }

  // ---- 決着
  function finish() {
    const w = world, ok = w.state === 'clear'
    sheetOn = true; bubble = null
    $('capT').parentElement.style.visibility = 'hidden'
    let line
    if (ok) {
      best = Math.max(best, lvIdx + 1); store.set('roper_best', best)
      line = lvIdx === NBASE - 1 ? T.narrBase : Math.random() < 0.18 ? pick(T.narrClear.slice(3)) : T.narrClear[0]
      $('stamp').textContent = T.stampClear; $('stamp').className = ''; void $('stamp').offsetWidth; $('stamp').className = 'on'
      $('bNext').textContent = T.next
      Snd.duck(0.3, 2); play('j_win', { vol: 0.9, jitter: 0 })
    } else {
      fails[lvIdx] = (fails[lvIdx] || 0) + 1; store.set('roper_fails', fails)
      totalFails++; store.set('roper_totalFails', totalFails)
      line = sessionFails === 0 ? T.narrFirst : pick(T.narr[w.reason] || T.narr.stuck)
      sessionFails++
      $('stamp').textContent = ''
      $('bNext').textContent = T.retry
      play('j_lose', { vol: 0.8, jitter: 0 })
    }
    $('narr').textContent = line
    $('bPost').href = 'https://x.com/intent/post?text=' + encodeURIComponent(T.postText(lvIdx + 1, ok) + '\n' + T.tag) + '&url=' + encodeURIComponent(URL0)
    $('sheet').hidden = false
    if (window.TM) TM.end(lvIdx + 1, ok)
    requestAnimationFrame(() => calcTarget())
  }
  function shareImage(ok) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350
    const g = c.getContext('2d')
    g.fillStyle = '#1e1813'; g.fillRect(0, 0, 1080, 1350)
    g.textAlign = 'center'; g.textBaseline = 'middle'
    const head = `${lvIdx + 1}. ${T.names[lvIdx]}`
    g.font = '64px "RocknRoll One",sans-serif'; g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#000'; g.strokeText(head, 540, 92); g.fillStyle = '#fff'; g.fillText(head, 540, 92)
    const s = 1.75, ox = (1080 - E.W * s) / 2, oy = 170
    g.save(); g.translate(ox, oy); g.scale(s, s); drawWorld(g, world, clock, bg && bg.c); g.restore()
    if (ok) { g.save(); g.translate(540, 520); g.rotate(-0.14); g.font = '92px "RocknRoll One",sans-serif'; g.lineWidth = 22; g.strokeStyle = '#000'; g.strokeText(T.stampClear, 0, 0); g.fillStyle = '#ffe14a'; g.fillText(T.stampClear, 0, 0); g.restore() }
    const line = $('narr').textContent
    g.font = '600 44px "Shippori Mincho B1",serif'; const tw = g.measureText(line).width
    g.fillStyle = 'rgba(0,0,0,.8)'; g.fillRect(540 - tw / 2 - 30, 1130, tw + 60, 84); g.fillStyle = '#fff'; g.fillText(line, 540, 1173)
    g.font = '30px "RocknRoll One",sans-serif'; g.fillStyle = '#f2c230'; g.fillText(T.shareFoot, 540, 1270); g.fillStyle = '#a89a86'; g.font = '24px sans-serif'; g.fillText('tom3games.github.io/rope-rescue', 540, 1312)
    return c
  }
  function saveCanvas(c, name) {
    window.__saved = (window.__saved || 0) + 1
    c.toBlob(b => { if (!b) return; const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000) }, 'image/png')
  }
  function drawEnd() {
    const c = $('endCv'), g = c.getContext('2d')
    g.fillStyle = '#2a211a'; g.fillRect(0, 0, 1080, 1080)
    const R = rng(5); for (let y = 0, row = 0; y < 1080; y += 66, row++) for (let x = (row % 2) * -60; x < 1080; x += 120) { const v = R(); g.fillStyle = `rgb(${56 + v * 14 | 0},${45 + v * 11 | 0},${36 + v * 8 | 0})`; g.fillRect(x + 3, y + 3, 114, 60) }
    const gr = g.createRadialGradient(540, 640, 40, 540, 640, 520); gr.addColorStop(0, 'rgba(255,200,90,.45)'); gr.addColorStop(1, 'rgba(255,200,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 1080, 1080)
    // 天井から垂れる切れたひもと、宝箱の山と勇者
    g.save(); g.scale(3, 3); g.lineCap = 'round'
    for (let i = 0; i < 8; i++) { const x = 22 + i * 44, y1 = 22 + (i * 37 % 5) * 7; strokeRope(g, [{ x, y: 0 }, { x: x + (i % 2 ? 2 : -2), y: y1 }]); g.strokeStyle = '#d9b27a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 2.5, y1 + 2.5); g.lineTo(x, y1); g.lineTo(x + 2.5, y1 + 2.8); g.stroke() }
    for (const [x, y, o] of [[118, 300, false], [242, 300, false], [150, 284, true], [210, 286, false], [180, 302, true]]) drawChest(g, x, y, o)
    g.restore()
    g.save(); g.translate(540 - 180 * 4.2, 740 - 200 * 4.2); g.scale(4.2, 4.2); drawHero(g, { x: 180, y: 200, dead: false, fear: 0, joy: 1, wet: 0 }, 0.26, true); g.restore()
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'
    g.font = '86px "RocknRoll One",sans-serif'; g.lineWidth = 20; g.strokeStyle = '#000'; g.strokeText(T.endH, 540, 230); g.fillStyle = '#ffe14a'; g.fillText(T.endH, 540, 230)
    g.font = '600 42px "Shippori Mincho B1",serif'; const sub = T.endSub(totalFails); const tw = g.measureText(sub).width
    g.fillStyle = 'rgba(0,0,0,.8)'; g.fillRect(540 - tw / 2 - 26, 925, tw + 52, 76); g.fillStyle = '#fff'; g.fillText(sub, 540, 964)
    g.font = '26px sans-serif'; g.fillStyle = '#d8c9b0'; g.fillText('tom3games.github.io/rope-rescue', 540, 1040)
  }
  function openEnd() {
    show('end'); drawEnd(); play('j_end', { vol: 0.9, jitter: 0, ui: true })
    $('bEndPost').href = 'https://x.com/intent/post?text=' + encodeURIComponent(T.postEnd(totalFails) + '\n' + T.tag) + '&url=' + encodeURIComponent(URL0)
  }

  // ---- 出来事から音と絵へ
  function handleEvents(w) {
    const h = w.hero
    for (const e of w.events) {
      switch (e.e) {
        case 'cut':
          play('cut', { vol: 0.8 }, 60); addFx('snap', e.x, e.y, { life: 0.35 })
          if (tutorOn) { tutorOn = false; $('tutor').hidden = true; $('capT').parentElement.style.visibility = '' }
          break
        case 'land': {
          const vol = Math.min(1, 0.25 + e.v / 900)
          if (e.kind === 'chest') play('wood', { vol }, 90)
          else if (e.kind === 'boulder') { play('thud', { vol }, 120); if (e.v > 300) { play('stone', { vol: vol * 0.7 }, 120); shake = Math.max(shake, Math.min(0.7, e.v / 900)) } for (let i = 0; i < 4; i++) addFx('puff', e.x + (i - 1.5) * 9, e.y - 4, { col: '170,150,125', a: 0.6, r: 5, vy: -18, vx: (i - 1.5) * 14, life: 0.8 }) }
          else if (e.kind === 'bucket') play('wood', { vol: vol * 0.8, rate: 1.2 }, 90)
          else if (e.kind === 'cage') play('clank', { vol }, 120)
          else if (e.kind === 'hero') play('thud', { vol: vol * 0.8, rate: 1.2 }, 120)
          break
        }
        case 'stand': if (!h.dead) say(pick(T.hero.stand)); break
        case 'splash': play('splash', { vol: 0.8 }, 120); for (let i = 0; i < 12; i++) addFx('drop', e.x, e.y, { vx: (i - 6) * 9, vy: -60 - (i % 3) * 20, life: 0.7 }); if (e.on === 'hero') say(pick(T.hero.wet)); break
        case 'quench':
          play('splash', { vol: 0.9 }); play('steam', { vol: 0.8, rate: 0.9 }); setTimeout(() => play('stone', { vol: 0.6 }), 250)
          e.lava.hotT = clock
          for (let i = 0; i < 18; i++) addFx('puff', e.lava.x + (i + 0.5) * e.lava.w / 18, e.y - 2, { col: '235,235,230', a: 0.8, r: 6, vy: -50 - (i % 4) * 12, vx: (i % 2 ? 1 : -1) * 8, life: 1.4 })
          break
        case 'melt': addFx('sinkchest', e.x, e.y - 12, { life: 1.1 }); play('steam', { vol: 0.8, rate: 0.8 }); for (let i = 0; i < 8; i++) addFx('puff', e.x + (i - 4) * 4, e.y - 4, { col: '255,140,60', a: 0.8, r: 5, vy: -40, life: 0.9 }); break
        case 'sink': play('bub', { vol: 0.6 }); play('steam', { vol: 0.4 }, 300); break
        case 'mdie': {
          const b = { x: e.x, y: e.y, face: -1, tie: e.tie }
          addFx('mghost', e.x, e.y, { b, how: e.how, life: e.how === 'blast' ? 1 : 1.4, vx: (e.x < h.x ? -1 : 1) * 90 })
          if (e.how === 'burn') { play('steam', { vol: 0.7, rate: 0.7 }); for (let i = 0; i < 6; i++) addFx('puff', e.x, e.y - 6, { col: '60,55,50', a: 0.7, r: 6, vy: -50, vx: (i - 3) * 8, life: 1.1 }) }
          if (e.how === 'squash') shake = Math.max(shake, 0.5)
          play('grunt', { vol: 0.75, rate: 0.8 }, 200)
          if (e.tie) setTimeout(() => say(T.hero.tie, 2.4), 300)
          break
        }
        case 'cagebreak': play('clank', { vol: 0.9 }); play('grunt', { vol: 0.7, rate: 1.1 }, 200); for (let i = 0; i < 6; i++) addFx('chip', e.x, e.y, { vx: (i - 3) * 30, vy: -90, col: '#7d848c', r: i, life: 0.9 }); break
        case 'boom': play('boom', { vol: 1 }); shake = 1; addFx('boom', e.x, e.y, { life: 0.55 }); for (let i = 0; i < 10; i++) addFx('puff', e.x, e.y, { col: '70,60,55', a: 0.8, r: 9, vx: Math.cos(i) * 60, vy: Math.sin(i) * 60 - 30, life: 1.2 }); break
        case 'boing': play('boing', { vol: 0.8 }, 120); for (let i = 0; i < 5; i++) addFx('puff', e.x + (i - 2) * 8, e.y, { col: '200,190,170', a: 0.5, r: 4, vy: -16, vx: (i - 2) * 12, life: 0.5 }); break
        case 'plank': play('plank', { vol: 0.9 }); play('wood', { vol: 0.6, rate: 0.8 }, 90); for (let i = 0; i < 12; i++) addFx('chip', e.x + (i - 6) * 9, e.y, { vx: (i - 6) * 18, vy: -70 - (i % 4) * 25, col: i % 2 ? '#9c6b3a' : '#6b4a2a', r: i, life: 1 }); shake = Math.max(shake, 0.4); break
        case 'crack': play('crack', { vol: 0.9 }); for (let i = 0; i < 14; i++) addFx('chip', e.x + (i % 3 - 1) * 6, e.y + (i - 7) * 10, { vx: 40 + (i % 4) * 30, vy: -80 + (i % 5) * 20, col: '#a8957a', r: i, life: 1 }); break
        case 'smash': case 'chestboom': play('crack', { vol: 0.8 }); play('wood', { vol: 0.9, rate: 0.8 }); for (let i = 0; i < 12; i++) addFx('chip', e.x, e.y, { vx: (i - 6) * 22, vy: -120 - (i % 3) * 30, col: i % 3 ? '#8a5426' : '#f2c230', r: i, life: 1.1 }); break
        case 'win': {
          play('open', { vol: 0.9 }); setTimeout(() => play('coin', { vol: 0.7 }), 160)
          const ch = w.bodies.find(b => b.kind === 'chest' && b.alive), p = ch || (w.def.deco || [])[0]
          if (p) for (let i = 0; i < 10; i++) addFx('spark', p.x, p.y - 14, { vx: (i - 5) * 14, vy: -70 - (i % 3) * 20, life: 0.8 })
          break
        }
        case 'hdie':
          shake = Math.max(shake, 0.6); play('scream', { vol: 0.65, jitter: 0.04 }); say(T.hero.die[e.how] || '…', 2.4)
          if (e.how === 'lava') for (let i = 0; i < 8; i++) addFx('puff', e.x, e.y - 30, { col: '60,55,50', a: 0.7, r: 6, vy: -60, vx: (i - 4) * 9, life: 1.3 })
          break
      }
    }
    w.events.length = 0
  }

  // ---- ループ
  let prevState = 'play', saidMonster = false, saidFear = false, lastCreak = 0
  function stepOnce() {
    const w = world
    E.step(w)
    clock += 1 / 60
    for (const b of w.bodies) if (b.alive && b.kind === 'boulder') b.rot = (b.rot || 0) + (b.x - b.px) / b.r
    if (mode === 'play') {
      handleEvents(w)
      const h = w.hero
      if (!saidMonster && h.fear > 0.5 && w.walkers.some(m => m.alive && Math.abs(m.x - h.x) < 110)) { saidMonster = true; say(pick(T.hero.monster)) }
      if (!saidFear && h.fear > 0.6 && !h.dead && w.state === 'play' && !saidMonster && !bubble) { saidFear = true; say(pick(T.hero.fear)) }
      if (w.state === 'clear' && prevState === 'play') say(pick(T.hero.win), 2.6)
      prevState = w.state
      // 大きく揺れている時だけ、ひもがきしむ
      if (clock - lastCreak > 1.3) for (const b of w.bodies) { if (!b.alive) continue; const sp = Math.hypot(b.x - b.px, b.y - b.py) * 60; if (sp > 150 && w.ropes.some(r => r.B.body === b && E.holds(r))) { play('creak', { vol: 0.35 }); lastCreak = clock; break } }
      if (w.state !== 'play' && !sheetOn && w.t >= w.endAt) finish()
      const hasLava = w.lavas.some(L => !L.stone)
      if (hasLava !== lavaLoop && audioOn) { lavaLoop = hasLava; Snd.loop('lava', hasLava ? 'snd/amb_lava.mp3' : null, 0.2) }
    } else { w.events.length = 0 }
  }
  function frame() {
    const now = performance.now()
    let dt = (now - lastT) / 1000; lastT = now
    if (dt > 0.25) dt = 0.25
    if (!paused && world) {
      acc += dt; let n = 0
      while (acc >= 1 / 60 && n < 4) { stepOnce(); acc -= 1 / 60; n++ }
      if (n === 4) acc = 0
      if (mode === 'title') demoTick()
    }
    render()
    requestAnimationFrame(frame)
  }
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#1e1813'; ctx.fillRect(0, 0, cv.width, cv.height)
    if (!world || mode === 'boot') return
    for (const k of ['s', 'ox', 'oy']) view[k] += (target[k] - view[k]) * 0.18
    if (!bg || bg.w !== world || Math.abs(bg.k - view.s) > 0.5) { bg = makeBg(world); bg.k = view.s }
    let sx = 0, sy = 0
    if (shake > 0) { sx = (Math.random() - 0.5) * 10 * shake; sy = (Math.random() - 0.5) * 10 * shake; shake = Math.max(0, shake - 0.04) }
    ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * (view.ox + sx), dpr * (view.oy + sy))
    ctx.fillStyle = '#2a211a'; ctx.fillRect(-30, -30, E.W + 60, E.H + 60)
    drawWorld(ctx, world, clock, bg.c)
    if (tutorOn && mode === 'play') {
      const p = ropeScreen(LV[0].solve[0][0]); if (p) { const el = $('tutor'); el.style.left = (p.x - 60) + 'px'; el.style.top = (p.y + 4) + 'px' }
    }
  }

  // タイトルの後ろで、勝手に解いてみせる（上級の面も混ぜる）
  const DEMO = [{ lv: 0, steps: [[1.4, 'A']] }, { lv: 6, steps: [[3.6, 'A']] }, { lv: 12, steps: [[1.2, 'A'], [2.6, 'C']] }, { lv: 3, steps: [[1.2, 'B'], [2.6, 'A']] }, { lv: 13, steps: [[1.2, 'B'], [2.8, 'A']] }, { lv: 0, steps: [[1.4, 'B']] }]
  let demoI = 0
  function startDemo() { demo = DEMO[demoI % DEMO.length]; demoI++; lvIdx = demo.lv; world = E.create(LV[demo.lv], {}); E.prepare(world); demo.t0 = world.t; demo.k = 0; demo.end = 0; bg = null; trail.length = 0 }
  function demoTick() {
    if (!demo) return startDemo()
    const t = world.t - demo.t0
    while (demo.k < demo.steps.length && t > demo.steps[demo.k][0]) {
      const p = E.ropePoint(world, demo.steps[demo.k][1])
      if (p) for (let i = 0; i < 6; i++) trail.push({ x: p.x - 26 + i * 10, y: p.y + 10 - i * 4, t: clock - 0.03 * (5 - i) })
      E.cut(world, demo.steps[demo.k][1]); demo.k++
    }
    if (world.state !== 'play' && !demo.end) demo.end = clock
    if ((demo.end && clock - demo.end > 2.2) || t > 14) startDemo()
  }

  // ---- 入力（なぞって切る。押すだけでも切れる）
  function toWorld(cx, cy) { return { x: (cx - view.ox) / view.s, y: (cy - view.oy) / view.s } }
  function ropeScreen(id, frac) {
    if (!world) return null
    const p = E.ropePoint(world, id, frac); if (!p || p.cut) return null
    return { x: view.ox + p.x * view.s, y: view.oy + p.y * view.s, tx: p.tx, ty: p.ty }
  }
  function click() { audioStart(); play('click', { vol: 0.5, jitter: 0, ui: true }) }
  let ptr = null
  const canCut = () => mode === 'play' && world && world.state === 'play' && !sheetOn
  cv.addEventListener('pointerdown', e => {
    audioStart()
    if (!canCut()) return
    try { cv.setPointerCapture(e.pointerId) } catch (er) {}
    const p = toWorld(e.clientX, e.clientY)
    ptr = { id: e.pointerId, x: p.x, y: p.y, sx: e.clientX, sy: e.clientY, moved: 0, cuts: 0 }
    trail.push({ x: p.x, y: p.y, t: clock })
  })
  cv.addEventListener('pointermove', e => {
    if (!ptr || ptr.id !== e.pointerId || !canCut()) return
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []
    for (const ev of (evs.length ? evs : [e])) {
      const p = toWorld(ev.clientX, ev.clientY)
      const got = E.swipe(world, ptr.x, ptr.y, p.x, p.y)
      if (got.length) { ptr.cuts += got.length; window.__cuts = (window.__cuts || 0) + got.length }
      ptr.moved += Math.hypot(ev.clientX - ptr.sx, ev.clientY - ptr.sy); ptr.sx = ev.clientX; ptr.sy = ev.clientY
      ptr.x = p.x; ptr.y = p.y
      trail.push({ x: p.x, y: p.y, t: clock })
    }
  })
  const up = e => {
    if (!ptr || ptr.id !== e.pointerId) return
    const P = ptr; ptr = null
    if (!canCut() || P.cuts || P.moved > 12) return
    const p = toWorld(e.clientX, e.clientY)
    const id = E.tapCut(world, p.x, p.y, Math.max(14, 23 / view.s))
    if (id) { window.__cuts = (window.__cuts || 0) + 1; window.__taps = (window.__taps || 0) + 1 }
  }
  cv.addEventListener('pointerup', up)
  cv.addEventListener('pointercancel', e => { if (ptr && ptr.id === e.pointerId) ptr = null })
  $('bStart').onclick = () => { click(); show('play'); load(best > 0 && best < LV.length ? best : (Q.has('lv') ? Number(Q.get('lv')) - 1 : 0)) }
  $('bStages').onclick = () => { click(); openStages() }
  $('tabB').onclick = () => { click(); openStages(0) }
  $('tabA').onclick = () => { click(); openStages(1) }
  $('bStBack').onclick = () => { click(); show('title') }
  $('bHow').onclick = () => { click(); show('how') }
  $('bHowClose').onclick = () => { click(); show('title') }
  $('bLang').onclick = () => { click(); lang = lang === 'ja' ? 'en' : 'ja'; store.set('roper_lang', lang); applyLang() }
  $('bRestart').onclick = () => { click(); load(lvIdx) }
  $('bMenu').onclick = () => { click(); applyLang(); show('title') }
  $('bNext').onclick = () => {
    click()
    if (world.state === 'clear') { if (lvIdx === LV.length - 1) openEnd(); else load(lvIdx + 1) }
    else load(lvIdx)
  }
  $('bSave').onclick = () => { click(); saveCanvas(shareImage(world.state === 'clear'), `rope-rescue-${lvIdx + 1}.png`); if (window.TM) TM.share('save') }
  $('bPost').onclick = () => { if (window.TM) TM.share('x') }
  $('bEndSave').onclick = () => { click(); saveCanvas($('endCv'), 'rope-rescue-all.png'); if (window.TM) TM.share('save') }
  $('bEndPost').onclick = () => { if (window.TM) TM.share('x') }
  $('bAgain').onclick = () => { click(); show('play'); load(0) }
  $('bMute').onclick = () => { audioStart(); muted = !muted; store.set('roper_mute', muted); Snd.setMute(muted); $('bMute').classList.toggle('on', muted) }
  $('bMute').classList.toggle('on', muted)
  addEventListener('resize', () => { layout() })

  // ---- 検証用の窓口
  window.roper = {
    get w() { return world }, get mode() { return mode }, get lv() { return lvIdx }, get sheet() { return sheetOn }, get view() { return Object.assign({}, view) },
    get hint() { return hintRope() }, get tutor() { return tutorOn },
    load: (i, o) => { show('play'); load(i, o) }, ropeXY: ropeScreen, levels: LV.length,
    dbg: { pause: v => { paused = v !== false; acc = 0; lastT = performance.now() }, step: n => { for (let i = 0; i < (n || 1); i++) stepOnce() }, settleView: () => { calcTarget(); Object.assign(view, target) }, setView: o => { Object.assign(target, o); Object.assign(view, o) }, say, fails: (i, n) => { fails[i] = n }, hintNow: () => hintNow(), trail: pts => { for (const p of pts) trail.push({ x: p[0], y: p[1], t: clock - (p[2] || 0) }) } },
    art: { drawHero, drawChest, drawMonster, drawBoulder },
    texts: () => [...document.querySelectorAll('main:not([hidden]) #capT, main:not([hidden]) #narr, main:not([hidden]) #stamp, main:not([hidden]) #tutorT')].filter(e => e.offsetParent && e.textContent && getComputedStyle(e.closest('.cap') || e).visibility !== 'hidden' && !e.closest('[hidden]')).map(e => e.textContent).concat(bubble ? [bubble.text] : []),
    T: () => T,
  }

  // ---- 起動
  applyLang()
  layout()
  const fontsReady = (document.fonts && document.fonts.ready) ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]) : Promise.resolve()
  fontsReady.then(() => {
    window.__bootStep(); window.__bootStep()
    window.__bootDone = true
    $('boot').classList.add('gone')
    if (Q.has('lv')) { show('play'); load(Number(Q.get('lv')) - 1) } else show('title')
    layout()
    window.__roperReady = true
  })
  requestAnimationFrame(frame)
})()
