// ======================================================================
// HỆ LỬA cho Sách Phép: Z Hỏa Cầu · X Bạo Viêm · C Thiên Thạch · V Hỏa Long
// Hệ Lửa bật khi chọn Hệ Lửa ở bảng chọn hệ của ông phù thủy (nhấn E gần ông).
// Thông số chỉnh trong config.js (BALANCE.witch.skills, các phép có el: 'fire').
// Mở khoá (không tốn ngọc): Z Hỏa Cầu = 10 lưu huỳnh → đổi 1 Hoa Sen Lửa ở sạp Tạp Hoá (chợ) → dâng cho Phù Thủy;
// V Hỏa Long (chiêu cuối) = dâng 1 Giấy Lửa (rớt từ Rương Lửa của Chúa Tể Dung Nham). X C: sắp ra mắt (soon trong config.js).
// Muốn gỡ hệ lửa: xoá fire.js, thẻ <script> trong survival.html và các dòng "FireMagic" trong survival.js.
// ======================================================================
const FireMagic = (() => {
  const SP = {};                       // sprite
  ['fireball', 'dragon', 'meteor', 'blast'].forEach((n) => loadImage('assets/fire/' + n + '.webp').then((img) => { SP[n] = img; }));

  loadImage('assets/items/firelotus.webp').then((img) => { SP.firelotus = img; }); // icon Hoa Sen Lửa (vẽ trong drawIcon của survival.js)

  const F = { mode: false, tab: 'fire', tabRects: [] };
  F.lotusImg = () => SP.firelotus;
  const cd = { fireball: 0, nova: 0, meteor: 0, dragon: 0 };
  let bolts = [], dragons = [], zones = [], metes = [], fx = [];

  const skill = (id) => WITCH.skills.find((s) => s.id === id);
  const fireSkills = () => WITCH.skills.filter((s) => s.el === 'fire');
  const camOf = () => ({ x: Math.floor(player.x - canvas.width / 2), y: Math.floor(player.y - canvas.height / 2) });
  const aim = () => { const c = camOf(); return { x: mouse.x + c.x, y: mouse.y + c.y + ARROW_H }; }; // điểm trên mặt đất dưới con trỏ

  // ---------- Chế độ & phím ----------
  F.toggle = () => {
    if (!witchSt.book) return;
    F.mode = !F.mode;
    say(F.mode ? 'Hệ Lửa: Z Hỏa Cầu · X Bạo Viêm · C Thiên Thạch · V Hỏa Long' : 'Đã chuyển về hệ thường (Z hồi phục · V bước gió · F khiên)');
  };
  // Hệ Lửa đang bật: Z X C V dành cho phép lửa (không mở túi / đào xuống / hồi phục / bước gió)
  F.reserves = (code) => F.mode && witchSt.book && !ui && fireSkills().some((s) => 'Key' + s.key === code);
  F.key = (code) => { // trả về true nếu phím đã được hệ Lửa xử lý
    if (!F.reserves(code)) return false;
    const s = fireSkills().find((k) => 'Key' + k.key === code);
    if (!witchSt.learned[s.id]) { say(s.soon ? 'Phép "' + s.name + '" chưa mở khoá' : 'Chưa học phép "' + s.name + '" — nói chuyện với Phù Thủy (E)'); return true; }
    castSpell(s.id);
    return true;
  };
  F.cdLeft = (id) => cd[id] || 0;

  // Gọi từ castSpell() khi phép là hệ lửa. Trả về false nếu không dùng được (không trừ mana).
  F.cast = (s) => {
    if (layer === 2) { say('Không dùng phép lửa trong nhà'); return false; }
    if (cd[s.id] > 0) { say('"' + s.name + '" còn hồi chiêu ' + Math.ceil(cd[s.id]) + ' giây'); return false; }
    cd[s.id] = s.cd;
    const t = aim();
    face(t.x, t.y);
    if (s.id === 'fireball') castFireball(s, t);
    else if (s.id === 'nova') castNova(s);
    else if (s.id === 'meteor') castMeteor(s, t);
    else if (s.id === 'dragon') castDragon(s);
    return true;
  };

  function face(x, y) {
    const dx = x - player.x, dy = y - player.y;
    if (Math.abs(dx) > Math.abs(dy)) { player.faceX = Math.sign(dx) || 1; player.faceY = 0; }
    else { player.faceX = 0; player.faceY = Math.sign(dy) || 1; }
  }

  // ---------- Gây sát thương ----------
  function hurtArea(x, y, r, dmg, soft) { // soft: sát thương liên tục của vùng lửa, không đẩy lùi / không ngắt đòn quái
    for (const z of zombies) {
      if (z.dead) continue;
      const n = z.boss ? bossNearest(z, x, y) : z;
      if (Math.hypot(n.x - x, n.y - y) <= r) {
        const kx = z.kx, ky = z.ky, at = z.atkT, ht = z.hurtT;
        hitZombie(z, dmg);
        if (soft && !z.dead) { z.kx = kx; z.ky = ky; z.atkT = at; z.hurtT = ht; }
      }
    }
    for (const s of spiders) {
      if (!s.dead && Math.hypot(s.x - x, s.y - y) <= r) hitSpider(s, dmg);
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

  function explode(x, y, r, dmg, big) {
    hurtArea(x, y, r, dmg);
    fx.push({ k: 'blast', x, y, r, t: 0, life: 0.55 });
    fx.push({ k: 'ring', x, y, r, t: 0, life: 0.4 });
    burst(x, y - 14, '#ffb23a', big ? 22 : 12, big ? 260 : 190, 300);
    burst(x, y - 10, '#ff5a1a', big ? 14 : 8, 150, 200);
    shake = Math.max(shake, big ? 0.45 : 0.15);
  }

  // ---------- Z: Hỏa Cầu ----------
  function castFireball(s, t) {
    const a = Math.atan2(t.y - player.y, t.x - player.x);
    bolts.push({ x: player.x + Math.cos(a) * 18, y: player.y + Math.sin(a) * 18, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, a, dist: 0, s });
    burst(player.x + Math.cos(a) * 20, player.y - ARROW_H, '#ffb040', 7, 130, -40);
  }

  // ---------- X: Bạo Viêm ----------
  function castNova(s) {
    hurtArea(player.x, player.y, s.radius, s.dmg);
    fx.push({ k: 'ring', x: player.x, y: player.y, r: s.radius, t: 0, life: 0.5 });
    fx.push({ k: 'ring', x: player.x, y: player.y, r: s.radius * 0.7, t: -0.1, life: 0.45 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      fx.push({ k: 'blast', x: player.x + Math.cos(a) * s.radius * 0.6, y: player.y + Math.sin(a) * s.radius * 0.42, r: 46, t: -0.04 * i, life: 0.5 });
    }
    burst(player.x, player.y - 20, '#ffb23a', 26, 280, 200);
    burst(player.x, player.y - 14, '#ff5a1a', 16, 180, 120);
    shake = Math.max(shake, 0.35);
  }

  // ---------- C: Thiên Thạch ----------
  function castMeteor(s, t) {
    let x = t.x, y = t.y;
    const d = Math.hypot(x - player.x, y - player.y);
    if (d > s.reach) { x = player.x + (x - player.x) * s.reach / d; y = player.y + (y - player.y) * s.reach / d; }
    metes.push({ x, y, t: 0, s });
  }

  // ---------- V: Hỏa Long ----------
  function castDragon(s) {
    const t = aim();
    const a = Math.atan2(t.y - player.y, t.x - player.x);
    dragons.push({ x: player.x + Math.cos(a) * 24, y: player.y + Math.sin(a) * 24, ang: a, t: 0, s, trail: [], tr: 0 });
    burst(player.x, player.y - 26, '#ffd060', 14, 200, -60);
  }

  function addZone(x, y, s) { zones.push({ x, y, r: s.zoneRadius, t: 0, life: s.zoneTime, tick: 0, s, seed: Math.random() * 100 }); }

  // ---------- Cập nhật ----------
  F.update = (dt) => {
    for (const k in cd) cd[k] = Math.max(0, cd[k] - dt);

    for (let i = bolts.length - 1; i >= 0; i--) { // Hỏa Cầu
      const b = bolts[i];
      let done = false;
      for (let k = 0; k < 3 && !done; k++) {
        b.x += b.vx * dt / 3; b.y += b.vy * dt / 3; b.dist += b.s.speed * dt / 3;
        if (b.dist > b.s.range || isSolid(Math.floor(b.x / TILE), Math.floor(b.y / TILE)) || enemyAt(b.x, b.y, 8)) done = true;
      }
      if (Math.random() < 0.7) burst(b.x, b.y - ARROW_H, '#ff8a2a', 1, 40, -30);
      if (done) {
        explode(b.x, b.y, b.s.splash, b.s.dmg, false);
        bolts.splice(i, 1);
      }
    }

    for (let i = metes.length - 1; i >= 0; i--) { // Thiên Thạch
      const m = metes[i];
      m.t += dt;
      if (m.t >= m.s.delay) {
        explode(m.x, m.y, m.s.radius, m.s.dmg, true);
        burst(m.x, m.y - 6, '#6b4a3a', 14, 240, 500);
        shake = Math.max(shake, 0.7);
        metes.splice(i, 1);
      }
    }

    for (let i = dragons.length - 1; i >= 0; i--) { // Hỏa Long: đuổi theo chuột
      const d = dragons[i], s = d.s;
      d.t += dt;
      const t = aim();
      let df = Math.atan2(t.y - d.y, t.x - d.x) - d.ang;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      const mt = s.turn * dt;
      d.ang += Math.max(-mt, Math.min(mt, df));
      d.x += Math.cos(d.ang) * s.speed * dt; d.y += Math.sin(d.ang) * s.speed * dt;
      d.tr -= dt;
      if (d.tr <= 0) { d.tr = 0.03; d.trail.push({ x: d.x, y: d.y, w: Math.sin(d.t * 9) }); if (d.trail.length > 16) d.trail.shift(); }
      if (Math.random() < 0.8) burst(d.x - Math.cos(d.ang) * 26, d.y - ARROW_H - 8, Math.random() < 0.5 ? '#ffb23a' : '#ff6a1a', 1, 50, -40);
      let end = null;
      if (enemyAt(d.x, d.y, 16)) end = 'hit';
      else if (d.t >= s.follow) end = 'timeout';
      if (end) {
        explode(d.x, d.y, s.radius, s.dmg, true);
        if (end === 'hit' || s.zoneOnTimeout) addZone(d.x, d.y, s); // trúng quái: để lại vùng lửa; tự nổ hết giờ: chỉ nổ
        dragons.splice(i, 1);
      }
    }

    for (let i = zones.length - 1; i >= 0; i--) { // Vùng lửa
      const z = zones[i];
      z.t += dt; z.tick -= dt;
      if (z.tick <= 0) { z.tick = z.s.zoneTick; hurtArea(z.x, z.y, z.r, z.s.zoneDmg, true); }
      if (Math.random() < 0.5) burst(z.x + (Math.random() - 0.5) * z.r * 1.6, z.y + (Math.random() - 0.5) * z.r * 0.8 - 6, '#ff8a2a', 1, 40, -120);
      if (z.t >= z.life) zones.splice(i, 1);
    }

    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); }
  };

  F.clear = () => { bolts = []; dragons = []; zones = []; metes = []; fx = []; };
  F.reset = () => { F.clear(); F.mode = false; F.tab = 'fire'; for (const k in cd) cd[k] = 0; };

  // ---------- Vẽ ----------
  function glow(x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,200,90,' + a + ')'); g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function flame(x, y, w, h, ph) { // một ngọn lửa hình giọt
    const sway = Math.sin(ph) * w * 0.25;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x - w / 2, y - h * 0.5, x + sway, y - h);
    ctx.quadraticCurveTo(x + w / 2, y - h * 0.5, x + w / 2, y);
    ctx.closePath(); ctx.fill();
  }

  F.draw = (camX, camY) => {
    const now = performance.now() / 1000;
    ctx.save();

    for (const z of zones) { // vùng lửa trên mặt đất
      const sx = z.x - camX, sy = z.y - camY;
      const fade = Math.min(1, (z.life - z.t) / 0.6), pop = Math.min(1, z.t / 0.2);
      ctx.globalAlpha = fade * pop;
      ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.55);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, z.r);
      g.addColorStop(0, 'rgba(255,170,40,0.55)'); g.addColorStop(0.7, 'rgba(255,80,10,0.3)'); g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, z.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4 + z.seed, rr = (0.15 + ((i * 37) % 10) / 12) * z.r * 0.85;
        const fx0 = sx + Math.cos(a) * rr, fy0 = sy + Math.sin(a) * rr * 0.5;
        const h = 16 + 14 * Math.abs(Math.sin(now * 7 + i * 1.7)), w = 10 + (i % 3) * 3;
        ctx.fillStyle = '#d6321a'; flame(fx0, fy0, w, h, now * 9 + i);
        ctx.fillStyle = '#ff9a1f'; flame(fx0, fy0, w * 0.65, h * 0.72, now * 9 + i + 1);
        ctx.fillStyle = '#ffe07a'; flame(fx0, fy0, w * 0.3, h * 0.4, now * 9 + i + 2);
      }
    }

    for (const m of metes) { // thiên thạch: vòng cảnh báo + thiên thạch rơi
      const p = Math.min(1, m.t / m.s.delay), sx = m.x - camX, sy = m.y - camY;
      ctx.globalAlpha = 0.4 + 0.1 * Math.sin(now * 5);
      ctx.strokeStyle = '#ff4a1a'; ctx.fillStyle = 'rgba(255,70,20,0.18)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, sy, m.s.radius, m.s.radius * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(sx, sy, m.s.radius * (1 - p), m.s.radius * 0.55 * (1 - p), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      if (SP.meteor) {
        const sc = 0.95, e = 1 - p * p;                     // rơi nhanh dần
        const px = sx - e * 240, py = sy - e * 560;
        ctx.drawImage(SP.meteor, px - 135 * sc, py - 76 * sc, SP.meteor.width * sc, SP.meteor.height * sc);
      }
    }

    for (const e of fx) { // nổ
      if (e.t < 0) continue;
      const p = e.t / e.life, sx = e.x - camX, sy = e.y - camY;
      if (e.k === 'blast' && SP.blast) {
        const w = e.r * 2.3 * (0.55 + 0.45 * Math.min(1, p * 3)), h = w * SP.blast.height / SP.blast.width;
        ctx.globalAlpha = 1 - p * p;
        ctx.drawImage(SP.blast, sx - w / 2, sy + 10 - h, w, h);
      } else if (e.k === 'ring') {
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#ffb03a'; ctx.lineWidth = 6 * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(sx, sy, e.r * p, e.r * p * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    for (const b of bolts) { // hỏa cầu
      const sx = b.x - camX, sy = b.y - camY - ARROW_H;
      ctx.globalCompositeOperation = 'lighter'; glow(sx, sy, 38, 0.55); ctx.globalCompositeOperation = 'source-over';
      if (SP.fireball) {
        const sc = 0.55;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(b.a);
        ctx.drawImage(SP.fireball, -SP.fireball.width * sc * 0.7, -SP.fireball.height * sc / 2, SP.fireball.width * sc, SP.fireball.height * sc);
        ctx.restore();
      } else { ctx.fillStyle = '#ff9a1f'; ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.fill(); }
    }

    for (const d of dragons) { // hỏa long: thân là vệt lửa phía sau, đầu là sprite
      const H = ARROW_H + 8, left = d.s.follow - d.t, warn = left < 0.9 && Math.floor(now * 6) % 2 === 0;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(d.x - camX, d.y - camY, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < d.trail.length; i++) {
        const q = d.trail[i], k = (i + 1) / d.trail.length, r = 5 + 20 * k;
        glow(q.x - camX, q.y - camY - H + q.w * 5 * (1 - k), r, 0.35 + 0.4 * k);
      }
      glow(d.x - camX, d.y - camY - H, 55, warn ? 0.9 : 0.5);
      ctx.globalCompositeOperation = 'source-over';
      if (SP.dragon) {
        const sc = warn ? 1.05 : 0.9, w = SP.dragon.width * sc, h = SP.dragon.height * sc;
        ctx.save(); ctx.translate(d.x - camX, d.y - camY - H); ctx.rotate(d.ang);
        if (Math.cos(d.ang) < 0) ctx.scale(1, -1);          // quay sang trái thì lật dọc để đầu rồng không bị ngược
        ctx.drawImage(SP.dragon, -w * 0.55, -h / 2, w, h);
        ctx.restore();
      }
    }
    ctx.restore();
  };

  // Chỉ báo hệ Lửa + hồi chiêu, vẽ cạnh thanh mana
  F.drawHud = (bx, my, bw, bh) => {
    if (!witchSt.book || !fireSkills().some((s) => witchSt.learned[s.id])) return;
    const x0 = bx + bw + 10;
    ctx.save();
    ctx.textAlign = 'center';
    if (!F.mode) { ctx.restore(); return; }
    fireSkills().forEach((s, i) => {
      const x = x0 + i * 26, ok = witchSt.learned[s.id], c = cd[s.id] || 0;
      ctx.fillStyle = ok ? '#3a1408' : '#222'; ctx.fillRect(x, my - 3, 24, 24);
      if (ok && c > 0) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, my - 3, 24, 24 * Math.min(1, c / s.cd)); }
      ctx.strokeStyle = ok ? '#ff9a1f' : '#555'; ctx.lineWidth = 2; ctx.strokeRect(x, my - 3, 24, 24);
      ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = ok ? (c > 0 ? '#aa7a50' : '#ffd070') : '#777';
      ctx.fillText(s.key, x + 12, my + 14);
    });
    ctx.restore();
  };

  // ---------- Sách Phép: thẻ chọn hệ ----------
  F.bookClick = () => { for (const t of F.tabRects) if (inRect(mouse, t)) F.tab = t.id; };

  return F;
})();
window.FireMagic = FireMagic;
