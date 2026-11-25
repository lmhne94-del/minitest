// ======================================================================
//  volcano.js: ĐẢO NÚI LỬA giữa biển
//  - Mỗi ô lưới VOLC.cell × VOLC.cell có (hầu như) một đảo, đặt giữa một vùng biển sâu: phải bơi ra mới tới.
//  - Bố cục từ tâm ra ngoài:
//      thân núi lửa (ô đặc, vẽ bằng sprite có khói, dung nham trong miệng)
//      -> vòng quặng quanh chân núi -> vùng tro có hồ + dòng dung nham
//      -> VÒNG ĐÁ TRONG (3 lối đi) -> đồng tro giữa hai vòng, vài hồ dung nham nhỏ
//      -> VÒNG ĐÁ NGOÀI (3 lối đi, lệch 60° so với vòng trong nên phải đi vòng) -> bãi tro -> bãi cát -> biển
//  - Dung nham trên mặt đất bỏng như dung nham dưới hầm; xô múc được, khối gỗ / đá đặt lên để lấp.
//  File này nạp TRƯỚC survival.js (xem survival.html), không chạy gì lúc nạp; survival.js gọi vài điểm nối:
//  baseTile / seaRaw / seaBasin / swampType / drawGround / drawTile / draw / drawLighting / mmTileColor / hoeGround / setSeed.
//  Muốn gỡ đảo: xoá file này + các dòng có chữ "volcan" trong survival.js, survival.html, cheat.js.
// ======================================================================

const VCONE = 41;   // thân núi lửa (ô đặc, không phá được; hình vẽ riêng bằng drawVolcano)
const VROCK = 42;   // đá bazan nhọn của hai vòng đá (ô đặc, không phá được)
const VSNAG = 43;   // cây cháy trơ cành (ô đặc, trang trí) — trên đảo băng là cây thông phủ tuyết
const VCRYS = 44;   // cụm tinh thể băng (chỉ đảo băng, ô đặc, đập bằng cuốc ra Tinh thể băng)

const VOLC = {
  cell: 640,            // mỗi ô lưới 640×640 ô có tối đa một đảo
  chance: 0.85,         // xác suất ô lưới có đảo (ô lưới chứa điểm xuất phát luôn có)
  margin: 150,          // tâm đảo cách mép ô lưới ≥ từng này ô -> đảo + biển không bao giờ tràn sang ô lưới kề
  jitter: 340,
  boxR: 76,             // loại nhanh: ngoài hình vuông này chắc chắn không phải đảo
  cone: 3.9,            // bán kính thân núi (ô)
  coneRX: 4.0,          // elip chân núi vẽ bằng sprite: nửa rộng / nửa cao (ô), tâm thấp hơn tâm đảo 2 ô
  coneRY: 2.6,
  ore: [4.5, 5.6],      // vòng quặng sát chân núi
  pool1: [5.4, 9.4],    // vùng hồ dung nham bên trong
  ridge1: [10.2, 12.0], // vòng đá trong
  pool2: [13.2, 15.8],  // vùng hồ dung nham nhỏ ở đồng tro giữa
  ridge2: [16.6, 18.4], // vòng đá ngoài
  coast: 25,            // bờ đảo (méo theo nhiễu ±4)
  shallow: 2.6,         // dải nước nông quanh đảo
  rim: 54,              // mép vùng biển ép buộc quanh đảo (méo ±8)
  rimShallow: 3,
  gapHalf: 1.9,         // nửa bề rộng lối đi qua vòng đá (ô)
};
const TAU = Math.PI * 2;
// ĐẢO BĂNG: cùng bố cục với đảo núi lửa (cùng vòng đá, cùng hang boss) nhưng đổi màu xanh băng, không có dung nham.
// Đảo ở ô lưới (0,0) (gần điểm xuất phát) luôn là núi lửa; các đảo khác có ICE_SHARE là đảo băng.
const ICE_SHARE = 0.5;
const ICE_SOLID = new Set(['-1,-4','0,-4','1,-4','-1,-3','0,-3','1,-3','2,-3','4,-3','-2,-2','-1,-2','0,-2','1,-2','2,-2','3,-2','-3,-1','-2,-1','-1,-1','0,-1','1,-1','2,-1','3,-1','4,-1','-4,0','-3,0','-2,0','-1,0','0,0','1,0','2,0','3,0','4,0','-4,1','-3,1','-2,1','-1,1','0,1','1,1','2,1','3,1','4,1','-4,2','-3,2','-2,2','-1,2','0,2','1,2','2,2','3,2','-2,3','-1,3','0,3','1,3','2,3']); // ô đặc của núi băng (dx,dy so với tâm đảo), tính từ hình núi
const ICE_CONE = { rx: 4.2, ry: 1.7 }; // elip chân núi băng (ô), khớp sprite assets/ice_island/mountain.webp
// Đổi màu MỘT LẦN ra canvas mới (vẽ có bộ lọc mỗi khung hình thì rất chậm)
function tintCanvas(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'); g.filter = ICEF; g.drawImage(src, 0, 0);
  return c;
}
const ICEF = 'hue-rotate(185deg) saturate(1.25) brightness(1.18)'; // bộ lọc đổi màu cam / nâu -> xanh băng khi vẽ

// ---------- Vị trí đảo ----------
const volcCache = new Map();
function resetVolcano() { volcCache.clear(); }

function volcCenter(cx, cy) {
  const key = (cx + 4096) * 8192 + (cy + 4096);
  let v = volcCache.get(key);
  if (v !== undefined) return v;
  v = null;
  if ((cx === 0 && cy === 0) || hash(cx * 71 + 5, cy * 53 - 9) < VOLC.chance) {
    v = {
      x: cx * VOLC.cell + VOLC.margin + Math.floor(hash(cx * 61 + 7, cy * 83 - 11) * VOLC.jitter),
      y: cy * VOLC.cell + VOLC.margin + Math.floor(hash(cx * 29 - 13, cy * 47 + 19) * VOLC.jitter),
      g0: hash(cx * 13 + 1, cy * 17 - 5) * TAU, // hướng một lối đi của vòng đá trong
      ice: !(cx === 0 && cy === 0) && hash(cx * 43 + 17, cy * 31 - 23) < ICE_SHARE, // đảo băng
    };
  }
  volcCache.set(key, v);
  return v;
}

// Đảo mà ô (x, y) nằm trong hộp loại nhanh của nó (hoặc null)
function volcAt(x, y) {
  const v = volcCenter(Math.floor(x / VOLC.cell), Math.floor(y / VOLC.cell));
  if (!v || Math.abs(x - v.x) > VOLC.boxR || Math.abs(y - v.y) > VOLC.boxR) return null;
  return v;
}

// Điểm (x, y) có nằm trong vùng biển + đảo không (cộng thêm lề m)? dùng để không đặt làng / chợ / cây cổ thụ... lên đó
function volcNear(x, y, m = 9) {
  const v = volcAt(x, y);
  return !!v && Math.hypot(x - v.x, y - v.y) < VOLC.rim + m;
}

// Ba hàm méo khoảng cách để bờ đảo, vòng đá và mép biển không tròn trịa
const warpR = (x, y) => (vnoise(x / 6 + 31, y / 6 - 17) - 0.5) * 2.4;
const warpC = (x, y) => (vnoise(x / 9 - 140, y / 9 + 62) - 0.5) * 6 + (vnoise(x / 3.3 + 9, y / 3.3 + 71) - 0.5) * 2;
const warpS = (x, y) => (vnoise(x / 15 + 270, y / 15 - 190) - 0.5) * 16;

function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}
// Ô nằm trong lối đi của vòng ring (0 = trong, 1 = ngoài); extra: nới rộng lối (dùng để giữ đường tới chân núi không có dung nham)
function inGap(v, ring, a, d, extra = 0) {
  const base = v.g0 + (ring ? Math.PI / 3 : 0);
  for (let k = 0; k < 3; k++) if (angDiff(a, base + k * TAU / 3) * d < VOLC.gapHalf + extra) return true;
  return false;
}

// ---------- Nước: dùng trong seaRaw (survival.js) ----------
// undefined = không ảnh hưởng (để biển tự nhiên quyết định) | 0 = đất đảo | 2 = nước nông | 3 = nước sâu
function volcanoSea(x, y) {
  const v = volcAt(x, y);
  if (!v) return undefined;
  const d = Math.hypot(x - v.x, y - v.y);
  if (d > VOLC.rim + 9) return undefined;
  const dC = d + warpC(x, y);
  if (dC < VOLC.coast) return 0;
  if (dC < VOLC.coast + VOLC.shallow) return 2;
  const dS = d + warpS(x, y);
  if (dS < VOLC.rim - VOLC.rimShallow) return 3;
  if (dS < VOLC.rim) return 2;
  return undefined;
}

// ---------- Ô đất: dùng trong baseTile ----------
// undefined = không thuộc phần đất đảo (rơi xuống logic biển / đầm lầy / rừng như thường)
function volcanoTile(x, y) {
  const v = volcAt(x, y);
  if (!v) return undefined;
  const dx = x - v.x, dy = y - v.y, d = Math.hypot(dx, dy);
  if (d > VOLC.coast + 5) return undefined;
  if (d + warpC(x, y) >= VOLC.coast) return undefined;
  const dR = d + warpR(x, y);
  const a = Math.atan2(dy, dx);

  // Thân núi đặc: hợp của vòng tròn cũ và HÌNH ELIP chân núi của sprite (tâm thấp hơn 2 ô, rộng ±3.9 ô, cao ±2.5 ô)
  // -> không còn đi xuyên được vào sườn / mặt trước của núi
  // lấy điểm GẦN TÂM NHẤT của ô (không phải tâm ô) -> mọi ô chạm vào elip đều đặc, không còn chừa 1 khe ~24px ở mép
  const cRX = v.ice ? ICE_CONE.rx : VOLC.coneRX, cRY = v.ice ? ICE_CONE.ry : VOLC.coneRY; // núi băng: chân núi dẹt hơn
  const ex = Math.max(0, Math.abs(dx) - 0.5) / cRX, ey = Math.max(0, Math.abs(dy - 1.5) - 0.5) / cRY;
  if (v.ice ? ICE_SOLID.has(Math.round(dx) + ',' + Math.round(dy)) : (dR < VOLC.cone || ex * ex + ey * ey < 1)) return VCONE;
  for (let ring = 0; ring < 2; ring++) {
    const R = ring ? VOLC.ridge2 : VOLC.ridge1;
    if (!v.ice && dR >= R[0] && dR < R[1] && !inGap(v, ring, a, dR)) return VROCK; // đảo băng: không có vòng gai
  }

  const safe = dR < VOLC.ridge1[0] && inGap(v, 0, a, dR, 0.9); // hành lang từ lối vào trong tới chân núi: luôn đi được
  if (!safe && !v.ice) { // đảo băng không có dung nham
    // dòng dung nham chảy từ chân núi tới sát vòng đá trong, nằm giữa hai lối đi
    if (dR > VOLC.cone + 0.3 && dR < VOLC.ridge1[0] - 0.4) {
      for (let k = 0; k < 3; k++) {
        const ak = v.g0 + Math.PI / 3 + k * TAU / 3 + Math.sin(dR * 0.7 + k * 2.1) * 0.16;
        if (angDiff(a, ak) * dR < 0.75 + 0.45 * Math.sin(dR * 1.3 + k)) return LAVA;
      }
    }
    // hồ dung nham
    const pn = vnoise(x / 3.0 + 500, y / 3.0 - 300) * 0.8 + vnoise(x / 1.6 + 90, y / 1.6 + 20) * 0.2;
    if (dR >= VOLC.pool1[0] && dR < VOLC.pool1[1] && pn > 0.68) return LAVA;
    if (dR >= VOLC.pool2[0] && dR < VOLC.pool2[1] && pn > 0.76) return LAVA;
  }

  // vòng quặng quanh chân núi (phần thưởng cho người dám vào): kim cương, vàng, sắt, than
  if (dR >= VOLC.ore[0] && dR < VOLC.ore[1] && !safe) {
    const o = hash(x + 311, y - 207);
    if (o < 0.3) {
      if (v.ice) return VCRYS; // đảo băng: vòng tinh thể băng thay cho quặng
      const q = o / 0.3;
      return q < 0.12 ? DIAMOND : q < 0.45 ? GOLD : q < 0.75 ? IRON : COAL;
    }
  }
  // cây cháy ở đồng tro và bãi ngoài; lác đác đá quặng
  if (dR > VOLC.ridge1[1] + 0.5 && dR < VOLC.coast - 3.5 && !(dR > VOLC.ridge2[0] - 0.5 && dR < VOLC.ridge2[1] + 0.5)) {
    const r = hash(x - 140, y + 515);
    if (v.ice) { // đảo băng: rừng thông phủ tuyết, cụm tinh thể băng, vài tảng đá
      if (r < 0.05) return VSNAG;
      if (r < 0.068) return VCRYS;
      if (r < 0.08) return rockOrOre(x, y);
    } else {
      if (r < 0.04) return VSNAG;
      if (r < 0.055) return rockOrOre(x, y);
    }
  }
  return GRASS;
}

// Nền tro để vẽ: 0 = không phải đất đảo, 1 = trong vòng đá trong, 2 = đồng tro giữa, 3 = bãi ngoài
function volcanoGround(x, y) {
  const v = volcAt(x, y);
  if (!v) return 0;
  const d = Math.hypot(x - v.x, y - v.y);
  if (d > VOLC.coast + 5 || d + warpC(x, y) >= VOLC.coast) return 0;
  const dR = d + warpR(x, y);
  return dR < VOLC.ridge1[1] ? 1 : dR < VOLC.ridge2[0] ? 2 : 3;
}

const VOLC_MM = { 1: [58, 48, 42], 2: [78, 64, 50], 3: [112, 92, 68] };
const ICE_MM = { 1: [150, 180, 205], 2: [178, 205, 224], 3: [214, 232, 244] };
function volcanoMiniColor(x, y) { const z = volcanoGround(x, y); if (!z) return null; const v = volcAt(x, y); return v && v.ice ? ICE_MM[z] : VOLC_MM[z]; }

// ---------- Điểm xuất hiện (cheat /tp nuilua) ----------
function nearestVolcano(px, py, ice) { // px, py: toạ độ ô; ice: true = chỉ đảo băng, false = chỉ núi lửa, bỏ trống = cả hai
  const c0 = Math.floor(px / VOLC.cell), r0 = Math.floor(py / VOLC.cell);
  let best = null, bd = Infinity;
  const R = ice === undefined ? 3 : 6; // đảo băng thưa hơn nên quét rộng hơn
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const v = volcCenter(c0 + i, r0 + j);
    if (!v || (ice !== undefined && !!v.ice !== ice)) continue;
    const d = Math.hypot(v.x - px, v.y - py);
    if (d < bd) { bd = d; best = v; }
  }
  return best ? { v: best, dist: bd } : null;
}
// Chỗ đứng ngay ngoài lối vào vòng đá ngoài (đi từ bờ vào)
function volcanoLanding(v) {
  const ga = v.g0 + Math.PI / 3;
  for (let r = VOLC.coast - 1; r >= VOLC.ridge2[1]; r -= 0.5) {
    const tx = Math.round(v.x + Math.cos(ga) * r), ty = Math.round(v.y + Math.sin(ga) * r);
    if (getTile(tx, ty) === GRASS && seaType(tx, ty) <= 1) return tileCenter(tx, ty);
  }
  return null;
}

// ---------- Vẽ nền tro ----------
const VOLC_PAL = {
  1: ['#352c27', '#3a312b', '#31292a'],
  2: ['#46392f', '#4b3e33', '#42362d'],
  3: ['#6a5640', '#705b44', '#64513c'],
};
// Nền tuyết đảo băng: màu trắng xanh nhạt biến đổi mượt theo nhiễu (không thành ô vuông), vòng trong hơi xanh hơn
const ICE_PAL = { 1: [222, 234, 248], 2: [230, 240, 251], 3: [238, 245, 252] };
function drawVolcanoGround(tx, ty, z, hv, sx, sy) {
  const vi = volcAt(tx, ty);
  if (vi && vi.ice) { // nền tuyết
    const ip = ICE_PAL[z], n = vnoise(tx / 6 + 11, ty / 6 - 3), n2 = vnoise(tx / 2.2 - 40, ty / 2.2 + 17);
    const k = (n - 0.5) * 16 + (hv - 0.5) * 3;
    ctx.fillStyle = 'rgb(' + Math.round(ip[0] + k * 0.6) + ',' + Math.round(ip[1] + k * 0.5) + ',' + Math.min(255, Math.round(ip[2] + k * 0.25)) + ')';
    ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
    if (n2 > 0.7) { // mảng tuyết đọng xanh nhạt (rất mờ, bo tròn)
      ctx.fillStyle = 'rgba(176,200,236,' + Math.min(0.22, (n2 - 0.7) * 0.9).toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(sx + TILE / 2, sy + TILE / 2 + 2, TILE * 0.36, TILE * 0.22, 0, 0, TAU); ctx.fill();
    }
    if (hv > 0.9) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(sx + 8 + (hv * 100 % 24), sy + 14 + (hv * 400 % 20), 4, 3); }
    if (hv < 0.06) { ctx.fillStyle = 'rgba(150,178,222,0.5)'; ctx.fillRect(sx + 14, sy + 22, 6, 3); ctx.fillRect(sx + 28, sy + 12, 4, 3); }
    return;
  }
  const pal = VOLC_PAL[z];
  ctx.fillStyle = hv < 0.33 ? pal[0] : hv < 0.66 ? pal[1] : pal[2];
  ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
  if (hv > 0.82) { ctx.fillStyle = z === 3 ? '#7c6649' : '#574a3f'; ctx.fillRect(sx + 10 + (hv * 100 % 14), sy + 20, 8, 4); }
  if (hv < 0.1) { ctx.fillStyle = z === 3 ? '#54432f' : '#2a221e'; ctx.fillRect(sx + 24, sy + 10, 10, 5); }
  if (z < 3 && hash(tx + 7, ty - 5) > 0.94) { // vết nứt đỏ hực
    const p = 0.45 + 0.3 * Math.sin(gameTime * 3 + hv * 30);
    ctx.fillStyle = 'rgba(255,110,30,' + p.toFixed(2) + ')';
    ctx.fillRect(sx + 12, sy + 26, 10, 2); ctx.fillRect(sx + 20, sy + 28, 2, 8);
  }
  // sát dung nham: đất bị nung đỏ
  const nl = [getTile(tx, ty - 1) === LAVA, getTile(tx, ty + 1) === LAVA, getTile(tx - 1, ty) === LAVA, getTile(tx + 1, ty) === LAVA];
  if (nl[0] || nl[1] || nl[2] || nl[3]) {
    ctx.fillStyle = 'rgba(255,100,25,0.22)';
    if (nl[0]) ctx.fillRect(sx, sy, TILE + 1, 9);
    if (nl[1]) ctx.fillRect(sx, sy + TILE - 8, TILE + 1, 9);
    if (nl[2]) ctx.fillRect(sx, sy, 9, TILE + 1);
    if (nl[3]) ctx.fillRect(sx + TILE - 8, sy, 9, TILE + 1);
  }
}

// ---------- Vẽ đá bazan nhọn / cây cháy ----------
function drawVolcTile(type, sx, sy, key) {
  if (type === VCONE) return;
  const [tx, ty] = key.split(',').map(Number);
  const vi = volcAt(tx, ty), ice = !!(vi && vi.ice); // đảo băng: tô màu xanh trắng (không dùng bộ lọc vì rất chậm)
  const h1 = hash(tx * 5 + 1, ty * 7 + 3), h2 = hash(tx * 11 - 4, ty * 3 + 9), h3 = hash(tx * 3 + 8, ty * 13 - 6);
  if (ice) { drawIceTile(type, sx, sy, h1, h2, h3); return; }
  if (type === VSNAG) {
    shadow(sx, sy, 13);
    const bx = sx + 24 + (h1 - 0.5) * 8;
    ctx.strokeStyle = ice ? '#5f7f99' : '#2a211e'; ctx.lineCap = 'round';
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(bx, sy + 44); ctx.lineTo(bx + (h2 - 0.5) * 4, sy + 8); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx, sy + 28); ctx.lineTo(bx - 12 - h1 * 6, sy + 14); ctx.moveTo(bx, sy + 20); ctx.lineTo(bx + 12 + h3 * 6, sy + 6);
    ctx.moveTo(bx, sy + 36); ctx.lineTo(bx + 10, sy + 28); ctx.stroke();
    if (h3 > 0.5) { ctx.fillStyle = (ice ? 'rgba(170,235,255,' : 'rgba(255,120,40,') + (0.5 + 0.4 * Math.sin(gameTime * 4 + h1 * 20)).toFixed(2) + ')'; ctx.fillRect(bx - 2, sy + 30, 3, 3); }
    return;
  }
  // VROCK: cụm ba mũi đá nhọn, tối ở mặt phải, sáng ở mặt trái; vòng đá liền mạch nhờ các tảng chồng lên nhau
  shadow(sx, sy, 21);
  const spires = [
    { x: 5 + h1 * 6, w: 18 + h2 * 6, h: 26 + h1 * 16 },
    { x: 17 + h2 * 6, w: 20 + h3 * 6, h: 34 + h3 * 18 },
    { x: 30 + h3 * 6, w: 16 + h1 * 5, h: 24 + h2 * 16 },
  ];
  spires.forEach((s, i) => {
    const by = sy + 45, ax = sx + s.x + s.w / 2 + (i - 1) * 2, ay = by - s.h;
    poly([[sx + s.x, by], [ax, ay], [ax + s.w * 0.08, by]], ice ? '#a9d4ee' : '#725d48');
    poly([[ax, ay], [sx + s.x + s.w, by], [ax + s.w * 0.08, by]], ice ? '#5b86ad' : '#3d3027');
    ctx.strokeStyle = ice ? '#2b4a68' : '#1f1712'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx + s.x, by); ctx.lineTo(ax, ay); ctx.lineTo(sx + s.x + s.w, by); ctx.stroke();
  });
  if (h2 > 0.6) { // khe dung nham nung đỏ trong đá
    ctx.strokeStyle = (ice ? 'rgba(160,235,255,' : 'rgba(255,100,25,') + (0.55 + 0.3 * Math.sin(gameTime * 2.5 + h1 * 40)).toFixed(2) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx + 22, sy + 40); ctx.lineTo(sx + 26, sy + 30); ctx.lineTo(sx + 23, sy + 22); ctx.stroke();
  }
}

// ---------- Đảo băng: sprite cắt từ ảnh mẫu (assets/ice_island) ----------
let iceAssets = null;
function getIceAssets() {
  if (iceAssets) return iceAssets;
  iceAssets = {};
  ['mountain', 'pine_pair', 'pine_trio', 'crystal1', 'crystal2', 'crystal3', 'pond1', 'pond3', 'pond5'].forEach((n) => {
    loadImage('assets/ice_island/' + n + '.webp').then((img) => { iceAssets[n] = img; });
  });
  return iceAssets;
}
// Vẽ ảnh neo giữa-đáy tại (x, y), tỉ lệ sc, làm mượt (ảnh đã là bản thu nhỏ từ ảnh mẫu)
function drawIceImg(img, x, y, sc = 1, flip = false) {
  if (!img) return;
  const w = img.width * sc, h = img.height * sc;
  if (!flip) { ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h)); return; }
  ctx.save(); ctx.translate(Math.round(x), 0); ctx.scale(-1, 1);
  ctx.drawImage(img, Math.round(-w / 2), Math.round(y - h), Math.round(w), Math.round(h)); ctx.restore();
}
function drawIceTile(type, sx, sy, h1, h2, h3) {
  const A = getIceAssets(), cx = sx + TILE / 2, by = sy + 46;
  if (type === VSNAG) { // cây thông phủ tuyết
    const k = h1 < 0.62 ? 'pine_pair' : 'pine_trio', sc = k === 'pine_pair' ? 0.72 + h3 * 0.3 : 0.82;
    ctx.fillStyle = 'rgba(70,100,160,0.18)'; ctx.beginPath(); ctx.ellipse(cx, by - 2, 22, 7, 0, 0, TAU); ctx.fill();
    drawIceImg(A[k], cx, by + 4, sc, h2 > 0.5);
    return;
  }
  if (type === VCRYS) { // cụm tinh thể băng, lấp lánh
    const k = h1 < 0.4 ? 'crystal1' : h1 < 0.75 ? 'crystal2' : 'crystal3';
    ctx.fillStyle = 'rgba(70,130,210,0.18)'; ctx.beginPath(); ctx.ellipse(cx, by - 2, 24, 7, 0, 0, TAU); ctx.fill();
    drawIceImg(A[k], cx, by + 3, 1, h2 > 0.5);
    const tw = 0.5 + 0.5 * Math.sin(gameTime * 3 + h3 * 40);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.55 * tw).toFixed(2) + ')';
    ctx.fillRect(cx - 3 + (h2 - 0.5) * 14, by - 36 - h3 * 8, 3, 3);
    return;
  }
  // VROCK: vách đá băng xanh sẫm, mép trên phủ tuyết trắng, mặt trái sáng / mặt phải tối
  shadow(sx, sy, 21);
  const spires = [
    { x: 4 + h1 * 6, w: 18 + h2 * 6, h: 26 + h1 * 16 },
    { x: 16 + h2 * 6, w: 20 + h3 * 6, h: 34 + h3 * 18 },
    { x: 30 + h3 * 6, w: 16 + h1 * 5, h: 24 + h2 * 16 },
  ];
  spires.forEach((sp, i) => {
    const base = sy + 45, ax = sx + sp.x + sp.w / 2 + (i - 1) * 2, ay = base - sp.h, lx = sx + sp.x, rx = sx + sp.x + sp.w;
    poly([[lx, base], [ax, ay], [ax + sp.w * 0.08, base]], '#6f98d2');
    poly([[ax, ay], [rx, base], [ax + sp.w * 0.08, base]], '#3f68a8');
    ctx.strokeStyle = '#243f78'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(lx, base); ctx.lineTo(ax, ay); ctx.lineTo(rx, base); ctx.stroke();
    const t = 0.42, lx2 = ax + (lx - ax) * t, rx2 = ax + (rx - ax) * t, cy2 = ay + (base - ay) * t; // mũ tuyết phủ đỉnh, mép răng cưa
    poly([[ax, ay - 1], [lx2, cy2], [lx2 + (rx2 - lx2) * 0.25, cy2 - 3], [lx2 + (rx2 - lx2) * 0.5, cy2 + 3], [lx2 + (rx2 - lx2) * 0.75, cy2 - 2], [rx2, cy2]], '#f4f9ff');
  });
  ctx.strokeStyle = 'rgba(170,215,250,0.5)'; ctx.lineWidth = 1;
  if (h2 > 0.55) { ctx.beginPath(); ctx.moveTo(sx + 14 + h1 * 8, sy + 40); ctx.lineTo(sx + 18 + h1 * 8, sy + 28); ctx.stroke(); }
}

// Hồ băng đóng cứng (đi lên được): vài hồ mỗi đảo, đặt tại chỗ hash cố định trên đất trống
function icePonds(v) {
  if (v.ponds) return v.ponds;
  const A = getIceAssets(), list = [], kinds = ['pond1', 'pond3', 'pond5', 'pond1', 'pond5'];
  const okAt = (tx, ty) => { const g = volcanoGround(tx, ty); return g && getTile(tx, ty) === GRASS; };
  for (let i = 0; i < 26 && list.length < 9; i++) {
    const a = hash(v.x * 3 + i * 17, v.y - i * 29) * TAU;
    const z = i % 3, R = z === 0 ? 6.2 + hash(i * 5, v.x) * 3.2 : z === 1 ? 13.6 + hash(i * 7, v.y) * 1.4 : 19.6 + hash(i * 11, v.x + v.y) * 1.8; // không ra sát bãi cát
    const tx = Math.round(v.x + Math.cos(a) * R), ty = Math.round(v.y + Math.sin(a) * R);
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) if (!okAt(tx + dx, ty + dy)) ok = false;
    if (!ok || list.some((p) => Math.hypot(p.tx - tx, p.ty - ty) < 6)) continue;
    list.push({ tx, ty, k: kinds[list.length % kinds.length], flip: hash(tx, ty) > 0.5 });
  }
  v.ponds = list;
  return list;
}
function drawIcePonds(camX, camY, tx0, ty0, tx1, ty1) {
  const A = getIceAssets();
  const c0 = Math.floor((tx0 - 30) / VOLC.cell), c1 = Math.floor((tx1 + 30) / VOLC.cell), r0 = Math.floor((ty0 - 30) / VOLC.cell), r1 = Math.floor((ty1 + 30) / VOLC.cell);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const v = volcCenter(cx, cy);
    if (!v || !v.ice || Math.abs(v.x - (tx0 + tx1) / 2) > 60 + (tx1 - tx0) / 2 || Math.abs(v.y - (ty0 + ty1) / 2) > 60 + (ty1 - ty0) / 2) continue;
    for (const p of icePonds(v)) {
      if (p.tx < tx0 - 5 || p.tx > tx1 + 5 || p.ty < ty0 - 5 || p.ty > ty1 + 5) continue;
      const img = A[p.k];
      if (img) drawIceImg(img, (p.tx + 0.5) * TILE - camX, (p.ty + 0.5) * TILE - camY + img.height * 0.5, 1, p.flip);
    }
  }
}

// ---------- Sprite núi lửa ----------
let volcSprite = null;
function buildVolcSprite() {
  const W = 470, H = 480, CX = 235, BASEY = 330;
  const RX = 190, RY = 120, PEAKY = 96, CRX = 62, CRY = 19;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const body = mk(), glow = mk();
  const g = body.getContext('2d'), gl = glow.getContext('2d');
  let seed = 90210;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const half = (hgt) => CRX + (RX - CRX) * Math.pow(1 - Math.min(1, Math.max(0, hgt)), 1.35); // nửa bề rộng thân núi ở độ cao hgt (0 chân, 1 đỉnh)

  // đường viền thân núi (lởm chởm hai bên)
  const L = [], R = [], N = 9;
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = BASEY - (BASEY - PEAKY) * t, j = i === 0 || i === N ? 0 : (rnd() - 0.5) * 16;
    L.push([CX - half(t) + j, y]); R.push([CX + half(t) - j, y]);
  }
  const outline = (c) => {
    c.beginPath();
    c.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i <= N; i++) c.lineTo(L[i][0], L[i][1]);
    c.ellipse(CX, PEAKY, CRX, CRY, 0, Math.PI, TAU);
    for (let i = N; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.ellipse(CX, BASEY, RX, RY, 0, 0, Math.PI);
    c.closePath();
  };

  // bóng đổ
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(CX, BASEY + 10, RX + 18, RY + 10, 0, 0, TAU); g.fill();

  // thân núi
  const grad = g.createLinearGradient(CX - RX, 0, CX + RX, 0);
  grad.addColorStop(0, '#59463b'); grad.addColorStop(0.38, '#41342b'); grad.addColorStop(0.72, '#2a201b'); grad.addColorStop(1, '#1b1411');
  outline(g); g.fillStyle = grad; g.fill();
  g.save(); outline(g); g.clip();
  g.lineCap = 'round';
  for (let k = 0; k < 30; k++) { // vân đá chạy từ miệng xuống chân núi
    const ph = 0.04 + rnd() * 0.92, a = ph * Math.PI;
    const x0 = CX - Math.cos(a) * CRX * 0.9, y0 = PEAKY + Math.sin(a) * CRY * 0.8;
    const x1 = CX - Math.cos(a) * (RX + 6), y1 = BASEY + Math.sin(a) * RY * 0.9;
    g.strokeStyle = k % 3 ? 'rgba(0,0,0,0.3)' : 'rgba(150,118,92,0.2)';
    g.lineWidth = 2 + rnd() * 4;
    g.beginPath(); g.moveTo(x0, y0);
    g.quadraticCurveTo((x0 + x1) / 2 + (rnd() - 0.5) * 30, (y0 + y1) / 2 + (rnd() - 0.5) * 20, x1, y1); g.stroke();
  }
  // các dòng dung nham chảy xuống sườn: mờ trên body, sáng + nhấp nháy trên glow
  gl.save(); outline(gl); gl.clip(); gl.lineCap = 'round'; gl.lineJoin = 'round';
  const veins = [-0.85, -0.55, -0.25, 0.05, 0.3, 0.6, 0.88];
  veins.forEach((u, vi) => {
    const yS = PEAKY + CRY * 0.7, yE = BASEY + RY * Math.sqrt(Math.max(0, 1 - u * u)) * (vi % 3 === 0 ? 0.86 : 0.3 + rnd() * 0.4);
    const pts = [], S = 12, ph = rnd() * 6;
    for (let s = 0; s <= S; s++) {
      const tt = s / S, y = yS + (yE - yS) * tt;
      const hh = 1 - (y - PEAKY) / (BASEY - PEAKY);
      pts.push([CX + u * (hh >= 0 ? half(hh) : RX) + Math.sin(tt * 7 + ph) * (6 + tt * 6), y]);
    }
    const stroke = (c, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); };
    stroke(g, '#6e230e', 4); stroke(g, '#a8380f', 1.6);
    stroke(gl, 'rgba(255,90,20,0.4)', 9); stroke(gl, '#ff5a1a', 4.5); stroke(gl, '#ffc15a', 1.8);
  });
  gl.restore();
  g.restore();

  // tảng đá lăn quanh chân núi
  for (let k = 0; k < 20; k++) {
    const a = 0.02 * Math.PI + rnd() * 0.96 * Math.PI, rr = 6 + rnd() * 10;
    const x = CX - Math.cos(a) * (RX + 2 + rnd() * 10), y = BASEY + Math.sin(a) * (RY + rnd() * 6);
    g.fillStyle = '#251c17'; g.beginPath(); g.ellipse(x, y, rr, rr * 0.7, 0, 0, TAU); g.fill();
    g.fillStyle = '#5a4838'; g.beginPath(); g.ellipse(x - rr * 0.2, y - rr * 0.25, rr * 0.55, rr * 0.35, 0, 0, TAU); g.fill();
  }

  // miệng núi: vành đá nham nhở + lòng tối (dung nham động vẽ lúc chạy)
  g.fillStyle = '#231a15'; g.beginPath(); g.ellipse(CX, PEAKY, CRX + 11, CRY + 8, 0, 0, TAU); g.fill();
  for (let k = 0; k < 11; k++) {
    const a = Math.PI + (k / 10) * Math.PI, x = CX + Math.cos(a) * (CRX + 8), y = PEAKY + Math.sin(a) * (CRY + 5);
    poly2(g, [[x - 7, y + 3], [x + (rnd() - 0.5) * 5, y - 9 - rnd() * 8], [x + 7, y + 3]], '#2e231c');
  }
  g.fillStyle = '#5a4638'; g.beginPath(); g.ellipse(CX, PEAKY + 1, CRX + 5, CRY + 3, 0, 0, TAU); g.fill();
  g.fillStyle = '#2a0f06'; g.beginPath(); g.ellipse(CX, PEAKY + 3, CRX - 3, CRY - 2, 0, 0, TAU); g.fill();

  return { body, glow, cx: CX, baseY: BASEY, craterY: PEAKY + 3, crx: CRX - 3, cry: CRY - 2 };
}
function poly2(c, pts, fill) { c.fillStyle = fill; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); }

// Đảo trong vùng nhìn (toạ độ ô)
function volcanoesIn(x0, y0, x1, y1) {
  const out = [];
  for (let cy = Math.floor((y0 - 12) / VOLC.cell); cy <= Math.floor((y1 + 8) / VOLC.cell); cy++) {
    for (let cx = Math.floor((x0 - 10) / VOLC.cell); cx <= Math.floor((x1 + 10) / VOLC.cell); cx++) {
      const v = volcCenter(cx, cy);
      if (v && v.x >= x0 - 8 && v.x <= x1 + 8 && v.y >= y0 - 9 && v.y <= y1 + 6) out.push(v);
    }
  }
  return out;
}
const volcBaseRow = (v) => v.y + 4; // hàng vẽ núi: người đứng phía nam (hàng lớn hơn) được vẽ đè lên, phía bắc bị đỉnh núi che

let volcSpriteIce = null;
// Núi băng: ảnh mountain.webp (neo tâm chân núi tại (209, 285)); chỉ có tuyết bay + hang phát sáng xanh, không khói / dung nham
const ICE_MTN = { cx: 211, baseY: 298, caveX: 16, caveY: 29 };
function drawIceMountain(v, camX, camY) {
  const A = getIceAssets(), img = A.mountain;
  if (!img) return;
  const px = Math.round((v.x + 0.5) * TILE - camX), by = Math.round((v.y + 2) * TILE - camY);
  ctx.drawImage(img, px - ICE_MTN.cx, by - ICE_MTN.baseY);
  const cx = px + ICE_MTN.caveX, cy = by + ICE_MTN.caveY;
  ctx.globalAlpha = 0.18 + 0.12 * Math.sin(gameTime * 1.8 + v.g0 * 3); // hang băng ánh lên xanh
  ctx.fillStyle = '#7fd8ff'; ctx.beginPath(); ctx.ellipse(cx, cy, 26, 18, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 6; i++) { // tuyết bay quanh đỉnh núi
    const t = (gameTime * 0.12 + i / 6 + v.g0) % 1;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * Math.sin(Math.PI * t)).toFixed(2) + ')';
    ctx.fillRect(px - 80 + ((i * 53 + t * 90) % 160), by - 250 + t * 220, 3, 3);
  }
  if (Math.random() < 0.05) burst(v.x * TILE + TILE / 2 + (Math.random() - 0.5) * 160, v.y * TILE + TILE / 2 - 2 * TILE, '#e6f4ff', 2, 70, 60);
}
function drawVolcano(v, camX, camY) {
  if (v.ice) { drawIceMountain(v, camX, camY); return; }
  const base = volcSprite || (volcSprite = buildVolcSprite());
  if (v.ice && !volcSpriteIce) volcSpriteIce = { ...base, body: tintCanvas(base.body), glow: tintCanvas(base.glow) };
  const sp = v.ice ? volcSpriteIce : base;
  const px = Math.round((v.x + 0.5) * TILE - camX), by = Math.round((v.y + 2) * TILE - camY);
  const dx = px - sp.cx, dy = by - sp.baseY;
  ctx.drawImage(sp.body, dx, dy);
  ctx.globalAlpha = 0.35 + 0.35 * Math.sin(gameTime * 1.6 + v.g0 * 3); // dung nham trên sườn nhấp nháy
  ctx.drawImage(sp.glow, dx, dy);
  ctx.globalAlpha = 1;

  // dung nham sôi trong miệng núi
  const cx = px, cy = dy + sp.craterY, w = Math.sin(gameTime * 2.2);
  ctx.fillStyle = v.ice ? '#2b86c8' : '#d9480f'; ctx.beginPath(); ctx.ellipse(cx, cy, sp.crx, sp.cry, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = v.ice ? '#6fd0ff' : '#ff8a1e'; ctx.beginPath(); ctx.ellipse(cx + w * 3, cy + 1, sp.crx * 0.74, sp.cry * 0.68, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = v.ice ? '#e6f9ff' : '#ffd36a';
  for (let i = 0; i < 4; i++) {
    const a = gameTime * (0.6 + i * 0.17) + i * 1.7;
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * sp.crx * 0.5, cy + Math.sin(a) * sp.cry * 0.4, 7 + 3 * Math.sin(a * 2), 3, 0, 0, TAU); ctx.fill();
  }
  // khói bốc lên và trôi theo gió
  for (let i = 0; i < 7; i++) {
    const t = (gameTime * 0.09 + i / 7 + v.g0) % 1;
    const xx = cx + Math.sin(t * 4 + i * 1.9) * 16 + t * 70, yy = cy - 12 - t * 270, r = 18 + t * 56;
    const a = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.45;
    const c = 66 + Math.floor(t * 70);
    ctx.fillStyle = 'rgba(' + c + ',' + (c - 4) + ',' + (c - 7) + ',' + a.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(xx, yy, r, 0, TAU); ctx.fill();
  }
  // tàn lửa bắn lên
  if (Math.random() < 0.06) burst(v.x * TILE + TILE / 2 + (Math.random() - 0.5) * 80, v.y * TILE + TILE / 2 - 4 * TILE + 10, v.ice ? '#bfeaff' : '#ffa030', 2, 90, v.ice ? 60 : 260);
}

// Ban đêm: miệng núi toả sáng, thấy từ xa
function volcanoLights(light, camX, camY, W, H) {
  const tx0 = Math.floor(camX / TILE), ty0 = Math.floor(camY / TILE);
  for (const v of volcanoesIn(tx0 - 6, ty0 - 8, tx0 + Math.ceil(W / TILE) + 6, ty0 + Math.ceil(H / TILE) + 6)) {
    if (v.ice) { light((v.x + 0.5) * TILE - camX + ICE_MTN.caveX, (v.y + 2) * TILE - camY + ICE_MTN.caveY - 10, 170, 0.5, 0.2); continue; } // núi băng: chỉ hang sáng nhẹ
    const px = (v.x + 0.5) * TILE - camX, py = (v.y + 2) * TILE - camY - 234;
    light(px, py, 380, 0.95, 0.35);
    light(px, py + 3.5 * TILE, 300, 0.55, 0.3);
  }
}
