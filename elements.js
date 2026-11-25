// ======================================================================
// BẢNG CHỌN HỆ PHÉP: nhấn E (hoặc bấm chuột) vào ông phù thủy trong Nhà Phù Thủy để mở bảng 10 hệ.
// Chọn hệ xong sẽ hiện BẢNG MUA PHÉP của hệ đó (ui = 'spellshop'): bấm nút Mua (hoặc phím 1-4) để học phép bằng ngọc lục bảo.
// Không còn phím Q đổi hệ: hệ đang dùng = hệ đã chọn ở đây.
// Chọn hệ bằng chuột (bấm vào biểu tượng) hoặc phím ← → ↑ ↓ / số 1-9,0, rồi nhấn Enter (hoặc bấm "Xác Nhận") để xác nhận.
// Esc để đóng. Hệ đã chọn lưu trong witchSt.element (có lưu game).
// Đã có phép cho cả 10 hệ: Lửa, Băng, Sét, Độc, Đất, Gió, Thánh Quang, Hắc Ám, Tự Nhiên, Không Gian (more-magic.js lo 7 hệ mới).
// Muốn gỡ: xoá elements.js, thẻ <script> trong survival.html và các dòng "ElementPick" trong survival.js.
// ======================================================================
const ElementPick = (() => {
  const WITCH = BALANCE.witch;
  // Thứ tự = thứ tự biểu tượng trong assets/wizard/elements.webp, xếp vòng tròn theo chiều kim đồng hồ từ trên cùng
  const ELEMENTS = [
    { id: 'fire',      name: 'Hệ Lửa',      color: '#ffb23a', desc: 'Sát thương lớn, thiêu đốt kẻ địch theo thời gian.' },
    { id: 'ice',       name: 'Hệ Băng',     color: '#7fd0ff', desc: 'Làm chậm và đóng băng kẻ địch, khống chế chiến trường.' },
    { id: 'lightning', name: 'Hệ Sét',      color: '#ffe14a', desc: 'Tốc độ cao, sát thương lan nhanh giữa các kẻ địch.' },
    { id: 'poison',    name: 'Hệ Độc',      color: '#8be04a', desc: 'Nhiễm độc làm kẻ địch mất máu dần theo thời gian.' },
    { id: 'earth',     name: 'Hệ Đất',      color: '#d2a06a', desc: 'Phòng thủ vững chắc, sát thương nặng và gây choáng.' },
    { id: 'wind',      name: 'Hệ Gió',      color: '#6fe0e0', desc: 'Nhanh nhẹn, đẩy lùi kẻ địch và tăng tốc độ di chuyển.' },
    { id: 'holy',      name: 'Hệ Thánh Quang', color: '#fff0a0', desc: 'Hồi phục máu và thanh tẩy, khắc chế bóng tối.' },
    { id: 'dark',      name: 'Hệ Hắc Ám',   color: '#c08aff', desc: 'Hút sinh lực kẻ địch, sát thương xuyên giáp.' },
    { id: 'nature',    name: 'Hệ Tự Nhiên', color: '#5fd068', desc: 'Triệu hồi cây cối, hồi phục và trói chân kẻ địch.' },
    { id: 'arcane',    name: 'Hệ Không Gian', color: '#b07aff', desc: 'Phép thuật thuần khiết, sát thương chính xác khó né.' },
  ];
  const N = ELEMENTS.length;
  const ICON_SRC = 128; // mỗi biểu tượng trong sprite sheet 128×128

  let sheet = null;
  loadImage('assets/wizard/elements.webp').then((img) => { sheet = img; });

  const P = { ELEMENTS, sel: 0 };
  const indexOf = (id) => Math.max(0, ELEMENTS.findIndex((e) => e.id === id));
  const isOpen = (id) => !!witchSt.unlocked[id]; // hệ đã mở khoá ở Nhà Phù Thủy (Sách Hệ lấy từ Chú Lùn)
  P.isOpen = isOpen;

  P.open = () => {
    const first = ELEMENTS.findIndex((e) => isOpen(e.id));
    P.sel = witchSt.element && isOpen(witchSt.element) ? indexOf(witchSt.element) : Math.max(0, first);
    ui = 'elements';
  };
  P.close = () => { if (ui === 'elements' || ui === 'spellshop') closeUi(); };

  // ---------- Bố cục (dùng chung cho vẽ + bấm chuột) ----------
  function layout(W, H) {
    const panelH = 92, btnH = 50, gap = 14;
    const bottom = panelH + btnH + gap * 3 + 14;
    const cx = W / 2;
    const topPad = 64;
    const availH = H - bottom - topPad;
    const R = Math.max(70, Math.min(W * 0.32, availH / 2 - 20, 290)); // bán kính vòng
    const cy = topPad + availH / 2 + 4;
    const icon = Math.round(Math.max(40, Math.min(R * 0.44, 104)));
    const icons = ELEMENTS.map((e, i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / N;
      return { i, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, r: icon / 2 };
    });
    const pw = Math.min(760, W - 20);
    const panel = { x: Math.round(cx - pw / 2), y: Math.round(H - bottom + gap), w: pw, h: panelH };
    const bw = Math.min(280, W - 40);
    const btn = { x: Math.round(cx - bw / 2), y: panel.y + panel.h + gap, w: bw, h: btnH };
    return { cx, cy, R, icon, icons, panel, btn };
  }

  const hitIcon = (L) => L.icons.find((p) => Math.hypot(mouse.x - p.x, mouse.y - p.y) <= p.r * 1.1);

  // ---------- Xác nhận ----------
  P.apply = (id) => { // đặt chế độ phép theo hệ đã chọn (cũng gọi khi tải game)
    if (window.FireMagic) { FireMagic.mode = id === 'fire'; if (WITCH.skills.some((k) => k.el === id)) FireMagic.tab = id; } // thẻ trong Sách Phép = hệ vừa chọn
    if (window.IceMagic) IceMagic.mode = id === 'ice';
    if (window.ArcaneMagic) ArcaneMagic.mode = id === 'arcane';
    if (window.ExtraMagic) ExtraMagic.setElement(id); // Sét / Độc / Đất / Gió / Thánh Quang / Hắc Ám (more-magic.js)
  };
  P.confirm = () => {
    const el = ELEMENTS[P.sel];
    if (!isOpen(el.id)) { // hệ chưa mở khoá
      say(witchSt.owned[el.id] ? el.name + ' chưa mở khoá — nói chuyện với ông phù thủy để mở khoá' : el.name + ' chưa mở khoá — hoàn thành nhiệm vụ của Chú Lùn ở Cây Cổ Thụ để nhận Sách Hệ');
      return;
    }
    witchSt.element = el.id;
    if (window.BookHold) BookHold.trigger(); // rút sách ra cầm
    P.apply(el.id);
    burst(player.x, player.y - 30, el.color, 22, 150, -100);
    const own = WITCH.skills.filter((k) => k.el === el.id);
    if (own.length) say('Đã chọn ' + el.name + ': ' + own.map((k) => k.key + ' ' + k.name).join(' · '));
    else say('Đã chọn ' + el.name + ' — hệ này chưa có phép, sẽ sớm ra mắt');
    P.openShop(el);
  };

  // ---------- Bảng mua phép ----------
  const shopList = () => WITCH.skills.filter((k) => k.el === P.shopEl.id);
  P.openShop = (el) => {
    P.shopEl = el;
    P.tab = 'el';
    ui = 'spellshop';
  };
  function shopLayout(W, H) {
    const bw = Math.min(640, W - 20), rowH = 80, n = Math.max(shopList().length, 3);
    const bh = Math.min(H - 16, 150 + n * (rowH + 8) + 40);
    const bx = Math.round((W - bw) / 2), by = Math.round((H - bh) / 2);
    const tabs = [{ id: 'el', label: P.shopEl.name, x: bx + 24, y: by + 70, w: 170, h: 26 }];
    const rows = shopList().map((s, i) => {
      const y = by + 108 + i * (rowH + 8);
      return { s, x: bx + 24, y, w: bw - 48, h: rowH, btn: { x: bx + bw - 24 - 96, y: y + rowH - 34, w: 84, h: 26 } };
    });
    return { bx, by, bw, bh, tabs, rows, back: { x: bx + bw - 24 - 130, y: by + 70, w: 130, h: 26 } };
  }
  // Cách học một phép: unlock = nộp vật phẩm (vd. Hoa Sen Lửa) · soon = chưa mở · còn lại = trả ngọc lục bảo
  function priceOf(s) {
    if (s.unlock && s.unlock.flag) {
      const done = Boolean(witchFlags[s.unlock.flag]);
      return { label: 'Học phép', ok: done, need: 'Điều kiện: ' + s.unlock.text + (s.unlock.flag === 'antidoteUse' ? ' (' + witchFlags.cureN + '/5)' : s.unlock.flag === 'spiderKill' ? ' (' + witchFlags.spiderN + '/10)' : s.unlock.flag === 'stoneBlock' ? ' (' + witchFlags.stoneN + '/5)' : s.unlock.flag === 'nightKill' ? ' (' + witchFlags.nightN + '/15)' : s.unlock.flag === 'potionUse' ? ' (' + witchFlags.potionN + '/5)' : s.unlock.flag === 'windKill' ? ' (' + witchFlags.windN + '/10)' : s.unlock.flag === 'strikeDodge' ? ' (' + witchFlags.dodgeN + '/3)' : s.unlock.flag === 'shieldBlock' ? ' (' + witchFlags.shieldN + '/10)' : s.unlock.flag === 'zombieKill' ? ' (' + witchFlags.zombieN + '/5)' : s.unlock.flag === 'flowerKill' ? ' (' + witchFlags.flowerN + '/10)' : s.unlock.flag === 'meleeKill' ? ' (' + witchFlags.meleeN + '/10)' : s.unlock.flag === 'walkKill' ? ' (' + Math.floor(witchFlags.walkN) + '/1000 m)' : s.unlock.flag === 'harvestKill' ? ' (' + witchFlags.harvestN + '/10)' : s.unlock.flag === 'chopKill' ? ' (' + witchFlags.chopN + '/10)' : s.unlock.flag === 'plantKill' ? ' (' + witchFlags.plantN + '/5)' : s.unlock.flag === 'iceUse' ? ' (Z ' + witchFlags.iceZ + '/5, X ' + witchFlags.iceX + '/5)' : '') + (done ? ' ✔' : ' (chưa đạt)') };
    }
    if (s.unlock) {
      const it = ITEMS[s.unlock.item], have = inv[s.unlock.item] | 0;
      if (s.unlock.item2) { const it2 = ITEMS[s.unlock.item2], have2 = inv[s.unlock.item2] | 0; return { label: 'Học phép', ok: have >= s.unlock.n && have2 >= s.unlock.n2, need: 'Cần ' + s.unlock.n + ' ' + it.name + ' (có ' + have + ') + ' + s.unlock.n2 + ' ' + it2.name + ' (có ' + have2 + ') · ' + it.how }; }
      return { label: 'Học phép', ok: have >= s.unlock.n, need: 'Cần ' + s.unlock.n + ' ' + it.name + ' (có ' + have + ') · ' + it.how };
    }
    if (s.soon) return { label: '🔒 Sắp mở', ok: false, need: 'Phép này chưa mở khoá được' };
    return { label: 'Mua · ' + s.cost + '💎', ok: inv.emerald >= s.cost };
  }
  function shopBuy(i) {
    const r = shopLayout(canvas.width, canvas.height).rows[i];
    if (r) buySpell(r.s.id);
  }

  // ---------- Phím: trả về true nếu đã xử lý ----------
  P.key = (e) => {
    const c = e.code;
    if (ui === 'spellshop') {
      if (c === 'Escape') { P.close(); return true; }
      if (c === 'Backspace' || c === 'KeyB') { ui = 'elements'; return true; }
      if (c === 'Tab' || c === 'ArrowLeft' || c === 'ArrowRight') { return true; }
      if (c.startsWith('Digit')) { shopBuy(parseInt(c.slice(5), 10) - 1); return true; }
      return false;
    }
    if (c === 'Escape') { P.close(); return true; }
    if (c === 'Enter' || c === 'NumpadEnter') { P.confirm(); return true; }
    if (c === 'ArrowRight' || c === 'ArrowDown') { P.sel = (P.sel + 1) % N; return true; }
    if (c === 'ArrowLeft' || c === 'ArrowUp') { P.sel = (P.sel + N - 1) % N; return true; }
    if (c.startsWith('Digit')) { const n = parseInt(c.slice(5), 10); P.sel = (n === 0 ? 10 : n) - 1; return true; }
    return false;
  };

  // ---------- Chuột ----------
  P.click = () => {
    if (ui === 'spellshop') {
      const SL = shopLayout(canvas.width, canvas.height);
      if (inRect(mouse, SL.back)) { ui = 'elements'; return; }
      for (const t of SL.tabs) if (inRect(mouse, t) && WITCH.skills.some((k) => k.el === P.shopEl.id)) P.tab = t.id;
      shopLayout(canvas.width, canvas.height).rows.forEach((r, i) => { if (inRect(mouse, r.btn)) shopBuy(i); });
      return;
    }
    const L = layout(canvas.width, canvas.height);
    const hit = hitIcon(L);
    if (hit) { P.sel = hit.i; return; }
    if (inRect(mouse, L.btn)) P.confirm();
  };
  P.cursor = () => {
    if (ui === 'spellshop') {
      const SL = shopLayout(canvas.width, canvas.height);
      return inRect(mouse, SL.back) || SL.tabs.some((t) => inRect(mouse, t)) || SL.rows.some((r) => inRect(mouse, r.btn)) ? 'pointer' : 'default';
    }
    const L = layout(canvas.width, canvas.height);
    return hitIcon(L) || inRect(mouse, L.btn) ? 'pointer' : 'default';
  };

  function drawShop(W, H) {
    const SL = shopLayout(W, H), el = P.shopEl, t = performance.now() / 1000;
    ctx.save();
    ctx.fillStyle = '#120a1e'; ctx.fillRect(0, 0, W, H);
    if (witchInterior) {
      const k = Math.max(W / witchInterior.width, H / witchInterior.height), iw = witchInterior.width * k, ih = witchInterior.height * k;
      ctx.drawImage(witchInterior, Math.round((W - iw) / 2), Math.round((H - ih) / 2), Math.round(iw), Math.round(ih));
    }
    ctx.fillStyle = 'rgba(14,6,28,0.7)'; ctx.fillRect(0, 0, W, H);
    roundRect(SL.bx, SL.by, SL.bw, SL.bh, 14);
    ctx.fillStyle = 'rgba(26,12,52,0.96)'; ctx.fill(); ctx.strokeStyle = '#d9a93a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#ffd84a';
    ctx.fillText('✦ Học Phép · ' + el.name + ' ✦', SL.bx + SL.bw / 2, SL.by + 34);
    ctx.font = '13px sans-serif'; ctx.fillStyle = elderQuest.unlocked ? '#9fd8ff' : '#ff9a9a';
    const wallet = []; // số dư của những thứ dùng để học phép trong hệ này
    if (shopList().some((k) => !k.unlock && !k.soon)) wallet.push('Ngọc lục bảo: ' + inv.emerald);
    for (const k of shopList()) if (k.unlock && k.unlock.item) { const w = ITEMS[k.unlock.item].name + ': ' + (inv[k.unlock.item] | 0); if (!wallet.includes(w)) wallet.push(w); if (k.unlock.item2) { const w2 = ITEMS[k.unlock.item2].name + ': ' + (inv[k.unlock.item2] | 0); if (!wallet.includes(w2)) wallet.push(w2); } }
    ctx.fillText(elderQuest.unlocked ? wallet.join('  ·  ') : 'Cần mở Cổng Mana (nhiệm vụ Cây Cổ Thụ) mới học được phép', SL.bx + SL.bw / 2, SL.by + 56);
    const hasEl = WITCH.skills.some((k) => k.el === el.id);
    for (const tb of SL.tabs) {
      const on = P.tab === tb.id, dis = tb.id === 'el' && !hasEl;
      roundRect(tb.x, tb.y, tb.w, tb.h, 6);
      ctx.fillStyle = dis ? 'rgba(255,255,255,0.05)' : on ? '#5f2e9a' : 'rgba(255,255,255,0.12)'; ctx.fill();
      ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = dis ? '#7a6a9a' : '#fff'; ctx.fillText(tb.label, tb.x + tb.w / 2, tb.y + 18);
    }
    roundRect(SL.back.x, SL.back.y, SL.back.w, SL.back.h, 6); ctx.fillStyle = inRect(mouse, SL.back) ? '#7a3fc0' : 'rgba(255,255,255,0.12)'; ctx.fill();
    ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('← Đổi hệ', SL.back.x + SL.back.w / 2, SL.back.y + 18);
    if (!SL.rows.length) { ctx.font = 'italic 15px sans-serif'; ctx.fillStyle = '#b8a3d8'; ctx.fillText('Chưa có phép — sắp ra mắt', SL.bx + SL.bw / 2, SL.by + 150); }
    SL.rows.forEach((r, i) => {
      const s = r.s, got = witchSt.learned[s.id], pr = priceOf(s), can = elderQuest.unlocked && pr.ok;
      roundRect(r.x, r.y, r.w, r.h, 10); ctx.fillStyle = got ? 'rgba(76,217,100,0.14)' : 'rgba(255,255,255,0.07)'; ctx.fill();
      ctx.textAlign = 'left'; ctx.font = 'bold 17px sans-serif'; ctx.fillStyle = '#ffd84a'; ctx.fillText((i + 1) + '. ' + s.name, r.x + 14, r.y + 24);
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#d8c8f0';
      const words = s.desc.split(' '); let line = '', ly = r.y + 42; // xuống dòng mô tả (tối đa 2 dòng, chừa chỗ nút)
      for (const w of words) { if (ctx.measureText(line + w).width > r.w - 28) { ctx.fillText(line, r.x + 14, ly); ly += 14; line = ''; if (ly > r.y + 58) break; } line += w + ' '; }
      if (ly <= r.y + 58) ctx.fillText(line, r.x + 14, ly);
      ctx.textAlign = 'right'; ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#9fd8ff';
      const b = r.btn, hov = inRect(mouse, b);
      roundRect(b.x, b.y, b.w, b.h, 6);
      ctx.fillStyle = got ? '#2c6b3a' : can ? (hov ? '#7a3fc0' : '#5f2e9a') : '#4a4258'; ctx.fill();
      ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = got || can ? '#fff' : '#9a90aa';
      ctx.fillText(got ? '✓ Đã học' : pr.label, b.x + b.w / 2, b.y + 18);
      if (!got && pr.need) { // điều kiện học: màu xanh khi đã đủ, cam khi còn thiếu
        ctx.textAlign = 'left'; ctx.font = '12px sans-serif'; ctx.fillStyle = pr.ok ? '#8fe6a0' : '#ffb27a';
        ctx.fillText(pr.need, r.x + 14, r.y + r.h - 10);
      }
    });
    ctx.textAlign = 'center'; ctx.font = '12px sans-serif'; ctx.fillStyle = '#b8a3d8';
    ctx.restore();
  }
  // ---------- Vẽ ----------
  const darkIcons = [];
  function darkIcon(i) { // biểu tượng chưa mở khoá: bóng đen
    if (!darkIcons[i]) {
      const c = document.createElement('canvas'); c.width = c.height = ICON_SRC;
      const g = c.getContext('2d');
      g.drawImage(sheet, i * ICON_SRC, 0, ICON_SRC, ICON_SRC, 0, 0, ICON_SRC, ICON_SRC);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(8,5,16,0.92)'; g.fillRect(0, 0, ICON_SRC, ICON_SRC);
      darkIcons[i] = c;
    }
    return darkIcons[i];
  }
  function drawIcon(i, x, y, size, alpha) {
    const locked = !isOpen(ELEMENTS[i].id);
    ctx.globalAlpha = alpha;
    if (sheet) {
      if (locked) ctx.drawImage(darkIcon(i), Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      else ctx.drawImage(sheet, i * ICON_SRC, 0, ICON_SRC, ICON_SRC, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
    } else { ctx.fillStyle = locked ? '#1a1424' : ELEMENTS[i].color; ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (locked && window.Dwarf) Dwarf.lock(ctx, x, y + size * 0.04, size * 0.5, 1);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  P.draw = (W, H) => {
    if (ui === 'spellshop') { drawShop(W, H); return; }
    const L = layout(W, H);
    const t = performance.now() / 1000;
    const el = ELEMENTS[P.sel];
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // nền: ảnh nội thất phòng phù thủy (nếu có) phủ kín màn hình, tối đi
    ctx.fillStyle = '#120a1e'; ctx.fillRect(0, 0, W, H);
    if (witchInterior) {
      const s = Math.max(W / witchInterior.width, H / witchInterior.height);
      const iw = witchInterior.width * s, ih = witchInterior.height * s;
      ctx.drawImage(witchInterior, Math.round((W - iw) / 2), Math.round((H - ih) / 2), Math.round(iw), Math.round(ih));
    }
    ctx.fillStyle = 'rgba(14,6,28,0.62)'; ctx.fillRect(0, 0, W, H);

    // tiêu đề
    ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#e8d6ff';
    ctx.fillText('✦ Chọn Hệ Phép ✦', W / 2, 34);

    // vòng phép thuật dưới chân ông phù thủy
    const g = ctx.createRadialGradient(L.cx, L.cy, 4, L.cx, L.cy, L.R * 0.95);
    g.addColorStop(0, 'rgba(176,100,255,0.55)'); g.addColorStop(0.6, 'rgba(120,60,200,0.22)'); g.addColorStop(1, 'rgba(120,60,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(224,184,74,0.75)'; ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(190,130,255,0.7)'; ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 18;
    ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R * 0.72, 0, Math.PI * 2); ctx.stroke();
    ctx.lineDashOffset = t * 24; ctx.strokeStyle = 'rgba(224,184,74,0.5)';
    ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // ngôi sao 5 cánh xoay chậm
    ctx.strokeStyle = 'rgba(200,150,255,0.6)'; ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = t * 0.3 - Math.PI / 2 + ((k * 2) * Math.PI * 2) / 5;
      const px = L.cx + Math.cos(a) * L.R * 0.5, py = L.cy + Math.sin(a) * L.R * 0.5;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();

    // tia sáng nối từ hệ đang chọn về ông phù thủy
    const sp = L.icons[P.sel];
    ctx.strokeStyle = el.color; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 5); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(L.cx, L.cy); ctx.lineTo(sp.x, sp.y); ctx.stroke(); ctx.globalAlpha = 1;

    // ông phù thủy ở giữa
    if (typeof wizardAnim !== 'undefined' && wizardAnim) {
      const fw = wizardAnim.width / WIZARD_FRAMES, ih = wizardAnim.height;
      const dh = Math.round(L.R * 0.95), dw = Math.round(dh * fw / ih);
      const f = Math.floor(t * 5) % WIZARD_FRAMES;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(L.cx, L.cy + dh * 0.42, dw * 0.38, dh * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(wizardAnim, f * fw, 0, fw, ih, Math.round(L.cx - dw / 2), Math.round(L.cy + dh * 0.45 - dh), dw, dh);
    }

    // 10 biểu tượng hệ
    const hover = hitIcon(L);
    for (const p of L.icons) {
      const on = p.i === P.sel, hv = hover && hover.i === p.i;
      const size = Math.round(L.icon * (on ? 1.28 : hv ? 1.12 : 1));
      if (on) {
        const gl = ctx.createRadialGradient(p.x, p.y, size * 0.4, p.x, p.y, size * 0.95);
        gl.addColorStop(0, el.color + 'cc'); gl.addColorStop(1, el.color + '00');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.95, 0, Math.PI * 2); ctx.fill();
      }
      drawIcon(p.i, p.x, p.y, size, on || hv ? 1 : 0.82);
      if (on) { ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, size / 2 + 3, 0, Math.PI * 2); ctx.stroke(); }
      if (witchSt.element === ELEMENTS[p.i].id && isOpen(ELEMENTS[p.i].id)) { // hệ đang dùng: chấm xanh
        ctx.fillStyle = '#4cd964'; ctx.strokeStyle = '#0c2a14'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x + size * 0.36, p.y - size * 0.36, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }

    // khung mô tả
    const pn = L.panel;
    roundRect(pn.x, pn.y, pn.w, pn.h, 14);
    ctx.fillStyle = 'rgba(26,12,52,0.94)'; ctx.fill();
    ctx.strokeStyle = '#d9a93a'; ctx.lineWidth = 3; ctx.stroke();
    const isz = Math.min(64, pn.h - 24);
    const tm = window.Dwarf && Dwarf.tome(el.id);
    if (tm) { // ảnh cuốn Sách Hệ (chưa mở khoá: bóng đen + ổ khoá)
      const k = isz / Math.max(tm.width, tm.height), tw = tm.width * k, th = tm.height * k, tcx = pn.x + 20 + isz / 2, tcy = pn.y + pn.h / 2;
      const src = isOpen(el.id) ? tm : (Dwarf.silhouette(el.id) || tm);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(src, Math.round(tcx - tw / 2), Math.round(tcy - th / 2), Math.round(tw), Math.round(th)); ctx.imageSmoothingEnabled = false;
      if (!isOpen(el.id)) Dwarf.lock(ctx, tcx, tcy, isz * 0.55, 1);
    } else drawIcon(P.sel, pn.x + 20 + isz / 2, pn.y + pn.h / 2, isz, 1);
    ctx.fillStyle = 'rgba(217,169,58,0.7)'; ctx.fillRect(pn.x + 36 + isz, pn.y + 16, 2, pn.h - 32);
    const tx = pn.x + 52 + isz;
    ctx.textAlign = 'left'; ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#ffd84a';
    ctx.fillText(el.name, tx, pn.y + 38);
    if (witchSt.element === el.id) {
      const nw = ctx.measureText(el.name).width;
      ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#4cd964'; ctx.fillText('● Đang dùng', tx + nw + 12, pn.y + 37);
    }
    if (!isOpen(el.id)) {
      const nw = ctx.measureText(el.name).width;
      ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#ff9a9a'; ctx.fillText(witchSt.owned[el.id] ? '🔒 Chưa mở khoá' : '🔒 Chưa có sách', tx + nw + 12, pn.y + 37);
    }
    ctx.font = '15px sans-serif'; ctx.fillStyle = '#f0e6ff';
    ctx.fillText(el.desc, tx, pn.y + 62);
    if (!isOpen(el.id)) { ctx.font = 'italic 12px sans-serif'; ctx.fillStyle = '#d9b8ff'; ctx.fillText('Nhận Sách Hệ từ Chú Lùn ở Cây Cổ Thụ (nhiệm vụ), rồi mang tới đây để mở khoá', tx, pn.y + 82); }
    if (el.soon) { ctx.font = 'italic 12px sans-serif'; ctx.fillStyle = '#b8a3d8'; ctx.fillText('Chưa có phép — sắp ra mắt', tx, pn.y + 82); }

    // nút xác nhận
    const b = L.btn, bh = inRect(mouse, b);
    roundRect(b.x, b.y, b.w, b.h, 12);
    const can = isOpen(el.id);
    ctx.fillStyle = !can ? '#3a3248' : bh ? '#7a3fc0' : '#5f2e9a'; ctx.fill();
    ctx.strokeStyle = can ? '#d9a93a' : '#6a6080'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = can ? '#fff' : '#9a90aa';
    ctx.fillText(can ? 'Xác Nhận' : '🔒 Chưa mở khoá', b.x + b.w / 2, b.y + b.h / 2 + 8);

    ctx.font = '12px sans-serif'; ctx.fillStyle = '#b8a3d8';
    ctx.restore();
  };

  return P;
})();
window.ElementPick = ElementPick;
