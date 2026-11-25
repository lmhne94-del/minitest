// ======================================================================
// ANIMATION CẦM SÁCH: khi bấm phím phép (Z X C V) hoặc vừa chọn hệ, nhân vật rút Sách Hệ ra cầm trên tay
// (sprite theo màu từng hệ, assets/mage/hold_<hệ>.webp: 4 hàng = xuống / trái / phải / lên, 2-3 khung mỗi hàng).
// Hết BALANCE.dwarf.bookHold giây không dùng phép (hoặc đang chém / dùng cung / dụng cụ) thì trở lại dáng thường.
// Muốn luôn cầm sách khi đã chọn hệ: đặt bookHold thật lớn (vd 99999) trong config.js.
// Muốn gỡ: xoá file này + thẻ <script> + các dòng "BookHold" trong survival.js.
// ======================================================================
const BookHold = (() => {
  const B = {};
  const SECS = (BALANCE.dwarf && BALANCE.dwarf.bookHold) || 6;
  const FR = { fire: 3, ice: 2, lightning: 3, arcane: 3, poison: 2, earth: 3, wind: 2, nature: 3, holy: 3, dark: 2 };
  const CW = 160, CH = 160, FEET_X = 80, FEET_Y = 118;
  const SCALE = 0.65; // sprite cầm sách vẽ to hơn nhân vật thường (~83px so với ~52px) → thu nhỏ cho khớp
  const sheet = {};
  Object.keys(FR).forEach((id) => { loadImage('assets/mage/hold_' + id + '.webp').then((img) => { if (img) sheet[id] = img; }); });
  let until = -1;

  B.trigger = () => { until = gameTime + SECS; };
  B.stop = () => { until = -1; };
  B.active = () => {
    const el = witchSt.element;
    return gameTime < until && !!el && !!witchSt.unlocked[el] && !!sheet[el];
  };

  B.draw = (sx, sy) => {
    const el = witchSt.element, n = FR[el], img = sheet[el];
    let row = 0;
    if (player.faceY > 0) row = 0;
    else if (player.faceX < 0) row = 1;
    else if (player.faceX > 0) row = 2;
    else if (player.faceY < 0) row = 3;
    const f = player.moving ? Math.floor(player.animTime * (player.running ? 10 : 7)) % n : Math.floor(gameTime * 2.2) % n;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 12, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(img, f * CW, row * CH, CW, CH, Math.round(sx - FEET_X * SCALE), Math.round(sy + 12 - FEET_Y * SCALE), Math.round(CW * SCALE), Math.round(CH * SCALE));
    playerPose = { name: player.moving ? 'walk' : 'idle', row, frame: f };
  };

  return B;
})();
window.BookHold = BookHold;
