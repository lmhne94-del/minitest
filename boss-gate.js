// ======================================================================
//  boss-gate.js: KHU "CỔNG MA VƯƠNG"
//  - Nằm DƯỚI HẦM MỎ (tầng 1): chỉ có chiếc cổng quỷ (ảnh assets/boss/gate.webp) vùi trong đá, không có phòng hay tường. Người chơi tự đào tìm; còn cách ≤ 55 ô game báo hướng.
//  - Hạ hết zombie canh thì cổng mở: đứng trước cổng nhấn E để dịch chuyển vào ĐẤU TRƯỜNG BOSS (tầng 3).
//  - Trong đấu trường có boss (Quái Vật Hầm Mỏ); chết rớt Rương Legendary. Nhấn E ở cổng sáng phía dưới để thoát.
//  File này nạp TRƯỚC survival.js (xem survival.html) và không chạy gì lúc nạp; survival.js chỉ gọi các hàm ở đây tại vài điểm nối.
// ======================================================================

const GWALL = 40;                 // ô tường đá của phòng cổng / đấu trường
const GATE = {
  cell: 96,                       // mỗi ô lưới 96×96 ô hầm mỏ có tối đa một phòng cổng
  chance: 0.25,                   // (đã giảm từ 0.6) xác suất một ô lưới có phòng cổng (ô lưới chứa điểm xuất phát luôn có một, ở ~55 ô tính từ thang xuống hầm)
  minDist: 28,                    // phòng cổng cách điểm xuất phát ≥ từng này ô
  guards: 0,                      // số zombie canh cổng (0 = không có, cổng luôn mở; đặt 8 để bật lại phong ấn)
  respawn: 900,                   // giây sau khi mở cổng thì zombie canh quay lại (và boss hồi sinh)
  spawnDist: 24,                  // người chơi tới gần ≤ từng này ô thì zombie canh xuất hiện
  hintDist: 55,                   // báo hướng khi còn cách ≤ từng này ô
  reach: 100,                     // tầm nhấn E trước cổng (pixel)
};
// Hình học phòng cổng (toạ độ ô, gốc (0,0) = ô giữa cổng): tường ở |dx| = 10, dy = -7 (trên) và dy = 6 (dưới, có lối vào rộng 3 ô), nối với lối đục dài GATE_TUNNEL ô về phía nam
const GATE_TUNNEL = 6;
const GATE_W = 10, GATE_TOP = -7, GATE_BOT = 6;
const GATE_BODY_X = 6, GATE_BODY_Y0 = -1, GATE_BODY_Y1 = 0; // thân cổng: chỉ 2 hàng ô đặc ở chân cổng (phần trên chỉ là hình vẽ, không chặn đường)
const GATE_SPRITE_W = 600, GATE_SPRITE_H = 286;
// Đấu trường (tầng 3): sàn x∈[-11,11], y∈[-8,5], hốc thoát ở (0,6)
const ARENA = { get ax() { return arena.kind === 'omni' ? OMNI_BG.ax : 11; }, y0: -8, y1: 5, respawn: 900, bossTy: -4, startTy: 3 };
const ARENA_PILLARS = [[-6, -3], [6, -3], [-6, 1], [6, 1]];   // cột đá để nấp đá ném
const ARENA_TORCHES = [[-9, -9], [-3, -9], [3, -9], [9, -9], [-12, -4], [-12, 2], [12, -4], [12, 2]];

// Phòng boss Hỗn Nguyên Long Vương (kind 'omni'): nền là MỘT ẢNH LỚN (assets/final_boss/arena_bg.webp = ảnh gốc đã xoá nhân vật + thêm viền mờ tối).
// Ảnh gốc 1672×941; sàn đá trong ảnh: x∈[215,1475] (tâm 845), y∈[305,748]. Ảnh được kéo giãn để sàn khớp đúng sàn đấu trường (ax ô mỗi bên, y0..y1).
const OMNI_BG = {
  ax: 17,                                   // sàn rộng 35 ô (x∈[-17,17])
  padL: 700, padT: 300, W: 3072, H: 1691,   // viền thêm quanh ảnh gốc (px ảnh) và kích thước file sau khi thêm viền
  fx: 845, fy: 305, fw: 1260, fh: 443,      // tâm-x, mép trên, rộng, cao của sàn trong ảnh gốc
  rune: { x: 840, y: 535, rx: 300, ry: 160 }, // tâm vòng phép trong ảnh gốc + bán kính quỹ đạo 10 viên ngọc (px thế giới)
  torches: [[252, 248], [462, 228], [1210, 228], [1420, 248], [160, 425], [1510, 425], [120, 655], [325, 735], [1340, 735], [1550, 655]], // vị trí chậu lửa trong ảnh gốc
};
let OMNI_IMG = null, omniImgReq = false;
function ensureOmniImg() {
  if (omniImgReq) return;
  omniImgReq = true;
  loadImage('assets/final_boss/arena_bg.webp').then((img) => { OMNI_IMG = img; });
}
// Đổi toạ độ ảnh gốc -> toạ độ thế giới (px)
function omniScale() {
  const a = OMNI_BG;
  return { sx: ((2 * a.ax + 1) * TILE) / a.fw, sy: ((ARENA.y1 - ARENA.y0 + 1) * TILE) / a.fh };
}
function omniWorld(ix, iy) {
  const { sx, sy } = omniScale(), a = OMNI_BG;
  return { x: 0.5 * TILE + (ix - a.fx) * sx, y: ARENA.y0 * TILE + (iy - a.fy) * sy };
}

let GATE_IMG = null, gateImgReq = false;
// Tải ảnh cổng khi cần lần đầu (file này nạp TRƯỚC survival.js nên chưa gọi loadImage ngay lúc nạp)
function ensureGateImg() {
  if (gateImgReq) return;
  gateImgReq = true;
  loadImage('assets/boss/gate.webp').then((img) => { GATE_IMG = img; });
}

const gateCache = new Map();      // khoá số của ô lưới -> phòng cổng | null
const gateState = new Map();      // khoá cổng -> { spawned, cleared, clearedAt, hinted }
const arena = { key: null, leftAt: 0, ret: null, kind: 'golem' }; // kind: 'golem' = đấu trường Ma Vương (vào từ hầm mỏ) | 'omni' = Cổng Hỗn Nguyên (vào từ phòng Chú Lùn)
let arenaRet = null;              // chỗ đứng ngoài cổng để quay ra (khi đang ở đấu trường)
let gateScanT = 0;

function resetGates() { gateCache.clear(); gateState.clear(); arena.key = null; arena.kind = 'golem'; arenaRet = null; layerStore[3] = null; if (typeof mapStore !== 'undefined') mapStore[2] = null; }

// ---------- Vị trí các phòng cổng ----------
const cellKey = (cx, cy) => (cx + 4096) * 8192 + (cy + 4096);

// Chỗ này có đặt được phòng không? (tránh đè lên hang Quái Vật Hầm Mỏ)
function gateSiteFree(tx, ty) {
  const GC = GOLEM_CELL;
  for (let cy = Math.floor((ty - 30) / GC); cy <= Math.floor((ty + 30) / GC); cy++) {
    for (let cx = Math.floor((tx - 30) / GC); cx <= Math.floor((tx + 30) / GC); cx++) {
      const L = mineLair(cx, cy);
      if (L && Math.hypot(L.tx - tx, L.ty - ty) < 24) return false;
    }
  }
  return true;
}

function gateInCell(cx, cy) {
  const key = cellKey(cx, cy);
  if (gateCache.has(key)) return gateCache.get(key);
  let g = null;
  const G = GATE.cell, m = 16, span = G - 2 * m;
  const cands = [];
  if (cx === 0 && cy === 0) cands.push([22, 50], [60, 70], [70, 34], [30, 76], [76, 60]); // ô chứa điểm xuất phát: luôn có một (tránh hang boss ở (40, 24))
  else if (hash(cx * 53 + 11, cy * 37 - 5) < GATE.chance) {
    for (let i = 0; i < 4; i++) cands.push([cx * G + m + Math.floor(hash(cx * 7 + i, cy * 13 - i) * span), cy * G + m + Math.floor(hash(cx * 11 - i, cy * 5 + i) * span)]);
  }
  for (const [tx, ty] of cands) {
    if (Math.hypot(tx, ty) < GATE.minDist || !gateSiteFree(tx, ty)) continue;
    g = { key: 'gate' + cx + ',' + cy, tx, ty };
    break;
  }
  gateCache.set(key, g);
  return g;
}

// Các phòng cổng có phần nào nằm trong khung chữ nhật ô (x0..x1, y0..y1)
function gatesIn(x0, y0, x1, y1) {
  if (layer !== 1) return []; // cổng chỉ có dưới hầm mỏ
  const out = [], G = GATE.cell;
  for (let cy = Math.floor(y0 / G); cy <= Math.floor(y1 / G); cy++) {
    for (let cx = Math.floor(x0 / G); cx <= Math.floor(x1 / G); cx++) {
      const g = gateInCell(cx, cy);
      if (g && g.tx + 13 >= x0 && g.tx - 13 <= x1 && g.ty + 10 >= y0 && g.ty - 10 <= y1) out.push(g);
    }
  }
  return out;
}

// Ô (x, y) dưới hầm mỏ: chỉ có THÂN CỔNG (ô đặc) và một khoảng trống nhỏ phía trước để đứng nhấn E; xung quanh vẫn là đá của hầm
function gateTile(x, y) {
  const G = GATE.cell;
  const g = gateInCell(Math.floor(x / G), Math.floor(y / G));
  if (!g) return undefined;
  const dx = x - g.tx, dy = y - g.ty, ax = Math.abs(dx);
  if (ax <= GATE_BODY_X && dy >= GATE_BODY_Y0 && dy <= GATE_BODY_Y1) return VOBJ;                    // thân cổng
  if (ax <= GATE_BODY_X + 1 && dy > GATE_BODY_Y1 && dy <= GATE_BODY_Y1 + 3) return GRASS;           // chỗ đứng trước cổng
  return undefined;
}

// Ô (tx, ty) thuộc sàn đá của phòng (để vẽ nền)? Trả { g, dx, dy } hoặc null
function gateFloorOf(gs, tx, ty) {
  for (const g of gs) {
    const dx = tx - g.tx, dy = ty - g.ty;
    if (Math.abs(dx) <= GATE_BODY_X + 1 && dy >= GATE_BODY_Y0 && dy <= GATE_BODY_Y1 + 3) return { g, dx, dy }; // sàn đá dưới chân và trước cổng
  }
  return null;
}

function gateStateOf(g) {
  let st = gateState.get(g.key);
  if (!st) { st = { spawned: false, cleared: GATE.guards === 0, clearedAt: 0, hinted: false }; gateState.set(g.key, st); }
  return st;
}
function gateLocked(g) { return !gateStateOf(g).cleared; }

// ---------- Zombie canh cổng ----------
function spawnGateGuards(g) {
  const types = [1, 2, 3, 3, 5, 5, 4, 2, 3, 1];
  let made = 0;
  for (let i = 0; i < 120 && made < GATE.guards; i++) {
    const tx = g.tx + Math.floor(hash(g.tx + i * 13, g.ty - i * 7) * 15) - 7 + (Math.random() < 0.5 ? 0 : 1);
    const ty = g.ty + 1 + Math.floor(Math.random() * 5);
    if (Math.abs(tx - g.tx) > 8 || isSolid(tx, ty)) continue;
    const p = tileCenter(tx, ty), x = p.x + (Math.random() - 0.5) * 20, y = p.y + (Math.random() - 0.5) * 10;
    if (collides(x, y, 12) || zombies.some((z) => z.guard === g && !z.dead && Math.hypot(z.x - x, z.y - y) < 50)) continue;
    const z = createZombie(types[made % types.length], x, y, g);
    z.homeX = x; z.homeY = y;
    z.face = x < (g.tx + 0.5) * TILE ? 1 : -1;
    made++;
  }
}

// Gọi mỗi khung hình (trong update): sinh zombie canh, mở cổng khi hạ hết, báo hướng
function updateGates(dt) {
  if (layer === 3) { updateGolemFx(dt); return; }
  if (layer !== 1 || deathScreen) return;
  gateScanT -= dt;
  if (gateScanT > 0) return;
  gateScanT = 0.4;
  const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE), R = GATE.hintDist + 14;
  for (const g of gatesIn(px - R, py - R, px + R, py + R)) {
    const st = gateStateOf(g);
    const d = Math.hypot(g.tx - px, g.ty - py);
    if (GATE.guards > 0 && st.cleared && gameTime - st.clearedAt >= GATE.respawn && d > GATE.spawnDist + 6) { st.cleared = false; st.spawned = false; } // zombie canh quay lại
    if (!st.hinted && d <= GATE.hintDist && d > GATE.spawnDist) {
      st.hinted = true;
      const dirs = ['Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc', 'Bắc', 'Đông Bắc'];
      const dir = dirs[(Math.round(Math.atan2(g.ty - py, g.tx - px) / (Math.PI / 4)) + 8) % 8];
      say('Tiếng gầm vang từ phía ' + dir + ' (~' + Math.round(d) + ' ô): có Cổng Ma Vương dưới hầm, hãy đào tới!');
      shake = Math.max(shake, 0.3);
    }
    if (st.cleared || GATE.guards === 0 || d > GATE.spawnDist) continue;
    if (!st.spawned) { spawnGateGuards(g); st.spawned = true; }
    else if (guardsAlive(g) === 0) {
      st.cleared = true; st.clearedAt = gameTime;
      const c = tileCenter(g.tx, g.ty + 1);
      burst(c.x, c.y - 40, '#c58bff', 36, 260, 250);
      shake = Math.max(shake, 0.6);
      say('Phong ấn tan vỡ!');
    }
  }
}

// ---------- Tương tác ----------
function nearestGate(maxDist) {
  if (layer !== 1) return null;
  const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE);
  let best = null, bd = maxDist;
  for (const g of gatesIn(px - 4, py - 4, px + 4, py + 4)) {
    const c = tileCenter(g.tx, g.ty + 1);
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

function useGate(g) {
  const left = guardsAlive(g);
  if (left > 0 || gateLocked(g)) {
    say('Cổng bị phong ấn! Hạ hết zombie canh giữ' + (left > 0 ? ' (còn ' + left + ')' : ''));
    shake = Math.max(shake, 0.25);
    return;
  }
  enterArena(g);
}

// Toạ độ các ô của đấu trường
function arenaTile(x, y) {
  if (x === 0 && y === ARENA.y1 + 1) return GRASS; // hốc thoát
  if (x >= -ARENA.ax && x <= ARENA.ax && y >= ARENA.y0 && y <= ARENA.y1) {
    if (arena.kind !== 'omni') for (const [px, py] of ARENA_PILLARS) if (px === x && py === y) return GWALL; // phòng Hỗn Nguyên: sàn trống, không cột
    return GRASS;
  }
  return GWALL;
}

function enterArena(g) {
  arena.kind = 'golem';
  const key = 'arena:' + g.key;
  const died = bossDeaths.get(key);
  const respawned = died !== undefined && gameTime - died >= ARENA.respawn;
  let fresh = false;
  if (arena.key !== key || respawned || !layerStore[3]) { layerStore[3] = null; arena.key = key; fresh = true; }
  if (respawned) bossDeaths.delete(key);
  const back = tileCenter(g.tx, g.ty + 3);
  arenaRet = { x: back.x, y: back.y };
  switchLayer(3);
  const s = tileCenter(0, ARENA.startTy);
  player.x = s.x; player.y = s.y;
  player.faceX = 0; player.faceY = -1;
  player.invuln = Math.max(player.invuln, 2);
  if (fresh) {
    if (bossDeaths.get(key) === undefined) createGolem({ key, tx: 0, ty: ARENA.bossTy }, GOLEM.hp);
  } else {
    for (const z of zombies) { // quay lại: boss hồi dần máu trong lúc bạn vắng mặt, về chỗ cũ
      if (!z.boss || z.dead) continue;
      z.hp = Math.min(z.maxHp, z.hp + (gameTime - arena.leftAt) * 1.5);
      z.x = z.hx; z.y = z.hy; z.act = null; z.aggro = false;
    }
  }
  shake = Math.max(shake, 0.6);
  say('Đấu trường Ma Vương! Hạ boss để mở Rương Legendary');
}

// Cổng Hỗn Nguyên: vào từ phòng Chú Lùn (dwarf.js), cùng đấu trường nhưng quay ra mặt đất chỗ Cây Cổ Thụ
function enterOmniArena() {
  layerStore[3] = null; arena.key = 'omni'; arena.kind = 'omni';
  arenaRet = houseRet ? { x: houseRet.x, y: houseRet.y } : null; // chỗ đứng ngoài Cây Cổ Thụ (lưu game / túi đồ khi chết)
  switchLayer(3);
  const s = tileCenter(0, ARENA.startTy);
  player.x = s.x; player.y = s.y;
  player.faceX = 0; player.faceY = -1;
  player.invuln = Math.max(player.invuln, 2);
  shake = Math.max(shake, 0.8);
  say('Cổng Hỗn Nguyên mở ra!');
  if (window.FinalBoss) FinalBoss.enter(); // dựng boss cuối: Hỗn Nguyên Long Vương (final-boss.js)
}
// Tầng gốc của đấu trường (để lưu game): Ma Vương nằm dưới hầm mỏ (1), Hỗn Nguyên nằm trên mặt đất (0)
const arenaBaseLayer = () => (arena.kind === 'omni' ? 0 : 1);

function nearArenaExit(maxDist) {
  if (layer !== 3) return false;
  const c = tileCenter(0, ARENA.y1 + 1);
  return Math.hypot(c.x - player.x, c.y - player.y) < maxDist;
}

function exitArena() {
  if (arena.kind === 'omni') { // về mặt đất, chỗ Cây Cổ Thụ (exitHouse tự dời sang ô trống nếu chỗ cũ bị chặn)
    arena.kind = 'golem'; arena.key = null; arenaRet = null;
    exitHouse();
    say('Bạn đã rời Cổng Hỗn Nguyên');
    return;
  }
  switchLayer(1); // quay về hầm mỏ, đứng trước cổng
  if (arenaRet) { player.x = arenaRet.x; player.y = arenaRet.y; }
  arenaRet = null;
  player.invuln = Math.max(player.invuln, 1.5);
  say('Bạn đã rời đấu trường, quay về hầm mỏ');
}

// Chỗ đứng để lưu game / đặt túi đồ khi chết: ở trong nhà thì dùng chỗ ngoài cửa (mặt đất), ở đấu trường thì dùng chỗ trước cổng (dưới hầm mỏ)
function roomReturnPos() {
  if (layer === 2 && houseRet) return houseRet;
  if (layer === 3 && arenaRet) return arenaRet;
  return null;
}

// Lưu / tải cổng đã mở
function gatesSave() { return [...gateState].filter(([, s]) => s.cleared).map(([k]) => k); }
function gatesLoad(list) {
  gateState.clear();
  for (const k of list || []) gateState.set(k, { spawned: true, cleared: true, clearedAt: gameTime, hinted: true });
}

// ---------- Vẽ ----------
const ST_COL = { base: '#3f2d57', top: '#58407a', edge: '#7f5fa8', dark: '#2b1d3d' };

function drawFlame(cx, cy, s = 1) {
  const f = Math.sin(gameTime * 11 + cx * 0.3) * 2, f2 = Math.sin(gameTime * 17 + cy * 0.2) * 1.5;
  ctx.fillStyle = '#5a3a2a'; ctx.fillRect(cx - 7 * s, cy, 14 * s, 6 * s);                       // chậu
  ctx.fillStyle = '#ff8a2a';
  ctx.beginPath(); ctx.moveTo(cx - 6 * s, cy); ctx.quadraticCurveTo(cx - 7 * s + f, cy - 14 * s, cx + f2, cy - 24 * s); ctx.quadraticCurveTo(cx + 7 * s + f, cy - 12 * s, cx + 6 * s, cy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath(); ctx.moveTo(cx - 3 * s, cy); ctx.quadraticCurveTo(cx - 3 * s + f2, cy - 8 * s, cx + f * 0.5, cy - 15 * s); ctx.quadraticCurveTo(cx + 3 * s, cy - 7 * s, cx + 3 * s, cy); ctx.closePath(); ctx.fill();
}

// Ô tường đá (cả phòng ngoài trời lẫn đấu trường); đuốc ở một số ô
function drawGateWall(sx, sy, tx, ty) {
  const arenaLayer = layer === 3;
  if (arenaLayer && ARENA_PILLARS.some(([x, y]) => x === tx && y === ty)) { // cột đá đứng giữa sàn: cao hơn một ô, dễ nhận ra
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx + TILE / 2, sy + TILE - 4, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a4378'; ctx.fillRect(sx + 6, sy - 30, TILE - 12, TILE + 22);
    ctx.fillStyle = '#7a5aa0'; ctx.fillRect(sx + 2, sy - 36, TILE - 4, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx + 6, sy - 6, TILE - 12, 2); ctx.fillRect(sx + 6, sy + 16, TILE - 12, 2); ctx.fillRect(sx + TILE - 14, sy - 22, 8, TILE + 14);
    ctx.fillStyle = 'rgba(255,140,50,0.55)'; ctx.fillRect(sx + TILE / 2 - 3, sy + 2, 6, 6); // viên đá phát sáng
    return;
  }
  const h = hash(tx * 7 + 3, ty * 11 - 5);
  ctx.fillStyle = arenaLayer ? '#2a1d38' : ST_COL.base; ctx.fillRect(sx, sy, TILE, TILE);
  ctx.fillStyle = arenaLayer ? '#3a2850' : ST_COL.top; ctx.fillRect(sx, sy, TILE, 14);
  ctx.fillStyle = arenaLayer ? '#5a3d7e' : ST_COL.edge; ctx.fillRect(sx, sy, TILE, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(sx, sy + 14, TILE, 2); ctx.fillRect(sx, sy + 30, TILE, 2);
  const o1 = h < 0.5 ? 14 : 28, o2 = h < 0.5 ? 30 : 12;
  ctx.fillRect(sx + o1, sy + 16, 2, 14); ctx.fillRect(sx + o2, sy + 32, 2, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(sx + 3, sy + 18, 9, 3);
  if (h > 0.9) { ctx.fillStyle = 'rgba(255,130,40,0.5)'; ctx.fillRect(sx + 20, sy + 34, 8, 3); } // vết dung nham trong khe đá
  if (isGateTorch(tx, ty)) drawFlame(sx + TILE / 2, sy + 14);
}

function isGateTorch(tx, ty) {
  if (layer === 3) return ARENA_TORCHES.some(([x, y]) => x === tx && y === ty);
  const g = gateInCell(Math.floor(tx / GATE.cell), Math.floor(ty / GATE.cell));
  if (!g) return false;
  const dx = tx - g.tx, dy = ty - g.ty;
  return dy === GATE_BOT && Math.abs(dx) === 2 || (dy === GATE_TOP && (dx === -6 || dx === 6)) || (Math.abs(dx) === GATE_W && (dy === GATE_TOP || dy === GATE_BOT));
}

// Viền tường đấu trường nhìn thấy được (xa hơn thì không vẽ, để nền đen)
function arenaWallVisible(tx, ty) {
  if (arena.kind === 'omni') return false; // đã có ảnh nền, tường vô hình
  return tx >= -ARENA.ax - 3 && tx <= ARENA.ax + 3 && ty >= ARENA.y0 - 3 && ty <= ARENA.y1 + 3;
}

// Sàn đá của phòng ngoài trời
function drawGateFloor(f, tx, ty, sx, sy) {
  const hv = hash(tx * 5 + 1, ty * 9 + 4);
  const path = f.dy > GATE_BOT;
  ctx.fillStyle = path ? (hv < 0.5 ? '#5b4a6e' : '#54446a') : ((tx + ty) & 1 ? '#42354f' : '#47395a');
  ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(sx, sy + TILE - 2, TILE + 1, 2); ctx.fillRect(sx + (hv < 0.5 ? 22 : 30), sy, 2, TILE);
  if (hv > 0.86) { ctx.fillStyle = 'rgba(255,140,50,0.28)'; ctx.fillRect(sx + 8, sy + 16, 14, 2); ctx.fillRect(sx + 20, sy + 18, 2, 12); } // khe nứt phát sáng
  if (hv < 0.07) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(sx + 10, sy + 10, 10, 8); }
}

// Sàn đấu trường: đá tím sẫm, nứt dung nham, vòng ma pháp giữa phòng, cổng thoát phía dưới
function drawOmniGround(camX, camY) {
  ensureOmniImg();
  ctx.fillStyle = '#0d0820'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (OMNI_IMG) {
    const { sx, sy } = omniScale(), a = OMNI_BG;
    const gx = omniWorld(0, 0); // vị trí góc trên-trái của ảnh GỐC; ảnh đã thêm viền nên lùi padL/padT
    ctx.drawImage(OMNI_IMG, Math.round(gx.x - a.padL * sx - camX), Math.round(gx.y - a.padT * sy - camY), Math.round(a.W * sx), Math.round(a.H * sy));
  }
  const c = omniWorld(OMNI_BG.rune.x, OMNI_BG.rune.y), cx = c.x - camX, cy = c.y - camY;
  ctx.save();
  const pulse = 0.5 + 0.5 * Math.sin(gameTime * 2);
  const gl = ctx.createRadialGradient(cx, cy, 20, cx, cy, 420);
  gl.addColorStop(0, 'rgba(150,90,255,' + (0.10 + 0.06 * pulse) + ')'); gl.addColorStop(1, 'rgba(150,90,255,0)');
  ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(cx, cy, 420, 230, 0, 0, Math.PI * 2); ctx.fill();
  if (window.ElementPick) { // 10 viên ngọc đúng màu 10 hệ xoay quanh vòng phép
    const els = ElementPick.ELEMENTS, R = OMNI_BG.rune;
    els.forEach((e, i) => {
      const ang = gameTime * 0.5 + (i * Math.PI * 2) / els.length;
      ctx.fillStyle = e.color; ctx.shadowColor = e.color; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * R.rx, cy + Math.sin(ang) * R.ry, 9, 0, Math.PI * 2); ctx.fill();
    });
  }
  ctx.restore();
  drawArenaExit(camX, camY);
}

function drawArenaExit(camX, camY) {
  const e = tileCenter(0, ARENA.y1 + 1), ex = e.x - camX, ey = e.y - camY;
  const pulse = 0.5 + 0.5 * Math.sin(gameTime * 3);
  const g = ctx.createRadialGradient(ex, ey, 4, ex, ey, 46);
  g.addColorStop(0, 'rgba(255,230,160,0.95)'); g.addColorStop(0.5, 'rgba(255,140,60,' + (0.55 + 0.2 * pulse) + ')'); g.addColorStop(1, 'rgba(160,60,220,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ex, ey, 46, 40, 0, 0, Math.PI * 2); ctx.fill();
}

function drawArenaGround(camX, camY, tx0, ty0, tx1, ty1) {
  if (arena.kind === 'omni') { drawOmniGround(camX, camY); return; }
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const sx = tx * TILE - camX, sy = ty * TILE - camY;
      const inside = (tx >= -ARENA.ax && tx <= ARENA.ax && ty >= ARENA.y0 && ty <= ARENA.y1) || (tx === 0 && ty === ARENA.y1 + 1);
      if (!inside) { ctx.fillStyle = '#0a0610'; ctx.fillRect(sx, sy, TILE + 1, TILE + 1); continue; }
      const hv = hash(tx * 5 + 1, ty * 9 + 4);
      ctx.fillStyle = (tx + ty) & 1 ? '#2b2037' : '#31263f';
      ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(sx, sy + TILE - 2, TILE + 1, 2); ctx.fillRect(sx + (hv < 0.5 ? 22 : 30), sy, 2, TILE);
      if (hv > 0.82) { ctx.fillStyle = 'rgba(255,120,40,' + (0.3 + 0.12 * Math.sin(gameTime * 3 + tx)) + ')'; ctx.fillRect(sx + 6, sy + 14, 16, 2); ctx.fillRect(sx + 20, sy + 16, 2, 14); }
    }
  }
  // Vòng ma pháp
  const c = tileCenter(0, ARENA.bossTy + 1);
  ctx.save();
  ctx.strokeStyle = 'rgba(190,100,255,' + (0.28 + 0.1 * Math.sin(gameTime * 2)) + ')'; ctx.lineWidth = 3;
  for (const r of [3.4, 2.4]) { ctx.beginPath(); ctx.ellipse(c.x - camX, c.y - camY, r * TILE, r * TILE * 0.55, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (arena.kind === 'omni' && window.ElementPick) { // 10 viên ngọc đúng màu 10 hệ xoay quanh vòng phép
    const els = ElementPick.ELEMENTS;
    els.forEach((e, i) => {
      const a = gameTime * 0.5 + (i * Math.PI * 2) / els.length;
      ctx.fillStyle = e.color; ctx.shadowColor = e.color; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(c.x - camX + Math.cos(a) * 3.4 * TILE, c.y - camY + Math.sin(a) * 3.4 * TILE * 0.55, 9, 0, Math.PI * 2); ctx.fill();
    });
  }
  ctx.restore();
  // Cổng thoát
  const e = tileCenter(0, ARENA.y1 + 1), ex = e.x - camX, ey = e.y - camY;
  const pulse = 0.5 + 0.5 * Math.sin(gameTime * 3);
  const g = ctx.createRadialGradient(ex, ey, 4, ex, ey, 46);
  g.addColorStop(0, 'rgba(255,230,160,0.95)'); g.addColorStop(0.5, 'rgba(255,140,60,' + (0.55 + 0.2 * pulse) + ')'); g.addColorStop(1, 'rgba(160,60,220,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ex, ey, 46, 40, 0, 0, Math.PI * 2); ctx.fill();
}

// Sprite cổng quỷ; vẽ ở hàng ô dy = 0 để người chơi đứng phía trước thì che đúng thứ tự
function drawGateSprite(g, camX, camY) {
  ensureGateImg();
  const cx = (g.tx + 0.5) * TILE - camX, base = (g.ty + 1) * TILE - camY + 6;
  const x0 = Math.round(cx - GATE_SPRITE_W / 2), y0 = Math.round(base - GATE_SPRITE_H);
  const locked = gateLocked(g);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(cx, base - 4, GATE_SPRITE_W * 0.48, 16, 0, 0, Math.PI * 2); ctx.fill();
  if (GATE_IMG) ctx.drawImage(GATE_IMG, x0, y0, GATE_SPRITE_W, GATE_SPRITE_H);
  else { ctx.fillStyle = '#5a3d7e'; ctx.fillRect(x0 + 40, y0 + 40, GATE_SPRITE_W - 80, GATE_SPRITE_H - 40); }
  // Miệng cổng: đang phong ấn thì có màn chắn tím, mở rồi thì lửa sáng dâng lên
  const mx = x0 + 235, mw = 135, top = y0 + 104, bot = y0 + 272;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(mx, bot); ctx.lineTo(mx, top + 70); ctx.quadraticCurveTo(mx + 5, top + 6, mx + mw / 2, top); ctx.quadraticCurveTo(mx + mw - 5, top + 6, mx + mw, top + 70); ctx.lineTo(mx + mw, bot); ctx.closePath();
  ctx.clip();
  if (locked) {
    ctx.fillStyle = 'rgba(120,40,200,' + (0.42 + 0.1 * Math.sin(gameTime * 3)) + ')'; ctx.fillRect(mx, top, mw, bot - top);
    ctx.strokeStyle = 'rgba(230,170,255,0.55)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const xx = mx + 12 + i * 22; ctx.beginPath(); ctx.moveTo(xx, top + 10); ctx.lineTo(xx + Math.sin(gameTime * 2 + i) * 6, bot); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('✖', mx + mw / 2, top + 100);
  } else {
    const gr = ctx.createLinearGradient(0, bot, 0, top);
    gr.addColorStop(0, 'rgba(255,200,90,' + (0.55 + 0.2 * Math.sin(gameTime * 4)) + ')'); gr.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = gr; ctx.fillRect(mx, top, mw, bot - top);
  }
  ctx.restore();
}

// Gợi ý nhấn E / báo cổng bị khoá
function drawGateHints(camX, camY) {} // đã bỏ chữ hướng dẫn trên cổng

// Ánh sáng đuốc / lò lửa của cổng (gọi trong drawLighting)
function gateLights(light, camX, camY) {
  if (layer === 3 && arena.kind === 'omni') {
    for (const [ix, iy] of OMNI_BG.torches) { const w = omniWorld(ix, iy), fl = 1 + 0.08 * Math.sin(gameTime * 9 + ix); light(w.x - camX, w.y - camY, 190 * fl, 0.75, 0.3); }
    const e = tileCenter(0, ARENA.y1 + 1);
    light(e.x - camX, e.y - camY, 150, 0.9, 0.3);
    return;
  }
  if (layer === 3) {
    for (const [x, y] of ARENA_TORCHES) light((x + 0.5) * TILE - camX, (y + 0.7) * TILE - camY, 190, 0.8, 0.3);
    const e = tileCenter(0, ARENA.y1 + 1);
    light(e.x - camX, e.y - camY, 150, 0.9, 0.3);
    return;
  }
  const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE);
  for (const g of gatesIn(px - 30, py - 22, px + 30, py + 22)) {
    const cx = (g.tx + 0.5) * TILE - camX, by = (g.ty + 1) * TILE - camY;
    light(cx - 180, by - 110, 150, 0.9, 0.35); light(cx + 180, by - 110, 150, 0.9, 0.35); // hai chậu lửa
    light(cx, by - 70, 190, 0.8, 0.3);                                                       // miệng cổng
  }
}
