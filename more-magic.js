// ======================================================================
// 7 HỆ PHÉP MỚI cho Sách Phép (mỗi hệ 4 phép, phím Z X C V):
//   Sét        : Z Lôi Kích (tự ngắm quái gần nhất) · X Thiên Lôi · C Lôi Bộ · V Lôi Thần
//   Độc        : Z Độc Tiễn (Tấn Công) · X Độc Vực (Khống Chế) · C Độc Triệu (Triệu Hồi) · V Độc Chúa (Chiêu Cuối)
//   Đất        : Z Đấm Đất · X Khiên Đá · C Địa Chấn · V Thác Đá
//   Gió        : Z Phong Đẩy · X Phong Nhận · C Lốc Xoáy · V Phong Thần
//   Thánh Quang: Z Ánh Sáng Hồi Phục · X Thanh Tẩy · C Quang Giáp · V Thánh Quang Giáng Thế
//   Tự Nhiên   : Z Dây Leo Trói Buộc · X Sinh Mệnh Hoa · C Địa Chấn Rễ Cây · V Cổ Thụ Thần Linh
//   Hắc Ám     : Z Hắc Ám (Tấn Công) · X Hắc Vực (Khống Chế) · C Hắc Triệu (Triệu Hồi) · V Hắc Chúa (Chiêu Cuối)
//   (id poisonspit/poisonpool/poisonshield/poisonburst và lifedrain/darkorb/shadowrend/abyss giữ nguyên để save cũ không mất phép đã học)
// Chọn hệ ở bảng chọn hệ của ông phù thủy (nhấn E gần ông), rồi mua phép bằng ngọc lục bảo.
// Thông số chỉnh trong config.js (BALANCE.witch.skills, các phép có el: 'lightning' | 'poison' | 'earth' | 'wind' | 'holy' | 'dark').
// Đơn vị range / radius / reach là số Ô (1 ô = TILE pixel); time, dur, delay, cd là giây.
// Hiệu ứng vẽ bằng code (giống hệ Không Gian), không cần ảnh.
// Làm chậm / choáng: quái có xSlowT (giây còn lại) + xSlowMul (0 = đứng yên), đọc trong zombieWalk() của survival.js.
// Muốn gỡ: xoá more-magic.js, thẻ <script> trong survival.html và các dòng "ExtraMagic" trong survival.js / elements.js.
// ======================================================================
const ExtraMagic = (() => {
  const X = { mode: false, el: null, name: '' };
  const EL = {
    lightning: { name: 'hệ Sét',         c0: '255,255,210', c1: '60,190,255', a: '#fff7a8', b: '#5fd8ff' },
    poison:    { name: 'hệ Độc',         c0: '210,255,160', c1: '120,40,200', a: '#a6f04a', b: '#9a5cff' },
    earth:     { name: 'hệ Đất',         c0: '240,215,160', c1: '120,80,40',  a: '#d2a06a', b: '#7a5230' },
    wind:      { name: 'hệ Gió',         c0: '235,255,250', c1: '60,200,190', a: '#bff7ee', b: '#4fd8c8' },
    holy:      { name: 'hệ Thánh Quang', c0: '255,255,230', c1: '255,200,70', a: '#fff0a0', b: '#ffd24a' },
    dark:      { name: 'hệ Hắc Ám',      c0: '230,190,255', c1: '90,20,120',  a: '#c08aff', b: '#8a4aff' },
    nature:    { name: 'hệ Tự Nhiên',    c0: '230,255,190', c1: '50,180,60',   a: '#9cf56a', b: '#3fbf4a' },
  };
  const cd = {};                                   // hồi chiêu theo id phép
  let shots = [], areas = [], strikes = [], fx = [], minions = [], binds = [], rootLines = [], trees = []; // minions: Độc Linh / Oan Hồn do người chơi triệu hồi
  const TAU = Math.PI * 2;
  // Trạng thái bám theo người chơi (giây còn lại)
  const st = { stone: 0, lshield: 0, absorb: 0, speed: 0, mult: 1, hot: 0, hotMax: 1, hotRate: 0, hotAcc: 0, hotT: 0 };

  const skillsOf = (el) => WITCH.skills.filter((s) => s.el === el);
  const cfg = (id) => WITCH.skills.find((s) => s.id === id);
  const camOf = () => ({ x: Math.floor(player.x - canvas.width / 2), y: Math.floor(player.y - canvas.height / 2) });
  const aim = () => { const c = camOf(); return { x: mouse.x + c.x, y: mouse.y + c.y + ARROW_H }; }; // điểm trên mặt đất dưới con trỏ
  const ang = (t) => Math.atan2(t.y - player.y, t.x - player.x);
  const clampReach = (t, reach) => {
    const d = Math.hypot(t.x - player.x, t.y - player.y);
    return d <= reach ? { x: t.x, y: t.y } : { x: player.x + (t.x - player.x) * reach / d, y: player.y + (t.y - player.y) * reach / d };
  };
  function face(x, y) {
    const dx = x - player.x, dy = y - player.y;
    if (Math.abs(dx) > Math.abs(dy)) { player.faceX = Math.sign(dx) || 1; player.faceY = 0; }
    else { player.faceX = 0; player.faceY = Math.sign(dy) || 1; }
  }

  // Quái gần (ox, oy) nhất trong maxD (không bị tường chắn nếu needSight); pref = điểm ưu tiên (con trỏ) khi nhiều con cùng khoảng cách
  function nearestEnemy(ox, oy, maxD, needSight, pref, animalsToo) { // animalsToo: tính cả thú hoang (ưu tiên quái trước)
    let best = null, bs = 1e9;
    const consider = (m, isZ, x, y, an) => {
      const d = Math.hypot(x - ox, y - oy);
      if (d > maxD || (needSight && !lineClear(ox, oy, x, y))) return;
      const score = d + (an ? 250 : 0) + (pref ? Math.hypot(x - pref.x, y - pref.y) * 0.3 : 0);
      if (score < bs) { bs = score; best = { m, isZ, x, y, an: !!an }; }
    };
    for (const z of zombies) if (!z.dead) { const n = z.boss ? bossNearest(z, ox, oy) : z; consider(z, true, n.x, n.y - 10); }
    for (const sp of spiders) if (!sp.dead) consider(sp, false, sp.x, sp.y - 8);
    if (animalsToo && layer === 0) for (const an of animals) if (!an.tame) consider(an, false, an.x, an.y - 10, true);
    return best;
  }
  function autoTarget(s, t) { // Lôi Kích: tự ngắm quái gần nhất trong tầm, không có thì theo con trỏ
    const tg = nearestEnemy(player.x, player.y, s.range * TILE * 1.25, true, t);
    return tg ? { x: tg.x, y: tg.y } : t;
  }

  // ---------- Chế độ & phím ----------
  X.setElement = (id) => { X.el = EL[id] ? id : null; X.mode = !!X.el; X.name = X.el ? EL[X.el].name : ''; };
  X.owns = (el) => !!EL[el];
  X.reserves = (code) => X.mode && witchSt.book && !ui && skillsOf(X.el).some((s) => 'Key' + s.key === code);
  X.key = (code) => { // trả về true nếu phím đã được hệ đang bật xử lý
    if (!X.reserves(code)) return false;
    const s = skillsOf(X.el).find((k) => 'Key' + k.key === code);
    if (!witchSt.learned[s.id]) { say('Chưa học phép "' + s.name + '" — nói chuyện với Phù Thủy (E)'); return true; }
    castSpell(s.id);
    return true;
  };
  X.cdLeft = (id) => cd[id] || 0;
  const minLeft = (kind) => minions.reduce((mx, m) => (m.kind === kind ? Math.max(mx, m.life) : mx), 0);
  X.activeLeft = (id) => (id === 'stoneshield' ? st.stone : id === 'poisonshield' ? minLeft('pskull') : id === 'shadowrend' ? minLeft('wraith') : id === 'holyshield' ? st.lshield : id === 'windgod' ? st.speed : id === 'lifebloom' ? st.hot : id === 'ancienttree' ? trees.reduce((mx, t) => Math.max(mx, t.life - t.t), 0) : id === 'vinebind' ? binds.reduce((mx, b) => (b.rt ? mx : Math.max(mx, b.life - b.t)), 0) : 0);
  X.stoneUp = () => st.stone > 0; // Khiên Đá đang bật (đếm đòn chặn cho nhiệm vụ Địa Chấn)
  X.cutMul = () => (st.stone > 0 ? 1 - cfg('stoneshield').cut : 1); // nhân vào sát thương nhận
  X.speedMul = () => (st.speed > 0 ? st.mult : 1);                                                                   // nhân vào tốc độ chạy
  X.shieldUp = () => st.lshield > 0 && st.absorb > 0; // Quang Giáp đang bật (đếm đòn hấp thụ cho nhiệm vụ Thánh Quang Giáng Thế)
  X.absorb = (dmg) => { // Quang Giáp: hấp thụ sát thương trước khi trừ máu
    if (!(st.lshield > 0 && st.absorb > 0)) return dmg;
    const take = Math.min(st.absorb, dmg);
    st.absorb -= take;
    floaters.push({ x: player.x, y: player.y - 56, text: 'chặn ' + take, life: 0.9, color: '#ffe98a' });
    burst(player.x, player.y - 24, '#fff0a0', 6, 120, -60);
    if (st.absorb <= 0) st.lshield = 0;
    return dmg - take;
  };

  // Gọi từ castSpell(). Trả về false nếu không dùng được (không trừ mana).
  X.cast = (s) => {
    if (layer === 2) { say('Không dùng phép trong nhà'); return false; }
    if (cd[s.id] > 0) { say('"' + s.name + '" còn hồi chiêu ' + Math.ceil(cd[s.id]) + ' giây'); return false; }
    const fn = CAST[s.id];
    if (!fn || fn(s, aim()) === false) return false;
    cd[s.id] = s.cd;
    return true;
  };

  // ---------- Sát thương / hiệu ứng trạng thái ----------
  // opt: soft (không đẩy lùi / không ngắt đòn) · knock (lực đẩy) · stun (giây choáng) · slow + mul (làm chậm) · poison { dmg, time }
  function damage(m, isZ, dmg, ox, oy, opt = {}) {
    if (m.dead) return 0;
    const hp0 = m.hp, kx = m.kx, ky = m.ky, at = m.atkT, ht = m.hurtT;
    if (dmg > 0) { if (isZ) hitZombie(m, dmg); else hitSpider(m, dmg); }
    const dealt = dmg > 0 ? Math.max(0, hp0 - Math.max(0, m.hp)) : 0;
    if (opt.soft && !m.dead) { m.kx = kx; m.ky = ky; m.atkT = at; m.hurtT = ht; }
    if (m.dead && isZ && !m.boss && opt.src === 'windpush' && !m.windCounted && !witchFlags.windKill) { // đếm zombie bị Phong Đẩy hạ để mở học Lốc Xoáy (cần 10 con)
      m.windCounted = true;
      witchFlags.windN = Math.min(10, witchFlags.windN + 1);
      floaters.push({ x: m.x, y: m.y - 60, text: 'Phong Đẩy hạ ' + witchFlags.windN + '/10', life: 1.3, color: '#9fe8d8' });
      if (witchFlags.windN >= 10) { witchFlags.windKill = true; say('Đã dùng Phong Đẩy hạ 10 zombie! Phù Thủy có thể dạy Lốc Xoáy'); }
    }
    if (m.dead) return dealt;
    if (opt.knock) {
      const a = Math.atan2(m.y - oy, m.x - ox), k = opt.knock * (m.boss ? 0.08 : 1);
      m.kx = Math.cos(a) * k; m.ky = Math.sin(a) * k;
      if (!m.boss) m.hurtT = Math.max(m.hurtT || 0, 0.3);
    }
    if (!m.boss) { // boss miễn nhiễm choáng / làm chậm
      if (opt.stun) { m.xSlowT = Math.max(m.xSlowT || 0, opt.stun); m.xSlowMul = 0; m.hurtT = Math.max(m.hurtT || 0, opt.stun); m.atkT = 0; }
      else if (opt.slow && m.xSlowMul !== 0) { m.xSlowT = Math.max(m.xSlowT || 0, opt.slow); m.xSlowMul = opt.mul || 0.6; }
    }
    if (opt.poison) { m.pzT = Math.max(m.pzT || 0, opt.poison.time); m.pzDmg = opt.poison.dmg; }
    return dealt;
  }
  function forEnemies(ox, oy, test, fn) { // test(x, y): điểm gần nhất của quái có nằm trong vùng không (boss tính theo hộp va chạm)
    for (const z of zombies) { if (z.dead) continue; const n = z.boss ? bossNearest(z, ox, oy) : z; if (test(n.x, n.y)) fn(z, true); }
    for (const sp of spiders) if (!sp.dead && test(sp.x, sp.y)) fn(sp, false);
  }
  function hitArea(x, y, r, dmg, opt = {}) { // trả về tổng sát thương thực gây ra
    let total = 0;
    forEnemies(x, y, (px, py) => Math.hypot(px - x, py - y) <= r, (m, isZ) => {
      total += damage(m, isZ, dmg, x, y, opt);
      if (!opt.soft) fx.push({ k: 'hit', x: m.x, y: m.y - 24, t: 0, life: 0.35, el: opt.el });
    });
    if (dmg > 0 && layer === 0 && !opt.noAnimals) for (const an of animals) if (!an.tame && Math.hypot(an.x - x, an.y - y) <= r) attackAnimal(an, dmg);
    return total;
  }
  function hitCone(s, t, opt) { // vùng quạt trước mặt người chơi
    const a = ang(t), R = s.range * TILE, half = (s.arc || 120) * Math.PI / 360;
    let total = 0;
    forEnemies(player.x, player.y, (px, py) => {
      const d = Math.hypot(px - player.x, py - player.y);
      if (d > R) return false;
      if (d < 36) return true;
      let da = Math.abs(Math.atan2(py - player.y, px - player.x) - a); if (da > Math.PI) da = Math.PI * 2 - da;
      return da <= half;
    }, (m, isZ) => { total += damage(m, isZ, s.dmg, player.x, player.y, opt); fx.push({ k: 'hit', x: m.x, y: m.y - 24, t: 0, life: 0.35, el: opt.el }); });
    if (layer === 0) for (const an of animals) if (!an.tame && Math.hypot(an.x - player.x, an.y - player.y) <= R) { let da = Math.abs(Math.atan2(an.y - player.y, an.x - player.x) - a); if (da > Math.PI) da = Math.PI * 2 - da; if (da <= half) attackAnimal(an, s.dmg); }
    return total;
  }
  function pull(m, a, dt) {
    const dx = a.x - m.x, dy = a.y - m.y, d = Math.hypot(dx, dy);
    if (d < 6) return;
    const sp = a.pull * (m.boss ? 0.12 : 1) * dt;   // boss chỉ bị kéo nhẹ
    const nx = m.x + dx / d * Math.min(sp, d), ny = m.y + dy / d * Math.min(sp, d);
    if (!collides(nx, m.y)) m.x = nx;
    if (!collides(m.x, ny)) m.y = ny;
  }
  function heal(amount) {
    const before = player.hp;
    player.hp = Math.min(MAX_HP, player.hp + amount);
    const got = Math.round(player.hp - before);
    if (got > 0) floaters.push({ x: player.x, y: player.y - 50, text: '+' + got, life: 1.2, color: '#4cd964' });
    return got;
  }
  function cleanse() {
    if (typeof bleed !== 'undefined') bleed = null;
    if (typeof burnT !== 'undefined' && burnT > 0) burnT = 0;
  }
  const addRing = (x, y, r, el, delay = 0, life = 0.5) => fx.push({ k: 'ring', x, y, r, t: -delay, life, el });
  function sparks(x, y, el, n, big) { burst(x, y - 20, EL[el].a, n, big ? 260 : 170, 120); burst(x, y - 20, EL[el].b, Math.ceil(n / 2), big ? 200 : 130, 60); }
  function shield(key, dur) { st[key] = dur; }

  // ---------- Bắn đạn ----------
  function fireShot(kind, s, x0, y0, a, el) { // s cần: speed, range, dmg (+ width, pierce, splash, pzDmg, pzTime, steal tuỳ loại)
    shots.push({ kind, el, s, a, x: x0 + Math.cos(a) * 20, y: y0 + Math.sin(a) * 20, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, dist: 0, hit: new Set(), left: s.pierce || 1, n: 0, trail: [] });
  }
  function launch(kind, s, t, el, off = 0) { // off: lệch góc (rad) để bắn loạt
    face(t.x, t.y);
    const a = ang(t) + off;
    fireShot(kind, s, player.x, player.y, a, el);
    sparks(player.x + Math.cos(a) * 22, player.y - 12, el, 6, false);
    return a;
  }
  function poisonPop(x, y, s) { // mũi tên độc nổ: sát thương nhỏ + nhiễm độc + gai độc nhô lên
    hitArea(x, y, s.splash * TILE, s.dmg, { poison: { dmg: s.pzDmg, time: s.pzTime }, el: 'poison' });
    for (let i = 0; i < 8; i++) burst(x, y - ARROW_H, i % 2 ? '#a6f04a' : '#9a5cff', 1, 120, 80);
    addRing(x, y, s.splash * TILE, 'poison', 0, 0.4);
    fx.push({ k: 'spikes', el: 'poison', x, y, r: Math.max(34, s.splash * TILE), n: 7, t: 0, life: 0.45, seed: Math.random() * 6 });
  }
  function shotHit(b) { // trả về true nếu đạn hết xuyên / nổ
    const rad = b.s.width || 18;
    const touch = (m, isZ) => {
      if (m.dead || b.hit.has(m)) return false;
      const rx = (m.boss ? bossHB(m).rx : isZ ? 18 : 20) + rad, up = (m.boss ? bossHB(m).up : isZ ? 44 : 22) + rad;
      const dx = b.x - m.x, dy = b.y - m.y;
      return Math.abs(dx) < rx && dy > -up && dy < 12 + rad;
    };
    let done = false;
    const strike = (m, isZ) => {
      if (done || !touch(m, isZ)) return;
      b.hit.add(m);
      if (b.kind === 'spit') { poisonPop(b.x, b.y, b.s); done = true; return; } // mũi tên độc: nổ ngay lần chạm đầu tiên
      const dealt = damage(m, isZ, Math.max(1, Math.round(b.s.dmg)), b.x, b.y, b.kind === 'gale' ? { knock: b.s.knock || 120 } : { stun: b.kind === 'bolt' ? 0.25 : 0 });
      if (b.kind === 'slash' && dealt > 0) heal(Math.max(1, Math.round(dealt * b.s.steal))); // Hắc Ám: hút máu
      fx.push({ k: 'hit', x: m.x, y: m.y - 24, t: 0, life: 0.35, el: b.el });
      b.n++; b.left--;
      if (b.left <= 0) done = true;
    };
    for (const z of zombies) strike(z, true);
    for (const sp of spiders) strike(sp, false);
    if (layer === 0) for (const an of animals) { // đạn cũng trúng thú hoang (thú đã thuần thì bỏ qua)
      if (done || an.tame || !touch(an, false)) continue;
      b.hit.add(an);
      attackAnimal(an, Math.max(1, Math.round(b.s.dmg)));
      if (b.kind === 'spit') { poisonPop(b.x, b.y, b.s); done = true; break; } // mũi tên độc nổ gai ngay tại thú
      fx.push({ k: 'hit', x: an.x, y: an.y - 24, t: 0, life: 0.35, el: b.el });
      b.left--;
      if (b.left <= 0) done = true;
    }
    return done;
  }

  // ---------- Danh sách phép ----------
  const CAST = {
    // ===== SÉT =====
    thunderbolt(s, t) { launch('bolt', s, s.autoAim ? autoTarget(s, t) : t, 'lightning'); }, // Z: tự ngắm quái gần nhất
    skystrike(s, t) {
      const p = clampReach(t, s.reach * TILE); face(t.x, t.y);
      strikes.push({ kind: 'sky', el: 'lightning', x: p.x, y: p.y, t: 0, delay: s.delay, s });
    },
    thunderstep(s, t) {
      const a = ang(t), max = s.range * TILE;
      let bx = player.x, by = player.y;
      for (let k = 6; k <= max; k += 6) { // đi từng bước nhỏ, gặp tường thì dừng (không xuyên tường)
        const nx = player.x + Math.cos(a) * k, ny = player.y + Math.sin(a) * k;
        if (collides(nx, ny)) break;
        bx = nx; by = ny;
      }
      if (Math.hypot(bx - player.x, by - player.y) < 12) { say('Bị chắn, không lướt được'); return false; }
      face(t.x, t.y);
      const x0 = player.x, y0 = player.y, seen = new Set(), steps = Math.ceil(Math.hypot(bx - x0, by - y0) / 24);
      for (let i = 0; i <= steps; i++) { // điện giật quái trên đường lướt (mỗi con một lần)
        const px = x0 + (bx - x0) * i / steps, py = y0 + (by - y0) * i / steps;
        forEnemies(px, py, (qx, qy) => Math.hypot(qx - px, qy - py) <= 36, (m, isZ) => {
          if (seen.has(m)) return; seen.add(m);
          damage(m, isZ, s.dmg, px, py, { stun: s.stun });
          fx.push({ k: 'hit', x: m.x, y: m.y - 24, t: 0, life: 0.35, el: 'lightning' });
        });
        if (layer === 0) for (const an of animals) {
          if (an.tame || seen.has(an) || Math.hypot(an.x - px, an.y - 10 - py) > 36) continue;
          seen.add(an); attackAnimal(an, Math.max(1, Math.round(s.dmg)));
          fx.push({ k: 'hit', x: an.x, y: an.y - 24, t: 0, life: 0.35, el: 'lightning' });
        }
      }
      fx.push({ k: 'zap', x0, y0: y0 - 22, x1: bx, y1: by - 22, t: 0, life: 0.35 });
      fx.push({ k: 'ghost', el: 'lightning', x: x0, y: y0, t: 0, life: 0.45 });
      player.x = bx; player.y = by;
      player.invuln = Math.max(player.invuln, s.inv || 0.2);
      addRing(bx, by, 60, 'lightning'); sparks(bx, by, 'lightning', 12, false);
    },
    thundergod(s, t) {
      const p = clampReach(t, s.reach * TILE); face(t.x, t.y);
      strikes.push({ kind: 'god', el: 'lightning', x: p.x, y: p.y, t: 0, delay: s.delay, s });
      addRing(player.x, player.y, 80, 'lightning'); sparks(player.x, player.y, 'lightning', 14, true);
    },

    // ===== ĐỘC ===== (Tấn Công · Khống Chế · Triệu Hồi · Chiêu Cuối)
    poisonspit(s, t) { // Z Độc Tiễn: loạt mũi tên độc xòe quạt
      const n = s.arrows || 1;
      for (let i = 0; i < n; i++) launch('spit', s, t, 'poison', (i - (n - 1) / 2) * (s.spread || 0) * Math.PI / 180);
    },
    poisonpool(s, t) { // X Độc Vực: vực độc có ma trận, lửa độc, khói tím; làm chậm mạnh + nhiễm độc
      const p = clampReach(t, s.reach * TILE); face(t.x, t.y);
      areas.push({ kind: 'pool', el: 'poison', x: p.x, y: p.y, r: s.radius * TILE, t: 0, time: s.time, tick: s.tick, acc: 0, dmg: s.dmg, slow: s.slow, mul: s.slowMul, pz: { dmg: s.pzDmg || 1, time: 1.5 }, seed: Math.random() * 6 });
      addRing(p.x, p.y, s.radius * TILE, 'poison'); addRing(p.x, p.y, s.radius * TILE * 0.6, 'poison', 0.08);
      fx.push({ k: 'spikes', el: 'poison', x: p.x, y: p.y, r: s.radius * TILE, n: 12, t: 0, life: 0.5, seed: Math.random() * 6 });
      sparks(p.x, p.y, 'poison', 12, false);
    },
    poisonshield(s) { summon('pskull', s, 'poison'); }, // C Độc Triệu: Độc Linh (đầu lâu độc) bay quanh người, nhả đạn độc
    poisonburst(s, t) { // V Độc Chúa: ma trận hiện ra, đầu lâu khổng lồ trồi lên rồi nổ
      const p = clampReach(t, s.reach * TILE); face(t.x, t.y);
      strikes.push({ kind: 'pburst', el: 'poison', x: p.x, y: p.y, t: 0, delay: s.delay, s });
      fx.push({ k: 'rune', el: 'poison', x: player.x, y: player.y, r: 80, t: 0, life: s.delay + 0.4 });
      addRing(player.x, player.y, 80, 'poison'); sparks(player.x, player.y, 'poison', 14, true);
    },

    // ===== ĐẤT =====
    earthpunch(s, t) {
      const a = ang(t); face(t.x, t.y);
      hitCone(s, t, { knock: s.knock, el: 'earth' });
      const hx = player.x + Math.cos(a) * s.range * TILE * 0.55, hy = player.y + Math.sin(a) * s.range * TILE * 0.55;
      fx.push({ k: 'arc', el: 'earth', x: player.x, y: player.y, a, half: s.arc * Math.PI / 360, r: s.range * TILE, t: 0, life: 0.35 });
      for (let i = 0; i < 12; i++) burst(hx, hy - 8, i % 3 ? '#d2a06a' : '#7a5230', 1, 190, 500);
      shake = Math.max(shake, 0.2);
    },
    stoneshield(s) {
      shield('stone', s.dur);
      addRing(player.x, player.y, 80, 'earth');
      for (let i = 0; i < 12; i++) burst(player.x, player.y - 8, '#d2a06a', 1, 160, 400);
    },
    quake(s) {
      const R = s.radius * TILE;
      hitArea(player.x, player.y, R, s.dmg, { knock: s.knock, stun: s.stun, el: 'earth' });
      fx.push({ k: 'cracks', el: 'earth', x: player.x, y: player.y, r: R, t: 0, life: 0.8, seed: Math.random() * 6 });
      addRing(player.x, player.y, R, 'earth'); addRing(player.x, player.y, R * 0.6, 'earth', 0.08);
      for (let i = 0; i < 24; i++) burst(player.x + (Math.random() - 0.5) * R, player.y + (Math.random() - 0.5) * R * 0.5, i % 3 ? '#d2a06a' : '#7a5230', 1, 200, 500);
      shake = Math.max(shake, 0.5);
    },
    rockfall(s, t) {
      const p = clampReach(t, s.reach * TILE); face(t.x, t.y);
      for (let i = 0; i < s.rocks; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s.radius * TILE;
        strikes.push({ kind: 'rock', el: 'earth', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7, t: -(i * (s.time / s.rocks)), delay: 0.55, s });
      }
      addRing(p.x, p.y, s.radius * TILE, 'earth');
    },

    // ===== GIÓ =====
    windpush(s, t) {
      const a = ang(t); face(t.x, t.y);
      hitCone(s, t, { knock: s.knock, el: 'wind', src: 'windpush' });
      for (let i = 0; i < 3; i++) fx.push({ k: 'gust', el: 'wind', x: player.x, y: player.y, a, r: s.range * TILE, t: -i * 0.07, life: 0.45 });
      for (let i = 0; i < 10; i++) burst(player.x + Math.cos(a) * 40, player.y - 20, i % 2 ? '#bff7ee' : '#7fd070', 1, 220, 20);
    },
    windblade(s, t) { launch('gale', s, t, 'wind'); },
    tornado(s, t) {
      const p = clampReach(t, s.reach * TILE); face(t.x, t.y);
      areas.push({ kind: 'tornado', el: 'wind', x: p.x, y: p.y, r: s.radius * TILE, t: 0, time: s.time, tick: s.tick, acc: 0, dmg: s.dmg, pull: s.pull, slow: 0.6, mul: 0.5, seed: Math.random() * 6 });
      addRing(p.x, p.y, s.radius * TILE, 'wind');
    },
    windgod(s) {
      const R = s.radius * TILE;
      hitArea(player.x, player.y, R, s.dmg, { knock: s.knock, el: 'wind' });
      for (let i = 0; i < 3; i++) addRing(player.x, player.y, R * (1 - i * 0.2), 'wind', i * 0.08, 0.6);
      fx.push({ k: 'vortex', el: 'wind', x: player.x, y: player.y, r: R, t: 0, life: 0.8 });
      st.speed = s.dur; st.mult = s.mult;
      for (let i = 0; i < 24; i++) burst(player.x, player.y - 20, i % 2 ? '#bff7ee' : '#7fd070', 1, 280, 0);
      shake = Math.max(shake, 0.3);
    },

    // ===== THÁNH QUANG =====
    lightheal(s) {
      if (player.hp >= MAX_HP) { say('Máu đã đầy'); return false; }
      heal(Math.round(MAX_HP * s.heal));
      fx.push({ k: 'pillar', el: 'holy', x: player.x, y: player.y, w: 26, t: 0, life: 0.7 });
      sparks(player.x, player.y, 'holy', 14, false);
    },
    purify(s) {
      cleanse();
      heal(Math.round(MAX_HP * s.heal));
      hitArea(player.x, player.y, s.radius * TILE, s.dmg, { knock: s.knock, el: 'holy' });
      addRing(player.x, player.y, s.radius * TILE, 'holy'); addRing(player.x, player.y, s.radius * TILE * 0.6, 'holy', 0.08);
      sparks(player.x, player.y, 'holy', 18, true);
      say('Thanh Tẩy: đã xóa chảy máu / cháy');
    },
    holyshield(s) {
      shield('lshield', s.dur);
      st.absorb = Math.round(MAX_HP * s.absorb);
      addRing(player.x, player.y, 90, 'holy'); sparks(player.x, player.y, 'holy', 14, false);
    },
    descent(s) {
      const R = s.radius * TILE;
      cleanse();
      heal(Math.round(MAX_HP * s.heal));
      const ab = Math.round(MAX_HP * s.absorb);
      if (ab >= st.absorb) { st.absorb = ab; st.lshield = s.dur; }
      hitArea(player.x, player.y, R, s.dmg, { knock: s.knock, stun: s.stun, el: 'holy' });
      fx.push({ k: 'pillar', el: 'holy', x: player.x, y: player.y, w: 60, t: 0, life: 1.3, wings: true });
      for (let i = 0; i < 3; i++) addRing(player.x, player.y, R * (1 - i * 0.22), 'holy', i * 0.1, 0.7);
      sparks(player.x, player.y, 'holy', 30, true);
      shake = Math.max(shake, 0.25);
    },

    // ===== HẮC ÁM ===== (Tấn Công · Khống Chế · Triệu Hồi · Chiêu Cuối)
    lifedrain(s, t) { launch('slash', s, t, 'dark'); }, // Z Hắc Ám: vệt chém lưỡi liềm bóng tối, xuyên mục tiêu, hút máu
    darkorb(s, t) { // X Hắc Vực: ma trận đen, gai hắc ám, xích trói quái và kéo về tâm
      const p = clampReach(t, s.reach * TILE), R = s.radius * TILE; face(t.x, t.y);
      hitArea(p.x, p.y, R, 0, { stun: s.stun, soft: true, noAnimals: true, el: 'dark' }); // trói ngay khi mở vực
      areas.push({ kind: 'abyss', el: 'dark', x: p.x, y: p.y, r: R, t: 0, time: s.time, tick: s.tick, acc: 0, dmg: s.dmg, pull: s.pull, steal: s.steal, seed: Math.random() * 6 });
      addRing(p.x, p.y, R, 'dark'); addRing(p.x, p.y, R * 0.6, 'dark', 0.08);
      fx.push({ k: 'spikes', el: 'dark', x: p.x, y: p.y, r: R, n: 12, t: 0, life: 0.5, seed: Math.random() * 6 });
      sparks(p.x, p.y, 'dark', 12, false);
    },
    shadowrend(s) { summon('wraith', s, 'dark'); }, // C Hắc Triệu: 2 Oan Hồn lao vào cắn quái, hồi máu cho người chơi
    abyss(s, t) { // V Hắc Chúa: ma trận + lưỡi kiếm bóng tối trồi lên, mặt trời đen nổ
      const p = clampReach(t, s.reach * TILE); face(t.x, t.y);
      strikes.push({ kind: 'dking', el: 'dark', x: p.x, y: p.y, t: 0, delay: s.delay, s });
      fx.push({ k: 'rune', el: 'dark', x: player.x, y: player.y, r: 80, t: 0, life: s.delay + 0.4 });
      addRing(player.x, player.y, 80, 'dark'); sparks(player.x, player.y, 'dark', 14, true);
    },

    // ===== TỰ NHIÊN ===== (Khống Chế · Hồi Phục · Sát Thương diện rộng · Triệu Hồi)
    vinebind(s, t) { // Z Dây Leo Trói Buộc: trói một mục tiêu gần con trỏ
      const tg = nearestEnemy(player.x, player.y, s.reach * TILE, true, t, true);
      if (!tg) { say('Không có mục tiêu trong tầm'); return false; }
      face(tg.x, tg.y);
      binds.push({ m: tg.m, isZ: tg.isZ, an: tg.an, s, t: 0, life: s.time, acc: 0, refresh: 0, seed: Math.random() * 6 });
      fx.push({ k: 'rune', el: 'nature', x: player.x, y: player.y, r: 56, t: 0, life: 0.7 });
      sparks(player.x, player.y, 'nature', 8, false);
    },
    lifebloom(s) { // X Sinh Mệnh Hoa: hồi máu dần trong s.time giây
      if (player.hp >= MAX_HP) { say('Máu đã đầy'); return false; }
      st.hot = st.hotMax = s.time; st.hotRate = MAX_HP * s.heal / s.time; st.hotAcc = 0; st.hotT = 0;
      addRing(player.x, player.y, 70, 'nature'); sparks(player.x, player.y, 'nature', 14, false);
    },
    rootquake(s, t) { // C Địa Chấn Rễ Cây: một đường rễ trồi lên phía trước
      const a = ang(t); face(t.x, t.y);
      let len = 0; const max = s.range * TILE;
      for (let k = 12; k <= max; k += 12) { if (collides(player.x + Math.cos(a) * k, player.y + Math.sin(a) * k)) break; len = k; } // gặp tường thì dừng
      len = Math.max(len, 36);
      rootLines.push({ x: player.x, y: player.y, a, s, t: 0, len, speed: len / 0.45, hit: new Set(), segs: 0, seed: Math.random() * 6 });
      fx.push({ k: 'rune', el: 'nature', x: player.x, y: player.y, r: 50, t: 0, life: 0.5 });
      shake = Math.max(shake, 0.3);
    },
    ancienttree(s, t) { // V Cổ Thụ Thần Linh
      const p = clampReach(t, s.reach * TILE); face(t.x, t.y);
      trees = [{ x: p.x, y: p.y, s, t: 0, life: s.delay + s.time, atk: 0, pulse: 0, seed: Math.random() * 6 }];
      fx.push({ k: 'rune', el: 'nature', x: p.x, y: p.y, r: 96, t: 0, life: s.delay + 0.4 });
      addRing(p.x, p.y, 96, 'nature'); sparks(p.x, p.y, 'nature', 18, true);
    },
  };

  // ---------- Triệu hồi: Độc Linh (đầu lâu độc, bắn xa) · Oan Hồn (bóng tối, lao vào cắn) ----------
  function summon(kind, s, el) { // dùng lại phép thì thay đàn cũ bằng đàn mới
    minions = minions.filter((m) => m.kind !== kind);
    const n = s.count || 1;
    for (let i = 0; i < n; i++) minions.push({ kind, el, s, x: player.x + (i % 2 ? 30 : -30), y: player.y, t: 0, life: s.dur, atk: 0.5, ph: (i * TAU) / n, face: 1, cast: 0, seed: Math.random() * 6 });
    fx.push({ k: 'rune', el, x: player.x, y: player.y, r: 74, t: 0, life: 0.9 });
    addRing(player.x, player.y, 74, el); sparks(player.x, player.y, el, 16, true);
  }
  function updateMinions(dt) {
    for (let i = minions.length - 1; i >= 0; i--) {
      const m = minions[i], s = m.s;
      m.t += dt; m.life -= dt; m.atk -= dt; m.cast = Math.max(0, m.cast - dt);
      if (m.life <= 0) { sparks(m.x, m.y - 20, m.el, 10, false); addRing(m.x, m.y, 40, m.el, 0, 0.4); minions.splice(i, 1); continue; }
      const orbit = (rx, ry, w, k) => { // bay quanh người chơi
        const a = m.t * w + m.ph, tx = player.x + Math.cos(a) * rx, ty = player.y + Math.sin(a) * ry, kk = Math.min(1, dt * k);
        m.x += (tx - m.x) * kk; m.y += (ty - m.y) * kk;
      };
      if (m.kind === 'pskull') {
        orbit(54, 22, 1.1, 5);
        if (m.atk <= 0) {
          const tg = nearestEnemy(m.x, m.y, s.range * TILE, true, null, true);
          if (tg) {
            m.atk = s.rate; m.cast = 0.3;
            const a = Math.atan2(tg.y - m.y, tg.x - m.x); m.face = Math.cos(a) >= 0 ? 1 : -1;
            fireShot('spit', { dmg: s.dmg, splash: 0.6, pzDmg: s.pzDmg, pzTime: s.pzTime, speed: 560, range: s.range + 1, width: 12 }, m.x, m.y, a, 'poison');
          }
        }
      } else { // oan hồn
        const tg = nearestEnemy(player.x, player.y, 7 * TILE, false, null, true);
        if (tg) {
          const d = Math.hypot(tg.x - m.x, tg.y - m.y);
          if (d > 26) { const sp = s.speed * dt; m.x += (tg.x - m.x) / d * sp; m.y += (tg.y - m.y) / d * sp; m.face = tg.x >= m.x ? 1 : -1; }
          else if (m.atk <= 0) {
            m.atk = 0.8; m.cast = 0.3;
            let dealt = 0;
            if (tg.an) { dealt = Math.max(1, Math.round(s.dmg)); attackAnimal(tg.m, dealt); }
            else dealt = damage(tg.m, tg.isZ, s.dmg, m.x, m.y, { knock: 60 });
            if (dealt > 0) heal(Math.max(1, Math.round(dealt * s.steal)));
            fx.push({ k: 'hit', x: tg.m.x, y: tg.m.y - 24, t: 0, life: 0.35, el: 'dark' });
            sparks(tg.x, tg.y + 10, 'dark', 6, false);
          }
        } else orbit(70, 30, 0.9, 3);
      }
    }
  }

  // ---------- Đòn giáng xuống sau độ trễ ----------
  function land(e) {
    const s = e.s, R = (s.radius || s.rockRadius || 1) * TILE;
    if (e.kind === 'sky' || e.kind === 'god') {
      const big = e.kind === 'god';
      hitArea(e.x, e.y, R, s.dmg, { stun: s.stun, el: 'lightning' });
      fx.push({ k: 'bolt', el: 'lightning', x: e.x, y: e.y, t: 0, life: big ? 0.7 : 0.4, big });
      addRing(e.x, e.y, R, 'lightning'); if (big) addRing(e.x, e.y, R * 0.6, 'lightning', 0.08);
      sparks(e.x, e.y, 'lightning', big ? 30 : 16, big);
      if (big) fx.push({ k: 'flash', t: 0, life: 0.4 });
      shake = Math.max(shake, big ? 0.6 : 0.3);
    } else if (e.kind === 'pburst') { // Độc Chúa
      hitArea(e.x, e.y, R, s.dmg, { poison: { dmg: s.pzDmg, time: s.pzTime }, el: 'poison' });
      areas.push({ kind: 'pool', el: 'poison', x: e.x, y: e.y, r: R, t: 0, time: s.cloudTime, tick: 0.5, acc: 0, dmg: 1, slow: 0.6, mul: 0.6, pz: { dmg: s.pzDmg, time: 1.5 }, seed: Math.random() * 6 });
      addRing(e.x, e.y, R, 'poison'); addRing(e.x, e.y, R * 0.6, 'poison', 0.08); addRing(e.x, e.y, R * 1.2, 'poison', 0.16, 0.7);
      fx.push({ k: 'skullburst', el: 'poison', x: e.x, y: e.y, r: R, t: 0, life: 0.9 });
      fx.push({ k: 'spikes', el: 'poison', x: e.x, y: e.y, r: R, n: 18, t: 0, life: 0.8, seed: Math.random() * 6 });
      sparks(e.x, e.y, 'poison', 30, true);
      shake = Math.max(shake, 0.45);
    } else if (e.kind === 'dking') { // Hắc Chúa
      const dealt = hitArea(e.x, e.y, R, s.dmg, { stun: s.stun, el: 'dark' });
      if (dealt > 0) heal(Math.max(1, Math.round(dealt * s.steal)));
      addRing(e.x, e.y, R, 'dark'); addRing(e.x, e.y, R * 0.6, 'dark', 0.08); addRing(e.x, e.y, R * 1.25, 'dark', 0.16, 0.7);
      fx.push({ k: 'sunburst', el: 'dark', x: e.x, y: e.y, r: R, t: 0, life: 0.9 });
      fx.push({ k: 'spikes', el: 'dark', x: e.x, y: e.y, r: R, n: 18, t: 0, life: 0.8, seed: Math.random() * 6 });
      fx.push({ k: 'flash', t: 0, life: 0.35 });
      sparks(e.x, e.y, 'dark', 30, true);
      shake = Math.max(shake, 0.6);
    } else if (e.kind === 'rock') {
      hitArea(e.x, e.y, R, s.dmg, { stun: s.stun, el: 'earth' });
      addRing(e.x, e.y, R, 'earth', 0, 0.35);
      for (let i = 0; i < 9; i++) burst(e.x, e.y - 6, i % 3 ? '#d2a06a' : '#7a5230', 1, 170, 500);
      shake = Math.max(shake, 0.18);
    }
  }

  // ---------- Cập nhật ----------
  X.update = (dt) => {
    for (const k in cd) cd[k] = Math.max(0, cd[k] - dt);
    for (const k of ['stone', 'lshield', 'speed']) st[k] = Math.max(0, st[k] - dt);
    if (st.lshield <= 0) st.absorb = 0;

    // Trạng thái trên quái: làm chậm / choáng + nhiễm độc
    for (const list of [zombies, spiders]) {
      const isZ = list === zombies;
      for (const m of list) {
        if (m.dead) { m.pzT = 0; m.xSlowT = 0; continue; }
        if (m.xSlowT > 0) m.xSlowT -= dt;
        if (!(m.pzT > 0)) continue;
        m.pzT -= dt; m.pzTick = (m.pzTick || 0) + dt;
        if (m.pzTick >= 0.5) {
          m.pzTick -= 0.5;
          damage(m, isZ, m.pzDmg || 1, m.x, m.y, { soft: true });
          burst(m.x, m.y - 30, Math.random() < 0.5 ? '#a6f04a' : '#9a5cff', 2, 50, -80);
        }
      }
    }

    // Độc Linh / Oan Hồn
    updateMinions(dt);

    // Đạn
    for (let i = shots.length - 1; i >= 0; i--) {
      const b = shots[i];
      let done = false;
      for (let k = 0; k < 3 && !done; k++) {
        b.x += b.vx * dt / 3; b.y += b.vy * dt / 3; b.dist += b.s.speed * dt / 3;
        if (b.dist > b.s.range * TILE || isSolid(Math.floor(b.x / TILE), Math.floor(b.y / TILE))) done = true;
        else if (shotHit(b)) done = true;
      }
      b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 8) b.trail.shift();
      if (Math.random() < 0.7) burst(b.x, b.y - ARROW_H, Math.random() < 0.5 ? EL[b.el].a : EL[b.el].b, 1, 50, 20);
      if (done) {
        if (b.kind === 'spit' && !b.hit.size) poisonPop(b.x, b.y, b.s); // trượt: nổ ở chỗ rơi
        if (b.kind === 'slash') fx.push({ k: 'spikes', el: 'dark', x: b.x, y: b.y, r: 64, n: 9, t: 0, life: 0.5, seed: Math.random() * 6 }); // cuối vệt chém: gai hắc ám nhô lên
        sparks(b.x, b.y, b.el, 8, false);
        shots.splice(i, 1);
      }
    }

    // Đòn giáng xuống
    for (let i = strikes.length - 1; i >= 0; i--) {
      const e = strikes[i];
      e.t += dt;
      if (e.t >= e.delay) { land(e); strikes.splice(i, 1); }
    }

    // Vùng tồn tại theo thời gian
    for (let i = areas.length - 1; i >= 0; i--) {
      const a = areas[i];
      a.t += dt; a.acc += dt;
      const inside = (px, py) => Math.hypot(px - a.x, py - a.y) <= a.r;
      if (a.pull) forEnemies(a.x, a.y, inside, (m) => pull(m, a, dt));
      while (a.acc >= a.tick) {
        a.acc -= a.tick;
        const dealt = hitArea(a.x, a.y, a.r, a.dmg, { soft: true, slow: a.slow, mul: a.mul, poison: a.pz });
        if (a.steal && dealt > 0) heal(Math.max(1, Math.round(dealt * a.steal)));
        if (a.kind === 'pool') burst(a.x + (Math.random() - 0.5) * a.r * 1.4, a.y + (Math.random() - 0.5) * a.r * 0.8, '#a6f04a', 2, 40, -120);
      }
      if (a.kind === 'tornado' && Math.random() < 0.8) burst(a.x + (Math.random() - 0.5) * a.r, a.y, Math.random() < 0.5 ? '#bff7ee' : '#7fd070', 1, 90, -200);
      if (a.t >= a.time + 0.4) areas.splice(i, 1);
    }

    // ----- Hệ Tự Nhiên -----
    if (st.hot > 0) { // Sinh Mệnh Hoa: hồi theo nhịp 0.5 giây
      const d = Math.min(dt, st.hot); st.hot -= d; st.hotT += d;
      if (st.hotT >= 0.5) { st.hotT -= 0.5; st.hotAcc += st.hotRate * 0.5; const g = Math.floor(st.hotAcc); st.hotAcc -= g; if (g > 0 && player.hp < MAX_HP) heal(g); }
      if (Math.random() < 0.35) burst(player.x + (Math.random() - 0.5) * 36, player.y - 10, Math.random() < 0.5 ? '#ffd6ec' : '#9cf56a', 1, 40, -90);
    }
    for (let i = binds.length - 1; i >= 0; i--) { // Dây Leo: giữ mục tiêu tại chỗ + sát thương nhẹ
      const b = binds[i], m0 = b.m;
      b.t += dt;
      if (b.rt === undefined && (m0.dead || b.t >= b.life)) { b.rt = 0; if (!m0.dead) sparks(m0.x, m0.y, 'nature', 8, false); }
      if (b.rt !== undefined) { b.rt += dt; if (b.rt > 0.4) binds.splice(i, 1); continue; }
      b.acc += dt; b.refresh -= dt;
      if (b.refresh <= 0 && !b.an && !m0.boss) { b.refresh = 0.1; damage(m0, b.isZ, 0, m0.x, m0.y, { stun: 0.3, soft: true }); }
      while (b.acc >= b.s.tick) {
        b.acc -= b.s.tick;
        if (b.an) attackAnimal(m0, Math.max(1, Math.round(b.s.dmg))); else damage(m0, b.isZ, b.s.dmg, m0.x, m0.y, { soft: true });
        burst(m0.x, m0.y - 24, Math.random() < 0.5 ? '#9cf56a' : '#3fbf4a', 2, 40, -70);
      }
    }
    for (let i = rootLines.length - 1; i >= 0; i--) { // Địa Chấn Rễ Cây: làn sóng rễ chạy dọc đường thẳng
      const l = rootLines[i], s = l.s, front = Math.min(l.len, l.t * l.speed), c = Math.cos(l.a), sn = Math.sin(l.a);
      l.t += dt;
      const front2 = Math.min(l.len, l.t * l.speed), hw = s.width * TILE / 2;
      while (l.segs * 30 <= front2) { const d = l.segs * 30; l.segs++; for (let k = 0; k < 3; k++) burst(l.x + c * d + (Math.random() - 0.5) * 30, l.y + sn * d - 6, k % 2 ? '#9cf56a' : '#7a5230', 1, 170, 420); }
      const inLine = (px, py, extra) => { const dx = px - l.x, dy = py - l.y, along = dx * c + dy * sn, perp = Math.abs(-dx * sn + dy * c); return along >= -14 && along <= front2 + 18 && perp <= hw + extra; };
      forEnemies(l.x, l.y, (px, py) => inLine(px, py, 14) && true, (mm, isZ) => {
        if (l.hit.has(mm)) return; l.hit.add(mm);
        damage(mm, isZ, s.dmg, l.x - c * 20, l.y - sn * 20, { knock: s.knock, stun: s.stun });
        fx.push({ k: 'hit', x: mm.x, y: mm.y - 24, t: 0, life: 0.35, el: 'nature' });
        sparks(mm.x, mm.y, 'nature', 6, false);
      });
      if (layer === 0) for (const an of animals) if (!an.tame && !l.hit.has(an) && inLine(an.x, an.y, 14)) { l.hit.add(an); attackAnimal(an, s.dmg); }
      if (l.t > l.len / l.speed + 1.0) rootLines.splice(i, 1);
    }
    for (let i = trees.length - 1; i >= 0; i--) { // Cổ Thụ: sau khi mọc xong thì quất quái và hồi máu theo nhịp
      const tr = trees[i], s = tr.s, R = s.radius * TILE;
      tr.t += dt;
      if (tr.t >= tr.life) { sparks(tr.x, tr.y - 60, 'nature', 24, true); addRing(tr.x, tr.y, R * 0.6, 'nature'); trees.splice(i, 1); continue; }
      if (tr.t < s.delay) continue;
      tr.atk -= dt; tr.pulse -= dt;
      if (tr.atk <= 0) {
        tr.atk = s.rate;
        const found = [];
        forEnemies(tr.x, tr.y, (px, py) => Math.hypot(px - tr.x, py - tr.y) <= R, (mm, isZ) => found.push({ mm, isZ, d: Math.hypot(mm.x - tr.x, mm.y - tr.y) }));
        found.sort((p, q) => p.d - q.d);
        for (const f of found.slice(0, s.targets)) {
          damage(f.mm, f.isZ, s.dmg, tr.x, tr.y, { slow: 1.2, mul: 0.5, knock: 60 });
          fx.push({ k: 'whip', el: 'nature', x0: tr.x, y0: tr.y - 120, x1: f.mm.x, y1: f.mm.y - 24, t: 0, life: 0.4 });
          fx.push({ k: 'hit', x: f.mm.x, y: f.mm.y - 24, t: 0, life: 0.35, el: 'nature' });
        }
        if (!found.length && layer === 0) { const an = animals.find((q) => !q.tame && Math.hypot(q.x - tr.x, q.y - tr.y) <= R); if (an) { attackAnimal(an, s.dmg); fx.push({ k: 'whip', el: 'nature', x0: tr.x, y0: tr.y - 120, x1: an.x, y1: an.y - 20, t: 0, life: 0.4 }); } }
      }
      if (tr.pulse <= 0) {
        tr.pulse = s.healRate;
        addRing(tr.x, tr.y, R, 'nature', 0, 0.8);
        if (Math.hypot(player.x - tr.x, player.y - tr.y) <= R && player.hp < MAX_HP) { heal(Math.max(1, Math.round(MAX_HP * s.heal))); addRing(player.x, player.y, 40, 'nature', 0, 0.4); }
      }
      if (Math.random() < 0.5) burst(tr.x + (Math.random() - 0.5) * 120, tr.y - 100 - Math.random() * 60, Math.random() < 0.5 ? '#9cf56a' : '#e8ffa8', 1, 40, 40);
    }

    // Quả cầu năng lượng bám người khi có buff
    if (st.speed > 0 && Math.random() < 0.7) burst(player.x - player.faceX * 10, player.y - 14, '#bff7ee', 1, 60, 0);
    if (st.lshield > 0 && Math.random() < 0.2) burst(player.x + (Math.random() - 0.5) * 40, player.y - 20, '#fff0a0', 1, 40, -120);

    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); }
  };

  X.clear = () => { shots = []; areas = []; strikes = []; fx = []; minions = []; binds = []; rootLines = []; trees = []; st.hot = 0; };
  X.reset = () => { X.clear(); X.setElement(null); for (const k in cd) cd[k] = 0; st.stone = st.lshield = st.absorb = st.speed = st.hot = 0; st.mult = 1; };

  // ---------- Vẽ ----------
  function glow(x, y, r, a, el) {
    const c = EL[el] || EL.lightning, g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + c.c0 + ',' + a + ')'); g.addColorStop(1, 'rgba(' + c.c1 + ',0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function zapLine(x0, y0, x1, y1, w, el) { // tia sét ngoằn ngoèo, nhấp nháy theo từng khung hình
    const c = EL[el] || EL.lightning, len = Math.hypot(x1 - x0, y1 - y0) || 1, n = Math.max(3, Math.floor(len / 18)), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    const pts = [[x0, y0]];
    for (let i = 1; i < n; i++) { const k = i / n, off = (Math.random() - 0.5) * 24; pts.push([x0 + (x1 - x0) * k + nx * off, y0 + (y1 - y0) * k + ny * off]); }
    pts.push([x1, y1]);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [col, lw] of [[c.b + '66', w * 3.4], [c.b, w * 1.6], ['#ffffff', w * 0.7]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
  }
  function crescent(sx, sy, a, sc, alpha, el) { // lưỡi liềm gió / bóng tối
    const c = EL[el]; ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'lighter';
    const R = 34 * sc;
    for (const [col, k, lw] of [[c.b + '88', 1.12, 12 * sc], [c.a, 1, 6 * sc], ['#ffffff', 0.96, 2.5 * sc]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-R * 0.55, 0, R * k, -1.05, 1.05); ctx.stroke();
    }
    ctx.restore();
  }
  function flame(x, y, h, el, ph) { // ngọn lửa ma trơi (độc: xanh lá viền tím)
    const c = EL[el];
    ctx.save();
    for (const [col, k] of [[c.b, 1], [c.a, 0.72], ['#f4ffd0', 0.34]]) {
      const hh = h * k, w = Math.max(2, hh * 0.3);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - w, y);
      ctx.quadraticCurveTo(x - w, y - hh * 0.5, x + Math.sin(ph * 9) * w * 0.6, y - hh);
      ctx.quadraticCurveTo(x + w, y - hh * 0.5, x + w, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function spike(x, y, h, w, tilt, el, alpha) { // gai nhọn đứng trên mặt đất, đáy ở (x, y)
    if (h < 1 || alpha <= 0) return;
    const c = EL[el];
    ctx.save(); ctx.globalAlpha = alpha;
    if (el === 'dark') { ctx.fillStyle = '#12061f'; ctx.strokeStyle = '#b88cff'; ctx.lineWidth = 2; }
    else { ctx.fillStyle = c.a; ctx.strokeStyle = '#2a0f55'; ctx.lineWidth = 1.6; }
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x + tilt, y - h); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function runeCircle(sx, sy, r, now, el, alpha) { // ma trận phép dưới đất: 2 vòng, vạch ký tự xoay, ngôi sao 5 cánh
    if (alpha <= 0) return;
    const c = EL[el];
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.55); ctx.globalAlpha = Math.min(1, alpha); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20,0,40,0.5)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); // nền tối cho nổi trên cỏ
    ctx.strokeStyle = c.a; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = c.b; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, TAU); ctx.stroke();
    ctx.strokeStyle = c.a; ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) { const a = now * 0.6 + i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); ctx.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97); ctx.stroke(); }
    ctx.strokeStyle = c.b; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let k = 0; k < 5; k++) { const a = -now * 0.45 - Math.PI / 2 + k * 2 * TAU / 5, px = Math.cos(a) * r * 0.78, py = Math.sin(a) * r * 0.78; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  function skull(sx, sy, s, el, alpha, jaw) { // đầu lâu có mắt phát sáng; jaw = độ há hàm (px)
    if (alpha <= 0) return;
    const c = EL[el], eye = el === 'poison' ? '#c8ff4a' : '#ff8af5';
    ctx.save(); ctx.translate(sx, sy); ctx.globalAlpha = alpha;
    glow(0, 0, s * 1.7, 0.45, el);
    ctx.fillStyle = el === 'poison' ? '#1b0f2c' : '#0d0716'; ctx.strokeStyle = c.a; ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.ellipse(0, -s * 0.1, s * 0.55, s * 0.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.34, s * 0.24); ctx.lineTo(-s * 0.28, s * 0.56 + jaw); ctx.lineTo(s * 0.28, s * 0.56 + jaw); ctx.lineTo(s * 0.34, s * 0.24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = Math.max(1, s * 0.05); ctx.beginPath();
    for (let i = -1; i <= 1; i++) { ctx.moveTo(i * s * 0.14, s * 0.28); ctx.lineTo(i * s * 0.14, s * 0.56 + jaw); }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = eye;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * s * 0.22, -s * 0.12, s * 0.15, s * 0.13, 0, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.moveTo(0, s * 0.02); ctx.lineTo(-s * 0.07, s * 0.16); ctx.lineTo(s * 0.07, s * 0.16); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function chain(x0, y0, x1, y1) { // xích bóng tối nối 2 điểm
    const len = Math.hypot(x1 - x0, y1 - y0); if (len < 10) return;
    const n = Math.max(2, Math.floor(len / 11)), a = Math.atan2(y1 - y0, x1 - x0);
    ctx.save(); ctx.lineWidth = 2.2;
    for (let i = 0; i <= n; i++) {
      ctx.save(); ctx.translate(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); ctx.rotate(a + (i % 2 ? Math.PI / 2 : 0));
      ctx.strokeStyle = i % 2 ? '#c8a2ff' : '#6a3acc'; ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 3.4, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }
  function drawMinion(m, camX, camY, now) {
    const sx = m.x - camX, sy = m.y - camY, fade = Math.min(1, m.t / 0.4, m.life / 0.5), bob = Math.sin(now * 3 + m.ph * 2) * 4;
    ctx.save(); ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 16, 6, 0, 0, TAU); ctx.fill();
    if (m.kind === 'pskull') { // Độc Linh: đầu lâu lơ lửng, lửa độc phía dưới
      const hy = sy - 46 + bob;
      for (let i = -1; i <= 1; i++) flame(sx + i * 7, hy + 14, 15 + Math.sin(now * 12 + i * 2 + m.ph) * 4, 'poison', now * 0.3 + i);
      glow(sx, hy, 20 + m.cast * 60, 0.35 + m.cast, 'poison');
      skull(sx, hy, 15, 'poison', 1, m.cast > 0 ? 4 : Math.sin(now * 5 + m.ph) * 1.2);
    } else { // Oan Hồn: bóng ma tím đen, mắt trắng, đuôi lượn sóng
      const hy = sy - 28 + bob * 1.4, f = m.face || 1;
      glow(sx, hy, 42, 0.45, 'dark');
      ctx.fillStyle = '#0e0618'; ctx.strokeStyle = '#a56bff'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(sx - 14, hy + 2); ctx.bezierCurveTo(sx - 16, hy - 24, sx + 16, hy - 24, sx + 14, hy + 2);
      for (let i = 0; i <= 4; i++) ctx.lineTo(sx + 14 - i * 7, hy + 10 + (i % 2 ? 14 : 6) + Math.sin(now * 8 + i + m.ph) * 3);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffffff';
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx + f * 3 + d * 6, hy - 8, 3, 4.2, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#ff8af5'; ctx.beginPath(); ctx.ellipse(sx + f * 3, hy + 2, 6, m.cast > 0 ? 6 : 2, 0, 0, TAU); ctx.fill(); // há miệng khi cắn
    }
    ctx.restore();
  }
  function drawUlt(e, sx, sy, R, p, now) { // dấu báo của chiêu cuối: ma trận + hình tượng trồi dần lên trước khi nổ
    ctx.save(); ctx.translate(sx, sy);
    runeCircle(0, 0, R, now, e.el, 0.35 + 0.65 * p);
    if (e.el === 'poison') { // đầu lâu Độc Chúa + vòng lửa độc
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + now * 0.5; flame(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85 * 0.55, 16 + 34 * p + Math.sin(now * 14 + i) * 5, 'poison', now * 0.3 + i); }
      const sz = R * 0.5 * (0.35 + 0.65 * p);
      skull(0, -R * 0.25 - p * R * 0.4, sz, 'poison', 0.25 + 0.65 * p, Math.sin(now * 10) * sz * 0.05);
    } else { // lưỡi kiếm bóng tối trồi quanh ma trận + mặt trời đen ở giữa
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.4, h = R * (0.45 + 0.4 * ((i * 5) % 3) / 2) * Math.min(1, p * 1.6); spike(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78 * 0.55, h, 7, 0, 'dark', 1); }
      const r0 = R * 0.33 * (0.2 + 0.8 * p), cy = -R * 0.45, g = ctx.createRadialGradient(0, cy, 0, 0, cy, r0 + 3);
      g.addColorStop(0, '#000'); g.addColorStop(0.75, 'rgba(18,0,36,0.95)'); g.addColorStop(1, 'rgba(170,100,255,0.9)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, cy, r0 + 3, 0, TAU); ctx.fill();
      glow(0, cy, r0 * 2.2, 0.35 + 0.3 * p, 'dark');
    }
    ctx.restore();
  }
  function drawShot(b, camX, camY, now) {
    const sx = b.x - camX, sy = b.y - camY - ARROW_H;
    ctx.save();
    if (b.kind === 'bolt') {
      const tail = b.trail[0] || b, tx = tail.x - camX - b.vx * 0.04, ty = tail.y - camY - ARROW_H - b.vy * 0.04;
      zapLine(tx, ty, sx, sy, 3, 'lightning'); glow(sx, sy, 34, 0.7, 'lightning');
    } else if (b.kind === 'spit') { // Độc Tiễn: mũi tên đầu xanh, đuôi sao chổi tím
      b.trail.forEach((q, i) => { ctx.globalAlpha = (i / b.trail.length) * 0.45; ctx.fillStyle = '#7a3fd0'; ctx.beginPath(); ctx.arc(q.x - camX, q.y - camY - ARROW_H, 2 + i * 0.6, 0, TAU); ctx.fill(); });
      ctx.globalAlpha = 1; glow(sx, sy, 30, 0.55, 'poison');
      ctx.translate(sx, sy); ctx.rotate(b.a);
      const g = ctx.createLinearGradient(-44, 0, 0, 0); g.addColorStop(0, 'rgba(120,40,200,0)'); g.addColorStop(1, 'rgba(154,92,255,0.9)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-44, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a6f04a'; ctx.strokeStyle = '#2a0f55'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(0, -7); ctx.lineTo(3, 0); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e6ffb0'; ctx.fillRect(2, -1.5, 8, 3);
    } else if (b.kind === 'gale') {
      b.trail.forEach((q, i) => crescent(q.x - camX, q.y - camY - ARROW_H, b.a, 0.9, (i / b.trail.length) * 0.25, 'wind'));
      glow(sx, sy, 40, 0.4, 'wind'); crescent(sx, sy, b.a, 1, 1, 'wind');
      ctx.fillStyle = '#7fd070'; for (let i = 0; i < 3; i++) { const a = now * 9 + i * 2.1; ctx.fillRect(Math.round(sx - Math.cos(b.a) * (14 + i * 8) + Math.cos(a) * 6), Math.round(sy - Math.sin(b.a) * (14 + i * 8) + Math.sin(a) * 6), 4, 3); }
    } else if (b.kind === 'slash') { // Hắc Ám: vệt chém lưỡi liềm bóng tối, kéo theo khói tím
      b.trail.forEach((q, i) => crescent(q.x - camX, q.y - camY - ARROW_H, b.a, 1.5, (i / b.trail.length) * 0.22, 'dark'));
      glow(sx, sy, 54, 0.5, 'dark'); crescent(sx, sy, b.a, 1.6, 1, 'dark');
      ctx.fillStyle = '#12061f';
      for (let i = 0; i < 4; i++) { const a = now * 7 + i * 1.6; ctx.fillRect(Math.round(sx - Math.cos(b.a) * (16 + i * 9) + Math.cos(a) * 8), Math.round(sy - Math.sin(b.a) * (16 + i * 9) + Math.sin(a) * 8), 6, 5); }
    }
    ctx.restore();
  }
  function drawArea(a, camX, camY, now) {
    const sx = a.x - camX, sy = a.y - camY, pop = Math.min(1, a.t / 0.3), end = a.t > a.time ? Math.max(0, 1 - (a.t - a.time) / 0.4) : 1, k = pop * end;
    if (k <= 0) return;
    ctx.save(); ctx.globalAlpha = k;
    if (a.kind === 'pool') { // Độc Vực: ma trận độc, khói tím, lửa ma trơi, hồn đầu lâu bốc lên
      ctx.translate(sx, sy);
      ctx.save(); ctx.scale(1, 0.55);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, a.r);
      g.addColorStop(0, 'rgba(150,230,70,0.5)'); g.addColorStop(0.7, 'rgba(110,50,190,0.4)'); g.addColorStop(1, 'rgba(110,50,190,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, a.r, 0, TAU); ctx.fill();
      ctx.restore();
      runeCircle(0, 0, a.r, now, 'poison', k * 0.9);
      for (let i = 0; i < 9; i++) { // khói tím trôi
        const ph = i * 0.7 + a.seed, bx = Math.cos(ph + now * 0.15) * a.r * 0.7, by = Math.sin(ph * 1.3 + now * 0.12) * a.r * 0.4 - 16, fr = a.r * 0.38;
        const fg = ctx.createRadialGradient(bx, by, 0, bx, by, fr); fg.addColorStop(0, 'rgba(120,50,200,0.3)'); fg.addColorStop(1, 'rgba(120,50,200,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(bx, by, fr, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = k;
      for (let i = 0; i < 14; i++) { // lửa độc
        const ph = i * 0.9 + a.seed, rr = (0.3 + 0.65 * ((i * 29) % 10) / 10) * a.r;
        flame(Math.cos(ph) * rr, Math.sin(ph) * rr * 0.55, (20 + 22 * ((i * 13) % 5) / 5) * (0.8 + 0.2 * Math.sin(now * 11 + i)), 'poison', now * 0.3 + i);
      }
      for (let i = 0; i < 3; i++) { // hồn đầu lâu bốc lên rồi tan
        const ph = (now * 0.35 + i / 3 + a.seed) % 1;
        skull(Math.cos(i * 2.1 + a.seed) * a.r * 0.5, Math.sin(i * 2.1 + a.seed) * a.r * 0.3 - 20 - ph * 60, 9, 'poison', Math.sin(ph * Math.PI) * 0.7 * k, 0);
      }
      for (let i = 0; i < 7; i++) { // bọt khí
        const ph = (now * 0.8 + i * 0.37 + a.seed) % 1, bx = Math.cos(i * 2.3 + a.seed) * a.r * 0.65, by = Math.sin(i * 1.7 + a.seed) * a.r * 0.35 - ph * 26;
        ctx.globalAlpha = k * (1 - ph); ctx.strokeStyle = '#d8ff9a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, 3 + ph * 4, 0, TAU); ctx.stroke();
      }
    } else if (a.kind === 'tornado') { // phễu gió xoay: các elip chồng lên nhau, càng cao càng rộng
      ctx.translate(sx, sy);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, 0, a.r * 0.5, a.r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      const H = 150;
      for (let i = 0; i < 9; i++) {
        const p = i / 8, y = -p * H, w = 14 + p * a.r * 0.5, ox = Math.sin(now * 6 + i * 0.9 + a.seed) * (6 + p * 14);
        ctx.strokeStyle = i % 2 ? 'rgba(220,255,250,0.85)' : 'rgba(110,230,215,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(ox, y, w, w * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#7fd070';
      for (let i = 0; i < 6; i++) { const ph = (now * 0.9 + i / 6) % 1, an = now * 7 + i * 1.05, w = 14 + ph * a.r * 0.55; ctx.fillRect(Math.round(Math.cos(an) * w), Math.round(-ph * H + Math.sin(an) * w * 0.3), 5, 3); }
    } else if (a.kind === 'abyss') { // Hắc Vực: ma trận đen, gai hắc ám trồi lên, xích trói quái kéo về tâm
      ctx.translate(sx, sy);
      ctx.save(); ctx.scale(1, 0.55);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, a.r * 0.85);
      g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.45, 'rgba(30,0,50,0.85)'); g.addColorStop(0.8, 'rgba(110,50,200,0.35)'); g.addColorStop(1, 'rgba(110,50,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, a.r * 0.85, 0, TAU); ctx.fill();
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const a0 = now * (2.2 + i * 0.3) + i * 1.57, rr = a.r * (0.6 - i * 0.1); ctx.strokeStyle = i % 2 ? 'rgba(200,162,255,0.9)' : 'rgba(138,74,255,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.9, 0, a0, a0 + 1.6); ctx.stroke(); }
      ctx.restore();
      runeCircle(0, 0, a.r, now, 'dark', k);
      ctx.globalAlpha = k;
      for (let i = 0; i < 14; i++) { // gai hắc ám trồi quanh rìa
        const ang2 = i * TAU / 14 + a.seed, pop = Math.max(0, Math.min(1, (a.t - i * 0.03) / 0.3)), h = (26 + 14 * ((i * 7) % 3)) * pop;
        spike(Math.cos(ang2) * a.r * 0.97, Math.sin(ang2) * a.r * 0.97 * 0.55, h, 6, Math.cos(ang2) * 6, 'dark', 1);
      }
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 0, a.r * 0.16, a.r * 0.09, 0, 0, TAU); ctx.fill();
      ctx.translate(-sx, -sy); // xích: tâm vực → từng con quái bị trói
      forEnemies(a.x, a.y, (px, py) => Math.hypot(px - a.x, py - a.y) <= a.r, (m) => chain(sx, sy - 8, m.x - camX, m.y - camY - 16));
    }
    ctx.restore();
  }
  function drawStrike(e, camX, camY, now) { // dấu báo trên mặt đất trước khi đòn giáng xuống
    if (e.t < 0) return;
    const s = e.s, R = (s.radius || s.rockRadius || 1) * TILE, sx = e.x - camX, sy = e.y - camY, p = Math.min(1, e.t / e.delay), c = EL[e.el];
    ctx.save();
    if (e.kind === 'pburst' || e.kind === 'dking') drawUlt(e, sx, sy, R, p, now);
    else if (e.kind === 'rock') { // tảng đá rơi từ trên cao xuống, bóng to dần dưới đất
      ctx.fillStyle = 'rgba(0,0,0,' + (0.15 + p * 0.25) + ')'; ctx.beginPath(); ctx.ellipse(sx, sy, R * (0.3 + 0.7 * p), R * (0.3 + 0.7 * p) * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      const h = (1 - p) * (1 - p) * 280, rw = 14;
      ctx.fillStyle = '#8a6a44'; ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - rw, sy - h - 4); ctx.lineTo(sx - 5, sy - h - rw - 6); ctx.lineTo(sx + rw - 2, sy - h - 8); ctx.lineTo(sx + rw, sy - h + 8); ctx.lineTo(sx, sy - h + 12); ctx.lineTo(sx - rw + 2, sy - h + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c0a070'; ctx.fillRect(Math.round(sx - 7), Math.round(sy - h - 8), 6, 4);
    } else {
      ctx.translate(sx, sy); ctx.scale(1, 0.55);
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(now * 18);
      ctx.strokeStyle = c.a; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.25 + 0.2 * p; ctx.fillStyle = 'rgba(' + c.c1 + ',0.5)'; ctx.beginPath(); ctx.arc(0, 0, R * p, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawFx(e, camX, camY, now) {
    if (e.t < 0) return;
    const p = e.t / e.life, sx = e.x - camX, sy = e.y - camY, c = EL[e.el];
    ctx.save();
    if (e.k === 'ring') {
      ctx.globalAlpha = 1 - p; ctx.strokeStyle = c.a; ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(sx, sy, e.r * p, e.r * p * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (e.k === 'hit') {
      ctx.globalAlpha = 1 - p; glow(sx, sy, 30 + p * 20, 0.7, e.el || 'lightning');
    } else if (e.k === 'zap') { // vệt sét lướt
      ctx.globalAlpha = 1 - p; zapLine(e.x0 - camX, e.y0 - camY, e.x1 - camX, e.y1 - camY, 3, 'lightning');
    } else if (e.k === 'ghost') { // tàn ảnh
      ctx.globalAlpha = 0.5 * (1 - p); ctx.fillStyle = c.b;
      ctx.beginPath(); ctx.ellipse(sx, sy - 24, 15 + p * 6, 28 + p * 6, 0, 0, Math.PI * 2); ctx.fill();
    } else if (e.k === 'bolt') { // sét giáng từ trên trời
      ctx.globalAlpha = 1 - p * p;
      const n = e.big ? 4 : 2;
      for (let i = 0; i < n; i++) zapLine(sx + (Math.random() - 0.5) * (e.big ? 50 : 24), sy - 520, sx + (Math.random() - 0.5) * 12, sy, e.big ? 6 : 3.5, 'lightning');
      glow(sx, sy - 10, (e.big ? 140 : 80) * (1 - p * 0.5), 0.8, 'lightning');
    } else if (e.k === 'flash') {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - p)) + ')'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (e.k === 'cracks') { // vết nứt đất tỏa từ tâm
      ctx.globalAlpha = 1 - p * p; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.translate(sx, sy); ctx.scale(1, 0.55);
      const reach = e.r * Math.min(1, p * 4);
      for (let i = 0; i < 9; i++) {
        const a = i * 0.7 + e.seed; ctx.beginPath(); ctx.moveTo(0, 0);
        for (let j = 1; j <= 5; j++) { const rr = reach * j / 5; ctx.lineTo(Math.cos(a + Math.sin(i * 3 + j) * 0.18) * rr, Math.sin(a + Math.sin(i * 3 + j) * 0.18) * rr); }
        ctx.stroke();
      }
    } else if (e.k === 'arc') { // vệt chém hình cung quanh người (Đấm Đất / Hắc Nguyệt)
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - p;
      for (const [col, lw, k] of [[c.b + '99', 16, 1], [c.a, 7, 0.97], ['#ffffff', 2.5, 0.94]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw * (1 - p * 0.5); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(sx, sy - 22, e.r * (0.55 + 0.45 * p) * k, e.a - e.half, e.a + e.half); ctx.stroke();
      }
    } else if (e.k === 'gust') { // luồng gió: các cung mở rộng ra phía trước
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9 * (1 - p); ctx.strokeStyle = '#e8fffa'; ctx.lineWidth = 4 * (1 - p) + 1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(sx, sy - 22, e.r * (0.25 + 0.75 * p), e.a - 0.7, e.a + 0.7); ctx.stroke();
    } else if (e.k === 'vortex') { // Phong Thần: xoáy lớn quanh người
      ctx.globalAlpha = 1 - p; ctx.translate(sx, sy - 20); ctx.scale(1, 0.6); ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) { const a0 = now * 8 + i * 1.26, rr = e.r * (0.25 + 0.75 * p) * (1 - i * 0.12); ctx.strokeStyle = i % 2 ? 'rgba(220,255,250,0.9)' : 'rgba(110,230,215,0.9)'; ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + 1.5); ctx.stroke(); }
    } else if (e.k === 'pillar') { // cột sáng thánh quang
      const a = Math.sin(Math.min(1, p * 5) * Math.PI / 2) * (p > 0.6 ? (1 - p) / 0.4 : 1), w = e.w * (0.7 + 0.3 * a);
      ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(sx - w, 0, sx + w, 0);
      g.addColorStop(0, 'rgba(255,210,80,0)'); g.addColorStop(0.5, 'rgba(255,255,230,0.95)'); g.addColorStop(1, 'rgba(255,210,80,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - w, sy - 560, w * 2, 560);
      glow(sx, sy - 10, w * 2.2, 0.8, 'holy');
      if (e.wings) { // cánh thiên thần mở ra hai bên
        ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (const d of [-1, 1]) for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sx + d * 14, sy - 50 - i * 6); ctx.quadraticCurveTo(sx + d * (70 + i * 14) * a, sy - 100 - i * 16, sx + d * (96 + i * 12) * a, sy - 54 - i * 22); ctx.stroke(); }
      }
      ctx.fillStyle = '#fff6c0'; // dấu cộng nhỏ bay lên
      for (let i = 0; i < 5; i++) { const ph = (p * 1.5 + i * 0.2) % 1, px = sx + (i - 2) * 12, py = sy - ph * 90; ctx.fillRect(Math.round(px - 1), Math.round(py - 5), 3, 11); ctx.fillRect(Math.round(px - 5), Math.round(py - 1), 11, 3); }
    } else if (e.k === 'whip') {
      drawWhip(e, camX, camY);
    } else if (e.k === 'rune') { // ma trận hiện dưới chân khi niệm chiêu
      runeCircle(sx, sy, e.r, now, e.el, p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8);
    } else if (e.k === 'spikes') { // gai nhô lên từ mặt đất rồi tan
      const g = Math.min(1, p / 0.3), fade = p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5;
      for (let i = 0; i < e.n; i++) {
        const a = e.seed + i * TAU / e.n, rr = e.r * (0.25 + 0.6 * ((i * 37) % 10) / 10), h = e.r * (0.22 + 0.4 * ((i * 53) % 10) / 10) * g;
        spike(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.55, h, 6 + e.r * 0.03, Math.cos(a) * 10, e.el, fade);
      }
    } else if (e.k === 'skullburst') { // Độc Chúa: đầu lâu khổng lồ há miệng gầm rồi tan
      const grow = Math.min(1, p * 3), a = p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5;
      glow(sx, sy - 20, e.r * 1.2, 0.6 * a, e.el);
      skull(sx, sy - 50 - p * 40, e.r * 0.55 * (0.6 + 0.5 * grow), e.el, a, e.r * 0.18 * Math.min(1, p * 4));
    } else if (e.k === 'sunburst') { // Hắc Chúa: mặt trời đen co lại rồi nổ tung
      if (p < 0.35) {
        const q = p / 0.35, rr = e.r * 0.5 * q + 4, g = ctx.createRadialGradient(sx, sy - 24, 0, sx, sy - 24, rr);
        g.addColorStop(0, '#000'); g.addColorStop(0.7, 'rgba(20,0,40,0.95)'); g.addColorStop(1, 'rgba(170,100,255,0.85)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy - 24, rr, 0, TAU); ctx.fill();
      } else {
        const q = (p - 0.35) / 0.65; ctx.globalAlpha = 1 - q; ctx.globalCompositeOperation = 'lighter';
        glow(sx, sy - 24, e.r * (0.6 + q), 0.7 * (1 - q), 'dark');
        for (const [col, lw, k] of [[c.b, 10, 1], ['#ffffff', 3, 0.97]]) { ctx.strokeStyle = col; ctx.lineWidth = lw * (1 - q) + 1; ctx.beginPath(); ctx.ellipse(sx, sy, e.r * (0.3 + 0.9 * q) * k, e.r * (0.3 + 0.9 * q) * k * 0.55, 0, 0, TAU); ctx.stroke(); }
      }
    }
    ctx.restore();
  }
  function drawPlayerFx(camX, camY, now) { // hiệu ứng bám người: khiên đá / độc / thánh quang, gió tăng tốc
    const sx = player.x - camX, sy = player.y - camY - 26;
    if (st.stone > 0) { // 4 tảng đá xoay quanh người
      const fade = Math.min(1, st.stone / 0.5);
      ctx.save(); ctx.globalAlpha = fade;
      for (let i = 0; i < 4; i++) {
        const a = now * 2.2 + i * Math.PI / 2, px = sx + Math.cos(a) * 34, py = sy + Math.sin(a) * 40;
        ctx.fillStyle = '#8a6a44'; ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px - 9, py - 3); ctx.lineTo(px - 2, py - 11); ctx.lineTo(px + 9, py - 5); ctx.lineTo(px + 7, py + 8); ctx.lineTo(px - 6, py + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c0a070'; ctx.fillRect(Math.round(px - 5), Math.round(py - 6), 5, 3);
      }
      ctx.restore();
    }
    if (st.lshield > 0 && st.absorb > 0) { // khiên sáng: mờ dần theo lượng hấp thụ còn lại
      ctx.save(); const ratio = Math.min(1, st.absorb / Math.max(1, MAX_HP * 0.2)); ctx.globalAlpha = Math.min(1, st.lshield / 0.5) * (0.5 + 0.5 * ratio);
      const g = ctx.createRadialGradient(sx, sy, 8, sx, sy, 48); g.addColorStop(0, 'rgba(255,250,210,0.05)'); g.addColorStop(1, 'rgba(255,210,80,0.45)');
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(255,240,160,0.95)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(sx, sy, 34, 46, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = now * 0.8 + i * 1.047; ctx.moveTo(sx + Math.cos(a) * 20, sy + Math.sin(a) * 28); ctx.lineTo(sx + Math.cos(a) * 31, sy + Math.sin(a) * 42); } ctx.stroke();
      ctx.restore();
    }
    if (st.speed > 0) { // gió cuộn quanh chân
      ctx.save(); ctx.globalAlpha = Math.min(1, st.speed / 0.5) * 0.8; ctx.strokeStyle = '#e8fffa'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const a0 = now * 7 + i * 2.09; ctx.beginPath(); ctx.ellipse(sx, sy + 24, 22 + i * 4, 8 + i * 2, 0, a0, a0 + 2.2); ctx.stroke(); }
      ctx.restore();
    }
  }
  function drawPoisoned(camX, camY, now) { // bọt độc trên quái đang nhiễm độc
    for (const list of [zombies, spiders]) for (const m of list) {
      if (m.dead || !(m.pzT > 0)) continue;
      const sx = m.x - camX, sy = m.y - camY - (m.boss ? 60 : 28);
      ctx.save(); ctx.fillStyle = '#a6f04a'; ctx.strokeStyle = '#4a2a80'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { const ph = (now * 1.1 + i / 3) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(sx + Math.sin(i * 2.6 + now) * (m.boss ? 40 : 10), sy - ph * 22, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
  }

  // ---------- Hệ Tự Nhiên: vẽ ----------
  const GR = { dk: '#1d4a1c', md: '#2f8f34', lt: '#6fdc4a', hi: '#d6ff8a', wood: '#5a3a1c', wood2: '#a8743c' };
  function leaf(x, y, a, sz, col) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(sz * 0.5, 0, sz * 0.5, sz * 0.26, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  function vineWrap(sx, sy, H, w, grow, now, seed) { // 3 dây leo xoắn quanh mục tiêu
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let j = 0; j < 3; j++) {
      const pts = [];
      for (let i = 0; i <= 14; i++) { const u = (i / 14) * grow, an = j * 2.094 + u * 6.2 + seed; pts.push([sx + Math.cos(an) * w * (1 - u * 0.25), sy - u * H + Math.sin(an) * w * 0.32]); }
      for (const [col, lw] of [[GR.dk, 6], [GR.md, 3.6], [GR.lt, 1.4]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
      for (let k = 3; k < pts.length; k += 4) leaf(pts[k][0], pts[k][1], (k + j) * 1.3 + Math.sin(now * 3 + k) * 0.2, 10, k % 8 === 3 ? GR.lt : GR.md);
    }
    ctx.restore();
  }
  function drawBind(b, camX, camY, now) {
    const m0 = b.m, sx = m0.x - camX, sy = m0.y - camY, big = !!m0.boss, g = Math.min(1, b.t / 0.35), out = b.rt === undefined ? 1 : Math.max(0, 1 - b.rt / 0.4);
    if (out <= 0) return;
    ctx.save(); ctx.globalAlpha = out;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.5); ctx.strokeStyle = EL.nature.a; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, (big ? 46 : 24) * g, 0, TAU); ctx.stroke(); ctx.restore();
    glow(sx, sy - 14, big ? 60 : 34, 0.35 * g, 'nature');
    vineWrap(sx, sy, big ? 96 : 50, big ? 30 : 15, g, now, b.seed);
    ctx.restore();
  }
  function rootSpike(x, y, h, w, tilt, alpha) { // rễ cây nhọn trồi lên: thân nâu, sọc xanh sáng
    if (h < 1 || alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round';
    ctx.fillStyle = GR.wood; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.6 + tilt * 0.3, y - h * 0.55, x + tilt, y - h); ctx.quadraticCurveTo(x + w * 0.4 + tilt * 0.4, y - h * 0.5, x + w, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = GR.wood2; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - w * 0.2, y - 2); ctx.quadraticCurveTo(x + tilt * 0.2, y - h * 0.5, x + tilt * 0.9, y - h * 0.9); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = GR.lt; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w * 0.3, y - 1); ctx.quadraticCurveTo(x + tilt * 0.7, y - h * 0.4, x + tilt * 0.6, y - h * 0.75); ctx.stroke();
    ctx.restore();
  }
  function drawRootLine(l, camX, camY, now) {
    const c = Math.cos(l.a), sn = Math.sin(l.a), s = l.s, hw = s.width * TILE / 2, end = l.len / l.speed;
    ctx.save();
    const front = Math.min(l.len, l.t * l.speed);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, l.t - end - 0.3) / 0.7);
    ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(l.x - camX, l.y - camY); ctx.lineTo(l.x + c * front - camX, l.y + sn * front - camY); ctx.stroke(); // vết nứt đất
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = GR.lt; ctx.lineWidth = 2; ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
    for (let i = 0, d = 0; d <= l.len; i++, d += 30) { // từng cụm rễ: trồi lên khi sóng đi tới, rụt xuống sau ~0.6 giây
      const age = l.t - d / l.speed; if (age < 0) continue;
      const rise = Math.min(1, age / 0.15), fall = age > 0.5 ? Math.max(0, 1 - (age - 0.5) / 0.45) : 1, h0 = (46 + ((i * 37) % 5) * 9) * rise * fall;
      for (const side of [-1, 1]) {
        const off = side * hw * (0.55 + 0.35 * ((i * 13) % 3) / 3), bx = l.x + c * d - sn * off - camX, by = l.y + sn * d + c * off - camY;
        rootSpike(bx, by, h0 * (side > 0 ? 0.85 : 1), 8, ((i + (side > 0 ? 2 : 0)) % 3 - 1) * 9, fall);
      }
      const cx = l.x + c * d - camX, cy = l.y + sn * d - camY; rootSpike(cx, cy, h0 * 1.25, 9, ((i * 7) % 3 - 1) * 8, fall); // rễ chính giữa, cao nhất
    }
    ctx.restore();
  }
  function petal(len, ang, fill, stroke) { // cánh hoa: gốc ở (0, 0), chĩa theo ang
    const cx = Math.cos(ang), cy = Math.sin(ang), px = -cy, py = cx, w = len * 0.28;
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(cx * len * 0.5 + px * w * 1.3, cy * len * 0.5 + py * w * 1.3, cx * len, cy * len); ctx.quadraticCurveTo(cx * len * 0.5 - px * w * 1.3, cy * len * 0.5 - py * w * 1.3, 0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function lotus(sx, sy, open, now, alpha) { // hoa sen thần dưới chân: lá xanh bên dưới, 2 lớp cánh hồng, nhụy vàng phát sáng
    if (alpha <= 0 || open <= 0) return;
    ctx.save(); ctx.translate(sx, sy); ctx.globalAlpha = alpha;
    ctx.save(); ctx.scale(1, 0.5);
    for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i * TAU / 8 + now * 0.2); petal(34 * open, 0, '#3fbf4a', '#1d4a1c'); ctx.restore(); }
    ctx.restore();
    ctx.translate(0, -4);
    const sway = Math.sin(now * 2) * 0.04;
    for (let k = -4; k <= 4; k++) { const a = -Math.PI / 2 + k * 0.3 * open + sway; ctx.save(); ctx.scale(1, 0.85); petal((24 - Math.abs(k) * 1.6) * open, a, '#ffd0ea', '#e07ab0'); ctx.restore(); }
    for (let k = -2; k <= 2; k++) { const a = -Math.PI / 2 + k * 0.28 * open + sway; ctx.save(); ctx.scale(1, 0.85); petal(17 * open, a, '#fff4c0', '#f0c860'); ctx.restore(); }
    glow(0, -14 * open, 26 * open, 0.7, 'holy');
    ctx.restore();
  }
  function drawHot(camX, camY, now) { // đang hồi máu: hoa sen dưới chân + cánh hoa / hạt sáng xoay quanh người
    if (!(st.hot > 0)) return;
    const sx = player.x - camX, sy = player.y - camY, el = st.hotMax - st.hot, open = Math.min(1, el / 0.5) * Math.min(1, st.hot / 0.5), a = Math.min(1, st.hot / 0.4);
    runeCircle(sx, sy + 2, 44, now, 'nature', 0.7 * a);
    lotus(sx, sy + 4, open, now, a);
    ctx.save(); ctx.globalAlpha = a;
    for (let i = 0; i < 6; i++) { const an = now * 2 + i * 1.047, px = sx + Math.cos(an) * 30, py = sy - 26 + Math.sin(an) * 14 - ((now * 20 + i * 9) % 30); ctx.fillStyle = i % 2 ? '#ffd0ea' : '#9cf56a'; ctx.beginPath(); ctx.ellipse(px, py, 4, 2.4, an, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function drawGuardian(tr, camX, camY, now) { // Cổ Thụ Thần Linh: ma trận → rễ → thân → tán lá bung ra
    const s = tr.s, sx = tr.x - camX, sy = tr.y - camY, R = s.radius * TILE;
    const grow = Math.min(1, tr.t / s.delay), ease = 1 - Math.pow(1 - grow, 3), out = Math.max(0, Math.min(1, (tr.life - tr.t) / 0.6)), sc = 0.1 + 0.9 * ease;
    ctx.save();
    runeCircle(sx, sy, 96 * (0.5 + 0.5 * ease), now, 'nature', (0.35 + 0.65 * grow) * out);
    if (tr.t >= s.delay) { ctx.globalAlpha = 0.25 * out; ctx.strokeStyle = EL.nature.a; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.55, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    const behind = Math.abs(player.x - tr.x) < 80 && player.y < tr.y + 6 && player.y > tr.y - 200;
    ctx.globalAlpha = out * (behind ? 0.5 : 1);
    ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 4, 70 * sc, 20 * sc, 0, 0, TAU); ctx.fill();
    const H = 150 * sc, tw = 34 * sc, sw = Math.sin(now * 1.3 + tr.seed) * 3 * sc;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 5; i++) { const d = (i - 2) / 2, rx = d * 62 * sc, ry = (6 - Math.abs(d) * 4) * sc; ctx.strokeStyle = GR.wood; ctx.lineWidth = (11 - Math.abs(d) * 4) * sc; ctx.beginPath(); ctx.moveTo(d * 14 * sc, -26 * sc); ctx.quadraticCurveTo(d * 40 * sc, 4 * sc, rx, ry); ctx.stroke(); } // rễ nổi trên mặt đất
    ctx.fillStyle = GR.wood; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-tw, 2); ctx.quadraticCurveTo(-tw * 0.55, -H * 0.5, -tw * 0.45 + sw, -H); ctx.lineTo(tw * 0.45 + sw, -H); ctx.quadraticCurveTo(tw * 0.55, -H * 0.5, tw, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = GR.wood2; ctx.lineWidth = 2.5 * sc; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * tw * 0.4, -4); ctx.quadraticCurveTo(i * tw * 0.3, -H * 0.5, i * tw * 0.2 + sw, -H * 0.9); ctx.stroke(); }
    glow(sw, -H * 0.5, 70 * sc, 0.3, 'nature');
    const blobs = [[0, -1.02, 1.0], [-0.62, -0.9, 0.78], [0.62, -0.9, 0.78], [-0.34, -1.3, 0.78], [0.34, -1.3, 0.78], [0, -1.55, 0.7], [-0.92, -1.12, 0.55], [0.92, -1.12, 0.55]];
    for (const [col, dx, dy, k] of [[GR.dk, 4, 5, 1.0], [GR.md, 0, 0, 0.94], [GR.lt, -3, -5, 0.7]]) {
      ctx.fillStyle = col;
      blobs.forEach(([bx, by, br], i) => { ctx.beginPath(); ctx.arc(bx * 72 * sc + dx * sc + sw + Math.sin(now * 1.5 + i) * 2 * sc, by * H * 0.82 * (0.95) + dy * sc, br * 50 * sc * k, 0, TAU); ctx.fill(); });
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(210,255,140,0.75)'; // đốm sáng trên tán lá
    for (let i = 0; i < 16; i++) { const a = i * 2.4 + tr.seed, r = (20 + ((i * 17) % 40)) * sc; ctx.fillRect(Math.round(Math.cos(a) * r * 1.5), Math.round(-H * 1.15 + Math.sin(a) * r * 0.9 + Math.sin(now * 2 + i) * 2), 4, 4); }
    glow(sw, -H * 1.15, 90 * sc, 0.35, 'nature');
    ctx.restore();
  }
  function drawWhip(e, camX, camY) { // cành cây quất từ tán cổ thụ xuống mục tiêu
    const p = e.t / e.life, k = Math.min(1, p * 3.5), x0 = e.x0 - camX, y0 = e.y0 - camY, x1 = x0 + (e.x1 - e.x0) * k, y1 = y0 + (e.y1 - e.y0) * k;
    const mx = (x0 + x1) / 2 + (y1 - y0) * 0.25 * Math.sin(p * 9), my = (y0 + y1) / 2 - (x1 - x0) * 0.25 * Math.sin(p * 9) - 30;
    ctx.save(); ctx.globalAlpha = 1 - p * p; ctx.lineCap = 'round';
    for (const [col, lw] of [['#2a1a0c', 9], [GR.wood, 6], [GR.lt, 2]]) { ctx.strokeStyle = col; ctx.lineWidth = lw * (1 - p * 0.4); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke(); }
    leaf(x1, y1, Math.atan2(y1 - my, x1 - mx), 16, GR.lt); leaf(x1, y1, Math.atan2(y1 - my, x1 - mx) + 1.2, 12, GR.md);
    ctx.restore();
  }

  X.draw = (camX, camY) => {
    if (!areas.length && !strikes.length && !fx.length && !shots.length && !minions.length && !binds.length && !rootLines.length && !trees.length && !(st.stone > 0 || st.lshield > 0 || st.speed > 0 || st.hot > 0) && !hasPoisoned()) return;
    const now = performance.now() / 1000;
    ctx.save();
    for (const a of areas) drawArea(a, camX, camY, now);
    for (const e of strikes) drawStrike(e, camX, camY, now);
    for (const l of rootLines) drawRootLine(l, camX, camY, now);
    for (const b of binds) drawBind(b, camX, camY, now);
    for (const tr of trees) drawGuardian(tr, camX, camY, now);
    drawPoisoned(camX, camY, now);
    for (const e of fx) drawFx(e, camX, camY, now);
    ctx.globalAlpha = 1;
    for (const m of minions) drawMinion(m, camX, camY, now);
    for (const b of shots) drawShot(b, camX, camY, now);
    drawPlayerFx(camX, camY, now);
    drawHot(camX, camY, now);
    ctx.restore();
  };
  function hasPoisoned() { for (const m of zombies) if (!m.dead && m.pzT > 0) return true; for (const m of spiders) if (!m.dead && m.pzT > 0) return true; return false; }

  return X;
})();
window.ExtraMagic = ExtraMagic;
