// ======================================================================
// HỆ BĂNG cho Sách Phép: Z Băng Tiễn · X Hàn Vực · C Băng Kính · V Bão Tuyết
// Nhấn Q để đổi hệ theo vòng: Thường → Lửa → Băng → Thường (hoặc bấm thẻ "Hệ Băng" trong Sách Phép).
// Thông số chỉnh trong config.js (BALANCE.witch.skills, các phép có el: 'ice').
// Làm chậm: quái trúng băng có iceT (giây còn lại) + iceMul (hệ số tốc độ; 0 = đóng băng), xử lý trong zombieWalk().
// Muốn gỡ hệ băng: xoá ice.js, thẻ <script> trong survival.html và các dòng "IceMagic" / iceT trong survival.js.
// ======================================================================
const IceMagic = (() => {
  const SP = {};                       // sprite
  ['iceshard', 'spikes'].forEach((n) => loadImage('assets/ice/' + n + '.webp').then((img) => { SP[n] = img; }));

  const I = { mode: false };
  const cd = {};                       // hồi chiêu theo id phép
  let bolts = [], fields = [], zones = [], fx = [];
  let mirrorT = 0, mirrorDur = 1;     // Băng Kính: thời gian còn lại

  const iceSkills = () => WITCH.skills.filter((s) => s.el === 'ice');
  const camOf = () => ({ x: Math.floor(player.x - canvas.width / 2), y: Math.floor(player.y - canvas.height / 2) });
  const aim = () => { const c = camOf(); return { x: mouse.x + c.x, y: mouse.y + c.y + ARROW_H }; }; // điểm trên mặt đất dưới con trỏ
  const clampReach = (t, reach) => { // kéo điểm ngắm về trong tầm với
    const d = Math.hypot(t.x - player.x, t.y - player.y);
    if (d <= reach) return { x: t.x, y: t.y };
    return { x: player.x + (t.x - player.x) * reach / d, y: player.y + (t.y - player.y) * reach / d };
  };

  // ---------- Chế độ & phím ----------
  I.cycle = () => { // Q: Thường → Lửa → Băng → Thường
    if (!witchSt.book) return;
    const fire = window.FireMagic;
    if (fire && fire.mode) {
      fire.mode = false; I.mode = true;
      say('Hệ Băng: Z Băng Tiễn · X Hàn Vực · C Băng Kính · V Bão Tuyết');
    } else if (I.mode) {
      I.mode = false;
      say('Đã chuyển về hệ thường (Z hồi phục · V bước gió · F khiên)');
    } else if (fire) fire.toggle();
    else { I.mode = true; say('Hệ Băng: Z Băng Tiễn · X Hàn Vực · C Băng Kính · V Bão Tuyết'); }
  };
  // Hệ Băng đang bật: Z X C V dành cho phép băng (không mở túi / đào xuống / hồi phục / bước gió)
  I.reserves = (code) => I.mode && witchSt.book && !ui && iceSkills().some((s) => 'Key' + s.key === code);
  I.key = (code) => { // trả về true nếu phím đã được hệ Băng xử lý
    if (!I.reserves(code)) return false;
    const s = iceSkills().find((k) => 'Key' + k.key === code);
    if (!witchSt.learned[s.id]) { say('Chưa học phép "' + s.name + '" — nói chuyện với Phù Thủy (E)'); return true; }
    castSpell(s.id);
    return true;
  };
  I.cdLeft = (id) => cd[id] || 0;
  I.mirrorLeft = () => mirrorT;
  I.cutMul = () => (mirrorT > 0 ? 1 - WITCH.skills.find((k) => k.id === 'icemirror').cut : 1); // nhân vào sát thương nhận

  // Gọi từ castSpell() khi phép là hệ băng. Trả về false nếu không dùng được (không trừ mana).
  I.cast = (s) => {
    if (layer === 2) { say('Không dùng phép băng trong nhà'); return false; }
    if (cd[s.id] > 0) { say('"' + s.name + '" còn hồi chiêu ' + Math.ceil(cd[s.id]) + ' giây'); return false; }
    cd[s.id] = s.cd;
    const t = aim();
    face(t.x, t.y);
    if (s.id === 'iceshard') castShard(s, t);
    else if (s.id === 'frostfield') fields.push({ x: player.x, y: player.y, t: 0, erupted: false, tick: 0, s, seed: Math.random() * 6 });
    else if (s.id === 'icemirror') castMirror(s);
    else if (s.id === 'blizzard') castBlizzard(s, t);
    // Đếm số lần dùng Z / X để mở học Băng Kính (cần 5 + 5)
    if (s.id === 'iceshard' || s.id === 'frostfield') {
      const k = s.id === 'iceshard' ? 'iceZ' : 'iceX';
      witchFlags[k] = Math.min(5, witchFlags[k] + 1);
      if (!witchFlags.iceUse && witchFlags.iceZ >= 5 && witchFlags.iceX >= 5) { witchFlags.iceUse = true; say('Đã dùng đủ Băng Tiễn và Hàn Vực! Phù Thủy có thể dạy Băng Kính'); }
    }
    return true;
  };

  function face(x, y) {
    const dx = x - player.x, dy = y - player.y;
    if (Math.abs(dx) > Math.abs(dy)) { player.faceX = Math.sign(dx) || 1; player.faceY = 0; }
    else { player.faceX = 0; player.faceY = Math.sign(dy) || 1; }
  }

  // ---------- Gây sát thương + hiệu ứng lạnh ----------
  // opt: soft (sát thương liên tục, không đẩy lùi / không ngắt đòn) · freeze (giây đóng băng) · slow (giây làm chậm) · mul (hệ số tốc độ khi chậm)
  function chill(m, opt) {
    if (m.dead || m.boss) return; // boss miễn nhiễm đóng băng / làm chậm
    if (opt.freeze) { m.iceT = opt.freeze; m.iceMul = 0; m.hurtT = Math.max(m.hurtT, opt.freeze); m.atkT = 0; }
    else if (opt.slow && m.iceMul !== 0) { m.iceT = Math.max(m.iceT || 0, opt.slow); m.iceMul = opt.mul || 0.4; }
  }
  function hurtArea(x, y, r, dmg, opt = {}) {
    for (const z of zombies) {
      if (z.dead) continue;
      const n = z.boss ? bossNearest(z, x, y) : z;
      if (Math.hypot(n.x - x, n.y - y) > r) continue;
      const kx = z.kx, ky = z.ky, at = z.atkT, ht = z.hurtT;
      hitZombie(z, dmg);
      if (opt.soft && !z.dead) { z.kx = kx; z.ky = ky; z.atkT = at; z.hurtT = ht; }
      chill(z, opt);
    }
    for (const s of spiders) {
      if (s.dead || Math.hypot(s.x - x, s.y - y) > r) continue;
      const ht = s.hurtT;
      hitSpider(s, dmg);
      if (opt.soft && !s.dead) s.hurtT = ht;
      chill(s, opt);
    }
    if (layer === 0) {
      for (const an of animals) if (Math.hypot(an.x - x, an.y - y) <= r) attackAnimal(an, dmg);
    }
  }
  function enemyAt(x, y, rad) { // điểm (x, y) trên mặt đất có chạm quái không
    for (const z of zombies) {
      if (z.dead) continue;
      const rx = (z.boss ? bossHB(z).rx : 18) + rad, up = (z.boss ? bossHB(z).up : 44) + rad;
      const dx = x - z.x, dy = y - z.y;
      if (Math.abs(dx) < rx && dy > -up && dy < 12 + rad) return true;
    }
    for (const s of spiders) {
      if (s.dead) continue;
      if (Math.abs(x - s.x) < 20 + rad && y - s.y > -22 - rad && y - s.y < 12 + rad) return true;
    }
    if (layer === 0) {
      for (const an of animals) {
        if (Math.abs(x - an.x) < ANIMALS[an.kind].hitW + rad && y - an.y > -40 - rad && y - an.y < 14 + rad) return true;
      }
    }
    return false;
  }

  // ---------- Hiệu ứng ----------
  function addSpike(x, y, sc, delay, life) { fx.push({ k: 'spike', x, y, sc, t: -delay, life, flip: Math.random() < 0.5 }); }
  function addRing(x, y, r, delay = 0) { fx.push({ k: 'ring', x, y, r, t: -delay, life: 0.45 }); }
  function shatter(x, y, big) {
    burst(x, y - 14, '#d8f4ff', big ? 22 : 10, big ? 260 : 170, 300);
    burst(x, y - 10, '#5fb4ff', big ? 14 : 7, 150, 200);
  }

  // ---------- Z: Băng Tiễn ----------
  function castShard(s, t) {
    const a = Math.atan2(t.y - player.y, t.x - player.x);
    bolts.push({ x: player.x + Math.cos(a) * 18, y: player.y + Math.sin(a) * 18, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, a, dist: 0, s });
    burst(player.x + Math.cos(a) * 20, player.y - ARROW_H, '#bfeaff', 7, 130, -40);
  }

  // ---------- C: Băng Kính ----------
  function castMirror(s) {
    mirrorT = mirrorDur = s.dur;
    addRing(player.x, player.y, 80);
    shatter(player.x, player.y - 20, false);
  }

  // ---------- V: Bão Tuyết ----------
  function castBlizzard(s, t) {
    const p = clampReach(t, s.reach);
    zones.push({ x: p.x, y: p.y, t: 0, tick: 0, s, seed: Math.random() * 100 });
    addRing(p.x, p.y, s.radius);
  }

  function erupt(f) { // Hàn Vực: gai băng trồi lên, đóng băng quái trong trận
    const s = f.s;
    hurtArea(f.x, f.y, s.radius, s.dmg, { freeze: s.freeze });
    addSpike(f.x, f.y, 1.1, 0, 0.9);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4, rr = s.radius * (0.55 + Math.random() * 0.3);
      addSpike(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.55, 0.55 + Math.random() * 0.3, 0.03 * (i + 1), 0.9);
    }
    addRing(f.x, f.y, s.radius);
    shatter(f.x, f.y - 6, true);
    shake = Math.max(shake, 0.45);
  }

  // ---------- Cập nhật ----------
  I.update = (dt) => {
    for (const k in cd) cd[k] = Math.max(0, cd[k] - dt);

    for (let i = bolts.length - 1; i >= 0; i--) { // Băng Tiễn
      const b = bolts[i];
      let done = false;
      for (let k = 0; k < 3 && !done; k++) {
        b.x += b.vx * dt / 3; b.y += b.vy * dt / 3; b.dist += b.s.speed * dt / 3;
        if (b.dist > b.s.range || isSolid(Math.floor(b.x / TILE), Math.floor(b.y / TILE)) || enemyAt(b.x, b.y, 8)) done = true;
      }
      if (Math.random() < 0.7) burst(b.x, b.y - ARROW_H, '#d8f4ff', 1, 40, 60);
      if (done) {
        hurtArea(b.x, b.y, b.s.splash, b.s.dmg, { slow: b.s.slow, mul: b.s.slowMul });
        addRing(b.x, b.y, b.s.splash * 1.4);
        addSpike(b.x, b.y, 0.3, 0, 0.45);
        shatter(b.x, b.y, false);
        bolts.splice(i, 1);
      }
    }

    mirrorT = Math.max(0, mirrorT - dt);
    if (mirrorT > 0 && Math.random() < 0.3) burst(player.x + (Math.random() - 0.5) * 50, player.y - 20 - Math.random() * 30, '#d8f4ff', 1, 30, -20);

    for (let i = fields.length - 1; i >= 0; i--) { // Hàn Vực: trận băng hiện ra, trồi gai, rồi thành vùng giá lạnh
      const f = fields[i], s = f.s;
      f.t += dt;
      if (!f.erupted && f.t >= s.delay) { f.erupted = true; erupt(f); }
      if (f.erupted) {
        f.tick -= dt;
        if (f.tick <= 0) { f.tick = s.tick; hurtArea(f.x, f.y, s.radius, s.zoneDmg, { soft: true, slow: s.slow, mul: s.slowMul }); }
        if (Math.random() < 0.4) burst(f.x + (Math.random() - 0.5) * s.radius * 1.6, f.y - 8, '#bfeaff', 1, 40, -80);
      }
      if (f.t >= s.delay + s.fieldTime) fields.splice(i, 1);
    }

    for (let i = zones.length - 1; i >= 0; i--) { // Bão Tuyết: gây sát thương và làm chậm theo nhịp
      const z = zones[i], s = z.s;
      z.t += dt; z.tick -= dt;
      if (z.tick <= 0) { z.tick = s.tick; hurtArea(z.x, z.y, s.radius, s.dmg, { soft: true, slow: s.slow, mul: s.slowMul }); }
      if (Math.random() < 0.6) burst(z.x + (Math.random() - 0.5) * s.radius * 1.6, z.y - 40 - Math.random() * 40, '#e8f8ff', 1, 40, 80);
      if (z.t >= s.time) zones.splice(i, 1);
    }

    for (const list of [zombies, spiders]) { // hết giờ lạnh thì hồi tốc độ
      for (const m of list) {
        if (!(m.iceT > 0)) continue;
        m.iceT -= dt;
        if (Math.random() < 0.12) burst(m.x, m.y - 30, '#bfeaff', 1, 40, -30);
      }
    }

    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); }
  };

  I.clear = () => { bolts = []; fields = []; zones = []; fx = []; };
  I.reset = () => { I.clear(); mirrorT = 0; I.mode = false; for (const k in cd) cd[k] = 0; };

  // ---------- Vẽ ----------
  function glow(x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(210,244,255,' + a + ')'); g.addColorStop(1, 'rgba(60,140,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function drawSpike(sx, sy, sc, grow, flip) { // gai băng mọc từ mặt đất
    if (!SP.spikes) return;
    const w = SP.spikes.width * sc, h = SP.spikes.height * sc * grow;
    ctx.save(); ctx.translate(sx, sy + 6);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(SP.spikes, -w / 2, -h, w, h);
    ctx.restore();
  }
  function drawBlizzard(z, camX, camY, now) {
    const s = z.s, sx = z.x - camX, sy = z.y - camY;
    const fade = Math.min(1, (s.time - z.t) / 0.7), pop = Math.min(1, z.t / 0.25);
    ctx.globalAlpha = fade * pop;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.55);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s.radius);
    g.addColorStop(0, 'rgba(210,240,255,0.5)'); g.addColorStop(0.7, 'rgba(110,190,255,0.28)'); g.addColorStop(1, 'rgba(40,90,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s.radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) { // các vòng xoáy quay quanh tâm, cao dần
      const k = 0.35 + i * 0.16, a0 = now * (2.2 - i * 0.25) + i * 1.3, lift = i * 20;
      ctx.strokeStyle = i % 2 ? 'rgba(180,225,255,0.7)' : 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, sy - lift, s.radius * k, s.radius * k * 0.4, 0, a0, a0 + Math.PI * 1.3); ctx.stroke();
    }
    ctx.fillStyle = '#f2fbff';
    for (let i = 0; i < 40; i++) { // bông tuyết bay xoáy và rơi
      const ph = (now * (0.35 + (i % 5) * 0.08) + i / 40) % 1;
      const a = i * 2.4 + z.seed + now * 1.4, rr = (0.15 + ((i * 37) % 10) / 11) * s.radius;
      ctx.fillRect(Math.round(sx + Math.cos(a) * rr), Math.round(sy + Math.sin(a) * rr * 0.45 - (1 - ph) * 110), 3 + (i % 2), 3 + (i % 2));
    }
  }
  function drawFrost(m, camX, camY) { // lớp băng phủ lên quái bị làm chậm / đóng băng
    const sx = m.x - camX, sy = m.y - camY, frozen = m.iceMul === 0;
    ctx.globalAlpha = frozen ? 0.5 : 0.22;
    ctx.fillStyle = '#8fd0ff';
    ctx.beginPath(); ctx.ellipse(sx, sy - 22, 16, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (frozen) { drawSpike(sx - 14, sy, 0.22, 1, false); drawSpike(sx + 14, sy, 0.22, 1, true); }
  }

  function drawField(f, camX, camY, now) { // trận băng dưới chân: vòng ma pháp xoay, mờ dần khi hết giờ
    const s = f.s, sx = f.x - camX, sy = f.y - camY;
    const pop = Math.min(1, f.t / 0.25), fade = Math.min(1, (s.delay + s.fieldTime - f.t) / 0.8);
    const k = f.erupted ? 1 : 0.55 + 0.45 * (f.t / s.delay);
    ctx.globalAlpha = pop * fade;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.55);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s.radius * k);
    g.addColorStop(0, 'rgba(200,240,255,0.45)'); g.addColorStop(0.75, 'rgba(90,170,255,0.25)'); g.addColorStop(1, 'rgba(40,90,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s.radius * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#a8e0ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, s.radius * k, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -now * 30;
    ctx.beginPath(); ctx.arc(0, 0, s.radius * k * 0.78, 0, Math.PI * 2); ctx.stroke(); // vòng chữ rune xoay
    ctx.setLineDash([]);
    ctx.rotate(now * 0.6 + f.seed); // ngôi sao 6 cánh ở giữa
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, r = s.radius * k * 0.6; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.stroke();
    ctx.restore();
  }
  function drawMirror(camX, camY, now) { // Băng Kính: khối pha lê lục giác bao quanh người
    const sx = player.x - camX, sy = player.y - camY - 26;
    const warn = mirrorT < 1 && Math.floor(now * 8) % 2 === 0;
    const rx = 32, ry = 44, pts = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; pts.push([sx + Math.cos(a) * rx, sy + Math.sin(a) * ry]); }
    ctx.globalAlpha = warn ? 0.35 : 1;
    const g = ctx.createRadialGradient(sx, sy, 6, sx, sy, ry);
    g.addColorStop(0, 'rgba(180,225,255,0.08)'); g.addColorStop(1, 'rgba(110,190,255,0.42)');
    ctx.fillStyle = g; ctx.strokeStyle = 'rgba(220,245,255,0.95)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(200,235,255,0.55)'; // các mặt cắt pha lê
    ctx.beginPath();
    for (const i of [0, 2, 4]) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(sx + (now % 2 < 1 ? 4 : -4), sy); }
    ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[5][0], pts[5][1]); ctx.moveTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[4][0], pts[4][1]);
    ctx.stroke();
    ctx.fillStyle = '#e8f8ff'; // mảnh băng bay quanh
    for (let i = 0; i < 4; i++) { const a = now * 2 + i * Math.PI / 2; ctx.fillRect(Math.round(sx + Math.cos(a) * (rx + 8)), Math.round(sy + Math.sin(a) * (ry * 0.5)), 4, 4); }
  }

  I.draw = (camX, camY) => {
    const now = performance.now() / 1000;
    ctx.save();

    for (const z of zones) drawBlizzard(z, camX, camY, now);

    ctx.globalAlpha = 1;
    for (const f of fields) drawField(f, camX, camY, now);

    for (const e of fx) {
      if (e.t < 0) continue;
      const p = e.t / e.life, sx = e.x - camX, sy = e.y - camY;
      if (e.k === 'spike') {
        ctx.globalAlpha = p > 0.7 ? (1 - p) / 0.3 : 1;
        drawSpike(sx, sy, e.sc, Math.min(1, p * 5), e.flip);
      } else if (e.k === 'ring') {
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#a8e0ff'; ctx.lineWidth = 6 * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(sx, sy, e.r * p, e.r * p * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    for (const b of bolts) { // Băng Tiễn
      const sx = b.x - camX, sy = b.y - camY - ARROW_H;
      ctx.globalCompositeOperation = 'lighter'; glow(sx, sy, 36, 0.5); ctx.globalCompositeOperation = 'source-over';
      if (SP.iceshard) {
        const sc = 0.5, w = SP.iceshard.width * sc, h = SP.iceshard.height * sc;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(b.a);
        ctx.drawImage(SP.iceshard, -w * 0.75, -h / 2, w, h);
        ctx.restore();
      } else { ctx.fillStyle = '#bfeaff'; ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill(); }
    }

    for (const list of [zombies, spiders]) for (const m of list) if (!m.dead && m.iceT > 0 && !m.boss) drawFrost(m, camX, camY);
    if (mirrorT > 0 && layer !== 2) drawMirror(camX, camY, now);
    ctx.restore();
  };

  return I;
})();
window.IceMagic = IceMagic;
