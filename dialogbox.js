// ======================================================================
// HỘP THOẠI NPC — khi nói chuyện (E) với dân làng, người bán hàng, Đội Chiến Binh, Phù Thủy...
// thì hiện hộp thoại ở cuối màn hình (tên người nói + chữ chạy dần) thay cho bong bóng / dòng thông báo.
//  • Enter / E / Space / bấm chuột: hiện hết chữ, bấm thêm lần nữa để đóng. Esc: đóng ngay.
//  • Dialog.open(tên, nội dung): mở hộp thoại; ui = 'dialog' (đóng xong trả ui về như cũ).
// Muốn gỡ: xoá file này + thẻ <script> trong survival.html (game tự quay về kiểu cũ).
// ======================================================================
const Dialog = (() => {
  const D = {};
  let cur = null; // { name, text, t0, back }
  const CPS = 45; // số chữ mỗi giây

  D.open = (name, text) => {
    const back = ui === 'dialog' ? (cur ? cur.back : null) : ui;
    cur = { name, text, t0: performance.now(), back };
    ui = 'dialog';
  };
  const shown = () => Math.min(cur.text.length, Math.floor((performance.now() - cur.t0) / 1000 * CPS));
  const finished = () => shown() >= cur.text.length;
  const close = () => { const b = cur ? cur.back : null; cur = null; ui = b; };

  const advance = () => {
    if (!cur) { ui = null; return; }
    if (!finished()) cur.t0 = performance.now() - cur.text.length / CPS * 1000 - 1; // hiện hết chữ
    else close();
  };

  D.key = (e) => {
    const c = e.code;
    if (c === 'Escape') { close(); return true; }
    if (c === 'Enter' || c === 'NumpadEnter' || c === 'KeyE' || c === 'Space') { advance(); return true; }
    return false;
  };
  D.click = () => advance();

  const wrap = (text, maxW) => {
    const out = []; let cur2 = '';
    for (const w of text.split(' ')) {
      const t = cur2 ? cur2 + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur2) { out.push(cur2); cur2 = w; } else cur2 = t;
    }
    if (cur2) out.push(cur2);
    return out;
  };

  D.draw = (W, H) => {
    if (!cur) { ui = null; return; }
    const pw = Math.min(760, W - 24), ph = 138;
    const x = Math.round((W - pw) / 2), y = H - ph - 96; // chừa chỗ cho thanh nhanh phía dưới
    ctx.save();
    // hộp
    ctx.beginPath(); ctx.roundRect(x, y, pw, ph, 14);
    ctx.fillStyle = 'rgba(20,14,30,0.92)'; ctx.fill();
    ctx.strokeStyle = '#e0b04a'; ctx.lineWidth = 3; ctx.stroke();
    // bảng tên
    ctx.font = 'bold 18px sans-serif';
    const nw = Math.max(110, ctx.measureText(cur.name).width + 34);
    ctx.beginPath(); ctx.roundRect(x + 18, y - 17, nw, 32, 10);
    ctx.fillStyle = '#6a35b0'; ctx.fill(); ctx.strokeStyle = '#e0b04a'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff6e6';
    ctx.fillText(cur.name, x + 18 + nw / 2, y + 5);
    // nội dung (chữ chạy dần)
    ctx.textAlign = 'left'; ctx.font = '19px sans-serif'; ctx.fillStyle = '#f4efe6';
    const full = wrap(cur.text, pw - 48);
    let left = shown();
    for (let i = 0; i < full.length && left > 0; i++) {
      const line = full[i];
      ctx.fillText(line.slice(0, left), x + 24, y + 48 + i * 27);
      left -= line.length + 1;
    }
    // gợi ý
    ctx.textAlign = 'right'; ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(232,214,255,' + (0.55 + 0.45 * Math.sin(performance.now() / 260)) + ')';
    ctx.fillText(finished() ? 'E / Enter ▸ đóng' : 'E / Enter ▸ hiện hết', x + pw - 18, y + ph - 12);
    ctx.restore();
  };

  // Phù Thủy và Đội Chiến Binh vốn báo bằng dòng thông báo (say) → chuyển sang hộp thoại
  function hook(fnName) {
    const orig = window[fnName];
    if (typeof orig !== 'function') return;
    const origSay = window.say;
    window[fnName] = function (...args) {
      const got = [];
      window.say = (text) => { got.push(String(text)); };
      try { return orig.apply(this, args); }
      finally {
        window.say = origSay;
        const t = got.find((s) => /^[^:]{2,40}: /.test(s));
        got.forEach((s) => { if (s !== t) origSay(s); });
        if (t) { const k = t.indexOf(': '); D.open(t.slice(0, k), t.slice(k + 2)); }
      }
    };
  }
  hook('talkWitch');
  hook('talkPost');

  return D;
})();
window.Dialog = Dialog;
