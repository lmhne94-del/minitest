// ============================================================
// GIAO DIỆN SÁCH PHÉP (phím K) — phong cách tím huyền bí + viền vàng
// Ghi đè drawSpellbookUi() của survival.js. Muốn quay lại giao diện cũ: xoá dòng <script src="spellbook-ui.js"> trong survival.html.
// Ảnh: assets/book/ (icon_*.webp, banner_*.webp: phép Hắc Ám; book.webp: quyển sách trên tiêu đề)
// Hệ chưa có ảnh riêng sẽ dùng icon/banner vẽ bằng màu của hệ đó.
// ============================================================
(() => {
  const img = (src) => { const i = new Image(); i.src = src; return i; };
  const IMG = { book: img('assets/book/book.webp'), icon: {}, banner: {} };
  ['lifedrain', 'darkorb', 'shadowrend', 'abyss'].forEach((id) => { IMG.icon[id] = img('assets/book/icon_' + id + '.webp'); IMG.banner[id] = img('assets/book/banner_' + id + '.webp'); });
  // Avatar 4 chiêu của mỗi hệ (assets/book/icon_<id>.webp): Lửa, Băng, Sét, Độc, Đất, Không Gian
  ['fireball', 'nova', 'meteor', 'dragon', 'iceshard', 'frostfield', 'icemirror', 'blizzard', 'thunderbolt', 'skystrike', 'thunderstep', 'thundergod',
    'poisonspit', 'poisonpool', 'poisonshield', 'poisonburst', 'earthpunch', 'stoneshield', 'quake', 'rockfall', 'blink', 'riftslash', 'voidcollapse', 'dimension',
    'windpush', 'windblade', 'tornado', 'windgod', 'lightheal', 'purify', 'holyshield', 'descent',
    'vinebind', 'lifebloom', 'rootquake', 'ancienttree'
  ].forEach((id) => { IMG.icon[id] = img('assets/book/icon_' + id + '.webp'); });

  // id, nhãn, ký hiệu, màu hệ
  const TABS = [['fire', 'Hệ Lửa', '🔥', '#e8651a'], ['ice', 'Hệ Băng', '❄', '#4aa8ff'], ['lightning', 'Hệ Sét', '⚡', '#f0cc20'], ['arcane', 'Không Gian', '✦', '#9a6aff'],
    ['poison', 'Hệ Độc', '☠', '#6ac43a'], ['earth', 'Hệ Đất', '⛰', '#b88a52'], ['wind', 'Hệ Gió', '🍃', '#2ac4a8'], ['nature', 'Hệ Tự Nhiên', '🌿', '#5fd068'], ['holy', 'Thánh Quang', '✚', '#ffd24a'], ['dark', 'Hắc Ám', '☾', '#b060ff']];
  const COL = Object.fromEntries(TABS.map((t) => [t[0], t[3]]));
  const DW = 900, HEAD = 112, TABH = 40, ROWH = 104, FOOT = 44;
  const DH = HEAD + 2 * (TABH + 8) + 8 + 4 * ROWH + FOOT;
  let closeRect = null;
  // trộn hai màu #rrggbb (t = 0 giữ a, 1 thành b) — dùng để đổi cả khung sách theo màu hệ đang xem
  const mix = (a, b, t) => { const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = n(a), y = n(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  const fit = (c, text, maxW) => { const words = text.split(' '), lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; };

  function iconFallback(c, x, y, s, el, glyph, ok) {
    const col = ok ? COL[el] || '#8a7fc4' : '#4a4560';
    const g = c.createRadialGradient(x + s / 2, y + s / 2, 4, x + s / 2, y + s / 2, s * 0.7);
    g.addColorStop(0, ok ? col : '#2a2640'); g.addColorStop(1, '#120826');
    c.fillStyle = g; rr(c, x, y, s, s, 10); c.fill();
    c.textAlign = 'center'; c.font = Math.round(s * 0.5) + 'px sans-serif'; c.fillStyle = ok ? '#fff' : '#6a6480';
    c.fillText(glyph, x + s / 2, y + s * 0.66);
  }

  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hueOf = (h) => { const [r, g, b] = rgbOf(h).map((v) => v / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); if (!d) return 0; const k = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (k * 60 + 360) % 360; };
  function drawBanner(c, x, y, w, h, s, el, ok, base) {
    c.save(); rr(c, x, y, w, h, 8); c.clip();
    const bi = IMG.banner[s.id];
    if (bi && bi.complete && bi.naturalWidth && ok) { const k = Math.max(w / bi.naturalWidth, h / bi.naturalHeight); c.drawImage(bi, x + w - bi.naturalWidth * k, y, bi.naturalWidth * k, bi.naturalHeight * k); }
    else {
      const col = COL[el] || '#8a7fc4';
      const g = c.createLinearGradient(x, y, x + w, y); g.addColorStop(0, 'rgba(20,8,40,0)'); g.addColorStop(1, ok ? col + '88' : 'rgba(80,70,110,0.25)');
      c.fillStyle = g; c.fillRect(x, y, w, h);
      c.globalAlpha = ok ? 0.5 : 0.2; c.strokeStyle = ok ? col : '#6a6480'; c.lineWidth = 2;
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + w * 0.62, y + h / 2, 14 + i * 16, 0, Math.PI * 2); c.stroke(); }
      c.globalAlpha = 1;
    }
    const f = c.createLinearGradient(x, y, x + w * 0.35, y); const fc = rgbOf(base || '#16082d').join(','); f.addColorStop(0, 'rgba(' + fc + ',1)'); f.addColorStop(1, 'rgba(' + fc + ',0)'); c.fillStyle = f; c.fillRect(x, y, w, h); // làm mờ mép trái cho liền với thẻ
    c.restore();
  }

  window.drawSpellbookUi = function (W, H) {
    const c = ctx;
    const tabId = window.FireMagic ? FireMagic.tab : 'fire';
    const list = WITCH.skills.filter((k) => k.el === tabId);
    const open = elderQuest.unlocked;
    const sc = Math.min(1, (W - 16) / DW, (H - 16) / DH);
    const bw = DW * sc, bh = DH * sc, bx = Math.round((W - bw) / 2), by = Math.round((H - bh) / 2);
    const accent = COL[tabId] || '#b060ff';
    const T = { // bảng màu theo hệ
      frame: mix(accent, '#000000', 0.12), bg0: mix(accent, '#07040f', 0.72), bg1: mix(accent, '#03020a', 0.88),
      line: mix(accent, '#000000', 0.25), thin: mix(accent, '#ffffff', 0.55), plate: mix(accent, '#000000', 0.86),
      tab: mix(accent, '#000000', 0.82), tabOn: mix(accent, '#000000', 0.5), tabLine: mix(accent, '#000000', 0.55),
      card: mix(accent, '#000000', 0.82), cardOff: mix(accent, '#000000', 0.9), cardLine: mix(accent, '#ffffff', 0.05), cardLineOff: mix(accent, '#000000', 0.6),
      name: mix(accent, '#ffffff', 0.8), star: mix(accent, '#ffffff', 0.4), desc: mix(accent, '#ffffff', 0.85), key: mix(accent, '#000000', 0.7), keyLine: mix(accent, '#ffffff', 0.2), foot: mix(accent, '#ffffff', 0.7),
    };

    c.save();
    c.fillStyle = mix(accent, '#000000', 0.93); c.globalAlpha = 0.62; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    c.translate(bx, by); c.scale(sc, sc);

    // khung ngoài vàng cam + nền tím
    c.shadowColor = accent; c.shadowBlur = 28;
    rr(c, 0, 14, DW, DH - 14, 16); c.fillStyle = T.frame; c.fill(); c.shadowBlur = 0;
    rr(c, 5, 19, DW - 10, DH - 24, 13); const bg = c.createLinearGradient(0, 0, 0, DH); bg.addColorStop(0, T.bg0); bg.addColorStop(1, T.bg1); c.fillStyle = bg; c.fill();
    c.strokeStyle = T.line; c.lineWidth = 3; rr(c, 12, 26, DW - 24, DH - 38, 10); c.stroke();
    c.strokeStyle = T.thin; c.globalAlpha = 0.55; c.lineWidth = 1.5; rr(c, 17, 31, DW - 34, DH - 48, 8); c.stroke(); c.globalAlpha = 1;

    // tiêu đề
    c.fillStyle = T.plate; c.strokeStyle = T.frame; c.lineWidth = 3;
    c.beginPath(); c.moveTo(250, 20); c.lineTo(DW - 250, 20); c.lineTo(DW - 220, 52); c.lineTo(DW - 250, 84); c.lineTo(250, 84); c.lineTo(220, 52); c.closePath(); c.fill(); c.stroke();
    c.textAlign = 'center'; c.font = 'bold 40px sans-serif'; c.shadowColor = accent; c.shadowBlur = 12; c.fillStyle = '#fff6e6';
    c.fillText('Sách Phép', DW / 2, 68); c.shadowBlur = 0;
    c.font = '26px sans-serif'; c.fillStyle = T.star; c.fillText('✦', 290, 64); c.fillText('✦', DW - 290, 64);
    if (IMG.book.complete && IMG.book.naturalWidth) { c.filter = 'hue-rotate(' + Math.round(hueOf(accent) - 280) + 'deg)'; c.drawImage(IMG.book, 0, -6, 210, 150); c.filter = 'none'; } // quyển sách tím đổi sang màu hệ

    // mana
    c.font = '17px sans-serif'; c.textAlign = 'center';
    if (open) { c.fillStyle = '#4ad0ff'; c.fillText('💧 Cổng Mana đã mở :   Mana ' + Math.floor(mana) + ' / ' + MAX_MANA, DW / 2, 106); }
    else { c.fillStyle = '#ff7a8a'; c.fillText('Cổng Mana chưa mở — hoàn thành nhiệm vụ của Chú Lùn ở Cây Cổ Thụ để sách ghi lại phép', DW / 2, 106); }

    // nút đóng
    const cx = DW - 70, cy = 38;
    c.fillStyle = '#b3203a'; c.strokeStyle = T.frame; c.lineWidth = 3; rr(c, cx, cy, 46, 46, 7); c.fill(); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx + 13, cy + 13); c.lineTo(cx + 33, cy + 33); c.moveTo(cx + 33, cy + 13); c.lineTo(cx + 13, cy + 33); c.stroke(); c.lineCap = 'butt';
    closeRect = { x: bx + cx * sc, y: by + cy * sc, w: 46 * sc, h: 46 * sc };

    // thẻ chọn hệ (2 hàng × 5)
    const tw = (DW - 56 - 4 * 10) / 5, ty0 = HEAD + 6;
    if (window.FireMagic) {
      FireMagic.tabRects = TABS.map(([id, label], i) => ({ id, label, x: bx + (28 + (i % 5) * (tw + 10)) * sc, y: by + (ty0 + Math.floor(i / 5) * (TABH + 8)) * sc, w: tw * sc, h: TABH * sc }));
      TABS.forEach(([id, label, glyph, col], i) => {
        const x = 28 + (i % 5) * (tw + 10), y = ty0 + Math.floor(i / 5) * (TABH + 8), on = FireMagic.tab === id;
        c.fillStyle = on ? T.tabOn : T.tab; c.strokeStyle = on ? '#ffffff' : T.tabLine; c.lineWidth = on ? 3 : 2;
        if (on) { c.shadowColor = col; c.shadowBlur = 14; }
        rr(c, x, y, tw, TABH, 8); c.fill(); c.stroke(); c.shadowBlur = 0;
        c.font = '19px sans-serif'; c.textAlign = 'left'; c.fillStyle = col; c.fillText(glyph, x + 14, y + 27);
        c.font = (on ? 'bold ' : '') + '17px sans-serif'; c.textAlign = 'center'; c.fillStyle = on ? '#fff' : T.desc; c.fillText(label, x + tw / 2 + 12, y + 26);
        if (!witchSt.unlocked[id]) { // hệ chưa mở khoá: thẻ tối + ổ khoá
          c.fillStyle = 'rgba(8,5,16,0.72)'; rr(c, x, y, tw, TABH, 8); c.fill();
          if (window.Dwarf) Dwarf.lock(c, x + 20, y + TABH / 2, 26, 1);
        }
      });
    }

    // danh sách phép
    let y = HEAD + 2 * (TABH + 8) + 8;
    for (const s of list) {
      const ok = open && witchSt.learned[s.id], el = s.el, col = COL[el];
      c.fillStyle = ok ? T.card : T.cardOff; c.strokeStyle = ok ? accent : T.cardLineOff; c.lineWidth = 2.5;
      rr(c, 24, y, DW - 48, ROWH - 8, 10); c.fill(); c.stroke();
      drawBanner(c, DW - 24 - 300, y + 3, 297, ROWH - 14, s, el, ok, ok ? T.card : T.cardOff);
      // icon
      const ic = IMG.icon[s.id], is = ROWH - 24;
      if (ic && ic.complete && ic.naturalWidth) {
        if (!ok) c.filter = 'grayscale(1) brightness(0.45)'; // chưa học: icon xám tối, không sáng
        const k = Math.min(is / ic.naturalWidth, is / ic.naturalHeight), iw = ic.naturalWidth * k, ih = ic.naturalHeight * k; // giữ nguyên tỉ lệ ảnh
        c.drawImage(ic, 34 + (is - iw) / 2, y + 8 + (is - ih) / 2, iw, ih);
        c.filter = 'none';
      } else iconFallback(c, 34, y + 8, is, el, (TABS.find((t) => t[0] === el) || [])[2] || '✦', ok);
      if (!ok) { c.fillStyle = 'rgba(10,5,20,0.45)'; rr(c, 34, y + 8, is, is, 10); c.fill(); }
      // chữ
      c.textAlign = 'left'; c.font = 'bold 28px sans-serif'; c.fillStyle = ok ? T.star : '#7a7090'; c.fillText('✦', 148, y + 36);
      c.fillStyle = ok ? T.name : '#8a8098'; c.fillText(s.name, 178, y + 36);
      c.font = '14px sans-serif'; c.fillStyle = ok ? T.desc : '#7a7090';
      const lines = fit(c, ok ? s.desc : '??? — chưa học', DW - 24 - 300 - 150 - 148 - 14); lines.slice(0, 3).forEach((ln, i) => c.fillText(ln, 148, y + 55 + i * 17)); // mô tả xuống dòng trong khoảng trống bên trái ô mana
      // mana / phím
      const mx = DW - 24 - 300 - 150;
      c.font = 'bold 20px sans-serif'; c.fillStyle = ok ? '#4ad0ff' : '#7a7090'; c.textAlign = 'left';
      if (ok) {
        c.fillText('💧 ' + s.mana + ' Mana', mx, y + 32);
        c.fillStyle = T.key; c.strokeStyle = T.keyLine; c.lineWidth = 2; rr(c, mx, y + 44, 116, 30, 6); c.fill(); c.stroke();
        c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff';
        const t = s.id === 'wind' ? spellT.wind : s.id === 'shield' ? spellT.shield : s.id === 'icemirror' && window.IceMagic ? IceMagic.mirrorLeft() : window.ExtraMagic ? ExtraMagic.activeLeft(s.id) : 0;
        const cd = s.el === 'fire' && window.FireMagic ? FireMagic.cdLeft(s.id) : s.el === 'ice' && window.IceMagic ? IceMagic.cdLeft(s.id) : s.el === 'arcane' && window.ArcaneMagic ? ArcaneMagic.cdLeft(s.id) : window.ExtraMagic && ExtraMagic.owns(s.el) ? ExtraMagic.cdLeft(s.id) : !s.el ? (spellCd[s.id] || 0) : 0;
        c.font = '14px sans-serif'; c.textAlign = 'left';
        if (cd > 0) { c.fillStyle = '#ffb060'; c.fillText('hồi chiêu ' + Math.ceil(cd) + 's', mx, y + 88); }
        else if (t > 0) { c.fillStyle = '#6aff9a'; c.fillText('hiệu lực ' + Math.ceil(t) + 's', mx, y + 88); }
      }
      y += ROWH;
    }

    // chân trang
    c.textAlign = 'center'; c.font = '15px sans-serif'; c.fillStyle = T.foot;
    c.restore();
  };

  // bấm nút X để đóng
  if (window.FireMagic) {
    const old = FireMagic.bookClick;
    FireMagic.bookClick = () => { if (closeRect && inRect(mouse, closeRect)) { toggleUi('spellbook'); return; } old(); };
  }
})();
