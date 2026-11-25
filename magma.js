// ======================================================================
//  magma.js: SLIME LỬA + TINH THỂ MAGMA + SỰ KIỆN NÚI LỬA PHUN TRÀO
//  - Slime Lửa: sống trên đảo núi lửa (volcano.js). Nó nằm trong mảng `spiders` của survival.js (cờ s.slime = true)
//    nên được đánh / bắn / phép / chiến binh xử lý y như nhện; các điểm rẽ nhánh: updateSpider / drawSpider / killSpider / hitSpider.
//    Hạ gục -> rớt Tinh thể Magma (item 'magma'). Miễn nhiễm lửa + dung nham (cờ m.fire).
//  - Sự kiện: cứ MỖI 5 PHÚT (300 giây chơi, chỉ đếm khi người chơi ở gần một đảo núi lửa) núi lửa phun trào:
//      cảnh báo + rung màn hình -> bắn bom dung nham lên trời, rơi xuống đảo (có vòng đỏ báo trước chỗ rơi)
//      -> mỗi quả bom để lại VÙNG ĐỎ trên mặt đất ~16 giây: đứng trong đó mất máu + bốc cháy (như dung nham), quái cũng bị thiêu.
//  - Thông số chỉnh ở SL / ER bên dưới.  Lệnh thử trong cheat.js: /phun  ·  /slime [n]
//  File này nạp SAU survival.js (xem survival.html).
//  Muốn gỡ: xoá file này + thẻ <script> + các dòng có chữ "Magma" / "magma" / "s.slime" / "m.fire" trong survival.js, cheat.js.
// ======================================================================
const Magma = (() => {
  const M = {};

  // ---------- Thông số ----------
  const SL = {
    hp: 26, walk: 38, run: 98,        // máu · tốc độ đi lang thang · tốc độ đuổi (px/giây, đã nhân nhịp nhảy)
    dmg: 9, burn: 3.5,                // sát thương một cú húc · giây bốc cháy kèm theo
    detect: 300, lose: 560, hit: 40,  // tầm phát hiện · tầm bỏ cuộc · tầm húc
    atkTime: 0.5, atkCd: 1.4,
    cap: 6,                           // số slime tối đa cùng lúc trên một đảo
    dropMin: 1, dropBonus: 0.35, // luôn rớt 1 tinh thể, 35% có thêm viên thứ hai
    score: 25,
  };
  const ER = {
    every: 300,        // giây giữa hai lần phun trào
    near: 62,          // ô: chỉ đếm giờ khi người chơi cách tâm đảo không quá từng này
    warn: 4,           // giây rung / báo trước khi bắn bom
    dur: 20,           // giây bắn bom (phun trào kéo dài 20 giây)
    gap: 0.38,         // giây giữa hai quả bom
    flight: 1.5,       // giây bom bay (cũng là thời gian vòng đỏ báo trước)
    rMin: 60, rMax: 92, // bán kính vùng đỏ (px)
    life: 16,          // giây vùng đỏ tồn tại
    dmg: 18,           // sát thương mỗi lần đứng trong vùng đỏ (~1 giây/lần)
    pierce: 0.6,       // dung nham xuyên 60% giáp (mặc giáp xịn vẫn đau)
    burn: 5,           // giây bốc cháy sau khi dính vùng đỏ (xuống nước / gặp mưa thì tắt)
    impact: 28,        // sát thương thêm nếu bom rơi trúng người
    maxZones: 48,
    aimPlayer: 0.6,   // xác suất một quả bom nhắm quanh người chơi (nếu đang ở trên đảo)
  };
  const SH = { W: 192, H: 128, K: 0.42, FOOT: 112 }; // ô sprite slime_fire.webp (4x4), tỉ lệ vẽ, hàng chân trong ô
  const CRATER_UP = 231; // miệng núi cao hơn chân núi (đáy sprite) ~ chừng này px (khớp drawVolcano)
  const TAU2 = Math.PI * 2;

  // ---------- Ảnh ----------
  let slimeImg = null, crystalImg = null, slimeIce = null;
  loadImage('assets/fire/slime_fire.webp').then((img) => { slimeImg = img; });
  loadImage('assets/items/magma_crystal.webp').then((img) => { crystalImg = img; }); // 11x19
  // Sói Băng Ma Thuật (quái đảo băng): bảng ảnh assets/ice/ice_wolf.webp, mọi khung quay mặt sang PHẢI; [x, y, rộng, cao, neo x]
  let wolfImg = null;
  loadImage('assets/ice/ice_wolf.webp').then((img) => { wolfImg = img; });
  const WF = {
    stand: [0, 25, 56, 45, 28], run: [58, 24, 56, 46, 28], slash: [116, 12, 102, 58, 28], back: [220, 24, 54, 46, 27],
    hurt: [276, 24, 35, 46, 17], fly: [313, 30, 42, 40, 21], lie: [357, 42, 54, 28, 27], burst: [413, 9, 49, 61, 24],
  };
  const WK = 1.55; // tỉ lệ vẽ sói
  let sulfurImg = null;
  loadImage('assets/items/sulfur.webp').then((img) => { sulfurImg = img; });
  M.img = () => crystalImg;
  M.sulfurImg = () => sulfurImg;

  // ---------- Trạng thái ----------
  let timer = ER.every, warned30 = false;
  let E = null;               // sự kiện đang chạy: { v, t, next }
  let bombs = [], zones = [];
  let isl = null, islT = 0;   // đảo gần nhất (cache 4 lần/giây)
  let spawnT = 1, mobT = 0;
  let rumbleMsg = false;

  M.reset = () => { timer = ER.every; warned30 = false; E = null; bombs = []; zones = []; isl = null; islT = 0; spawnT = 1; };
  M.clear = () => { bombs = []; };
  // Lệnh thử: tua đồng hồ tới 4:50 (còn 10 giây là phun)
  M.skip = () => { if (E) return 'Núi lửa đang phun rồi'; timer = Math.min(timer, 10); return 'Đã tua tới 4:50, còn 10 giây là phun' + (isl ? '' : ' (đồng hồ chỉ chạy khi ở gần đảo núi lửa)'); };
  M.timeLeft = () => (E ? 0 : timer);
  M.erupting = () => !!E;

  function nearestIsland(maxTiles) {
    const n = nearestVolcano(player.x / TILE, player.y / TILE);
    return n && n.dist <= maxTiles ? n.v : null;
  }
  const onIsland = (v) => !!v && Math.hypot(player.x / TILE - v.x, player.y / TILE - v.y) < VOLC.coast + 3;

  // ======================================================================
  //  SLIME LỬA
  // ======================================================================
  function newSlime(x, y, ice) {
    return {
      slime: true, fire: !ice, ice: !!ice,
      x, y, hp: ice ? 34 : SL.hp, maxHp: ice ? 34 : SL.hp,
      face: Math.random() < 0.5 ? 1 : -1, t: Math.random() * 5, aggro: false,
      atkCd: 0, atkT: 0, atkHit: false, hurtT: 0, dead: false, deadT: 0,
      kx: 0, ky: 0, wanderT: Math.random() * 3, wx: x, wy: y,
      stuck: 0, sideT: 0, sideDir: 1, escal: 0, freeT: 0, moving: false, hop: Math.random() * 6,
    };
  }

  function spawnSlime(v) {
    const minD = Math.min(Math.hypot(canvas.width, canvas.height) / 2 + 40, 700);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * TAU2, d = 6.5 + Math.random() * 14.5; // vùng tro quanh núi, trong vòng đá ngoài
      const tx = Math.round(v.x + Math.cos(a) * d), ty = Math.round(v.y + Math.sin(a) * d);
      if (!volcanoGround(tx, ty) || getTile(tx, ty) !== GRASS) continue;
      const p = tileCenter(tx, ty);
      if (Math.hypot(p.x - player.x, p.y - player.y) < minD) continue;
      if (collides(p.x, p.y, 12)) continue;
      spiders.push(newSlime(p.x, p.y, v.ice));
      return true;
    }
    return false;
  }

  // Lệnh thử: gọi n slime ngay cạnh người chơi
  M.spawnNear = (n = 1) => {
    let k = 0;
    const nv = nearestVolcano(player.x / TILE, player.y / TILE), ice = !!(nv && nv.dist < 60 && nv.v.ice);
    for (let i = 0; i < 40 && k < n; i++) {
      const a = Math.random() * TAU2, d = 90 + Math.random() * 90;
      const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
      if (collides(x, y, 12)) continue;
      spiders.push(newSlime(x, y, ice)); k++;
    }
    return k;
  };

  // AI (gọi từ updateSpider của survival.js khi s.slime): nhảy lò cò, phát hiện -> đuổi -> húc
  M.updateSlime = (s, dt) => {
    s.t += dt;
    s.atkCd = Math.max(0, s.atkCd - dt);
    s.hurtT = Math.max(0, s.hurtT - dt);
    const dxp = player.x - s.x, dyp = player.y - s.y, dist = Math.hypot(dxp, dyp);
    if (Math.abs(s.kx) + Math.abs(s.ky) > 5) { // bị đánh văng
      moveZombie(s, s.kx * dt, s.ky * dt);
      const f = Math.max(0, 1 - 9 * dt);
      s.kx *= f; s.ky *= f;
    }
    if (dist < SL.detect && lineClear(s.x, s.y - 6, player.x, player.y - 6)) { s.aggro = true; s.lostT = 0; }
    else if (s.aggro) {
      s.lostT = (s.lostT || 0) + dt;
      if (s.lostT > Z_LOSE_SIGHT || dist > SL.lose) { s.aggro = false; s.lostT = 0; }
    }
    s.moving = false;
    if (s.hurtT > 0) return;
    if (s.atkT > 0) { // đang húc: trúng ở giữa hoạt ảnh
      s.atkT -= dt;
      if (!s.atkHit && s.atkT <= SL.atkTime / 2) {
        s.atkHit = true;
        if (Math.hypot(player.x - s.x, player.y - s.y) < SL.hit + 14 && lineClear(s.x, s.y, player.x, player.y)) {
          hurt(SL.dmg);
          if (s.ice) burst(player.x, player.y - 16, '#bfeaff', 10, 140, -60);
          else { burnT = Math.max(burnT, SL.burn); burst(player.x, player.y - 16, '#ff8a2a', 8, 130, -80); }
        }
      }
      return;
    }
    const hopMul = s.ice ? () => 1.35 : (ph) => 0.25 + 1.15 * Math.max(0, Math.sin(ph)); // slime trườn theo nhịp nhảy · sói chạy đều
    if (s.aggro) {
      if (Math.abs(dxp) > 3) s.face = Math.sign(dxp);
      if (dist < SL.hit && lineClear(s.x, s.y, player.x, player.y)) {
        if (s.atkCd <= 0) { s.atkT = SL.atkTime; s.atkHit = false; s.atkCd = SL.atkCd; }
      } else {
        s.hop += dt * 9;
        zombieWalk(s, player.x, player.y, SL.run * hopMul(s.hop), dt);
      }
      return;
    }
    s.wanderT -= dt;
    if (s.wanderT <= 0) {
      s.wanderT = 2 + Math.random() * 3;
      const a = Math.random() * TAU2, d = 30 + Math.random() * 100;
      s.wx = s.x + Math.cos(a) * d; s.wy = s.y + Math.sin(a) * d;
      if (Math.random() < 0.35) { s.wx = s.x; s.wy = s.y; }
    }
    s.hop += dt * 5;
    zombieWalk(s, s.wx, s.wy, SL.walk * hopMul(s.hop), dt);
  };

  // Rớt tinh thể (gọi từ killSpider)
  M.onKill = (s) => {
    score += SL.score;
    burst(s.x, s.y - 14, s.ice ? '#8fdcff' : '#ff8a2a', 16, 190, -40);
    burst(s.x, s.y - 14, s.ice ? '#e8f8ff' : '#ffd34d', 8, 150, 300);
    if (s.noDrop) return;
    const n = SL.dropMin + (Math.random() < SL.dropBonus ? 1 : 0);
    for (let i = 0; i < n; i++) spawnLoot(s.ice ? 'icecrystal' : 'magma', 1, s.x, s.y);
  };

  // Vẽ (gọi từ drawSpider)
  function wf(f, x, y, flip, k = WK, alpha = 1) { // vẽ một khung sói, neo giữa-đáy tại (x, y)
    if (!wolfImg) return;
    const [fx, fy, fw, fh, ax] = f, a0 = ctx.globalAlpha;
    ctx.save(); ctx.globalAlpha = a0 * alpha; ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(wolfImg, fx, fy, fw, fh, -ax * k, -fh * k, fw * k, fh * k);
    ctx.imageSmoothingEnabled = sm; ctx.restore();
  }
  function drawWolf(s, camX, camY) {
    const sx = Math.round(s.x - camX), sy = Math.round(s.y - camY), flip = s.face < 0;
    const fade = s.dead ? Math.max(0, 1 - Math.max(0, s.deadT - 0.9) / 0.9) : 1;
    ctx.save(); ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 26, 7, 0, 0, TAU2); ctx.fill();
    const fy = sy + 9;
    if (s.dead) {
      wf(s.deadT < 0.22 ? WF.fly : WF.lie, sx, fy, flip);
      if (s.deadT < 0.9) wf(WF.burst, sx, fy + 4, false, 1.1, Math.max(0, 1 - s.deadT / 0.9)); // trụ băng nổ ra khi chết
    } else if (s.atkT > 0) { // vồ: thủ thế -> lao tới kèm vệt chém băng -> lùi lại
      const p = 1 - s.atkT / SL.atkTime, dir = flip ? -1 : 1;
      if (p < 0.35) wf(WF.stand, sx - dir * 4 * p, fy, flip);
      else if (p < 0.75) wf(WF.slash, sx + dir * 12, fy - 2, flip);
      else wf(WF.back, sx + dir * 6, fy, flip);
    } else if (s.hurtT > 0) {
      wf(WF.hurt, sx, fy, flip);
    } else {
      const bob = s.moving ? Math.abs(Math.sin(s.t * (s.aggro ? 14 : 8))) * (s.aggro ? 4 : 2.5) : Math.sin(s.t * 2.5) * 1;
      const f = s.aggro && s.moving ? ((Math.floor(s.t * 9) & 1) ? WF.run : WF.stand) : s.moving ? ((Math.floor(s.t * 5) & 1) ? WF.back : WF.stand) : WF.stand;
      wf(f, sx, fy - bob, flip);
    }
    ctx.restore();
    if (!s.dead && s.hp < s.maxHp) { // thanh máu nhỏ khi đã bị thương
      const w = 36, r = Math.max(0, s.hp / s.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - w / 2 - 1, sy - 58, w + 2, 6);
      ctx.fillStyle = '#4fc3ff'; ctx.fillRect(sx - w / 2, sy - 57, w * r, 4);
    }
  }
  M.drawSlime = (s, camX, camY) => {
    if (s.ice) { drawWolf(s, camX, camY); return; }
    const sx = Math.round(s.x - camX), sy = Math.round(s.y - camY);
    const fade = s.dead ? Math.max(0, 1 - Math.max(0, s.deadT - 0.6) / 0.9) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 8, 24, 7, 0, 0, TAU2); ctx.fill();

    // chọn khung: đi chơi = hàng 1-2 (lấp lánh) · đang đuổi / húc = hàng 3 (mắt giận + lửa)
    let idx;
    if (s.dead) idx = 12;
    else if (s.atkT > 0) idx = 10 + (Math.floor(s.t * 10) & 1);
    else if (s.aggro) idx = 8 + (Math.floor(s.t * 8) & 3);
    else idx = Math.floor(s.t * 5) & 7;
    const col = idx & 3, row = idx >> 2;

    // nảy: kéo giãn khi bật lên, dẹt khi tiếp đất
    const sn = Math.sin(s.hop);
    let sxs = 1, sys = 1, lift = 0;
    if (s.moving) { lift = Math.abs(sn) * (s.aggro ? 11 : 7); sys = 1 + 0.1 * Math.abs(sn) - 0.06 * (1 - Math.abs(sn)); sxs = 2 - sys - 0.05; }
    else { sys = 1 + Math.sin(s.t * 3) * 0.03; sxs = 2 - sys; }
    if (s.atkT > 0) { const u = Math.sin((1 - s.atkT / SL.atkTime) * Math.PI); sxs *= 1 + u * 0.22; sys *= 1 - u * 0.12; lift += u * 6; }
    if (s.dead) { const u = Math.min(1, s.deadT / 0.35); sys = 1 - u * 0.65; sxs = 1 + u * 0.3; lift = 0; }

    const dw = SH.W * SH.K, dh = SH.H * SH.K, foot = SH.FOOT * SH.K;
    ctx.translate(sx, sy + 6 - lift);
    ctx.scale(sxs, sys);
    if (slimeImg) {
      if (s.ice && !slimeIce) slimeIce = tintCanvas(slimeImg); // slime băng: ảnh đã đổi sang màu xanh (làm một lần)
      if (s.hurtT > 0) ctx.filter = 'brightness(2.4) saturate(0.6)';
      ctx.drawImage(s.ice ? slimeIce : slimeImg, col * SH.W, row * SH.H, SH.W, SH.H, -dw / 2, -foot, dw, dh);
      ctx.filter = 'none';
    } else { // chưa tải xong ảnh
      ctx.fillStyle = s.hurtT > 0 ? '#ffe2b0' : '#ff9a1a';
      ctx.beginPath(); ctx.ellipse(0, -16, 24, 18, 0, 0, TAU2); ctx.fill();
    }
    ctx.restore();

    if (!s.dead && s.hp < s.maxHp) { // thanh máu nhỏ khi đã bị thương
      const w = 34, r = Math.max(0, s.hp / s.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - w / 2 - 1, sy - 48, w + 2, 6);
      ctx.fillStyle = s.ice ? '#4fc3ff' : '#ff7a1a'; ctx.fillRect(sx - w / 2, sy - 47, w * r, 4);
    }
  };

  // ======================================================================
  //  PHUN TRÀO
  // ======================================================================
  const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const craterPos = (v) => ({ x: (v.x + 0.5) * TILE, y: (v.y + 2) * TILE - CRATER_UP });

  M.trigger = () => { // lệnh thử: phun ngay ở đảo gần nhất
    if (layer !== 0) return 'Hãy ra ngoài trời';
    const v = nearestIsland(ER.near + 20);
    if (!v) return 'Không có đảo núi lửa nào gần đây (gõ /tp nuilua)';
    if (v.ice) return 'Đây là đảo băng, không phun trào (gõ /tp nuilua)';
    if (E) return 'Núi lửa đang phun rồi';
    startEruption(v);
    return 'Núi lửa phun trào!';
  };

  function startEruption(v) {
    E = { v, t: 0, next: 0 };
    timer = ER.every; warned30 = false; rumbleMsg = false;
    say('⚠ Núi lửa sắp phun trào! Tránh xa các vùng đỏ trên mặt đất!');
    shake = Math.max(shake, 0.5);
  }

  function pickTarget(v) {
    const on = onIsland(v);
    for (let i = 0; i < 25; i++) {
      let x, y;
      if (on && Math.random() < ER.aimPlayer) { // nhắm quanh người chơi (vẫn có vòng đỏ báo trước để né)
        const a = Math.random() * TAU2, d = Math.random() * 140;
        x = player.x + Math.cos(a) * d; y = player.y + 6 + Math.sin(a) * d * 0.8;
      } else {
        const a = Math.random() * TAU2, d = (5.5 + Math.random() * 17) * TILE;
        x = (v.x + 0.5) * TILE + Math.cos(a) * d; y = (v.y + 0.5) * TILE + Math.sin(a) * d;
      }
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (volcanoGround(tx, ty) && !isSolid(tx, ty)) return { x, y };
    }
    return null;
  }

  function throwBomb(v) {
    const p = pickTarget(v);
    if (!p) return;
    const c = craterPos(v);
    bombs.push({ sx: c.x + (Math.random() - 0.5) * 50, sy: c.y, tx: p.x, ty: p.y, t: 0, dur: ER.flight + Math.random() * 0.35, r: ER.rMin + Math.random() * (ER.rMax - ER.rMin) });
    burst(c.x, c.y, '#ffb030', 6, 160, 320);
  }

  const inZone = (z, px, py) => { const dx = (px - z.x) / z.r, dy = (py - z.y) / (z.r * 0.75); return dx * dx + dy * dy < 1; };

  function landBomb(b) {
    if (zones.length >= ER.maxZones) zones.shift();
    zones.push({ x: b.tx, y: b.ty, r: b.r, age: 0, ph: Math.random() * 6 });
    burst(b.tx, b.ty - 6, '#ff7a1a', 14, 200, 380);
    burst(b.tx, b.ty - 6, '#ffd34d', 6, 150, 300);
    shake = Math.max(shake, 0.3);
    if (layer === 0 && inZone({ x: b.tx, y: b.ty, r: b.r * 0.8 }, player.x, player.y + 6)) { // bom rơi trúng người
      hurt(ER.impact, ER.pierce);
      burnT = Math.max(burnT, ER.burn);
      say('Bom dung nham trúng người! Bạn bốc cháy!');
    }
  }

  M.update = (dt) => {
    if (layer !== 0 || deathScreen) return;

    // đảo gần nhất
    islT -= dt;
    if (islT <= 0) { islT = 0.25; isl = nearestIsland(ER.near); }

    // đếm ngược tới lần phun kế (chỉ khi ở gần đảo)
    if (!E && isl && !isl.ice) { // đảo băng không phun trào
      timer -= dt;
      if (!warned30 && timer <= 30) { warned30 = true; say('Núi lửa đang gầm... sắp phun trào trong 30 giây!'); shake = Math.max(shake, 0.2); }
      if (timer <= 0) startEruption(isl);
    }

    // đang phun
    if (E) {
      E.t += dt;
      const c = craterPos(E.v);
      if (E.t < ER.warn) {
        shake = Math.max(shake, 0.15 + 0.2 * (E.t / ER.warn)); // rung ngày một mạnh
        if (Math.random() < 0.5) burst(c.x + (Math.random() - 0.5) * 80, c.y, '#7a6a60', 1, 80, -60);
      } else if (E.t < ER.warn + ER.dur) {
        if (!rumbleMsg) { rumbleMsg = true; say('NÚI LỬA PHUN TRÀO! Bom dung nham đang rơi!'); }
        shake = Math.max(shake, 0.22);
        E.next -= dt;
        while (E.next <= 0) { E.next += ER.gap * (0.7 + Math.random() * 0.6); throwBomb(E.v); }
        if (Math.random() < 0.7) burst(c.x + (Math.random() - 0.5) * 70, c.y, Math.random() < 0.5 ? '#ff8a2a' : '#ffd34d', 2, 220, 420);
      } else if (!bombs.length) {
        E = null;
        say('Núi lửa đã lặng. Vùng đỏ sẽ nguội dần...');
      }
    }

    // bom đang bay
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.t += dt;
      const u = Math.min(1, b.t / b.dur);
      b.x = b.sx + (b.tx - b.sx) * u;
      b.y = b.sy + (b.ty - b.sy) * u - Math.sin(Math.PI * u) * 190;
      if (Math.random() < 0.6) burst(b.x, b.y, Math.random() < 0.5 ? '#ff6a1a' : '#ffd34d', 1, 40, 80);
      if (b.t >= b.dur) { landBomb(b); bombs.splice(i, 1); }
    }

    // vùng đỏ: gây sát thương + thiêu
    mobT -= dt;
    const doMobs = mobT <= 0;
    if (doMobs) mobT = 0.25;
    const px = player.x, py = player.y + 6;
    let mobs = null;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      z.age += dt;
      if (z.age >= ER.life) { zones.splice(i, 1); continue; }
      if (Math.random() < 0.05) burst(z.x + (Math.random() - 0.5) * z.r, z.y - 4, '#ff8a2a', 1, 40, -120);
      if (inZone(z, px, py)) {
        if (burnT <= 0) say('Bạn bốc cháy! Chạy ra khỏi vùng đỏ, xuống nước để dập lửa');
        hurt(ER.dmg, ER.pierce); // hurt() tự giới hạn ~1 lần / giây
        burnT = Math.max(burnT, ER.burn);
      }
      if (doMobs) {
        if (!mobs) mobs = zombies.concat(spiders, animals);
        for (const m of mobs) {
          if (m.dead || m.fire) continue;
          if (inZone(z, m.x, m.y + 6)) m.burnT = Math.max(m.burnT || 0, BALANCE.mine.burnTime);
        }
      }
    }

    // slime sinh ra trên đảo mà người chơi đang đứng
    if (isl && onIsland(isl)) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = 2.5 + Math.random() * 3;
        let alive = 0;
        for (const s of spiders) if (s.slime && !s.dead && Math.hypot(s.x / TILE - isl.x, s.y / TILE - isl.y) < VOLC.coast + 4) alive++;
        if (alive < SL.cap) spawnSlime(isl);
      }
    }
  };

  // ---------- Vẽ ----------
  // Dưới mọi vật thể: vòng đỏ báo trước chỗ bom rơi + vùng đỏ trên mặt đất
  M.drawGround = (camX, camY) => {
    if (layer !== 0) return;
    for (const z of zones) {
      const sx = z.x - camX, sy = z.y - camY;
      if (sx < -z.r - 20 || sy < -z.r || sx > canvas.width + z.r + 20 || sy > canvas.height + z.r) continue;
      const fadeOut = Math.min(1, (ER.life - z.age) / 3), fadeIn = Math.min(1, z.age / 0.25);
      const a = fadeOut * fadeIn, pulse = 0.88 + 0.12 * Math.sin(gameTime * 5 + z.ph);
      ctx.save();
      ctx.translate(sx, sy); ctx.scale(1, 0.75);
      const r = z.r * (0.85 + 0.15 * fadeIn);
      const g = ctx.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
      g.addColorStop(0, 'rgba(255,225,110,' + (0.95 * a * pulse).toFixed(3) + ')');
      g.addColorStop(0.35, 'rgba(255,110,25,' + (0.88 * a * pulse).toFixed(3) + ')');
      g.addColorStop(0.75, 'rgba(210,35,10,' + (0.72 * a).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(120,10,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU2); ctx.fill();
      // viền đỏ rực + bọt dung nham
      ctx.strokeStyle = 'rgba(255,60,20,' + (0.8 * a).toFixed(3) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.93, 0, TAU2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,230,120,' + (0.9 * a).toFixed(3) + ')';
      for (let k = 0; k < 5; k++) {
        const t = gameTime * 0.9 + z.ph + k * 1.7, rr = r * (0.2 + 0.5 * ((Math.sin(t * 1.3 + k) + 1) / 2)), an = t * 0.6 + k * 1.26;
        ctx.beginPath(); ctx.arc(Math.cos(an) * rr, Math.sin(an) * rr, 3 + 2 * Math.sin(t * 3), 0, TAU2); ctx.fill();
      }
      ctx.restore();
    }
    // chỗ bom sắp rơi
    for (const b of bombs) {
      const u = Math.min(1, b.t / b.dur), sx = b.tx - camX, sy = b.ty - camY;
      ctx.save();
      ctx.translate(sx, sy); ctx.scale(1, 0.75);
      ctx.fillStyle = 'rgba(255,40,10,' + (0.08 + 0.2 * u).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,70,30,' + (0.55 + 0.4 * Math.sin(gameTime * 14)).toFixed(3) + ')'; ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -gameTime * 30;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,200,80,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, b.r * (1 - u), 0, TAU2); ctx.stroke(); // vòng thu hẹp: tới khi khép lại là bom chạm đất
      ctx.restore();
    }
  };

  // Trên không: bom dung nham đang bay
  M.drawAir = (camX, camY) => {
    if (layer !== 0) return;
    for (const b of bombs) {
      if (b.x === undefined) continue;
      const u = Math.min(1, b.t / b.dur), sx = b.x - camX, sy = b.y - camY;
      // bóng dưới đất
      const gx = b.sx + (b.tx - b.sx) * u - camX, gy = b.sy + (b.ty - b.sy) * u - camY;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(gx, gy + 8, 10, 4, 0, 0, TAU2); ctx.fill();
      // đuôi lửa
      for (let k = 4; k >= 1; k--) {
        const uu = Math.max(0, u - k * 0.03);
        const tx = b.sx + (b.tx - b.sx) * uu - camX, ty = b.sy + (b.ty - b.sy) * uu - Math.sin(Math.PI * uu) * 190 - camY;
        ctx.fillStyle = 'rgba(255,' + (90 + k * 25) + ',20,' + (0.5 - k * 0.1).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(tx, ty, 11 - k * 1.6, 0, TAU2); ctx.fill();
      }
      ctx.fillStyle = '#d9300a'; ctx.beginPath(); ctx.arc(sx, sy, 13, 0, TAU2); ctx.fill();
      ctx.fillStyle = '#ff8a1e'; ctx.beginPath(); ctx.arc(sx, sy, 9, 0, TAU2); ctx.fill();
      ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(sx - 2, sy - 2, 4.5, 0, TAU2); ctx.fill();
    }
  };

  // Ban đêm: vùng đỏ + bom toả sáng
  M.lights = (light, camX, camY) => {
    if (layer !== 0) return;
    for (const z of zones) {
      const a = Math.min(1, (ER.life - z.age) / 3);
      light(z.x - camX, z.y - camY, z.r * 2.2, 0.8 * a, 0.3);
    }
    for (const b of bombs) if (b.x !== undefined) light(b.x - camX, b.y - camY, 130, 0.85, 0.3);
  };

  // Đồng hồ đếm ngược / cảnh báo (góc trên giữa màn hình) + ánh đỏ khi đang phun
  M.drawHud = (W, H) => {
    if (layer !== 0) return;
    if (E) {
      const p = 0.5 + 0.5 * Math.sin(gameTime * 6);
      ctx.fillStyle = 'rgba(160,20,0,' + (0.07 + 0.07 * p).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (!E && (!isl || isl.ice)) return;
    const txt = E ? (E.t < ER.warn ? 'NÚI LỬA SẮP PHUN!' : 'NÚI LỬA ĐANG PHUN TRÀO!') : 'Núi lửa phun sau ' + fmt(timer);
    ctx.save();
    ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(txt).width) + 34, x = Math.round(W / 2 - w / 2), y = 12;
    const hot = E || timer <= 30;
    ctx.fillStyle = hot ? 'rgba(120,16,0,' + (0.72 + 0.18 * Math.sin(gameTime * 8)).toFixed(2) + ')' : 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(x, y, w, 28, 8); ctx.fill();
    ctx.strokeStyle = hot ? '#ff7a2a' : 'rgba(255,150,60,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    // ngọn lửa nhỏ
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(x + 13, y + 20); ctx.quadraticCurveTo(x + 6, y + 13, x + 12, y + 5); ctx.quadraticCurveTo(x + 13, y + 11, x + 17, y + 9); ctx.quadraticCurveTo(x + 21, y + 15, x + 13, y + 20); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x + 13, y + 16, 2.6, 0, TAU2); ctx.fill();
    ctx.fillStyle = hot ? '#ffe9c4' : '#ffc890';
    ctx.textAlign = 'left'; ctx.fillText(txt, x + 26, y + 15);
    ctx.restore();
  };

  window.Magma = M;
  return M;
})();
