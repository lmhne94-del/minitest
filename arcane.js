// ======================================================================
// HỆ KHÔNG GIAN cho Sách Phép:
//   Z Ảnh Bộ (dịch chuyển ngắn) · X Không Nhận (vết chém xuyên) · C Hư Không (hố đen hút quái) · V Chúa Tể Không Gian (dịch chuyển bản đồ)
// Chọn "Hệ Không Gian" ở bảng chọn hệ của ông phù thủy (nhấn E gần ông).
// Thông số chỉnh trong config.js (BALANCE.witch.skills, các phép có el: 'arcane'; đơn vị "tiles" = số ô).
// Hiệu ứng vẽ bằng code (tím / xanh neon), không cần ảnh.
// Muốn gỡ: xoá arcane.js, thẻ <script> trong survival.html và các dòng "ArcaneMagic" trong survival.js / elements.js.
// ======================================================================
const ArcaneMagic = (() => {
  const A = { mode: false };
  const cd = {};                       // hồi chiêu theo id phép
  let slashes = [], holes = [], fx = [];
  let ult = null;                      // Chúa Tể Không Gian: { phase: 'charge' | 'pick', t, s }

  const arcSkills = () => WITCH.skills.filter((s) => s.el === 'arcane');
  const camOf = () => ({ x: Math.floor(player.x - canvas.width / 2), y: Math.floor(player.y - canvas.height / 2) });
  const aim = () => { const c = camOf(); return { x: mouse.x + c.x, y: mouse.y + c.y + ARROW_H }; }; // điểm trên mặt đất dưới con trỏ

  // ---------- Chế độ & phím ----------
  // Hệ Không Gian đang bật: Z X C V dành cho phép (không mở túi / đào xuống / hồi phục / bước gió)
  A.reserves = (code) => A.mode && witchSt.book && !ui && arcSkills().some((s) => 'Key' + s.key === code);
  A.key = (code) => { // trả về true nếu phím đã được hệ Không Gian xử lý
    if (!A.reserves(code)) return false;
    const s = arcSkills().find((k) => 'Key' + k.key === code);
    if (!witchSt.learned[s.id]) { say('Chưa học phép "' + s.name + '" — nói chuyện với Phù Thủy (E)'); return true; }
    castSpell(s.id);
    return true;
  };
  A.cdLeft = (id) => cd[id] || 0;
  A.picking = () => !!ult && ult.phase === 'pick';

  // Gọi từ castSpell() khi phép là hệ Không Gian. Trả về false nếu không dùng được (không trừ mana).
  A.cast = (s) => {
    if (layer >= 2) { say('Không dùng phép Không Gian ở đây'); return false; }
    if (cd[s.id] > 0) { say('"' + s.name + '" còn hồi chiêu ' + Math.ceil(cd[s.id]) + ' giây'); return false; }
    if (ult) { say('Đang thi triển Chúa Tể Không Gian'); return false; }
    const t = aim();
    let ok = true;
    if (s.id === 'blink') ok = castBlink(s, t);
    else if (s.id === 'riftslash') castSlash(s, t);
    else if (s.id === 'voidcollapse') castHole(s, t);
    else if (s.id === 'dimension') castUltimate(s);
    if (!ok) return false;
    cd[s.id] = s.cd;
    return true;
  };

  function face(x, y) {
    const dx = x - player.x, dy = y - player.y;
    if (Math.abs(dx) > Math.abs(dy)) { player.faceX = Math.sign(dx) || 1; player.faceY = 0; }
    else { player.faceX = 0; player.faceY = Math.sign(dy) || 1; }
  }

  // ---------- Sát thương / va chạm ----------
  function hurtArea(x, y, r, dmg) {
    for (const z of zombies) {
      if (z.dead) continue;
      const n = z.boss ? bossNearest(z, x, y) : z;
      if (Math.hypot(n.x - x, n.y - y) <= r) hitZombie(z, dmg);
    }
    for (const s of spiders) if (!s.dead && Math.hypot(s.x - x, s.y - y) <= r) hitSpider(s, dmg);
    if (layer === 0) for (const an of animals) if (Math.hypot(an.x - x, an.y - y) <= r) attackAnimal(an, dmg);
  }
  const addRing = (x, y, r, delay = 0, col = '#b890ff') => fx.push({ k: 'ring', x, y, r, t: -delay, life: 0.5, col });
  const addPortal = (x, y, sc = 1, life = 0.7) => fx.push({ k: 'portal', x, y, sc, t: 0, life });
  function sparks(x, y, n, big) {
    burst(x, y - 20, '#c9a0ff', n, big ? 260 : 170, 120);
    burst(x, y - 20, '#7fb0ff', Math.ceil(n / 2), big ? 200 : 130, 60);
  }

  // ---------- Z: Ảnh Bộ ----------
  function castBlink(s, t) {
    const a = Math.atan2(t.y - player.y, t.x - player.x), max = s.range * TILE;
    let d = Math.min(max, Math.hypot(t.x - player.x, t.y - player.y)); // dừng ở điểm ngắm nếu gần hơn tầm tối đa
    d = Math.max(d, Math.min(max, TILE * 2));                          // luôn nhảy ít nhất ~2 ô để thấy rõ
    let bx = player.x, by = player.y;
    for (let k = 6; k <= d; k += 6) { // đi từng bước nhỏ, gặp tường thì dừng (không xuyên tường)
      const nx = player.x + Math.cos(a) * k, ny = player.y + Math.sin(a) * k;
      if (collides(nx, ny)) break;
      bx = nx; by = ny;
    }
    if (Math.hypot(bx - player.x, by - player.y) < 12) { say('Bị chắn, không dịch chuyển được'); return false; }
    face(t.x, t.y);
    fx.push({ k: 'ghost', x: player.x, y: player.y, t: 0, life: 0.45 });
    addPortal(player.x, player.y, 0.8, 0.45);
    sparks(player.x, player.y, 12, false);
    player.x = bx; player.y = by;
    player.invuln = Math.max(player.invuln, s.inv || 0.2);
    addPortal(bx, by, 0.9, 0.55);
    addRing(bx, by, 60);
    sparks(bx, by, 14, false);
    return true;
  }

  // ---------- X: Không Nhận ----------
  // Tự ngắm: chọn quái gần người chơi nhất trong tầm (ưu tiên quái gần con trỏ nếu có nhiều con cùng khoảng cách), không có thì theo con trỏ
  function autoTarget(s, t) {
    const maxD = s.range * TILE * 1.25;
    let best = null, bd = 1e9;
    const consider = (x, y) => {
      const d = Math.hypot(x - player.x, y - player.y);
      if (d > maxD || !lineClear(player.x, player.y, x, y)) return; // bị tường chắn thì bỏ qua
      const score = d + Math.hypot(x - t.x, y - t.y) * 0.3;
      if (score < bd) { bd = score; best = { x, y }; }
    };
    for (const z of zombies) if (!z.dead) { const n = z.boss ? bossNearest(z, player.x, player.y) : z; consider(n.x, n.y - 10); }
    for (const sp of spiders) if (!sp.dead) consider(sp.x, sp.y - 8);
    return best || t;
  }
  function castSlash(s, t) {
    if (s.autoAim) t = autoTarget(s, t);
    face(t.x, t.y);
    const a = Math.atan2(t.y - player.y, t.x - player.x);
    slashes.push({ x: player.x + Math.cos(a) * 24, y: player.y + Math.sin(a) * 24, a, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, dist: 0, hit: new Set(), left: s.pierce, s, trail: [] });
    addPortal(player.x + Math.cos(a) * 26, player.y + Math.sin(a) * 26 - 10, 0.55, 0.4);
    sparks(player.x + Math.cos(a) * 24, player.y - 12, 8, false);
  }
  function slashHit(b) { // trả về true nếu đã đủ số mục tiêu xuyên qua
    const rad = b.s.width;
    for (const z of zombies) { // cùng kiểu kiểm tra hộp va chạm như các phép Lửa / Băng
      if (z.dead || b.hit.has(z)) continue;
      const rx = (z.boss ? bossHB(z).rx : 18) + rad, up = (z.boss ? bossHB(z).up : 44) + rad;
      const dx = b.x - z.x, dy = b.y - z.y;
      if (!(Math.abs(dx) < rx && dy > -up && dy < 12 + rad)) continue;
      b.hit.add(z); hitZombie(z, b.s.dmg); b.left--;
      fx.push({ k: 'hit', x: z.x, y: z.y - 24, t: 0, life: 0.35 });
      if (b.left <= 0) return true;
    }
    for (const sp of spiders) {
      if (sp.dead || b.hit.has(sp)) continue;
      if (!(Math.abs(b.x - sp.x) < 20 + rad && b.y - sp.y > -22 - rad && b.y - sp.y < 12 + rad)) continue;
      b.hit.add(sp); hitSpider(sp, b.s.dmg); b.left--;
      fx.push({ k: 'hit', x: sp.x, y: sp.y - 14, t: 0, life: 0.35 });
      if (b.left <= 0) return true;
    }
    if (layer === 0) for (const an of animals) { // thú hoang cũng bị chém (thú đã thuần thì bỏ qua)
      if (an.tame || b.hit.has(an)) continue;
      if (!(Math.abs(b.x - an.x) < ANIMALS[an.kind].hitW + rad && b.y - an.y > -40 - rad && b.y - an.y < 14 + rad)) continue;
      b.hit.add(an); attackAnimal(an, Math.max(1, Math.round(b.s.dmg))); b.left--;
      fx.push({ k: 'hit', x: an.x, y: an.y - 24, t: 0, life: 0.35 });
      if (b.left <= 0) return true;
    }
    return false;
  }

  // ---------- C: Hư Không ----------
  function castHole(s, t) {
    face(t.x, t.y);
    const d = Math.hypot(t.x - player.x, t.y - player.y), reach = s.reach * TILE;
    const x = d > reach ? player.x + (t.x - player.x) * reach / d : t.x;
    const y = d > reach ? player.y + (t.y - player.y) * reach / d : t.y;
    holes.push({ x, y, t: 0, s, seed: Math.random() * 6, burst: false });
    addRing(x, y, s.radius * TILE);
  }
  function pull(m, h, dt, boss) {
    const dx = h.x - m.x, dy = h.y - m.y, d = Math.hypot(dx, dy);
    if (d < 6) return;
    const sp = h.s.pull * (boss ? 0.12 : 1) * dt;   // boss chỉ bị kéo nhẹ
    const nx = m.x + dx / d * Math.min(sp, d), ny = m.y + dy / d * Math.min(sp, d);
    if (!collides(nx, m.y)) m.x = nx;
    if (!collides(m.x, ny)) m.y = ny;
  }

  // ---------- V: Chúa Tể Không Gian ----------
  function castUltimate(s) {
    ult = { phase: 'charge', t: 0, s, win: 0 };
    player.invuln = Math.max(player.invuln, s.chargeTime + s.window);
    addRing(player.x, player.y, 90);
    sparks(player.x, player.y, 18, true);
  }
  // Gọi từ map: người chơi bấm một điểm (tọa độ ô) khi đang chọn điểm đến. Trả về true nếu đã xử lý.
  A.mapClick = (tx, ty) => {
    if (!A.picking()) return false;
    const s = ult.s, ptx = player.x / TILE, pty = player.y / TILE;
    if (Math.hypot(tx - ptx, ty - pty) > s.range) { say('Quá xa — tối đa ' + s.range + ' ô'); return true; }
    if (!mmIsExplored(tx, ty)) { say('Chưa đi qua chỗ này, không dịch chuyển tới được'); return true; }
    let dest = null;
    for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const x = (Math.floor(tx) + ox + 0.5) * TILE, y = (Math.floor(ty) + oy + 0.5) * TILE;
      if (!collides(x, y)) { dest = { x, y }; break; }
    }
    if (!dest) { say('Chỗ này bị chắn, chọn điểm khác'); return true; }
    const from = { x: player.x, y: player.y };
    ult = null;
    closeUi();
    fx.push({ k: 'ghost', x: from.x, y: from.y, t: 0, life: 0.6 });
    addPortal(from.x, from.y, 1.3, 0.8);
    sparks(from.x, from.y, 22, true);
    player.x = dest.x; player.y = dest.y;
    player.invuln = Math.max(player.invuln, 1.2);
    addPortal(dest.x, dest.y, 1.5, 0.9);
    fx.push({ k: 'cocoon', x: dest.x, y: dest.y, t: 0, life: 1.1 }); // kén năng lượng nứt vỡ tan dần
    addRing(dest.x, dest.y, 130, 0.1);
    sparks(dest.x, dest.y, 30, true);
    shake = Math.max(shake, 0.4);
    return true;
  };
  function cancelUlt(msg) {
    ult = null;
    if (ui === 'map') closeUi();
    if (msg) say(msg);
  }
  // Vẽ lên bản đồ lớn khi đang chọn điểm đến (gọi trong drawFullMap, đã cắt theo khung bản đồ)
  A.drawMapOverlay = (L) => {
    if (!A.picking()) return;
    const s = ult.s, now = performance.now() / 1000;
    const c = fmToScreen(L, player.x / TILE, player.y / TILE), R = s.range * mapView.s;
    ctx.save();
    ctx.fillStyle = 'rgba(140,90,255,0.14)'; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c9a0ff'; ctx.lineWidth = 2; ctx.setLineDash([10, 7]); ctx.lineDashOffset = -now * 24;
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const w = fmToWorld(L, mouse.x, mouse.y), inR = Math.hypot(w.tx - player.x / TILE, w.ty - player.y / TILE) <= s.range;
    const good = inR && mmIsExplored(w.tx, w.ty);
    ctx.strokeStyle = good ? '#9dffb0' : '#ff7a7a'; ctx.lineWidth = 2; // tâm ngắm
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI * 2); ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y); ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y + 14); ctx.stroke();
    ctx.restore();
  };
  A.drawMapBanner = (L) => { // dòng thông báo + đếm ngược trên thanh tiêu đề bản đồ
    if (!A.picking()) return;
    const left = Math.max(0, ult.s.window - ult.win);
    ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif';
    ctx.restore();
  };

  // ---------- Cập nhật ----------
  A.update = (dt) => {
    for (const k in cd) cd[k] = Math.max(0, cd[k] - dt);

    if (ult) {
      if (layer >= 2) cancelUlt();
      else if (ult.phase === 'charge') {
        ult.t += dt;
        player.invuln = Math.max(player.invuln, 0.3);
        if (Math.random() < 0.8) burst(player.x + (Math.random() - 0.5) * 60, player.y - 10, '#c9a0ff', 1, 40, -120);
        if (ult.t >= ult.s.chargeTime) { // tự mở bản đồ để chọn điểm đến
          if (ui) closeUi();
          openMap();
          ult.phase = 'pick'; ult.win = 0;
        }
      } else {
        ult.win += dt;
        player.invuln = Math.max(player.invuln, 0.3);
        if (ui !== 'map') cancelUlt('Đã hủy dịch chuyển');                  // người chơi tự đóng bản đồ
        else if (ult.win >= ult.s.window) cancelUlt('Hết thời gian dịch chuyển'); // quá 4 giây
      }
    }

    for (let i = slashes.length - 1; i >= 0; i--) { // Không Nhận
      const b = slashes[i];
      let done = false;
      for (let k = 0; k < 3 && !done; k++) {
        b.x += b.vx * dt / 3; b.y += b.vy * dt / 3; b.dist += b.s.speed * dt / 3;
        if (b.dist > b.s.range * TILE || isSolid(Math.floor(b.x / TILE), Math.floor(b.y / TILE))) done = true;
        else if (slashHit(b)) done = true;
      }
      b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 8) b.trail.shift();
      if (Math.random() < 0.8) burst(b.x, b.y - ARROW_H, Math.random() < 0.5 ? '#c9a0ff' : '#7fb0ff', 1, 50, 20);
      if (done) {
        fx.push({ k: 'crack', x: b.x, y: b.y, a: b.a, t: 0, life: 0.7 });
        sparks(b.x, b.y, 10, false);
        slashes.splice(i, 1);
      }
    }

    for (let i = holes.length - 1; i >= 0; i--) { // Hư Không: hút vào tâm, hết giờ thì co lại và nổ
      const h = holes[i], s = h.s, R = s.radius * TILE;
      h.t += dt;
      if (h.t < s.time) {
        for (const z of zombies) {
          if (z.dead) continue;
          const n = z.boss ? bossNearest(z, h.x, h.y) : z;
          if (Math.hypot(n.x - h.x, n.y - h.y) <= R) pull(z, h, dt, z.boss);
        }
        for (const sp of spiders) if (!sp.dead && Math.hypot(sp.x - h.x, sp.y - h.y) <= R) pull(sp, h, dt, false);
        if (Math.random() < 0.9) { // mảnh đá / hạt sáng bị hút vào tâm
          const a = Math.random() * Math.PI * 2, r = R * (0.5 + Math.random() * 0.5);
          fx.push({ k: 'mote', x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r * 0.5, cx: h.x, cy: h.y, t: 0, life: 0.5, rock: Math.random() < 0.5 });
        }
      } else if (!h.burst) {
        h.burst = true;
        hurtArea(h.x, h.y, R * 0.8, s.dmg);
        addRing(h.x, h.y, R); addRing(h.x, h.y, R * 0.6, 0.08, '#7fb0ff');
        sparks(h.x, h.y, 30, true);
        shake = Math.max(shake, 0.4);
      }
      if (h.t >= s.time + 0.45) holes.splice(i, 1);
    }

    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); }
  };

  A.clear = () => { slashes = []; holes = []; fx = []; if (ult) { ult = null; if (ui === 'map') closeUi(); } };
  A.reset = () => { A.clear(); A.mode = false; for (const k in cd) cd[k] = 0; };

  // ---------- Vẽ ----------
  function glow(x, y, r, a, c0 = '230,210,255', c1 = '110,70,255') {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + c0 + ',' + a + ')'); g.addColorStop(1, 'rgba(' + c1 + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function drawPortal(sx, sy, sc, p, now) { // khe không gian hình thoi tím, tâm có ngôi sao sáng
    const w = 22 * sc * Math.sin(Math.min(1, p * 3) * Math.PI / 2) * (p > 0.6 ? (1 - p) / 0.4 : 1), h = 44 * sc;
    if (w < 1) return;
    ctx.save(); ctx.translate(sx, sy - 22 * sc);
    ctx.globalCompositeOperation = 'lighter'; glow(0, 0, h * 0.9, 0.5);
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, '#9a6cff'); g.addColorStop(1, '#1c0a4a');
    ctx.fillStyle = g; ctx.strokeStyle = '#d6c0ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, w, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c9a0ff';
    for (let i = 0; i < 6; i++) { const a = now * 3 + i * 1.05; ctx.fillRect(Math.round(Math.cos(a) * (w + 8)), Math.round(Math.sin(a) * h * 0.5), 3, 3); }
    ctx.restore();
  }
  function drawCrescent(sx, sy, a, sc, alpha) { // vết chém lưỡi liềm tím-xanh, lồi về phía trước
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'lighter';
    const R = 34 * sc;
    for (const [col, k, lw] of [['rgba(110,70,255,0.55)', 1.12, 12 * sc], ['rgba(160,200,255,0.9)', 1, 6 * sc], ['rgba(255,255,255,0.95)', 0.96, 2.5 * sc]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-R * 0.55, 0, R * k, -1.05, 1.05); ctx.stroke();
    }
    ctx.restore();
  }
  function drawHole(h, camX, camY, now) {
    const s = h.s, R = s.radius * TILE, sx = h.x - camX, sy = h.y - camY;
    const pop = Math.min(1, h.t / 0.3), end = h.t > s.time ? Math.max(0, 1 - (h.t - s.time) / 0.45) : 1, k = pop * end;
    if (k <= 0) return;
    ctx.save(); ctx.globalAlpha = k;
    ctx.translate(sx, sy); ctx.scale(1, 0.55);
    ctx.strokeStyle = '#a07aff'; ctx.lineWidth = 3; // vòng rune dưới đất
    ctx.beginPath(); ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.lineDashOffset = now * 40;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.35, 'rgba(20,0,60,0.8)'); g.addColorStop(0.7, 'rgba(110,60,255,0.35)'); g.addColorStop(1, 'rgba(110,60,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { // các nhánh xoáy quay vào tâm
      const a0 = now * (2.5 + i * 0.3) + i * 1.57, rr = R * (0.55 - i * 0.09);
      ctx.strokeStyle = i % 2 ? 'rgba(150,190,255,0.85)' : 'rgba(210,170,255,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.9, 0, a0, a0 + 1.6); ctx.stroke();
    }
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, R * 0.17, 0, Math.PI * 2); ctx.fill(); // lõi đen
    ctx.restore();
  }
  function drawCocoon(e, camX, camY) { // kén năng lượng quanh người: nứt dần rồi vỡ tan
    const p = e.t / e.life, sx = e.x - camX, sy = e.y - camY - 26, rx = 34 + p * 14, ry = 46 + p * 16;
    ctx.save(); ctx.globalAlpha = 1 - p * p;
    const g = ctx.createRadialGradient(sx, sy, 6, sx, sy, ry);
    g.addColorStop(0, 'rgba(160,120,255,0.05)'); g.addColorStop(1, 'rgba(150,110,255,' + (0.5 * (1 - p)) + ')');
    ctx.fillStyle = g; ctx.strokeStyle = 'rgba(225,205,255,0.95)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); // vết nứt lan dần theo p
    const n = Math.floor(2 + p * 8);
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + 0.4, r1 = ry * 0.15, r2 = ry * Math.min(1, 0.4 + p * 0.9);
      ctx.moveTo(sx + Math.cos(a) * r1 * 0.8, sy + Math.sin(a) * r1);
      ctx.lineTo(sx + Math.cos(a + 0.2) * r2 * 0.75, sy + Math.sin(a + 0.2) * r2);
    }
    ctx.stroke();
    ctx.restore();
    if (e.t < 0.05 || (Math.random() < 0.5 && p > 0.5)) burst(sx + camX + (Math.random() - 0.5) * 50, sy + camY + (Math.random() - 0.5) * 60, '#d6c0ff', 1, 120, 100);
  }

  A.draw = (camX, camY) => {
    const now = performance.now() / 1000;
    ctx.save();

    for (const h of holes) drawHole(h, camX, camY, now);

    for (const e of fx) {
      if (e.t < 0) continue;
      const p = e.t / e.life, sx = e.x - camX, sy = e.y - camY;
      if (e.k === 'ring') {
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = e.col || '#b890ff'; ctx.lineWidth = 6 * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(sx, sy, e.r * p, e.r * p * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (e.k === 'portal') {
        ctx.globalAlpha = 1; drawPortal(sx, sy, e.sc, p, now);
      } else if (e.k === 'ghost') { // tàn ảnh: bóng tím mờ dần tại chỗ cũ
        ctx.globalAlpha = 0.5 * (1 - p); ctx.fillStyle = '#7a4cff';
        ctx.beginPath(); ctx.ellipse(sx, sy - 24, 15 + p * 6, 28 + p * 6, 0, 0, Math.PI * 2); ctx.fill();
      } else if (e.k === 'crack') { // vết nứt không gian để lại rồi tan biến
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#d6c0ff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.save(); ctx.translate(sx, sy - ARROW_H); ctx.rotate(e.a + Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(5, -14); ctx.lineTo(-4, 4); ctx.lineTo(4, 22); ctx.lineTo(0, 38); ctx.stroke();
        ctx.restore();
      } else if (e.k === 'hit') {
        ctx.globalAlpha = 1 - p; ctx.globalCompositeOperation = 'lighter'; glow(sx, sy, 30 + p * 20, 0.7); ctx.globalCompositeOperation = 'source-over';
      } else if (e.k === 'mote') {
        const x = sx + (e.cx - e.x) * p, y = sy + (e.cy - e.y) * p * 0.5 + (e.cy - e.y) * 0; // bay vào tâm hố
        ctx.globalAlpha = 1 - p * 0.6; ctx.fillStyle = e.rock ? '#3a2a5a' : '#d6c0ff';
        ctx.fillRect(Math.round(x), Math.round(y - 6), 4, 4);
      } else if (e.k === 'cocoon') drawCocoon(e, camX, camY);
    }

    ctx.globalAlpha = 1;
    for (const b of slashes) { // Không Nhận: lưỡi liềm + đuôi mờ
      b.trail.forEach((q, i) => drawCrescent(q.x - camX, q.y - camY - ARROW_H, b.a, 0.9, (i / b.trail.length) * 0.25));
      const sx = b.x - camX, sy = b.y - camY - ARROW_H;
      ctx.globalCompositeOperation = 'lighter'; glow(sx, sy, 42, 0.45); ctx.globalCompositeOperation = 'source-over';
      drawCrescent(sx, sy, b.a, 1, 1);
    }

    if (ult && ult.phase === 'charge') { // ultimate_charge: vòng tròn bao quanh người chơi
      const p = ult.t / ult.s.chargeTime, sx = player.x - camX, sy = player.y - camY - 26;
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#d6c0ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, sy, 22 + p * 22, 32 + p * 22, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; glow(sx, sy, 60 * (0.5 + p), 0.4); ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 6; i++) { const a = now * 4 + i * 1.05; ctx.fillStyle = '#e8d8ff'; ctx.fillRect(Math.round(sx + Math.cos(a) * 40), Math.round(sy + Math.sin(a) * 52), 4, 4); }
    }
    ctx.restore();
  };

  return A;
})();
window.ArcaneMagic = ArcaneMagic;
