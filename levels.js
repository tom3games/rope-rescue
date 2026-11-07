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
  root.LEVELS = L
})(typeof window !== 'undefined' ? window : globalThis)
