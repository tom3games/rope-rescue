// ひも切りの物理。ひもは verlet の鎖、ぶら下がる物は円の体、壁は凸多角形。
// 固定60Hz（step() 1回 = 1/60秒）。乱数を使わないので、同じ順番・同じ間合いなら同じ結果になる。
// ブラウザでは window.RopeEngine、node（tools/check.mjs）では globalThis.RopeEngine
;(function (root) {
  'use strict'
  const W = 360, H = 600, DT = 1 / 60, G = 1000
  const FLOOR = 576, SEG = 12, ITER = 28
  const NODE_INV = 10
  const KIND = {
    chest: { r: 15, m: 22, e: 0.12, grip: 0.04 },
    boulder: { r: 19, m: 48, e: 0.06, grip: 0.2 },
    bucket: { r: 13, m: 16, e: 0.1, grip: 0.2 },
    bomb: { r: 12, m: 14, e: 0.25, grip: 0.1 },
    hero: { r: 19, m: 26, e: 0.05, grip: 0.35 },
    cage: { r: 21, m: 30, e: 0.08, grip: 0.3 },
  }
  const HERO_HAND = -36   // 体の中心から手までの高さ（ぶら下がる時）
  const HERO_FEET = 21    // 体の中心から足まで

  // ---- 形
  function rectPoly(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] }
  function makePoly(pts, kind) {
    const n = pts.length, edges = []
    let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1] }
    if (area < 0) pts = pts.slice().reverse()
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
      edges.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], nx: dy / L, ny: -dx / L, L })
      x0 = Math.min(x0, a[0]); y0 = Math.min(y0, a[1]); x1 = Math.max(x1, a[0]); y1 = Math.max(y1, a[1])
    }
    return { pts, edges, x0, y0, x1, y1, kind: kind || 'wall', gone: false }
  }
  function polyHit(P, x, y, r, out) {
    if (x < P.x0 - r || x > P.x1 + r || y < P.y0 - r || y > P.y1 + r) return false
    let maxD = -1e9, me = null
    for (const e of P.edges) { const d = (x - e.ax) * e.nx + (y - e.ay) * e.ny; if (d > maxD) { maxD = d; me = e } }
    if (maxD < 0) { out.nx = me.nx; out.ny = me.ny; out.d = r - maxD; return true }
    let best = 1e9, cx = 0, cy = 0
    for (const e of P.edges) {
      const dx = e.bx - e.ax, dy = e.by - e.ay
      let t = ((x - e.ax) * dx + (y - e.ay) * dy) / (e.L * e.L); t = t < 0 ? 0 : t > 1 ? 1 : t
      const px = e.ax + dx * t, py = e.ay + dy * t, d2 = (x - px) ** 2 + (y - py) ** 2
      if (d2 < best) { best = d2; cx = px; cy = py }
    }
    if (best >= r * r) return false
    const d = Math.sqrt(best) || 1e-6
    out.nx = (x - cx) / d; out.ny = (y - cy) / d; out.d = r - d; return true
  }
  function polyDist(P, x, y) {
    let maxD = -1e9; for (const e of P.edges) maxD = Math.max(maxD, (x - e.ax) * e.nx + (y - e.ay) * e.ny)
    if (maxD < 0) return 0
    let best = 1e9
    for (const e of P.edges) { const dx = e.bx - e.ax, dy = e.by - e.ay; let t = ((x - e.ax) * dx + (y - e.ay) * dy) / (e.L * e.L); t = t < 0 ? 0 : t > 1 ? 1 : t; best = Math.min(best, Math.hypot(x - e.ax - dx * t, y - e.ay - dy * t)) }
    return best
  }
  // 線分どうしが交わるか
  function segX(ax, ay, bx, by, cx, cy, dx, dy) {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return false
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d
    return t >= 0 && t <= 1 && u >= 0 && u <= 1
  }
  function distSeg(x, y, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1; let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(x - ax - dx * t, y - ay - dy * t) }

  // ---- 世界を作る
  function create(def, opt) {
    opt = opt || {}
    const w = {
      def, t: 0, frame: 0, state: 'play', reason: '', endAt: 0, settling: false,
      polys: [], bodies: [], ropes: [], walkers: [], lavas: [], events: [], cuts: [],
      hero: { x: 0, y: 0, dead: false, how: '', wet: 0, fear: 0, joy: 0, deadT: 0, standing: true, body: null },
      quiet: 0, winHold: 0, lastCut: -1, variant: opt.variant || {},
    }
    // 外枠（左右・天井・床。床は溶岩の池の所だけ低い）
    w.polys.push(makePoly(rectPoly(-60, -200, 80, H + 300), 'frame'))
    w.polys.push(makePoly(rectPoly(W - 20, -200, 80, H + 300), 'frame'))
    w.polys.push(makePoly(rectPoly(-60, -200, W + 120, 218), 'frame'))
    const pools = (def.lava || []).map(r => ({ x: r[0], w: r[1] }))
    let fx = -60
    for (const p of pools.slice().sort((a, b) => a.x - b.x)) { if (p.x > fx) w.polys.push(makePoly(rectPoly(fx, FLOOR, p.x - fx, 80), 'floor')); fx = p.x + p.w }
    w.polys.push(makePoly(rectPoly(fx, FLOOR, W + 60 - fx, 80), 'floor'))
    w.polys.push(makePoly(rectPoly(-60, H, W + 120, 60), 'floor'))
    for (const p of pools) w.lavas.push({ x: p.x, y: FLOOR + 4, w: p.w, h: H - FLOOR - 4, stone: false, poly: null })
    for (const r of def.walls || []) w.polys.push(makePoly(Array.isArray(r[0]) ? r : rectPoly(r[0], r[1], r[2], r[3])))
    for (const r of def.cracked || []) w.polys.push(makePoly(rectPoly(r[0], r[1], r[2], r[3]), 'cracked'))
    for (const r of def.spikes || []) w.polys.push(makePoly(rectPoly(r[0], r[1], r[2], r[3]), 'spikes'))
    // 勇者
    const h = w.hero, hd = def.hero
    if (hd.hang) {
      const b = addBody(w, { id: 'hero', kind: 'hero', x: hd.x, y: hd.y, v: hd.v, swing: hd.swing })
      h.standing = false; h.body = b; h.x = b.x; h.y = b.y + HERO_FEET
    } else { h.x = hd.x; h.y = hd.y || FLOOR; makeHeroPoly(w) }
    for (const t of def.things || []) addBody(w, t)
    for (const m of def.monsters || []) w.walkers.push(addWalker(w, m[0], m[1] || FLOOR, m[2]))
    w.tieDone = false
    // ひも
    for (const rd of def.ropes) {
      const A = endpoint(w, rd.from, rd.to), B = endpoint(w, rd.to, rd.from)
      const ax = A.x, ay = A.y, bx = B.x, by = B.y
      const dist = Math.hypot(bx - ax, by - ay), len = dist * (rd.slack || 1)
      const n = Math.max(3, Math.round(len / SEG)), rest = len / n
      const nodes = []
      for (let i = 0; i <= n; i++) {
        const k = i / n, x = ax + (bx - ax) * k, y = ay + (by - ay) * k + Math.sin(k * Math.PI) * (len - dist) * 0.5
        nodes.push({ x, y, px: x, py: y })
      }
      w.ropes.push({ id: rd.id, A, B, nodes, n, rest, len, cut: new Array(n).fill(false), anyCut: false, cutT: -1, cutAt: rd.cutAt == null ? 0.5 : rd.cutAt })
    }
    return w
  }
  function makeHeroPoly(w) { const h = w.hero; w.heroPoly = makePoly(rectPoly(h.x - 12, h.y - 52, 24, 52), 'hero') }
  function addBody(w, t) {
    const K = KIND[t.kind]
    const b = { id: t.id, kind: t.kind, x: t.x, y: t.y, px: t.x, py: t.y, r: K.r, inv: 1 / K.m, e: K.e, grip: K.grip, alive: true, v0: t.v || null,
      ground: 0, maxV: 0, full: true, rot: 0, spin: 0, landed: false, free: !!t.free, swing: !!t.swing, monster: t.kind === 'cage', tie: false, hp: 0 }
    w.bodies.push(b); return b
  }
  function addWalker(w, x, y, o) {
    o = o || {}
    return { x, y, face: -1, speed: o.speed || 26, alive: true, how: '', deadT: 0, moving: false, tie: !!(w.variant.tie && !w.walkers.length), wait: o.wait || 0 }
  }
  function endpoint(w, e, other) {
    if (Array.isArray(e)) return { fixed: true, x: e[0], y: e[1] }
    const b = w.bodies.find(q => q.id === e)
    let ox = 0, oy = 0
    if (b.kind === 'hero') { oy = HERO_HAND; const o = Array.isArray(other) ? other : null; ox = o ? (o[0] < b.x - 4 ? -8 : o[0] > b.x + 4 ? 8 : 0) : 0 }
    else if (b.kind === 'bucket') oy = -14
    else if (b.kind === 'chest') oy = -12
    else if (b.kind === 'cage') oy = -20
    else if (b.kind === 'bomb') oy = -14
    else oy = -b.r + 2
    return { body: b, ox, oy, get x() { return b.x + ox }, get y() { return b.y + oy } }
  }
  // 鎖の i 番目の点（端は体か固定点）
  function ropeEnds(r) { return [r.A, r.B] }

  // ---- 切る
  function cutLink(w, r, i, x, y) {
    if (w.state !== 'play' || r.cut[i]) return false
    r.cut[i] = true
    const first = !r.anyCut; r.anyCut = true; if (r.cutT < 0) r.cutT = w.t
    if (first) { w.cuts.push({ id: r.id, t: w.t }); w.lastCut = w.t; w.quiet = 0 }
    const a = r.nodes[i], b = r.nodes[i + 1]
    w.events.push({ e: 'cut', id: r.id, x: x == null ? (a.x + b.x) / 2 : x, y: y == null ? (a.y + b.y) / 2 : y, first })
    return true
  }
  function nodePos(r, i) { return i === 0 ? r.A : i === r.n ? r.B : r.nodes[i] }
  // 台本用: ひもの決まった所（cutAt の割合）を切る
  function cut(w, id) {
    const r = w.ropes.find(q => q.id === id); if (!r || r.anyCut) return false
    const i = Math.min(r.n - 1, Math.max(0, Math.floor(r.n * r.cutAt)))
    return cutLink(w, r, i)
  }
  // 指でなぞった線と交わる鎖を切る（1本のひもにつき1か所）
  function swipe(w, x0, y0, x1, y1) {
    const out = []
    if (w.state !== 'play') return out
    for (const r of w.ropes) {
      for (let i = 0; i < r.n; i++) {
        if (r.cut[i]) continue
        const a = nodePos(r, i), b = nodePos(r, i + 1)
        if (segX(x0, y0, x1, y1, a.x, a.y, b.x, b.y)) { if (cutLink(w, r, i)) out.push(r.id); break }
      }
    }
    return out
  }
  // 押した所のいちばん近い鎖を切る（なぞれない人のため）
  function tapCut(w, x, y, rad) {
    if (w.state !== 'play') return null
    let best = null, bd = rad
    for (const r of w.ropes) for (let i = 0; i < r.n; i++) {
      if (r.cut[i]) continue
      const a = nodePos(r, i), b = nodePos(r, i + 1), d = distSeg(x, y, a.x, a.y, b.x, b.y)
      if (d < bd) { bd = d; best = [r, i] }
    }
    if (best && cutLink(w, best[0], best[1], x, y)) return best[0].id
    return null
  }
  // ひもの、切る目安の所（画面に出す・テストで押す）
  function ropePoint(w, id, frac) {
    const r = w.ropes.find(q => q.id === id); if (!r) return null
    const i = Math.min(r.n - 1, Math.max(0, Math.floor(r.n * (frac == null ? r.cutAt : frac))))
    const a = nodePos(r, i), b = nodePos(r, i + 1), L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, tx: (b.x - a.x) / L, ty: (b.y - a.y) / L, cut: r.anyCut }
  }
  // そのひもが今も体を吊っているか（両端がつながっている）
  function holds(r) { return !r.anyCut && (!r.B.body || r.B.body.alive) && (!r.A.body || r.A.body.alive) }

  // ---- 1歩
  const tmp = { nx: 0, ny: 0, d: 0 }
  function step(w) {
    const settle = w.settling
    w.frame++; if (!settle) w.t += DT
    const h = w.hero
    // 動かす
    for (const b of w.bodies) {
      if (!b.alive) continue
      const damp = b.swing ? 1 : settle ? 0.9 : b.kind === 'hero' ? 0.994 : 0.998
      const vx = (b.x - b.px) * damp, vy = (b.y - b.py) * damp
      b.px = b.x; b.py = b.y; b.x += vx; b.y += vy + G * DT * DT
    }
    for (const r of w.ropes) for (let i = 1; i < r.n; i++) {
      const p = r.nodes[i], damp = settle ? 0.9 : 0.995
      const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp
      p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + G * DT * DT
    }
    // ひもの長さを守る
    for (let it = 0; it < ITER; it++) {
      for (const r of w.ropes) {
        for (let i = 0; i < r.n; i++) {
          if (r.cut[i]) continue
          constrain(r, i, i + 1, r.rest)
        }
        // 全体の長さ（伸びすぎない）
        if (!r.anyCut) {
          const A = r.A, B = r.B, dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy)
          if (d > r.len) {
            const ia = A.body ? A.body.inv : 0, ib = B.body ? B.body.inv : 0, s = ia + ib
            if (s > 0) { const k = (d - r.len) / d / s; if (A.body) { A.body.x += dx * k * ia; A.body.y += dy * k * ia } if (B.body) { B.body.x -= dx * k * ib; B.body.y -= dy * k * ib } }
          }
        }
      }
    }
    // 切れたひもは床や壁に積もる（切れていないひもは壁を通り抜ける。解き方を変えないため）
    for (const r of w.ropes) {
      if (!r.anyCut) continue
      for (let i = 1; i < r.n; i++) {
        const p = r.nodes[i]
        for (const P of w.polys) { if (P.gone || !polyHit(P, p.x, p.y, 2.5, tmp)) continue; p.x += tmp.nx * tmp.d; p.y += tmp.ny * tmp.d; p.px = p.x - (p.x - p.px) * 0.3; p.py = p.y - (p.y - p.py) * 0.3 }
        for (const L of w.lavas) if (!L.stone && p.x > L.x && p.x < L.x + L.w && p.y > L.y + 2) { p.y = L.y + 2; p.py = p.y }
      }
    }
    // 壁・床とぶつかる
    for (const b of w.bodies) {
      if (!b.alive) continue
      b.ground = Math.max(0, b.ground - 1)
      let vx = b.x - b.px, vy = b.y - b.py
      let hitKind = null, hitV = 0
      const list = w.heroPoly && h.standing && !h.dead ? w.polys.concat([w.heroPoly]) : w.polys
      for (const P of list) {
        if (P.gone || !polyHit(P, b.x, b.y, b.r, tmp)) continue
        b.x += tmp.nx * tmp.d; b.y += tmp.ny * tmp.d
        const vn = vx * tmp.nx + vy * tmp.ny
        if (vn < 0) {
          const tx = vx - vn * tmp.nx, ty = vy - vn * tmp.ny, gr = tmp.ny < -0.5 ? b.grip : b.grip * 0.3
          vx = tx * (1 - gr) - b.e * vn * tmp.nx; vy = ty * (1 - gr) - b.e * vn * tmp.ny
          if (-vn * 60 > hitV) { hitV = -vn * 60; hitKind = P.kind }
        }
        b.px = b.x - vx; b.py = b.y - vy
        if (tmp.ny < -0.5) b.ground = 4
        if (!settle) touchPoly(w, b, P, -vn * 60)
        if (!b.alive) break
      }
      if (!settle && hitV > 140) w.events.push({ e: 'land', kind: b.kind, x: b.x, y: b.y + b.r, v: hitV, on: hitKind })
      if (b.alive && b.kind === 'chest' && hitV > 60) b.spin = (b.x - b.px) * 0.02
    }
    // 体どうし
    const B = w.bodies
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], c = B[j]; if (!a.alive || !c.alive) continue
      const dx = c.x - a.x, dy = c.y - a.y, rr = a.r + c.r, d2 = dx * dx + dy * dy
      if (d2 >= rr * rr) continue
      const d = Math.sqrt(d2) || 1e-6, ov = rr - d, s = a.inv + c.inv, nx = dx / d, ny = dy / d
      const rv = ((c.x - c.px) - (a.x - a.px)) * nx + ((c.y - c.py) - (a.y - a.py)) * ny
      a.x -= nx * ov * a.inv / s; a.y -= ny * ov * a.inv / s; c.x += nx * ov * c.inv / s; c.y += ny * ov * c.inv / s
      if (!settle) touchBodies(w, a, c, -rv * 60)
    }
    if (settle) return
    // 勇者（ぶら下がっている時）
    if (h.body) {
      const b = h.body
      if (b.alive) { h.x = b.x; h.y = b.y + HERO_FEET }
      const sp = Math.hypot(b.x - b.px, b.y - b.py) * 60
      const hanging = w.ropes.some(r => r.B.body === b && holds(r))
      if (!h.dead && !hanging && b.ground && sp < 40) { b.landT = (b.landT || 0) + 1 } else b.landT = 0
      if (!h.dead && b.landT > 8) {   // 着地したら立つ
        h.standing = true; h.x = b.x; h.y = b.y + HERO_FEET; b.alive = false; h.body = null; makeHeroPoly(w)
        w.events.push({ e: 'stand', x: h.x, y: h.y })
      }
      if (!h.dead && b.alive && b.y > H + 40) killHero(w, 'fall')
    }
    // 魔物（歩く）
    for (const m of w.walkers) {
      if (!m.alive) continue
      if (h.dead || w.state === 'clear') { m.moving = false; continue }
      if (m.wait > 0) { m.wait -= DT; m.moving = false; continue }
      const dir = Math.sign(h.x - m.x) || -1; m.face = dir
      const nx = m.x + dir * m.speed * DT
      let blocked = false
      for (const P of w.polys) { if (P.gone || P.kind === 'floor' || P.kind === 'stone') continue; if (polyHit(P, nx, m.y - 15, 13, tmp) && tmp.nx * dir < -0.5) { blocked = true; break } }
      m.moving = !blocked
      if (!blocked) m.x = nx
      // 溶岩に入ったら燃える
      for (const L of w.lavas) if (!L.stone && m.x > L.x + 6 && m.x < L.x + L.w - 6 && m.y >= FLOOR - 2) { killWalker(w, m, 'burn'); break }
      // 上から落ちてきた物
      for (const b of w.bodies) {
        if (!m.alive || !b.alive) continue
        const dx = b.x - m.x, dy = b.y - (m.y - 15), rr = b.r + 14
        if (dx * dx + dy * dy > rr * rr) continue
        const v = Math.hypot(b.x - b.px, b.y - b.py) * 60
        if (b.kind === 'boulder' && v > 90) killWalker(w, m, 'squash')
        else if (b.kind === 'bomb') explode(w, b)
      }
      if (m.alive && h.standing && !h.dead && Math.abs(m.x - h.x) < 22 && Math.abs(m.y - h.y) < 30) killHero(w, 'monster')
    }
    // こわがる・よろこぶ
    if (!h.dead) {
      let fear = 0
      for (const b of w.bodies) if (b.alive && (b.kind === 'boulder' || b.kind === 'bomb' || b.kind === 'cage')) {
        const dx = Math.abs(b.x - h.x), dy = h.y - b.y, vy = (b.y - b.py) * 60
        if (dx < 70 && dy > 0 && dy < 380 && vy > 60) fear = Math.max(fear, 1)
      }
      for (const m of w.walkers) if (m.alive && Math.abs(m.x - h.x) < 110) fear = Math.max(fear, 0.8)
      if (h.body) { for (const L of w.lavas) if (!L.stone && h.x > L.x - 20 && h.x < L.x + L.w + 20) fear = Math.max(fear, 0.6); for (const P of w.polys) if (P.kind === 'spikes' && h.x > P.x0 - 10 && h.x < P.x1 + 10) fear = Math.max(fear, 0.6) }
      h.fear += (fear - h.fear) * 0.15
      const ch = w.bodies.find(b => b.kind === 'chest')
      const near = ch && ch.alive && inRoom(w, ch)
      h.joy += ((near ? 1 : 0) - h.joy) * 0.1
      h.wet = Math.max(0, h.wet - DT * 0.4)
    }
    // 決着
    checkEnd(w)
  }
  function constrain(r, i, j, rest) {
    const a = nodePos(r, i), b = nodePos(r, j)
    const ia = i === 0 ? (r.A.fixed ? 0 : r.A.body.inv) : NODE_INV
    const ib = j === r.n ? (r.B.fixed ? 0 : r.B.body.inv) : NODE_INV
    const s = ia + ib; if (!s) return
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6
    if (d <= rest) return   // ひもは押し返さない（たるむだけ）
    const k = (d - rest) / d / s
    if (ia) { if (i === 0) { r.A.body.x += dx * k * ia; r.A.body.y += dy * k * ia } else { a.x += dx * k * ia; a.y += dy * k * ia } }
    if (ib) { if (j === r.n) { r.B.body.x -= dx * k * ib; r.B.body.y -= dy * k * ib } else { b.x -= dx * k * ib; b.y -= dy * k * ib } }
  }
  function inRoom(w, b) { const R = w.def.room; return R && b.x > R[0] && b.x < R[0] + R[2] && b.y > R[1] && b.y < R[1] + R[3] }
  // 体が壁・床・とげ・勇者に触れた
  function lavaUnder(w, x, pad) { for (const L of w.lavas) if (!L.stone && x > L.x - pad && x < L.x + L.w + pad) return L; return null }
  function quench(w, b, L) {   // 水で固まって石になる
    L.stone = true; b.full = false
    L.poly = makePoly(rectPoly(L.x, L.y, L.w, H - L.y + 60), 'stone'); w.polys.push(L.poly)
    w.events.push({ e: 'quench', x: b.x, y: L.y, lava: L })
    b.y = Math.min(b.y, L.y - b.r); b.py = b.y
  }
  function touchPoly(w, b, P, v) {
    const h = w.hero
    if (b.kind === 'bucket' && b.full && P.kind === 'floor' && b.y > FLOOR - 30) { const L = lavaUnder(w, b.x, b.r); if (L) return quench(w, b, L) }
    if (P.kind === 'cracked' && b.kind === 'bomb') return explode(w, b)
    if (b.kind === 'bomb' && (v > 230 || P.kind === 'hero')) return explode(w, b)
    if (P.kind === 'hero') {
      if (b.kind === 'boulder' && v > 70) return killHero(w, 'squash')
      if (b.kind === 'cage') { killHero(w, 'monster'); return }
      if (b.kind === 'bucket' && b.full && v > 50) { b.full = false; h.wet = 1.2; w.events.push({ e: 'splash', x: b.x, y: b.y, on: 'hero' }) }
      return
    }
    if (P.kind === 'spikes') {
      if (b.kind === 'hero') return killHero(w, 'spike')
      if (b.kind === 'cage') { b.alive = false; w.events.push({ e: 'mdie', how: 'spike', x: b.x, y: b.y, tie: b.tie }); return }
    }
    if (b.kind === 'bucket' && b.full && v > 120) { b.full = false; w.events.push({ e: 'splash', x: b.x, y: b.y + 8, on: P.kind }) }
    if (b.kind === 'cage' && v > 100 && P.kind !== 'frame') {   // 檻が床で壊れて、中の魔物が出てくる
      b.alive = false
      const m = addWalker(w, b.x, b.y + b.r, { speed: 30 }); m.tie = b.tie; w.walkers.push(m)
      w.events.push({ e: 'cagebreak', x: b.x, y: b.y })
    }
  }
  function touchBodies(w, a, c, v) {
    for (const [p, q] of [[a, c], [c, a]]) {
      if (!p.alive || !q.alive) continue
      if (p.kind === 'bomb' && (v > 200 || q.kind === 'hero' || q.kind === 'cage')) { explode(w, p); return }
      if (p.kind === 'boulder' && q.kind === 'hero' && v > 120) { killHero(w, 'squash'); return }
      if (p.kind === 'boulder' && q.kind === 'cage' && v > 120) { q.alive = false; w.events.push({ e: 'mdie', how: 'squash', x: q.x, y: q.y, tie: q.tie }); return }
      if (p.kind === 'cage' && q.kind === 'hero') { killHero(w, 'monster'); return }
      if (p.kind === 'boulder' && q.kind === 'chest' && v > 180) { q.alive = false; w.events.push({ e: 'smash', x: q.x, y: q.y }); fail(w, 'smash'); return }
      if (p.kind === 'bucket' && p.full && q.kind === 'hero' && v > 40) { p.full = false; w.hero.wet = 1.2; w.events.push({ e: 'splash', x: p.x, y: p.y, on: 'hero' }) }
    }
  }
  function explode(w, b) {
    if (!b.alive) return
    b.alive = false
    const x = b.x, y = b.y, h = w.hero
    w.events.push({ e: 'boom', x, y })
    for (const P of w.polys) if (P.kind === 'cracked' && !P.gone && polyDist(P, x, y) < 64) { P.gone = true; w.events.push({ e: 'crack', x: (P.x0 + P.x1) / 2, y: (P.y0 + P.y1) / 2, poly: P }) }
    const hx = h.body ? h.body.x : h.x, hy = h.body ? h.body.y : h.y - 28
    if (!h.dead && Math.hypot(hx - x, hy - y) < 78) killHero(w, 'bomb')
    for (const m of w.walkers) if (m.alive && Math.hypot(m.x - x, m.y - 15 - y) < 90) killWalker(w, m, 'blast')
    for (const q of w.bodies) {
      if (!q.alive || q === b) continue
      const dx = q.x - x, dy = q.y - y, d = Math.hypot(dx, dy) || 1
      if (q.kind === 'chest' && d < 58) { q.alive = false; w.events.push({ e: 'chestboom', x: q.x, y: q.y }); fail(w, 'blown'); continue }
      if (q.kind === 'cage' && d < 80) { q.alive = false; w.events.push({ e: 'mdie', how: 'blast', x: q.x, y: q.y, tie: q.tie }); continue }
      if (q.kind === 'bomb' && d < 70) { explode(w, q); continue }
      if (d < 110) { const k = (110 - d) / 110 * 6 * q.inv / 0.04; q.px -= dx / d * k; q.py -= dy / d * k }
    }
    // 近くのひもは焼き切れる
    for (const r of w.ropes) for (let i = 0; i < r.n; i++) { if (r.cut[i]) continue; const a = nodePos(r, i), c = nodePos(r, i + 1); if (distSeg(x, y, a.x, a.y, c.x, c.y) < 26) { r.cut[i] = true; if (!r.anyCut) { r.anyCut = true; r.cutT = w.t } } }
  }
  function killWalker(w, m, how) { if (!m.alive) return; m.alive = false; m.how = how; m.deadT = w.t; w.events.push({ e: 'mdie', how, x: m.x, y: m.y - 15, tie: m.tie }) }
  function killHero(w, how) {
    const h = w.hero; if (h.dead || w.state === 'clear') return
    h.dead = true; h.how = how; h.deadT = w.t
    w.events.push({ e: 'hdie', how, x: h.x, y: h.y })
    fail(w, how)
  }
  function fail(w, reason) { if (w.state !== 'play') return; w.state = 'fail'; w.reason = reason; w.endAt = w.t + 1.9 }
  function checkEnd(w) {
    // 溶岩
    for (const b of w.bodies) {
      if (!b.alive) continue
      for (const L of w.lavas) {
        if (L.stone || b.x < L.x - 2 || b.x > L.x + L.w + 2 || b.y + b.r < L.y + 3) continue
        if (b.kind === 'bucket' && b.full) quench(w, b, L)
        else if (b.kind === 'chest') { b.alive = false; w.events.push({ e: 'melt', x: b.x, y: L.y }); fail(w, 'melt') }
        else if (b.kind === 'hero') { killHero(w, 'lava'); b.y = Math.min(b.y, L.y + 6); b.py = b.y - 0.3 }
        else if (b.kind === 'bomb') explode(w, b)
        else if (b.kind === 'cage') { b.alive = false; w.events.push({ e: 'mdie', how: 'burn', x: b.x, y: L.y - 10, tie: b.tie }) }
        else if (b.kind === 'boulder' || b.kind === 'bucket') { if (!b.sink) { b.sink = true; w.events.push({ e: 'sink', x: b.x, y: L.y }) } b.y = Math.max(b.y - 0.6, L.y - b.r + 6); if (b.y > L.y + 2) b.alive = false }
        break
      }
    }
    if (w.state !== 'play') return
    // 宝箱が場外
    const ch = w.bodies.find(b => b.kind === 'chest')
    if (ch && ch.alive && ch.y > H + 30) { ch.alive = false; fail(w, 'lost') }
    // 勝ち
    const win = w.def.win || ['chest'], h = w.hero
    let ok = !h.dead
    for (const k of win) {
      if (k === 'chest') ok = ok && ch && ch.alive && inRoom(w, ch) && Math.hypot(ch.x - ch.px, ch.y - ch.py) * 60 < 25 && !w.ropes.some(r => r.B.body === ch && holds(r))
      if (k === 'monsters') ok = ok && !w.walkers.some(m => m.alive) && !w.bodies.some(b => b.kind === 'cage' && b.alive)
      if (k === 'hero') { const S = w.def.safe; ok = ok && h.standing && S && h.x > S[0] && h.x < S[0] + S[2] && h.y > S[1] && h.y < S[1] + S[3] }
    }
    w.winHold = ok ? w.winHold + 1 : 0
    if (w.winHold > 10) { w.state = 'clear'; w.endAt = w.t + 1.5; w.events.push({ e: 'win', x: h.x, y: h.y }); return }
    // 詰み: 何か切ったあと、全部止まって、もう何も吊っていない（歩く魔物がまだ歩いている時は待つ）
    const moving = w.bodies.some(b => b.alive && Math.hypot(b.x - b.px, b.y - b.py) * 60 > 12) || w.walkers.some(m => m.alive && m.moving) || (h.body && h.body.alive)
    const hanging = w.ropes.some(r => holds(r) && r.B.body && r.B.body.alive)
    if (w.cuts.length && !moving && !hanging) w.quiet += DT; else w.quiet = 0
    if (w.quiet > 1.6) fail(w, 'stuck')
  }

  // 置いた直後にひもをたるませて落ち着かせ（時間は数えない）、そのあと最初の勢いを入れる
  function prepare(w) {
    w.settling = true
    for (let i = 0; i < 60; i++) step(w)
    w.settling = false
    for (const b of w.bodies) {
      b.px = b.x; b.py = b.y
      if (b.v0) { b.px = b.x - b.v0[0] * DT; b.py = b.y - b.v0[1] * DT }
    }
    for (const r of w.ropes) for (const p of r.nodes) { p.px = p.x; p.py = p.y }
    w.events.length = 0
  }

  // 台本どおりに回す。steps: [[ひも, その前に待つ秒], ...]。最後に切ってから 12 秒まで待つ
  function runScript(def, steps, opt) {
    opt = opt || {}
    const w = create(def, opt); prepare(w)
    let k = 0, next = steps.length ? steps[0][1] : 1e9, base = 0
    const limit = (opt.limit || 30)
    while (w.t < limit) {
      if (k < steps.length && w.t >= base + next - 1e-9) {
        cut(w, steps[k][0]); base = w.t; k++
        next = k < steps.length ? steps[k][1] : 1e9
      }
      step(w); w.events.length = 0
      if (w.state !== 'play' && w.t >= w.endAt) break
      if (k >= steps.length && w.state === 'play' && w.t > base + 14) break
    }
    return w
  }

  root.RopeEngine = { W, H, FLOOR, DT, KIND, create, prepare, step, cut, swipe, tapCut, ropePoint, holds, runScript, makePoly, rectPoly, polyDist, nodePos, HERO_FEET, HERO_HAND }
})(typeof window !== 'undefined' ? window : globalThis)
