// ======================================================================
//  volcano-boss.js: BOSS ĐẢO NÚI LỬA "Chúa Tể Dung Nham" — 1500 máu, dùng bộ chiêu hệ Lửa
//  - Mỗi đảo núi lửa (volcano.js) có một boss canh ở đồng tro trong vòng đá trong. Tới gần (≤ 22 ô) boss được dựng;
//    đi xa thì cất lại (nhớ máu); hạ gục thì 15 phút sau hồi sinh.
//  - Bộ chiêu (mỗi chiêu có hoạt ảnh gồng + vòng đỏ báo trước để né):
//      Dậm Đất   : đứng sát người chơi -> dậm xuống, sóng lửa toả vòng quanh
//      Hỏa Cầu   : bắn quả cầu lửa (nổi giận: 3 quả toả quạt)
//      Bạo Viêm  : trụ lửa trồi lên dưới chân người chơi sau gần 1 giây
//      Thiên Thạch: mưa thiên thạch rơi quanh người chơi, để lại vũng lửa
//      Hỏa Long  : rồng lửa lao thẳng một đường (có dải đỏ báo hướng)
//  - Hạ boss: rớt Rương Lửa; mở rương nhận Giấy Lửa (item firescroll: dâng cho Phù Thủy để học chiêu cuối Hỏa Long) + đồ legendary.
//  - Dưới 50% máu: nổi giận (gầm + sóng lửa, nhanh hơn, hồi chiêu ngắn hơn, nhiều đòn hơn).
//  - Thông số chỉnh ở C bên dưới. Lệnh thử trong cheat.js: /bossnuilua
//  - Ảnh: assets/volcano_boss/lava_demon.webp (bảng sprite đã xoá nền; toạ độ từng khung ở FR).
//  - Boss đảo băng "Chúa Tể Băng Giá" là RỒNG BĂNG: assets/ice_boss/ice_dragon.webp (toạ độ khung ở FRI), dùng chiêu HỆ BĂNG:
//      Băng Tiễn (ball): mũi băng bắn tới, làm chậm · Hàn Vực (erupt): gai băng trồi lên, đóng băng (gần như đứng yên) ·
//      Bão Tuyết (meteor): mưa băng rơi, để lại vùng giá lạnh làm chậm · Băng Kính (mirror): khiên pha lê giảm 70% sát thương boss nhận ·
//      Dậm Băng / Băng Long: như bộ chiêu gốc nhưng đòn nào trúng cũng làm chậm người chơi. Rớt Rương Băng (ice_chest.webp) → Giấy Băng (ice_scroll.webp).
//  File này nạp SAU survival.js (xem survival.html).
//  Muốn gỡ: xoá file này + thẻ <script> + các dòng "VolcBoss" / "z.volc" trong survival.js, cheat.js.
// ======================================================================
const VolcBoss = (() => {
  const V = {};
  const NAME = 'Chúa Tể Dung Nham';
  const NAME_ICE = 'Chúa Tể Băng Giá'; // boss đảo băng: cùng bộ chiêu, đổi màu xanh, đòn không gây bỏng
  V.NAME = NAME;
  V.nameOf = (z) => (z && z.ice ? NAME_ICE : NAME);
  let fxIce = false;                    // đòn đang bay / vòng báo trước là của boss băng -> vẽ màu xanh
  let testIce = false;                  // lệnh thử /bossbang

  // ---------- Thông số ----------
  const C = {
    hp: 1500, scale: 1.5,
    hb: { rx: 62, up: 182, down: 14 }, // hitbox thân (đỉnh cánh / sừng không tính)
    walk: 44, run: 96, rageMul: 1.3,
    respawn: 900,                      // giây sau khi chết thì hồi sinh
    spawnDist: 22, hintDist: 46,       // ô: dựng boss / báo hướng khi người chơi cách hang ≤ từng này
    pierce: 0.3,                       // lửa xuyên 30% giáp
    // Mỗi chiêu: dmg sát thương · wind thời gian gồng · cd hồi chiêu (giây)
    slam:   { dmg: 24, R: 170, wind: 0.75, rec: 0.45, cd: 2.5 },
    ball:   { dmg: 14, speed: 380, wind: 0.8, cd: 3.4, burn: 3, life: 2.4 },
    erupt:  { dmg: 20, r: 82, wind: 0.9, delay: 0.95, n: 4, nRage: 7, cd: 9 },
    meteor: { dmg: 18, r: 70, wind: 1.1, n: 8, nRage: 14, gap: 0.32, fall: 1.0, cd: 15, zone: 4 },
    dragon: { dmg: 28, wind: 1.1, speed: 560, range: 640, width: 62, cd: 12 },
    roar:   { R: 280, dmg: 12, time: 1.3 },
    zone:   { dmg: 7, life: 4, burn: 2 }, // vũng lửa để lại: sát thương mỗi ~1 giây đứng trong
    burn: 3,
    // Chiêu riêng của boss băng: mirror = Băng Kính (khiên giảm cut sát thương boss nhận trong dur giây)
    mirror: { wind: 0.9, dur: 6, cut: 0.7, cd: 22 },
    // Làm chậm người chơi: [giây, hệ số tốc độ]. Mặc định cho mọi đòn trúng; gai Hàn Vực đóng băng gần như đứng yên
    frost: { hit: [1.5, 0.55], shard: [2.2, 0.45], freeze: [1.3, 0.2] },
    flat: 0.7,                            // tỉ lệ dẹt của vòng tròn dưới đất (vẽ + tính trúng cùng một elip)
  };

  // Khung sprite trong lava_demon.webp: [x, y, rộng, cao, neo x, neo y]
  const FR = {
    roar: [[6,10,354,218,174,218]],
    walk: [[368,22,197,163,102,163],[571,25,169,154,92,154],[752,29,158,148,84,148],[925,32,160,147,81,147],[1102,34,149,144,74,144],[1269,34,163,146,83,146]],
    slam: [[16,271,186,125,100,125],[232,245,219,150,110,150],[476,241,208,153,100,153],[702,223,219,171,109,171],[929,228,228,165,112,165],[1171,228,233,168,119,168]],
    castFb: [[30,421,197,118,85,118]],
    fb: [[297,450,114,49,90,24],[470,444,170,65,138,32],[674,432,222,91,177,45],[914,428,209,97,161,48],[1158,431,250,98,201,49]],
    windE: [[12,569,214,135,108,135]],
    eruptBoss: [[249,559,251,150,125,150]],
    erupt: [[520,531,280,178,140,178],[820,566,263,143,131,143],[1103,548,331,161,165,161]],
    castM: [[15,740,182,131,89,131],[257,743,217,126,108,126],[533,727,229,138,124,138]],
    meteorRock: [[591,727,42,37,20,37],[706,754,52,52,29,52]],
    impact: [[804,732,263,137,131,137],[1114,733,306,134,153,134]],
    castD: [[11,917,208,143,96,143],[245,901,222,154,93,154]],
    dragon: [[489,881,251,187,125,187],[741,887,365,181,182,181],[1106,885,326,185,163,185]]
  };

  // Khung sprite trong ice_dragon.webp (rồng băng): [x, y, rộng, cao, neo x, neo y] — neo = giữa-đáy của khung
  const fi = (x, y, w, h) => [x, y, w, h, Math.round(w / 2), h];
  const FRI = {
    roar: [fi(15, 15, 353, 253)],
    walk: [fi(384, 67, 186, 170), fi(592, 62, 155, 175), fi(768, 64, 181, 173), fi(964, 63, 170, 174), fi(1153, 60, 170, 178), fi(1338, 65, 163, 174)],
    slam: [fi(19, 331, 185, 167), fi(231, 344, 167, 154), fi(415, 327, 286, 182), fi(415, 327, 286, 182), fi(710, 335, 285, 169), fi(231, 344, 167, 154)],
    castFb: [fi(231, 344, 167, 154)],           // rồng ngẩng đầu há miệng phun băng (tia băng là đạn riêng)
    windE: [fi(10, 555, 256, 197)],             // bay lên gồng
    eruptBoss: [fi(527, 546, 239, 225)],        // quầng băng dưới chân
    castM: [fi(10, 555, 256, 197), fi(289, 562, 222, 199), fi(527, 546, 239, 225)],
    castD: [fi(415, 327, 286, 182), fi(1268, 563, 250, 210)],
    erupt: [fi(1146, 612, 120, 152), fi(974, 583, 156, 180), fi(783, 560, 174, 203)], // trụ băng trồi lên: nhỏ · cao · vừa
    impact: [fi(1102, 786, 409, 216), fi(1102, 786, 409, 216)],
    dead: [fi(19, 836, 255, 137), fi(300, 863, 267, 111), fi(585, 871, 238, 103), fi(846, 873, 218, 104)],
  };

  let sheet = null, iceSheet = null, chestImg = null, scrollImg = null, iceChestImg = null, iceScrollImg = null, shardImg = null;
  loadImage('assets/ice_boss/ice_dragon.webp').then((img) => { iceSheet = img; });
  loadImage('assets/volcano_boss/lava_demon.webp').then((img) => { sheet = img; });
  loadImage('assets/volcano_boss/fire_chest.webp').then((img) => { chestImg = img; });
  loadImage('assets/items/fire_scroll.webp').then((img) => { scrollImg = img; });
  loadImage('assets/volcano_boss/ice_chest.webp').then((img) => { iceChestImg = img; });
  loadImage('assets/items/ice_scroll.webp').then((img) => { iceScrollImg = img; });
  loadImage('assets/ice/iceshard.webp').then((img) => { shardImg = img; });
  V.scrollImg = () => scrollImg;
  V.iceScrollImg = () => iceScrollImg;
  // Giấy Lửa (item firescroll, khai báo trong survival.js) dùng hình fire_scroll.webp ở trên; Sách Hệ Lửa (tome_fire) là cuốn sách riêng lấy từ Chú Lùn
  const CH = [[0,98,220,111],[240,0,228,214],[485,7,220,205],[731,0,224,211]]; // khung rương lửa: [x, y, rộng, cao]: đóng · bung lửa · toả sáng · mở
  const CHI = [[10,107,172,117],[192,23,177,201],[379,14,183,210],[572,0,185,224]]; // khung Rương Băng (ice_chest.webp), cùng thứ tự, căn đáy

  // ---------- Trạng thái ----------
  let balls = [], spikes = [], rocks = [], blasts = [], dragons = [], zones = [];
  const hinted = new Set();
  const lairs = new Map();
  let scanT = 0, cheatN = 0;
  let frostT = 0, frostMul = 1;         // người chơi bị boss băng làm chậm: giây còn lại + hệ số tốc độ
  V.playerSlow = () => (frostT > 0 ? frostMul : 1); // nhân vào tốc độ chạy (survival.js)
  V.shieldMul = () => 1 - C.mirror.cut;             // hệ số sát thương boss nhận khi có Băng Kính (hitZombie)
  function frost(sec, mul) {
    if (frostT <= 0) { frostMul = mul; floaters.push({ x: player.x, y: player.y - 70, text: '❄ Bị làm chậm', life: 0.9, color: '#9fd8ff' }); }
    else frostMul = Math.min(frostMul, mul);
    frostT = Math.max(frostT, sec);
  }

  V.reset = () => { V.clear(); hinted.clear(); lairs.clear(); };
  V.clear = () => { balls = []; spikes = []; rocks = []; blasts = []; dragons = []; zones = []; frostT = 0; };

  // ---------- Tiện ích ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const inEll = (px, py, cx, cy, r) => { const dx = (px - cx) / r, dy = (py - cy) / (r * C.flat); return dx * dx + dy * dy < 1; };
  const onPlayer = (cx, cy, r) => inEll(player.x, player.y + 6, cx, cy, r);
  function hitPlayer(dmg, burn = 0, slow = C.frost.hit) {
    hurt(dmg, C.pierce);
    if (fxIce) frost(slow[0], slow[1]);              // boss băng: làm chậm, không gây bỏng
    else if (burn > 0) burnT = Math.max(burnT, burn);
  }
  const pal = (fire, ice) => (fxIce ? ice : fire);  // màu hạt: lửa / băng
  const rageOf = (z) => z.hp < z.maxHp * 0.5;
  const freeSpot = (x, y) => !isSolid(Math.floor(x / TILE), Math.floor(y / TILE));

  // Vẽ một khung sprite: neo (sx, sy) là chân; flip = quay mặt sang trái; rot = xoay quanh điểm neo
  function blit(f, sx, sy, s, flip = false, rot = 0, img = null) {
    const src = img || sheet;
    if (!src || !f) return;
    const [x, y, w, h, ax, ay] = f;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(src, x, y, w, h, -ax * s, -ay * s, w * s, h * s);
    ctx.restore();
    ctx.imageSmoothingEnabled = sm;
  }

  // ---------- Hang boss trên đảo ----------
  // Chỗ trống trên đồng tro trong vòng đá trong, phía đối diện lối vào chính
  function lairOf(v) {
    const key = 'volc:' + v.x + ',' + v.y;
    if (lairs.has(key)) return lairs.get(key);
    let res = null;
    const a0 = v.g0 + Math.PI / 3 + Math.PI;
    for (let r = 7.5; r <= 11 && !res; r += 0.5) {
      for (let k = 0; k < 16 && !res; k++) {
        const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.22;
        const tx = Math.round(v.x + Math.cos(a) * r), ty = Math.round(v.y + Math.sin(a) * r);
        if (volcanoGround(tx, ty) !== 1 || getTile(tx, ty) !== GRASS || isSolid(tx, ty)) continue;
        const c = tileCenter(tx, ty);
        if (!collides(c.x, c.y, 14)) res = { key, tx, ty, ice: !!v.ice };
      }
    }
    lairs.set(key, res);
    return res;
  }

  V.lairOf = lairOf; // cho lệnh /tp bossnuilua (cheat.js)

  function create(L, hp) {
    const c = tileCenter(L.tx, L.ty);
    const z = {
      plant: 'boss', boss: true, volc: true, fire: !L.ice, ice: !!L.ice, type: 1, nest: 'boss:' + L.key, bossKey: L.key,
      x: c.x, y: c.y, hx: c.x, hy: c.y,
      hp: hp || C.hp, maxHp: C.hp, face: -1, dir: 0, fx: 0, fy: 1,
      t: Math.random() * 5, aggro: false, atkCd: 1.5, atkT: 0, atkHit: false, hurtT: 0,
      dead: false, deadT: 0, noDrop: false, kx: 0, ky: 0, wanderT: 1 + Math.random() * 2, wx: c.x, wy: c.y,
      stuck: 0, sideT: 0, sideDir: 1, escal: 0, freeT: 0, moving: false, running: false, guard: null,
      act: null, jz: 0, flash: 0, hb: C.hb, raged: false,
      slamCd: 0, ballCd: 2, eruptCd: 5, meteorCd: 9, dragonCd: 7, mirrorCd: 8, shieldT: 0,
    };
    fxIce = !!L.ice;
    zombies.push(z);
    return z;
  }

  // Quét mỗi 0,5 giây: báo hướng + dựng boss khi người chơi tới gần hang của đảo gần nhất
  function scan(dt) {
    scanT -= dt;
    if (scanT > 0 || deathScreen || layer !== 0) return;
    scanT = 0.5;
    const px = player.x / TILE, py = player.y / TILE;
    const n = nearestVolcano(px, py);
    if (!n || n.dist > 70) return;
    const L = lairOf(n.v);
    if (!L) return;
    const dist = Math.hypot(L.tx - px, L.ty - py);
    const died = bossDeaths.get(L.key);
    if (died !== undefined && gameTime - died < C.respawn) return;
    if (dist <= C.hintDist && !hinted.has(L.key)) {
      hinted.add(L.key);
      say((L.ice ? 'Tiếng gầm vang từ đỉnh núi băng: ' : 'Tiếng gầm vang từ miệng núi lửa: ') + (L.ice ? NAME_ICE : NAME) + ', boss ' + C.hp + ' máu!');
      shake = Math.max(shake, 0.3);
    }
    if (dist > C.spawnDist || zombies.some((z) => z.bossKey === L.key)) return;
    const sv = bossSaved.get(L.key);
    bossSaved.delete(L.key);
    create(L, sv ? Math.min(C.hp, sv.hp + (gameTime - sv.t) * 1.5) : C.hp);
  }

  // Lệnh thử: gọi boss ngay cạnh người chơi
  V.spawnNear = (ice) => {
    testIce = !!ice;
    if (layer !== 0) return 'Hãy ra ngoài trời';
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, d = 280 + Math.random() * 100;
      const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
      if (collides(x, y, 14)) continue;
      create({ key: 'volc:test' + (cheatN++), tx: Math.floor(x / TILE), ty: Math.floor(y / TILE), ice: testIce }, C.hp);
      return 'Đã gọi ' + (testIce ? NAME_ICE : NAME) + ' (' + C.hp + ' máu)';
    }
    return 'Không có chỗ trống quanh đây, thử chỗ thoáng hơn';
  };

  // ======================================================================
  //  AI
  // ======================================================================
  function startAct(z, n, rage) {
    z.act = { n, t: 0, hit: false };
    z[n + 'Cd'] = C[n].cd * (rage ? 0.7 : 1);
    if (Math.abs(player.x - z.x) > 4) z.face = player.x < z.x ? -1 : 1;
  }
  const endAct = (z, rage) => { z.act = null; z.atkCd = rage ? 0.5 : 1; };

  function chooseAttack(z, dist, rage) {
    const los = lineClear(z.x, z.y - 10, player.x, player.y - 10);
    const opts = [];
    if (z.slamCd <= 0 && dist < C.slam.R - 20) opts.push('slam', 'slam');
    if (z.ballCd <= 0 && dist > 150 && dist < 680 && los) opts.push('ball', 'ball');
    if (z.eruptCd <= 0 && dist < 640) opts.push('erupt');
    if (z.meteorCd <= 0 && dist < 700) opts.push('meteor');
    if (z.dragonCd <= 0 && dist > 230 && dist < 620 && los) opts.push('dragon');
    if (z.ice && z.mirrorCd <= 0 && z.shieldT <= 0 && z.hp < z.maxHp * 0.85) opts.push('mirror', 'mirror'); // Băng Kính: dựng khiên khi đã bị thương
    if (!opts.length) return false;
    startAct(z, opts[Math.floor(Math.random() * opts.length)], rage);
    return true;
  }

  V.updateBoss = (z, dt) => {
    z.t += dt;
    const dxp = player.x - z.x, dyp = player.y - z.y, dist = Math.hypot(dxp, dyp);
    const rage = rageOf(z);
    fxIce = !!z.ice;                      // màu đòn đánh theo boss đang chạy
    for (const k of ['atkCd', 'slamCd', 'ballCd', 'eruptCd', 'meteorCd', 'dragonCd', 'mirrorCd', 'shieldT', 'hurtT', 'flash']) z[k] = Math.max(0, z[k] - dt);
    z.moving = false; z.running = false;

    if (Math.abs(z.kx) + Math.abs(z.ky) > 5) { // quá nặng: chỉ bị đẩy rất nhẹ
      moveZombie(z, z.kx * dt, z.ky * dt);
      const f = Math.max(0, 1 - 12 * dt);
      z.kx *= f; z.ky *= f;
    }

    // Thức giấc khi người chơi vào tầm mắt; đuổi tới khi người chơi chạy quá xa
    if (!deathScreen && dist < 520 && (z.aggro || lineClear(z.x, z.y - 10, player.x, player.y - 10))) {
      if (!z.aggro && gameTime - bossMsgT > 30) { bossMsgT = gameTime; say(V.nameOf(z) + ' thức giấc! Boss ' + C.hp + ' máu'); shake = Math.max(shake, 0.5); }
      z.aggro = true;
    } else if (deathScreen || dist > 1000) z.aggro = false;
    if (z.aggro && Math.hypot(z.x - z.hx, z.y - z.hy) > 1300) z.aggro = false;
    if (!z.aggro && z.hp < z.maxHp) z.hp = Math.min(z.maxHp, z.hp + 6 * dt);
    if (z.aggro && !z.act && Math.abs(dxp) > 4) z.face = dxp < 0 ? -1 : 1;

    // Qua mốc 50% máu: gầm lên, nổi giận
    if (rage && !z.raged && z.aggro) {
      z.raged = true;
      z.act = { n: 'roar', t: 0, hit: false };
      say(V.nameOf(z) + ' nổi giận!');
    }

    if (z.act) { runAct(z, z.act, dt, rage); return; }
    if (z.hurtT > 0 && !z.aggro) return;

    if (z.aggro) {
      if (z.atkCd <= 0 && chooseAttack(z, dist, rage)) return;
      if (dist < 115) return; // đủ gần: đứng chờ đòn
      zombieWalk(z, player.x, player.y, C.run * (rage ? C.rageMul : 1), dt);
      z.running = true;
      return;
    }
    // Chưa thấy người chơi: lững thững quanh hang
    z.wanderT -= dt;
    if (z.wanderT <= 0) {
      z.wanderT = 3 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 90;
      z.wx = z.hx + Math.cos(a) * d; z.wy = z.hy + Math.sin(a) * d;
      if (Math.random() < 0.5) { z.wx = z.x; z.wy = z.y; }
    }
    zombieWalk(z, z.wx, z.wy, C.walk, dt);
  };

  // Chọn điểm đặt chiêu quanh người chơi (không rơi vào ô đặc)
  function targetNear(spread) {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, d = rnd(spread * 0.3, spread);
      const x = player.x + Math.cos(a) * d, y = player.y + 6 + Math.sin(a) * d * C.flat;
      if (freeSpot(x, y)) return { x, y };
    }
    return { x: player.x, y: player.y + 6 };
  }

  function runAct(z, A, dt, rage) {
    A.t += dt;
    switch (A.n) {
      case 'slam': {
        const S = C.slam;
        if (!A.hit && A.t >= S.wind) {
          A.hit = true; shake = Math.max(shake, 0.7);
          blasts.push({ k: 'ring', x: z.x, y: z.y + 6, r: S.R, t: 0, life: 0.45 });
          burst(z.x, z.y + 6, pal('#ffb23a', '#d8f2ff'), 26, 260, 420);
          burst(z.x, z.y + 6, pal('#ff5a1a', '#6ac8ff'), 14, 180, 260);
          if (onPlayer(z.x, z.y + 6, S.R)) hitPlayer(S.dmg, C.burn);
        }
        if (A.t >= S.wind + S.rec) endAct(z, rage);
        break;
      }
      case 'ball': {
        const B = C.ball;
        if (!A.hit && A.t >= B.wind * 0.55) {
          A.hit = true;
          const hx = z.x + z.face * 75, hy = z.y, base = Math.atan2(player.y - hy, player.x - hx);
          const n = rage ? 3 : 1;
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.28;
            balls.push({ x: hx, y: hy, vx: Math.cos(a) * B.speed, vy: Math.sin(a) * B.speed, a, t: 0, ice: !!z.ice });
          }
          burst(hx, hy - 70, pal('#ffb040', '#bfe9ff'), 10, 150, -40);
        }
        if (A.t >= B.wind) endAct(z, rage);
        break;
      }
      case 'erupt': {
        const E = C.erupt;
        if (!A.hit && A.t >= E.wind) {
          A.hit = true;
          const n = rage ? E.nRage : E.n;
          for (let i = 0; i < n; i++) { // trụ đầu tiên ngay chỗ người chơi, các trụ sau rải quanh
            const p = i === 0 ? { x: player.x, y: player.y + 6 } : targetNear(rage ? 230 : 190);
            spikes.push({ x: p.x, y: p.y, r: E.r, t: -i * 0.18, done: false });
          }
          burst(z.x, z.y, pal('#ff7a1a', '#8fd6ff'), 16, 200, 300);
        }
        if (A.t >= E.wind + 0.7) endAct(z, rage);
        break;
      }
      case 'meteor': {
        const M = C.meteor, n = rage ? M.nRage : M.n, gap = rage ? M.gap * 0.65 : M.gap;
        if (A.t >= M.wind) {
          A.k = A.k || 0; A.next = (A.next === undefined ? 0 : A.next) - dt;
          while (A.k < n && A.next <= 0) {
            const p = A.k === 0 ? { x: player.x, y: player.y + 6 } : targetNear(260);
            rocks.push({ x: p.x, y: p.y, t: 0, spin: Math.random() * 6 });
            A.k++; A.next += gap;
          }
          if (A.k >= n && A.t >= M.wind + n * gap + 0.5) endAct(z, rage);
        }
        break;
      }
      case 'dragon': {
        const D = C.dragon;
        if (A.t < D.wind - 0.35) A.ang = Math.atan2(player.y - z.y, player.x - z.x); // dải đỏ bám theo, chốt hướng 0,35 giây trước khi lao
        if (!A.hit && A.t >= D.wind) {
          A.hit = true; shake = Math.max(shake, 0.5);
          dragons.push({ x: z.x, y: z.y, sx: z.x, sy: z.y, ang: A.ang, dist: 0, t: 0, hit: false, zoneAt: 0 });
          burst(z.x, z.y - 60, pal('#ff8a2a', '#bfe9ff'), 20, 240, 100);
        }
        if (A.t >= D.wind + 0.45) endAct(z, rage);
        break;
      }
      case 'roar': {
        const R = C.roar;
        if (!A.hit && A.t >= R.time * 0.45) {
          A.hit = true; shake = Math.max(shake, 1);
          blasts.push({ k: 'ring', x: z.x, y: z.y + 6, r: R.R, t: 0, life: 0.6 });
          burst(z.x, z.y - 90, pal('#ffb23a', '#d8f2ff'), 34, 300, 200);
          if (onPlayer(z.x, z.y + 6, R.R * 0.6)) hitPlayer(R.dmg, C.burn);
        }
        if (A.t >= R.time) { z.act = null; z.atkCd = 0.6; }
        break;
      }
      case 'mirror': { // Băng Kính (chỉ boss băng): khiên pha lê giảm sát thương boss nhận
        const M = C.mirror;
        if (!A.hit && A.t >= M.wind) {
          A.hit = true; z.shieldT = M.dur;
          blasts.push({ k: 'ring', x: z.x, y: z.y + 6, r: 170, t: 0, life: 0.5 });
          burst(z.x, z.y - 90, '#d8f2ff', 24, 220, 120);
          floaters.push({ x: z.x, y: z.y - 230, text: 'Băng Kính!', life: 1.4, color: '#bfe9ff' });
        }
        if (A.t >= M.wind + 0.4) endAct(z, rage);
        break;
      }
    }
  }

  // ======================================================================
  //  HIỆU ỨNG / ĐẠN / ĐÒN ĐANG BAY
  // ======================================================================
  function landRock(m) {
    const M = C.meteor;
    blasts.push({ k: 'impact', x: m.x, y: m.y, t: 0, life: 0.5, r: M.r });
    burst(m.x, m.y - 8, pal('#ff7a1a', '#6ac8ff'), 14, 210, 380);
    burst(m.x, m.y - 8, pal('#ffd34d', '#e8f8ff'), 6, 150, 300);
    shake = Math.max(shake, 0.3);
    if (onPlayer(m.x, m.y, M.r)) hitPlayer(M.dmg, C.burn);
    addZone(m.x, m.y, M.r * 0.8, M.zone);
  }

  function addZone(x, y, r, life) {
    if (zones.length >= 30) zones.shift();
    zones.push({ x, y, r, age: 0, life, tick: 0.3, ph: Math.random() * 6 });
  }

  V.update = (dt) => {
    scan(dt);
    if (layer !== 0) return;

    // quả cầu lửa
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
      let dead = b.t > C.ball.life || !freeSpot(b.x, b.y);
      if (!dead && Math.hypot(b.x - player.x, b.y - player.y) < 30) { hitPlayer(C.ball.dmg, C.ball.burn, C.frost.shard); dead = true; }
      if (Math.random() < 0.6) burst(b.x, b.y - 62, b.ice ? (Math.random() < 0.5 ? '#6ac8ff' : '#e8f8ff') : (Math.random() < 0.5 ? '#ff6a1a' : '#ffd34d'), 1, 50, 60);
      if (dead) {
        blasts.push({ k: 'puff', x: b.x, y: b.y, t: 0, life: 0.3 });
        burst(b.x, b.y - 50, b.ice ? '#bfe9ff' : '#ff8a2a', 10, 170, 200);
        balls.splice(i, 1);
      }
    }

    // trụ lửa (Bạo Viêm): đếm ngược rồi trồi lên
    for (let i = spikes.length - 1; i >= 0; i--) {
      const s = spikes[i];
      s.t += dt;
      if (!s.done && s.t >= C.erupt.delay) {
        s.done = true; shake = Math.max(shake, 0.35);
        burst(s.x, s.y - 10, pal('#ffb23a', '#bfe9ff'), 14, 230, 360);
        if (onPlayer(s.x, s.y, s.r)) hitPlayer(C.erupt.dmg, C.burn, C.frost.freeze); // Hàn Vực: đóng băng gần như đứng yên
        if (fxIce) addZone(s.x, s.y, s.r * 0.9, 2.5);                                  // rồi để lại vùng giá lạnh
      }
      if (s.t > C.erupt.delay + 0.75) spikes.splice(i, 1);
    }

    // thiên thạch
    for (let i = rocks.length - 1; i >= 0; i--) {
      const m = rocks[i];
      m.t += dt; m.spin += dt * 6;
      if (m.t >= C.meteor.fall) { landRock(m); rocks.splice(i, 1); }
    }

    // hỏa long: lao thẳng, dừng khi chạm tường
    for (let i = dragons.length - 1; i >= 0; i--) {
      const d = dragons[i], D = C.dragon, step = D.speed * dt;
      d.t += dt;
      const nx = d.x + Math.cos(d.ang) * step, ny = d.y + Math.sin(d.ang) * step;
      const blocked = !freeSpot(nx, ny);
      if (!blocked) { d.x = nx; d.y = ny; d.dist += step; }
      if (!d.hit && Math.hypot(player.x - d.x, (player.y - d.y) / C.flat) < D.width + 14) { d.hit = true; hitPlayer(D.dmg, C.burn + 2); }
      if (d.dist >= d.zoneAt) { addZone(d.x, d.y, 42, 2.5); d.zoneAt += 130; } // vệt lửa dọc đường bay
      if (Math.random() < 0.8) burst(d.x + rnd(-40, 40), d.y - rnd(10, 90), fxIce ? (Math.random() < 0.5 ? '#6ac8ff' : '#e8f8ff') : (Math.random() < 0.5 ? '#ff8a2a' : '#ffd34d'), 1, 90, -80);
      if (blocked || d.dist >= D.range) {
        blasts.push({ k: 'puff', x: d.x, y: d.y, t: 0, life: 0.4 });
        burst(d.x, d.y - 40, '#ff7a1a', 18, 240, 200);
        dragons.splice(i, 1);
      }
    }

    if (frostT > 0) frostT -= dt;       // hết giờ làm chậm

    // vũng lửa / vùng giá lạnh (boss băng): gây sát thương + làm chậm theo nhịp ~1 giây
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      z.age += dt;
      if (z.age >= z.life) { zones.splice(i, 1); continue; }
      if (Math.random() < 0.05) burst(z.x + rnd(-z.r, z.r) * 0.7, z.y - 4, '#ff8a2a', 1, 40, -120);
      z.tick -= dt;
      if (z.tick <= 0 && onPlayer(z.x, z.y, z.r)) { z.tick = 1; hitPlayer(C.zone.dmg, C.zone.burn); }
    }

    // hiệu ứng ngắn (vòng sóng, vụ nổ)
    for (let i = blasts.length - 1; i >= 0; i--) {
      blasts[i].t += dt;
      if (blasts[i].t > blasts[i].life) blasts.splice(i, 1);
    }

    // rương lửa của boss: bấm E thì chạy hoạt ảnh ~1,1 giây rồi mới mở thật
    for (const c of chests) {
      if (!c.volc || c.fx === undefined || c.fx === 'done') continue;
      c.fx += dt;
      if (Math.random() < 0.5) { const p = tileCenter(c.tx, c.ty); burst(p.x + rnd(-20, 20), p.y - 10, c.ice ? (Math.random() < 0.5 ? '#6ac8ff' : '#e8f8ff') : (Math.random() < 0.5 ? '#ff8a2a' : '#ffd34d'), 1, 120, -60); }
      if (c.fx >= 1.1) { c.fx = 'done'; openChest(c); }
    }

    // xác boss: lửa bốc dần
    for (const z of zombies) {
      if (z.volc && z.dead && Math.random() < 0.5) burst(z.x + rnd(-70, 70), z.y - rnd(20, 160), Math.random() < 0.5 ? '#ff8a2a' : '#ffd34d', 1, 120, -100);
    }
  };

  // ======================================================================
  //  HẠ GỤC
  // ======================================================================
  V.kill = (z) => {
    if (!z.noDrop) elderCount('boss');
    z.dead = true; z.deadT = 0; z.aggro = false; z.act = null; z.jz = 0;
    bossDeaths.set(z.bossKey, gameTime);
    bossSaved.delete(z.bossKey);
    balls = []; spikes = []; rocks = []; dragons = [];
    blasts.push({ k: 'ring', x: z.x, y: z.y + 6, r: 340, t: 0, life: 0.8 });
    burst(z.x, z.y - 80, '#ff8a2a', 40, 280, 200);
    shake = Math.max(shake, 1);
    say('Đã hạ ' + V.nameOf(z) + '!');
    if (z.noDrop) return;
    score += 150;
    if (!swordBonus) { // lần đầu hạ boss (bất kỳ boss nào): kiếm sắt mạnh thêm
      swordBonus = BOSS_SWORD_BONUS;
      floaters.push({ x: z.x, y: z.y - 230, text: 'Kiếm sắt +' + BOSS_SWORD_BONUS + ' sát thương!', life: 3, color: '#9fd6ff' });
      say('Phần thưởng: Kiếm sắt +' + BOSS_SWORD_BONUS + ' sát thương!');
    }
    const drop = (id, n) => { for (let i = 0; i < n; i++) spawnLoot(id, 1, z.x + rnd(-45, 45), z.y + rnd(-20, 20)); };
    drop(z.ice ? 'icecrystal' : 'magma', 8 + Math.floor(Math.random() * 5));
    if (!z.ice) drop('sulfur', 3 + Math.floor(Math.random() * 3));
    drop('emerald', 12 + Math.floor(Math.random() * 7));
    drop('diamond', 3 + Math.floor(Math.random() * 3));
    dropLegendChest(z);
    chests[chests.length - 1].volc = true; // rương lửa: mở ra có Giấy Lửa (đảo băng: Giấy Băng)
    chests[chests.length - 1].ice = !!z.ice;
  };

  // ======================================================================
  //  VẼ
  // ======================================================================
  // Vòng đỏ báo trước (elip dẹt): p = 0..1 mức "sắp nổ"
  function warnRing(sx, sy, r, p) {
    ctx.save();
    ctx.translate(sx, sy); ctx.scale(1, C.flat);
    ctx.fillStyle = 'rgba(255,40,10,' + (0.1 + 0.22 * p).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,30,' + (0.55 + 0.4 * Math.sin(gameTime * 14)).toFixed(3) + ')'; ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -gameTime * 30;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,200,80,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * (1 - p), 0, Math.PI * 2); ctx.stroke(); // vòng thu hẹp: khép lại là nổ
    ctx.restore();
  }

  // Dưới mọi vật thể: vũng lửa + mọi vòng báo trước
  V.drawGround = (camX, camY) => {
    if (layer !== 0) return;
    for (const z of zones) {
      const sx = z.x - camX, sy = z.y - camY;
      if (sx < -z.r - 20 || sy < -z.r || sx > canvas.width + z.r + 20 || sy > canvas.height + z.r) continue;
      const a = Math.min(1, (z.life - z.age) / 1.2) * Math.min(1, z.age / 0.2), pulse = 0.88 + 0.12 * Math.sin(gameTime * 6 + z.ph);
      ctx.save();
      ctx.translate(sx, sy); ctx.scale(1, C.flat);
      const g = ctx.createRadialGradient(0, 0, z.r * 0.05, 0, 0, z.r);
      g.addColorStop(0, 'rgba(255,225,110,' + (0.9 * a * pulse).toFixed(3) + ')');
      g.addColorStop(0.4, 'rgba(255,110,25,' + (0.8 * a * pulse).toFixed(3) + ')');
      g.addColorStop(0.8, 'rgba(200,35,10,' + (0.6 * a).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(120,10,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, z.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const s of spikes) if (s.t >= 0 && !s.done) warnRing(s.x - camX, s.y - camY, s.r, s.t / C.erupt.delay);
    for (const m of rocks) warnRing(m.x - camX, m.y - camY, C.meteor.r, m.t / C.meteor.fall);
    for (const b of blasts) {
      if (b.k !== 'ring') continue;
      const p = b.t / b.life, R = b.r * (0.2 + p * 0.8);
      ctx.save();
      ctx.translate(b.x - camX, b.y - camY + 4); ctx.scale(1, C.flat);
      ctx.strokeStyle = 'rgba(255,190,90,' + (0.85 * (1 - p)).toFixed(3) + ')'; ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,90,30,' + (0.6 * (1 - p)).toFixed(3) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // báo trước của chính boss: dậm đất + dải đường bay của hỏa long
    for (const z of zombies) {
      if (!z.volc || z.dead || !z.act) continue;
      const A = z.act, sx = z.x - camX, sy = z.y - camY + 6;
      if (A.n === 'slam' && !A.hit) warnRing(sx, sy, C.slam.R, Math.min(1, A.t / C.slam.wind));
      else if (A.n === 'dragon' && A.ang !== undefined && !A.hit) {
        const D = C.dragon, ex = sx + Math.cos(A.ang) * D.range, ey = sy + Math.sin(A.ang) * D.range;
        const nx = -Math.sin(A.ang) * D.width, ny = Math.cos(A.ang) * D.width, p = Math.min(1, A.t / D.wind);
        ctx.fillStyle = 'rgba(255,40,10,' + (0.12 + 0.2 * p).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(sx + nx, sy + ny); ctx.lineTo(ex + nx, ey + ny); ctx.lineTo(ex - nx, ey - ny); ctx.lineTo(sx - nx, sy - ny); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,90,40,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  };

  // Trên không: đạn, thiên thạch đang rơi, trụ lửa, rồng, vụ nổ
  V.drawAir = (camX, camY) => {
    if (layer !== 0) return;
    for (const s of spikes) {
      if (!s.done) continue;
      const p = (s.t - C.erupt.delay) / 0.75, f = p < 0.3 ? 0 : p < 0.65 ? 1 : 2;
      ctx.globalAlpha = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      if (fxIce && iceSheet) { const fr = FRI.erupt[f], of = ctx.filter; ctx.filter = 'none'; blit(fr, s.x - camX, s.y - camY + 14, s.r * 2.2 / fr[2] * 0.95, false, 0, iceSheet); ctx.filter = of; }
      else blit(FR.erupt[f], s.x - camX, s.y - camY + 14, s.r * 2.2 / FR.erupt[f][2] * 1.15);
      ctx.globalAlpha = 1;
    }
    for (const b of blasts) {
      if (b.k === 'impact') {
        const f = b.t < b.life * 0.5 ? 0 : 1, s = b.r * 2.4 / FR.impact[f][2];
        ctx.globalAlpha = b.t > b.life * 0.7 ? 1 - (b.t - b.life * 0.7) / (b.life * 0.3) : 1;
        if (fxIce && iceSheet) { const fr = FRI.impact[f], of = ctx.filter; ctx.filter = 'none'; blit(fr, b.x - camX, b.y - camY + 12, b.r * 2.4 / fr[2], false, 0, iceSheet); ctx.filter = of; }
        else blit(FR.impact[f], b.x - camX, b.y - camY + 12, s);
        ctx.globalAlpha = 1;
      } else if (b.k === 'puff') {
        ctx.fillStyle = 'rgba(255,180,60,' + (0.7 * (1 - b.t / b.life)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(b.x - camX, b.y - camY - 46, 24 + 40 * (b.t / b.life), 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const m of rocks) { // thiên thạch rơi từ trên trời xuống, chéo nhẹ
      const p = m.t / C.meteor.fall, h = (1 - p) * (1 - p) * 520 + 20;
      const sx = m.x - camX + (1 - p) * 90, sy = m.y - camY - h;
      ctx.fillStyle = (fxIce ? 'rgba(150,220,255,' : 'rgba(255,120,30,') + (0.5 * p).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, 22 + 8 * p, 0, Math.PI * 2); ctx.fill(); // quầng lửa / quầng giá
      if (fxIce && shardImg) { // Bão Tuyết: mũi băng cắm từ trên trời xuống
        const w = shardImg.width * 0.7, h = shardImg.height * 0.7, of = ctx.filter;
        ctx.filter = 'none'; ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 2 + 0.17);
        ctx.drawImage(shardImg, -w * 0.75, -h / 2, w, h); ctx.restore(); ctx.filter = of;
      } else blit(FR.meteorRock[1], sx, sy + 26, 1.5, false, m.spin);
    }
    for (const b of balls) {
      const sx = b.x - camX, sy = b.y - camY;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx, sy + 6, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
      if (b.ice && shardImg) { // Băng Tiễn: mũi băng, sprite quay mặt sang phải; xoay theo hướng bay
        const w = shardImg.width * 0.55, h = shardImg.height * 0.55, of = ctx.filter;
        ctx.filter = 'none'; ctx.save(); ctx.translate(sx, sy - 62); ctx.rotate(b.a);
        ctx.drawImage(shardImg, -w * 0.75, -h / 2, w, h); ctx.restore(); ctx.filter = of;
        continue;
      }
      const f = b.t < 0.12 ? 0 : b.t < 0.24 ? 1 : 2 + (Math.floor(b.t * 12) % 3);
      blit(FR.fb[f], sx, sy - 62, 0.7, false, b.a); // sprite quay mặt sang phải; xoay theo hướng bay
    }
    for (const d of dragons) {
      const sx = d.x - camX, sy = d.y - camY, f = Math.floor(d.t * 9) % 3;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx, sy + 6, 120, 18, 0, 0, Math.PI * 2); ctx.fill();
      blit(FR.dragon[f], sx, sy + 16, 0.85, Math.cos(d.ang) < 0);
    }
  };

  // Ban đêm: boss, đạn, vũng lửa toả sáng
  V.lights = (light, camX, camY) => {
    if (layer !== 0) return;
    for (const z of zombies) if (z.volc && !z.dead) light(z.x - camX, z.y - camY - 90, 230, 0.9, 0.4);
    for (const b of balls) light(b.x - camX, b.y - camY - 62, 140, 0.9, 0.3);
    for (const d of dragons) light(d.x - camX, d.y - camY - 60, 240, 0.95, 0.3);
    for (const s of spikes) if (s.done) light(s.x - camX, s.y - camY - 30, 200, 0.9, 0.3);
    for (const z of zones) light(z.x - camX, z.y - camY, z.r * 2, 0.7 * Math.min(1, (z.life - z.age) / 1.2), 0.3);
  };

  // Vẽ rương lửa (gọi từ drawChest của survival.js); (sx, sy) là tâm ô rương
  V.drawChest = (c, sx, sy) => {
    const ice = !!c.ice, img = ice ? iceChestImg : chestImg;
    if (!img) return;
    const fx = typeof c.fx === 'number' ? c.fx : -1;
    const f = fx < 0 ? 0 : fx < 0.35 ? 1 : fx < 0.7 ? 2 : 3;
    const [x, y, w, h] = (ice ? CHI : CH)[f], s = ice ? 0.4 : 0.32;
    const glow = 0.2 + 0.1 * Math.sin(c.t * 4);
    ctx.fillStyle = (ice ? 'rgba(120,200,255,' : 'rgba(255,140,40,') + (fx < 0 ? glow : 0.35).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(sx, sy + 8, 46, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 14, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
    const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, w, h, Math.round(sx - w * s / 2), Math.round(sy + 18 - h * s), Math.round(w * s), Math.round(h * s));
    ctx.imageSmoothingEnabled = sm;
  };

  // Băng Kính của boss: khối pha lê lục giác bao quanh thân, nhấp nháy khi sắp hết
  function drawShield(cx, cy, left) {
    const a = Math.min(1, left / 0.8) * (left < 1.5 ? 0.6 + 0.4 * Math.sin(gameTime * 20) : 1), R = 120;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 1.1);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const t = Math.PI / 6 + i * Math.PI / 3 + gameTime * 0.3; ctx.lineTo(Math.cos(t) * R, Math.sin(t) * R); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(150,220,255,' + (0.16 * a).toFixed(3) + ')'; ctx.fill();
    ctx.strokeStyle = 'rgba(232,248,255,' + (0.85 * a).toFixed(3) + ')'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = 'rgba(106,200,255,' + (0.6 * a).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  // Vẽ boss (gọi từ drawBoss của survival.js)
  V.draw = (z, camX, camY) => {
    const sx = Math.round(z.x - camX), sy = Math.round(z.y - camY), S = C.scale;
    const rage = rageOf(z), A = z.act;
    const ICE = !!z.ice && !!iceSheet, F = ICE ? FRI : FR, IMG = ICE ? iceSheet : null; // rồng băng dùng bảng ảnh riêng
    const fade = z.dead ? Math.max(0, 1 - Math.max(0, z.deadT - 3.5) / 1.4) : 1;
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 12, (z.dead ? 110 : 84) * S / 1.9, 16, 0, 0, Math.PI * 2); ctx.fill();
    if (rage && !z.dead) { // nổi giận: quầng lửa dưới chân
      ctx.fillStyle = (ICE ? 'rgba(110,190,255,' : 'rgba(255,110,40,') + (0.16 + 0.07 * Math.sin(z.t * 7)).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(sx, sy + 12, 108 * S / 1.9, 24, 0, 0, Math.PI * 2); ctx.fill();
    }

    let f = F.walk[0], sc = S, bob = 0;
    if (z.dead) f = ICE ? F.dead[z.deadT < 0.5 ? 0 : z.deadT < 1.1 ? 1 : z.deadT < 1.8 ? 2 : 3] : F.slam[0];
    else if (A) {
      if (A.n === 'slam') f = F.slam[Math.min(5, A.t < C.slam.wind ? Math.floor(A.t / C.slam.wind * 4) : 4 + (A.t > C.slam.wind + 0.2 ? 1 : 0))];
      else if (A.n === 'ball') f = F.castFb[0];
      else if (A.n === 'erupt') f = A.t < C.erupt.wind ? F.windE[0] : F.eruptBoss[0];
      else if (A.n === 'meteor') f = F.castM[Math.min(2, Math.floor(A.t / C.meteor.wind * 3))];
      else if (A.n === 'dragon') f = F.castD[A.t < 0.55 ? 0 : 1];
      else if (A.n === 'mirror') f = F.windE[0];
      else if (A.n === 'roar') { f = F.roar[0]; sc = S * 0.69; } // tờ gốc vẽ pose gầm to hơn các khung khác
    } else if (z.hurtT > 0) f = F.walk[2];
    else if (z.moving) f = F.walk[Math.floor(z.t * (z.running ? 9 : 6)) % 6];
    else bob = Math.sin(z.t * 3) * 2;

    const hot = !z.dead && (z.flash > 0 || z.hurtT > 0.15);
    if (hot) ctx.filter = 'brightness(1.7) saturate(0.7)'; // chớp sáng khi trúng đòn (trình duyệt không hỗ trợ thì bỏ qua)
    const shiver = A && (A.n === 'slam' || A.n === 'meteor') && A.t < (A.n === 'slam' ? C.slam.wind : C.meteor.wind) ? (Math.random() - 0.5) * 3 : 0; // run người khi gồng
    blit(f, sx + shiver, sy + 12 + bob, sc, z.face < 0, 0, IMG);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    if (z.shieldT > 0 && !z.dead) drawShield(sx, sy - 78, z.shieldT);

    if (!z.dead) { // thanh máu + tên trên đầu
      const ratio = Math.max(0, z.hp) / z.maxHp;
      const w = 130, x = sx - w / 2, y = sy + 12 - 150 * S - 24;
      ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, 11);
      ctx.fillStyle = ICE ? '#1c3a7a' : '#7a1c1c'; ctx.fillRect(x, y, w, 7);
      ctx.fillStyle = hpColor(ratio); ctx.fillRect(x, y, w * ratio, 7);
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      shadowText('☠ ' + V.nameOf(z) + (rage ? ' (nổi giận)' : ''), sx, y - 14, ICE ? '#bfe6ff' : '#ffb4a0');
      ctx.font = 'bold 10px sans-serif';
      shadowText(Math.ceil(Math.max(0, z.hp)) + '/' + z.maxHp, sx, y - 3, '#fff');
    }
  };

  window.VolcBoss = V;
  // Boss băng: vẽ lại bằng bộ lọc đổi màu xanh (vòng báo trước, đạn, rương). Sprite boss tự đặt bộ lọc trong V.draw
  const tint = (fn, isIce) => function (...a) {
    if (!isIce.apply(null, a)) return fn.apply(this, a);
    ctx.save(); ctx.filter = ICEF;
    try { return fn.apply(this, a); } finally { ctx.restore(); }
  };
  V.drawGround = tint(V.drawGround, () => fxIce);
  V.drawAir = tint(V.drawAir, () => fxIce);
  return V;
})();
