// 面のデータ。座標は 360x600 の世界（外枠: 左右20・天井18・床の上面 y576 は engine が足す）
// things: ぶら下がる物（chest 宝箱 / boulder 岩 / bucket 水のバケツ / bomb 爆弾 / cage 魔物入りの檻）
// ropes: from は天井の点 [x,y] か体の id、to は体の id。lava: 床の溶岩の池 [x,幅]。monsters: 歩く魔物 [x]
// room: 宝箱が止まればいい所 [x,y,w,h]。safe: 勇者が立てばいい所。win: 勝つ条件
// solve: 解ける台本 [[ひも, 前から待つ秒]...]。wrong: 失敗する台本（検証で必ず両方回す）。timing: 切る時が大事な面
;(function (root) {
  const L = []
  // 1 正しいひも
  L.push({
    key: 'pick', hero: { x: 76 }, room: [20, 430, 210, 150],
    things: [{ id: 'chest', kind: 'chest', x: 160, y: 270 }, { id: 'boulder', kind: 'boulder', x: 76, y: 250 }],
    ropes: [{ id: 'A', from: [160, 18], to: 'chest' }, { id: 'B', from: [76, 18], to: 'boulder' }],
    walls: [[250, 470, 90, 106]], torches: [[300, 420], [36, 330]],
    solve: [['A', 1]], wrong: [['B', 1], ['A', 1]],
  })
  // 2 先に切るほう
  L.push({
    key: 'order', hero: { x: 62 }, room: [20, 430, 156, 150], lava: [[196, 144]],
    walls: [[[176, 576], [176, 324], [186, 312], [196, 324], [196, 576]]],
    things: [{ id: 'chest', kind: 'chest', x: 186, y: 250 }],
    ropes: [{ id: 'A', from: [100, 18], to: 'chest' }, { id: 'B', from: [300, 18], to: 'chest' }],
    torches: [[40, 300], [270, 330]],
    solve: [['B', 1], ['A', 2.5]], wrong: [['A', 1], ['B', 2.5]],
  })
  // 3 切る場所（岩の下の宝箱）
  L.push({
    key: 'where', hero: { x: 92 }, room: [20, 430, 240, 150],
    things: [{ id: 'boulder', kind: 'boulder', x: 176, y: 210 }, { id: 'chest', kind: 'chest', x: 176, y: 330 }],
    ropes: [{ id: 'A', from: [176, 18], to: 'boulder' }, { id: 'B', from: 'boulder', to: 'chest' }],
    torches: [[44, 300], [300, 300]],
    solve: [['B', 1]], wrong: [['A', 1]],
  })
  // 4 水で溶岩を消す
  L.push({
    key: 'bucket', hero: { x: 52 }, room: [20, 430, 230, 150], lava: [[104, 140]],
    things: [{ id: 'chest', kind: 'chest', x: 206, y: 290 }, { id: 'bucket', kind: 'bucket', x: 146, y: 370 }],
    ropes: [{ id: 'A', from: [206, 18], to: 'chest' }, { id: 'B', from: [146, 18], to: 'bucket' }],
    walls: [[290, 500, 50, 76]], torches: [[316, 440], [40, 300]],
    solve: [['B', 1], ['A', 1.5]], wrong: [['A', 1], ['B', 1]],
  })
  // 5 落とす時（歩いてくる魔物に岩）
  L.push({
    key: 'drop', hero: { x: 46 }, room: [20, 430, 150, 150], monsters: [[330]], win: ['monsters', 'chest'], timing: true,
    things: [{ id: 'boulder', kind: 'boulder', x: 210, y: 330 }, { id: 'chest', kind: 'chest', x: 118, y: 300 }],
    ropes: [{ id: 'A', from: [210, 18], to: 'boulder' }, { id: 'B', from: [118, 18], to: 'chest' }],
    torches: [[40, 300], [300, 330]],
    solve: [['A', 3.6], ['B', 1]], wrong: [['A', 0.6], ['B', 1]],
  })
  // 6 勇者がぶら下がる
  L.push({
    key: 'hang', hero: { hang: true, x: 236, y: 250 }, win: ['hero'], safe: [212, 300, 128, 140],
    spikes: [[20, 560, 192, 16]], walls: [[212, 430, 128, 146]],
    deco: [{ kind: 'chest', x: 300, y: 430 }],
    ropes: [{ id: 'A', from: [64, 18], to: 'hero' }, { id: 'B', from: [276, 18], to: 'hero' }],
    torches: [[40, 300], [320, 380]],
    solve: [['A', 1], ['B', 2]], wrong: [['B', 1], ['A', 2]],
  })
  // 7 振り子で飛ばす
  L.push({
    key: 'swing', hero: { x: 300 }, room: [238, 430, 102, 150], lava: [[20, 196]], timing: true,
    walls: [[216, 380, 22, 196]],
    things: [{ id: 'chest', kind: 'chest', x: 150, y: 300, v: [230, 0], swing: true }],
    ropes: [{ id: 'A', from: [150, 18], to: 'chest' }],
    torches: [[290, 330], [40, 200]],
    solve: [['A', 3.6]], wrong: [['A', 1.6]],
  })
  // 8 爆弾で壁を壊す
  L.push({
    key: 'wall', hero: { x: 52 }, room: [20, 430, 152, 150],
    cracked: [[150, 380, 22, 196]], walls: [[[172, 562], [340, 470], [340, 576], [172, 576]]],
    things: [{ id: 'chest', kind: 'chest', x: 292, y: 290 }, { id: 'bomb', kind: 'bomb', x: 214, y: 496 }],
    ropes: [{ id: 'A', from: [112, 18], to: 'bomb' }, { id: 'B', from: [252, 18], to: 'bomb' }, { id: 'C', from: [292, 18], to: 'chest', cutAt: 0.3 }],
    torches: [[60, 330], [320, 380]],
    solve: [['B', 1], ['C', 2]], wrong: [['C', 1], ['B', 2]],
  })
  // 9 檻の魔物
  L.push({
    key: 'cage', hero: { x: 262 }, room: [190, 430, 150, 150], lava: [[20, 142]], win: ['monsters', 'chest'],
    things: [{ id: 'cage', kind: 'cage', x: 172, y: 270 }, { id: 'chest', kind: 'chest', x: 318, y: 320 }],
    ropes: [{ id: 'A', from: [84, 18], to: 'cage' }, { id: 'B', from: [276, 18], to: 'cage' }, { id: 'C', from: [318, 18], to: 'chest', cutAt: 0.7 }],
    torches: [[320, 300], [40, 200]],
    solve: [['B', 1], ['A', 2.5], ['C', 1]], wrong: [['A', 1], ['B', 2.5], ['C', 1]],
  })
  // 10 溶岩の上の勇者
  L.push({
    key: 'over', hero: { hang: true, x: 236, y: 236 }, win: ['hero'], safe: [100, 480, 240, 110], lava: [[100, 190]],
    things: [{ id: 'bucket', kind: 'bucket', x: 112, y: 340 }],
    ropes: [{ id: 'H', from: [236, 18], to: 'hero' }, { id: 'A', from: [40, 18], to: 'bucket' }, { id: 'B', from: [162, 18], to: 'bucket' }],
    deco: [{ kind: 'chest', x: 314, y: 576 }],
    torches: [[40, 400], [320, 300]],
    solve: [['A', 1], ['B', 2.5], ['H', 1.5]], wrong: [['H', 1]],
  })
  // 11 勇者を飛ばす
  L.push({
    key: 'leap', hero: { hang: true, x: 170, y: 270, v: [250, 0], swing: true }, win: ['hero'], timing: true,
    safe: [252, 300, 88, 110], spikes: [[20, 560, 232, 16]], walls: [[252, 400, 88, 176]],
    deco: [{ kind: 'chest', x: 306, y: 400 }],
    ropes: [{ id: 'A', from: [170, 18], to: 'hero' }],
    torches: [[300, 330], [40, 200]],
    solve: [['A', 3.3]], wrong: [['A', 1.6]],
  })
  // 12 溶岩が守っていた
  L.push({
    key: 'wait', hero: { x: 50 }, room: [20, 430, 210, 150], lava: [[96, 124]], monsters: [[330]], win: ['monsters', 'chest'], timing: true,
    things: [{ id: 'bucket', kind: 'bucket', x: 128, y: 360 }, { id: 'chest', kind: 'chest', x: 184, y: 300 }, { id: 'boulder', kind: 'boulder', x: 56, y: 250 }],
    ropes: [{ id: 'B', from: [128, 18], to: 'bucket' }, { id: 'C', from: [184, 18], to: 'chest' }, { id: 'R', from: [56, 18], to: 'boulder' }],
    torches: [[300, 330], [40, 330]],
    solve: [['B', 5.4], ['C', 1.5]], wrong: [['B', 1], ['C', 1.5]],
  })
  // ---- ここから上級（13〜30）。solve の3つ目: 'w' = この秒数以上待てばいい（落ち着くのを待つ）、't' = この時（前後0.3秒）に切る
  // 13 バネ（初めて）
  L.push({
    key: 'spring', hero: { x: 300 }, room: [240, 400, 100, 180], lava: [[134, 82]], adv: true,
    walls: [[216, 470, 24, 106]], springs: [[48, 562, 80, 30, 1000]],
    things: [{ id: 'chest', kind: 'chest', x: 90, y: 300 }, { id: 'boulder', kind: 'boulder', x: 50, y: 200 }],
    ropes: [{ id: 'A', from: [150, 18], to: 'chest', cutAt: 0.55 }, { id: 'B', from: [50, 18], to: 'boulder', cutAt: 0.5 }, { id: 'C', from: [84, 18], to: 'chest', cutAt: 0.3 }],
    torches: [[300, 330], [40, 330]],
    solve: [['A', 1], ['C', 1.5]], wrong: [['C', 1], ['A', 1.5, 't']], wrongs: [[['B', 1]], [['A', 1], ['B', 1.5]]],
  })
  // 14 木の板（初めて）: 板が坂になっていて、宝箱を先に落とすと溶岩へすべる。岩で板を割ってから
  L.push({
    key: 'plank', hero: { x: 50 }, room: [20, 430, 200, 150], lava: [[220, 120]], adv: true,
    planks: [[[96, 372], [312, 420], [312, 430], [96, 382]]],
    things: [{ id: 'chest', kind: 'chest', x: 150, y: 250 }, { id: 'boulder', kind: 'boulder', x: 270, y: 230 }, { id: 'bomb', kind: 'bomb', x: 60, y: 200 }],
    ropes: [{ id: 'A', from: [150, 18], to: 'chest', cutAt: 0.5 }, { id: 'B', from: [270, 18], to: 'boulder', cutAt: 0.5 }, { id: 'C', from: [60, 18], to: 'bomb', cutAt: 0.5 }],
    torches: [[40, 330], [320, 300]],
    solve: [['B', 1], ['A', 1.5]], wrong: [['A', 1], ['B', 1.5]], wrongs: [[['C', 1]]],
  })
  // 15 魔物が二匹: 二匹とも溶岩で燃えてから水。宝箱は棚をすべって石の上へ
  L.push({
    key: 'twins', hero: { x: 50 }, room: [20, 430, 210, 150], lava: [[120, 100]], monsters: [[286], [336, 576, { wait: 2.6 }]], win: ['monsters', 'chest'], adv: true,
    walls: [[[236, 410], [340, 382], [340, 400], [236, 420]]],
    things: [{ id: 'chest', kind: 'chest', x: 312, y: 300 }, { id: 'bucket', kind: 'bucket', x: 170, y: 330 }, { id: 'boulder', kind: 'boulder', x: 330, y: 470 }],
    ropes: [{ id: 'B', from: [170, 18], to: 'bucket', cutAt: 0.5 }, { id: 'C', from: [312, 18], to: 'chest', cutAt: 0.5 }, { id: 'E', from: [300, 404], to: 'boulder', cutAt: 0.5 }],
    torches: [[40, 330], [200, 220]],
    solve: [['B', 7.8, 'w'], ['C', 1.5]], wrong: [['B', 1], ['C', 1.5]], wrongs: [[['C', 1]], [['B', 4, 't'], ['C', 1.5]]],
  })
  // 16 勇者も宝箱も: 溶岩の上に勇者と宝箱。水を溶岩の上まで振ってから
  L.push({
    key: 'both', hero: { hang: true, x: 236, y: 236 }, win: ['hero', 'chest'], adv: true,
    safe: [60, 480, 280, 110], room: [60, 480, 280, 100], lava: [[60, 230]], walls: [[20, 470, 40, 106]],
    things: [{ id: 'bucket', kind: 'bucket', x: 76, y: 330 }, { id: 'chest', kind: 'chest', x: 150, y: 210 }],
    ropes: [{ id: 'H', from: [236, 18], to: 'hero', cutAt: 0.45 }, { id: 'A', from: [24, 150], to: 'bucket', cutAt: 0.5 }, { id: 'B', from: [140, 18], to: 'bucket', cutAt: 0.62 },
      { id: 'C', from: [150, 18], to: 'chest', cutAt: 0.5 }],
    torches: [[40, 400], [320, 300]],
    solve: [['A', 1], ['B', 2.5], ['H', 1.5], ['C', 1.5]], wrong: [['H', 1]], wrongs: [[['C', 1]], [['B', 1], ['A', 2.5], ['H', 1.5]]],
  })
  // 17 寝ている魔物: 壁を壊すと起きて来る。爆弾は届かない所に寝ているので、先に岩で
  L.push({
    key: 'sleep', hero: { x: 50 }, room: [20, 430, 150, 150], monsters: [[318, 576, { wait: 7, speed: 40 }]], win: ['monsters', 'chest'], adv: true,
    cracked: [[150, 380, 22, 196]], walls: [[[172, 576], [250, 554], [292, 576]]],
    things: [{ id: 'chest', kind: 'chest', x: 232, y: 300 }, { id: 'bomb', kind: 'bomb', x: 190, y: 330 }, { id: 'boulder', kind: 'boulder', x: 318, y: 220 }],
    ropes: [{ id: 'C', from: [232, 18], to: 'chest', cutAt: 0.4 }, { id: 'B', from: [190, 18], to: 'bomb', cutAt: 0.6 }, { id: 'R', from: [318, 18], to: 'boulder', cutAt: 0.45 }],
    torches: [[60, 330], [280, 360]],
    solve: [['R', 1], ['B', 1.5], ['C', 1.5]], wrong: [['B', 1], ['C', 1.5]], wrongs: [[['C', 1], ['R', 1], ['B', 1]]],
  })
  // 18 バネの先が溶岩: 先に向こうの溶岩へ水。岩をバネに落とすと勇者へ飛ぶ
  L.push({
    key: 'launch', hero: { x: 318 }, room: [240, 400, 100, 180], lava: [[134, 82], [244, 52]], adv: true,
    walls: [[216, 470, 24, 106]], springs: [[48, 562, 80, 30, 1000]],
    things: [{ id: 'chest', kind: 'chest', x: 90, y: 300 }, { id: 'boulder', kind: 'boulder', x: 50, y: 200 }, { id: 'bucket', kind: 'bucket', x: 268, y: 330 }],
    ropes: [{ id: 'A', from: [150, 18], to: 'chest', cutAt: 0.55 }, { id: 'B', from: [50, 18], to: 'boulder', cutAt: 0.5 }, { id: 'C', from: [84, 18], to: 'chest', cutAt: 0.3 }, { id: 'W', from: [268, 18], to: 'bucket', cutAt: 0.5 }],
    torches: [[300, 330], [40, 330]],
    solve: [['W', 1], ['A', 1.5], ['C', 1.5]], wrong: [['A', 1], ['C', 1.5]], wrongs: [[['B', 1]], [['C', 1], ['A', 1.5, 't']], [['W', 1], ['B', 1]]],
  })
  // 19 板の上に降ろす: 勇者を右へ振ってから板へ。宝箱はそのあと。岩は板を割る
  L.push({
    key: 'shelf', hero: { hang: true, x: 120, y: 230 }, win: ['hero', 'chest'], adv: true,
    spikes: [[20, 560, 320, 16]], planks: [[180, 400, 160, 12]], safe: [180, 300, 160, 104], room: [180, 300, 160, 104],
    things: [{ id: 'chest', kind: 'chest', x: 300, y: 250 }, { id: 'boulder', kind: 'boulder', x: 214, y: 150 }],
    ropes: [{ id: 'H1', from: [40, 18], to: 'hero', cutAt: 0.5 }, { id: 'H2', from: [262, 18], to: 'hero', cutAt: 0.3 }, { id: 'C', from: [300, 18], to: 'chest', cutAt: 0.6 }, { id: 'R', from: [214, 18], to: 'boulder', cutAt: 0.5 }],
    torches: [[40, 400], [320, 200]],
    solve: [['H1', 1], ['H2', 2], ['C', 1.5]], wrong: [['H2', 1], ['H1', 2]], wrongs: [[['R', 1], ['H1', 1], ['H2', 2]], [['H1', 1], ['H2', 2], ['R', 1.5]]],
  })
  // 20 水はわな: 魔物を溶岩で燃やしたいので、水は切らない。宝箱は右へ振ってから
  L.push({
    key: 'trap', hero: { x: 318 }, room: [236, 430, 104, 150], lava: [[130, 106]], win: ['monsters', 'chest'], adv: true,
    things: [{ id: 'cage', kind: 'cage', x: 70, y: 300 }, { id: 'bucket', kind: 'bucket', x: 172, y: 340 }, { id: 'chest', kind: 'chest', x: 246, y: 250 }, { id: 'boulder', kind: 'boulder', x: 120, y: 160 }],
    ropes: [{ id: 'K', from: [70, 18], to: 'cage', cutAt: 0.5 }, { id: 'W', from: [172, 18], to: 'bucket', cutAt: 0.55 }, { id: 'C1', from: [146, 18], to: 'chest', cutAt: 0.8 }, { id: 'C2', from: [326, 18], to: 'chest', cutAt: 0.45 }, { id: 'B', from: [120, 18], to: 'boulder', cutAt: 0.5 }],
    torches: [[40, 400], [300, 330]],
    solve: [['K', 1], ['C1', 1.5], ['C2', 2]], wrong: [['W', 1], ['K', 1], ['C1', 1.5], ['C2', 2]], wrongs: [[['K', 1], ['C2', 1.5], ['C1', 2, 't']], [['K', 1], ['W', 1, 't'], ['C1', 1.5], ['C2', 2]]],
  })
  // 21 揺れる岩（タイミング）: 棚で寝ている魔物の真上で岩を放す。そのあと勇者を右へ振って、揺れが収まってから棚へ
  L.push({
    key: 'rock', hero: { hang: true, x: 140, y: 300 }, win: ['hero', 'monsters'], adv: true,
    walls: [[176, 420, 164, 156]], spikes: [[20, 560, 156, 16]], safe: [176, 300, 164, 124], monsters: [[318, 420, { wait: 999 }]],
    things: [{ id: 'boulder', kind: 'boulder', x: 250, y: 200, v: [240, 0], swing: true }],
    ropes: [{ id: 'R', from: [250, 18], to: 'boulder', cutAt: 0.5 }, { id: 'H1', from: [56, 18], to: 'hero', cutAt: 0.55 }, { id: 'H2', from: [242, 18], to: 'hero', cutAt: 0.3 }],
    torches: [[40, 200], [320, 330]],
    solve: [['R', 2.55, 't'], ['H1', 1.5], ['H2', 2.2, 'w']], wrong: [['H1', 1], ['H2', 2]], wrongs: [[['R', 1.8, 't'], ['H1', 1.5], ['H2', 2.2, 'w']], [['R', 2.55, 't'], ['H2', 1.5], ['H1', 2]]],
  })
  // 22 ふたの板: バネの上の板を割るのは爆弾。岩で割ると、岩がバネで勇者へ飛ぶ
  L.push({
    key: 'lid', hero: { x: 318 }, room: [240, 400, 100, 180], lava: [[150, 66]], adv: true,
    walls: [[216, 470, 24, 106]], springs: [[48, 562, 80, 30, 1000]], planks: [[30, 470, 120, 10]],
    things: [{ id: 'chest', kind: 'chest', x: 90, y: 270 }, { id: 'boulder', kind: 'boulder', x: 44, y: 200 }, { id: 'bomb', kind: 'bomb', x: 136, y: 330 }],
    ropes: [{ id: 'C', from: [90, 18], to: 'chest', cutAt: 0.62 }, { id: 'R', from: [44, 18], to: 'boulder', cutAt: 0.45 }, { id: 'B', from: [136, 18], to: 'bomb', cutAt: 0.5 }],
    torches: [[300, 330], [190, 300]],
    solve: [['B', 1], ['C', 1.5]], wrong: [['R', 1]], wrongs: [[['C', 1], ['B', 1.5]]],
  })
  // 23 門: 溶岩に魔物の檻を落としてから水。爆弾で壁を開けてから宝箱
  L.push({
    key: 'gate', hero: { x: 50 }, room: [20, 430, 180, 150], lava: [[100, 100]], win: ['monsters', 'chest'], adv: true,
    cracked: [[200, 380, 22, 196]], walls: [[[222, 576], [340, 520], [340, 576]]],
    things: [{ id: 'cage', kind: 'cage', x: 130, y: 280 }, { id: 'bucket', kind: 'bucket', x: 176, y: 340 }, { id: 'bomb', kind: 'bomb', x: 250, y: 330 }, { id: 'chest', kind: 'chest', x: 306, y: 300 }],
    ropes: [{ id: 'K', from: [130, 18], to: 'cage', cutAt: 0.5 }, { id: 'W', from: [176, 18], to: 'bucket', cutAt: 0.6 }, { id: 'B', from: [250, 18], to: 'bomb', cutAt: 0.45 }, { id: 'C', from: [306, 18], to: 'chest', cutAt: 0.6 }],
    torches: [[40, 330], [300, 420]],
    solve: [['K', 1], ['W', 1.5], ['B', 1.5], ['C', 1.5]], wrong: [['W', 1], ['K', 1], ['B', 1.5], ['C', 1.5]], wrongs: [[['K', 1], ['W', 1.5], ['C', 1.5], ['B', 1.5]], [['K', 1], ['B', 1.5], ['C', 1.5], ['W', 1.5]]],
  })
  // 24 バネで勇者を: 着く棚で魔物が寝ている。勇者が近くに立つと起きるので、先に岩で
  L.push({
    key: 'hop', hero: { hang: true, x: 86, y: 240 }, win: ['hero', 'monsters'], adv: true,
    safe: [244, 330, 96, 160], lava: [[134, 82]], walls: [[216, 470, 24, 106], [244, 470, 96, 106]], springs: [[44, 562, 84, 30, 1000]], monsters: [[262, 470, { wait: 999 }]],
    things: [{ id: 'boulder', kind: 'boulder', x: 262, y: 230 }, { id: 'bomb', kind: 'bomb', x: 172, y: 300 }],
    deco: [{ kind: 'chest', x: 270, y: 470 }],
    ropes: [{ id: 'H', from: [86, 18], to: 'hero', cutAt: 0.45 }, { id: 'R', from: [262, 18], to: 'boulder', cutAt: 0.5 }, { id: 'B', from: [172, 18], to: 'bomb', cutAt: 0.5 }],
    torches: [[40, 330], [300, 400]],
    solve: [['R', 1], ['H', 1.5]], wrong: [['H', 1]], wrongs: [[['H', 1], ['R', 3, 't']], [['B', 1], ['H', 1.5]]],
  })
  // 25 檻が二つ: 二つとも溶岩に落としてから水、それから宝箱。宝箱の上の岩はさわらない
  L.push({
    key: 'cages', hero: { x: 46 }, room: [20, 430, 210, 150], lava: [[100, 130]], win: ['monsters', 'chest'], adv: true,
    things: [{ id: 'k1', kind: 'cage', x: 128, y: 250 }, { id: 'k2', kind: 'cage', x: 286, y: 270 }, { id: 'bucket', kind: 'bucket', x: 176, y: 340 }, { id: 'chest', kind: 'chest', x: 210, y: 230 }, { id: 'boulder', kind: 'boulder', x: 210, y: 120 }],
    ropes: [{ id: 'K1', from: [128, 18], to: 'k1', cutAt: 0.5 }, { id: 'K2', from: [286, 18], to: 'k2', cutAt: 0.5 }, { id: 'W', from: [176, 18], to: 'bucket', cutAt: 0.62 },
      { id: 'C', from: 'boulder', to: 'chest', cutAt: 0.5 }, { id: 'R', from: [210, 18], to: 'boulder', cutAt: 0.55 }],
    torches: [[40, 330], [300, 420]],
    solve: [['K1', 1], ['K2', 1.5], ['W', 2.6, 'w'], ['C', 1.5]], wrong: [['K1', 1], ['W', 1.5], ['K2', 1.5], ['C', 1.5]], wrongs: [[['K1', 1], ['K2', 1.5], ['W', 2.6, 'w'], ['R', 1.5]], [['C', 1]]],
  })
  // 26 勇者を跳ばす（タイミング）: 揺れている勇者をバネの上で放す
  L.push({
    key: 'vault', hero: { hang: true, x: 120, y: 280, v: [200, 0], swing: true }, win: ['hero'], timing: true, adv: true,
    safe: [244, 330, 96, 160], lava: [[134, 82]], walls: [[216, 470, 24, 106], [244, 470, 96, 106]], springs: [[22, 562, 90, 30, 1000]],
    things: [{ id: 'boulder', kind: 'boulder', x: 300, y: 180 }],
    deco: [{ kind: 'chest', x: 300, y: 470 }],
    ropes: [{ id: 'H', from: [120, 18], to: 'hero', cutAt: 0.45 }, { id: 'R', from: [300, 18], to: 'boulder', cutAt: 0.5 }],
    torches: [[40, 330], [300, 400]],
    solve: [['H', 1.7, 't']], wrong: [['H', 2.7, 't']], wrongs: [[['H', 0.8, 't']], [['R', 0.6, 't'], ['H', 1.1, 't']]],
  })
  // 27 リレー: 魔物が二匹とも溶岩で燃えてから、岩で板を割ってバケツを落とす。それから宝箱
  L.push({
    key: 'relay', hero: { x: 50 }, room: [20, 430, 220, 150], lava: [[110, 130]], monsters: [[330]], win: ['monsters', 'chest'], adv: true,
    planks: [[118, 392, 112, 10]],
    things: [{ id: 'bucket', kind: 'bucket', x: 206, y: 370, free: true }, { id: 'boulder', kind: 'boulder', x: 142, y: 200 }, { id: 'chest', kind: 'chest', x: 184, y: 250 }, { id: 'cage', kind: 'cage', x: 296, y: 280 }],
    ropes: [{ id: 'K', from: [296, 18], to: 'cage', cutAt: 0.5 }, { id: 'R', from: [142, 18], to: 'boulder', cutAt: 0.5 }, { id: 'C', from: [184, 18], to: 'chest', cutAt: 0.6 }],
    torches: [[40, 330], [320, 400]],
    solve: [['K', 1], ['R', 3.2, 'w'], ['C', 1.5]], wrong: [['R', 1], ['K', 1], ['C', 1.5]], wrongs: [[['K', 1], ['C', 1.5], ['R', 1.5]], [['K', 1], ['R', 1, 't'], ['C', 1.5]]],
  })
  // 28 みんな助ける: 溶岩の上に勇者と宝箱。水を振って溶岩へ。勇者は岩の下で切る。宝箱は右へ振ってから
  L.push({
    key: 'rescue', hero: { hang: true, x: 236, y: 250 }, win: ['hero', 'chest'], adv: true,
    safe: [60, 480, 280, 110], room: [200, 480, 140, 100], lava: [[60, 230]], walls: [[20, 470, 40, 106]],
    things: [{ id: 'bucket', kind: 'bucket', x: 76, y: 330 }, { id: 'chest', kind: 'chest', x: 150, y: 210 }, { id: 'boulder', kind: 'boulder', x: 236, y: 130 }],
    ropes: [{ id: 'D', from: [236, 18], to: 'boulder', cutAt: 0.5 }, { id: 'H', from: 'boulder', to: 'hero', cutAt: 0.5 }, { id: 'A', from: [24, 150], to: 'bucket', cutAt: 0.5 }, { id: 'B', from: [140, 18], to: 'bucket', cutAt: 0.62 },
      { id: 'C1', from: [96, 18], to: 'chest', cutAt: 0.5 }, { id: 'C2', from: [330, 18], to: 'chest', cutAt: 0.75 }],
    torches: [[40, 400], [320, 300]],
    solve: [['A', 1], ['B', 2.5], ['H', 1.5], ['C1', 1.5], ['C2', 2]], wrong: [['H', 1]], wrongs: [[['A', 1], ['B', 2.5], ['D', 1.5]], [['B', 1], ['A', 2.5], ['H', 1.5]], [['C2', 1], ['C1', 2, 't']]],
  })
  // 29 壁が二枚: 爆弾を二つとも落としてから宝箱。岩は坂を転がって、あとで勇者の方へ行く
  L.push({
    key: 'walls', hero: { x: 46 }, room: [20, 430, 124, 150], monsters: [[184]], win: ['monsters', 'chest'], adv: true,
    cracked: [[112, 380, 20, 196], [228, 380, 20, 196]], walls: [[[132, 576], [340, 528], [340, 576]]],
    things: [{ id: 'b1', kind: 'bomb', x: 160, y: 300 }, { id: 'b2', kind: 'bomb', x: 270, y: 320 }, { id: 'chest', kind: 'chest', x: 318, y: 290 }, { id: 'boulder', kind: 'boulder', x: 206, y: 190 }],
    ropes: [{ id: 'B1', from: [160, 18], to: 'b1', cutAt: 0.6 }, { id: 'B2', from: [270, 18], to: 'b2', cutAt: 0.6 }, { id: 'C', from: [318, 18], to: 'chest', cutAt: 0.45 }, { id: 'R', from: [206, 18], to: 'boulder', cutAt: 0.4 }],
    torches: [[60, 330], [300, 420]],
    solve: [['B1', 1], ['B2', 1.5], ['C', 1.5]], wrong: [['B2', 1], ['C', 1.5], ['B1', 1.5]], wrongs: [[['C', 1], ['B2', 1.5], ['B1', 1.5]], [['R', 1], ['B1', 1.5], ['B2', 1.5], ['C', 1.5]]],
  })
  // 30 ぜんぶ: 檻は溶岩へ、寝ている魔物は岩で。水はわな。宝箱、それから勇者をバネで棚へ
  L.push({
    key: 'finale', hero: { hang: true, x: 44, y: 250 }, win: ['hero', 'chest', 'monsters'], adv: true,
    safe: [240, 330, 100, 150], room: [240, 330, 100, 150], lava: [[112, 104]], walls: [[216, 470, 124, 106]], springs: [[22, 562, 90, 30, 940]], monsters: [[248, 470, { wait: 999 }]],
    things: [{ id: 'chest', kind: 'chest', x: 96, y: 300 }, { id: 'cage', kind: 'cage', x: 168, y: 250 }, { id: 'bucket', kind: 'bucket', x: 140, y: 380 }, { id: 'boulder', kind: 'boulder', x: 248, y: 210 }],
    ropes: [{ id: 'H', from: [44, 18], to: 'hero', cutAt: 0.4 }, { id: 'C', from: [96, 18], to: 'chest', cutAt: 0.6 }, { id: 'K', from: [184, 18], to: 'cage', cutAt: 0.5 }, { id: 'W', from: [140, 18], to: 'bucket', cutAt: 0.7 },
      { id: 'R', from: [248, 18], to: 'boulder', cutAt: 0.5 }],
    torches: [[40, 400], [300, 400]],
    solve: [['K', 1], ['R', 1.5], ['C', 1.5], ['H', 2, 'w']], wrong: [['H', 1], ['C', 2]], wrongs: [[['W', 1], ['K', 1.5], ['R', 1.5], ['C', 1.5], ['H', 2]], [['K', 1], ['C', 1.5], ['H', 2], ['R', 1.5]]],
  })
  root.LEVELS = L
})(typeof window !== 'undefined' ? window : globalThis)
