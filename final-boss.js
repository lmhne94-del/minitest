// ======================================================================
//  final-boss.js: BOSS CUỐI GAME "Hỗn Nguyên Long Vương" — RỒNG BAY, 2.500 máu, dùng đủ 10 HỆ phép của game
//  - Nằm trong CỔNG HỖN NGUYÊN (đấu trường kind 'omni'): vào từ phòng Chú Lùn khi đã mở khoá đủ 10 Sách Hệ (xem dwarf.js / boss-gate.js).
//    boss-gate.js gọi FinalBoss.enter() mỗi lần bước vào cổng. Rời cổng giữa trận: boss hồi 5 máu/giây trong lúc bạn vắng.
//  - Bay lượn trên không (thân lơ lửng cách mặt đất C.hover px, bóng đổ dưới đất), không bị cột đá cản. Đánh gần vẫn trúng vì hitbox kéo từ sàn tới đỉnh thân.
//  - 10 chiêu = 10 hệ, xáo trộn thành "túi" rồi lần lượt tung đủ cả 10 trước khi lặp lại (mỗi chiêu có vòng / dải báo trước + tên chiêu hiện trên đầu rồng):
//      Lửa: Thiên Thạch Hỏa Diệm (mưa thiên thạch, để lại vũng lửa) · Băng: Băng Tiễn Phong Hàn (quạt mũi băng, làm chậm)
//      Sét: Thiên Lôi Giáng (sét đánh theo loạt)           · Độc: Độc Vụ Phun Trào (cục độc rơi, vũng độc làm chậm)
//      Đất: Thạch Trụ Địa Chấn (hàng gai đá trồi lên)       · Gió: Lốc Xoáy Thần Long (lốc đuổi theo, hút người chơi)
//      Thánh Quang: Quang Pháo Thánh Điện (tia sáng, nhiều tia khi nổi giận) · Hắc Ám: Hắc Ám Bùng Nổ (nổ tím, hút máu hồi cho boss)
//      Tự Nhiên: Dây Leo Giam Cầm (dây leo trói chân)       · Không Gian: Hắc Nguyệt Không Gian (hố đen hút rồi nổ)
//    + đòn thường: Long Trảo (khi người chơi áp sát) và Long Phi (lao thẳng vào người chơi).
//  - 3 giai đoạn: >50% máu · <50% nổi giận (gầm, nhanh hơn, nhiều đòn hơn) · <25% thức tỉnh (mỗi chiêu mạnh hơn nữa).
//  - DẠNG V2 "THỨC TỈNH": lần đầu bị đánh hết máu boss KHÔNG chết: bất tử ~5 giây, chạy animation thức tỉnh (assets/final_boss/awaken.webp, 9 khung 3×3),
//    hồi đầy máu (C.hp2) và đổi sang bảng sprite hon_nguyen_long_v2.webp (to hơn, đánh đau hơn x1.3, nhanh hơn, nghỉ giữa chiêu ngắn hơn, vào thẳng trạng thái nổi giận).
//    Hạ được dạng V2 mới là thắng thật. Dạng V2 ĐỨNG YÊN một chỗ (không đuổi theo, không lao tới), chỉ lơ lửng và phóng chiêu.
//  - Hạ boss: Rương Legendary + ngọc lục bảo / kim cương (trong rương có Hoá Thạch Rồng). Boss KHÔNG tự hồi sinh theo giờ nữa: muốn đánh lại phải đặt Hoá Thạch Rồng vào GIỮA vòng phép
//    rồi rắc Thuốc Hồi Sinh Rồng (đổi 5 Mảnh Thiên Thạch ở Chợ Đen) lên nó -> animation hồi sinh (assets/final_boss/revive.webp, 9 khung 3×3) -> rồng sống lại ở DẠNG V1 đầy máu.
//  - Thông số chỉnh ở C bên dưới. Lệnh thử trong cheat.js: /bossrong (vào thẳng Cổng Hỗn Nguyên từ ngoài trời)
//  - Ảnh: assets/final_boss/hon_nguyen_long.webp (dạng 1; toạ độ khung ở F) · hon_nguyen_long_v2.webp (dạng Thức Tỉnh; khung ở F2) · awaken.webp (animation biến hình), avatars/final.webp (ảnh thanh máu)
//  - Lệnh thử: /bossrong2 (vào thẳng dạng V2)
//  File này nạp SAU survival.js (xem survival.html).
//  Muốn gỡ: xoá file này + thẻ <script> + các dòng "FinalBoss" / "z.final" trong survival.js, boss-gate.js, cheat.js.
// ======================================================================
const FinalBoss = (() => {
  const V = {};
  const NAME = 'Hỗn Nguyên Long Vương';
  let form2 = false;                         // boss đang ở dạng Thức Tỉnh? (đổi tên thanh máu, nhân sát thương)
  Object.defineProperty(V, 'NAME', { get: () => (form2 ? NAME + ' · Thức Tỉnh' : NAME) });

  // ---------- Thông số ----------
  const C = {
    hp: 2500, scale: 1.55, hover: 60,
    hp2: 3500, scale2: 1.85,                 // dạng Thức Tỉnh: máu, kích thước sprite
    hb2: { rx: 120, up: 340, down: 16 },
    dmg2: 1.3, speed2: 1.15, cd2: 0.8,       // dạng Thức Tỉnh: nhân sát thương / tốc độ bay / thời gian nghỉ giữa chiêu
    hb: { rx: 96, up: 295, down: 16 },       // hitbox: từ sàn lên tới đỉnh thân rồng đang bay
    move: 150, moveRage: 200, dashSpeed: 700,
    orbit: 270,                              // khoảng cách rồng lượn quanh người chơi
    regen: 5,                                // hồi máu / giây khi người chơi rời cổng
    respawn: 900,
    flat: 0.7,                               // tỉ lệ dẹt của vòng tròn dưới đất
    pierce: 0.25,                            // đòn xuyên 25% giáp
    cd: [1.7, 1.2, 0.85],                    // nghỉ giữa các chiêu theo giai đoạn
  };

  // Mỗi hệ: tên chiêu · màu · khung tư thế gồng trong F.cast · thời gian gồng
  const EL = {
    fire:      { name: 'Thiên Thạch Hỏa Diệm',   col: '#ffb23a', cast: 1, wind: 1.1 },
    ice:       { name: 'Băng Tiễn Phong Hàn',    col: '#7fd0ff', cast: 0, wind: 0.85 },
    lightning: { name: 'Thiên Lôi Giáng',        col: '#ffe14a', cast: 3, wind: 1.0 },
    poison:    { name: 'Độc Vụ Phun Trào',       col: '#8be04a', cast: 2, wind: 0.9 },
    earth:     { name: 'Thạch Trụ Địa Chấn',     col: '#d2a06a', cast: 5, wind: 1.0 },
    wind:      { name: 'Lốc Xoáy Thần Long',     col: '#6fe0e0', cast: 4, wind: 0.9 },
    holy:      { name: 'Quang Pháo Thánh Điện',  col: '#fff0a0', cast: 8, wind: 1.3 },
    dark:      { name: 'Hắc Ám Bùng Nổ',         col: '#c08aff', cast: 6, wind: 0.9 },
    nature:    { name: 'Dây Leo Giam Cầm',       col: '#5fd068', cast: 5, wind: 0.8 },
    arcane:    { name: 'Hắc Nguyệt Không Gian',  col: '#b07aff', cast: 7, wind: 1.0 },
  };
  const ORDER = Object.keys(EL);
  V.ELEMENTS = ORDER;

  // Khung sprite trong hon_nguyen_long.webp: [x, y, rộng, cao]
  const F = {
    idle: [[9,30,139,138],[148,30,104,142],[265,38,113,129],[392,38,112,132],[518,40,127,132]],
    move: [[669,50,176,117],[845,62,110,109],[955,67,107,105],[1062,68,103,99],[1165,63,97,107],[1263,62,95,103],[1358,67,74,100],[1432,63,93,92]],
    run:  [[14,224,181,102],[190,232,128,99],[318,230,120,101],[438,232,115,98],[553,234,127,91],[680,234,133,89]],
    atk:  [[831,228,131,109],[962,228,113,110],[1075,228,163,110],[1238,228,154,110],[1392,224,134,114]],
    cast: [[12,413,149,127],[338,416,102,124],[672,418,102,125],[960,415,112,130],[1248,414,130,127],[10,599,160,124],[671,595,114,140],[960,595,130,149],[1248,593,127,148]],
    pillars: [1072,398,162,148], tornado: [1380,400,145,146], meteor: [122,860,68,46], meteorBig: [165,789,140,91],
    darkburst: [785,578,164,169], darkmoon: [1090,580,168,164], sparkle: [985,800,81,85],
  };

  const F2 = { // [x0, y0, x1, y1, tâm-x, tâm-y của thân rồng]
    idle: [[12,38,150,190,78,108],[150,38,297,190,225,110],[297,38,440,190,365,110],[440,38,595,190,520,112],[595,38,768,190,680,112]],
    move: [[765,36,925,192,845,112],[922,36,1100,192,1005,112],[1100,36,1248,192,1175,112],[1245,36,1388,192,1325,108],[1385,36,1530,192,1455,112]],
    run: [[8,218,215,365,120,292],[215,218,430,365,320,290],[430,218,620,365,520,290],[620,218,800,365,700,290]],
    atk: [[803,215,962,370,885,290],[962,215,1115,370,1040,290],[1115,215,1385,370,1250,295],[1385,215,1536,370,1448,295]],
    cast: [[12,413,300,565,95,490],[310,413,620,565,400,490],[638,413,928,565,725,485],[938,413,1228,565,1010,485],[1235,413,1536,565,1300,490],[12,592,305,765,150,672],[318,592,652,765,405,672],[660,592,958,765,735,680],[960,592,1238,765,1085,682],[1238,592,1536,765,1320,692]],
    wake: [[600,778,1140,1016,868,930]],
  };
  // Chiêu (hệ) -> khung gồng trong F2.cast
  const CAST2 = { fire: 6, ice: 4, lightning: 3, poison: 1, earth: 5, wind: 0, holy: 9, dark: 7, nature: 2, arcane: 8 };
  // Animation thức tỉnh (awaken.webp): lưới 3×3, mỗi khung 512×341, tâm thân ở (250,175)
  const AWK_FRAME = { w: 512, h: 341, ax: 250, ay: 175 };
  const AW = { fall: 0.7, fps: 2.3, len: 5.4 }; // fall: giây gục ngã trước khi biến hình · fps: tốc độ khung gif · len: tổng thời gian bất tử

  // Rương báu rơi giữa phòng khi hạ boss: assets/final_boss/chest_omni.webp (lưới 5×2, mỗi ô ~307×512; khung 0-1 = rương đóng lấp lánh, 2-9 = mở ra)
  const CHEST = { cols: 5, w: 307.2, h: 512, ax: 153.6, ay: 418, s: 0.46, wait: 1.8, drop: 0.9, open: 2.25, tx: 0, ty: -1 };
  let img = null, shardImg = null, img2 = null, awkImg = null, chestImg = null;
  loadImage('assets/final_boss/chest_omni.webp').then((i) => { chestImg = i; });
  loadImage('assets/final_boss/hon_nguyen_long.webp').then((i) => { img = i; });
  loadImage('assets/final_boss/hon_nguyen_long_v2.webp').then((i) => { img2 = i; });
  loadImage('assets/final_boss/awaken.webp').then((i) => { awkImg = i; });
  loadImage('assets/ice/iceshard.webp').then((i) => { shardImg = i; });

  // ---------- Trạng thái ----------
  let shots = [], strikes = [], zones = [], tornados = [], holes = [], beams = [], blasts = [];
  let slowT = 0, slowMul = 1;
  V.saved = null;                           // { hp, t }: máu lúc người chơi rời cổng
  // ----- Hồi sinh rồng bằng Hoá Thạch + Thuốc -----
  const REV = { w: 439, h: 390, ax: 219, ay: 352, fps: 2.0, hold: 1.0, scale: 0.8 }; // revive.webp: lưới 3×3, mỗi khung 439×390, chân ở y≈372
  let reviveImg = null; loadImage('assets/final_boss/revive.webp').then((i) => { reviveImg = i; });
  V.slain = false;                          // boss đã bị hạ: cổng trống cho tới khi hồi sinh bằng hoá thạch + thuốc
  V.altar = false;                          // Hoá Thạch Rồng đã đặt giữa vòng phép
  let rev = null;                           // { t }: đang chạy animation hồi sinh
  const revCenter = () => omniWorld(OMNI_BG.rune.x, OMNI_BG.rune.y);
  const bossAlive = () => zombies.some((q) => q.final && !q.dead);
  V.save = () => ({ s: V.slain ? 1 : 0, a: V.altar ? 1 : 0 });
  V.load = (d) => { V.slain = !!(d && d.s); V.altar = !!(d && d.a); rev = null; };
  V.playerSlow = () => (slowT > 0 ? slowMul : 1); // nhân vào tốc độ chạy (survival.js)
  V.clear = () => { shots = []; strikes = []; zones = []; tornados = []; holes = []; beams = []; blasts = []; slowT = 0; };
  V.reset = () => { V.clear(); V.saved = null; form2 = false; V.slain = false; V.altar = false; rev = null; };
  V.immune = (z) => !!z.awk;                // đang biến hình thì không bị thương (survival.js: hitZombie)

  // ---------- Tiện ích ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const inEll = (px, py, cx, cy, r) => { const dx = (px - cx) / r, dy = (py - cy) / (r * C.flat); return dx * dx + dy * dy < 1; };
  const onPlayer = (cx, cy, r) => inEll(player.x, player.y + 6, cx, cy, r);
  const phaseOf = (z) => (z.form2 ? (z.hp < z.maxHp * 0.5 ? 2 : 1) : z.hp < z.maxHp * 0.25 ? 2 : z.hp < z.maxHp * 0.5 ? 1 : 0); // dạng V2 vào trận là đã nổi giận, dưới 50% máu thì tung chiêu mạnh nhất
  const floorBox = () => ({ x0: (-ARENA.ax + 0.5) * TILE, x1: (ARENA.ax + 0.5) * TILE, y0: (ARENA.y0 + 1) * TILE, y1: (ARENA.y1 + 0.5) * TILE });
  const clampFloor = (p, m = 10) => { const b = floorBox(); p.x = Math.max(b.x0 + m, Math.min(b.x1 - m, p.x)); p.y = Math.max(b.y0 + m, Math.min(b.y1 - m, p.y)); return p; };
  const playerPt = () => ({ x: player.x, y: player.y + 6 });
  function targetNear(spread) {
    const a = Math.random() * Math.PI * 2, d = rnd(spread * 0.3, spread);
    return clampFloor({ x: player.x + Math.cos(a) * d, y: player.y + 6 + Math.sin(a) * d * C.flat });
  }
  function slow(sec, mul, label) {
    if (slowT <= 0) { slowMul = mul; floaters.push({ x: player.x, y: player.y - 70, text: label || '⏬ Bị làm chậm', life: 0.9, color: '#9fd8ff' }); }
    else slowMul = Math.min(slowMul, mul);
    slowT = Math.max(slowT, sec);
  }
  function hitPlayer(dmg, o = {}) {
    if (form2) dmg = Math.round(dmg * C.dmg2);
    hurt(dmg, o.pierce === undefined ? C.pierce : o.pierce);
    if (o.burn) burnT = Math.max(burnT, o.burn);
    if (o.slow) slow(o.slow[0], o.slow[1], o.label);
  }
  function pushPlayer(dx, dy) { // đẩy / hút người chơi nhưng không xuyên tường
    if (!collides(player.x + dx, player.y, 9, true)) player.x += dx;
    if (!collides(player.x, player.y + dy, 9, true)) player.y += dy;
  }
  const addStrike = (kind, x, y, r, delay, off = 0, extra = {}) => strikes.push({ kind, x, y, r, delay, t: -off, done: false, ...extra });
  const addZone = (kind, x, y, r, life) => { if (zones.length >= 24) zones.shift(); zones.push({ kind, x, y, r, age: 0, life, tick: 0.3, ph: Math.random() * 6 }); };
  const addBlast = (x, y, r, life, col) => blasts.push({ x, y, r, t: 0, life, col });

  // ---------- Tạo boss ----------
  function create(x, y, hp, v2 = false) {
    const z = {
      plant: 'boss', boss: true, final: true, type: 1, nest: 'boss:omni', bossKey: 'omni',
      x, y, hx: x, hy: y, hp, maxHp: v2 ? C.hp2 : C.hp, form2: v2, face: -1, dir: 0, fx: 0, fy: 1,
      t: Math.random() * 5, aggro: true, atkCd: 2.6, atkT: 0, atkHit: false, hurtT: 0,
      dead: false, deadT: 0, noDrop: false, kx: 0, ky: 0, wanderT: 1, wx: x, wy: y,
      stuck: 0, sideT: 0, sideDir: 1, escal: 0, freeT: 0, moving: false, running: false, guard: null,
      act: null, jz: 0, flash: 0, hb: v2 ? C.hb2 : C.hb,
      hov: C.hover + 90, hovT: C.hover, ph: 0, bag: [], clawCd: 3, dashCd: 7, orb: Math.random() * 6, orbDir: 1, orbT: 3,
    };
    z.ph = phaseOf(z);
    form2 = v2;
    zombies.push(z);
    return z;
  }

  // Gọi từ boss-gate.js mỗi lần bước vào Cổng Hỗn Nguyên (sau switchLayer(3))
  V.enter = () => {
    V.clear();
    if (rev) { finishRevive(); return; } // rời cổng giữa lúc hồi sinh: vào lại là rồng đã sống dậy
    if (V.slain) {
      say(NAME + ' đã bị hạ gục. Đặt Hoá Thạch Rồng vào giữa vòng phép rồi rắc Thuốc Hồi Sinh Rồng (đổi 5 Mảnh Thiên Thạch ở Chợ Đen) để đánh thức nó');
      return;
    }
    const died = bossDeaths.get('omni');
    if (died !== undefined && gameTime - died < C.respawn) {
      say(NAME + ' đã bị hạ gục. Cổng yên ắng... hãy quay lại sau ít phút');
      return;
    }
    if (died !== undefined) { bossDeaths.delete('omni'); V.saved = null; }
    const c = tileCenter(0, ARENA.bossTy + 2);
    const v2 = !!(V.saved && V.saved.form === 2), mx = v2 ? C.hp2 : C.hp;
    const hp = V.saved ? Math.min(mx, V.saved.hp + (gameTime - V.saved.t) * C.regen) : mx;
    create(c.x, c.y, hp, v2);
    shake = Math.max(shake, 0.8);
    say(v2 ? NAME + ' đang ở dạng THỨC TỈNH — ' + mx + ' máu, mạnh hơn rất nhiều!' : NAME + ' — boss cuối, ' + C.hp + ' máu, dùng đủ 10 hệ phép! (hạ gục lần đầu nó sẽ thức tỉnh)');
  };

  // Lệnh thử (cheat.js): vào thẳng cổng từ ngoài trời
  V.cheatEnter = (v2 = false) => {
    if (layer !== 0) return 'Hãy ra ngoài trời rồi gọi lệnh này';
    V.slain = false; V.altar = false; rev = null;
    houseRet = { x: player.x, y: player.y };
    if (v2) V.saved = { hp: C.hp2, t: gameTime, form: 2 };
    enterOmniArena();
    return 'Đã vào Cổng Hỗn Nguyên (' + NAME + (v2 ? ' dạng Thức Tỉnh, ' + C.hp2 : ', ' + C.hp) + ' máu)';
  };

  // ======================================================================
  //  HỒI SINH RỒNG: đặt Hoá Thạch giữa vòng phép + rắc Thuốc Hồi Sinh Rồng
  // ======================================================================
  const inOmni = () => layer === 3 && arena.kind === 'omni';
  const nearCenter = (r) => { const c = revCenter(); return Math.hypot(c.x - player.x, c.y - player.y) <= r; };
  V.placeFossil = () => { // gọi từ survival.js khi chọn Hoá Thạch Rồng + bấm chuột trong Cổng Hỗn Nguyên
    if (inv.dragonfossil <= 0) { say('Bạn không có Hoá Thạch Rồng'); return; }
    if (bossAlive()) { say(NAME + ' vẫn còn sống, chưa cần hoá thạch'); return; }
    if (rev || V.altar) { say('Hoá Thạch Rồng đã nằm giữa vòng phép rồi'); return; }
    if (!nearCenter(240)) { say('Hãy đứng gần chính giữa vòng phép rồi đặt Hoá Thạch Rồng'); return; }
    inv.dragonfossil--;
    V.altar = true; V.slain = true;
    const c = revCenter();
    burst(c.x, c.y - 20, '#c08aff', 20, 200, 100);
    say('Hoá Thạch Rồng đã nằm giữa vòng phép. Chọn Thuốc Hồi Sinh Rồng rồi bấm chuột để rắc lên nó!');
  };
  V.usePotion = () => { // Thuốc Hồi Sinh Rồng: bấm chuột khi đang chọn (hoặc dùng trong túi đồ)
    if (inv.dragonpotion <= 0) return;
    if (!inOmni()) { say('Thuốc này chỉ rắc được lên Hoá Thạch Rồng đặt giữa vòng phép trong Cổng Hỗn Nguyên'); return; }
    if (bossAlive() || rev) { say(bossAlive() ? NAME + ' vẫn còn sống, chưa cần thuốc' : 'Rồng đang hồi sinh...'); return; }
    if (!V.altar) { say('Hãy đặt Hoá Thạch Rồng vào giữa vòng phép trước'); return; }
    if (!nearCenter(260)) { say('Lại gần Hoá Thạch Rồng hơn rồi rắc thuốc'); return; }
    inv.dragonpotion--;
    rev = { t: 0, b: 0 };
    const c = revCenter();
    shake = Math.max(shake, 0.5);
    burst(c.x, c.y - 30, '#c08aff', 24, 240, 80);
    say('Thuốc thấm vào xương rồng cổ... mặt đất rung chuyển!');
  };
  function finishRevive() {
    rev = null; V.altar = false; V.slain = false;
    for (let i = zombies.length - 1; i >= 0; i--) if (zombies[i].final) zombies.splice(i, 1); // dọn xác cũ
    bossDeaths.delete('omni'); bossSaved.delete('omni'); V.saved = null;
    const c = revCenter();
    create(c.x, c.y, C.hp, false); // dạng V1 bình thường, đầy máu
    addBlast(c.x, c.y + 6, 380, 0.9, '#c08aff');
    for (const k of ORDER) burst(c.x, c.y - 80, EL[k].col, 6, 300, 200);
    shake = Math.max(shake, 1.2);
    say(NAME + ' đã hồi sinh! (' + C.hp + ' máu)');
  }
  function updateRevive(dt) {
    rev.t += dt;
    const c = revCenter(), p = rev.t * REV.fps / 9;
    shake = Math.max(shake, 0.15 + 0.35 * Math.min(1, p));
    rev.b -= dt;
    if (rev.b <= 0) { rev.b = 0.12; burst(c.x + rnd(-110, 110), c.y - rnd(10, 220), Math.random() < 0.5 ? '#b07aff' : '#6fb4ff', 2, 150, -140); }
    if (rev.t >= 9 / REV.fps + REV.hold) finishRevive();
  }
  function drawReviveFrame(f, sx, sy, a = 1) {
    if (!reviveImg) return;
    const s = REV.scale, sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (a < 1) ctx.globalAlpha = a;
    ctx.drawImage(reviveImg, (f % 3) * REV.w, Math.floor(f / 3) * REV.h, REV.w, REV.h, Math.round(sx - REV.ax * s), Math.round(sy - REV.ay * s), REV.w * s, REV.h * s);
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = sm;
  }
  V.drawRevive = (camX, camY) => { // vẽ ở lớp mặt đất: hoá thạch đã đặt / animation hồi sinh
    if (!inOmni() || !(V.altar || rev)) return;
    const c = revCenter(), sx = c.x - camX, sy = c.y - camY;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy + 4, 150, 26, 0, 0, Math.PI * 2); ctx.fill();
    if (rev) {
      const f = Math.min(8, Math.floor(rev.t * REV.fps));
      const g = ctx.createRadialGradient(sx, sy, 10, sx, sy, 230 + 60 * Math.sin(rev.t * 9));
      g.addColorStop(0, 'rgba(170,120,255,0.55)'); g.addColorStop(1, 'rgba(120,80,255,0)');
      ctx.save(); ctx.translate(0, 0); ctx.scale(1, 1); ctx.fillStyle = g; ctx.fillRect(sx - 280, sy - 280, 560, 330); ctx.restore();
      drawReviveFrame(f, sx, sy);
    } else {
      const pulse = 0.5 + 0.5 * Math.sin(gameTime * 3);
      ctx.fillStyle = 'rgba(176,122,255,' + (0.12 + 0.12 * pulse).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(sx, sy + 2, 170, 34, 0, 0, Math.PI * 2); ctx.fill();
      drawReviveFrame(0, sx, sy);
      if (inv.dragonpotion > 0 && nearCenter(260)) { ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; shadowText('Chọn Thuốc Hồi Sinh Rồng rồi bấm chuột', sx, sy - 160, '#e6d2ff'); }
    }
  };
  V.cheatRevive = () => { // lệnh thử: có sẵn hoá thạch + thuốc, vào cổng khi rồng đã bị hạ
    if (layer !== 0) return 'Hãy ra ngoài trời rồi gọi lệnh này';
    inv.dragonfossil = Math.max(1, inv.dragonfossil); inv.dragonpotion = Math.max(1, inv.dragonpotion);
    V.slain = true; V.altar = false; rev = null; V.saved = null;
    houseRet = { x: player.x, y: player.y };
    enterOmniArena();
    return 'Đã vào Cổng Hỗn Nguyên (rồng đã bị hạ): đặt Hoá Thạch giữa vòng phép rồi rắc thuốc';
  };

  // ======================================================================
  //  AI
  // ======================================================================
  const nextElement = (z) => {
    if (!z.bag.length) z.bag = ORDER.slice().sort(() => Math.random() - 0.5);
    return z.bag.pop();
  };

  function startAct(z, n) {
    z.act = { n, t: 0, hit: false };
    const e = EL[n];
    if (e) floaters.push({ x: z.x, y: z.y - z.hov - 250, text: e.name, life: 1.5, color: e.col });
    if (Math.abs(player.x - z.x) > 4) z.face = player.x < z.x ? -1 : 1;
  }
  const endAct = (z) => { z.act = null; z.atkCd = C.cd[z.ph] * (z.form2 ? C.cd2 : 1); z.hovT = C.hover; };

  function choose(z, dist) {
    if (z.clawCd <= 0 && dist < 190) { z.clawCd = 5; startAct(z, 'claw'); return; }
    if (!z.form2 && z.dashCd <= 0 && dist > 330 && Math.random() < 0.5) { z.dashCd = 9; startAct(z, 'dash'); return; }
    startAct(z, nextElement(z));
  }

  V.updateBoss = (z, dt) => {
    z.t += dt;
    form2 = !!z.form2;
    if (z.dead || deathScreen) { z.act = null; return; }
    if (z.awk) { awaken(z, dt); return; }
    for (const k of ['atkCd', 'clawCd', 'dashCd', 'hurtT', 'flash']) z[k] = Math.max(0, z[k] - dt);
    z.moving = false; z.running = false;
    z.hov += (z.hovT - z.hov) * Math.min(1, dt * 4); // lên xuống mượt
    V.saved = { hp: z.hp, t: gameTime, form: z.form2 ? 2 : 1 };
    const dxp = player.x - z.x, dyp = player.y - z.y, dist = Math.hypot(dxp, dyp);
    if (!z.act && Math.abs(dxp) > 4) z.face = dxp < 0 ? -1 : 1;

    // Qua mốc 50% / 25% máu: gầm lên, mạnh hơn
    const ph = phaseOf(z);
    if (ph > z.ph && !z.act) {
      z.ph = ph;
      z.act = { n: 'roar', t: 0, hit: false };
      say(z.form2 ? NAME + ' bùng nổ toàn bộ sức mạnh Thức Tỉnh!' : ph === 1 ? NAME + ' nổi giận!' : NAME + ' thức tỉnh sức mạnh 10 hệ!');
    }
    if (z.act) { runAct(z, z.act, dt); return; }

    // Dạng V2 Thức Tỉnh: ĐỨNG YÊN tại chỗ (không đuổi theo người chơi), chỉ lơ lửng và phóng chiêu
    if (z.form2) { clampFloor(z, 6); if (z.atkCd <= 0) choose(z, dist); return; }

    // Lượn quanh người chơi, giữ khoảng cách; thỉnh thoảng đổi chiều vòng
    z.orbT -= dt;
    if (z.orbT <= 0) { z.orbT = rnd(2.5, 5); z.orbDir = -z.orbDir; z.orbR = rnd(0.8, 1.15); }
    z.orb += dt * 0.55 * z.orbDir;
    const R = C.orbit * (z.orbR || 1);
    const tgt = clampFloor({ x: player.x + Math.cos(z.orb) * R, y: player.y - 50 + Math.sin(z.orb) * R * 0.4 }); // lệch lên trên người chơi một chút để cả thân rồng nằm trong màn hình
    const sp = (ph >= 1 ? C.moveRage : C.move) * (z.form2 ? C.speed2 : 1), d = Math.hypot(tgt.x - z.x, tgt.y - z.y);
    if (d > 8) {
      const step = Math.min(d, sp * dt);
      z.x += (tgt.x - z.x) / d * step; z.y += (tgt.y - z.y) / d * step;
      z.moving = d > 30;
    }
    clampFloor(z, 6);
    if (z.atkCd <= 0) choose(z, dist);
  };

  // ======================================================================
  //  THỨC TỈNH: lần đầu hết máu -> bất tử, biến hình (animation awaken.webp), hồi đầy máu dạng V2
  // ======================================================================
  const awakeFrame = (t) => (t < AW.fall ? -1 : Math.min(8, Math.floor((t - AW.fall) * AW.fps)));
  function startAwaken(z) {
    z.form2 = true; form2 = true;
    z.maxHp = C.hp2; z.hp = 1; z.hb = C.hb2;
    z.act = null; z.aggro = true; z.atkCd = 99;
    z.awk = { t: 0, fi: -2, pop: false, wave: false };
    shots = []; strikes = []; tornados = []; holes = []; beams = []; zones = [];
    V.saved = { hp: C.hp2, t: gameTime, form: 2 };
    shake = Math.max(shake, 1);
    addBlast(z.x, z.y + 6, 300, 0.8, '#ffffff');
    say('💥 ' + NAME + ' chưa chịu gục... nó đang THỨC TỈNH!');
    floaters.push({ x: z.x, y: z.y - z.hov - 260, text: '⚠ THỨC TỈNH!', life: 3, color: '#e6ccff' });
  }
  function awaken(z, dt) {
    const A = z.awk; A.t += dt;
    z.act = null;
    z.hovT = C.hover; // biến hình: đứng yên tại chỗ (không bay lượn, không lướt)
    z.hov += (z.hovT - z.hov) * Math.min(1, dt * 3);
    const k = Math.max(0, Math.min(1, (A.t - AW.fall) / (AW.len - AW.fall - 0.5)));
    z.hp = Math.max(1, 1 + (z.maxHp - 1) * k * k * (3 - 2 * k)); // thanh máu đầy dần theo animation
    V.saved = { hp: z.maxHp, t: gameTime, form: 2 };
    const col = () => EL[ORDER[Math.floor(Math.random() * 10)]].col;
    if (A.t < AW.fall) { if (Math.random() < 0.5) burst(z.x + rnd(-50, 50), z.y - z.hov - rnd(0, 120), '#ffffff', 1, 90, -40); }
    else if (Math.random() < 0.8) burst(z.x + rnd(-150, 150), z.y - z.hov - rnd(0, 220), col(), 1, 170, -70);
    if (!A.pop && A.t >= AW.fall) { // khoảnh khắc biến hình
      A.pop = true; shake = Math.max(shake, 1);
      addBlast(z.x, z.y + 6, 260, 0.7, '#ffffff');
      for (const key of ORDER) burst(z.x, z.y - z.hov - 80, EL[key].col, 6, 300, 160);
    }
    const fi = awakeFrame(A.t);
    if (fi !== A.fi) { // mỗi khung mới: sóng năng lượng đúng màu một hệ
      A.fi = fi;
      if (fi >= 1) { addBlast(z.x, z.y + 6, 110 + fi * 34, 0.6, EL[ORDER[fi % 10]].col); shake = Math.max(shake, 0.25 + fi * 0.04); }
    }
    if (!A.wave && A.t >= AW.len - 0.5) { // sóng xung kích cuối: đẩy người chơi ra xa
      A.wave = true; shake = Math.max(shake, 1.5);
      addBlast(z.x, z.y + 6, 430, 1.0, '#ffffff'); addBlast(z.x, z.y + 6, 300, 0.8, '#c08aff');
      for (const key of ORDER) burst(z.x, z.y - z.hov - 80, EL[key].col, 8, 360, 180);
      if (onPlayer(z.x, z.y + 6, 340)) {
        hitPlayer(14, { pierce: 0.5 });
        const a = Math.atan2(player.y - z.y, player.x - z.x);
        for (let i = 0; i < 6; i++) pushPlayer(Math.cos(a) * 24, Math.sin(a) * 16);
      }
      say('🔥 ' + NAME + ' đã THỨC TỈNH! Máu ' + C.hp2 + ', đòn mạnh hơn, nhanh hơn!');
    }
    if (A.t >= AW.len) {
      z.awk = null; z.hp = z.maxHp; z.ph = phaseOf(z); z.atkCd = 1.2; z.bag = []; z.hovT = C.hover;
      floaters.push({ x: z.x, y: z.y - z.hov - 260, text: '🐉 THỨC TỈNH!', life: 2.5, color: '#e6ccff' });
    }
  }

  // ======================================================================
  //  CÁC CHIÊU: mỗi hàm tạo đòn đúng lúc hết thời gian gồng
  // ======================================================================
  const CAST = {
    fire(z, A) { // mưa thiên thạch: viên đầu ngay chỗ người chơi
      const n = [7, 11, 15][z.ph];
      for (let i = 0; i < n; i++) { const p = i === 0 ? playerPt() : targetNear(280); addStrike('meteor', p.x, p.y, 62, 1.0, i * 0.26); }
    },
    ice(z) { // quạt mũi băng
      const n = [5, 7, 9][z.ph], hx = z.x + z.face * 60, hy = z.y, base = Math.atan2(player.y - hy, player.x - hx);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.2;
        shots.push({ x: hx, y: hy, vx: Math.cos(a) * 370, vy: Math.sin(a) * 370, a, t: 0 });
      }
      burst(hx, hy - 90, '#bfe9ff', 12, 160, -40);
    },
    lightning(z) { // sét đánh theo loạt
      const n = [5, 8, 11][z.ph];
      for (let i = 0; i < n; i++) { const p = i === 0 ? playerPt() : targetNear(260); addStrike('bolt', p.x, p.y, 56, 0.95, i * 0.14); }
    },
    poison(z) { // cục độc rơi, nở thành vũng
      const n = [3, 5, 7][z.ph];
      for (let i = 0; i < n; i++) { const p = i === 0 ? playerPt() : targetNear(250); addStrike('glob', p.x, p.y, 74, 1.1, i * 0.3); }
    },
    earth(z) { // hàng gai đá từ chỗ rồng tới người chơi (nhiều hàng khi nổi giận)
      const base = Math.atan2(player.y - z.y, player.x - z.x);
      const lines = z.ph === 0 ? [0] : z.ph === 1 ? [-0.2, 0.2] : [-0.38, 0, 0.38];
      for (const off of lines) {
        for (let k = 0; k < 9; k++) {
          const d = 100 + k * 62, a = base + off;
          const p = clampFloor({ x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d * C.flat });
          addStrike('spike', p.x, p.y, 42, 0.75 + k * 0.08);
        }
      }
    },
    wind(z) { // lốc xoáy đuổi theo người chơi
      const n = z.ph >= 1 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        tornados.push({ x: z.x + Math.cos(a) * 90, y: z.y + Math.sin(a) * 60, r: 64, age: 0, life: 5.5, tick: 0.4, ph: Math.random() * 6 });
      }
      burst(z.x, z.y - z.hov, '#bff7f7', 16, 200, -20);
    },
    holy(z, A) { // tia Quang Pháo: hướng đã chốt từ lúc gồng
      const offs = z.ph === 0 ? [0] : z.ph === 1 ? [-0.4, 0, 0.4] : [-0.7, -0.35, 0, 0.35, 0.7];
      for (const o of offs) beams.push({ x: z.x, y: z.y, ang: A.ang + o, t: 0, life: 0.5, hit: false });
      shake = Math.max(shake, 0.6);
    },
    dark(z) { // nổ tím, hút máu
      const n = [3, 4, 6][z.ph];
      for (let i = 0; i < n; i++) { const p = i === 0 ? playerPt() : targetNear(260); addStrike('dark', p.x, p.y, 84, 1.0, i * 0.22); }
    },
    nature(z) { // dây leo trói chân
      const n = [3, 5, 7][z.ph];
      for (let i = 0; i < n; i++) { const p = i === 0 ? playerPt() : targetNear(240); addStrike('root', p.x, p.y, 60, 1.0, i * 0.2); }
    },
    arcane(z) { // hố đen: hút người chơi rồi nổ
      const n = z.ph >= 2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = rnd(130, 210);
        const p = clampFloor({ x: player.x + Math.cos(a) * d, y: player.y + 6 + Math.sin(a) * d * C.flat }, 60);
        holes.push({ x: p.x, y: p.y, age: 0, life: 3.4, R: 150, pull: 340 });
      }
    },
  };
  const RECOVER = { fire: 0.5, ice: 0.5, lightning: 0.5, poison: 0.5, earth: 0.5, wind: 0.5, holy: 0.6, dark: 0.5, nature: 0.5, arcane: 0.5 };

  function runAct(z, A, dt) {
    A.t += dt;
    const e = EL[A.n];
    if (e) {
      if (A.n === 'holy' && A.t < e.wind - 0.4) A.ang = Math.atan2(player.y - z.y, player.x - z.x); // dải sáng bám theo, chốt trước khi bắn
      if (A.ang === undefined) A.ang = Math.atan2(player.y - z.y, player.x - z.x);
      if (!A.hit && A.t >= e.wind) { A.hit = true; CAST[A.n](z, A); }
      if (A.t >= e.wind + RECOVER[A.n]) endAct(z);
      return;
    }
    switch (A.n) {
      case 'claw': { // Long Trảo: sà xuống chém vòng quanh mình
        const W = 0.55;
        z.hovT = A.t < W ? 24 : C.hover;
        if (!A.hit && A.t >= W) {
          A.hit = true; shake = Math.max(shake, 0.6);
          addBlast(z.x, z.y + 6, 160, 0.45, '#9fd8ff');
          burst(z.x, z.y - 20, '#bfe9ff', 26, 260, 300);
          if (onPlayer(z.x, z.y + 6, 160)) hitPlayer(18, { slow: [0.8, 0.6] });
        }
        if (A.t >= W + 0.5) endAct(z);
        break;
      }
      case 'dash': { // Long Phi: dải báo hướng rồi lao thẳng qua người chơi
        const W = 0.65, D = 0.5;
        if (A.t < W - 0.15) A.ang = Math.atan2(player.y - z.y, player.x - z.x);
        if (A.t >= W && A.t < W + D) {
          z.running = true; z.face = Math.cos(A.ang) < 0 ? -1 : 1;
          z.x += Math.cos(A.ang) * C.dashSpeed * dt; z.y += Math.sin(A.ang) * C.dashSpeed * dt;
          clampFloor(z, 6);
          if (!A.hit && Math.hypot(player.x - z.x, (player.y - z.y) / C.flat) < 86) { A.hit = true; hitPlayer(20, { slow: [1, 0.55] }); shake = Math.max(shake, 0.5); }
          if (Math.random() < 0.6) burst(z.x, z.y - z.hov, '#9fd8ff', 1, 90, -60);
        }
        if (A.t >= W + D + 0.35) endAct(z);
        break;
      }
      case 'roar': { // gầm khi sang giai đoạn mới
        z.hovT = C.hover + 60;
        if (!A.hit && A.t >= 0.6) {
          A.hit = true; shake = Math.max(shake, 1);
          addBlast(z.x, z.y + 6, 300, 0.7, '#ffd9a0');
          for (const k of ORDER) burst(z.x, z.y - z.hov - 40, EL[k].col, 5, 300, 150);
          if (onPlayer(z.x, z.y + 6, 190)) hitPlayer(10);
        }
        if (A.t >= 1.4) { z.act = null; z.atkCd = 0.6; z.hovT = C.hover; }
        break;
      }
    }
  }

  // ======================================================================
  //  ĐÒN ĐANG BAY / ĐANG CHỜ NỔ
  // ======================================================================
  function land(s) {
    s.done = true;
    switch (s.kind) {
      case 'meteor':
        addBlast(s.x, s.y, s.r, 0.4, '#ffb23a');
        burst(s.x, s.y - 8, '#ff7a1a', 14, 210, 380); burst(s.x, s.y - 8, '#ffd34d', 6, 150, 300);
        shake = Math.max(shake, 0.3);
        if (onPlayer(s.x, s.y, s.r)) hitPlayer(18, { burn: 3 });
        addZone('fire', s.x, s.y, s.r * 0.8, 3);
        break;
      case 'bolt':
        burst(s.x, s.y - 20, '#fff3a0', 16, 260, 200); shake = Math.max(shake, 0.35);
        if (onPlayer(s.x, s.y, s.r)) hitPlayer(20, { slow: [0.8, 0.45], label: '⚡ Tê liệt' });
        break;
      case 'glob':
        burst(s.x, s.y - 10, '#8be04a', 16, 200, 300);
        if (onPlayer(s.x, s.y, s.r)) hitPlayer(12, { pierce: 0.6 });
        addZone('poison', s.x, s.y, s.r, 6);
        break;
      case 'spike':
        burst(s.x, s.y - 10, '#c9a878', 10, 220, 360); shake = Math.max(shake, 0.2);
        if (onPlayer(s.x, s.y, s.r)) hitPlayer(20, { slow: [1, 0.5], label: '⏬ Choáng' });
        break;
      case 'dark':
        burst(s.x, s.y - 14, '#c08aff', 18, 240, 300); shake = Math.max(shake, 0.35);
        if (onPlayer(s.x, s.y, s.r)) {
          hitPlayer(22, { pierce: 0.6 });
          const boss = zombies.find((q) => q.final && !q.dead);
          if (boss) { boss.hp = Math.min(boss.maxHp, boss.hp + 45); floaters.push({ x: boss.x, y: boss.y - boss.hov - 230, text: '+45 (hút máu)', life: 1.2, color: '#d9b0ff' }); }
        }
        break;
      case 'root':
        burst(s.x, s.y - 10, '#5fd068', 14, 200, 280);
        if (onPlayer(s.x, s.y, s.r)) hitPlayer(12, { slow: [1.8, 0.12], label: '🌿 Bị trói' });
        break;
    }
  }

  V.update = (dt) => {
    if (layer !== 3) return;
    if (rev) updateRevive(dt);
    if (slowT > 0) slowT -= dt;

    for (let i = strikes.length - 1; i >= 0; i--) {
      const s = strikes[i];
      s.t += dt;
      if (!s.done && s.t >= s.delay) land(s);
      const vis = s.kind === 'spike' ? 0.9 : s.kind === 'root' ? 1.4 : s.kind === 'bolt' ? 0.45 : s.kind === 'dark' ? 0.65 : 0.1;
      if (s.t > s.delay + vis) strikes.splice(i, 1);
    }

    for (let i = shots.length - 1; i >= 0; i--) { // mũi băng
      const b = shots[i];
      b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
      const f = floorBox();
      let dead = b.t > 2.4 || b.x < f.x0 - 30 || b.x > f.x1 + 30 || b.y < f.y0 - 30 || b.y > f.y1 + 30;
      if (!dead && Math.hypot(b.x - player.x, b.y - player.y) < 30) { hitPlayer(13, { slow: [1.5, 0.55] }); dead = true; }
      if (Math.random() < 0.5) burst(b.x, b.y - 70, Math.random() < 0.5 ? '#6ac8ff' : '#e8f8ff', 1, 50, 60);
      if (dead) { burst(b.x, b.y - 60, '#bfe9ff', 8, 160, 200); shots.splice(i, 1); }
    }

    for (let i = zones.length - 1; i >= 0; i--) { // vũng lửa / vũng độc
      const z = zones[i];
      z.age += dt;
      if (z.age >= z.life) { zones.splice(i, 1); continue; }
      const poison = z.kind === 'poison';
      if (Math.random() < 0.06) burst(z.x + rnd(-z.r, z.r) * 0.7, z.y - 4, poison ? '#8be04a' : '#ff8a2a', 1, 40, -120);
      if (poison && onPlayer(z.x, z.y, z.r)) slow(0.5, 0.7, '☠ Nhiễm độc');
      z.tick -= dt;
      if (z.tick <= 0 && onPlayer(z.x, z.y, z.r)) { z.tick = 1; hitPlayer(poison ? 5 : 6, poison ? { pierce: 0.6 } : { burn: 2 }); }
    }

    for (let i = tornados.length - 1; i >= 0; i--) { // lốc xoáy
      const w = tornados[i];
      w.age += dt;
      if (w.age >= w.life) { burst(w.x, w.y - 40, '#bff7f7', 12, 160, 100); tornados.splice(i, 1); continue; }
      const dx = player.x - w.x, dy = player.y - w.y, d = Math.hypot(dx, dy) || 1;
      const sp = 125 + 20 * (w.age / w.life);
      w.x += dx / d * sp * dt + Math.cos(w.age * 3 + w.ph) * 30 * dt; w.y += dy / d * sp * dt;
      clampFloor(w, 20);
      if (d < 260) { const f = (1 - d / 260) * 120 * dt; pushPlayer(-dx / d * f, -dy / d * f); } // hút người chơi vào tâm
      w.tick -= dt;
      if (w.tick <= 0 && onPlayer(w.x, w.y, w.r)) { w.tick = 0.8; hitPlayer(8, { slow: [0.6, 0.6] }); }
      if (Math.random() < 0.4) burst(w.x + rnd(-30, 30), w.y - rnd(10, 110), '#bff7f7', 1, 60, -40);
    }

    for (let i = holes.length - 1; i >= 0; i--) { // hố đen
      const h = holes[i];
      h.age += dt;
      const dx = h.x - player.x, dy = h.y - player.y, d = Math.hypot(dx, dy) || 1;
      if (d < h.pull) { const f = (1 - d / h.pull) * 150 * dt; pushPlayer(dx / d * f, dy / d * f); }
      if (Math.random() < 0.5) { const a = Math.random() * 6.28, rr = rnd(60, 130); burst(h.x + Math.cos(a) * rr, h.y - 30 + Math.sin(a) * rr * 0.6, '#b07aff', 1, 30, -10); }
      if (h.age >= h.life) {
        addBlast(h.x, h.y, h.R, 0.5, '#c08aff');
        burst(h.x, h.y - 30, '#c08aff', 30, 320, 150); burst(h.x, h.y - 30, '#ffffff', 10, 200, 100);
        shake = Math.max(shake, 0.8);
        if (onPlayer(h.x, h.y, h.R)) hitPlayer(26, { pierce: 0.5 });
        holes.splice(i, 1);
      }
    }

    for (let i = beams.length - 1; i >= 0; i--) { // Quang Pháo
      const b = beams[i];
      b.t += dt;
      if (!b.hit) {
        const dx = player.x - b.x, dy = player.y - b.y;
        const along = dx * Math.cos(b.ang) + dy * Math.sin(b.ang), perp = Math.abs(-dx * Math.sin(b.ang) + dy * Math.cos(b.ang));
        if (along > 0 && perp < 34) { b.hit = true; hitPlayer(26, { pierce: 0.4 }); }
      }
      if (b.t > b.life) beams.splice(i, 1);
    }

    for (let i = blasts.length - 1; i >= 0; i--) { blasts[i].t += dt; if (blasts[i].t > blasts[i].life) blasts.splice(i, 1); }

    for (const c of chests) { // rương báu: chờ -> rơi từ trời -> (bấm E) chạy animation mở ~2,2 giây rồi mở thật
      if (!c.omni) continue;
      c.t += dt;
      const p = tileCenter(c.tx, c.ty);
      if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0) c.wait = 0; continue; }
      if (c.drop > 0) {
        c.drop -= dt;
        if (c.drop <= 0) { // chạm đất
          c.drop = 0; shake = Math.max(shake, 0.7);
          if (Math.hypot(player.x - p.x, player.y - p.y) < 44) player.y = p.y + 58; // rương là vật cản: nếu người chơi đang đứng đúng ô đó thì đẩy ra phía trước
          addBlast(p.x, p.y, 150, 0.6, '#c08aff'); addBlast(p.x, p.y, 90, 0.45, '#ffd34d');
          burst(p.x, p.y - 10, '#ffd34d', 24, 240, 260); burst(p.x, p.y - 10, '#c08aff', 20, 220, 200);
          say('Rương báu đã rơi xuống giữa phòng!');
        }
        continue;
      }
      if (typeof c.fx === 'number') {
        c.fx += dt;
        if (Math.random() < 0.6) burst(p.x + rnd(-30, 30), p.y - 30 - c.fx * 25, Math.random() < 0.5 ? '#ffd34d' : '#c08aff', 1, 140, -90);
        if (c.fx >= CHEST.open) { c.fx = 'done'; openChest(c); }
      }
    }
    for (const z of zombies) { // xác rồng: tàn sáng 10 màu
      if (z.final && z.dead && Math.random() < 0.6) burst(z.x + rnd(-80, 80), z.y - z.hov - rnd(20, 160), EL[ORDER[Math.floor(Math.random() * 10)]].col, 1, 130, -80);
    }
  };

  // ======================================================================
  //  HẠ GỤC
  // ======================================================================
  // Rương báu rơi xuống GIỮA PHÒNG sau khi hạ boss (vẽ / mở bằng animation: xem V.drawChest và openChest ở survival.js)
  V.dropChest = () => {
    for (let i = chests.length - 1; i >= 0; i--) if (chests[i].omni) chests.splice(i, 1);
    chests.push({ tx: CHEST.tx, ty: CHEST.ty, t: 0, rare: false, legend: true, omni: true, wait: CHEST.wait, drop: CHEST.drop });
  };
  // true khi rương chưa mở được (đang chờ / đang rơi)
  V.chestBusy = (c) => c.wait > 0 || c.drop > 0;

  V.kill = (z) => {
    if (!z.form2 && !z.noDrop) { startAwaken(z); return; } // lần đầu hết máu: thức tỉnh chứ chưa chết
    if (!z.noDrop) elderCount('boss');
    z.dead = true; z.deadT = 0; z.aggro = false; z.act = null; z.hovT = 0;
    bossDeaths.set('omni', gameTime);
    if (!z.noDrop) V.slain = true; // hết tự hồi sinh theo giờ: phải dùng hoá thạch + thuốc
    bossSaved.delete('omni');
    V.saved = null;
    shots = []; strikes = []; tornados = []; holes = []; beams = []; zones = [];
    addBlast(z.x, z.y + 6, 380, 0.9, '#ffffff');
    for (const k of ORDER) burst(z.x, z.y - z.hov - 60, EL[k].col, 8, 320, 200);
    shake = Math.max(shake, 1.2);
    say('🏆 Đã hạ ' + NAME + ' — boss cuối Mini Craft!');
    if (z.noDrop) return;
    score += 500;
    floaters.push({ x: z.x, y: z.y - z.hov - 260, text: '🏆 CHIẾN THẮNG!', life: 4, color: '#ffe07a' });
    if (!swordBonus) {
      swordBonus = BOSS_SWORD_BONUS;
      say('Phần thưởng: Kiếm sắt +' + BOSS_SWORD_BONUS + ' sát thương!');
    }
    const drop = (id, n) => { for (let i = 0; i < n; i++) spawnLoot(id, 1, z.x + rnd(-60, 60), z.y + rnd(-25, 25)); };
    drop('emerald', 28 + Math.floor(Math.random() * 9));
    drop('diamond', 8 + Math.floor(Math.random() * 5));
    V.dropChest();
    say('Một rương báu sắp rơi xuống giữa phòng...');
  };

  // ======================================================================
  //  VẼ
  // ======================================================================
  // Vẽ khung sprite: (sx, sy) = giữa-đáy khung (mid = true: tâm khung); flip = quay mặt sang trái
  function blit(f, sx, sy, s, flip = false, rot = 0, mid = false) {
    if (!img || !f) return;
    const [x, y, w, h] = f, sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; // sprite vẽ độ phân giải cao: làm mịn cho đỡ vỡ hạt như nhựa
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, x, y, w, h, -w * s / 2, mid ? -h * s / 2 : -h * s, w * s, h * s);
    ctx.restore();
    ctx.imageSmoothingEnabled = sm;
  }

  function warnRing(sx, sy, r, p, col) {
    ctx.save();
    ctx.translate(sx, sy); ctx.scale(1, C.flat);
    ctx.globalAlpha = 0.12 + 0.2 * p; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.55 + 0.4 * Math.sin(gameTime * 14); ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -gameTime * 30;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * (1 - p), 0, Math.PI * 2); ctx.stroke(); // vòng thu hẹp: khép lại là nổ
    ctx.restore();
  }
  function warnStrip(sx, sy, ang, len, width, p, col) {
    const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len, nx = -Math.sin(ang) * width, ny = Math.cos(ang) * width;
    ctx.save();
    ctx.globalAlpha = 0.12 + 0.22 * p; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(sx + nx, sy + ny); ctx.lineTo(ex + nx, ey + ny); ctx.lineTo(ex - nx, ey - ny); ctx.lineTo(sx - nx, sy - ny); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.8; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  // Dưới mọi vật thể: vũng, hố, vòng và dải báo trước
  V.drawGround = (camX, camY) => {
    if (layer !== 3) return;
    V.drawRevive(camX, camY);
    for (const z of zones) {
      const sx = z.x - camX, sy = z.y - camY, a = Math.min(1, (z.life - z.age) / 1.2) * Math.min(1, z.age / 0.2), pulse = 0.88 + 0.12 * Math.sin(gameTime * 6 + z.ph);
      const poison = z.kind === 'poison';
      ctx.save();
      ctx.translate(sx, sy); ctx.scale(1, C.flat);
      const g = ctx.createRadialGradient(0, 0, z.r * 0.05, 0, 0, z.r);
      if (poison) { g.addColorStop(0, 'rgba(200,255,120,' + (0.8 * a * pulse).toFixed(3) + ')'); g.addColorStop(0.5, 'rgba(90,200,50,' + (0.7 * a * pulse).toFixed(3) + ')'); g.addColorStop(1, 'rgba(20,90,20,0)'); }
      else { g.addColorStop(0, 'rgba(255,225,110,' + (0.9 * a * pulse).toFixed(3) + ')'); g.addColorStop(0.4, 'rgba(255,110,25,' + (0.8 * a * pulse).toFixed(3) + ')'); g.addColorStop(0.8, 'rgba(200,35,10,' + (0.6 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(120,10,0,0)'); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, z.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const h of holes) { // vòng hút + vòng nổ báo trước
      const sx = h.x - camX, sy = h.y - camY, p = Math.min(1, h.age / h.life);
      ctx.save(); ctx.translate(sx, sy); ctx.scale(1, C.flat);
      ctx.strokeStyle = 'rgba(176,122,255,' + (0.18 + 0.1 * Math.sin(gameTime * 4)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); ctx.lineDashOffset = gameTime * 40;
      ctx.beginPath(); ctx.arc(0, 0, h.pull, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      warnRing(sx, sy, h.R, p, '#b07aff');
    }
    for (const s of strikes) {
      if (s.done || s.t < 0 || s.kind === 'spike' && s.t < 0) continue;
      const col = s.kind === 'meteor' ? '#ff5a1a' : s.kind === 'bolt' ? '#ffe14a' : s.kind === 'glob' ? '#8be04a' : s.kind === 'spike' ? '#d2a06a' : s.kind === 'dark' ? '#c08aff' : '#5fd068';
      warnRing(s.x - camX, s.y - camY, s.r, Math.min(1, s.t / s.delay), col);
    }
    for (const b of blasts) {
      const p = b.t / b.life, R = b.r * (0.2 + p * 0.8);
      ctx.save(); ctx.translate(b.x - camX, b.y - camY + 4); ctx.scale(1, C.flat);
      ctx.globalAlpha = 0.85 * (1 - p); ctx.strokeStyle = b.col; ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.5 * (1 - p); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const z of zombies) { // báo trước của chính boss
      if (!z.final || z.dead || !z.act) continue;
      const A = z.act, sx = z.x - camX, sy = z.y - camY + 6, e = EL[A.n];
      if (A.n === 'claw' && !A.hit) warnRing(sx, sy, 160, Math.min(1, A.t / 0.55), '#9fd8ff');
      else if (A.n === 'dash' && !A.hit && A.t < 0.65) warnStrip(sx, sy, A.ang, 620, 46, Math.min(1, A.t / 0.65), '#9fd8ff');
      else if (A.n === 'holy' && !A.hit) {
        const offs = z.ph === 0 ? [0] : z.ph === 1 ? [-0.4, 0, 0.4] : [-0.7, -0.35, 0, 0.35, 0.7];
        for (const o of offs) warnStrip(sx, sy, A.ang + o, 900, 30, Math.min(1, A.t / e.wind), '#ffe98a');
      }
    }
  };

  // Hoa văn riêng từng loại đòn đang nổ / đang rơi (vẽ trên không)
  function drawStrike(s, camX, camY) {
    const sx = s.x - camX, sy = s.y - camY;
    if (s.t < 0) return;
    const p = Math.min(1, s.t / s.delay);
    if (!s.done) {
      if (s.kind === 'meteor') { // thiên thạch rơi từ trời, chéo nhẹ
        // Rơi theo ĐƯỜNG THẲNG chéo (từ trên-phải xuống trúng tâm vòng báo), tăng tốc dần; sprite xoay đúng hướng bay.
        // Sprite gốc: đầu ở dưới-trái (~152°), đuôi lửa kéo về trên-phải -> xoay thêm (góc rơi - 152°) để đầu luôn chúc về phía mặt đất.
        const h = (1 - p) * (1 - p) * 520, mx = sx + h * 0.23, my = sy - h - 20;
        ctx.fillStyle = 'rgba(255,120,30,' + (0.45 * p).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(mx, my, 22 + 8 * p, 0, Math.PI * 2); ctx.fill();
        blit(F.meteor, mx, my, 1.5, false, Math.atan2(1, -0.23) - 2.653, true);
      } else if (s.kind === 'glob') { // cục độc rơi
        const h = (1 - p) * 380 + 16, gx = sx, gy = sy - h;
        ctx.fillStyle = '#5fc03a'; ctx.beginPath(); ctx.arc(gx, gy, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c8ff8a'; ctx.beginPath(); ctx.arc(gx - 5, gy - 5, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(90,200,50,0.4)'; ctx.beginPath(); ctx.ellipse(gx, gy + 22, 7, 16, 0, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    const q = (s.t - s.delay);
    if (s.kind === 'bolt') { // trụ sét đánh xuống
      const a = Math.max(0, 1 - q / 0.45);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,255,220,' + (0.7 * a).toFixed(3) + ')'; ctx.fillRect(sx - 7, sy - 520, 14, 520); // tia sét từ trên cao
      ctx.restore();
      ctx.globalAlpha = a; blit(F.pillars, sx, sy + 10, s.r * 2.6 / F.pillars[2]); ctx.globalAlpha = 1;
    } else if (s.kind === 'dark') {
      const a = Math.max(0, 1 - q / 0.65);
      ctx.globalAlpha = a; blit(F.darkburst, sx, sy + 14, s.r * 2.9 / F.darkburst[2]); ctx.globalAlpha = 1;
    } else if (s.kind === 'spike') { // gai đá trồi lên rồi lún xuống
      const k = q < 0.15 ? q / 0.15 : q < 0.6 ? 1 : Math.max(0, 1 - (q - 0.6) / 0.3), H = 96 * k, W = s.r * 0.9;
      const tri = (cx, w, h, c1, c2) => {
        ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(cx - w, sy + 8); ctx.lineTo(cx, sy + 8 - h); ctx.lineTo(cx + w, sy + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(cx, sy + 8 - h); ctx.lineTo(cx + w, sy + 8); ctx.lineTo(cx + w * 0.1, sy + 8); ctx.closePath(); ctx.fill();
      };
      tri(sx - W * 0.7, W * 0.45, H * 0.6, '#a07a4c', '#6f5232'); tri(sx + W * 0.7, W * 0.45, H * 0.55, '#a07a4c', '#6f5232'); tri(sx, W * 0.6, H, '#c49a66', '#7d5c38');
    } else if (s.kind === 'root') { // dây leo vươn lên, đung đưa
      const k = q < 0.25 ? q / 0.25 : q < 1.1 ? 1 : Math.max(0, 1 - (q - 1.1) / 0.3);
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, bx = sx + Math.cos(a) * s.r * 0.55, by = sy + Math.sin(a) * s.r * 0.55 * C.flat;
        const hgt = (70 + (i % 3) * 22) * k, sw = Math.sin(gameTime * 4 + i) * 12;
        ctx.strokeStyle = '#2f8f3a'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(bx, by + 6); ctx.quadraticCurveTo(bx + sw, by - hgt * 0.5, bx + sw * 1.6, by - hgt); ctx.stroke();
        ctx.strokeStyle = '#6fe070'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(bx, by + 6); ctx.quadraticCurveTo(bx + sw, by - hgt * 0.5, bx + sw * 1.6, by - hgt); ctx.stroke();
        ctx.fillStyle = '#8af08a'; ctx.beginPath(); ctx.arc(bx + sw * 1.6, by - hgt, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else if (s.kind === 'meteor' && q < 0.4) { // quầng lửa khi nổ
      const a = 1 - q / 0.4;
      const g = ctx.createRadialGradient(sx, sy - 10, 4, sx, sy - 10, s.r * 1.3);
      g.addColorStop(0, 'rgba(255,240,160,' + (0.9 * a).toFixed(3) + ')'); g.addColorStop(0.5, 'rgba(255,120,30,' + (0.6 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(200,40,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy - 10, s.r * 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Trên không: đạn, lốc, hố đen, tia sáng, đòn đang nổ
  V.drawAir = (camX, camY) => {
    if (layer !== 3) return;
    for (const s of strikes) drawStrike(s, camX, camY);
    for (const b of shots) {
      const sx = b.x - camX, sy = b.y - camY;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy + 6, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      if (shardImg) { // mũi băng quay mặt sang phải; xoay theo hướng bay
        const w = shardImg.width * 0.5, h = shardImg.height * 0.5;
        ctx.save(); ctx.translate(sx, sy - 66); ctx.rotate(b.a); ctx.drawImage(shardImg, -w * 0.75, -h / 2, w, h); ctx.restore();
      } else { ctx.fillStyle = '#bfe9ff'; ctx.beginPath(); ctx.arc(sx, sy - 66, 10, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const w of tornados) {
      const sx = w.x - camX + Math.sin(w.age * 6 + w.ph) * 4, sy = w.y - camY, a = Math.min(1, w.age / 0.4, (w.life - w.age) / 0.6);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 50, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a; blit(F.tornado, sx, sy + 14, 1.25); ctx.globalAlpha = 1;
    }
    for (const h of holes) {
      const sx = h.x - camX, sy = h.y - camY - 36, grow = Math.min(1, h.age / 0.5), sz = (150 + 12 * Math.sin(h.age * 5)) * grow;
      ctx.fillStyle = 'rgba(10,0,30,' + (0.55 * grow).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(sx, sy + 36, sz * 0.5, sz * 0.5 * C.flat, 0, 0, Math.PI * 2); ctx.fill();
      blit(F.darkmoon, sx, sy, sz / F.darkmoon[2], false, h.age * 1.2, true);
    }
    for (const b of beams) { // tia Quang Pháo: dày rồi mỏng dần
      const k = 1 - b.t / b.life, w = 44 * k + 6, sx = b.x - camX, sy = b.y - camY - 60;
      const ex = sx + Math.cos(b.ang) * 1000, ey = sy + Math.sin(b.ang) * 1000;
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,225,120,' + (0.35 * k).toFixed(3) + ')'; ctx.lineWidth = w * 2.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,245,190,' + (0.85 * k + 0.1).toFixed(3) + ')'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.4; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
    }
  };

  // Ban đêm / hầm tối: boss, đạn, vũng, hố toả sáng
  V.lights = (light, camX, camY) => {
    if (layer !== 3) return;
    if (rev || V.altar) { const c = revCenter(); light(c.x - camX, c.y - camY - 80, rev ? 300 + 60 * Math.sin(rev.t * 9) : 170, rev ? 0.95 : 0.6, 0.4); }
    for (const z of zombies) if (z.final && !z.dead) light(z.x - camX, z.y - camY - z.hov - 100, z.awk ? 300 + 40 * Math.min(8, Math.max(0, awakeFrame(z.awk.t))) : z.form2 ? 340 : 280, 0.9, 0.4);
    for (const s of strikes) if (s.done && s.t - s.delay < 0.5) light(s.x - camX, s.y - camY - 30, 200, 0.9, 0.3);
    for (const b of shots) light(b.x - camX, b.y - camY - 66, 120, 0.9, 0.3);
    for (const z of zones) light(z.x - camX, z.y - camY, z.r * 1.8, 0.6 * Math.min(1, (z.life - z.age) / 1.2), 0.3);
    for (const h of holes) light(h.x - camX, h.y - camY - 36, 200, 0.8, 0.3);
    for (const w of tornados) light(w.x - camX, w.y - camY - 50, 150, 0.7, 0.3);
    for (const b of beams) light(b.x - camX + Math.cos(b.ang) * 300, b.y - camY - 60 + Math.sin(b.ang) * 300, 360, 1, 0.5);
  };

  // Vẽ rương báu (gọi từ drawChest của survival.js); (sx, sy) = tâm ô rương
  V.drawChest = (c, sx, sy) => {
    if (c.wait > 0 || !chestImg) return;
    const s = CHEST.s, fall = c.drop > 0 ? c.drop / CHEST.drop : 0, h = fall * fall * 560;
    const fx = typeof c.fx === 'number' ? c.fx : -1;
    const f = fx < 0 ? Math.floor(c.t * 2.2) % 2 : Math.min(9, 2 + Math.floor(fx / (CHEST.open / 8)));
    const near = 1 - fall; // bóng + quầng dưới đất rõ dần khi rương sắp chạm đất
    ctx.fillStyle = 'rgba(0,0,0,' + (0.35 * near).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(sx, sy + 16, 52 * (0.5 + 0.5 * near), 13 * (0.5 + 0.5 * near), 0, 0, Math.PI * 2); ctx.fill();
    if (fall > 0) { ctx.fillStyle = 'rgba(255,210,100,' + (0.25 * near).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(sx, sy + 16, 70 * near, 18 * near, 0, 0, Math.PI * 2); ctx.fill(); }
    const col = f % CHEST.cols, row = Math.floor(f / CHEST.cols), sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(chestImg, Math.round(col * CHEST.w) + 1, row * CHEST.h, Math.round(CHEST.w) - 2, CHEST.h,
      Math.round(sx - (CHEST.ax - 1) * s), Math.round(sy + 16 - h - CHEST.ay * s), (Math.round(CHEST.w) - 2) * s, CHEST.h * s);
    ctx.imageSmoothingEnabled = sm;
  };

  // Vẽ khung V2: f = [x0,y0,x1,y1,tâm-x,tâm-y]; (sx,sy) = điểm đặt tâm thân; flip = quay mặt sang trái (lật quanh tâm thân)
  function blit2(image, f, sx, sy, s, flip = false, rot = 0) {
    if (!image || !f) return;
    const [x0, y0, x1, y1, ax, ay] = f, w = x1 - x0, h = y1 - y0, sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(image, x0, y0, w, h, -(ax - x0) * s, -(ay - y0) * s, w * s, h * s);
    ctx.restore();
    ctx.imageSmoothingEnabled = sm;
  }

  // Cảnh biến hình: gục xuống -> loé trắng -> 9 khung thức tỉnh (mọc cánh, vầng sáng) -> sóng xung kích
  function drawAwaken(z, sx, sy, hov) {
    const A = z.awk, t = A.t, cy = sy + 12 - hov - 5, fi = awakeFrame(t);
    const prog = Math.min(1, t / AW.len);
    // trụ sáng + vòng sáng dưới chân
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const R = 120 + 260 * prog + 12 * Math.sin(t * 9);
    const g = ctx.createRadialGradient(sx, cy, 10, sx, cy, R);
    g.addColorStop(0, 'rgba(220,190,255,' + (0.25 + 0.3 * prog).toFixed(3) + ')'); g.addColorStop(0.5, 'rgba(120,90,255,' + (0.12 + 0.12 * prog).toFixed(3) + ')'); g.addColorStop(1, 'rgba(60,30,160,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.translate(sx, sy + 12); ctx.scale(1, C.flat);
    for (let i = 0; i < 3; i++) { // vòng ma pháp xoay dưới sàn, nở dần
      const rr = (90 + i * 70) * (0.4 + 0.6 * prog) + 10 * Math.sin(t * 5 + i);
      ctx.strokeStyle = EL[ORDER[(i * 3 + Math.floor(t * 3)) % 10]].col; ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 8 + i);
      ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.lineDashOffset = t * 60 * (i % 2 ? -1 : 1);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    if (fi < 0) { // gục xuống: dạng 1 run rẩy, nhấp nháy trắng
      const sh = (Math.random() - 0.5) * 6 * (t / AW.fall);
      if (Math.sin(t * 40) > 0) ctx.filter = 'brightness(2.2) saturate(0.4)';
      blit(F.idle[1], sx + sh, sy + 12 - hov, C.scale, z.face < 0, (z.face < 0 ? -1 : 1) * Math.min(0.3, t * 0.4));
      ctx.filter = 'none';
    } else if (awkImg) { // animation 9 khung
      const col = fi % 3, row = Math.floor(fi / 3), fw = AWK_FRAME.w, fh = AWK_FRAME.h;
      const born = Math.min(1, (t - AW.fall) / 0.25); // vừa biến hình thì "bung" ra
      const sc = 0.85 * (1 + 0.35 * (1 - born)) * (1 + 0.025 * Math.sin(t * 10));
      ctx.globalAlpha = Math.min(1, 0.4 + born);
      blit2(awkImg, [col * fw, row * fh, (col + 1) * fw, (row + 1) * fh, col * fw + AWK_FRAME.ax, row * fh + AWK_FRAME.ay], sx, cy, sc, false);
      ctx.globalAlpha = 1;
    }
    // loé trắng: lúc biến hình và lúc phát nổ cuối
    const fl = Math.max(0, 1 - Math.abs(t - AW.fall) / 0.25) * 0.7 + Math.max(0, 1 - Math.abs(t - (AW.len - 0.5)) / 0.3) * 0.6;
    if (fl > 0.01) { ctx.save(); ctx.globalAlpha = Math.min(0.8, fl); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore(); }
  }

  // Dạng V2 Thức Tỉnh: sprite lớn hơn, cánh pha lê, quầng vàng tím dưới chân
  function drawV2(z, camX, camY) {
    const sx = Math.round(z.x - camX), sy = Math.round(z.y - camY), S = C.scale2, A = z.act;
    const fade = z.dead ? Math.max(0, 1 - Math.max(0, z.deadT - 3.5) / 1.4) : 1;
    const hov = Math.max(0, z.hov + (z.dead ? 0 : Math.sin(z.t * 2.6) * 5));
    ctx.globalAlpha = fade;
    const sh = Math.max(0.45, 1 - hov / 300);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(sx, sy + 12, 95 * sh, 17 * sh, 0, 0, Math.PI * 2); ctx.fill();
    if (z.awk) { drawAwaken(z, sx, sy, hov); ctx.globalAlpha = 1; return; }
    const cy = sy + 12 - hov - 108; // tâm thân (tỉ lệ theo scale2)
    let f = F2.idle[Math.floor(z.t * 6) % 5], aura = null, rot = 0;
    if (z.dead) { f = F2.idle[1]; rot = Math.min(0.35, z.deadT * 0.25); }
    else if (A) {
      const e = EL[A.n];
      if (e) { f = F2.cast[CAST2[A.n]]; aura = e.col; }
      else if (A.n === 'claw') f = F2.atk[Math.min(3, Math.floor(A.t / 0.55 * 2.5))];
      else if (A.n === 'dash') f = F2.run[Math.floor(z.t * 12) % 4];
      else if (A.n === 'roar') { f = F2.wake[0]; aura = '#ffffff'; }
    } else if (z.moving) f = F2.move[Math.floor(z.t * 10) % 5];
    if (!z.dead) { // quầng dưới chân (tím + vàng) và quầng quanh thân khi gồng chiêu
      ctx.fillStyle = 'rgba(190,110,255,' + (0.2 + 0.08 * Math.sin(z.t * 7)).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(sx, sy + 12, 125 * sh, 27 * sh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,110,' + (0.35 + 0.15 * Math.sin(z.t * 5)).toFixed(3) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, sy + 12, 125 * sh, 27 * sh, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (aura && !z.dead) {
      const g = ctx.createRadialGradient(sx, cy, 10, sx, cy, 200);
      ctx.globalAlpha = fade * (0.35 + 0.15 * Math.sin(z.t * 14)); g.addColorStop(0, aura); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, cy, 200, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade;
    }
    const hot = !z.dead && (z.flash > 0 || z.hurtT > 0.15);
    if (hot) ctx.filter = 'brightness(1.6) saturate(0.8)';
    const shiver = A && EL[A.n] && A.t < EL[A.n].wind ? (Math.random() - 0.5) * 3 : 0;
    blit2(img2, f, sx + shiver, cy, S, z.face < 0, z.face < 0 ? -rot : rot);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }

  // Vẽ rồng (gọi từ drawBoss của survival.js)
  V.draw = (z, camX, camY) => {
    if (z.form2) { drawV2(z, camX, camY); return; }
    const sx = Math.round(z.x - camX), sy = Math.round(z.y - camY), S = C.scale, A = z.act;
    const fade = z.dead ? Math.max(0, 1 - Math.max(0, z.deadT - 3.5) / 1.4) : 1;
    const hov = Math.max(0, z.hov + (z.dead ? 0 : Math.sin(z.t * 2.6) * 5));
    ctx.globalAlpha = fade;
    const sh = Math.max(0.45, 1 - hov / 260); // càng bay cao bóng càng nhỏ
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 12, 70 * sh, 13 * sh, 0, 0, Math.PI * 2); ctx.fill();

    let f = F.idle[Math.floor(z.t * 6) % 5], aura = null, rot = 0;
    if (z.dead) { f = F.idle[1]; rot = Math.min(0.35, z.deadT * 0.25); }
    else if (A) {
      const e = EL[A.n];
      if (e) { f = F.cast[e.cast]; aura = e.col; }
      else if (A.n === 'claw') f = F.atk[Math.min(4, Math.floor(A.t / 0.55 * 3))];
      else if (A.n === 'dash') f = F.run[Math.floor(z.t * 12) % 6];
      else if (A.n === 'roar') { f = F.cast[8]; aura = '#ffffff'; }
    } else if (z.moving) f = F.move[Math.floor(z.t * 10) % 8];

    if (aura && !z.dead) { // gồng chiêu: quầng sáng đúng màu hệ
      const g = ctx.createRadialGradient(sx, sy - hov - 80, 10, sx, sy - hov - 80, 170);
      const pulse = 0.35 + 0.15 * Math.sin(z.t * 14);
      ctx.globalAlpha = fade * pulse; g.addColorStop(0, aura); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy - hov - 80, 170, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade;
    }
    if (z.ph >= 1 && !z.dead) { // nổi giận: quầng dưới chân (giai đoạn 3 đổi tím)
      ctx.fillStyle = (z.ph >= 2 ? 'rgba(190,110,255,' : 'rgba(255,170,80,') + (0.16 + 0.07 * Math.sin(z.t * 7)).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(sx, sy + 12, 100 * sh, 22 * sh, 0, 0, Math.PI * 2); ctx.fill();
    }

    const hot = !z.dead && (z.flash > 0 || z.hurtT > 0.15);
    if (hot) ctx.filter = 'brightness(1.7) saturate(0.7)';
    const shiver = A && EL[A.n] && A.t < EL[A.n].wind ? (Math.random() - 0.5) * 3 : 0;
    if (!z.dead) { ctx.shadowColor = aura || 'rgba(150,120,255,0.65)'; ctx.shadowBlur = aura ? 26 : 16; } // viền sáng ma thuật quanh thân
    blit(f, sx + shiver, sy + 12 - hov, S, z.face < 0, z.face < 0 ? -rot : rot);
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  };

  window.FinalBoss = V;
  return V;
})();
