// ======================================================================
// CHÚ LÙN CỔ THỤ — nhấn E ở Cây Cổ Thụ để dịch chuyển vào căn phòng của chú lùn (giống nhà phù thủy).
//  • Nói chuyện (E hoặc bấm chuột vào chú lùn) → bảng hội thoại (ui = 'dwarf').
//  • Giai đoạn 1: 5 nhiệm vụ (ELDER_QUESTS trong config.js) → nhận thanh Mana.
//  • Giai đoạn 2: mỗi vòng 3 nhiệm vụ → chú lùn ban ngẫu nhiên 1 trong 10 Sách Hệ (witchSt.owned).
//  • Mang sách tới Nhà Phù Thủy, nói chuyện với ông phù thủy để MỞ KHOÁ (witchSt.unlocked) → chọn hệ.
//  • Hệ chưa mở khoá: biểu tượng đen + ổ khoá (ElementPick, Sách Phép).
// Muốn gỡ: xoá file này + thẻ <script> trong survival.html + các dòng "Dwarf" trong survival.js.
// ======================================================================
const Dwarf = (() => {
  const D = { mode: null };
  const ST = { rs: 0, rp: 0, ra: false, rc: false }; // vòng sách: rs = nhiệm vụ đang làm (0..2) | rp = tiến độ đánh quái | ra = đã nhận vòng này | rc = đã skip, chờ nộp để nhận sách
  const ROUND_N = 3;
  const ELS = () => ElementPick.ELEMENTS;

  // ---------- Ảnh ----------
  const FRAMES = 10, CW = 176, CH = 224, FEET = 212, BODY = 200, FPS = 8;
  let anim = null;
  const tome = {};
  loadImage('assets/dwarf/dwarf_anim.webp').then((img) => { anim = img; });
  ['fire', 'ice', 'lightning', 'arcane', 'poison', 'earth', 'wind', 'nature', 'holy', 'dark'].forEach((id) => { loadImage('assets/tome/' + id + '.webp').then((img) => { tome[id] = img; }); });
  D.tome = (id) => tome[id] || null;
  // Ảnh vòng quay (assets/wizard/wheel_disc.webp): 10 ô, ô đầu ở chính giữa phía trên, xếp theo chiều kim đồng hồ theo thứ tự dưới
  const WHEEL_ORDER = ['fire', 'ice', 'lightning', 'arcane', 'poison', 'dark', 'holy', 'wind', 'earth', 'nature'];
  // Tỷ lệ trúng mỗi hệ khi quay (%, tổng 100) — hệ càng hiếm càng thấp
  const DROP_RATE = { arcane: 2, dark: 4, holy: 6, lightning: 8, fire: 10, ice: 10, poison: 12, wind: 14, nature: 16, earth: 18 };
  const rollElement = () => {
    const list = ELS(), total = list.reduce((t, e) => t + (DROP_RATE[e.id] || 0), 0);
    let r = Math.random() * total;
    for (const e of list) { r -= DROP_RATE[e.id] || 0; if (r < 0) return e; }
    return list[list.length - 1];
  };
  let wheelDisc = null;
  loadImage('assets/wizard/wheel_disc.webp').then((img) => { wheelDisc = img; });

  const dark = new Map(); // bóng đen của sách (hệ chưa mở khoá)
  D.silhouette = (id) => {
    const img = tome[id];
    if (!img) return null;
    let c = dark.get(id);
    if (!c) {
      c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(8,5,16,0.93)'; g.fillRect(0, 0, c.width, c.height);
      dark.set(id, c);
    }
    return c;
  };

  // Ổ khoá vàng (cx, cy = tâm; s = cỡ)
  D.lock = (c, cx, cy, s, alpha = 1) => {
    c.save();
    c.globalAlpha = alpha;
    const bw = s * 0.62, bh = s * 0.48, bx = cx - bw / 2, by = cy - bh * 0.1;
    c.lineCap = 'round';
    c.strokeStyle = '#1a1020'; c.lineWidth = s * 0.17;
    c.beginPath(); c.arc(cx, by, bw * 0.3, Math.PI, 0); c.lineTo(cx + bw * 0.3, by + s * 0.1); c.moveTo(cx - bw * 0.3, by); c.lineTo(cx - bw * 0.3, by + s * 0.1); c.stroke();
    c.strokeStyle = '#d9d9e6'; c.lineWidth = s * 0.09;
    c.beginPath(); c.arc(cx, by, bw * 0.3, Math.PI, 0); c.lineTo(cx + bw * 0.3, by + s * 0.1); c.moveTo(cx - bw * 0.3, by); c.lineTo(cx - bw * 0.3, by + s * 0.1); c.stroke();
    const g = c.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, '#ffe27a'); g.addColorStop(1, '#c58a1c');
    c.fillStyle = g; c.strokeStyle = '#1a1020'; c.lineWidth = Math.max(2, s * 0.05);
    c.beginPath(); c.roundRect(bx, by, bw, bh, s * 0.08); c.fill(); c.stroke();
    c.fillStyle = '#2a1a10';
    c.beginPath(); c.arc(cx, by + bh * 0.4, s * 0.07, 0, Math.PI * 2); c.fill();
    c.fillRect(cx - s * 0.03, by + bh * 0.4, s * 0.06, bh * 0.35);
    c.restore();
  };

  // ---------- Nhiệm vụ ----------
  D.roundQuests = (r) => {
    const g = 3 + r, z = 10 + 3 * r, d = 1 + Math.floor(r / 3);
    return [
      { kind: 'give', item: 'gold', n: g, text: 'Dâng ' + g + ' thỏi vàng' },
      { kind: 'kill', what: 'zombie', n: z, text: 'Hạ ' + z + ' zombie' },
      { kind: 'give', item: 'diamond', n: d, text: 'Dâng ' + d + ' kim cương' },
    ];
  };
  const ownedN = () => ELS().filter((e) => witchSt.owned[e.id]).length;
  const haveOf = (q, prog) => (q.kind === 'give' ? Math.min(q.n, inv[q.item] | 0) : prog);

  function status() {
    if (!elderQuest.unlocked) {
      if (!elderQuest.accepted) return { phase: 'mana', offer: true, idx: elderQuest.step, total: ELDER_QUESTS.length }; // mỗi thử thách đều phải bấm nhận mới tính
      const q = ELDER_QUESTS[Math.min(elderQuest.step, ELDER_QUESTS.length - 1)];
      return { phase: 'mana', q, idx: elderQuest.step, total: ELDER_QUESTS.length, have: haveOf(q, elderQuest.prog) };
    }
    if (ownedN() >= ELS().length) return { phase: 'done' };
    if (!ST.ra) return { phase: 'book', offer: true, idx: ST.rs, total: ROUND_N }; // mỗi nhiệm vụ nhỏ đều phải bấm nhận mới tính
    if (ST.rc) return { phase: 'book', q: { kind: 'claim', n: 1, text: 'Đã xong cả ' + ROUND_N + ' nhiệm vụ nhỏ, nộp để nhận sách' }, idx: ROUND_N - 1, total: ROUND_N, have: 1 };
    const q = D.roundQuests(ownedN())[ST.rs];
    return { phase: 'book', q, idx: ST.rs, total: ROUND_N, have: haveOf(q, ST.rp) };
  }

  // Gọi khi hạ zombie / boss (survival.js → elderCount): cộng tiến độ nhiệm vụ vòng sách
  D.count = (what) => {
    if (!elderQuest.unlocked || !ST.ra || ST.rc || ownedN() >= ELS().length) return;
    const q = D.roundQuests(ownedN())[ST.rs];
    if (q && q.kind === 'kill' && q.what === what) ST.rp = Math.min(q.n, ST.rp + 1);
  };

  D.reset = () => { ST.rs = 0; ST.rp = 0; ST.ra = false; ST.rc = false; D.mode = null; };
  D.save = () => ({ s: ST.rs, p: ST.rp, a: ST.ra, c: ST.rc });
  D.load = (o) => { o = o || {}; ST.rs = Math.max(0, Math.min(ROUND_N - 1, o.s | 0)); ST.rp = Math.max(0, o.p | 0); ST.ra = !!o.a; ST.rc = !!o.c && ST.ra; };
  D.pending = () => ELS().filter((e) => inv['tome_' + e.id] > 0 && !witchSt.unlocked[e.id]); // sách đang cầm của hệ chưa mở khoá

  // Hướng tới Nhà Phù Thủy gần Cây Cổ Thụ nhất (tính từ chỗ cây)
  function witchHint() {
    if (!houseCur || !houseCur.elder || !elderQuest.unlocked) return '';
    const C = BALANCE.witch.cell, ex = (houseCur.elder.tx + 0.5) * TILE, ey = (houseCur.elder.ty + 0.5) * TILE;
    const pcx = Math.floor(houseCur.elder.tx / C), pcy = Math.floor(houseCur.elder.ty / C);
    let best = null, bd = Infinity;
    for (let cy = pcy - 2; cy <= pcy + 2; cy++) for (let cx = pcx - 2; cx <= pcx + 2; cx++) {
      const w = witchForCell(cx, cy);
      if (!w) continue;
      const d = Math.hypot((w.tx + 0.5) * TILE - ex, (w.ty + 0.5) * TILE - ey);
      if (d < bd) { bd = d; best = w; }
    }
    if (!best) return '';
    const ang = Math.atan2((best.ty + 0.5) * TILE - ey, (best.tx + 0.5) * TILE - ex);
    const names = ['Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc', 'Bắc', 'Đông Bắc'];
    return ' Nhà Phù Thủy ở hướng ' + names[(Math.round(ang / (Math.PI / 4)) + 8) % 8] + ', cách Cây Cổ Thụ khoảng ' + Math.round(bd / TILE) + ' ô.';
  }

  function greeting() {
    const s = status();
    if (s.phase === 'done') return 'Con đã sưu tầm đủ 10 cuốn Sách Hệ. Ta không còn gì để dạy con nữa, hãy đi tìm sức mạnh của riêng con!';
    if (s.phase === 'mana') {
      if (s.offer) return s.idx > 0 ? 'Thử thách tiếp theo (' + (s.idx + 1) + '/' + s.total + ') đã sẵn sàng. Con muốn nhận chưa?' : 'Chào lữ khách! Ta là Chú Lùn, người gác Cây Cổ Thụ. Muốn có thanh Mana, con phải vượt qua ' + s.total + ' thử thách của ta.';
      return s.have >= s.q.n ? 'Con làm xong rồi à? Nộp cho ta nào!' : 'Ta đang chờ con hoàn thành thử thách này. Đủ rồi thì quay lại nộp cho ta nhé!';
    }
    const swap = canSwapShow() && spareTotal() >= SWAP_N ? ' Con có sách dư, đưa ta ' + SWAP_N + ' cuốn để quay thêm một lần (phím R).' : '';
    const wait = swap + (D.pending().length ? ' Nhớ mang sách chưa mở khoá tới Nhà Phù Thủy nhé!' + witchHint() : '');
    if (s.offer) return (s.idx > 0 ? 'Nhiệm vụ tiếp theo (' + (s.idx + 1) + '/' + s.total + ') đã sẵn sàng. Con muốn nhận chưa?' : 'Ta sẽ ban cho con một cuốn Sách Hệ ngẫu nhiên. Hãy làm ' + s.total + ' nhiệm vụ này nhé!') + wait;
    return (s.have >= s.q.n ? 'Con làm xong rồi à? Nộp cho ta nào!' : 'Cứ làm xong nhiệm vụ rồi quay lại nộp cho ta nhé.') + wait;
  }

  function primary() {
    const s = status();
    if (s.phase === 'done') return;
    if (s.offer) {
      if (s.phase === 'mana') { elderQuest.accepted = true; elderQuest.prog = 0; elderQuest.step = Math.min(elderQuest.step, ELDER_QUESTS.length - 1); }
      else { ST.ra = true; ST.rp = 0; }
      D.msg = greeting();
      return;
    }
    if (s.have < s.q.n) { D.msg = 'Con chưa làm xong: ' + s.q.text + ' (' + s.have + '/' + s.q.n + ')'; return; }
    if (s.q.kind === 'give') inv[s.q.item] -= s.q.n;
    if (s.phase === 'mana') {
      elderQuest.step++; elderQuest.prog = 0;
      if (elderQuest.step >= ELDER_QUESTS.length) {
        elderQuest.unlocked = true; mana = MAX_MANA;
        D.msg = 'Con đã vượt qua mọi thử thách! Ta ban cho con thanh Mana.' + witchHint() + ' Nói chuyện với ta tiếp để nhận Sách Hệ.';
        D.flash = performance.now();
      } else { elderQuest.accepted = false; D.msg = 'Tốt lắm! Muốn làm thử thách tiếp theo (' + (elderQuest.step + 1) + '/' + ELDER_QUESTS.length + ') thì bấm nhận nhé.'; }
      return;
    }
    ST.rs++; ST.rp = 0;
    if (ST.rs >= ROUND_N) {
      const el = rollElement(); // theo DROP_RATE; trúng cuốn đã có thì được cộng dồn (x2, x3...)
      const cnt = award(el.id);
      ST.ra = false; ST.rs = 0; ST.rc = false;
      startSpin(el.id, cnt);
    } else { ST.ra = false; D.msg = 'Tốt lắm! Muốn làm nhiệm vụ tiếp theo (' + (ST.rs + 1) + '/' + ROUND_N + ') thì bấm nhận nhé.'; }
  }

  // ---------- Đổi sách dư lấy lượt quay: SWAP_N cuốn dư (bất kỳ hệ) = 1 lượt quay thêm ----------
  const SWAP_N = 3;
  const spareOf = (e) => Math.max(0, (inv['tome_' + e.id] | 0) - (witchSt.unlocked[e.id] ? 0 : 1)); // cuốn cần để mở khoá hệ chưa mở thì giữ lại
  const spareTotal = () => ELS().reduce((t, e) => t + spareOf(e), 0);
  const canSwapShow = () => elderQuest.unlocked && ownedN() < ELS().length;
  function swapSpin() {
    if (!canSwapShow()) return;
    if (spareTotal() < SWAP_N) { D.msg = 'Cần ' + SWAP_N + ' cuốn Sách Hệ dư để đổi 1 lượt quay (con đang có ' + spareTotal() + ').'; return; }
    for (let i = 0; i < SWAP_N; i++) { // trừ dần từ hệ đang dư nhiều nhất
      const e = ELS().reduce((best, x) => (spareOf(x) > spareOf(best) ? x : best));
      inv['tome_' + e.id]--;
    }
    const el = rollElement(); // cùng tỷ lệ với vòng quay nhiệm vụ
    startSpin(el.id, award(el.id));
  }

  // Lệnh /skip 3: coi như đã xong cả 3 nhiệm vụ nhỏ của vòng này — vẫn phải nói chuyện với Chú Lùn và bấm nộp để nhận sách
  D.skipRound = () => {
    if (!elderQuest.unlocked) return 'Chưa mở Mana nên chưa có nhiệm vụ nhỏ (dùng /skip nv all trước)';
    if (ownedN() >= ELS().length) return 'Đã sưu tầm đủ 10 Sách Hệ rồi';
    if (ST.rc) return 'Đã skip rồi — hãy tới Chú Lùn bấm nộp để nhận sách';
    ST.ra = true; ST.rc = true; ST.rs = ROUND_N - 1; ST.rp = 0;
    return 'Đã hoàn thành 3 nhiệm vụ nhỏ. Tới Chú Lùn Cổ Thụ (/tp caycothu), nói chuyện rồi bấm "Nộp nhiệm vụ" để nhận sách';
  };

  // ---------- Mở bảng / đóng ----------
  D.open = () => { D.mode = 'talk'; D.msg = greeting(); ui = 'dwarf'; D.t0 = performance.now(); };
  const close = () => { D.mode = null; closeUi(); };

  // Ở Nhà Phù Thủy: có sách chưa mở khoá → mở khoá + chiếu hiệu ứng. Trả về true nếu đã xử lý.
  D.unlockAtWitch = () => {
    const p = D.pending();
    if (!p.length) return false;
    p.forEach((e) => { witchSt.unlocked[e.id] = true; inv['tome_' + e.id]--; }); // nộp cho Phù Thủy: mất 1 cuốn, hệ được mở khoá
    startReveal(p.map((e) => e.id), 'unlock');
    return true;
  };

  // ---------- Vòng quay chọn hệ ngẫu nhiên (kết quả đã chọn sẵn, vòng quay chỉ dừng đúng ô đó) ----------
  const SPIN_T = 5;
  let S = null;
  function startSpin(id, cnt) {
    const n = ELS().length, seg = Math.PI * 2 / n, idx = ELS().findIndex((e) => e.id === id);
    S = { id, idx, cnt: cnt || 1, t0: performance.now(), k: Math.max(0, WHEEL_ORDER.indexOf(id)), final: -(Math.max(0, WHEEL_ORDER.indexOf(id)) + (Math.random() - 0.5) * 0.6) * seg + Math.PI * 2 * 7, done: 0 };
    D.mode = 'spin'; ui = 'dwarf';
  }
  const spinAngle = (t) => { const k = Math.min(1, t / SPIN_T); return S.final * (1 - Math.pow(1 - k, 3.4)); };
  function drawSpin(W, H) {
    const t = (performance.now() - S.t0) / 1000, n = WHEEL_ORDER.length, seg = Math.PI * 2 / n;
    const th = spinAngle(t), cx = W / 2, cy = H * 0.5, RR = Math.min(W * 0.44, H * 0.4, 300);
    backdrop(W, H, 0.78);
    ctx.textAlign = 'center'; ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#fff6e6'; ctx.shadowColor = '#b46bff'; ctx.shadowBlur = 14;
    ctx.fillText('Vòng Quay Ma Thuật Kì Bí', cx, cy - RR - 44); ctx.shadowBlur = 0;
    ctx.save(); ctx.translate(cx, cy);
    // quầng sáng tím quanh vòng quay
    ctx.save(); ctx.shadowColor = '#b46bff'; ctx.shadowBlur = 44; ctx.fillStyle = '#1a0b33';
    ctx.beginPath(); ctx.arc(0, 0, RR * 0.97, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.rotate(th);
    if (wheelDisc) {
      const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(wheelDisc, -RR, -RR, RR * 2, RR * 2);
      ctx.imageSmoothingEnabled = sm;
    }
    ctx.restore();
    // kim chỉ (mũi tên đỏ viền vàng nằm trên vành, chỉ vào ô trúng)
    ctx.fillStyle = '#ff3b3b'; ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.moveTo(0, -RR * 0.86); ctx.lineTo(-17, -RR - 22); ctx.lineTo(17, -RR - 22); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.restore();
    if (t >= SPIN_T) {
      const e = ELS()[S.idx];
      ctx.textAlign = 'center'; ctx.font = 'bold 30px sans-serif'; ctx.fillStyle = e.color; ctx.shadowColor = e.color; ctx.shadowBlur = 16;
      ctx.fillText(e.name + '!', cx, cy + RR + 46); ctx.shadowBlur = 0;
    } else { ctx.textAlign = 'center'; ctx.font = '14px sans-serif'; ctx.fillStyle = 'rgba(232,214,255,0.8)'; ctx.fillText('Enter: bỏ qua', cx, cy + RR + 30); }
    if (t >= SPIN_T + 1.4) { const id = S.id, c = S.cnt; S = null; startReveal([id], 'book', c); }
  }

  // ---------- Màn nhận sách / mở khoá ----------
  let R = null;
  function startReveal(ids, kind, cnt) { R = { ids, kind, cnt: cnt || 1, t0: performance.now() }; D.mode = 'reveal'; ui = 'dwarf'; }
  function endReveal() {
    const r = R; R = null;
    if (r.kind === 'unlock') {
      D.mode = null; ui = null;
      ElementPick.open();
      const i = ELS().findIndex((e) => e.id === r.ids[r.ids.length - 1]);
      if (i >= 0) ElementPick.sel = i;
    } else {
      D.mode = 'talk'; D.t0 = performance.now();
      const names = r.ids.map((id) => ELS().find((e) => e.id === id).name).join(', ');
      D.msg = 'Con nhận được Sách ' + names + (r.cnt > 1 ? ' (x' + r.cnt + ')' : '') + '! Hãy mang tới Nhà Phù Thủy để mở khoá.' + witchHint();
    }
  }

  // ---------- Bố cục ----------
  function layout(W, H) {
    const pw = Math.min(820, W - 20), ph = Math.min(214, Math.max(170, H * 0.3));
    const pn = { x: Math.round((W - pw) / 2), y: H - ph - 12, w: pw, h: ph };
    const bw = 190, bh = 42;
    const go = { x: pn.x + pn.w - bw - 18, y: pn.y + pn.h - bh - 14, w: bw, h: bh };
    const cl = { x: go.x - 118, y: go.y, w: 106, h: bh };
    const sw = { x: cl.x - 226, y: go.y, w: 214, h: bh };
    return { pn, go, cl, sw };
  }

  const wrap = (text, maxW) => {
    const out = []; let cur = '';
    for (const w of text.split(' ')) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t;
    }
    if (cur) out.push(cur);
    return out;
  };
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  function backdrop(W, H, dim) {
    ctx.fillStyle = '#120a1e'; ctx.fillRect(0, 0, W, H);
    if (witchInterior) {
      const k = Math.max(W / witchInterior.width, H / witchInterior.height), iw = witchInterior.width * k, ih = witchInterior.height * k;
      ctx.drawImage(witchInterior, Math.round((W - iw) / 2), Math.round((H - ih) / 2), Math.round(iw), Math.round(ih));
    }
    ctx.fillStyle = 'rgba(14,6,28,' + dim + ')'; ctx.fillRect(0, 0, W, H);
  }

  function drawDwarfBig(cx, bottom, height, t) {
    if (!anim) return;
    const sc = height / BODY, f = Math.floor(t * FPS) % FRAMES;
    const dw = CW * sc, dh = CH * sc;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, bottom + 4, dw * 0.28, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(anim, f * CW, 0, CW, CH, Math.round(cx - dw / 2), Math.round(bottom - FEET * sc), Math.round(dw), Math.round(dh));
    ctx.imageSmoothingEnabled = sm;
  }

  function drawTomeAt(id, cx, cy, h, opts = {}) {
    const img = tome[id];
    if (!img) return;
    const sc = h / img.height, w = img.width * sc;
    const own = opts.own !== false;
    ctx.save();
    const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = opts.alpha === undefined ? 1 : opts.alpha;
    if (own) ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
    else {
      const d = D.silhouette(id);
      if (d) ctx.drawImage(d, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
      D.lock(ctx, cx, cy, h * 0.5, 1);
    }
    ctx.imageSmoothingEnabled = sm;
    ctx.restore();
  }

  // ---------- Sách Hệ là vật phẩm trong túi đồ: inv['tome_<hệ>'] = số lượng (trúng trùng thì tăng lên x2, x3...) ----------
  const award = (id) => { witchSt.owned[id] = true; inv['tome_' + id] = (inv['tome_' + id] | 0) + 1; return inv['tome_' + id]; };
  D.syncInv = () => { // đồng bộ save cũ / lệnh /unlock: hệ đã nhận mà chưa mở khoá thì túi phải có ít nhất 1 cuốn
    // Không cấp lại nếu cuốn sách đang nằm dưới đất (vừa vứt / bị văng ra) hoặc đang cầm trên tay, kẻo nó "tự chui vào túi" và bị nhân đôi
    const onGround = (id) => itemDrops.some((d) => d.id === id && d.n > 0) || (typeof held !== 'undefined' && held && held.id === id);
    ELS().forEach((e) => { const id = 'tome_' + e.id; if (witchSt.owned[e.id] && !witchSt.unlocked[e.id] && !(inv[id] > 0) && !onGround(id)) inv[id] = 1; });
  };

  function btn(b, label, enabled, hot) {
    const hov = enabled && inRect(mouse, b);
    rr(b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = !enabled ? '#4a4258' : hov ? '#7a3fc0' : hot ? '#6a35b0' : '#5f2e9a'; ctx.fill();
    ctx.strokeStyle = enabled ? '#d9a93a' : '#6a6080'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = 'bold 17px sans-serif'; ctx.fillStyle = enabled ? '#fff' : '#9a90aa';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 6);
  }

  D.draw = (W, H) => {
    const t = performance.now() / 1000;
    ctx.save();
    if (D.mode === 'spin' && S) { drawSpin(W, H); ctx.restore(); return; }
    if (D.mode === 'reveal' && R) { drawReveal(W, H); ctx.restore(); return; }
    backdrop(W, H, 0.6);
    const L = layout(W, H), pn = L.pn, s = status();

    // tiêu đề + bộ sưu tầm sách
    ctx.textAlign = 'center'; ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#e8d6ff';
    ctx.fillText('✦ Bộ sưu tầm Sách Hệ  ' + ownedN() + '/' + ELS().length + ' ✦', W / 2, 30);
    const tsz = Math.min(58, (W - 40) / 11), gap = tsz * 1.08, x0 = W / 2 - gap * 4.5;
    ELS().forEach((e, i) => {
      const own = !!witchSt.owned[e.id], cx = x0 + i * gap, cy = 40 + tsz * 0.62;
      if (own) { ctx.fillStyle = e.color + '33'; ctx.beginPath(); ctx.arc(cx, cy, tsz * 0.55, 0, Math.PI * 2); ctx.fill(); }
      drawTomeAt(e.id, cx, cy, tsz, { own, alpha: own ? 1 : 0.9 });
      if (own && !witchSt.unlocked[e.id]) { ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('chưa mở', cx, cy + tsz * 0.66 + 8); }
    });

    // chú lùn
    const dh = Math.max(110, Math.min(260, pn.y - 40 - tsz * 1.4 - 70));
    drawDwarfBig(W / 2, pn.y - 14, dh, t);

    // khung hội thoại
    rr(pn.x, pn.y, pn.w, pn.h, 14);
    ctx.fillStyle = 'rgba(26,12,52,0.95)'; ctx.fill(); ctx.strokeStyle = '#d9a93a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'left'; ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = '#ffd84a';
    ctx.fillText('Chú Lùn Cổ Thụ', pn.x + 20, pn.y + 28);
    ctx.font = '15px sans-serif'; ctx.fillStyle = '#f0e6ff';
    wrap(D.msg || '', pn.w - 40).slice(0, 3).forEach((ln, i) => ctx.fillText(ln, pn.x + 20, pn.y + 54 + i * 20));

    // thanh nhiệm vụ
    const qy = pn.y + pn.h - 58;
    if (s.q) {
      const ok = s.have >= s.q.n;
      ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#9fd8ff';
      ctx.fillText((s.phase === 'mana' ? 'Thử thách ' : 'Nhiệm vụ ') + (s.idx + 1) + '/' + s.total + ' · ' + s.q.text + '  (' + s.have + '/' + s.q.n + ')', pn.x + 20, qy);
      const bw = Math.max(120, (canSwapShow() ? L.sw.x : L.cl.x) - pn.x - 40);
      rr(pn.x + 20, qy + 10, bw, 12, 6); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      if (s.have > 0) { rr(pn.x + 20, qy + 10, Math.max(12, bw * s.have / s.q.n), 12, 6); ctx.fillStyle = ok ? '#4cd964' : '#7a8cff'; ctx.fill(); }
    } else if (s.offer) { ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#9fd8ff'; ctx.fillText((s.phase === 'mana' ? 'Thử thách ' : 'Nhiệm vụ ') + (s.idx + 1) + '/' + s.total + ' · chưa nhận  —  Phần thưởng: ' + (s.phase === 'mana' ? 'thanh Mana' : '1 Sách Hệ ngẫu nhiên'), pn.x + 20, qy + 8); }

    btn(L.cl, 'Đóng (Esc)', true, false);
    if (canSwapShow()) btn(L.sw, 'Đổi ' + SWAP_N + ' sách dư (' + spareTotal() + ') · R', spareTotal() >= SWAP_N, false);
    if (s.phase !== 'done') {
      const label = s.offer ? 'Nhận nhiệm vụ' : s.have >= s.q.n ? 'Nộp nhiệm vụ' : 'Chưa đủ';
      btn(L.go, label, s.offer || s.have >= s.q.n, s.offer || s.have >= s.q.n);
    }
    ctx.restore();
  };

  function drawReveal(W, H) {
    const t = (performance.now() - R.t0) / 1000, ids = R.ids, n = ids.length;
    const els = ids.map((id) => ELS().find((e) => e.id === id)), col = els[0].color;
    backdrop(W, H, 0.78);
    // tia sáng xoay
    const cx = W / 2, cy = H * 0.42;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(W, H) * 0.55);
    g.addColorStop(0, col + 'aa'); g.addColorStop(1, col + '00');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.25);
    ctx.fillStyle = col + '22';
    for (let k = 0; k < 12; k++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -Math.max(W, H)); ctx.lineTo(30, -Math.max(W, H)); ctx.closePath(); ctx.fill(); }
    ctx.restore();

    const bh = Math.min(H * 0.26, 190), spacing = Math.min(bh * 0.95, (W - 40) / n);
    const ease = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    els.forEach((e, i) => {
      const x = cx + (i - (n - 1) / 2) * spacing, bob = Math.sin(t * 2 + i) * 7;
      if (R.kind === 'book') {
        const k = Math.min(1, t / 0.7), sc = k <= 0 ? 0 : ease(k);
        drawTomeAt(e.id, x, cy + bob, bh * sc);
      } else {
        // mở khoá: sách đen + ổ khoá rung → vỡ → sách bừng màu
        const reveal = Math.max(0, Math.min(1, (t - 1.1) / 0.5));
        drawTomeAt(e.id, x, cy + bob, bh, { own: false });
        if (t < 1.1) {
          const sh = t > 0.5 ? Math.sin(t * 60) * 5 * (t - 0.5) / 0.6 : 0;
          ctx.save(); ctx.translate(sh, 0); D.lock(ctx, x, cy + bob, bh * 0.5, 1); ctx.restore();
        } else {
          const k = (t - 1.1) / 0.6;
          if (k < 1) D.lock(ctx, x, cy + bob - k * 60, bh * 0.5 * (1 + k * 0.6), 1 - k);
        }
        if (reveal > 0) drawTomeAt(e.id, x, cy + bob, bh, { alpha: reveal });
        if (t > 1.1 && t < 1.9) { ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - (t - 1.1) / 0.8)) + ')'; ctx.beginPath(); ctx.arc(x, cy + bob, bh * 0.7 * (0.4 + (t - 1.1)), 0, Math.PI * 2); ctx.fill(); }
      }
    });
    // đốm sáng
    const born = R.kind === 'book' ? 0 : 1.1;
    if (t > born) {
      for (let k = 0; k < 26; k++) {
        const a = k * 2.399 + t * 0.4, r = ((t - born) * (60 + (k % 5) * 22) + k * 9) % (bh * 0.9);
        const px = cx + Math.cos(a) * (r + bh * 0.2), py = cy + Math.sin(a) * (r + bh * 0.2) * 0.8;
        ctx.globalAlpha = Math.max(0, 1 - r / (bh * 0.9)) * 0.9; ctx.fillStyle = k % 2 ? '#fff6c0' : col;
        ctx.fillRect(px - 2, py - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
    }
    const names = els.map((e) => e.name).join(' · ');
    const ty = cy + bh / 2 + 52, show = R.kind === 'book' ? t > 0.5 : t > 1.2;
    if (show) {
      ctx.textAlign = 'center'; ctx.font = 'bold 30px sans-serif'; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fillStyle = '#fff6e6';
      ctx.fillText(R.kind === 'book' ? 'Nhận được Sách ' + names + (R.cnt > 1 ? '  x' + R.cnt : '') + '!' : 'Đã mở khoá ' + names + '!', cx, ty); ctx.shadowBlur = 0;
      ctx.font = '16px sans-serif'; ctx.fillStyle = '#e8d6ff';
      ctx.fillText(R.kind === 'book' ? 'Hãy mang sách tới Nhà Phù Thủy để mở khoá.' : 'Chọn hệ ở bảng tiếp theo để bắt đầu học phép.', cx, ty + 28);
    } else if (R.kind === 'unlock') {
      ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#ffd84a'; ctx.fillText('Ông phù thủy đang mở khoá Sách Hệ…', cx, ty);
    }
  }
  const revealReady = () => R && (performance.now() - R.t0) / 1000 > (R.kind === 'book' ? 1.0 : 2.0);

  // ---------- Phím / chuột ----------
  D.key = (e) => {
    const c = e.code;
    if (D.mode === 'spin') { if (S && (c === 'Enter' || c === 'Space') && performance.now() - S.t0 < SPIN_T * 1000) S.t0 = performance.now() - SPIN_T * 1000; return true; }
    if (D.mode === 'reveal') {
      if ((c === 'Enter' || c === 'NumpadEnter' || c === 'Space' || c === 'KeyE' || c === 'Escape') && revealReady()) endReveal();
      return true;
    }
    if (c === 'Escape') { close(); return true; }
    if (c === 'KeyR') { swapSpin(); return true; }
    if (c === 'Enter' || c === 'NumpadEnter' || c === 'KeyE' || c === 'Space') { primary(); return true; }
    return false;
  };
  D.click = () => {
    if (D.mode === 'spin') return;
    if (D.mode === 'reveal') { if (revealReady()) endReveal(); return; }
    const L = layout(canvas.width, canvas.height), s = status();
    if (inRect(mouse, L.cl)) { close(); return; }
    if (canSwapShow() && inRect(mouse, L.sw)) { swapSpin(); return; }
    if (s.phase !== 'done' && inRect(mouse, L.go)) primary();
  };
  D.cursor = () => {
    if (D.mode === 'spin') return 'default';
    if (D.mode === 'reveal') return revealReady() ? 'pointer' : 'default';
    const L = layout(canvas.width, canvas.height), s = status();
    return inRect(mouse, L.cl) || (canSwapShow() && inRect(mouse, L.sw)) || (s.phase !== 'done' && inRect(mouse, L.go)) ? 'pointer' : 'default';
  };

  // ---------- Cổng Hỗn Nguyên: nằm trong phòng Chú Lùn, chỉ mở khi đã mở khoá đủ 10 hệ ----------
  const PORTAL_TILE = { x: 3, y: 1 };
  const unlockedN = () => ELS().filter((e) => witchSt.unlocked[e.id]).length;
  D.portalReady = () => unlockedN() >= ELS().length;
  const portalPos = () => tileCenter(PORTAL_TILE.x, PORTAL_TILE.y);
  D.nearPortal = (maxDist) => {
    if (layer !== 2 || !houseCur || !houseCur.elderRoom) return false;
    const c = portalPos();
    return Math.hypot(c.x - player.x, c.y - player.y) < maxDist;
  };
  D.usePortal = () => {
    if (!D.portalReady()) { say('Cổng Hỗn Nguyên còn đóng: cần mở khoá đủ ' + ELS().length + ' Sách Hệ (còn thiếu ' + (ELS().length - unlockedN()) + ')'); shake = Math.max(shake, 0.25); return; }
    if (portalAnimT0 === null || performance.now() / 1000 - portalAnimT0 < PORTAL_ANIM_S) return; // cổng chưa hiện xong thì chưa vào được
    enterOmniArena();
  };
  // Ảnh động cổng (assets/portal/omni_portal.webp): dải 10 khung — sách xoay (0-4) → nổ sáng (5-6) → cổng hiện ra (7-9)
  const PCW = 334, PCH = 470, PF = 10, P_SCALE = 0.38, P_FEET = { x: 167, y: 366 }; // cỡ 1 khung | tỉ lệ vẽ | chân cổng trong khung
  let portalImg = null, portalDark = null, portalAnimT0 = null, portalLastDraw = 0, portalAlpha = 0; // portalAnimT0: giây bắt đầu hoạt ảnh hiện cổng (null = cổng ẩn) | portalAlpha: độ hiện của cổng (đi xa thì mờ dần)
  loadImage('assets/portal/omni_portal.webp').then((img) => { portalImg = img; });

  // Khung cổng tối màu cho lúc chưa đủ 10 hệ (tạo một lần)
  function darkPortalFrame() {
    if (portalDark || !portalImg) return portalDark;
    const c = document.createElement('canvas'); c.width = PCW; c.height = PCH;
    const g = c.getContext('2d');
    g.drawImage(portalImg, (PF - 1) * PCW, 0, PCW, PCH, 0, 0, PCW, PCH);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(12,8,24,0.74)'; g.fillRect(0, 0, PCW, PCH);
    portalDark = c;
    return c;
  }
  // Khung đang chiếu sau thời gian e (giây): giữ khung 0 một chút, rồi chạy tới khung cuối
  const portalFrame = (e) => (e < 0.4 ? 0 : Math.min(PF - 1, 1 + Math.floor((e - 0.4) * 7)));
  const PORTAL_ANIM_S = 0.4 + (PF - 1) / 7; // thời gian chạy hết hoạt ảnh (giây)
  const PORTAL_WAKE = 2.4 * TILE;            // lại gần cổng trong tầm này thì cổng bắt đầu hiện
  const PORTAL_SLEEP = 3.2 * TILE;           // đi xa hơn tầm này thì cổng mờ dần rồi ẩn (xa hơn WAKE để khỏi nhấp nháy ở mép)

  function drawPortal(camX, camY) {
    const c = portalPos(), sx = c.x - camX, sy = c.y - camY + 14, t = performance.now() / 1000, ready = D.portalReady();
    const dt = Math.min(0.1, t - portalLastDraw);
    if (t - portalLastDraw > 0.4) { portalAnimT0 = null; portalAlpha = 0; } // vừa vào lại phòng: cổng ẩn cho tới khi đi lại gần
    portalLastDraw = t;
    if (!ready) portalAlpha = 1; // chưa đủ hệ: luôn hiện khung tối
    else if (D.nearPortal(PORTAL_WAKE)) { // đi lại gần: cổng hiện và chạy hoạt ảnh
      if (portalAnimT0 === null) {
        portalAnimT0 = t;
        setTimeout(() => { if (layer === 2) shake = Math.max(shake, 0.5); }, 1000); // lúc nổ sáng
      }
      portalAlpha = 1;
    } else if (portalAnimT0 !== null && !D.nearPortal(PORTAL_SLEEP)) { // đi xa: mờ dần rồi ẩn
      portalAlpha = Math.max(0, portalAlpha - dt * 4);
      if (portalAlpha === 0) portalAnimT0 = null;
    }
    const visible = !ready || portalAnimT0 !== null;
    ctx.save();
    ctx.globalAlpha = portalAlpha;
    if (visible) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy + 2, 44, 9, 0, 0, Math.PI * 2); ctx.fill(); }
    if (portalImg && visible) {
      const dw = PCW * P_SCALE, dh = PCH * P_SCALE, dx = Math.round(sx - P_FEET.x * P_SCALE), dy = Math.round(sy - P_FEET.y * P_SCALE);
      const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      if (ready) {
        const f = portalFrame(t - portalAnimT0); // chạy hết thì đứng ở khung cổng đã mở
        ctx.drawImage(portalImg, f * PCW, 0, PCW, PCH, dx, dy, dw, dh);
        if (f === PF - 1) { // cổng đã mở: nhấp nháy sáng nhẹ
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = portalAlpha * (0.18 + 0.12 * Math.sin(t * 3));
          ctx.drawImage(portalImg, f * PCW, 0, PCW, PCH, dx, dy, dw, dh);
        }
      } else {
        const d = darkPortalFrame();
        if (d) ctx.drawImage(d, dx, dy, dw, dh);
      }
      ctx.imageSmoothingEnabled = sm;
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (!ready) ELS().forEach((e, i) => { // 10 viên ngọc quanh cổng: hệ nào đã mở khoá thì sáng đúng màu
      const a = (i * Math.PI * 2) / ELS().length - Math.PI / 2, lit = !!witchSt.unlocked[e.id];
      ctx.fillStyle = lit ? e.color : '#2c2438'; ctx.strokeStyle = lit ? '#fff' : '#4a4258'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx + Math.cos(a) * 46, sy - 62 + Math.sin(a) * 70, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    if (visible && !ready && D.nearPortal(2.6 * TILE)) { // cổng chưa mở: hiện tiến độ mở khoá
      const label = 'Cổng Hỗn Nguyên · ' + unlockedN() + '/' + ELS().length + ' hệ đã mở khoá';
      ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.fillStyle = '#d9c8ff';
      ctx.strokeText(label, sx, sy + 24); ctx.fillText(label, sx, sy + 24);
    }
    ctx.restore();
  }

  // ---------- Chú lùn đứng trong phòng (vẽ giữa thế giới) ----------
  const NPC_H = 1.9 * TILE;
  D.npcRect = () => {
    if (!anim || layer !== 2 || !houseCur || !houseCur.elderRoom) return null;
    const camX = Math.floor(player.x - canvas.width / 2), camY = Math.floor(player.y - canvas.height / 2);
    const sc = NPC_H / BODY, dw = CW * sc, c = tileCenter(WIZARD_TILE.x, WIZARD_TILE.y);
    return { x: c.x - camX - dw * 0.35, y: c.y - camY + 18 - NPC_H - 8, w: dw * 0.7, h: NPC_H + 8 };
  };
  D.drawNpc = (camX, camY) => {
    drawPortal(camX, camY);
    if (!anim) return;
    const c = tileCenter(WIZARD_TILE.x, WIZARD_TILE.y), sc = NPC_H / BODY, dw = CW * sc, dh = CH * sc;
    const f = Math.floor(performance.now() / 1000 * FPS) % FRAMES, sx = c.x - camX, sy = c.y - camY + 18;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(sx, sy - 2, dw * 0.26, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(anim, f * CW, 0, CW, CH, Math.round(sx - dw / 2), Math.round(sy - FEET * sc), Math.round(dw), Math.round(dh));
    ctx.imageSmoothingEnabled = sm;
    // dấu ! (có nhiệm vụ mới) / ? (đã đủ, nộp được)
    const s = status();
    if (s.phase !== 'done') {
      const ready = !s.offer && s.have >= s.q.n, bob = Math.sin(performance.now() / 260) * 3;
      ctx.textAlign = 'center'; ctx.font = 'bold 26px sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#1a1020';
      ctx.strokeText(ready ? '?' : s.offer ? '!' : '…', sx, sy - NPC_H - 6 + bob);
      ctx.fillStyle = ready ? '#7dff8a' : '#ffd84a'; ctx.fillText(ready ? '?' : s.offer ? '!' : '…', sx, sy - NPC_H - 6 + bob);
    }
  };

  return D;
})();
window.Dwarf = Dwarf;
