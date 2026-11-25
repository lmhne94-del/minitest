'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Lớp tối dùng cho ban đêm (vẽ riêng rồi dán lên màn hình)
const darkCanvas = document.createElement('canvas');
const dctx = darkCanvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  darkCanvas.width = canvas.width;
  darkCanvas.height = canvas.height;
}
window.addEventListener('resize', resize);
resize();

// ---------- Tải ảnh ----------
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ---------- Sprite nhân vật ----------
// Mỗi file là 1 sprite sheet, khung 64x64. Hàng: 0=xuống, 1=trái, 2=phải, 3=lên.
const FRAME = 64;
const SPRITE_SCALE = 2;
const ANIMS = {
  idle:   { frames: 12, fps: 6 },
  walk:   { frames: 6,  fps: 10 },
  run:    { frames: 8,  fps: 13 },
  attack: { frames: 8,  fps: 0 },  // chạy theo thời gian của cú chém
};
const SPRITES = {}; // SPRITES[cấp][tên anim] = Image
let spritesReady = false;

function loadSprites() {
  const jobs = [];
  for (let lvl = 1; lvl <= 3; lvl++) {
    SPRITES[lvl] = {};
    for (const name of Object.keys(ANIMS)) {
      jobs.push(
        loadImage('assets/player/lvl' + lvl + '_' + name + '.webp').then((img) => {
          SPRITES[lvl][name] = img;
          return Boolean(img);
        })
      );
    }
  }
  return Promise.all(jobs).then((r) => { spritesReady = r.every(Boolean); });
}

// ---------- Sprite hiệu ứng (sét, nổ) ----------
// Sét: mỗi file 640x160 = 10 khung 64x160. Nổ: 384x48 = 8 khung 48x48.
const LIGHTNING = { frameW: 64, frameH: 160, frames: 10, fps: 20, warn: 1.2, hitFrame: 1, scale: 2.4 };
const BOOM = { size: 48, frames: 8, fps: 16, scale: 2.5 };
const STRIKE_RADIUS = BALANCE.lightning.radius;   // vùng bị sét gây sát thương
const FX = { lightning: [], boom: null };

// Hoạt ảnh bắn cung: bow_shoot.webp = lưới 4 hàng (phải, trái, lên, xuống) x 4 khung (chuẩn bị, giương, thả, thu cung), ô 112x64, mỏ neo ở giữa chân.
// arrow_fly.webp = mũi tên bay kèm vệt gió.
const BOWFX = { sheet: null, arrow: null, cellW: 112, cellH: 64, baseY: 54 }; // baseY: dòng chân đứng trong ô

function loadFx() {
  loadImage('assets/player/tooluse.webp').then((img) => { TOOLUSE.img = img; });
  loadImage('assets/sea/sea_deep.webp').then((img) => { SEAFX.deep = img; });
  loadImage('assets/sea/swim4.webp').then((img) => { SEAFX.swim = img; });
  loadImage('assets/fx/tool_hit.webp').then((img) => { TOOLUSE.fx = img; });
  loadImage('assets/player/bow_shoot.webp').then((img) => { BOWFX.sheet = img; });
  loadImage('assets/fx/arrow_fly.webp').then((img) => { BOWFX.arrow = img; });
  const jobs = [1, 2, 3, 4].map((n) => loadImage('assets/fx/lightning_' + n + '.webp'));
  jobs.push(loadImage('assets/fx/boom.webp'));
  return Promise.all(jobs).then((imgs) => {
    FX.boom = imgs.pop();
    FX.lightning = imgs.filter(Boolean);
  });
}

// ---------- Sprite zombie ----------
// Mỗi file là 1 dải ngang các khung (ô 84x71, neo ở đáy-giữa), nhân vật quay mặt sang phải.
const ZCELL = { w: 84, h: 71 };
const ZANIMS = {
  idle:   { frames: 4,  fps: 5 },
  walk:   { frames: 6,  fps: 8 },
  run:    { frames: 10, fps: 15 },
  attack: { frames: 6,  fps: 0 },   // chạy theo thời gian của cú đánh
  hurt:   { frames: 5,  fps: 0 },   // chạy theo thời gian bị thương
  dead:   { frames: 8,  fps: 10 },
};
// Zombie Điện (loại 6, dạng V2): ô 120x90 và số khung riêng (xem assets/zombie/z6_*.webp)
const ZCELL6 = { w: 120, h: 90 };
const ZANIMS6 = {
  idle:   { frames: 6,  fps: 6 },
  walk:   { frames: 7,  fps: 9 },
  run:    { frames: 7,  fps: 14 },
  attack: { frames: 12, fps: 0 },
  hurt:   { frames: 5,  fps: 0 },
  dead:   { frames: 4,  fps: 6 },
};
const ZSPRITES = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {} };
let zombieSpritesReady = false;

function loadZombieSprites() {
  const jobs = [];
  for (const t of [1, 2, 3, 4, 5, 6]) {
    for (const name of Object.keys(ZANIMS)) {
      jobs.push(loadImage('assets/zombie/z' + t + '_' + name + '.webp').then((img) => {
        ZSPRITES[t][name] = img;
        return Boolean(img);
      }));
    }
  }
  return Promise.all(jobs).then((r) => { zombieSpritesReady = r.every(Boolean); });
}

// ---------- World (vô tận, sinh theo toạ độ) ----------
const TILE = 48;
const GRASS = 0, TREE = 1, ROCK = 2, COAL = 3, IRON = 4, GOLD = 5, ROD = 6, TABLE = 7, FURNACE = 8, BED = 9, STAIRS = 10;
const STORE = 13; // rương gỗ do người chơi đặt (11, 12 là ô của làng / nhà)
// Vật liệu xây nhà & trang trí (chế ở bàn chế tạo, đặt bằng chuột trái, đập bằng rìu / cuốc để thu hồi)
const WWALL = 14, IWALL = 15, WDOOR = 16, WDOOR_O = 17, IDOOR = 18, IDOOR_O = 19, ROOF = 20, LAMP = 22, CARPET = 23, FENCE = 24, POT = 25, WFLOOR = 26;
const FARM = 27; // đất đã cày (trồng trọt). Cây đang trồng nằm trong changes dưới khoá 'c<x>,<y>' = { k: loại, t: lúc gieo, h: lúc hái (nếu ra quả lại) }
const MILL = 28, OVEN = 29; // máy xay, lò nướng: đứng gần để chế biến nông sản (lưới 3×3)
const DIAMOND = 31;         // quặng kim cương (hiếm, ở xa; cần cuốc sắt để đào)
const LAVA = 32, WATER = 33; // dung nham (bỏng) và nước ngầm (đi chậm): chỉ có dưới hầm mỏ, đi vào được
const RADIO = 30;           // radio do người chơi đặt xuống đất: nhấn E dán link nhạc, càng xa nghe càng nhỏ (xem radio.js)
const WBLOCK = 34, SBLOCK = 35; // khối gỗ, khối đá (khối đặc nguyên ô)
const SEA = 39; // biển sâu ngoài mặt đất: không lội được, đạn và phép bay qua được (xem seaType)
const IBLOCK = 36, DBLOCK = 37, CBLOCK = 38; // khối sắt, khối kim cương, khối than
const DROD = 60; // Cột Thu Lôi Tím (bán ở Chợ Đen): hút sét trong 22 ô, không cháy hỏng, giật điện quái xung quanh
const FOSSIL = 61; // Hoá Thạch Rồng (rớt từ Hỗn Nguyên Long Vương): vật trang trí đặt được, chiếm 1 ô nhưng vẽ rộng ~4 ô (assets/final_boss/fossil.webp)
const LEGACY_STEP = 21; // bậc thang đã bị xoá khỏi game: ô cũ trong save được dọn thành đất trống khi tải
const WALKABLE_BUILD = new Set([WDOOR_O, IDOOR_O, CARPET, WFLOOR, FARM]); // đi xuyên qua được
const DOOR_PAIR = { [WDOOR]: WDOOR_O, [WDOOR_O]: WDOOR, [IDOOR]: IDOOR_O, [IDOOR_O]: IDOOR };
// item: vật phẩm trong túi | tile: ô khi đặt | hp/tool/minTier: độ bền và dụng cụ để phá
const BUILD = [
  { item: 'wwall',  tile: WWALL,  name: 'Tường gỗ',   desc: 'Xây tường nhà. Đặt bằng chuột trái, phá bằng rìu', hp: 12, tool: 'axe', minTier: 0, chip: '#8a5a2b' },
  { item: 'wblock', tile: WBLOCK, name: 'Khối gỗ',    desc: 'Khối gỗ đặc nguyên ô. Đặt bằng chuột trái, phá bằng rìu. Đặt lên nước hoặc dung nham để lấp', hp: 10, tool: 'axe', minTier: 0, chip: '#9a6a35' },
  { item: 'sblock', tile: SBLOCK, name: 'Khối đá',    desc: 'Khối đá đặc nguyên ô. Đặt bằng chuột trái, phá bằng cuốc. Đặt lên nước hoặc dung nham để lấp', hp: 20, tool: 'pickaxe', minTier: 1, chip: '#8a8f98' },
  { item: 'iblock', tile: IBLOCK, name: 'Khối sắt',   desc: 'Khối sắt đặc nguyên ô, rất cứng. Đặt bằng chuột trái, phá bằng cuốc đá. Đặt lên nước hoặc dung nham để lấp', hp: 50, tool: 'pickaxe', minTier: 2, chip: '#c9ced8' },
  { item: 'dblock', tile: DBLOCK, name: 'Khối kim cương', desc: 'Khối kim cương đặc nguyên ô, cứng nhất. Đặt bằng chuột trái, phá bằng cuốc sắt. Đặt lên nước hoặc dung nham để lấp', hp: 90, tool: 'pickaxe', minTier: 3, chip: '#4fe0ff' },
  { item: 'cblock', tile: CBLOCK, name: 'Khối than',  desc: 'Khối than đặc nguyên ô. Đặt bằng chuột trái, phá bằng cuốc. Cho vào lò nung làm nhiên liệu: cháy rất lâu', hp: 20, tool: 'pickaxe', minTier: 1, chip: '#2b2b30' },
  { item: 'iwall',  tile: IWALL,  name: 'Tường sắt',  desc: 'Tường rất cứng, zombie không phá được. Cần cuốc đá để phá', hp: 40, tool: 'pickaxe', minTier: 2, chip: '#9aa0ab' },
  { item: 'wdoor',  tile: WDOOR,  name: 'Cửa gỗ',     desc: 'Đặt vào tường. E mở / đóng, R xoay hướng', hp: 8, tool: 'axe', minTier: 0, chip: '#a8712f', open: WDOOR_O },
  { item: 'idoor',  tile: IDOOR,  name: 'Cửa sắt',    desc: 'Đặt vào tường. Nhấn E để mở / đóng. Cần cuốc đá để phá', hp: 30, tool: 'pickaxe', minTier: 2, chip: '#9aa0ab', open: IDOOR_O },
  { item: 'roof',   tile: ROOF,   name: 'Mái nhà',    desc: 'Lợp mái cho nhà. R để xoay hướng', hp: 8, tool: 'axe', minTier: 0, chip: '#a3402f' },
  { item: 'wfloor', tile: WFLOOR, name: 'Sàn gỗ',     desc: 'Lót sàn trong nhà', hp: 3, tool: 'axe', minTier: 0, chip: '#c28a46' },
  { item: 'carpet', tile: CARPET, name: 'Thảm',       desc: 'Trang trí sàn nhà', hp: 2, tool: 'axe', minTier: 0, chip: '#b03a3a' },
  { item: 'lamp',   tile: LAMP,   name: 'Đèn lồng',   desc: 'Toả sáng ban đêm', hp: 3, tool: 'axe', minTier: 0, chip: '#ffd34d' },
  { item: 'fence',  tile: FENCE,  name: 'Hàng rào',   desc: 'Rào ruộng để zombie không giẫm nát cây. R để xoay hướng', hp: 5, tool: 'axe', minTier: 0, chip: '#8a5a2b' },
  { item: 'pot',    tile: POT,    name: 'Chậu cây',   desc: 'Trang trí nhà', hp: 4, tool: 'axe', minTier: 0, chip: '#7a4a2b' },
];
// Các món xoay được (phím R): hướng 0-3 (mỗi bước xoay 90°), lưu trong `changes` dưới khoá 'r<x>,<y>'
const ROTATABLE = new Set([WDOOR, WDOOR_O, IDOOR, IDOOR_O, ROOF]);
let buildRot = 0; // hướng của món sắp đặt
const ROT_NAME = ['Bắc', 'Đông', 'Nam', 'Tây']; // hướng cao / hướng đỉnh mái / phía bản lề cửa
const BUILD_BY_ITEM = Object.fromEntries(BUILD.map((b) => [b.item, b]));
const REACH = 100; // tầm với (pixel)
const ROD_LIFE = BALANCE.lightning.rodLife; // số lần sét cột thu lôi chịu được

const TIER_NAME = ['tay không', 'gỗ', 'đá', 'sắt', 'vàng', 'kim cương'];
const MAX_TIER = 5;                       // cấp dụng cụ cao nhất (kim cương)
const TOOL_DMG = [1, 2, 4, 7, 8, 10];     // sát thương lên cây/đá theo cấp dụng cụ (tay không, gỗ, đá, sắt, vàng, kim cương)
const MINE_CD = [0.5, 0.4, 0.33, 0.27, 0.2, 0.25]; // vàng: vung nhanh nhất   // giây giữa 2 nhát chặt/đào: dụng cụ càng tốt càng nhanh
const TOOL_DUR = [0, 60, 140, 320, 90, 600];       // vàng giòn (90), kim cương bền (600)       // độ bền tối đa (số nhát) theo cấp; tay không không hỏng
// Sát thương lên zombie / động vật. Không cầm gì = 1; đánh bằng đúng món đang cầm.
const HAND_DMG = 1;
const BOSS_SWORD_BONUS = 3; // thưởng hạ boss: kiếm sắt +3 sát thương (vĩnh viễn)
let swordBonus = 0;
const WEAPON_DMG = {
  sword:   [0, 4, 6, 9, 7, 11],
  axe:     [0, 3, 4, 6, 5, 7],
  pickaxe: [0, 2, 3, 5, 4, 6],
  hoe:     [0, 1, 2, 3, 2, 4],
};
const SWING_CD = { hand: 0.45, sword: 0.38, axe: 0.5, pickaxe: 0.5, hoe: 0.4 }; // giây giữa 2 đòn đánh
const TOOL_LABEL = { axe: 'Rìu', pickaxe: 'Cuốc', hoe: 'Cuốc đất', sword: 'Kiếm' };
// Mỗi loại dụng cụ giữ được 2 món (vd kiếm sắt + kiếm kim cương): ô phụ có id thêm số 2, chọn riêng trên thanh nhanh
const TOOL_ALT = { axe2: 'axe', pickaxe2: 'pickaxe', hoe2: 'hoe', sword2: 'sword' };
const toolBase = (id) => TOOL_ALT[id] || id; // id gốc: 'sword2' -> 'sword'
for (const alt in TOOL_ALT) for (const tbl of [TOOL_LABEL, WEAPON_DMG, SWING_CD]) Object.defineProperty(tbl, alt, { value: tbl[TOOL_ALT[alt]], enumerable: false });

// hp: độ bền | tool/minTier: dụng cụ và cấp tối thiểu | drop: vật phẩm rơi | chip: màu mảnh vụn
const TILE_INFO = {
  [TREE]: { hp: 9,  tool: 'axe',     minTier: 0, drop: 'wood',  min: 2, max: 3, chip: '#6b4423', bonus: { item: 'apple', chance: 0.3 } },
  [ROCK]: { hp: 16, tool: 'pickaxe', minTier: 1, drop: 'stone', min: 1, max: 2, chip: '#9a9aa3' },
  [COAL]: { hp: 16, tool: 'pickaxe', minTier: 1, drop: 'coal',  min: 1, max: 2, chip: '#2b2b30' },
  [IRON]: { hp: 40, tool: 'pickaxe', minTier: 2, drop: 'ironore', min: 1, max: 2, chip: '#d08c68' },
  [GOLD]: { hp: 60, tool: 'pickaxe', minTier: 3, drop: 'goldore', min: 1, max: 1, chip: '#f2c14e' },
  [DIAMOND]: { hp: 90, tool: 'pickaxe', minTier: 3, drop: 'diamond', min: 1, max: 2, chip: '#4fe0ff' },
  [ROD]:  { hp: 3,  tool: 'pickaxe', minTier: 1, drop: 'rod',   min: 1, max: 1, chip: '#b8b8c4' },
  [TABLE]: { hp: 6, tool: 'axe',     minTier: 0, drop: 'table', min: 1, max: 1, chip: '#8a5a2b' },
  [FURNACE]: { hp: 10, tool: 'pickaxe', minTier: 1, drop: 'furnace', min: 1, max: 1, chip: '#8d8d95' },
  [BED]:  { hp: 6,  tool: 'axe',     minTier: 0, drop: 'bed',   min: 1, max: 1, chip: '#c0392b' },
  [STORE]: { hp: 8, tool: 'axe',     minTier: 0, drop: 'chestbox', min: 1, max: 1, chip: '#8a5a2b' },
};
for (const b of BUILD) {
  TILE_INFO[b.tile] = { hp: b.hp, tool: b.tool, minTier: b.minTier, drop: b.item, min: 1, max: 1, chip: b.chip };
  if (b.open) TILE_INFO[b.open] = TILE_INFO[b.tile];
}
TILE_INFO[MILL] = { hp: 10, tool: 'pickaxe', minTier: 1, drop: 'mill', min: 1, max: 1, chip: '#9a9aa3' };
TILE_INFO[OVEN] = { hp: 10, tool: 'pickaxe', minTier: 1, drop: 'oven', min: 1, max: 1, chip: '#8a4a38' };
TILE_INFO[DROD] = { hp: 30, tool: 'pickaxe', minTier: 1, drop: 'darkrod', min: 1, max: 1, chip: '#a26bff' };
TILE_INFO[FOSSIL] = { hp: 10, tool: 'pickaxe', minTier: 0, drop: 'dragonfossil', min: 1, max: 1, chip: '#e6d9b8' };
TILE_INFO[RADIO] = { hp: 6, tool: 'axe', minTier: 0, drop: 'radio', min: 1, max: 1, chip: '#c8642c' };
// Đá bazan nhọn ở đảo núi lửa (volcano.js): đập được bằng cuốc, rớt đá + 40% có lưu huỳnh
// Cây cháy trơ cành (volcano.js): chặt bằng rìu, rớt gỗ + 40% có than
TILE_INFO[VSNAG] = { hp: 8, tool: 'axe', minTier: 0, drop: 'wood', min: 1, max: 2, chip: '#2a211e', bonus: { item: 'coal', chance: 0.4 } };
TILE_INFO[VCRYS] = { hp: 10, tool: 'pickaxe', minTier: 0, drop: 'icecrystal', min: 1, max: 2, chip: '#8fd6ff' }; // cụm tinh thể băng trên đảo băng (volcano.js)
TILE_INFO[VROCK] = { hp: 24, tool: 'pickaxe', minTier: 1, drop: 'stone', min: 1, max: 1, chip: '#5a4838', bonus: { item: 'sulfur', chance: 0.4 } };

// ---------- Trồng trọt (kiểu Minecraft) ----------
// Cuốc đất cày ô cỏ thành ruộng (đôi khi bới ra hạt giống) -> cầm hạt giống bấm vào ruộng để gieo -> chờ lớn -> bấm để thu hoạch.
// Hình lấy trong plants.webp (nửa trái, đất nâu): mỗi cây 4 khung = mầm, đang lớn, chín, trơ cành (cho loại ra quả lại).
// sx, sy, sw, sh, step: khung đầu tiên và bước sang khung kế · st: số giây mỗi giai đoạn (chín sau 2×st) · regrow: giây để ra quả lại sau khi hái
// ico: hình nông sản cắt trong supplies.webp (không có thì vẽ tay) · wt: độ hay gặp khi bới cỏ ra hạt giống
const CROPS = {
  wheat:     { name: 'Lúa mì',  seed: 'Hạt lúa mì',  sx: 0,   sy: 354, sw: 32, sh: 27, step: 32, scale: 1.5, st: 26, min: 2, max: 3, food: 0,  wt: 4,   color: '#e0b43a', desc: 'Xếp 3 bó thành hàng ngang trong lưới chế tạo để làm bánh mì' },
  carrot:    { name: 'Cà rốt',  seed: 'Hạt cà rốt',  sx: 144, sy: 370, sw: 16, sh: 27, step: 16, scale: 2,   st: 24, min: 1, max: 3, food: 18, wt: 3,   color: '#f08a24' },
  bean:      { name: 'Đậu que', seed: 'Hạt đậu',     sx: 0,   sy: 172, sw: 32, sh: 34, step: 32, scale: 1.5, st: 38, regrow: 40, min: 2, max: 4, food: 12, wt: 2,   color: '#7cc243', ico: [0, 209, 15, 12] },
  chili:     { name: 'Ớt',      seed: 'Hạt ớt',      sx: 0,   sy: 92,  sw: 32, sh: 34, step: 32, scale: 1.5, st: 40, regrow: 45, min: 1, max: 3, food: 6,  wt: 2,   color: '#d62d20', ico: [191, 162, 18, 10] },
  cauli:     { name: 'Súp lơ',  seed: 'Hạt súp lơ',  sx: 0,   sy: 138, sw: 32, sh: 17, step: 32, scale: 1.5, st: 45, min: 1, max: 2, food: 15, wt: 1.6, color: '#e9e9e2', ico: [0, 192, 16, 14] },
  cucumber:  { name: 'Dưa leo', seed: 'Hạt dưa leo', sx: 0,   sy: 240, sw: 32, sh: 29, step: 32, scale: 1.5, st: 40, regrow: 42, min: 1, max: 3, food: 14, wt: 1.6, color: '#3f9a3a', ico: [95, 209, 18, 14] },
  pumpkin:   { name: 'Bí ngô',  seed: 'Hạt bí ngô',  sx: 0,   sy: 288, sw: 32, sh: 27, step: 32, scale: 1.5, st: 55, min: 1, max: 2, food: 28, wt: 1,   color: '#f2a321', ico: [84, 165, 22, 19] },
  pineapple: { name: 'Dứa',     seed: 'Hạt dứa',     sx: 0,   sy: 327, sw: 32, sh: 27, step: 32, scale: 1.5, st: 70, regrow: 80, min: 1, max: 2, food: 34, wt: 0.6, color: '#e6b422', ico: [240, 163, 16, 26] },
  rice:      { name: 'Lúa gạo', seed: 'Hạt lúa gạo', sx: 0,   sy: 354, sw: 32, sh: 27, step: 32, scale: 1.5, st: 30, min: 2, max: 3, food: 0,  wt: 3,   color: '#cfd68a', filter: 'hue-rotate(40deg) saturate(0.65) brightness(1.1)', desc: 'Xay ở máy xay thành bột gạo: làm bánh phở, bánh chưng. Cũng cho bò ăn được' },
  herb:      { name: 'Rau thơm', seed: 'Hạt rau thơm', sx: 0,  sy: 48,  sw: 32, sh: 44, step: 32, scale: 1.3, st: 28, regrow: 32, min: 2, max: 3, food: 0, wt: 2.2, color: '#4fae3f', desc: 'Rau thơm hành ngò, nấu phở cho thơm' },
  sunflower: { name: 'Hướng dương', seed: 'Hạt hướng dương', sx: 0, sy: 396, sw: 32, sh: 36, step: 32, scale: 1.5, st: 40, min: 1, max: 2, food: 10, wt: 1.2, color: '#f2b81c' },
  grape:     { name: 'Nho',     seed: 'Hạt nho',     sx: 0,   sy: 0,   sw: 32, sh: 46, step: 32, scale: 1.4, st: 48, regrow: 55, min: 2, max: 4, food: 16, wt: 0.8, color: '#7a3ea8' },
};

// Tưới cây: cây ướt lớn nhanh gấp WATER_MULT lần trong WET_TIME giây (tính theo đồng hồ trồng trọt, chạy cả đêm)
const WET_TIME = 60, WATER_MULT = 2.5;
const WATERCAN_USES = BALANCE.craft.watercanUses; // một bình tưới được tối đa từng này lần, hết thì hỏng, phải mua cái mới
let canUses = 0;
let bucketLava = false;   // xô đang đựng dung nham (múc ở dung nham dưới hầm, bấm vào đất để đổ)
let bucketWater = false;  // xô đang đựng nước (múc ở chỗ có nước, bấm vào đất để đổ)
const WET_REFILL = 20; // còn ít hơn từng này giây ẩm thì mới tưới lại được

// Mỗi thế giới mới có một seed riêng (cây, đá, làng, rương... khác nhau). Save cũ không có seed -> 0 (giữ nguyên bản đồ).
let worldSeed = 0;
function setSeed(v) {
  worldSeed = v | 0;
  villageCache.clear(); villageCenterCache.clear(); marketSiteCache.clear(); marketRegionCache.clear(); rawVillageCache.clear();
  swampCache.clear(); seaCache.clear(); seaRawCache.clear(); plantDeaths.clear(); bossSpotCache.clear(); bossPrimCache.clear(); bossDeaths.clear(); bossSaved.clear(); bossMud.length = 0; golemLairCache.clear(); golemHinted.clear(); golemFx.length = 0; golemRocks.length = 0;
  houseState.clear();
  resetElder();
  resetWitch();
  if (typeof resetGates === 'function') resetGates(); // khu Cổng Ma Vương (boss-gate.js)
  if (typeof resetVolcano === 'function') resetVolcano(); // đảo núi lửa (volcano.js)
  mmExplored = new Set(); mmPins = []; mmLastCell = null; mapStore[0] = mapStore[1] = mapStore[2] = null; mmDirty = true; mmVersion++; // bản đồ riêng của mỗi thế giới
}

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(worldSeed, 1597334677)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0), b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Ô đá: một phần là quặng. Sắt xuất hiện cách xa điểm xuất phát, vàng còn xa hơn.
function rockOrOre(x, y) {
  const o = hash(x - 77, y + 91);
  const far = Math.hypot(x, y);
  if (o < 0.012 && far > 25) return DIAMOND;
  if (o < 0.06 && far > 12) return GOLD;
  if (o < 0.22 && far > 5) return IRON;
  if (o < 0.40) return COAL;
  return ROCK;
}

// ---------- Tầng hầm mỏ ----------
let layer = 0; // 0 = mặt đất, 1 = hầm mỏ
// Tầng hầm theo khoảng cách tới điểm xuất phát: càng xa càng sâu, quặng thường càng hiếm, kim cương chỉ nhiều ở tầng cuối
const MINE_ZONES = BALANCE.mine.zones;
function mineZoneIndex(tx, ty) {
  const d = Math.hypot(tx, ty);
  let idx = 0;
  for (let i = 1; i < MINE_ZONES.length; i++) if (d >= MINE_ZONES[i].from) idx = i;
  return idx;
}

function mineTile(x, y) {
  if (Math.abs(x) <= 1 && Math.abs(y) <= 1) return GRASS;
  const lair = inGolemLair(x, y); // hang của Quái Vật Hầm Mỏ: sảnh tròn trống, có 4 cột đá để nấp
  if (lair) return lair === 2 ? ROCK : GRASS;
  const gt = gateTile(x, y); // phòng đá có Cổng Ma Vương nằm dưới hầm (boss-gate.js)
  if (gt !== undefined) return gt;
  const z = MINE_ZONES[mineZoneIndex(x, y)];
  const n = vnoise(x / 6 + 50, y / 6 - 30);
  const r = hash(x + 333, y - 777);
  if (n > 0.62 && r < 0.93) { // hang động; xa cửa hầm thì có hồ dung nham / nước ngầm
    if (Math.abs(x) + Math.abs(y) > 8) {
      if (z.lavaAbove < 1 && vnoise(x / 3 + 300, y / 3 - 300) > z.lavaAbove) return LAVA;
      if (z.waterAbove < 1 && vnoise(x / 3 - 400, y / 3 + 500) > z.waterAbove) return WATER;
    }
    return GRASS;
  }
  const o = hash(x - 77, y + 91);
  let c = z.diamond;
  if (o < c) return DIAMOND;
  if (o < (c += z.gold)) return GOLD;
  if (o < (c += z.iron)) return IRON;
  if (o < (c += z.coal)) return COAL;
  return ROCK;
}

// ---------- Làng (sinh ngẫu nhiên theo vùng 56×56 ô) ----------
const REG = 56;                 // kích thước một vùng (ô)
const VCHANCE = BALANCE.village.chance;           // xác suất một vùng có làng (giữ nguyên REG để vị trí làng còn lại không đổi)
const VW = 16, V_TOP = 17, V_BOT = 21; // làng rộng 2*VW+1 ô, từ cy-V_TOP tới cy+V_BOT
const VOBJ = 11;                // ô đặc của công trình trong làng (nhà, lều, giếng, Giang Thương)
const HWALL = 12;               // tường trong nhà (giường và bàn trong nhà dùng luôn ô BED / TABLE nên dùng và phá được như ngoài trời)
const HOUSE_CHEST_CHANCE = BALANCE.village.houseChestChance; // xác suất một căn nhà có rương
const HOUSE_CHEST_SPOTS = [{ x: 4, y: -1 }, { x: -4, y: -1 }, { x: 4, y: -3 }, { x: -4, y: -3 }]; // vị trí rương trong phòng 9×6
const VSCALE = 2;
const BUILD_KINDS = {
  house: [{ img: 'house1', w: 5, h: 3 }, { img: 'house2', w: 6, h: 3 }, { img: 'house4', w: 6, h: 3 }],
  tent:  [{ img: 'tent4', w: 3, h: 2 }],
};
const VIMG = {};
const VIMG_FILES = ['house1', 'house2', 'house4', 'tent1', 'tent2', 'tent3', 'tent4', 'well', 'lamp1', 'lamp2', 'lamp3', 'cart', 'logs', 'stump'];
function loadVillageSprites() {
  return Promise.all(VIMG_FILES.map((n) => loadImage('assets/village/' + n + '.webp').then((img) => { VIMG[n] = img; })));
}

// Giang Thương: trao đổi đồ (đưa món này, nhận món kia). Mỗi làng bán 6 món lấy ngẫu nhiên trong danh sách này.
const MARKET_POOL = [
  { give: { item: 'wood', n: 8 },       get: { item: 'potion', n: 1 } },
  { give: { item: 'stone', n: 6 },      get: { item: 'torch', n: 2 } },
  { give: { item: 'rawbeef', n: 2 },    get: { item: 'iron', n: 1 } },
  { give: { item: 'rawpork', n: 3 },    get: { item: 'potion', n: 1 } },
  { give: { item: 'rawchicken', n: 3 }, get: { item: 'baked', n: 1 } },
  { give: { item: 'iron', n: 4 },       get: { item: 'rod', n: 1 } },
  { give: { item: 'wood', n: 10 },      get: { item: 'bed', n: 1 } },
  { give: { item: 'gold', n: 1 },       get: { item: 'beef', n: 4 } },
  { give: { item: 'flesh', n: 4 },      get: { item: 'apple', n: 2 } },
  { give: { item: 'iron', n: 6 },       get: { tool: 'sword', tier: 3 } },
  { give: { item: 'coal', n: 5 },       get: { item: 'torch', n: 3 } },
  { give: { item: 'apple', n: 4 },      get: { item: 'iron', n: 1 } },
];

const villageCache = new Map();
// Trạng thái từng căn nhà (đồ đã phá, rương đã mở) để lần sau vào nhà vẫn y như cũ. Khoá: o.key
const houseState = new Map();
function hstate(o) {
  let st = houseState.get(o.key);
  if (!st) { st = { gone: new Set(), chestTaken: false, saved: null }; houseState.set(o.key, st); }
  return st;
}
function villageForRegion(rx, ry) {
  const key = (rx + 5000) * 10000 + (ry + 5000);
  if (villageCache.has(key)) return villageCache.get(key);
  const c = villageCenterForRegion(rx, ry);
  const v = c ? buildVillage(c.cx, c.cy) : null;
  villageCache.set(key, v);
  return v;
}

function buildVillage(cx, cy) {
  let k = 0;
  const rnd = () => { k++; return hash(cx * 31 + k * 7919, cy * 17 - k * 104729); };
  const v = {
    cx, cy, x0: cx - VW, x1: cx + VW, y0: cy - V_TOP, y1: cy + V_BOT,
    py0: cy - 1, py1: cy + 5,           // sân giữa làng (nền đất)
    objs: [], solid: new Map(), houses: [], stall: null, offers: [],
    spawned: false, lost: 0,            // lost: số dân làng đã bị zombie biến đổi
    trail: new Set(),                   // ô đường mòn nối nhà ngoài rìa với sân giữa làng
  };
  const add = (o) => {
    o.by = o.ty + o.h - 1;               // hàng ô thấp nhất (để xếp thứ tự vẽ)
    o.s = VSCALE;
    v.objs.push(o);
    if (o.solid) for (let y = o.ty; y < o.ty + o.h; y++) for (let x = o.tx; x < o.tx + o.w; x++) v.solid.set(x + ',' + y, o);
    return o;
  };
  // Bốn dãy nhà (2–4 căn mỗi dãy), nhà quay mặt về phía nam
  const row = (baseY, outer) => {
    const list = [];
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const arr = BUILD_KINDS[rnd() < 0.78 ? 'house' : 'tent'];
      list.push(arr[Math.floor(rnd() * arr.length)]);
    }
    const gap = 2;
    const width = () => list.reduce((sum, b) => sum + b.w, 0) + gap * (list.length - 1);
    while (width() > 2 * VW - 1 && list.length > 1) list.pop();
    let x = cx - Math.floor(width() / 2);
    for (const b of list) {
      const o = add({ img: b.img, tx: x, ty: baseY - (b.h - 1), w: b.w, h: b.h, solid: true, enter: true, hid: v.houses.length, outer });
      o.key = cx + ',' + cy + ':' + o.hid;
      // Dùng hash riêng (không dùng rnd) để không làm đổi bố cục làng của save cũ
      o.chest = hash(o.tx * 7 + 13, o.ty * 11 - 29) < HOUSE_CHEST_CHANCE
        ? HOUSE_CHEST_SPOTS[Math.floor(hash(o.tx * 5 - 3, o.ty * 3 + 17) * HOUSE_CHEST_SPOTS.length)]
        : null;
      v.houses.push(o);
      x += b.w + gap;
    }
  };
  row(cy - 10, true);
  row(cy - 2, false);   // sát sân giữa làng, không cần đường mòn
  row(cy + 11, true);
  row(cy + 19, true);
  v.stall = add({ img: 'tent1', tx: cx + 4, ty: cy + 3, w: 3, h: 2, solid: true, market: true });
  v.post = add({ img: null, tx: cx - 13, ty: cy + 2, w: 2, h: 2, solid: true, post: true }); // trụ Đội Chiến Binh (không dùng rnd nên bố cục làng cũ giữ nguyên)
  add({ img: 'well', tx: cx - 1, ty: cy + 1, w: 2, h: 1, solid: true });
  add({ img: 'lamp1', tx: cx - 6, ty: cy + 3, w: 1, h: 1, solid: false, light: true });
  add({ img: 'cart', tx: cx - 9, ty: cy + 5, w: 1, h: 1, solid: false });
  add({ img: 'logs', tx: cx + 12, ty: cy + 5, w: 1, h: 1, solid: false });
  add({ img: 'stump', tx: cx - 4, ty: cy + 4, w: 1, h: 1, solid: false });
  v.radio = add({ mk: 'vradio', img: null, tx: cx + EXERCISE.radio.tx, ty: cy + EXERCISE.radio.ty, w: 1, h: 1, solid: true, owner: v }); // radio có sẵn của làng (phát nhạc thể dục buổi sáng)
  const mSite = marketSiteFor(cx, cy); // biển chỉ đường tới chợ (không dùng rnd nên bố cục làng cũ giữ nguyên)
  if (mSite) {
    const east = mSite.mx >= cx;
    add({ mk: 'signpost', img: null, tx: east ? cx + 14 : cx - 15, ty: east ? cy + 3 : cy + 5, w: 1, h: 1, solid: true,
      angle: Math.atan2(mSite.my - cy, mSite.mx - cx), dist: MARKET_DIST });
  }
  v.offers = merchantOffers(MARKET_POOL.map((o) => [rnd(), o]).sort((p, q) => p[0] - q[0]).map((x) => x[1]), hash(cx + 7, cy + 3));
  carveTrails(v);
  markBlackHouse(v);
  return v;
}

// ---------- Chợ làng kiểu Việt Nam ----------
// Mỗi làng có một chợ cách tâm làng MARKET_DIST mét (1 mét = 1 ô = TILE pixel). Chợ họp ban ngày: sạp hàng,
// người bán đội nón lá rao hàng, người đi chợ dạo quanh. Tối chợ vãn, dọn sạp, treo đèn lồng đỏ.
// Chợ cũng là một "làng nhỏ" (villageAt trả về nó) nên nền, va chạm, bản đồ và giao dịch dùng chung với làng.
const MARKET_DIST = BALANCE.village.marketDist;                                  // khoảng cách làng -> chợ (mét, tính giữa hai tâm)
const MARKET_HW = 14, MARKET_TOP = 11, MARKET_BOT = 10;   // chợ rộng 2*MARKET_HW+1 ô, từ my-MARKET_TOP tới my+MARKET_BOT
const MARKET_SEARCH = Math.ceil((MARKET_DIST + MARKET_HW + 2) / REG) + 1; // số vùng cần dò quanh một điểm để tìm chợ
const MARKET_GAP = BALANCE.village.marketGap;               // hai chợ cách nhau tối thiểu (ô)
const MARKET_START_CLEAR = 45;                            // chợ không đè lên khu xuất phát (ô)

// loại sạp: biển hiệu, màu mái bạt, câu rao
const MARKET_STALLS = {
  rau:     { sign: 'RAU CỦ',    colors: ['#2e8b4a', '#f2f2e6'], calls: ['Rau muống mới hái đây!', 'Mua rau đi em, tươi lắm!'] },
  traicay: { sign: 'TRÁI CÂY',  colors: ['#e8782a', '#f6e6c8'], calls: ['Cam sành ngọt lịm đây!', 'Xoài chín, mua đi em!'] },
  ca:      { sign: 'CÁ TƯƠI',   colors: ['#2f6fb5', '#e8f1fa'], calls: ['Cá tươi roi rói đây!', 'Cá lóc đồng, ai mua không?'] },
  thit:    { sign: 'THỊT HEO',  colors: ['#c0392b', '#f6e4e0'], calls: ['Thịt ba chỉ mới mổ đây!', 'Mua nhiều tôi bớt cho!'] },
  banh:    { sign: 'BÁNH CHƯNG', colors: ['#d4a017', '#fff3c4'], calls: ['Bánh chưng, bánh giò nóng đây!', 'Xôi nóng, bánh nóng đây!'] },
  non:     { sign: 'NÓN LÁ',    colors: ['#b8864b', '#f1e0b8'], calls: ['Nón lá Huế đây, bền lắm!', 'Nón lá che mưa che nắng!'] },
  vai:     { sign: 'VẢI VÓC',   colors: ['#8e44ad', '#f3e6f8'], calls: ['Vải đẹp giá mềm đây!', 'Mua vải may áo dài không em?'] },
  pho:     { sign: 'PHỞ · BÚN', colors: ['#c0392b', '#f6e6c8'], calls: ['Phở nóng hổi đây!', 'Ăn tô phở không em?'] },
  taphoa:  { sign: 'TẠP HOÁ',   colors: ['#a3202a', '#f4d03f'], calls: ['Mắm muối dầu ăn đủ cả!', 'Đổi đồ ở đây, tôi bớt cho!'], trade: true },
};
const MARKET_KIND_POOL = ['rau', 'traicay', 'ca', 'thit', 'banh', 'non', 'vai', 'rau', 'traicay']; // 9 sạp thường (mỗi chợ xáo thứ tự)
const MARKET_SELLER_KINDS = ['woman', 'oldwoman', 'woman', 'man', 'oldwoman', 'woman', 'man'];
const MARKET_GREET = ['Mua gì không em?', 'Vào xem hàng đi bạn ơi!', 'Chợ sáng nay đông vui lắm!', 'Mua đi, rẻ lắm!'];
const MARKET_CHAT = [
  'Chợ làng họp từ sáng sớm tới chiều.',
  'Trả giá thế này là tôi lỗ vốn đó nha!',
  'Mua nhiều tôi bớt cho, đừng ngại!',
  'Tối đến chợ vãn, ai về nhà nấy.',
  'Cứ ghé sạp Tạp Hoá mà đổi đồ nhé.',
  'Hàng ở đây tươi mới mỗi sáng.',
];

// Tâm làng của một vùng (chỉ tính toạ độ, chưa dựng làng) hoặc null
// Hai làng ở hai vùng kề nhau có thể bị xếp sát nhau (chỉ cách 2-4 ô): làng nào "thua" (độ ưu tiên thấp hơn) trong cặp bị bỏ đi,
// nên các làng còn lại luôn cách nhau ít nhất VILLAGE_GAP ô. Chỉ so tâm gốc của vùng kề nên không có chuỗi phụ thuộc.
const VILLAGE_GAP = BALANCE.village.minGap;
// Điểm (x, y) và 8 điểm quanh nó (cách ox, oy ô) có nằm trong vùng trũng của biển không (chỉ xét nhiễu, không phụ thuộc làng / chợ).
// Làng, chợ, Cây Cổ Thụ, nhà Phù Thủy đều chỉ đặt ở nơi KHÔNG trũng biển -> không còn đảo nhỏ chỉ chứa mỗi làng / chợ, biển cũng không bị cắt vuông vức
function seaBasin(x, y, ox, oy) {
  const T = SEA_T + 0.05;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (seaNoise(x + i * ox, y + j * oy) < T || volcNear(x + i * ox, y + j * oy)) return true; // volcNear: vùng biển + đảo núi lửa (volcano.js)
  return false;
}
const rawVillageCache = new Map();
function rawVillageCenter(rx, ry) {
  const key = (rx + 5000) * 10000 + (ry + 5000);
  if (rawVillageCache.has(key)) return rawVillageCache.get(key);
  let c = null;
  if (hash(rx * 53 + 11, ry * 97 - 7) < VCHANCE) {
    const cx = rx * REG + 17 + Math.floor(hash(rx + 400, ry - 300) * 22);
    const cy = ry * REG + 18 + Math.floor(hash(rx - 250, ry + 600) * 17);
    if (Math.hypot(cx, cy) > 30 && !seaBasin(cx, cy, VW + 2, V_TOP + 2)) c = { cx, cy, pr: hash(rx * 71 + 3, ry * 43 + 9), rx, ry }; // không xây sát điểm xuất phát
  }
  rawVillageCache.set(key, c);
  return c;
}
function villagesTooClose(a, b) {
  const gx = Math.max(a.cx - VW - (b.cx + VW), b.cx - VW - (a.cx + VW));
  const gy = Math.max(a.cy - V_TOP - (b.cy + V_BOT), b.cy - V_TOP - (a.cy + V_BOT));
  return Math.max(gx, gy) < VILLAGE_GAP;
}
const villageCenterCache = new Map();
function villageCenterForRegion(rx, ry) {
  const key = (rx + 5000) * 10000 + (ry + 5000);
  if (villageCenterCache.has(key)) return villageCenterCache.get(key);
  let c = rawVillageCenter(rx, ry);
  if (c) {
    for (let j = -1; j <= 1 && c; j++) {
      for (let i = -1; i <= 1; i++) {
        if (!i && !j) continue;
        const o = rawVillageCenter(rx + i, ry + j);
        if (o && villagesTooClose(c, o) && (o.pr > c.pr || (o.pr === c.pr && (o.rx > c.rx || (o.rx === c.rx && o.ry > c.ry))))) { c = null; break; }
      }
    }
  }
  villageCenterCache.set(key, c);
  return c;
}

// Chỗ đặt chợ (mx, my) của làng (cx, cy) có trống không: không đè khu xuất phát, không chạm làng nào,
// không chồng lên chỗ chợ ưu tiên của làng khác (hai làng tranh nhau thì cả hai xoay sang hướng khác)
function marketSiteFree(mx, my, cx, cy) {
  if (Math.hypot(mx, my) < MARKET_START_CLEAR) return false;
  if (seaBasin(mx, my, MARKET_HW + 2, MARKET_TOP + 2)) return false; // không đặt chợ dưới biển / sát bờ
  const pad = 4;
  const r0x = Math.floor((mx - MARKET_HW - VW - pad) / REG), r1x = Math.floor((mx + MARKET_HW + VW + pad) / REG);
  const r0y = Math.floor((my - MARKET_TOP - V_BOT - pad) / REG), r1y = Math.floor((my + MARKET_BOT + V_TOP + pad) / REG);
  for (let ry = r0y; ry <= r1y; ry++) {
    for (let rx = r0x; rx <= r1x; rx++) {
      const c = villageCenterForRegion(rx, ry);
      if (!c) continue;
      const overlapX = c.cx - VW <= mx + MARKET_HW + pad && c.cx + VW >= mx - MARKET_HW - pad;
      const overlapY = c.cy - V_TOP <= my + MARKET_BOT + pad && c.cy + V_BOT >= my - MARKET_TOP - pad;
      if (overlapX && overlapY) return false;
    }
  }
  // chợ của các làng khác: chỉ xét chợ THỰC của làng có độ ưu tiên cao hơn (đã chốt trước); làng thấp hơn sẽ tự né chợ này.
  // Nhờ vậy hai chợ không bao giờ chồng lên nhau và cũng không có đệ quy vô hạn (độ ưu tiên giảm dần).
  const R = Math.ceil((MARKET_DIST + MARKET_GAP + 2 * MARKET_HW + pad) / REG);
  const rcx = Math.floor(mx / REG), rcy = Math.floor(my / REG);
  const me = { cx, cy, pr: marketPriority(cx, cy) };
  for (let ry = rcy - R; ry <= rcy + R; ry++) {
    for (let rx = rcx - R; rx <= rcx + R; rx++) {
      const c = villageCenterForRegion(rx, ry);
      if (!c || (c.cx === cx && c.cy === cy)) continue;
      const pr = marketPriority(c.cx, c.cy);
      if (pr < me.pr || (pr === me.pr && (c.cx < cx || (c.cx === cx && c.cy < cy)))) continue; // làng này thấp hơn: nó né mình
      const o = marketSiteFor(c.cx, c.cy);
      if (o && Math.max(Math.abs(o.mx - mx), Math.abs(o.my - my)) < MARKET_GAP) return false; // hai chợ phải cách nhau ít nhất MARKET_GAP ô
    }
  }
  return true;
}

function marketPriority(cx, cy) { return hash(cx * 19 + 7, cy * 23 - 11); }

// Chỗ chợ ưu tiên của làng (cx, cy): hướng ngẫu nhiên theo làng, cách đúng MARKET_DIST mét
function marketFirstChoice(cx, cy, k = 0) {
  const a = hash(cx * 13 + 5, cy * 29 - 3) * Math.PI * 2 + k * Math.PI / 4;
  return { mx: Math.round(cx + Math.cos(a) * MARKET_DIST), my: Math.round(cy + Math.sin(a) * MARKET_DIST) };
}

// Vị trí chợ của làng (cx, cy): cách tâm làng đúng MARKET_DIST, hướng ngẫu nhiên theo làng; vướng thì xoay 45°
const marketSiteCache = new Map();
function marketSiteFor(cx, cy) {
  const key = cx + ',' + cy;
  if (marketSiteCache.has(key)) return marketSiteCache.get(key);
  let site = null;
  for (let k = 0; k < 8 && !site; k++) {
    const { mx, my } = marketFirstChoice(cx, cy, k);
    if (marketSiteFree(mx, my, cx, cy)) site = { mx, my, vcx: cx, vcy: cy, v: null };
  }
  marketSiteCache.set(key, site);
  return site;
}

// Các chợ có phần nằm trong vùng (rx, ry)
const marketRegionCache = new Map();
function marketsForRegion(rx, ry) {
  const key = (rx + 5000) * 10000 + (ry + 5000);
  let list = marketRegionCache.get(key);
  if (list) return list;
  list = [];
  for (let j = -MARKET_SEARCH; j <= MARKET_SEARCH; j++) {
    for (let i = -MARKET_SEARCH; i <= MARKET_SEARCH; i++) {
      const c = villageCenterForRegion(rx + i, ry + j);
      const m = c && marketSiteFor(c.cx, c.cy);
      if (!m) continue;
      if (m.mx + MARKET_HW >= rx * REG && m.mx - MARKET_HW < (rx + 1) * REG && m.my + MARKET_BOT >= ry * REG && m.my - MARKET_TOP < (ry + 1) * REG) list.push(m);
    }
  }
  marketRegionCache.set(key, list);
  return list;
}

function marketOf(site) {
  if (!site.v) site.v = buildMarket(site);
  return site.v;
}

function buildMarket(site) {
  const { mx, my } = site;
  let k = 0;
  const rnd = () => { k++; return hash(mx * 37 + k * 6151, my * 23 - k * 92821); };
  const v = {
    isMarket: true, title: 'Chợ làng', cx: mx, cy: my,
    x0: mx - MARKET_HW, x1: mx + MARKET_HW, y0: my - MARKET_TOP, y1: my + MARKET_BOT,
    py0: my - MARKET_TOP + 1, py1: my + MARKET_BOT - 1,
    objs: [], solid: new Map(), houses: [], stall: null, post: null, offers: [],
    spawned: false, lost: 0, trail: new Set(),
    shops: [],      // các sạp có người bán
    roam: [         // khu người đi chợ dạo (ô): lối giữa hai dãy sạp, sảnh phía nam, sân phía dưới
      { x0: mx - 12, x1: mx + 11, y0: my - 6, y1: my - 4 },
      { x0: mx - 12, x1: mx + 11, y0: my - 1, y1: my + 2 },
      { x0: mx - 6, x1: mx + 5, y0: my + 3, y1: my + 8 },
    ],
  };
  const add = (o) => {
    o.by = o.ty + o.h - 1;               // hàng ô thấp nhất (để xếp thứ tự vẽ)
    o.s = VSCALE;
    v.objs.push(o);
    if (o.solid) for (let y = o.ty; y < o.ty + o.h; y++) for (let x = o.tx; x < o.tx + o.w; x++) v.solid.set(x + ',' + y, o);
    return o;
  };
  const addStall = (kind, tx, ty) => {
    const o = add({ mk: 'stall', kind, tx, ty, w: 4, h: 1, solid: true, light: true });
    v.shops.push(o);
    if (MARKET_STALLS[kind].trade) { o.market = true; v.stall = o; }
    return o;
  };

  // Hai dãy sạp (5 sạp mỗi dãy): dãy trên và dãy giữa; sạp Tạp Hoá (đổi đồ) nằm giữa dãy giữa
  const kinds = MARKET_KIND_POOL.map((kd) => [rnd(), kd]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  for (let i = 0; i < 5; i++) addStall(kinds[i], mx - 12 + i * 5, my - 7);
  for (let i = 0; i < 5; i++) addStall(i === 2 ? 'taphoa' : kinds[5 + (i > 2 ? i - 1 : i)], mx - 12 + i * 5, my - 2);
  // Quán phở góc dưới trái, hai bộ bàn nhựa + ghế nhựa thấp đặt phía trước
  addStall('pho', mx - 12, my + 4);
  add({ mk: 'table', tx: mx - 12, ty: my + 6, w: 2, h: 1, solid: true });
  add({ mk: 'table', tx: mx - 10, ty: my + 6, w: 2, h: 1, solid: true });
  // Bãi xe máy, cây đa
  for (let i = 0; i < 3; i++) add({ mk: 'bike', tx: mx + 6 + i * 2, ty: my + 5, w: 2, h: 1, solid: true, variant: Math.floor(rnd() * 4), flip: i % 2 === 1 });
  add({ mk: 'banyan', tx: mx + 12, ty: my + 1, w: 1, h: 1, solid: true });
  // Cổng chợ phía nam: hai cột đặc, mái và biển vẽ chung một vật thể
  add({ mk: 'gate', tx: mx - 3, ty: my + 9, w: 7, h: 1, solid: false });
  add({ mk: 'none', tx: mx - 3, ty: my + 9, w: 1, h: 1, solid: true, light: true });
  add({ mk: 'none', tx: mx + 3, ty: my + 9, w: 1, h: 1, solid: true, light: true });
  // Gánh hàng và thúng rổ bày dưới đất
  add({ mk: 'yoke', tx: mx - 5, ty: my + 3, w: 2, h: 1, solid: true });
  add({ mk: 'yoke', tx: mx + 4, ty: my + 1, w: 2, h: 1, solid: true });
  const produce = ['#3fa34d', '#e8782a', '#d4a017', '#c0392b'];
  [[-6, -4], [5, -5], [-1, 2], [4, 8], [-6, 8]].forEach(([dx, dy]) => add({ mk: 'basket', tx: mx + dx, ty: my + dy, w: 1, h: 1, solid: true, color: produce[Math.floor(rnd() * produce.length)] }));

  v.offers = merchantOffers(MARKET_POOL.map((o) => [rnd(), o]).sort((p, q) => p[0] - q[0]).map((x) => x[1]), hash(mx + 7, my + 3));
  // Thùng đồ ăn (Supplies): chồng ở khe giữa các sạp, đống thùng ở rìa chợ
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 4; i++) {
      add({ mk: 'crate', tx: mx - 12 + i * 5 + 4, ty: row === 0 ? my - 7 : my - 2, w: 1, h: 1, solid: true, c: Math.floor(rnd() * 9), c2: Math.floor(rnd() * 9), stack: rnd() < 0.65 ? 2 : 1 });
    }
  }
  add({ mk: 'pile', tx: mx + 13, ty: my - 5, w: 2, h: 1, solid: true, p: 0 });
  add({ mk: 'pile', tx: mx - 14, ty: my - 3, w: 2, h: 1, solid: true, p: 1 });
  add({ mk: 'pile', tx: mx + 13, ty: my + 4, w: 2, h: 1, solid: true, p: 2 });
  return v;
}

// Dân trong chợ: mỗi sạp một người bán (đội nón lá), cộng thêm người đi chợ dạo
function spawnMarketPeople(v) {
  v.spawned = true;
  activeVillages.add(v);
  const night = villageNight();
  const base = { v, state: 'idle', t: 1, face: 1, animT: Math.random() * 3, say: null, greeted: false, inside: night, stuckT: 0 };
  v.shops.forEach((shop, i) => {
    const kind = MARKET_STALLS[shop.kind].trade ? 'oldman' : MARKET_SELLER_KINDS[Math.floor(hash(v.cx + i * 17, v.cy - i * 5) * MARKET_SELLER_KINDS.length)];
    const x = (shop.tx + shop.w / 2) * TILE, y = shop.ty * TILE - 14; // đứng sau quầy (hàng ô phía trên quầy)
    villagers.push({ ...base, kind, hat: true, seller: true, stay: true, merchant: Boolean(MARKET_STALLS[shop.kind].trade), shop, home: shop,
      x, y, tx: x, ty: y, sx: x, sy: y, callT: 2 + Math.random() * 6, face: i % 2 ? -1 : 1 });
  });
  const walkers = 8;
  for (let i = 0; i < walkers; i++) {
    const kind = VKINDS[Math.floor(hash(v.cx - i * 19, v.cy + i * 23) * VKINDS.length)];
    const r = v.roam[i % v.roam.length];
    let c = tileCenter(r.x0 + Math.floor(hash(v.cx + i * 3, v.cy - i * 7) * (r.x1 - r.x0 + 1)), r.y0 + Math.floor(hash(v.cx - i * 11, v.cy + i * 13) * (r.y1 - r.y0 + 1)));
    if (collides(c.x, c.y, 10)) c = tileCenter(v.cx, v.cy + 3);
    const kid = kind === 'boy' || kind === 'girl';
    villagers.push({ ...base, kind, hat: !kid && hash(v.cx + i, v.cy - i) < 0.7, home: v.shops[i % v.shops.length],
      x: c.x, y: c.y, tx: c.x, ty: c.y, t: Math.random() * 2 });
  }
}

// Điểm đi dạo tiếp theo của một dân làng / người đi chợ
function wanderTarget(v) {
  if (v.roam) {
    const r = v.roam[Math.floor(Math.random() * v.roam.length)];
    return { x: (r.x0 + Math.random() * (r.x1 - r.x0 + 1)) * TILE, y: (r.y0 + Math.random() * (r.y1 - r.y0 + 1)) * TILE };
  }
  let t;
  for (let i = 0; i < 8; i++) { // đang tập thể dục thì dân làng đi dạo tránh đội hình
    t = { x: (v.cx - 9 + Math.random() * 18) * TILE, y: (v.cy - 0.5 + Math.random() * 5.5) * TILE };
    if (!v.exercise || !inExerciseArea(v, t.x / TILE, t.y / TILE)) break;
  }
  return t;
}

// Đường mòn: từ cửa mỗi nhà ngoài rìa đi về sân giữa làng.
// Dijkstra có phạt khi rẽ hướng để đường đi thẳng (ít bậc thang), tránh mọi vật đặc.
function carveTrails(v) {
  const W = v.x1 - v.x0 + 1, H = v.y1 - v.y0 + 1;
  const TURN = 1.5;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const inside = (x, y) => x > v.x0 && x < v.x1 && y >= v.y0 && y <= v.y1;
  const free = (x, y) => inside(x, y) && !v.solid.has(x + ',' + y);
  const id = (x, y, d) => ((y - v.y0) * W + (x - v.x0)) * 4 + d;
  const dist = new Float32Array(W * H * 4).fill(Infinity);
  const prev = new Int32Array(W * H * 4).fill(-1);
  const open = [];
  const push = (x, y, d, c, from) => {
    const i = id(x, y, d);
    if (c >= dist[i]) return;
    dist[i] = c; prev[i] = from;
    open.push({ x, y, d, c });
  };
  // Nguồn: mọi ô trống thuộc sân giữa làng
  for (let y = v.py0; y <= v.py1; y++) for (let x = v.x0 + 1; x < v.x1; x++) if (free(x, y)) for (let d = 0; d < 4; d++) push(x, y, d, 0, -1);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].c < open[bi].c) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.c > dist[id(cur.x, cur.y, cur.d)]) continue;
    for (let nd = 0; nd < 4; nd++) {
      const nx = cur.x + DIRS[nd][0], ny = cur.y + DIRS[nd][1];
      if (free(nx, ny)) push(nx, ny, nd, cur.c + 1 + (nd === cur.d ? 0 : TURN), id(cur.x, cur.y, cur.d));
    }
  }
  for (const o of v.houses) {
    if (!o.outer) continue;
    const dx = Math.floor(o.tx + o.w / 2), dy = o.ty + o.h; // ô ngay trước cửa
    if (!free(dx, dy)) continue;
    let best = -1;
    for (let d = 0; d < 4; d++) if (best < 0 || dist[id(dx, dy, d)] < dist[best]) best = id(dx, dy, d);
    for (let i = best; i >= 0 && dist[i] < Infinity; i = prev[i]) {
      const cell = Math.floor(i / 4);
      const x = cell % W + v.x0, y = Math.floor(cell / W) + v.y0;
      if (y >= v.py0 && y <= v.py1) break; // tới sân giữa làng thì dừng
      v.trail.add(x + ',' + y);
    }
  }
}

// Làng chứa ô (x, y), hoặc null
function villageAt(x, y) {
  const rx = Math.floor(x / REG), ry = Math.floor(y / REG);
  const v = villageForRegion(rx, ry);
  if (v && x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1) return v;
  for (const m of marketsForRegion(rx, ry)) { // chợ cũng là một "làng nhỏ"
    if (x >= m.mx - MARKET_HW && x <= m.mx + MARKET_HW && y >= m.my - MARKET_TOP && y <= m.my + MARKET_BOT) return marketOf(m);
  }
  return null;
}

// Mọi vật thể làng có thể nằm trong khung hình
function villageObjsInView(tx0, ty0, tx1, ty1) {
  const out = [];
  if (layer !== 0) return out;
  const seenMarkets = new Set(); // một chợ trải qua nhiều vùng: chỉ lấy một lần
  for (let ry = Math.floor((ty0 - 8) / REG); ry <= Math.floor((ty1 + 14) / REG); ry++) {
    for (let rx = Math.floor((tx0 - 14) / REG); rx <= Math.floor((tx1 + 14) / REG); rx++) {
      const v = villageForRegion(rx, ry);
      if (v) for (const o of v.objs) out.push(o);
      for (const m of marketsForRegion(rx, ry)) {
        if (seenMarkets.has(m)) continue;
        seenMarkets.add(m);
        for (const o of marketOf(m).objs) out.push(o);
      }
    }
  }
  return out;
}
let lastVObjs = [];

// ---------- Bên trong nhà (tầng 2): phòng 9×6, cửa ra ở dưới ----------
let houseCur = null;   // { obj, bedTiles }
let houseRet = null;   // chỗ đứng ngoài cửa để quay ra

function houseTile(x, y) {
  if (x >= -4 && x <= 4 && y >= -4 && y <= 1) {
    if (houseCur) for (const b of houseCur.bedTiles) if (b.x === x && b.y === y) return BED;
    if (houseCur && houseCur.witchHouse && witchInterior && WITCH_SOLID.has(x + ',' + y)) return HWALL;
    if (houseCur && houseCur.blackMarket && blackInterior && BM_SOLID.has(x + ',' + y)) return HWALL;
    if (x === 0 && y === -4 && !(houseCur && houseCur.witchHouse)) return TABLE;
    return GRASS;
  }
  if (x === 0 && y === 2) return GRASS; // lối ra
  return HWALL;
}

function doorPos(o) {
  return { x: (o.tx + o.w / 2) * TILE, y: (o.ty + o.h) * TILE + 16 };
}

function nearestHouseDoor(maxDist) {
  if (layer !== 0) return null;
  const v = villageAt(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
  if (!v) return null;
  let best = null, bd = maxDist;
  for (const o of v.houses) {
    const d = doorPos(o);
    const dd = Math.hypot(d.x - player.x, d.y - player.y);
    if (dd < bd) { bd = dd; best = o; }
  }
  return best;
}

// Cất đồ người chơi đã đặt trong nhà (ô, lò, rương gỗ) để lần sau vào vẫn còn. Không giới hạn số lượng.
function stashHouse() {
  if (layer !== 2 || !houseCur) return;
  const hs = hstate(houseCur.obj);
  hs.saved = {
    changes: new Map(changes),
    rodLife: new Map(rodLife),
    furnaces: new Map([...furnaces].map(([k, v]) => [k, { ...v }])),
    storages: new Map([...storages].map(([k, v]) => [k, { slots: v.slots.map((x) => (x ? { ...x } : x)) }])),
  };
}

// Lối ra (0,1)-(0,2) không được đặt đồ chặn lại
function houseExitBlocked(tx, ty) {
  return layer === 2 && tx === 0 && ty >= 1;
}

function enterHouse(o) {
  const d = doorPos(o);
  houseRet = { x: d.x, y: d.y + 18 };
  houseCur = { obj: o, bedTiles: o.w >= 5 ? [{ x: -3, y: -4 }, { x: 3, y: -4 }] : [{ x: -3, y: -4 }] };
  layerStore[2] = null; // mỗi lần vào là một căn phòng mới
  switchLayer(2);
  const hs = hstate(o);
  hs.gone.forEach((k) => changes.set(k, GRASS)); // đồ đã phá từ lần trước vẫn mất
  if (hs.saved) { // đồ người chơi đã đặt từ lần trước
    hs.saved.changes.forEach((v, k) => changes.set(k, v));
    hs.saved.rodLife.forEach((v, k) => rodLife.set(k, v));
    hs.saved.furnaces.forEach((v, k) => furnaces.set(k, { ...v }));
    hs.saved.storages.forEach((v, k) => storages.set(k, { slots: v.slots.map((x) => (x ? { ...x } : x)) }));
  }
  if (o.chest && !hs.chestTaken) chests.push({ tx: o.chest.x, ty: o.chest.y, t: Math.random() * 6, rare: false, house: o });
  const c = tileCenter(0, 1);
  player.x = c.x;
  player.y = c.y;
  player.faceX = 0; player.faceY = -1;
  player.invuln = Math.max(player.invuln, 1);
  say('Bạn đã vào nhà');
}

// ---------- Nhà Phù Thủy: nhấn E ở ngoài để vào, bên trong nói chuyện với ông phù thủy (E) để học phép ----------
const WIZARD_TILE = { x: 0, y: -2 };
const WIZARD_FRAMES = 8;
let wizardAnim = null;
let witchInterior = null; // ảnh nội thất Nhà Phù Thủy (assets/wizard/witch_interior.webp)
// Vùng ảnh phủ lên phòng (toạ độ thế giới, px) — sàn 9×6 ô (x -4..4, y -4..1), cửa ở ô (0,2)
const WITCH_ROOM_IMG = { x: -220.4, y: -199, w: 488, h: 345.2 };
// Ô bị đồ nội thất chiếm (không đi xuyên qua được): giá sách, bàn, ghế, bục, chậu cây...
const WITCH_SOLID = new Set([
  ...[-4, -3, -2, -1, 0, 1, 2, 3, 4].flatMap((x) => [x + ',-4', x + ',-3', x + ',-2']), // tường sau, kệ sách, quầy sau lưng ông phù thủy
  '-4,-1', '-3,-1', '-2,-1', '2,-1', '3,-1', '4,-1',   // ghế, bàn tròn / bục sách, ghế đẩu, chồng sách
  '-4,0', '-3,0', '-2,0', '2,0', '3,0', '4,0',         // chậu cây, kệ thấp, cầu pha lê / bàn làm việc
  '-4,1', '-3,1', '-2,1', '4,1',                       // kệ thấp, bục cầu, chậu cây
]);
function loadWizardSprite() {
  return Promise.all([
    loadImage('assets/wizard/wizard_anim.webp').then((img) => { wizardAnim = img; }),
    loadImage('assets/wizard/witch_interior.webp').then((img) => { witchInterior = img; }),
  ]);
}

function enterWitchHouse(w) {
  houseRet = { x: (w.tx + 0.5) * TILE, y: (w.ty + 2.5) * TILE };
  houseCur = { obj: { key: 'witch:' + w.key, witch: w }, bedTiles: [], witchHouse: true };
  layerStore[2] = null;
  switchLayer(2);
  const c = tileCenter(0, 1);
  player.x = c.x; player.y = c.y;
  player.faceX = 0; player.faceY = -1;
  player.invuln = Math.max(player.invuln, 1);
  say('Bạn bước vào Nhà Phù Thủy');
}
function nearWizard(maxDist) {
  if (layer !== 2 || !houseCur || !houseCur.witchHouse) return false;
  const c = tileCenter(WIZARD_TILE.x, WIZARD_TILE.y);
  return Math.hypot(c.x - player.x, c.y - player.y) < maxDist;
}
// Vùng ông phù thủy trên màn hình (px) — dùng để bấm chuột vào ông mở bảng chọn hệ phép
function wizardScreenRect() {
  if (layer === 2 && houseCur && houseCur.elderRoom) return window.Dwarf ? Dwarf.npcRect() : null;
  if (layer !== 2 || !houseCur || !houseCur.witchHouse || !wizardAnim) return null;
  const camX = Math.floor(player.x - canvas.width / 2), camY = Math.floor(player.y - canvas.height / 2);
  const fw = wizardAnim.width / WIZARD_FRAMES, ih = wizardAnim.height;
  const dh = Math.round(2.1 * TILE), dw = Math.round(dh * fw / ih);
  const c = tileCenter(WIZARD_TILE.x, WIZARD_TILE.y);
  return { x: c.x - camX - dw / 2, y: c.y - camY + 18 - dh, w: dw, h: dh };
}
function clickWizard() { // bấm chuột vào ông phù thủy: lần đầu nhận Sách Phép, sau đó mở bảng chọn hệ
  const r = wizardScreenRect();
  if (!r || !inRect(mouse, r)) return false;
  if (!nearWizard(4 * TILE)) { say('Quá xa'); return true; }
  openWizard();
  return true;
}
function openWizard() { // E / bấm vào ông phù thủy: lần đầu nhận Sách Phép, sau đó mở bảng chọn hệ → bảng mua phép
  if (houseCur && houseCur.elderRoom) { if (window.Dwarf) Dwarf.open(); return; } // phòng Cây Cổ Thụ: NPC là Chú Lùn
  talkWitch();
}
function drawWitchRug(camX, camY) { // thảm tím giữa phòng
  const x = -2 * TILE - camX, y = -3 * TILE - camY, w = 5 * TILE, h = 4 * TILE;
  ctx.fillStyle = '#3b2166'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#6b3fa0'; ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
  ctx.strokeStyle = '#e0b84a'; ctx.lineWidth = 2; ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);
}
function drawWizard(ty, camX, camY) {
  if (ty !== WIZARD_TILE.y) return;
  if (houseCur && houseCur.elderRoom) { if (window.Dwarf) Dwarf.drawNpc(camX, camY); return; }
  if (!wizardAnim) return;
  const fw = wizardAnim.width / WIZARD_FRAMES, ih = wizardAnim.height;
  const dh = Math.round(2.1 * TILE), dw = Math.round(dh * fw / ih);
  const c = tileCenter(WIZARD_TILE.x, WIZARD_TILE.y);
  const f = Math.floor(performance.now() / 1000 * 5) % WIZARD_FRAMES;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(c.x - camX, c.y - camY + 14, dw * 0.35, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(wizardAnim, f * fw, 0, fw, ih, Math.round(c.x - camX - dw / 2), Math.round(c.y - camY + 18 - dh), dw, dh);
}

function nearHouseExit(maxDist) {
  if (layer !== 2) return false;
  const c = tileCenter(0, 2);
  return Math.hypot(c.x - player.x, c.y - player.y) < maxDist;
}

// ---------- Chợ Đen: ban đêm một căn nhà trong làng treo đèn lồng trước cửa, vào trong là chợ đen; ban ngày chỉ là nhà bình thường ----------
let blackInterior = null; // ảnh nội thất (assets/blackmarket/interior.webp)
// Cắt viền đen của ảnh (sx, sy, sw, sh) rồi phủ lên phòng 9×6 ô (toạ độ thế giới, px); cửa ở ô (0,2)
const BM_IMG = { sx: 85, sy: 40, sw: 1295, sh: 970, x: -219.8, y: -228, w: 488, h: 365.5 };
// Ô bị đồ nội thất chiếm (không đi xuyên qua được)
const BM_SOLID = new Set([
  ...[-4, -3, -2, -1, 0, 1, 2, 3, 4].flatMap((x) => [x + ',-4', x + ',-3', x + ',-2']), // tường sau, kệ, quầy của chủ chợ
  '-4,-1', '-3,-1', '4,-1',                                                          // thùng gỗ, thùng rượu bên trái / tinh thể bên phải
  '-4,0', '4,0', '3,0',                                                               // thùng rượu trái, rương kho báu phải
  '-4,1', '-3,1', '-3,0', '-2,1', '3,1', '4,1',                                       // bàn thuốc, đầu lâu, thùng, rương
]);
const BLACK_NIGHT_DARK = 0.28; // cùng ngưỡng với villageNight() nhưng không tính mưa
function blackNight() { return outdoorDarkness() > BLACK_NIGHT_DARK; }
let ANTIDOTE_IMG = null; // icon Thuốc Giải Độc (assets/items/antidote.webp)
let blackUi = null; // khung bảng mua bán Chợ Đen (assets/blackmarket/ui.webp)
function loadBlackMarketSprite() {
  return Promise.all([
    loadImage('assets/blackmarket/interior.webp').then((img) => { blackInterior = img; }),
    loadImage('assets/blackmarket/ui.webp').then((img) => { blackUi = img; }),
    loadImage('assets/blackmarket/darkrod.webp').then((img) => { DR.sheet = img; }),
    loadImage('assets/blackmarket/darkrod_ring.webp').then((img) => { DR.ring = img; }),
    loadImage('assets/blackmarket/darkrod_icon.webp').then((img) => { DR.icon = img; }),
    loadImage('assets/items/antidote.webp').then((img) => { ANTIDOTE_IMG = img; }),
    loadImage('assets/final_boss/fossil.webp').then((img) => { FS.img = img; }),
    loadImage('assets/boat/rowboat.webp').then((img) => { BT.sheet = img; }),
    loadImage('assets/boat/boat_icon.webp').then((img) => { BT.icon = img; }),
  ]);
}

// Mỗi làng chọn cố định 1 căn nhà (không phải lều) làm Chợ Đen. Không dùng rnd() nên bố cục làng cũ giữ nguyên
function markBlackHouse(v) {
  const c = v.houses.filter((o) => /^house/.test(o.img));
  if (!c.length) return;
  const o = c[Math.floor(hash(v.cx * 13 + 5, v.cy * 7 - 3) * c.length)];
  o.blackMarket = true;
  v.blackHouse = o;
}

// Hàng của Chợ Đen (trả bằng ngọc lục bảo). Muốn đổi giá / thêm món thì sửa ở đây
const BLACK_OFFERS = [
  { give: { item: 'emerald', n: 100 }, get: { item: 'darkrod', n: 1 } }, // Cột Thu Lôi Tím
  { give: { item: 'emerald', n: 8 },   get: { item: 'antidote', n: 1 } }, // Thuốc Giải Độc
  { give: { item: 'meteorshard', n: 5 }, get: { item: 'dragonpotion', n: 1 } }, // Thuốc Hồi Sinh Rồng: đổi 5 Mảnh Thiên Thạch
  { give: { item: 'emerald', n: 200 }, get: { item: 'spaceclock', n: 1 } }, // Đồng Hồ Không Gian: dâng Phù Thủy để học Hư Không (C, hệ Không Gian)
  { give: { item: 'emerald', n: 150 }, get: { item: 'spiritjar', n: 1 } }, // Lọ Linh Thú: dâng cho Phù Thủy để học Độc Triệu (C, hệ Độc)
  { give: { item: 'tome_lightning', n: 1 }, give2: { item: 'tome_wind', n: 1 }, get: { item: 'windscroll', n: 1 } }, // Giấy Gió: dâng Phù Thủy để học Phong Thần (V, hệ Gió); trả bằng 1 Sách Hệ Sét + 1 Sách Hệ Gió (cuốn dư)
  { give: { item: 'tome_dark', n: 1 }, give2: { item: 'tome_holy', n: 1 }, get: { item: 'darkscroll', n: 1 } }, // Giấy Hắc: dâng Phù Thủy để học Hắc Chúa (V, hệ Hắc Ám); trả bằng 1 Sách Hệ Hắc Ám + 1 Sách Hệ Thánh Quang (cuốn dư)
  { give: { item: 'tome_nature', n: 1 }, give2: { item: 'tome_earth', n: 1 }, get: { item: 'woodscroll', n: 1 } }, // Giấy Mộc: dâng Phù Thủy (kèm 5 Hạt Cây) để học Cổ Thụ Thần Linh (V, hệ Tự Nhiên); trả bằng 1 Sách Hệ Tự Nhiên + 1 Sách Hệ Đất (cuốn dư)
  { give: { item: 'magma', n: 5 },      get: { item: 'emerald', n: 6 } }, // thu mua giá cao
  { give: { item: 'icecrystal', n: 5 }, get: { item: 'emerald', n: 6 } },
  { give: { item: 'sulfur', n: 5 },     get: { item: 'emerald', n: 4 } },
  { give: { item: 'diamond', n: 1 },    get: { item: 'emerald', n: 7 } },
];
const BM_SHOP = { isMarket: false, blackMarket: true, offers: BLACK_OFFERS, stall: null };

function enterBlackMarket(o) {
  const d = doorPos(o);
  houseRet = { x: d.x, y: d.y + 18 };
  houseCur = { obj: { key: 'bm:' + o.key }, bedTiles: [], blackMarket: true }; // key riêng: không lẫn đồ với căn nhà thường ban ngày
  layerStore[2] = null;
  switchLayer(2);
  const c = tileCenter(0, 1);
  player.x = c.x; player.y = c.y;
  player.faceX = 0; player.faceY = -1;
  player.invuln = Math.max(player.invuln, 1);
  say('Bạn lẻn vào Chợ Đen');
}
function nearBlackDealer(maxDist) {
  if (layer !== 2 || !houseCur || !houseCur.blackMarket) return false;
  const c = tileCenter(0, -1);
  return Math.hypot(c.x - player.x, c.y - player.y) < maxDist;
}
function openBlackMarket() {
  marketVillage = BM_SHOP; marketShop = null; marketPage = 0; marketTab = 0;
  ui = 'market';
  say('Chủ Chợ Đen: Suỵt... nói nhỏ thôi. Muốn mua gì, bán gì?');
}
// Đèn lồng treo trước cửa nhà chợ đen (chỉ vẽ ban đêm). sx, sy: giữa đáy ngôi nhà
function drawBlackLantern(sx, sy) {
  const t = gameTime, fl = 0.8 + Math.sin(t * 9) * 0.1 + Math.sin(t * 5.3) * 0.08;
  const px = sx + 40, hx = sx + 18, hy = sy - 34; // cột đèn bên phải cửa, đèn treo ở đầu tay đòn
  const g = ctx.createRadialGradient(hx, hy, 4, hx, hy, 86);
  g.addColorStop(0, 'rgba(190,100,255,' + (0.38 * fl) + ')'); g.addColorStop(1, 'rgba(190,100,255,0)');
  ctx.fillStyle = g; ctx.fillRect(hx - 90, hy - 90, 180, 180);
  ctx.fillStyle = '#3a2616'; ctx.fillRect(px - 3, sy - 64, 6, 70);         // cột gỗ
  ctx.fillRect(hx, sy - 64, px - hx + 3, 5);                                  // tay đòn
  ctx.fillStyle = '#1c1c24'; ctx.fillRect(hx - 1, sy - 59, 2, 9);            // dây xích
  ctx.fillStyle = '#26212e'; ctx.fillRect(hx - 9, hy - 8, 18, 3);            // nắp
  ctx.fillStyle = 'rgba(255,170,60,' + fl + ')'; ctx.fillRect(hx - 6, hy - 5, 12, 15); // ngọn lửa trong lồng
  ctx.fillStyle = 'rgba(190,100,255,' + (0.55 * fl) + ')'; ctx.fillRect(hx - 3, hy - 2, 6, 9);
  ctx.strokeStyle = '#26212e'; ctx.lineWidth = 2; ctx.strokeRect(hx - 7, hy - 5, 14, 16); // khung lồng
  ctx.beginPath(); ctx.moveTo(hx, hy - 5); ctx.lineTo(hx, hy + 11); ctx.stroke();
  ctx.fillStyle = '#26212e'; ctx.fillRect(hx - 8, hy + 11, 16, 3);           // đáy
}

// ---------- Bảng mua bán Chợ Đen: vẽ trên ảnh ui.webp (toạ độ dưới đây tính theo ảnh gốc 1466×1073, tự co theo cửa sổ) ----------
const BM_UI = { w: 1466, h: 1073, rows: [401, 489, 572, 652, 732, 812] }; // tâm dọc 6 hàng
function bmUiLayout() {
  const U = BM_UI, s = Math.min(canvas.width * 0.96 / U.w, canvas.height * 0.96 / U.h, 0.8);
  const ox = Math.round((canvas.width - U.w * s) / 2), oy = Math.round((canvas.height - U.h * s) / 2);
  const R = (x, y, w, h) => ({ x: ox + x * s, y: oy + y * s, w: w * s, h: h * s });
  const offers = marketOffers(marketVillage).slice(marketPage * MARKET_ROWS, (marketPage + 1) * MARKET_ROWS);
  return {
    s, ox, oy, pages: marketPageCount(marketVillage),
    prev: R(205, 868, 205, 68), next: R(1058, 868, 205, 68),
    rows: offers.map((o, i) => { const cy = U.rows[i]; return { o, cy, give: R(219, cy - 34, 68, 68), get: R(752, cy - 34, 68, 68), btn: R(1130, cy - 33, 152, 66) }; }),
  };
}
function clickBlackMarket() {
  const L = bmUiLayout();
  for (const r of L.rows) if (inRect(mouse, r.btn)) doTrade(r.o);
  if (L.pages > 1) {
    if (inRect(mouse, L.prev)) marketFlip(-1);
    else if (inRect(mouse, L.next)) marketFlip(1);
  }
}
function drawBlackMarketUi() {
  const L = bmUiLayout(), s = L.s, U = BM_UI;
  const fs = (n) => Math.max(10, Math.round(n * s));
  const txt = (text, x, y, color, align, size, bold, maxW) => {
    ctx.font = (bold ? 'bold ' : '') + fs(size) + 'px sans-serif'; ctx.textAlign = align;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,0,20,0.85)'; ctx.strokeText(text, x, y, maxW);
    ctx.fillStyle = color; ctx.fillText(text, x, y, maxW);
  };
  ctx.fillStyle = 'rgba(5,0,10,0.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(blackUi, L.ox, L.oy, U.w * s, U.h * s);
  txt('x ' + inv.emerald, L.ox + 1215 * s, L.oy + 312 * s, '#ffffff', 'left', 40, true);
  let tip = null;
  for (const r of L.rows) {
    const g = r.o.give, t = r.o.get, ok = offerOk(r.o), isz = Math.round(r.give.w - 14 * s);
    const g2 = r.o.give2; // món trả thứ hai (nếu có): vẽ thêm một ô nhỏ cạnh ô thứ nhất
    drawIcon(g.item, Math.round(r.give.x + (r.give.w - isz) / 2), Math.round(r.give.y + (r.give.h - isz) / 2), isz);
    txt('×' + g.n, r.give.x + r.give.w - 3, r.give.y + r.give.h - 4, offerHave(g.item) >= g.n ? '#ffffff' : '#ff8a80', 'right', 22, true);
    if (g2) {
      const x2 = r.give.x + r.give.w + 6 * s;
      ctx.drawImage(blackUi, 219, U.rows[0] - 34, 68, 68, x2, r.give.y, r.give.w, r.give.h); // vẽ ô vật phẩm thứ hai (copy ô của hàng 1 từ khung)
      drawIcon(g2.item, Math.round(x2 + (r.give.w - isz) / 2), Math.round(r.give.y + (r.give.h - isz) / 2), isz);
      txt('×' + g2.n, x2 + r.give.w - 3, r.give.y + r.give.h - 4, offerHave(g2.item) >= g2.n ? '#ffffff' : '#ff8a80', 'right', 22, true);
    }
    if (t.gear) drawIcon(t.gear, Math.round(r.get.x + (r.get.w - isz) / 2), Math.round(r.get.y + (r.get.h - isz) / 2), isz, 3);
    else {
      drawIcon(t.item, Math.round(r.get.x + (r.get.w - isz) / 2), Math.round(r.get.y + (r.get.h - isz) / 2), isz);
      txt('×' + t.n, r.get.x + r.get.w - 3, r.get.y + r.get.h - 4, '#ffffff', 'right', 22, true);
    }
    const ty = L.oy + (r.cy + 10) * s;
    if (g2) txt(ITEMS[g.item].name.replace('Sách Hệ ', '') + ' + ' + ITEMS[g2.item].name.replace('Sách Hệ ', '') + ' (dư ' + offerHave(g.item) + '/' + offerHave(g2.item) + ')', L.ox + 438 * s, ty, '#efe2ff', 'left', 26, false, 290 * s);
    else txt(ITEMS[g.item].name + ' (có ' + inv[g.item] + ')', L.ox + 340 * s, ty, '#efe2ff', 'left', 30, false, 330 * s);
    txt(t.gear ? ARMOR_NAME[t.gear] : ITEMS[t.item].name, L.ox + 860 * s, ty, '#efe2ff', 'left', 30, false, 250 * s);
    const sell = !t.gear && !t.tool && t.item === 'emerald';
    if (!ok) { ctx.fillStyle = 'rgba(15,5,25,0.6)'; ctx.fillRect(r.btn.x, r.btn.y, r.btn.w, r.btn.h); }
    else if (inRect(mouse, r.btn)) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(r.btn.x, r.btn.y, r.btn.w, r.btn.h); }
    txt(sell ? 'Bán' : 'Mua', r.btn.x + r.btn.w / 2, r.btn.y + r.btn.h / 2 + fs(12), ok ? '#ffffff' : '#a99ab8', 'center', 36, true);
    if (inRect(mouse, r.get)) tip = t.gear ? itemTip(t.gear) : [ITEMS[t.item].name, ITEMS[t.item].desc];
  }
  for (const b of [L.prev, L.next]) if (L.pages > 1 && inRect(mouse, b)) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(b.x, b.y, b.w, b.h); }
  txt('Trang ' + (marketPage + 1) + ' / ' + L.pages, L.ox + 733 * s, L.oy + 910 * s, '#efe2ff', 'center', 32, true);
  if (tip) drawTooltip(tip);
}

function exitHouse() {
  const fromElder = !!(houseCur && houseCur.elderRoom);
  switchLayer(0);
  if (houseRet) { player.x = houseRet.x; player.y = houseRet.y; }
  if (fromElder) { // Cây Cổ Thụ chỉ hiện ban đêm: ban ngày chỗ cũ có thể là cây / đá → dời sang ô trống gần nhất
    const ox = player.x, oy = player.y;
    outer: for (let r = 0; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!collides(ox + dx * TILE, oy + dy * TILE)) { player.x = ox + dx * TILE; player.y = oy + dy * TILE; break outer; }
    }
  }
  houseCur = null;
  player.invuln = Math.max(player.invuln, 1);
}

function drawHouseTile(t, tx, ty, sx, sy) {
  if (houseCur && houseCur.witchHouse && witchInterior) return; // ảnh nội thất đã vẽ sẵn tường + đồ đạc
  if (houseCur && houseCur.blackMarket && blackInterior) return;  // Chợ Đen: cũng dùng ảnh nội thất
  if (t !== HWALL || Math.abs(tx) > 5 || ty < -5 || ty > 3) return;
  ctx.fillStyle = '#4e3320'; ctx.fillRect(sx, sy, TILE, TILE);
  ctx.fillStyle = '#6e4a2b'; ctx.fillRect(sx, sy, TILE, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(sx, sy + 22, TILE, 2); ctx.fillRect(sx, sy + 36, TILE, 2);
  ctx.fillRect(sx + 24, sy + 10, 2, 12); ctx.fillRect(sx + 12, sy + 24, 2, 12); ctx.fillRect(sx + 36, sy + 38, 2, 10);
}

// Dân làng đang ngủ trong giường của chính căn nhà này
function houseSleepers() {
  return villagers.filter((vl) => vl.inside && vl.home === houseCur.obj);
}
function houseBeds() {
  return houseCur.bedTiles.filter((b) => getTile(b.x, b.y) === BED);
}
// Giường (ô b) đang có dân làng nằm?
function bedOccupied(b) {
  const i = houseBeds().findIndex((x) => x.x === b.tx && x.y === b.ty);
  return i >= 0 && i < houseSleepers().length;
}

function drawSleepers(ty, camX, camY) {
  const sl = houseSleepers();
  const beds = houseBeds();
  sl.forEach((vl, i) => {
    const b = beds[i];
    if (!b || b.y !== ty) return;
    const c = tileCenter(b.x, b.y);
    const sx = c.x - camX, sy = c.y - camY;
    const spr = VSPR[vl.kind];
    if (spr && spr.idle) {
      const S = 1.4;
      ctx.save();
      ctx.translate(sx + 2, sy + 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(spr.idle, 0, 0, 48, 48, -13 * S, -31 * S, 48 * S, 48 * S);
      ctx.restore();
    }
    ctx.fillStyle = '#cfe8ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Z' + 'z'.repeat(Math.floor(gameTime * 1.5) % 3), sx + 8, sy - 26);
  });
}

// ---------- Dân làng ----------
const VKINDS = ['oldman', 'oldwoman', 'man', 'woman', 'boy', 'girl'];
const VSPR = {};
const VILLAGER_SCALE = 1.7;
const VFACE_DEFAULT = 1;  // sprite gốc quay mặt sang phải
function loadVillagerSprites() {
  const jobs = [];
  for (const k of VKINDS) {
    VSPR[k] = {};
    for (const a of ['idle', 'walk']) jobs.push(loadImage('assets/villager/' + k + '_' + a + '.webp').then((img) => { VSPR[k][a] = img; }));
  }
  jobs.push(loadImage('assets/villager/aerobic.webp').then((img) => { AEROBIC.img = img; }));
  return Promise.all(jobs);
}
const VILLAGER_GREET = ['Chào bạn!', 'Xin chào, lữ khách!', 'Chào mừng đến làng chúng tôi!', 'Ồ, có khách kìa!'];
const VILLAGER_CHAT = [
  'Ban đêm hãy cẩn thận zombie nhé.',
  'Tối đến chúng tôi vào nhà ngủ hết.',
  'Nghe nói trong hầm mỏ có nhiều quặng quý.',
  'Thịt sống nướng trong lò sẽ ngon hơn nhiều.',
  'Cứ ghé Giang Thương mà đổi đồ nhé.',
  'Ngoài đồng có bò, heo và gà đấy.',
  'Trời mưa là zombie kéo ra nhiều lắm.',
  'Nhà nào cũng cứ vào thoải mái nhé.',
];
const VILLAGER_CHAT_KID = ['Anh chị ơi, chơi với em không?', 'Em thích đuổi gà lắm!', 'Mẹ bảo ban đêm không được ra ngoài.'];
const villagers = [];
const activeVillages = new Set();
let villagerCheckT = 0;
let curVillage = null;

// Tối hoặc đang mưa thì dân làng vào nhà
function villageNight() {
  return outdoorDarkness() > 0.28 || world.rain.intensity > 0.3;
}

function spawnVillagers(v) {
  v.spawned = true;
  activeVillages.add(v);
  const night = villageNight();
  const so = v.stall;
  const mx = (so.tx + so.w / 2) * TILE, my = (so.ty + so.h) * TILE + 22;
  const base = { v, state: 'idle', t: 1, face: 1, animT: Math.random() * 3, say: null, greeted: false, inside: night, stuckT: 0 };
  spawnWarriors(v);
  // Thương nhân đứng sau Giang Thương
  villagers.push({ ...base, kind: 'oldman', merchant: true, stay: true, home: v.houses[0], x: mx, y: my, tx: mx, ty: my, sx: mx, sy: my });
  const n = Math.max(0, Math.min(8, Math.round(v.houses.length * 0.6)) - v.lost);
  for (let i = 0; i < n; i++) {
    const kind = VKINDS[Math.floor(hash(v.cx + i * 13, v.cy + i * 29) * VKINDS.length)];
    const tx = v.cx - 8 + Math.floor(hash(v.cx - i * 7, v.cy + i * 5) * 17);
    const ty = v.cy + Math.floor(hash(v.cx + i * 3, v.cy - i * 11) * 5);
    let c = tileCenter(tx, ty);
    if (collides(c.x, c.y, 10)) c = tileCenter(v.cx - 7 + i, v.cy + 3); // trúng vật cản: dời sang chỗ trống
    villagers.push({ ...base, kind, home: v.houses[(i + 1) % v.houses.length], x: c.x, y: c.y, tx: c.x, ty: c.y, t: Math.random() * 2 });
  }
}

// Zombie cắn: dân làng biến thành zombie
function infectVillager(vl) {
  const i = villagers.indexOf(vl);
  if (i >= 0) villagers.splice(i, 1);
  vl.v.lost++;
  const z = createZombie(Math.random() < 0.5 ? 1 : 2, vl.x, vl.y);
  z.aggro = true;
  burst(vl.x, vl.y - 20, '#6a8f3a', 16, 200);
  floaters.push({ x: vl.x, y: vl.y - 60, text: 'Dân làng bị biến thành zombie!', life: 2.4, color: '#ff6a5a' });
  say('Một dân làng bị zombie cắn và biến thành zombie!');
}

// Âm thanh chợ: nghe từ xa (to dần khi lại gần, to nhất khi vào trong chợ), lặp lại. Chỉ phát lúc chợ họp; tối / mưa giông chợ vãn thì tắt dần.
// Vào nhà / hầm / chết thì tắt dần. Thiếu file assets/audio/Cho.mp3 thì im lặng.
const MARKET_SOUND = { src: 'assets/audio/Cho.mp3', vol: 0.8, fade: 1.2 }; // vol: âm lượng tối đa (0..1); fade: giây để đổi âm lượng
let marketAudio = null, marketAudioMissing = false, marketGain = 0;

// Khoảng cách (px) từ người chơi tới chợ gần nhất (0 nếu đang ở trong chợ); Infinity nếu không có chợ nào gần
function marketDistance() {
  const tx = player.x / TILE, ty = player.y / TILE;
  const rx0 = Math.floor(tx / REG), ry0 = Math.floor(ty / REG);
  let best = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const m of marketsForRegion(rx0 + dx, ry0 + dy)) {
        const ox = Math.max(m.mx - MARKET_HW - tx, 0, tx - (m.mx + MARKET_HW + 1));
        const oy = Math.max(m.my - MARKET_TOP - ty, 0, ty - (m.my + MARKET_BOT + 1));
        best = Math.min(best, Math.hypot(ox, oy) * TILE);
      }
    }
  }
  return best;
}

function updateMarketAudio(dt) {
  if (marketAudioMissing) return;
  const outdoors = layer === 0 && !deathScreen;
  let target = 0;
  if (outdoors) {
    if (!villageNight()) target = soundFalloff(marketDistance()) * MARKET_SOUND.vol; // chợ vãn (tối / mưa giông): không có người nên im
  }
  if (target <= 0 && marketGain <= 0) return;
  if (target > 0 && !marketAudio) {
    marketAudio = new Audio(MARKET_SOUND.src);
    marketAudio.loop = true;
    marketAudio.volume = 0;
    marketAudio.onerror = () => { console.warn('Thiếu file ' + MARKET_SOUND.src); marketAudioMissing = true; marketAudio = null; marketGain = 0; };
  }
  if (!marketAudio) return;
  const step = dt / MARKET_SOUND.fade * MARKET_SOUND.vol; // đổi âm lượng mượt, không giật
  marketGain = marketGain < target ? Math.min(target, marketGain + step) : Math.max(target, marketGain - step);
  marketAudio.volume = Math.min(1, marketGain);
  if (marketGain > 0 && marketAudio.paused) {
    const p = marketAudio.play();
    if (p && p.catch) p.catch(() => {}); // trình duyệt chặn tự phát: thử lại ở khung hình sau
  } else if (marketGain <= 0 && !marketAudio.paused) {
    marketAudio.pause(); // xa quá thì tạm dừng
  }
}

function updateVillagers(dt) {
  if (layer !== 0) { updateMarketAudio(dt); return; }
  const cv = villageAt(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
  if (cv && cv !== curVillage) say(cv.isMarket ? 'Bạn đã đến chợ làng! Ban ngày chợ họp đông vui' : 'Bạn đã đến một ngôi làng!');
  curVillage = cv;
  updateMarketAudio(dt);

  villagerCheckT -= dt;
  if (villagerCheckT <= 0) {
    villagerCheckT = 1;
    const rx0 = Math.floor(player.x / TILE / REG), ry0 = Math.floor(player.y / TILE / REG);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const v = villageForRegion(rx0 + dx, ry0 + dy);
        if (v && !v.spawned && Math.hypot(v.cx * TILE - player.x, v.cy * TILE - player.y) < 1500) spawnVillagers(v);
        for (const m of marketsForRegion(rx0 + dx, ry0 + dy)) {
          const mv = marketOf(m);
          if (!mv.spawned && Math.hypot(mv.cx * TILE - player.x, mv.cy * TILE - player.y) < 1500) spawnMarketPeople(mv);
        }
      }
    }
    for (const v of [...activeVillages]) {
      if (Math.hypot(v.cx * TILE - player.x, v.cy * TILE - player.y) > 2600) {
        v.spawned = false;
        activeVillages.delete(v);
        for (let i = villagers.length - 1; i >= 0; i--) if (villagers[i].v === v) villagers.splice(i, 1);
        stopExercise(v, false);
        removeWarriors(v);
      }
    }
  }

  const night = villageNight();
  for (const vl of [...villagers]) {
    vl.animT += dt;
    if (vl.say) { vl.say.t -= dt; if (vl.say.t <= 0) vl.say = null; }

    if (vl.inside) { // đang ngủ trong nhà: sáng ra mới ra ngoài
      if (!night) {
        vl.inside = false;
        if (vl.seller) { vl.x = vl.sx; vl.y = vl.sy; vl.state = 'idle'; vl.t = 3; continue; } // mở sạp: đứng sau quầy
        const d = doorPos(vl.home);
        vl.x = d.x; vl.y = d.y;
        vl.state = 'idle'; vl.t = 0.5;
        if (vl.stay) { vl.tx = vl.sx; vl.ty = vl.sy; vl.state = 'walk'; vl.t = 40; }
      }
      continue;
    }

    // Zombie chạm vào là bị cắn
    if (zombies.some((z) => !z.plant && !z.dead && Math.hypot(z.x - vl.x, z.y - vl.y) < 30)) { infectVillager(vl); continue; }

    if (night && vl.seller) { vl.inside = true; vl.state = 'idle'; vl.say = null; continue; } // chợ vãn: dọn sạp

    const dp = Math.hypot(vl.x - player.x, vl.y - player.y);
    const greets = vl.v.isMarket ? MARKET_GREET : VILLAGER_GREET;
    if (!vl.greeted && dp < 110 && !night) { vl.greeted = true; vl.say = { text: greets[Math.floor(Math.random() * greets.length)], t: 3 }; }
    if (vl.seller && !night) { // người bán quay về phía khách và rao hàng
      if (dp < 220) vl.face = player.x < vl.x ? -1 : 1;
      vl.callT -= dt;
      if (vl.callT <= 0) {
        vl.callT = 7 + Math.random() * 9;
        const calls = MARKET_STALLS[vl.shop.kind].calls;
        if (dp < 380 && !vl.say) vl.say = { text: calls[Math.floor(Math.random() * calls.length)], t: 3.2 };
      }
    }
    if (vl.greeted && dp > 320) vl.greeted = false;

    if (night && vl.state !== 'home') { vl.state = 'home'; vl.stuckT = 0; vl.say = null; }
    if (!night && vl.state === 'home') { vl.state = 'idle'; vl.t = 1; }

    if (vl.state === 'home') { // về nhà ngủ
      const d = doorPos(vl.home);
      const dx = d.x - vl.x, dy = d.y - vl.y, dist = Math.hypot(dx, dy);
      if (dist < 14 || vl.stuckT > 2.5) { vl.inside = true; vl.x = d.x; vl.y = d.y; continue; }
      const sp = 75 * dt, bx = vl.x, by = vl.y;
      moveZombie(vl, dx / dist * sp, dy / dist * sp);
      if (Math.abs(dx) > 2) vl.face = Math.sign(dx);
      vl.stuckT = Math.hypot(vl.x - bx, vl.y - by) < sp * 0.2 ? vl.stuckT + dt : 0;
      continue;
    }

    if (vl.state === 'idle') {
      vl.t -= dt;
      if (vl.t <= 0) {
        if (vl.stay) { vl.t = 3; }
        else {
          const target = wanderTarget(vl.v);
          vl.tx = target.x; vl.ty = target.y;
          vl.state = 'walk';
          vl.t = 8;
        }
      }
    } else {
      vl.t -= dt;
      const dx = vl.tx - vl.x, dy = vl.ty - vl.y, d = Math.hypot(dx, dy);
      if (d < 6 || vl.t <= 0) { vl.state = 'idle'; vl.t = 1.5 + Math.random() * 4; continue; }
      const sp = (vl.kind === 'boy' || vl.kind === 'girl' ? 52 : 38) * dt;
      const bx = vl.x, by = vl.y;
      moveZombie(vl, dx / d * sp, dy / d * sp);
      if (Math.abs(dx) > 2) vl.face = Math.sign(dx);
      if (Math.hypot(vl.x - bx, vl.y - by) < sp * 0.2) { vl.state = 'idle'; vl.t = 0.5 + Math.random(); }
    }
  }
}

// ---------- Âm thanh theo khoảng cách ----------
// Càng gần nguồn càng to, càng xa càng nhỏ, quá xa thì im hẳn. Trả về hệ số 0..1 nhân với âm lượng gốc.
const SOUND_NEAR = 96, SOUND_FAR = 720;   // px: trong 2 ô là to nhất, ngoài 15 ô là không nghe thấy
function soundFalloff(dist) {
  if (dist <= SOUND_NEAR) return 1;
  if (dist >= SOUND_FAR) return 0;
  const k = 1 - (dist - SOUND_NEAR) / (SOUND_FAR - SOUND_NEAR);
  return k * k;
}

// ---------- Radio (hình vẽ điểm ảnh, giống bản thiết kế: thân cam, loa, hai núm vặn, ăng-ten, sóng nhạc vàng) ----------
let radioSpriteCv = null;
function radioSpriteCanvas() {
  if (radioSpriteCv) return radioSpriteCv;
  const cv = document.createElement('canvas');
  cv.width = 28; cv.height = 22;
  const g = cv.getContext('2d');
  const rc = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const disc = (cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) rc(x, y, 1, 1, c); };
  const K = '#1b1109';
  // ăng-ten chéo từ góc trái-trên thân lên phải
  const ant = [];
  for (let i = 0; i <= 14; i++) ant.push([5 + i, 7 - Math.round(i * 0.5)]);
  for (const [x, y] of ant) rc(x - 1, y - 1, 3, 3, K);
  ant.forEach(([x, y], i) => rc(x, y, 1, 1, i % 3 === 0 ? '#e9edf2' : '#a9b0bb'));
  rc(18, 0, 3, 2, '#f3f5f8');
  // thân
  rc(1, 8, 26, 14, K);
  rc(2, 9, 24, 12, '#c8642c');
  rc(2, 9, 24, 1, '#ec8c44'); rc(2, 10, 1, 9, '#da7630');
  rc(2, 20, 24, 1, '#97481d'); rc(25, 10, 1, 10, '#a9501f');
  for (const [x, y] of [[1, 8], [26, 8], [1, 21], [26, 21]]) g.clearRect(x, y, 1, 1);
  // loa: hình tròn tối, viền đậm, vạch lưới ngang
  disc(9, 15, 5.7, '#141418');
  disc(9, 15, 4.8, '#2b2b31');
  for (let y = 11; y <= 19; y += 2) for (let x = 5; x <= 13; x++) if (Math.hypot(x + 0.5 - 9, y + 0.5 - 15) <= 4.4) rc(x, y, 1, 1, '#42424b');
  rc(6, 12, 2, 1, '#62626d');
  // mặt kem bên phải + hai núm vặn tròn
  rc(16, 10, 9, 10, K);
  rc(17, 11, 7, 8, '#eadcbc');
  rc(17, 18, 7, 1, '#cdbb94'); rc(23, 12, 1, 6, '#d9caa6');
  for (const cy of [13.2, 16.8]) { disc(20.5, cy, 2.0, K); disc(20.5, cy, 1.4, '#2c2c32'); rc(20, Math.floor(cy) - 1, 1, 1, '#80808c'); }
  radioSpriteCv = cv;
  return cv;
}

// Sóng nhạc vàng bên phải ăng-ten: nhấp nháy tăng dần như bản thiết kế
function drawRadioWaves(dx, dy, U) {
  const n = Math.floor(gameTime * 5) % 4;
  for (let i = 0; i < n; i++) {
    const x = 22 + i, y = 7 - i * 3;
    for (let k = 0; k < 3; k++) { ctx.fillStyle = '#ffd23a'; ctx.fillRect(dx + (x + k) * U, dy + (y + 1 - k) * U, U, U); }
  }
}

function drawRadioSprite(cx, bottom, playing) { // cx: giữa thân, bottom: mặt đất
  const U = 2, cv = radioSpriteCanvas(), w = cv.width * U, h = cv.height * U;
  const dx = Math.round(cx - w / 2), dy = Math.round(bottom - h);
  const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, dx, dy, w, h);
  ctx.imageSmoothingEnabled = sm;
  if (playing) drawRadioWaves(dx, dy, U);
}

function drawRadioTile(sx, sy, key) {
  const ox = shakeOffset(key);
  shadow(sx, sy, 22);
  drawRadioSprite(sx + 24 + ox, sy + 44, Boolean(window.Radio && Radio.isPlaying(layer + ':' + key)));
}

// ---------- Aerobic buổi sáng ở làng ----------
// Mỗi sáng (khi dân làng đã dậy, trước trưa) ở sân làng xuất hiện đội hình 5 người một hàng × 3 hàng, và một người dẫn tập
// đứng ở đầu đội hình, kế bên radio có sẵn. Radio phát lần lượt 4 bài trong assets/audio (erobic1..4.mp3), xa thì nhỏ, gần thì to.
// Mỗi bài có một bài tập riêng (AEROBIC_ROUTINES). Gần trưa cả nhóm biến mất. Trời mưa hoặc tối thì không tập.
const EXERCISE = {
  start: BALANCE.exercise.start, end: BALANCE.exercise.end,                 // dayT: 0 = trưa, 0.5 = nửa đêm, ~0.67 là lúc dân làng dậy; end > 1 nghĩa là tập qua sang buổi sáng
  cols: [7.8, 9.05, 10.3, 11.55, 12.8],   // 5 người một hàng ngang (đơn vị ô, tính từ tâm làng)
  rows: [1.3, 2.55, 3.8],                  // 3 hàng dọc
  leader: { x: 10.3, y: -0.05 },           // người dẫn tập: đứng đầu đội hình
  radio: { tx: 11, ty: -1 },              // radio có sẵn: ngay cạnh người dẫn tập
  tracks: ['assets/audio/erobic1.mp3', 'assets/audio/erobic2.mp3', 'assets/audio/erobic3.mp3', 'assets/audio/erobic4.mp3'],
  fps: 3,                                 // số động tác mỗi giây
  duration: BALANCE.exercise.duration,                          // thời gian tập thật (giây): 3 phút, không phụ thuộc giờ trong ngày
};

// assets/villager/aerobic.webp: 10 nhân vật (hàng) × 17 động tác (cột), mỗi ô 92×100, chân sát đáy ô
const AEROBIC = { img: null, W: 92, H: 100, chars: 10, scale: 0.8, leaderChar: 1 };
const POSE = {
  STAND: 0, ARMS_OUT: 1, JACK: 2, ARMS_UP: 3, KNEE_UP: 4, STEP: 5, SQUAT_S: 6, SQUAT_WIDE: 7, SQUAT_CROSS: 8,
  SIDE_STRETCH: 9, ARMS_V: 10, KICK: 11, CROUCH: 12, LIE: 13, PLANK: 14, SIT_STRETCH: 15, HANDS_HEAD: 16,
};
// Mỗi bài nhạc một bài tập: chuỗi động tác lặp lại theo nhịp EXERCISE.fps
const AEROBIC_ROUTINES = [
  [POSE.STAND, POSE.ARMS_OUT, POSE.STAND, POSE.ARMS_OUT, POSE.JACK, POSE.ARMS_UP, POSE.JACK, POSE.ARMS_UP],              // 1: khởi động
  [POSE.ARMS_UP, POSE.STEP, POSE.ARMS_UP, POSE.KICK, POSE.ARMS_V, POSE.STEP, POSE.ARMS_V, POSE.KICK],                      // 2: bước và đá chân
  [POSE.ARMS_OUT, POSE.SQUAT_CROSS, POSE.ARMS_OUT, POSE.SQUAT_CROSS, POSE.ARMS_V, POSE.SQUAT_S, POSE.ARMS_V, POSE.SQUAT_S], // 3: gập gối
  [POSE.HANDS_HEAD, POSE.ARMS_UP, POSE.HANDS_HEAD, POSE.ARMS_UP, POSE.SIDE_STRETCH, POSE.CROUCH, POSE.SIDE_STRETCH, POSE.CROUCH,
    POSE.PLANK, POSE.LIE, POSE.PLANK, POSE.SIT_STRETCH, POSE.CROUCH, POSE.HANDS_HEAD],                                      // 4: giãn cơ và tập sàn
];
const EX_CALLS = ['Một, hai, ba, bốn!', 'Hít vào... thở ra!', 'Nào, cùng nhau nào!', 'Giơ tay lên cao!', 'Nhảy lên nào cả nhà!', 'Hai, hai, ba, bốn!'];
const exercisers = [];
let exClock = 0;

function exerciseWeatherOk() { // không tập khi đang mưa / giông (kể cả khi vừa báo mưa) hoặc trời tối
  const r = world.rain;
  return !r.active && r.intensity <= 0.05 && outdoorDarkness() <= 0.28;
}

function exerciseTime() {
  const t = world.dayT < 0.5 ? world.dayT + 1 : world.dayT; // gộp đoạn sau mốc trưa (0..0.5) vào cuối ngày để so sánh liên tục
  return t >= EXERCISE.start && t < EXERCISE.end && exerciseWeatherOk();
}

function inExerciseArea(v, tx, ty) { // ô (toạ độ thế giới, đơn vị ô) nằm trong đội hình
  return tx >= v.cx + 7.0 && tx <= v.cx + 13.7 && ty >= v.cy - 1.2 && ty <= v.cy + 4.4;
}

function startExercise(v) {
  v.exercise = true;
  const add = (sheet, ox, oy, leader) => { // sheet = hàng nhân vật trong aerobic.webp
    const e = { v, sheet, x: (v.cx + ox) * TILE, y: (v.cy + oy) * TILE, leader, inside: false, say: null, callT: 2 + Math.random() * 2 };
    exercisers.push(e);
    burst(e.x, e.y - 22, '#f4f0e0', 6, 90, 120); // làn khói nhỏ lúc xuất hiện
  };
  add(AEROBIC.leaderChar, EXERCISE.leader.x, EXERCISE.leader.y, true);
  EXERCISE.rows.forEach((oy, r) => EXERCISE.cols.forEach((ox, c) => {
    add(Math.floor(hash(v.cx + r * 7 + c * 13, v.cy + r * 5 - c * 3) * AEROBIC.chars), ox, oy, false);
  }));
}

function stopExercise(v, poof = true) {
  v.exercise = false;
  for (let i = exercisers.length - 1; i >= 0; i--) {
    const e = exercisers[i];
    if (e.v !== v) continue;
    if (poof) burst(e.x, e.y - 22, '#f4f0e0', 10, 120, 120);
    exercisers.splice(i, 1);
  }
}

function drawExerciser(e, camX, camY) {
  if (!AEROBIC.img) return;
  const sx = Math.round(e.x - camX), sy = Math.round(e.y - camY);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 12, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
  const routine = AEROBIC_ROUTINES[exTrack % AEROBIC_ROUTINES.length];
  const pose = routine[Math.floor(exClock * EXERCISE.fps) % routine.length];
  const w = AEROBIC.W * AEROBIC.scale, h = AEROBIC.H * AEROBIC.scale;
  ctx.drawImage(AEROBIC.img, pose * AEROBIC.W, e.sheet * AEROBIC.H, AEROBIC.W, AEROBIC.H, sx - w / 2, sy + 12 - (h - 2), w, h);
}

// Nhạc aerobic: một luồng duy nhất, to nhỏ theo khoảng cách tới radio gần nhất đang phát. Không có nút chỉnh.
// Mỗi buổi tập bắt đầu từ bài kế tiếp (erobic1 → 2 → 3 → 4 → 1...), hết bài thì tự chuyển bài. Bài nào thiếu file sẽ bị bỏ qua.
let exAudio = null, exAudioBusy = false, exWasActive = false, exAllMissing = false;
let exTrack = 0, exNextSession = 0;
const exMissing = new Set();

function nextExerciseTrack(from) { // bài gần nhất (từ `from`) còn file; -1 nếu thiếu hết
  const n = EXERCISE.tracks.length;
  for (let i = 0; i < n; i++) { const t = (from + i) % n; if (!exMissing.has(t)) return t; }
  return -1;
}

function selectExerciseTrack(from) {
  exTrack = from % EXERCISE.tracks.length; // bài tập (động tác) vẫn đổi theo bài ngay cả khi chưa có file nhạc
  const t = nextExerciseTrack(from);
  if (t < 0) {
    exAllMissing = true; // chưa có file nhạc: im lặng, không báo
    return;
  }
  exTrack = t;
  if (!exAudio) {
    exAudio = new Audio();
    exAudio.onended = () => { selectExerciseTrack(exTrack + 1); exAudioBusy = false; };
    exAudio.onerror = () => {
      console.warn('Thiếu file ' + EXERCISE.tracks[exTrack]);
      exMissing.add(exTrack);
      exAudioBusy = false;
      selectExerciseTrack(exTrack + 1);
    };
  }
  exAudio.src = EXERCISE.tracks[t];
}

function updateExerciseAudio() {
  const active = [...activeVillages].some((v) => v.exercise);
  if (!active || layer !== 0) { // không có buổi tập, hoặc người chơi đang ở trong nhà / hầm: tạm dừng nhạc
    if (exAudio && !exAudio.paused) exAudio.pause();
    if (!active) exWasActive = false;
    return;
  }
  if (!exWasActive) { exWasActive = true; exAllMissing = false; selectExerciseTrack(exNextSession++); }
  if (exAllMissing || !exAudio) return;
  let gain = 0;
  if (layer === 0 && !deathScreen) {
    for (const v of activeVillages) {
      if (!v.exercise || !v.radio) continue;
      gain = Math.max(gain, soundFalloff(Math.hypot((v.radio.tx + 0.5) * TILE - player.x, (v.radio.ty + 0.5) * TILE - player.y)));
    }
  }
  exAudio.volume = Math.min(1, gain);
  if (exAudio.paused && !exAudioBusy) {
    exAudioBusy = true;
    const done = () => { exAudioBusy = false; };
    const p = exAudio.play();
    if (p && p.then) p.then(done, done); else done();
  }
}

function updateExercise(dt) {
  exClock += dt;
  const want = exerciseTime();
  for (const v of activeVillages) {
    if (v.isMarket || !v.radio) continue;
    if (v.exercise) {
      v.exLeft -= dt;
      if (v.exLeft <= 0) { stopExercise(v); v.exDone = true; } // hết 3 phút thì giải tán
      else if (!exerciseWeatherOk()) { stopExercise(v); v.exDone = false; } // trời mưa / giông / tối: giải tán ngay, hết mưa mà còn sáng thì tập lại
    } else if (want && !v.exDone) {
      startExercise(v);
      v.exLeft = EXERCISE.duration;
    } else if (v.exDone && world.dayT > 0.3 && world.dayT < 0.6) {
      v.exDone = false; // qua buổi chiều/đêm thì sáng hôm sau mới tập lại
    }
  }
  for (const e of exercisers) {
    if (e.say) { e.say.t -= dt; if (e.say.t <= 0) e.say = null; }
    if (e.leader) { // người dẫn tập hô nhịp khi có người chơi ở gần
      e.callT -= dt;
      if (e.callT <= 0) {
        e.callT = 5 + Math.random() * 4;
        if (!e.say && Math.hypot(e.x - player.x, e.y - player.y) < 420) e.say = { text: EX_CALLS[Math.floor(Math.random() * EX_CALLS.length)], t: 2.2 };
      }
    }
  }
  updateExerciseAudio();
}

function nearestVillager(maxDist) {
  if (layer !== 0) return null;
  let best = null, bd = maxDist;
  for (const vl of villagers) {
    if (vl.inside) continue;
    const d = Math.hypot(vl.x - player.x, vl.y - player.y);
    if (d < bd) { bd = d; best = vl; }
  }
  return best;
}

const VILLAGER_LABEL = { boy: 'Bé trai', girl: 'Bé gái', oldman: 'Ông cụ', oldwoman: 'Bà cụ', woman: 'Cô', man: 'Chú' };
function villagerLabel(vl) {
  if (vl.seller) return 'Người bán hàng';
  return VILLAGER_LABEL[vl.kind] || 'Dân làng';
}

function talkVillager(vl) {
  const kid = vl.kind === 'boy' || vl.kind === 'girl';
  let pool = kid ? VILLAGER_CHAT_KID.concat(VILLAGER_CHAT.slice(0, 2)) : VILLAGER_CHAT;
  if (vl.v.isMarket) pool = vl.seller ? MARKET_CHAT.concat(MARKET_STALLS[vl.shop.kind].calls) : MARKET_CHAT;
  const text = pool[Math.floor(Math.random() * pool.length)];
  if (window.Dialog) { vl.say = null; Dialog.open(villagerLabel(vl), text); } // hộp thoại thay cho bong bóng chữ
  else vl.say = { text, t: 4 };
  vl.state = 'idle';
  vl.t = 4;
  vl.face = player.x < vl.x ? -1 : 1;
}

// ---------- Giang Thương: trao đổi đồ ----------
let marketVillage = null; // làng có Giang Thương đang mở

function nearestMarket(maxDist) {
  if (layer !== 0) return null;
  const v = villageAt(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
  if (!v) return null;
  const dist = (o) => Math.hypot((o.tx + o.w / 2) * TILE - player.x, (o.ty + o.h) * TILE - player.y);
  if (v.isMarket) { // chợ: chọn sạp gần nhất (sạp nào cũng mua bán được)
    let best = null, bd = maxDist;
    for (const o of v.shops) { const d = dist(o); if (d < bd) { bd = d; best = o; } }
    if (!best) return null;
    v.stall = best;
    return v;
  }
  return dist(v.stall) < maxDist ? v : null;
}

function openMarket(v) {
  const m = v.isMarket
    ? villagers.find((vl) => vl.seller && vl.shop === v.stall && !vl.inside)
    : villagers.find((vl) => vl.merchant && vl.v === v && !vl.inside);
  if (!m) { say(v.isMarket ? 'Sạp đã đóng cửa. Quay lại vào ban ngày nhé!' : 'Thương nhân đang ngủ (hoặc không còn). Quay lại vào ban ngày nhé!'); return; }
  marketVillage = v;
  marketShop = v.stall;
  marketPage = 0;
  marketTab = 0;
  ui = 'market';
  m.say = { text: v.isMarket ? 'Mua gì cứ nói, tôi bớt cho!' : 'Bạn muốn đổi gì nào?', t: 3 };
}

// Chợ bán mọi thứ: mỗi vật phẩm và dụng cụ đều mua được bằng vật phẩm khác. [món nhận, số lượng, món đưa, số lượng]
const MARKET_PRICES = [
  ['wood', 4, 'stone', 3], ['stone', 4, 'wood', 3], ['coal', 3, 'wood', 4], ['stick', 6, 'wood', 3],
  ['ironore', 2, 'stone', 6], ['goldore', 1, 'iron', 3], ['iron', 1, 'coal', 5], ['gold', 1, 'iron', 4], ['diamond', 1, 'gold', 6],
  ['furnace', 1, 'stone', 10], ['table', 1, 'wood', 6], ['chestbox', 1, 'wood', 8], ['bed', 1, 'wood', 10],
  ['torch', 2, 'stone', 6], ['potion', 1, 'wood', 8], ['rod', 1, 'iron', 4],
  ['apple', 3, 'wood', 3], ['baked', 2, 'wood', 5], ['flesh', 3, 'apple', 2], ['cookedflesh', 2, 'wood', 4],
  ['rawbeef', 2, 'apple', 3], ['beef', 2, 'wood', 5], ['rawpork', 2, 'apple', 2], ['pork', 2, 'wood', 4],
  ['rawchicken', 2, 'apple', 2], ['chicken', 2, 'wood', 4],
  ['wwall', 4, 'wood', 5], ['iwall', 2, 'iron', 3], ['wdoor', 1, 'wood', 5], ['idoor', 1, 'iron', 3],
  ['roof', 4, 'wood', 4], ['wfloor', 6, 'wood', 4], ['carpet', 2, 'wood', 4],
  ['lamp', 2, 'coal', 2], ['fence', 6, 'wood', 4], ['pot', 2, 'stone', 3],
  ['phobowl', 1, 'wood', 5], ['banhchung', 1, 'wood', 4], ['banhmi', 2, 'wood', 3], ['veg', 4, 'wood', 2],
  ['orange', 3, 'wood', 3], ['banana', 3, 'wood', 3], ['fish', 3, 'wood', 2], ['grilledfish', 2, 'wood', 4],
  ['nonla', 1, 'wood', 3], ['cloth', 3, 'wood', 4],
  ['egg', 4, 'wood', 3], ['milk', 2, 'wood', 3], ['bucket', 1, 'iron', 3], ['flour', 3, 'wood', 3], ['riceflour', 3, 'wood', 3], ['noodle', 3, 'wood', 4],
  ['friedegg', 2, 'wood', 4], ['cake', 1, 'wood', 8], ['mill', 1, 'stone', 10], ['radio', 1, 'emerald', 100], ['oven', 1, 'stone', 12], ['pen', 1, 'wood', 12],
  ...Object.keys(CROPS).map((k) => ['seed_' + k, 3, 'wood', Math.max(2, Math.round(CROPS[k].st / 18))]), // hạt giống
];
const MARKET_TOOL_PRICES = [null, ['emerald', 3], ['emerald', 5], ['emerald', 9], ['emerald', 22], ['emerald', 40]]; // theo cấp dụng cụ: gỗ, đá, sắt, vàng, kim cương
// Tiền tệ là ngọc lục bảo: giá cũ (tính bằng nguyên liệu) quy đổi theo giá trị từng món, tối thiểu 1 ngọc
const EM_VALUE = { wood: 0.3, stone: 0.35, coal: 0.45, iron: 1.3, gold: 4, diamond: 14, apple: 0.4, flesh: 0.15, rawbeef: 0.6, rawpork: 0.5, rawchicken: 0.4 };
const emeraldPrice = (item, n) => item === 'emerald' ? n : Math.max(1, Math.round(n * (EM_VALUE[item] || 0.5)));
const asEmeraldOffer = (o) => (o.give.item === 'emerald' ? o : { ...o, give: { item: 'emerald', n: emeraldPrice(o.give.item, o.give.n) } });
// Bán nông sản lấy ngọc lục bảo: [món, số lượng bán, số ngọc nhận]
const SELL_CROPS = {
  wheat: [3, 1], carrot: [2, 1], bean: [2, 1], chili: [2, 1], cauli: [1, 1], cucumber: [2, 1], pumpkin: [1, 2], pineapple: [1, 3],
  rice: [3, 1], herb: [4, 1], sunflower: [2, 1], grape: [2, 2],
};
SELL_CROPS.veg = [3, 1]; // rau muống chợ (không phải cây trồng) cũng theo giá chợ
SELL_CROPS.egg = [4, 1]; SELL_CROPS.milk = [2, 1]; // trứng, sữa từ chăn nuôi
const SELL_RAW = { veg: 'veg', egg: 'egg', milk: 'milk' }; // món bán không phải nông sản 'crop_*'
// Giá chợ lên xuống theo ngày: mỗi loại nông sản mỗi ngày một hệ số giá (PRICE_MIN..PRICE_MAX lần giá gốc),
// tính từ số ngày + hạt giống thế giới nên hôm nay cà rốt được giá, mai có thể rẻ. Mọi người chơi trong cùng thế giới thấy cùng giá.
const PRICE_MIN = 0.5, PRICE_MAX = 1.7;
const PRICE_KEYS = Object.keys(SELL_CROPS);
function priceMult(k, day) {
  const i = PRICE_KEYS.indexOf(k);
  return PRICE_MIN + (PRICE_MAX - PRICE_MIN) * hash(day * 31 + i * 7 + 3, i * 101 - day * 13 + 11);
}
// Đơn thu mua của ngày `day`: giá cao thì bán 1 được vài ngọc, giá thấp thì phải đưa nhiều nông sản mới được 1 ngọc
function dealFor(k, day) {
  const [bn, be] = SELL_CROPS[k], base = be / bn;
  const p = base * priceMult(k, day);                         // ngọc nhận được cho mỗi nông sản
  const n = p >= 1 ? 1 : Math.min(8, Math.round(1 / p));
  const em = p >= 1 ? Math.round(p) : 1;
  return { give: { item: SELL_RAW[k] || 'crop_' + k, n }, get: { item: 'emerald', n: em }, ratio: (em / n) / base };
}
const dealCache = {};
function sellDeal(k) {
  const key = k + ':' + world.day + ':' + worldSeed;
  return dealCache[key] || (dealCache[key] = dealFor(k, world.day));
}
function makeSellOffer(k) { // đơn "sống": give / get luôn theo giá của ngày hiện tại
  const o = { crop: k };
  Object.defineProperties(o, {
    give: { get: () => sellDeal(k).give, enumerable: true },
    get: { get: () => sellDeal(k).get, enumerable: true },
  });
  return o;
}
const SELL_OFFERS = Object.fromEntries(PRICE_KEYS.map((k) => [k, makeSellOffer(k)]));
// Nhãn xu hướng giá hôm nay + dự báo ngày mai cho một đơn thu mua
function priceTrend(k) {
  const now = sellDeal(k).ratio, next = dealFor(k, world.day + 1).ratio;
  const pct = Math.round(Math.abs(now - 1) * 100);
  const today = now >= 1.15 ? { txt: '▲ Được giá +' + pct + '%', color: '#1e7a45' } : now <= 0.85 ? { txt: '▼ Giá rẻ -' + pct + '%', color: '#b03a2e' } : { txt: '● Giá thường', color: '#606060' };
  const tom = next > now * 1.1 ? '▲' : next < now / 1.1 ? '▼' : '≈';
  return { ...today, tomorrow: 'mai ' + tom };
}
const WATERCAN_PRICE = BALANCE.craft.watercanPrice; // ngọc lục bảo
const RARE_SEEDS = ['cauli', 'pumpkin', 'pineapple', 'grape']; // hạt giống hiếm: chỉ thương nhân mới bán
const MARKET_CATALOG = [
  { give: { item: 'emerald', n: WATERCAN_PRICE }, get: { item: 'watercan', n: 1 } },
  ...MARKET_PRICES.map(([item, n, giveItem, giveN]) => asEmeraldOffer({ give: { item: giveItem, n: giveN }, get: { item, n } })),
  ...Object.values(SELL_OFFERS),
  ...Object.keys(TOOL_LABEL).flatMap((tool) => [1, 2, 3, 4, 5].map((tier) => ({ give: { item: MARKET_TOOL_PRICES[tier][0], n: MARKET_TOOL_PRICES[tier][1] }, get: { tool, tier } }))),
];
// Thương nhân làng: 3 đơn mua đồ (trả ngọc lục bảo) + 3 đơn thu mua nông sản (nhận ngọc lục bảo). h: số ngẫu nhiên cố định của làng
function merchantOffers(pool, h) {
  // hash() trả số thực trong [0,1): phải nhân với số loại rồi làm tròn xuống, nếu không ks[a] ra undefined và bảng đổi đồ bị crash (đứng máy)
  const ks = Object.keys(SELL_OFFERS), a = Math.floor((Math.abs(h) % 1) * ks.length);
  return [...pool.slice(0, 3).map(asEmeraldOffer), ...[0, 3, 6].map((d) => SELL_OFFERS[ks[(a + d) % ks.length]])];
}
// Hàng hiếm của thương nhân (Giang Thương ở làng, sạp Tạp hoá ở chợ): đổi ngọc lục bảo lấy đồ không nơi nào khác bán
const RARE_OFFERS = [
  { give: { item: 'emerald', n: 6 },  get: { gear: 'head' } },
  { give: { item: 'emerald', n: 12 }, get: { gear: 'chest' } },
  { give: { item: 'emerald', n: 9 },  get: { gear: 'legs' } },
  { give: { item: 'emerald', n: 6 },  get: { gear: 'feet' } },
  { give: { item: 'emerald', n: 10 }, get: { gear: 'ghead' } },
  { give: { item: 'emerald', n: 20 }, get: { gear: 'gchest' } },
  { give: { item: 'emerald', n: 15 }, get: { gear: 'glegs' } },
  { give: { item: 'emerald', n: 10 }, get: { gear: 'gfeet' } },
  { give: { item: 'emerald', n: 24 }, get: { gear: 'dhead' } },
  { give: { item: 'emerald', n: 48 }, get: { gear: 'dchest' } },
  { give: { item: 'emerald', n: 36 }, get: { gear: 'dlegs' } },
  { give: { item: 'emerald', n: 24 }, get: { gear: 'dfeet' } },
  { give: { item: 'emerald', n: 10 }, get: { tool: 'pickaxe', tier: 3 } },
  { give: { item: 'emerald', n: 9 },  get: { tool: 'hoe', tier: 3 } },
  { give: { item: 'emerald', n: 5 },  get: { item: 'seed_pineapple', n: 2 } },
  { give: { item: 'emerald', n: 4 },  get: { item: 'seed_pumpkin', n: 3 } },
  { give: { item: 'emerald', n: 3 },  get: { item: 'seed_cauli', n: 3 } },
  { give: { item: 'emerald', n: 4 },  get: { item: 'seed_grape', n: 2 } },
  { give: { item: 'emerald', n: 6 },  get: { item: 'pen', n: 1 } },
];
// Mỗi ngày thương nhân chỉ có RARE_PER_DAY món trong kho hàng hiếm (chọn theo ngày + hạt giống thế giới), luôn có ít nhất 1 loại hạt giống
const RARE_PER_DAY = 6;
let rareCache = { key: '', list: RARE_OFFERS };
function rareToday() {
  const key = world.day + ':' + worldSeed;
  if (rareCache.key === key) return rareCache.list;
  const order = RARE_OFFERS.map((o, i) => [hash(world.day * 53 + i * 7, i * 31 + 5), o]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  let pick = order.slice(0, RARE_PER_DAY);
  if (!pick.some((o) => o.get.item)) pick = [...pick.slice(0, RARE_PER_DAY - 1), order.find((o) => o.get.item)];
  rareCache = { key, list: RARE_OFFERS.filter((o) => pick.includes(o)) }; // giữ thứ tự gốc
  return rareCache.list;
}
const MARKET_ROWS = 6;     // số hàng hiển thị một trang
let marketTab = 0;         // 0 = hàng thường, 1 = hàng hiếm (chỉ ở thương nhân)
let marketPage = 0;
let marketShop = null; // sạp đang mở trong chợ

// Mỗi sạp chỉ bán hàng của sạp mình
const MARKET_STALL_GOODS = {
  rau:     ['veg', 'apple', 'flesh', 'stick', 'watercan', ...Object.keys(CROPS).filter((k) => !RARE_SEEDS.includes(k)).map((k) => 'seed_' + k)],
  traicay: ['orange', 'banana', 'apple', 'baked', 'milk'],
  ca:      ['fish', 'grilledfish', 'flesh', 'cookedflesh'],
  thit:    ['rawbeef', 'beef', 'rawpork', 'pork', 'rawchicken', 'chicken'],
  banh:    ['banhchung', 'banhmi', 'baked', 'cookedflesh', 'cake', 'flour', 'friedegg'],
  non:     ['nonla', 'roof', 'fence', 'wfloor'],
  vai:     ['cloth', 'carpet', 'bed', 'lamp', 'wdoor', 'wwall'],
  pho:     ['phobowl', 'noodle', 'riceflour', 'potion', 'beef', 'pork', 'chicken'],
  taphoa:  ['watercan', 'wood', 'stone', 'coal', 'furnace', 'table', 'chestbox', 'torch', 'rod', 'iwall', 'idoor', 'bucket', 'mill', 'oven', 'radio', 'egg', 'milk', 'potion', 'pen', 'pot'], // + dụng cụ gỗ / đá
};
// Sạp nào thu mua nông sản nào (trả bằng ngọc lục bảo)
const MARKET_STALL_BUYS = {
  rau:     ['carrot', 'bean', 'chili', 'cauli', 'cucumber', 'veg', 'herb'],
  traicay: ['pumpkin', 'pineapple', 'grape', 'sunflower'],
  banh:    ['wheat', 'rice', 'milk'],
  thit:    ['egg'],
  taphoa:  ['wheat', 'carrot', 'pumpkin', 'pineapple', 'rice', 'egg', 'milk'],
};
// Hoa Sen Lửa: đổi lưu huỳnh ở sạp Tạp Hoá, mang tới Nhà Phù Thủy để mở khoá phép Hỏa Cầu (Z). Mỗi người chỉ cần 1 bông
const LOTUS_OFFER = { give: { item: 'sulfur', n: BALANCE.witch.lotusSulfur }, get: { item: 'firelotus', n: 1 } };
const lotusNotNeeded = (o) => o === LOTUS_OFFER && (inv.firelotus > 0 || Boolean(witchSt.learned.fireball));
const marketCatalogCache = {};
function marketCatalogFor(kind) {
  if (!marketCatalogCache[kind]) {
    const list = (MARKET_STALL_BUYS[kind] || []).map((k) => SELL_OFFERS[k]); // đơn thu mua nông sản đứng đầu
    list.push(...MARKET_STALL_GOODS[kind].map((item) => MARKET_CATALOG.find((o) => o.get.item === item)));
    if (kind === 'taphoa') { list.push(...MARKET_CATALOG.filter((o) => o.get.tool && o.get.tier <= 2)); list.unshift(LOTUS_OFFER); } // chỉ bán dụng cụ gỗ / đá; sắt, vàng, kim cương phải tự kiếm // đơn hoa đứng đầu trang 1
    marketCatalogCache[kind] = list;
  }
  return marketCatalogCache[kind];
}
function marketHasRare(v) { if (v.blackMarket) return false; return v.isMarket ? Boolean(MARKET_STALLS[marketShop.kind].trade) : true; }
function marketOffers(v) {
  if (marketTab === 1 && marketHasRare(v)) return rareToday();
  return v.isMarket ? marketCatalogFor(marketShop.kind) : v.offers;
}
function marketPageCount(v) { return Math.max(1, Math.ceil(marketOffers(v).length / MARKET_ROWS)); }
function marketFlip(d) { marketPage = (marketPage + d + marketPageCount(marketVillage)) % marketPageCount(marketVillage); }

// Đã có dụng cụ này (cùng cấp trở lên) và còn bền quá nửa thì không cần đổi nữa
function haveToolOffer(o) {
  const id = o.get.tool;
  return false; // luôn được đổi, kể cả khi đã có dụng cụ tốt hơn
}

function haveGearOffer(o) { return gear[o.get.gear] || gearBag[o.get.gear] > 0; }
// Số vật phẩm dùng được để trả: Sách Hệ chỉ tính cuốn dư (cuốn cần để mở khoá hệ chưa mở thì giữ lại)
function offerHave(id) { const n = inv[id] | 0; return id.startsWith('tome_') ? Math.max(0, n - (witchSt.unlocked[id.slice(5)] ? 0 : 1)) : n; }
function offerOk(o) {
  if (offerHave(o.give.item) < o.give.n) return false;
  if (o.give2 && offerHave(o.give2.item) < o.give2.n) return false;
  if (o.get.tool && haveToolOffer(o)) return false;
  if (o.get.gear && haveGearOffer(o)) return false;
  if (o.get.item === 'watercan' && inv.watercan > 0) return false; // một bình là đủ
  if (lotusNotNeeded(o)) return false;                             // đã có hoa / đã học Hỏa Cầu thì không cần thêm
  return true;
}

function doTrade(o) {
  if (!offerOk(o)) { say((o.get.tool && haveToolOffer(o)) || (o.get.gear && haveGearOffer(o)) || (o.get.item === 'watercan' && inv.watercan > 0) || lotusNotNeeded(o) ? 'Bạn đã có món này rồi' : 'Bạn chưa đủ đồ để đổi'); return; }
  inv[o.give.item] -= o.give.n;
  if (o.give2) inv[o.give2.item] -= o.give2.n;
  if (o.get.gear) {
    const worn = giveGear(o.get.gear); // mặc luôn nếu ô còn trống
    noticeItem('Đã đổi lấy ' + ARMOR_NAME[o.get.gear].toLowerCase() + (worn ? ' và mặc vào!' : ' (đã cất vào túi)'));
  } else if (o.get.tool) {
    receiveTool(o.get.tool, o.get.tier);
    noticeItem('Đã đổi lấy ' + TOOL_LABEL[o.get.tool].toLowerCase() + ' ' + TIER_NAME[o.get.tier] + '!');
  } else {
    inv[o.get.item] += o.get.n;
    if (o.get.item === 'watercan') canUses = WATERCAN_USES;
    noticeItem('Đã đổi lấy ' + o.get.n + ' ' + ITEMS[o.get.item].name.toLowerCase());
  }
  burst(player.x, player.y - 20, '#ffd34d', 10, 120);
}

function marketLayout() {
  const all = marketOffers(marketVillage), pages = marketPageCount(marketVillage);
  const paged = all.length > MARKET_ROWS, hasTabs = marketHasRare(marketVillage);
  const offers = paged ? all.slice(marketPage * MARKET_ROWS, (marketPage + 1) * MARKET_ROWS) : all;
  const w = 560, rowH = 54, pager = paged ? 36 : 0, tabH = hasTabs ? 32 : 0;
  const h = 56 + tabH + offers.length * rowH + 30 + pager;
  const x = Math.round((canvas.width - w) / 2), y = Math.max(8, Math.round((canvas.height - h) / 2 - 30));
  return {
    x, y, w, h, pages,
    tabs: hasTabs ? [{ x: x + 14, y: y + 38, w: 150, h: 26, label: 'Hàng thường' }, { x: x + 174, y: y + 38, w: 170, h: 26, label: '★ Hàng hiếm hôm nay' }] : [],
    prev: { x: x + 14, y: y + h - 30 - pager + 4, w: 90, h: 28 },
    next: { x: x + w - 104, y: y + h - 30 - pager + 4, w: 90, h: 28 },
    rows: offers.map((o, i) => {
      const r = { x: x + 14, y: y + 44 + tabH + i * rowH, w: w - 28, h: rowH - 6 };
      return { o, ...r, giveSlot: slotRect(r.x + 10, r.y + 3), getSlot: slotRect(r.x + 250, r.y + 3), btn: { x: r.x + r.w - 96, y: r.y + 8, w: 86, h: 30 } };
    }),
  };
}

function clickMarket() {
  if (marketVillage && marketVillage.blackMarket && blackUi) { clickBlackMarket(); return; }
  const L = marketLayout();
  L.tabs.forEach((tb, i) => { if (inRect(mouse, tb) && marketTab !== i) { marketTab = i; marketPage = 0; } });
  for (const r of L.rows) if (inRect(mouse, r.btn)) doTrade(r.o);
  if (L.pages > 1) {
    if (inRect(mouse, L.prev)) marketFlip(-1);
    else if (inRect(mouse, L.next)) marketFlip(1);
  }
}

function drawMarketUi() {
  if (marketVillage.blackMarket && blackUi) { drawBlackMarketUi(); return; }
  const L = marketLayout();
  mcPanel(L);
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#404040';
  ctx.fillText(marketVillage.blackMarket ? 'Chợ Đen  ·  hàng hiếm, thu mua giá cao' : marketVillage.isMarket ? 'Sạp ' + MARKET_STALLS[marketShop.kind].sign + '  ·  mua bán, trao đổi' : 'Giang Thương  ·  mua bán bằng ngọc lục bảo', L.x + 16, L.y + 28);
  drawIcon('emerald', L.x + L.w - 118, L.y + 8, 24); // ví ngọc lục bảo
  ctx.fillStyle = '#1e7a45'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('×' + inv.emerald, L.x + L.w - 90, L.y + 27);
  let tip = null;
  for (let i = 0; i < L.tabs.length; i++) { // tab hàng thường / hàng hiếm
    const tb = L.tabs[i], on = marketTab === i;
    ctx.fillStyle = on ? (i ? '#8a5ad0' : '#5b8a3c') : 'rgba(0,0,0,0.12)';
    ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
    ctx.strokeStyle = on ? '#222' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(tb.x, tb.y, tb.w, tb.h);
    ctx.fillStyle = on ? '#fff' : (inRect(mouse, tb) ? '#000' : '#404040');
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(tb.label, tb.x + tb.w / 2, tb.y + 18);
  }
  for (const r of L.rows) {
    const g = r.o.give, t = r.o.get, ok = offerOk(r.o);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawSlot(r.giveSlot, inRect(mouse, r.giveSlot));
    drawIcon(g.item, r.giveSlot.x + 4, r.giveSlot.y + 4, 32);
    drawCount(r.giveSlot, g.n, inv[g.item] >= g.n ? '#fff' : '#ff8a80');
    ctx.fillStyle = '#404040'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    if (r.o.crop) { // đơn thu mua nông sản: kèm xu hướng giá hôm nay và dự báo ngày mai
      const tr = priceTrend(r.o.crop);
      ctx.fillText(ITEMS[g.item].name + ' (có ' + inv[g.item] + ')', r.giveSlot.x + SLOT + 8, r.giveSlot.y + 17);
      ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = tr.color;
      ctx.fillText(tr.txt, r.giveSlot.x + SLOT + 8, r.giveSlot.y + 31);
      ctx.font = '11px sans-serif'; ctx.fillStyle = '#707070';
      ctx.fillText(tr.tomorrow, r.giveSlot.x + SLOT + 8 + ctx.measureText(tr.txt).width + 14, r.giveSlot.y + 31);
    } else ctx.fillText(ITEMS[g.item].name + ' (có ' + inv[g.item] + ')', r.giveSlot.x + SLOT + 8, r.giveSlot.y + 24);
    ctx.fillStyle = '#404040'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('→', r.x + 232, r.y + 31);
    drawSlot(r.getSlot, inRect(mouse, r.getSlot));
    if (t.gear) drawIcon(t.gear, r.getSlot.x + 4, r.getSlot.y + 4, 32, 3);
    else if (t.tool) drawIcon(t.tool, r.getSlot.x + 4, r.getSlot.y + 4, 32, t.tier);
    else { drawIcon(t.item, r.getSlot.x + 4, r.getSlot.y + 4, 32); drawCount(r.getSlot, t.n); }
    ctx.fillStyle = '#404040'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(t.gear ? ARMOR_NAME[t.gear] : t.tool ? TOOL_LABEL[t.tool] + ' ' + TIER_NAME[t.tier] : ITEMS[t.item].name, r.getSlot.x + SLOT + 8, r.getSlot.y + 24);
    drawMcButton(r.btn, !t.tool && !t.gear && t.item === 'emerald' ? 'Bán' : 'Mua', null, ok && inRect(mouse, r.btn), ok);
    if (inRect(mouse, r.getSlot)) tip = t.gear ? itemTip(t.gear) : t.tool ? null : [ITEMS[t.item].name, ITEMS[t.item].desc];
  }
  if (L.pages > 1) {
    drawMcButton(L.prev, '◀ Trước', null, inRect(mouse, L.prev), true);
    drawMcButton(L.next, 'Sau ▶', null, inRect(mouse, L.next), true);
    ctx.fillStyle = '#404040'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Trang ' + (marketPage + 1) + ' / ' + L.pages, L.x + L.w / 2, L.y + L.h - 40);
  }
  ctx.fillStyle = '#505050'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Tiền tệ: ngọc lục bảo · giá nông sản đổi theo ngày (ngày ' + world.day + ')', L.x + L.w / 2, L.y + L.h - 12);
  if (tip) drawTooltip(tip);
}

// ---------- Đội Chiến Binh Bảo Vệ Làng ----------
// Mỗi làng có một trụ gác và đội 3 chiến binh (3 kiểu: rìu, kiếm khiên, giáo) cùng 2 cung thủ. Ban đêm / mưa: đi quanh làng diệt zombie.
// Ban ngày: đi tuần quanh làng (vẫn đánh zombie lọt vào gần).
const WARRIOR_TEAM = 'Đội Chiến Binh Bảo Vệ Làng';
const WARRIOR_COUNT = BALANCE.village.warriorCount;
const WARRIOR_HP = BALANCE.village.warriorHp;
const WARRIOR_DMG = BALANCE.village.warriorDmg;         // sát thương mỗi nhát chém
const WARRIOR_RANGE = BALANCE.village.warriorRange;      // tầm chém
const WARRIOR_SWING = 0.4;     // thời gian một nhát chém (đòn trúng ở giữa)
const WARRIOR_CD = BALANCE.village.warriorCd;       // giây giữa 2 nhát
const WARRIOR_LEASH = 1300;    // không đuổi quái ra xa quá tầm này khỏi giữa làng
const WARRIOR_DAY_SEEK = 320;  // ban ngày chỉ đánh quái đến gần trong tầm này
const WARRIOR_RESPAWN = BALANCE.village.warriorRespawn;    // giây sau khi ngã xuống thì quay lại trụ
const ARCHER_COUNT = BALANCE.village.archerCount, ARCHER_HP = BALANCE.village.archerHp, ARCHER_DMG = BALANCE.village.archerDmg, ARCHER_RANGE = BALANCE.village.archerRange, ARCHER_CD = BALANCE.village.archerCd, ARCHER_DRAW = 0.45, ARCHER_SPEED = 520;
const ARCHER_SPOTS = [[-120, 30], [120, 30], [-70, 110], [70, 110]]; // chỗ đứng gác quanh trụ canh (pixel, tính từ chân trụ)
const vArrows = []; // mũi tên của cung thủ làng
const WARRIOR_DEAD_SHOW = 2.5; // giây nằm lại trên đất trước khi biến mất
const warriors = [];

// Sprite chiến binh: mỗi file là một dải ngang các khung 96x96, nhân vật quay mặt sang phải, chân ở đáy khung.
const WFRAME = 96;
const WARRIOR_SCALE = 1.45;
const WARRIOR_TYPES = [1, 2, 3];
const WARRIOR_ANIMS = {
  idle:    { fps: 6 },
  walk:    { fps: 10 },
  run:     { fps: 13 },
  attack1: { fps: 0 },   // chạy theo thời gian của nhát chém
  attack2: { fps: 0 },
  dead:    { fps: 6 },
};
const WARRIOR_SPRITES = {};   // WARRIOR_SPRITES[kiểu][tên anim] = Image
let warriorSpritesReady = false;
const warriorTmp = document.createElement('canvas'); // dùng để nhuộm đỏ khi bị thương
warriorTmp.width = WFRAME; warriorTmp.height = WFRAME;
const wtx = warriorTmp.getContext('2d');

function loadWarriorSprites() {
  const jobs = [];
  for (const t of WARRIOR_TYPES) {
    WARRIOR_SPRITES[t] = {};
    for (const name of Object.keys(WARRIOR_ANIMS)) {
      jobs.push(loadImage('assets/warrior/w' + t + '_' + name + '.webp').then((img) => {
        WARRIOR_SPRITES[t][name] = img;
        return Boolean(img);
      }));
    }
  }
  return Promise.all(jobs).then((r) => { warriorSpritesReady = r.every(Boolean); });
}

function warriorPostPos(v) {
  const o = v.post;
  return { x: (o.tx + o.w / 2) * TILE, y: (o.ty + o.h) * TILE + 26 };
}

function spawnWarriors(v) {
  spawnArchers(v);
  const p = warriorPostPos(v);
  for (let i = 0; i < WARRIOR_COUNT; i++) {
    const x = p.x - 70 + (i % 3) * 56, y = p.y + 14 + Math.floor(i / 3) * 34;
    warriors.push({
      v, x, y, hp: WARRIOR_HP, maxHp: WARRIOR_HP, down: 0, type: WARRIOR_TYPES[i % WARRIOR_TYPES.length], atkAnim: 'attack1',
      fx: 0, fy: 1, face: 1, animT: Math.random() * 3,
      atkCd: 0, atkT: 0, atkHit: false, target: null, hurtFlash: 0,
      wp: i % 8, wpT: 0, dirSign: i % 2 ? -1 : 1, routeNight: null, stuckT: 0,
      stuck: 0, sideT: 0, sideDir: 1, escal: 0, freeT: 0, moving: false, running: false,
    });
  }
}

// Cung thủ làng: đứng gác quanh trụ, bắn nhện và zombie từ xa (lùi lại khi quái áp sát)
function spawnArchers(v) {
  const p = warriorPostPos(v);
  for (let i = 0; i < ARCHER_COUNT; i++) {
    const sp = ARCHER_SPOTS[i % ARCHER_SPOTS.length], x = p.x + sp[0], y = p.y + sp[1];
    warriors.push({
      v, archer: true, spot: { x, y }, x, y, hp: ARCHER_HP, maxHp: ARCHER_HP, down: 0, type: WARRIOR_TYPES[(i + 1) % WARRIOR_TYPES.length], atkAnim: 'attack1',
      fx: 0, fy: 1, face: i % 2 ? -1 : 1, animT: Math.random() * 3,
      atkCd: Math.random(), atkT: 0, atkHit: false, drawT: 0, target: null, hurtFlash: 0,
      wp: 0, wpT: 0, dirSign: 1, routeNight: null, stuckT: 0,
      stuck: 0, sideT: 0, sideDir: 1, escal: 0, freeT: 0, moving: false, running: false,
    });
  }
}

function removeWarriors(v) {
  for (let i = warriors.length - 1; i >= 0; i--) if (warriors[i].v === v) warriors.splice(i, 1);
}

// Đường tuần: ban ngày đi các lối trong làng, ban đêm đi vòng ngoài rìa làng
function warriorRoute(v, night) {
  const key = night ? 'routeN' : 'routeD';
  if (v[key]) return v[key];
  const c = (dx, dy) => ({ x: (v.cx + dx + 0.5) * TILE, y: (v.cy + dy + 0.5) * TILE });
  v[key] = night
    ? [c(-19, -20), c(0, -20), c(19, -20), c(19, 2), c(19, 24), c(0, 24), c(-19, 24), c(-19, 2)]
    : [c(-11, 4), c(-14, -7), c(0, -7), c(14, -7), c(14, 4), c(14, 14), c(0, 14), c(-14, 14)];
  return v[key];
}

function nearestWarrior(x, y, maxDist) {
  let best = null, bd = maxDist;
  for (const h of warriors) {
    if (h.down > 0) continue;
    const d = Math.hypot(h.x - x, h.y - y);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

function hurtWarrior(h, dmg, z) {
  if (h.down > 0) return;
  h.hp -= dmg;
  h.hurtFlash = 0.25;
  if (z) { const a = Math.atan2(h.y - z.y, h.x - z.x); moveZombie(h, Math.cos(a) * 10, Math.sin(a) * 10); }
  floaters.push({ x: h.x, y: h.y - 70, text: '-' + dmg, life: 0.8, color: '#ff8a7a' });
  burst(h.x, h.y - 20, '#e74c3c', 5, 110);
  if (h.hp <= 0) {
    h.hp = 0; h.down = WARRIOR_RESPAWN; h.atkT = 0; h.target = null;
    floaters.push({ x: h.x, y: h.y - 70, text: 'Một chiến binh đã ngã xuống!', life: 2, color: '#ff6a5a' });
  }
}

function updateWarriors(dt) {
  if (layer !== 0 || !warriors.length) return;
  const night = villageNight();
  for (const h of warriors) {
    h.animT += dt;
    h.atkCd = Math.max(0, h.atkCd - dt);
    h.hurtFlash = Math.max(0, h.hurtFlash - dt);

    if (h.down > 0) { // ngã xuống: hồi lại ở trụ sau một lúc
      h.down -= dt;
      if (h.down <= 0) {
        const p = warriorPostPos(h.v);
        h.x = p.x + (Math.random() - 0.5) * 60; h.y = p.y + 10;
        h.hp = h.maxHp; h.target = null;
        if (h.archer) { h.x = h.spot.x; h.y = h.spot.y; h.drawT = 0; }
      }
      continue;
    }
    h.hp = Math.min(h.maxHp, h.hp + (night ? 0.5 : 4) * dt); // tự hồi máu chậm (ban ngày nhanh hơn)
    if (h.archer) { updateArcher(h, dt); continue; }

    if (h.atkT > 0) { // đang chém: đòn trúng ở giữa nhát
      h.atkT -= dt;
      h.moving = false;
      if (!h.atkHit && h.atkT <= WARRIOR_SWING / 2) {
        h.atkHit = true;
        const z = h.target;
        if (z && !z.dead && Math.hypot(z.x - h.x, z.y - h.y) < WARRIOR_RANGE + 18) {
          if (spiders.includes(z)) hitSpider(z, WARRIOR_DMG, h); else hitZombie(z, WARRIOR_DMG, h);
        }
      }
      continue;
    }

    // Tìm zombie gần nhất trong tầm làng
    const cxp = h.v.cx * TILE, cyp = h.v.cy * TILE;
    const seek = night ? WARRIOR_LEASH : WARRIOR_DAY_SEEK;
    let tz = null, bd = seek;
    for (const z of zombies) {
      if (z.dead || z.guard) continue;
      if (Math.hypot(z.x - cxp, z.y - cyp) > WARRIOR_LEASH) continue;
      const d = Math.hypot(z.x - h.x, z.y - h.y);
      if (d < bd) { bd = d; tz = z; }
    }
    for (const sp of spiders) { // nhện cũng là quái: chiến binh cũng đánh
      if (sp.dead) continue;
      if (Math.hypot(sp.x - cxp, sp.y - cyp) > WARRIOR_LEASH) continue;
      const d = Math.hypot(sp.x - h.x, sp.y - h.y);
      if (d < bd) { bd = d; tz = sp; }
    }
    h.target = tz;
    h.running = false;
    const bx = h.x, by = h.y;

    if (tz) {
      const dx = tz.x - h.x, dy = tz.y - h.y;
      h.fx = dx; h.fy = dy;
      if (Math.abs(dx) > 3) h.face = Math.sign(dx);
      if (bd < WARRIOR_RANGE) {
        h.moving = false;
        if (h.atkCd <= 0) { h.atkT = WARRIOR_SWING; h.atkHit = false; h.atkCd = WARRIOR_CD; h.atkAnim = h.atkAnim === 'attack1' ? 'attack2' : 'attack1'; }
      } else {
        zombieWalk(h, tz.x, tz.y, 125, dt);
        h.running = true;
      }
      continue;
    }

    // Không có quái: đi tuần
    const route = warriorRoute(h.v, night);
    if (h.routeNight !== night) { // đổi chế độ ngày/đêm: chọn điểm tuần gần nhất
      h.routeNight = night;
      let bi = 0, bdd = Infinity;
      route.forEach((p, i) => { const d = Math.hypot(p.x - h.x, p.y - h.y); if (d < bdd) { bdd = d; bi = i; } });
      h.wp = bi; h.wpT = 0; h.stuckT = 0;
    }
    const p = route[h.wp % route.length];
    h.wpT += dt;
    if (Math.hypot(p.x - h.x, p.y - h.y) < 26 || h.wpT > 25 || h.stuckT > 2.5) {
      h.wp = (h.wp + h.dirSign + route.length) % route.length;
      h.wpT = 0; h.stuckT = 0;
    } else {
      const sp = night ? 78 : 52;
      zombieWalk(h, p.x, p.y, sp, dt);
      const moved = Math.hypot(h.x - bx, h.y - by);
      h.stuckT = moved < sp * dt * 0.2 ? h.stuckT + dt : 0;
      if (moved > 0.1) { h.fx = h.x - bx; h.fy = h.y - by; }
      if (Math.abs(h.x - bx) > 0.05) h.face = Math.sign(h.x - bx); // quay mặt theo hướng đi
    }
  }

  // Đẩy các chiến binh ra khỏi nhau cho khỏi chồng lên
  for (let i = 0; i < warriors.length; i++) {
    const a = warriors[i];
    if (a.down > 0) continue;
    for (let j = i + 1; j < warriors.length; j++) {
      const b = warriors[j];
      if (b.down > 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 34) {
        const push = (34 - d) * 0.4;
        moveZombie(a, -dx / d * push, -dy / d * push);
        moveZombie(b, dx / d * push, dy / d * push);
      }
    }
  }
}

function updateArcher(h, dt) {
  h.moving = false; h.running = false;
  if (h.drawT > 0) { // đang giương cung
    h.drawT -= dt;
    const t = h.target;
    if (t && !t.dead) { h.aimX = t.x; h.aimY = t.y; if (Math.abs(t.x - h.x) > 3) h.face = Math.sign(t.x - h.x); }
    if (h.drawT <= 0) fireArcherArrow(h);
    return;
  }
  const cxp = h.v.cx * TILE, cyp = h.v.cy * TILE;
  let tz = null, bd = ARCHER_RANGE;
  const consider = (z) => {
    if (z.dead || z.guard) return;
    if (Math.hypot(z.x - cxp, z.y - cyp) > WARRIOR_LEASH) return;
    const d = Math.hypot(z.x - h.x, z.y - h.y);
    if (d < bd && lineClear(h.x, h.y, z.x, z.y)) { bd = d; tz = z; }
  };
  for (const z of zombies) consider(z);
  for (const sp of spiders) consider(sp);
  h.target = tz;
  if (tz) {
    if (Math.abs(tz.x - h.x) > 3) h.face = Math.sign(tz.x - h.x);
    h.aimX = tz.x; h.aimY = tz.y;
    if (bd < 90) { // quái áp sát: vừa lùi vừa bắn
      const a = Math.atan2(h.y - tz.y, h.x - tz.x);
      moveZombie(h, Math.cos(a) * 80 * dt, Math.sin(a) * 80 * dt);
      h.moving = true; h.running = true;
    }
    if (h.atkCd <= 0) { h.drawT = ARCHER_DRAW; h.atkCd = ARCHER_CD; }
    return;
  }
  const sp = h.spot; // hết quái: về chỗ đứng gác
  if (Math.hypot(sp.x - h.x, sp.y - h.y) > 10) zombieWalk(h, sp.x, sp.y, 55, dt);
}

function fireArcherArrow(h) {
  const t = h.target;
  const tx = t && !t.dead ? t.x : h.aimX, ty = t && !t.dead ? t.y : h.aimY;
  if (tx === undefined) return;
  const dx = tx - h.x, dy = ty - h.y, len = Math.hypot(dx, dy) || 1;
  vArrows.push({ x: h.x, y: h.y, vx: dx / len * ARCHER_SPEED, vy: dy / len * ARCHER_SPEED, dist: 0, from: h });
}

function vArrowHit(a) {
  for (const z of zombies) {
    if (z.dead || z.guard) continue;
    const rx = z.boss ? bossHB(z).rx : 18, up = z.boss ? bossHB(z).up : 44;
    const dx = a.x - z.x, dy = a.y - z.y;
    if (Math.abs(dx) < rx && dy > -up && dy < 12) { hitZombie(z, ARCHER_DMG, a.from); return true; }
  }
  for (const sp of spiders) {
    if (sp.dead) continue;
    const dx = a.x - sp.x, dy = a.y - sp.y;
    if (Math.abs(dx) < 20 && dy > -22 && dy < 12) { hitSpider(sp, ARCHER_DMG, a.from); return true; }
  }
  return false;
}

function updateVArrows(dt) {
  if (layer !== 0) { vArrows.length = 0; return; }
  for (let i = vArrows.length - 1; i >= 0; i--) {
    const a = vArrows[i];
    let done = false;
    for (let k = 0; k < 3 && !done; k++) {
      a.x += a.vx * dt / 3; a.y += a.vy * dt / 3; a.dist += ARCHER_SPEED * dt / 3;
      if (a.dist > ARCHER_RANGE + 80 || isSolid(Math.floor(a.x / TILE), Math.floor(a.y / TILE))) { done = true; break; }
      done = vArrowHit(a);
    }
    if (done) { burst(a.x, a.y - ARROW_H, '#cfc7b0', 4, 80); vArrows.splice(i, 1); }
  }
}

// Cung cầm trên tay cung thủ: hướng theo mục tiêu, kéo căng khi giương
function drawArcherBow(h, sx, sy) {
  let ang = h.face < 0 ? Math.PI : 0;
  if (h.aimX !== undefined && (h.drawT > 0 || h.atkCd > ARCHER_CD - 0.35)) ang = Math.atan2(h.aimY - 14 - h.y, h.aimX - h.x);
  const pull = h.drawT > 0 ? 1 - h.drawT / ARCHER_DRAW : 0;
  ctx.save();
  ctx.translate(sx + Math.cos(ang) * 14, sy - 26 + Math.sin(ang) * 8);
  ctx.rotate(ang);
  drawIcon('bow', -14, -14, 28);
  if (pull > 0) mkLine(-10 * pull, 0, 12, 0, '#8a5a2b', 1.6);
  ctx.restore();
}

function nearestPost(maxDist) {
  if (layer !== 0) return null;
  const v = villageAt(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
  if (!v || !v.post) return null;
  const o = v.post;
  return Math.hypot((o.tx + o.w / 2) * TILE - player.x, (o.ty + o.h) * TILE - player.y) < maxDist ? v : null;
}

function talkPost(v) {
  const alive = warriors.filter((h) => h.v === v && !h.archer && h.down <= 0).length;
  const bows = warriors.filter((h) => h.v === v && h.archer && h.down <= 0).length;
  say(WARRIOR_TEAM + ': ' + alive + '/' + WARRIOR_COUNT + ' chiến binh đi tuần diệt zombie, ' + bows + '/' + ARCHER_COUNT + ' cung thủ đứng gác bắn quái từ xa.');
}

function drawWarriorPost(o, camX, camY) {
  const cx = Math.round((o.tx + o.w / 2) * TILE - camX), by = Math.round((o.ty + o.h) * TILE - camY);
  // bóng
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(cx - 46, by - 8, 92, 14);
  // bốn chân trụ + thanh chéo
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(cx - 40, by - 100, 8, 96); ctx.fillRect(cx + 32, by - 100, 8, 96);
  ctx.fillStyle = '#6e4a2b';
  ctx.fillRect(cx - 28, by - 92, 6, 88); ctx.fillRect(cx + 22, by - 92, 6, 88);
  ctx.strokeStyle = '#4a2f18'; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 36, by - 8); ctx.lineTo(cx + 36, by - 74);
  ctx.moveTo(cx + 36, by - 8); ctx.lineTo(cx - 36, by - 74);
  ctx.stroke();
  // sàn gác + lan can
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(cx - 52, by - 108, 104, 12);
  ctx.fillStyle = '#a8743c'; ctx.fillRect(cx - 52, by - 108, 104, 4);
  ctx.fillStyle = '#6e4a2b';
  ctx.fillRect(cx - 48, by - 132, 4, 24); ctx.fillRect(cx + 44, by - 132, 4, 24); ctx.fillRect(cx - 48, by - 132, 96, 4);
  ctx.fillRect(cx - 24, by - 132, 3, 24); ctx.fillRect(cx + 21, by - 132, 3, 24);
  // mái
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(cx - 44, by - 156, 5, 26); ctx.fillRect(cx + 39, by - 156, 5, 26);
  ctx.fillStyle = '#a3402f';
  ctx.beginPath(); ctx.moveTo(cx - 60, by - 154); ctx.lineTo(cx, by - 190); ctx.lineTo(cx + 60, by - 154); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7a2d20'; ctx.fillRect(cx - 60, by - 156, 120, 4);
  // cờ xanh phấp phới
  const wave = Math.sin(gameTime * 4) * 3;
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(cx - 1, by - 222, 3, 34);
  ctx.fillStyle = '#2e9e4f';
  ctx.beginPath(); ctx.moveTo(cx + 2, by - 222); ctx.lineTo(cx + 32, by - 213 + wave); ctx.lineTo(cx + 2, by - 203); ctx.closePath(); ctx.fill();
  // bảng tên
  const pw = 128, ph = 38, px = cx - pw / 2, py = by - 62;
  ctx.fillStyle = '#3b2412'; ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
  ctx.fillStyle = '#7a4f2a'; ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(px, py, pw, 4);
  ctx.textAlign = 'center'; ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#000'; ctx.fillText('ĐỘI CHIẾN BINH', cx + 1, py + 16); ctx.fillText('BẢO VỆ LÀNG', cx + 1, py + 31);
  ctx.fillStyle = '#ffe9b0'; ctx.fillText('ĐỘI CHIẾN BINH', cx, py + 15); ctx.fillStyle = '#9fe8a8'; ctx.fillText('BẢO VỆ LÀNG', cx, py + 30);
}

function drawWarrior(h, camX, camY) {
  const dead = h.down > 0;
  const deadT = WARRIOR_RESPAWN - h.down;           // giây kể từ lúc gục
  if (dead && deadT > WARRIOR_DEAD_SHOW) return;    // nằm một lúc rồi biến mất, chờ hồi sinh ở trụ
  const sx = Math.round(h.x - camX), sy = Math.round(h.y - camY);
  const sheets = WARRIOR_SPRITES[h.type];
  const S = WARRIOR_SCALE;
  ctx.save();
  if (dead) ctx.globalAlpha = Math.max(0, Math.min(1, (WARRIOR_DEAD_SHOW - deadT) / 0.8));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 12, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (!warriorSpritesReady || !sheets) {
    ctx.fillStyle = '#2e9e4f'; ctx.fillRect(sx - 9, sy - 30, 18, 40);
  } else {
    let name = 'idle';
    if (dead) name = 'dead';
    else if (h.atkT > 0) name = h.atkAnim;
    else if (h.moving) name = h.running ? 'run' : 'walk';
    const img = sheets[name];
    const nFrames = Math.max(1, Math.floor(img.width / WFRAME));
    let frame;
    if (dead) frame = Math.min(nFrames - 1, Math.floor(deadT * WARRIOR_ANIMS.dead.fps));
    else if (name === h.atkAnim && h.atkT > 0) frame = Math.min(nFrames - 1, Math.floor((1 - h.atkT / WARRIOR_SWING) * nFrames));
    else frame = Math.floor(h.animT * WARRIOR_ANIMS[name].fps) % nFrames;
    let src = img, sxo = frame * WFRAME;
    if ((h.hurtFlash > 0 || h.archer) && !dead) { // nháy đỏ khi bị đánh; cung thủ nhuộm xanh để phân biệt
      wtx.clearRect(0, 0, WFRAME, WFRAME);
      wtx.globalCompositeOperation = 'source-over';
      wtx.drawImage(img, frame * WFRAME, 0, WFRAME, WFRAME, 0, 0, WFRAME, WFRAME);
      wtx.globalCompositeOperation = 'source-atop';
      wtx.fillStyle = h.hurtFlash > 0 ? 'rgba(255,60,60,0.5)' : 'rgba(70,140,255,0.30)';
      wtx.fillRect(0, 0, WFRAME, WFRAME);
      wtx.globalCompositeOperation = 'source-over';
      src = warriorTmp; sxo = 0;
    }
    ctx.translate(sx, sy + 12);                  // chân nhân vật nằm ở đáy khung
    if (h.face < 0) ctx.scale(-1, 1);            // sprite gốc quay mặt sang phải
    ctx.drawImage(src, sxo, 0, WFRAME, WFRAME, -WFRAME / 2 * S, -WFRAME * S, WFRAME * S, WFRAME * S);
  }
  ctx.restore();
  if (dead) return;
  if (h.archer) drawArcherBow(h, sx, sy);
  // thanh máu + nhãn
  const w = 40, x = sx - w / 2, y = sy - 80;
  ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 7);
  ctx.fillStyle = '#7a1c1c'; ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = hpColor(h.hp / h.maxHp); ctx.fillRect(x, y, w * h.hp / h.maxHp, 5);
  ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
  shadowText(h.archer ? 'Cung thủ' : 'Chiến binh', sx, y - 3, h.archer ? '#8fc4ff' : '#9fe8a8');
}

// ---------- Động vật (bò, heo, cừu, gà) ----------
const ANIMALS = {
  cow:     { name: 'Bò',  img: 'bull',    fw: 64, walk: 6, idle: 4, ax: 32, ay: 42, speed: 34, hp: 14, drop: 'rawbeef',    min: 1, max: 3, sh: 22, hitW: 28, fight: { dmg: 12, speed: 118, range: 44 } }, // fight: bị đánh thì húc lại
  pig:     { name: 'Heo', img: 'piglet',  fw: 32, walk: 6, idle: 4, ax: 16, ay: 26, speed: 32, hp: 10, drop: 'rawpork',    min: 1, max: 2, sh: 14, hitW: 22 },
  sheep:   { name: 'Cừu', img: 'sheep',    fw: 48, walk: 7, idle: 4, ax: 24, ay: 44, speed: 32, hp: 8,  drop: 'wool',       min: 1, max: 3, sh: 12, hitW: 18, sc: 0.62 }, // sc: hệ số thu nhỏ hình khi vẽ (cừu to quá nên thu nhỏ lại)
  chicken: { name: 'Gà',  img: 'rooster', fw: 32, walk: 6, idle: 6, ax: 16, ay: 25, speed: 42, hp: 4,  drop: 'rawchicken', min: 1, max: 2, sh: 10, hitW: 18, extra: { item: 'feather', min: 1, max: 2 } },
};
const ASPR = {};
// Chăn nuôi: cho ăn đúng món để thuần hoá → rào chuồng (Bộ chuồng nuôi) → gà đẻ trứng, bò cho sữa (cầm xô bấm vào bò), cho ăn tiếp 2 con để nhân giống
const BABY_TIME = 150, BREED_CD = 200, MAX_TAME = 24, TAME_LEASH = 150;
const ANIMAL_FEED = {
  cow: (id) => id === 'crop_wheat' || id === 'crop_rice',
  pig: (id) => id === 'crop_carrot' || id === 'crop_wheat' || id === 'crop_pumpkin',
  sheep: (id) => id === 'crop_wheat' || id === 'crop_carrot',
  chicken: (id) => id.startsWith('seed_'),
};
const FEED_HINT = { cow: 'lúa mì hoặc lúa gạo', pig: 'cà rốt, lúa mì hoặc bí ngô', sheep: 'lúa mì hoặc cà rốt', chicken: 'hạt giống' };
function makeAnimal(kind, x, y, extra) {
  return Object.assign({ kind, x, y, hp: ANIMALS[kind].hp, dir: 0, state: 'idle', t: 1 + Math.random() * 3, vx: 0, vy: 0, animT: Math.random() * 3 }, extra);
}
function loadAnimalSprites() {
  return Promise.all(Object.values(ANIMALS).map((d) => loadImage('assets/animal/' + d.img + '.webp').then((img) => { ASPR[d.img] = img; })));
}
const animals = [];
let animalSpawnT = 2;

function spawnAnimal() {
  for (let tries = 0; tries < 8; tries++) {
    const ang = Math.random() * Math.PI * 2, dist = 450 + Math.random() * 350;
    const x = player.x + Math.cos(ang) * dist, y = player.y + Math.sin(ang) * dist;
    if (collides(x, y, 12)) continue;
    if (volcNear(x / TILE, y / TILE, 14)) continue; // đảo núi lửa + biển quanh nó: không sinh thú đất liền (volcano.js)
    const r = Math.random();
    const kind = r < 0.25 ? 'cow' : r < 0.5 ? 'pig' : r < 0.75 ? 'sheep' : 'chicken';
    animals.push(makeAnimal(kind, x, y));
    return;
  }
}

function updateAnimals(dt) {
  if (layer !== 0) return;
  animalSpawnT -= dt;
  if (animalSpawnT <= 0) {
    animalSpawnT = 1.5 + Math.random() * 2;
    const near = animals.reduce((n, a) => n + (!a.tame && Math.hypot(a.x - player.x, a.y - player.y) < 1000 ? 1 : 0), 0);
    if (near < 9) spawnAnimal();
  }
  const sel = ui ? null : slotList()[hotbarSel];
  const lureId = typeof sel === 'string' && inv[sel] > 0 ? sel : null;
  for (let i = animals.length - 1; i >= 0; i--) {
    const a = animals[i];
    if (Math.hypot(a.x - player.x, a.y - player.y) > 1500) { if (!a.tame) animals.splice(i, 1); continue; } // vật nuôi ở xa thì đứng yên, không biến mất
    const def = ANIMALS[a.kind];
    a.animT += dt;
    a.t -= dt;
    if (a.tame) tickTame(a, dt);
    if (a.state === 'chase') { updateChaser(a, def, dt); continue; }
    if (lureId && a.state !== 'flee' && ANIMAL_FEED[a.kind](lureId)) { // cầm thức ăn: vật nuôi trong tầm nhìn đi theo (dắt vào chuồng)
      const lx = player.x - a.x, ly = player.y - a.y, ld = Math.hypot(lx, ly);
      if (ld < 320 && ld > 50) { a.vx = lx / ld; a.vy = ly / ld; a.state = 'walk'; a.t = 0.5; }
      else if (ld <= 50 && a.state === 'walk') { a.state = 'idle'; a.t = 0.4; }
    }
    if (a.state === 'flee') {
      const dx = a.x - player.x, dy = a.y - player.y, d = Math.hypot(dx, dy) || 1;
      a.vx = dx / d; a.vy = dy / d;
      if (a.t <= 0) { a.state = 'idle'; a.t = 1 + Math.random() * 2; }
    } else if (a.t <= 0) {
      if (a.state === 'idle') {
        let ang = Math.random() * Math.PI * 2;
        if (a.tame && Math.hypot(a.home.x - a.x, a.home.y - a.y) > TAME_LEASH) ang = Math.atan2(a.home.y - a.y, a.home.x - a.x); // đi xa chuồng thì quay về
        a.vx = Math.cos(ang); a.vy = Math.sin(ang);
        a.state = 'walk';
        a.t = 1 + Math.random() * 2.5;
      } else {
        a.state = 'idle';
        a.t = 1.5 + Math.random() * 4;
      }
    }
    if (a.state !== 'idle') {
      const sp = def.speed * (a.state === 'flee' ? 2.6 : 1) * dt;
      const bx = a.x, by = a.y;
      moveZombie(a, a.vx * sp, a.vy * sp);
      if (a.state === 'walk' && Math.hypot(a.x - bx, a.y - by) < sp * 0.2) { a.state = 'idle'; a.t = 0.4 + Math.random(); }
      if (Math.abs(a.vx) > Math.abs(a.vy)) a.dir = a.vx < 0 ? 2 : 3;
      else a.dir = a.vy < 0 ? 1 : 0;
    }
  }
}

// Vật nuôi: lớn dần, gà đẻ trứng, bò có sữa
function tickTame(a, dt) {
  if (a.baby > 0) { a.baby -= dt; if (a.baby <= 0) { a.baby = 0; floaters.push({ x: a.x, y: a.y - 50, text: ANIMALS[a.kind].name + ' đã lớn', life: 1.4, color: '#9be34a' }); } return; }
  a.breedCd = Math.max(0, (a.breedCd || 0) - dt);
  a.love = Math.max(0, (a.love || 0) - dt);
  if (a.kind === 'chicken') {
    a.layT = (a.layT === undefined ? 50 + Math.random() * 40 : a.layT) - dt;
    if (a.layT <= 0) { a.layT = 80 + Math.random() * 60; spawnLoot('egg', 1, a.x, a.y + 6); burst(a.x, a.y - 8, '#fff3d0', 5, 70); }
  } else if (a.kind === 'cow' && !a.milk) {
    a.milkT = (a.milkT === undefined ? 40 : a.milkT) - dt;
    if (a.milkT <= 0) a.milk = true;
  }
}

function heartsAt(a) {
  burst(a.x, a.y - 24, '#ff7aa8', 8, 90, -40);
  floaters.push({ x: a.x, y: a.y - 52, text: '♥', life: 1.1, color: '#ff7aa8' });
}

// Cầm đúng món thì bấm vào con vật không phải là đánh: cho ăn (thuần hoá / nhân giống) hoặc vắt sữa bằng xô
function interactAnimal(a) {
  const sel = slotList()[hotbarSel];
  if (typeof sel !== 'string') return false;
  if (sel === 'bucket' && inv.bucket > 0) { milkCow(a); return true; }
  if (inv[sel] > 0 && ANIMAL_FEED[a.kind](sel)) { feedAnimal(a, sel); return true; }
  return false;
}

function milkCow(a) {
  hitTimer = 0.5;
  if (bucketWater || bucketLava) { say('Xô đang đựng ' + (bucketLava ? 'dung nham' : 'nước') + ', hãy đổ đi trước khi vắt sữa'); return; }
  if (a.kind !== 'cow') { say('Xô chỉ vắt sữa được bò'); return; }
  if (!a.tame) { say('Bò hoang không cho vắt sữa. Cho bò ăn ' + FEED_HINT.cow + ' để nuôi trước'); return; }
  if (a.baby > 0) { say('Bê con chưa có sữa'); return; }
  if (!a.milk) { say('Bò chưa có sữa, chờ một lát nhé'); return; }
  a.milk = false; a.milkT = 100 + Math.random() * 40;
  spawnLoot('milk', 1, a.x, a.y + 6);
  burst(a.x, a.y - 10, '#ffffff', 8, 90, -30);
  say('Đã vắt được một bình sữa');
}

function feedAnimal(a, id) {
  const def = ANIMALS[a.kind];
  hitTimer = 0.5;
  if (!a.tame) {
    if (animals.filter((o) => o.tame).length >= MAX_TAME) { say('Nuôi nhiều quá rồi (tối đa ' + MAX_TAME + ' con)'); return; }
    inv[id]--;
    a.tame = true; a.home = { x: a.x, y: a.y }; a.state = 'idle'; a.t = 1; a.hp = def.hp;
    heartsAt(a);
    say('Đã thuần ' + def.name.toLowerCase() + '! Dựng chuồng rào lại, cho 2 con ăn để nhân giống');
    return;
  }
  if (a.baby > 0) { say(def.name + ' con còn nhỏ, chờ nó lớn đã'); return; }
  if (a.breedCd > 0 || a.love > 0) { say(def.name + ' này chưa đói, chờ một lát'); return; }
  inv[id]--;
  a.love = 25;
  heartsAt(a);
  const mate = animals.find((o) => o !== a && o.tame && o.kind === a.kind && !(o.baby > 0) && o.love > 0 && Math.hypot(o.x - a.x, o.y - a.y) < 240);
  if (mate) {
    a.love = mate.love = 0; a.breedCd = mate.breedCd = BREED_CD;
    animals.push(makeAnimal(a.kind, (a.x + mate.x) / 2, (a.y + mate.y) / 2 + 10, { tame: true, home: { x: a.home.x, y: a.home.y }, baby: BABY_TIME }));
    heartsAt(mate);
    say('Một ' + def.name.toLowerCase() + ' con mới vừa ra đời!');
  } else say(def.name + ' đã sẵn sàng. Cho một con ' + def.name.toLowerCase() + ' khác ở gần ăn nữa để nhân giống');
}

// Dựng chuồng: hàng rào 7×6 ô quanh ô bấm, có cổng gỗ ở phía nam
function placePen(tx, ty) {
  if (!(inv.pen > 0)) return;
  if (layer !== 0) { say('Chỉ dựng chuồng ngoài trời được'); return; }
  const L = tx - 3, R = tx + 3, T = ty - 3, B = ty + 2, ring = [];
  for (let x = L; x <= R; x++) for (let y = T; y <= B; y++) if (x === L || x === R || y === T || y === B) ring.push([x, y]);
  // Ô vòng ngoài: cỏ thì dựng rào, vật cản sẵn có (cây, đá, tường...) thì giữ làm tường chuồng; ô đi xuyên qua được (ruộng, thảm...) thì không dựng được
  for (const [x, y] of ring) {
    const t = getTile(x, y);
    const bad = villageAt(x, y) || swampType(x, y) === 2 || isSeaTile(x, y) || chests.some((c) => c.tx === x && c.ty === y) || tileOverlapsPlayer(x, y, 0) || (t !== GRASS && !isSolid(x, y));
    if (bad) { say('Không đủ chỗ dựng chuồng: cần khoảng 7×6 ô, rìa chuồng không có ruộng, nước, làng hay người đứng'); return; }
  }
  const grass = ring.filter(([x, y]) => getTile(x, y) === GRASS);
  const gate = grass.find(([x, y]) => x === tx && y === B) || grass.find(([, y]) => y === B) || grass[0]; // cổng: ưu tiên giữa phía nam
  if (!gate) { say('Rìa chuồng đã kín hết, không còn chỗ làm cổng'); return; }
  for (const [x, y] of grass) {
    const isGate = x === gate[0] && y === gate[1];
    changes.set(x + ',' + y, isGate ? WDOOR : FENCE);
    if (isGate) changes.set('r' + x + ',' + y, 0);
  }
  inv.pen--;
  const c = tileCenter(tx, ty);
  burst(c.x, c.y, '#8a5a2b', 16, 180);
  say('Đã dựng chuồng! Cầm thức ăn để dắt vật nuôi vào, cho ăn để thuần hoá, cổng gỗ mở bằng E');
}

// Bò bị đánh thì nổi giận: lao tới húc người chơi, bỏ cuộc sau một lúc hoặc khi bị bỏ xa
function updateChaser(a, def, dt) {
  const f = def.fight;
  const dx = player.x - a.x, dy = player.y - a.y, d = Math.hypot(dx, dy) || 1;
  a.atkCd = Math.max(0, (a.atkCd || 0) - dt);
  const face = () => { a.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0); };
  if (a.t <= 0 || d > 650) { a.state = 'idle'; a.t = 1 + Math.random() * 2; a.atkT = 0; return; }
  if (a.atkT > 0) {            // đang húc: đòn trúng ở giữa hoạt ảnh
    a.atkT -= dt;
    if (!a.atkHit && a.atkT <= 0.2) {
      a.atkHit = true;
      if (Math.hypot(player.x - a.x, player.y - a.y) < f.range + 14 && lineClear(a.x, a.y, player.x, player.y)) {
        hurt(f.dmg);
        burst(player.x, player.y - 10, '#d9d2c0', 6, 120);
      }
    }
    return;
  }
  face();
  if (d < f.range) {
    if (a.atkCd <= 0) { a.atkT = 0.45; a.atkHit = false; a.atkCd = 1.4; }
    return;
  }
  a.vx = dx / d; a.vy = dy / d;
  moveZombie(a, a.vx * f.speed * dt, a.vy * f.speed * dt);
}

// Động vật người chơi đang nhắm: dưới con trỏ chuột, hoặc ngay trước mặt khi dùng Space
function targetAnimal(camX, camY) {
  if (layer !== 0) return null;
  let best = null, bd = 1e9;
  const mx = mouse.x + camX, my = mouse.y + camY;
  for (const a of animals) {
    const dp = Math.hypot(a.x - player.x, a.y - player.y);
    if (dp > REACH - 10) continue;
    if (!lineClearStrict(player.x, player.y, a.x, a.y)) continue; // có vật chắn giữa: không đánh xuyên được
    let d;
    if (keys['Space']) {
      if ((a.x - player.x) * player.faceX + (a.y - player.y) * player.faceY <= 0) continue;
      d = dp;
    } else {
      if (Math.abs(mx - a.x) > ANIMALS[a.kind].hitW || my < a.y - 44 * (ANIMALS[a.kind].sc || 1) || my > a.y + 16) continue;
      d = Math.hypot(mx - a.x, my - (a.y - 14));
    }
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

function attackAnimal(a, arrowDmg) { // arrowDmg: bị bắn bằng cung (không vung vũ khí)
  const dx = a.x - player.x, dy = a.y - player.y;
  if (arrowDmg === undefined) {
    if (Math.abs(dx) > Math.abs(dy)) { player.faceX = Math.sign(dx); player.faceY = 0; }
    else { player.faceX = 0; player.faceY = Math.sign(dy) || 1; }
  }
  const dmg = arrowDmg !== undefined ? arrowDmg : swingWeapon(a.x, a.y + 4);
  a.hp -= dmg;
  a.barUntil = gameTime + 6; // hiện thanh máu 6 giây sau khi bị đánh
  if (ANIMALS[a.kind].fight && !a.tame) { a.state = 'chase'; a.t = 12; a.atkT = 0; } // bò hoang đánh trả, bò nuôi thì hiền
  else { a.state = 'flee'; a.t = 3; }
  floaters.push({ x: a.x, y: a.y - 50, text: '-' + dmg, life: 0.9, color: '#ffe07a' });
  burst(a.x, a.y - 16, '#c0392b', 7, 150);
  if (a.hp <= 0) killAnimal(a);
}

function killAnimal(a) {
  const def = ANIMALS[a.kind];
  const baby = a.baby > 0;
  const n = baby ? 1 : def.min + Math.floor(Math.random() * (def.max - def.min + 1));
  spawnLoot(def.drop, n, a.x, a.y);
  burst(a.x, a.y - 14, '#d9d2c0', 14, 180);
  if (def.extra && !baby) {
    const m = def.extra.min + Math.floor(Math.random() * (def.extra.max - def.extra.min + 1));
    spawnLoot(def.extra.item, m, a.x, a.y);
  }
  const i = animals.indexOf(a);
  if (i >= 0) animals.splice(i, 1);
}

function drawAnimal(a, camX, camY) {
  const def = ANIMALS[a.kind], img = ASPR[def.img];
  const sx = Math.round(a.x - camX), sy = Math.round(a.y - camY);
  const sc = def.sc || 1; // hệ số thu nhỏ riêng của loài
  const k = a.baby > 0 ? 0.6 : 1; // con non nhỏ hơn
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 12, def.sh * k, def.sh * 0.35 * k, 0, 0, Math.PI * 2); ctx.fill();
  if (a.tame) { ctx.strokeStyle = 'rgba(130,230,130,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy + 12, def.sh * k + 3, def.sh * 0.35 * k + 2, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (!img) { ctx.fillStyle = '#d9d2c0'; ctx.fillRect(sx - 10, sy - 10, 20, 20); return; }
  const moving = a.state !== 'idle';
  const row = (moving ? 0 : 4) + a.dir;
  const nf = moving ? def.walk : def.idle;
  const fps = moving ? (a.state === 'flee' || a.state === 'chase' ? 13 : 8) : 4;
  const frame = Math.floor(a.animT * fps) % nf;
  const S = 2 * k * sc;
  ctx.drawImage(img, frame * def.fw, row * def.fw, def.fw, def.fw, sx - def.ax * S, sy + 12 - def.ay * S, def.fw * S, def.fw * S);
  if (a.barUntil > gameTime && a.hp > 0) { // thanh máu sau khi bị đánh
    const ratio = Math.max(0, a.hp) / def.hp;
    const w = 36, x = sx - w / 2, y = sy - Math.round(def.ay * 1.2 * sc) - 14;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 7);
    ctx.fillStyle = '#7a1c1c'; ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = hpColor(ratio); ctx.fillRect(x, y, w * ratio, 5);
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    shadowText(def.name + ' ' + Math.ceil(Math.max(0, a.hp)) + '/' + def.hp, sx, y - 3, '#fff');
  }
  if (a.state === 'chase') { // dấu "!" đỏ: đang nổi giận
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px sans-serif';
    shadowText('!', sx, sy - 44 + Math.sin(a.animT * 14) * 2, '#ff5a4d');
  }
  if (a.love > 0) { ctx.textAlign = 'center'; ctx.font = 'bold 18px sans-serif'; shadowText('♥', sx, sy - Math.round(def.ay * 1.3 * k * sc) - 8 + Math.sin(a.animT * 5) * 2, '#ff7aa8'); }
  else if (a.milk && !(a.baby > 0)) drawIcon('milk', sx - 10, sy - Math.round(def.ay * 1.3 * k * sc) - 22, 20); // bò có sữa: hiện bình sữa
}

// ---------- Vẽ làng ----------
function drawVillageObj(o, camX, camY) {
  if (o.post) { drawWarriorPost(o, camX, camY); return; }
  if (o.mk) { drawMarketObj(o, camX, camY); return; }
  const img = VIMG[o.img];
  const sx = (o.tx + o.w / 2) * TILE - camX, sy = (o.ty + o.h) * TILE - camY; // giữa đáy
  if (!img) {
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(o.tx * TILE - camX, o.ty * TILE - camY, o.w * TILE, o.h * TILE);
    return;
  }
  const w = img.width * o.s, h = img.height * o.s;
  if (o.solid) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(Math.round(sx - w / 2 + 4), Math.round(sy - 6), w - 8, 10);
  }
  ctx.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h), w, h);
  if (o.blackMarket && blackNight()) drawBlackLantern(sx, sy);
  if (o.market) drawSignPlate(sx, sy - h + 4, 'Giang Thương', '#ffe9b0');
}

// ---------- Vẽ chợ ----------
const MK_STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 0.4 : 1, a = -Math.PI / 2 + i * Math.PI / 5;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

function mkDot(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function mkOval(x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function mkLine(x0, y0, x1, y1, color, width = 1) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }

// Nón lá: tam giác nón (apex trên), có bóng một nửa và vành
function mkCone(cx, baseY, hw, h) {
  ctx.fillStyle = '#ead9a0';
  ctx.beginPath(); ctx.moveTo(cx, baseY - h); ctx.lineTo(cx + hw, baseY); ctx.lineTo(cx - hw, baseY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9b274';
  ctx.beginPath(); ctx.moveTo(cx, baseY - h); ctx.lineTo(cx + hw, baseY); ctx.lineTo(cx, baseY); ctx.closePath(); ctx.fill();
  mkLine(cx - hw, baseY, cx + hw, baseY, '#8a6d3b', 1);
}

function drawVnFlag(x, y, w, h) { // y: đỉnh cột cờ; cờ đỏ sao vàng phấp phới
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x - 1, y, 3, 46);
  const wave = Math.sin(gameTime * 4 + x * 0.05) * 2.5;
  ctx.fillStyle = '#da251d';
  ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.lineTo(x + 2 + w, y + wave); ctx.lineTo(x + 2 + w, y + h + wave); ctx.lineTo(x + 2, y + h); ctx.closePath(); ctx.fill();
  const sx = x + 2 + w / 2, sy = y + h / 2 + wave / 2, r = h * 0.38;
  ctx.fillStyle = '#ffcd00';
  ctx.beginPath();
  MK_STAR.forEach(([px, py], i) => (i ? ctx.lineTo(sx + px * r, sy + py * r) : ctx.moveTo(sx + px * r, sy + py * r)));
  ctx.closePath(); ctx.fill();
}

function drawLantern(x, y, r) { // đèn lồng đỏ
  ctx.fillStyle = '#ffd34d'; ctx.fillRect(x - 3, y - r - 3, 6, 3);
  mkOval(x, y, r * 0.85, r, '#d62d20');
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x - r * 0.35, y - r * 0.7, 2, r * 1.4);
  ctx.fillStyle = '#ffd34d'; ctx.fillRect(x - 3, y + r, 6, 3); ctx.fillRect(x - 1, y + r + 3, 2, 7);
}

function drawMarketObj(o, camX, camY) {
  const bx = Math.round(o.tx * TILE - camX), by = Math.round((o.ty + o.h) * TILE - camY), w = o.w * TILE;
  switch (o.mk) {
    case 'stall': drawMarketStall(o, bx, by, w); break;
    case 'gate': drawMarketGate(bx, by, w); break;
    case 'bike': drawMarketBike(o, bx, by, w); break;
    case 'table': drawMarketTable(bx, by, w); break;
    case 'banyan': drawMarketBanyan(bx, by, w); break;
    case 'crate': drawMarketCrates(o, bx, by, w); break;
    case 'pile': drawMarketPile(o, bx, by, w); break;
    case 'yoke': drawMarketYoke(bx, by, w); break;
    case 'basket': drawMarketBasket(o, bx, by, w); break;
    case 'signpost': drawMarketSignpost(o, bx, by, w); break;
    case 'vradio': // radio có sẵn của làng
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(bx + w / 2, by - 6, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
      drawRadioSprite(bx + w / 2, by - 4, Boolean(o.owner && o.owner.exercise));
      break;
    default: break; // 'none': chỉ là ô đặc (cột cổng đã vẽ trong 'gate')
  }
}

// Nền chợ: đất nện sờn, lác đác lá rau, vũng nước, giấy gói
function drawMarketFloor(tx, ty, hv, bx, by) {
  ctx.fillStyle = hv < 0.33 ? '#b39a6e' : hv < 0.66 ? '#aa9163' : '#b8a074';
  ctx.fillRect(bx, by, TILE + 1, TILE + 1);
  const h2 = hash(tx * 11 + 5, ty * 17 - 9);
  if (h2 > 0.94) { // vũng nước
    ctx.fillStyle = 'rgba(90,110,125,0.45)'; ctx.fillRect(bx + 8, by + 22, 28, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(bx + 12, by + 24, 10, 2);
  } else if (h2 > 0.87) { // lá rau rơi
    ctx.fillStyle = '#4f9a3a'; ctx.fillRect(bx + 14, by + 12, 8, 3); ctx.fillRect(bx + 19, by + 15, 5, 3);
  } else if (h2 > 0.83) { // giấy gói, bao ni lông
    ctx.fillStyle = '#e9e0cf'; ctx.fillRect(bx + 26, by + 30, 8, 5);
  } else if (h2 < 0.08) { // sỏi, bùn khô
    ctx.fillStyle = '#8f7650'; ctx.fillRect(bx + 10, by + 26, 5, 3); ctx.fillRect(bx + 30, by + 10, 4, 3);
  }
}

// Sạp hàng: mái bạt sọc, hai cột tre, đèn lồng, bàn gỗ bày hàng, biển hiệu
function drawMarketStall(o, bx, by, w) {
  const def = MARKET_STALLS[o.kind];
  const [c1, c2] = def.colors;
  const top = by - 122; // mép dưới mái bạt (cao hơn đầu người bán)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(bx + 2, by - 6, w - 4, 10);
  ctx.fillStyle = '#9a7b43'; ctx.fillRect(bx + 3, top, 5, by - top - 8); ctx.fillRect(bx + w - 8, top, 5, by - top - 8);
  drawStallHanging(o.kind, bx, top, w);
  // bàn gỗ
  ctx.fillStyle = '#5e3d1f'; ctx.fillRect(bx + 4, by - 30, w - 8, 26);
  ctx.fillStyle = '#7a4f2a'; ctx.fillRect(bx + 4, by - 30, w - 8, 18);
  ctx.fillStyle = '#a8743c'; ctx.fillRect(bx + 4, by - 32, w - 8, 5);
  drawStallGoods(o.kind, bx, by - 30, w);
  // biển hiệu trước bàn
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  const sw = Math.round(ctx.measureText(def.sign).width) + 14, sx = bx + w / 2;
  ctx.fillStyle = '#2a1608'; ctx.fillRect(Math.round(sx - sw / 2) - 1, by - 27, sw + 2, 18);
  ctx.fillStyle = c1; ctx.fillRect(Math.round(sx - sw / 2), by - 26, sw, 16);
  ctx.fillStyle = def.trade ? '#ffe28a' : '#fff'; ctx.fillText(def.sign, sx, by - 14);
  // mái bạt sọc + diềm lượn sóng
  const n = 8, bw = (w + 12) / n;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    ctx.fillStyle = i % 2 ? c2 : c1;
    ctx.beginPath();
    ctx.moveTo(bx - 6 + (w + 12) * t0, top); ctx.lineTo(bx - 6 + (w + 12) * t1, top);
    ctx.lineTo(bx + 6 + (w - 12) * t1, top - 34); ctx.lineTo(bx + 6 + (w - 12) * t0, top - 34);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(bx - 6 + bw * (i + 0.5), top, bw / 2, 0, Math.PI); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(bx + 6, top - 36, w - 12, 3);
}

function drawStallHanging(kind, bx, top, w) {
  drawLantern(bx + 16, top + 20, 8);
  const xs = [bx + 36, bx + 54, bx + w - 54, bx + w - 36]; // hai bên, chừa giữa cho người bán
  switch (kind) {
    case 'thit':
      for (const x of xs) { mkLine(x, top, x, top + 14, '#8a8a8a'); ctx.fillStyle = '#d96a6a'; ctx.fillRect(x - 5, top + 14, 10, 22); ctx.fillStyle = '#f3b6b6'; ctx.fillRect(x - 5, top + 14, 10, 4); }
      break;
    case 'non':
      for (const x of xs) { mkLine(x, top, x, top + 10, '#8a8a8a'); mkCone(x, top + 32, 10, 20); }
      break;
    case 'vai':
      xs.forEach((x, i) => { ctx.fillStyle = ['#c0392b', '#2e86c1', '#f1c40f', '#8e44ad'][i]; ctx.fillRect(x - 6, top, 12, 38); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 6, top + 6, 12, 3); });
      break;
    case 'traicay':
      for (const x of [xs[0], xs[3]]) { mkLine(x, top, x, top + 8, '#8a8a8a'); ctx.strokeStyle = '#f2c200'; ctx.lineWidth = 4; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x - 6 + i * 6, top + 22, 12, 0.3, Math.PI - 0.3); ctx.stroke(); } }
      break;
    case 'taphoa':
      xs.forEach((x, i) => { mkLine(x, top, x, top + 8, '#8a8a8a'); ctx.fillStyle = ['#e74c3c', '#27ae60', '#f39c12', '#3498db'][i]; ctx.fillRect(x - 6, top + 8, 12, 17); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - 6, top + 12, 12, 4); });
      break;
    case 'banh':
      for (const x of [xs[0], xs[1], xs[2], xs[3]]) { mkLine(x, top, x, top + 12, '#d9c98a'); ctx.fillStyle = '#3f8f3a'; ctx.fillRect(x - 7, top + 12, 14, 14); mkLine(x, top + 12, x, top + 26, '#d9c98a'); mkLine(x - 7, top + 19, x + 7, top + 19, '#d9c98a'); }
      break;
    default: break;
  }
}

function drawStallGoods(kind, bx, gy, w) { // gy: mặt bàn
  const xs = [bx + w * 0.18, bx + w * 0.5, bx + w * 0.82];
  switch (kind) {
    case 'rau': {
      if (NATURE.supplies) { stallCrates(xs, gy, [['b', 8], ['s', 3], ['s', 5]]); break; }
      const cols = ['#3fa34d', '#6cc24a', '#2e7d32'];
      xs.forEach((x, i) => { mkOval(x, gy - 4, 26, 9, '#b98a45'); mkOval(x, gy - 10, 22, 11, cols[i]); mkOval(x - 7, gy - 15, 9, 6, '#7ed56a'); mkDot(x + 9, gy - 13, 3, i === 1 ? '#d62d20' : '#c9e265'); });
      break;
    }
    case 'traicay': {
      if (NATURE.supplies) { stallCrates(xs, gy, [['b', 1], ['b', 2], ['s', 6]]); break; }
      mkOval(xs[0], gy - 4, 24, 8, '#b98a45');
      [[-8, -9], [8, -9], [0, -18]].forEach(([dx, dy]) => { mkDot(xs[0] + dx, gy + dy, 7, '#f08a24'); mkDot(xs[0] + dx - 2, gy + dy - 2, 2, '#f8b45a'); });
      mkDot(xs[1] - 10, gy - 10, 12, '#2f7d3a'); mkLine(xs[1] - 18, gy - 12, xs[1] - 2, gy - 8, '#1f5a28', 2); mkOval(xs[1] + 16, gy - 8, 11, 8, '#e0334a'); mkDot(xs[1] + 14, gy - 9, 1.5, '#222'); mkDot(xs[1] + 19, gy - 7, 1.5, '#222');
      mkOval(xs[2], gy - 4, 24, 8, '#b98a45'); mkDot(xs[2] - 8, gy - 12, 8, '#66b84a'); mkDot(xs[2] + 8, gy - 12, 8, '#e7b93a');
      break;
    }
    case 'ca': {
      xs.forEach((x, i) => {
        mkOval(x, gy - 6, 28, 10, '#2f6fb5'); mkOval(x, gy - 9, 24, 7, '#e8f1fa');
        for (let f = 0; f < 2; f++) { const fx = x - 9 + f * 17, fy = gy - 11 + (i + f) % 2 * 3; mkOval(fx, fy, 9, 4, '#cfd8dc'); ctx.fillStyle = '#9fb0b8'; ctx.beginPath(); ctx.moveTo(fx + 8, fy); ctx.lineTo(fx + 14, fy - 4); ctx.lineTo(fx + 14, fy + 4); ctx.closePath(); ctx.fill(); mkDot(fx - 5, fy - 1, 1.2, '#222'); }
      });
      break;
    }
    case 'thit': {
      mkOval(xs[0], gy - 6, 24, 9, '#9a6a35'); mkOval(xs[0], gy - 9, 20, 7, '#c88a4a');
      ctx.fillStyle = '#e88b8b'; ctx.fillRect(xs[0] - 14, gy - 16, 14, 8); ctx.fillStyle = '#c0392b'; ctx.fillRect(xs[0] + 1, gy - 15, 12, 7);
      ctx.fillStyle = '#e88b8b'; ctx.fillRect(xs[1] - 16, gy - 14, 14, 9); ctx.fillStyle = '#f3b6b6'; ctx.fillRect(xs[1] - 16, gy - 14, 14, 3); ctx.fillStyle = '#c0392b'; ctx.fillRect(xs[1] + 2, gy - 13, 14, 8);
      ctx.fillStyle = '#9aa0ab'; ctx.fillRect(xs[2] - 12, gy - 14, 18, 8); ctx.fillStyle = '#5a3a1e'; ctx.fillRect(xs[2] + 6, gy - 12, 10, 4);
      break;
    }
    case 'banh': {
      ctx.fillStyle = '#9aa0ab'; ctx.fillRect(xs[0] - 14, gy - 22, 28, 20); ctx.fillStyle = '#7d838e'; ctx.fillRect(xs[0] - 16, gy - 26, 32, 6);
      for (let i = 0; i < 3; i++) { const sw = Math.sin(gameTime * 3 + i * 2) * 3; mkLine(xs[0] - 8 + i * 8, gy - 28, xs[0] - 8 + i * 8 + sw, gy - 44, 'rgba(255,255,255,0.55)', 3); }
      [[-9, -9], [9, -9], [0, -20]].forEach(([dx, dy]) => { ctx.fillStyle = '#3f8f3a'; ctx.fillRect(xs[1] + dx - 9, gy + dy - 9, 18, 18); mkLine(xs[1] + dx, gy + dy - 9, xs[1] + dx, gy + dy + 9, '#d9c98a', 1.5); mkLine(xs[1] + dx - 9, gy + dy, xs[1] + dx + 9, gy + dy, '#d9c98a', 1.5); });
      mkOval(xs[2], gy - 5, 24, 8, '#3f8f3a'); [-10, 0, 10].forEach((dx) => mkOval(xs[2] + dx, gy - 10, 7, 5, '#f4efe0'));
      break;
    }
    case 'non': {
      xs.forEach((x, i) => { for (let s = 0; s < 2 + i % 2; s++) mkCone(x + (s - 1) * 14, gy - 2 - s * 3, 15, 18); });
      break;
    }
    case 'vai': {
      const cols = ['#c0392b', '#2e86c1', '#f1c40f', '#8e44ad', '#27ae60', '#e67e22'];
      xs.forEach((x, i) => { for (let s = 0; s < 2; s++) { const px = x - 10 + s * 20; ctx.fillStyle = cols[(i * 2 + s) % cols.length]; ctx.fillRect(px - 8, gy - 26, 16, 24); mkOval(px, gy - 26, 8, 3, 'rgba(255,255,255,0.45)'); } });
      break;
    }
    case 'taphoa': {
      ctx.fillStyle = '#d6e6f2'; ctx.fillRect(xs[0] - 22, gy - 20, 12, 18); ctx.fillStyle = '#c0392b'; ctx.fillRect(xs[0] - 22, gy - 23, 12, 4);
      ctx.fillStyle = '#e9c46a'; ctx.fillRect(xs[0] - 6, gy - 24, 12, 22); ctx.fillStyle = '#8b4a1c'; ctx.fillRect(xs[0] + 10, gy - 20, 12, 18);
      ctx.fillStyle = '#d6e6f2'; ctx.fillRect(xs[1] - 14, gy - 18, 12, 16); ctx.fillStyle = '#27ae60'; ctx.fillRect(xs[1] - 14, gy - 21, 12, 4);
      mkOval(xs[1] + 12, gy - 10, 9, 9, '#a3622c'); mkOval(xs[1] + 12, gy - 18, 8, 3, '#7a4a20');
      mkLine(xs[2] - 14, gy - 22, xs[2] + 14, gy - 26, '#555', 2); mkLine(xs[2], gy - 24, xs[2], gy - 6, '#555', 2); mkOval(xs[2] - 14, gy - 18, 8, 2.5, '#c9c9d0'); mkOval(xs[2] + 14, gy - 22, 8, 2.5, '#c9c9d0');
      break;
    }
    case 'pho': {
      ctx.fillStyle = '#4b4f58'; ctx.fillRect(xs[0] - 18, gy - 26, 36, 22); ctx.fillStyle = '#c0392b'; ctx.fillRect(xs[0] - 18, gy - 16, 36, 4); mkOval(xs[0], gy - 26, 18, 5, '#e9d8a6');
      for (let i = 0; i < 3; i++) { const sw = Math.sin(gameTime * 3 + i * 2) * 3; mkLine(xs[0] - 8 + i * 8, gy - 30, xs[0] - 8 + i * 8 + sw, gy - 48, 'rgba(255,255,255,0.55)', 3); }
      for (let i = 0; i < 3; i++) { mkOval(xs[1], gy - 6 - i * 6, 13, 5, '#f4f4f4'); mkOval(xs[1], gy - 6 - i * 6, 13, 5, 'rgba(40,90,170,0.35)'); }
      mkOval(xs[2], gy - 6, 20, 7, '#b98a45'); mkOval(xs[2] - 6, gy - 12, 9, 6, '#6cc24a'); mkDot(xs[2] + 9, gy - 12, 3, '#d62d20'); mkDot(xs[2] + 14, gy - 10, 3, '#c9e265');
      break;
    }
    default: break;
  }
}

function drawMarketGate(bx, by, w) {
  const pw = 30, ph = 150;
  const lx = bx + 24 - pw / 2, rx = bx + w - 24 - pw / 2; // hai cột trùng với hai ô đặc ở đầu và cuối
  for (const x of [lx, rx]) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 2, by - 8, pw + 8, 12);
    ctx.fillStyle = '#9c4a33'; ctx.fillRect(x, by - ph, pw, ph - 4);
    ctx.fillStyle = '#b86045'; ctx.fillRect(x, by - ph, 6, ph - 4);
    ctx.fillStyle = '#7a3524'; for (let y = by - ph + 12; y < by - 10; y += 14) ctx.fillRect(x, y, pw, 2);
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x - 4, by - ph - 8, pw + 8, 10);
    drawLantern(x + pw / 2, by - ph + 34, 9);
  }
  const hx = lx - 6, hw = rx + pw + 6 - hx, hy = by - ph - 52; // xà ngang + bảng hiệu
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(hx, hy + 38, hw, 8);
  ctx.fillStyle = '#8e1b12'; ctx.fillRect(hx + 14, hy, hw - 28, 40);
  ctx.strokeStyle = '#d7b94a'; ctx.lineWidth = 2; ctx.strokeRect(hx + 18, hy + 4, hw - 36, 32);
  ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#000'; ctx.fillText('CHỢ LÀNG', hx + hw / 2 + 1, hy + 28);
  ctx.fillStyle = '#ffd34d'; ctx.fillText('CHỢ LÀNG', hx + hw / 2, hy + 27);
  ctx.fillStyle = '#6b3a1e'; // mái ngói
  ctx.beginPath(); ctx.moveTo(hx, hy + 4); ctx.lineTo(hx + 24, hy - 24); ctx.lineTo(hx + hw - 24, hy - 24); ctx.lineTo(hx + hw, hy + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a4e2a'; for (let x = hx + 30; x < hx + hw - 30; x += 12) ctx.fillRect(x, hy - 22, 3, 24);
  ctx.fillStyle = '#4a2810'; ctx.fillRect(hx - 2, hy + 2, hw + 4, 4);
  drawVnFlag(hx + 24, hy - 24 - 46, 30, 20);
  drawVnFlag(hx + hw - 24 - 32, hy - 24 - 46, 30, 20);
}

function drawMarketBike(o, bx, by, w) { // xe máy dựng chống chân
  const col = ['#c0392b', '#2c6fb5', '#2b2b30', '#d8d8d8'][o.variant % 4];
  ctx.save();
  ctx.translate(bx + w / 2, by);
  if (o.flip) ctx.scale(-1, 1);
  mkOval(0, -4, 42, 6, 'rgba(0,0,0,0.2)');
  for (const x of [-28, 28]) { mkDot(x, -14, 13, '#1d1d1f'); mkDot(x, -14, 5, '#8a8f99'); }
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(-26, -32); ctx.lineTo(4, -32); ctx.lineTo(14, -22); ctx.lineTo(10, -12); ctx.lineTo(-18, -12); ctx.lineTo(-26, -18); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-24, -31, 26, 3);
  ctx.fillStyle = '#222'; ctx.fillRect(-24, -38, 28, 7);
  mkLine(22, -14, 16, -44, '#444', 3); mkLine(10, -46, 24, -46, '#444', 3); mkLine(24, -46, 28, -52, '#444', 2);
  mkDot(26, -38, 4, '#ffe9a0');
  ctx.fillStyle = '#c8a35a'; ctx.fillRect(18, -42, 14, 10); mkLine(18, -38, 32, -38, '#8a6d3b', 1);   // giỏ xe
  if (o.variant % 2) { ctx.fillStyle = '#e8d28a'; ctx.fillRect(-36, -36, 11, 13); mkLine(-36, -30, -25, -30, '#8a6d3b', 1); } // bọc hàng sau xe
  ctx.restore();
}

function drawMarketTable(bx, by, w) { // bàn nhựa thấp + ghế nhựa đỏ + tô phở
  const cx = bx + w / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(bx + 4, by - 6, w - 8, 9);
  const stool = (x, y) => { ctx.fillStyle = '#b8231a'; ctx.fillRect(x - 8, y - 12, 16, 12); mkOval(x, y - 12, 8, 3.5, '#e84a3c'); };
  stool(bx + 18, by - 30); stool(bx + w - 18, by - 30);
  ctx.fillStyle = '#1f7f78'; ctx.fillRect(cx - 24, by - 34, 48, 6); ctx.fillStyle = '#2f9e8f'; ctx.fillRect(cx - 24, by - 40, 48, 8);
  ctx.fillStyle = '#16615b'; ctx.fillRect(cx - 22, by - 28, 4, 22); ctx.fillRect(cx + 18, by - 28, 4, 22);
  for (const dx of [-11, 11]) { mkOval(cx + dx, by - 41, 8, 3.5, '#f4f4f4'); mkOval(cx + dx, by - 42, 6, 2.5, '#c88a4a'); mkLine(cx + dx - 3, by - 46, cx + dx + 6, by - 41, '#d9c98a', 1); }
  stool(bx + 12, by - 6); stool(bx + w - 12, by - 6);
}

function drawMarketBanyan(bx, by, w) { // cây to đầu chợ (cây cảnh trong caycanh)
  const cx = bx + w / 2;
  if (NATURE.plants) { mkOval(cx, by - 4, 64, 16, 'rgba(0,0,0,0.16)'); drawNature(NATURE_TREES.light, true, cx, by - 2, 2.3); return; }
  mkOval(cx, by - 4, 96, 24, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(cx - 12, by - 80, 24, 76);
  ctx.fillStyle = '#6e4a2b'; ctx.fillRect(cx - 12, by - 80, 7, 76);
  for (const dx of [-34, -20, 22, 36]) mkLine(cx + dx, by - 120, cx + dx * 0.6, by - 6, '#6b4a2a', 3); // rễ phụ buông xuống
  const blobs = [[-52, -118, 44], [-12, -150, 54], [42, -124, 46], [-30, -96, 40], [32, -96, 42], [0, -122, 50]];
  for (const [dx, dy, r] of blobs) mkDot(cx + dx, by + dy, r, '#2a5f2a');
  for (const [dx, dy, r] of blobs) mkDot(cx + dx - 6, by + dy - 8, r * 0.78, '#357a35');
  for (const [dx, dy, r] of blobs) mkDot(cx + dx - 12, by + dy - 14, r * 0.45, '#43913f');
}

function drawMarketYoke(bx, by, w) { // gánh hàng đặt dưới đất
  const cx = bx + w / 2;
  mkOval(cx, by - 5, 44, 7, 'rgba(0,0,0,0.18)');
  mkLine(cx - 46, by - 40, cx + 46, by - 34, '#8a6a3a', 4);
  for (const dx of [-34, 34]) {
    mkLine(cx + dx, by - 38 + (dx > 0 ? 3 : 0), cx + dx - 10, by - 12, '#d9c98a', 1);
    mkLine(cx + dx, by - 38 + (dx > 0 ? 3 : 0), cx + dx + 10, by - 12, '#d9c98a', 1);
    mkOval(cx + dx, by - 10, 17, 8, '#b98a45');
    mkOval(cx + dx, by - 15, 14, 7, dx < 0 ? '#6cc24a' : '#f08a24');
  }
}

function drawMarketBasket(o, bx, by, w) { // thúng / rổ bày hàng dưới đất
  const cx = bx + w / 2;
  mkOval(cx, by - 8, 24, 8, 'rgba(0,0,0,0.18)');
  mkOval(cx, by - 14, 20, 8, '#a67c3d');
  mkOval(cx, by - 19, 16, 8, o.color);
  mkDot(cx - 6, by - 22, 3, 'rgba(255,255,255,0.35)');
}

function drawMarketSignpost(o, bx, by, w) { // biển chỉ đường tới chợ ngoài rìa làng
  const cx = bx + w / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(cx - 12, by - 6, 24, 8);
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(cx - 4, by - 104, 8, 100);
  ctx.save();
  ctx.translate(cx, by - 86); ctx.rotate(o.angle);
  ctx.fillStyle = '#c28a46';
  ctx.beginPath(); ctx.moveTo(-26, -8); ctx.lineTo(14, -8); ctx.lineTo(14, -15); ctx.lineTo(32, 0); ctx.lineTo(14, 15); ctx.lineTo(14, 8); ctx.lineTo(-26, 8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  drawSignPlate(cx, by - 30, 'Chợ · ' + o.dist + ' m', '#ffe9b0');
}

// Biển gỗ có chữ (treo trên quầy / công trình)
function drawSignPlate(cx, topY, text, color) {
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  const w = Math.round(ctx.measureText(text).width) + 20, h = 24;
  const x = Math.round(cx - w / 2), y = Math.round(topY - h);
  ctx.fillStyle = '#3b2412'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#7a4f2a'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = '#000'; ctx.fillText(text, cx + 1, y + 17);
  ctx.fillStyle = color; ctx.fillText(text, cx, y + 16);
  ctx.fillStyle = '#3b2412'; ctx.fillRect(x + 6, y + h + 2, 3, 6); ctx.fillRect(x + w - 9, y + h + 2, 3, 6);
}

// Nón lá đội trên đầu (vẽ trong hệ toạ độ của sprite: gốc ở chân, đã lật theo hướng nhìn)
const VHEAD_TOP = { oldman: 16, oldwoman: 17, man: 14, woman: 15, boy: 23, girl: 24 }; // hàng điểm ảnh cao nhất của đầu
function drawVillagerHat(kind, S) {
  const cx = (12 - 13) * S, by = (VHEAD_TOP[kind] + 1 - 48) * S, hw = 8.5 * S, h = 7 * S;
  mkCone(cx, by, hw, h);
  mkLine(cx - hw * 0.7, by, cx - 1 * S, by + 6 * S, '#c0392b', 1); // quai nón
}

function drawVillager(vl, camX, camY) {
  if (vl.inside) return;
  const spr = VSPR[vl.kind];
  const sx = Math.round(vl.x - camX), sy = Math.round(vl.y - camY);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 12, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
  const moving = vl.state === 'walk';
  const img = spr && (moving ? spr.walk : spr.idle);
  if (img) {
    const frame = Math.floor(vl.animT * (moving ? 9 : 5)) % (moving ? 6 : 4);
    const S = VILLAGER_SCALE;
    ctx.save();
    ctx.translate(sx, sy + 12);
    if (vl.face !== VFACE_DEFAULT) ctx.scale(-1, 1);
    ctx.drawImage(img, frame * 48, 0, 48, 48, -13 * S, -48 * S, 48 * S, 48 * S);
    if (vl.hat) drawVillagerHat(vl.kind, S);
    ctx.restore();
  } else {
    ctx.fillStyle = '#c9a36b';
    ctx.fillRect(sx - 8, sy - 40, 16, 50);
  }
}

// Bong bóng thoại: vẽ sau cùng để mái sạp, nhà, cây không che mất chữ
function drawVillagerBubble(vl, camX, camY) {
  if (vl.inside || !vl.say) return;
  const sx = Math.round(vl.x - camX), sy = Math.round(vl.y - camY);
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(vl.say.text).width + 18, h = 26;
  const bx = sx - w / 2, by = sy - 96;
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx, by, w, h);
  ctx.beginPath(); ctx.moveTo(sx - 5, by + h); ctx.lineTo(sx + 5, by + h); ctx.lineTo(sx, by + h + 7); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, w, h);
  ctx.fillStyle = '#111';
  ctx.fillText(vl.say.text, sx, by + 18);
}

// ---------- Cây Cổ Thụ: công trình hiếm trên mặt đất, hoàn thành 5 nhiệm vụ để nhận thanh Mana ----------
const ELDER = BALANCE.elder;
const ELDER_QUESTS = ELDER.quests;
const MAX_MANA = ELDER.mana.max;
let elderImg = null;
const elderCache = new Map();
const elderQuest = { found: false, accepted: false, step: 0, prog: 0, unlocked: false }; // found: đã gặp cây | step: nhiệm vụ đang làm (0..4) | prog: tiến độ nhiệm vụ đánh quái
let mana = 0;
let elderTimer = 0;

// Hoạt ảnh Cây Cổ Thụ: dải ngang 8 khung (mỗi khung rộng ELDER_FRAME_W), phát qua lại (ping-pong) cho mượt
const ELDER_FRAMES = 8, ELDER_FPS = 7;
let elderAnim = null; // dải hoạt ảnh; nếu tải lỗi thì dùng ảnh tĩnh elderImg
function loadElderSprite() {
  return Promise.all([
    loadImage('assets/elder/elder_tree_anim.webp'),
    loadImage('assets/elder/elder_tree.webp'),
  ]).then(([anim, still]) => { elderAnim = anim; elderImg = still; });
}

function resetElder() {
  elderCache.clear();
  elderQuest.found = false; elderQuest.accepted = false; elderQuest.step = 0; elderQuest.prog = 0; elderQuest.unlocked = false;
  mana = 0;
  if (window.Dwarf) Dwarf.reset();
}

// Chỗ đặt cây hợp lệ: ngoài khu xuất phát, không đè lên làng / chợ / đầm lầy
function elderSiteOk(tx, ty) {
  if (Math.hypot(tx, ty) < 12 || swampType(tx, ty) !== 0 || seaBasin(tx, ty, 10, 10)) return false;
  for (let dy = -8; dy <= 8; dy += 8) for (let dx = -8; dx <= 8; dx += 8) if (villageAt(tx + dx, ty + dy)) return false;
  return true;
}

// Cây Cổ Thụ của một ô lưới: { tx, ty } là ô gốc giữa; thân (gốc) chiếm 3 ô ngang, quanh gốc được dọn sạch cây
function elderForCell(cx, cy) {
  const key = cx + ',' + cy;
  if (elderCache.has(key)) return elderCache.get(key);
  const C = ELDER.cell;
  const forced = cx === 0 && cy === 0;
  let res = null;
  if (forced || hash(cx * 7 + 11, cy * 13 - 5) < ELDER.chance) {
    for (let k = 0; k < 16 && !res; k++) {
      let tx, ty;
      if (forced) { // gần điểm xuất phát để người chơi dễ bắt gặp
        const a = 0.35 + hash(k + 90, 17) * 0.85, d = 28 + hash(k + 91, 18) * 16;
        tx = Math.round(Math.cos(a) * d); ty = Math.round(Math.sin(a) * d);
      } else {
        tx = cx * C + 10 + Math.floor(hash(cx * 31 + k, cy * 17 + 3) * (C - 20));
        ty = cy * C + 10 + Math.floor(hash(cx * 19 - 7, cy * 29 + k) * (C - 20));
      }
      if (elderSiteOk(tx, ty)) res = { key, tx, ty };
    }
  }
  elderCache.set(key, res);
  return res;
}

// Cây Cổ Thụ mà ô (x, y) nằm trong vùng dọn sạch của nó, hoặc null
// Cây Cổ Thụ chỉ hiện ra vào ban đêm (ban ngày không thấy, không vướng đường); độ hiện dần theo độ tối
function elderFade() {
  if (layer !== 0) return 0;
  return Math.max(0, Math.min(1, (outdoorDarkness() - ELDER.nightMin) / 0.15));
}
function elderOpen() { return elderFade() > 0; }

function elderAt(x, y) {
  if (!elderOpen()) return null;
  const C = ELDER.cell;
  const el = elderForCell(Math.floor(x / C), Math.floor(y / C));
  return el && Math.abs(x - el.tx) <= 4 && y >= el.ty - 3 && y <= el.ty + 3 ? el : null;
}

function eldersInView(tx0, ty0, tx1, ty1) {
  const out = [], C = ELDER.cell;
  if (!elderOpen()) return out;
  for (let cy = Math.floor((ty0 - 12) / C); cy <= Math.floor((ty1 + 4) / C); cy++) {
    for (let cx = Math.floor((tx0 - 6) / C); cx <= Math.floor((tx1 + 6) / C); cx++) {
      const el = elderForCell(cx, cy);
      if (el) out.push(el);
    }
  }
  return out;
}

function nearestElder(maxDist) {
  if (layer !== 0) return null;
  let best = null, bd = maxDist;
  for (const el of eldersInView(Math.floor(player.x / TILE), Math.floor(player.y / TILE), Math.floor(player.x / TILE), Math.floor(player.y / TILE))) {
    const d = Math.hypot((el.tx + 0.5) * TILE - player.x, (el.ty + 0.5) * TILE - player.y);
    if (d < bd) { bd = d; best = el; }
  }
  return best;
}

function elderProgress(q) {
  return q.kind === 'give' ? Math.min(q.n, inv[q.item] | 0) : elderQuest.prog;
}

// Gọi khi người chơi hạ được zombie / boss: cộng tiến độ cho nhiệm vụ đang làm
function elderCount(what) {
  if (window.Dwarf) Dwarf.count(what); // nhiệm vụ vòng Sách Hệ
  const q = ELDER_QUESTS[elderQuest.step];
  if (!elderQuest.accepted || elderQuest.unlocked || !q || q.kind !== 'kill' || q.what !== what) return;
  elderQuest.prog = Math.min(q.n, elderQuest.prog + 1);
}

function updateElder(dt) {
  if (elderQuest.unlocked) mana = Math.min(MAX_MANA, mana + ELDER.mana.regen * dt);
  if (layer !== 0 || elderQuest.found) return;
  elderTimer -= dt;
  if (elderTimer > 0) return;
  elderTimer = 0.5;
  if (nearestElder(ELDER.discoverDist * TILE)) {
    elderQuest.found = true;
    say('Bạn tìm thấy Cây Cổ Thụ!');
  }
}

// Nhấn E gần cây: dịch chuyển vào căn phòng của Chú Lùn (nhiệm vụ + Sách Hệ nằm ở dwarf.js)
function enterElderRoom(el) {
  elderQuest.found = true;
  houseRet = { x: (el.tx + 0.5) * TILE, y: (el.ty + 2.5) * TILE };
  houseCur = { obj: { key: 'elder:' + el.key }, bedTiles: [], witchHouse: true, elderRoom: true, elder: el };
  layerStore[2] = null;
  switchLayer(2);
  const c = tileCenter(0, 1);
  player.x = c.x; player.y = c.y;
  player.faceX = 0; player.faceY = -1;
  player.invuln = Math.max(player.invuln, 1);
  const c0 = tileCenter(el.tx, el.ty);
  burst(c0.x, c0.y - 100, '#b46bff', 18, 200, -80);
  say('Bạn được dịch chuyển vào phòng của Chú Lùn');
}

function drawElder(el, camX, camY) {
  const fw = elderAnim ? elderAnim.width / ELDER_FRAMES : 0;
  const src = elderAnim || elderImg;
  if (!src) return;
  const iw = elderAnim ? fw : src.width, ih = src.height;
  const w = ELDER.drawTiles * TILE, h = w * ih / iw;
  const sx = (el.tx + 0.5) * TILE - camX - w / 2, sy = (el.ty + 1) * TILE - camY + 6 - h;
  const fade = elderFade();
  ctx.globalAlpha = fade;
  if (elderAnim) {
    // ping-pong 0..7..1; mỗi cây lệch pha nhau một chút để không đồng loạt
    const n = ELDER_FRAMES, period = 2 * n - 2;
    const t = (((Math.floor(performance.now() / 1000 * ELDER_FPS + (el.tx * 3 + el.ty)) % period) + period) % period); // % của số âm cho khung âm -> không vẽ gì (nhấp nháy) ở cây có toạ độ âm
    const f = t < n ? t : period - t;
    ctx.drawImage(elderAnim, f * fw, 0, fw, ih, Math.round(sx), Math.round(sy), w, h);
  } else {
    ctx.drawImage(elderImg, Math.round(sx), Math.round(sy), w, h);
  }
  ctx.globalAlpha = 1;
}

// ---------- Nhà Phù Thủy: nói chuyện để nhận Sách Phép; có Mana thì sách ghi lại các phép đã học ----------
const WITCH = BALANCE.witch;
const WITCH_FRAMES = 20;
const witchCache = new Map();
const witchSt = { book: false, learned: {}, element: null, owned: {}, unlocked: {} }; // book: đã được ban Sách Phép | learned: { idPhép: true } | owned: Sách Hệ đã nhận từ Chú Lùn { idHệ: true } | unlocked: hệ đã mở khoá ở Nhà Phù Thủy
// Điều kiện mở khoá phép bằng sự kiện (config: unlock.flag): struck = bị sét đánh trúng người · drodStruck = sét đánh trúng Cột Thu Lôi Tím
const witchFlags = { struck: false, drodStruck: false, iceZ: 0, iceX: 0, iceUse: false, elecKill: false, dodgeN: 0, strikeDodge: false, spiderN: 0, spiderKill: false, cureN: 0, antidoteUse: false, stoneRing: false, stoneN: 0, stoneBlock: false, windN: 0, windKill: false, potionN: 0, potionUse: false, nightN: 0, nightKill: false, shieldN: 0, shieldBlock: false, lowHpKill: false, zombieN: 0, zombieKill: false, flowerN: 0, flowerKill: false, chopN: 0, chopKill: false, plantN: 0, plantKill: false, harvestN: 0, harvestKill: false, walkN: 0, walkKill: false, meleeN: 0, meleeKill: false }; // dodgeN: số lần né vùng sét; strikeDodge: đủ 3 lần thì được học Lôi Bộ // iceZ / iceX: số lần đã dùng Băng Tiễn / Hàn Vực; iceUse: đủ 5 + 5 thì được học Băng Kính
const spellT = { wind: 0, shield: 0 };        // thời gian còn lại của các phép có hiệu lực
const spellCd = { heal: 0, wind: 0, shield: 0 }; // hồi chiêu các phép hệ Thường (giây còn lại)
let witchAnim = null;

function loadWitchSprite() {
  return loadImage('assets/elder/witch_house_anim.webp').then((img) => { witchAnim = img; });
}

function resetWitch() {
  witchCache.clear();
  witchCleared = null;
  witchSt.book = false; witchSt.learned = {}; witchSt.element = null; witchSt.owned = {}; witchSt.unlocked = {};
  witchFlags.struck = false; witchFlags.drodStruck = false; witchFlags.iceZ = 0; witchFlags.iceX = 0; witchFlags.iceUse = false; witchFlags.elecKill = false; witchFlags.dodgeN = 0; witchFlags.strikeDodge = false; witchFlags.spiderN = 0; witchFlags.spiderKill = false; witchFlags.cureN = 0; witchFlags.antidoteUse = false; witchFlags.stoneRing = false; witchFlags.stoneN = 0; witchFlags.stoneBlock = false; witchFlags.windN = 0; witchFlags.windKill = false; witchFlags.potionN = 0; witchFlags.potionUse = false; witchFlags.nightN = 0; witchFlags.nightKill = false; witchFlags.shieldN = 0; witchFlags.shieldBlock = false; witchFlags.lowHpKill = false; witchFlags.zombieN = 0; witchFlags.zombieKill = false; witchFlags.flowerN = 0; witchFlags.flowerKill = false; witchFlags.chopN = 0; witchFlags.chopKill = false; witchFlags.plantN = 0; witchFlags.plantKill = false; witchFlags.harvestN = 0; witchFlags.harvestKill = false; witchFlags.meleeN = 0; witchFlags.meleeKill = false; witchFlags.walkN = 0; witchFlags.walkKill = false; walkNote = 0; walkPrev = null;
  spellT.wind = 0; spellT.shield = 0;
  for (const k in spellCd) spellCd[k] = 0;
  if (window.FireMagic) FireMagic.reset();
  if (window.Magma) Magma.reset();
  if (window.VolcBoss) VolcBoss.reset();
  if (window.FinalBoss) FinalBoss.reset();
  if (window.IceMagic) IceMagic.reset();
  if (window.ArcaneMagic) ArcaneMagic.reset();
  if (window.ExtraMagic) ExtraMagic.reset();
}

function witchSiteOk(tx, ty) {
  if (Math.hypot(tx, ty) < 10 || swampType(tx, ty) !== 0 || seaBasin(tx, ty, 10, 10)) return false;
  for (let dy = -8; dy <= 8; dy += 8) for (let dx = -8; dx <= 8; dx += 8) if (villageAt(tx + dx, ty + dy)) return false;
  const C = ELDER.cell; // tránh đè lên Cây Cổ Thụ
  for (let cy = Math.floor(ty / C) - 1; cy <= Math.floor(ty / C) + 1; cy++) for (let cx = Math.floor(tx / C) - 1; cx <= Math.floor(tx / C) + 1; cx++) {
    const el = elderForCell(cx, cy);
    if (el && Math.hypot(el.tx - tx, el.ty - ty) < 14) return false;
  }
  return true;
}

// Nhà Phù Thủy của một ô lưới: { tx, ty } là ô giữa hàng chân nhà; chân nhà chiếm 5 ô ngang, quanh nhà dọn sạch cây
function witchForCell(cx, cy) {
  const key = cx + ',' + cy;
  if (witchCache.has(key)) return witchCache.get(key);
  const C = WITCH.cell, forced = cx === 0 && cy === 0;
  let res = null;
  if (forced || hash(cx * 17 + 5, cy * 23 + 9) < WITCH.chance) {
    for (let k = 0; k < 16 && !res; k++) {
      let tx, ty;
      if (forced) { // gần điểm xuất phát (hướng khác Cây Cổ Thụ)
        // phải nằm TRONG ô lưới (0,0) (x, y ≥ 6) thì witchAt/witchesInView mới tìm thấy nhà
        tx = 6 + Math.floor(hash(k + 190, 27) * 24); ty = 6 + Math.floor(hash(k + 191, 28) * 24);
        if (Math.hypot(tx, ty) < 18) continue;
      } else {
        tx = cx * C + 10 + Math.floor(hash(cx * 41 + k, cy * 37 + 3) * (C - 20));
        ty = cy * C + 10 + Math.floor(hash(cx * 29 - 7, cy * 43 + k) * (C - 20));
      }
      if (witchSiteOk(tx, ty)) res = { key, tx, ty };
    }
  }
  witchCache.set(key, res);
  return res;
}

function witchAt(x, y) {
  if (layer !== 0 || !elderQuest.unlocked) return null; // Nhà Phù Thủy chỉ xuất hiện sau khi hoàn thành nhiệm vụ Cây Cổ Thụ
  const C = WITCH.cell;
  const w = witchForCell(Math.floor(x / C), Math.floor(y / C));
  return w && Math.abs(x - w.tx) <= 8 && y >= w.ty - 4 && y <= w.ty + 10 ? w : null; // vùng dọn sạch cây: nhà + sân trang trí phía Nam
}

function witchesInView(tx0, ty0, tx1, ty1) {
  const out = [], C = WITCH.cell;
  if (layer !== 0 || !elderQuest.unlocked) return out;
  for (let cy = Math.floor((ty0 - 10) / C); cy <= Math.floor((ty1 + 4) / C); cy++) {
    for (let cx = Math.floor((tx0 - 6) / C); cx <= Math.floor((tx1 + 6) / C); cx++) {
      const w = witchForCell(cx, cy);
      if (w) out.push(w);
    }
  }
  return out;
}

function nearestWitch(maxDist) {
  if (layer !== 0 || !elderQuest.unlocked) return null;
  const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE);
  let best = null, bd = maxDist;
  for (const w of witchesInView(px, py, px, py)) {
    const d = Math.hypot((w.tx + 0.5) * TILE - player.x, (w.ty + 0.5) * TILE - player.y);
    if (d < bd) { bd = d; best = w; }
  }
  return best;
}

// Nhà Phù Thủy gần nhất ở bất kỳ đâu quanh người chơi (không giới hạn tầm nhìn) — dùng cho gợi ý chỉ đường
function nearestWitchAny() {
  if (layer !== 0 || !elderQuest.unlocked) return null;
  const C = WITCH.cell, pcx = Math.floor(player.x / TILE / C), pcy = Math.floor(player.y / TILE / C);
  let best = null, bd = Infinity;
  for (let cy = pcy - 3; cy <= pcy + 3; cy++) for (let cx = pcx - 3; cx <= pcx + 3; cx++) {
    const w = witchForCell(cx, cy);
    if (!w) continue;
    const d = Math.hypot((w.tx + 0.5) * TILE - player.x, (w.ty + 0.5) * TILE - player.y);
    if (d < bd) { bd = d; best = w; }
  }
  return best;
}

// Hướng + khoảng cách từ người chơi tới nhà: { ang (rad, 0 = Đông, y xuống), name, tiles }
function witchHintDir(w) {
  const dx = (w.tx + 0.5) * TILE - player.x, dy = (w.ty + 0.5) * TILE - player.y;
  const ang = Math.atan2(dy, dx);
  const names = ['Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc', 'Bắc', 'Đông Bắc'];
  return { ang, name: names[(Math.round(ang / (Math.PI / 4)) + 8) % 8], tiles: Math.round(Math.hypot(dx, dy) / TILE) };
}

function witchSkill(id) { return WITCH.skills.find((s) => s.id === id); }

function talkWitch() {
  if (!witchSt.book) { // lần nói chuyện đầu tiên: ban Sách Phép (rồi mở khoá luôn Sách Hệ nếu đang có)
    witchSt.book = true;
    say('Phù Thủy: Chào lữ khách! Ta ban cho con Sách Phép');
    burst(player.x, player.y - 30, '#c9a0ff', 16, 120, -80);
    if (!(window.Dwarf && Dwarf.pending().length)) return;
  }
  if (window.Dwarf && Dwarf.unlockAtWitch()) return; // có Sách Hệ chưa mở khoá: mở khoá → rồi mới chọn hệ
  if (window.ElementPick) ElementPick.open();
}

// Mua (học) một phép ở bảng mua phép của ông phù thủy. Trả về true nếu mua được.
function buySpell(id) {
  const s = witchSkill(id);
  if (!s || witchSt.learned[id]) return false;
  if (!elderQuest.unlocked) { say('Phù Thủy: Khi con có Mana (nhiệm vụ Chú Lùn ở Cây Cổ Thụ), ta sẽ dạy phép cho con'); return false; }
  if (s.el && !witchSt.unlocked[s.el]) { say('Phù Thủy: Hệ này chưa được mở khoá — hãy lấy Sách Hệ từ Chú Lùn'); return false; }
  if (s.unlock && s.unlock.flag) { // học bằng sự kiện đã xảy ra (vd. bị sét đánh 1 lần), không tốn gì
    if (!witchFlags[s.unlock.flag]) { say('Phù Thủy: Muốn học "' + s.name + '" con phải: ' + s.unlock.text.toLowerCase()); return false; }
  } else if (s.unlock) { // học bằng vật phẩm, không tốn ngọc (vd. Hỏa Cầu: dâng 1 Hoa Sen Lửa)
    const it = ITEMS[s.unlock.item];
    if (inv[s.unlock.item] < s.unlock.n) { say('Phù Thủy: Muốn học "' + s.name + '" con cần ' + s.unlock.n + ' ' + it.name.toLowerCase() + ' — ' + it.how); return false; }
    if (s.unlock.item2 && inv[s.unlock.item2] < s.unlock.n2) { const it2 = ITEMS[s.unlock.item2]; say('Phù Thủy: Muốn học "' + s.name + '" con còn cần ' + s.unlock.n2 + ' ' + it2.name.toLowerCase() + ' — ' + it2.how); return false; }
    inv[s.unlock.item] -= s.unlock.n;
    if (s.unlock.item2) inv[s.unlock.item2] -= s.unlock.n2;
  } else if (s.soon) { say('Phù Thủy: Phép "' + s.name + '" ta chưa dạy được, con hãy quay lại sau'); return false; }
  else {
    if (inv.emerald < s.cost) { say('Phù Thủy: Phép "' + s.name + '" tốn ' + s.cost + ' ngọc lục bảo (con có ' + inv.emerald + ')'); return false; }
    inv.emerald -= s.cost;
  }
  witchSt.learned[id] = true;
  say('Đã học phép "' + s.name + '"!');
  burst(player.x, player.y - 30, '#7fd0ff', 18, 140, -90);
  return true;
}

function castSpell(id) {
  const s = witchSkill(id);
  if (!s || !witchSt.learned[id]) return;
  if (!elderQuest.unlocked || mana < s.mana) { say('Không đủ Mana cho "' + s.name + '" (cần ' + s.mana + ')'); return; }
  if (s.el === 'fire') {
    if (!window.FireMagic || !FireMagic.cast(s)) return; // hồi chiêu / không dùng được: không trừ mana
  } else if (s.el === 'ice') {
    if (!window.IceMagic || !IceMagic.cast(s)) return;
  } else if (s.el === 'arcane') {
    if (!window.ArcaneMagic || !ArcaneMagic.cast(s)) return;
  } else if (window.ExtraMagic && ExtraMagic.owns(s.el)) { // Sét / Độc / Đất / Gió / Thánh Quang / Hắc Ám
    if (!ExtraMagic.cast(s)) return;
  } else {
    // Phép hệ Thường: kiểm tra hồi chiêu trước khi dùng
    if (spellCd[id] > 0) { say('"' + s.name + '" còn hồi chiêu ' + Math.ceil(spellCd[id]) + ' giây'); return; }
    if (id === 'heal' && player.hp >= MAX_HP) { say('Máu đã đầy'); return; }
    spellCd[id] = s.cd;
  }
  if (id === 'heal') {
    player.hp = Math.min(MAX_HP, player.hp + s.heal);
    floaters.push({ x: player.x, y: player.y - 50, text: '+' + s.heal, life: 1.2, color: '#4cd964' });
    burst(player.x, player.y - 10, '#4cd964', 14, 120, -80);
  } else if (id === 'wind') {
    spellT.wind = s.dur;
    burst(player.x, player.y - 10, '#bfe9ff', 12, 160, -40);
  } else if (id === 'shield') {
    spellT.shield = s.dur;
    burst(player.x, player.y - 20, '#8ab4ff', 14, 130, -60);
  }
  mana -= s.mana;
}

function castSpellKey(code) {
  if (!witchSt.book) return;
  const hold = () => { if (window.BookHold) BookHold.trigger(); }; // bấm phím phép: nhân vật rút Sách Hệ ra cầm
  if (window.FireMagic && FireMagic.key(code)) { hold(); return; } // hệ Lửa đang bật: Z X C V là phép lửa
  if (window.IceMagic && IceMagic.key(code)) { hold(); return; }  // hệ Băng đang bật: Z X C V là phép băng
  if (window.ArcaneMagic && ArcaneMagic.key(code)) { hold(); return; } // hệ Không Gian đang bật: Z X C V là phép không gian
  if (window.ExtraMagic && ExtraMagic.key(code)) { hold(); return; }   // 6 hệ mới đang bật: Z X C V là phép của hệ đó
  const s = WITCH.skills.find((k) => 'Key' + k.key === code && !k.el);
  if (s) castSpell(s.id);
}

// Nhà Phù Thủy vừa xuất hiện (xong nhiệm vụ Cây Cổ Thụ): diệt sạch quái quanh nhà (sân + vùng lân cận)
let witchCleared = null; // null = chưa biết (khung hình đầu: lấy theo trạng thái đã tải) | false = chờ xoá | true = đã xoá
const WITCH_CLEAR_R = 16 * TILE;
function clearWitchSurroundings() {
  const C = WITCH.cell, pcx = Math.floor(player.x / TILE / C), pcy = Math.floor(player.y / TILE / C);
  let n = 0;
  for (let cy = pcy - 3; cy <= pcy + 3; cy++) for (let cx = pcx - 3; cx <= pcx + 3; cx++) {
    const w = witchForCell(cx, cy);
    if (!w) continue;
    const hx = (w.tx + 0.5) * TILE, hy = (w.ty + 3) * TILE; // tâm sân
    for (const z of zombies.slice()) {
      if (z.dead || z.boss || z.guard || Math.hypot(z.x - hx, z.y - hy) > WITCH_CLEAR_R) continue;
      z.noDrop = true; killZombie(z); n++;
    }
    for (const sp of spiders.slice()) {
      if (sp.dead || Math.hypot(sp.x - hx, sp.y - hy) > WITCH_CLEAR_R) continue;
      killSpider(sp); n++;
    }
  }
  if (n) say('Nhà Phù Thủy xuất hiện, quái xung quanh đã bị quét sạch (' + n + ')');
  return n;
}

function updateWitch(dt) {
  if (witchCleared === null) witchCleared = elderQuest.unlocked; // vừa tải game đã mở khoá thì không quét
  if (!witchCleared && elderQuest.unlocked && layer === 0) { witchCleared = true; clearWitchSurroundings(); }
  if (!elderQuest.unlocked) witchCleared = false;
  spellT.wind = Math.max(0, spellT.wind - dt);
  spellT.shield = Math.max(0, spellT.shield - dt);
  for (const k in spellCd) spellCd[k] = Math.max(0, spellCd[k] - dt);
}

function drawWitch(w, camX, camY) {
  if (!witchAnim) return;
  const fw = witchAnim.width / WITCH_FRAMES, ih = witchAnim.height;
  const dw = Math.round(WITCH.drawTiles * TILE), dh = Math.round(dw * ih / fw); // làm tròn để không rung khi thu nhỏ
  const sx = (w.tx + 0.5) * TILE - camX - dw / 2, sy = (w.ty + 1) * TILE - camY + 6 - dh;
  const f = ((Math.floor(performance.now() / 1000 * WITCH.fps + (w.tx * 3 + w.ty)) % WITCH_FRAMES) + WITCH_FRAMES) % WITCH_FRAMES;
  ctx.drawImage(witchAnim, f * fw, 0, fw, ih, Math.round(sx), Math.round(sy), dw, dh);
}

// ---------- Trang trí quanh Nhà Phù Thủy (sprite cắt từ bộ đồ phù thủy, thư mục assets/witch_deco) ----------
// Mỗi mục: [tên, dx, dy, ô đặc]. dx, dy tính bằng ô so với ô giữa chân nhà; dy > 0 là phía Nam (cửa nhà quay ra đó).
// ô đặc: 1 = chiếm đúng ô (floor dx, dy) | [[dx, dy], ...] = các ô cụ thể | bỏ trống = đi xuyên qua được
const WD_NAMES = ['pillar1', 'pillar2', 'pillar3', 'pillar_small', 'crystal_pair', 'crystal_big', 'cauldron', 'orb_stool', 'orb_pedestal', 'potion', 'book',
  'lamp_post', 'banner_post', 'barrel', 'crate1', 'crate2', 'well_small', 'well', 'wall', 'fence', 'fence_short', 'post_tall', 'post_short', 'arch',
  'flowers1', 'flowers2', 'flowers3', 'flowers4', 'flowers5', 'rocks', 'bush1', 'bush2', 'bush3', 'bush4', 'bush5', 'mush_red', 'mush_purple',
  'plant1', 'plant2', 'plant3', 'plant4', 'moss1', 'moss2', 'bfly_blue', 'bfly_purple', 'bfly_blue2', 'bfly_yellow', 'bfly_purple2', 'spark1', 'spark2']
  .concat(Array.from({ length: 18 }, (_, i) => 'stone' + (i + 1)));
const WDIMG = {};
function loadWitchDeco() {
  return Promise.all(WD_NAMES.map((n) => loadImage('assets/witch_deco/' + n + '.webp').then((img) => { if (img) WDIMG[n] = img; })));
}
const WD_LAYOUT = [
  // lối vào: hai trụ pha lê cạnh cửa, đèn lồng, cờ phù thủy
  ['pillar1', -2, 1, 1], ['pillar2', 2, 1, 1],
  ['lamp_post', -3, 3, 1], ['banner_post', 3, 3, 1],
  // cổng vòm + tường rào phía Nam
  ['arch', 0, 7, [[-1, 7], [1, 7]]],
  ['pillar3', -2, 7, 1], ['pillar3', 2, 7, 1],
  ['fence', -3.5, 7, [[-4, 7], [-3, 7]]], ['fence', 3.5, 7, [[3, 7], [4, 7]]],
  ['wall', -5.2, 7, [[-5, 7]]], ['wall', -6.2, 7, [[-6, 7]]], ['wall', 5.2, 7, [[5, 7]]], ['wall', 6.2, 7, [[6, 7]]], // tường đá nối liền hàng rào gỗ với nhau
  // phía Tây: giếng, vạc thuốc, quả cầu, sách
  ['well', -5, 2, 1], ['cauldron', -4, 5, 1], ['orb_stool', -5.2, 4.6, 0], ['book', -6.2, 3.2], ['potion', -3.1, 4.6],
  // phía Đông: kho đồ, cột đá, quả cầu
  ['barrel', 6, 1, 1], ['crate1', 5, 2, 1], ['crate2', 6, 2.6, 1], ['orb_pedestal', 4, 5, 1], ['post_tall', 5.4, 4.2], ['post_short', 6.2, 4.9],
  // tinh thể hai bên nhà
  ['crystal_big', -6.1, 0.8], ['crystal_pair', 7.3, -0.4], ['pillar_small', -4.1, 0.9], ['pillar_small', 4.2, 0.9],
  // bụi cây, hoa, nấm, cỏ
  ['bush3', -5.8, -1.2], ['bush5', 5.8, -1.4], ['bush1', -6.4, 1.6], ['bush4', 6.9, 1.2], ['bush2', -2.8, 6.4], ['bush3', 2.8, 6.4],
  ['flowers3', -2.0, 4.1], ['flowers4', 2.0, 4.3], ['flowers5', -1.4, 6.2], ['flowers2', 1.5, 6.3],
  ['flowers3', -4.7, 6.4], ['flowers1', 4.8, 6.5], ['flowers4', -3.4, 8.0], ['flowers5', 3.4, 8.1],
  ['rocks', 5.4, 5.8], ['rocks', -6.1, 5.7], ['moss1', -4.4, 8.0], ['moss2', 4.6, 8.1],
  ['mush_red', -4.2, 3.0], ['mush_purple', 4.3, 3.6], ['mush_red', 2.2, 5.9], ['mush_purple', -2.4, 5.6],
  ['plant3', -1.6, 2.3], ['plant1', 1.7, 3.0], ['plant4', -1.5, 4.9], ['plant2', 1.6, 5.4], ['plant3', -5.2, 3.4], ['plant1', 5.3, 3.3],
];
// Hàng rào bao quanh sân (chỉ chừa cổng vòm phía Nam): cạnh Bắc, hai cạnh Đông - Tây, nối với hàng rào Nam
for (const c of [-6.9, -4.6, -2.3, 0, 2.3, 4.6, 6.9]) WD_LAYOUT.push(['fence', c, -4, [-1, 0, 1].map((k) => [Math.round(c + k), -4])]);
for (let dy = -3; dy <= 7; dy++) for (const sx of [-8, 8]) WD_LAYOUT.push(['fence_short', sx, dy, 1]);
for (const sx of [-7, 7]) WD_LAYOUT.push(['fence_short', sx, 7, 1]);
// Độ sáng ban đêm: tên → bán kính ánh sáng (px) và độ cao điểm sáng so với đáy hình (0 = đáy, 1 = đỉnh)
const WD_LIGHT = { lamp_post: [150, 0.7], arch: [130, 0.45], pillar1: [90, 0.85], pillar2: [90, 0.85], pillar3: [90, 0.85], cauldron: [100, 0.7], orb_stool: [70, 0.7], orb_pedestal: [70, 0.7], crystal_pair: [70, 0.5], crystal_big: [70, 0.5] };

function wdHash(a, b) { return hash(a * 31 + 7, b * 17 + 3); }

// Tạo (một lần) danh sách trang trí của một nhà: sprite theo hàng để vẽ có chiều sâu, đá lát đường (vẽ sát đất), ô đặc, bướm
function witchDecor(w) {
  if (w.decor) return w.decor;
  const flip = wdHash(w.tx, w.ty) < 0.5 ? -1 : 1; // lật trái-phải ngẫu nhiên cho mỗi nhà đỡ giống nhau
  const rows = new Map(), solid = new Set(), lights = [], ground = [];
  const bx = (w.tx + 0.5) * TILE;
  const put = (name, dx, dy, s) => {
    const img = WDIMG[name]; if (!img) return;
    const x = bx + dx * flip * TILE, yb = (w.ty + dy + 1) * TILE - 6;
    const row = Math.floor(yb / TILE);
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push({ img, x, yb });
    if (WD_LIGHT[name]) lights.push({ x, y: yb - img.height * WD_LIGHT[name][1], r: WD_LIGHT[name][0] });
    if (s) for (const t of (s === 1 ? [[Math.floor(dx), Math.floor(dy)]] : s)) solid.add((w.tx + t[0] * flip) + ',' + (w.ty + t[1]));
  };
  for (const e of WD_LAYOUT) put(e[0], e[1], e[2], e[3]);
  // lối đá lát từ cửa nhà tới cổng vòm: mỗi bậc 2-3 viên, lệch nhẹ cho tự nhiên
  for (let i = 0; i < 7; i++) {
    for (let j = -1; j <= 1; j++) {
      if (wdHash(w.tx + i * 5 + j, w.ty + 11) < 0.15) continue;
      const n = 1 + Math.floor(wdHash(w.tx + i, w.ty + j * 9) * 18), img = WDIMG['stone' + n];
      if (!img) continue;
      const jx = (wdHash(w.tx + i * 3, w.ty + j) - 0.5) * 12, jy = (wdHash(w.tx - i, w.ty + j * 4) - 0.5) * 10;
      ground.push({ img, x: bx + j * 24 + jx, yb: (w.ty + 1.25 + i * 0.84) * TILE + jy });
    }
  }
  // bướm + tia sáng bay quanh nhà
  const fl = ['bfly_blue', 'bfly_purple', 'bfly_yellow', 'bfly_blue2', 'bfly_purple2', 'spark1', 'spark2'].map((n, i) => ({
    img: WDIMG[n], cx: bx + (wdHash(w.tx + i, 5) - 0.5) * 8 * TILE, cy: (w.ty + 1 + (wdHash(w.ty + i, 9) - 0.3) * 6) * TILE - 60,
    r: 30 + wdHash(i, w.tx) * 50, sp: 0.5 + wdHash(w.ty, i) * 0.7, ph: wdHash(i, 77) * 6.28, spark: i >= 5,
  })).filter((f) => f.img);
  return (w.decor = { rows, solid, lights, ground, flyers: fl });
}

function witchDecorSolid(w, x, y) { return witchDecor(w).solid.has(x + ',' + y); }

function drawWitchGround(witches, camX, camY) {
  for (const w of witches) for (const g of witchDecor(w).ground) ctx.drawImage(g.img, Math.round(g.x - g.img.width / 2 - camX), Math.round(g.yb - g.img.height - camY));
}

function drawWitchDecorRow(w, ty, camX, camY) {
  const L = witchDecor(w).rows.get(ty);
  if (!L) return;
  for (const d of L) ctx.drawImage(d.img, Math.round(d.x - d.img.width / 2 - camX), Math.round(d.yb - d.img.height - camY));
}

function drawWitchFlyers(witches, camX, camY) {
  const t = performance.now() / 1000;
  for (const w of witches) for (const f of witchDecor(w).flyers) {
    const a = t * f.sp + f.ph;
    const x = f.cx + Math.cos(a) * f.r, y = f.cy + Math.sin(a * 1.7) * f.r * 0.45 + Math.sin(t * 3 + f.ph) * 4;
    const iw = f.img.width, ih = f.img.height;
    if (f.spark) { ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4 + f.ph); ctx.drawImage(f.img, Math.round(x - iw / 2 - camX), Math.round(y - ih / 2 - camY)); ctx.globalAlpha = 1; continue; }
    const fw = iw * (0.45 + 0.55 * Math.abs(Math.sin(t * 9 + f.ph))); // vỗ cánh: co giãn bề ngang
    ctx.drawImage(f.img, Math.round(x - fw / 2 - camX), Math.round(y - ih / 2 - camY), Math.round(fw), ih);
  }
}

// ---------- Hoa Hắc Ám: chỉ nở ban đêm quanh nhà Phù Thủy, nhặt đủ 10 bông để học Hắc Vực (X, hệ Hắc Ám) ----------
const DARKFLOWER_SPOTS = 12, DARKFLOWER_PICK = 30;
const darkFlowers = new Map(); // witch.key -> [{ x, y }] — mỗi đêm mọc lại; sáng ra thì biến mất
let _darkFlowerImg = null, darkFlowerHinted = false;
function darkFlowerImg() { if (!_darkFlowerImg) { _darkFlowerImg = false; loadImage('assets/items/dark_flower.webp').then((i) => { _darkFlowerImg = i; }); } return _darkFlowerImg || null; }
function darkFlowerSpots(w) {
  const out = [];
  for (let k = 0; k < 80 && out.length < DARKFLOWER_SPOTS; k++) {
    const dx = Math.floor(hash(w.tx * 7 + k, w.ty * 3 + 11) * 19) - 9, dy = Math.floor(hash(w.tx * 5 - k, w.ty * 9 + 4) * 13) - 3; // quanh nhà: ngang -9..9, dọc -3..9
    if (Math.abs(dx) <= 4 && dy <= 1) continue; // thân nhà + ô đặc chân nhà
    const tx = w.tx + dx, ty = w.ty + dy;
    if (getTile(tx, ty) !== GRASS || isSolid(tx, ty) || out.some((o) => o.tx === tx && o.ty === ty)) continue;
    out.push({ tx, ty, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, ph: hash(tx, ty) * 6.28 });
  }
  return out;
}
function darkFlowerAlpha() { return Math.min(1, Math.max(0, (outdoorDarkness() - 0.22) / 0.12)); }
function updateDarkFlowers(dt) {
  if (layer !== 0 || outsideTick) return;
  if (!blackNight()) { if (darkFlowers.size) darkFlowers.clear(); return; } // trời sáng: hoa tàn
  if (witchFlags.flowerKill) return;
  const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE);
  for (const w of witchesInView(px - 8, py - 8, px + 8, py + 8)) {
    if (!darkFlowers.has(w.key)) darkFlowers.set(w.key, darkFlowerSpots(w));
    if (!darkFlowerHinted && Math.hypot((w.tx + 0.5) * TILE - player.x, (w.ty + 0.5) * TILE - player.y) < 12 * TILE) { darkFlowerHinted = true; say('Những bông Hoa Hắc Ám đang nở quanh nhà Phù Thủy... chỉ nở ban đêm'); }
    const L = darkFlowers.get(w.key);
    for (let i = L.length - 1; i >= 0; i--) {
      if (Math.hypot(L[i].x - player.x, L[i].y - player.y) > DARKFLOWER_PICK) continue;
      burst(L[i].x, L[i].y - 14, '#b060ff', 10, 120, -60);
      L.splice(i, 1);
      witchFlags.flowerN = Math.min(10, witchFlags.flowerN + 1);
      floaters.push({ x: player.x, y: player.y - 74, text: 'Hoa Hắc Ám ' + witchFlags.flowerN + '/10', life: 1.4, color: '#c58aff' });
      if (witchFlags.flowerN >= 10) { witchFlags.flowerKill = true; say('Đã thu thập 10 Hoa Hắc Ám! Phù Thủy có thể dạy Hắc Vực'); darkFlowers.clear(); return; }
    }
  }
}
function drawDarkFlowers(witches, camX, camY) {
  const a = darkFlowerAlpha();
  if (a <= 0 || !darkFlowers.size) return;
  const img = darkFlowerImg(), t = performance.now() / 1000;
  for (const w of witches) for (const f of darkFlowers.get(w.key) || []) {
    const sx = Math.round(f.x - camX), sy = Math.round(f.y - camY), pulse = 0.75 + 0.25 * Math.sin(t * 3 + f.ph);
    ctx.save(); ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(sx, sy - 8, 2, sx, sy - 8, 30);
    g.addColorStop(0, 'rgba(190,100,255,' + (0.45 * pulse) + ')'); g.addColorStop(1, 'rgba(120,40,200,0)');
    ctx.fillStyle = g; ctx.fillRect(sx - 30, sy - 38, 60, 60);
    if (img) { const sc = 34 / img.height; ctx.drawImage(img, Math.round(sx - img.width * sc / 2), Math.round(sy + 8 - img.height * sc), Math.round(img.width * sc), 34); }
    else { ctx.fillStyle = '#7a2fd0'; ctx.beginPath(); ctx.arc(sx, sy - 10, 8, 0, 6.28); ctx.fill(); }
    ctx.restore();
  }
}

// Giao diện Sách Phép (phím K)
function drawSpellbookUi(W, H) {
  const tabId = window.FireMagic ? FireMagic.tab : 'fire';
  const list = WITCH.skills.filter((k) => k.el === tabId);
  const bw = Math.min(560, W - 20), bh = 100 + 26 + 26 + 4 * 78 + 34; // thêm một hàng thẻ cho 10 hệ
  const bx = Math.round((W - bw) / 2), by = Math.round((H - bh) / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8d6a8'; ctx.fillRect(bx, by, bw, bh);               // trang giấy
  ctx.strokeStyle = '#5a2d82'; ctx.lineWidth = 6; ctx.strokeRect(bx, by, bw, bh); // bìa tím
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2; ctx.strokeRect(bx + 10, by + 10, bw - 20, bh - 20);
  ctx.textAlign = 'center'; ctx.fillStyle = '#3d1a63'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText('✦ Sách Phép ✦', bx + bw / 2, by + 40);
  const open = elderQuest.unlocked;
  ctx.font = '13px sans-serif'; ctx.fillStyle = open ? '#1d5fa8' : '#9a2d2d';
  ctx.fillText(open ? 'Cổng Mana đã mở  ·  Mana ' + Math.floor(mana) + ' / ' + MAX_MANA : 'Cổng Mana chưa mở — hoàn thành nhiệm vụ Cây Cổ Thụ để sách ghi lại phép', bx + bw / 2, by + 62);
  if (window.FireMagic) { // thẻ chọn hệ (2 hàng): Thường · Lửa · Băng · Không Gian · Sét · Độc · Đất · Gió · Thánh Quang · Hắc Ám
    const TABS = [['fire', '🔥 Hệ Lửa', '#c4501a'], ['ice', '❄ Hệ Băng', '#2a7fc4'], ['arcane', '✦ Không Gian', '#6a3fd0'], ['lightning', '⚡ Hệ Sét', '#b89a10'],
      ['poison', '☠ Hệ Độc', '#4a8a22'], ['earth', '⛰ Hệ Đất', '#8a6238'], ['wind', '🍃 Hệ Gió', '#1a9a8a'], ['nature', '🌿 Tự Nhiên', '#2a8a3a'], ['holy', '✚ Thánh Quang', '#b8901a'], ['dark', '☾ Hắc Ám', '#5a2070']];
    const tw = Math.floor((bw - 48 - 4 * 4) / 5);
    FireMagic.tabRects = TABS.map(([id, label], i) => ({ id, label, x: bx + 24 + (i % 5) * (tw + 4), y: by + 72 + Math.floor(i / 5) * 26, w: tw, h: 22 }));
    FireMagic.tabRects.forEach((t, i) => {
      const on = FireMagic.tab === t.id;
      ctx.fillStyle = on ? TABS[i][2] : 'rgba(0,0,0,0.12)'; ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.textAlign = 'center'; ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = on ? '#fff' : '#5a4a3a';
      ctx.fillText(t.label, t.x + t.w / 2, t.y + 16);
    });
    ctx.textAlign = 'right'; ctx.font = '12px sans-serif'; ctx.fillStyle = '#6a5a3a';
    ctx.fillText(FireMagic.mode ? 'đang dùng hệ Lửa' : window.IceMagic && IceMagic.mode ? 'đang dùng hệ Băng' : window.ArcaneMagic && ArcaneMagic.mode ? 'đang dùng Không Gian' : window.ExtraMagic && ExtraMagic.mode ? 'đang dùng ' + ExtraMagic.name : 'đang dùng hệ Thường', bx + bw - 28, by + 87 + 26);
  }
  let y = by + 104 + 26;
  for (const s of list) {
    const ok = open && witchSt.learned[s.id];
    ctx.fillStyle = ok ? 'rgba(90,45,130,0.14)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(bx + 24, y, bw - 48, 68);
    ctx.textAlign = 'left';
    ctx.fillStyle = ok ? '#3d1a63' : '#7a7266'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText((ok ? '✦ ' : '✧ ') + s.name, bx + 38, y + 24);
    ctx.font = '13px sans-serif'; ctx.fillStyle = ok ? '#4a3a2a' : '#8a8276';
    ctx.fillText(ok ? s.desc : '??? — chưa học', bx + 38, y + 46);
    ctx.textAlign = 'right'; ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = ok ? '#1d5fa8' : '#8a8276';
    
    if (ok) {
      const t = s.id === 'wind' ? spellT.wind : s.id === 'shield' ? spellT.shield : s.id === 'icemirror' && window.IceMagic ? IceMagic.mirrorLeft() : window.ExtraMagic ? ExtraMagic.activeLeft(s.id) : 0;
      const c = s.el === 'fire' && window.FireMagic ? FireMagic.cdLeft(s.id) : s.el === 'ice' && window.IceMagic ? IceMagic.cdLeft(s.id) : s.el === 'arcane' && window.ArcaneMagic ? ArcaneMagic.cdLeft(s.id) : window.ExtraMagic && ExtraMagic.owns(s.el) ? ExtraMagic.cdLeft(s.id) : !s.el ? (spellCd[s.id] || 0) : 0;
      if (c > 0) { ctx.fillStyle = '#b5651d'; ctx.fillText('hồi chiêu ' + Math.ceil(c) + 's', bx + bw - 38, y + 46); }
      if (t > 0) { ctx.fillStyle = '#2a8a4a'; ctx.fillText('đang hiệu lực ' + Math.ceil(t) + 's', bx + bw - 38, y + 46); }
    }
    y += 78;
  }
  ctx.textAlign = 'center'; ctx.font = '12px sans-serif'; ctx.fillStyle = '#6a5a3a';
}

function baseTile(x, y) {
  if (layer === 1) return mineTile(x, y);
  if (layer === 2) return houseTile(x, y);
  if (layer === 3) return arenaTile(x, y);   // đấu trường boss (boss-gate.js)
  const vil = villageAt(x, y);
  if (vil) return vil.solid.has(x + ',' + y) ? VOBJ : GRASS; // trong làng: đã dọn sạch cây đá
  const eld = elderAt(x, y); // Cây Cổ Thụ: gốc là ô đặc, quanh gốc dọn sạch cây
  if (eld) return y === eld.ty && Math.abs(x - eld.tx) <= 1 ? VOBJ : GRASS;
  const wit = witchAt(x, y); // Nhà Phù Thủy: chân nhà là ô đặc, quanh nhà dọn sạch cây
  if (wit) return (y === wit.ty && Math.abs(x - wit.tx) <= 2) || witchDecorSolid(wit, x, y) ? VOBJ : GRASS;
  if (Math.abs(x) <= 2 && Math.abs(y) <= 2) return GRASS; // khu vực xuất phát
  const vt = volcanoTile(x, y); // đảo núi lửa (volcano.js): thân núi, vòng đá, dung nham, quặng
  if (vt !== undefined) return vt;
  const sea = seaType(x, y); // biển: 3 sâu (ô SEA, chặn đường), 2 nông (lội chậm), 1 bãi cát
  if (sea) return sea === 3 ? SEA : GRASS;
  const sw = swampType(x, y);
  if (sw) { // khu đầm lầy: nước trống, bùn có ít cây và đá
    if (sw === 2) return GRASS;
    const sr = hash(x + 1000, y - 1000);
    if (sr < 0.04) return TREE; // đầm lầy: cây thưa hơn
    return GRASS;
  }
  const n = vnoise(x / 7, y / 7);
  const r = hash(x + 1000, y - 1000);
  if (n > 0.55 && r < 0.18) return TREE; // rừng (thưa hơn trước)
  if (r < 0.012) return TREE;
  return GRASS; // mặt đất không còn đá / quặng: muốn đá thì xuống hầm mỏ
}

let changes = new Map();  // ô đã bị phá / đặt thêm
let damage = new Map();   // máu đã mất của cây/đá/quặng
let hitFx = new Map();    // hiệu ứng rung
let rodLife = new Map();  // độ bền còn lại của cột thu lôi

function getTile(x, y) {
  const key = x + ',' + y;
  if (changes.has(key)) return changes.get(key);
  return baseTile(x, y);
}

function isSolid(x, y) {
  const t = getTile(x, y);
  if (t === GRASS && chests.length && chests.some((c) => c.omni && c.tx === x && c.ty === y && !c.wait && !c.drop)) return true; // Rương báu boss cuối là vật cản, không đi xuyên qua được
  return t !== GRASS && t !== STAIRS && t !== LAVA && t !== WATER && t !== SEA && !WALKABLE_BUILD.has(t); // SEA không đặc: đạn / phép bay qua được, còn đi bộ thì collides() chặn
}

// ---------- Vật phẩm & chế tạo ----------
const ITEMS = {
  emerald: { name: 'Ngọc lục bảo', desc: 'Tiền tệ khi mua bán ở làng và chợ. Bán rau củ để kiếm' },
  meteorshard: { name: 'Mảnh Thiên Thạch', desc: 'Mảnh tinh thể tím còn nóng, vỡ ra từ thiên thạch rơi xuống vào ban đêm hoặc lúc giông bão', how: 'nhặt quanh chỗ thiên thạch rơi (đêm khuya hoặc khi có giông bão)' },
  dragonpotion: { name: 'Thuốc Hồi Sinh Rồng', desc: 'Lọ thuốc tím có hình rồng lửa cuộn bên trong. Đặt Hoá Thạch Rồng vào giữa vòng phép trong Cổng Hỗn Nguyên, chọn thuốc rồi bấm chuột để rắc lên: rồng sống lại (dạng thường, đầy máu)', how: 'đổi 5 Mảnh Thiên Thạch ở Chợ Đen (ban đêm)' },
  sulfur: { name: 'Lưu huỳnh', desc: 'Tinh thể vàng đập ra từ đá nhọn trên đảo núi lửa. Mùi hắc' },
  firescroll: { name: 'Giấy Lửa', desc: 'Tờ giấy cổ rực lửa, rớt từ Chúa Tể Dung Nham. Dâng cho Phù Thủy để học chiêu cuối Hỏa Long (V)', how: 'mở Rương Lửa sau khi hạ Chúa Tể Dung Nham ở đảo núi lửa' },
  icecrystal: { name: 'Tinh thể băng', desc: 'Rơi từ Sói Băng Ma Thuật và Chúa Tể Băng Giá trên đảo băng. Lạnh buốt tay. Nộp 20 viên cho Phù Thủy để học Hàn Vực (X)', how: 'đánh Sói Băng trên đảo băng (/tp bangdao)' },
  earthscroll: { name: 'Giấy Đất', desc: 'Cuộn giấy cổ khắc núi đá, rớt từ Ma Vương. Dâng cho Phù Thủy để học chiêu cuối Thác Đá (V, hệ Đất)', how: 'hạ boss Ma Vương trong đấu trường Cổng Ma Vương dưới hầm, nhặt cuộn giấy rơi ra' },
  frostscroll: { name: 'Giấy Băng', desc: 'Tờ giấy cổ phủ sương giá, rớt từ Chúa Tể Băng Giá. Dâng cho Phù Thủy để học chiêu cuối Bão Tuyết (V)', how: 'mở Rương Băng sau khi hạ Chúa Tể Băng Giá trên đảo băng' },
  firelotus: { name: 'Hoa Sen Lửa', desc: 'Bông hoa rực lửa. Dâng cho Phù Thủy để học phép Hỏa Cầu (Z)', how: 'đổi ' + BALANCE.witch.lotusSulfur + ' lưu huỳnh ở sạp Tạp Hoá ngoài chợ' },
  magma:  { name: 'Tinh thể magma', desc: 'Rơi từ Slime Lửa trên đảo núi lửa. Còn nóng hổi. Nộp 20 viên cho Phù Thủy để học Thiên Thạch (C)', how: 'đánh Slime Lửa trên đảo núi lửa (/tp nuilua)' },
  wood:   { name: 'Gỗ',            desc: 'Nguyên liệu cơ bản' },
  stone:  { name: 'Đá',            desc: 'Nguyên liệu chế đồ đá. Dâng 10 viên cho Phù Thủy để học Đấm Đất (Z, hệ Đất)', how: 'đập đá, đào khối đá ngoài trời hoặc trong hầm' },
  coal:   { name: 'Than',          desc: 'Dùng làm đuốc, thuốc và giáp' },
  ironore: { name: 'Quặng sắt',    desc: 'Cần cuốc đá để đào. Nung trong lò' },
  goldore: { name: 'Quặng vàng',   desc: 'Cần cuốc sắt để đào. Nung trong lò' },
  iron:   { name: 'Thỏi sắt',      desc: 'Nung từ quặng sắt. Chế đồ sắt' },
  gold:   { name: 'Thỏi vàng',     desc: 'Nung từ quặng vàng' },
  diamond: { name: 'Kim cương',     desc: 'Viên ngọc quý hiếm. Cần cuốc sắt để đào ở nơi xa. Chế giáp kim cương, dâng Phù Thủy học Quang Giáp (C, hệ Thánh Quang)', how: 'dùng cuốc sắt đào ở nơi xa' },
  furnace: { name: 'Lò nung',      desc: 'Chọn rồi bấm chuột trái để đặt. Nhấn E để nung quặng' },
  flesh:  { name: 'Thịt thối',     desc: 'Chọn trên thanh công cụ để ăn: no thêm 8. Nướng trong lò sẽ ngon hơn' },
  cookedflesh: { name: 'Thịt nướng', desc: 'Chọn trên thanh công cụ để ăn: no thêm 30' },
  bed:    { name: 'Giường',        desc: 'Chọn rồi bấm chuột trái để đặt. Nhấn E để ngủ ban đêm' },
  torch:  { name: 'Đuốc',          desc: 'Nhấn T: sáng hơn trong 60 giây' },
  potion: { name: 'Thuốc hồi máu', desc: 'Mua ở Tạp hoá. Bấm chuột trái khi chọn trên thanh nhanh: hồi 35 máu' },
  antidote: { name: 'Thuốc Giải Độc', desc: 'Bán ở Chợ Đen (ban đêm). Bấm chuột trái khi chọn trên thanh nhanh: giải độc nhện cắn ngay lập tức. Dâng 1 chai cho Phù Thủy để học Độc Tiễn (Z, hệ Độc)', how: 'mua ở Chợ Đen (ban đêm) với 8 ngọc lục bảo' },
  boat: { name: 'Thuyền', desc: 'Chọn rồi bấm chuột trái lên mặt nước (gần bờ) để đặt thuyền; đập thuyền 3 lần (tay / rìu / kiếm) để nhặt lại. Đứng gần bấm E để lên / xuống, chèo bằng W/A/S/D (Shift chèo nhanh). Thuyền chỉ đi trên nước', how: 'chế tạo bằng gỗ (7 gỗ)' },
  dragonfossil: { name: 'Hoá Thạch Rồng', desc: 'Bộ xương rồng cổ phủ rêu và xương rồng hoa. Chọn rồi bấm chuột trái để đặt làm trang trí. Đập bằng cuốc (hoặc tay không) để thu hồi. Trong Cổng Hỗn Nguyên khi rồng đã chết: đặt vào giữa vòng phép rồi rắc Thuốc Hồi Sinh Rồng để hồi sinh rồng', how: 'hạ Hỗn Nguyên Long Vương (boss cuối, Cổng Hỗn Nguyên) rồi mở Rương báu rơi giữa phòng' },
  darkrod: { name: 'Cột Thu Lôi Tím', desc: 'Chọn rồi bấm chuột trái để đặt. Hút sét trong 22 ô, không bao giờ cháy hỏng và giật điện quái vật quanh nó mỗi lần hút sét', how: 'mua ở Chợ Đen (xuất hiện ban đêm trong làng) với 100 ngọc lục bảo' },
  spiritjar: { name: 'Lọ Linh Thú', desc: 'Lọ thuỷ tinh nhốt một Độc Linh (đầu lâu độc). Dâng cho Phù Thủy để học Độc Triệu (C, hệ Độc)', how: 'mua ở Chợ Đen (xuất hiện ban đêm) với 150 ngọc lục bảo' },
  fan: { name: 'Quạt', desc: 'Chiếc quạt giấy hoa anh đào chế từ lông gà. Dâng cho Phù Thủy để học Phong Nhận (X, hệ Gió)', how: 'chế từ 3 lông gà + 3 gậy (lưới 3x2)' },
  treeseed: { name: 'Hạt Cây', desc: 'Hạt giống cây, đôi khi rớt khi chặt cây. Chọn trên thanh nhanh, bấm chuột trái vào ô cỏ trống để trồng, khoảng 90 giây sau mọc thành cây', how: 'chặt cây (có tỉ lệ rớt)' },
  spaceclock: { name: 'Đồng Hồ Không Gian', desc: 'Chiếc đồng hồ kim lạ, kim chạy ngược giữa các vì sao. Dâng cho Phù Thủy để học Hư Không (C, hệ Không Gian)', how: 'mua ở Chợ Đen: 200 ngọc lục bảo' },
  woodscroll: { name: 'Giấy Mộc', desc: 'Cuộn giấy quấn dây leo, toả khí xanh. Dâng cho Phù Thủy cùng 5 Hạt Cây để học chiêu cuối Cổ Thụ Thần Linh (V, hệ Tự Nhiên)', how: 'mua ở Chợ Đen: đổi 1 Sách Hệ Tự Nhiên + 1 Sách Hệ Đất (cuốn dư)' },
  darkscroll: { name: 'Giấy Hắc', desc: 'Cuộn giấy cháy lửa tím, khắc ấn hắc ám. Dâng cho Phù Thủy để học chiêu cuối Hắc Chúa (V, hệ Hắc Ám)', how: 'mua ở Chợ Đen: đổi 1 Sách Hệ Hắc Ám + 1 Sách Hệ Thánh Quang (cuốn dư)' },
  windscroll: { name: 'Giấy Gió', desc: 'Cuộn giấy khắc lốc xoáy. Dâng cho Phù Thủy để học Phong Thần (V, hệ Gió)', how: 'mua ở Chợ Đen: đổi 1 Sách Hệ Sét + 1 Sách Hệ Gió (cuốn dư)' },
  rod:    { name: 'Cột thu lôi',   desc: 'Chọn rồi bấm chuột trái để đặt, hút sét trong 10 ô' },
  apple:  { name: 'Táo',           desc: 'Chọn trên thanh công cụ để ăn: no thêm 20' },
  baked:  { name: 'Táo nướng',     desc: 'Chọn trên thanh công cụ để ăn: no thêm 50. Cho táo vào lò nung hoặc lò nướng để nướng' },
  stick:  { name: 'Gậy',           desc: 'Làm cán cuốc, rìu và đuốc' },
  table:  { name: 'Bàn chế tạo',   desc: 'Chọn rồi bấm chuột trái để đặt. Đứng gần để dùng lưới 3×3' },
  ...Object.fromEntries(BUILD.map((b) => [b.item, { name: b.name, desc: b.desc }])),
  chestbox: { name: 'Rương gỗ',     desc: 'Chọn rồi bấm chuột trái để đặt. Nhấn E để cất / lấy đồ' },
  rawbeef:    { name: 'Thịt bò sống',    desc: 'Chọn trên thanh công cụ để ăn: no thêm 10. Nướng trong lò sẽ ngon hơn' },
  beef:       { name: 'Bít tết',         desc: 'Chọn trên thanh công cụ để ăn: no thêm 55' },
  rawpork:    { name: 'Thịt heo sống',   desc: 'Chọn trên thanh công cụ để ăn: no thêm 8. Nướng trong lò sẽ ngon hơn' },
  pork:       { name: 'Thịt heo nướng',  desc: 'Chọn trên thanh công cụ để ăn: no thêm 45' },
  rawchicken: { name: 'Thịt gà sống',    desc: 'Chọn trên thanh công cụ để ăn: no thêm 6. Nướng trong lò sẽ ngon hơn' },
  chicken:    { name: 'Gà nướng',        desc: 'Chọn trên thanh công cụ để ăn: no thêm 35' },
  phobowl:    { name: 'Tô phở',          desc: 'Chọn trên thanh công cụ để ăn: no thêm 80. Phở bò nóng hổi' },
  banhchung:  { name: 'Bánh chưng',      desc: 'Chọn trên thanh công cụ để ăn: no thêm 65' },
  banhmi:     { name: 'Bánh mì',         desc: 'Chọn trên thanh công cụ để ăn: no thêm 40' },
  veg:        { name: 'Rau muống',       desc: 'Chọn trên thanh công cụ để ăn: no thêm 12' },
  orange:     { name: 'Cam sành',        desc: 'Chọn trên thanh công cụ để ăn: no thêm 22' },
  banana:     { name: 'Chuối',           desc: 'Chọn trên thanh công cụ để ăn: no thêm 18' },
  fish:       { name: 'Cá tươi',         desc: 'Chọn trên thanh công cụ để ăn: no thêm 8. Nướng trong lò sẽ ngon hơn' },
  grilledfish: { name: 'Cá nướng',       desc: 'Chọn trên thanh công cụ để ăn: no thêm 45' },
  nonla:      { name: 'Nón lá',          desc: 'Đặc sản chợ quê. Bấm để đội / bỏ nón (chỉ để làm đẹp)' },
  cloth:      { name: 'Vải',             desc: 'Cuộn vải đẹp từ chợ' },
  string:     { name: 'Chỉ nhện',        desc: 'Nhện rớt ra. Dùng chế cung' },
  wool:       { name: 'Lông cừu',        desc: 'Cừu rớt ra khi bị đánh. Dùng chế giường và thảm' },
  feather:    { name: 'Lông gà',         desc: 'Gà rớt ra. Dùng chế mũi tên và dâng Phù Thủy học Phong Đẩy (Z, hệ Gió)', how: 'săn gà để lấy lông' },
  bow:        { name: 'Cung',            desc: 'Chọn trên thanh nhanh, bấm chuột / Space để bắn. Tốn mũi tên, sát thương 4, 2 giây bắn 1 lần' },
  arrow:      { name: 'Mũi tên',         desc: 'Đạn của cung. Chế từ đá + gậy + lông gà' },
  watercan:   { name: 'Bình tưới cây',   desc: 'Bấm chuột trái vào cây đang trồng để tưới: lớn nhanh gấp ' + WATER_MULT + ' lần trong ' + WET_TIME + ' giây. Dùng tối đa ' + WATERCAN_USES + ' lần' },
  egg:        { name: 'Trứng gà',        desc: 'Gà nuôi đẻ ra. Chọn trên thanh công cụ để ăn: no thêm 8. Làm trứng ốp la, bánh bông lan' },
  milk:       { name: 'Sữa bò',          desc: 'Vắt từ bò nuôi bằng xô. Chọn trên thanh công cụ để ăn: no thêm 20. Làm bánh bông lan' },
  bucket:     { name: 'Xô',              desc: 'Bấm vào bò nuôi để vắt sữa · bấm vào nước hoặc dung nham để múc · bấm vào đất trống, ruộng hoặc dung nham để đổ nước' },
  flour:      { name: 'Bột mì',          desc: 'Xay lúa mì ở máy xay. Nướng bánh mì, bánh bông lan ở lò nướng' },
  riceflour:  { name: 'Bột gạo',         desc: 'Xay lúa gạo ở máy xay. Làm bánh phở ở lò nướng' },
  noodle:     { name: 'Bánh phở',        desc: 'Sợi phở tươi. Nấu tô phở với bít tết và rau thơm' },
  friedegg:   { name: 'Trứng ốp la',     desc: 'Chọn trên thanh công cụ để ăn: no thêm 30' },
  cake:       { name: 'Bánh bông lan',   desc: 'Chọn trên thanh công cụ để ăn: no thêm 70' },
  radio:      { name: 'Radio',            desc: 'Mua ở Tạp hoá (100 ngọc). Chọn rồi bấm chuột trái để đặt xuống đất. Nhấn E dán link nhạc' },
  mill:       { name: 'Máy xay',         desc: 'Chọn rồi bấm chuột trái để đặt. Đứng gần mở lưới 3×3: xay lúa thành bột' },
  oven:       { name: 'Lò nướng',        desc: 'Chọn rồi bấm chuột trái để đặt. Đứng gần mở lưới 3×3: nướng bánh mì, nấu phở, bánh chưng' },
  pen:        { name: 'Bộ chuồng nuôi',  desc: 'Mua ở Tạp hoá. Bấm xuống đất: dựng chuồng rào 7×6 ô có cổng (cây, đá sẵn có làm tường luôn). Cầm thức ăn để dắt vật nuôi vào' },
};
const USABLE = new Set([...BUILD.map((b) => b.item), 'torch', 'potion', 'antidote', 'dragonpotion', 'rod', 'darkrod', 'dragonfossil', 'boat', 'apple', 'baked', 'table', 'furnace', 'chestbox', 'flesh', 'cookedflesh', 'bed', 'rawbeef', 'beef', 'rawpork', 'pork', 'rawchicken', 'chicken', 'phobowl', 'banhchung', 'banhmi', 'veg', 'orange', 'banana', 'fish', 'grilledfish', 'nonla', 'egg', 'milk', 'friedegg', 'cake']);
const FOOD = { apple: 20, baked: 50, flesh: 8, cookedflesh: 30, rawbeef: 10, beef: 55, rawpork: 8, pork: 45, rawchicken: 6, chicken: 35, phobowl: 80, banhchung: 65, banhmi: 40, veg: 12, orange: 22, banana: 18, fish: 8, grilledfish: 45, egg: 8, milk: 20, friedegg: 30, cake: 70 }; // lượng đói hồi lại

// Hạt giống + nông sản của từng loại cây trồng
for (const k of Object.keys(CROPS)) {
  const c = CROPS[k];
  ITEMS['seed_' + k] = { name: c.seed, desc: 'Chọn trên thanh nhanh, bấm chuột trái vào ô đất đã cày để gieo' };
  ITEMS['crop_' + k] = { name: c.name, desc: c.desc || ('Chọn trên thanh công cụ để ăn: no thêm ' + c.food) };
  if (c.food) { FOOD['crop_' + k] = c.food; USABLE.add('crop_' + k); }
}

// Giáp: mỗi món giảm một phần sát thương (cộng dồn khi mặc đủ bộ)
// Giáp sắt (head, chest, legs, feet) và giáp vàng (ghead, gchest, glegs, gfeet): mỗi ô chỉ mặc được một món. Giáp vàng tốt hơn nhưng cần quặng vàng (cuốc sắt)
const ARMOR_REDUCE = { head: 0.07, chest: 0.15, legs: 0.10, feet: 0.08, ghead: 0.09, gchest: 0.19, glegs: 0.12, gfeet: 0.10, dhead: 0.11, dchest: 0.23, dlegs: 0.14, dfeet: 0.12 }; // đủ bộ: sắt 40% · vàng 50% · kim cương 60% (trước đây 60/72/76% làm game quá dễ ở cuối)
const ARMOR_NAME = { head: 'Mũ sắt', chest: 'Áo giáp sắt', legs: 'Quần sắt', feet: 'Giày sắt', ghead: 'Mũ vàng', gchest: 'Áo giáp vàng', glegs: 'Quần vàng', gfeet: 'Giày vàng', dhead: 'Mũ kim cương', dchest: 'Áo giáp kim cương', dlegs: 'Quần kim cương', dfeet: 'Giày kim cương' };
const GOLD_ARMOR = { ghead: 'head', gchest: 'chest', glegs: 'legs', gfeet: 'feet' };
const DIAMOND_ARMOR = { dhead: 'head', dchest: 'chest', dlegs: 'legs', dfeet: 'feet' };
const GEAR_BASE = { head: 'head', chest: 'chest', legs: 'legs', feet: 'feet', ...GOLD_ARMOR, ...DIAMOND_ARMOR }; // món giáp -> ô giáp
const GEAR_IDS = Object.keys(GEAR_BASE);
const SLOT_VARIANTS = { head: ['head', 'ghead', 'dhead'], chest: ['chest', 'gchest', 'dchest'], legs: ['legs', 'glegs', 'dlegs'], feet: ['feet', 'gfeet', 'dfeet'] };

// Công thức kiểu Minecraft: xếp nguyên liệu vào lưới theo đúng hình dạng.
// pattern: mỗi chuỗi là một hàng (khoảng trắng = ô trống) | key: ký tự -> vật phẩm
// give: kết quả (item + n = số lượng, tool + tier = dụng cụ, gear = trang bị)
// Hình có thể lật gương trái/phải và đặt ở bất kỳ chỗ nào trên lưới.
const RECIPES = [
  { name: 'Thuyền',        pattern: ['W W', 'WWW'],             key: { W: 'wood' },              give: { item: 'boat', n: 1 },      desc: 'Chọn + bấm lên mặt nước để đặt thuyền, bấm E để lên / xuống' },
  { name: 'Gậy',           pattern: ['W', 'W'],                 key: { W: 'wood' },              give: { item: 'stick', n: 4 },     desc: 'Cán của cuốc, rìu, đuốc' },
  { name: 'Bàn chế tạo',   pattern: ['WW', 'WW'],               key: { W: 'wood' },              give: { item: 'table', n: 1 },     desc: 'Bấm chuột trái để đặt, mở lưới 3×3' },
  { name: 'Đuốc',          pattern: ['C', 'S'],                 key: { C: 'coal', S: 'stick' }, give: { item: 'torch', n: 4 },     desc: 'Soi sáng ban đêm' },
  { name: 'Rìu gỗ',        pattern: ['WW', 'WS', ' S'],         key: { W: 'wood', S: 'stick' }, give: { tool: 'axe', tier: 1 },     desc: 'Độ bền 60. Chặt cây nhanh hơn tay, đánh zombie được' },
  { name: 'Cuốc gỗ',       pattern: ['WWW', ' S ', ' S '],      key: { W: 'wood', S: 'stick' }, give: { tool: 'pickaxe', tier: 1 }, desc: 'Độ bền 60. Đào đá và than' },
  { name: 'Rìu đá',        pattern: ['TT', 'TS', ' S'],         key: { T: 'stone', S: 'stick' }, give: { tool: 'axe', tier: 2 },    desc: 'Độ bền 140. Chặt cây rất nhanh' },
  { name: 'Cuốc đá',       pattern: ['TTT', ' S ', ' S '],      key: { T: 'stone', S: 'stick' }, give: { tool: 'pickaxe', tier: 2 }, desc: 'Độ bền 140. Đào được quặng sắt' },
  { name: 'Rìu sắt',       pattern: ['II', 'IS', ' S'],         key: { I: 'iron', S: 'stick' }, give: { tool: 'axe', tier: 3 },     desc: 'Độ bền 320. Chặt cây nhanh nhất' },
  { name: 'Rìu vàng', pattern: ['GG', 'GS', ' S'], key: { G: 'gold', S: 'stick' }, give: { tool: 'axe', tier: 4 }, desc: 'Độ bền 90. Vung nhanh nhất nhưng giòn, yếu hơn rìu sắt' },
  { name: 'Rìu kim cương', pattern: ['DD', 'DS', ' S'], key: { D: 'diamond', S: 'stick' }, give: { tool: 'axe', tier: 5 }, desc: 'Độ bền 600. Mạnh hơn rìu sắt' },
  { name: 'Cuốc sắt',      pattern: ['III', ' S ', ' S '],      key: { I: 'iron', S: 'stick' }, give: { tool: 'pickaxe', tier: 3 }, desc: 'Độ bền 320. Đào được quặng vàng' },
  { name: 'Cuốc vàng', pattern: ['GGG', ' S ', ' S '], key: { G: 'gold', S: 'stick' }, give: { tool: 'pickaxe', tier: 4 }, desc: 'Độ bền 90. Đào nhanh nhất nhưng giòn, yếu hơn cuốc sắt' },
  { name: 'Cuốc kim cương', pattern: ['DDD', ' S ', ' S '], key: { D: 'diamond', S: 'stick' }, give: { tool: 'pickaxe', tier: 5 }, desc: 'Độ bền 600. Mạnh hơn cuốc sắt' },
  { name: 'Cuốc đất gỗ',   pattern: ['WW', ' S', ' S'],         key: { W: 'wood', S: 'stick' }, give: { tool: 'hoe', tier: 1 },     desc: 'Độ bền 60. Cày cỏ thành ruộng để trồng trọt' },
  { name: 'Cuốc đất đá',   pattern: ['TT', ' S', ' S'],         key: { T: 'stone', S: 'stick' }, give: { tool: 'hoe', tier: 2 },    desc: 'Độ bền 140. Cày ruộng bền hơn' },
  { name: 'Cuốc đất sắt',  pattern: ['II', ' S', ' S'],         key: { I: 'iron', S: 'stick' }, give: { tool: 'hoe', tier: 3 },     desc: 'Độ bền 320. Cày ruộng bền nhất' },
  { name: 'Cuốc đất vàng', pattern: ['GG', ' S', ' S'], key: { G: 'gold', S: 'stick' }, give: { tool: 'hoe', tier: 4 }, desc: 'Độ bền 90. Cày nhanh nhưng giòn, chỉ hơn đồ gỗ chút' },
  { name: 'Cuốc đất kim cương', pattern: ['DD', ' S', ' S'], key: { D: 'diamond', S: 'stick' }, give: { tool: 'hoe', tier: 5 }, desc: 'Độ bền 600. Cày ruộng bền nhất' },
  { name: 'Kiếm gỗ',       pattern: ['W', 'W', 'S'],            key: { W: 'wood', S: 'stick' }, give: { tool: 'sword', tier: 1 },   desc: 'Độ bền 60. Sát thương 4' },
  { name: 'Kiếm đá',       pattern: ['T', 'T', 'S'],            key: { T: 'stone', S: 'stick' }, give: { tool: 'sword', tier: 2 }, desc: 'Độ bền 140. Sát thương 6' },
  { name: 'Kiếm sắt',      pattern: ['I', 'I', 'S'],            key: { I: 'iron', S: 'stick' }, give: { tool: 'sword', tier: 3 },  desc: 'Độ bền 320. Sát thương 9, vũ khí mạnh nhất' },
  { name: 'Kiếm vàng', pattern: ['G', 'G', 'S'], key: { G: 'gold', S: 'stick' }, give: { tool: 'sword', tier: 4 }, desc: 'Độ bền 90. Sát thương 7, yếu hơn kiếm sắt, chỉ là đồ tạm' },
  { name: 'Kiếm kim cương', pattern: ['D', 'D', 'S'], key: { D: 'diamond', S: 'stick' }, give: { tool: 'sword', tier: 5 }, desc: 'Độ bền 600. Sát thương 11, vũ khí mạnh nhất' },
  { name: 'Rương gỗ',      pattern: ['WWW', 'W W', 'WWW'],      key: { W: 'wood' },              give: { item: 'chestbox', n: 1 },   desc: 'Bấm chuột trái để đặt, E để cất đồ' },
  { name: 'Lò nung',       pattern: ['TTT', 'T T', 'TTT'],      key: { T: 'stone' },             give: { item: 'furnace', n: 1 },   desc: 'Bấm chuột trái để đặt, E để nung quặng' },
  { name: 'Khối gỗ',       pattern: ['WWW', 'WWW', 'WWW'],      key: { W: 'wood' },              give: { item: 'wblock', n: 4 },     desc: 'Khối gỗ đặc nguyên ô' },
  { name: 'Khối đá',       pattern: ['TTT', 'TTT', 'TTT'],      key: { T: 'stone' },             give: { item: 'sblock', n: 4 },     desc: 'Khối đá đặc nguyên ô' },
  { name: 'Khối sắt',      pattern: ['III', 'III', 'III'],      key: { I: 'iron' },              give: { item: 'iblock', n: 1 },     desc: '9 thỏi sắt ra 1 khối sắt đặc nguyên ô' },
  { name: 'Khối kim cương', pattern: ['DDD', 'DDD', 'DDD'],     key: { D: 'diamond' },           give: { item: 'dblock', n: 1 },     desc: '9 kim cương ra 1 khối kim cương đặc nguyên ô' },
  { name: 'Khối than',     pattern: ['CCC', 'CCC', 'CCC'],      key: { C: 'coal' },              give: { item: 'cblock', n: 1 },     desc: '9 than ra 1 khối than. Làm nhiên liệu cháy rất lâu trong lò nung' },
  { name: 'Tường gỗ',      pattern: ['WWW', 'WWW'],             key: { W: 'wood' },              give: { item: 'wwall', n: 4 },      desc: 'Xây tường nhà' },
  { name: 'Tường sắt',     pattern: ['III', 'III'],             key: { I: 'iron' },              give: { item: 'iwall', n: 4 },      desc: 'Tường rất cứng' },
  { name: 'Cửa gỗ',        pattern: ['WW', 'WW', 'WW'],         key: { W: 'wood' },              give: { item: 'wdoor', n: 1 },      desc: 'E để mở / đóng' },
  { name: 'Cửa sắt',       pattern: ['II', 'II', 'II'],         key: { I: 'iron' },              give: { item: 'idoor', n: 1 },      desc: 'E để mở / đóng, rất cứng' },
  { name: 'Mái nhà',       pattern: ['TTT', 'WWW'],             key: { T: 'stone', W: 'wood' },  give: { item: 'roof', n: 4 },       desc: 'Lợp mái nhà' },
  { name: 'Sàn gỗ',        pattern: ['WW'],                     key: { W: 'wood' },              give: { item: 'wfloor', n: 2 },     desc: 'Lót sàn nhà' },
  { name: 'Thảm',          pattern: ['LL'],                     key: { L: 'wool' },              give: { item: 'carpet', n: 3 },     desc: 'Trang trí sàn. 2 lông cừu ra 3 tấm thảm' },
  { name: 'Đèn lồng',      pattern: ['S', 'C', 'W'],            key: { S: 'stick', C: 'coal', W: 'wood' }, give: { item: 'lamp', n: 1 }, desc: 'Toả sáng ban đêm' },
  { name: 'Hàng rào',      pattern: ['SSS', 'SSS'],             key: { S: 'stick' },             give: { item: 'fence', n: 3 },     desc: 'Rào sân vườn' },
  { name: 'Mũ sắt',        pattern: ['III', 'I I'],             key: { I: 'iron' },              give: { gear: 'head' },             desc: 'Giảm 7% sát thương' },
  { name: 'Áo giáp sắt',   pattern: ['I I', 'III', 'III'],      key: { I: 'iron' },              give: { gear: 'chest' },            desc: 'Giảm 15% sát thương' },
  { name: 'Quần sắt',      pattern: ['III', 'I I', 'I I'],      key: { I: 'iron' },              give: { gear: 'legs' },             desc: 'Giảm 10% sát thương' },
  { name: 'Giày sắt',      pattern: ['I I', 'I I'],             key: { I: 'iron' },              give: { gear: 'feet' },             desc: 'Giảm 8% sát thương' },
  { name: 'Giường',        pattern: ['LLL', 'WWW'],             key: { L: 'wool', W: 'wood' },   give: { item: 'bed', n: 1 },       desc: '3 lông cừu ở trên, 3 gỗ ở dưới. Ngủ qua đêm, đặt điểm hồi sinh' },
  { name: 'Cung',          pattern: [' SX', 'S X', ' SX'],      key: { S: 'stick', X: 'string' }, give: { item: 'bow', n: 1 },   desc: 'Bắn xa, cần mũi tên. Chuột / Space để bắn' },
  { name: 'Mũi tên',       pattern: ['T', 'S', 'F'],            key: { T: 'stone', S: 'stick', F: 'feather' }, give: { item: 'arrow', n: 4 }, desc: 'Đạn của cung' },
  { name: 'Quạt',          pattern: ['FFF', 'SSS'],             key: { F: 'feather', S: 'stick' }, give: { item: 'fan', n: 1 },     desc: '3 lông gà ở trên, 3 gậy ở dưới. Dâng Phù Thủy để học Phong Nhận (X, hệ Gió)' },
  { name: 'Cột thu lôi',   pattern: [' G ', ' I ', 'I I'],     key: { G: 'gold', I: 'iron' },   give: { item: 'rod', n: 1 },       desc: 'Hút sét thay bạn' },
  { name: 'Mũ vàng',       pattern: ['GGG', 'G G'],             key: { G: 'gold' },              give: { gear: 'ghead' },            desc: 'Giảm 9% sát thương (tốt hơn mũ sắt)' },
  { name: 'Áo giáp vàng',  pattern: ['G G', 'GGG', 'GGG'],      key: { G: 'gold' },              give: { gear: 'gchest' },           desc: 'Giảm 19% sát thương (tốt hơn giáp sắt)' },
  { name: 'Quần vàng',     pattern: ['GGG', 'G G', 'G G'],      key: { G: 'gold' },              give: { gear: 'glegs' },            desc: 'Giảm 12% sát thương (tốt hơn quần sắt)' },
  { name: 'Giày vàng',     pattern: ['G G', 'G G'],             key: { G: 'gold' },              give: { gear: 'gfeet' },            desc: 'Giảm 10% sát thương (tốt hơn giày sắt)' },
  { name: 'Mũ kim cương',    pattern: ['DDD', 'D D'],             key: { D: 'diamond' },           give: { gear: 'dhead' },            desc: 'Giảm 11% sát thương (tốt nhất)' },
  { name: 'Áo giáp kim cương', pattern: ['D D', 'DDD', 'DDD'],    key: { D: 'diamond' },           give: { gear: 'dchest' },           desc: 'Giảm 23% sát thương (tốt nhất)' },
  { name: 'Quần kim cương',  pattern: ['DDD', 'D D', 'D D'],      key: { D: 'diamond' },           give: { gear: 'dlegs' },            desc: 'Giảm 14% sát thương (tốt nhất)' },
  { name: 'Giày kim cương',  pattern: ['D D', 'D D'],             key: { D: 'diamond' },           give: { gear: 'dfeet' },            desc: 'Giảm 12% sát thương (tốt nhất)' },
  { name: 'Máy xay',       pattern: [' W ', 'TST', 'TTT'],     key: { W: 'wood', T: 'stone', S: 'stick' }, give: { item: 'mill', n: 1 }, desc: 'Bấm chuột trái để đặt. Đứng gần để xay lúa thành bột' },
  { name: 'Lò nướng',      pattern: ['TTT', 'TCT', 'TTT'],      key: { T: 'stone', C: 'coal' },  give: { item: 'oven', n: 1 },       desc: 'Bấm chuột trái để đặt. Đứng gần để nướng bánh, nấu phở' },
  { name: 'Xô',            pattern: ['I I', ' I '],             key: { I: 'iron' },              give: { item: 'bucket', n: 1 },     desc: 'Vắt sữa bò nuôi' },
  { name: 'Bột mì',        pattern: ['W'],                      key: { W: 'crop_wheat' },        give: { item: 'flour', n: 2 },     station: 'mill', desc: 'Cần đứng gần máy xay. Xay 1 lúa mì ra 2 bột' },
  { name: 'Bột gạo',       pattern: ['R'],                      key: { R: 'crop_rice' },         give: { item: 'riceflour', n: 2 }, station: 'mill', desc: 'Cần đứng gần máy xay. Xay 1 lúa gạo ra 2 bột' },
  { name: 'Bánh mì',       pattern: ['FFF'],                    key: { F: 'flour' },             give: { item: 'banhmi', n: 2 },    station: 'oven', desc: 'Cần đứng gần lò nướng. 3 bột mì ra 2 ổ bánh mì (no thêm 40)' },
  { name: 'Bánh phở',      pattern: ['RR'],                     key: { R: 'riceflour' },         give: { item: 'noodle', n: 2 },    station: 'oven', desc: 'Cần đứng gần lò nướng. Sợi phở tươi' },
  { name: 'Tô phở',        pattern: ['H', 'NN', 'B'],           key: { H: 'crop_herb', N: 'noodle', B: 'beef' }, give: { item: 'phobowl', n: 1 }, station: 'oven', desc: 'Cần đứng gần lò nướng. Rau thơm + 2 bánh phở + bít tết (no thêm 80)' },
  { name: 'Bánh chưng',    pattern: ['RRR', 'BPB'],             key: { R: 'crop_rice', B: 'crop_bean', P: 'pork' }, give: { item: 'banhchung', n: 1 }, station: 'oven', desc: 'Cần đứng gần lò nướng. Gạo + đậu + thịt heo nướng (no thêm 65)' },
  { name: 'Táo nướng',     pattern: ['A'],                      key: { A: 'apple' },             give: { item: 'baked', n: 1 },     station: 'oven', desc: 'Cần đứng gần lò nướng (hoặc cho táo vào lò nung). No thêm 50' },
  { name: 'Trứng ốp la',   pattern: ['E'],                      key: { E: 'egg' },               give: { item: 'friedegg', n: 1 },  station: 'oven', desc: 'Cần đứng gần lò nướng. No thêm 30' },
  { name: 'Bánh bông lan', pattern: ['EME', 'FFF'],             key: { E: 'egg', M: 'milk', F: 'flour' }, give: { item: 'cake', n: 1 }, station: 'oven', desc: 'Cần đứng gần lò nướng. 2 trứng + sữa + 3 bột mì (no thêm 70)' },
];

// Tính sẵn: hình đã cắt phần trống, hình lật gương, tổng nguyên liệu, kích thước tối thiểu của lưới
RECIPES.forEach((r) => {
  const h = r.pattern.length, w = Math.max(...r.pattern.map((s) => s.length));
  const cells = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = r.pattern[y][x] || ' ';
      cells.push(ch === ' ' ? null : r.key[ch]);
    }
  }
  r.shape = trimCells(cells, h, w);
  r.mirror = r.shape.map((row) => row.slice().reverse());
  r.sh = r.shape.length;
  r.sw = r.shape[0].length;
  r.cost = {};
  cells.forEach((id) => { if (id) r.cost[id] = (r.cost[id] || 0) + 1; });
});

// ---------- Dữ liệu người chơi ----------
const MAX_HP = BALANCE.player.maxHp;
const MAX_HUNGER = BALANCE.player.maxHunger;
const HUNGER_RATE = BALANCE.player.hungerRate;  // đói mỗi giây (chạy thì nhanh hơn)
const STARVE_DPS = BALANCE.player.starveDps;      // mất máu mỗi giây khi đói hết
const POTION_HEAL = BALANCE.player.potionHeal;
const TORCH_TIME = BALANCE.player.torchTime;
const player = {
  x: 0, y: 0, speed: 170,
  faceX: 0, faceY: 1,
  moving: false, running: false,
  animTime: 0,
  hp: MAX_HP, hpGhost: MAX_HP,  // hpGhost: thanh trắng "trôi" theo lượng máu vừa mất
  hunger: MAX_HUNGER,
  invuln: 0,                    // thời gian bất tử sau khi bị thương
  sinceHurt: 99,                // để hồi máu chậm khi lâu không bị thương
};
const inv = { emerald: 0, magma: 0, sulfur: 0, wood: 0, stone: 0, coal: 0, iron: 0, gold: 0, ironore: 0, goldore: 0, diamond: 0, stick: 0, table: 0, furnace: 0, chestbox: 0, bed: 0, wwall: 0, wblock: 0, sblock: 0, iblock: 0, dblock: 0, cblock: 0, iwall: 0, wdoor: 0, idoor: 0, roof: 0, wfloor: 0, carpet: 0, lamp: 0, fence: 0, pot: 0, torch: 0, potion: 0, rod: 0, apple: 0, baked: 0, flesh: 0, cookedflesh: 0, rawbeef: 0, beef: 0, rawpork: 0, pork: 0, rawchicken: 0, chicken: 0, phobowl: 0, banhchung: 0, banhmi: 0, veg: 0, orange: 0, banana: 0, fish: 0, grilledfish: 0, nonla: 0, cloth: 0, wool: 0, string: 0, feather: 0, bow: 0, arrow: 0, watercan: 0 };
for (const k of Object.keys(CROPS)) { inv['seed_' + k] = 0; inv['crop_' + k] = 0; }
// Sách Hệ (nhận từ vòng quay Chú Lùn): vật phẩm xếp chồng trong túi đồ, id 'tome_<hệ>'
const TOME_EL = { fire: 'Lửa', ice: 'Băng', lightning: 'Sét', poison: 'Độc', earth: 'Đất', wind: 'Gió', holy: 'Thánh Quang', dark: 'Hắc Ám', nature: 'Tự Nhiên', arcane: 'Không Gian' };
const TOME_KEYS = Object.keys(TOME_EL).map((k) => 'tome_' + k);
for (const k of Object.keys(TOME_EL)) { inv['tome_' + k] = 0; ITEMS['tome_' + k] = { name: 'Sách Hệ ' + TOME_EL[k], desc: 'Nộp cho Nhà Phù Thủy để mở khoá hệ phép này (sách sẽ mất)', how: 'quay vòng quay Chú Lùn Cổ Thụ thêm một lần ra đúng cuốn này (cuốn trùng)' }; }
for (const k of ['darkrod', 'dragonfossil', 'boat', 'antidote', 'egg', 'milk', 'bucket', 'flour', 'riceflour', 'noodle', 'friedegg', 'cake', 'mill', 'oven', 'pen', 'radio', 'firelotus', 'firescroll', 'icecrystal', 'frostscroll', 'spiritjar', 'earthscroll', 'fan', 'windscroll', 'darkscroll', 'woodscroll', 'spaceclock', 'treeseed', 'meteorshard', 'dragonpotion']) inv[k] = 0;
const tools = { axe: 0, axe2: 0, pickaxe: 0, pickaxe2: 0, hoe: 0, hoe2: 0, sword: 0, sword2: 0 }; // 0 = không có, 1 gỗ, 2 đá, 3 sắt, 4 vàng, 5 kim cương (ô 2 = món thứ hai cùng loại)
const toolDur = { axe: 0, axe2: 0, pickaxe: 0, pickaxe2: 0, hoe: 0, hoe2: 0, sword: 0, sword2: 0 }; // độ bền còn lại của từng dụng cụ đang có

// Chọn ô cho dụng cụ mới: ô trống trước; hết ô thì thay món kém hơn (nếu món mới tốt hơn)
const toolScore = (k) => tools[k] * 100000 + toolDur[k];
const freeToolKey = (base) => [base, base + '2'].find((k) => !(tools[k] > 0)) || null;
const worstToolKey = (base) => (toolScore(base) <= toolScore(base + '2') ? base : base + '2');
function toolSlotFor(id, tier, dur) { // trả về khoá ô nhận được, hoặc null nếu cả 2 ô đều tốt hơn món này
  const base = toolBase(id), free = freeToolKey(base);
  if (free) return free;
  const worst = worstToolKey(base);
  return tier * 100000 + dur > toolScore(worst) ? worst : null;
}
const toolKeyFor = (id) => freeToolKey(toolBase(id)) || worstToolKey(toolBase(id)); // luôn có ô: trống, không thì thay món kém nhất

// Gán dụng cụ cấp tier (dur: độ bền còn lại, bỏ trống = còn mới)
function setTool(id, tier, dur) {
  tools[id] = tier;
  toolDur[id] = tier > 0 ? Math.max(1, Math.min(TOOL_DUR[tier], dur === undefined || dur === null ? TOOL_DUR[tier] : dur)) : 0;
}

// Mỗi nhát chặt/đào/đánh trúng tốn 1 độ bền; về 0 thì dụng cụ vỡ
function wearTool(id) {
  if (!(tools[id] > 0)) return;
  toolDur[id]--;
  if (toolDur[id] > 0) return;
  const name = TOOL_LABEL[id] + ' ' + TIER_NAME[tools[id]];
  setTool(id, 0);
  say(name + ' đã hỏng!');
  burst(player.x, player.y - 20, '#b8b8c4', 14, 180);
  shake = Math.max(shake, 0.25);
}
const gear = { head: false, chest: false, legs: false, feet: false, ghead: false, gchest: false, glegs: false, gfeet: false, dhead: false, dchest: false, dlegs: false, dfeet: false };
const gearBag = { head: 0, chest: 0, legs: 0, feet: 0, ghead: 0, gchest: 0, glegs: 0, gfeet: 0, dhead: 0, dchest: 0, dlegs: 0, dfeet: 0 }; // số giáp cất trong túi (chưa mặc), mỗi loại có thể nhiều món
let spawnPoint = null; // { tx, ty } của giường dùng làm điểm hồi sinh

// ---------- Chết, túi đồ rơi, hồi sinh ----------
const DEATH_DROP_ITEMS = true;  // true: chết là rơi TẤT CẢ (dụng cụ, giáp, nguyên liệu); false: chỉ dụng cụ + giáp
let score = 0;                  // điểm của lần sống hiện tại (reset khi chọn "Hồi sinh")
const bags = [];                // túi đồ rơi lại: { x, y, layer, t, tools, gear, items }
let deathScreen = null;         // null | { t, score, bag }

// ---------- Vứt vật phẩm (phím G) ----------
// G: vứt 1 món đang chọn trên thanh nhanh · Ctrl+G: vứt cả chồng. Vứt được cả dụng cụ và giáp. Đồ rơi xuống đất, đi lại gần để nhặt lại.
const itemDrops = [];               // { id, n, x, y, layer, age }
const DROP_MAX = 200, DROP_LIFE = 600, DROP_DELAY = 1.2, DROP_PICK = 34;
const LOOT_DELAY = 0.5; // đồ rớt từ quái / khối: chờ chút rồi mới nhặt được

// Đồ rớt từ thế giới (đập khối, hạ quái): văng ra rồi nằm lơ lửng trên đất, đi lại gần để nhặt.
// Trong nhà (layer 2) tọa độ dùng chung giữa các nhà nên cộng thẳng vào túi.
let _earthScrollImg = null;
function earthScrollImg() { if (!_earthScrollImg) { _earthScrollImg = false; loadImage('assets/items/earth_scroll.webp').then((i) => { _earthScrollImg = i; }); } return _earthScrollImg || null; }
let _spaceClockImg = null;
function spaceClockImg() { if (!_spaceClockImg) { _spaceClockImg = false; loadImage('assets/items/space_clock.webp').then((i) => { _spaceClockImg = i; }); } return _spaceClockImg || null; }
let _woodScrollImg = null;
function woodScrollImg() { if (!_woodScrollImg) { _woodScrollImg = false; loadImage('assets/items/wood_scroll.webp').then((i) => { _woodScrollImg = i; }); } return _woodScrollImg || null; }
let _darkScrollImg = null;
function darkScrollImg() { if (!_darkScrollImg) { _darkScrollImg = false; loadImage('assets/items/dark_scroll.webp').then((i) => { _darkScrollImg = i; }); } return _darkScrollImg || null; }
let _windScrollImg = null;
function windScrollImg() { if (!_windScrollImg) { _windScrollImg = false; loadImage('assets/items/wind_scroll.webp').then((i) => { _windScrollImg = i; }); } return _windScrollImg || null; }
let _fanImg = null;
function fanImg() { if (!_fanImg) { _fanImg = false; loadImage('assets/items/wind_fan.webp').then((i) => { _fanImg = i; }); } return _fanImg || null; }
let _spiritJarImg = null;
function spiritJarImg() { if (!_spiritJarImg) { _spiritJarImg = false; loadImage('assets/items/spirit_jar.webp').then((i) => { _spiritJarImg = i; }); } return _spiritJarImg || null; }
let _iceCrystalImg = null;
let _dragonPotionImg = null;
function dragonPotionImg() { if (!_dragonPotionImg) { _dragonPotionImg = false; loadImage('assets/items/dragon_potion.webp').then((i) => { _dragonPotionImg = i; }); } return _dragonPotionImg || null; }
let _meteorShardImg = null;
function meteorShardImg() { if (!_meteorShardImg) { _meteorShardImg = false; loadImage('assets/items/meteor_shard.webp').then((i) => { _meteorShardImg = i; }); } return _meteorShardImg || null; }
function iceCrystalImg() { if (!_iceCrystalImg) { _iceCrystalImg = false; loadImage('assets/items/ice_crystal.webp').then((i) => { _iceCrystalImg = i; }); } return _iceCrystalImg || null; }
function spawnLoot(id, n, x, y) {
  if (n <= 0) return;
  if (layer === 2) {
    inv[id] += n;
    if (SHOW_ITEM_NOTICES) floaters.push({ x, y: y - 20, text: '+' + n + ' ' + ITEMS[id].name.toLowerCase(), life: 1.2 });
    return;
  }
  const safe = safeDropSpot(x, y);
  if (safe) { x = safe.x; y = safe.y; }
  const angle = Math.random() * Math.PI * 2, speed = 40 + Math.random() * 50;
  if (itemDrops.length >= DROP_MAX) itemDrops.shift();
  itemDrops.push({ kind: 'item', id, n, tier: 0, x, y, layer, age: 0, delay: LOOT_DELAY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
}

// Đồ văng ra trượt chậm dần, dừng khi đụng vật cản
function slideDrop(d, dt) {
  const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
  if (!isSolid(Math.floor(nx / TILE), Math.floor(d.y / TILE))) d.x = nx; else d.vx = 0;
  if (!isSolid(Math.floor(d.x / TILE), Math.floor(ny / TILE))) d.y = ny; else d.vy = 0;
  const friction = Math.max(0, 1 - 6 * dt);
  d.vx *= friction; d.vy *= friction;
  if (Math.hypot(d.vx, d.vy) < 4) d.vx = d.vy = 0;
}

// Chỗ đứng được gần nhất (không phải dung nham, không phải ô đặc) cho đồ rơi. null = chỗ hiện tại đã ổn.
// Đồ ném vào dung nham / bị đá sập hoặc dung nham nguội chôn mất thì được dời ra ngoài, không để kẹt hay mất.
function safeDropSpot(x, y) {
  const tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
  const ok = (tx, ty) => getTile(tx, ty) !== LAVA && !isSolid(tx, ty);
  if (ok(tx0, ty0)) return null;
  for (let r = 1; r <= 6; r++) {
    let best = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !ok(tx0 + dx, ty0 + dy)) continue;
      const c = tileCenter(tx0 + dx, ty0 + dy), d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) return best;
  }
  return null;
}

// Tên hiển thị của đồ rơi
function dropName(kind, id, tier) {
  if (kind === 'tool') return (TOOL_LABEL[id] + ' ' + (TIER_NAME[tier] || '')).trim().toLowerCase();
  if (kind === 'gear') return ARMOR_NAME[id].toLowerCase();
  return ITEMS[id].name.toLowerCase();
}

// Nhận dụng cụ mới chế / mua: vào ô trống; hết ô thì thay món kém hơn; nếu cả 2 món đang có đều tốt hơn thì thả xuống đất
function receiveTool(id, tier) {
  const k = toolSlotFor(id, tier, TOOL_DUR[tier]);
  if (k) setTool(k, tier);
  else spawnDrop('tool', toolBase(id), 1, tier, TOOL_DUR[tier]);
}

// Tạo đồ rơi xuống đất trước mặt nhân vật. kind: 'item' | 'tool' | 'gear'
function spawnDrop(kind, id, n, tier, dur) {
  let x = player.x + (player.faceX || 0) * 28, y = player.y + (player.faceY || 1) * 28;
  if (collides(x, y)) { x = player.x; y = player.y; }
  const safe = safeDropSpot(x, y);
  if (safe) { x = safe.x; y = safe.y; }
  const near = kind !== 'tool' && itemDrops.find((d) => (d.kind || 'item') === kind && d.id === id && d.layer === layer && Math.hypot(d.x - x, d.y - y) < 14);
  if (near) { near.n += n; near.age = 0; }
  else {
    if (itemDrops.length >= DROP_MAX) itemDrops.shift();
    itemDrops.push({ kind, id, n, tier: tier || 0, dur, x, y, layer, age: 0, thrown: true });
  }
  say('Đã vứt ' + (n > 1 ? n + ' ' : '') + dropName(kind, id, tier));
}

function canDropNow() {
  if (deathScreen || sleepT > 0) return false;
  if (layer === 2) { say('Không vứt đồ trong nhà người khác được'); return false; }
  return true;
}

// Vứt món id: vật phẩm (1 cái, hoặc cả chồng nếu all), dụng cụ (cả cây)
function dropItem(id, all, slotIdx) { // slotIdx: ô kho đang vứt, "cả chồng" chỉ tính chồng ở ô đó (tối đa STACK_MAX)
  if (!canDropNow()) return;
  if (id in tools) {
    const tier = tools[id], dur = toolDur[id];
    if (tier <= 0) { say('Bạn không có ' + TOOL_LABEL[id].toLowerCase()); return; }
    setTool(id, 0);
    spawnDrop('tool', toolBase(id), 1, tier, dur);
    return;
  }
  const have = inv[id] || 0;
  if (have <= 0) { say('Bạn không có ' + ITEMS[id].name.toLowerCase()); return; }
  const n = all ? (slotIdx !== undefined ? Math.min(have, stackCount(slotIdx) || STACK_MAX) : have) : 1;
  inv[id] -= n;
  spawnDrop('item', id, n, 0);
}

// Vứt giáp: đang mặc (fromBag = false) hoặc đang cất trong túi (fromBag = true; all = cả chồng)
function dropGear(id, fromBag, all) {
  if (!canDropNow()) return;
  let n = 1;
  if (fromBag) {
    if (!(gearBag[id] > 0)) return;
    n = all ? gearBag[id] : 1;
    gearBag[id] -= n;
  } else {
    if (!gear[id]) return;
    gear[id] = false;
  }
  spawnDrop('gear', id, n, 3);
}

// Ngoài màn hình: vứt món đang chọn trên thanh nhanh
function dropSelected(all) {
  if (ui) return;
  const id = slotList()[hotbarSel];
  if (!id) { say('Ô này đang trống'); return; }
  dropSlotItem(id, all, hotbarSel);
}

// Vứt món nằm trong một ô kho (giáp cất trong túi hoặc vật phẩm / dụng cụ)
function dropSlotItem(id, all, slotIdx) {
  if (GEAR_IDS.includes(id)) dropGear(id, true, all);
  else dropItem(id, all, slotIdx);
}

// Trong túi đồ: vứt món ở ô đang trỏ chuột (giáp, lưới chế tạo hoặc ô kho)
function dropHovered(all) {
  if (deathScreen || sleepT > 0) return;
  const L = invLayout();
  const arm = L.armor.find((s) => inRect(mouse, s));
  if (arm) { dropGear(arm.id, false, false); return; }
  const i = L.all.findIndex((s) => inRect(mouse, s));
  if (i >= 0) {
    const id = slotList()[i];
    if (id) dropSlotItem(id, all, i);
    return;
  }
  const cell = L.grid.find((s) => s.active && inRect(mouse, s));
  if (cell && grid[cell.i]) {
    if (!canDropNow()) return;
    const id = grid[cell.i];
    grid[cell.i] = null;
    autoRefill = null;
    spawnDrop('item', id, 1, 0);
  }
}

function updateDrops(dt) {
  for (let i = itemDrops.length - 1; i >= 0; i--) {
    const d = itemDrops[i];
    d.age += dt;
    if (d.age > DROP_LIFE) { itemDrops.splice(i, 1); continue; }
    if (d.vx || d.vy) slideDrop(d, dt);
    else if (d.layer === layer) { const safe = safeDropSpot(d.x, d.y); if (safe) { d.x = safe.x; d.y = safe.y; } } // đang nằm trong dung nham / đá thì dời ra
    if (d.layer !== layer || d.age < (d.delay === undefined ? DROP_DELAY : d.delay)) continue;
    const far = Math.hypot(d.x - player.x, d.y - player.y);
    if (d.thrown && !d.armed) { if (far > DROP_PICK + 10) d.armed = true; continue; } // đồ tự vứt: phải đi ra xa rồi quay lại mới nhặt, không bị nhặt lại ngay
    if (far > DROP_PICK) continue;
    if (d.kind === 'tool') {
      const dur = d.dur === undefined ? TOOL_DUR[d.tier] : d.dur;
      const tk = toolSlotFor(d.id, d.tier, dur);
      if (!tk) continue; // cả 2 ô đang có món tốt hơn hoặc bằng: để nằm đó
      setTool(tk, d.tier, dur);
    } else if (d.kind === 'gear') {
      let left = d.n;
      if (!wornGearIn(GEAR_BASE[d.id])) { gear[d.id] = true; left--; } // ô đó chưa mặc: mặc luôn một món
      gearBag[d.id] += left;                          // phần còn lại cất vào túi
    } else {
      inv[d.id] = (inv[d.id] || 0) + d.n;
    }
    const txt = d.kind === 'tool' ? '+ ' + dropName(d.kind, d.id, d.tier) : '+' + d.n + ' ' + dropName(d.kind || 'item', d.id, d.tier);
    if (SHOW_ITEM_NOTICES) floaters.push({ x: player.x, y: player.y - 50, text: txt, life: 1.2 });
    itemDrops.splice(i, 1);
  }
}

function drawDrop(d, camX, camY) {
  const sx = d.x - camX, sy = d.y - camY;
  const hop = d.age < 0.35 ? Math.sin(d.age / 0.35 * Math.PI) * 14 : 0; // nảy lên lúc mới rớt
  const bob = Math.sin(d.age * 4) * 2 - hop;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 8, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  drawIcon(d.id, sx - 12, sy - 18 + bob, 24, d.kind === 'item' || !d.kind ? 1 : d.tier);
  if (d.n > 1) {
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right';
    shadowText('' + d.n, sx + 14, sy + 6 + bob);
  }
}

function armorReduction() { // mỗi ô giáp tính món tốt nhất đang mặc
  return Object.values(SLOT_VARIANTS).reduce((s, ids) => s + Math.max(0, ...ids.map((id) => (gear[id] ? ARMOR_REDUCE[id] : 0))), 0);
}

function wornGearIn(slot) { return SLOT_VARIANTS[slot].find((id) => gear[id]) || null; }
// Nhận một món giáp: mặc luôn nếu ô đó còn trống, không thì cất vào túi. Trả về true nếu đã mặc
function giveGear(id) {
  if (!wornGearIn(GEAR_BASE[id])) { gear[id] = true; return true; }
  gearBag[id]++;
  return false;
}

// ===== THANH GIÁP: mỗi món giáp đang mặc cho 25 điểm (đủ 4 món = 100). Trúng đòn thì giáp mất điểm; cạn thanh là TOÀN BỘ giáp đang mặc bị vỡ =====
const ARMOR_PER_PIECE = 25, MAX_ARMOR = 100, ARMOR_WEAR = 0.5; // ARMOR_WEAR: điểm giáp mất = sát thương gốc x hệ số này
let armorHp = 0, armorLast = 0;
function wornCount() { return Object.keys(SLOT_VARIANTS).filter((sl) => wornGearIn(sl)).length; }
function updateArmorPool() { // mặc thêm món -> cộng điểm, cởi / vứt bớt -> giảm trần
  const n = wornCount();
  if (n > armorLast) armorHp += (n - armorLast) * ARMOR_PER_PIECE;
  else if (n < armorLast) armorHp = Math.min(armorHp, n * ARMOR_PER_PIECE);
  armorHp = Math.max(0, Math.min(n * ARMOR_PER_PIECE, armorHp));
  armorLast = n;
}
function wearArmor(amount) { // gọi khi trúng đòn
  updateArmorPool();
  if (armorLast <= 0) return;
  armorHp -= Math.max(1, Math.ceil(amount * ARMOR_WEAR));
  if (armorHp <= 0) {
    for (const id of GEAR_IDS) gear[id] = false;
    armorHp = 0; armorLast = 0;
    say('Giáp đã vỡ nát!');
    floaters.push({ x: player.x, y: player.y - 70, text: 'GIÁP VỠ!', life: 1.6, color: '#8fd0ff' });
    burst(player.x, player.y - 14, '#9fd4ff', 18, 170);
  }
}

// ===== THANH NƯỚC RÚT (thể lực): giữ Shift để chạy thì tụt, cạn thì phải đi bộ cho tới khi hồi đủ 20% =====
const MAX_STAMINA = 200, STAMINA_DRAIN = 25, STAMINA_REGEN = 35, STAMINA_REGEN_WALK = 20, STAMINA_RESUME = 40;
let stamina = MAX_STAMINA, staminaTired = false;

const ATTACK_TIME = 0.35;
let hitTimer = 0;     // thời gian chờ giữa 2 lần chém
let attackAnim = 0;   // thời gian còn lại của hoạt ảnh chém
let swingTool = null; // dụng cụ đang vung: { id, tier } (null = tay không), để vẽ trên tay nhân vật

// Món vũ khí mạnh nhất đang có (không có gì thì đánh bằng tay)
// Dụng cụ đang cầm trên thanh nhanh (null nếu đang cầm thứ khác / tay không)
function heldToolKey() { // khoá ô dụng cụ đang cầm ('sword' hoặc 'sword2'), null nếu không cầm dụng cụ
  const id = slotList()[hotbarSel];
  return id && WEAPON_DMG[id] && tools[id] > 0 ? id : null;
}
function heldTool() { // loại dụng cụ đang cầm ('sword', 'axe'...), không phân biệt ô 1 / ô 2
  const k = heldToolKey();
  return k ? toolBase(k) : null;
}

// Vũ khí = đúng món đang cầm (không tự đổi sang món mạnh hơn)
function bestWeapon() {
  const key = heldToolKey();
  if (!key) return { id: null, key: null, tier: 0, dmg: HAND_DMG, cd: SWING_CD.hand };
  const id = toolBase(key), t = tools[key];
  return { id, key, tier: t, dmg: WEAPON_DMG[id][t] + (id === 'sword' && t >= 3 ? swordBonus : 0), cd: SWING_CD[id] };
}

// ---------- Hoạt ảnh dùng trang bị: tay không / rìu / cuốc / cuốc đất / kiếm ----------
// assets/player/tooluse.webp: 5 hàng (tay không, rìu, cuốc, cuốc đất, kiếm) x tối đa 8 khung, ô 136x92, chân đứng ở (ax, ay), nhân vật quay PHẢI (quay trái thì lật ngang).
// assets/fx/tool_hit.webp: 5 hàng (cùng thứ tự) x 3 khung hiệu ứng trúng đòn (bụi / mảnh vụn / tia sáng), ô 85x70, đáy-giữa là điểm chạm.
// Muốn quay lại sprite nhân vật cũ (chỉ giữ hiệu ứng trúng đòn) thì đặt TOOLUSE_REPLACE_BODY = false.
const TOOLUSE_REPLACE_BODY = true;
const TOOLUSE = {
  img: null, fx: null,
  cw: 136, ch: 92, ax: 68, ay: 76,
  fxW: 85, fxH: 70, fxTime: 0.32,
  rows: { hand: 0, axe: 1, pickaxe: 2, hoe: 3, sword: 4 },
  counts: [8, 7, 7, 7, 7],     // số khung mỗi hàng
  impact: [5, 4, 4, 4, 4],     // khung chạm mục tiêu (hiệu ứng trúng đòn hiện đúng lúc này)
  heads: [ // [x, y] giữa mặt từng khung (để đội nón lá đúng chỗ)
    [[74, 47], [74, 47], [74, 49], [80, 48], [80, 48], [77, 47], [68, 48], [71, 48]],
    [[72, 46], [70, 45], [76, 47], [74, 45], [69, 47], [69, 47], [70, 45]],
    [[72, 44], [68, 45], [68, 41], [74, 46], [67, 51], [71, 45], [74, 46]],
    [[71, 44], [73, 40], [73, 45], [76, 45], [65, 48], [75, 43], [76, 49]],
    [[71, 43], [72, 44], [77, 46], [75, 45], [64, 45], [67, 46], [78, 49]],
  ],
};
let toolSide = 1;      // hướng ngang đang quay mặt (1 = phải, -1 = trái) của hoạt ảnh dùng trang bị
const toolFx = [];     // hiệu ứng trúng đòn: { r: hàng, x, y, t } (t < 0: chưa tới lúc hiện)

// Kiểu hoạt ảnh đang chạy: 'hand' | 'axe' | 'pickaxe' | 'hoe' | 'sword' | null (không vung gì / đang bắn cung)
function toolUseKind() {
  if (bowSpriteActive()) return null;
  if (hoeSwing) return hoeSwing.tool ? 'hoe' : 'hand';
  if (attackAnim <= 0) return null;
  if (!swingTool) return 'hand';
  return swingTool.id in TOOLUSE.rows ? swingTool.id : null;
}
function toolUseProg() {
  if (hoeSwing) return Math.min(0.999, hoeSwing.t);
  return Math.min(0.999, Math.max(0, 1 - attackAnim / ATTACK_TIME));
}
function toolImpactDelay(kind) {
  const r = TOOLUSE.rows[kind];
  return TOOLUSE.impact[r] / TOOLUSE.counts[r] * ATTACK_TIME * 0.9;
}
// Tạo hiệu ứng trúng đòn tại (x, y) = điểm chạm trên mặt đất; delay: chờ tới đúng khung chạm
function spawnToolFx(kind, x, y, delay = 0) {
  if (!TOOLUSE.fx || !(kind in TOOLUSE.rows)) return;
  toolFx.push({ r: TOOLUSE.rows[kind], x, y, t: -delay });
  if (toolFx.length > 20) toolFx.shift();
}
function updateToolFx(dt) {
  for (const f of toolFx) f.t += dt;
  for (let i = toolFx.length - 1; i >= 0; i--) if (toolFx[i].t >= TOOLUSE.fxTime) toolFx.splice(i, 1);
}
function drawToolFx(camX, camY) {
  const T = TOOLUSE;
  if (!T.fx) return;
  for (const f of toolFx) {
    if (f.t < 0) continue;
    const u = f.t / T.fxTime;
    ctx.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    ctx.drawImage(T.fx, Math.min(2, Math.floor(u * 3)) * T.fxW, f.r * T.fxH, T.fxW, T.fxH,
      Math.round(f.x - camX - T.fxW / 2), Math.round(f.y - camY - T.fxH), T.fxW, T.fxH);
  }
  ctx.globalAlpha = 1;
}
// Vẽ cả người đang vung trang bị (thay sprite thường trong lúc vung)
function drawToolUseBody(sx, sy, kind) {
  const T = TOOLUSE, r = T.rows[kind], n = T.counts[r];
  const frame = Math.min(n - 1, Math.floor(toolUseProg() * n));
  if (player.faceX) toolSide = player.faceX < 0 ? -1 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 12, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(sx, sy + 14);
  ctx.scale(toolSide, 1);
  ctx.drawImage(T.img, frame * T.cw, r * T.ch, T.cw, T.ch, -T.ax, -T.ay, T.cw, T.ch);
  ctx.restore();
  playerPose = { name: 'tooluse', row: toolSide < 0 ? 1 : 2, frame, tu: { r, frame } };
}

// Một đòn đánh vào zombie / động vật: tốn độ bền, trả về sát thương gây ra
function swingWeapon(tx, ty) { // (tx, ty): chỗ mục tiêu bị đánh, để hiện hiệu ứng trúng đòn
  const w = bestWeapon();
  hitTimer = w.cd;
  attackAnim = ATTACK_TIME;
  swingTool = w.id ? { id: w.id, tier: w.tier } : null;
  if (w.key) wearTool(w.key);
  if (tx !== undefined && !(w.id === 'bow')) spawnToolFx(w.id || 'hand', tx, ty, toolImpactDelay(w.id || 'hand'));
  return w.dmg;
}
let ui = null;        // null | 'inv' | 'furnace' | 'market' | 'map' | 'spellbook' | 'elements' | 'dwarf'
let hungerWarned = false;
let msg = { text: '', time: 0 };
let gameTime = 0;
let torchTime = 0;
let shake = 0;        // rung màn hình
let hurtFlash = 0;    // viền đỏ khi bị thương
const floaters = [];
const SHOW_ITEM_NOTICES = false; // false = không hiện chữ bay "+N đồ" và thông báo nhận / chế / đổi đồ
function noticeItem(text) { if (SHOW_ITEM_NOTICES) say(text); }

function say(text) {
  msg = { text, time: 2.5 };
}

// Cấp ngoại hình nhân vật: tay không = 1, đồ gỗ = 2, đồ đá/sắt = 3
function outfitLevel() {
  return Math.min(3, 1 + Math.max(tools.axe, tools.pickaxe, tools.sword));
}

// ---------- Hiệu ứng: hạt, nổ ----------
const particles = [];
const booms = [];

function burst(x, y, color, n, speed, gravity = 600) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    const life = 0.4 + Math.random() * 0.4;
    particles.push({
      x, y, life, max: life, gravity, color,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - speed * 0.4,
      size: 2 + Math.random() * 3,
    });
  }
  if (particles.length > 400) particles.splice(0, particles.length - 400);
}

function updateEffects(dt) {
  for (const p of particles) {
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);

  updateToolFx(dt);
  for (const b of booms) b.t += dt;
  for (let i = booms.length - 1; i >= 0; i--) if (booms[i].t * BOOM.fps >= BOOM.frames) booms.splice(i, 1);

  for (const [k, v] of hitFx) {
    if (v - dt <= 0) hitFx.delete(k); else hitFx.set(k, v - dt);
  }
  for (const f of floaters) { f.y -= 30 * dt; f.life -= dt; }
  for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].life <= 0) floaters.splice(i, 1);
  for (const c of chests) c.t += dt;
  for (const b of bags) b.t += dt;

  world.flash = Math.max(0, world.flash - dt * 2.5);
  hurtFlash = Math.max(0, hurtFlash - dt * 2);
  shake = Math.max(0, shake - dt * 1.5);
  msg.time -= dt;

  // Lửa đuốc
  if (torchTime > 0 && Math.random() < 0.3) burst(player.x + player.faceX * 10, player.y - 26, '#ffb347', 1, 40, -120);
}

// ---------- Máu người chơi ----------
function hurt(amount, armorPierce = 0) { // armorPierce (0..1): phần giáp bị xuyên qua (dung nham núi lửa, magma.js)
  if (outsideTick || player.invuln > 0) return; // đang ở trong nhà: zombie bên ngoài không làm đau được
  if (window.ExtraMagic && ExtraMagic.stoneUp && ExtraMagic.stoneUp() && !witchFlags.stoneBlock) { // Khiên Đá chặn đòn: đủ 5 lần thì được học Địa Chấn
    witchFlags.stoneN = Math.min(5, witchFlags.stoneN + 1);
    floaters.push({ x: player.x, y: player.y - 70, text: 'Khiên Đá chặn ' + witchFlags.stoneN + '/5', life: 1.4, color: '#c9b79c' });
    if (witchFlags.stoneN >= 5) { witchFlags.stoneBlock = true; say('Khiên Đá đã chặn 5 đòn! Phù Thủy có thể dạy Địa Chấn'); }
  }
  if (window.ExtraMagic && ExtraMagic.shieldUp && ExtraMagic.shieldUp() && !witchFlags.shieldBlock) { // Quang Giáp hấp thụ đòn: đủ 10 lần thì được học Thánh Quang Giáng Thế
    witchFlags.shieldN = Math.min(10, witchFlags.shieldN + 1);
    floaters.push({ x: player.x, y: player.y - 70, text: 'Quang Giáp hấp thụ ' + witchFlags.shieldN + '/10', life: 1.4, color: '#ffe98a' });
    if (witchFlags.shieldN >= 10) { witchFlags.shieldBlock = true; say('Quang Giáp đã hấp thụ 10 đòn! Phù Thủy có thể dạy Thánh Quang Giáng Thế'); }
  }
  let dmg = Math.max(1, Math.round(amount * (1 - armorReduction() * (1 - armorPierce)) * (spellT.shield > 0 ? 1 - witchSkill('shield').cut : 1) * (window.IceMagic ? IceMagic.cutMul() : 1) * (window.ExtraMagic ? ExtraMagic.cutMul() : 1)));
  if (window.ExtraMagic) { dmg = ExtraMagic.absorb(dmg); if (dmg <= 0) { player.invuln = 0.6; return; } } // Quang Giáp chặn hết
  player.hp = Math.max(0, player.hp - dmg);
  wearArmor(amount); // thanh giáp mất điểm, cạn là vỡ giáp
  player.invuln = 1;
  player.sinceHurt = 0;
  hurtFlash = 1;
  shake = Math.max(shake, 0.4);
  floaters.push({ x: player.x, y: player.y - 50, text: '-' + dmg, life: 1.2, color: '#ff5a4d' });
  burst(player.x, player.y - 10, '#e74c3c', 10, 140);
  if (player.hp <= 0) die();
}

// Chảy máu: trúng đá của zombie tầm xa thì mất thêm 5 máu mỗi giây, 3 lần (bỏ qua giáp)
const BLEED_DMG = 5, BLEED_TICKS = 3, BLEED_GAP = 1;
let bleed = null; // { n: số lần còn lại, t: giây tới lần rút kế }
function updateBleed(dt) {
  if (!bleed || player.hp <= 0) return;
  bleed.t -= dt;
  if (bleed.t > 0) return;
  bleed.t += BLEED_GAP;
  player.hp = Math.max(0, player.hp - BLEED_DMG);
  player.sinceHurt = 0;
  hurtFlash = Math.max(hurtFlash, 0.5);
  floaters.push({ x: player.x, y: player.y - 50, text: '-' + BLEED_DMG + ' (chảy máu)', life: 1.2, color: '#c0392b' });
  burst(player.x, player.y - 10, '#9b1c1c', 6, 100);
  if (--bleed.n <= 0) bleed = null;
  if (player.hp <= 0) { bleed = null; die(); }
}

// Nhiễm độc: nhện cắn thì mất máu mỗi giây (bỏ qua giáp) cho tới khi hết độc hoặc uống Thuốc Giải Độc (Chợ Đen)
const POISON_DMG = 2, POISON_TICKS = 8, POISON_GAP = 1;
let poison = null; // { n: số lần còn lại, t: giây tới lần rút kế }
function updatePoison(dt) {
  if (!poison || player.hp <= 0) return;
  poison.t -= dt;
  if (poison.t > 0) return;
  poison.t += POISON_GAP;
  player.hp = Math.max(0, player.hp - POISON_DMG);
  player.sinceHurt = 0;
  hurtFlash = Math.max(hurtFlash, 0.3);
  floaters.push({ x: player.x, y: player.y - 50, text: '-' + POISON_DMG + ' (độc)', life: 1.2, color: '#7bd13a' });
  burst(player.x, player.y - 10, '#5fae2a', 5, 90);
  if (--poison.n <= 0) { poison = null; say('Độc đã tan'); }
  if (player.hp <= 0) { poison = null; die(); }
}
function useAntidote() { // trả về true nếu đã uống thuốc (chiêu Z hệ Độc dùng giá trị này để quyết định trừ mana / hồi chiêu)
  if (inv.antidote <= 0) { say('Bạn không có thuốc giải độc'); return false; }
  if (!poison) { say('Bạn không bị nhiễm độc'); return false; }
  inv.antidote--;
  poison = null;
  if (!witchFlags.antidoteUse) { // đếm lần giải độc (bị nhện cắn rồi uống thuốc) để mở học Độc Chúa (cần 5 lần)
    witchFlags.cureN = Math.min(5, witchFlags.cureN + 1);
    if (witchFlags.cureN >= 5) { witchFlags.antidoteUse = true; say('Đã giải độc 5 lần! Phù Thủy có thể dạy Độc Chúa'); }
    else floaters.push({ x: player.x, y: player.y - 70, text: 'Giải độc ' + witchFlags.cureN + '/5', life: 1.4, color: '#7bd13a' });
  }
  floaters.push({ x: player.x, y: player.y - 50, text: 'Đã giải độc', life: 1.2, color: '#5ec8ff' });
  burst(player.x, player.y - 10, '#5ec8ff', 12, 120, -80);
  return true;
}

function respawn() {
  bleed = null; poison = null;
  stamina = MAX_STAMINA; staminaTired = false; updateArmorPool();
  if (layer !== 0) switchLayer(0);
  houseCur = null;
  const hObj = houseSpawnTarget();
  if (hObj) { // hồi sinh trong nhà dân làng đã đặt giường
    enterHouse(hObj);
    const f = tileCenter(spawnPoint.tx, spawnPoint.ty + 1);
    const c = isSolid(spawnPoint.tx, spawnPoint.ty + 1) ? tileCenter(0, 1) : f;
    player.x = c.x; player.y = c.y;
    player.hp = MAX_HP; player.hpGhost = MAX_HP; player.hunger = 60; player.invuln = 2;
    rocks.length = 0; clearSpiders(); strikes.length = 0;
    say('Bạn bị ngất đi và tỉnh lại trong căn nhà đã đặt điểm hồi sinh');
    return;
  }
  if (spawnPoint && spawnPoint.house) spawnPoint = null; // nhà / giường không còn: về điểm xuất phát
  const sp = respawnPosition();
  const stx = Math.floor(sp.x / TILE), sty = Math.floor(sp.y / TILE);
  // Dọn các ô quanh điểm hồi sinh để không bị kẹt trong cột thu lôi
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (isSolid(stx + dx, sty + dy) && !(spawnPoint && stx + dx === spawnPoint.tx && sty + dy === spawnPoint.ty)) {
        changes.set((stx + dx) + ',' + (sty + dy), GRASS);
      }
    }
  }
  player.x = sp.x;
  player.y = sp.y;
  rocks.length = 0; clearSpiders();
  player.hp = MAX_HP;
  player.hpGhost = MAX_HP;
  player.hunger = 60;
  player.invuln = 2;
  strikes.length = 0;
  // Dọn zombie hoang quanh điểm xuất phát để không bị vây ngay khi hồi sinh
  for (let i = zombies.length - 1; i >= 0; i--) {
    if (!zombies[i].guard && Math.hypot(zombies[i].x - sp.x, zombies[i].y - sp.y) < 500) zombies.splice(i, 1);
  }
  say('Bạn bị ngất đi và tỉnh lại ở điểm xuất phát');
}

// Chết: dụng cụ + giáp (và nguyên liệu nếu bật) gom vào một túi đồ tại chỗ ngã, rồi hiện màn hình chết
function die() {
  burnT = 0;
  if (deathScreen) return;
  returnGrid();
  closeUi();
  held = null;
  const retPos = roomReturnPos(); // trong nhà / đấu trường: túi đồ nằm ngoài cửa
  const inHouse = Boolean(retPos);
  const bag = { x: inHouse ? retPos.x : player.x, y: inHouse ? retPos.y : player.y, layer: inHouse ? (layer === 3 ? arenaBaseLayer() : 0) : layer, t: 0, tools: { ...tools }, toolDur: { ...toolDur }, gear: { ...gear }, items: {} };
  bag.gearBag = { ...gearBag }; // giáp cất trong túi cũng rơi
  for (const k in gearBag) gearBag[k] = 0;
  let any = Object.values(bag.tools).some((v) => v > 0) || Object.values(bag.gear).some(Boolean) || Object.values(bag.gearBag).some((v) => v > 0);
  for (const k in tools) setTool(k, 0);
  for (const k in gear) gear[k] = false;
  if (DEATH_DROP_ITEMS) {
    for (const k in inv) if (inv[k] > 0 && !k.startsWith('tome_')) { bag.items[k] = inv[k]; inv[k] = 0; any = true; }
  }
  if (any) bags.push(bag);
  player.hp = 0;
  player.hpGhost = 0;
  shake = 0;
  hurtFlash = 0.6;
  burst(player.x, player.y - 10, '#e74c3c', 18, 200);
  deathScreen = { t: 0, score, bag: any ? bag : null };
}

function nearestBag(maxDist) {
  let best = null, bd = maxDist;
  for (const b of bags) {
    if (b.layer !== layer) continue;
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// Nhặt lại túi đồ: dụng cụ lấy cấp cao hơn, giáp mặc lại, nguyên liệu cộng vào kho
function collectBag(b, silent) {
  for (const k in b.tools) {
    const dur = b.toolDur && b.toolDur[k] !== undefined ? b.toolDur[k] : TOOL_DUR[b.tools[k]];
    if (b.tools[k] > tools[k] || (b.tools[k] === tools[k] && b.tools[k] > 0 && dur > toolDur[k])) setTool(k, b.tools[k], dur);
  }
  for (const k in b.gear) gear[k] = gear[k] || b.gear[k];
  for (const k in (b.gearBag || {})) gearBag[k] += b.gearBag[k];
  for (const k in b.items) inv[k] += b.items[k];
  const i = bags.indexOf(b);
  if (i >= 0) bags.splice(i, 1);
  if (silent) return;
  burst(b.x, b.y - 12, '#f2c14e', 16, 180);
  floaters.push({ x: b.x, y: b.y - 30, text: 'Đã nhặt lại đồ!', life: 1.4, color: '#ffd34d' });
  noticeItem('Đã nhặt lại toàn bộ đồ của bạn!');
}

// Hồi sinh tại chỗ (sau khi xem quảng cáo): giữ nguyên trang bị, không để lại túi
function reviveInPlace() {
  if (!deathScreen) return;
  const bag = deathScreen.bag;
  if (bag) collectBag(bag, true);
  deathScreen = null;
  player.hp = MAX_HP;
  player.hpGhost = MAX_HP;
  player.hunger = Math.max(player.hunger, 60);
  player.invuln = 3;
  hurtFlash = 0;
  rocks.length = 0; clearSpiders();
  strikes.length = 0;
  for (let i = zombies.length - 1; i >= 0; i--) {
    if (!zombies[i].guard && Math.hypot(zombies[i].x - player.x, zombies[i].y - player.y) < 400) zombies.splice(i, 1);
  }
  burst(player.x, player.y - 20, '#ffd34d', 24, 220);
  say('Đã hồi sinh tại chỗ, giữ nguyên trang bị!');
}

// Hồi sinh thường: về điểm xuất phát, trang bị nằm lại trong túi
function respawnNormal() {
  const had = deathScreen && deathScreen.bag;
  deathScreen = null;
  respawn();
  score = 0;
  say(had ? 'Đồ của bạn nằm trong túi ở nơi gục ngã' : 'Bạn đã hồi sinh ở điểm xuất phát');
}

// ---------- Quảng cáo thưởng (xem để hồi sinh) ----------
// AD_PROVIDER = 'mock'   : quảng cáo giả 5 giây, chỉ để thử luồng game (KHÔNG có tiền)
// AD_PROVIDER = 'adsense': Google AdSense for Games (H5). Cần thêm vào survival.html (trước survival.js):
//   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXX" crossorigin="anonymous"></script>
//   <script>window.adsbygoogle = window.adsbygoogle || []; window.adBreak = window.adConfig = function (o) { adsbygoogle.push(o); };</script>
// Mạng quảng cáo khác (Unity, AppLovin, CrazyGames, Poki...): viết thêm một nhánh if bên dưới,
// gọi onReward() khi người chơi xem xong, onCancel() khi bỏ giữa chừng hoặc không có quảng cáo.
const AD_PROVIDER = 'mock';
const MOCK_AD_SECONDS = 5;
let adState = null; // { t, total, onReward, onCancel }

function showRewardedAd(onReward, onCancel) {
  if (adState) return;
  if (AD_PROVIDER === 'adsense') {
    if (typeof adBreak !== 'function') { say('Quảng cáo chưa sẵn sàng, thử lại sau'); onCancel(); return; }
    let viewed = false;
    adBreak({
      type: 'reward',
      name: 'revive',
      beforeReward: (showAd) => showAd(),
      adViewed: () => { viewed = true; },
      adBreakDone: () => { if (viewed) onReward(); else { say('Không có quảng cáo hoặc bạn đã bỏ qua'); onCancel(); } },
    });
    return;
  }
  adState = { t: MOCK_AD_SECONDS, total: MOCK_AD_SECONDS, onReward, onCancel };
}

function updateAd(dt) {
  adState.t -= dt;
  if (adState.t <= 0) {
    const done = adState.onReward;
    adState = null;
    done();
  }
}

// ---------- Màn hình chết ----------
function deathLayout(W, H) {
  const bw = Math.min(420, W - 40), bh = 52, gap = 12;
  const x = Math.round(W / 2 - bw / 2);
  const y0 = Math.round(H * 0.5);
  return {
    y0,
    respawn: { x, y: y0, w: bw, h: bh },
    ad: { x, y: y0 + bh + gap, w: bw, h: bh },
    cancel: { x: Math.round(W / 2 - 90), y: Math.round(H / 2 + 70), w: 180, h: 40 },
  };
}

function clickDeath() {
  const L = deathLayout(canvas.width, canvas.height);
  if (adState) {
    if (inRect(mouse, L.cancel)) { const cancel = adState.onCancel; adState = null; cancel(); }
    return;
  }
  if (deathScreen.t < 0.8) return; // chống bấm nhầm khi đang đánh nhau
  if (inRect(mouse, L.respawn)) respawnNormal();
  else if (inRect(mouse, L.ad)) showRewardedAd(reviveInPlace, () => {});
}

function drawMcButton(r, label, sub, hover, enabled, accent) {
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  ctx.fillStyle = !enabled ? '#2a2a2a' : hover ? '#55557a' : '#3c3c3c';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = enabled ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)';
  ctx.fillRect(r.x, r.y, r.w, 3);
  ctx.fillRect(r.x, r.y, 3, r.h);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
  ctx.fillRect(r.x + r.w - 3, r.y, 3, r.h);
  if (hover && enabled) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = !enabled ? '#777' : accent || (hover ? '#ffffa0' : '#e0e0e0');
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(label, r.x + r.w / 2, r.y + (sub ? 24 : r.h / 2 + 6));
  if (sub) {
    ctx.fillStyle = enabled ? '#a8a8a8' : '#666';
    ctx.font = '12px sans-serif';
    ctx.fillText(sub, r.x + r.w / 2, r.y + 42);
  }
}

function drawDeathScreen(W, H) {
  const d = deathScreen;
  const L = deathLayout(W, H);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(95,12,12,0.6)');
  g.addColorStop(1, 'rgba(20,0,0,0.88)');
  ctx.globalAlpha = Math.min(1, d.t * 2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = '#3a3a3a';
  ctx.fillText('Bạn đã chết!', W / 2 + 3, L.y0 - 117);
  ctx.fillStyle = '#fff';
  ctx.fillText('Bạn đã chết!', W / 2, L.y0 - 120);

  ctx.font = '20px sans-serif';
  const lab = 'Điểm: ', num = String(d.score);
  const w1 = ctx.measureText(lab).width, w2 = ctx.measureText(num).width;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.fillText(lab, W / 2 - (w1 + w2) / 2, L.y0 - 72);
  ctx.fillStyle = '#ffff55';
  ctx.fillText(num, W / 2 - (w1 + w2) / 2 + w1, L.y0 - 72);

  ctx.textAlign = 'center';
  if (d.bag) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#ffb3a8';
    ctx.fillText('Toàn bộ đồ của bạn đã rơi vào túi tại nơi gục ngã', W / 2, L.y0 - 36);
  }

  const on = d.t >= 0.8 && !adState;
  drawMcButton(L.respawn, 'Hồi sinh', (spawnPoint && spawnPoint.house && houseSpawnTarget() ? 'Về căn nhà đã đặt giường' : 'Về điểm xuất phát') + (d.bag ? ', đồ nằm lại trong túi' : ''), on && inRect(mouse, L.respawn), on);
  drawMcButton(L.ad, 'Xem quảng cáo để hồi sinh', 'Hồi sinh tại chỗ, giữ nguyên toàn bộ đồ', on && inRect(mouse, L.ad), on, '#ffe27a');

  if (adState) {
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('Quảng cáo (bản thử nghiệm)', W / 2, H / 2 - 50);
    ctx.fillStyle = '#bbb';
    ctx.font = '16px sans-serif';
    const bw = Math.min(300, W - 60), bx = W / 2 - bw / 2, by = H / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(bx - 2, by - 2, bw + 4, 16);
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, bw, 12);
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(bx, by, bw * (1 - adState.t / adState.total), 12);
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.ceil(adState.t) + ' giây', W / 2, by + 42);
    drawMcButton(L.cancel, 'Hủy', null, inRect(mouse, L.cancel), true);
  }
}

function updateVitals(dt) {
  player.invuln -= dt;
  player.sinceHurt += dt;
  torchTime = Math.max(0, torchTime - dt);

  // Đói tăng dần; đói hết thì mất máu, còn no thì máu hồi chậm
  player.hunger = Math.max(0, player.hunger - HUNGER_RATE * (player.running ? BALANCE.player.hungerRunMul : 1) * dt);
  if (player.hunger < 25 && !hungerWarned) { hungerWarned = true; say('Bạn đang đói! Chọn món ăn trên thanh công cụ'); }
  if (player.hunger > 40) hungerWarned = false;

  if (player.hunger <= 0) {
    player.hp = Math.max(0, player.hp - STARVE_DPS * dt);
    player.sinceHurt = 0;
    hurtFlash = Math.max(hurtFlash, 0.25);
    if (player.hp <= 0) die();
  } else if (player.sinceHurt > BALANCE.player.regenDelay && player.hunger >= BALANCE.player.regenMinHunger && player.hp < MAX_HP) {
    player.hp = Math.min(MAX_HP, player.hp + BALANCE.player.regenPerSec * dt);
  }
  player.hpGhost = player.hpGhost > player.hp ? Math.max(player.hp, player.hpGhost - 30 * dt) : player.hp;
}

// ---------- Sự kiện: ngày đêm, mưa, giông bão, rương ----------
// Cân bằng thời tiết: trước đây cứ 40-80 giây lại thử một lần, 70% ra mưa, 60% trong đó là giông => gần như lúc nào cũng mưa/giông.
// Nay: mỗi đợt xong là trời quang 2-4 phút; mưa thường là chính (~75%), giông bão hiếm hơn và ngắn hơn.
const WEATHER = BALANCE.weather; // xem config.js
const DAY_LENGTH = BALANCE.day.length;       // giây cho 1 ngày đêm (15 phút: ~10 phút ban ngày, ~5 phút ban đêm)
const world = {
  dayT: 0.85,                 // 0 = giữa trưa, 0.5 = nửa đêm
  day: 1,
  rain: { active: false, storm: false, intensity: 0, timeLeft: 0, nextCheck: BALANCE.weather.firstCheck, nextStrike: 5 },
  nextChest: 150,
  flash: 0,                   // chớp sáng toàn màn hình
};
let chests = [];
let strikes = [];           // các cú sét đang diễn ra
const splashes = [];          // gợn nước khi mưa rơi
const drops = [];             // hạt mưa
for (let i = 0; i < 220; i++) {
  drops.push({ x: Math.random(), y: Math.random(), s: 0.8 + Math.random() * 0.6 });
}

// Độ tối của bầu trời ngoài trời (không phụ thuộc tầng đang đứng)
function outdoorDarkness() {
  const raw = 0.5 - 0.5 * Math.cos(world.dayT * Math.PI * 2);
  const k = Math.min(1, Math.max(0, (raw - BALANCE.day.nightStart) / BALANCE.day.nightRamp)); // trước đây bắt đầu tối từ raw 0.5 (đêm chiếm ~42% ngày), nay ~33%
  return k * BALANCE.day.maxDarkness;
}

function darkness() {
  if (layer === 1) return 0.92; // trong hầm tối đen, chỉ thấy vùng quanh người
  if (layer === 2) return 0;    // trong nhà luôn sáng
  if (layer === 3) return arena.kind === 'omni' ? 0.15 : 0.5;  // đấu trường boss: u tối, sáng nhờ đuốc (phòng Hỗn Nguyên có ảnh nền riêng nên chỉ phủ nhẹ)
  return outdoorDarkness();
}

function updateEvents(dt) {
  if (layer === 2 && houseCur && houseCur.blackMarket && !blackNight()) { exitHouse(); say('Trời sáng rồi, Chợ Đen đóng cửa'); } // ban ngày chỉ còn là nhà thường
  // Ngày đêm
  world.dayT += dt / DAY_LENGTH;
  if (world.dayT >= 1) { world.dayT -= 1; world.day++; score += 20; say('Ngày ' + world.day + ' bắt đầu'); }
  farmClock += dt * (layer === 0 && world.rain && world.rain.active ? 1.6 : 1); // mưa giúp cây lớn nhanh hơn

  if (layer !== 0) return; // hầm mỏ và trong nhà: không có mưa / sét / rương ngẫu nhiên

  // Mưa (có thể thành giông bão kèm sét)
  const r = world.rain;
  if (r.active) {
    r.timeLeft -= dt;
    if (r.timeLeft <= 0) {
      r.active = false; r.storm = false; say('Mưa tạnh rồi');
      r.nextCheck = WEATHER.clearMin + Math.random() * (WEATHER.clearMax - WEATHER.clearMin); // luôn có một quãng trời quang sau mỗi đợt
    }
  } else {
    r.nextCheck -= dt;
    if (r.nextCheck <= 0) {
      if (Math.random() < WEATHER.chance) {
        r.active = true;
        r.storm = Math.random() < WEATHER.stormShare;
        const d = r.storm ? WEATHER.stormTime : WEATHER.rainTime;
        r.timeLeft = d[0] + Math.random() * (d[1] - d[0]);
        r.nextStrike = 5;
        say(r.storm ? 'Giông bão! Tránh vòng đỏ báo sét!' : 'Trời bắt đầu mưa...');
      } else {
        r.nextCheck = WEATHER.retryMin + Math.random() * (WEATHER.retryMax - WEATHER.retryMin);
      }
    }
  }
  const target = r.active ? 1 : 0;
  r.intensity += Math.sign(target - r.intensity) * Math.min(Math.abs(target - r.intensity), dt * 0.5);

  if (r.storm && r.intensity > 0.6) {
    r.nextStrike -= dt;
    if (r.nextStrike <= 0) {
      r.nextStrike = 3 + Math.random() * 5;
      spawnStrike();
    }
  }

  // Rương ngẫu nhiên: hiếm, tối đa MAX_WORLD_CHESTS cùng lúc. Nhặt xong là mất hẳn, rương mới hiện ở chỗ khác.
  world.nextChest -= dt;
  if (world.nextChest <= 0) {
    world.nextChest = CHEST_RESPAWN[0] + Math.random() * (CHEST_RESPAWN[1] - CHEST_RESPAWN[0]);
    if (chests.filter((c) => !c.legend).length < MAX_WORLD_CHESTS) spawnChest();
  }
}

// ---------- Sét ----------
function findTiles(type, radius) {
  const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE);
  const out = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (getTile(px + dx, py + dy) === type) out.push({ tx: px + dx, ty: py + dy, d: dx * dx + dy * dy });
    }
  }
  return out;
}

function spawnStrike() {
  let x, y;
  const drod = findTiles(DROD, DROD_RANGE).sort((a, b) => a.d - b.d)[0]; // Cột Thu Lôi Tím gần nhất (ưu tiên, tầm xa hơn)
  const rod = drod || findTiles(ROD, 10).sort((a, b) => a.d - b.d)[0]; // cột thu lôi gần nhất
  const trees = findTiles(TREE, 7);

  if (rod) {
    ({ x, y } = tileCenter(rod.tx, rod.ty));
  } else if (trees.length && Math.random() < 0.35) {
    const t = trees[Math.floor(Math.random() * trees.length)];
    ({ x, y } = tileCenter(t.tx, t.ty));
  } else {
    const nearPlayer = Math.random() < 0.4;
    const a = Math.random() * Math.PI * 2;
    const d = nearPlayer ? 20 + Math.random() * 50 : 150 + Math.random() * 300;
    x = player.x + Math.cos(a) * d;
    y = player.y + Math.sin(a) * d;
  }
  strikes.push({ x, y, t: 0, variant: Math.floor(Math.random() * 4), hit: false });
}

// Khung hiện tại của cú sét (âm = đang cảnh báo)
function strikeFrame(s) {
  return Math.floor((s.t - LIGHTNING.warn) * LIGHTNING.fps);
}

function updateStrikes(dt) {
  for (let i = strikes.length - 1; i >= 0; i--) {
    const s = strikes[i];
    s.t += dt;
    const f = strikeFrame(s);
    if (f < 0 && Math.hypot(s.x - player.x, s.y - player.y) < STRIKE_RADIUS) s.inside = true; // đã từng đứng trong vòng cảnh báo
    if (!s.hit && f >= LIGHTNING.hitFrame) { s.hit = true; strikeImpact(s); }
    if (f >= LIGHTNING.frames) strikes.splice(i, 1);
  }
}

function strikeImpact(s) {
  world.flash = 1;
  shake = 0.5;
  booms.push({ x: s.x, y: s.y, t: 0 });
  burst(s.x, s.y, '#fff7b0', 18, 220);

  const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
  const key = tx + ',' + ty;
  const tile = getTile(tx, ty);
  const c = tileCenter(tx, ty);

  if (tile === DROD) { // Cột Thu Lôi Tím: không hỏng, giật điện quái xung quanh
    if (!witchFlags.drodStruck) { witchFlags.drodStruck = true; say('Sét đã đánh trúng Cột Thu Lôi Tím! Phù Thủy có thể dạy Thiên Lôi'); }
    floaters.push({ x: c.x, y: c.y - 80, text: 'Cột Thu Lôi Tím hút sét!', life: 1.8, color: '#c58bff' });
    drodFx.set(key, gameTime);
    electrifyZombiesNear(c.x, c.y);
    for (const z of zombies) {
      if (z.dead || z.type === 6 || Math.hypot(z.x - c.x, z.y - c.y) > DROD_ZAP_R) continue; // Zombie Điện miễn nhiễm điện giật
      hitZombie(z, DROD_ZAP_DMG);
      burst(z.x, z.y - 24, '#c58bff', 10, 170);
    }
    burst(c.x, c.y - 30, '#c58bff', 22, 240);
  } else if (tile === ROD) {
    const left = (rodLife.get(key) ?? ROD_LIFE) - 1;
    floaters.push({ x: c.x, y: c.y - 30, text: 'Cột thu lôi hút sét!', life: 1.6, color: '#8fd3ff' });
    electrifyZombiesNear(c.x, c.y);
    if (left <= 0) {
      rodLife.delete(key);
      changes.set(key, GRASS);
      say('Cột thu lôi đã cháy hỏng');
    } else {
      rodLife.set(key, left);
    }
  } else if (tile === TREE) {
    // Cây bị sét đánh cháy thành than
    const n = 1 + Math.floor(Math.random() * 2);
    changes.set(key, GRASS);
    damage.delete(key);
    spawnLoot('coal', n, c.x, c.y);
    burst(c.x, c.y, '#e8742a', 14, 160);
  }

  if (s.inside && layer !== 2 && !outsideTick && Math.hypot(s.x - player.x, s.y - player.y) >= STRIKE_RADIUS && !witchFlags.strikeDodge) { // né thoát: từng đứng trong vòng cảnh báo nhưng đã ra ngoài khi sét giáng
    witchFlags.dodgeN = Math.min(3, witchFlags.dodgeN + 1);
    floaters.push({ x: player.x, y: player.y - 60, text: 'Né sét! ' + witchFlags.dodgeN + '/3', life: 1.4, color: '#ffe066' });
    if (witchFlags.dodgeN >= 3) { witchFlags.strikeDodge = true; say('Bạn đã né sét đủ 3 lần! Phù Thủy có thể dạy Lôi Bộ'); }
  }
  if (Math.hypot(s.x - player.x, s.y - player.y) < STRIKE_RADIUS) {
    if (!outsideTick && layer !== 2 && !witchFlags.struck) { witchFlags.struck = true; say('Bạn bị sét đánh! Phù Thủy có thể dạy Lôi Kích'); }
    hurt(BALANCE.lightning.damage);
  }
}

// ---------- Thiên thạch: đêm khuya hoặc giông bão, thỉnh thoảng rơi một thiên thạch nhỏ gần người chơi (không gây sát thương), nổ ra Mảnh Thiên Thạch ----------
// Sprite: assets/fx/meteor.webp (6 cột x 4 hàng, ô 256px: hàng 1-2 đang rơi, hàng 3 chạm đất, hàng 4 nổ khói). Tiếng nổ: assets/audio/meteor.mp3 (thiếu file thì im lặng)
const METEOR = { gapMin: 80, gapMax: 80, minDist: 150, maxDist: 360, fps: 9, frames: 24, impactFrame: 14, scale: 0.62, fallHeight: 800, nightMin: 0.45, shardChance: 0.35 };
const METEOR_SOUND = { src: 'assets/audio/meteor.mp3', vol: 0.9 };
const meteors = [];
let meteorNext = 15, meteorImgCache = null, meteorAudio = null, meteorAudioMissing = false;
function meteorImg() { if (meteorImgCache === null) { meteorImgCache = false; loadImage('assets/fx/meteor.webp').then((i) => { meteorImgCache = i || false; }); } return meteorImgCache || null; }
function playMeteorBoom(dist) {
  if (meteorAudioMissing) return;
  if (!meteorAudio) { meteorAudio = new Audio(METEOR_SOUND.src); meteorAudio.onerror = () => { meteorAudioMissing = true; console.warn('Thiếu file ' + METEOR_SOUND.src); }; }
  try {
    meteorAudio.currentTime = 0;
    meteorAudio.volume = Math.max(0.15, Math.min(1, METEOR_SOUND.vol * (1 - dist / 900)));
    const pr = meteorAudio.play(); if (pr && pr.catch) pr.catch(() => {});
  } catch (e) { /* bỏ qua */ }
}
function meteorSky() { return layer === 0 && !deathScreen && (outdoorDarkness() >= METEOR.nightMin || (world.rain.storm && world.rain.intensity > 0.6)); }
function spawnMeteor() {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, d = METEOR.minDist + Math.random() * (METEOR.maxDist - METEOR.minDist);
    const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (isSolid(tx, ty) || isWaterAt(x, y) || getTile(tx, ty) === LAVA) continue;
    meteors.push({ x, y, t: 0, boom: false });
    return true;
  }
  return false;
}
function updateMeteors(dt) {
  if (layer === 0 && !deathScreen && sleepT <= 0 && meteors.length === 0 && meteorSky()) {
    meteorNext -= dt;
    if (meteorNext <= 0) { meteorNext = METEOR.gapMin + Math.random() * (METEOR.gapMax - METEOR.gapMin); spawnMeteor(); }
  }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.t += dt;
    const f = Math.floor(m.t * METEOR.fps);
    if (!m.boom && f >= METEOR.impactFrame) {
      m.boom = true;
      if (layer === 0) {
        shake = Math.max(shake, 0.35);
        burst(m.x, m.y - 6, '#ffb347', 22, 240); burst(m.x, m.y - 6, '#5a4a48', 12, 160);
        playMeteorBoom(Math.hypot(m.x - player.x, m.y - player.y));
        spawnLoot('meteorshard', 1 + (Math.random() < METEOR.shardChance ? 1 : 0), m.x, m.y);
      }
    }
    if (f >= METEOR.frames || layer !== 0) meteors.splice(i, 1);
  }
}
function drawMeteorShadow(camX, camY) { // vòng bóng báo trước chỗ thiên thạch sẽ rơi
  for (const m of meteors) {
    const u = Math.min(1, m.t * METEOR.fps / METEOR.impactFrame);
    if (u >= 1) continue;
    ctx.fillStyle = 'rgba(40,10,0,' + (0.15 + 0.3 * u) + ')';
    ctx.beginPath(); ctx.ellipse(m.x - camX, m.y - camY + 4, 8 + 22 * u, 4 + 10 * u, 0, 0, Math.PI * 2); ctx.fill();
  }
}
function drawMeteors(camX, camY) {
  const img = meteorImg();
  if (!img) return;
  const cw = img.width / 6, ch = img.height / 4, w = cw * METEOR.scale, h = ch * METEOR.scale;
  for (const m of meteors) {
    const f = Math.min(METEOR.frames - 1, Math.floor(m.t * METEOR.fps));
    const u = Math.min(1, m.t * METEOR.fps / 12); // 12 khung đầu: rơi từ trên cao xuống mặt đất
    const offY = -METEOR.fallHeight * (1 - u) * (1 - u);
    ctx.drawImage(img, (f % 6) * cw, Math.floor(f / 6) * ch, cw, ch, m.x - camX - w / 2, m.y - camY - h * 0.92 + offY, w, h);
  }
}

// ---------- Rương ----------
const RARE_CHEST_CHANCE = BALANCE.world.rareChestChance; // xác suất một rương mới là rương hiếm (chỉ 1 rương hiếm tồn tại cùng lúc)
const MAX_WORLD_CHESTS = BALANCE.world.maxChests;     // số rương tối đa tồn tại cùng lúc
const CHEST_RESPAWN = BALANCE.world.chestRespawn; // giây giữa hai lần thử sinh rương mới
const CHEST_MIN_TILES = 150, CHEST_MAX_TILES = 200; // rương mới nằm rất xa: cách người chơi 150–200 ô, không có mũi tên chỉ đường

function spawnChest(forceRare = false, minT = CHEST_MIN_TILES, maxT = CHEST_MAX_TILES, noRare = false) {
  const rare = !noRare && (forceRare || (!chests.some((c) => c.rare) && Math.random() < RARE_CHEST_CHANCE));
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = (minT + Math.random() * (maxT - minT)) * TILE;
    const tx = Math.floor((player.x + Math.cos(a) * d) / TILE);
    const ty = Math.floor((player.y + Math.sin(a) * d) / TILE);
    if (getTile(tx, ty) !== GRASS || seaType(tx, ty) >= 2) continue;
    if (villageAt(tx, ty)) continue;
    if (chests.some((c) => c.tx === tx && c.ty === ty)) continue;
    const chest = { tx, ty, t: Math.random() * 6, rare };
    chests.push(chest);
    if (rare) {
      spawnGuards(chest, 3 + Math.floor(Math.random() * 2));
      say('Một rương hiếm vừa xuất hiện ở rất xa (~200 ô)! Có zombie canh giữ');
    } else if (!noRare) {
      say('Một rương mới vừa xuất hiện ở rất xa (~200 ô). Hãy tự đi tìm nhé!');
    }
    return chest;
  }
  return null;
}

// Rương khởi đầu: mỗi thế giới mới có đúng một cái ngay gần người chơi
function spawnStarterChest() {
  return spawnChest(false, 5, 8, true);
}

function guardsAlive(c) {
  return zombies.reduce((n, z) => n + (z.guard === c && !z.dead ? 1 : 0), 0);
}

function nearestChest(maxDist) {
  let best = null, bd = maxDist;
  for (const c of chests) {
    const p = tileCenter(c.tx, c.ty);
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function openChest(c = nearestChest(90)) {
  if (!c) return;
  if (c.rare) {
    const left = guardsAlive(c);
    if (left > 0) return;
  }
  if (c.volc && c.fx !== 'done') { if (c.fx === undefined) c.fx = 0; return; } // rương lửa: chạy hoạt ảnh mở trước (volcano-boss.js)
  if (c.omni && c.fx !== 'done') { if (c.fx === undefined && !FinalBoss.chestBusy(c)) c.fx = 0; return; } // rương báu boss cuối: chờ rơi xong rồi chạy animation mở (final-boss.js)
  chests.splice(chests.indexOf(c), 1);
  if (c.house) hstate(c.house).chestTaken = true; // rương trong nhà chỉ mở được một lần
  const p = tileCenter(c.tx, c.ty);
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const houseLoot = () => {
    const l = { apple: rnd(1, 3), torch: rnd(1, 2), coal: rnd(1, 3), wood: rnd(2, 4) };
    if (Math.random() < 0.3) l.potion = 1;
    if (Math.random() < 0.3) l.iron = 1;
    if (Math.random() < 0.25) l.baked = 1;
    return l;
  };
  const mineLoot = () => { // rương kho báu hầm: tầng càng sâu đồ càng xịn (c.mine: 1 = nông, 2 = sâu, 3 = vực thẳm)
    const z = c.mine;
    const l = { torch: rnd(2, 3 + z), potion: rnd(1, z), coal: rnd(3, 6) };
    if (z === 1) { l.ironore = rnd(2, 4); l.iron = rnd(1, 2); }
    else if (z === 2) { l.iron = rnd(3, 5); l.gold = rnd(1, 3); l.baked = rnd(1, 2); }
    else { l.iron = rnd(4, 6); l.gold = rnd(2, 4); if (Math.random() < 0.4) l.diamond = 1; l.baked = rnd(2, 3); } // đã giảm kim cương: 40% có 1 viên
    if (Math.random() < 0.3 * (z - 1)) l.emerald = rnd(1, 2 * z);
    if (z === 3 && Math.random() < 0.3) {
      const slot = ARMOR_SLOTS[Math.floor(Math.random() * ARMOR_SLOTS.length)];
      gearBag[slot] += 1; // thỉnh thoảng có một món giáp sắt
      floaters.push({ x: p.x, y: p.y - 12 - 7 * 18, text: '+1 ' + ARMOR_NAME[slot].toLowerCase(), life: 1.6, color: '#ffd34d' });
    }
    return l;
  };
  const legendLoot = () => { // đã nerf: trước đây iron 8-12, gold 5-8, diamond 1-3, potion 3-5, baked 3-4, torch 4-6, coal 6-10, luôn có 1 giáp
    const l = { iron: rnd(3, 5), gold: rnd(1, 3), potion: rnd(1, 2), baked: rnd(1, 2), torch: rnd(2, 3), coal: rnd(3, 5) };
    if (Math.random() < 0.3) l.diamond = 1;
    if (Math.random() < 0.4) { // 40% có một món giáp sắt ngẫu nhiên
      const slot = ARMOR_SLOTS[Math.floor(Math.random() * ARMOR_SLOTS.length)];
      gearBag[slot] += 1;
      floaters.push({ x: p.x, y: p.y - 12 - 6 * 18, text: '+1 ' + ARMOR_NAME[slot].toLowerCase(), life: 1.6, color: '#ffd34d' });
    }
    return l;
  };
  const loot = c.mine ? mineLoot() : c.legend ? legendLoot() : c.house ? houseLoot() : c.rare ? {
    iron: rnd(3, 6),
    gold: rnd(1, 3),
    potion: rnd(1, 2),
    torch: rnd(2, 4),
    baked: rnd(1, 2),
    coal: rnd(3, 5),
  } : {
    wood: 3 + Math.floor(Math.random() * 5),
    stone: 2 + Math.floor(Math.random() * 4),
    coal: 1 + Math.floor(Math.random() * 2),
    apple: 1 + Math.floor(Math.random() * 2),
  };
  if (c.omni) loot.dragonfossil = 1; // rương báu boss cuối luôn có Hoá Thạch Rồng (đặt làm trang trí)
  if (c.volc) { if (c.ice) loot.frostscroll = 1; else loot.firescroll = 1; } // Giấy Lửa: dâng cho Phù Thủy để học chiêu cuối Hỏa Long (volcano-boss.js)
  if (!c.mine && Math.random() < (c.legend || c.rare ? 1 : c.house ? 0.4 : 0.25)) loot.emerald = c.legend ? rnd(3, 5) : c.rare ? rnd(2, 4) : 1; // ngọc lục bảo trong rương
  Object.entries(loot).forEach(([k, n], i) => {
    inv[k] += n;
    if (SHOW_ITEM_NOTICES) floaters.push({ x: p.x, y: p.y - 12 - i * 18, text: '+' + n + ' ' + ITEMS[k].name.toLowerCase(), life: 1.2 });
  });
  burst(p.x, p.y, c.legend ? '#ffb02e' : c.rare ? '#c9a2ff' : '#f2c14e', c.legend ? 36 : 16, c.legend ? 260 : 180);
  if (c.legend) shake = Math.max(shake, 0.3);
  say(c.mine ? 'Đã mở rương kho báu hầm mỏ!' : c.legend ? 'Đã mở rương Legendary của boss!' : c.rare ? 'Đã mở rương hiếm!' : c.house ? 'Đã mở rương trong nhà!' : 'Đã mở rương!');
}

// ---------- Zombie ----------
// type: hp | speed đi bộ / chạy | dmg đánh người chơi
const ZTYPES = BALANCE.zombie.types; // xem config.js
let rocks = []; // đá do zombie ném
const Z_DETECT = BALANCE.zombie.detect;       // thấy người chơi trong tầm này thì đuổi
const Z_LOSE = BALANCE.zombie.lose;         // xa hơn tầm này thì bỏ cuộc
const Z_GUARD_LEASH = BALANCE.zombie.guardLeash;  // zombie canh rương không đuổi xa quá tầm này khỏi rương
const Z_HIT_RANGE = BALANCE.zombie.hitRange;     // tầm đánh của zombie
const Z_ATTACK_TIME = BALANCE.zombie.attackTime; // thời gian hoạt ảnh một cú đánh (đòn trúng ở giữa)
const Z_FREEZE_DIST = BALANCE.zombie.freezeDist;
// Zombie hoang sinh ra ngay ngoài mép màn hình nên tầm phát hiện phải phủ hết màn hình, nếu không chúng đứng lang thang mãi
const Z_LOSE_SIGHT = 1; // giây: mất dấu người chơi (bị chắn tầm nhìn) quá thời gian này thì zombie thôi đuổi
function zDetectRange(z) {
  if (z.guard) return Z_DETECT;
  return Math.max(Z_DETECT, Math.hypot(canvas.width, canvas.height) / 2 + 300);
}
function zLoseRange(z) {
  return z.guard ? Z_LOSE : Math.max(Z_LOSE, zDetectRange(z) + 300);
} // xa hơn thì không cập nhật (đỡ tốn CPU)
let zombies = [];
let zombieSpawnT = 3;
let nightWarned = false;

// Sét đánh trúng cột thu lôi: zombie đứng gần đó bị nhiễm điện và biến thành Zombie Điện (loại 6, dạng V2)
function electrifyZombiesNear(cx, cy) {
  const R = BALANCE.zombie.electricRadius * TILE;
  let n = 0;
  for (const z of zombies) {
    if (z.dead || z.type === 6 || z.boss || Math.hypot(z.x - cx, z.y - cy) > R) continue;
    z.type = 6;
    z.maxHp = ZTYPES[6].hp; z.hp = z.maxHp; // biến hình: hồi đầy máu
    z.hurtT = 0; z.atkT = 0; z.atkCd = 0.5; z.kx = 0; z.ky = 0;
    floaters.push({ x: z.x, y: z.y - 80, text: 'Zombie Điện!', life: 1.6, color: '#7fd0ff' });
    burst(z.x, z.y - 28, '#7fd0ff', 20, 220);
    burst(z.x, z.y - 28, '#ffffff', 8, 160);
    n++;
  }
  return n;
}

function createZombie(type, x, y, guard = null) {
  const z = {
    type, x, y, guard,
    hp: ZTYPES[type].hp, maxHp: ZTYPES[type].hp,
    face: Math.random() < 0.5 ? 1 : -1,
    t: Math.random() * 5, aggro: false,
    atkCd: 0, atkT: 0, atkHit: false, hurtT: 0,
    dead: false, deadT: 0, noDrop: false,
    kx: 0, ky: 0, wanderT: Math.random() * 3, wx: x, wy: y,
    stuck: 0, sideT: 0, sideDir: 1, escal: 0, freeT: 0, moving: false, running: false,
  };
  zombies.push(z);
  return z;
}

function randomZombieType() {
  const r = Math.random();
  if (world.day >= 2) {            // từ ngày 2 mới có zombie chạy nhanh và zombie ném đá
    if (r < BALANCE.zombie.fastChance) return 4;
    if (r < BALANCE.zombie.fastChance + BALANCE.zombie.rangedChance) return 5;
  }
  const q = Math.random();
  if (q < 0.55 - Math.min(0.2, world.day * 0.03)) return 1;
  return q < 0.85 ? 2 : 3;
}

// Chỗ sinh zombie: ô cỏ trống ngoài màn hình quanh người chơi
function spawnZombie() {
  const minD = Math.hypot(canvas.width, canvas.height) / 2 + 40;
  for (let i = 0; i < 25; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = minD + Math.random() * 120;
    const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
    if (collides(x, y, 12) || (layer === 1 && mineFluidAt(x, y))) continue;
    createZombie(randomZombieType(), x, y);
    return;
  }
}

// Zombie canh rương: đứng quanh rương
function spawnGuards(chest, n) {
  const p = tileCenter(chest.tx, chest.ty);
  let made = 0;
  for (let i = 0; i < 40 && made < n; i++) {
    const a = (made / n) * Math.PI * 2 + Math.random() * 0.8;
    const d = 70 + Math.random() * 50;
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (collides(x, y, 12)) continue;
    const r = Math.random();
    const z = createZombie(r < 0.2 ? 1 : r < 0.5 ? 2 : r < 0.8 ? 3 : 5, x, y, chest);
    z.homeX = x; z.homeY = y;
    z.face = x < p.x ? 1 : -1; // quay mặt ra phía chính giữa rương
    made++;
  }
}

function lavaAt(x, y) { // chỉ có dung nham dưới hầm
  return layer === 1 && getTile(Math.floor(x / TILE), Math.floor((y + 6) / TILE)) === LAVA;
}
function moveZombie(z, dx, dy) {
  const hw = 10;
  // dung nham không chặn zombie: cứ đi qua (và bị thiêu, xem burnMobs)
  if (!collides(z.x + dx, z.y, hw)) z.x += dx;
  if (!collides(z.x, z.y + dy, hw)) z.y += dy;
}

// Đi về (tx, ty) với tốc độ sp; tự rẽ ngang khi bị cây/đá chặn
function zombieWalk(z, tx, ty, sp, dt) {
  if (z.iceT > 0) sp *= z.iceMul; // trúng phép băng (ice.js): chậm hoặc đứng yên
  if (z.xSlowT > 0) sp *= z.xSlowMul; // choáng / chậm từ Sét, Độc, Đất, Gió (more-magic.js)
  let dx = tx - z.x, dy = ty - z.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) { z.moving = false; return; }
  dx /= len; dy /= len;
  if (z.sideT > 0) {
    z.sideT -= dt;
    [dx, dy] = [-dy * z.sideDir, dx * z.sideDir];
  }
  const bx = z.x, by = z.y;
  moveZombie(z, dx * sp * dt, dy * sp * dt);
  z.moving = true;
  if (Math.abs(dx) > 0.2) z.face = Math.sign(dx);

  // Gần như không nhúc nhích được -> đi vòng sang một bên; kẹt lại thì đi vòng xa hơn (tường dài)
  const moved = Math.hypot(z.x - bx, z.y - by);
  const blocked = moved < sp * dt * 0.25;
  z.stuck = blocked ? z.stuck + dt : 0;
  z.freeT = blocked ? 0 : z.freeT + dt;
  if (z.freeT > 1.5) z.escal = 0;
  if (z.stuck > 0.3) {
    z.stuck = 0;
    if (z.escal === 0) z.sideDir = Math.random() < 0.5 ? 1 : -1; // giữ nguyên hướng khi kẹt liên tiếp
    z.escal = Math.min(6, z.escal + 1);
    z.sideT = 0.7 * z.escal;
  }
}

// Zombie giẫm ruộng: ban đêm zombie hoang kéo tới ruộng gần nhất rồi giẫm nát (mất cây, đất trở lại thành cỏ).
// Hàng rào là ô đặc nên zombie không bước qua được: rào kín quanh ruộng là an toàn.
const TRAMPLE_SEEK = 7;      // tìm ruộng trong bán kính này (ô)
const TRAMPLE_TIME = 0.7;    // giây đứng giẫm trên một ô trước khi nó nát
function findFarmNear(z) {
  const cx = Math.floor(z.x / TILE), cy = Math.floor(z.y / TILE);
  let best = null, bd = 1e9;
  for (let dy = -TRAMPLE_SEEK; dy <= TRAMPLE_SEEK; dy++) {
    for (let dx = -TRAMPLE_SEEK; dx <= TRAMPLE_SEEK; dx++) {
      const tx = cx + dx, ty = cy + dy;
      if (getTile(tx, ty) !== FARM) continue;
      const d = dx * dx + dy * dy - (cropAt(tx, ty) ? 6 : 0); // ưu tiên ô có cây
      if (d < bd) { bd = d; best = { tx, ty }; }
    }
  }
  return best;
}

function trampleTile(tx, ty) {
  const c = cropAt(tx, ty), p = tileCenter(tx, ty);
  changes.delete('c' + tx + ',' + ty);
  changes.set(tx + ',' + ty, GRASS);
  burst(p.x, p.y, '#6a382b', 12, 150);
  burst(p.x, p.y, '#5fa04a', 6, 110);
  if (c) {
    floaters.push({ x: p.x, y: p.y - 24, text: 'Zombie giẫm nát ' + (CROPS[c.k] ? CROPS[c.k].name.toLowerCase() : 'cây') + '!', life: 1.8, color: '#ff7a6a' });
    if (!outsideTick && Math.hypot(p.x - player.x, p.y - player.y) < 700) say('Zombie đang giẫm nát ruộng! Hãy rào ruộng bằng hàng rào');
  }
}

// Gọi mỗi khung hình cho zombie hoang còn sống: giẫm ô ruộng đang đứng, và (khi rảnh) tìm ruộng để kéo tới
function zombieTrample(z, st, dt, idle) {
  if (layer !== 0 || z.guard || z.plant || z.boss) return;
  const tx = Math.floor(z.x / TILE), ty = Math.floor((z.y + 8) / TILE);
  if (getTile(tx, ty) === FARM) {
    z.trampT = (z.trampT || 0) + dt;
    if (z.trampT >= TRAMPLE_TIME) { z.trampT = 0; z.farmTarget = null; trampleTile(tx, ty); }
    if (Math.random() < 0.25) burst(z.x, z.y + 4, '#7a4a35', 1, 60);
  } else z.trampT = 0;
  if (!idle || st.ranged) return;
  z.farmT = (z.farmT || 0) - dt;
  if (z.farmT <= 0) { // quét ruộng quanh mình (thưa ra cho đỡ tốn)
    z.farmT = 0.8 + Math.random() * 0.6;
    if (z.farmCool > 0) { z.farmCool -= 0.8; z.farmTarget = null; }
    else z.farmTarget = findFarmNear(z);
  }
}

function updateZombie(z, dt) {
  z.t += dt;
  if (z.dead) { z.deadT += dt; return; }

  const st = ZTYPES[z.type];
  const dxp = player.x - z.x, dyp = player.y - z.y;
  const dist = Math.hypot(dxp, dyp);
  z.atkCd = Math.max(0, z.atkCd - dt);
  z.hurtT = Math.max(0, z.hurtT - dt);

  // Bị đánh văng
  if (Math.abs(z.kx) + Math.abs(z.ky) > 5) {
    moveZombie(z, z.kx * dt, z.ky * dt);
    const f = Math.max(0, 1 - 9 * dt);
    z.kx *= f; z.ky *= f;
  }

  // Ban ngày không mưa: zombie hoang cháy dần (zombie canh rương thì không)
  if (!z.guard && darkness() < 0.08 && world.rain.intensity < 0.25) {
    z.hp -= 4 * dt;
    if (Math.random() < 0.4) burst(z.x, z.y - 28, '#ff9a3c', 1, 50, -150);
    if (z.hp <= 0) { z.noDrop = true; killZombie(z); return; }
  }

  // Phát hiện / bỏ cuộc
  // Chỉ phát hiện khi nhìn thấy người chơi (không bị tường / vật cản chặn). Đang đuổi mà bị chặn tầm nhìn quá Z_LOSE_SIGHT giây thì bỏ cuộc.
  const sees = dist < zDetectRange(z) && lineClear(z.x, z.y - 10, player.x, player.y - 10);
  if (sees) { z.aggro = true; z.lostT = 0; }
  else if (z.aggro) {
    z.lostT = (z.lostT || 0) + dt;
    if (z.lostT > Z_LOSE_SIGHT || dist > zLoseRange(z)) { z.aggro = false; z.lostT = 0; }
  }
  if (z.guard) {
    const hx = z.guard ? tileCenter(z.guard.tx, z.guard.ty) : null;
    if (Math.hypot(z.x - hx.x, z.y - hx.y) > Z_GUARD_LEASH) z.aggro = false; // quá xa rương thì về
  }

  z.moving = false;
  zombieTrample(z, st, dt, !z.aggro);
  if (z.hurtT > 0) return; // choáng khi vừa bị đánh

  if (z.atkT > 0) {
    // Đang vung tay: đòn trúng ở giữa hoạt ảnh
    z.atkT -= dt;
    if (!z.atkHit && z.atkT <= Z_ATTACK_TIME / 2) {
      z.atkHit = true;
      if (z.hTarget) { if (Math.hypot(z.hTarget.x - z.x, z.hTarget.y - z.y) < Z_HIT_RANGE + 14) hurtWarrior(z.hTarget, st.dmg, z); }
      else if (st.ranged) throwRock(z, st);
      else if (Math.hypot(player.x - z.x, player.y - z.y) < Z_HIT_RANGE + 14 && lineClear(z.x, z.y, player.x, player.y)) hurt(st.dmg);
    }
    return;
  }

  // Chưa để ý người chơi: đuổi đánh chiến binh của làng ở gần
  z.hTarget = null;
  if (!z.aggro && !z.guard && !st.ranged && layer === 0) {
    const h = nearestWarrior(z.x, z.y, 230);
    if (h) {
      z.hTarget = h;
      const hx = h.x - z.x, hy = h.y - z.y, hd = Math.hypot(hx, hy);
      if (Math.abs(hx) > 3) z.face = Math.sign(hx);
      if (hd < Z_HIT_RANGE) {
        if (z.atkCd <= 0) { z.atkT = Z_ATTACK_TIME; z.atkHit = false; z.atkCd = 1.1; }
      } else {
        zombieWalk(z, h.x, h.y, st.run, dt);
        z.running = true;
      }
      return;
    }
  }

  if (z.aggro) {
    if (Math.abs(dxp) > 3) z.face = Math.sign(dxp);
    if (st.ranged) {
      // Giữ khoảng cách: xa thì tiến lại, gần thì lùi, vừa tầm thì ném đá
      if (dist > st.range) { zombieWalk(z, player.x, player.y, st.run, dt); z.running = true; }
      else if (dist < 140) { zombieWalk(z, z.x - dxp, z.y - dyp, st.walk * 1.4, dt); z.running = false; z.face = Math.sign(dxp) || z.face; }
      else if (z.atkCd <= 0) { z.atkT = Z_ATTACK_TIME; z.atkHit = false; z.atkCd = 2.4; }
      return;
    }
    if (dist < Z_HIT_RANGE && lineClear(z.x, z.y, player.x, player.y)) {
      if (z.atkCd <= 0) { z.atkT = Z_ATTACK_TIME; z.atkHit = false; z.atkCd = 1.1; }
    } else {
      zombieWalk(z, player.x, player.y, st.run, dt);
      z.running = true;
    }
    return;
  }
  z.running = false;

  if (z.guard) {
    // Quay về chỗ đứng canh
    if (Math.hypot(z.homeX - z.x, z.homeY - z.y) > 10) zombieWalk(z, z.homeX, z.homeY, st.walk * 1.4, dt);
    return;
  }

  // Có ruộng gần: kéo tới giẫm. Bị rào chặn (kẹt lâu) thì bỏ cuộc một lúc rồi lang thang tiếp.
  if (z.farmTarget && !z.guard) {
    const f = tileCenter(z.farmTarget.tx, z.farmTarget.ty);
    if (getTile(z.farmTarget.tx, z.farmTarget.ty) !== FARM) z.farmTarget = null;
    else if (z.escal >= 4) { z.farmTarget = null; z.farmCool = 6; z.escal = 0; }
    else { zombieWalk(z, f.x, f.y, st.walk * 1.5, dt); return; }
  }

  // Lang thang
  z.wanderT -= dt;
  if (z.wanderT <= 0) {
    z.wanderT = 3 + Math.random() * 4;
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 120;
    z.wx = z.x + Math.cos(a) * d; z.wy = z.y + Math.sin(a) * d;
    if (Math.random() < 0.4) { z.wx = z.x; z.wy = z.y; } // thỉnh thoảng đứng yên
  }
  zombieWalk(z, z.wx, z.wy, st.walk, dt);
}

function throwRock(z, st) {
  const dx = player.x - z.x, dy = player.y - z.y, d = Math.hypot(dx, dy) || 1;
  rocks.push({ x: z.x, y: z.y, vx: dx / d * 280, vy: dy / d * 280, life: 1.8, dmg: st.dmg, spin: 0 });
}

function updateRocks(dt) {
  for (let i = rocks.length - 1; i >= 0; i--) {
    const r = rocks[i];
    r.x += r.vx * dt; r.y += r.vy * dt; r.life -= dt; r.spin += dt * 12;
    let dead = r.life <= 0 || isSolid(Math.floor(r.x / TILE), Math.floor(r.y / TILE));
    if (!dead && Math.hypot(r.x - player.x, r.y - player.y) < 22) {
      const hit = !outsideTick && player.invuln <= 0;
      hurt(r.dmg); dead = true;
      if (hit && player.hp > 0) bleed = { n: BLEED_TICKS, t: BLEED_GAP }; // trúng lại thì tính lại từ đầu
    }
    if (dead) { burst(r.x, r.y - 20, '#9a9aa3', 5, 90); rocks.splice(i, 1); }
  }
}

function drawRocks(camX, camY) {
  for (const r of rocks) {
    const sx = r.x - camX, sy = r.y - camY;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 2, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(sx, sy - 24);
    ctx.rotate(r.spin);
    ctx.fillStyle = '#7d7d85'; ctx.fillRect(-6, -6, 12, 12);
    ctx.fillStyle = '#a2a2ab'; ctx.fillRect(-6, -6, 12, 4);
    ctx.restore();
  }
}

// Ngọc lục bảo rơi từ quái: [xác suất, tối thiểu, tối đa] theo loại zombie (zombie mạnh / canh rương cho nhiều hơn)
const ZOMBIE_GEMS = { 1: [0.3, 1, 1], 2: [0.4, 1, 1], 3: [0.55, 1, 2], 4: [0.5, 1, 2], 5: [0.55, 1, 2], 6: [0.8, 1, 3] };
function dropEmeralds(x, y, [chance, lo, hi], bonus = 0) {
  if (Math.random() >= chance) return;
  const n = lo + Math.floor(Math.random() * (hi - lo + 1)) + bonus;
  for (let i = 0; i < n; i++) spawnLoot('emerald', 1, x, y); // mỗi viên văng một hướng
  burst(x, y - 24, '#3dde7c', 8, 130, 200);
}

function killZombie(z) {
  if (z.boss) { killBoss(z); return; }
  if (z.plant) { killPlant(z); return; }
  z.dead = true;
  z.deadT = 0;
  z.aggro = false;
  burst(z.x, z.y - 22, '#6a8f3a', 14, 180);
  if (z.type === 6 && !witchFlags.elecKill) { witchFlags.elecKill = true; say('Đã hạ Zombie Điện! Phù Thủy có thể dạy Lôi Thần'); }
  if (z.noDrop) return;
  if (!witchFlags.lowHpKill && player.hp > 0 && player.hp < MAX_HP * 0.2) { witchFlags.lowHpKill = true; say('Hạ zombie khi máu dưới 20%! Phù Thủy có thể dạy Hắc Triệu'); } // mở học Hắc Triệu (hệ Hắc Ám)
  if (!witchFlags.zombieKill) { // đếm zombie hạ để mở học Hắc Ám (hệ Hắc Ám, cần 5 con)
    witchFlags.zombieN = Math.min(5, witchFlags.zombieN + 1);
    floaters.push({ x: player.x, y: player.y - 74, text: 'Hạ zombie ' + witchFlags.zombieN + '/5', life: 1.4, color: '#c58aff' });
    if (witchFlags.zombieN >= 5) { witchFlags.zombieKill = true; say('Đã hạ 5 zombie! Phù Thủy có thể dạy Hắc Ám'); }
  }
  if (meleeNow && !witchFlags.meleeKill) { // hạ bằng đòn đánh gần: đủ 10 con thì được học Không Nhận (hệ Không Gian)
    witchFlags.meleeN = Math.min(10, witchFlags.meleeN + 1);
    floaters.push({ x: player.x, y: player.y - 74, text: 'Đánh gần ' + witchFlags.meleeN + '/10', life: 1.4, color: '#9fd8ff' });
    if (witchFlags.meleeN >= 10) { witchFlags.meleeKill = true; say('Đã hạ 10 zombie bằng đánh gần! Phù Thủy có thể dạy Không Nhận'); }
  }
  elderCount('zombie');
  dropEmeralds(z.x, z.y, ZOMBIE_GEMS[z.type] || ZOMBIE_GEMS[1], z.guard ? 1 : 0);
  const r = Math.random();
  const n = r < 0.35 ? 0 : r < 0.8 ? 1 : 2;
  if (n > 0) {
    spawnLoot('flesh', n, z.x, z.y);
  }
}

function hitZombie(z, dmg, from = null) { // from: chiến binh đánh (null = người chơi)
  if (z.dead) return;
  if (z.final && FinalBoss.immune(z)) return; // Hỗn Nguyên Long Vương đang biến hình Thức Tỉnh: bất tử
  const src = from || player;
  if (z.mine && z.act && z.act.n === 'stun') dmg = Math.round(dmg * 1.5); // Quái Vật Hầm Mỏ đang choáng: chịu thêm 50% sát thương
  if (z.volc && z.shieldT > 0 && window.VolcBoss) dmg = Math.max(1, Math.round(dmg * VolcBoss.shieldMul())); // Băng Kính của boss băng
  z.hp -= dmg;
  if (!from) z.aggro = true;
  const a = Math.atan2(z.y - src.y, z.x - src.x);
  if (z.boss) { // boss: không bị ngắt đòn, chỉ khựng nhẹ và bị đẩy rất ít
    z.hurtT = 0.25; z.kx = Math.cos(a) * 40; z.ky = Math.sin(a) * 40;
  } else {
    z.hurtT = 0.3; z.atkT = 0;
    z.kx = Math.cos(a) * 260; z.ky = Math.sin(a) * 260;
  }
  floaters.push({ x: z.x, y: z.y - (z.boss ? 130 : 62), text: '-' + dmg, life: 0.9, color: '#ffe07a' });
  burst(z.x, z.y - 28, '#7fa83a', 6, 150);
  if (z.hp <= 0) {
    if (from) z.noDrop = true; // chiến binh hạ gục thì không rơi thịt cho người chơi
    else {
      score += 10 * (z.type || 1);
      if (!z.boss && !z.nightCounted && !witchFlags.nightKill && layer === 0 && blackNight()) { // đếm zombie hạ ban đêm để mở học Thanh Tẩy (cần 15 con)
        z.nightCounted = true;
        witchFlags.nightN = Math.min(15, witchFlags.nightN + 1);
        floaters.push({ x: z.x, y: z.y - 80, text: 'Zombie đêm ' + witchFlags.nightN + '/15', life: 1.3, color: '#cfc2ff' });
        if (witchFlags.nightN >= 15) { witchFlags.nightKill = true; say('Đã hạ 15 zombie ban đêm! Phù Thủy có thể dạy Thanh Tẩy'); }
      }
    }
    killZombie(z);
  }
}

// Hitbox boss: hình chữ nhật bao thân sprite (sprite rộng ~300px, cao ~177px), không phải chỉ điểm chân
const BOSS_HB = { rx: 105, up: 125, down: 16 };
function bossHB(z) { return z.hb || BOSS_HB; } // mỗi boss có hitbox riêng (Quái Vật Hầm Mỏ nhỏ hơn Cá Sấu)
function bossBox(z) { const h = bossHB(z); return { x0: z.x - h.rx, x1: z.x + h.rx, y0: z.y - h.up, y1: z.y + h.down }; }
// Điểm gần nhất của hitbox boss so với (px, py)
function bossNearest(z, px, py) {
  const b = bossBox(z);
  return { x: Math.min(b.x1, Math.max(b.x0, px)), y: Math.min(b.y1, Math.max(b.y0, py)) };
}

// Zombie người chơi đang nhắm tới: dưới con trỏ chuột, hoặc ngay trước mặt khi dùng Space
function targetZombie(camX, camY) {
  let best = null, bd = 1e9;
  const mx = mouse.x + camX, my = mouse.y + camY;
  for (const z of zombies) {
    if (z.dead) continue;
    // Boss to: tầm với tính tới điểm gần nhất trên thân, không phải tâm
    const near = z.boss ? bossNearest(z, player.x, player.y) : z;
    const dp = Math.hypot(near.x - player.x, near.y - player.y);
    if (dp > REACH - 10) continue;
    if (!lineClearStrict(player.x, player.y, near.x, near.y)) continue; // có vật chắn giữa: không đánh xuyên được
    let d;
    if (keys['Space']) {
      if (z.boss) { // chỉ cần thân boss nằm ở nửa mặt trước nhân vật
        const bb = bossBox(z);
        const ahead = player.faceX * ((player.faceX > 0 ? bb.x1 : bb.x0) - player.x) + player.faceY * ((player.faceY > 0 ? bb.y1 : bb.y0) - player.y);
        if (ahead <= 0) continue;
      } else if ((z.x - player.x) * player.faceX + (z.y - player.y) * player.faceY <= 0) continue;
      d = dp;
    } else {
      if (z.boss) {
        const bb = bossBox(z);
        if (mx < bb.x0 || mx > bb.x1 || my < bb.y0 || my > bb.y1) continue;
      } else if (Math.abs(mx - z.x) > 26 || my < z.y - 68 || my > z.y + 14) continue;
      d = Math.hypot(mx - z.x, my - (z.y - 28));
    }
    if (d < bd) { bd = d; best = z; }
  }
  return best;
}

function attackZombie(z) {
  const dx = z.x - player.x, dy = z.y - player.y;
  if (Math.abs(dx) > Math.abs(dy)) { player.faceX = Math.sign(dx); player.faceY = 0; }
  else { player.faceX = 0; player.faceY = Math.sign(dy) || 1; }
  meleeNow = true;
  try { hitZombie(z, swingWeapon(z.x, z.y + 4)); } finally { meleeNow = false; }
}
let meleeNow = false; // đang trong đòn đánh gần của người chơi (đếm zombie hạ bằng đánh gần để mở học Không Nhận)

// ======================================================================
// Nhện (rớt chỉ), cung & mũi tên
// ======================================================================
const SPIDER = { hp: 14, walk: 55, run: 125, dmg: 7, detect: 260, lose: 520, hit: 34, atkTime: 0.4, atkCd: 1.0, min: 1, max: 2 };
const BOW = { dmg: 4, cd: 2, speed: 560, range: 480, draw: 0.12, anim: 0.4 }; // draw: giây giương cung trước khi mũi tên rời dây; anim: tổng thời gian hoạt ảnh
let bowShot = null; // phát bắn đang diễn ra: { t, dx, dy, fired }
let spiders = [];
let arrows = [];
let spiderSpawnT = 4, spiderLayer = 0;

function clearSpiders() { spiders.length = 0; arrows.length = 0; }

function spawnSpider() {
  const minD = Math.hypot(canvas.width, canvas.height) / 2 + 40;
  for (let i = 0; i < 25; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = minD + Math.random() * 180;
    const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
    if (collides(x, y, 12) || (layer === 1 && mineFluidAt(x, y))) continue;
    spiders.push({
      x, y, hp: SPIDER.hp, maxHp: SPIDER.hp,
      face: Math.random() < 0.5 ? 1 : -1, t: Math.random() * 5, aggro: false,
      atkCd: 0, atkT: 0, atkHit: false, hurtT: 0, dead: false, deadT: 0,
      kx: 0, ky: 0, wanderT: Math.random() * 3, wx: x, wy: y,
      stuck: 0, sideT: 0, sideDir: 1, escal: 0, freeT: 0, moving: false,
    });
    return;
  }
}

// Hầm mỏ không có ngày đêm nên số nhện tăng theo tầng và theo ngày game
function mineSpiderCap() {
  const B = BALANCE.spider;
  return Math.min(B.mineMax, MINE_ZONES[playerMineZone()].spiders + (world.day >= B.mineLateDay ? 1 : 0));
}

function updateSpiders(dt) {
  if (layer >= 2) { spiders.length = 0; return; } // trong nhà / đấu trường không có nhện
  if (spiderLayer !== layer) { spiders.length = 0; arrows.length = 0; spiderLayer = layer; }
  const dark = darkness() / 0.72;
  const cap = layer === 1 ? mineSpiderCap() : Math.round(1 + dark * 3); // mặt đất: đêm nhiều hơn ngày · hầm: càng sâu càng nhiều
  spiderSpawnT -= dt;
  if (spiderSpawnT <= 0) {
    spiderSpawnT = 4 + Math.random() * 5;
    const alive = spiders.reduce((n, s) => n + (s.dead || s.slime ? 0 : 1), 0); // Slime Lửa (magma.js) không tính vào số nhện
    if (alive < cap) spawnSpider();
  }
  for (let i = spiders.length - 1; i >= 0; i--) {
    const s = spiders[i];
    const d = Math.hypot(s.x - player.x, s.y - player.y);
    if (s.dead) { s.deadT += dt; if (s.deadT > 1.6) spiders.splice(i, 1); continue; }
    if (d > Z_FREEZE_DIST + 300) { spiders.splice(i, 1); continue; }
    if (d > Z_FREEZE_DIST) continue;
    updateSpider(s, dt);
    if (d > 800 && !s.aggro && !s.slime && spiders.length > cap + 1) spiders.splice(i, 1);
  }
}

function updateSpider(s, dt) {
  if (s.slime) { Magma.updateSlime(s, dt); return; } // Slime Lửa (magma.js)
  s.t += dt;
  s.atkCd = Math.max(0, s.atkCd - dt);
  s.hurtT = Math.max(0, s.hurtT - dt);
  const dxp = player.x - s.x, dyp = player.y - s.y, dist = Math.hypot(dxp, dyp);
  if (Math.abs(s.kx) + Math.abs(s.ky) > 5) { // bị đánh văng
    moveZombie(s, s.kx * dt, s.ky * dt);
    const f = Math.max(0, 1 - 9 * dt);
    s.kx *= f; s.ky *= f;
  }
  // Như zombie: phải nhìn thấy người chơi (không bị chắn) mới phát hiện; mất dấu quá Z_LOSE_SIGHT giây thì bỏ cuộc
  if (dist < SPIDER.detect && lineClear(s.x, s.y - 6, player.x, player.y - 6)) { s.aggro = true; s.lostT = 0; }
  else if (s.aggro) {
    s.lostT = (s.lostT || 0) + dt;
    if (s.lostT > Z_LOSE_SIGHT || dist > SPIDER.lose) { s.aggro = false; s.lostT = 0; }
  }
  s.moving = false;
  if (s.hurtT > 0) return;
  if (s.atkT > 0) { // đang cắn: đòn trúng ở giữa hoạt ảnh
    s.atkT -= dt;
    if (!s.atkHit && s.atkT <= SPIDER.atkTime / 2) {
      s.atkHit = true;
      if (Math.hypot(player.x - s.x, player.y - s.y) < SPIDER.hit + 14 && lineClear(s.x, s.y, player.x, player.y)) {
        hurt(SPIDER.dmg);
        burst(player.x, player.y - 16, '#8a1c1c', 6, 120);
        if (player.hp > 0 && !outsideTick) { if (!poison) say('Bạn bị nhiễm độc! Dùng Thuốc Giải Độc (Chợ Đen)'); poison = { n: POISON_TICKS, t: POISON_GAP }; } // cắn lại thì tính lại từ đầu
      }
    }
    return;
  }
  if (s.aggro) {
    if (Math.abs(dxp) > 3) s.face = Math.sign(dxp);
    if (dist < SPIDER.hit && lineClear(s.x, s.y, player.x, player.y)) {
      if (s.atkCd <= 0) { s.atkT = SPIDER.atkTime; s.atkHit = false; s.atkCd = SPIDER.atkCd; }
    } else zombieWalk(s, player.x, player.y, SPIDER.run, dt);
    return;
  }
  s.wanderT -= dt;
  if (s.wanderT <= 0) {
    s.wanderT = 2 + Math.random() * 3;
    const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 100;
    s.wx = s.x + Math.cos(a) * d; s.wy = s.y + Math.sin(a) * d;
    if (Math.random() < 0.35) { s.wx = s.x; s.wy = s.y; }
  }
  zombieWalk(s, s.wx, s.wy, SPIDER.walk, dt);
}

function hitSpider(s, dmg, from = null) { // from: chiến binh đánh (null = người chơi)
  if (s.dead) return;
  s.hp -= dmg;
  s.aggro = true;
  const src = from || player;
  const a = Math.atan2(s.y - src.y, s.x - src.x);
  s.hurtT = 0.25; s.atkT = 0;
  s.kx = Math.cos(a) * 240; s.ky = Math.sin(a) * 240;
  floaters.push({ x: s.x, y: s.y - 44, text: '-' + dmg, life: 0.9, color: '#ffe07a' });
  burst(s.x, s.y - 12, s.slime ? '#ff9a2a' : '#6b3a8a', 6, 150);
  if (s.hp <= 0) killSpider(s);
}

function killSpider(s) {
  s.dead = true; s.deadT = 0; s.aggro = false; s.atkT = 0;
  if (s.slime) { Magma.onKill(s); return; } // Slime Lửa rớt Tinh thể magma (magma.js)
  if (!s.counted && !witchFlags.spiderKill) { // đếm nhện bị giết để mở học Độc Vực (cần 10 con)
    s.counted = true;
    witchFlags.spiderN = Math.min(10, witchFlags.spiderN + 1);
    floaters.push({ x: s.x, y: s.y - 60, text: 'Nhện ' + witchFlags.spiderN + '/10', life: 1.2, color: '#c9a2ff' });
    if (witchFlags.spiderN >= 10) { witchFlags.spiderKill = true; say('Đã giết 10 con nhện! Phù Thủy có thể dạy Độc Vực'); }
  }
  score += 15;
  burst(s.x, s.y - 12, '#4b2a63', 14, 180);
  const n = SPIDER.min + Math.floor(Math.random() * (SPIDER.max - SPIDER.min + 1));
  spawnLoot('string', n, s.x, s.y);
}

// Nhện người chơi đang nhắm: dưới con trỏ chuột, hoặc ngay trước mặt khi dùng Space
function targetSpider(camX, camY) {
  let best = null, bd = 1e9;
  const mx = mouse.x + camX, my = mouse.y + camY;
  for (const s of spiders) {
    if (s.dead) continue;
    const dp = Math.hypot(s.x - player.x, s.y - player.y);
    if (dp > REACH - 10) continue;
    if (!lineClearStrict(player.x, player.y, s.x, s.y)) continue;
    let d;
    if (keys['Space']) {
      if ((s.x - player.x) * player.faceX + (s.y - player.y) * player.faceY <= 0) continue;
      d = dp;
    } else {
      if (Math.abs(mx - s.x) > 30 || my < s.y - 34 || my > s.y + 16) continue;
      d = Math.hypot(mx - s.x, my - (s.y - 10));
    }
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function attackSpider(s) {
  const dx = s.x - player.x, dy = s.y - player.y;
  if (Math.abs(dx) > Math.abs(dy)) { player.faceX = Math.sign(dx); player.faceY = 0; }
  else { player.faceX = 0; player.faceY = Math.sign(dy) || 1; }
  hitSpider(s, swingWeapon(s.x, s.y + 4));
}

function drawSpider(s, camX, camY) {
  if (s.slime) { Magma.drawSlime(s, camX, camY); return; } // Slime Lửa (magma.js)
  const sx = Math.round(s.x - camX), sy = Math.round(s.y - camY);
  const fade = s.dead ? Math.max(0, 1 - Math.max(0, s.deadT - 0.9) / 0.7) : 1;
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 8, 20, 7, 0, 0, Math.PI * 2); ctx.fill();

  const hurtC = s.hurtT > 0;
  const body = hurtC ? '#d7c3e6' : s.dead ? '#4a3a55' : '#2a1a36';
  const head = hurtC ? '#efe0fa' : s.dead ? '#5a4866' : '#3d2650';
  const leg = hurtC ? '#d7c3e6' : '#1b1024';
  let lunge = 0;
  if (s.atkT > 0) lunge = Math.sin((1 - s.atkT / SPIDER.atkTime) * Math.PI) * 7;
  const ph = s.t * (s.aggro ? 20 : 11);

  ctx.save();
  ctx.translate(sx + (s.face >= 0 ? lunge : -lunge), sy - 6);
  ctx.scale((s.face >= 0 ? 1 : -1) * 1.25, 0.95 * 1.25); // sprite vẽ quay sang phải
  // 8 chân (4 đôi), đi lệch pha; chết thì co lại
  const fwd = [1.6, 0.6, -0.6, -1.6], at = [7, 3, -2, -7];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 0; k < 4; k++) {
    for (const sd of [-1, 1]) {
      const sw = s.dead || !(s.moving || s.atkT > 0) ? 0 : Math.sin(ph + k * 1.7 + (sd > 0 ? Math.PI : 0)) * 3.2;
      const kx = at[k] + fwd[k] * 3, ky = sd * (s.dead ? 6 : 9);
      const fx = at[k] + fwd[k] * (s.dead ? 3 : 8) + sw, fy = sd * (s.dead ? 9 : 17);
      ctx.strokeStyle = leg; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(at[k], 0); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
  }
  // bụng, đầu ngực, mắt
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(-7, 0, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  if (!s.dead && !hurtC) { ctx.fillStyle = '#7a2fa6'; ctx.beginPath(); ctx.ellipse(-8, 0, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = head;
  ctx.beginPath(); ctx.ellipse(6, 0, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = s.dead ? '#222' : '#ff3b3b';
  for (const [ex, ey] of [[10, -2.4], [10, 2.4], [8, -4.2], [8, 4.2]]) { ctx.beginPath(); ctx.arc(ex, ey, 1.3, 0, Math.PI * 2); ctx.fill(); }
  if (!s.dead) { ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(12.5, -1.5); ctx.lineTo(15, -2.5); ctx.moveTo(12.5, 1.5); ctx.lineTo(15, 2.5); ctx.stroke(); }
  ctx.restore();
  ctx.globalAlpha = 1;

  if (!s.dead) {
    const ratio = Math.max(0, s.hp) / s.maxHp;
    const w = 36, x = sx - w / 2, y = sy - 38;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 7);
    ctx.fillStyle = '#7a1c1c'; ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = hpColor(ratio); ctx.fillRect(x, y, w * ratio, 5);
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    shadowText('Nhện ' + Math.ceil(Math.max(0, s.hp)) + '/' + s.maxHp, sx, y - 3, '#d9b8f0');
  }
}

// ---------- Cung & mũi tên ----------
function heldBow() { return inv.bow > 0 && slotList()[hotbarSel] === 'bow'; }

const ARROW_H = 24; // mũi tên bay cách đất chừng này (pixel)
function shootArrow(camX, camY) {
  hitTimer = BOW.cd;
  if (!(inv.arrow > 0)) { say('Hết mũi tên! Chế từ đá + gậy + lông gà'); hitTimer = 0.5; return; }
  let dx, dy;
  if (keys['Space']) { dx = player.faceX; dy = player.faceY; }
  else { dx = mouse.x + camX - player.x; dy = mouse.y + camY + ARROW_H - player.y; } // ngắm vào thân: bù độ cao mũi tên
  const len = Math.hypot(dx, dy);
  if (len < 8) { dx = player.faceX; dy = player.faceY || 1; } else { dx /= len; dy /= len; }
  if (Math.abs(dx) > Math.abs(dy)) { player.faceX = Math.sign(dx); player.faceY = 0; }
  else { player.faceX = 0; player.faceY = Math.sign(dy) || 1; }
  inv.arrow--;
  attackAnim = ATTACK_TIME;
  swingTool = { id: 'bow', tier: 1 };
  bowShot = { t: 0, dx, dy, fired: false };
  if (!BOWFX.sheet) releaseArrow(); // không có sprite thì bắn ngay
}

// Mũi tên rời dây cung (đúng lúc khung "thả" của hoạt ảnh)
function releaseArrow() {
  if (!bowShot || bowShot.fired) return;
  const { dx, dy } = bowShot;
  bowShot.fired = true;
  arrows.push({ x: player.x + dx * 16, y: player.y + dy * 16, vx: dx * BOW.speed, vy: dy * BOW.speed, dist: 0 });
}

function updateBowShot(dt) {
  if (!bowShot) return;
  if (deathScreen) { bowShot = null; return; }
  bowShot.t += dt;
  if (bowShot.t >= BOW.draw) releaseArrow();
  if (bowShot.t >= BOW.anim) bowShot = null;
}

// Khung hình theo thời gian: 1 giương → 2 thả (tia sáng) → 3 thu cung → 0 về tư thế chuẩn bị
function bowFrame() {
  const t = bowShot.t;
  if (t < BOW.draw) return 1;
  if (t < BOW.draw + 0.1) return 2;
  if (t < BOW.draw + 0.26) return 3;
  return 0;
}

function bowSpriteActive() { return Boolean(bowShot && BOWFX.sheet); }

// Hàng sprite theo hướng ngắm: 0 phải, 1 trái, 2 lên, 3 xuống
function bowRow() {
  const { dx, dy } = bowShot;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 0 : 1;
  return dy < 0 ? 2 : 3;
}

function drawBowShot(sx, sy) {
  const { cellW, cellH, baseY } = BOWFX;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 14, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(BOWFX.sheet, bowFrame() * cellW, bowRow() * cellH, cellW, cellH, sx - cellW / 2, sy + 16 - baseY, cellW, cellH);
}

function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    let done = false;
    const steps = 3; // chia nhỏ bước bay để không xuyên qua mục tiêu
    for (let k = 0; k < steps && !done; k++) {
      a.x += a.vx * dt / steps; a.y += a.vy * dt / steps;
      a.dist += BOW.speed * dt / steps;
      if (a.dist > BOW.range || isSolid(Math.floor(a.x / TILE), Math.floor(a.y / TILE))) { done = true; break; }
      done = arrowHit(a);
    }
    if (done) { burst(a.x, a.y - ARROW_H, '#cfc7b0', 4, 80); arrows.splice(i, 1); }
  }
}

function arrowHit(a) {
  for (const z of zombies) {
    if (z.dead) continue;
    const rx = z.boss ? bossHB(z).rx : 18, up = z.boss ? bossHB(z).up : 44;
    const dx = a.x - z.x, dy = a.y - z.y;
    if (Math.abs(dx) < rx && dy > -up && dy < 12) { hitZombie(z, BOW.dmg); return true; }
  }
  for (const s of spiders) {
    if (s.dead) continue;
    const dx = a.x - s.x, dy = a.y - s.y;
    if (Math.abs(dx) < 20 && dy > -22 && dy < 12) { hitSpider(s, BOW.dmg); return true; }
  }
  if (layer === 0) {
    for (const an of animals) {
      const dx = a.x - an.x, dy = a.y - an.y;
      if (Math.abs(dx) < ANIMALS[an.kind].hitW && dy > -40 * (ANIMALS[an.kind].sc || 1) && dy < 14) { attackAnimal(an, BOW.dmg); return true; }
    }
  }
  return false;
}

function drawArrows(camX, camY, list = arrows) {
  for (const a of list) {
    const sx = a.x - camX, sy = a.y - camY;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(sx, sy - ARROW_H);
    ctx.rotate(Math.atan2(a.vy, a.vx));
    if (BOWFX.arrow) {
      ctx.drawImage(BOWFX.arrow, -BOWFX.arrow.width / 2 + 6, -BOWFX.arrow.height / 2);
      ctx.restore();
      continue;
    }
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(10, 0); ctx.stroke();
    poly([[10, -3], [16, 0], [10, 3]], '#b8bec8');
    poly([[-13, 0], [-9, -3.5], [-6, -3.5], [-9, 0], [-6, 3.5], [-9, 3.5]], '#fafafa');
    ctx.restore();
  }
}

function updateZombies(dt) {
  // Đêm xuống / mưa thì sinh thêm zombie hoang
  const dark = darkness() / 0.72;
  let cap = Math.round(dark * (BALANCE.zombie.capBase + Math.min(world.day, BALANCE.zombie.capMaxDays) * BALANCE.zombie.capPerDay));
  if (layer === 0 && world.rain.intensity > 0.3) cap = Math.max(cap, world.rain.storm ? WEATHER.zombieCapStorm : WEATHER.zombieCapRain);
  if (layer === 1) cap = Math.min(cap, MINE_ZONES[playerMineZone()].zombies); // hầm mỏ: tầng càng sâu càng nhiều zombie
  if (layer === 2 || layer === 3) cap = 0; // trong nhà / đấu trường boss không có zombie hoang
  if (dark > 0.35 && !nightWarned && layer === 0) {
    nightWarned = true;
    let farms = 0;
    for (const v of changes.values()) if (v === FARM) farms++;
    say(farms ? 'Đêm xuống... zombie sẽ giẫm nát ruộng chưa có hàng rào!' : 'Đêm xuống... zombie xuất hiện!');
  }
  if (dark < 0.1) nightWarned = false;

  zombieSpawnT -= dt;
  if (zombieSpawnT <= 0) {
    zombieSpawnT = 1.8 + Math.random() * 2.2;
    const wild = zombies.reduce((n, z) => n + (!z.guard && !z.dead && !z.plant ? 1 : 0), 0);
    if (wild < cap) spawnZombie();
  }

  updateRocks(dt);
  updateSpits(dt);
  updateBossMud(dt);
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    const d = Math.hypot(z.x - player.x, z.y - player.y);
    if (z.dead) { z.deadT += dt; if (z.deadT > (z.boss ? 5 : 2.2)) zombies.splice(i, 1); continue; }
    if (z.boss) { // boss: ở quá xa thì cất đi (nhớ máu), quay lại sẽ dựng lại
      if (d > (plantRadius() + 8) * TILE * 1.5) { bossDespawn(z); zombies.splice(i, 1); }
      else if (d < Z_FREEZE_DIST) (z.final ? FinalBoss.updateBoss : z.volc ? VolcBoss.updateBoss : z.mine ? updateGolem : updateBoss)(z, dt);
      continue;
    }
    if (z.plant) { // thực vật: cập nhật riêng; ở quá xa thì biến mất (quét lại chỗ mọc khi quay lại)
      if (d > (plantRadius() + 8) * TILE * 1.5) zombies.splice(i, 1);
      else if (d < Z_FREEZE_DIST) updatePlant(z, dt);
      continue;
    }
    if (d > Z_FREEZE_DIST) {
      // Zombie hoang ở quá xa thì biến mất (canh rương thì giữ nguyên)
      if (!z.guard && d > Z_FREEZE_DIST + 300) zombies.splice(i, 1);
      continue;
    }
    updateZombie(z, dt);
    // Zombie hoang không còn lý do tồn tại (hết đêm/mưa) và đã bị bỏ lại xa
    if (!z.guard && !z.dead && d > 800 && !z.aggro && zombies.length > cap + 2) zombies.splice(i, 1);
  }

  // Đẩy các zombie ra khỏi nhau cho khỏi chồng lên
  for (let i = 0; i < zombies.length; i++) {
    const a = zombies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < zombies.length; j++) {
      const b = zombies[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 24) {
        const push = (24 - d) * 0.5;
        if (!(a.plant && PTYPES[a.plant].root)) moveZombie(a, -dx / d * push, -dy / d * push);
        if (!(b.plant && PTYPES[b.plant].root)) moveZombie(b, dx / d * push, dy / d * push);
      }
    }
  }
}

// ======================================================================
// Cây cảnh (caycanh), Khu đầm lầy, thực vật ăn thịt (thucvat), thùng đồ ăn (Supplies)
// ======================================================================
const NATURE = { plants: null, supplies: null };
const PLANT_FRAME = 64, PLANT_FOOT = 47; // khung 64×64; chân cây nằm ở hàng điểm ảnh 47
const PLANT_ANIMS = {
  idle: { frames: 4, fps: 6 }, walk: { frames: 6, fps: 9 }, run: { frames: 8, fps: 12 },
  attack: { frames: 7, fps: 12 }, hurt: { frames: 5, fps: 12 }, death: { frames: 10, fps: 12 },
};
const PSPR = { 1: {}, 2: {}, 3: {} }; // PSPR[loại][tên anim] = Image. Hàng: 0=trước, 1=sau, 2=trái, 3=phải
let plantSpritesReady = false;

function loadNatureSprites() {
  const jobs = [
    loadImage('assets/nature/plants.webp').then((img) => { NATURE.plants = img; }),
    loadImage('assets/nature/supplies.webp').then((img) => { NATURE.supplies = img; }),
    loadBossSprites(),
    loadImage('assets/items/emerald.webp').then((img) => { EMERALD_IMG = img; }),
    loadImage('assets/items/watercan.webp').then((img) => { WATERCAN_IMG = img; }),
    loadImage('assets/items/diamond.webp').then((img) => { DIAMOND_IMG = img; }),
    ...['iron', 'gold', 'diamond'].flatMap((t) => ['idle', 'walk', 'run', 'attack', 'hurt'].map((a) => loadImage('assets/player/armored/' + t + '_' + a + '.webp').then((img) => { ARMOR_BODY[t + '_' + a] = img; }))),
    ...['iron', 'gold', 'diamond'].flatMap((t) => [
      ...['head', 'chest', 'legs', 'feet'].map((pt) => loadImage('assets/armor/' + t + '_' + pt + '.webp').then((img) => { ARMOR_IMG[t + '_' + pt] = img; })),
      loadImage('assets/armor/char_' + t + '.webp').then((img) => { CHAR_IMG[t] = img; }),
      ...['front', 'side'].map((v) => loadImage('assets/armor/frames/' + t + '_' + v + '.webp').then((img) => { ARMOR_FR[t + '_' + v] = img; })),
    ]),
    ...['pickaxe', 'axe', 'sword', 'hoe'].flatMap((n) => [1, 2, 3, 4, 5].map((t) => loadImage('assets/tools/' + n + t + '.webp').then((img) => { TOOL_IMG[n + t] = img; }))),
  ];
  for (const k of [1, 2, 3]) {
    for (const a of Object.keys(PLANT_ANIMS)) jobs.push(loadImage('assets/plant/p' + k + '_' + a + '.webp').then((img) => { PSPR[k][a] = img; }));
  }
  return Promise.all(jobs).then(() => {
    plantSpritesReady = [1, 2, 3].every((k) => Object.keys(PLANT_ANIMS).every((a) => PSPR[k][a]));
  });
}

// ---------- Cây cảnh: hình cắt trong plants.webp ----------
// [x, y, rộng, cao] của nửa trái (gốc đất nâu, hợp với bùn đầm lầy); nửa phải (x + 384) là bản có cỏ dưới gốc
const NATURE_TREES = {
  light: [261, 14, 52, 66], dark: [261, 82, 52, 62], blob: [263, 149, 48, 59], palm: [263, 219, 50, 69], palm2: [260, 298, 53, 70],
  grape: [325, 14, 52, 66], lemon: [325, 82, 52, 62], apple: [327, 149, 48, 59], banana: [327, 219, 50, 69], coco: [324, 298, 53, 70],
};
const NATURE_DECOR = {
  grass: [ // cỏ, mầm cây (thêm trên bãi cỏ)
    { r: [11, 337, 11, 13], s: 1.7 }, { r: [37, 332, 22, 17], s: 1.6 }, { r: [9, 371, 11, 10], s: 1.8 }, { r: [39, 363, 14, 18], s: 1.6 },
    { r: [12, 416, 11, 14], s: 1.7 }, { r: [37, 410, 21, 20], s: 1.5 }, { r: [11, 112, 12, 14], s: 1.7 }, { r: [40, 105, 19, 21], s: 1.5 },
    { r: [8, 190, 13, 16], s: 1.7 }, { r: [38, 180, 20, 26], s: 1.4 }, { r: [135, 119, 14, 20], s: 1.5 }, { r: [135, 180, 14, 22], s: 1.5 },
  ],
  flower: [{ r: [67, 396, 25, 34], s: 1.3 }, { r: [68, 352, 24, 28], s: 1.4 }], // hướng dương, lúa mì (hiếm)
  swamp: [ // cỏ dại, nấm (đầm lầy)
    { r: [37, 332, 22, 17], s: 1.7 }, { r: [11, 337, 11, 13], s: 1.9 }, { r: [161, 380, 12, 16], s: 1.8 }, { r: [37, 332, 22, 17], s: 1.4 },
    { r: [242, 380, 45, 16], s: 1.1 }, { r: [244, 414, 43, 14], s: 1.1 }, { r: [161, 380, 12, 16], s: 1.4 },
  ],
};

function drawNature(rect, grass, cx, baseY, scale, ox = 0) {
  const w = rect[2] * scale, h = rect[3] * scale;
  ctx.drawImage(NATURE.plants, rect[0] + (grass ? 384 : 0), rect[1], rect[2], rect[3], Math.round(cx - w / 2 + ox), Math.round(baseY - h), Math.round(w), Math.round(h));
}

// ---------- Khu đầm lầy ----------
const SWAMP_T = BALANCE.swamp.threshold;        // ngưỡng nhiễu: càng cao đầm lầy càng hiếm
const SWAMP_START = BALANCE.swamp.startClear;      // đầm lầy không mọc sát khu xuất phát (ô)
const swampCache = new Map();
function swampNoise(x, y) { return vnoise(x / 60 + 310, y / 60 - 270) * 0.8 + vnoise(x / 13 - 90, y / 13 + 40) * 0.2; }

// Gần làng / chợ (cách m ô) thì không có đầm lầy
function nearVillageObj(x, y, m) {
  const rx = Math.floor(x / REG), ry = Math.floor(y / REG);
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const c = villageCenterForRegion(rx + i, ry + j);
      if (c && x >= c.cx - VW - m && x <= c.cx + VW + m && y >= c.cy - V_TOP - m && y <= c.cy + V_BOT + m) return true;
      for (const mk of marketsForRegion(rx + i, ry + j)) {
        if (x >= mk.mx - MARKET_HW - m && x <= mk.mx + MARKET_HW + m && y >= mk.my - MARKET_TOP - m && y <= mk.my + MARKET_BOT + m) return true;
      }
    }
  }
  return false;
}

// 0 = không phải đầm lầy, 1 = bùn, 2 = vũng nước
function swampType(x, y) {
  if (layer !== 0) return 0;
  const key = (x + 32768) * 65536 + (y + 32768);
  let v = swampCache.get(key);
  if (v === undefined) {
    const far = Math.hypot(x, y);
    const n = far > 20 ? swampNoise(x, y) : 0;
    const t = SWAMP_T + Math.max(0, SWAMP_START - far) * 0.006;
    v = 0;
    if (n > t && !nearVillageObj(x, y, 9) && !volcNear(x, y)) { // không có đầm lầy trên đảo núi lửa
      v = n > t + 0.025 && vnoise(x / 4.2 + 77, y / 4.2 - 33) > 0.62 ? 2 : 1;
    }
    if (swampCache.size > 250000) swampCache.clear();
    swampCache.set(key, v);
  }
  return v;
}
function isSwamp(x, y) { return swampType(x, y) > 0; }

// ---------- Biển ----------
// 0 = không phải biển, 1 = bãi cát, 2 = nước nông (lội chậm), 3 = nước sâu (ô SEA: không đi vào được, chỉ bắn / phép bay qua)
const SEA_T = 0.46;        // ngưỡng nhiễu: càng cao biển càng rộng
const SEA_START = 50;      // biển không mọc sát khu xuất phát (ô)
const seaCache = new Map();
function seaNoise(x, y) { return vnoise(x / 105 + 910, y / 105 - 640) * 0.78 + vnoise(x / 16 - 250, y / 16 + 130) * 0.22; }
// Nước thô (chưa tính bãi cát): 0 / 2 nông / 3 sâu; không mọc đè làng, chợ, đầm lầy, Cây Cổ Thụ, nhà Phù Thủy
const seaRawCache = new Map();
function seaRaw(x, y) {
  const key = (x + 32768) * 65536 + (y + 32768);
  let v = seaRawCache.get(key);
  if (v === undefined) {
    v = 0;
    const vs = volcanoSea(x, y); // đảo núi lửa + biển bao quanh (volcano.js): ép nước / đất, bỏ qua nhiễu tự nhiên
    const far = Math.hypot(x, y);
    if (vs !== undefined) v = vs;
    else if (far > 20) {
      const n = seaNoise(x, y);
      const t = SEA_T - Math.max(0, SEA_START - far) * 0.012;
      if (n < t && swampType(x, y) === 0 && !nearVillageObj(x, y, 10) && !villageAt(x, y)) v = n < t - 0.05 ? 3 : 2;
    }
    if (seaRawCache.size > 250000) seaRawCache.clear();
    seaRawCache.set(key, v);
  }
  return v;
}
function seaType(x, y) {
  if (layer !== 0) return 0;
  const key = (x + 32768) * 65536 + (y + 32768);
  let v = seaCache.get(key);
  if (v === undefined) {
    v = seaRaw(x, y);
    if (!v && swampType(x, y) === 0 && !villageAt(x, y)) {
      // bãi cát: mọi ô đất sát nước (kể cả chéo) đều là cát, nên bờ luôn có cát bao quanh
      for (let j = -1; j <= 1 && !v; j++) for (let i = -1; i <= 1; i++) if ((i || j) && seaRaw(x + i, y + j) >= 2) { v = 1; break; }
    }
    if (seaCache.size > 250000) seaCache.clear();
    seaCache.set(key, v);
  }
  return v;
}

// Sprite biển: sea_deep (sóng ngoài khơi, 16 khung) và swim (nhân vật bơi, 16 khung)
const SEAFX = { deep: null, swim: null };
const SEA_SAND = '#e6cb91';
const SEA_DIRS = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
function seaFrame(fps) { return Math.floor(gameTime * fps) % 16; }

// Mặt nước liền mạch: mỗi khung sóng được lật gương 2x2 (mép nối khớp nhau) rồi lát kín thế giới -> không còn vết ghép ô
const seaPats = [];
function seaPattern(f) {
  if (seaPats[f]) return seaPats[f];
  const img = SEAFX.deep; if (!img) return null;
  const fw = img.width / 4, fh = Math.floor(img.height / 4), W = Math.floor(fw - 4), H = fh - 4;
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d');
  const sx = (f % 4) * fw + 2, sy = Math.floor(f / 4) * (img.height / 4) + 2;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    g.save(); g.translate(i * W + (i ? W : 0), j * H + (j ? H : 0)); g.scale(i ? -1 : 1, j ? -1 : 1);
    g.drawImage(img, sx, sy, W, H, 0, 0, W, H); g.restore();
  }
  seaPats[f] = ctx.createPattern(c, 'repeat');
  return seaPats[f];
}
const seaDepthCv = document.createElement('canvas');
// Vẽ toàn bộ mặt biển trong vùng nhìn: nền sóng liền mạch + màu nước nông chuyển dần (mượt, không theo ô)
function drawSeaWater(camX, camY, tx0, ty0, tx1, ty1) {
  const pat = seaPattern(seaFrame(6));
  const wet = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (seaType(tx, ty) >= 2) wet.push(tx, ty);
  if (!wet.length) return;
  const path = new Path2D();
  for (let i = 0; i < wet.length; i += 2) path.rect(wet[i] * TILE - camX, wet[i + 1] * TILE - camY, TILE + 1, TILE + 1);
  ctx.save();
  if (pat) {
    pat.setTransform(new DOMMatrix([1, 0, 0, 1, -camX, -camY]));
    ctx.fillStyle = pat;
  } else ctx.fillStyle = '#1d5a94';
  ctx.fill(path);
  // độ nông: ảnh nhỏ 1 điểm / ô, phóng to có làm mịn -> chuyển màu liền mạch
  const nx = tx1 - tx0 + 3, ny = ty1 - ty0 + 3;
  seaDepthCv.width = nx; seaDepthCv.height = ny;
  const g = seaDepthCv.getContext('2d'), im = g.createImageData(nx, ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const t = seaType(tx0 - 1 + i, ty0 - 1 + j), k = (j * nx + i) * 4;
    const al = t === 1 ? 0.62 : t === 2 ? 0.3 : t === 3 ? 0 : 0;
    im.data[k] = 120; im.data[k + 1] = 215; im.data[k + 2] = 235; im.data[k + 3] = al * 255;
  }
  g.putImageData(im, 0, 0);
  ctx.clip(path);
  const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(seaDepthCv, (tx0 - 1) * TILE - camX, (ty0 - 1) * TILE - camY, nx * TILE, ny * TILE);
  ctx.imageSmoothingEnabled = sm;
  ctx.restore();
}

// Sóng liếm lên bãi cát: viền lượn theo toạ độ thế giới (liền giữa các ô), tiến lùi theo thời gian
function drawShoreWash(tx, ty, bx, by, d) {
  const rot = d === 'N' ? 0 : d === 'S' ? Math.PI : d === 'E' ? Math.PI / 2 : -Math.PI / 2;
  const base = d === 'N' || d === 'S' ? tx * TILE : ty * TILE;
  const rev = d === 'S' || d === 'W';
  const along = (i) => base + (rev ? TILE - i : i);
  const T = gameTime;
  const edge = (i) => {
    const a = along(i);
    const pulse = 0.5 + 0.5 * Math.sin(T * 1.3 + a * 0.011);          // sóng tiến / lùi
    return 5 + pulse * 13 + Math.sin(a * 0.19 + T * 1.7) * 2.2 + Math.sin(a * 0.07 - T) * 2.5;
  };
  ctx.save();
  ctx.translate(bx + TILE / 2, by + TILE / 2);
  ctx.rotate(rot);
  ctx.translate(-TILE / 2, -TILE / 2);
  const pts = [];
  for (let i = 0; i <= TILE; i += 3) pts.push([i, edge(i)]);
  // vùng nước mỏng phủ lên cát
  ctx.fillStyle = 'rgba(150,220,240,0.42)';
  ctx.beginPath(); ctx.moveTo(-0.5, -1); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.lineTo(TILE + 0.5, -1); ctx.closePath(); ctx.fill();
  // cát ướt sau đường sóng rút
  ctx.fillStyle = 'rgba(130,95,45,0.14)';
  ctx.beginPath(); ctx.moveTo(0, 0); for (const q of pts) ctx.lineTo(q[0], q[1] + 7); ctx.lineTo(TILE, 0); ctx.closePath(); ctx.fill();
  // bọt trắng ở mép sóng
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
  ctx.beginPath(); pts.forEach((q, n) => (n ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
  ctx.beginPath(); pts.forEach((q, n) => (n ? ctx.lineTo(q[0], q[1] - 6 - 2 * Math.sin(along(q[0]) * 0.1 + T * 2)) : ctx.moveTo(q[0], q[1] - 6))); ctx.stroke();
  ctx.restore();
}
function drawSeaGround(tx, ty, hv, bx, by) {
  if (seaType(tx, ty) !== 1) return; // nước đã vẽ ở drawSeaWater
  ctx.fillStyle = SEA_SAND;
  ctx.fillRect(bx, by, TILE + 1, TILE + 1);
  if (hv > 0.8) { ctx.fillStyle = '#cdb078'; ctx.fillRect(bx + 10, by + 22, 6, 3); }
  if (hv < 0.12) { ctx.fillStyle = '#f6e8c4'; ctx.fillRect(bx + 28, by + 12, 4, 3); }
  if (hv > 0.45 && hv < 0.5) { ctx.fillStyle = '#d9a98a'; ctx.fillRect(bx + 20, by + 28, 5, 4); }
  for (const d of ['N', 'S', 'W', 'E']) {
    const o = SEA_DIRS[d];
    if (seaType(tx + o[0], ty + o[1]) >= 2) drawShoreWash(tx, ty, bx, by, d);
  }
}

function isSwimming() { return layer === 0 && getTile(Math.floor(player.x / TILE), Math.floor((player.y + 6) / TILE)) === SEA; }
let swimDir = 1; // hàng trong sheet swim4.webp (4 hàng x 16 khung): 0 trái, 1 phải, 2 lên, 3 xuống
const swimWake = [];            // vệt sóng loang dần sau lưng người bơi { x, y, t }
let swimWakeT = 0;
const swimCv = document.createElement('canvas');
function drawSwimmer(sx, sy) {
  const img = SEAFX.swim; if (!img) return false;
  const cw = img.width / 16, ch = img.height / 4, S = 0.42;
  if (player.faceX !== 0) swimDir = player.faceX < 0 ? 0 : 1;
  else if (player.faceY < 0) swimDir = 2;
  else if (player.faceY > 0) swimDir = 3;
  const mv = player.moving;
  const f = Math.floor(gameTime * (mv ? 12 : 5)) % 16;
  const w = Math.round(cw * S), h = Math.round(ch * S);
  const bob = Math.sin(gameTime * (mv ? 7 : 2.5)) * (mv ? 1.2 : 1.6);
  const camX = player.x - sx, camY = player.y - sy;
  // vệt sóng sau lưng: nhỏ dần rồi tan, chỉ tạo khi đang bơi
  swimWakeT -= 1 / 60;
  if (swimWakeT <= 0) {
    swimWakeT = mv ? 0.16 : 0.9;
    const dx = swimDir === 0 ? 14 : swimDir === 1 ? -14 : 0, dy = swimDir === 2 ? 12 : swimDir === 3 ? -4 : 4;
    swimWake.push({ x: player.x + (mv ? dx : 0), y: player.y + (mv ? dy : 6), t: gameTime });
    if (mv) burst(player.x + dx * 0.4, player.y + dy * 0.4 + 4, '#eaf8ff', 2, 40, 420); // bọt nước tung ra
    if (swimWake.length > 14) swimWake.shift();
  }
  for (let i = swimWake.length - 1; i >= 0; i--) {
    const q = swimWake[i], age = gameTime - q.t;
    if (age > 1.4) { swimWake.splice(i, 1); continue; }
    const k = age / 1.4;
    ctx.strokeStyle = 'rgba(235,248,255,' + (0.4 * (1 - k)).toFixed(3) + ')'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(q.x - camX, q.y - camY, 5 + k * 22, 2 + k * 8, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // nhân vật chìm một phần trong nước: phần dưới được phủ màu nước, mép nước gợn nhẹ
  swimCv.width = w; swimCv.height = h;
  const g = swimCv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(img, f * cw, swimDir * ch, cw, ch, 0, 0, w, h);
  g.globalCompositeOperation = 'source-atop';
  const wl = h * (swimDir >= 2 ? 0.5 : 0.56);
  const grad = g.createLinearGradient(0, wl - 4, 0, wl + h * 0.3);
  grad.addColorStop(0, 'rgba(40,130,205,0)'); grad.addColorStop(0.35, 'rgba(40,130,205,0.55)'); grad.addColorStop(1, 'rgba(25,95,170,0.8)');
  g.fillStyle = grad; g.fillRect(0, wl - 4, w, h);
  g.globalCompositeOperation = 'source-over';
  const x0 = Math.round(sx - w / 2), y0 = Math.round(sy - h / 2 + 4 + bob);
  ctx.drawImage(swimCv, x0, y0);
  // bọt mỏng dọc mép nước quanh người
  ctx.strokeStyle = 'rgba(240,252,255,0.55)'; ctx.lineWidth = 1.5;
  const wy = y0 + wl, sw = Math.sin(gameTime * 6);
  ctx.beginPath(); ctx.moveTo(x0 + w * 0.12, wy + 1 + sw); ctx.lineTo(x0 + w * 0.3, wy + 2 - sw); ctx.moveTo(x0 + w * 0.68, wy + 2 + sw); ctx.lineTo(x0 + w * 0.88, wy + 1 - sw); ctx.stroke();
  return true;
}

// Đi trong bùn thì chậm, lội nước thì chậm hơn
function terrainSpeed() {
  if (layer === 1) {
    const t = getTile(Math.floor(player.x / TILE), Math.floor((player.y + 6) / TILE));
    return t === WATER ? BALANCE.mine.waterSpeed : t === LAVA ? BALANCE.mine.lavaSpeed : 1;
  }
  if (layer !== 0) return 1;
  if (boating) return BOAT_SPEED;
  const ptx = Math.floor(player.x / TILE), pty = Math.floor((player.y + 6) / TILE);
  if (getTile(ptx, pty) === LAVA) return BALANCE.mine.lavaSpeed;
  if (getTile(ptx, pty) === WATER) return BALANCE.mine.waterSpeed; // nước do người chơi đổ ra
  const st = seaType(ptx, pty);
  if (st === 3) return 0.5;      // bơi ngoài khơi
  if (st === 2) return 0.7;      // lội nước nông
  if (st === 1) return 1 / 1.5;  // đi trên cát chậm hơn 1,5 lần
  const t = swampType(ptx, pty);
  return t === 2 ? 0.62 : t === 1 ? 0.9 : 1;
}

function drawSwampGround(tx, ty, hv, bx, by) {
  const type = swampType(tx, ty);
  const h2 = hash(tx * 11 + 5, ty * 17 - 9);
  if (type === 2) { // vũng nước đục
    ctx.fillStyle = hv < 0.33 ? '#2b5654' : hv < 0.66 ? '#285250' : '#2e5b58';
    ctx.fillRect(bx, by, TILE + 1, TILE + 1);
    ctx.fillStyle = '#3b4a26'; // bờ bùn
    if (swampType(tx, ty - 1) !== 2) ctx.fillRect(bx, by, TILE + 1, 5);
    if (swampType(tx, ty + 1) !== 2) ctx.fillRect(bx, by + TILE - 4, TILE + 1, 5);
    if (swampType(tx - 1, ty) !== 2) ctx.fillRect(bx, by, 5, TILE + 1);
    if (swampType(tx + 1, ty) !== 2) ctx.fillRect(bx + TILE - 4, by, 5, TILE + 1);
    const w1 = Math.sin(gameTime * 1.3 + h2 * 40) * 5;
    ctx.fillStyle = 'rgba(185,230,220,0.2)';
    ctx.fillRect(bx + 10 + w1, by + 14, 16, 2);
    ctx.fillRect(bx + 22 - w1, by + 31, 12, 2);
    if (h2 > 0.84) { // lá sen, hoa sen
      mkDot(bx + 14 + h2 * 8, by + 26, 8, '#3d7a3c');
      mkDot(bx + 12 + h2 * 8, by + 24, 4, '#4f9447');
      if (h2 > 0.93) mkDot(bx + 20 + h2 * 8, by + 22, 3, '#f0a8c8');
    }
    return;
  }
  ctx.fillStyle = hv < 0.33 ? '#4a592c' : hv < 0.66 ? '#435127' : '#506030';
  ctx.fillRect(bx, by, TILE + 1, TILE + 1);
  if (h2 < 0.28) { ctx.fillStyle = 'rgba(30,40,20,0.35)'; ctx.fillRect(bx + 4 + h2 * 50, by + 12 + h2 * 30, 22, 9); } // vệt bùn
  else if (h2 < 0.4) { ctx.fillStyle = 'rgba(105,140,60,0.35)'; ctx.fillRect(bx + 8, by + 20, 18, 7); }               // rêu
  else if (h2 > 0.93) { ctx.fillStyle = 'rgba(40,70,70,0.6)'; ctx.fillRect(bx + 12, by + 24, 14, 6); ctx.fillStyle = 'rgba(185,230,220,0.2)'; ctx.fillRect(bx + 14, by + 25, 6, 1); } // vũng nhỏ
  if (!NATURE.plants) return;
  const dh = hash(tx * 13 + 3, ty * 7 - 19);
  if (dh < 0.2 && getTile(tx, ty) === GRASS) {
    const list = NATURE_DECOR.swamp;
    const d = list[Math.floor(hash(tx * 5 + 1, ty * 3 + 8) * list.length)];
    const ox = (hash(tx * 3 + 9, ty * 5 - 4) - 0.5) * 20;
    drawNature(d.r, false, bx + TILE / 2, by + 28 + hash(tx - 4, ty + 6) * 16, d.s, ox);
  }
}

// Cỏ, mầm cây, hoa trên bãi cỏ thường
function drawGrassDecor(tx, ty, bx, by, vg, hv) {
  if (!NATURE.plants) {
    if (hv > 0.9) { ctx.fillStyle = '#3f6629'; ctx.fillRect(bx + 14, by + 20, 4, 8); ctx.fillRect(bx + 20, by + 24, 4, 6); }
    return;
  }
  if (vg) return;
  const dh = hash(tx * 13 + 3, ty * 7 - 19);
  if (dh > 0.17 || getTile(tx, ty) !== GRASS) return;
  const pick = hash(tx * 5 + 1, ty * 3 + 8);
  let d;
  if (dh < 0.012) d = NATURE_DECOR.flower[pick < 0.5 ? 0 : 1];
  else d = NATURE_DECOR.grass[Math.floor(pick * NATURE_DECOR.grass.length)];
  const ox = (hash(tx * 3 + 9, ty * 5 - 4) - 0.5) * 22;
  drawNature(d.r, true, bx + TILE / 2, by + 26 + hash(tx - 4, ty + 6) * 18, d.s, ox);
}

function treeKind(tx, ty) {
  const r = hash(tx * 7 + 13, ty * 11 - 5);
  if (isSwamp(tx, ty)) return r < 0.45 ? 'dark' : r < 0.7 ? 'palm' : r < 0.88 ? 'coco' : 'palm2';
  if (r < 0.34) return 'light';
  if (r < 0.52) return 'dark';
  if (r < 0.64) return 'blob';
  if (r < 0.75) return 'apple';
  if (r < 0.82) return 'lemon';
  if (r < 0.88) return 'grape';
  if (r < 0.94) return 'palm';
  if (r < 0.98) return 'banana';
  return 'palm2';
}

function drawTree(sx, sy, key) {
  if (!NATURE.plants) { drawTreeFallback(sx, sy, key); return; }
  const [tx, ty] = key.split(',').map(Number);
  drawNature(NATURE_TREES[treeKind(tx, ty)], !isSwamp(tx, ty), sx + TILE / 2, sy + TILE - 1, 1.12, shakeOffset(key));
}

// ---------- Thực vật ăn thịt trong khu đầm lầy ----------
// Plant1: chạy tới cắn · Plant2: đứng im, nhả độc từ xa · Plant3: chạy tới tấn công (khoẻ hơn)
const PTYPES = {
  1: { name: 'Hoa Cắn',      hp: 32, walk: 38, run: 125, dmg: 10, range: 40, cd: 1.0, atk: 0.6,  scale: 2.0 },
  2: { name: 'Hoa Phun Độc', hp: 26, ranged: true, root: true, dmg: 9, range: 340, cd: 2.0, atk: 0.6, scale: 2.0 },
  3: { name: 'Hoa Dữ',       hp: 46, walk: 42, run: 140, dmg: 14, range: 42, cd: 0.9, atk: 0.55, scale: 2.2 },
};
const PLANT_NEST = BALANCE.swamp.plantNest;     // xác suất một ô bùn là chỗ mọc của một cây
const PLANT_RESPAWN = BALANCE.swamp.plantRespawn;     // giây sau khi bị hạ thì mọc lại
const spits = [];              // cầu độc do Plant2 phun
let plantScanT = 0, plantScanAt = null;
let swampWas = false, swampMsgT = -99;

function createPlant(kind, x, y, nest) {
  const st = PTYPES[kind];
  const z = {
    plant: kind, type: kind, nest, x, y, hx: x, hy: y,
    hp: st.hp, maxHp: st.hp, face: 1, dir: 0, fx: 0, fy: 1,
    t: Math.random() * 5, aggro: false, atkCd: 0.6 + Math.random(), atkT: 0, atkHit: false, hurtT: 0,
    dead: false, deadT: 0, noDrop: false, kx: 0, ky: 0, wanderT: Math.random() * 3, wx: x, wy: y,
    stuck: 0, sideT: 0, sideDir: 1, escal: 0, freeT: 0, moving: false, running: false, guard: null,
  };
  zombies.push(z);
  return z;
}

function plantFacing(z, vx, vy) {
  if (Math.hypot(vx, vy) < 0.02) return;
  z.fx = vx; z.fy = vy;
  z.dir = Math.abs(vx) > Math.abs(vy) * 1.15 ? (vx < 0 ? 2 : 3) : (vy < 0 ? 1 : 0);
}

function updatePlant(z, dt) {
  z.t += dt;
  const st = PTYPES[z.plant];
  const dxp = player.x - z.x, dyp = player.y - z.y;
  const dist = Math.hypot(dxp, dyp);
  z.atkCd = Math.max(0, z.atkCd - dt);
  z.hurtT = Math.max(0, z.hurtT - dt);
  z.moving = false; z.running = false;

  if (st.root) { z.kx = 0; z.ky = 0; } // Plant2 bám rễ: không bị đánh văng
  else if (Math.abs(z.kx) + Math.abs(z.ky) > 5) {
    moveZombie(z, z.kx * dt, z.ky * dt);
    const f = Math.max(0, 1 - 9 * dt);
    z.kx *= f; z.ky *= f;
  }

  const detect = st.ranged ? st.range : 300;
  if (!deathScreen && dist < detect) z.aggro = true;
  else if (deathScreen || dist > detect + 240) z.aggro = false;

  if (z.hurtT > 0) return;

  if (z.atkT > 0) { // đang tấn công: đòn trúng ở giữa hoạt ảnh
    z.atkT -= dt;
    if (!z.atkHit && z.atkT <= st.atk / 2) {
      z.atkHit = true;
      if (st.ranged) shootSpit(z, st);
      else if (Math.hypot(player.x - z.x, player.y - z.y) < st.range + 14 && lineClear(z.x, z.y, player.x, player.y)) hurt(st.dmg);
    }
    return;
  }

  if (z.aggro) {
    plantFacing(z, dxp, dyp);
    if (st.ranged) { // đứng yên, đủ tầm và không bị chắn thì phun độc
      if (dist <= st.range && z.atkCd <= 0 && lineClear(z.x, z.y - 20, player.x, player.y)) {
        z.atkT = st.atk; z.atkHit = false; z.atkCd = st.cd + Math.random() * 0.5;
      }
      return;
    }
    if (dist < st.range && lineClear(z.x, z.y, player.x, player.y)) {
      if (z.atkCd <= 0) { z.atkT = st.atk; z.atkHit = false; z.atkCd = st.cd; }
    } else {
      zombieWalk(z, player.x, player.y, st.run, dt);
      z.running = true;
    }
    if (Math.hypot(z.x - z.hx, z.y - z.hy) > 1100) z.aggro = false; // đuổi quá xa chỗ mọc thì bỏ cuộc
    return;
  }

  if (st.root) return;
  // Chưa thấy người chơi: lững thững quanh chỗ mọc (thỉnh thoảng đứng yên)
  z.wanderT -= dt;
  if (z.wanderT <= 0) {
    z.wanderT = 2.5 + Math.random() * 3.5;
    const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 90;
    z.wx = z.hx + Math.cos(a) * d; z.wy = z.hy + Math.sin(a) * d;
    if (Math.random() < 0.45) { z.wx = z.x; z.wy = z.y; }
  }
  zombieWalk(z, z.wx, z.wy, st.walk, dt);
  if (z.moving) plantFacing(z, z.wx - z.x, z.wy - z.y);
}

function shootSpit(z, st) {
  const dx = player.x - z.x, dy = player.y - z.y, d = Math.hypot(dx, dy) || 1;
  spits.push({ x: z.x, y: z.y, vx: dx / d * 250, vy: dy / d * 250, life: 2.2, dmg: st.dmg, t: 0 });
  burst(z.x, z.y - 30, '#a6e34a', 5, 90);
}

function updateSpits(dt) {
  for (let i = spits.length - 1; i >= 0; i--) {
    const s = spits[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; s.t += dt;
    let dead = s.life <= 0 || layer !== 0 || isSolid(Math.floor(s.x / TILE), Math.floor(s.y / TILE));
    if (!dead && Math.hypot(s.x - player.x, s.y - player.y) < 24) { hurt(s.dmg); dead = true; }
    if (dead) { burst(s.x, s.y - 18, '#a6e34a', 6, 110); spits.splice(i, 1); }
  }
}

function drawSpits(camX, camY) {
  for (const s of spits) {
    const sx = s.x - camX, sy = s.y - camY;
    const pulse = 1 + Math.sin(s.t * 18) * 0.15;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 2, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4f8a1c';
    ctx.beginPath(); ctx.arc(sx, sy - 22, 8 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a6e34a';
    ctx.beginPath(); ctx.arc(sx - 1, sy - 23, 5.5 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8ffb0'; ctx.fillRect(sx - 4, sy - 27, 3, 3);
  }
}

function killPlant(z) {
  z.dead = true; z.deadT = 0; z.aggro = false;
  burst(z.x, z.y - 22, '#8bd04a', 14, 180);
  plantDeaths.set(z.nest, gameTime);
  if (z.noDrop) return;
  dropEmeralds(z.x, z.y, [0.35, 1, 2]);
  const r = Math.random(), n = r < 0.3 ? 0 : r < 0.75 ? 1 : 2;
  if (n > 0) {
    spawnLoot('veg', n, z.x, z.y);
  }
}
const plantDeaths = new Map(); // khoá chỗ mọc -> giờ chơi lúc bị hạ

// Chỗ mọc cố định theo bản đồ (như cây): chỉ dựng cây thật khi người chơi tới gần
function nestAt(tx, ty) {
  if (swampType(tx, ty) !== 1) return null;
  const r = hash(tx * 29 + 17, ty * 31 - 23);
  if (r >= PLANT_NEST) return null;
  if (getTile(tx, ty) !== GRASS) return null;
  const k = r / PLANT_NEST;
  return { key: tx + ',' + ty, kind: k < 0.38 ? 1 : k < 0.68 ? 2 : 3 };
}

function trySpawnNest(tx, ty) {
  const n = nestAt(tx, ty);
  if (!n) return;
  const died = plantDeaths.get(n.key);
  if (died !== undefined && gameTime - died < PLANT_RESPAWN) return;
  for (const z of zombies) if (z.nest === n.key) return; // đã có cây ở đây
  const jx = (hash(tx + 3, ty * 7) - 0.5) * 20, jy = (hash(tx * 5, ty + 9) - 0.5) * 16;
  const c = tileCenter(tx, ty);
  createPlant(n.kind, c.x + jx, c.y + jy, n.key);
}

function plantRadius() { return Math.ceil(Math.hypot(canvas.width, canvas.height) / 2 / TILE) + 2; }

function updateSwamp(dt) {
  if (layer !== 0) { swampWas = false; return; }
  const px = Math.floor(player.x / TILE), py = Math.floor((player.y + 6) / TILE);
  const here = swampType(px, py);
  if (here && !swampWas && gameTime - swampMsgT > 40) { swampMsgT = gameTime; say('Khu đầm lầy! Cẩn thận thực vật ăn thịt, bùn làm bạn đi chậm'); }
  swampWas = here > 0;
  if (here === 2 && player.moving && Math.random() < dt * 9) burst(player.x, player.y + 8, '#9ad4cc', 2, 70, 300);

  if (deathScreen) return;
  plantScanT -= dt;
  if (plantScanT > 0) return;
  plantScanT = 0.4;
  const R0 = plantRadius();
  const jump = !plantScanAt || Math.max(Math.abs(plantScanAt.x - px), Math.abs(plantScanAt.y - py)) > 6;
  plantScanAt = { x: px, y: py };
  const R1 = R0 + 3;
  for (let ty = py - R1; ty <= py + R1; ty++) {
    for (let tx = px - R1; tx <= px + R1; tx++) {
      // bình thường chỉ quét vành ngoài màn hình (cây hiện ra từ xa); vừa dịch chuyển tới thì dựng cả vùng
      if (!jump && Math.max(Math.abs(tx - px), Math.abs(ty - py)) < R0) continue;
      trySpawnNest(tx, ty);
    }
  }
  updateBossSpawn(px, py, R1, jump, R0);
}

// Thanh máu boss to ở giữa phía trên màn hình (hiện khi boss còn sống, đang đánh hoặc ở gần)
// Ảnh đại diện từng boss (assets/avatars/*.webp, cắt từ đầu sprite): cá sấu · golem hầm mỏ · quỷ dung nham · rồng băng
const BOSS_AVATARS = {};
function bossAvatar(b) {
  const k = b.final ? 'final' : b.volc ? (b.ice ? 'ice' : 'lava') : b.mine ? 'golem' : 'croc';
  if (!(k in BOSS_AVATARS)) { BOSS_AVATARS[k] = null; loadImage('assets/avatars/' + k + '.webp').then((img) => { BOSS_AVATARS[k] = img; }); }
  return BOSS_AVATARS[k];
}
let bossBarGhost = null; // phần trắng "trôi" theo lượng máu vừa mất
function drawBossBar(dt) {
  if (ui || deathScreen || layer === 2) { bossBarGhost = null; return; }
  let b = null, bd = 1e9;
  for (const z of zombies) {
    if (!z.boss || z.dead) continue;
    const d = Math.hypot(z.x - player.x, z.y - player.y);
    if (d < bd) { bd = d; b = z; }
  }
  if (!b || (!b.aggro && bd > 640)) { bossBarGhost = null; return; }
  const ratio = Math.max(0, b.hp) / b.maxHp;
  if (bossBarGhost === null || bossBarGhost < ratio) bossBarGhost = ratio;
  bossBarGhost = Math.max(ratio, bossBarGhost - dt * 0.25);
  const rage = b.hp < b.maxHp * 0.5;
  const W = Math.max(220, Math.min(460, canvas.width - 420));
  const left = Math.max(278, Math.round(canvas.width / 2 - (W + 52) / 2)); // không đè lên khung máu / đói bên trái
  const bx = left + 52, by = 34, h = 22, icy = !!b.ice, fin = !!b.final; // boss băng: thanh máu xanh · rồng cuối: thanh máu tím
  ctx.save();
  // biểu tượng đầu lâu bên trái
  ctx.fillStyle = 'rgba(20,10,10,0.9)';
  ctx.beginPath(); ctx.arc(left + 22, by + h / 2, 21, 0, Math.PI * 2); ctx.fill();
  const av = bossAvatar(b);
  if (av) { // ảnh đại diện của boss, cắt tròn
    ctx.save(); ctx.beginPath(); ctx.arc(left + 22, by + h / 2, 20, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = fin ? '#24123c' : icy ? '#16294a' : b.volc ? '#3a1208' : b.mine ? '#2a2236' : '#12261a'; ctx.fillRect(left, by - 10, 44, 44);
    const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(av, left + 1, by + h / 2 - 21, 42, 42); ctx.imageSmoothingEnabled = sm;
    ctx.restore();
  } else { ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd9cf'; ctx.fillText('☠', left + 22, by + h / 2 + 8); }
  ctx.lineWidth = 3; ctx.strokeStyle = fin ? (rage ? '#e0a0ff' : '#a070e0') : icy ? (rage ? '#7fd8ff' : '#4a9be0') : rage ? '#ff6a3a' : '#c9473a';
  ctx.beginPath(); ctx.arc(left + 22, by + h / 2, 21, 0, Math.PI * 2); ctx.stroke();
  // khung + thanh máu
  ctx.fillStyle = '#000'; ctx.fillRect(bx - 3, by - 3, W + 6, h + 6);
  ctx.fillStyle = fin ? '#2a1646' : icy ? '#16294a' : '#4a1515'; ctx.fillRect(bx, by, W, h);
  ctx.fillStyle = '#f2f2f2'; ctx.fillRect(bx, by, W * bossBarGhost, h);
  ctx.fillStyle = fin ? (rage ? '#d070ff' : '#9a50e8') : icy ? (rage ? '#5fd0ff' : '#2f86e0') : rage ? '#ff5a2a' : '#d63a3a'; ctx.fillRect(bx, by, W * ratio, h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(bx, by, W * ratio, 5);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx + W / 2, by); ctx.lineTo(bx + W / 2, by + h); ctx.stroke(); // vạch 50%: nổi giận
  // tên + số máu
  ctx.textAlign = 'left'; ctx.font = 'bold 16px sans-serif';
  shadowText((b.final ? FinalBoss.NAME : b.volc ? VolcBoss.nameOf(b) : b.mine ? GOLEM.name : BOSS.name) + (rage ? '  (nổi giận!)' : ''), bx, by - 9, fin ? '#e6ccff' : icy ? '#c6ecff' : rage ? '#ff9a6a' : '#ffd0c4');
  ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif';
  shadowText(Math.ceil(Math.max(0, b.hp)) + ' / ' + b.maxHp, bx + W / 2, by + h - 6, '#fff');
  ctx.restore();
}

function drawPlant(z, camX, camY) {
  const sx = Math.round(z.x - camX), sy = Math.round(z.y - camY);
  const st = PTYPES[z.plant], S = st.scale;
  const fade = z.dead ? Math.max(0, 1 - Math.max(0, z.deadT - 1.2) / 1) : 1;
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 12, z.dead ? 26 : 20, 6, 0, 0, Math.PI * 2); ctx.fill();

  if (!plantSpritesReady) {
    ctx.fillStyle = '#7a2f6b';
    ctx.fillRect(sx - 10, sy - 30, 20, 40);
    ctx.globalAlpha = 1;
    return;
  }
  let name = 'idle';
  if (z.dead) name = 'death';
  else if (z.hurtT > 0) name = 'hurt';
  else if (z.atkT > 0) name = 'attack';
  else if (z.moving) name = z.running ? 'run' : 'walk';
  const a = PLANT_ANIMS[name];
  let frame;
  if (name === 'death') frame = Math.min(a.frames - 1, Math.floor(z.deadT * a.fps));
  else if (name === 'attack') frame = Math.min(a.frames - 1, Math.floor((1 - z.atkT / st.atk) * a.frames));
  else if (name === 'hurt') frame = Math.min(a.frames - 1, Math.floor((1 - z.hurtT / 0.3) * a.frames));
  else frame = Math.floor(z.t * a.fps) % a.frames;

  ctx.drawImage(PSPR[z.plant][name], frame * PLANT_FRAME, z.dir * PLANT_FRAME, PLANT_FRAME, PLANT_FRAME,
    sx - PLANT_FRAME * S / 2, sy + 12 - PLANT_FOOT * S, PLANT_FRAME * S, PLANT_FRAME * S);
  ctx.globalAlpha = 1;

  if (!z.dead) { // thanh máu + số máu (giống zombie)
    const ratio = Math.max(0, z.hp) / z.maxHp;
    const w = 40, x = sx - w / 2, y = sy + 12 - (PLANT_FOOT - 14) * S - 12;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, w + 2, 7);
    ctx.fillStyle = '#7a1c1c';
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = hpColor(ratio);
    ctx.fillRect(x, y, w * ratio, 5);
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    shadowText(Math.ceil(Math.max(0, z.hp)) + '/' + z.maxHp, sx, y - 3, '#fff');
  }
}

// ======================================================================
// BOSS: Cá Sấu Đầm Lầy — nằm ở giữa mỗi khu đầm lầy lớn, 500 máu, chết rớt Rương Legendary
// Đòn: đập đuôi tạo sóng (quanh mình) · lao tới (vệt nước) · dưới 50% máu thì nổi giận, thêm mưa bùn
// ======================================================================
const BOSS = {
  name: 'Cá Sấu Đầm Lầy', hp: 650, scale: 1.5,
  walk: 34, run: 92, rageMul: 1.3,
  slamR: 112, slamDmg: 22, slamAtk: 0.95,
  lungeSpeed: 330, lungeDmg: 26, lungeWind: 0.6, lungeDur: 0.65,
  mudDmg: 12, respawn: 900,
};
PTYPES.boss = { name: BOSS.name, hp: BOSS.hp, scale: BOSS.scale }; // chỉ để mã chung (đẩy nhau) đọc được
const BOSS_FRAME_W = 200, BOSS_FRAME_H = 118, BOSS_ANCHOR_Y = 88; // khung cắt từ tờ sprite; chân boss ở hàng 88
const BOSS_ANIMS = { idle: 7, walk: 10, run: 10, attack: 12, hurt: 10, death: 8 };
const BSPR = {};
let bossSpritesReady = false;
const BOSS_CELL = 64, BOSS_MARGIN = 20;   // mỗi ô lưới 64×64 ô bản đồ có tối đa một boss
const bossSpotCache = new Map();
const bossPrimCache = new Map();
const bossDeaths = new Map();             // khoá -> giờ chơi lúc bị hạ
const bossSaved = new Map();              // khoá -> { hp, t } khi người chơi bỏ đi giữa trận
const bossMud = [];                       // cục bùn rơi từ trời (mưa bùn)
let bossMsgT = -99;

function loadBossSprites() {
  return Promise.all([
    ...Object.keys(BOSS_ANIMS).map((a) => loadImage('assets/boss/boss_' + a + '.webp').then((img) => { BSPR[a] = img; })),
    ...Object.keys(GOLEM_ANIMS).map((a) => loadImage('assets/boss/golem_' + a + '.webp').then((img) => { GSPR[a] = img; })),
    loadImage('assets/boss/golem_rock.webp').then((img) => { GSPR.rock = img; }),
  ]).then(() => {
    bossSpritesReady = Object.keys(BOSS_ANIMS).every((a) => BSPR[a]);
    golemSpritesReady = Object.keys(GOLEM_ANIMS).every((a) => GSPR[a]);
  });
}

// Tâm đầm lầy trong một ô lưới: điểm "sâu" nhất (nhiễu cao nhất) nằm gọn trong ô, rồi nhích tới ô bùn trống gần đó
function bossSpot(cx, cy) {
  const key = cx + ',' + cy;
  if (bossSpotCache.has(key)) return bossSpotCache.get(key);
  let res = bossSpotPrimary(cx, cy);
  if (!res) res = bossSpotExtra(cx, cy);
  bossSpotCache.set(key, res);
  return res;
}

// Boss phụ: ô lưới có nhiều đầm lầy nhưng nằm xa tâm đầm có boss chính (> 40 ô) thì có thêm một boss riêng
function bossSpotExtra(cx, cy) {
  const x0 = cx * BOSS_CELL, y0 = cy * BOSS_CELL;
  let n = 0;
  for (let y = y0; y < y0 + BOSS_CELL; y += 2) for (let x = x0; x < x0 + BOSS_CELL; x += 2) if (swampType(x, y) > 0) n++;
  if (n < 150) return null;
  let best = null, bn = -1;
  for (let y = y0 + 4; y < y0 + BOSS_CELL - 4; y += 3) {
    for (let x = x0 + 4; x < x0 + BOSS_CELL - 4; x += 3) {
      if (swampType(x, y) !== 1) continue;
      const q = swampNoise(x, y);
      if (q > bn) { bn = q; best = { x, y }; }
    }
  }
  if (!best) return null;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const sp = bossSpotPrimary(cx + i, cy + j);
    if (sp && Math.max(Math.abs(sp.tx - best.x), Math.abs(sp.ty - best.y)) < 40) return null;
  }
  for (let r = 0; r <= 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = best.x + dx, ty = best.y + dy;
        if (swampType(tx, ty) !== 1 || getTile(tx, ty) !== GRASS) continue;
        let ok = true;
        for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) if (isSolid(tx + i, ty + j)) { ok = false; break; }
        if (ok) return { key: cx + ',' + cy, tx, ty };
      }
    }
  }
  return null;
}

function bossSpotPrimary(cx, cy) {
  const key = cx + ',' + cy;
  if (bossPrimCache.has(key)) return bossPrimCache.get(key);
  const r = bossSpotPrimary0(cx, cy);
  bossPrimCache.set(key, r);
  return r;
}
function bossSpotPrimary0(cx, cy) {
  const key = cx + ',' + cy;
  let best = null, bn = -1;
  const x0 = cx * BOSS_CELL, y0 = cy * BOSS_CELL;
  for (let y = y0 - BOSS_MARGIN; y < y0 + BOSS_CELL + BOSS_MARGIN; y += 3) {
    for (let x = x0 - BOSS_MARGIN; x < x0 + BOSS_CELL + BOSS_MARGIN; x += 3) {
      if (swampType(x, y) === 0) continue;
      const n = swampNoise(x, y);
      if (n > bn) { bn = n; best = { x, y }; }
    }
  }
  let res = null;
  if (best && bn > SWAMP_T - 0.02 && best.x >= x0 && best.x < x0 + BOSS_CELL && best.y >= y0 && best.y < y0 + BOSS_CELL) {
    for (let r = 0; r <= 14 && !res; r++) {
      for (let dy = -r; dy <= r && !res; dy++) {
        for (let dx = -r; dx <= r && !res; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = best.x + dx, ty = best.y + dy;
          if (swampType(tx, ty) !== 1 || getTile(tx, ty) !== GRASS) continue;
          let ok = true;
          for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) if (isSolid(tx + i, ty + j)) { ok = false; break; }
          if (ok) res = { key, tx, ty };
        }
      }
    }
  }
  return res;
}

function createBoss(spot, hp) {
  const c = tileCenter(spot.tx, spot.ty);
  const z = {
    plant: 'boss', boss: true, type: 1, nest: 'boss:' + spot.key, bossKey: spot.key, x: c.x, y: c.y, hx: c.x, hy: c.y,
    hp: hp || BOSS.hp, maxHp: BOSS.hp, face: Math.random() < 0.5 ? 1 : -1, dir: 0, fx: 0, fy: 1,
    t: Math.random() * 5, aggro: false, atkCd: 1, atkT: 0, atkHit: false, hurtT: 0,
    dead: false, deadT: 0, noDrop: false, kx: 0, ky: 0, wanderT: 1 + Math.random() * 2, wx: c.x, wy: c.y,
    stuck: 0, sideT: 0, sideDir: 1, escal: 0, freeT: 0, moving: false, running: false, guard: null,
    windup: 0, lunge: null, lungeCd: 3, mudCd: 6, ring: null, flash: 0,
  };
  zombies.push(z);
  return z;
}

// Gọi từ updateSwamp: dựng boss khi người chơi tới gần tâm đầm lầy
function updateBossSpawn(px, py, R, jump, R0) {
  const cx0 = Math.floor((px - R) / BOSS_CELL), cx1 = Math.floor((px + R) / BOSS_CELL);
  const cy0 = Math.floor((py - R) / BOSS_CELL), cy1 = Math.floor((py + R) / BOSS_CELL);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const sp = bossSpot(cx, cy);
      if (!sp) continue;
      const cheb = Math.max(Math.abs(sp.tx - px), Math.abs(sp.ty - py));
      if (cheb > R || (!jump && cheb < R0 - 6)) continue;
      const died = bossDeaths.get(sp.key);
      if (died !== undefined && gameTime - died < BOSS.respawn) continue;
      if (zombies.some((z) => z.bossKey === sp.key)) continue;
      const sv = bossSaved.get(sp.key);
      bossSaved.delete(sp.key);
      createBoss(sp, sv ? Math.min(BOSS.hp, sv.hp + (gameTime - sv.t) * 1.5) : BOSS.hp);
    }
  }
}

function bossDespawn(z) { // người chơi đi xa: cất lại máu hiện tại
  bossSaved.set(z.bossKey, { hp: z.hp, t: gameTime });
}

function updateBoss(z, dt) {
  z.t += dt;
  const dxp = player.x - z.x, dyp = player.y - z.y;
  const dist = Math.hypot(dxp, dyp);
  const rage = z.hp < z.maxHp * 0.5;
  z.atkCd = Math.max(0, z.atkCd - dt);
  z.lungeCd = Math.max(0, z.lungeCd - dt);
  z.mudCd = Math.max(0, z.mudCd - dt);
  z.hurtT = Math.max(0, z.hurtT - dt);
  z.flash = Math.max(0, z.flash - dt);
  if (z.ring) { z.ring.t += dt; if (z.ring.t > 0.55) z.ring = null; }
  z.moving = false; z.running = false;

  if (Math.abs(z.kx) + Math.abs(z.ky) > 5) { // quá nặng nên chỉ bị đẩy rất nhẹ
    moveZombie(z, z.kx * dt, z.ky * dt);
    const f = Math.max(0, 1 - 12 * dt);
    z.kx *= f; z.ky *= f;
  }

  if (!deathScreen && dist < 460) {
    if (!z.aggro && gameTime - bossMsgT > 30) { bossMsgT = gameTime; say('Cá Sấu Đầm Lầy gầm lên! Boss 500 máu'); shake = Math.max(shake, 0.5); }
    z.aggro = true;
  } else if (deathScreen || dist > 950) z.aggro = false;
  if (z.aggro && Math.hypot(z.x - z.hx, z.y - z.hy) > 1500) z.aggro = false; // đuổi quá xa tâm đầm thì bỏ cuộc

  if (!z.aggro && z.hp < z.maxHp) z.hp = Math.min(z.maxHp, z.hp + 5 * dt);
  if (z.aggro && Math.abs(dxp) > 4) z.face = dxp < 0 ? -1 : 1;

  // Đang lao tới
  if (z.lunge) {
    const L = z.lunge;
    L.t -= dt;
    z.moving = true; z.running = true;
    moveZombie(z, L.vx * dt, L.vy * dt);
    if (Math.random() < dt * 40) burst(z.x - L.vx * 0.1, z.y + 6, '#9ad4cc', 2, 110, 300);
    if (!L.hit && dist < 78) { L.hit = true; hurt(BOSS.lungeDmg); shake = Math.max(shake, 0.6); }
    if (L.t <= 0) { z.lunge = null; z.lungeCd = rage ? 4 : 6.5; z.atkCd = 0.7; }
    return;
  }
  // Gồng người trước khi lao (có vệt đỏ báo hướng)
  if (z.windup > 0) {
    z.windup -= dt;
    z.moving = true; z.running = true; z.flash = 0.1;
    if (z.windup <= 0) {
      const dx = player.x - z.x, dy = player.y - z.y, d = Math.hypot(dx, dy) || 1;
      z.lunge = { t: BOSS.lungeDur, vx: dx / d * BOSS.lungeSpeed, vy: dy / d * BOSS.lungeSpeed, hit: false };
      if (Math.abs(dx) > 4) z.face = dx < 0 ? -1 : 1;
    }
    return;
  }
  // Đập đuôi: sóng nước đánh mọi thứ quanh mình
  if (z.atkT > 0) {
    z.atkT -= dt;
    if (!z.atkHit && z.atkT <= BOSS.slamAtk * 0.5) {
      z.atkHit = true; z.ring = { t: 0 }; shake = Math.max(shake, 0.5);
      burst(z.x, z.y + 6, '#bfe6ff', 16, 220, 400);
      if (Math.hypot(player.x - z.x, player.y - z.y) < BOSS.slamR) hurt(BOSS.slamDmg);
    }
    return;
  }
  if (z.hurtT > 0 && !z.aggro) return;

  if (z.aggro) {
    // Mưa bùn khi nổi giận
    if (rage && z.mudCd <= 0 && dist < 620) {
      z.mudCd = 9 + Math.random() * 3;
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 40 + Math.random() * 130;
        bossMud.push({ x: player.x + Math.cos(a) * r, y: player.y + Math.sin(a) * r, t: -(i * 0.18), fall: 1.0, done: false });
      }
      floaters.push({ x: z.x, y: z.y - 150, text: 'Mưa bùn!', life: 1.2, color: '#c9a56a' });
    }
    if (dist < BOSS.slamR - 10) {
      if (z.atkCd <= 0) { z.atkT = BOSS.slamAtk; z.atkHit = false; z.atkCd = rage ? 1.1 : 1.8; }
      return;
    }
    if (dist > 150 && dist < 430 && z.lungeCd <= 0 && lineClear(z.x, z.y, player.x, player.y)) {
      z.windup = BOSS.lungeWind; z.lungeCd = 99; return;
    }
    zombieWalk(z, player.x, player.y, BOSS.run * (rage ? BOSS.rageMul : 1), dt);
    z.running = true;
    return;
  }
  // Chưa thấy người chơi: lững thững quanh tâm đầm
  z.wanderT -= dt;
  if (z.wanderT <= 0) {
    z.wanderT = 3 + Math.random() * 4;
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 80;
    z.wx = z.hx + Math.cos(a) * d; z.wy = z.hy + Math.sin(a) * d;
    if (Math.random() < 0.5) { z.wx = z.x; z.wy = z.y; }
  }
  zombieWalk(z, z.wx, z.wy, BOSS.walk, dt);
}

function updateBossMud(dt) {
  for (let i = bossMud.length - 1; i >= 0; i--) {
    const m = bossMud[i];
    m.t += dt;
    if (!m.done && m.t >= m.fall) {
      m.done = true;
      burst(m.x, m.y - 6, '#7a5a34', 10, 160, 500);
      if (Math.hypot(player.x - m.x, player.y - m.y) < 38) hurt(BOSS.mudDmg);
    }
    if (m.t > m.fall + 0.35 || layer !== 0) bossMud.splice(i, 1);
  }
}

function drawBossMud(camX, camY) {
  for (const m of bossMud) {
    if (m.t < 0) continue;
    const sx = m.x - camX, sy = m.y - camY;
    if (!m.done) { // vòng cảnh báo + cục bùn rơi xuống
      const p = m.t / m.fall;
      ctx.fillStyle = 'rgba(160,60,40,' + (0.18 + 0.2 * p) + ')';
      ctx.beginPath(); ctx.ellipse(sx, sy, 38, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,80,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#6b4a28';
      ctx.beginPath(); ctx.arc(sx, sy - (1 - p) * 260 - 10, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8c6a3c'; ctx.fillRect(sx - 4, sy - (1 - p) * 260 - 16, 4, 4);
    } else {
      const q = (m.t - m.fall) / 0.35;
      ctx.fillStyle = 'rgba(107,74,40,' + (0.7 * (1 - q)) + ')';
      ctx.beginPath(); ctx.ellipse(sx, sy, 38 * (0.6 + q * 0.5), 17 * (0.6 + q * 0.5), 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

const BOSS_GEMS = [10, 16]; // số ngọc lục bảo boss rớt (tối thiểu, tối đa)
function killBoss(z) {
  if (z.final) { FinalBoss.kill(z); return; } // Hỗn Nguyên Long Vương, boss cuối (final-boss.js)
  if (z.volc) { VolcBoss.kill(z); return; } // Chúa Tể Dung Nham (volcano-boss.js)
  if (z.mine) { killGolem(z); return; }
  if (!z.noDrop) elderCount('boss');
  z.dead = true; z.deadT = 0; z.aggro = false; z.windup = 0; z.lunge = null; z.atkT = 0;
  bossDeaths.set(z.bossKey, gameTime);
  bossSaved.delete(z.bossKey);
  burst(z.x, z.y - 30, '#8bd04a', 30, 240);
  shake = Math.max(shake, 1);
  say('Đã hạ Cá Sấu Đầm Lầy!');
  if (z.noDrop) return;
  score += 100;
  if (!swordBonus) { // lần đầu hạ boss: kiếm sắt mạnh thêm
    swordBonus = BOSS_SWORD_BONUS;
    floaters.push({ x: z.x, y: z.y - 190, text: 'Kiếm sắt +' + BOSS_SWORD_BONUS + ' sát thương!', life: 3, color: '#9fd6ff' });
    say('Phần thưởng: Kiếm sắt +' + BOSS_SWORD_BONUS + ' sát thương!');
  }
  const gems = BOSS_GEMS[0] + Math.floor(Math.random() * (BOSS_GEMS[1] - BOSS_GEMS[0] + 1));
  for (let i = 0; i < gems; i++) spawnLoot('emerald', 1, z.x + (Math.random() - 0.5) * 60, z.y + (Math.random() - 0.5) * 30);
  burst(z.x, z.y - 40, '#3dde7c', 30, 240, 250);
  if (SHOW_ITEM_NOTICES) floaters.push({ x: z.x, y: z.y - 150, text: '+' + gems + ' ngọc lục bảo!', life: 2.5, color: '#3dde7c' });
  dropLegendChest(z);
}

// Rương legendary hiện ra ngay cạnh chỗ boss ngã
function dropLegendChest(z) {
  const cx = Math.floor(z.x / TILE), cy = Math.floor((z.y + 6) / TILE);
  let spot = null;
  // Ưu tiên ô phía trước (dưới) xác boss để rương không bị xác che; không có thì lấy ô trống gần nhất
  for (let pass = 0; pass < 2 && !spot; pass++) {
    for (let r = 2; r <= 7 && !spot; r++) {
      for (let dy = -r; dy <= r && !spot; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (pass === 0 && (dy < 2 || Math.abs(dx) > 2)) continue;
          const tx = cx + dx, ty = cy + dy;
          if (getTile(tx, ty) !== GRASS || isSolid(tx, ty) || chests.some((c) => c.tx === tx && c.ty === ty)) continue;
          spot = { tx, ty }; break;
        }
      }
    }
  }
  if (!spot) spot = { tx: cx, ty: cy };
  chests.push({ tx: spot.tx, ty: spot.ty, t: Math.random() * 6, rare: false, legend: true });
  const p = tileCenter(spot.tx, spot.ty);
  burst(p.x, p.y, '#ffb02e', 40, 260);
  floaters.push({ x: p.x, y: p.y - 60, text: 'Rương Legendary!', life: 2.5, color: '#ffb02e' });
  say('Boss rớt Rương Legendary!');
}

function drawBoss(z, camX, camY) {
  if (z.final) { FinalBoss.draw(z, camX, camY); return; } // Hỗn Nguyên Long Vương (final-boss.js)
  if (z.volc) { VolcBoss.draw(z, camX, camY); return; } // Chúa Tể Dung Nham (volcano-boss.js)
  if (z.mine) { drawGolem(z, camX, camY); return; }
  const sx = Math.round(z.x - camX), sy = Math.round(z.y - camY), S = BOSS.scale;
  const fade = z.dead ? Math.max(0, 1 - Math.max(0, z.deadT - 3.5) / 1.4) : 1;
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 12, z.dead ? 110 : 84, 16, 0, 0, Math.PI * 2); ctx.fill();

  // Vệt đỏ báo hướng lao tới
  if (z.windup > 0 && !z.dead) {
    const dx = player.x - z.x, dy = player.y - z.y, d = Math.hypot(dx, dy) || 1;
    ctx.save();
    ctx.translate(sx, sy + 8); ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = 'rgba(255,60,40,' + (0.18 + 0.25 * (1 - z.windup / BOSS.lungeWind)) + ')';
    ctx.fillRect(0, -20, BOSS.lungeSpeed * BOSS.lungeDur, 40);
    ctx.restore();
  }
  // Sóng nước của đòn đập đuôi
  if (z.ring) {
    const p = z.ring.t / 0.55;
    ctx.strokeStyle = 'rgba(200,235,255,' + (0.9 * (1 - p)) + ')'; ctx.lineWidth = 5 * (1 - p) + 1;
    ctx.beginPath(); ctx.ellipse(sx, sy + 10, BOSS.slamR * (0.35 + p * 0.65), BOSS.slamR * 0.42 * (0.35 + p * 0.65), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,190,230,' + (0.6 * (1 - p)) + ')'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(sx, sy + 10, BOSS.slamR * (0.2 + p * 0.55), BOSS.slamR * 0.42 * (0.2 + p * 0.55), 0, 0, Math.PI * 2); ctx.stroke();
  }

  if (!bossSpritesReady) {
    ctx.fillStyle = '#2f4a22'; ctx.fillRect(sx - 80, sy - 50, 160, 60); ctx.globalAlpha = 1; return;
  }
  let name = 'idle';
  if (z.dead) name = 'death';
  else if (z.atkT > 0) name = 'attack';
  else if (z.hurtT > 0 && !z.lunge && z.windup <= 0) name = 'hurt';
  else if (z.moving) name = z.running ? 'run' : 'walk';
  const n = BOSS_ANIMS[name];
  let frame;
  if (name === 'death') frame = Math.min(n - 1, Math.floor(z.deadT * 7));
  else if (name === 'attack') frame = Math.min(n - 1, Math.floor((1 - z.atkT / BOSS.slamAtk) * n));
  else if (name === 'hurt') frame = Math.min(n - 1, Math.floor((1 - z.hurtT / 0.25) * n));
  else frame = Math.floor(z.t * (name === 'run' ? 12 : name === 'walk' ? 9 : 6)) % n;

  const W = BOSS_FRAME_W * S, H = BOSS_FRAME_H * S;
  ctx.save();
  ctx.translate(sx, sy + 12);
  if (z.face < 0) ctx.scale(-1, 1); // sprite gốc quay sang phải
  if (z.windup > 0) ctx.translate((Math.random() - 0.5) * 4, 0); // run người khi gồng
  ctx.drawImage(BSPR[name], frame * BOSS_FRAME_W, 0, BOSS_FRAME_W, BOSS_FRAME_H, -W / 2, -BOSS_ANCHOR_Y * S, W, H);
  ctx.restore();
  ctx.globalAlpha = 1;

  if (!z.dead) { // thanh máu to + tên boss
    const ratio = Math.max(0, z.hp) / z.maxHp;
    const w = 130, x = sx - w / 2, y = sy + 12 - 76 * S - 18;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, 11);
    ctx.fillStyle = '#7a1c1c'; ctx.fillRect(x, y, w, 7);
    ctx.fillStyle = hpColor(ratio); ctx.fillRect(x, y, w * ratio, 7);
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    shadowText('☠ ' + BOSS.name + (z.hp < z.maxHp * 0.5 ? ' (nổi giận)' : ''), sx, y - 14, '#ffb4a0');
    ctx.font = 'bold 10px sans-serif';
    shadowText(Math.ceil(Math.max(0, z.hp)) + '/' + z.maxHp, sx, y - 3, '#fff');
  }
}

// ======================================================================
// BOSS HẦM MỎ: Quái Vật Hầm Mỏ — canh một sảnh tròn trong hầm (từ tầng sâu), 1000 máu, chết rớt Rương Legendary + kim cương
// Đòn: đập đất (quanh mình) · ném đá (nổi giận: 3 viên toả quạt) · nhảy đè (có vòng đỏ báo chỗ đáp, đáp xong bị choáng,
//      choáng thì chịu thêm 50% sát thương) · địa chấn (rung hầm, đá rơi từ trần quanh người chơi) · dưới 50% máu thì nổi giận
// ======================================================================
const GOLEM = {
  name: 'Quái Vật Hầm Mỏ', hp: 1000, scale: 2.7,
  hb: { rx: 80, up: 165, down: 14 },
  walk: 38, run: 100, rageMul: 1.3,
  slamR: 135, slamDmg: 24, slamTime: 0.95,
  throwDmg: 15, throwSpeed: 340, throwTime: 0.95,
  leapDmg: 28, leapR: 110, leapWind: 0.65, leapAir: 0.75, stun: 1.5,
  quakeDmg: 14, quakeNearDmg: 12, quakeWind: 1.15, quakeRec: 0.7,
  respawn: 900,
};
const GOLEM_FRAME_W = 160, GOLEM_FRAME_H = 112, GOLEM_GROUND = 98; // khung cắt từ tờ sprite; chân boss ở hàng 98
const GOLEM_ANIMS = { idle: 3, walk: 3, run: 3, jump: 4, fall: 3, slam: 3, throw: 3, quake: 2, hurt: 2, death: 4 };
const GSPR = {};
let golemSpritesReady = false;
const GOLEM_CELL = 64;          // mỗi ô lưới 64×64 ô của hầm có tối đa một hang boss
const GOLEM_LAIR_CHANCE = 0.75, GOLEM_MIN_DIST = 40; // cách điểm xuất phát ≥ 40 ô (tầng sâu trở đi)
const golemLairCache = new Map();
const golemHinted = new Set();  // hang đã báo hướng cho người chơi
const golemFx = [];             // hiệu ứng: đá rơi báo trước { k:'stone' } và vòng sóng { k:'ring' }
const golemRocks = [];          // đá boss ném

// Hang boss của một ô lưới: tâm nằm cách mép ô ≥ 12 ô nên sảnh bán kính 7 luôn nằm gọn trong ô. Ô (0,0) luôn có hang ở (40, 24).
const GOLEM_LAIRS = false; // false: boss KHÔNG sinh trong hầm mỏ nữa, chỉ đánh được ở đấu trường sau Cổng Ma Vương (boss-gate.js)
function mineLair(cx, cy) {
  if (!GOLEM_LAIRS) return null;
  const key = cx + ',' + cy;
  if (golemLairCache.has(key)) return golemLairCache.get(key);
  let res = null;
  if (cx === 0 && cy === 0) res = { key: 'g0,0', tx: 40, ty: 24 };
  else if (hash(cx * 31 + 7, cy * 17 - 3) < GOLEM_LAIR_CHANCE) {
    const tx = cx * GOLEM_CELL + 12 + Math.floor(hash(cx * 5 + 1, cy * 3 + 2) * 40);
    const ty = cy * GOLEM_CELL + 12 + Math.floor(hash(cx * 9 - 4, cy * 11 + 6) * 40);
    if (Math.hypot(tx, ty) >= GOLEM_MIN_DIST) res = { key: 'g' + cx + ',' + cy, tx, ty };
  }
  golemLairCache.set(key, res);
  return res;
}
// 0 = không thuộc hang · 1 = sàn trống · 2 = cột đá (4 cột ở các góc chéo, để nấp đá ném)
function inGolemLair(x, y) {
  const L = mineLair(Math.floor(x / GOLEM_CELL), Math.floor(y / GOLEM_CELL));
  if (!L) return 0;
  const dx = x - L.tx, dy = y - L.ty;
  if (dx * dx + dy * dy > 49) return 0;
  return Math.abs(dx) === 4 && Math.abs(dy) === 4 ? 2 : 1;
}

function createGolem(L, hp) {
  const c = tileCenter(L.tx, L.ty);
  const z = {
    plant: 'boss', boss: true, mine: true, type: 1, nest: 'boss:' + L.key, bossKey: L.key, x: c.x, y: c.y, hx: c.x, hy: c.y,
    hp: hp || GOLEM.hp, maxHp: GOLEM.hp, face: Math.random() < 0.5 ? 1 : -1, dir: 0, fx: 0, fy: 1,
    t: Math.random() * 5, aggro: false, atkCd: 1, atkT: 0, atkHit: false, hurtT: 0,
    dead: false, deadT: 0, noDrop: false, kx: 0, ky: 0, wanderT: 1 + Math.random() * 2, wx: c.x, wy: c.y,
    stuck: 0, sideT: 0, sideDir: 1, escal: 0, freeT: 0, moving: false, running: false, guard: null,
    act: null, jz: 0, flash: 0, throwCd: 2.5, leapCd: 6, quakeCd: 9, hb: GOLEM.hb,
  };
  zombies.push(z);
  return z;
}

// Dựng boss khi người chơi tới gần hang (cách ≤ 20 ô); báo hướng khi còn cách ≤ 45 ô
let golemScanT = 0;
function updateGolemSpawn(dt) {
  golemScanT -= dt;
  if (golemScanT > 0 || deathScreen) return;
  golemScanT = 0.5;
  const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE), R = 46;
  for (let cy = Math.floor((py - R) / GOLEM_CELL); cy <= Math.floor((py + R) / GOLEM_CELL); cy++) {
    for (let cx = Math.floor((px - R) / GOLEM_CELL); cx <= Math.floor((px + R) / GOLEM_CELL); cx++) {
      const L = mineLair(cx, cy);
      if (!L) continue;
      const cheb = Math.max(Math.abs(L.tx - px), Math.abs(L.ty - py));
      const died = bossDeaths.get(L.key);
      const alive = died === undefined || gameTime - died >= GOLEM.respawn;
      if (alive && cheb <= 45 && !golemHinted.has(L.key)) {
        golemHinted.add(L.key);
        const dirs = ['Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc', 'Bắc', 'Đông Bắc'];
        const dir = dirs[(Math.round(Math.atan2(L.ty - py, L.tx - px) / (Math.PI / 4)) + 8) % 8];
        say('Tiếng gầm vang từ phía ' + dir + ' (~' + Math.round(Math.hypot(L.tx - px, L.ty - py)) + ' ô): hang Quái Vật Hầm Mỏ, boss ' + GOLEM.hp + ' máu!');
        shake = Math.max(shake, 0.3);
      }
      if (!alive || cheb > 20) continue;
      if (zombies.some((z) => z.bossKey === L.key)) continue;
      const sv = bossSaved.get(L.key);
      bossSaved.delete(L.key);
      createGolem(L, sv ? Math.min(GOLEM.hp, sv.hp + (gameTime - sv.t) * 1.5) : GOLEM.hp);
    }
  }
}

function golemShock(x, y, R, dur) { golemFx.push({ k: 'ring', x, y, R, t: 0, dur }); }

function golemThrow(z, rage) {
  const hx = z.x + z.face * 70, hy = z.y;
  const base = Math.atan2(player.y - hy, player.x - hx);
  const n = rage ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * 0.3;
    golemRocks.push({ x: hx, y: hy, vx: Math.cos(a) * GOLEM.throwSpeed, vy: Math.sin(a) * GOLEM.throwSpeed, life: 2.2, spin: 0 });
  }
  burst(hx, hy - 60, '#a89a8c', 6, 120);
}

function golemQuake(z, rage) {
  shake = Math.max(shake, 1);
  golemShock(z.x, z.y, 320, 0.8);
  burst(z.x, z.y + 6, '#e9a03a', 30, 260, 400);
  if (Math.hypot(player.x - z.x, player.y - z.y) < 150) hurt(GOLEM.quakeNearDmg); // đứng sát boss thì bị sóng chấn hất trúng
  const n = rage ? 12 : 7;
  for (let i = 0; i < n; i++) {
    let x = player.x, y = player.y;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 40 + Math.random() * 170;
      x = player.x + Math.cos(a) * r; y = player.y + Math.sin(a) * r;
      if (!isSolid(Math.floor(x / TILE), Math.floor(y / TILE))) break;
    }
    golemFx.push({ k: 'stone', x, y, t: -(0.1 + i * 0.14), fall: 0.85, done: false });
  }
  floaters.push({ x: z.x, y: z.y - 200, text: 'Địa chấn!', life: 1.4, color: '#ffb347' });
}

function updateGolem(z, dt) {
  z.t += dt;
  const dxp = player.x - z.x, dyp = player.y - z.y;
  const dist = Math.hypot(dxp, dyp);
  const rage = z.hp < z.maxHp * 0.5;
  z.atkCd = Math.max(0, z.atkCd - dt);
  z.throwCd = Math.max(0, z.throwCd - dt);
  z.leapCd = Math.max(0, z.leapCd - dt);
  z.quakeCd = Math.max(0, z.quakeCd - dt);
  z.hurtT = Math.max(0, z.hurtT - dt);
  z.flash = Math.max(0, z.flash - dt);
  z.moving = false; z.running = false;

  if (Math.abs(z.kx) + Math.abs(z.ky) > 5) { // quá nặng nên chỉ bị đẩy rất nhẹ
    moveZombie(z, z.kx * dt, z.ky * dt);
    const f = Math.max(0, 1 - 12 * dt);
    z.kx *= f; z.ky *= f;
  }

  // Thức giấc khi người chơi vào tầm mắt; đã đánh nhau thì đuổi tới khi người chơi chạy quá xa
  if (!deathScreen && dist < 480 && (z.aggro || lineClear(z.x, z.y - 10, player.x, player.y))) {
    if (!z.aggro && gameTime - bossMsgT > 30) { bossMsgT = gameTime; say('Quái Vật Hầm Mỏ thức giấc! Boss ' + GOLEM.hp + ' máu'); shake = Math.max(shake, 0.5); }
    z.aggro = true;
  } else if (deathScreen || dist > 950) z.aggro = false;
  if (z.aggro && Math.hypot(z.x - z.hx, z.y - z.hy) > 1500) z.aggro = false;
  if (!z.aggro && z.hp < z.maxHp) z.hp = Math.min(z.maxHp, z.hp + 5 * dt);
  if (z.aggro && !z.act && Math.abs(dxp) > 4) z.face = dxp < 0 ? -1 : 1;

  const A = z.act;
  if (A) {
    A.t += dt;
    if (A.n === 'slam') {
      if (!A.hit && A.t >= GOLEM.slamTime * 0.55) {
        A.hit = true; shake = Math.max(shake, 0.6);
        golemShock(z.x, z.y, GOLEM.slamR, 0.4);
        burst(z.x, z.y + 6, '#b8a58c', 18, 230, 450);
        if (Math.hypot(player.x - z.x, player.y - z.y) < GOLEM.slamR) hurt(GOLEM.slamDmg);
      }
      if (A.t >= GOLEM.slamTime) { z.act = null; z.atkCd = rage ? 0.9 : 1.5; }
    } else if (A.n === 'throw') {
      if (!A.hit && A.t >= GOLEM.throwTime * 0.6) { A.hit = true; golemThrow(z, rage); }
      if (A.t >= GOLEM.throwTime) { z.act = null; z.atkCd = 0.7; }
    } else if (A.n === 'leap') {
      if (A.ph === 0) { // gồng người, vòng đỏ bám theo người chơi
        z.flash = 0.1;
        if (A.t >= GOLEM.leapWind) { // chốt chỗ đáp rồi bật lên
          A.ph = 1; A.t = 0; A.sx = z.x; A.sy = z.y; A.tx = player.x; A.ty = player.y;
          if (Math.abs(A.tx - z.x) > 4) z.face = A.tx < z.x ? -1 : 1;
        }
      } else if (A.ph === 1) { // đang bay
        const p = Math.min(1, A.t / GOLEM.leapAir);
        moveZombie(z, A.sx + (A.tx - A.sx) * p - z.x, A.sy + (A.ty - A.sy) * p - z.y);
        z.jz = Math.sin(p * Math.PI) * 120;
        if (p >= 1) { // đáp xuống
          z.jz = 0; A.ph = 2; A.t = 0;
          shake = Math.max(shake, 0.9);
          golemShock(z.x, z.y, GOLEM.leapR * 1.3, 0.5);
          burst(z.x, z.y + 6, '#b8a58c', 24, 260, 450);
          if (Math.hypot(player.x - z.x, player.y - z.y) < GOLEM.leapR) hurt(GOLEM.leapDmg);
        }
      } else if (A.t >= 0.3) z.act = { n: 'stun', t: 0, dur: rage ? GOLEM.stun * 0.65 : GOLEM.stun }; // đáp xong loạng choạng ngã ra
    } else if (A.n === 'stun') {
      if (A.t >= A.dur) { z.act = null; z.atkCd = 0.5; }
    } else if (A.n === 'quake') {
      if (!A.hit && A.t >= GOLEM.quakeWind) { A.hit = true; golemQuake(z, rage); }
      if (A.t >= GOLEM.quakeWind + GOLEM.quakeRec) { z.act = null; z.atkCd = 1; }
    }
    return;
  }
  if (z.hurtT > 0 && !z.aggro) return;

  if (z.aggro) {
    const close = dist < GOLEM.slamR - 10;
    if (z.atkCd <= 0) {
      if (z.quakeCd <= 0 && dist < 520 && (!close || Math.random() < 0.5)) {
        z.act = { n: 'quake', t: 0, hit: false }; z.quakeCd = rage ? 11 : 16; return;
      }
      if (close) { z.act = { n: 'slam', t: 0, hit: false }; return; }
      if (z.throwCd <= 0 && dist > 170 && dist < 580 && lineClear(z.x, z.y - 10, player.x, player.y)) {
        z.act = { n: 'throw', t: 0, hit: false }; z.throwCd = rage ? 3.5 : 5.5; return;
      }
      if (z.leapCd <= 0 && dist > 200 && dist < 480 && lineClear(z.x, z.y - 10, player.x, player.y)) {
        z.act = { n: 'leap', t: 0, ph: 0 }; z.leapCd = rage ? 6.5 : 10; return;
      }
    }
    if (close) return;
    zombieWalk(z, player.x, player.y, GOLEM.run * (rage ? GOLEM.rageMul : 1), dt);
    z.running = true;
    return;
  }
  // Chưa thấy người chơi: lững thững quanh tâm hang
  z.wanderT -= dt;
  if (z.wanderT <= 0) {
    z.wanderT = 3 + Math.random() * 4;
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 90;
    z.wx = z.hx + Math.cos(a) * d; z.wy = z.hy + Math.sin(a) * d;
    if (Math.random() < 0.5) { z.wx = z.x; z.wy = z.y; }
  }
  zombieWalk(z, z.wx, z.wy, GOLEM.walk, dt);
}

function updateGolemFx(dt) {
  for (let i = golemRocks.length - 1; i >= 0; i--) {
    const r = golemRocks[i];
    r.x += r.vx * dt; r.y += r.vy * dt; r.life -= dt; r.spin += dt * 10;
    let dead = r.life <= 0 || isSolid(Math.floor(r.x / TILE), Math.floor(r.y / TILE));
    if (!dead && Math.hypot(r.x - player.x, r.y - player.y) < 26) { hurt(GOLEM.throwDmg); dead = true; }
    if (dead) { burst(r.x, r.y - 30, '#9a8e84', 8, 130); golemRocks.splice(i, 1); }
  }
  for (let i = golemFx.length - 1; i >= 0; i--) {
    const f = golemFx[i];
    f.t += dt;
    if (f.k === 'stone') {
      if (!f.done && f.t >= f.fall) {
        f.done = true; shake = Math.max(shake, 0.25);
        burst(f.x, f.y - 6, '#9a8a7a', 10, 170, 500);
        if (Math.hypot(player.x - f.x, player.y - f.y) < 40) hurt(GOLEM.quakeDmg);
      }
      if (f.t > f.fall + 0.4) golemFx.splice(i, 1);
    } else if (f.t > f.dur) golemFx.splice(i, 1);
  }
}

function drawGolemFx(camX, camY) {
  if (layer !== 1 && layer !== 3) return;
  for (const f of golemFx) {
    const sx = f.x - camX, sy = f.y - camY;
    if (f.k === 'ring') {
      const p = f.t / f.dur, R = f.R * (0.2 + p * 0.8);
      ctx.strokeStyle = 'rgba(255,190,90,' + (0.85 * (1 - p)) + ')'; ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(sx, sy + 10, R, R * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,80,50,' + (0.6 * (1 - p)) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, sy + 10, R * 0.7, R * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (f.t >= 0) { // đá rơi: vòng đỏ báo trước + viên đá từ trên trần xuống
      if (!f.done) {
        const p = f.t / f.fall, h = (1 - p) * 300;
        ctx.fillStyle = 'rgba(200,70,40,' + (0.18 + 0.22 * p) + ')';
        ctx.beginPath(); ctx.ellipse(sx, sy, 38, 17, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,120,80,0.65)'; ctx.lineWidth = 2; ctx.stroke();
        drawGolemRock(sx, sy - h - 16, 1.4, f.t * 6);
      } else {
        const q = (f.t - f.fall) / 0.4;
        ctx.fillStyle = 'rgba(120,100,84,' + (0.7 * (1 - q)) + ')';
        ctx.beginPath(); ctx.ellipse(sx, sy, 38 * (0.6 + q * 0.5), 17 * (0.6 + q * 0.5), 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  for (const r of golemRocks) {
    const sx = r.x - camX, sy = r.y - camY;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 4, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    drawGolemRock(sx, sy - 44, 1.7, r.spin);
  }
}

function drawGolemRock(sx, sy, s, spin) {
  const img = GSPR.rock;
  ctx.save();
  ctx.translate(Math.round(sx), Math.round(sy));
  ctx.rotate(spin);
  if (img) {
    const w = img.width * s, h = img.height * s, sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.imageSmoothingEnabled = sm;
  } else { ctx.fillStyle = '#7d7468'; ctx.fillRect(-12, -12, 24, 24); }
  ctx.restore();
}

function killGolem(z) {
  if (!z.noDrop) elderCount('boss');
  z.dead = true; z.deadT = 0; z.aggro = false; z.act = null; z.jz = 0;
  bossDeaths.set(z.bossKey, gameTime);
  bossSaved.delete(z.bossKey);
  golemFx.length = 0; golemRocks.length = 0;
  burst(z.x, z.y - 40, '#f2b632', 30, 240);
  shake = Math.max(shake, 1);
  say('Đã hạ Quái Vật Hầm Mỏ!');
  if (z.noDrop) return;
  score += 120;
  if (!swordBonus) { // lần đầu hạ boss (bất kỳ boss nào): kiếm sắt mạnh thêm
    swordBonus = BOSS_SWORD_BONUS;
    floaters.push({ x: z.x, y: z.y - 230, text: 'Kiếm sắt +' + BOSS_SWORD_BONUS + ' sát thương!', life: 3, color: '#9fd6ff' });
    say('Phần thưởng: Kiếm sắt +' + BOSS_SWORD_BONUS + ' sát thương!');
  }
  const gems = 12 + Math.floor(Math.random() * 7), dia = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < gems; i++) spawnLoot('emerald', 1, z.x + (Math.random() - 0.5) * 80, z.y + (Math.random() - 0.5) * 40);
  for (let i = 0; i < dia; i++) spawnLoot('diamond', 1, z.x + (Math.random() - 0.5) * 80, z.y + (Math.random() - 0.5) * 40);
  burst(z.x, z.y - 40, '#3dde7c', 30, 240, 250);
  if (layer === 3) { // boss Ma Vương ở đấu trường Cổng Ma Vương: rớt Giấy Đất (học Thác Đá), nhặt lên mang đi
    spawnLoot('earthscroll', 1, z.x, z.y + 30);
    say('Ma Vương đánh rơi Giấy Đất! Hãy nhặt và mang cho Phù Thủy');
  }
  dropLegendChest(z);
}

function drawGolem(z, camX, camY) {
  const sx = Math.round(z.x - camX), sy = Math.round(z.y - camY), S = GOLEM.scale;
  const rage = z.hp < z.maxHp * 0.5, A = z.act, jz = z.jz || 0;
  const fade = z.dead ? Math.max(0, 1 - Math.max(0, z.deadT - 3.5) / 1.4) : 1;
  ctx.globalAlpha = fade;
  const sh = Math.max(0.5, 1 - jz / 260);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 12, (z.dead ? 110 : 84) * sh, 16 * sh, 0, 0, Math.PI * 2); ctx.fill();
  if (rage && !z.dead) { // nổi giận: quầng lửa dưới chân
    ctx.fillStyle = 'rgba(255,110,40,' + (0.14 + 0.07 * Math.sin(z.t * 7)) + ')';
    ctx.beginPath(); ctx.ellipse(sx, sy + 12, 104, 22, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Báo hiệu đòn đánh
  if (A && !z.dead) {
    ctx.save();
    if (A.n === 'slam' && !A.hit) {
      ctx.fillStyle = 'rgba(255,60,40,' + (0.1 + 0.22 * (A.t / GOLEM.slamTime)) + ')';
      ctx.beginPath(); ctx.ellipse(sx, sy + 10, GOLEM.slamR, GOLEM.slamR * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    } else if (A.n === 'leap' && A.ph < 2) {
      const tx = (A.ph === 0 ? player.x : A.tx) - camX, ty = (A.ph === 0 ? player.y : A.ty) - camY;
      const k = A.ph === 0 ? A.t / GOLEM.leapWind : 1;
      ctx.fillStyle = 'rgba(255,60,40,' + (0.14 + 0.22 * k) + ')';
      ctx.beginPath(); ctx.ellipse(tx, ty + 10, GOLEM.leapR, GOLEM.leapR * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,80,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    } else if (A.n === 'quake' && !A.hit) {
      const p = A.t / GOLEM.quakeWind;
      ctx.strokeStyle = 'rgba(255,170,70,' + (0.35 + 0.4 * p) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, sy + 10, 70 + 90 * p, (70 + 90 * p) * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.translate((Math.random() - 0.5) * 3, 0);
    } else if (A.n === 'throw' && !A.hit) {
      ctx.strokeStyle = 'rgba(255,80,60,' + (0.15 + 0.25 * (A.t / (GOLEM.throwTime * 0.6))) + ')'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(sx + z.face * 70, sy - 20); ctx.lineTo(player.x - camX, player.y - camY - 20); ctx.stroke();
    }
    ctx.restore();
  }

  if (!golemSpritesReady) {
    ctx.fillStyle = '#5a4a6a'; ctx.fillRect(sx - 70, sy - 150, 140, 160); ctx.globalAlpha = 1; return;
  }
  let name = 'idle', frame = 0;
  if (z.dead) { name = 'death'; frame = Math.min(3, Math.floor(z.deadT * 2.5)); }
  else if (A) {
    if (A.n === 'slam') { name = 'slam'; frame = Math.min(2, Math.floor(A.t / GOLEM.slamTime * 3)); }
    else if (A.n === 'throw') { name = 'throw'; frame = A.t < GOLEM.throwTime * 0.3 ? 0 : A.t < GOLEM.throwTime * 0.6 ? 1 : 2; }
    else if (A.n === 'leap') { name = 'jump'; frame = A.ph === 0 ? 0 : A.ph === 1 ? (A.t / GOLEM.leapAir < 0.5 ? 1 : 2) : 3; }
    else if (A.n === 'stun') { name = 'fall'; const p = A.t / A.dur; frame = p < 0.2 ? 0 : p < 0.8 ? 1 : 2; }
    else if (A.n === 'quake') { name = 'quake'; frame = A.hit ? 1 : 0; }
  } else if (z.hurtT > 0) { name = 'hurt'; frame = z.hurtT > 0.12 ? 0 : 1; }
  else if (z.moving) { name = z.running ? 'run' : 'walk'; frame = Math.floor(z.t * (z.running ? 9 : 6)) % 3; }
  else frame = Math.floor(z.t * 3.5) % 3;

  const W = GOLEM_FRAME_W * S, H = GOLEM_FRAME_H * S;
  const sm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(sx, sy + 12 - jz);
  if (z.face < 0) ctx.scale(-1, 1); // sprite gốc quay sang phải
  if (A && A.n === 'leap' && A.ph === 0) ctx.translate((Math.random() - 0.5) * 4, 0); // run người khi gồng
  ctx.drawImage(GSPR[name], frame * GOLEM_FRAME_W, 0, GOLEM_FRAME_W, GOLEM_FRAME_H, -W / 2, -GOLEM_GROUND * S, W, H);
  ctx.restore();
  ctx.imageSmoothingEnabled = sm;
  ctx.globalAlpha = 1;

  if (!z.dead) { // thanh máu + tên boss trên đầu
    const ratio = Math.max(0, z.hp) / z.maxHp;
    const w = 130, x = sx - w / 2, y = sy + 12 - jz - 70 * S - 24;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, 11);
    ctx.fillStyle = '#7a1c1c'; ctx.fillRect(x, y, w, 7);
    ctx.fillStyle = hpColor(ratio); ctx.fillRect(x, y, w * ratio, 7);
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    shadowText('☠ ' + GOLEM.name + (rage ? ' (nổi giận)' : '') + (A && A.n === 'stun' ? ' · CHOÁNG' : ''), sx, y - 14, A && A.n === 'stun' ? '#ffe07a' : '#ffb4a0');
    ctx.font = 'bold 10px sans-serif';
    shadowText(Math.ceil(Math.max(0, z.hp)) + '/' + z.maxHp, sx, y - 3, '#fff');
  }
}

// ---------- Thùng đồ ăn (Supplies.webp) trong chợ ----------
const SUPPLY_BIG = [[2, 6, 26, 35], [34, 0, 25, 41], [66, 7, 25, 34], [101, 9, 22, 32], [132, 12, 23, 29], [165, 11, 22, 30], [199, 14, 19, 27], [231, 15, 19, 26], [263, 14, 19, 27]];
const SUPPLY_SMALL = [[6, 63, 20, 26], [39, 63, 19, 26], [71, 63, 19, 26], [103, 62, 19, 27], [128, 66, 16, 22], [160, 66, 16, 22], [192, 66, 16, 22], [224, 66, 16, 22], [256, 66, 16, 22]];
const SUPPLY_PILES = [[4, 98, 108, 68], [123, 107, 48, 53], [188, 102, 47, 38], [120, 173, 47, 31]];

function drawSupply(rect, cx, baseY, scale) {
  const w = rect[2] * scale, h = rect[3] * scale;
  ctx.drawImage(NATURE.supplies, rect[0], rect[1], rect[2], rect[3], Math.round(cx - w / 2), Math.round(baseY - h), Math.round(w), Math.round(h));
}

// Hai thùng chồng lên nhau ở khe giữa hai sạp
function drawMarketCrates(o, bx, by, w) {
  if (!NATURE.supplies) return;
  const cx = bx + w / 2;
  mkOval(cx, by - 5, 26, 7, 'rgba(0,0,0,0.22)');
  drawSupply(SUPPLY_BIG[o.c % SUPPLY_BIG.length], cx, by - 3, 1.7);
  if (o.stack === 2) drawSupply(SUPPLY_SMALL[o.c2 % SUPPLY_SMALL.length], cx + 1, by - 3 - 38, 1.5);
}

// Đống thùng ở rìa chợ
function drawMarketPile(o, bx, by, w) {
  if (!NATURE.supplies) return;
  const r = SUPPLY_PILES[o.p % SUPPLY_PILES.length];
  const sc = o.p === 0 ? 0.9 : 1.6;
  mkOval(bx + w / 2, by - 5, r[2] * sc / 2 + 4, 8, 'rgba(0,0,0,0.2)');
  drawSupply(r, bx + w / 2, by - 2, sc);
}

// Thùng bày trên mặt bàn của sạp: list = [['b'|'s', chỉ số], ...]
function stallCrates(xs, gy, list) {
  list.forEach(([kind, i], n) => {
    const r = kind === 'b' ? SUPPLY_BIG[i] : SUPPLY_SMALL[i];
    drawSupply(r, xs[n], gy - 1, 1.5);
  });
}

// ---------- Lò nung ----------
const SMELT_TIME = BALANCE.craft.smeltTime;                                // giây để nung xong 1 món
const SMELT = { ironore: 'iron', goldore: 'gold', apple: 'baked', flesh: 'cookedflesh', rawbeef: 'beef', rawpork: 'pork', rawchicken: 'chicken', fish: 'grilledfish' }; // nguyên liệu -> thành phẩm
const FUEL = { coal: 80, cblock: 800, wood: 8, stick: 3 };        // giây cháy của mỗi món nhiên liệu
const FURNACE_INPUTS = ['ironore', 'goldore', 'apple', 'flesh', 'rawbeef', 'rawpork', 'rawchicken', 'fish'];
const FURNACE_FUELS = ['coal', 'cblock', 'wood', 'stick'];
let furnaces = new Map(); // key "tx,ty" -> trạng thái của từng lò
let storages = new Map();   // key "tx,ty" -> { slots: [...] } nội dung từng rương gỗ
let furnaceKey = null;      // lò đang mở trong giao diện

function furnaceAt(key) {
  if (!furnaces.has(key)) {
    furnaces.set(key, { inId: null, inN: 0, fuelId: null, fuelN: 0, outId: null, outN: 0, burn: 0, burnMax: 1, prog: 0 });
  }
  return furnaces.get(key);
}

// Lò vẫn nung khi người chơi đi chỗ khác
function updateFurnaces(dt) {
  for (const f of furnaces.values()) {
    if (f.burn <= 0 && f.inN > 0 && f.fuelN > 0 && (!f.outId || f.outId === SMELT[f.inId])) {
      f.fuelN--;
      f.burn = f.burnMax = FUEL[f.fuelId];
      if (f.fuelN === 0) f.fuelId = null;
    }
    if (f.burn > 0) {
      f.burn -= dt;
      if (f.inN > 0 && (!f.outId || f.outId === SMELT[f.inId])) {
        f.prog += dt;
        if (f.prog >= SMELT_TIME) {
          f.prog = 0;
          f.outId = SMELT[f.inId];
          f.outN++;
          f.inN--;
          if (f.inN === 0) f.inId = null;
        }
      } else {
        f.prog = 0;
      }
    } else {
      f.prog = Math.max(0, f.prog - dt * 2);
    }
  }
}

function nearestFurnace(maxDist) {
  let best = null, bd = maxDist;
  for (const f of findTiles(FURNACE, 3)) {
    const p = tileCenter(f.tx, f.ty);
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function openFurnace(f = nearestFurnace(110)) {
  if (!f) return false;
  furnaceKey = f.tx + ',' + f.ty;
  furnaceAt(furnaceKey);
  ui = 'furnace';
  return true;
}

// Cho nguyên liệu vào lò (Shift: cho hết)
function furnaceAdd(id) {
  if (inv[id] <= 0) return;
  const f = furnaceAt(furnaceKey);
  const all = keys['ShiftLeft'] || keys['ShiftRight'];
  if (FURNACE_INPUTS.includes(id)) {
    if (f.inId && f.inId !== id) { say('Lò đang nung món khác'); return; }
    const n = all ? inv[id] : 1;
    f.inId = id; f.inN += n; inv[id] -= n;
  } else if (FURNACE_FUELS.includes(id)) {
    if (f.fuelId && f.fuelId !== id) { say('Lò đang dùng nhiên liệu khác'); return; }
    const n = all ? inv[id] : 1;
    f.fuelId = id; f.fuelN += n; inv[id] -= n;
  }
}

function furnaceTake(slot) {
  const f = furnaceAt(furnaceKey);
  if (slot === 'in' && f.inN > 0) { inv[f.inId] += f.inN; f.inN = 0; f.inId = null; f.prog = 0; }
  else if (slot === 'fuel' && f.fuelN > 0) { inv[f.fuelId] += f.fuelN; f.fuelN = 0; f.fuelId = null; }
  else if (slot === 'out' && f.outN > 0) {
    inv[f.outId] += f.outN;
    if (SHOW_ITEM_NOTICES) floaters.push({ x: player.x, y: player.y - 50, text: '+' + f.outN + ' ' + ITEMS[f.outId].name.toLowerCase(), life: 1.2 });
    f.outN = 0; f.outId = null;
  }
}

// Phá lò: trả lại mọi thứ bên trong
function dropFurnaceContents(key) {
  const f = furnaces.get(key);
  if (!f) return;
  if (f.inN) inv[f.inId] += f.inN;
  if (f.fuelN) inv[f.fuelId] += f.fuelN;
  if (f.outN) inv[f.outId] += f.outN;
  furnaces.delete(key);
  if (ui === 'furnace' && furnaceKey === key) closeUi();
}

function placeFurnace() {
  if (inv.furnace <= 0) { say('Bạn không có lò nung'); return; }
  const { tx, ty } = facingTile();
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) {
    say('Không đặt được ở đây');
    return;
  }
  if (tileOverlapsPlayer(tx, ty)) {
    say('Lùi ra một chút rồi đặt nhé (đang đứng sát ô này)');
    return;
  }
  changes.set(tx + ',' + ty, FURNACE);
  inv.furnace--;
  say('Đã đặt lò nung');
}

function placeStation(id, tile, name) {
  if (!(inv[id] > 0)) { say('Bạn không có ' + name); return; }
  const { tx, ty } = facingTile();
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) { say('Không đặt được ở đây'); return; }
  if (tileOverlapsPlayer(tx, ty)) { say('Lùi ra một chút rồi đặt nhé (đang đứng sát ô này)'); return; }
  changes.set(tx + ',' + ty, tile);
  inv[id]--;
  say('Đã đặt ' + name);
}

// Radio: đặt xuống đất như bàn / lò. Nhấn E vào radio để dán link nhạc (radio.js). Âm lượng nghe được phụ thuộc khoảng cách.
function placeRadio() {
  if (!(inv.radio > 0)) { say('Bạn không có radio (mua ở Tạp hoá, 100 ngọc)'); return; }
  const { tx, ty } = facingTile();
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) { say('Không đặt được ở đây'); return; }
  if (tileOverlapsPlayer(tx, ty)) { say('Lùi ra một chút rồi đặt nhé (đang đứng sát ô này)'); return; }
  changes.set(tx + ',' + ty, RADIO);
  inv.radio--;
}

function nearestRadio(maxDist) {
  let best = null, bd = maxDist;
  for (const r of findTiles(RADIO, 3)) {
    const c = tileCenter(r.tx, r.ty), d = Math.hypot(c.x - player.x, c.y - player.y);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

function openRadio(tx, ty) {
  if (!window.Radio) { say('Thiếu file radio.js'); return; }
  const c = tileCenter(tx, ty);
  Radio.open(layer + ':' + tx + ',' + ty, c.x, c.y, layer);
}

// Radio đặt sẵn của làng (phát nhạc thể dục buổi sáng, không chỉnh được)
function nearestVillageRadio(maxDist) {
  if (layer !== 0) return null;
  let best = null, bd = maxDist;
  for (const v of activeVillages) {
    if (!v.radio) continue;
    const d = Math.hypot((v.radio.tx + 0.5) * TILE - player.x, (v.radio.ty + 0.5) * TILE - player.y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

// ---------- Rương gỗ (người chơi tự đặt, cất đồ cố định) ----------
// Chế bằng 8 gỗ, nhấn Y để đặt, E để mở. Kéo thả đồ giữa rương và túi, hoặc bấm vào món để chuyển cả chồng sang bên kia.
const STORE_SLOTS = 27;
let storeKey = null; // rương đang mở trong giao diện

function storageAt(key) {
  if (!storages.has(key)) storages.set(key, { slots: Array(STORE_SLOTS).fill(null) });
  return storages.get(key);
}

function nearestStorage(maxDist) {
  let best = null, bd = maxDist;
  for (const f of findTiles(STORE, 3)) {
    const p = tileCenter(f.tx, f.ty);
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function openStorage(f = nearestStorage(110)) {
  if (!f) return false;
  storeKey = f.tx + ',' + f.ty;
  storageAt(storeKey);
  ui = 'store';
  return true;
}

// Lò nung và rương gỗ đặt sát nhau: chỉ chọn cái GẦN người chơi nhất (trước đây lò luôn thắng nên không mở được rương)
// Vật đang được trỏ chuột vào (có khung trắng) và đủ gần: rương ngoài đời, lò nung, rương gỗ, bàn chế tạo
function hoverTarget() {
  if (ui || deathScreen) return null;
  const camX = player.x - canvas.width / 2, camY = player.y - canvas.height / 2;
  const tx = Math.floor((mouse.x + camX) / TILE), ty = Math.floor((mouse.y + camY) / TILE);
  const p = tileCenter(tx, ty);
  const chest = chests.find((c) => c.tx === tx && c.ty === ty);
  if (chest) return Math.hypot(p.x - player.x, p.y - player.y) < 110 ? { kind: 'chest', c: chest, tx, ty } : null;
  const t = getTile(tx, ty);
  const kind = t === FURNACE ? 'furnace' : t === STORE ? 'store' : t === RADIO ? 'radio' : (t === TABLE || t === MILL || t === OVEN) ? 'table' : DOOR_PAIR[t] ? 'door' : null;
  if (!kind || Math.hypot(p.x - player.x, p.y - player.y) >= 110) return null;
  return { kind, t: { tx, ty }, tx, ty, sub: t === MILL ? 'mill' : t === OVEN ? 'oven' : 'table' };
}

function nearestStation(maxDist = 110) {
  const hv = hoverTarget();
  if (hv && (hv.kind === 'furnace' || hv.kind === 'store')) return { type: hv.kind, t: hv.t };
  const f = nearestFurnace(maxDist), st = nearestStorage(maxDist);
  const dist = (o) => { const p = tileCenter(o.tx, o.ty); return Math.hypot(p.x - player.x, p.y - player.y); };
  if (f && st) return dist(st) < dist(f) ? { type: 'store', t: st } : { type: 'furnace', t: f };
  if (f) return { type: 'furnace', t: f };
  if (st) return { type: 'store', t: st };
  return null;
}

function openStation() {
  const s = nearestStation();
  if (!s) return false;
  return s.type === 'store' ? openStorage() : openFurnace();
}

function placeStore() {
  if (inv.chestbox <= 0) { say('Bạn không có rương gỗ (8 gỗ, chế ở bàn chế tạo)'); return; }
  const { tx, ty } = facingTile();
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) {
    say('Không đặt được ở đây');
    return;
  }
  if (tileOverlapsPlayer(tx, ty)) {
    say('Lùi ra một chút rồi đặt nhé (đang đứng sát ô này)');
    return;
  }
  changes.set(tx + ',' + ty, STORE);
  inv.chestbox--;
  say('Đã đặt rương gỗ');
}

// Nhấc món id khỏi người chơi thành một mục rương: { k: 'item' | 'tool' | 'gear', id, n, tier, dur }
function takeEntry(id, maxN) { // maxN: chỉ lấy tối đa chừng này (một chồng) từ túi
  if (id in tools) {
    if (!(tools[id] > 0)) return null;
    const e = { k: 'tool', id: toolBase(id), n: 1, tier: tools[id], dur: toolDur[id] };
    setTool(id, 0);
    return e;
  }
  if (GEAR_IDS.includes(id)) {
    const n = gearBag[id];
    if (!(n > 0)) return null;
    gearBag[id] = 0;
    return { k: 'gear', id, n };
  }
  const n = Math.min(inv[id] || 0, maxN || Infinity);
  if (n <= 0) return null;
  inv[id] -= n;
  return { k: 'item', id, n };
}

// Đưa một mục rương vào túi người chơi; at: ô kho muốn đặt vào (nếu món chưa có trong kho và ô đó trống)
function giveEntry(e, at) {
  syncSlots();
  const sid = e.k === 'tool' ? toolKeyFor(e.id) : e.id; // dụng cụ vào ô trống (hoặc thay món kém nhất)
  const had = slots.includes(sid);
  if (e.k === 'tool') setTool(sid, e.tier, e.dur);
  else if (e.k === 'gear') gearBag[e.id] += e.n;
  else inv[e.id] = (inv[e.id] || 0) + e.n;
  syncSlots();
  if (!had && at !== undefined && at >= 0 && !slots[at]) {
    const j = slots.indexOf(sid);
    if (j >= 0) { slots[j] = null; slots[at] = sid; }
  }
}

const sameStack = (a, b) => a && b && a.k !== 'tool' && a.k === b.k && a.id === b.id;

// Ô rương nhận món id: ô cùng loại (cộng dồn) trước, rồi ô trống đầu tiên
function findStoreSlot(st, id) {
  const i = st.slots.findIndex((c) => c && c.k !== 'tool' && c.id === id);
  return i >= 0 ? i : st.slots.findIndex((c) => !c);
}

// Túi -> rương. ci = ô rương đích, -1 = tự tìm ô
function storePut(pi, ci) {
  const st = storageAt(storeKey);
  const id = slots[pi];
  if (!id) return;
  if (ci < 0) ci = findStoreSlot(st, id);
  if (ci < 0) { say('Rương đầy'); return; }
  const cur = st.slots[ci];
  // Ô đích có món khác -> đổi chỗ. Không đổi được nếu món đó là dụng cụ trùng loại với cái bạn đang cầm
  if (cur && cur.k === 'tool' && toolBase(cur.id) !== toolBase(id) && !toolSlotFor(cur.id, cur.tier, cur.dur)) { say('Bạn đã có ' + TOOL_LABEL[cur.id].toLowerCase() + ' rồi, chọn ô khác'); return; }
  const e = takeEntry(id, stackCount(pi) || undefined);
  if (!e) return;
  if (!cur) st.slots[ci] = e;
  else if (sameStack(cur, e)) cur.n += e.n;
  else { giveEntry(cur, pi); st.slots[ci] = e; }
}

// Rương -> túi. pi = ô kho đích, -1 = tự xếp
function storeTake(ci, pi) {
  const st = storageAt(storeKey);
  const e = st.slots[ci];
  if (!e) return;
  if (e.k === 'tool' && !freeToolKey(e.id)) { // đã đủ 2 món cùng loại: đổi chỗ với món kém hơn
    st.slots[ci] = takeEntry(worstToolKey(e.id));
    giveEntry(e, pi);
    return;
  }
  st.slots[ci] = null;
  giveEntry(e, pi);
}

// Rương -> rương: đổi chỗ hoặc gộp chồng
function storeMove(a, b) {
  const st = storageAt(storeKey);
  if (a === b) return;
  if (sameStack(st.slots[a], st.slots[b])) { st.slots[b].n += st.slots[a].n; st.slots[a] = null; return; }
  [st.slots[a], st.slots[b]] = [st.slots[b], st.slots[a]];
}

// Phá rương: trả lại mọi thứ bên trong
function dropStorageContents(key) {
  const st = storages.get(key);
  if (!st) return;
  const [tx, ty] = key.split(',').map(Number);
  const c = tileCenter(tx, ty);
  for (const e of st.slots) {
    if (!e) continue;
    if (e.k === 'tool' && !freeToolKey(e.id)) { // đã đủ 2 món cùng loại: để rơi xuống đất
      itemDrops.push({ kind: 'tool', id: e.id, n: 1, tier: e.tier, dur: e.dur, x: c.x, y: c.y, layer, age: 0 });
    } else giveEntry(e);
  }
  storages.delete(key);
  if (ui === 'store' && storeKey === key) closeUi();
}

function storeLayout() {
  const pad = 16, w = pad * 2 + 9 * SLOT, h = 372;
  const x = Math.round((canvas.width - w) / 2);
  const y = Math.round((canvas.height - h) / 2 - 12);
  const cs = Array.from({ length: STORE_SLOTS }, (_, i) => slotRect(x + pad + (i % 9) * SLOT, y + 36 + Math.floor(i / 9) * SLOT));
  const main = Array.from({ length: 27 }, (_, i) => slotRect(x + pad + (i % 9) * SLOT, y + 190 + Math.floor(i / 9) * SLOT));
  const hotbar = Array.from({ length: 9 }, (_, i) => slotRect(x + pad + i * SLOT, y + 190 + 3 * SLOT + 8));
  return { x, y, w, h, pad, cs, all: [...hotbar, ...main] };
}

function clickStore() {
  const L = storeLayout();
  const st = storageAt(storeKey);
  const ids = slotList();
  const ci = L.cs.findIndex((r) => inRect(mouse, r));
  if (ci >= 0) {
    const e = st.slots[ci];
    if (e) drag = { src: 'chest', i: ci, id: e.id, tier: e.k === 'tool' ? e.tier : e.k === 'gear' ? 3 : 1 };
    return;
  }
  const pi = L.all.findIndex((r) => inRect(mouse, r));
  if (pi >= 0 && ids[pi]) drag = { src: 'slot', i: pi, id: ids[pi] };
}

function endStoreDrag(d) {
  const L = storeLayout();
  const pi = L.all.findIndex((r) => inRect(mouse, r));
  const ci = L.cs.findIndex((r) => inRect(mouse, r));
  if (d.src === 'slot') {
    if (ci >= 0) storePut(d.i, ci);
    else if (pi === d.i) storePut(d.i, -1);            // bấm tại chỗ: chuyển vào rương
    else if (pi >= 0) swapSlots(d.i, pi);
  } else {
    if (pi >= 0) storeTake(d.i, pi);
    else if (ci === d.i) storeTake(d.i, -1);           // bấm tại chỗ: chuyển về túi
    else if (ci >= 0) storeMove(d.i, ci);
  }
}

function drawStoreUi() {
  const L = storeLayout();
  const st = storageAt(storeKey);
  const ids = slotList();
  const hover = (r) => inRect(mouse, r);
  let tip = null;

  mcPanel(L);
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#404040';
  ctx.fillText('Rương gỗ', L.x + L.pad, L.y + 26);
  ctx.fillText('Túi đồ', L.x + L.pad, L.y + 184);

  L.cs.forEach((r, i) => {
    drawSlot(r, hover(r));
    const e = st.slots[i];
    if (!e) return;
    ctx.globalAlpha = drag && drag.src === 'chest' && drag.i === i ? 0.3 : 1;
    drawIcon(e.id, r.x + 4, r.y + 4, 32, e.k === 'tool' ? e.tier : e.k === 'gear' ? 3 : 1);
    ctx.globalAlpha = 1;
    if (e.k === 'tool') drawDurBar(r, e.dur / TOOL_DUR[e.tier]);
    else if (e.n > 1) drawCount(r, e.n);
    if (hover(r) && !drag) {
      if (e.k === 'tool') tip = [TOOL_LABEL[e.id] + ' ' + TIER_NAME[e.tier], 'Độ bền: ' + e.dur + ' / ' + TOOL_DUR[e.tier], 'Bấm để lấy ra'];
      else if (e.k === 'gear') tip = [ARMOR_NAME[e.id], 'Bấm để lấy ra'];
      else tip = [ITEMS[e.id].name, e.n + ' cái', 'Bấm để lấy ra'];
    }
  });

  const dragFrom = drag && drag.src === 'slot' ? drag.i : -1;
  L.all.forEach((r, i) => {
    drawSlot(r, hover(r));
    const id = ids[i];
    if (!id) return;
    drawSlotItem(r, id, i === dragFrom, i < 9 ? 24 : 13, stackCount(i));
    if (hover(r) && !drag) tip = [...itemTip(id).slice(0, 2), 'Bấm để cất vào rương'];
  });

  ctx.textAlign = 'center';
  ctx.font = '12px sans-serif';

  if (drag) drawDragGhost();
  else if (tip) drawTooltip(tip);
}

// ---------- Hầm mỏ: tầng sâu, sập hầm, dung nham, nước, rương kho báu ----------
const caveins = [];       // đá sắp rơi: { tx, ty, t }
let mineZoneSeen = -1;    // tầng lần trước người chơi đứng (để báo khi sang tầng mới)
let mineChestT = 25;      // giây tới lần thử sinh rương kho báu kế tiếp
let lavaWarnT = 0;
let burnT = 0;            // giây còn bốc cháy (0 = không cháy)

function playerMineZone() {
  return mineZoneIndex(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
}
function mineFluidAt(px, py) { // điểm (pixel) có phải dung nham / nước không (chỉ dùng dưới hầm)
  const t = getTile(Math.floor(px / TILE), Math.floor(py / TILE));
  return t === LAVA || t === WATER;
}

// Đào xong một ô đá: ở tầng sâu có thể làm sập hầm
function maybeCaveIn() {
  if (caveins.length || Math.random() >= MINE_ZONES[playerMineZone()].cavein) return;
  const ptx = Math.floor(player.x / TILE), pty = Math.floor((player.y + 4) / TILE);
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n * 3 && caveins.length < n; i++) {
    const tx = i === 0 ? ptx : ptx + Math.round((Math.random() - 0.5) * 4);
    const ty = i === 0 ? pty : pty + Math.round((Math.random() - 0.5) * 4);
    const t = getTile(tx, ty);
    if (t !== GRASS && t !== LAVA && t !== WATER) continue; // không rơi lên thang / đá
    if (gateTile(tx, ty) !== undefined) continue;          // phòng Cổng Ma Vương không sập
    if (chests.some((c) => c.tx === tx && c.ty === ty) || caveins.some((c) => c.tx === tx && c.ty === ty)) continue;
    caveins.push({ tx, ty, t: 0 });
  }
  if (!caveins.length) return;
  say('Hầm rung chuyển! Chạy ra khỏi vòng đỏ!');
  shake = Math.max(shake, 0.4);
}

function updateCaveIns(dt) {
  for (let i = caveins.length - 1; i >= 0; i--) {
    const ci = caveins[i];
    ci.t += dt;
    if (ci.t < BALANCE.mine.caveinWarn) continue;
    caveins.splice(i, 1);
    const c = tileCenter(ci.tx, ci.ty), key = ci.tx + ',' + ci.ty;
    if (Math.hypot(c.x - player.x, c.y - (player.y + 4)) < TILE * 0.7) hurt(BALANCE.mine.caveinDmg);
    for (const m of zombies.concat(spiders)) { // quái đứng dưới cũng bị đá đè
      if (!m.dead && !m.boss && !m.plant && Math.hypot(c.x - m.x, c.y - (m.y + 4)) < TILE * 0.7) hurtMobByEnv(m, BALANCE.mine.caveinDmg, '#c9c9d2');
    }
    const t = getTile(ci.tx, ci.ty);
    if ((t === GRASS || t === LAVA || t === WATER) && !tileOverlapsPlayer(ci.tx, ci.ty, 0)) {
      changes.set(key, ROCK); // đá rơi chặn lối (đá rơi xuống dung nham / nước thì lấp luôn)
      damage.delete(key);
    }
    burst(c.x, c.y, '#9a9aa3', 14, 200);
    shake = Math.max(shake, 0.35);
  }
}

function drawCaveInWarning(ci, camX, camY) {
  const c = tileCenter(ci.tx, ci.ty), sx = c.x - camX, sy = c.y - camY;
  const p = Math.min(1, ci.t / BALANCE.mine.caveinWarn);
  ctx.fillStyle = 'rgba(255,70,50,' + (0.12 + 0.14 * Math.abs(Math.sin(ci.t * 12))) + ')';
  ctx.beginPath(); ctx.arc(sx, sy, TILE * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,140,90,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(sx, sy, TILE * 0.7 * (1.5 - 0.5 * p), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(190,190,200,0.85)'; // bụi đá rơi
  for (let i = 0; i < 3; i++) ctx.fillRect(sx - 12 + i * 12 + Math.sin(ci.t * 9 + i) * 3, sy - 40 * (1 - p) - i * 7, 5, 5);
}

// Bấm vào dung nham / nước (cầm bình tưới): múc nước đầy bình, hoặc làm nguội dung nham thành đá
function mineFluidHit(tx, ty, t) {
  hitTimer = 0.35;
  const can = slotList()[hotbarSel] === 'watercan' && inv.watercan > 0;
  const c = tileCenter(tx, ty);
  if (t === WATER) {
    if (!can) return;
    canUses = WATERCAN_USES;
    burst(c.x, c.y, '#9fd0ff', 12, 120, 520);
    say('Đã múc đầy bình tưới (' + WATERCAN_USES + ' lần)');
    return;
  }
  if (!can) return;
  changes.set(tx + ',' + ty, ROCK);
  burst(c.x, c.y, '#d8dde3', 16, 160);
  spendWatercanUse();
}

function spawnMineChest() {
  const B = BALANCE.mine;
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = B.chestDist[0] + Math.random() * (B.chestDist[1] - B.chestDist[0]);
    const tx = Math.floor(player.x / TILE + Math.cos(a) * d), ty = Math.floor(player.y / TILE + Math.sin(a) * d);
    if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) continue;
    const zone = mineZoneIndex(tx, ty);
    const rare = Math.random() < MINE_ZONES[zone].chestRare;
    const chest = { tx, ty, t: Math.random() * 6, rare, mine: zone + 1 };
    chests.push(chest);
    if (rare) spawnGuards(chest, 2 + zone);
    const dirs = ['Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc', 'Bắc', 'Đông Bắc']; // y hướng xuống = Nam
    const dir = dirs[(Math.round(Math.atan2(ty + 0.5 - player.y / TILE, tx + 0.5 - player.x / TILE) / (Math.PI / 4)) + 8) % 8];
    say('Có rương kho báu (' + MINE_ZONES[zone].name.toLowerCase() + (rare ? ', có zombie canh' : '') + ') ở phía ' + dir + ', cách ~' + Math.round(d) + ' ô');
    return;
  }
}

// Bốc cháy sau khi đụng dung nham: cháy tiếp vài giây dù đã bước ra; nước ngầm hoặc mưa sẽ dập lửa
function updateBurn(dt) {
  if (burnT <= 0) return;
  const inWater = (layer === 1 || layer === 0) && getTile(Math.floor(player.x / TILE), Math.floor((player.y + 6) / TILE)) === WATER;
  if (inWater || (layer === 0 && world.rain.intensity > 0.3)) { burnT = 0; say('Lửa đã tắt'); return; }
  burnT -= dt;
  if (Math.random() < 0.6) burst(player.x + (Math.random() - 0.5) * 16, player.y - 10, Math.random() < 0.5 ? '#ff8a2a' : '#ffd34d', 1, 70, -140);
  hurt(BALANCE.mine.burnDmg); // hurt() tự giới hạn ~1 lần / giây
  if (burnT <= 0) say('Lửa đã tắt');
}

// Sinh vật mất máu vì môi trường (lửa, đá rơi): chết thì không rơi đồ, không tính điểm
function hurtMobByEnv(m, dmg, color) {
  m.hp -= dmg;
  floaters.push({ x: m.x, y: m.y - (m.boss ? 130 : 50), text: '-' + dmg, life: 0.8, color });
  if (m.hp > 0) return;
  if (m.kind) { // động vật: biến mất, không rơi đồ
    burst(m.x, m.y - 14, '#d9d2c0', 14, 180);
    const i = animals.indexOf(m);
    if (i >= 0) animals.splice(i, 1);
  } else if (spiders.includes(m)) killSpider(m);
  else { m.noDrop = true; killZombie(m); } // zombie, cây quái và cả boss
}

// Mọi sinh vật (zombie, nhện, cây quái, động vật, boss) đứng trong dung nham đều bị thiêu:
// cháy tiếp vài giây sau khi ra, chết thì không rơi đồ / không tính điểm
function burnMobs(dt) {
  const B = BALANCE.mine;
  const mobs = layer === 0 ? zombies.concat(spiders, animals) : zombies.concat(spiders);
  for (const m of mobs) {
    if (m.dead || m.fire) continue; // m.fire: Slime Lửa miễn nhiễm lửa (magma.js)
    if (getTile(Math.floor(m.x / TILE), Math.floor((m.y + 6) / TILE)) === LAVA) m.burnT = B.burnTime;
    if (!(m.burnT > 0)) continue;
    m.burnT -= dt;
    m.burnTick = (m.burnTick || 0) + dt;
    const fireY = m.y - (m.boss ? 60 : 14);
    if (Math.random() < 0.5) burst(m.x + (Math.random() - 0.5) * (m.boss ? 60 : 16), fireY, Math.random() < 0.5 ? '#ff8a2a' : '#ffd34d', 1, 70, -140);
    if (m.burnTick < 0.5) continue;
    m.burnTick = 0;
    hurtMobByEnv(m, m.boss ? B.bossBurnDmg : B.mobBurnDmg, '#ff8a2a');
  }
}

// Dung nham (dưới hầm hoặc do người chơi đổ ra mặt đất): đốt người chơi và quái đứng trong
function lavaHazards(dt) {
  burnMobs(dt);
  // Dung nham: đứng trong là bị bỏng (hurt() tự giới hạn ~1 lần / giây)
  lavaWarnT -= dt;
  if (getTile(Math.floor(player.x / TILE), Math.floor((player.y + 6) / TILE)) === LAVA) {
    hurt(BALANCE.mine.lavaDmg);
    if (burnT <= 0) say('Bạn bốc cháy! Chạy xuống nước để dập lửa');
    burnT = BALANCE.mine.burnTime;
    if (lavaWarnT <= 0) { lavaWarnT = 3; say('Dung nham! Lùi ra ngay!'); }
    if (Math.random() < 0.4) burst(player.x, player.y, '#ff8a2a', 1, 90, -120);
  }
}

function updateMine(dt) {
  if (layer === 0) { lavaHazards(dt); return; }
  if (layer !== 1) return;
  const zi = playerMineZone();
  if (zi !== mineZoneSeen) {
    if (mineZoneSeen >= 0) say(MINE_ZONES[zi].info); // lần đầu xuống hầm không báo, chỉ báo khi sang tầng khác
    mineZoneSeen = zi;
  }
  updateCaveIns(dt);
  updateGolemSpawn(dt);
  updateGolemFx(dt);

  lavaHazards(dt);

  // Rương kho báu mới thỉnh thoảng xuất hiện trong hầm
  mineChestT -= dt;
  if (mineChestT <= 0) {
    mineChestT = BALANCE.mine.chestEvery[0] + Math.random() * (BALANCE.mine.chestEvery[1] - BALANCE.mine.chestEvery[0]);
    if (chests.filter((c) => c.mine).length < BALANCE.mine.maxChests) spawnMineChest();
  }
}

// ---------- Hầm mỏ: đào xuống / leo lên ----------
const layerStore = [null, null]; // trạng thái của tầng đang không ở
function newLayerState() {
  return { changes: new Map(), damage: new Map(), rodLife: new Map(), furnaces: new Map(), storages: new Map(), chests: [], zombies: [], rocks: [], strikes: [] };
}
function packLayer() {
  return { changes, damage, rodLife, furnaces, storages, chests, zombies, rocks, strikes };
}
// Đổi tầng thuần tuý (không hiệu ứng): cất tầng hiện tại, nạp tầng n
function swapTo(n) {
  if (n === layer) return;
  if (layer === 2) stashHouse(); // rời nhà (ra ngoài, chết, lưu...) -> cất đồ đã đặt
  if (layer === 3) arena.leftAt = gameTime; // boss hồi máu dần khi bạn vắng
  layerStore[layer] = packLayer();
  swapMapState(layer, n);
  caveins.length = 0; mineZoneSeen = -1;
  golemFx.length = 0; golemRocks.length = 0;
  const st = layerStore[n] || newLayerState();
  ({ changes, damage, rodLife, furnaces, storages, chests, zombies, rocks, strikes } = st);
  layerStore[n] = null;
  layer = n;
  for (const z of zombies) if (z.mine) { z.act = null; z.aggro = false; z.jz = 0; } // boss hầm đứng dậy khi người chơi quay lại
  hitFx = new Map();
}

function switchLayer(n) {
  swapTo(n);
  particles.length = 0;
  if (window.FireMagic) FireMagic.clear();
  if (window.Magma) Magma.clear();
  if (window.VolcBoss) VolcBoss.clear();
  if (window.FinalBoss) FinalBoss.clear();
  if (window.IceMagic) IceMagic.clear();
  if (window.ArcaneMagic) ArcaneMagic.clear();
  if (window.ExtraMagic) ExtraMagic.clear();
  closeUi();
}

function nearestStairs(maxDist) {
  let best = null, bd = maxDist;
  for (const b of findTiles(STAIRS, 3)) {
    const p = tileCenter(b.tx, b.ty);
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// Nhấn H: đào lối xuống hầm ở ô đang trỏ chuột (hoặc ô trước mặt) (cần cuốc)
// Ô trên mặt đất tại (tx, ty) khi đang ở dưới hầm (tầng 0 đang cất trong layerStore)
function surfaceTileAt(tx, ty) {
  const st = layerStore[0];
  const key = tx + ',' + ty;
  if (st && st.changes.has(key)) return st.changes.get(key);
  const saved = layer;
  layer = 0;
  const t = baseTile(tx, ty);
  layer = saved;
  return t;
}

// Ô để đào hầm: ô đang trỏ chuột nhưng chỉ được các ô xung quanh người chơi (kể cả chéo); giữ Space = ô trước mặt
function digTarget() {
  if (keys['Space']) return { ...facingTile(), mouse: false };
  const tx = Math.floor((mouse.x + Math.floor(player.x - canvas.width / 2)) / TILE);
  const ty = Math.floor((mouse.y + Math.floor(player.y - canvas.height / 2)) / TILE);
  const ptx = Math.floor(player.x / TILE), pty = Math.floor((player.y + 3) / TILE);
  if (Math.abs(tx - ptx) > 1 || Math.abs(ty - pty) > 1) {
    say('Ô này quá xa, chỉ đào được các ô xung quanh bạn');
    return null;
  }
  faceTowards(tx, ty);
  return { tx, ty, mouse: true };
}

// Dưới hầm mà không còn thang: nhấn H (hoặc X) để đào một lối thẳng lên mặt đất rồi nhấn E để leo
function digUp() {
  if (tools.pickaxe < 1) { say('Cần cuốc gỗ trở lên để đào lối lên!'); return; }
  // Ô trước mặt nếu trống, không thì ngay chỗ đang đứng
  const dt0 = digTarget();
  if (!dt0) return;
  let { tx, ty, mouse: byMouse } = dt0;
  if (byMouse && getTile(tx, ty) !== STAIRS && getTile(tx, ty) !== GRASS) { say('Trỏ vào ô nền trống (không phải đá) để đào lối lên'); return; }
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) {
    tx = Math.floor(player.x / TILE); ty = Math.floor((player.y + 3) / TILE);
  }
  const here = getTile(tx, ty);
  if (here === STAIRS) { say('Đã có thang ở đây'); return; }
  if (here !== GRASS || chests.some((c) => c.tx === tx && c.ty === ty)) { say('Không đào lên được ở đây'); return; }
  const key = tx + ',' + ty;
  const up = surfaceTileAt(tx, ty);
  const diggable = up === GRASS || up === STAIRS || up === TREE || up === ROCK || up === COAL || up === IRON || up === GOLD || up === DIAMOND;
  const st = layerStore[0] || (layerStore[0] = newLayerState());
  if (!diggable || st.chests.some((c) => c.tx === tx && c.ty === ty)) {
    say('Phía trên là công trình / vật cản, không đào lên được. Thử chỗ khác nhé');
    return;
  }
  st.changes.set(key, STAIRS); // lỗ hầm trên mặt đất (xoá luôn cây / đá nằm chắn)
  st.damage.delete(key);
  changes.set(key, STAIRS);    // thang dưới hầm
  const c = tileCenter(tx, ty);
  burst(c.x, c.y, '#6b4423', 14, 170);
  say('Đã đào lối lên mặt đất!');
}

function digDown() {
  if (layer === 1) { digUp(); return; }
  if (layer !== 0) { say('Chỉ đào/lấp hầm được trên mặt đất hoặc dưới hầm mỏ'); return; }
  if (tools.pickaxe < 1) { say('Cần cuốc gỗ trở lên để đào hầm!'); return; }
  const dt0 = digTarget();
  if (!dt0) return;
  const { tx, ty } = dt0;
  // Nhấn H vào lỗ hầm đã đào: lấp lại thành cỏ
  if (getTile(tx, ty) === STAIRS) {
    changes.set(tx + ',' + ty, GRASS);
    // Bịt luôn thang bên dưới hầm (thành đá) để không còn lối thông
    if (!layerStore[1]) layerStore[1] = newLayerState();
    layerStore[1].changes.set(tx + ',' + ty, ROCK);
    const c = tileCenter(tx, ty);
    burst(c.x, c.y, '#4f7a34', 12, 160);
    say('Đã lấp hầm lại');
    return;
  }
  const t0 = getTile(tx, ty);
  const natural = t0 === GRASS || t0 === TREE || t0 === ROCK || t0 === COAL || t0 === IRON || t0 === GOLD || t0 === DIAMOND;
  if (!natural || chests.some((c) => c.tx === tx && c.ty === ty)) {
    say('Không đào được ở đây');
    return;
  }
  damage.delete(tx + ',' + ty);
  changes.set(tx + ',' + ty, STAIRS);
  const c = tileCenter(tx, ty);
  burst(c.x, c.y, '#6b4423', 12, 160);
  say('Đã đào lối xuống hầm');
}

function useStairs() {
  const b = nearestStairs(70);
  if (!b) return false;
  const c = tileCenter(b.tx, b.ty);
  if (layer === 0) {
    switchLayer(1);
    // Mở khoảng trống 3x3 quanh chỗ xuống + đặt thang leo lên
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) changes.set((b.tx + dx) + ',' + (b.ty + dy), GRASS);
    changes.set(b.tx + ',' + b.ty, STAIRS);
    say('Hầm mỏ: đào đá, than, sắt, vàng');
  } else {
    switchLayer(0);
    say('Đã lên mặt đất');
  }
  player.x = c.x;
  player.y = c.y;
  player.invuln = Math.max(player.invuln, 1);
  return true;
}

// ---------- Giường: ngủ qua đêm + điểm hồi sinh ----------
const SLEEP_TIME = 2.4;
let sleepT = 0;          // > 0: đang ngủ (màn hình tối dần rồi sáng lại)
let sleepDone = false;   // đã tua qua đêm chưa

function nearestBed(maxDist) {
  let best = null, bd = maxDist;
  for (const b of findTiles(BED, 3)) {
    const p = tileCenter(b.tx, b.ty);
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function placeBed() {
  if (layer === 1) { say('Chỉ đặt giường được trên mặt đất hoặc trong nhà'); return; }
  if (inv.bed <= 0) { say('Bạn không có giường'); return; }
  const { tx, ty } = facingTile();
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) {
    say('Không đặt được ở đây');
    return;
  }
  if (tileOverlapsPlayer(tx, ty)) {
    say('Lùi ra một chút rồi đặt nhé (đang đứng sát ô này)');
    return;
  }
  changes.set(tx + ',' + ty, BED);
  inv.bed--;
  say('Đã đặt giường');
}

// Nhấn E gần giường: luôn đặt điểm hồi sinh; ban đêm thì ngủ để tua tới sáng
function useBed() {
  if (layer === 1) return false;
  const b = nearestBed(110);
  if (!b) return false;
  const inHouse = layer === 2;
  if (inHouse && bedOccupied(b)) { say('Có người đang ngủ ở giường này!'); return true; }
  if (!inHouse) spawnPoint = { tx: b.tx, ty: b.ty };
  else { // giường trong nhà dân làng: chết sẽ hồi sinh lại đúng căn nhà này
    const m = /^(-?\d+),(-?\d+):(\d+)$/.exec(houseCur.obj.key);
    if (m) spawnPoint = { tx: b.tx, ty: b.ty, house: { cx: +m[1], cy: +m[2], hid: +m[3] } };
  }
  if (outdoorDarkness() / 0.72 <= 0.5) {
    say('Đã đặt điểm hồi sinh' + (inHouse ? ' trong nhà này' : '') + '. Chỉ ngủ được vào ban đêm');
    return true;
  }
  if (zombies.some((z) => !z.dead && z.aggro && Math.hypot(z.x - player.x, z.y - player.y) < 450)) {
    say('Không ngủ được: có zombie ở gần!');
    return true;
  }
  sleepT = SLEEP_TIME;
  sleepDone = false;
  say('Zzz...');
  return true;
}

function skipNight() {
  world.dayT = 0.76; // sáng sớm
  farmClock += BALANCE.day.sleepSkipFarmSeconds; // ngủ qua đêm (tương đương nửa ngày cũ 600 giây): cây trồng lớn thêm
  const r = world.rain;
  r.active = false; r.storm = false; r.intensity = 0; r.timeLeft = 0; r.nextCheck = WEATHER.clearMin;
  for (let i = zombies.length - 1; i >= 0; i--) if (!zombies[i].guard) zombies.splice(i, 1);
  rocks.length = 0; clearSpiders();
  strikes.length = 0;
  const outside = layer === 2 ? layerStore[0] : null; // ngủ trong nhà: dọn luôn zombie / đá rơi bên ngoài
  if (outside) {
    outside.zombies = outside.zombies.filter((z) => z.guard);
    outside.rocks.length = 0;
    outside.strikes.length = 0;
  }
  player.hp = MAX_HP;
  player.hunger = Math.max(10, player.hunger - 15);
  say('Chào buổi sáng! Điểm hồi sinh đã được lưu');
}

// Chỗ hồi sinh: cạnh giường nếu còn giường, không thì ở gốc toạ độ
// Căn nhà dân làng làm điểm hồi sinh (nếu còn giường), không thì null
function houseSpawnTarget() {
  const sp = spawnPoint;
  if (!sp || !sp.house) return null;
  const v = villageForRegion(Math.floor(sp.house.cx / REG), Math.floor(sp.house.cy / REG));
  const obj = v && v.cx === sp.house.cx && v.cy === sp.house.cy ? v.houses[sp.house.hid] : null;
  if (!obj) return null;
  const hs = hstate(obj);
  if (hs.gone.has(sp.tx + ',' + sp.ty)) return null; // giường đã bị phá
  if (hs.saved && hs.saved.changes.has(sp.tx + ',' + sp.ty) && hs.saved.changes.get(sp.tx + ',' + sp.ty) !== BED) return null;
  return obj;
}

function respawnPosition() {
  if (spawnPoint && spawnPoint.house) return { x: 0, y: 0 }; // điểm hồi sinh trong nhà: xử lý ở respawn()
  if (spawnPoint && getTile(spawnPoint.tx, spawnPoint.ty) === BED) {
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]) {
      const tx = spawnPoint.tx + dx, ty = spawnPoint.ty + dy;
      if (!isSolid(tx, ty)) return tileCenter(tx, ty);
    }
  } else {
    spawnPoint = null;
  }
  return { x: 0, y: 0 };
}

// ---------- Lưu / tải game (localStorage) ----------
const SAVE_KEY = 'minicraft-save-v1'; // giữ nguyên tên khoá để tìm lại được save cũ; phiên bản nằm trong trường `v` của dữ liệu
let saveFlash = 0;
let noSave = false;
let loadNotice = ''; // thông báo khi tải save (vd. save của bản game mới hơn)

// Phiên bản định dạng save. MỖI LẦN ĐỔI cấu trúc dữ liệu save (thêm / đổi tên / đổi ý nghĩa một trường):
//   1) tăng SAVE_VERSION lên 1,
//   2) thêm hàm vào SAVE_MIGRATIONS với khoá là phiên bản CŨ, nhận dữ liệu cũ và trả dữ liệu mới.
// Save cũ sẽ tự đi qua từng bước (1 -> 2 -> 3 ...) khi tải, và được sao lưu trước khi đổi.
const SAVE_VERSION = 4;
const SAVE_MIGRATIONS = {
  // v1 -> v2: bản v1 có thể thiếu một số trường (do các bản game cũ hơn); điền mặc định để code tải không bị lỗi.
  // Đợt này cũng đổi chu kỳ ngày (600 -> 900 giây) và cách sinh làng: dayT là tỉ lệ 0..1 nên vẫn dùng được nguyên.
  1: (d) => {
    d.changes = d.changes || []; d.rodLife = d.rodLife || []; d.furnaces = d.furnaces || []; d.stores = d.stores || []; d.chests = d.chests || [];
    d.world = d.world || {};
    d.player = d.player || {};
    return d;
  },
  // v3 -> v4: hầm mỏ chia tầng (mineTile đổi cách sinh quặng, thêm dung nham / nước) và rương kho báu có trường `mine`.
  // Phần đã đào (changes) giữ nguyên; chỉ các ô chưa đào của hầm cũ sẽ sinh lại theo luật mới. Không cần đổi dữ liệu.
  3: (d) => d,
  // v2 -> v3: thêm bản đồ riêng cho hầm mỏ (mmMine). Save cũ chưa có thì hầm bắt đầu với bản đồ trống.
  2: (d) => {
    d.mmMine = d.mmMine || null;
    return d;
  },
};

// Sao lưu bản save thô trước khi động vào (không đè lên bản sao lưu cũ cùng nhãn)
function backupSave(raw, label) {
  try {
    const k = SAVE_KEY + '-backup-' + label;
    if (!localStorage.getItem(k)) localStorage.setItem(k, raw);
  } catch (e) { /* bộ nhớ đầy: bỏ qua */ }
}

// Đưa dữ liệu save về phiên bản hiện tại; trả null nếu không dùng được
function migrateSave(d) {
  if (!d || typeof d !== 'object' || !Number.isInteger(d.v) || d.v < 1) return null;
  while (d.v < SAVE_VERSION) {
    const step = SAVE_MIGRATIONS[d.v];
    if (!step) return null; // thiếu hàm migrate: không đoán mò
    d = step(d);
    d.v++;
  }
  return d;
}

// Số hỏng (NaN / vô hạn) trong save sẽ làm người chơi kẹt hoặc chết ngay: ép về giá trị hợp lệ
function sanitizeSave(d) {
  const pl = d.player || {};
  const fin = (v, def) => (typeof v === 'number' && isFinite(v) ? v : def);
  pl.x = fin(pl.x, 0); pl.y = fin(pl.y, 0);
  pl.hp = Math.min(MAX_HP, Math.max(0, fin(pl.hp, MAX_HP)));
  pl.hunger = Math.min(MAX_HUNGER, Math.max(0, fin(pl.hunger, MAX_HUNGER)));
  d.player = pl;
  const w = d.world || {};
  w.dayT = ((fin(w.dayT, 0.85) % 1) + 1) % 1;
  w.day = Math.max(1, Math.floor(fin(w.day, 1)));
  d.world = w;
  return d;
}

function serializeLayer() {
  return {
    changes: [...changes],
    rodLife: [...rodLife],
    furnaces: [...furnaces],
    stores: [...storages],
    chests: chests.map((c) => ({ tx: c.tx, ty: c.ty, rare: c.rare, legend: !!c.legend, volc: !!c.volc, ice: !!c.ice, mine: c.mine || 0, guards: c.rare ? guardsAlive(c) : 0 })),
  };
}
// Dữ liệu của tầng khác (nếu đang đứng ở tầng đó thì lấy luôn bản sống)
function serializeOther(n) {
  if (layer === n) return null;
  const cur = layer;
  swapTo(n);
  const out = serializeLayer();
  swapTo(cur);
  return out;
}

// Bản đồ đã khám phá của mặt đất (0) hoặc hầm mỏ (1), dù đang đứng ở tầng nào
function mapSnapshot(key) {
  if (mapKeyOf(layer) === key) return { ex: [...mmExplored], pins: mmPins };
  const s = mapStore[key];
  return s ? { ex: [...s.ex], pins: s.pins } : { ex: [], pins: [] };
}

function saveGame() {
  if (noSave) return;
  try {
    const bag = { ...inv };
    grid.forEach((id) => { if (id) bag[id]++; }); // đồ đang nằm trên lưới chế tạo vẫn được lưu
    stashHouse(); // đang đứng trong nhà: cất đồ đã đặt vào bản lưu
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: SAVE_VERSION,
      savedAt: Date.now(),
      seed: worldSeed,
      player: { x: (roomReturnPos() || player).x, y: (roomReturnPos() || player).y, hp: player.hp, hunger: player.hunger },
      inv: bag, tools, toolDur, gear, gearBag, hatOn, torchTime, spawnPoint, slots: slots.slice(), score, bags, drops: itemDrops,
      farmClock, canUses, swordBonus, bucketWater, bucketLava,
      witch: { b: witchSt.book, l: Object.keys(witchSt.learned), e: witchSt.element, o: Object.keys(witchSt.owned), u: Object.keys(witchSt.unlocked), f: { ...witchFlags } },
      dwarf: window.Dwarf ? Dwarf.save() : null,
      finalboss: window.FinalBoss ? FinalBoss.save() : null,
      elder: { f: elderQuest.found, a: elderQuest.accepted, s: elderQuest.step, p: elderQuest.prog, u: elderQuest.unlocked, m: Math.round(mana) },
      pets: animals.filter((a) => a.tame).map((a) => ({ kind: a.kind, x: Math.round(a.x), y: Math.round(a.y), hp: a.hp, hx: a.home.x, hy: a.home.y, baby: a.baby || 0, bc: a.breedCd || 0, lt: a.layT, mt: a.milkT, milk: !!a.milk })),
      world: { dayT: world.dayT, day: world.day, nextChest: world.nextChest },
      ...(layer === 0 ? serializeLayer() : serializeOther(0)),
      layer: layer === 3 ? arenaBaseLayer() : layer >= 2 ? 0 : layer, // đang ở đấu trường: Ma Vương lưu ở hầm mỏ (chỗ trước cổng), Hỗn Nguyên lưu ở mặt đất
      armor: Math.round(armorHp),
      gates: gatesSave(),
      boats: placedBoats.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), f: b.flip ? 1 : 0 })).concat(boating ? [{ x: Math.round(player.x), y: Math.round(player.y), f: boatFlip ? 1 : 0 }] : []),
      mine: layer === 1 ? serializeLayer() : serializeOther(1),
      hs: [...houseState].map(([k, st]) => [k, [...st.gone], st.chestTaken, st.saved && {
        changes: [...st.saved.changes], rodLife: [...st.saved.rodLife], furnaces: [...st.saved.furnaces], stores: [...st.saved.storages],
      }]),
      mm: mapSnapshot(0),
      mmMine: mapSnapshot(1),
    }));
    saveFlash = 1.5;
  } catch (e) { /* bộ nhớ đầy hoặc bị chặn: bỏ qua */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    let d = JSON.parse(raw);
    if (d && Number.isInteger(d.v) && d.v > SAVE_VERSION) {
      // save của bản game MỚI HƠN: không đọc, không ghi đè (tránh mất save khi lỡ mở bản game cũ)
      noSave = true;
      loadNotice = 'Save này của bản game mới hơn (v' + d.v + '), bản này chỉ hiểu tới v' + SAVE_VERSION + '. Save được giữ nguyên, game mới sẽ không lưu.';
      console.warn(loadNotice);
      return false;
    }
    if (d && Number.isInteger(d.v) && d.v < SAVE_VERSION) backupSave(raw, 'v' + d.v); // sao lưu trước khi nâng cấp
    d = migrateSave(d);
    if (!d) {
      backupSave(raw, 'unreadable');
      loadNotice = 'Không đọc được save cũ (đã sao lưu), bắt đầu thế giới mới.';
      return false;
    }
    d = sanitizeSave(d);
    setSeed(d.seed || 0);
    gatesLoad(d.gates);
    placedBoats = Array.isArray(d.boats) ? d.boats.filter((b) => b && isFinite(b.x) && isFinite(b.y)).map((b) => ({ x: b.x, y: b.y, flip: !!b.f })) : [];
    boating = false;
    Object.assign(player, d.player);
    player.hpGhost = player.hp;
    Object.assign(inv, d.inv);
    delete inv.step; // bậc thang đã bị xoá khỏi game
    Object.assign(tools, d.tools);
    Object.assign(gear, d.gear);
    for (const k in gearBag) gearBag[k] = Number((d.gearBag || {})[k]) || 0; // save cũ lưu true/false
    hatOn = Boolean(d.hatOn);
    swordBonus = Number(d.swordBonus) || 0;
    torchTime = d.torchTime || 0;
    spawnPoint = d.spawnPoint || null;
    for (const k in tools) setTool(k, tools[k], d.toolDur ? d.toolDur[k] : undefined); // save cũ chưa có độ bền: coi như còn mới
    slots.fill(null);
    if (Array.isArray(d.slots)) d.slots.forEach((id, i) => { if (i < SLOT_N && typeof id === 'string' && id !== 'step') slots[i] = id; });
    else (d.hotbarOrder || []).forEach((id, i) => { if (i < 9 && typeof id === 'string' && id !== 'step') slots[i] = id; });
    score = d.score || 0;
    (d.bags || []).forEach((b) => { if (b && b.items) delete b.items.step; bags.push(b); });
    (d.drops || []).forEach((x) => { if (x && (x.kind === 'tool' ? TOOL_LABEL[x.id] : x.kind === 'gear' ? ARMOR_NAME[x.id] : ITEMS[x.id])) itemDrops.push(x); });
    Object.assign(world, d.world);
    farmClock = Number(d.farmClock) || 0;
    canUses = Number(d.canUses) || 0;
    bucketWater = !!d.bucketWater;
    bucketLava = !!d.bucketLava;
    const wd = d.witch || {};
    witchSt.book = !!wd.b; witchSt.element = typeof wd.e === 'string' ? wd.e : null; witchSt.learned = {}; (wd.l || []).forEach((id) => { if (witchSkill(id)) witchSt.learned[id] = true; });
    witchFlags.struck = !!(wd.f && wd.f.struck); witchFlags.drodStruck = !!(wd.f && wd.f.drodStruck); witchFlags.elecKill = !!(wd.f && wd.f.elecKill);
    witchFlags.dodgeN = Math.min(3, (wd.f && wd.f.dodgeN) | 0); witchFlags.strikeDodge = !!(wd.f && wd.f.strikeDodge) || witchFlags.dodgeN >= 3;
    witchFlags.spiderN = Math.min(10, (wd.f && wd.f.spiderN) | 0); witchFlags.spiderKill = !!(wd.f && wd.f.spiderKill) || witchFlags.spiderN >= 10;
    witchFlags.cureN = Math.min(5, (wd.f && wd.f.cureN) | 0); witchFlags.antidoteUse = !!(wd.f && wd.f.antidoteUse) || witchFlags.cureN >= 5;
    witchFlags.stoneRing = !!(wd.f && wd.f.stoneRing);
    witchFlags.stoneN = Math.min(5, (wd.f && wd.f.stoneN) | 0); witchFlags.stoneBlock = !!(wd.f && wd.f.stoneBlock) || witchFlags.stoneN >= 5;
    witchFlags.windN = Math.min(10, (wd.f && wd.f.windN) | 0); witchFlags.windKill = !!(wd.f && wd.f.windKill) || witchFlags.windN >= 10;
    witchFlags.potionN = Math.min(5, (wd.f && wd.f.potionN) | 0); witchFlags.potionUse = !!(wd.f && wd.f.potionUse) || witchFlags.potionN >= 5;
    witchFlags.nightN = Math.min(15, (wd.f && wd.f.nightN) | 0); witchFlags.nightKill = !!(wd.f && wd.f.nightKill) || witchFlags.nightN >= 15;
    witchFlags.shieldN = Math.min(10, (wd.f && wd.f.shieldN) | 0); witchFlags.shieldBlock = !!(wd.f && wd.f.shieldBlock) || witchFlags.shieldN >= 10;
    witchFlags.lowHpKill = !!(wd.f && wd.f.lowHpKill);
    witchFlags.chopN = Math.min(10, (wd.f && wd.f.chopN) | 0); witchFlags.chopKill = !!(wd.f && wd.f.chopKill) || witchFlags.chopN >= 10;
    witchFlags.meleeN = Math.min(10, (wd.f && wd.f.meleeN) | 0); witchFlags.meleeKill = !!(wd.f && wd.f.meleeKill) || witchFlags.meleeN >= 10;
    witchFlags.walkN = Math.min(1000, +(wd.f && wd.f.walkN) || 0); witchFlags.walkKill = !!(wd.f && wd.f.walkKill) || witchFlags.walkN >= 1000; walkPrev = null; walkNote = Math.floor(witchFlags.walkN / 100);
    witchFlags.harvestN = Math.min(10, (wd.f && wd.f.harvestN) | 0); witchFlags.harvestKill = !!(wd.f && wd.f.harvestKill) || witchFlags.harvestN >= 10;
    witchFlags.plantN = Math.min(5, (wd.f && wd.f.plantN) | 0); witchFlags.plantKill = !!(wd.f && wd.f.plantKill) || witchFlags.plantN >= 5;
    witchFlags.flowerN = Math.min(10, (wd.f && wd.f.flowerN) | 0); witchFlags.flowerKill = !!(wd.f && wd.f.flowerKill) || witchFlags.flowerN >= 10;
    witchFlags.zombieN = Math.min(5, (wd.f && wd.f.zombieN) | 0); witchFlags.zombieKill = !!(wd.f && wd.f.zombieKill) || witchFlags.zombieN >= 5;
    witchFlags.iceZ = Math.min(5, (wd.f && wd.f.iceZ) | 0); witchFlags.iceX = Math.min(5, (wd.f && wd.f.iceX) | 0); witchFlags.iceUse = !!(wd.f && wd.f.iceUse) || (witchFlags.iceZ >= 5 && witchFlags.iceX >= 5);
    witchSt.owned = {}; witchSt.unlocked = {};
    (wd.o || []).forEach((id) => { if (typeof id === 'string') witchSt.owned[id] = true; });
    (wd.u || []).forEach((id) => { if (typeof id === 'string') { witchSt.unlocked[id] = true; witchSt.owned[id] = true; } });
    // save cũ (trước khi có Sách Hệ): hệ đang dùng và hệ đã học phép coi như đã mở khoá
    if (witchSt.element) { witchSt.unlocked[witchSt.element] = true; witchSt.owned[witchSt.element] = true; }
    for (const id in witchSt.learned) { const sk = witchSkill(id); if (sk && sk.el) { witchSt.unlocked[sk.el] = true; witchSt.owned[sk.el] = true; } }
    if (window.Dwarf) Dwarf.load(d.dwarf);
    if (window.FinalBoss) FinalBoss.load(d.finalboss);
    if (window.ElementPick) ElementPick.apply(witchSt.element);
    const el = d.elder || {};
    elderQuest.found = !!el.f; elderQuest.accepted = el.a === undefined ? !!el.f : !!el.a; elderQuest.step = Math.min(ELDER_QUESTS.length, el.s | 0); elderQuest.prog = el.p | 0; elderQuest.unlocked = !!el.u;
    mana = elderQuest.unlocked ? Math.min(MAX_MANA, Number(el.m) || 0) : 0;
    armorLast = wornCount(); armorHp = Number.isFinite(d.armor) ? Math.max(0, Math.min(armorLast * ARMOR_PER_PIECE, d.armor)) : armorLast * ARMOR_PER_PIECE; // save cũ: giáp đầy
    stamina = MAX_STAMINA; staminaTired = false;
    (d.pets || []).forEach((p) => { if (ANIMALS[p.kind]) animals.push(makeAnimal(p.kind, p.x, p.y, { hp: p.hp, tame: true, home: { x: p.hx, y: p.hy }, baby: p.baby || 0, breedCd: p.bc || 0, layT: p.lt, milkT: p.mt, milk: !!p.milk })); });
    if (d.mm) { (d.mm.ex || []).forEach((k) => mmExplored.add(k)); mmPins = d.mm.pins || []; mmDirty = true; mmVersion++; }
    (d.hs || []).forEach(([k, gone, taken, sv]) => houseState.set(k, {
      gone: new Set(gone), chestTaken: !!taken,
      saved: sv ? { changes: new Map(sv.changes.filter(([, v]) => v !== LEGACY_STEP)), rodLife: new Map(sv.rodLife), furnaces: new Map(sv.furnaces), storages: new Map(sv.stores) } : null,
    }));
    d.changes.forEach(([k, v]) => { if (v !== LEGACY_STEP) changes.set(k, v); });
    d.rodLife.forEach(([k, v]) => rodLife.set(k, v));
    d.furnaces.forEach(([k, v]) => furnaces.set(k, v));
    (d.stores || []).forEach(([k, v]) => storages.set(k, v));
    d.chests.forEach((c) => {
      const chest = { tx: c.tx, ty: c.ty, t: Math.random() * 6, rare: c.rare, legend: !!c.legend };
      chests.push(chest);
      if (c.rare && c.guards > 0) spawnGuards(chest, c.guards);
    });
    if (d.mine) {
      swapTo(1);
      d.mine.changes.forEach(([k, v]) => { if (v !== LEGACY_STEP) changes.set(k, v); });
      (d.mine.rodLife || []).forEach(([k, v]) => rodLife.set(k, v));
      d.mine.furnaces.forEach(([k, v]) => furnaces.set(k, v));
      (d.mine.stores || []).forEach(([k, v]) => storages.set(k, v));
      (d.mine.chests || []).forEach((c) => {
        const chest = { tx: c.tx, ty: c.ty, t: Math.random() * 6, rare: c.rare, legend: !!c.legend, volc: !!c.volc, ice: !!c.ice, mine: c.mine || 0 };
        chests.push(chest);
        if (c.rare && c.guards > 0) spawnGuards(chest, c.guards);
      });
      if (d.mmMine) { (d.mmMine.ex || []).forEach((k) => mmExplored.add(k)); mmPins = d.mmMine.pins || []; } // bản đồ riêng của hầm
      swapTo(0);
      if (d.layer === 1) swapTo(1);
    }
    player.invuln = 2;
    if (player.hp <= 0) { respawn(); score = 0; } // đã lưu lúc đang ở màn hình chết: coi như chọn Hồi sinh
    return true;
  } catch (e) {
    console.warn('Không đọc được file lưu:', e);
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) backupSave(raw, 'corrupt'); } catch (err) { /* bỏ qua */ }
    loadNotice = 'File save bị hỏng (đã sao lưu), bắt đầu thế giới mới.';
    return false;
  }
}

window.addEventListener('beforeunload', saveGame);
window.addEventListener('pagehide', saveGame); // thoát / đóng tab trên điện thoại
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

// ---------- Input ----------
const keys = {};
const mouse = { x: 0, y: 0, down: false };

function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function toggleUi(name) {
  if (ui === name) closeUi();
  else ui = name;
}

let tableSession = false, tableSessionChecked = false; // phiên túi đồ này được mở khi đang đứng gần bàn chế tạo
function closeUi() {
  drag = null;
  mapDrag = null;
  if (ui === 'inv') returnGrid(); // trả nguyên liệu trên lưới về túi
  ui = null;
}

window.addEventListener('keydown', (e) => {
  if (window.CHEAT_OPEN) return; // đang gõ lệnh trong cheat.js
  if (e.code === 'F5' && !deathScreen) { // F5: lưu game thủ công (không tải lại trang)
    e.preventDefault();
    if (!e.repeat) { saveGame(); if (!noSave) say('Đã lưu game'); }
    return;
  }
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (deathScreen) {
    if (e.code === 'Escape' && adState) { const cancel = adState.onCancel; adState = null; cancel(); }
    return;
  }

  if (ui === 'elements' || ui === 'spellshop') { if (window.ElementPick && ElementPick.key(e)) e.preventDefault(); return; } // bảng chọn hệ phép / bảng mua phép
  if (ui === 'dialog') { if (window.Dialog && Dialog.key(e)) e.preventDefault(); return; } // hộp thoại NPC (dialogbox.js)
  if (ui === 'dwarf') { if (window.Dwarf && Dwarf.key(e)) e.preventDefault(); return; } // hội thoại Chú Lùn / nhận sách / mở khoá
  if (e.code === 'KeyM') toggleMap();
  if (e.code === 'KeyC' && !(window.FireMagic && FireMagic.reserves('KeyC')) && !(window.IceMagic && IceMagic.reserves('KeyC')) && !(window.ArcaneMagic && ArcaneMagic.reserves('KeyC')) && !(window.ExtraMagic && ExtraMagic.reserves('KeyC'))) toggleUi('inv'); // hệ Lửa / Băng đang bật: C là phép
  if (e.code === 'KeyB') toggleUi('inv');
  if (e.code === 'KeyK' && witchSt.book && (!ui || ui === 'spellbook')) toggleUi('spellbook');
  if (!ui) castSpellKey(e.code);
  if (e.code === 'Escape') closeUi();
  if (e.code === 'KeyE' && !ui && window.Radio && Radio.isOpen()) { Radio.close(); return; } // đang mở bảng radio: E để đóng
  if (e.code === 'KeyE' && !ui) {
    const hv = hoverTarget(); // đang trỏ chuột vào vật nào thì mở đúng vật đó
    const nb = hv ? null : nearestBag(70);
    const nm = nearestMarket(130);
    const np = nearestPost(110);
    const nv = nearestVillager(80);
    const nd = nearestHouseDoor(80);
    const nr = hv ? null : nearestRadio(90);
    const nvr = hv ? null : nearestVillageRadio(90);
    if (boating) useBoat(); // đang trên thuyền: E để lên bờ
    else if (hv && hv.kind === 'chest') openChest(hv.c);
    else if (hv && hv.kind === 'furnace') openFurnace(hv.t);
    else if (hv && hv.kind === 'store') openStorage(hv.t);
    else if (hv && hv.kind === 'table') ui = 'inv';
    else if (hv && hv.kind === 'radio') openRadio(hv.tx, hv.ty);
    else if (hv && hv.kind === 'door') toggleDoor(hv.tx, hv.ty);
    else if (nb) collectBag(nb);
    else if (window.Dwarf && Dwarf.nearPortal(90)) Dwarf.usePortal(); // Cổng Hỗn Nguyên trong phòng Chú Lùn
    else if (nearHouseExit(80)) exitHouse();
    else if (nearBlackDealer(2.2 * TILE)) openBlackMarket();
    else if (nearArenaExit(100)) exitArena();
    else if (nearestGate(GATE.reach)) useGate(nearestGate(GATE.reach));
    else if (nearWizard(2.5 * TILE)) openWizard();
    else if (nearestWitch(WITCH.talkDist * TILE)) enterWitchHouse(nearestWitch(WITCH.talkDist * TILE));
    else if (nearestElder(ELDER.talkDist * TILE)) enterElderRoom(nearestElder(ELDER.talkDist * TILE));
    else if (nm) openMarket(nm);
    else if (np) talkPost(np);
    else if (nv) talkVillager(nv);
    else if (nd) { if (nd.blackMarket && blackNight()) enterBlackMarket(nd); else enterHouse(nd); }
    else if (nr) openRadio(nr.tx, nr.ty);
    else if (nvr) say(nvr.exercise ? 'Radio của làng đang phát nhạc thể dục buổi sáng (không chỉnh được)' : 'Radio của làng: sáng sớm sẽ phát nhạc thể dục cho cả làng');
    else if (useBoat()) { /* lên / xuống thuyền */ }
    else if (nearestChest(90)) openChest();
    else if (nearestDoor() && toggleDoor(nearestDoor().tx, nearestDoor().ty)) { /* đã mở / đóng cửa */ }
    else if (openStation()) { /* đã mở lò nung hoặc rương gỗ (cái gần nhất) */ }
    else if (useStairs()) { /* đã lên / xuống hầm */ }
    else if (useBed()) { /* đã đặt điểm hồi sinh / ngủ */ }
    else if (nearTable()) ui = 'inv'; // mở bàn chế tạo
  } else if (e.code === 'KeyE' && (ui === 'furnace' || ui === 'market' || ui === 'store')) {
    closeUi();
  }
  if (e.code === 'KeyR' && !ui) rotateAction();
  if (e.code === 'KeyH' && !ui) digDown(); // H: đào / lấp hầm (thuốc: bấm vào ô thuốc trên thanh nhanh)
  if (e.code === 'KeyT') useTorch();
  if (e.code === 'KeyG') {
    const all = e.ctrlKey || e.metaKey;
    if (all) e.preventDefault(); // Ctrl+G của trình duyệt là "tìm tiếp"
    if (ui === 'inv') dropHovered(all); else dropSelected(all);
  }
  if (e.code === 'F9') {
    e.preventDefault();
    if (confirm('Xoá toàn bộ dữ liệu đã lưu và chơi lại từ đầu?')) {
      noSave = true;
      try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* bỏ qua */ }
      location.reload();
    }
  }
  if (ui === 'inv' && e.code === 'Enter') takeOutput(e.shiftKey);
  if (ui === 'inv' && e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10);
    const ri = visibleRecipes()[n === 0 ? 9 : n - 1]; // số trên phím = thứ tự trong sách đang hiện
    if (ri !== undefined) fillRecipe(ri);
  }
  if (!ui && e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10);
    if (n >= 1) useHotbarSlot(n - 1);
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; drag = null; });

canvas.addEventListener('wheel', (e) => {
  if (ui === 'inv' && window.CREATIVE_ON && inRect(mouse, creativeLayout(invLayout()))) { creativeScrollBy(Math.sign(e.deltaY)); e.preventDefault(); }
  else if (ui === 'inv' && bookOpen) { bookScroll += Math.sign(e.deltaY) * BOOK_ROW * 1.5; e.preventDefault(); }
  else if (ui === 'map') { mapZoom(e.deltaY < 0 ? 1 : -1); e.preventDefault(); }
  else if (ui === 'market' && marketVillage && marketPageCount(marketVillage) > 1) { marketFlip(Math.sign(e.deltaY)); e.preventDefault(); }
}, { passive: false });
canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; if (mapDrag) mapMouseMove(); if (bookDrag) bookDragMove(); });
canvas.addEventListener('mouseup', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.down = false;
  bookDrag = null;
  endDrag();
  mapMouseUp();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // chuột phải dùng để nhổ cây / lấp đất
canvas.addEventListener('mousedown', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.button = e.button;
  if (e.button === 2 && !deathScreen && !ui) { // chuột phải ngoài thế giới: nhổ cây / lấp đất (không đặt đồ, không đánh)
    if (!inRect(mouse, hotbarBounds(hotbarRects(canvas.width, canvas.height)))) rightClickWorld();
    return;
  }
  if (deathScreen) { clickDeath(); return; }
  if (ui === 'map') { mapMouseDown(); return; }
  if (ui === 'inv') { clickInventory(); return; }
  if (ui === 'furnace') { clickFurnace(); return; }
  if (ui === 'market') { clickMarket(); return; }
  if (ui === 'store') { clickStore(); return; }
  if (ui === 'spellbook') { if (window.FireMagic) FireMagic.bookClick(); return; }
  if (ui === 'elements' || ui === 'spellshop') { if (window.ElementPick) ElementPick.click(); return; }
  if (ui === 'dialog') { if (window.Dialog) Dialog.click(); return; }
  if (ui === 'dwarf') { if (window.Dwarf) Dwarf.click(); return; }
  if (!ui && e.button === 0 && clickWizard()) return; // bấm vào ông phù thủy
  if (clickHotbar()) return;
  if (clickMinimap()) return; // bấm lên mini map thì không đánh/đập
  if (e.button === 0 && smashBoatAt(mouse.x + player.x - canvas.width / 2, mouse.y + player.y - canvas.height / 2)) return; // đập thuyền bằng tay / rìu / kiếm
  if (placeSelectedAt(Math.floor(player.x - canvas.width / 2), Math.floor(player.y - canvas.height / 2))) return; // đang cầm món đặt được: bấm = đặt
  mouse.down = true;
});

// ---------- Chế tạo & dùng vật phẩm ----------
// Lưới 2×2 ở túi đồ. Đứng gần bàn chế tạo (trong 3 ô) thì có lưới 3×3.
const GRID_W = 3;
const grid = Array(GRID_W * GRID_W).fill(null); // mỗi ô: id vật phẩm hoặc null
let held = null;         // nguyên liệu đang chọn trong túi đồ (bấm vào lưới để đặt 1 cái)
let autoRefill = null;   // công thức vừa điền từ sách: lấy xong sẽ tự điền lại nếu còn đủ

const STATION_NAME = { mill: 'máy xay', oven: 'lò nướng' };
function nearStation(kind) { return findTiles(kind === 'mill' ? MILL : OVEN, 3).length > 0; }
function nearTable() { // bàn chế tạo, máy xay, lò nướng đều mở lưới 3×3
  return findTiles(TABLE, 3).length > 0 || findTiles(MILL, 3).length > 0 || findTiles(OVEN, 3).length > 0;
}

function gridSize() {
  return nearTable() ? 3 : 2;
}

function canAfford(r) {
  return Object.entries(r.cost).every(([k, v]) => inv[k] >= v);
}

function isOwned(r) {
  const g = r.give;
  if (g.tool) return false; // dụng cụ chế bao nhiêu lần cũng được, kể cả khi đã có đồ tốt hơn
  if (g.gear) return false; // giáp chế bao nhiêu cũng được
  return false; // vật phẩm tiêu hao thì chế bao nhiêu cũng được
}

// Cắt phần trống quanh hình để so khớp ở bất kỳ vị trí nào trên lưới
function trimCells(cells, h, w) {
  let r0 = h, r1 = -1, c0 = w, c1 = -1;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!cells[r * w + c]) continue;
      r0 = Math.min(r0, r); r1 = Math.max(r1, r);
      c0 = Math.min(c0, c); c1 = Math.max(c1, c);
    }
  }
  if (r1 < 0) return null;
  const rows = [];
  for (let r = r0; r <= r1; r++) rows.push(cells.slice(r * w + c0, r * w + c1 + 1));
  return rows;
}

function sameShape(a, b) {
  return a.length === b.length && a[0].length === b[0].length &&
    a.every((row, y) => row.every((id, x) => id === b[y][x]));
}

function findRecipe() {
  const rows = trimCells(grid, GRID_W, GRID_W);
  if (!rows) return null;
  return RECIPES.find((r) => (sameShape(rows, r.shape) || sameShape(rows, r.mirror)) && (!r.station || nearStation(r.station))) || null;
}

function returnGrid() {
  grid.forEach((id, i) => { if (id) { inv[id]++; grid[i] = null; } });
  autoRefill = null;
}

// Lưới thu nhỏ (rời xa bàn): trả đồ ở các ô không còn dùng được
function syncGrid(n) {
  const outside = grid.some((id, i) => id && !(i % GRID_W < n && Math.floor(i / GRID_W) < n));
  if (outside) returnGrid();
}

function ensureHeld() {
  if (held && inv[held] > 0) return;
  held = MATERIALS.find((id) => inv[id] > 0) || null;
}

function clickGridCell(i) {
  autoRefill = null;
  if (grid[i]) { inv[grid[i]]++; grid[i] = null; return; } // bấm ô có đồ: lấy lại
  ensureHeld();
  if (!held) { say('Bạn chưa có nguyên liệu'); return; }
  inv[held]--;
  grid[i] = held;
}

// Điền sẵn công thức từ sách vào lưới (giống sách công thức của Minecraft)
function fillRecipe(i, quiet = false) {
  const r = RECIPES[i];
  if (!r) return;
  const n = gridSize();
  if (r.sh > n || r.sw > n) {
    if (!quiet) say('Cần bàn chế tạo');
    return;
  }
  if (r.station && !nearStation(r.station)) { if (!quiet) say('Cần đứng gần ' + STATION_NAME[r.station]); return; }
  returnGrid();
  selRecipe = i;
  if (!canAfford(r)) { if (!quiet) say('Chưa đủ nguyên liệu'); return; }
  r.pattern.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ' ') return;
    const id = r.key[ch];
    inv[id]--;
    grid[y * GRID_W + x] = id;
  }));
  autoRefill = i;
}

// bulk = giữ Shift: chế liên tục cùng một công thức cho tới khi hết nguyên liệu (dụng cụ chỉ chế 1 cái)
const shiftHeld = () => !!(keys.ShiftLeft || keys.ShiftRight);
function takeOutput(bulk = false) {
  const r = findRecipe();
  if (!r) return;
  if (isOwned(r)) { say('Bạn đã có đồ này hoặc tốt hơn rồi'); return; }
  const g = r.give;
  const repeat = bulk && !g.tool;
  const again = autoRefill !== null ? autoRefill : repeat ? RECIPES.indexOf(r) : null;
  let times = 0, made = 0;
  do {
    grid.fill(null); // nguyên liệu đã được trừ khỏi túi lúc đặt vào lưới
    if (g.tool) receiveTool(g.tool, g.tier);
    else if (g.gear) giveGear(g.gear);
    else inv[g.item] += g.n;
    times++; made += g.item ? g.n : 1;
    autoRefill = null;
    if (again !== null && (g.item || repeat)) fillRecipe(again, true); // đặt sẵn lượt kế tiếp nếu còn đủ nguyên liệu
  } while (repeat && autoRefill !== null && times < 999);
  if (repeat && times > 1) noticeItem('Đã chế tạo hàng loạt: ' + r.name + ' ×' + made);
  else noticeItem('Đã chế tạo: ' + r.name + (g.n > 1 ? ' ×' + g.n : ''));
}



// Nón lá: đội lên đầu cho đẹp (cần có nón trong túi; hết nón thì tự bỏ)
let hatOn = false;
function toggleHat() {
  if (!(inv.nonla > 0)) return;
  if (!hatOn && wornGearIn('head')) { say('Hãy cất mũ trước khi đội nón lá'); return; }
  hatOn = !hatOn;
  say(hatOn ? 'Đã đội nón lá' : 'Đã bỏ nón lá xuống');
}

function useItem(id) {
  if (GEAR_IDS.includes(id)) equipFromBag(id);
  else if (MATERIALS.includes(id)) { if (ui === 'inv') held = id; else if (FOOD[id]) eat(id); }
  else if (FOOD[id]) eat(id);
  else if (id === 'potion') usePotion();
  else if (id === 'antidote') useAntidote();
  else if (id === 'dragonpotion') { if (window.FinalBoss) FinalBoss.usePotion(); }
  else if (id === 'torch') useTorch();
  else if (id === 'nonla') toggleHat();
  // Vật phẩm đặt được (bàn, lò, giường, rương, cột thu lôi): chọn trên thanh nhanh rồi bấm chuột trái vào ô muốn đặt
}

const PLACEABLE = ['table', 'furnace', 'mill', 'oven', 'radio', 'pen', 'bed', 'rod', 'darkrod', 'dragonfossil', 'chestbox', ...BUILD.map((b) => b.item)];
let placeOverride = null; // ô đặt lấy theo con trỏ chuột thay vì ô trước mặt

// Bấm chuột trái vào thế giới khi đang chọn món đặt được: đặt xuống ô dưới con trỏ. Trả về true nếu đã xử lý.
// Ô biển (nước nông lội chậm hoặc nước sâu) ở mặt đất: không cho đặt vật phẩm
function isSeaTile(tx, ty) { return layer === 0 && (getTile(tx, ty) === SEA || seaType(tx, ty) >= 2); }
// ===== THUYỀN: chọn Thuyền rồi bấm chuột trái lên mặt nước để đặt thuyền; bấm E gần thuyền để lên, bấm E lần nữa để xuống =====
const BT = { sheet: null, icon: null };
const BT_CW = 242, BT_CH = 172, BT_AX = 121, BT_AY = 120, BT_K = 0.5; // BT_K: tỉ lệ vẽ (nhỏ hơn trước: 0.75)
const BT_ROWS = { move: [1, 8, 11], run: [4, 8, 14], idle: [2, 6, 5], hurt: [3, 6, 10] }; // [hàng, số khung, fps]
const BOAT_SPEED = 1.35;
const BOAT_BOARD_DIST = 80; // E cách thuyền trong tầm này thì lên được
let boating = false, boatFlip = false;
let placedBoats = []; // thuyền đã đặt trên nước (không có người): { x, y, flip }
function isWaterAt(x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return getTile(tx, ty) === SEA || getTile(tx, ty) === WATER || seaType(tx, ty) >= 2;
}
function onBoatWater(x, y) {
  return isWaterAt(x - 9, y - 4) && isWaterAt(x + 9, y - 4) && isWaterAt(x - 9, y + 10) && isWaterAt(x + 9, y + 10);
}
function playerBlocked(x, y) { return collides(x, y, 9, true) || (boating && !onBoatWater(x, y)); }
function nearestPlacedBoat(maxD) {
  if (layer !== 0 || boating) return null;
  let best = null, bd = maxD;
  for (const b of placedBoats) { const d = Math.hypot(b.x - player.x, b.y - player.y); if (d <= bd) { bd = d; best = b; } }
  return best;
}
// Chọn Thuyền + bấm chuột: đặt thuyền xuống ô nước dưới con trỏ (trong tầm với)
function placeBoatAt(camX, camY) {
  if (layer !== 0) { say('Thuyền chỉ dùng ngoài mặt đất'); return; }
  if (boating) { say('Hãy xuống thuyền trước'); return; }
  const tx = Math.floor((mouse.x + camX) / TILE), ty = Math.floor((mouse.y + camY) / TILE);
  const c = tileCenter(tx, ty);
  if (Math.hypot(c.x - player.x, c.y - player.y) > REACH) { say('Quá xa'); return; }
  if (!onBoatWater(c.x, c.y)) { say('Thuyền chỉ đặt được trên mặt nước'); return; }
  if (placedBoats.some((b) => Math.hypot(b.x - c.x, b.y - c.y) < TILE * 0.8)) { say('Chỗ này đã có thuyền'); return; }
  placedBoats.push({ x: c.x, y: c.y, flip: player.faceX < 0 });
  inv.boat--;
  say('Đã đặt thuyền');
}
// Bấm chuột trái lên thuyền đang đậu (tay không, rìu, kiếm... đều được): đập 3 lần thì thuyền vỡ, nhặt lại 1 thuyền
function smashBoatAt(wx, wy) {
  if (layer !== 0 || boating) return false;
  let hit = null;
  for (const b of placedBoats) if (Math.abs(wx - b.x) < 42 && wy > b.y - 34 && wy < b.y + 16) hit = b;
  if (!hit) return false;
  if (Math.hypot(hit.x - player.x, hit.y - player.y) > REACH) { say('Quá xa'); return true; }
  hit.hits = (hit.hits || 0) + 1; hit.shake = 0.25;
  if (hit.hits >= 3) {
    placedBoats.splice(placedBoats.indexOf(hit), 1);
    inv.boat = (inv.boat || 0) + 1;
    say('Đã đập thuyền, thu lại 1 thuyền vào túi');
  } else say('Đập thuyền (' + hit.hits + '/3)');
  return true;
}
// Bấm E: đang trên thuyền thì lên bờ (thuyền ở lại), đang ở gần thuyền thì lên thuyền. Trả về true nếu đã xử lý.
function useBoat() {
  if (layer !== 0) return false;
  if (boating) {
    const cx = Math.floor(player.x / TILE), cy = Math.floor(player.y / TILE);
    let best = null, bd = 1e9;
    for (let r = 0; r <= 3; r++) for (let ox = -r; ox <= r; ox++) for (let oy = -r; oy <= r; oy++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      const c = tileCenter(cx + ox, cy + oy);
      if (collides(c.x, c.y, 9, true) || onBoatWater(c.x, c.y)) continue;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) { say('Chưa có bờ gần đây để lên'); return true; }
    placedBoats.push({ x: player.x, y: player.y, flip: boatFlip }); // thuyền neo lại chỗ vừa đỗ
    player.x = best.x; player.y = best.y;
    boating = false;
    say('Đã lên bờ');
    return true;
  }
  const b = nearestPlacedBoat(BOAT_BOARD_DIST);
  if (!b) return false;
  placedBoats.splice(placedBoats.indexOf(b), 1);
  player.x = b.x; player.y = b.y;
  boatFlip = !!b.flip;
  boating = true;
  say('Lên thuyền! Dùng W/A/S/D để chèo, Shift để chèo nhanh, E để lên bờ.');
  return true;
}
function drawBoat(sx, sy) {
  const st = player.sinceHurt !== undefined && player.sinceHurt < 0.6 ? 'hurt' : player.moving ? (player.running ? 'run' : 'move') : 'idle';
  const [row, n, fps] = BT_ROWS[st];
  const f = Math.floor(gameTime * fps) % n;
  if (player.faceX < 0) boatFlip = true; else if (player.faceX > 0) boatFlip = false;
  const w = BT_CW * BT_K, h = BT_CH * BT_K;
  ctx.save();
  ctx.fillStyle = 'rgba(0,30,60,0.18)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, w * 0.34, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(sx, sy + 8);
  if (boatFlip) ctx.scale(-1, 1);
  ctx.drawImage(BT.sheet, f * BT_CW, row * BT_CH, BT_CW, BT_CH, -BT_AX * BT_K, -BT_AY * BT_K, w, h);
  ctx.restore();
}
// Thuyền không người đang đậu trên nước (nhấp nhô nhẹ)
function drawPlacedBoat(b, camX, camY) {
  const sx = Math.round(b.x - camX), sy = Math.round(b.y - camY);
  if (sx < -80 || sy < -80 || sx > canvas.width + 80 || sy > canvas.height + 80) return;
  if (b.shake > 0) b.shake = Math.max(0, b.shake - 1 / 60);
  const bob = Math.sin(gameTime * 2 + b.x * 0.05) * 1.2 + (b.shake > 0 ? Math.sin(b.shake * 80) * 3 : 0);
  ctx.save();
  ctx.fillStyle = 'rgba(0,30,60,0.18)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(sx, sy + 8 + bob);
  if (b.flip) ctx.scale(-1, 1);
  if (BT.icon) { const k = 76 / BT.icon.width, iw = BT.icon.width * k, ih = BT.icon.height * k; ctx.drawImage(BT.icon, -iw / 2, -ih + 4, iw, ih); }
  else { ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-18, -8, 36, 10); }
  ctx.restore();
}

function placeSelectedAt(camX, camY) {
  const id = slotList()[hotbarSel];
  if (id === 'boat') { if (inv.boat > 0) placeBoatAt(camX, camY); return true; }
  if (id === 'dragonpotion') { if (window.FinalBoss) FinalBoss.usePotion(); return true; } // rắc thuốc lên Hoá Thạch Rồng (final-boss.js)
  if (id === 'dragonfossil' && layer === 3 && arena.kind === 'omni' && window.FinalBoss) { FinalBoss.placeFossil(); return true; } // đặt hoá thạch vào giữa vòng phép
  const isSeed = typeof id === 'string' && id.startsWith('seed_');
  if (!PLACEABLE.includes(id) && !isSeed && id !== 'treeseed') return false;
  const tx = Math.floor((mouse.x + camX) / TILE), ty = Math.floor((mouse.y + camY) / TILE);
  const c = tileCenter(tx, ty);
  if (Math.hypot(c.x - player.x, c.y - player.y) > REACH) { say('Quá xa'); return true; }
  if (houseExitBlocked(tx, ty)) { say('Đừng chặn lối ra của nhà'); return true; }
  if (isSeaTile(tx, ty)) { say('Không đặt được trên biển'); return true; } // biển nông / sâu: cấm đặt mọi thứ
  // Vật cản đặc (trừ vật liệu đi xuyên qua được như thảm, sàn) không được đè lên chỗ người chơi đang đứng, tránh bị đẩy ra / kẹt
  const walkable = BUILD_BY_ITEM[id] && WALKABLE_BUILD.has(BUILD_BY_ITEM[id].tile);
  if (!isSeed && id !== 'pen' && !walkable && tileOverlapsPlayer(tx, ty)) { say('Lùi ra một chút rồi đặt nhé (đang đứng sát ô này)'); return true; }
  if (isSeed) { plantSeed(id, tx, ty); return true; }
  if (id === 'treeseed') { plantTree(tx, ty); return true; }
  placeOverride = { tx, ty };
  if (id === 'rod') placeRod();
  else if (id === 'darkrod') placeDarkRod();
  else if (id === 'dragonfossil') placeFossil();
  else if (id === 'table') placeTable();
  else if (id === 'furnace') placeFurnace();
  else if (id === 'mill') placeStation('mill', MILL, 'máy xay');
  else if (id === 'oven') placeStation('oven', OVEN, 'lò nướng');
  else if (id === 'radio') placeRadio();
  else if (id === 'pen') placePen(tx, ty);
  else if (id === 'chestbox') placeStore();
  else if (id === 'bed') placeBed();
  else if (BUILD_BY_ITEM[id]) placeBuild(id);
  placeOverride = null;
  return true;
}

// Món ăn tốt nhất đang có (phím F)
function bestFood() {
  return ['phobowl', 'cake', 'banhchung', 'beef', 'grilledfish', 'baked', 'pork', 'chicken', 'banhmi', 'cookedflesh', 'orange', 'apple', 'banana', 'veg', 'crop_pineapple', 'crop_pumpkin', 'crop_carrot', 'crop_cucumber', 'crop_cauli', 'crop_bean', 'crop_chili', 'crop_sunflower', 'crop_grape', 'friedegg', 'milk', 'egg', 'rawbeef', 'rawpork', 'rawchicken', 'fish', 'flesh'].find((id) => inv[id] > 0) || 'apple';
}

function eat(id) {
  if (inv[id] <= 0) { say('Bạn không có ' + ITEMS[id].name.toLowerCase()); return; }
  if (player.hunger >= MAX_HUNGER) { say('Bạn đang no'); return; }
  inv[id]--;
  player.hunger = Math.min(MAX_HUNGER, player.hunger + FOOD[id]);
  floaters.push({ x: player.x, y: player.y - 50, text: '+' + FOOD[id] + ' no', life: 1.2, color: '#ffb347' });
  burst(player.x, player.y - 10, '#ffb347', 8, 100, -60);
}

function usePotion() {
  if (inv.potion <= 0) { say('Bạn không có thuốc hồi máu'); return; }
  if (player.hp >= MAX_HP) { say('Máu đã đầy'); return; }
  inv.potion--;
  player.hp = Math.min(MAX_HP, player.hp + POTION_HEAL);
  floaters.push({ x: player.x, y: player.y - 50, text: '+' + POTION_HEAL, life: 1.2, color: '#4cd964' });
  burst(player.x, player.y - 10, '#4cd964', 12, 120, -80);
  if (!witchFlags.potionUse) { // đếm lần uống thuốc để mở học Ánh Sáng Hồi Phục (cần 5 lần)
    witchFlags.potionN = Math.min(5, witchFlags.potionN + 1);
    floaters.push({ x: player.x, y: player.y - 74, text: 'Uống thuốc ' + witchFlags.potionN + '/5', life: 1.4, color: '#ffe9a0' });
    if (witchFlags.potionN >= 5) { witchFlags.potionUse = true; say('Đã uống thuốc hồi máu 5 lần! Phù Thủy có thể dạy Ánh Sáng Hồi Phục'); }
  }
}

function useTorch() {
  if (inv.torch <= 0) { say('Bạn không có đuốc'); return; }
  inv.torch--;
  torchTime = TORCH_TIME;
  say('Đã thắp đuốc');
}

// ---------- Cột Thu Lôi Tím ----------
const DROD_RANGE = 22;      // tầm hút sét (ô)
const DROD_ZAP_R = 4.5 * TILE; // tầm giật điện quái quanh cột khi hút sét
const DROD_ZAP_DMG = 16;    // sát thương mỗi lần hút sét
const DR = { sheet: null, ring: null, icon: null };   // assets/blackmarket/darkrod*.webp
const DR_FW = 150, DR_FH = 260, DR_AX = 75, DR_AY = 210, DR_K = 0.66; // khung 150×260, mỏ neo ở viên kim cương dưới chân cột
const drodFx = new Map(); // khoá ô -> gameTime lúc cột hút sét (để chạy hoạt ảnh sét đánh)
function placeDarkRod() {
  if (inv.darkrod <= 0) { say('Bạn không có Cột Thu Lôi Tím'); return; }
  const { tx, ty } = facingTile();
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) {
    say('Không đặt được ở đây');
    return;
  }
  changes.set(tx + ',' + ty, DROD);
  inv.darkrod--;
  say('Đã đặt Cột Thu Lôi Tím');
}
function drawDarkRod(sx, sy, key) {
  if (!DR.sheet) { drawRod(sx, sy, key); return; }
  const fx = drodFx.get(key), age = fx === undefined ? 99 : gameTime - fx;
  let h = 0; for (let i = 0; i < key.length; i++) h += key.charCodeAt(i);
  let f;
  if (age < 0.7) f = 2;        // sét đánh
  else if (age < 1.1) f = 3;   // kết thúc
  else f = Math.floor(gameTime * 1.6 + h) % 2; // đứng yên <-> phát sáng
  const ox = shakeOffset(key);
  shadow(sx, sy, 18);
  if (age < 0.9 && DR.ring) { // vòng sét lan dưới chân
    const p = age / 0.9, w = DR.ring.width * DR_K * (0.9 + p * 1.8), hh = DR.ring.height * DR_K * (0.9 + p * 1.8);
    ctx.globalAlpha = 1 - p;
    ctx.drawImage(DR.ring, sx + 24 - w / 2, sy + 40 - hh / 2, w, hh);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(DR.sheet, f * DR_FW, 0, DR_FW, DR_FH, Math.round(sx + 24 + ox - DR_AX * DR_K), Math.round(sy + 38 - DR_AY * DR_K), DR_FW * DR_K, DR_FH * DR_K);
}

// ---------- Hoá Thạch Rồng (trang trí) ----------
const FS = { img: null }; // assets/final_boss/fossil.webp (395×228)
const FS_W = 200;         // bề rộng vẽ trong game (px) ≈ 4 ô
function placeFossil() {
  if (inv.dragonfossil <= 0) { say('Bạn không có Hoá Thạch Rồng'); return; }
  const { tx, ty } = facingTile();
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) {
    say('Không đặt được ở đây');
    return;
  }
  changes.set(tx + ',' + ty, FOSSIL);
  inv.dragonfossil--;
  say('Đã đặt Hoá Thạch Rồng (đập bằng cuốc để thu hồi)');
}
function drawFossil(sx, sy) {
  const img = FS.img;
  if (!img) { ctx.fillStyle = '#e6d9b8'; ctx.fillRect(sx + 6, sy + 14, 36, 26); return; }
  const w = FS_W, h = Math.round(FS_W * img.height / img.width);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx + 24, sy + 42, w * 0.42, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(img, Math.round(sx + 24 - w / 2), Math.round(sy + 46 - h), w, h);
}

function placeRod() {
  if (inv.rod <= 0) { say('Bạn không có cột thu lôi'); return; }
  const { tx, ty } = facingTile();
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) {
    say('Không đặt được ở đây');
    return;
  }
  const key = tx + ',' + ty;
  changes.set(key, ROD);
  rodLife.set(key, ROD_LIFE);
  inv.rod--;
  say('Đã đặt cột thu lôi');
}

// Đặt vật liệu xây dựng / trang trí xuống ô đang nhắm. Không giới hạn số lượng.
function placeBuild(id) {
  const b = BUILD_BY_ITEM[id];
  if (!(inv[id] > 0)) { say('Bạn không có ' + b.name.toLowerCase()); return; }
  const { tx, ty } = facingTile();
  const why = buildBlockReason(b, tx, ty);
  if (why) { say(why === 'Ô này không trống' ? 'Không đặt được ở đây' : why); return; }
  changes.set(tx + ',' + ty, b.tile);
  if (ROTATABLE.has(b.tile)) changes.set('r' + tx + ',' + ty, buildRot);
  inv[id]--;
  checkStoneRing();
}

// Đặt khối đá kín cả 4 phía quanh người (ô người đứng) thì mở học Khiên Đá
function checkStoneRing() {
  if (witchFlags.stoneRing) return;
  const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE);
  if ([[0, -1], [0, 1], [-1, 0], [1, 0]].every(([dx, dy]) => getTile(px + dx, py + dy) === SBLOCK)) {
    witchFlags.stoneRing = true;
    say('Đá bao kín quanh người! Phù Thủy có thể dạy Khiên Đá');
  }
}

// Phím R: trỏ chuột vào món đã đặt (xoay được) thì xoay món đó, không thì xoay hướng món sắp đặt
function rotateAction() {
  const camX = player.x - canvas.width / 2, camY = player.y - canvas.height / 2;
  const tx = Math.floor((mouse.x + camX) / TILE), ty = Math.floor((mouse.y + camY) / TILE);
  const p = tileCenter(tx, ty);
  if (ROTATABLE.has(getTile(tx, ty)) && Math.hypot(p.x - player.x, p.y - player.y) < 110) {
    const k = 'r' + tx + ',' + ty;
    const r = ((changes.get(k) || 0) + 1) % 4;
    if (tileOverlapsPlayer(tx, ty, 0) && isSolid(tx, ty)) { say('Có người đứng đó'); return; }
    changes.set(k, r);
    say('Đã xoay: ' + ROT_NAME[r]);
    return;
  }
  buildRot = (buildRot + 1) % 4;
  say('Hướng: ' + ROT_NAME[buildRot]);
}

// Cửa: nhấn E để mở / đóng
function toggleDoor(tx, ty) {
  const t = getTile(tx, ty);
  const to = DOOR_PAIR[t];
  if (!to) return false;
  if (WALKABLE_BUILD.has(t) && tileOverlapsPlayer(tx, ty, 0)) { say('Có người đứng trong cửa, chưa đóng được'); return true; } // đang mở -> đóng
  changes.set(tx + ',' + ty, to);
  say(WALKABLE_BUILD.has(t) ? 'Đã đóng cửa' : 'Đã mở cửa');
  return true;
}
function nearestDoor(maxDist = 90) {
  let best = null, bd = maxDist;
  for (const f of findTiles(WDOOR, 3).concat(findTiles(WDOOR_O, 3), findTiles(IDOOR, 3), findTiles(IDOOR_O, 3))) {
    const p = tileCenter(f.tx, f.ty);
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function placeTable() {
  if (inv.table <= 0) { say('Bạn không có bàn chế tạo'); return; }
  const { tx, ty } = facingTile();
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER) || chests.some((c) => c.tx === tx && c.ty === ty)) {
    say('Không đặt được ở đây');
    return;
  }
  if (tileOverlapsPlayer(tx, ty)) {
    say('Lùi ra một chút rồi đặt nhé (đang đứng sát ô này)');
    return;
  }
  changes.set(tx + ',' + ty, TABLE);
  inv.table--;
  say('Đã đặt bàn chế tạo');
}

// ---------- Va chạm ----------
// Ô (tx,ty) có đè lên hitbox của nhân vật không? (dùng để chặn đặt vật thể làm kẹt người chơi)
function tileOverlapsPlayer(tx, ty, pad = 1) {
  const hw = 9;
  const l = player.x - hw - pad, r = player.x + hw + pad;
  const t = player.y - 4 - pad, b = player.y + 10 + pad;
  return r > tx * TILE && l < (tx + 1) * TILE && b > ty * TILE && t < (ty + 1) * TILE;
}

function collides(px, py, hw = 9, ignoreWater = false) { // ignoreWater: người chơi bơi được, còn zombie / vật nuôi thì không xuống nước
  const pts = [
    [px - hw, py - 4], [px + hw, py - 4],
    [px - hw, py + 10], [px + hw, py + 10],
  ];
  return pts.some(([x, y]) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return isSolid(tx, ty) || (!ignoreWater && layer === 0 && (getTile(tx, ty) === SEA || seaType(tx, ty) >= 2)); });
}

// Có đường nhìn thẳng từ (x0,y0) tới (x1,y1) không? (không bị cây / đá / công trình chắn). Ô (skipTx, skipTy) không tính.
function lineClear(x0, y0, x1, y1, skipTx, skipTy) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor((x0 + (x1 - x0) * t) / TILE), ty = Math.floor((y0 + (y1 - y0) * t) / TILE);
    if (tx === skipTx && ty === skipTy) continue;
    if (isSolid(tx, ty)) return false;
  }
  return true;
}

// Như lineClear nhưng tia có độ dày ±2px và lấy mẫu dày hơn: không lọt qua khe chéo giữa hai ô đặc
// (trước đây tia mảnh chui qua góc chung của 2 ô chéo nhau nên chém xuyên tường được). Dùng cho đòn của người chơi.
function lineClearStrict(x0, y0, x1, y1, skipTx, skipTy) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  const e = 2;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
    for (const [ox, oy] of [[0, 0], [-e, -e], [e, -e], [-e, e], [e, e]]) {
      const tx = Math.floor((px + ox) / TILE), ty = Math.floor((py + oy) / TILE);
      if (tx === skipTx && ty === skipTy) continue;
      if (isSolid(tx, ty)) return false;
    }
  }
  return true;
}

// ---------- Hành động chặt / đào ----------
function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

// Ô ngay trước mặt nhân vật
function facingTile() {
  if (placeOverride) return placeOverride;
  return {
    tx: Math.floor((player.x + player.faceX * 34) / TILE),
    ty: Math.floor((player.y + 3 + player.faceY * 34) / TILE),
  };
}

function currentTarget(camX, camY) {
  let tx, ty;
  if (keys['Space']) {
    ({ tx, ty } = facingTile());
  } else {
    tx = Math.floor((mouse.x + camX) / TILE);
    ty = Math.floor((mouse.y + camY) / TILE);
  }
  const c = tileCenter(tx, ty);
  if (Math.hypot(c.x - player.x, c.y - player.y) > REACH) return null;
  if (!lineClearStrict(player.x, player.y, c.x, c.y, tx, ty)) return null; // bị ô khác chắn: không đập xuyên qua được
  return { tx, ty };
}

function faceTowards(tx, ty) {
  const c = tileCenter(tx, ty);
  const dx = c.x - player.x, dy = c.y - player.y;
  if (Math.abs(dx) > Math.abs(dy)) { player.faceX = Math.sign(dx); player.faceY = 0; }
  else { player.faceX = 0; player.faceY = Math.sign(dy) || 1; }
}


// ---------- Cuốc đất: hoạt ảnh vung (giơ cao -> bổ xuống -> nảy lại) ----------
// Tác dụng lên đất (cày / nhổ cây / lấp đất) xảy ra đúng lúc lưỡi cuốc chạm đất, không phải lúc bấm chuột.
const TOOL_IMG = {};   // 'pickaxe1'..'pickaxe5', 'axe', 'sword', 'hoe': ảnh icon theo cấp (gỗ, đá, sắt, vàng, kim cương)
let EMERALD_IMG = null;          // [cấp] = sprite 17x17 (gỗ / đá / sắt)
const HOE_TIME = BALANCE.craft.hoeTime;       // giây cho một nhát
const HOE_HIT_AT = 0.6;      // lúc lưỡi chạm đất (0..1 trong nhát)
const HOE_LEN = 52;          // chiều dài cuốc khi vung (pixel màn hình)
let hoeSwing = null;         // { t, tx, ty, apply, done, tool, tier }

function startHoeSwing(tx, ty, apply) {
  const held = heldTool() === 'hoe';
  hoeSwing = { t: 0, tx, ty, apply, done: false, tool: held, tier: tools[heldToolKey()] || tools.hoe };
  hitTimer = HOE_TIME + 0.03;
  if (!(player.faceX || player.faceY)) player.faceY = 1;
}

function updateHoeSwing(dt) {
  if (!hoeSwing) return;
  hoeSwing.t += dt / HOE_TIME;
  if (!hoeSwing.done && hoeSwing.t >= HOE_HIT_AT) {
    hoeSwing.done = true;
    const c = tileCenter(hoeSwing.tx, hoeSwing.ty);
    shake = Math.max(shake, 0.12);
    burst(c.x, c.y + 6, '#9a6a4c', 6, 110, 700); // bụi đất bật lên khi lưỡi cuốc cắm xuống
    spawnToolFx(hoeSwing.tool ? 'hoe' : 'hand', c.x, c.y + 14);
    hoeSwing.apply();
  }
  if (hoeSwing.t >= 1) hoeSwing = null;
}

// Độ nhún của thân người theo nhát cuốc (ngả ra sau lúc giơ, chúi xuống lúc bổ)
function hoeBob() {
  if (!hoeSwing) return 0;
  const p = hoeSwing.t;
  if (p < 0.3) return -p / 0.3 * 2;
  if (p < HOE_HIT_AT) return -2 + (p - 0.3) / (HOE_HIT_AT - 0.3) * 6;
  return 4 * (1 - Math.min(1, (p - HOE_HIT_AT) / (1 - HOE_HIT_AT)));
}

function drawHoeSwing(sx, sy) {
  const sw = hoeSwing;
  const p = Math.min(1, sw.t);
  const dir = player.faceX < 0 ? -1 : 1;
  const lerp = (a, b, u) => a + (b - a) * u;
  let a; // góc của cuốc (rad, màn hình, khi quay phải): -π/2 = thẳng lên, 0 = ngang về trước, + = chúi xuống
  if (p < 0.3) { const u = p / 0.3; a = lerp(-0.35, -2.55, 1 - (1 - u) * (1 - u)); }               // giơ lên sau lưng
  else if (p < HOE_HIT_AT) { const u = (p - 0.3) / (HOE_HIT_AT - 0.3); a = lerp(-2.55, 0.95, u * u); } // bổ xuống, nhanh dần
  else { const u = (p - HOE_HIT_AT) / (1 - HOE_HIT_AT); a = lerp(0.95, 0.6, 1 - (1 - u) * (1 - u)); }  // nảy lại nhẹ
  const hx = sx + (player.faceX !== 0 ? player.faceX * 12 : 10), hy = sy - 14 + hoeBob();
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(dir, 1);
  // vệt chém trắng theo đường lưỡi cuốc đi qua (chỉ lúc bổ xuống)
  if (p > 0.3 && p < HOE_HIT_AT + 0.12) {
    const fade = p < HOE_HIT_AT ? 1 : 1 - (p - HOE_HIT_AT) / 0.12;
    ctx.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      const a1 = a - k * 0.13, a0 = a1 - 0.14;
      if (a0 < -2.55) break;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * (1 - k / 9) * fade).toFixed(3) + ')';
      ctx.lineWidth = 6 * (1 - k / 9) + 1;
      ctx.beginPath(); ctx.arc(0, 0, HOE_LEN * 0.9, a0, a1); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  if (sw.tool && TOOL_IMG['hoe' + sw.tier]) {
    ctx.rotate(a + Math.PI / 4); // sprite gốc chĩa chéo lên phải (-45°)
    const size = HOE_LEN / 22.6 * 17; // ảnh vuông, đầu cán ở góc dưới trái
    ctx.drawImage(TOOL_IMG['hoe' + sw.tier], -size * 0.1, -size * 0.92, size, size);
  }
  ctx.restore();
}

// ---------- Bình tưới: hoạt ảnh nghiêng bình, nước rót xuống cây ----------
// Nâng bình lên -> nghiêng dần -> nước chảy thành dòng hạt rơi xuống ô cây (nảy tung toé) -> đưa bình về.
// Tác dụng (cây ướt, lớn nhanh) xảy ra lúc nước chạm cây, không phải lúc bấm chuột.
const ARMOR_IMG = {};  // 'iron_head' ... ảnh biểu tượng giáp
const ARMOR_FR = {};   // 'iron_front', 'iron_side' ... atlas giáp theo từng khung chuyển động (4 món x 9 khung, ô 32x20)
const ARMOR_BODY = {}; // 'diamond_walk' ... sheet nhân vật mặc nguyên bộ giáp (ô 80x80, 4 hàng hướng như sprite gốc)
let DIAMOND_IMG = null;
let WATERCAN_IMG = null;      // sprite pixel 41x27, vòi hướng sang phải
const WATER_TIME = 1.3;       // giây cho một lần tưới
const WATER_POUR_FROM = 0.26, WATER_POUR_TO = 0.8;   // khoảng (0..1) nước đang rót
const WATER_APPLY_AT = 0.42;  // lúc nước chạm cây
const BUCKET_TILT = 1.35;     // xô nghiêng nhiều hơn bình tưới
const WATER_SCALE = 0.72;     // tỉ lệ vẽ bình trên tay nhân vật
const WATER_PIVOT = [14, 13], WATER_SPOUT = [39, 9]; // điểm cầm và đầu vòi trong sprite
let waterSwing = null;        // { t, tx, ty, done, acc, splash }

function startWaterSwing(tx, ty, opts) {
  waterSwing = { t: 0, tx, ty, done: false, acc: 0, splash: 0, bucket: !!(opts && opts.bucket), apply: opts && opts.apply };
  hitTimer = WATER_TIME + 0.03;
  if (!(player.faceX || player.faceY)) player.faceY = 1;
}

// Góc nghiêng của bình (rad, dương = chúi vòi xuống) theo tiến độ 0..1
function waterTilt(p, k = 1) {
  const ease = (u) => u * u * (3 - 2 * u);
  if (p < WATER_POUR_FROM) return (0.05 + ease(p / WATER_POUR_FROM) * 0.75) * k;
  if (p < WATER_POUR_TO) return (0.8 + Math.sin(p * 70) * 0.035) * k;       // giữ nghiêng, hơi rung tay
  return 0.8 * k * (1 - ease((p - WATER_POUR_TO) / (1 - WATER_POUR_TO)));
}

// Vị trí tay cầm bình (toạ độ thế giới)
function waterHandPos() { return { x: player.x + (player.faceX !== 0 ? player.faceX * 16 : 12), y: player.y - 8 }; }

// Đầu vòi bình (toạ độ thế giới) ở tiến độ p
function waterSpoutPos(p, bucket) {
  const h = waterHandPos(), dir = player.faceX < 0 ? -1 : 1, a = waterTilt(p, bucket ? BUCKET_TILT : 1);
  const vx = bucket ? 20 : (WATER_SPOUT[0] - WATER_PIVOT[0]) * WATER_SCALE, vy = bucket ? -8 : (WATER_SPOUT[1] - WATER_PIVOT[1]) * WATER_SCALE;
  return { x: h.x + dir * (vx * Math.cos(a) - vy * Math.sin(a)), y: h.y + vx * Math.sin(a) + vy * Math.cos(a) };
}

function updateWaterSwing(dt) {
  const sw = waterSwing;
  if (!sw) return;
  sw.t += dt / WATER_TIME;
  if (sw.t >= WATER_POUR_FROM + 0.04 && sw.t <= WATER_POUR_TO) { // dòng nước: bắn từng giọt từ vòi tới ô cây theo đường cong
    sw.acc += dt;
    const tc = tileCenter(sw.tx, sw.ty), g = 720;
    while (sw.acc >= 0.02) {
      sw.acc -= 0.02;
      const sp = waterSpoutPos(sw.t, sw.bucket), T = 0.34 + Math.random() * 0.08;
      const gx = tc.x + (Math.random() - 0.5) * 22, gy = tc.y + 4 + (Math.random() - 0.5) * 10;
      particles.push({
        x: sp.x, y: sp.y, life: T, max: T, gravity: g,
        vx: (gx - sp.x) / T, vy: (gy - sp.y - 0.5 * g * T * T) / T,
        color: Math.random() < 0.3 ? '#d6eeff' : '#3d97ff', size: 3 + Math.random() * 2,
      });
    }
  }
  if (sw.t >= WATER_POUR_FROM + 0.3 && sw.t <= WATER_POUR_TO + 0.3) { // nước chạm đất: tung toé
    sw.splash += dt;
    const tc = tileCenter(sw.tx, sw.ty);
    while (sw.splash >= 0.06) {
      sw.splash -= 0.06;
      burst(tc.x + (Math.random() - 0.5) * 20, tc.y + 6, Math.random() < 0.5 ? '#cfeaff' : '#7fbfff', 2, 70, 520);
    }
  }
  if (!sw.done && sw.t >= WATER_APPLY_AT) { sw.done = true; if (sw.apply) sw.apply(sw.tx, sw.ty); else applyWater(sw.tx, sw.ty); }
  if (sw.t >= 1) waterSwing = null;
}

function drawWaterSwing(sx, sy) {
  const sw = waterSwing;
  const dir = player.faceX < 0 ? -1 : 1;
  const hx = sx + (player.faceX !== 0 ? player.faceX * 16 : 12), hy = sy - 8;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(dir, 1);
  ctx.rotate(waterTilt(Math.min(1, sw.t), sw.bucket ? BUCKET_TILT : 1));
  if (sw.bucket) { // xô: quai cầm, thân xô, nước ở miệng xô cạn dần khi đổ
    ctx.strokeStyle = '#7b838e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(10, -8, 8, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#aab2bd'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(20, -8); ctx.lineTo(17, 10); ctx.lineTo(3, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d6dde6'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(20, -8); ctx.lineTo(19.3, -4); ctx.lineTo(0.7, -4); ctx.closePath(); ctx.fill();
    if (sw.t < WATER_POUR_TO) { ctx.fillStyle = '#3d97ff'; ctx.beginPath(); ctx.ellipse(10, -7.5, 9, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
  } else if (WATERCAN_IMG) {
    const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(WATERCAN_IMG, -WATER_PIVOT[0] * WATER_SCALE, -WATER_PIVOT[1] * WATER_SCALE, 41 * WATER_SCALE, 27 * WATER_SCALE);
    ctx.imageSmoothingEnabled = sm;
  } else {
    ctx.fillStyle = '#3f6fd0'; ctx.fillRect(-8, -8, 16, 14); ctx.fillRect(6, -6, 14, 3);
  }
  ctx.restore();
}

// Nước chạm cây: cây ướt thêm WET_TIME giây, lớn nhanh gấp WATER_MULT lần trong thời gian đó
function applyWater(tx, ty) { if (wetCrop(tx, ty)) spendWatercanUse(); }
function wetCrop(tx, ty) {
  const c = cropAt(tx, ty);
  if (!c || !CROPS[c.k]) return false;
  cropSync(c);
  c.we = farmClock + WET_TIME;
  c.wl = farmClock;
  const p = tileCenter(tx, ty);
  burst(p.x, p.y + 4, '#9fd0ff', 14, 120, 520);
  floaters.push({ x: p.x, y: p.y - 28, text: 'Đã tưới · lớn nhanh x' + WATER_MULT, life: 1.5, color: '#7fc4ff' });
  return true;
}

// Trừ một lượt dùng của bình tưới; hết lượt thì bình hỏng
function spendWatercanUse() {
  if (!(canUses > 0)) canUses = WATERCAN_USES;
  canUses--;
  if (canUses <= 0) { inv.watercan = 0; canUses = 0; say('Bình tưới đã hết dùng! Mua cái mới ở chợ'); burst(player.x, player.y - 20, '#7fbfff', 14, 160); }
  else say('Bình tưới còn ' + canUses + ' / ' + WATERCAN_USES + ' lần');
}

// Bấm bình tưới vào ô (tx, ty): kiểm tra rồi bắt đầu hoạt ảnh tưới
function waterCrop(tx, ty) {
  const c = cropAt(tx, ty);
  if (!c || !CROPS[c.k]) { hitTimer = 0.3; say('Bình tưới dùng cho ô ruộng đã có cây'); return true; }
  const d = CROPS[c.k];
  if (cropStage(c) === 2) { hitTimer = 0.3; say(d.name + ' đã chín rồi, thu hoạch thôi!'); return true; }
  if (cropWet(c) && c.we - farmClock > WET_REFILL) { hitTimer = 0.3; say(d.name + ' còn ẩm (' + Math.ceil(c.we - farmClock) + 's), chờ chút rồi tưới lại'); return true; }
  startWaterSwing(tx, ty);
  return true;
}

// ---------- Xô: múc nước, đổ nước ----------
// Xô rỗng bấm vào nước (hầm mỏ, vũng đầm lầy, ao tự đổ) -> đầy nước. Xô đầy bấm vào cây trồng (tưới), đất trống (thành ao), dung nham (nguội thành đá).
const bucketHeld = () => slotList()[hotbarSel] === 'bucket' && inv.bucket > 0 && (layer === 0 || layer === 1);
function waterSourceAt(tx, ty) {
  const t = getTile(tx, ty);
  if (t === WATER) return true;
  if (layer === 0 && t === SEA) return true;
  return layer === 0 && t === GRASS && !villageAt(tx, ty) && (swampType(tx, ty) === 2 || seaType(tx, ty) >= 2);
}
function canPourAt(tx, ty) {
  const t = getTile(tx, ty);
  if (t === LAVA) return true;
  if (layer === 0 && t === FARM) return !!cropAt(tx, ty);
  if (t !== GRASS || waterSourceAt(tx, ty)) return false;
  if (layer === 0 && villageAt(tx, ty)) return false;
  return !chests.some((ch) => ch.tx === tx && ch.ty === ty);
}
function pourWaterTile(tx, ty) {
  if (getTile(tx, ty) !== GRASS) return;
  const c = tileCenter(tx, ty);
  changes.set(tx + ',' + ty, WATER);
  bucketWater = false;
  burst(c.x, c.y, '#9fd0ff', 16, 140, 520);
  floaters.push({ x: c.x, y: c.y - 24, text: 'Đổ nước', life: 1.1, color: '#7fc4ff' });
  say('Đã đổ nước ra đất');
}
function bucketWetCrop(tx, ty) {
  if (wetCrop(tx, ty)) { bucketWater = false; say('Đã tưới cây bằng xô · xô hết nước'); }
}
// Trả về true nếu xô đã xử lý cú bấm (còn không thì rơi về cách xử lý cũ: đào / thu hoạch...)
function bucketHit(tx, ty) {
  if (!bucketHeld()) return false;
  const t = getTile(tx, ty), c = tileCenter(tx, ty);
  if (bucketLava) { // xô đầy dung nham: chỉ đổ được xuống nền hầm trống
    if (t === GRASS && !(layer === 0 && villageAt(tx, ty)) && !waterSourceAt(tx, ty) && !chests.some((q) => q.tx === tx && q.ty === ty) && !tileOverlapsPlayer(tx, ty, 0)) {
      hitTimer = 0.5; changes.set(tx + ',' + ty, LAVA); bucketLava = false;
      burst(c.x, c.y, '#ff8a2a', 16, 150, 520);
      floaters.push({ x: c.x, y: c.y - 24, text: 'Đổ dung nham', life: 1.1, color: '#ff8a2a' });
      say('Đã đổ dung nham');
    } else { hitTimer = 0.3; say('Xô đang đầy dung nham'); }
    return true;
  }
  if (!bucketWater) {
    if (t === LAVA) { // múc dung nham: ô dung nham biến mất
      hitTimer = 0.5; bucketLava = true; changes.set(tx + ',' + ty, GRASS);
      burst(c.x, c.y, '#ff8a2a', 14, 130, 520);
      floaters.push({ x: c.x, y: c.y - 24, text: 'Múc dung nham', life: 1.1, color: '#ff8a2a' });
      say('Đã múc đầy xô dung nham');
      return true;
    }
    if (!waterSourceAt(tx, ty)) return false;
    hitTimer = 0.5;
    bucketWater = true;
    if (t === WATER) changes.set(tx + ',' + ty, GRASS); // múc xong thì ô nước vừa múc biến mất (ô nước tự nhiên của vũng đầm lầy thì không mất)
    burst(c.x, c.y, '#9fd0ff', 14, 120, 520);
    floaters.push({ x: c.x, y: c.y - 24, text: 'Múc nước', life: 1.1, color: '#7fc4ff' });
    say('Đã múc đầy xô nước');
    return true;
  }
  if (t === LAVA) {
    hitTimer = 0.5;
    changes.set(tx + ',' + ty, ROCK);
    bucketWater = false;
    burst(c.x, c.y, '#d8dde3', 18, 170);
    say('Đã làm nguội dung nham thành đá');
    return true;
  }
  if (waterSourceAt(tx, ty)) { hitTimer = 0.3; say('Chỗ này đã có nước rồi'); return true; }
  if (layer === 0 && t === FARM) {
    const cr = cropAt(tx, ty), d = cr && CROPS[cr.k];
    if (!d) { hitTimer = 0.3; say('Ô ruộng chưa có cây. Gieo hạt rồi hãy tưới'); return true; }
    if (cropStage(cr) === 2) { hitTimer = 0.3; say(d.name + ' đã chín rồi, thu hoạch thôi!'); return true; }
    if (cropWet(cr) && cr.we - farmClock > WET_REFILL) { hitTimer = 0.3; say(d.name + ' còn ẩm (' + Math.ceil(cr.we - farmClock) + 's), chờ chút rồi tưới lại'); return true; }
    startWaterSwing(tx, ty, { bucket: true, apply: bucketWetCrop });
    return true;
  }
  if (t === GRASS) {
    if (!canPourAt(tx, ty)) { hitTimer = 0.3; say(layer === 0 && villageAt(tx, ty) ? 'Không đổ nước trong làng được' : 'Không đổ nước ở đây được'); return true; }
    startWaterSwing(tx, ty, { bucket: true, apply: pourWaterTile });
    return true;
  }
  hitTimer = 0.3;
  say('Xô đang đầy nước');
  return true;
}

// ---------- Trồng trọt: cày đất, gieo hạt, thu hoạch ----------
let farmClock = 0; // giây trồng trọt: chạy cả ngày lẫn đêm (mưa chạy nhanh hơn, ngủ qua đêm cộng thêm), lưu cùng game
const SEED_CHANCE = BALANCE.craft.seedChance; // xác suất bới ra hạt giống khi cày một ô cỏ

function cropAt(tx, ty) { return changes.get('c' + tx + ',' + ty) || null; }

// Tưới cây: c.we = lúc hết ẩm, c.wl = lần cuối tính thưởng, c.b = số giây "tuổi" cây được cộng thêm nhờ tưới
function cropSync(c) {
  if (c.we === undefined || !(farmClock > c.wl)) return;
  const wet = Math.min(farmClock, c.we) - c.wl;
  if (wet > 0) c.b = (c.b || 0) + wet * (WATER_MULT - 1);
  c.wl = farmClock;
  if (farmClock >= c.we) { delete c.we; delete c.wl; }
}
const cropWet = (c) => c.we !== undefined && c.we > farmClock;
// Tuổi hiệu dụng (từ lúc gieo, hoặc từ lần hái gần nhất với cây ra quả lại) đã tính cả phần tưới
function cropAge(c) { cropSync(c); return farmClock - (c.h !== undefined ? c.h : c.t) + (c.b || 0); }

// 0 mầm · 1 đang lớn · 2 chín · 3 trơ cành chờ ra quả lại
function cropStage(c) {
  const d = CROPS[c.k], age = cropAge(c);
  if (c.h !== undefined) return age >= d.regrow ? 2 : 3;
  return age >= d.st * 2 ? 2 : age >= d.st ? 1 : 0;
}

function randomSeedKind() {
  const ks = Object.keys(CROPS);
  let r = Math.random() * ks.reduce((sum, k) => sum + CROPS[k].wt, 0);
  for (const k of ks) { r -= CROPS[k].wt; if (r <= 0) return k; }
  return ks[0];
}

// Ruộng: đất nâu đỏ có luống cày (cùng tông với mảng đất dưới gốc cây trong plants.webp)
function drawFarmSoil(tx, ty, bx, by, hv) {
  ctx.fillStyle = hv < 0.33 ? '#6a382b' : hv < 0.66 ? '#643427' : '#6f3c2e';
  ctx.fillRect(bx, by, TILE + 1, TILE + 1);
  ctx.fillStyle = '#51291f';
  for (let i = 0; i < 4; i++) ctx.fillRect(bx, by + 6 + i * 12, TILE + 1, 3);
  ctx.fillStyle = '#7d4535';
  for (let i = 0; i < 4; i++) ctx.fillRect(bx, by + 9 + i * 12, TILE + 1, 2);
  if (hv > 0.8) { ctx.fillStyle = '#8a5240'; ctx.fillRect(bx + 10 + Math.floor(hv * 12), by + 15, 5, 3); }
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; // viền tối ở mép ruộng
  if (getTile(tx, ty - 1) !== FARM) ctx.fillRect(bx, by, TILE + 1, 2);
  if (getTile(tx, ty + 1) !== FARM) ctx.fillRect(bx, by + TILE - 2, TILE + 1, 3);
  if (getTile(tx - 1, ty) !== FARM) ctx.fillRect(bx, by, 2, TILE + 1);
  if (getTile(tx + 1, ty) !== FARM) ctx.fillRect(bx + TILE - 2, by, 3, TILE + 1);
}

function drawCrop(c, sx, sy) {
  const d = CROPS[c.k];
  if (!d) return;
  const st = cropStage(c);
  const w = d.sw * d.scale, h = d.sh * d.scale;
  if (cropWet(c)) { // đất ẩm: tối hơn, lấp lánh vài giọt nước
    ctx.fillStyle = 'rgba(25,45,90,0.26)';
    ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
    ctx.fillStyle = 'rgba(160,215,255,0.8)';
    for (let i = 0; i < 3; i++) {
      const ph = (gameTime * 0.7 + i / 3 + (sx * 0.013 + sy * 0.017)) % 1;
      ctx.fillRect(Math.round(sx + 8 + i * 15), Math.round(sy + 8 + ph * 30), 2, 2);
    }
  }
  if (!NATURE.plants) { ctx.fillStyle = st === 2 ? '#d9a021' : '#4aa83a'; ctx.fillRect(sx + 18, sy + TILE - 12 - st * 6, 12, 8 + st * 6); return; }
  if (d.filter) ctx.filter = d.filter;
  ctx.drawImage(NATURE.plants, d.sx + st * d.step, d.sy, d.sw, d.sh, Math.round(sx + TILE / 2 - w / 2), Math.round(sy + TILE - 5 - h), Math.round(w), Math.round(h));
  if (d.filter) ctx.filter = 'none';
}

// ---------- Quãng đường đi bộ: đủ 1000 mét (1 ô = 1 mét) thì học được Chúa Tể Không Gian (V, hệ Không Gian) ----------
const WALK_GOAL = 1000;
let walkPrev = null, walkNote = 0;
function updateWalk(dt) {
  if (witchFlags.walkKill || outsideTick || deathScreen) { walkPrev = null; return; }
  if (walkPrev && walkPrev.layer === layer) {
    const d = Math.hypot(player.x - walkPrev.x, player.y - walkPrev.y);
    if (d > 0 && d <= 600 * dt + 4) { // nhảy xa trong 1 khung hình = dịch chuyển / vào nhà / đổi tầng: không tính
      witchFlags.walkN = Math.min(WALK_GOAL, witchFlags.walkN + d / TILE);
      if (witchFlags.walkN >= WALK_GOAL) { witchFlags.walkKill = true; say('Đã đi bộ 1000 mét! Phù Thủy có thể dạy Chúa Tể Không Gian'); }
      else if (Math.floor(witchFlags.walkN / 100) > walkNote) { walkNote = Math.floor(witchFlags.walkN / 100); floaters.push({ x: player.x, y: player.y - 74, text: 'Đã đi ' + walkNote * 100 + '/1000 m', life: 1.4, color: '#9fd8ff' }); }
    }
  }
  walkPrev = { x: player.x, y: player.y, layer };
}

// ---------- Hạt Cây: chặt cây có tỉ lệ rớt hạt, trồng xuống ô cỏ thành cây mới (mở học Dây Leo Trói Buộc / Sinh Mệnh Hoa của hệ Tự Nhiên) ----------
const TREESEED_CHANCE = 0.3, SAPLING_GROW = 90; // xác suất rớt hạt khi chặt xong 1 cây · số giây trồng trọt (farmClock) để mầm thành cây
let saplingList = [], saplingScanT = 0;
function treeChopped(c) {
  if (Math.random() < TREESEED_CHANCE) spawnLoot('treeseed', 1, c.x, c.y);
  if (!witchFlags.chopKill) { // đếm cây đã chặt để mở học Dây Leo Trói Buộc (cần 10 cây)
    witchFlags.chopN = Math.min(10, witchFlags.chopN + 1);
    floaters.push({ x: player.x, y: player.y - 74, text: 'Chặt cây ' + witchFlags.chopN + '/10', life: 1.4, color: '#9be34a' });
    if (witchFlags.chopN >= 10) { witchFlags.chopKill = true; say('Đã chặt 10 cây! Phù Thủy có thể dạy Dây Leo Trói Buộc'); }
  }
}
function scanSaplings() {
  saplingList = [];
  for (const [k, v] of changes) {
    if (k.charCodeAt(0) !== 115 || !v || typeof v !== 'object') continue; // khoá 's<tx>,<ty>'
    const [tx, ty] = k.slice(1).split(',').map(Number);
    saplingList.push({ k, tx, ty, t: v.t });
  }
}
function plantTree(tx, ty) {
  if (!(inv.treeseed > 0)) return false;
  if (layer !== 0 || getTile(tx, ty) !== GRASS || cropAt(tx, ty) || changes.has('s' + tx + ',' + ty)) { say('Hạt Cây chỉ trồng được trên ô cỏ trống'); return false; }
  changes.set('s' + tx + ',' + ty, { t: farmClock });
  inv.treeseed--;
  scanSaplings();
  const c = tileCenter(tx, ty);
  burst(c.x, c.y + 8, '#5fae3a', 8, 90);
  floaters.push({ x: c.x, y: c.y - 24, text: 'Gieo mầm cây', life: 1, color: '#9be34a' });
  if (!witchFlags.plantKill) { // đếm cây đã trồng để mở học Sinh Mệnh Hoa (cần 5 cây)
    witchFlags.plantN = Math.min(5, witchFlags.plantN + 1);
    floaters.push({ x: player.x, y: player.y - 74, text: 'Trồng cây ' + witchFlags.plantN + '/5', life: 1.4, color: '#9be34a' });
    if (witchFlags.plantN >= 5) { witchFlags.plantKill = true; say('Đã trồng 5 cây! Phù Thủy có thể dạy Sinh Mệnh Hoa'); }
  }
  return true;
}
function updateSaplings(dt) {
  if (layer !== 0) return;
  saplingScanT -= dt;
  if (saplingScanT > 0) return;
  saplingScanT = 1;
  scanSaplings();
  for (const s of saplingList) {
    if (farmClock - s.t < SAPLING_GROW) continue;
    if (getTile(s.tx, s.ty) !== GRASS) { changes.delete(s.k); continue; } // ô đã bị xây đè
    if (tileOverlapsPlayer(s.tx, s.ty)) continue; // người chơi đang đứng đó: chờ
    changes.delete(s.k);
    changes.set(s.tx + ',' + s.ty, TREE);
    const c = tileCenter(s.tx, s.ty);
    burst(c.x, c.y, '#5fae3a', 12, 160);
  }
  scanSaplings();
}
function drawSaplings(camX, camY) {
  for (const s of saplingList) {
    const sx = s.tx * TILE - camX, sy = s.ty * TILE - camY;
    if (sx < -TILE || sy < -TILE || sx > canvas.width + TILE || sy > canvas.height + TILE) continue;
    const p = Math.min(1, Math.max(0, (farmClock - s.t) / SAPLING_GROW)), k = 0.45 + 0.55 * p, cx = sx + TILE / 2, by = sy + TILE - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.ellipse(cx, by, 9 * k + 3, 3.5, 0, 0, 6.28); ctx.fill();
    ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 2 + p; ctx.beginPath(); ctx.moveTo(cx, by); ctx.lineTo(cx, by - 18 * k); ctx.stroke();
    ctx.fillStyle = '#4aa83a'; ctx.beginPath(); ctx.ellipse(cx - 6 * k, by - 16 * k, 6 * k, 3.2 * k, -0.5, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#5fd068'; ctx.beginPath(); ctx.ellipse(cx + 6 * k, by - 20 * k, 6 * k, 3.2 * k, 0.5, 0, 6.28); ctx.fill();
  }
}

// Chữ gợi ý khi trỏ chuột vào cây đang trồng / ruộng trống
function drawCropLabel(tx, ty, camX, camY) {
  const c = cropAt(tx, ty);
  const x = tx * TILE - camX + TILE / 2, y = ty * TILE - camY - 6;
  ctx.textAlign = 'center';
  if (!c || !CROPS[c.k]) {
    ctx.font = '12px sans-serif';
    shadowText('Chuột phải: lấp đất', x, y, '#e6c9ad');
    return;
  }
  const d = CROPS[c.k], st = cropStage(c);
  let txt;
  if (st === 2) txt = d.name + ' đã chín - bấm để thu hoạch';
  else if (st === 3) txt = d.name + ' đang ra quả lại...';
  else txt = d.name + ' đang lớn ' + Math.min(99, Math.floor(cropAge(c) / (d.st * 2) * 100)) + '%';
  if (st < 2 && cropWet(c)) txt += ' · đã tưới (' + Math.ceil(c.we - farmClock) + 's)';
  ctx.font = 'bold 14px sans-serif';
  shadowText(txt, x, y - 15, st === 2 ? '#ffd34d' : '#e8f5d0');
  ctx.font = '12px sans-serif';
  shadowText('Chuột phải: nhổ bỏ', x, y, '#ffb3a3');
}

// Icon hạt giống (túi nhỏ) và nông sản (cắt trong supplies.webp, riêng lúa mì / cà rốt vẽ tay)
function drawCropIcon(id) {
  const k = id.slice(5), d = CROPS[k];
  if (!d) return;
  if (id.startsWith('seed_')) {
    mkOval(16, 27, 11, 3.5, 'rgba(0,0,0,0.2)');
    poly([[9, 12], [23, 12], [27, 27], [5, 27]], '#c9a064');
    poly([[9, 12], [23, 12], [24.5, 16], [7.5, 16]], '#a9803f');
    mkLine(9, 11, 23, 11, '#6b4a1e', 2.4);
    poly([[11, 5], [16, 10], [21, 5], [16, 8]], '#a9803f');
    mkDot(16, 22, 4.2, d.color);
    mkDot(14.8, 20.8, 1.3, 'rgba(255,255,255,0.6)');
    return;
  }
  if (d.ico && NATURE.supplies) {
    const sc = Math.min(28 / d.ico[2], 28 / d.ico[3]), w = d.ico[2] * sc, h = d.ico[3] * sc;
    ctx.drawImage(NATURE.supplies, d.ico[0], d.ico[1], d.ico[2], d.ico[3], 16 - w / 2, 16 - h / 2, w, h);
    return;
  }
  ctx.lineCap = 'round';
  if (k === 'rice') {
    [[10, -3], [16, 0], [22, 3]].forEach(([x, dx]) => {
      mkLine(x, 29, x + dx, 8, '#9aa05a', 2);
      for (let i = 0; i < 5; i++) mkOval(x + dx + (i % 2 ? 2.4 : -2.4), 6 + i * 3.6, 2.2, 3, i % 2 ? '#e8ecb0' : '#cfd68a');
    });
    mkLine(8, 26, 24, 26, '#8a5a2b', 2.4);
  } else if (k === 'herb') {
    for (const [x, y, r, c] of [[16, 10, 7, '#4fae3f'], [9, 17, 6, '#3f9a3a'], [23, 17, 6, '#5cc24a'], [16, 22, 6, '#46a83a']]) mkOval(x, y, r, r * 0.8, c);
    mkLine(16, 29, 16, 14, '#2f7a2a', 2);
  } else if (k === 'sunflower') {
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; mkOval(16 + Math.cos(a) * 9, 13 + Math.sin(a) * 9, 4, 2.4, '#f6c41c'); }
    mkDot(16, 13, 6, '#6b4423'); mkDot(14, 11, 1.6, '#8a5a2b');
    mkLine(16, 20, 16, 30, '#3f8f3a', 2.4);
  } else if (k === 'grape') {
    for (const [x, y] of [[11, 12], [17, 12], [23, 12], [14, 18], [20, 18], [17, 24]]) { mkDot(x, y, 4.2, '#7a3ea8'); mkDot(x - 1.2, y - 1.2, 1.2, 'rgba(255,255,255,0.45)'); }
    mkLine(17, 8, 17, 3, '#5a3a1e', 2); mkOval(22, 4, 5, 2.6, '#4fae3f');
  } else if (k === 'wheat') {
    [[9, -4], [16, 0], [23, 4]].forEach(([x, dx]) => {
      mkLine(x, 29, x + dx, 8, '#b8962a', 2);
      for (let i = 0; i < 5; i++) { const yy = 4 + i * 3.4; mkOval(x + dx + (i % 2 ? 2 : -2), yy + 3, 2.4, 3, i % 2 ? '#f2cf5b' : '#e0b43a'); }
      mkOval(x + dx, 3, 2.2, 3.2, '#f2cf5b');
    });
    mkLine(8, 25, 24, 25, '#8a5a2b', 2.4);
  } else { // cà rốt
    mkLine(16, 12, 11, 3, '#3f8f3a', 2.6); mkLine(16, 12, 16, 1, '#4fae3f', 2.6); mkLine(16, 12, 21, 3, '#3f8f3a', 2.6);
    poly([[10, 12], [22, 12], [16, 30]], '#f08a24');
    poly([[10, 12], [14, 12], [15, 26]], '#f8b45a');
    mkLine(12, 17, 17, 17, '#c96a14', 1.2); mkLine(14, 22, 18, 22, '#c96a14', 1.2);
  }
  ctx.lineCap = 'butt';
}

// Gieo hạt giống xuống ruộng
function plantSeed(id, tx, ty) {
  const k = id.slice(5), d = CROPS[k];
  if (!d || !(inv[id] > 0)) return false;
  if (layer !== 0 || getTile(tx, ty) !== FARM) { say('Hạt giống chỉ gieo được trên đất đã cày (dùng cuốc đất)'); return false; }
  if (cropAt(tx, ty)) { say('Ô này đã có cây rồi'); return false; }
  changes.set('c' + tx + ',' + ty, { k, t: farmClock });
  inv[id]--;
  const c = tileCenter(tx, ty);
  burst(c.x, c.y + 8, '#7a4a35', 6, 90);
  floaters.push({ x: c.x, y: c.y - 24, text: 'Gieo ' + d.name.toLowerCase(), life: 1, color: '#9be34a' });
  return true;
}

// Thu hoạch (bấm vào cây bằng tay hay dụng cụ nào cũng được). Chín: rớt nông sản + hạt giống. Còn non: nhổ lên, trả 1 hạt.
function harvestCrop(tx, ty) {
  const key = tx + ',' + ty, c = cropAt(tx, ty);
  if (!c) return false;
  const d = CROPS[c.k];
  if (!d) { changes.delete('c' + key); return false; }
  const p = tileCenter(tx, ty), st = cropStage(c);
  hitTimer = 0.3;
  if (st === 3) { say(d.name + ' đang ra quả lại, chờ chút nhé'); return true; }
  if (st === 2) {
    const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
    spawnLoot('crop_' + c.k, n, p.x, p.y);
    spawnLoot('seed_' + c.k, 1 + (Math.random() < 0.5 ? 1 : 0), p.x, p.y); // hạt giống rớt ra
    if (d.regrow) { cropSync(c); c.h = farmClock; c.b = 0; } else changes.delete('c' + key);
    burst(p.x, p.y, '#7bd04a', 12, 170);
    if (!witchFlags.harvestKill) { // đếm lần thu hoạch nông sản chín để mở học Địa Chấn Rễ Cây (cần 10 lần)
      witchFlags.harvestN = Math.min(10, witchFlags.harvestN + 1);
      floaters.push({ x: player.x, y: player.y - 74, text: 'Thu hoạch ' + witchFlags.harvestN + '/10', life: 1.4, color: '#9be34a' });
      if (witchFlags.harvestN >= 10) { witchFlags.harvestKill = true; say('Đã thu hoạch 10 nông sản! Phù Thủy có thể dạy Địa Chấn Rễ Cây'); }
    }
  } else {
    changes.delete('c' + key);
    spawnLoot('seed_' + c.k, 1, p.x, p.y);
    burst(p.x, p.y, '#5aa83a', 8, 120);
    say('Đã nhổ cây non');
  }
  return true;
}

// Cuốc đất: cày một ô cỏ thành ruộng (hiệu ứng xảy ra lúc lưỡi cuốc chạm đất)
function hoeGround(tx, ty, t) {
  if (t === FARM) { startHoeSwing(tx, ty, () => {}); say('Ô này đã cày rồi - cầm hạt giống để gieo · chuột phải để lấp đất'); return true; }
  if (villageAt(tx, ty)) { hitTimer = SWING_CD.hoe; say('Không cày đất trong làng được'); return true; }
  if (swampType(tx, ty) === 2 || seaType(tx, ty) >= 2) { hitTimer = SWING_CD.hoe; say('Không cày được dưới nước'); return true; }
  if (volcanoGround(tx, ty)) { hitTimer = SWING_CD.hoe; say('Đất tro núi lửa cằn cỗi, không cày được'); return true; }
  if (chests.some((ch) => ch.tx === tx && ch.ty === ty)) { hitTimer = SWING_CD.hoe; return true; }
  const hoeKey = heldToolKey() || 'hoe'; // chốt ô cuốc đang cầm, lúc lưỡi chạm đất mới hao độ bền
  startHoeSwing(tx, ty, () => {
    if (layer !== 0 || getTile(tx, ty) !== GRASS) return;
    const c = tileCenter(tx, ty);
    changes.set(tx + ',' + ty, FARM);
    wearTool(hoeKey);
    burst(c.x, c.y, '#7a4a35', 12, 160);
    if (Math.random() < SEED_CHANCE) spawnLoot('seed_' + randomSeedKind(), 1, c.x, c.y); // bới cỏ ra hạt giống
  });
  return true;
}

// Chuột phải vào ruộng: có cây thì nhổ bỏ cây, ruộng trống thì lấp đất lại thành cỏ
function uprootCrop(tx, ty) {
  const c = cropAt(tx, ty);
  if (!c) return;
  const d = CROPS[c.k], p = tileCenter(tx, ty);
  const young = d && cropStage(c) < 2;
  changes.delete('c' + tx + ',' + ty);
  burst(p.x, p.y, '#5aa83a', 10, 130);
  if (young) spawnLoot('seed_' + c.k, 1, p.x, p.y); // cây non: trả lại 1 hạt giống
  floaters.push({ x: p.x, y: p.y - 24, text: 'Nhổ bỏ', life: 1, color: '#ff9a8a' });
  say(d ? 'Đã nhổ bỏ ' + d.name.toLowerCase() + (young ? ' (nhận lại 1 hạt giống)' : '') : 'Đã nhổ bỏ cây');
}

function fillSoil(tx, ty) {
  if (layer !== 0 || getTile(tx, ty) !== FARM || cropAt(tx, ty)) return;
  const p = tileCenter(tx, ty);
  changes.set(tx + ',' + ty, GRASS);
  burst(p.x, p.y, '#7a4a35', 14, 150);
  burst(p.x, p.y, '#5fa04a', 5, 100);
  floaters.push({ x: p.x, y: p.y - 24, text: 'Lấp đất', life: 1, color: '#d9b89a' });
  say('Đã lấp đất, ruộng trở lại thành cỏ');
}

function rightClickWorld() {
  if (layer !== 0 || sleepT > 0 || hitTimer > 0) return false;
  const camX = Math.floor(player.x - canvas.width / 2), camY = Math.floor(player.y - canvas.height / 2);
  const tx = Math.floor((mouse.x + camX) / TILE), ty = Math.floor((mouse.y + camY) / TILE);
  if (getTile(tx, ty) !== FARM) return false;
  const c = tileCenter(tx, ty);
  if (Math.hypot(c.x - player.x, c.y - player.y) > REACH) { say('Quá xa'); return true; }
  faceTowards(tx, ty);
  if (cropAt(tx, ty)) startHoeSwing(tx, ty, () => uprootCrop(tx, ty));
  else startHoeSwing(tx, ty, () => fillSoil(tx, ty));
  return true;
}

// Bấm vào ô cỏ / ruộng (chỉ ngoài trời). Trả về true nếu đã xử lý.
function farmHit(tx, ty) {
  const t = getTile(tx, ty);
  if (t !== FARM && t !== GRASS) return false;
  const sid = slotList()[hotbarSel];
  if (typeof sid === 'string' && sid.startsWith('seed_')) { hitTimer = 0.25; plantSeed(sid, tx, ty); return true; }
  if (sid === 'watercan') {
    if (t === FARM) return waterCrop(tx, ty);
    hitTimer = 0.3; say('Bình tưới dùng cho ô ruộng đã có cây'); return true;
  }
  if (t === FARM && cropAt(tx, ty)) return harvestCrop(tx, ty);
  const held = heldTool();
  if (held === 'hoe') return hoeGround(tx, ty, t);
  if (t === FARM) {
    hitTimer = 0.4;
    if (held === 'pickaxe' || held === 'axe') { // đào bằng cuốc / rìu: san ruộng trống về lại cỏ
      const c = tileCenter(tx, ty);
      changes.set(tx + ',' + ty, GRASS);
      burst(c.x, c.y, '#7a4a35', 8, 120);
      say('Đã san ruộng về lại cỏ');
    } else say('Cầm hạt giống để gieo · cuốc đất để cày thêm');
    return true;
  }
  return false;
}

const WRONG_TOOL_MULT = 0.5; // hệ số sát thương khi tay không / sai dụng cụ / chưa đủ cấp (0.5 = chậm gấp đôi)
function hitTile(tx, ty) {
  if (bucketHit(tx, ty)) return;
  if (layer === 0 && farmHit(tx, ty)) return;
  const t0 = getTile(tx, ty);
  if (t0 === LAVA || (layer === 1 && t0 === WATER)) { mineFluidHit(tx, ty, t0); return; }
  const info = TILE_INFO[t0];
  if (!info) return;

  // Đập được MỌI khối kể cả tay không / cầm sai dụng cụ / dụng cụ cấp thấp, chỉ chậm hơn (sát thương nhân WRONG_TOOL_MULT)
  const heldId = heldTool(), heldKey = heldToolKey();
  const tier = heldId === info.tool ? tools[heldKey] : 0; // chỉ tính dụng cụ ĐANG CẦM, đúng loại
  const slow = tier < info.minTier;                         // chưa đủ cấp / sai dụng cụ -> đào chậm
  const key = tx + ',' + ty;
  const c = tileCenter(tx, ty);
  if (slow && !damage.has(key)) say('Không có ' + (info.tool === 'axe' ? 'rìu' : 'cuốc') + ' ' + TIER_NAME[info.minTier] + ' nên đào rất chậm');
  const total = (damage.get(key) || 0) + TOOL_DMG[tier] * (slow ? WRONG_TOOL_MULT : 1);
  hitFx.set(key, 0.15);
  hitTimer = MINE_CD[tier];      // dụng cụ càng tốt, vung càng nhanh
  attackAnim = ATTACK_TIME;
  const held = heldId;
  swingTool = held ? { id: held, tier: tools[heldKey] } : null; // vung đúng món đang cầm
  burst(c.x, c.y, info.chip, 5, 120);
  spawnToolFx(held || 'hand', c.x, c.y + 14, toolImpactDelay(held || 'hand')); // hiệu ứng trúng đòn đúng khung chạm
  if (tier > 0) wearTool(heldKey); // chỉ hao độ bền khi dùng đúng dụng cụ

  if (total < info.hp) { damage.set(key, total); return; }

  // Phá xong: thu vật phẩm
  if (getTile(tx, ty) === FURNACE) dropFurnaceContents(key);
  if (getTile(tx, ty) === STORE) dropStorageContents(key);
  if (getTile(tx, ty) === RADIO && window.Radio) Radio.removed(layer + ':' + key);
  damage.delete(key);
  rodLife.delete(key);
  if (layer === 1 && ROCK_STYLE[getTile(tx, ty)]) maybeCaveIn(); // đào đá dưới hầm sâu có thể làm sập hầm
  changes.set(key, GRASS);
  if (layer === 2 && houseCur) hstate(houseCur.obj).gone.add(key); // đồ trong nhà phá rồi là mất hẳn
  const n = info.min + Math.floor(Math.random() * (info.max - info.min + 1));
  spawnLoot(info.drop, n, c.x, c.y);
  if (info.bonus && Math.random() < info.bonus.chance) spawnLoot(info.bonus.item, 1, c.x, c.y);
  if (t0 === TREE && layer === 0) treeChopped(c);
  burst(c.x, c.y, info.chip, 14, 200);
}

// ---------- Update ----------

// Người chơi đang trong nhà: các hoạt động bên ngoài (zombie đuổi quanh nhà, nhóm aerobic, nhạc radio làng...) tạm dừng hẳn,
// ra khỏi nhà mới chạy tiếp. (Trước đây zombie vẫn đuổi tới tận cửa và buổi tập vẫn đếm giờ trong lúc đang ở trong nhà.)
const OUTSIDE_PAUSED_IN_HOUSE = true;
let outsideTick = false;
function tickOutsideWorld(dt) {
  const o = layerStore[0];
  if (OUTSIDE_PAUSED_IN_HOUSE) return;
  if (layer !== 2 || !houseRet || !o || outsideTick) return;
  const mine = packLayer(), savedHit = hitFx, px = player.x, py = player.y;
  ({ changes, damage, rodLife, furnaces, storages, chests, zombies, rocks, strikes } = o);
  layer = 0;
  player.x = houseRet.x; player.y = houseRet.y;
  outsideTick = true;
  try { updateZombies(dt); } finally {
    outsideTick = false;
    layerStore[0] = packLayer();
    ({ changes, damage, rodLife, furnaces, storages, chests, zombies, rocks, strikes } = mine);
    layer = 2; hitFx = savedHit;
    player.x = px; player.y = py;
  }
}

function update(dt) {
  if (deathScreen) { deathScreen.t += dt; if (adState) updateAd(dt); return; } // đóng băng thế giới khi đang ở màn hình chết
  const W = canvas.width, H = canvas.height;
  const camX = player.x - W / 2, camY = player.y - H / 2;
  gameTime += dt;
  updateBleed(dt);
  updatePoison(dt);
  // Di chuyển (giữ Shift để chạy)
  const sleeping = sleepT > 0;
  if (sleeping) {
    sleepT -= dt;
    player.invuln = Math.max(player.invuln, 0.5);
    if (!sleepDone && sleepT <= SLEEP_TIME / 2) { sleepDone = true; skipNight(); }
  }
  let dx = sleeping ? 0 : (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  let dy = sleeping ? 0 : (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
  player.moving = dx !== 0 || dy !== 0;
  updateArmorPool();
  if (staminaTired && stamina >= STAMINA_RESUME) staminaTired = false;
  player.running = player.moving && (keys['ShiftLeft'] || keys['ShiftRight']) && !staminaTired && stamina > 0;
  if (player.running) { stamina = Math.max(0, stamina - STAMINA_DRAIN * dt); if (stamina <= 0) { staminaTired = true; player.running = false; } }
  else stamina = Math.min(MAX_STAMINA, stamina + (player.moving ? STAMINA_REGEN_WALK : STAMINA_REGEN) * dt);
  if (dx !== 0) { player.faceX = dx; player.faceY = 0; }
  else if (dy !== 0) { player.faceX = 0; player.faceY = dy; }
  // Đang bị kẹt trong ô đặc (vd. save cũ): đẩy ra ô trống gần nhất
  if (collides(player.x, player.y, 9, true)) {
    const cx = Math.floor(player.x / TILE), cy = Math.floor(player.y / TILE);
    let found = null;
    for (let r = 1; r <= 4 && !found; r++) {
      for (let ox = -r; ox <= r && !found; ox++) {
        for (let oy = -r; oy <= r && !found; oy++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const c = tileCenter(cx + ox, cy + oy);
          if (!collides(c.x, c.y, 9, true)) found = c;
        }
      }
    }
    if (found) { player.x = found.x; player.y = found.y; }
  }
  if (player.moving) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    const sp = player.speed * (player.running ? 1.5 : 1) * terrainSpeed() * (spellT.wind > 0 ? witchSkill('wind').mult : 1) * (window.ExtraMagic ? ExtraMagic.speedMul() : 1) * (window.VolcBoss ? VolcBoss.playerSlow() : 1) * (window.FinalBoss ? FinalBoss.playerSlow() : 1); // playerSlow: bị boss băng / rồng cuối làm chậm
    const nx = player.x + dx * sp * dt;
    if (!playerBlocked(nx, player.y)) player.x = nx;
    const ny = player.y + dy * sp * dt;
    if (!playerBlocked(player.x, ny)) player.y = ny;
  }

  // Chặt / đào
  hitTimer -= dt;
  attackAnim -= dt;
  updateHoeSwing(dt);
  updateWaterSwing(dt);
  const acting = !ui && !sleeping && (keys['Space'] || mouse.down);
  if (acting && hitTimer <= 0) {
    const z = targetZombie(camX, camY); // zombie được ưu tiên hơn cây/đá
    const sp = z || heldBow() ? null : targetSpider(camX, camY);
    const an = z || sp ? null : targetAnimal(camX, camY);
    if (heldBow()) {
      shootArrow(camX, camY);
    } else if (z) {
      attackZombie(z);
    } else if (sp) {
      attackSpider(sp);
    } else if (an) {
      if (!interactAnimal(an)) attackAnimal(an);
    } else {
      const t = currentTarget(camX, camY);
      if (t) {
        if (!keys['Space']) faceTowards(t.tx, t.ty);
        hitTile(t.tx, t.ty);
      }
    }
  }

  // Đi xa Giang Thương thì tự đóng
  if (ui === 'market' && marketVillage && marketVillage.blackMarket) {
    if (layer !== 2 || !houseCur || !houseCur.blackMarket) closeUi();
  } else if (ui === 'market') {
    const so = marketVillage && (marketVillage.isMarket ? marketShop : marketVillage.stall);
    if (!so || layer !== 0 || Math.hypot((so.tx + so.w / 2) * TILE - player.x, (so.ty + so.h) * TILE - player.y) > 240) closeUi();
  }

  // Đi xa bàn chế tạo thì tự đóng (lưới 3×3 không tự co về 2×2 nữa; nguyên liệu trên lưới được trả về túi)
  if (ui === 'inv') {
    if (!tableSessionChecked) { tableSessionChecked = true; tableSession = nearTable(); }
    if (tableSession && !nearTable()) closeUi();
  } else {
    tableSessionChecked = false; tableSession = false;
  }

  // Đi xa lò nung thì tự đóng giao diện lò
  if (ui === 'furnace') {
    const [fx, fy] = furnaceKey.split(',').map(Number);
    const c = tileCenter(fx, fy);
    if (Math.hypot(c.x - player.x, c.y - player.y) > 140) closeUi();
  }

  player.animTime += dt;
  updateEvents(dt);
  updateZombies(dt);
  updateSpiders(dt);
  updateBowShot(dt);
  updateArrows(dt);
  tickOutsideWorld(dt);
  updateSwamp(dt);
  updateAnimals(dt);
  updateVillagers(dt);
  if (layer === 0) updateExercise(dt);
  else updateExerciseAudio(); // trong nhà / hầm: nhóm aerobic đứng im, nhạc tạm dừng
  if (window.Radio) Radio.update(dt);
  updateWarriors(dt);
  updateVArrows(dt);
  updateFurnaces(dt);
  saveFlash = Math.max(0, saveFlash - dt);
  updateStrikes(dt);
  updateMeteors(dt);
  updateMine(dt);
  updateGates(dt); // Cổng Ma Vương: zombie canh, mở cổng, hiệu ứng boss trong đấu trường (boss-gate.js)
  updateBurn(dt);
  updateElder(dt);
  updateWitch(dt);
  updateDarkFlowers(dt);
  updateSaplings(dt);
  updateWalk(dt);
  if (window.Magma) Magma.update(dt); // Slime Lửa + núi lửa phun trào (magma.js)
  if (window.VolcBoss) VolcBoss.update(dt); // boss đảo núi lửa (volcano-boss.js)
  if (window.FinalBoss) FinalBoss.update(dt); // boss cuối: Hỗn Nguyên Long Vương (final-boss.js)
  if (window.FireMagic) FireMagic.update(dt);
  if (window.IceMagic) IceMagic.update(dt);
  if (window.ArcaneMagic) ArcaneMagic.update(dt);
  if (window.ExtraMagic) ExtraMagic.update(dt);
  updateVitals(dt);
  updateEffects(dt);
  updateMinimap();
  updateDrops(dt);
}

// ---------- Vẽ: hình khối ----------
function poly(points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function shadow(sx, sy, rx) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(sx + 24, sy + 42, rx, 7, 0, 0, Math.PI * 2);
  ctx.fill();
}

function shakeOffset(key) {
  const t = hitFx.get(key) || 0;
  return t > 0 ? Math.sin(t * 90) * 2 : 0;
}

function drawTreeFallback(sx, sy, key) {
  const ox = shakeOffset(key);
  shadow(sx, sy, 18);

  ctx.fillStyle = '#6b4423';
  ctx.fillRect(sx + 19 + ox, sy + 18, 10, 26);

  ctx.fillStyle = '#2d6a2e';
  ctx.beginPath();
  ctx.arc(sx + 24 + ox, sy + 10, 23, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3e8e3f';
  ctx.beginPath();
  ctx.arc(sx + 17 + ox, sy + 3, 12, 0, Math.PI * 2);
  ctx.fill();
}

const ROCK_BODY = [[6, 42], [10, 18], [24, 8], [40, 20], [43, 42]];
const ROCK_TOP = [[12, 22], [24, 12], [32, 20], [20, 30]];
const ORE_SPECKS = [[14, 30], [28, 26], [22, 36], [34, 34], [18, 23]];
const ROCK_STYLE = {
  [ROCK]: { body: '#7d7d85', top: '#a2a2ab' },
  [COAL]: { body: '#4a4a52', top: '#62626b', speck: '#16161a' },
  [IRON]: { body: '#7d7d85', top: '#a2a2ab', speck: '#d9996f' },
  [GOLD]: { body: '#7d7d85', top: '#a2a2ab', speck: '#ffd34d', sparkle: true },
  [DIAMOND]: { body: '#7d7d85', top: '#a2a2ab', speck: '#4fe0ff', sparkle: true },
};

// Đá và các loại quặng dùng chung một hình, khác màu và đốm
function drawRock(type, sx, sy, key) {
  const ox = shakeOffset(key);
  const st = ROCK_STYLE[type];
  shadow(sx, sy, 19);
  poly(ROCK_BODY.map(([x, y]) => [sx + x + ox, sy + y]), st.body);
  poly(ROCK_TOP.map(([x, y]) => [sx + x + ox, sy + y]), st.top);
  if (!st.speck) return;

  ctx.fillStyle = st.speck;
  ORE_SPECKS.forEach(([x, y]) => ctx.fillRect(sx + x + ox, sy + y, 5, 5));

  if (st.sparkle) {
    // Vàng lấp lánh
    ORE_SPECKS.forEach(([x, y], i) => {
      if (Math.sin(gameTime * 4 + i * 1.7 + hash(sx | 0, i)) < 0.85) return;
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx + x + ox + 1, sy + y - 2, 2, 9);
      ctx.fillRect(sx + x + ox - 2, sy + y + 1, 9, 2);
    });
  }
}

function drawRod(sx, sy, key) {
  const ox = shakeOffset(key);
  shadow(sx, sy, 16);
  ctx.fillStyle = '#55555e';
  ctx.fillRect(sx + 14 + ox, sy + 38, 20, 6);
  ctx.fillStyle = '#6d6d78';
  ctx.fillRect(sx + 21 + ox, sy + 12, 6, 28);
  ctx.fillStyle = '#9a9aa8';
  ctx.fillRect(sx + 21 + ox, sy + 12, 2, 28);

  // Mũi nhọn vàng
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx + 24 + ox, sy + 14);
  ctx.lineTo(sx + 19 + ox, sy + 8);
  ctx.lineTo(sx + 27 + ox, sy + 5);
  ctx.lineTo(sx + 22 + ox, sy - 2);
  ctx.stroke();

  // Phát sáng khi có giông
  if (world.rain.storm && world.rain.intensity > 0.3) {
    ctx.fillStyle = 'rgba(255,240,150,' + (0.25 + 0.2 * Math.sin(gameTime * 10)) + ')';
    ctx.beginPath();
    ctx.arc(sx + 22 + ox, sy - 2, 11, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTable(sx, sy, key) {
  const ox = shakeOffset(key);
  shadow(sx, sy, 20);
  ctx.fillStyle = '#4a2e15';
  ctx.fillRect(sx + 8 + ox, sy + 28, 6, 14);
  ctx.fillRect(sx + 34 + ox, sy + 28, 6, 14);
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(sx + 8 + ox, sy + 22, 32, 10);
  ctx.fillStyle = '#a8712f';
  ctx.fillRect(sx + 4 + ox, sy + 10, 40, 14);
  ctx.fillStyle = '#d9ae6e';
  ctx.fillRect(sx + 4 + ox, sy + 10, 40, 3);
  // Mặt bàn chia ô 3×3
  ctx.strokeStyle = '#6b4423';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    const gx = sx + 4 + ox + (i * 40) / 3;
    ctx.moveTo(gx, sy + 10); ctx.lineTo(gx, sy + 24);
  }
  ctx.moveTo(sx + 4 + ox, sy + 17); ctx.lineTo(sx + 44 + ox, sy + 17);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeRect(sx + 4 + ox, sy + 10, 40, 14);
}

// Lò nung: khối đá có cửa lửa, sáng lên khi đang nung
function drawFurnaceTile(sx, sy, key) {
  const ox = shakeOffset(key);
  const f = furnaces.get(key);
  const lit = f && f.burn > 0;
  shadow(sx, sy, 20);
  ctx.fillStyle = '#5d5d66';
  ctx.fillRect(sx + 4 + ox, sy + 6, 40, 38);
  ctx.fillStyle = '#85858f';
  ctx.fillRect(sx + 6 + ox, sy + 8, 36, 34);
  // vân đá cuội
  ctx.fillStyle = '#6e6e78';
  ctx.fillRect(sx + 6 + ox, sy + 18, 36, 2);
  ctx.fillRect(sx + 6 + ox, sy + 31, 36, 2);
  ctx.fillRect(sx + 18 + ox, sy + 8, 2, 10);
  ctx.fillRect(sx + 32 + ox, sy + 20, 2, 11);
  ctx.fillStyle = '#a2a2ab';
  ctx.fillRect(sx + 6 + ox, sy + 8, 36, 2);
  // cửa lò
  ctx.fillStyle = '#1b1b1f';
  ctx.fillRect(sx + 14 + ox, sy + 23, 20, 15);
  if (lit) {
    const fl = Math.sin(gameTime * 14 + sx) * 2;
    poly([[16 + sx + ox, sy + 38], [24 + sx + ox, sy + 26 + fl], [32 + sx + ox, sy + 38]], '#ff8a1f');
    poly([[20 + sx + ox, sy + 38], [24 + sx + ox, sy + 31 + fl], [28 + sx + ox, sy + 38]], '#ffe27a');
    ctx.fillStyle = 'rgba(255,150,40,0.18)';
    ctx.beginPath();
    ctx.arc(sx + 24 + ox, sy + 30, 34, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMillTile(sx, sy, key) {
  const ox = shakeOffset(key);
  shadow(sx, sy, 20);
  ctx.fillStyle = '#5d5d66'; ctx.fillRect(sx + 5 + ox, sy + 22, 38, 22);
  ctx.fillStyle = '#85858f'; ctx.fillRect(sx + 7 + ox, sy + 24, 34, 18);
  ctx.fillStyle = '#6e6e78'; ctx.fillRect(sx + 7 + ox, sy + 32, 34, 2); ctx.fillRect(sx + 22 + ox, sy + 24, 2, 8);
  ctx.fillStyle = '#a2a2ab'; ctx.fillRect(sx + 7 + ox, sy + 24, 34, 2);
  ctx.fillStyle = '#e8e2cf'; ctx.fillRect(sx + 16 + ox, sy + 36, 16, 6); // bột chảy xuống
  ctx.fillStyle = '#4a4a52'; ctx.beginPath(); ctx.ellipse(sx + 24 + ox, sy + 21, 19, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a9a9b2'; ctx.beginPath(); ctx.ellipse(sx + 24 + ox, sy + 18, 19, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c4c4cc'; ctx.beginPath(); ctx.ellipse(sx + 24 + ox, sy + 17, 13, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  const a = gameTime * 1.2 + sx * 0.01;
  const hx = sx + 24 + ox + Math.cos(a) * 14, hy = sy + 17 + Math.sin(a) * 6.5; // tay quay xoay quanh cối
  ctx.strokeStyle = '#7a4f26'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx + 24 + ox, sy + 17); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = '#a8712f'; ctx.beginPath(); ctx.arc(hx, hy - 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(sx + 22 + ox, sy + 6, 4, 11);
}

function drawOvenTile(sx, sy, key) {
  const ox = shakeOffset(key);
  shadow(sx, sy, 20);
  ctx.fillStyle = '#5a3a2e'; ctx.fillRect(sx + 31 + ox, sy + 2, 9, 16); // ống khói
  ctx.fillStyle = '#7a4f3e'; ctx.fillRect(sx + 31 + ox, sy + 2, 9, 3);
  ctx.fillStyle = '#6e3a2a'; ctx.fillRect(sx + 4 + ox, sy + 18, 40, 26);
  ctx.beginPath(); ctx.arc(sx + 24 + ox, sy + 20, 20, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#a35a44'; ctx.fillRect(sx + 6 + ox, sy + 20, 36, 22);
  ctx.beginPath(); ctx.arc(sx + 24 + ox, sy + 20, 18, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#7d4333'; // đường gạch
  for (let i = 0; i < 4; i++) ctx.fillRect(sx + 6 + ox, sy + 14 + i * 7, 36, 1.5);
  ctx.fillRect(sx + 14 + ox, sy + 14, 1.5, 7); ctx.fillRect(sx + 30 + ox, sy + 21, 1.5, 7); ctx.fillRect(sx + 20 + ox, sy + 28, 1.5, 7);
  ctx.fillStyle = '#1b1210'; // miệng lò
  ctx.beginPath(); ctx.moveTo(sx + 14 + ox, sy + 42); ctx.lineTo(sx + 14 + ox, sy + 31); ctx.arc(sx + 24 + ox, sy + 31, 10, Math.PI, 0); ctx.lineTo(sx + 34 + ox, sy + 42); ctx.closePath(); ctx.fill();
  const fl = Math.sin(gameTime * 12 + sx) * 2;
  poly([[sx + 17 + ox, sy + 42], [sx + 24 + ox, sy + 30 + fl], [sx + 31 + ox, sy + 42]], '#ff8a1f');
  poly([[sx + 20 + ox, sy + 42], [sx + 24 + ox, sy + 35 + fl], [sx + 28 + ox, sy + 42]], '#ffe27a');
  ctx.fillStyle = 'rgba(255,150,40,0.14)'; ctx.beginPath(); ctx.arc(sx + 24 + ox, sy + 34, 30, 0, Math.PI * 2); ctx.fill();
}

function drawBedTile(sx, sy, key) {
  const ox = shakeOffset(key);
  shadow(sx, sy, 22);
  ctx.fillStyle = '#5a3a18';
  ctx.fillRect(sx + 3 + ox, sy + 12, 42, 32);             // khung giường
  ctx.fillStyle = '#e9e9ee';
  ctx.fillRect(sx + 6 + ox, sy + 14, 15, 26);             // gối + đệm
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx + 8 + ox, sy + 17, 11, 9);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(sx + 21 + ox, sy + 14, 21, 26);            // chăn đỏ
  ctx.fillStyle = '#e0594a';
  ctx.fillRect(sx + 21 + ox, sy + 14, 21, 4);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(sx + 3 + ox, sy + 40, 42, 4);
}

function drawStairs(sx, sy) {
  if (layer === 0) {
    // lỗ hầm
    ctx.fillStyle = '#3b2a1a'; ctx.fillRect(sx + 4, sy + 6, 40, 36);
    ctx.fillStyle = '#1b130b'; ctx.fillRect(sx + 8, sy + 10, 32, 28);
  } else {
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(sx + 6, sy + 4, 36, 40);
    ctx.fillStyle = '#2a1d10'; ctx.fillRect(sx + 10, sy + 8, 28, 32);
  }
  // thang gỗ
  ctx.fillStyle = '#c8a064';
  ctx.fillRect(sx + 14, sy + 6, 4, 36); ctx.fillRect(sx + 30, sy + 6, 4, 36);
  for (let i = 0; i < 4; i++) ctx.fillRect(sx + 14, sy + 11 + i * 9, 20, 3);
}

// Trong hầm: đá/quặng là khối đặc kín ô
function drawMineBlock(type, sx, sy, key) {
  const ox = shakeOffset(key);
  const st = ROCK_STYLE[type];
  ctx.fillStyle = st.body; ctx.fillRect(sx + ox, sy, TILE, TILE);
  ctx.fillStyle = st.top; ctx.fillRect(sx + ox, sy, TILE, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx + ox, sy + TILE - 4, TILE, 4);
  if (!st.speck) return;
  ctx.fillStyle = st.speck;
  [[10, 12], [28, 10], [18, 26], [32, 30], [8, 34]].forEach(([x, y]) => ctx.fillRect(sx + x + ox, sy + y, 6, 6));
  if (st.sparkle) {
    ctx.fillStyle = '#fff';
    const k = Math.floor(gameTime * 3 + hash(sx | 0, sy | 0) * 7) % 5;
    ctx.fillRect(sx + [10, 28, 18, 32, 8][k] + ox + 2, sy + [12, 10, 26, 30, 34][k] - 3, 2, 9);
  }
}

// Rương gỗ người chơi đặt: thân gỗ, nắp, đai sắt và khoá vàng
function drawStoreTile(sx, sy, key) {
  const ox = shakeOffset(key);
  shadow(sx, sy, 20);
  const x = sx + 5 + ox, w = 38;
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(x, sy + 20, w, 22);          // thân
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(x + 2, sy + 22, w - 4, 18);
  ctx.fillStyle = '#a8712f';
  ctx.fillRect(x, sy + 10, w, 12);           // nắp
  ctx.fillStyle = '#c28a46';
  ctx.fillRect(x, sy + 10, w, 3);
  ctx.fillStyle = '#4a4a54';                 // đai sắt
  ctx.fillRect(x + 6, sy + 10, 4, 32);
  ctx.fillRect(x + w - 10, sy + 10, 4, 32);
  ctx.fillStyle = '#f2c14e';                 // khoá
  ctx.fillRect(x + w / 2 - 4, sy + 19, 8, 9);
  ctx.fillStyle = '#7a5a10';
  ctx.fillRect(x + w / 2 - 1, sy + 22, 2, 4);
  ctx.strokeStyle = '#2b1a0a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, sy + 10, w, 32);
  ctx.beginPath(); ctx.moveTo(x, sy + 22); ctx.lineTo(x + w, sy + 22); ctx.stroke();
}

// ---- Vẽ vật liệu xây nhà ----
// Tường / sàn / mái / thảm tự nối liền với ô cùng loại bên cạnh (chỉ viền ở mép hở); cửa tự quay theo hướng tường;
// hàng rào tự nối thanh ngang; bậc thang và mái có hướng rõ ràng (R để xoay).
const FAMILY = { [WWALL]: 'w', [WBLOCK]: 'wb', [SBLOCK]: 'sb', [WDOOR]: 'w', [WDOOR_O]: 'w', [IWALL]: 'i', [IDOOR]: 'i', [IDOOR_O]: 'i', [ROOF]: 'r', [WFLOOR]: 'f', [CARPET]: 'c' };
const WALLISH = new Set([WWALL, IWALL, WDOOR, WDOOR_O, IDOOR, IDOOR_O, HWALL]);
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // Bắc, Đông, Nam, Tây
function sameFam(tx, ty, fam) { return FAMILY[getTile(tx, ty)] === fam; }
function famNeighbors(tx, ty, fam) {
  return tx === null ? [false, false, false, false] : DIRS.map(([dx, dy]) => sameFam(tx + dx, ty + dy, fam));
}
function wallNeighbors(tx, ty) {
  return tx === null ? [false, false, false, false] : DIRS.map(([dx, dy]) => WALLISH.has(getTile(tx + dx, ty + dy)));
}

// Viền ở các cạnh hở (n[i] = có ô cùng loại ở cạnh i: Bắc, Đông, Nam, Tây)
function drawEdges(x, y, n, dark, light) {
  const T = TILE;
  if (!n[0]) { ctx.fillStyle = dark; ctx.fillRect(x, y, T, 3); ctx.fillStyle = light; ctx.fillRect(x, y + 3, T, 2); }
  if (!n[3]) { ctx.fillStyle = dark; ctx.fillRect(x, y, 3, T); ctx.fillStyle = light; ctx.fillRect(x + 3, y, 2, T); }
  if (!n[2]) { ctx.fillStyle = dark; ctx.fillRect(x, y + T - 4, T, 4); }
  if (!n[1]) { ctx.fillStyle = dark; ctx.fillRect(x + T - 4, y, 4, T); }
}

function drawPlanks(x, y, tx, ty, base, seam, rowH = 12) {
  ctx.fillStyle = base; ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = seam;
  const hx = tx === null ? 0 : tx, hy = ty === null ? 0 : ty;
  for (let r = 0; r < TILE / rowH; r++) {
    ctx.fillRect(x, y + r * rowH + rowH - 2, TILE, 2);
    const sxp = ((hx * 7 + hy * 13 + r * 5) % 4 + 4) % 4 * 11 + 6; // vết nối tấm ván, lệch từng hàng
    ctx.fillRect(x + sxp, y + r * rowH, 2, rowH - 2);
  }
}

function drawDoorLeaf(x, y, open, iron) {
  const base = iron ? '#868c98' : '#a8712f', dark = iron ? '#474c56' : '#4e3320', lite = iron ? '#c4cad4' : '#c99a58';
  // ô cửa: thềm sàn tối, hai bên là trụ cửa (thân tường)
  ctx.fillStyle = iron ? '#3f434b' : '#5c3d20'; ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 1; i < 4; i++) ctx.fillRect(x + 8, y + i * 12 - 1, TILE - 16, 2);
  ctx.fillStyle = dark; ctx.fillRect(x, y, 9, TILE); ctx.fillRect(x + TILE - 9, y, 9, TILE);
  ctx.fillStyle = base; ctx.fillRect(x + 1, y + 1, 7, TILE - 2); ctx.fillRect(x + TILE - 8, y + 1, 7, TILE - 2);
  ctx.fillStyle = lite; ctx.fillRect(x + 1, y + 1, 7, 3); ctx.fillRect(x + TILE - 8, y + 1, 7, 3);
  if (!open) { // cánh cửa đóng: tấm dày chắn ngang
    ctx.fillStyle = dark; ctx.fillRect(x + 8, y + 13, TILE - 16, 24);
    ctx.fillStyle = base; ctx.fillRect(x + 9, y + 14, TILE - 18, 21);
    ctx.fillStyle = lite; ctx.fillRect(x + 9, y + 14, TILE - 18, 4);
    ctx.fillStyle = dark; ctx.fillRect(x + TILE / 2 - 1, y + 14, 2, 21);
    ctx.fillStyle = iron ? '#5a606b' : '#7a5020'; ctx.fillRect(x + 14, y + 22, TILE - 28, 2);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(x + TILE / 2 - 8, y + 24, 4, 4); ctx.fillRect(x + TILE / 2 + 4, y + 24, 4, 4);
  } else { // cánh cửa mở: quay 90° quanh bản lề bên trái, nhìn thấy sàn
    ctx.fillStyle = dark; ctx.fillRect(x + 9, y + 12, 9, 32);
    ctx.fillStyle = base; ctx.fillRect(x + 10, y + 13, 7, 30);
    ctx.fillStyle = lite; ctx.fillRect(x + 10, y + 13, 7, 3);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(x + 12, y + 38, 3, 3);
  }
}

// Mỗi hàm vẽ ở hướng 0 trong ô (x,y); i = { n: ô cùng loại [B,Đ,N,T], open }
const BUILD_DRAW = {
  [WWALL](x, y, i) {
    drawPlanks(x, y, i.tx, i.ty, '#9a6a35', 'rgba(60,35,12,0.45)');
    ctx.fillStyle = 'rgba(255,230,170,0.12)'; ctx.fillRect(x, y + 6, TILE, 3);
    drawEdges(x, y, i.n, '#3d2712', '#c99a58');
  },
  [WBLOCK](x, y, i) {
    drawPlanks(x, y, i.tx, i.ty, '#b07d42', 'rgba(60,35,12,0.5)', 16);
    ctx.fillStyle = 'rgba(255,230,170,0.18)'; ctx.fillRect(x + 3, y + 3, TILE - 6, 3);
    ctx.fillStyle = '#3d2712'; ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y + TILE - 2, TILE, 2); ctx.fillRect(x, y, 2, TILE); ctx.fillRect(x + TILE - 2, y, 2, TILE);
  },
  [SBLOCK](x, y, i) {
    ctx.fillStyle = '#8d9199'; ctx.fillRect(x, y, TILE, TILE);
    const h = ((i.tx || 0) * 7 + (i.ty || 0) * 13) & 3;
    ctx.fillStyle = '#767a82';
    ctx.fillRect(x + 6 + h * 3, y + 8, 14, 10); ctx.fillRect(x + 24, y + 26, 16, 12); ctx.fillRect(x + 8, y + 32, 10, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 4, y + 4, 18, 3); ctx.fillRect(x + 26, y + 24, 14, 3);
    ctx.fillStyle = '#4b4f56'; ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y + TILE - 2, TILE, 2); ctx.fillRect(x, y, 2, TILE); ctx.fillRect(x + TILE - 2, y, 2, TILE);
  },
  [IBLOCK](x, y, i) {
    ctx.fillStyle = '#d9dce3'; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#c3c8d1'; ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
    ctx.fillStyle = '#e6e9ee'; ctx.fillRect(x + 9, y + 9, TILE - 18, TILE - 18);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x + 9, y + 9, TILE - 18, 3); ctx.fillRect(x + 9, y + 9, 3, TILE - 18);
    ctx.fillStyle = '#a3aab6'; ctx.fillRect(x + 9, y + TILE - 12, TILE - 18, 3); ctx.fillRect(x + TILE - 12, y + 9, 3, TILE - 18);
    ctx.fillStyle = '#9097a4'; for (const [px, py] of [[7, 7], [37, 7], [7, 37], [37, 37]]) ctx.fillRect(x + px, y + py, 4, 4);
    ctx.fillStyle = '#6b727e'; ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y + TILE - 2, TILE, 2); ctx.fillRect(x, y, 2, TILE); ctx.fillRect(x + TILE - 2, y, 2, TILE);
  },
  [DBLOCK](x, y, i) {
    ctx.fillStyle = '#35b8e0'; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#4fd8ff'; ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
    ctx.fillStyle = '#8af0ff';
    ctx.fillRect(x + 6, y + 6, 14, 14); ctx.fillRect(x + 26, y + 22, 16, 16); ctx.fillRect(x + 24, y + 6, 8, 8); ctx.fillRect(x + 6, y + 28, 10, 10);
    ctx.fillStyle = '#c8faff'; ctx.fillRect(x + 8, y + 8, 6, 3); ctx.fillRect(x + 28, y + 24, 7, 3);
    ctx.fillStyle = '#1b86a8'; ctx.fillRect(x + 20, y + 6, 3, 36); ctx.fillRect(x + 6, y + 22, 36, 3);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 12, y + 14, 2, 2); ctx.fillRect(x + 34, y + 30, 2, 2); ctx.fillRect(x + 30, y + 10, 2, 2);
    ctx.fillStyle = '#126b88'; ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y + TILE - 2, TILE, 2); ctx.fillRect(x, y, 2, TILE); ctx.fillRect(x + TILE - 2, y, 2, TILE);
  },
  [CBLOCK](x, y, i) {
    ctx.fillStyle = '#2d2d33'; ctx.fillRect(x, y, TILE, TILE);
    const h = ((i.tx || 0) * 7 + (i.ty || 0) * 13) & 3;
    ctx.fillStyle = '#18181c';
    ctx.fillRect(x + 6 + h * 3, y + 7, 14, 11); ctx.fillRect(x + 25, y + 25, 16, 13); ctx.fillRect(x + 7, y + 31, 11, 9); ctx.fillRect(x + 30, y + 8, 9, 9);
    ctx.fillStyle = '#44444d'; ctx.fillRect(x + 5, y + 22, 12, 4); ctx.fillRect(x + 24, y + 18, 10, 4); ctx.fillRect(x + 20, y + 40, 12, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x + 4, y + 4, 18, 3); ctx.fillRect(x + 28, y + 24, 12, 3);
    ctx.fillStyle = '#0d0d10'; ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y + TILE - 2, TILE, 2); ctx.fillRect(x, y, 2, TILE); ctx.fillRect(x + TILE - 2, y, 2, TILE);
  },
  [IWALL](x, y, i) {
    ctx.fillStyle = '#80868f'; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#6c727b'; ctx.fillRect(x, y + 22, TILE, 2); ctx.fillRect(x + 23, y, 2, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 4, y + 4, 17, 17); ctx.fillRect(x + 27, y + 27, 17, 17);
    ctx.fillStyle = '#c9ced8';
    for (const [px, py] of [[6, 6], [38, 6], [6, 38], [38, 38]]) { ctx.fillRect(x + px, y + py, 4, 4); }
    ctx.fillStyle = '#4b5059';
    for (const [px, py] of [[7, 7], [39, 7], [7, 39], [39, 39]]) { ctx.fillRect(x + px, y + py, 2, 2); }
    drawEdges(x, y, i.n, '#2f333a', '#c4cad4');
  },
  [WDOOR](x, y) { drawDoorLeaf(x, y, false, false); },
  [WDOOR_O](x, y) { drawDoorLeaf(x, y, true, false); },
  [IDOOR](x, y) { drawDoorLeaf(x, y, false, true); },
  [IDOOR_O](x, y) { drawDoorLeaf(x, y, true, true); },
  [ROOF](x, y, i) {
    // Mái dốc: nửa trên (hướng 0 = quay về Bắc) sáng, nửa dưới tối, sống mái ở giữa
    const T = TILE, half = T / 2;
    for (let h = 0; h < 2; h++) {
      const top = y + h * half;
      ctx.fillStyle = h ? '#7d2c20' : '#b4503b'; ctx.fillRect(x, top, T, half);
      for (let r = 0; r < 3; r++) {
        const ry = top + r * 8;
        ctx.fillStyle = h ? '#5f1f16' : '#8c3425'; ctx.fillRect(x, ry + 7, T, 1.5);
        const off = r % 2 ? 0 : 12;
        for (let c = off; c < T; c += 24) ctx.fillRect(x + c, ry, 1.5, 7);
      }
    }
    ctx.fillStyle = '#4a170f'; ctx.fillRect(x, y + half - 3, T, 6);       // sống mái
    ctx.fillStyle = '#d9694f'; ctx.fillRect(x, y + half - 3, T, 3);
    // mép hiên ở các cạnh hở (cạnh Bắc / Nam là hiên dốc, Đông / Tây là hồi)
    if (!i.n[0]) { ctx.fillStyle = '#e07a5f'; ctx.fillRect(x, y, T, 3); }
    if (!i.n[2]) { ctx.fillStyle = '#3a110a'; ctx.fillRect(x, y + T - 5, T, 5); }
    if (!i.n[3]) { ctx.fillStyle = '#3a110a'; ctx.fillRect(x, y, 3, T); }
    if (!i.n[1]) { ctx.fillStyle = '#3a110a'; ctx.fillRect(x + T - 3, y, 3, T); }
  },
  [WFLOOR](x, y, i) {
    drawPlanks(x, y, i.tx, i.ty, '#b98443', 'rgba(70,40,14,0.4)', 16);
    drawEdges(x, y, i.n.map((v) => v), 'rgba(60,35,12,0.55)', 'rgba(255,230,170,0.25)');
  },
  [CARPET](x, y, i) {
    ctx.fillStyle = '#a63232'; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < TILE; k += 8) ctx.fillRect(x, y + k, TILE, 2);
    if (!i.n[0]) { ctx.fillStyle = '#e0b84a'; ctx.fillRect(x, y + 2, TILE, 3); }
    if (!i.n[2]) { ctx.fillStyle = '#e0b84a'; ctx.fillRect(x, y + TILE - 5, TILE, 3); }
    if (!i.n[3]) { ctx.fillStyle = '#e0b84a'; ctx.fillRect(x + 2, y, 3, TILE); }
    if (!i.n[1]) { ctx.fillStyle = '#e0b84a'; ctx.fillRect(x + TILE - 5, y, 3, TILE); }
  },
  [LAMP](x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + 24, y + 42, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x + 22, y + 18, 4, 24);
    ctx.fillStyle = '#4a4a54'; ctx.fillRect(x + 16, y + 38, 16, 5);
    ctx.fillStyle = 'rgba(255,211,77,0.3)'; ctx.beginPath(); ctx.arc(x + 24, y + 14, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.fillRect(x + 17, y + 6, 14, 15);
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(x + 20, y + 9, 8, 9);
    ctx.fillStyle = '#4a4a54'; ctx.fillRect(x + 15, y + 3, 18, 4); ctx.fillRect(x + 15, y + 20, 18, 3);
  },
  [FENCE](x, y, i) {
    // i.link = [B,Đ,N,T]: có ô để nối thanh ngang (hàng rào / tường / cửa)
    const cx = x + 24, L = i.link || [false, false, false, false];
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, y + 42, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    const rail = (rx, ry, rw, rh) => { ctx.fillStyle = '#5a3a18'; ctx.fillRect(rx, ry + rh - 1, rw, 1.5); ctx.fillStyle = '#b98443'; ctx.fillRect(rx, ry, rw, rh - 1); ctx.fillStyle = '#d9ae6e'; ctx.fillRect(rx, ry, rw, 1.5); };
    const stub = !L[1] && !L[3] && !L[0] && !L[2] ? 8 : 0;
    for (const ry of [20, 30]) {
      if (L[1] || stub) rail(cx, y + ry, L[1] ? 24 : stub, 4);
      if (L[3] || stub) rail(L[3] ? x : cx - stub, y + ry, L[3] ? 24 : stub, 4);
    }
    if (L[0]) rail(cx - 2, y, 4, 26);
    if (L[2]) rail(cx - 2, y + 26, 4, 22);
    ctx.fillStyle = '#6b4423'; ctx.fillRect(cx - 5, y + 10, 10, 32);
    ctx.fillStyle = '#a8712f'; ctx.fillRect(cx - 4, y + 11, 8, 30);
    ctx.fillStyle = '#d9ae6e'; ctx.fillRect(cx - 5, y + 8, 10, 4);
  },
  [POT](x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + 24, y + 42, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f7d32'; ctx.beginPath(); ctx.arc(x + 24, y + 18, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4cae4f'; ctx.beginPath(); ctx.arc(x + 20, y + 15, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8566a'; ctx.fillRect(x + 26, y + 10, 5, 5); ctx.fillStyle = '#ffd34d'; ctx.fillRect(x + 15, y + 18, 4, 4);
    ctx.fillStyle = '#b5653a'; ctx.fillRect(x + 14, y + 28, 20, 14);
    ctx.fillStyle = '#8c4a28'; ctx.fillRect(x + 12, y + 26, 24, 5);
  },
};

// Vẽ một ô xây dựng tại (sx,sy). tx/ty = toạ độ ô (null khi vẽ icon). rot = hướng đã lưu.
function drawBuildTile(type, sx, sy, tx, ty, rot, ox = 0) {
  const fn = BUILD_DRAW[type];
  if (!fn) return;
  const isDoor = DOOR_PAIR[type] !== undefined;
  let r = ROTATABLE.has(type) ? rot : 0;
  if (isDoor && tx !== null) { // cửa tự quay dọc theo tường: tường ở Bắc/Nam -> cửa dọc; giữ lật bản lề theo hướng đã lưu
    const w = wallNeighbors(tx, ty);
    const horiz = w[1] || w[3], vert = w[0] || w[2];
    const axis = vert && !horiz ? 1 : horiz && !vert ? 0 : r % 2;
    r = axis + (r >= 2 ? 2 : 0);
  }
  const fam = FAMILY[type];
  const info = { tx, ty, n: fam ? famNeighbors(tx, ty, fam) : [false, false, false, false] };
  if (type === FENCE && tx !== null) info.link = DIRS.map(([dx, dy]) => { const t = getTile(tx + dx, ty + dy); return t === FENCE || WALLISH.has(t); });
  if (r) info.n = [0, 1, 2, 3].map((k) => info.n[(k + r) % 4]); // xoay hệ trục cạnh theo hướng vẽ
  ctx.save();
  ctx.translate(sx + ox, sy);
  if (r) { ctx.translate(TILE / 2, TILE / 2); ctx.rotate(r * Math.PI / 2); ctx.translate(-TILE / 2, -TILE / 2); }
  fn(0, 0, info);
  ctx.restore();
}

// Bóng mờ xem trước món xây đang cầm: xanh = đặt được, đỏ = không. Xoay bằng R là thấy ngay.
function buildBlockReason(b, tx, ty) {
  const c = tileCenter(tx, ty);
  if (Math.hypot(c.x - player.x, c.y - player.y) > REACH) return 'Quá xa';
  if ((getTile(tx, ty) !== GRASS && getTile(tx, ty) !== WATER && getTile(tx, ty) !== LAVA) || chests.some((q) => q.tx === tx && q.ty === ty)) return 'Ô này không trống';
  if (houseExitBlocked(tx, ty)) return 'Đừng chặn lối ra';
  if (isSeaTile(tx, ty)) return 'Không đặt được trên biển';
  if (!WALKABLE_BUILD.has(b.tile) && tileOverlapsPlayer(tx, ty)) return 'Lùi ra một chút';
  return null;
}
function drawBuildGhost(camX, camY) {
  if (ui || deathScreen) return;
  const id = slotList()[hotbarSel];
  const b = BUILD_BY_ITEM[id];
  if (!b || !(inv[id] > 0)) return;
  let tx, ty;
  if (keys['Space']) ({ tx, ty } = facingTile());
  else { tx = Math.floor((mouse.x + camX) / TILE); ty = Math.floor((mouse.y + camY) / TILE); }
  const why = buildBlockReason(b, tx, ty);
  const sx = tx * TILE - camX, sy = ty * TILE - camY;
  ctx.save();
  ctx.globalAlpha = why ? 0.3 : 0.65;
  drawBuildTile(b.tile, sx, sy, tx, ty, buildRot);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = why ? '#ff5a4d' : '#6bff7a';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px sans-serif';
  const label = why || (ROTATABLE.has(b.tile) ? 'R: xoay · hướng ' + ROT_NAME[buildRot] : '');
  if (label) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; const w = ctx.measureText(label).width + 12; ctx.fillRect(sx + TILE / 2 - w / 2, sy - 24, w, 18); ctx.fillStyle = why ? '#ff9a90' : '#ffd34d'; ctx.fillText(label, sx + TILE / 2, sy - 11); }
  ctx.restore();
}

function drawTile(type, sx, sy, key) {
  if (type === STAIRS) { drawStairs(sx, sy); return; }
  if (type === VCONE || type === VROCK || type === VSNAG || type === VCRYS) { drawVolcTile(type, sx, sy, key); return; }
  if (type === GWALL) { const [gx, gy] = key.split(',').map(Number); drawGateWall(sx, sy, gx, gy); return; }
  if (layer === 1 && ROCK_STYLE[type]) { drawMineBlock(type, sx, sy, key); return; }
  if (type === TREE) drawTree(sx, sy, key);
  else if (type === ROD) drawRod(sx, sy, key);
  else if (type === DROD) drawDarkRod(sx, sy, key);
  else if (type === FOSSIL) drawFossil(sx, sy);
  else if (type === TABLE) drawTable(sx, sy, key);
  else if (type === FURNACE) drawFurnaceTile(sx, sy, key);
  else if (type === MILL) drawMillTile(sx, sy, key);
  else if (type === OVEN) drawOvenTile(sx, sy, key);
  else if (type === RADIO) drawRadioTile(sx, sy, key);
  else if (type === BED) drawBedTile(sx, sy, key);
  else if (type === STORE) drawStoreTile(sx, sy, key);
  else if (BUILD_DRAW[type]) {
    const [tx, ty] = key.split(',').map(Number);
    drawBuildTile(type, sx, sy, tx, ty, changes.get('r' + key) || 0, shakeOffset(key));
  }
  else drawRock(type, sx, sy, key);
}

// Túi đồ rơi lại sau khi chết
function drawBag(b, camX, camY) {
  const sx = b.x - camX, sy = b.y - camY;
  const bob = Math.sin(b.t * 3) * 2;
  ctx.fillStyle = 'rgba(255,211,77,' + (0.14 + 0.08 * Math.sin(b.t * 4)) + ')';
  ctx.beginPath(); ctx.arc(sx, sy, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 12, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(sx, sy - 4 + bob);
  ctx.scale(0.8, 0.8);
  ctx.fillStyle = '#8b5a2b'; ctx.strokeStyle = '#3d2410'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-13, 16); ctx.quadraticCurveTo(-21, 2, -9, -6); ctx.lineTo(9, -6); ctx.quadraticCurveTo(21, 2, 13, 16);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#a9743a'; ctx.fillRect(-9, -12, 18, 7);
  ctx.strokeRect(-9, -12, 18, 7);
  ctx.fillStyle = '#e6c27a'; ctx.fillRect(-10, -6, 20, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-9, 0, 4, 10);
  ctx.restore();
}

const MINE_CHEST = [null, { body: '#7a6a3a', lid: '#b39a52', glow: '255,210,90' }, { body: '#3b5f86', lid: '#5b8fc4', glow: '90,170,255' }, { body: '#1f7a6e', lid: '#34b8a4', glow: '70,240,200' }];
function drawChest(c, camX, camY) {
  const p = tileCenter(c.tx, c.ty);
  const sx = p.x - camX, sy = p.y - camY;
  const bob = Math.sin(c.t * 3) * 2;
  const locked = c.rare && guardsAlive(c) > 0;
  if (c.volc) { VolcBoss.drawChest(c, sx, sy); return; } // Rương Lửa của boss núi lửa (volcano-boss.js)
  if (c.omni) { FinalBoss.drawChest(c, sx, sy); return; } // Rương báu giữa phòng boss cuối (final-boss.js)

  // Rương legendary: quầng sáng vàng cam + tia sáng xoay
  if (c.legend) {
    const pulse = 0.22 + 0.12 * Math.sin(c.t * 4);
    ctx.fillStyle = 'rgba(255,170,40,' + pulse + ')';
    ctx.beginPath(); ctx.arc(sx, sy, 54, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,120,' + (pulse * 0.8) + ')';
    ctx.beginPath(); ctx.arc(sx, sy, 34, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = c.t * 1.2 + i * Math.PI / 2;
      ctx.fillStyle = 'rgba(255,240,170,0.8)';
      ctx.fillRect(sx + Math.cos(a) * 36 - 2, sy - 4 + Math.sin(a) * 20 - 2, 4, 4);
    }
  }
  // Rương kho báu hầm mỏ: quầng sáng theo tầng (nông: vàng, sâu: xanh dương, vực thẳm: ngọc)
  if (c.mine) {
    const pulse = 0.16 + 0.1 * Math.sin(c.t * 4);
    ctx.fillStyle = 'rgba(' + MINE_CHEST[c.mine].glow + ',' + pulse + ')';
    ctx.beginPath(); ctx.arc(sx, sy, 42, 0, Math.PI * 2); ctx.fill();
  }
  // Rương hiếm: quầng sáng tím
  if (c.rare && !c.legend) {
    const pulse = 0.18 + 0.1 * Math.sin(c.t * 4);
    ctx.fillStyle = 'rgba(170,110,255,' + pulse + ')';
    ctx.beginPath();
    ctx.arc(sx, sy, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 14, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // thân rương
  ctx.fillStyle = c.legend ? '#8a1f1f' : c.mine ? MINE_CHEST[c.mine].body : c.rare ? '#5b3a9e' : '#8a5a2b';
  ctx.fillRect(sx - 16, sy - 6 + bob, 32, 20);
  // nắp
  ctx.fillStyle = c.legend ? '#c23a2a' : c.mine ? MINE_CHEST[c.mine].lid : c.rare ? '#7d55c9' : '#a8712f';
  ctx.fillRect(sx - 16, sy - 14 + bob, 32, 10);
  // viền vàng + khóa
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(sx - 16, sy - 6 + bob, 32, 3);
  ctx.fillRect(sx - 3, sy - 8 + bob, 6, 10);
  ctx.fillStyle = c.legend ? '#4a0f0f' : c.rare ? '#34205e' : '#5a3a18';
  ctx.fillRect(sx - 16, sy + 11 + bob, 32, 3);
  if (c.legend) { ctx.fillStyle = '#ffd34d'; ctx.fillRect(sx - 18, sy - 15 + bob, 36, 3); ctx.fillRect(sx - 18, sy + 11 + bob, 36, 3); ctx.fillRect(sx - 18, sy - 15 + bob, 3, 29); ctx.fillRect(sx + 15, sy - 15 + bob, 3, 29); }
  if (locked) {
    // ổ khoá đỏ: còn zombie canh
    ctx.fillStyle = '#d63a3a';
    ctx.fillRect(sx - 5, sy - 4 + bob, 10, 8);
    ctx.strokeStyle = '#d63a3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy - 4 + bob, 4, Math.PI, 0);
    ctx.stroke();
  }

  // lấp lánh
  const tw = (Math.sin(c.t * 5) + 1) / 2;
  ctx.fillStyle = c.legend ? 'rgba(255,235,150,' : c.rare ? 'rgba(230,200,255,' + (0.4 + tw * 0.6) + ')' : 'rgba(255,240,160,' + (0.4 + tw * 0.6) + ')';
  ctx.fillRect(sx + 12, sy - 20 + bob - tw * 4, 3, 3);
  ctx.fillRect(sx - 14, sy - 17 + bob - (1 - tw) * 4, 2, 2);
}

// ---------- Vẽ: zombie ----------
function drawZombie(z, camX, camY) {
  const sx = Math.round(z.x - camX), sy = Math.round(z.y - camY);
  const sheets = ZSPRITES[z.type];

  // bóng dưới chân (mờ dần khi đã chết)
  const fade = z.dead ? Math.max(0, 1 - Math.max(0, z.deadT - 1.2) / 1) : 1;
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 12, z.dead ? 24 : 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!zombieSpritesReady) {
    ctx.fillStyle = '#5f8f3c';
    ctx.fillRect(sx - 10, sy - 40, 20, 50);
    ctx.globalAlpha = 1;
    return;
  }

  // chọn hoạt ảnh
  let name = 'idle', frame;
  if (z.dead) name = 'dead';
  else if (z.hurtT > 0) name = 'hurt';
  else if (z.atkT > 0) name = 'attack';
  else if (z.moving) name = z.running ? 'run' : 'walk';
  const elec = z.type === 6, cell = elec ? ZCELL6 : ZCELL;
  const a = (elec ? ZANIMS6 : ZANIMS)[name];
  if (name === 'dead') frame = Math.min(a.frames - 1, Math.floor(z.deadT * a.fps));
  else if (name === 'attack') frame = Math.min(a.frames - 1, Math.floor((1 - z.atkT / Z_ATTACK_TIME) * a.frames));
  else if (name === 'hurt') frame = Math.min(a.frames - 1, Math.floor((1 - z.hurtT / 0.3) * a.frames));
  else frame = Math.floor(z.t * a.fps) % a.frames;

  ctx.save();
  ctx.translate(sx, sy + 12);        // đáy khung = chân zombie
  if (z.face < 0) ctx.scale(-1, 1);  // sprite gốc quay sang phải
  ctx.drawImage(sheets[name], frame * cell.w, 0, cell.w, cell.h, -cell.w / 2, -cell.h, cell.w, cell.h);
  ctx.restore();
  ctx.globalAlpha = 1;

  // thanh máu (luôn hiện) + số máu
  if (!z.dead) {
    const ratio = Math.max(0, z.hp) / z.maxHp;
    const w = 40, x = sx - w / 2, y = sy - 70;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, w + 2, 7);
    ctx.fillStyle = '#7a1c1c';
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = hpColor(ratio);
    ctx.fillRect(x, y, w * ratio, 5);
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    shadowText(Math.ceil(Math.max(0, z.hp)) + '/' + z.maxHp, sx, y - 3, '#fff');
  }
}

// ---------- Vẽ: nhân vật ----------
function drawPlayerFallback(sx, sy) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 12, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a6fd8';
  ctx.fillRect(sx - 9, sy - 6, 18, 18);
  ctx.fillStyle = '#f1c9a0';
  ctx.beginPath();
  ctx.arc(sx, sy - 12, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayerSprite(sx, sy, sheetSet) {
  if (bowSpriteActive()) { drawBowShot(sx, sy); return; }
  // Chọn hoạt ảnh
  let name = 'idle';
  if (attackAnim > 0 && !hoeSwing) name = 'attack';
  else if (player.running) name = 'run';
  else if (player.moving) name = 'walk';

  const a = ANIMS[name];
  let row = 0;
  if (player.faceY > 0) row = 0;
  else if (player.faceX < 0) row = 1;
  else if (player.faceX > 0) row = 2;
  else if (player.faceY < 0) row = 3;

  // Sheet idle: hàng "lên" (3) chỉ có 4 frame, các frame còn lại để trống
  // -> nếu dùng đủ 12 frame thì nhân vật biến mất (chớp nháy) khi quay lưng.
  const nFrames = (name === 'idle' && row === 3) ? 4 : a.frames;

  let frame;
  if (name === 'attack') {
    frame = Math.min(a.frames - 1, Math.floor((1 - attackAnim / ATTACK_TIME) * a.frames));
  } else {
    frame = Math.floor(player.animTime * a.fps) % nFrames;
  }

  const S = SPRITE_SCALE;
  // Bóng của sprite nằm quanh (32, 43) trong khung 64x64 -> đặt vào chân nhân vật
  const dx = sx - 32 * S;
  const dy = sy + 12 - 43 * S + hoeBob();
  ctx.drawImage(sheetSet[name], frame * FRAME, row * FRAME, FRAME, FRAME, dx, dy, FRAME * S, FRAME * S);
  playerPose = { name, row, frame };
}

// Thanh máu nhỏ trên đầu, chỉ hiện khi đã mất máu
function drawHeadBar(sx, sy) {
  if (player.hp >= MAX_HP && player.sinceHurt > 3) return;
  const w = 44, h = 6, x = sx - w / 2, y = sy - 56;
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#7a1c1c';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = hpColor(player.hp / MAX_HP);
  ctx.fillRect(x, y, w * player.hp / MAX_HP, h);
}

// Vẽ dụng cụ đang vung trên tay nhân vật (kiếm, rìu, cuốc) để thấy rõ đang đánh bằng gì
function drawSwingTool(sx, sy) {
  if (bowSpriteActive()) return; // cung đã nằm sẵn trong sprite
  if (TOOLUSE_REPLACE_BODY && TOOLUSE.img && toolUseKind()) return; // sprite dùng trang bị đã có sẵn dụng cụ
  if (hoeSwing) { drawHoeSwing(sx, sy); return; }
  if (waterSwing) { drawWaterSwing(sx, sy); return; }
  if (!swingTool || attackAnim <= 0) return;
  if (swingTool.id === 'sword' && fullSetTier() && !bowSpriteActive()) return; // sprite mặc giáp nguyên bộ đã cầm sẵn kiếm
  const prog = Math.min(1, Math.max(0, 1 - attackAnim / ATTACK_TIME));
  const dir = player.faceX < 0 ? -1 : 1;
  if (swingTool.id === 'bow') { // cung: giơ thẳng về phía bắn, không vung
    const bx = sx + (player.faceX !== 0 ? player.faceX * 20 : 0), by = sy - 14 + (player.faceY > 0 ? 8 : player.faceY < 0 ? -8 : 0);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(player.faceX !== 0 ? (player.faceX < 0 ? Math.PI : 0) : (player.faceY > 0 ? Math.PI / 2 : -Math.PI / 2));
    drawIcon('bow', -14, -14, 30);
    ctx.restore();
    return;
  }
  const ang = (-1.0 + prog * 2.0) * dir;
  const hx = sx + (player.faceX !== 0 ? player.faceX * 18 : 14), hy = sy - 12 + (player.faceY > 0 ? 6 : 0);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  drawIcon(swingTool.id, -6, -24, 28, swingTool.tier);
  ctx.restore();
}

const PLAYER_HEAD = { // [x, y đỉnh đầu] trong khung 64x64, theo hoạt ảnh -> hàng hướng -> khung (đo từ sprite)
    idle: [
      [[30,20],[30,20],[30,20],[30,20],[30,20],[30,20],[32,20],[32,20],[32,20],[32,20],[32,20],[30,20]],
      [[31,19],[31,19],[31,19],[31,19],[31,19],[31,19],[32,19],[32,19],[32,19],[32,19],[32,19],[31,19]],
      [[32,19],[32,19],[32,19],[32,19],[32,19],[32,19],[32,19],[32,19],[32,19],[32,19],[32,19],[32,19]],
      [[32,20],[33,20],[32,20],[33,20],null,null,null,null,null,null,null,null],
    ],
    walk: [
      [[30,21],[30,19],[30,19],[31,21],[32,19],[31,20]],
      [[31,19],[31,17],[30,17],[30,18],[31,18],[31,17]],
      [[32,19],[32,17],[33,17],[32,18],[32,18],[32,17]],
      [[32,20],[32,18],[32,18],[33,19],[32,18],[33,19]],
    ],
    run: [
      [[30,18],[30,19],[30,19],[30,17],[30,18],[32,19],[32,19],[30,17]],
      [[30,17],[30,20],[31,18],[31,17],[30,17],[30,20],[31,18],[31,17]],
      [[32,17],[32,20],[32,18],[32,17],[32,17],[32,20],[32,18],[32,17]],
      [[32,18],[30,18],[29,19],[32,19],[32,18],[32,18],[31,19],[32,19]],
    ],
};

// Tư thế sprite vừa vẽ: để nón bám theo đầu từng khung hình (đầu nhấp nhô khi đi / chạy)
let playerPose = { name: 'idle', row: 0, frame: 0 };

// Nón lá có đang đội không (đội nón thì không đội mũ sắt cùng lúc)
function hatWorn() { return hatOn && inv.nonla > 0 && !wornGearIn('head'); }

// Nón lá đội trên đầu. (cx, topY) = điểm giữa đỉnh đầu theo toạ độ màn hình; S = tỉ lệ sprite; row = hướng nhìn
function mkHat(cx, topY, S, row) {
  const by = topY + 5.5 * S, hw = 10 * S, h = 9 * S, rim = 2.4 * S;
  const sideShift = row === 1 ? -1 * S : row === 2 ? 1 * S : 0;
  cx += sideShift;
  ctx.save();
  // quai nón (không thấy khi quay lưng)
  if (row !== 3) {
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = Math.max(1, S * 0.7); ctx.lineCap = 'round';
    ctx.beginPath();
    if (row === 0) {
      ctx.moveTo(cx - hw * 0.7, by + rim * 0.5); ctx.lineTo(cx - 3.5 * S, by + 10 * S);
      ctx.moveTo(cx + hw * 0.7, by + rim * 0.5); ctx.lineTo(cx + 3.5 * S, by + 10 * S);
    } else {
      const f = row === 1 ? -1 : 1;
      ctx.moveTo(cx + f * hw * 0.55, by + rim * 0.8); ctx.lineTo(cx + f * 2.5 * S, by + 10 * S);
    }
    ctx.stroke();
  }
  // thân nón: hình chóp, đáy cong
  ctx.beginPath();
  ctx.moveTo(cx, by - h); ctx.lineTo(cx + hw, by);
  ctx.ellipse(cx, by, hw, rim, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = '#ead9a0'; ctx.fill();
  // nửa bóng bên phải
  ctx.beginPath();
  ctx.moveTo(cx, by - h); ctx.lineTo(cx + hw, by);
  ctx.ellipse(cx, by, hw, rim, 0, 0, Math.PI / 2, false);
  ctx.closePath();
  ctx.fillStyle = '#c9b274'; ctx.fill();
  // vành cong và vòng nan
  ctx.strokeStyle = '#a88a4c'; ctx.lineWidth = 1;
  for (const t of [0.4, 0.7]) {
    const y = by - h + h * t, w = hw * t;
    ctx.beginPath(); ctx.ellipse(cx, y, w, rim * t, 0, 0, Math.PI, false); ctx.stroke();
  }
  ctx.strokeStyle = '#8a6d3b';
  ctx.beginPath();
  ctx.moveTo(cx, by - h); ctx.lineTo(cx + hw, by);
  ctx.ellipse(cx, by, hw, rim, 0, 0, Math.PI, false);
  ctx.closePath(); ctx.stroke();
  ctx.restore();
}

// Đội nón lên đầu nhân vật theo đúng khung hình đang vẽ (sx, sy: chân nhân vật trên màn hình)
function drawPlayerHat(sx, sy) {
  const S = SPRITE_SCALE;
  const { name, row, frame } = playerPose;
  if (playerPose.tu) { // sprite dùng trang bị: đội nón theo mặt từng khung
    const T = TOOLUSE, h = T.heads[playerPose.tu.r][playerPose.tu.frame];
    mkHat(sx + (h[0] - T.ax) * toolSide, sy + 14 - T.ay + h[1] - 17, 1.6, row);
    return;
  }
  // Hoạt ảnh chém: sprite có cả vũ khí nên không đo được đầu -> lấy vị trí đầu lúc đứng yên
  const tbl = PLAYER_HEAD[name] || PLAYER_HEAD.idle;
  const pt = (tbl[row] && tbl[row][frame]) || PLAYER_HEAD.idle[row][0];
  const dx = sx - 32 * S, dy = sy + 12 - 43 * S + hoeBob();
  mkHat(dx + pt[0] * S, dy + pt[1] * S, S, row);
}

// Giáp mặc trên người: bám theo đầu (mũ, áo giáp) và vị trí đứng yên (quần, giày) của từng khung hình
const ATTACK_SHIFT = [ // [hàng hướng][0 = dịch ngang, 1 = dịch dọc][khung chém 0..7], đơn vị điểm ảnh sprite, so với lúc đứng yên
  [[0, 0, 0, 0, 5, 5, 3, 2], [0, 0, -1, 5, 1, 1, 1, 1]],
  [[1, 0, 2, -3, -5, -3, -3, -2], [0, -1, -2, 0, 0, -1, 0, 0]],
  [[0, 0, -2, 3, 5, 3, 3, 2], [0, -1, -2, 0, 0, -1, 0, 0]],
  [[0, 0, 0, 0, -4, -5, -3, -2], [0, 0, -1, 1, 1, 0, 1, 1]],
];
const WORN_OFF = { legs: 18, feet: 21, chest: 10, head: -1 }; // lệch xuống so với đỉnh đầu (đơn vị điểm ảnh sprite)
function wornTier(id) { return DIAMOND_ARMOR[id] ? 'diamond' : GOLD_ARMOR[id] ? 'gold' : 'iron'; }
// Cột (khung) giáp tương ứng với khung chuyển động của nhân vật: đứng yên 0-1, đi 2-4, chạy 5-6 (đúng thứ tự bảng giáp theo khung)
function armorFrameCol(name, frame) {
  if (name === 'walk') return 2 + Math.min(2, Math.floor(frame / 2));
  if (name === 'run') return 5 + Math.min(1, Math.floor(frame / 4));
  if (name === 'idle') return frame < 6 ? 0 : 1;
  return 0;
}
const ARMOR_ROW = { head: 0, chest: 1, legs: 2, feet: 3 };
function drawPlayerArmor(sx, sy) {
  const S = SPRITE_SCALE;
  const { name, row, frame } = playerPose;
  const tbl = PLAYER_HEAD[name] || PLAYER_HEAD.idle;
  let live = (tbl[row] && tbl[row][frame]) || PLAYER_HEAD.idle[row][0];
  const still = PLAYER_HEAD.idle[row][0];
  let ax = 0; // khi chém, người lao / nghiêng theo từng khung (đo từ sprite): cả bộ giáp dịch theo
  if (name === 'attack') {
    const sh = ATTACK_SHIFT[row], f = Math.min(frame, 7);
    live = [still[0] + sh[0][f], still[1] + sh[1][f]];
    ax = sh[0][f];
  }
  const col = armorFrameCol(name, frame);
  const dx = sx - 32 * S, dy = sy + 12 - 43 * S + hoeBob();
  const view = row === 1 || row === 2 ? 'side' : 'front';
  const shift = row === 1 ? -1 : row === 2 ? 1 : 0;
  for (const part of ['legs', 'feet', 'chest', 'head']) {
    const id = wornGearIn(part);
    if (!id) continue;
    const atlas = ARMOR_FR[wornTier(id) + '_' + view];
    if (!atlas) continue;
    const pt = part === 'legs' || part === 'feet' ? [still[0] + ax, still[1]] : live;
    ctx.drawImage(atlas, col * 32, ARMOR_ROW[part] * 20, 32, 20, Math.round(dx + pt[0] * S + shift - 16), Math.round(dy + (pt[1] + WORN_OFF[part]) * S), 32, 20);
  }
}

// Mặc đủ 4 món cùng một loại -> dùng sprite nhân vật mặc nguyên bộ giáp loại đó (iron / gold / diamond), ngược lại trả về null
const CHAR_IMG = {}; // ảnh nhân vật mặc nguyên bộ giáp (hiện trong túi đồ khi mặc đủ 4 món cùng loại)
function uniformSetTier() {
  const ids = ARMOR_SLOTS.map(wornGearIn);
  if (ids.some((x) => !x)) return null;
  const t = ids.map(wornTier);
  return t.every((x) => x === t[0]) ? t[0] : null;
}
const SHOW_ARMOR_IN_WORLD = false; // false = giáp chỉ hiện trong túi đồ (inventory), không vẽ lên nhân vật ngoài map
const USE_FULLBODY_ARMOR = false; // true = mặc đủ bộ thì thay cả nhân vật bằng sprite mặc giáp nguyên bộ (assets/player/armored)
function fullSetTier() {
  if (!USE_FULLBODY_ARMOR) return null;
  const ids = ARMOR_SLOTS.map(wornGearIn);
  if (ids.some((x) => !x)) return null;
  const t = ids.map(wornTier);
  return t.every((x) => x === t[0]) && ARMOR_BODY[t[0] + '_idle'] ? t[0] : null;
}
// Sheet nhân vật mặc giáp: idle/walk/run ô 80x80 (chân ở dòng 76); attack (4 khung: 2 chém + 2 chém xoáy có vệt kiếm) và hurt (2 khung) ô 128x96 (chân ở dòng 92)
const ARMOR_BODY_CELL = { idle: [80, 80, 76], walk: [80, 80, 76], run: [80, 80, 76], attack: [128, 96, 92], hurt: [128, 96, 92] };
const WALK_CYCLE = [0, 1, 2, 1];
function drawArmoredBody(sx, sy, tier) {
  let name = 'idle';
  if (attackAnim > 0 && !hoeSwing) name = 'attack';
  else if (player.sinceHurt < 0.35 && ARMOR_BODY[tier + '_hurt']) name = 'hurt';
  else if (player.running) name = 'run';
  else if (player.moving) name = 'walk';
  let row = 0;
  if (player.faceY > 0) row = 0;
  else if (player.faceX < 0) row = 1;
  else if (player.faceX > 0) row = 2;
  else if (player.faceY < 0) row = 3;
  let frame = 0, bob = 0, flip = false, sway = 0;
  if (name === 'attack') frame = Math.min(3, Math.floor((1 - attackAnim / ATTACK_TIME) * 4));
  else if (name === 'hurt') frame = player.sinceHurt < 0.17 ? 0 : 1;
  else if (name === 'walk' || name === 'run') {
    const st = Math.floor(player.animTime * (name === 'walk' ? 8 : 11)), k = st % 4;
    if (row === 0) { frame = k % 2 ? 0 : 1; flip = k === 2; } // nhìn thẳng: bảng gốc ít khác biệt giữa các khung -> bước chân trái / phải luân phiên bằng cách lật ngang
    else if (row === 3) { frame = 0; sway = k === 1 ? -1 : k === 3 ? 1 : 0; }
    else frame = name === 'walk' ? WALK_CYCLE[k] : k % 2;
    bob = k % 2 ? -2 : 0;
  }
  else frame = Math.floor(player.animTime * 2.5) % 2;
  const [cw, ch, ground] = ARMOR_BODY_CELL[name];
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 12, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(sx + sway, 0);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(ARMOR_BODY[tier + '_' + name], frame * cw, row * ch, cw, ch, -cw / 2, Math.round(sy + 13 - ground + hoeBob() + bob), cw, ch);
  ctx.restore();
  playerPose = { name: 'idle', row, frame: 0 };
}

function drawPlayer(camX, camY) {
  const sx = Math.round(player.x - camX), sy = Math.round(player.y - camY);
  const sheetSet = SPRITES[outfitLevel()];

  // Nhấp nháy khi đang bất tử
  if (player.invuln > 0 && Math.floor(gameTime * 20) % 2 === 0) ctx.globalAlpha = 0.45;
  const tuKind = TOOLUSE_REPLACE_BODY && TOOLUSE.img && !fullSetTier() ? toolUseKind() : null;
  const bookHeld = !!(window.BookHold && BookHold.active() && spritesReady && sheetSet && !tuKind && !bowSpriteActive() && !(attackAnim > 0)); // đang cầm Sách Hệ (bookhold.js)
  if (boating && layer !== 0) boating = false;
  if (boating && BT.sheet) { drawBoat(sx, sy); ctx.globalAlpha = 1; drawHeadBar(sx, sy); return; }
  const swimming = isSwimming();
  if (swimming && drawSwimmer(sx, sy)) { /* đang bơi */ }
  else if (!spritesReady || !sheetSet) drawPlayerFallback(sx, sy);
  else if (bookHeld) BookHold.draw(sx, sy);
  else if (tuKind) drawToolUseBody(sx, sy, tuKind);
  else if (fullSetTier() && !bowSpriteActive()) drawArmoredBody(sx, sy, fullSetTier());
  else drawPlayerSprite(sx, sy, sheetSet);
  if (!swimming && SHOW_ARMOR_IN_WORLD && spritesReady && sheetSet && !bowSpriteActive() && !fullSetTier() && !tuKind && !bookHeld) drawPlayerArmor(sx, sy); // giáp mặc trên người
  if (!swimming && hatWorn() && !bowSpriteActive() && !bookHeld) drawPlayerHat(sx, sy); // sprite bắn cung có kiểu tóc riêng nên tạm ẩn nón
  if (!bookHeld && !swimming) drawSwingTool(sx, sy);
  ctx.globalAlpha = 1;

  drawHeadBar(sx, sy);
}

// ---------- Vẽ: thế giới ----------
function drawGround(camX, camY, tx0, ty0, tx1, ty1) {
  if (layer === 3) { drawArenaGround(camX, camY, tx0, ty0, tx1, ty1); return; }
  const gateFloors = layer === 1 ? gatesIn(tx0, ty0, tx1, ty1) : []; // sàn đá của phòng Cổng Ma Vương (dưới hầm)
  if (layer === 2 && houseCur && houseCur.blackMarket && blackInterior) { // Chợ Đen: nền là ảnh nội thất (cắt viền đen)
    ctx.fillStyle = '#0b0710';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const B = BM_IMG;
    ctx.drawImage(blackInterior, B.sx, B.sy, B.sw, B.sh, Math.round(B.x - camX), Math.round(B.y - camY), Math.round(B.w), Math.round(B.h));
    return;
  }
  if (layer === 2 && houseCur && houseCur.witchHouse && witchInterior) { // Nhà Phù Thủy: nền là ảnh nội thất
    ctx.fillStyle = '#120d09';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const R = WITCH_ROOM_IMG;
    ctx.drawImage(witchInterior, Math.round(R.x - camX), Math.round(R.y - camY), Math.round(R.w), Math.round(R.h));
    return;
  }
  if (layer === 2) { // sàn gỗ trong nhà
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const sx = tx * TILE - camX, sy = ty * TILE - camY;
        const room = tx >= -4 && tx <= 4 && ty >= -4 && ty <= 1;
        const door = tx === 0 && ty === 2;
        if (room || door) {
          ctx.fillStyle = door ? '#7a5530' : (tx + ty) % 2 ? '#a47c4b' : '#9a7243';
          ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(sx, sy + 23, TILE + 1, 2);
          if (door) { ctx.fillStyle = '#d9b26f'; ctx.fillRect(sx + 6, sy + 10, TILE - 12, 20); }
        } else {
          ctx.fillStyle = '#120d09';
          ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
        }
      }
    }
    return;
  }
  if (layer === 1) {
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const hv = hash(tx * 3 + 7, ty * 5 + 11);
        const ft = getTile(tx, ty);
        if (ft === LAVA || ft === WATER) { drawFluidTile(ft, tx * TILE - camX, ty * TILE - camY, hv); continue; }
        if (gateFloors.length) { const gf = gateFloorOf(gateFloors, tx, ty); if (gf) { drawGateFloor(gf, tx, ty, tx * TILE - camX, ty * TILE - camY); continue; } }
        ctx.fillStyle = hv < 0.33 ? '#3a3a42' : hv < 0.66 ? '#36363e' : '#3e3e46';
        ctx.fillRect(tx * TILE - camX, ty * TILE - camY, TILE + 1, TILE + 1);
        if (hv > 0.92) { ctx.fillStyle = '#2c2c33'; ctx.fillRect(tx * TILE - camX + 12, ty * TILE - camY + 22, 8, 4); }
      }
    }
    return;
  }
  drawSeaWater(camX, camY, tx0, ty0, tx1, ty1);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const hv = hash(tx * 3 + 7, ty * 5 + 11);
      if (getTile(tx, ty) === FARM) { drawFarmSoil(tx, ty, tx * TILE - camX, ty * TILE - camY, hv); continue; }
      if (getTile(tx, ty) === LAVA) { drawPlacedLava(tx, ty, tx * TILE - camX, ty * TILE - camY, hv); continue; }
      if (getTile(tx, ty) === WATER) { drawPlacedWater(tx, ty, tx * TILE - camX, ty * TILE - camY, hv); continue; }
      const vg = villageAt(tx, ty);
      const trail = vg && vg.trail.has(tx + ',' + ty);
      if (vg && vg.isMarket && tx > vg.x0 && tx < vg.x1 && ty > vg.y0 && ty < vg.y1) { drawMarketFloor(tx, ty, hv, tx * TILE - camX, ty * TILE - camY); continue; }
      if (!vg && seaType(tx, ty)) { drawSeaGround(tx, ty, hv, tx * TILE - camX, ty * TILE - camY); continue; }
      if (!vg) { const vz = volcanoGround(tx, ty); if (vz) { drawVolcanoGround(tx, ty, vz, hv, tx * TILE - camX, ty * TILE - camY); continue; } } // nền tro đảo núi lửa
      if (!vg && swampType(tx, ty)) { drawSwampGround(tx, ty, hv, tx * TILE - camX, ty * TILE - camY); continue; }
      const dirt = trail || (vg && ty >= vg.py0 && ty <= vg.py1 && tx > vg.x0 && tx < vg.x1);
      ctx.fillStyle = trail ? (hv < 0.33 ? '#957a4f' : hv < 0.66 ? '#8d7248' : '#9c8155')
        : dirt ? (hv < 0.33 ? '#a38457' : hv < 0.66 ? '#9b7c50' : '#aa8b5e')
        : hv < 0.33 ? '#4f7a34' : hv < 0.66 ? '#4a7330' : '#548039';
      ctx.fillRect(tx * TILE - camX, ty * TILE - camY, TILE + 1, TILE + 1);
      if (trail) {
        // Đường mòn: lối đất sờn, lác đác cỏ và sỏi
        const bx = tx * TILE - camX, by = ty * TILE - camY;
        ctx.fillStyle = '#4f7a34';
        if (hash(tx + 31, ty - 17) > 0.55) ctx.fillRect(bx + 2, by + 6, 4, 6);
        if (hash(tx - 9, ty + 23) > 0.55) ctx.fillRect(bx + TILE - 7, by + 30, 4, 7);
        if (hv > 0.8) { ctx.fillStyle = '#7a6140'; ctx.fillRect(bx + 14, by + 18, 6, 4); }
        if (hv < 0.15) { ctx.fillStyle = '#b09a74'; ctx.fillRect(bx + 28, by + 12, 4, 3); }
      } else if (dirt) {
        if (hv > 0.85) { ctx.fillStyle = '#85693f'; ctx.fillRect(tx * TILE - camX + 12, ty * TILE - camY + 20, 6, 4); }
      } else {
        drawGrassDecor(tx, ty, tx * TILE - camX, ty * TILE - camY, vg, hv);
      }
    }
  }
}

// Dung nham (cam, nhấp nhô) và nước ngầm (xanh, gợn sóng) dưới hầm
function drawFluidTile(type, sx, sy, hv) {
  const w = Math.sin(gameTime * 2 + hv * 20);
  if (type === LAVA) {
    ctx.fillStyle = '#b8310e'; ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
    ctx.fillStyle = '#ee6a1c'; ctx.fillRect(sx + 6 + w * 4, sy + 8, 20, 12); ctx.fillRect(sx + 22 - w * 3, sy + 26, 18, 12);
    ctx.fillStyle = '#ffc04a'; ctx.fillRect(sx + 14 + w * 3, sy + 12, 8, 5);
  } else {
    ctx.fillStyle = hv < 0.5 ? '#21568a' : '#245a8f'; ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
    ctx.fillStyle = 'rgba(170,215,255,0.35)'; ctx.fillRect(sx + 8 + w * 5, sy + 12, 18, 3); ctx.fillRect(sx + 20 - w * 4, sy + 30, 16, 3);
  }
}

// Dung nham người chơi đổ ra trên mặt đất: có bờ đất cháy ở rìa
function drawPlacedLava(tx, ty, sx, sy, hv) {
  drawFluidTile(LAVA, sx, sy, hv);
  ctx.fillStyle = '#3a2418';
  if (getTile(tx, ty - 1) !== LAVA) ctx.fillRect(sx, sy, TILE + 1, 4);
  if (getTile(tx, ty + 1) !== LAVA) ctx.fillRect(sx, sy + TILE - 3, TILE + 1, 4);
  if (getTile(tx - 1, ty) !== LAVA) ctx.fillRect(sx, sy, 4, TILE + 1);
  if (getTile(tx + 1, ty) !== LAVA) ctx.fillRect(sx + TILE - 3, sy, 4, TILE + 1);
}

// Nước người chơi đổ ra trên mặt đất: ao nhỏ, có bờ đất ở rìa
function drawPlacedWater(tx, ty, sx, sy, hv) {
  const w = Math.sin(gameTime * 2 + hv * 20);
  ctx.fillStyle = hv < 0.5 ? '#2f6fb3' : '#3374b8'; ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
  ctx.fillStyle = '#5b4a2e'; // bờ đất
  if (getTile(tx, ty - 1) !== WATER) ctx.fillRect(sx, sy, TILE + 1, 4);
  if (getTile(tx, ty + 1) !== WATER) ctx.fillRect(sx, sy + TILE - 3, TILE + 1, 4);
  if (getTile(tx - 1, ty) !== WATER) ctx.fillRect(sx, sy, 4, TILE + 1);
  if (getTile(tx + 1, ty) !== WATER) ctx.fillRect(sx + TILE - 3, sy, 4, TILE + 1);
  ctx.fillStyle = 'rgba(200,230,255,0.38)';
  ctx.fillRect(sx + 9 + w * 5, sy + 13, 18, 3); ctx.fillRect(sx + 20 - w * 4, sy + 31, 16, 3);
}

function drawParticles(camX, camY) {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawBooms(camX, camY) {
  if (!FX.boom) return;
  const size = BOOM.size * BOOM.scale;
  for (const b of booms) {
    const f = Math.floor(b.t * BOOM.fps);
    if (f >= BOOM.frames) continue;
    ctx.drawImage(FX.boom, f * BOOM.size, 0, BOOM.size, BOOM.size, b.x - camX - size / 2, b.y - camY - size / 2, size, size);
  }
}

// Vòng đỏ thu nhỏ báo trước nơi sét sẽ đánh
function drawStrikeWarning(s, camX, camY) {
  const p = Math.min(1, s.t / LIGHTNING.warn);
  const sx = s.x - camX, sy = s.y - camY;
  ctx.fillStyle = 'rgba(255,70,50,' + (0.1 + 0.12 * Math.abs(Math.sin(s.t * 12))) + ')';
  ctx.beginPath();
  ctx.arc(sx, sy, STRIKE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,80,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, STRIKE_RADIUS * (1.5 - 0.5 * p), 0, Math.PI * 2);
  ctx.stroke();
}

// Hình tạm khi không tải được sprite sét
function drawBoltFallback(sx, sy, f) {
  ctx.strokeStyle = '#f4faff';
  ctx.lineWidth = f < 4 ? 5 : 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 320);
  for (let i = 1; i <= 8; i++) {
    ctx.lineTo(sx + (hash(f, i) - 0.5) * 50, sy - 320 + i * 40);
  }
  ctx.stroke();
}

function drawBolt(s, camX, camY) {
  const f = strikeFrame(s);
  if (f < 0 || f >= LIGHTNING.frames) return;
  const sx = s.x - camX, sy = s.y - camY;
  const img = FX.lightning[s.variant % FX.lightning.length];
  if (!img) { drawBoltFallback(sx, sy, f); return; }

  const w = LIGHTNING.frameW * LIGHTNING.scale, h = LIGHTNING.frameH * LIGHTNING.scale;
  if (f === 2) ctx.globalAlpha = 0.6; // khung 3 là chớp trắng, làm mờ cho đỡ gắt
  ctx.drawImage(img, f * LIGHTNING.frameW, 0, LIGHTNING.frameW, LIGHTNING.frameH, sx - w / 2, sy - h + 6, w, h);
  ctx.globalAlpha = 1;
}

function drawLighting(camX, camY) {
  const W = canvas.width, H = canvas.height;
  const d = darkness();
  if (d < 0.02) return;

  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, W, H);
  dctx.fillStyle = 'rgba(8,12,38,' + d + ')';
  dctx.fillRect(0, 0, W, H);

  dctx.globalCompositeOperation = 'destination-out';
  const light = (x, y, r, a, core = 0) => {
    const g = dctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    if (core > 0) g.addColorStop(core, 'rgba(0,0,0,' + a * 0.92 + ')'); // giữ sáng rõ tới sát mép rồi mới tắt
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.beginPath();
    dctx.arc(x, y, r, 0, Math.PI * 2);
    dctx.fill();
  };
  const torch = torchTime > 0 ? 70 + Math.sin(gameTime * 14) * 8 : 0;
  if (layer === 1) light(player.x - camX, player.y - camY - 10, 5 * TILE + torch, 0.8, 0.45); // hầm mỏ: sáng mờ, nhìn được ~4 ô quanh người, rìa tan dần
  else light(player.x - camX, player.y - camY - 10, 190 + torch, 0.95); // đèn quanh người chơi
  for (const c of chests) {
    const p = tileCenter(c.tx, c.ty);
    light(p.x - camX, p.y - camY, c.legend ? 150 : c.rare ? 120 : 80, 0.7); // rương phát sáng
  }
  if (layer === 0) volcanoLights(light, camX, camY, W, H); // miệng núi lửa toả sáng (volcano.js)
  if (window.Magma) Magma.lights(light, camX, camY); // vùng đỏ + bom dung nham toả sáng (magma.js)
  if (window.FinalBoss) FinalBoss.lights(light, camX, camY);
  if (window.VolcBoss) VolcBoss.lights(light, camX, camY); // boss núi lửa toả sáng (volcano-boss.js)
  if (layer === 0) { // Cây Cổ Thụ phát sáng huyền ảo
    const gx = Math.floor(camX / TILE), gy = Math.floor(camY / TILE);
    for (const el of eldersInView(gx, gy, gx + Math.ceil(W / TILE), gy + Math.ceil(H / TILE))) light((el.tx + 0.5) * TILE - camX, el.ty * TILE - camY - 90, 230, 0.4 * elderFade(), 0.3);
  }
  if (layer === 0) { // đèn lồng + nồi thuốc của Nhà Phù Thủy
    const gx = Math.floor(camX / TILE), gy = Math.floor(camY / TILE);
    for (const wh of witchesInView(gx, gy, gx + Math.ceil(W / TILE), gy + Math.ceil(H / TILE))) {
      light((wh.tx + 0.5) * TILE - camX, wh.ty * TILE - camY - 110, 190, 0.7, 0.4);
      for (const l of witchDecor(wh).lights) light(l.x - camX, l.y - camY, l.r, 0.6, 0.4); // đèn lồng, trụ pha lê, vạc thuốc
    }
  }
  if (layer === 1 || layer === 3) for (const z of zombies) if (z.mine && !z.dead) light(z.x - camX, z.y - camY - 70, 230, 0.8, 0.4); // tinh thể vàng trên người boss toả sáng
  { // đèn lồng người chơi đặt
    const x0 = Math.floor(camX / TILE) - 8, x1 = Math.floor((camX + W) / TILE) + 8;
    const y0 = Math.floor(camY / TILE) - 8, y1 = Math.floor((camY + H) / TILE) + 8;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const lt = getTile(tx, ty);
      if (lt === LAMP) light((tx + 0.5) * TILE - camX, (ty + 0.4) * TILE - camY, 7 * TILE, 0.95, 0.55); // đèn lồng sáng ~5 ô, mờ dần tới 7 ô
      else if (lt === DROD) light((tx + 0.5) * TILE - camX, (ty + 0.2) * TILE - camY, 4.5 * TILE, 0.85, 0.4); // Cột Thu Lôi Tím toả sáng tím
      else if (lt === LAVA) light((tx + 0.5) * TILE - camX, (ty + 0.5) * TILE - camY, 3.2 * TILE, 0.9, 0.4); // dung nham toả sáng, thấy từ xa trong hầm tối
    }
  }
  for (const [key, f] of furnaces) {
    if (f.burn <= 0) continue;
    const [fx, fy] = key.split(',').map(Number);
    const p = tileCenter(fx, fy);
    light(p.x - camX, p.y - camY, 110, 0.8);               // lò đang cháy toả sáng
  }
  if (layer === 1 || layer === 3) gateLights(light, camX, camY);
  if (layer === 0) {
    for (const o of lastVObjs) if (o.blackMarket && blackNight()) light((o.tx + o.w / 2) * TILE - camX + 18, (o.ty + o.h) * TILE - camY - 34, 120, 0.85); // đèn lồng Chợ Đen
    for (const o of lastVObjs) if (o.light) light((o.tx + 0.5) * TILE - camX, (o.ty + 1) * TILE - camY - 60, 130, 0.85); // đèn đường trong làng
  }
  for (const s of strikes) {
    if (strikeFrame(s) >= 0) light(s.x - camX, s.y - camY - 40, 280, 1); // sét làm sáng xung quanh
  }
  ctx.drawImage(darkCanvas, 0, 0);
  if (layer === 0) { // quầng sáng huyền ảo của Cây Cổ Thụ: vẽ cộng sáng LÊN TRÊN lớp bóng đêm nên luôn nhìn thấy
    const gx0 = Math.floor(camX / TILE), gy0 = Math.floor(camY / TILE);
    const pulse = 0.85 + 0.15 * Math.sin(gameTime * 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const el of eldersInView(gx0, gy0, gx0 + Math.ceil(W / TILE), gy0 + Math.ceil(H / TILE))) {
      const f = elderFade() * pulse, cx = (el.tx + 0.5) * TILE - camX, cy = el.ty * TILE - camY - ELDER.drawTiles * TILE * 0.3, r = ELDER.drawTiles * TILE * 0.7;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(140,110,255,' + (0.30 * f) + ')');
      g.addColorStop(0.45, 'rgba(70,170,255,' + (0.14 * f) + ')');
      g.addColorStop(1, 'rgba(70,170,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}

function drawRain(dt) {
  if (layer !== 0) return;
  if (layer === 1) return;
  const r = world.rain;
  if (r.intensity <= 0.01) return;
  const W = canvas.width, H = canvas.height;

  // Giông bão tối hơn mưa thường
  ctx.fillStyle = 'rgba(30,45,70,' + ((0.22 + (r.storm ? 0.14 : 0)) * r.intensity) + ')';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(190,210,235,' + (0.55 * r.intensity) + ')';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const n = Math.floor(drops.length * r.intensity);
  for (let i = 0; i < n; i++) {
    const p = drops[i];
    p.y += dt * 1.6 * p.s;
    p.x -= dt * 0.25 * p.s;
    if (p.y > 1) { p.y -= 1; p.x = Math.random(); }
    if (p.x < 0) p.x += 1;
    const x = p.x * W, y = p.y * H;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + 14);
  }
  ctx.stroke();

  // Gợn nước nhỏ khi hạt mưa chạm đất
  if (splashes.length < 60 && Math.random() < r.intensity * 0.6) {
    splashes.push({ x: Math.random() * W, y: Math.random() * H, t: 0 });
  }
  ctx.strokeStyle = 'rgba(200,220,245,0.5)';
  ctx.lineWidth = 1;
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.t += dt;
    if (s.t > 0.4) { splashes.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - s.t / 0.4;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 2 + s.t * 18, 1 + s.t * 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Chớp sáng khi sét đánh, viền đỏ khi bị thương hoặc sắp chết
function drawScreenFx(W, H) {
  if (world.flash > 0.01) {
    ctx.fillStyle = 'rgba(255,255,255,' + world.flash * 0.55 + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (sleepT > 0) {
    ctx.fillStyle = 'rgba(0,0,10,' + Math.sin(Math.PI * Math.min(1, Math.max(0, 1 - sleepT / SLEEP_TIME))) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  const lowHp = player.hp < 30 ? 0.18 + 0.1 * Math.sin(gameTime * 5) : 0;
  const a = Math.max(hurtFlash * 0.6, lowHp);
  if (a < 0.01) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, 'rgba(200,0,0,0)');
  g.addColorStop(1, 'rgba(200,0,0,' + a + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawBagArrows(camX, camY) {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, m = 46;
  const targets = []; // rương không có mũi tên chỉ đường: người chơi tự đi tìm. Chỉ chỉ hướng túi đồ rơi khi chết
  for (const b of bags) if (b.layer === layer) targets.push({ p: { x: b.x, y: b.y }, color: '#ff6a5a' });
  for (const { p, color } of targets) {
    const sx = p.x - camX, sy = p.y - camY;
    if (sx > m && sx < W - m && sy > m && sy < H - m) continue; // đang thấy rồi

    const vx = sx - cx, vy = sy - cy;
    const k = Math.min((W / 2 - m) / Math.abs(vx || 1e-6), (H / 2 - m) / Math.abs(vy || 1e-6));
    const ax = cx + vx * k, ay = cy + vy * k;
    const ang = Math.atan2(vy, vx);

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const tiles = Math.round(Math.hypot(p.x - player.x, p.y - player.y) / TILE);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tiles + ' ô', ax - Math.cos(ang) * 26, ay - Math.sin(ang) * 26 + 4);
  }
}

// ---------- Vẽ: biểu tượng vật phẩm (vẽ trong ô 32x32 rồi co giãn) ----------
const TIER_COLOR = ['#8a8a8a', '#a8712f', '#9a9aa3', '#d6dde6', '#f2c14e', '#4fe0ff']; // 4 = vàng, 5 = kim cương

function drawOreIcon(body, top, speck) {
  poly([[4, 26], [7, 13], [16, 6], [27, 13], [29, 26]], body);
  poly([[9, 15], [16, 9], [22, 14], [14, 20]], top);
  if (!speck) return;
  ctx.fillStyle = speck;
  ctx.fillRect(10, 21, 4, 4);
  ctx.fillRect(19, 17, 4, 4);
  ctx.fillRect(21, 23, 3, 3);
}

// Thỏi kim loại: mặt trên sáng, mặt trước tối hơn, cạnh bên tối nhất
function drawIngot(top, front, side) {
  poly([[8, 12], [26, 12], [30, 18], [4, 18]], top);
  ctx.fillStyle = front;
  ctx.fillRect(4, 18, 26, 8);
  poly([[30, 18], [26, 12], [26, 20], [30, 26]], side);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(6, 19, 20, 2);
}

function drawHandle(x1, y1, x2, y2) {
  ctx.strokeStyle = '#7a4f26';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// Miếng thịt (bò / heo): thân, viền, vân mỡ, vệt nướng
function drawSteakIcon(body, edge, fat, grill) {
  poly([[4, 13], [10, 6], [23, 5], [29, 12], [28, 22], [20, 28], [9, 26], [3, 19]], edge);
  poly([[6, 14], [11, 8], [22, 7], [27, 13], [26, 21], [19, 26], [10, 24], [5, 19]], body);
  ctx.fillStyle = fat;
  ctx.fillRect(10, 11, 9, 3);
  ctx.fillRect(15, 18, 9, 3);
  if (grill) {
    ctx.fillStyle = grill;
    ctx.fillRect(11, 9, 2, 15);
    ctx.fillRect(17, 8, 2, 17);
    ctx.fillRect(23, 10, 2, 12);
  }
}

// Đùi gà
function drawDrumIcon(body, edge) {
  ctx.fillStyle = '#f4f1e6';
  ctx.fillRect(18, 18, 9, 4);
  ctx.beginPath(); ctx.arc(28, 17, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(28, 23, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = edge;
  ctx.beginPath(); ctx.ellipse(13, 14, 11, 9, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(13, 14, 9, 7, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(8, 9, 6, 2);
}

// Ảnh giáp (sắt / vàng / kim cương) cho biểu tượng trong túi đồ: vẽ vừa khung 32x32, giữ tỉ lệ
function drawArmorImg(part, tier) {
  if (!(tier >= 1)) return false; // tier 0 = hình mờ gợi ý ô trống
  const img = ARMOR_IMG[(tier === 5 ? 'diamond' : tier === 4 ? 'gold' : 'iron') + '_' + part];
  if (!img) return false;
  const k = Math.min(30 / img.width, 30 / img.height);
  const w = img.width * k, h = img.height * k;
  const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 16 - w / 2, 16 - h / 2, w, h);
  ctx.imageSmoothingEnabled = sm;
  return true;
}

// Icon công cụ (rìu, cuốc, kiếm, cuốc đất) theo cấp: ảnh vuông, cán ở góc dưới trái
function drawToolImg(id, tier) {
  const img = TOOL_IMG[id + tier];
  if (!img) return false;
  ctx.drawImage(img, 0, 0, 32, 32);
  return true;
}

function drawTomeIcon(el) { // Sách Hệ luôn hiện đủ màu, không có ổ khoá
  const D = window.Dwarf, img = D && D.tome(el);
  if (!img) return;
  const sc = Math.min(30 / img.width, 30 / img.height), w = img.width * sc, h = img.height * sc;
  const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 16 - w / 2, 16 - h / 2, w, h);
  ctx.imageSmoothingEnabled = sm;
}

function drawIcon(id, x, y, size, tier = 1) {
  id = toolBase(id); // ô dụng cụ thứ 2 vẽ giống ô 1
  if (GOLD_ARMOR[id]) { tier = 4; id = GOLD_ARMOR[id]; } // giáp vàng vẽ như giáp sắt nhưng màu vàng
  else if (DIAMOND_ARMOR[id]) { tier = 5; id = DIAMOND_ARMOR[id]; } // giáp kim cương
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 32);
  if (typeof id === 'string' && (id.startsWith('seed_') || id.startsWith('crop_'))) { drawCropIcon(id); ctx.restore(); return; }
  if (typeof id === 'string' && id.startsWith('tome_')) { drawTomeIcon(id.slice(5)); ctx.restore(); return; } // Sách Hệ (đang ở hệ toạ độ 32×32)
  switch (id) {
    case 'wood':
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(4, 10, 22, 14);
      ctx.fillStyle = '#a8712f';
      ctx.fillRect(4, 10, 22, 4);
      ctx.fillStyle = '#d9ae6e';
      ctx.beginPath(); ctx.arc(26, 17, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a8712f';
      ctx.beginPath(); ctx.arc(26, 17, 3.5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'emerald':
      if (EMERALD_IMG) { // sprite pixel 12x13
        const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(EMERALD_IMG, 0, 0, 12, 13, 3, 2, 26, 28);
        ctx.imageSmoothingEnabled = sm;
      } else { poly([[16, 3], [27, 11], [24, 26], [16, 30], [8, 26], [5, 11]], '#17c964'); poly([[16, 3], [10, 10], [16, 16], [22, 10]], '#b6f5d0'); }
      break;
    case 'sulfur': {
      const si = window.Magma && Magma.sulfurImg();
      if (si) { // ảnh 64x47 (magma.js)
        ctx.drawImage(si, 0, 0, si.width, si.height, 1, 16 - 15 * si.height / si.width * 1.0 + 1, 30, 30 * si.height / si.width);
      } else { poly([[6, 24], [10, 10], [20, 6], [28, 16], [26, 26]], '#d6d02a'); }
      break;
    }
    case 'firescroll': {
      const si = window.VolcBoss && VolcBoss.scrollImg();
      if (si) { const sc = Math.min(30 / si.width, 30 / si.height); ctx.drawImage(si, 16 - si.width * sc / 2, 16 - si.height * sc / 2, si.width * sc, si.height * sc); }
      else poly([[8, 5], [24, 5], [24, 27], [8, 27]], '#e8c98a');
      break;
    }
    case 'earthscroll': { // Giấy Đất (assets/items/earth_scroll.webp)
      const ei = earthScrollImg();
      if (ei) { const sc = Math.min(30 / ei.width, 30 / ei.height); ctx.drawImage(ei, 16 - ei.width * sc / 2, 16 - ei.height * sc / 2, ei.width * sc, ei.height * sc); }
      else poly([[8, 5], [24, 5], [24, 27], [8, 27]], '#c98a3a');
      break;
    }
    case 'windscroll': { // Giấy Gió (assets/items/wind_scroll.webp)
      const wi = windScrollImg();
      if (wi) { const sc = Math.min(30 / wi.width, 30 / wi.height); ctx.drawImage(wi, 16 - wi.width * sc / 2, 16 - wi.height * sc / 2, wi.width * sc, wi.height * sc); }
      else poly([[8, 5], [24, 5], [24, 27], [8, 27]], '#bfe3ff');
      break;
    }
    case 'treeseed': { // Hạt Cây: túi hạt nhỏ + mầm xanh
      mkOval(16, 27, 11, 3.5, 'rgba(0,0,0,0.2)');
      poly([[9, 12], [23, 12], [27, 27], [5, 27]], '#c9a064');
      poly([[9, 12], [23, 12], [24.5, 16], [7.5, 16]], '#a9803f');
      mkLine(9, 11, 23, 11, '#6b4a1e', 2.4);
      mkLine(16, 11, 16, 4, '#4a8a2a', 2);
      mkOval(12.5, 5, 4, 2.4, '#5fd068'); mkOval(19.5, 4, 4, 2.4, '#3f9a3a');
      mkDot(16, 22, 4.2, '#3f9a3a');
      mkDot(14.8, 20.8, 1.3, 'rgba(255,255,255,0.6)');
      break;
    }
    case 'spaceclock': { // Đồng Hồ Không Gian (assets/items/space_clock.webp)
      const sci = spaceClockImg();
      if (sci) { const sc = Math.min(30 / sci.width, 30 / sci.height); ctx.drawImage(sci, 16 - sci.width * sc / 2, 16 - sci.height * sc / 2, sci.width * sc, sci.height * sc); }
      else { mkDot(16, 16, 13, '#4a2a8a'); mkDot(16, 16, 9.2, '#1a1040'); mkLine(16, 16, 16, 9, '#e8dcff', 1.8); mkLine(16, 16, 21, 19, '#8fd8ff', 1.8); }
      break;
    }
    case 'woodscroll': { // Giấy Mộc (assets/items/wood_scroll.webp)
      const woi = woodScrollImg();
      if (woi) { const sc = Math.min(30 / woi.width, 30 / woi.height); ctx.drawImage(woi, 16 - woi.width * sc / 2, 16 - woi.height * sc / 2, woi.width * sc, woi.height * sc); }
      else poly([[8, 5], [24, 5], [24, 27], [8, 27]], '#5fae3a');
      break;
    }
    case 'darkscroll': { // Giấy Hắc (assets/items/dark_scroll.webp)
      const di = darkScrollImg();
      if (di) { const sc = Math.min(30 / di.width, 30 / di.height); ctx.drawImage(di, 16 - di.width * sc / 2, 16 - di.height * sc / 2, di.width * sc, di.height * sc); }
      else poly([[8, 5], [24, 5], [24, 27], [8, 27]], '#7a2fd0');
      break;
    }
    case 'fan': { // Quạt (assets/items/wind_fan.webp)
      const fi = fanImg();
      if (fi) { const sc = Math.min(30 / fi.width, 30 / fi.height); ctx.drawImage(fi, 16 - fi.width * sc / 2, 16 - fi.height * sc / 2, fi.width * sc, fi.height * sc); }
      else poly([[16, 6], [28, 20], [4, 20]], '#f4d9c4');
      break;
    }
    case 'spiritjar': { // Lọ Linh Thú (assets/items/spirit_jar.webp)
      const ji = spiritJarImg();
      if (ji) { const sc = Math.min(30 / ji.width, 30 / ji.height); ctx.drawImage(ji, 16 - ji.width * sc / 2, 16 - ji.height * sc / 2, ji.width * sc, ji.height * sc); }
      else poly([[10, 8], [22, 8], [26, 20], [16, 29], [6, 20]], '#6a35b0');
      break;
    }
    case 'frostscroll': { // Giấy Băng: cuộn giấy pha lê (assets/items/ice_scroll.webp)
      const si = window.VolcBoss && VolcBoss.iceScrollImg();
      if (si) { const sc = Math.min(30 / si.width, 30 / si.height); ctx.drawImage(si, 16 - si.width * sc / 2, 16 - si.height * sc / 2, si.width * sc, si.height * sc); }
      else poly([[8, 5], [24, 5], [24, 27], [8, 27]], '#cfe6f5');
      break;
    }
    case 'dragonpotion': { // Thuốc Hồi Sinh Rồng (assets/items/dragon_potion.webp)
      const di = dragonPotionImg();
      if (di) { const sc = Math.min(30 / di.width, 30 / di.height); ctx.drawImage(di, 16 - di.width * sc / 2, 16 - di.height * sc / 2, di.width * sc, di.height * sc); }
      else { ctx.fillStyle = '#9a4bff'; ctx.beginPath(); ctx.arc(16, 19, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#b9772e'; ctx.fillRect(12, 3, 8, 6); }
      break;
    }
    case 'meteorshard': { // Mảnh Thiên Thạch: tinh thể tím (assets/items/meteor_shard.webp)
      const mi = meteorShardImg();
      if (mi) { const sc = Math.min(30 / mi.width, 30 / mi.height); ctx.drawImage(mi, 16 - mi.width * sc / 2, 16 - mi.height * sc / 2, mi.width * sc, mi.height * sc); }
      else { poly([[16, 2], [26, 14], [20, 29], [10, 29], [6, 14]], '#8a4bff'); poly([[16, 7], [21, 15], [16, 24], [11, 15]], '#d8b8ff'); }
      break;
    }
    case 'icecrystal': { // Tinh thể băng: bông tuyết pha lê (assets/items/ice_crystal.webp)
      const ci = iceCrystalImg();
      if (ci) { const sc = Math.min(30 / ci.width, 30 / ci.height); ctx.drawImage(ci, 16 - ci.width * sc / 2, 16 - ci.height * sc / 2, ci.width * sc, ci.height * sc); }
      else { poly([[16, 2], [25, 18], [22, 29], [10, 29], [7, 18]], '#6ac8ff'); poly([[16, 8], [20, 19], [12, 19]], '#e8f8ff'); }
      break;
    }
    case 'firelotus': {
      const li = window.FireMagic && FireMagic.lotusImg();
      if (li) ctx.drawImage(li, 0, 0, li.width, li.height, 1, 1, 30, 30); // ảnh vuông 62x62 (fire.js)
      else poly([[16, 3], [23, 13], [16, 28], [9, 13]], '#ff6a1a');
      break;
    }
    case 'magma': {
      const mi = window.Magma && Magma.img();
      if (mi) { // sprite pixel 11x19 (magma.js)
        const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(mi, 0, 0, 11, 19, 16 - 8.5, 1.5, 17, 29);
        ctx.imageSmoothingEnabled = sm;
      } else { poly([[16, 2], [25, 18], [22, 29], [10, 29], [7, 18]], '#ff7a1a'); poly([[16, 8], [20, 19], [12, 19]], '#ffd34d'); }
      break;
    }
    case 'watercan':
      if (WATERCAN_IMG) {
        const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(WATERCAN_IMG, 0, 0, 41, 27, 0, 6, 32, 21);
        ctx.imageSmoothingEnabled = sm;
      } else { ctx.fillStyle = '#3f6fd0'; ctx.fillRect(6, 10, 16, 14); ctx.fillRect(20, 12, 8, 3); }
      break;
    case 'stone': drawOreIcon('#7d7d85', '#a2a2ab'); break;
    case 'coal':  drawOreIcon('#3a3a42', '#55555e', '#16161a'); break;
    case 'ironore': drawOreIcon('#7d7d85', '#a2a2ab', '#d9996f'); break;
    case 'goldore': drawOreIcon('#7d7d85', '#a2a2ab', '#ffd34d'); break;
    case 'diamond':
      if (DIAMOND_IMG) { const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(DIAMOND_IMG, 1, 1, 30, 30); ctx.imageSmoothingEnabled = sm; }
      else { poly([[16, 3], [27, 11], [24, 26], [16, 30], [8, 26], [5, 11]], '#4fd8ff'); poly([[16, 3], [10, 10], [16, 16], [22, 10]], '#c8faff'); }
      break;
    case 'iron':  drawIngot('#e6e9ee', '#aab2bd', '#7b838e'); break;
    case 'gold':  drawIngot('#fff0a8', '#f2c14e', '#b8860b'); break;
    case 'furnace':
      ctx.fillStyle = '#5d5d66';
      ctx.fillRect(3, 4, 26, 25);
      ctx.fillStyle = '#85858f';
      ctx.fillRect(4, 5, 24, 23);
      ctx.fillStyle = '#6e6e78';
      ctx.fillRect(4, 12, 24, 2);
      ctx.fillRect(4, 21, 24, 2);
      ctx.fillStyle = '#1b1b1f';
      ctx.fillRect(9, 15, 14, 10);
      poly([[11, 25], [16, 17], [21, 25]], '#ff8a1f');
      break;
    case 'flesh':
      ctx.fillStyle = '#7a8f45';
      ctx.fillRect(7, 11, 18, 12);
      ctx.fillStyle = '#9db35c';
      ctx.fillRect(7, 11, 18, 4);
      ctx.fillStyle = '#e8e2c8';
      ctx.fillRect(22, 14, 6, 6);
      ctx.fillStyle = '#5a6a30';
      ctx.fillRect(11, 17, 4, 3);
      break;
    case 'sword':
      if (drawToolImg('sword', tier)) break;
      // cán + chắn tay + lưỡi chéo lên phải
      ctx.strokeStyle = '#7a4f26';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(5, 27); ctx.lineTo(12, 20); ctx.stroke();
      ctx.strokeStyle = '#4a2e15';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(9, 15); ctx.lineTo(17, 23); ctx.stroke();
      poly([[11.5, 17.5], [14.5, 20.5], [28.5, 6.5], [28, 3.5]], TIER_COLOR[tier]);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(13, 17.5); ctx.lineTo(26.5, 5); ctx.stroke();
      break;
    case 'torch':
      ctx.fillStyle = '#7a4f26';
      ctx.fillRect(14, 14, 5, 16);
      poly([[16.5, 2 + Math.sin(gameTime * 12)], [23, 12], [16.5, 17], [10, 12]], '#ff8a1f');
      poly([[16.5, 8], [20, 13], [16.5, 16], [13, 13]], '#ffe27a');
      break;
    case 'potion':
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(13, 2, 6, 3);
      ctx.fillStyle = '#cfd8e3';
      ctx.fillRect(13, 5, 6, 6);
      ctx.fillStyle = '#d9344b';
      ctx.beginPath(); ctx.arc(16, 20, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8fa0';
      ctx.fillRect(10, 16, 3, 5);
      break;
    case 'antidote':
      if (ANTIDOTE_IMG) { const ih = 30, iw = ih * ANTIDOTE_IMG.width / ANTIDOTE_IMG.height; ctx.drawImage(ANTIDOTE_IMG, (32 - iw) / 2, 1, iw, ih); }
      else { ctx.fillStyle = '#2f7fe0'; ctx.beginPath(); ctx.arc(16, 20, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8a5a2b'; ctx.fillRect(13, 3, 6, 5); }
      break;
    case 'boat':
      if (BT.icon) { const k = Math.min(30 / BT.icon.width, 24 / BT.icon.height), iw = BT.icon.width * k, ih = BT.icon.height * k; ctx.drawImage(BT.icon, (32 - iw) / 2, (32 - ih) / 2 + 1, iw, ih); }
      else { ctx.fillStyle = '#8a5a2b'; ctx.fillRect(4, 14, 24, 8); }
      break;
    case 'dragonfossil':
      if (FS.img) { const k = Math.min(30 / FS.img.width, 26 / FS.img.height), iw = FS.img.width * k, ih = FS.img.height * k; ctx.drawImage(FS.img, (32 - iw) / 2, (32 - ih) / 2 + 1, iw, ih); }
      else { ctx.fillStyle = '#e6d9b8'; ctx.fillRect(4, 10, 24, 14); }
      break;
    case 'darkrod':
      if (DR.icon) { const ih = 30, iw = ih * DR.icon.width / DR.icon.height; ctx.drawImage(DR.icon, (32 - iw) / 2, 1, iw, ih); }
      else { ctx.fillStyle = '#4a2a7a'; ctx.fillRect(10, 8, 12, 20); ctx.fillStyle = '#c58bff'; ctx.fillRect(14, 2, 4, 8); }
      break;
    case 'rod':
      ctx.fillStyle = '#55555e';
      ctx.fillRect(9, 27, 14, 4);
      ctx.fillStyle = '#8d8d98';
      ctx.fillRect(14, 12, 4, 16);
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(16, 12); ctx.lineTo(12, 8); ctx.lineTo(20, 5); ctx.lineTo(15, 1);
      ctx.stroke();
      break;
    case 'apple':
    case 'baked':
      ctx.fillStyle = id === 'apple' ? '#d9344b' : '#b8692e';
      ctx.beginPath(); ctx.arc(16, 19, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = id === 'apple' ? '#ff8fa0' : '#e8a050';
      ctx.fillRect(10, 14, 4, 5);
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(15, 4, 2, 7);
      poly([[17, 6], [24, 4], [21, 10]], '#3e8e3f');
      break;
    case 'axe':
      if (drawToolImg('axe', tier)) break;
      drawHandle(8, 29, 21, 8);
      poly([[17, 3], [29, 8], [25, 18], [20, 13]], TIER_COLOR[tier]);
      break;
    case 'pickaxe':
      if (drawToolImg('pickaxe', tier)) break;
      drawHandle(11, 29, 17, 6);
      ctx.strokeStyle = TIER_COLOR[tier];
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(5, 13); ctx.quadraticCurveTo(17, 0, 29, 13);
      ctx.stroke();
      break;
    case 'hoe':
      if (drawToolImg('hoe', tier)) break;
      drawHandle(7, 29, 22, 9);
      poly([[17, 4], [29, 3], [30, 9], [23, 11], [21, 15], [17, 11]], TIER_COLOR[tier]);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(19, 5.5); ctx.lineTo(28, 4.5); ctx.stroke();
      break;
    case 'stick':
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#7a4f26';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(7, 27); ctx.lineTo(25, 5); ctx.stroke();
      ctx.strokeStyle = '#a8712f';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, 26); ctx.lineTo(24, 6); ctx.stroke();
      break;
    case 'table':
      ctx.fillStyle = '#4a2e15';
      ctx.fillRect(6, 20, 4, 9);
      ctx.fillRect(22, 20, 4, 9);
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(5, 15, 22, 8);
      ctx.fillStyle = '#a8712f';
      ctx.fillRect(3, 6, 26, 11);
      ctx.fillStyle = '#d9ae6e';
      ctx.fillRect(3, 6, 26, 2);
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(11, 6, 1, 11);
      ctx.fillRect(20, 6, 1, 11);
      ctx.fillRect(3, 11, 26, 1);
      break;
    case 'armor':
    case 'chest':
      if (drawArmorImg('chest', tier)) break;
      poly([[9, 4], [23, 4], [29, 10], [24, 15], [24, 28], [8, 28], [8, 15], [3, 10]], TIER_COLOR[tier]);
      break;
    case 'head':
      if (drawArmorImg('head', tier)) break;
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.beginPath(); ctx.arc(16, 17, 11, Math.PI, 0); ctx.lineTo(27, 25); ctx.lineTo(21, 25); ctx.lineTo(21, 20); ctx.lineTo(11, 20); ctx.lineTo(11, 25); ctx.lineTo(5, 25); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(9, 9, 6, 3);
      break;
    case 'legs':
      if (drawArmorImg('legs', tier)) break;
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.fillRect(7, 5, 18, 7); ctx.fillRect(7, 12, 8, 17); ctx.fillRect(17, 12, 8, 17);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(7, 10, 18, 2);
      break;
    case 'feet':
      if (drawArmorImg('feet', tier)) break;
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.fillRect(4, 8, 9, 14); ctx.fillRect(4, 21, 13, 7);
      ctx.fillRect(19, 8, 9, 14); ctx.fillRect(15, 21, 13, 7);
      break;
    case 'bed':
      ctx.fillStyle = '#5a3a18'; ctx.fillRect(2, 9, 28, 20);
      ctx.fillStyle = '#e9e9ee'; ctx.fillRect(4, 11, 10, 16);
      ctx.fillStyle = '#fff'; ctx.fillRect(5, 13, 8, 6);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(14, 11, 14, 16);
      break;
    case 'wwall': case 'wblock': case 'sblock': case 'iblock': case 'dblock': case 'cblock': case 'iwall': case 'wdoor': case 'idoor': case 'roof': case 'wfloor': case 'carpet': case 'lamp': case 'fence': case 'pot': {
      const t = BUILD_BY_ITEM[id].tile;
      ctx.save(); ctx.translate(2, 2); ctx.scale(28 / TILE, 28 / TILE);
      drawBuildTile(t, 0, 0, null, null, 0);
      ctx.restore();
      break;
    }
    case 'chestbox':
      ctx.fillStyle = '#6b4423'; ctx.fillRect(3, 12, 26, 17);
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(5, 14, 22, 13);
      ctx.fillStyle = '#a8712f'; ctx.fillRect(3, 5, 26, 10);
      ctx.fillStyle = '#c28a46'; ctx.fillRect(3, 5, 26, 2);
      ctx.fillStyle = '#4a4a54'; ctx.fillRect(7, 5, 3, 24); ctx.fillRect(22, 5, 3, 24);
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(13, 13, 6, 7);
      ctx.strokeStyle = '#2b1a0a'; ctx.lineWidth = 1.5; ctx.strokeRect(3, 5, 26, 24);
      break;
    case 'phobowl': {
      mkOval(16, 24, 12, 4, '#2c6fb5'); mkOval(16, 20, 13, 9, '#f4f4f4'); mkOval(16, 16, 11, 5, '#c88a4a');
      mkLine(9, 16, 22, 14, '#f1e3b0', 1.5); mkLine(10, 18, 23, 17, '#f1e3b0', 1.5);
      mkDot(12, 15, 2, '#6cc24a'); mkDot(20, 17, 2, '#6cc24a'); mkDot(16, 14, 1.5, '#d62d20');
      mkLine(18, 4, 24, 15, '#d9c98a', 1.5); mkLine(21, 3, 26, 13, '#d9c98a', 1.5);
      break;
    }
    case 'banhchung':
      ctx.fillStyle = '#2f7a2f'; ctx.fillRect(5, 5, 22, 22); ctx.fillStyle = '#3f8f3a'; ctx.fillRect(5, 5, 22, 6);
      mkLine(16, 5, 16, 27, '#d9c98a', 2); mkLine(5, 16, 27, 16, '#d9c98a', 2);
      break;
    case 'banhmi':
      mkOval(16, 17, 14, 7, '#c98a3c'); mkOval(16, 15, 13, 5, '#e3b062');
      mkLine(8, 14, 11, 18, '#a8702a', 1.5); mkLine(14, 12, 17, 17, '#a8702a', 1.5); mkLine(20, 12, 23, 17, '#a8702a', 1.5);
      break;
    case 'veg':
      mkLine(16, 28, 16, 12, '#3f8f3a', 3); mkLine(16, 28, 9, 14, '#3f8f3a', 3); mkLine(16, 28, 23, 14, '#3f8f3a', 3);
      mkOval(16, 9, 5, 7, '#5cc24a'); mkOval(8, 11, 4, 6, '#4fae3f'); mkOval(24, 11, 4, 6, '#4fae3f');
      mkLine(10, 28, 22, 28, '#c9b274', 3);
      break;
    case 'orange': mkDot(16, 17, 11, '#f08a24'); mkDot(12, 13, 3, '#f8b45a'); mkOval(16, 6, 4, 2, '#3f8f3a'); break;
    case 'banana':
      ctx.strokeStyle = '#f2c200'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(16, 8, 15, 0.5, Math.PI - 0.5); ctx.stroke(); ctx.lineCap = 'butt';
      mkDot(6, 22, 2, '#6b4a1e'); mkDot(26, 22, 2, '#6b4a1e');
      break;
    case 'fish': case 'grilledfish': {
      const grill = id === 'grilledfish';
      mkOval(15, 17, 11, 6, grill ? '#b8692e' : '#cfd8dc');
      ctx.fillStyle = grill ? '#8a4b22' : '#9fb0b8'; ctx.beginPath(); ctx.moveTo(24, 17); ctx.lineTo(30, 10); ctx.lineTo(30, 24); ctx.closePath(); ctx.fill();
      mkDot(8, 15, 1.5, '#222');
      if (grill) { mkLine(10, 13, 10, 21, '#5a2f12', 1.5); mkLine(15, 12, 15, 22, '#5a2f12', 1.5); mkLine(20, 13, 20, 21, '#5a2f12', 1.5); }
      break;
    }
    case 'nonla': mkCone(16, 26, 14, 20); break;
    case 'wool':
      mkOval(16, 21, 12, 7, '#dcd5c6'); mkOval(9, 17, 7, 6, '#efe9dd'); mkOval(23, 17, 7, 6, '#efe9dd'); mkOval(16, 13, 8, 7, '#f8f4ec'); mkOval(11, 24, 6, 4, '#cfc7b5'); mkOval(22, 24, 6, 4, '#cfc7b5');
      mkOval(14, 11, 3, 2, '#ffffff'); mkOval(21, 15, 2.5, 2, '#ffffff');
      break;
    case 'cloth':
      ctx.fillStyle = '#8e44ad'; ctx.fillRect(7, 6, 18, 22); mkOval(16, 6, 9, 3.5, '#b574d0'); mkOval(16, 28, 9, 3.5, '#6c2f85');
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(10, 8, 3, 18);
      break;
    case 'string':
      ctx.lineCap = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = '#f2f2f6';
      ctx.beginPath(); ctx.moveTo(5, 24); ctx.bezierCurveTo(4, 5, 28, 27, 27, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7, 27); ctx.bezierCurveTo(14, 8, 18, 30, 25, 14); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#b9b9c6';
      ctx.beginPath(); ctx.moveTo(6, 26); ctx.bezierCurveTo(5, 12, 24, 24, 26, 10); ctx.stroke();
      break;
    case 'feather':
      ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#bcbcc4'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(7, 26); ctx.quadraticCurveTo(7, 8, 26, 5); ctx.quadraticCurveTo(25, 22, 7, 26); ctx.fill(); ctx.stroke();
      ctx.lineCap = 'round'; ctx.lineWidth = 1.6; ctx.strokeStyle = '#d8d2c0';
      ctx.beginPath(); ctx.moveTo(4, 30); ctx.lineTo(24, 8); ctx.stroke();
      break;
    case 'bow':
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#6b4220'; ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(10, 3); ctx.quadraticCurveTo(30, 16, 10, 29); ctx.stroke();
      ctx.strokeStyle = '#a8712f'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(11, 4.5); ctx.quadraticCurveTo(28, 16, 11, 27.5); ctx.stroke();
      ctx.strokeStyle = '#f2f2f6'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(10, 3); ctx.lineTo(10, 29); ctx.stroke();
      ctx.fillStyle = '#3a2412'; ctx.fillRect(21, 13, 3, 6);
      break;
    case 'arrow':
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(5, 27); ctx.lineTo(24, 8); ctx.stroke();
      poly([[22, 4], [29, 3], [28, 10]], '#b8bec8');
      poly([[3, 22], [8, 21], [10, 25], [7, 29], [3, 29]], '#fafafa');
      poly([[3, 25], [6, 24], [8, 27], [6, 29]], '#d9d9e0');
      break;
    case 'egg':
      mkOval(16, 28, 8, 2.4, 'rgba(0,0,0,0.18)'); mkOval(16, 18, 8.5, 10.5, '#f3ead7'); mkOval(13.6, 14, 2.6, 3.8, 'rgba(255,255,255,0.75)'); break;
    case 'milk':
      ctx.fillStyle = '#e6ecf5'; ctx.fillRect(10, 11, 12, 18); ctx.fillStyle = '#ffffff'; ctx.fillRect(11, 12, 4, 16);
      ctx.fillStyle = '#e6ecf5'; ctx.fillRect(13, 5, 6, 7); ctx.fillStyle = '#c0392b'; ctx.fillRect(12, 3, 8, 3);
      ctx.fillStyle = '#6fa8dc'; ctx.fillRect(10, 17, 12, 6); break;
    case 'bucket':
      ctx.strokeStyle = '#7b838e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(16, 11, 8, Math.PI, 0); ctx.stroke();
      poly([[7, 10], [25, 10], [22, 28], [10, 28]], '#aab2bd'); poly([[7, 10], [25, 10], [24.3, 14], [7.7, 14]], '#d6dde6');
      mkLine(10, 20, 22, 20, '#7b838e', 1.5);
      if (bucketLava) { mkOval(16, 10.5, 8.4, 2.8, '#e2541e'); mkOval(13.5, 9.8, 3.2, 1, '#ffd34d'); }
      if (bucketWater) { mkOval(16, 10.5, 8.4, 2.8, '#3d97ff'); mkOval(13.5, 9.8, 3.2, 1, '#bfe3ff'); }
      break;
    case 'flour': case 'riceflour':
      poly([[8, 28], [24, 28], [26, 12], [22, 8], [10, 8], [6, 12]], '#a98650');
      poly([[9, 27], [23, 27], [24.6, 13], [21, 9.6], [11, 9.6], [7.4, 13]], id === 'flour' ? '#f4efe2' : '#e6efd2');
      mkLine(10, 9, 22, 9, '#7a5a2e', 2.4); mkOval(16, 19, 3, 5, id === 'flour' ? '#e0b43a' : '#9aa05a'); break;
    case 'noodle':
      mkOval(16, 21, 12, 6.5, '#f1ead0'); ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) mkLine(6 + i, 15 + i * 3, 27 - i, 13 + i * 3.4, '#fff8e0', 1.8);
      mkLine(8, 13, 24, 23, '#ddd2a8', 1.2); ctx.lineCap = 'butt'; break;
    case 'friedegg':
      mkOval(16, 19, 12, 9, '#fdfdf6'); mkOval(14, 19, 4.8, 4.8, '#ffc61f'); mkDot(12.6, 17.6, 1.3, 'rgba(255,255,255,0.75)'); break;
    case 'cake':
      ctx.fillStyle = '#e8c88a'; ctx.fillRect(5, 17, 22, 11); ctx.fillStyle = '#fff4f4'; ctx.fillRect(5, 12, 22, 7);
      ctx.fillStyle = '#f6a6b8'; ctx.fillRect(5, 18, 22, 2); mkDot(11, 10, 3, '#d94a6a'); mkDot(21, 10, 3, '#d94a6a'); break;
    case 'mill':  ctx.save(); ctx.translate(2, 2); ctx.scale(28 / TILE, 28 / TILE); drawMillTile(0, 0, '0,0'); ctx.restore(); break;
    case 'oven':  ctx.save(); ctx.translate(2, 2); ctx.scale(28 / TILE, 28 / TILE); drawOvenTile(0, 0, '0,0'); ctx.restore(); break;
    case 'radio': ctx.drawImage(radioSpriteCanvas(), 2, 5, 28, 22); break;
    case 'pen':
      ctx.fillStyle = '#8a5a2b'; for (const x of [3, 14, 25]) ctx.fillRect(x, 7, 4, 21);
      ctx.fillStyle = '#a8712f'; ctx.fillRect(2, 11, 28, 3); ctx.fillRect(2, 19, 28, 3);
      ctx.fillStyle = '#c28a46'; ctx.fillRect(2, 11, 28, 1); ctx.fillRect(2, 19, 28, 1); break;
    case 'rawbeef':    drawSteakIcon('#c0393f', '#7d1f26', '#f2d6d6', null); break;
    case 'beef':       drawSteakIcon('#8a4a28', '#4a2412', '#b87a4a', '#3a1c0c'); break;
    case 'rawpork':    drawSteakIcon('#f2a3a8', '#b86a72', '#fde4e4', null); break;
    case 'pork':       drawSteakIcon('#d99a62', '#8a5a2b', '#f0c690', '#7a4a1e'); break;
    case 'rawchicken': drawDrumIcon('#f3c9a6', '#c8946a'); break;
    case 'chicken':    drawDrumIcon('#c9812f', '#7a4a14'); break;
    case 'cookedflesh':
      ctx.fillStyle = '#8a4b22'; ctx.fillRect(7, 11, 18, 12);
      ctx.fillStyle = '#b8692e'; ctx.fillRect(7, 11, 18, 4);
      ctx.fillStyle = '#e8e2c8'; ctx.fillRect(22, 14, 6, 6);
      ctx.fillStyle = '#4a2a12'; ctx.fillRect(11, 17, 4, 3);
      break;
    default:
  }
  ctx.restore();
}

// ---------- Vẽ: giao diện ----------
function hpColor(ratio) {
  return ratio > 0.5 ? '#4cd964' : ratio > 0.25 ? '#f5c542' : '#e74c3c';
}

function shadowText(text, x, y, color = '#fff') {
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Ảnh HUD (assets/hud): thanh máu / đói / mana kiểu pixel; nếu tải lỗi thì vẽ bằng màu phẳng như cũ
const HUD_IMG = {};
function loadHudSprites() {
  const names = ['bar_green', 'bar_yellow', 'bar_red', 'bar_orange', 'bar_blue', 'bar_empty', 'icon_heart', 'icon_apple', 'icon_mana', 'icon_shield', 'icon_shoe'];
  return Promise.all(names.map((n) => loadImage('assets/hud/' + n + '.webp').then((img) => { HUD_IMG[n] = img; })));
}
const HUD_ROW = 32, HUD_BW = 214, HUD_BH = 27, HUD_ICON = 30;

// Vẽ một thanh: nền rỗng, phần đầy cắt theo tỉ lệ, vệt trắng "trôi" (ghost) và chữ số liệu
function drawHudBar(bx, by, name, ratio, ghost, label) {
  ratio = Math.max(0, Math.min(1, ratio));
  const full = HUD_IMG[name], empty = HUD_IMG.bar_empty;
  if (full && empty) {
    ctx.drawImage(empty, bx, by, HUD_BW, HUD_BH);
    const px = (v) => HUD_BW * (0.025 + 0.95 * v); // phần ruột thanh nằm giữa ~2.5% và ~97.5% chiều rộng ảnh
    if (ghost > ratio) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(bx + px(ratio), by + HUD_BH * 0.2, px(ghost) - px(ratio), HUD_BH * 0.6); }
    if (ratio > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(bx, by, ratio >= 1 ? HUD_BW : px(ratio), HUD_BH); ctx.clip();
      ctx.drawImage(full, bx, by, HUD_BW, HUD_BH);
      ctx.restore();
    }
  } else { // dự phòng
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(bx, by, HUD_BW, HUD_BH);
    ctx.fillStyle = name === 'bar_blue' ? '#3a7bff' : name === 'bar_orange' ? '#e8932f' : name === 'bar_red' ? '#e74c3c' : name === 'bar_yellow' ? '#f5c542' : '#4cd964';
    ctx.fillRect(bx, by, HUD_BW * ratio, HUD_BH);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, HUD_BW, HUD_BH);
  }
  ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,10,30,0.95)'; ctx.strokeText(label, bx + HUD_BW / 2, by + HUD_BH / 2 + 5);
  ctx.fillStyle = '#fff'; ctx.fillText(label, bx + HUD_BW / 2, by + HUD_BH / 2 + 5);
  ctx.lineWidth = 1;
}

function drawHudIcon(name, cx, cy, fallback) {
  const im = HUD_IMG[name];
  if (!im) { fallback(); return; }
  const k = HUD_ICON / Math.max(im.width, im.height);
  ctx.drawImage(im, cx - im.width * k / 2, cy - im.height * k / 2, im.width * k, im.height * k);
}

function hudHeight() { return 8 + HUD_ROW * (elderQuest.unlocked ? 5 : 4) + 2; }

function drawHud(W, H) {
  const x = 10, y = 10, w = 262;
  const hasMana = elderQuest.unlocked; // chưa mở khoá mana thì chỉ hiện thanh máu và thanh đói
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x, y, w, hudHeight());

  const bx = x + 40, by = y + 6;
  // Thanh máu (xanh lá -> vàng -> đỏ theo lượng máu)
  const ratio = player.hp / MAX_HP;
  drawHudIcon('icon_heart', x + 20, by + HUD_BH / 2, () => { ctx.textAlign = 'left'; ctx.font = '18px sans-serif'; ctx.fillStyle = '#ff5a4d'; ctx.fillText('♥', x + 10, by + 19); });
  drawHudBar(bx, by, ratio > 0.5 ? 'bar_green' : ratio > 0.25 ? 'bar_yellow' : 'bar_red', ratio, player.hpGhost / MAX_HP, Math.ceil(player.hp) + ' / ' + MAX_HP);

  // Thanh đói (cam, chuyển đỏ khi gần cạn)
  const hy = by + HUD_ROW, hr = player.hunger / MAX_HUNGER;
  drawHudIcon('icon_apple', x + 20, hy + HUD_BH / 2, () => drawIcon('apple', x + 8, hy + 1, 24));
  drawHudBar(bx, hy, hr > 0.25 ? 'bar_orange' : 'bar_red', hr, 0, Math.ceil(player.hunger) + ' / ' + MAX_HUNGER);

  // Thanh mana (xanh dương): chỉ hiện sau khi hoàn thành nhiệm vụ Cây Cổ Thụ
  if (hasMana) {
    const my = hy + HUD_ROW;
    drawHudIcon('icon_mana', x + 20, my + HUD_BH / 2, () => { ctx.fillStyle = '#5aa8ff'; ctx.beginPath(); ctx.moveTo(x + 20, my + 2); ctx.lineTo(x + 29, my + 13); ctx.lineTo(x + 20, my + 24); ctx.lineTo(x + 11, my + 13); ctx.closePath(); ctx.fill(); });
    drawHudBar(bx, my, 'bar_blue', mana / MAX_MANA, 0, Math.floor(mana) + ' / ' + MAX_MANA);
  }

  // Thanh giáp (xanh dương): cạn là vỡ toàn bộ giáp đang mặc
  const ay = hy + HUD_ROW * (hasMana ? 2 : 1);
  drawHudIcon('icon_shield', x + 20, ay + HUD_BH / 2, () => { ctx.fillStyle = '#5aa8ff'; ctx.fillRect(x + 10, ay + 3, 20, 20); });
  drawHudBar(bx, ay, 'bar_blue', armorHp / MAX_ARMOR, 0, Math.ceil(armorHp) + ' / ' + MAX_ARMOR);

  // Thanh nước rút (cam; đỏ khi kiệt sức): giữ Shift để chạy
  const sy2 = ay + HUD_ROW;
  drawHudIcon('icon_shoe', x + 20, sy2 + HUD_BH / 2, () => { ctx.fillStyle = '#fff'; ctx.fillRect(x + 8, sy2 + 8, 22, 10); });
  drawHudBar(bx, sy2, staminaTired ? 'bar_red' : 'bar_orange', stamina / MAX_STAMINA, 0, Math.ceil(stamina) + ' / ' + MAX_STAMINA);

  // Nhiệm vụ Cây Cổ Thụ đang làm (hiện từ lúc gặp cây tới khi nhận mana)
  if (elderQuest.accepted && !elderQuest.unlocked) {
    const q = ELDER_QUESTS[elderQuest.step];
    const ty = y + hudHeight() + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, ty, w, 24);
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    shadowText('Cổ Thụ ' + (elderQuest.step + 1) + '/' + ELDER_QUESTS.length + ': ' + q.text + ' (' + elderProgress(q) + '/' + q.n + ')', x + 8, ty + 16, '#d9b8ff');
  }

  if (poison) { // huy hiệu nhiễm độc bên phải bảng máu
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    shadowText('☠ Nhiễm độc ' + poison.n + 's', x + w + 10, y + 18, '#7bd13a');
  }

  if (saveFlash > 0) {
    ctx.globalAlpha = Math.min(1, saveFlash);
    ctx.textAlign = 'right';
    ctx.font = '12px sans-serif';
    shadowText('Đã lưu', W - 12, 22, '#bfe8bf');
    ctx.globalAlpha = 1;
  }
  if (msg.time > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(msg.text, W / 2, 100);
  }
}

// ---------- Túi đồ kiểu Minecraft (nhấn B hoặc C) ----------
const SLOT = 40;
const HOTBAR = ['axe', 'axe2', 'pickaxe', 'pickaxe2', 'hoe', 'hoe2', 'watercan', 'sword', 'sword2', 'bow', 'arrow', 'bucket', 'table', 'furnace', 'mill', 'oven', 'radio', 'pen', 'chestbox', 'bed', ...BUILD.map((b) => b.item), 'torch', 'potion', 'antidote', 'rod', 'darkrod', 'dragonfossil', 'boat', 'beef', 'pork', 'chicken', 'baked', 'cookedflesh', 'apple', 'rawbeef', 'rawpork', 'rawchicken', 'flesh', 'phobowl', 'cake', 'banhchung', 'banhmi', 'friedegg', 'milk', 'egg', 'veg', 'orange', 'banana', 'fish', 'grilledfish', 'nonla', ...Object.keys(CROPS).map((k) => 'seed_' + k), ...Object.keys(CROPS).filter((k) => CROPS[k].food).map((k) => 'crop_' + k), 'crop_wheat', 'crop_rice', ...TOME_KEYS];

// Kho đồ kiểu Minecraft: 36 ô tự do (ô 0-8 là thanh nhanh, ô 9-35 là túi). Món nào nằm ô nào là do người chơi
// kéo thả, trống ô nào cũng được. Số lượng vẫn lấy từ inv / gearBag; dụng cụ chỉ chiếm 1 ô.
const SLOT_N = 36;
const slots = Array(SLOT_N).fill(null); // mỗi ô: id vật phẩm / dụng cụ / giáp cất trong túi, hoặc null
const slotPref = {};                    // món hết rồi có lại (vd. đặt lên lưới chế tạo) thì về ô cũ nếu còn trống
const MATERIALS = [...new Set(['wood', 'stick', 'stone', 'coal', 'iron', 'gold', 'string', 'feather', 'crop_wheat', ...RECIPES.flatMap((r) => Object.values(r.key))])]; // dùng được trong lưới chế tạo
const BAG_ITEMS = [...MATERIALS, 'ironore', 'goldore', 'cloth', 'emerald', 'magma', 'sulfur', 'firelotus', 'firescroll', 'icecrystal', 'frostscroll', 'spiritjar', 'earthscroll', 'fan', 'windscroll', 'darkscroll', 'woodscroll', 'spaceclock', 'treeseed', 'meteorshard', 'dragonpotion', 'diamond'];       // mặc định xếp vào túi
const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'];

function slotOwned(id) {
  if (id in tools) return tools[id] > 0;
  if (GEAR_IDS.includes(id)) return gearBag[id] > 0;
  return inv[id] > 0 || (id === 'torch' && torchTime > 0);
}

// Vật phẩm xếp chồng: mỗi ô chứa tối đa STACK_MAX, nhiều hơn thì tách sang ô kế. Dụng cụ / giáp chỉ chiếm 1 ô.
const STACK_MAX = BALANCE.craft.stackMax;
function slotNeed(id) {
  if (id in tools || GEAR_IDS.includes(id)) return 1;
  if (id.startsWith('tome_')) return Math.max(1, inv[id] | 0); // Sách Hệ không xếp chồng: mỗi cuốn 1 ô
  return Math.max(1, Math.ceil((inv[id] || 0) / STACK_MAX));
}
// Số lượng hiển thị ở ô i: ô đứng trước của cùng món lấy đủ STACK_MAX trước, ô sau lấy phần còn lại
function stackCount(i) {
  const id = slots[i];
  if (!id || id in tools || GEAR_IDS.includes(id) || id.startsWith('tome_')) return 0;
  let rank = 0;
  for (let j = 0; j < i; j++) if (slots[j] === id) rank++;
  return Math.max(0, Math.min(STACK_MAX, (inv[id] || 0) - rank * STACK_MAX));
}

// Dọn ô của món đã hết, rồi xếp món mới nhặt vào ô trống đầu tiên (đồ dùng nhanh vào thanh nhanh, nguyên liệu vào túi)
function syncSlots() {
  if (window.Dwarf) Dwarf.syncInv(); // Sách Hệ đã sở hữu luôn có trong túi
  const seen = new Map(); // id -> số ô đang giữ món đó
  for (let i = 0; i < SLOT_N; i++) {
    const id = slots[i];
    if (!id) continue;
    if (!slotOwned(id)) { slotPref[id] = i; slots[i] = null; continue; }
    const c = seen.get(id) || 0;
    if (c >= slotNeed(id)) { slots[i] = null; continue; } // dư ô (số lượng đã giảm)
    seen.set(id, c + 1);
  }
  const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);
  for (const id of [...HOTBAR, ...BAG_ITEMS, ...GEAR_IDS]) {
    if (!slotOwned(id)) continue;
    const need = slotNeed(id);
    let have = seen.get(id) || 0;
    while (have < need) {
      const order = HOTBAR.includes(id) ? range(0, SLOT_N) : [...range(9, SLOT_N), ...range(0, 9)];
      const pref = slotPref[id];
      const at = have === 0 && pref !== undefined && !slots[pref] ? pref : order.find((i) => !slots[i]);
      if (at === undefined) break; // hết ô
      slots[at] = id; have++;
    }
    seen.set(id, have);
  }
}

function slotList() {
  syncSlots();
  return slots;
}

function swapSlots(i, j) {
  [slots[i], slots[j]] = [slots[j], slots[i]];
}

let selRecipe = 0;    // công thức vừa chọn trong sách (để tô sáng)
let bookOpen = true;  // danh sách công thức bên trái
let bookScroll = 0;   // vị trí cuộn mong muốn của danh sách công thức (pixel)
let bookScrollV = 0;  // vị trí đang hiển thị (trượt mượt về bookScroll)
let bookDrag = null;  // đang kéo thanh cuộn: { off }
const BOOK_ROW = 32;  // chiều cao mỗi dòng công thức

function slotRect(x, y) {
  return { x, y, w: SLOT, h: SLOT };
}

// Số nguyên liệu đang có, tính cả phần đã đặt vào lưới (vì đặt vào lưới là trừ khỏi túi)
function haveMat(id) {
  let c = inv[id] || 0;
  for (const g of grid) if (g === id) c++;
  return c;
}

// Chỉ hiện công thức vừa với lưới hiện tại (2×2 khi chưa đứng gần bàn, 3×3 khi có bàn)
// VÀ người chơi đang có ít nhất 1 nguyên liệu của công thức đó.
let bookTab = -1; // mục đang chọn trong sách công thức: -1 = tất cả, còn lại = chỉ số trong CREATIVE_TABS (giống chế độ sáng tạo)
function recipeTab(r) {
  if (r._tab === undefined) {
    const g = r.give, id = g.tool || g.gear || g.item;
    const t = CREATIVE_TABS.findIndex((c) => c.ids.includes(id));
    r._tab = t >= 0 ? t : CREATIVE_TABS.length - 1;
  }
  return r._tab;
}
// Các mục đang có công thức hiện ra (mục rỗng thì ẩn, như chế độ sáng tạo)
function recipeTabList() {
  const all = allVisibleRecipes();
  if (!all.length) { bookTab = -1; return []; }
  const have = new Set(all.map((i) => recipeTab(RECIPES[i])));
  if (bookTab >= 0 && !have.has(bookTab)) bookTab = -1;
  return [{ i: -1, label: 'Tất cả' }, ...CREATIVE_TABS.map((t, i) => ({ i, label: t.name })).filter((t) => have.has(t.i))];
}
function visibleRecipes() {
  recipeTabList();
  const all = allVisibleRecipes();
  return bookTab < 0 ? all : all.filter((i) => recipeTab(RECIPES[i]) === bookTab);
}
function allVisibleRecipes() {
  const n = gridSize();
  const out = [];
  const near = { mill: nearStation('mill'), oven: nearStation('oven') };
  RECIPES.forEach((r, i) => {
    if (r.sh > n || r.sw > n) return;
    if (r.station && !near[r.station]) return; // công thức của máy xay / lò nướng chỉ hiện khi đứng gần
    if (Object.keys(r.cost).some((id) => haveMat(id) > 0)) out.push(i);
  });
  return out;
}

function invLayout() {
  const n = gridSize();
  const pad = 16;
  const w = pad * 2 + 9 * SLOT, h = 400;
  const x = Math.round((canvas.width - w) / 2);
  const y = Math.round((canvas.height - h) / 2 - 12);
  const top = y + 38;                       // hàng trên: giáp, nhân vật, chế tạo
  const gx = x + pad + 136;                 // cột chế tạo
  const mainY = y + 220;
  const bookX = Math.max(4, x - 240);
  const off = n === 3 ? 0 : SLOT / 2;       // lưới 2×2 nằm giữa vùng lưới 3×3
  const bookTabs = recipeTabList();
  const shown = visibleRecipes();
  const boxH = Math.min(h, canvas.height - 8);                      // cao bằng khung túi đồ, luôn nằm gọn trong màn hình
  const boxTop = Math.max(4, Math.min(y, canvas.height - boxH - 4));
  const tabsH = bookTabs.length ? Math.ceil(bookTabs.length / 4) * 24 + 4 : 0; // hàng nút phân loại công thức
  const listTop = boxTop + 34 + tabsH;
  const listH = boxH - 34 - tabsH - 8;
  const contentH = shown.length * BOOK_ROW;
  const maxScroll = Math.max(0, contentH - listH);
  bookScroll = Math.max(0, Math.min(bookScroll, maxScroll));
  bookScrollV = Math.max(0, Math.min(bookScrollV, maxScroll));
  const bookY = boxTop;
  const scrollable = maxScroll > 0;
  const trackH = listH, thumbH = scrollable ? Math.max(28, trackH * listH / contentH) : trackH;
  const thumbY = listTop + (scrollable ? (bookScrollV / maxScroll) * (trackH - thumbH) : 0);
  const Lo = {
    n, x, y, w, h, pad, top, mainY, craftX: gx,
    armor: ARMOR_SLOTS.map((slot, i) => ({ slot, id: wornGearIn(slot) || slot, ...slotRect(x + pad, top + i * SLOT) })), // id: món đang mặc ở ô đó (sắt hoặc vàng)
    preview: { x: x + pad + SLOT + 8, y: top, w: 84, h: 4 * SLOT },
    grid: Array.from({ length: 9 }, (_, i) => ({
      ...slotRect(gx + off + (i % 3) * SLOT, top + 20 + off + Math.floor(i / 3) * SLOT),
      i,
      active: i % 3 < n && Math.floor(i / 3) < n,
    })),
    arrow: { x: gx + 126, y: top + 68 },
    output: slotRect(gx + 156, top + 60),
    bookBtn: { x: gx + 136, y: top + 112, w: 32, h: 32 },
    main: Array.from({ length: 27 }, (_, i) => slotRect(x + pad + (i % 9) * SLOT, mainY + Math.floor(i / 9) * SLOT)),
    hotbar: Array.from({ length: 9 }, (_, i) => slotRect(x + pad + i * SLOT, mainY + 3 * SLOT + 8)),
    bookBox: { x: bookX, y: bookY, w: 232, h: boxH },
    bookTabs: bookTabs.map((t, k) => ({ ...t, x: bookX + 8 + (k % 4) * 54, y: bookY + 30 + Math.floor(k / 4) * 24, w: 52, h: 22 })),
    bookScrollable: scrollable,
    bookList: { x: bookX + 6, y: listTop, w: 220, h: listH },
    bookTrack: { x: bookX + 216, y: listTop, w: 10, h: trackH },
    bookThumb: { x: bookX + 216, y: thumbY, w: 10, h: thumbH },
    bookMax: maxScroll,
    bookRows: bookOpen ? shown.map((ri, k) => ({ x: bookX + 8, y: listTop + k * BOOK_ROW - bookScrollV, w: scrollable ? 204 : 216, h: BOOK_ROW - 2, ri, n: k }))
      .filter((r) => r.y + r.h > listTop && r.y < listTop + listH) : [],
  };
  Lo.all = [...Lo.hotbar, ...Lo.main]; // 36 ô kho theo đúng thứ tự của slots[]
  return Lo;
}

function clickInventory() {
  syncGrid(gridSize());
  ensureHeld();
  if (window.CREATIVE_ON && clickCreative()) return;
  const L = invLayout();
  const ids = slotList();
  // Nhấn giữ để kéo; nhả ở ô khác = đổi chỗ, nhả lại đúng ô cũ = dùng / chọn / mặc món đó
  const armSlot = L.armor.find((s) => inRect(mouse, s) && gear[s.id]);
  if (armSlot) { drag = { src: 'armor', id: armSlot.id }; return; }
  if (hatWorn() && inRect(mouse, L.armor[0])) { drag = { src: 'hat', id: 'nonla' }; return; }
  const si = L.all.findIndex((s) => inRect(mouse, s));
  if (si >= 0) { if (ids[si]) drag = { src: 'slot', i: si, id: ids[si] }; return; }
  if (inRect(mouse, L.output)) takeOutput(shiftHeld());
  if (inRect(mouse, L.bookBtn)) bookOpen = !bookOpen;
  L.grid.forEach((s) => { if (s.active && inRect(mouse, s)) clickGridCell(s.i); });
  if (bookOpen) { const tb = L.bookTabs.find((t) => inRect(mouse, t)); if (tb) { bookTab = tb.i; bookScroll = 0; bookScrollV = 0; return; } } // chọn mục công thức
  if (bookOpen && L.bookScrollable && inRect(mouse, L.bookTrack)) { // thanh cuộn: bấm / kéo
    const t = L.bookThumb;
    bookDrag = { off: inRect(mouse, t) ? mouse.y - t.y : t.h / 2 };
    bookDragMove();
    return;
  }
  if (inRect(mouse, L.bookList)) L.bookRows.forEach((r) => { if (inRect(mouse, r)) { fillRecipe(r.ri); if (shiftHeld() && autoRefill === r.ri) takeOutput(true); } }); // Shift + bấm công thức: chế hàng loạt luôn
}

function bookDragMove() {
  if (!bookDrag) return;
  const L = invLayout();
  const free = L.bookTrack.h - L.bookThumb.h;
  const f = free > 0 ? (mouse.y - bookDrag.off - L.bookTrack.y) / free : 0;
  bookScroll = Math.max(0, Math.min(1, f)) * L.bookMax;
  bookScrollV = bookScroll;
}

// Khung xám có viền nổi giống giao diện Minecraft
function mcPanel(b) {
  ctx.fillStyle = '#c6c6c6';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(b.x, b.y, b.w, 3);
  ctx.fillRect(b.x, b.y, 3, b.h);
  ctx.fillStyle = '#555';
  ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3);
  ctx.fillRect(b.x + b.w - 3, b.y, 3, b.h);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
}

// Ô lõm: viền tối ở trên/trái, viền sáng ở dưới/phải
function drawSlot(r, hover) {
  ctx.fillStyle = '#8b8b8b';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#373737';
  ctx.fillRect(r.x, r.y, r.w, 2);
  ctx.fillRect(r.x, r.y, 2, r.h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(r.x, r.y + r.h - 2, r.w, 2);
  ctx.fillRect(r.x + r.w - 2, r.y, 2, r.h);
  if (hover) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  }
}

function drawCount(r, n, color = '#fff') {
  ctx.textAlign = 'right';
  ctx.font = 'bold 13px sans-serif';
  shadowText(String(n), r.x + r.w - 3, r.y + r.h - 4, color);
}

// Thanh độ bền nhỏ dưới ô (chỉ hiện khi dụng cụ đã mòn)
function drawDurBar(r, ratio) {
  if (!(ratio < 1)) return;
  const w = r.w - 8, x = r.x + 4, y = r.y + r.h - 6;
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, w + 2, 5);
  ctx.fillStyle = hpColor(Math.max(0, ratio));
  ctx.fillRect(x, y, Math.max(1, w * Math.max(0, ratio)), 3);
}

// Vẽ món trong một ô kho: biểu tượng, số lượng, độ bền, giờ cháy đuốc
function drawSlotItem(r, id, lifted, torchY, cnt) { // cnt: số lượng của riêng ô này (chồng tối đa STACK_MAX)
  const isTool = id in tools, isGear = GEAR_IDS.includes(id);
  const dim = !isTool && !isGear && !(inv[id] > 0);
  ctx.globalAlpha = lifted ? 0.3 : dim ? 0.5 : 1;
  drawIcon(id, r.x + 4, r.y + 4, 32, isTool ? tools[id] : isGear ? 3 : 1);
  ctx.globalAlpha = 1;
  if (isTool) drawDurBar(r, toolDur[id] / TOOL_DUR[tools[id]]);
  else if (isGear) { if (gearBag[id] > 1) drawCount(r, gearBag[id]); }
  else if (inv[id] > 0 && !id.startsWith('tome_')) drawCount(r, cnt === undefined ? Math.min(STACK_MAX, inv[id]) : cnt);
  if (id === 'nonla' && hatWorn()) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px sans-serif';
    shadowText('Đội', r.x + 4, r.y + torchY, '#7dff7d');
  }
  if (id === 'torch' && torchTime > 0) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px sans-serif';
    shadowText(Math.ceil(torchTime) + 's', r.x + 4, r.y + torchY, '#7dff7d');
  }
}

// Hình mờ gợi ý cho ô giáp còn trống
function drawArmorGhost(r) {
  const cx = r.x + SLOT / 2, cy = r.y + SLOT / 2;
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#333';
  const sl = r.slot || r.id;
  if (sl === 'head') {
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
  } else if (sl === 'chest') {
    drawIcon('armor', r.x + 6, r.y + 6, 28, 0);
  } else if (sl === 'legs') {
    ctx.fillRect(cx - 9, cy - 11, 7, 22);
    ctx.fillRect(cx + 2, cy - 11, 7, 22);
  } else {
    ctx.fillRect(cx - 10, cy + 2, 8, 8);
    ctx.fillRect(cx + 2, cy + 2, 8, 8);
  }
  ctx.globalAlpha = 1;
}

// Khung đen có nhân vật đứng yên, đúng cấp trang phục hiện tại
function drawPreview(r) {
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const sheet = SPRITES[outfitLevel()];
  if (!spritesReady || !sheet) return;

  const S = 3;
  const frame = Math.floor(gameTime * ANIMS.idle.fps) % ANIMS.idle.frames;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  const ox = r.x + r.w / 2 - 32 * S, oy = r.y + r.h - 18 - 43 * S;
  const setT0 = uniformSetTier();
  if (!(setT0 && CHAR_IMG[setT0])) ctx.drawImage(sheet.idle, frame * FRAME, 0, FRAME, FRAME, ox, oy, FRAME * S, FRAME * S);
  // mặc đủ 4 món cùng loại -> hiện ảnh nhân vật mặc nguyên bộ giáp đó; mặc lẻ thì hiện nhân vật gốc (giáp xem ở các ô trang bị bên trái)
  const setT = uniformSetTier(), ch = setT && CHAR_IMG[setT];
  if (ch) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ch, Math.round(r.x + r.w / 2 - ch.width / 2), Math.round(r.y + r.h - 14 - ch.height));
    ctx.restore();
    return;
  }
  if (hatWorn()) { const pt = PLAYER_HEAD.idle[0][frame]; mkHat(ox + pt[0] * S, oy + pt[1] * S, S, 0); }
  ctx.restore();
}

function drawBookButton(r, hover) {
  ctx.fillStyle = hover ? '#43a047' : '#2e7d32';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#e8f5e9';
  ctx.fillRect(r.x + 7, r.y + 7, 18, 18);
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(r.x + 15, r.y + 7, 2, 18);
}

function itemTip(id) {
  if (GEAR_IDS.includes(id)) return [ARMOR_NAME[id], 'Giảm ' + Math.round(ARMOR_REDUCE[id] * 100) + '% sát thương'];
  if (id in tools) {
    const t = tools[id];
    const lines = [TOOL_LABEL[id] + ' ' + TIER_NAME[t], 'Độ bền: ' + toolDur[id] + ' / ' + TOOL_DUR[t], 'Sát thương: ' + (WEAPON_DMG[id][t] + (toolBase(id) === 'sword' && t >= 3 ? swordBonus : 0)) + (toolBase(id) === 'sword' && t >= 3 && swordBonus ? ' (thưởng boss +' + swordBonus + ')' : '')];
    if (id === 'hoe') lines.push('Cày cỏ thành ruộng (đôi khi bới ra hạt giống)', 'Chuột phải vào ruộng: nhổ cây / lấp đất');
    else if (id !== 'sword') lines.push('Chặt/đào: ' + TOOL_DMG[t] + ' mỗi nhát');
    return lines;
  }
  const it = ITEMS[id];
  if (id.startsWith('tome_')) return [it.name, it.desc, witchSt.unlocked[id.slice(5)] ? 'Hệ này đã mở khoá rồi' : 'Hệ này chưa mở khoá'];
  if (id === 'bucket') {
    const lines = [it.name, it.desc, bucketLava ? 'Đang đầy dung nham' : bucketWater ? 'Đang đầy nước' : 'Đang rỗng'];
    if (it.how) lines.push('Cách kiếm: ' + it.how);
    return lines;
  }
  if (id === 'watercan') {
    const lines = [it.name, it.desc, 'Còn ' + (canUses > 0 ? canUses : WATERCAN_USES) + ' / ' + WATERCAN_USES + ' lần tưới'];
    if (it.how) lines.push('Cách kiếm: ' + it.how);
    return lines;
  }
  const lines = USABLE.has(id) ? [it.name, it.desc, 'Bấm để dùng'] : [it.name, it.desc];
  if (it.how) lines.push('Cách kiếm: ' + it.how);
  return lines;
}

function drawTooltip(lines) {
  // Tự xuống dòng để mô tả dài và cách kiếm không tràn khỏi màn hình.
  const maxW = Math.max(160, Math.min(330, canvas.width - 24));
  const padX = 8, lineH = 18;
  const wrapped = [];
  lines.forEach((raw, index) => {
    ctx.font = index === 0 ? 'bold 13px sans-serif' : '12px sans-serif';
    const words = String(raw).split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxW - padX * 2) {
        wrapped.push({ text: line, first: index === 0 });
        line = word;
      } else line = test;
    }
    if (line) wrapped.push({ text: line, first: index === 0 });
  });
  let contentW = 0;
  wrapped.forEach((v) => {
    ctx.font = v.first ? 'bold 13px sans-serif' : '12px sans-serif';
    contentW = Math.max(contentW, ctx.measureText(v.text).width);
  });
  const w = Math.min(maxW, contentW + padX * 2);
  const h = wrapped.length * lineH + 10;
  const x = Math.max(4, Math.min(mouse.x + 14, canvas.width - w - 4));
  const y = Math.max(4, Math.min(mouse.y - 6, canvas.height - h - 4));
  ctx.fillStyle = 'rgba(16,0,16,0.95)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#2d0a5e';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'left';
  wrapped.forEach((v, i) => {
    ctx.font = v.first ? 'bold 13px sans-serif' : '12px sans-serif';
    ctx.fillStyle = v.first ? '#fff' : '#d0c7d8';
    ctx.fillText(v.text, x + padX, y + 19 + i * lineH);
  });
}

function drawRecipeBook(L) {
  const b = L.bookBox;
  mcPanel(b);
  // trượt mượt tới vị trí cuộn mong muốn
  bookScroll = Math.max(0, Math.min(bookScroll, L.bookMax));
  if (!bookDrag) bookScrollV += (bookScroll - bookScrollV) * 0.3;
  if (Math.abs(bookScroll - bookScrollV) < 0.5) bookScrollV = bookScroll;
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#404040';
  ctx.fillText('Công thức', b.x + 12, b.y + 22);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#6a6a6a';
  ctx.textAlign = 'right';
  ctx.fillText(L.bookScrollable ? 'lăn chuột để cuộn' : 'bấm để điền vào lưới', b.x + b.w - 10, b.y + 22);
  ctx.textAlign = 'left';
  L.bookTabs.forEach((t) => {
    const on = t.i === bookTab, hov = inRect(mouse, t);
    ctx.fillStyle = on ? '#ffd34d' : hov ? '#dcdcdc' : '#a9a9a9';
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.strokeStyle = on ? '#b8860b' : '#555'; ctx.lineWidth = 1; ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
    let fs = 10; ctx.font = 'bold ' + fs + 'px sans-serif';
    while (fs > 7 && ctx.measureText(t.label).width > t.w - 4) { fs--; ctx.font = 'bold ' + fs + 'px sans-serif'; }
    ctx.textAlign = 'center'; ctx.fillStyle = '#202020';
    ctx.fillText(t.label, t.x + t.w / 2, t.y + 15);
  });
  ctx.textAlign = 'left';
  if (!L.bookRows.length) {
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#6a6a6a';
    ctx.fillText('Nhặt nguyên liệu (gỗ, đá, than...)', b.x + 12, b.y + 54);
    ctx.fillText('để công thức hiện ra ở đây.', b.x + 12, b.y + 72);
  }

  // Vùng danh sách: cắt gọn, không tràn ra ngoài khung
  const lst = L.bookList;
  ctx.fillStyle = '#9a9a9a';                       // nền lõm của danh sách
  ctx.fillRect(lst.x, lst.y, lst.w, lst.h);
  ctx.fillStyle = '#373737'; ctx.fillRect(lst.x, lst.y, lst.w, 2); ctx.fillRect(lst.x, lst.y, 2, lst.h);
  ctx.fillStyle = '#fff'; ctx.fillRect(lst.x, lst.y + lst.h - 2, lst.w, 2); ctx.fillRect(lst.x + lst.w - 2, lst.y, 2, lst.h);
  ctx.save();
  ctx.beginPath(); ctx.rect(lst.x + 2, lst.y + 2, lst.w - 4, lst.h - 4); ctx.clip();
  const inList = inRect(mouse, lst);
  L.bookRows.forEach((row) => {
    const i = row.ri, r = RECIPES[i];
    const owned = isOwned(r), ok = !owned && canAfford(r);
    const g = r.give;
    drawSlot(row, inList && inRect(mouse, row));
    if (i === selRecipe) {
      ctx.fillStyle = 'rgba(255,211,77,0.55)';
      ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 2;
      ctx.strokeRect(row.x + 1, row.y + 1, row.w - 2, row.h - 2);
    }
    // vạch màu bên trái: xanh = đủ nguyên liệu, đỏ = thiếu
    ctx.fillStyle = owned ? '#777' : ok ? '#3fae3f' : '#c0504a';
    ctx.fillRect(row.x + 2, row.y + 2, 3, row.h - 4);
    ctx.globalAlpha = owned ? 0.5 : 1;
    drawIcon(g.item || g.tool || g.gear, row.x + 8, row.y + 2, 26, g.tier || 3);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#202020';
    ctx.fillText((row.n < 10 ? ((row.n + 1) % 10) + '. ' : '') + r.name + (owned ? ' ✓' : ''), row.x + 40, row.y + 12);
    if (r.sh > 2 || r.sw > 2) {
      ctx.textAlign = 'right';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#555';
      ctx.fillText('3×3', row.x + row.w - 5, row.y + 12);
      ctx.textAlign = 'left';
    }
    ctx.font = '11px sans-serif';
    ctx.fillStyle = owned ? '#555' : ok ? '#1d6b1d' : '#8a2020';
    ctx.fillText(Object.entries(r.cost).map(([k, v]) => v + ' ' + ITEMS[k].name.toLowerCase()).join(' + '), row.x + 40, row.y + 24);
  });
  // mờ dần ở mép trên / dưới khi còn nội dung bị che
  if (L.bookScrollable) {
    if (bookScrollV > 1) { const g = ctx.createLinearGradient(0, lst.y, 0, lst.y + 14); g.addColorStop(0, 'rgba(60,60,60,0.55)'); g.addColorStop(1, 'rgba(60,60,60,0)'); ctx.fillStyle = g; ctx.fillRect(lst.x, lst.y, lst.w, 14); }
    if (bookScrollV < L.bookMax - 1) { const g = ctx.createLinearGradient(0, lst.y + lst.h - 14, 0, lst.y + lst.h); g.addColorStop(0, 'rgba(60,60,60,0)'); g.addColorStop(1, 'rgba(60,60,60,0.55)'); ctx.fillStyle = g; ctx.fillRect(lst.x, lst.y + lst.h - 14, lst.w, 14); }
  }
  ctx.restore();

  // Thanh cuộn
  if (L.bookScrollable) {
    const tr = L.bookTrack, th = L.bookThumb;
    ctx.fillStyle = '#6e6e6e'; ctx.fillRect(tr.x, tr.y + 2, tr.w, tr.h - 4);
    const hot = bookDrag || inRect(mouse, th);
    ctx.fillStyle = hot ? '#ffffff' : '#d8d8d8'; ctx.fillRect(th.x, th.y + 2, th.w, th.h - 4);
    ctx.fillStyle = '#555'; ctx.fillRect(th.x, th.y + th.h - 4, th.w, 2);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(th.x + 0.5, th.y + 2.5, th.w - 1, th.h - 5);
  }
}

function drawInventory() {
  syncGrid(gridSize());
  ensureHeld();
  const L = invLayout();
  const hover = (r) => inRect(mouse, r);
  let tip = null;

  mcPanel(L);
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#404040';
  ctx.fillText(L.n === 3 ? 'Bàn chế tạo 3×3' : 'Chế tạo 2×2', L.craftX, L.top + 12);
  ctx.fillText('Túi đồ', L.x + L.pad, L.mainY - 6);
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#6a6a6a';
  ctx.fillText('Trỏ vào ô + G: vứt 1  ·  Ctrl+G: vứt cả chồng', L.x + L.pad + 60, L.mainY - 6);
  ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#404040';

  // Ô giáp (hiện chỉ có giáp ngực) và nhân vật
  L.armor.forEach((r) => {
    const hatHere = r.slot === 'head' && hatWorn();
    const worn = gear[r.id];
    drawSlot(r, hover(r));
    const lifted = drag && (drag.src === 'armor' ? drag.id === r.id : drag.src === 'hat' && hatHere);
    ctx.globalAlpha = lifted ? 0.3 : 1;
    if (worn) drawIcon(r.id, r.x + 4, r.y + 4, 32, 3);
    else if (hatHere) drawIcon('nonla', r.x + 4, r.y + 4, 32);
    else drawArmorGhost(r);
    ctx.globalAlpha = 1;
    if (drag && drag.src === 'slot' && (GEAR_BASE[drag.id] === r.slot || (drag.id === 'nonla' && r.slot === 'head')) && hover(r)) {
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3;
      ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
    }
    if (hatHere && hover(r) && !drag) tip = ['Nón lá', 'Chỉ để làm đẹp, không giảm sát thương', 'Bấm hoặc kéo vào túi để bỏ xuống'];
    if (worn && hover(r) && !drag) tip = [ARMOR_NAME[r.id], 'Giảm ' + Math.round(ARMOR_REDUCE[r.id] * 100) + '% sát thương', 'Tổng giáp: giảm ' + Math.round(armorReduction() * 100) + '%', 'Bấm hoặc kéo vào túi để cất'];
  });
  drawPreview(L.preview);

  // Lưới chế tạo: bấm ô trống để đặt nguyên liệu đang chọn, bấm ô có đồ để lấy lại
  L.grid.forEach((s) => {
    if (!s.active) return;
    drawSlot(s, hover(s));
    const id = grid[s.i];
    if (!id) return;
    drawIcon(id, s.x + 4, s.y + 4, 32);
    if (hover(s)) tip = [ITEMS[id].name, 'Bấm để lấy lại'];
  });

  const a = L.arrow;
  poly([[a.x, a.y + 8], [a.x + 14, a.y + 8], [a.x + 14, a.y], [a.x + 28, a.y + 12], [a.x + 14, a.y + 24], [a.x + 14, a.y + 16], [a.x, a.y + 16]], '#8b8b8b');

  // Ô kết quả: hiện món khớp với hình đang xếp trên lưới
  const rc = findRecipe();
  drawSlot(L.output, hover(L.output));
  if (rc) {
    const g = rc.give, owned = isOwned(rc);
    ctx.globalAlpha = owned ? 0.4 : 1;
    drawIcon(g.item || g.tool || g.gear, L.output.x + 4, L.output.y + 4, 32, g.tier || 3);
    ctx.globalAlpha = 1;
    if (g.n > 1) drawCount(L.output, g.n);
    if (hover(L.output)) tip = [rc.name, rc.desc, owned ? 'Đã có đồ này hoặc tốt hơn' : rc.give.tool ? 'Bấm để lấy (Enter)' : 'Bấm để lấy (Enter)  ·  Giữ Shift: chế hàng loạt'];
  }

  drawBookButton(L.bookBtn, hover(L.bookBtn));
  if (hover(L.bookBtn)) tip = ['Sách công thức', bookOpen ? 'Bấm để ẩn' : 'Bấm để hiện'];

  // Kho 36 ô: 27 ô túi ở trên, thanh nhanh 9 ô ở dưới. Kéo món sang ô nào cũng được; bấm nguyên liệu để chọn rồi bấm vào lưới
  const ids = slotList();
  const dragFrom = drag && drag.src === 'slot' ? drag.i : -1;
  L.all.forEach((s, i) => {
    drawSlot(s, hover(s));
    const id = ids[i];
    if (!id) return;
    drawSlotItem(s, id, i === dragFrom, 13, stackCount(i));
    if (id === held && MATERIALS.includes(id)) {
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 3;
      ctx.strokeRect(s.x + 1.5, s.y + 1.5, s.w - 3, s.h - 3);
    }
    if (hover(s)) tip = slotTip(id);
  });

  if (bookOpen) drawRecipeBook(L);
  if (window.CREATIVE_ON) { const ct = drawCreativePanel(L); if (ct) tip = ct; } // chế độ sáng tạo: bảng chọn đồ chia theo mục

  ctx.textAlign = 'center';
  ctx.font = '12px sans-serif';

  if (drag) drawDragGhost();
  else if (tip) drawTooltip(tip);
}

// ---------- Chế độ sáng tạo: bảng chọn đồ chia theo mục (bật bằng /creative trong cheat.js) ----------
// Không nhồi mọi thứ vào túi nữa: mở túi đồ (B / C), chọn mục rồi bấm vào món cần lấy.
// Chuột trái: lấy 1 chồng (70) · chuột phải: lấy 1 · dụng cụ / giáp / Sách Hệ: lấy 1 món (sách không xếp chồng, mỗi cuốn chiếm 1 ô)
const CREATIVE_COLS = 8, CREATIVE_ROWS = 7;
const CREATIVE_TABS = [
  { name: 'Dụng cụ',    ids: ['axe', 'pickaxe', 'hoe', 'sword', 'bow', 'arrow', 'watercan', 'bucket'] },
  { name: 'Giáp',       ids: [...GEAR_IDS, 'nonla'] },
  { name: 'Xây dựng',   ids: ['table', 'furnace', 'chestbox', 'bed', 'wwall', 'wblock', 'sblock', 'iblock', 'dblock', 'cblock', 'iwall', 'wdoor', 'idoor', 'roof', 'wfloor', 'carpet', 'lamp', 'fence', 'pot', 'dragonfossil', 'boat', 'rod', 'darkrod', 'mill', 'oven', 'radio', 'pen', 'torch'] },
  { name: 'Nguyên liệu', ids: ['emerald', 'magma', 'sulfur', 'firelotus', 'firescroll', 'icecrystal', 'frostscroll', 'spiritjar', 'earthscroll', 'fan', 'windscroll', 'darkscroll', 'woodscroll', 'spaceclock', 'treeseed', 'meteorshard', 'dragonpotion', 'wood', 'stone', 'coal', 'ironore', 'goldore', 'iron', 'gold', 'diamond', 'stick', 'string', 'feather', 'wool', 'cloth', 'flour', 'riceflour', 'noodle'] },
  { name: 'Thức ăn',    ids: ['apple', 'orange', 'banana', 'veg', 'fish', 'grilledfish', 'rawbeef', 'beef', 'rawpork', 'pork', 'rawchicken', 'chicken', 'flesh', 'cookedflesh', 'baked', 'phobowl', 'banhchung', 'banhmi', 'cake', 'egg', 'friedegg', 'milk', 'potion', 'antidote'] },
  { name: 'Nông nghiệp', ids: Object.keys(CROPS).map((k) => 'seed_' + k).concat(Object.keys(CROPS).map((k) => 'crop_' + k)) },
  { name: 'Khác',       ids: [] }, // mọi món còn lại trong kho (tự gom, không sót món nào)
];
let creativeTab = 0, creativeScroll = 0, creativeEntriesCache = null;

function creativeEntries() {
  if (creativeEntriesCache) return creativeEntriesCache;
  const used = new Set();
  const lists = CREATIVE_TABS.map((t) => {
    const out = [];
    for (const id of t.ids) {
      if (id in tools) { for (let tier = 1; tier <= MAX_TIER; tier++) out.push({ id, tier }); used.add(id); }
      else if (GEAR_IDS.includes(id)) { out.push({ id, tier: 3, gear: true }); used.add(id); }
      else if (id in inv) { out.push({ id }); used.add(id); }
    }
    return out;
  });
  lists[lists.length - 1] = Object.keys(inv).filter((id) => !used.has(id)).map((id) => ({ id }));
  creativeEntriesCache = lists;
  return lists;
}

function creativeLayout(L) {
  const pad = 12, w = pad * 2 + CREATIVE_COLS * SLOT + 10, h = L.h;
  let x = L.x + L.w + 8;
  if (x + w > canvas.width - 4) x = Math.max(4, canvas.width - w - 4);
  const y = L.y, perRow = 4, tw = Math.floor((w - pad * 2 - (perRow - 1) * 4) / perRow);
  const gy = y + 94;
  const list = creativeEntries()[creativeTab] || [];
  const maxScroll = Math.max(0, Math.ceil(list.length / CREATIVE_COLS) - CREATIVE_ROWS);
  creativeScroll = Math.max(0, Math.min(creativeScroll, maxScroll));
  const cells = [];
  for (let i = 0; i < CREATIVE_COLS * CREATIVE_ROWS; i++) {
    const e = list[creativeScroll * CREATIVE_COLS + i];
    if (!e) break;
    cells.push({ e, ...slotRect(x + pad + (i % CREATIVE_COLS) * SLOT, gy + Math.floor(i / CREATIVE_COLS) * SLOT) });
  }
  return {
    x, y, w, h, pad, maxScroll, gy, count: list.length,
    tabs: CREATIVE_TABS.map((t, i) => ({ i, label: t.name })).filter((t) => creativeEntries()[t.i].length) // mục rỗng thì ẩn
      .map((t, k) => ({ ...t, x: x + pad + (k % perRow) * (tw + 4), y: y + 34 + Math.floor(k / perRow) * 28, w: tw, h: 24 })),
    cells,
    grid: { x: x + pad, y: gy, w: CREATIVE_COLS * SLOT + 10, h: CREATIVE_ROWS * SLOT },
  };
}

function creativeScrollBy(d) { creativeScroll = Math.max(0, creativeScroll + d); }

function creativeGive(e, one) {
  if (e.gear) { giveGear(e.id); noticeItem('Đã lấy ' + ARMOR_NAME[e.id].toLowerCase()); }
  else if (e.id in tools) { setTool(toolKeyFor(e.id), e.tier); noticeItem('Đã lấy ' + TOOL_LABEL[e.id].toLowerCase() + ' ' + TIER_NAME[e.tier]); }
  else {
    const n = one || e.id.startsWith('tome_') ? 1 : STACK_MAX; // Sách Hệ luôn lấy 1 cuốn
    inv[e.id] = Math.min(9999, (inv[e.id] || 0) + n);
    if (e.id === 'watercan') canUses = WATERCAN_USES;
    noticeItem('Đã lấy ' + n + ' ' + (ITEMS[e.id] ? ITEMS[e.id].name.toLowerCase() : e.id));
  }
}

// Cất món đang kéo về bảng sáng tạo: mặc định cả chồng ở ô đó, giữ Shift = 1 cái (giống lúc vứt)
function creativeTake(d) {
  const all = !shiftHeld(), id = d.id;
  if (d.src === 'armor') gear[id] = false;
  else if (GEAR_IDS.includes(id)) gearBag[id] = Math.max(0, (gearBag[id] || 0) - (all ? gearBag[id] : 1));
  else if (id in tools) setTool(id, 0);
  else inv[id] = Math.max(0, (inv[id] || 0) - (all ? Math.min(inv[id] || 0, stackCount(d.i) || STACK_MAX) : 1));
  noticeItem('Đã cất ' + (GEAR_IDS.includes(id) ? ARMOR_NAME[id].toLowerCase() : id in tools ? TOOL_LABEL[id].toLowerCase() : (ITEMS[id] ? ITEMS[id].name.toLowerCase() : id)));
  burst(player.x, player.y - 20, '#7dd3fc', 6, 90);
}

function creativeName(e) {
  if (e.gear) return ARMOR_NAME[e.id];
  if (e.id in tools) return TOOL_LABEL[e.id] + ' ' + TIER_NAME[e.tier];
  return ITEMS[e.id] ? ITEMS[e.id].name : e.id;
}

function clickCreative() {
  const C = creativeLayout(invLayout());
  for (const t of C.tabs) if (inRect(mouse, t)) { if (creativeTab !== t.i) { creativeTab = t.i; creativeScroll = 0; } return true; }
  for (const c of C.cells) if (inRect(mouse, c)) { creativeGive(c.e, mouse.button === 2); burst(player.x, player.y - 20, '#7dd3fc', 6, 90); return true; }
  return inRect(mouse, C) && !inRect(mouse, invLayout()); // bấm vào khoảng trống của bảng thì không xuyên xuống túi đồ
}

function drawCreativePanel(L) {
  const C = creativeLayout(L);
  mcPanel(C);
  ctx.textAlign = 'left'; ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#404040';
  ctx.fillText('Chế độ sáng tạo', C.x + C.pad, C.y + 24);
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#6a6a6a';
  ctx.fillText('Trái: lấy ' + STACK_MAX + '  ·  Phải: lấy 1', C.x + C.pad + 128, C.y + 24);
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#6a6a6a'; ctx.textAlign = 'center';
  for (const t of C.tabs) {
    const on = t.i === creativeTab;
    ctx.fillStyle = on ? '#5b8a3c' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.strokeStyle = on ? '#222' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = on ? '#fff' : (inRect(mouse, t) ? '#000' : '#404040');
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t.label, t.x + t.w / 2, t.y + 16);
  }
  let tip = null;
  for (const c of C.cells) {
    const e = c.e, hov = inRect(mouse, c);
    drawSlot(c, hov);
    drawIcon(e.id, c.x + 4, c.y + 4, 32, e.tier || 1);
    if (!e.gear && !(e.id in tools) && inv[e.id] > 0) drawCount(c, inv[e.id]);
    if (hov) tip = [creativeName(e), ...(!e.gear && !(e.id in tools) && ITEMS[e.id] ? [ITEMS[e.id].desc] : []), 'Bấm để lấy' + (e.gear || e.id in tools ? '' : e.id.startsWith('tome_') ? ' (1 cuốn)' : ' (trái: ' + STACK_MAX + ', phải: 1)')];
  }
  if (!C.count) { ctx.fillStyle = '#505050'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('(Mục này chưa có món nào)', C.x + C.w / 2, C.gy + 40); }
  if (C.maxScroll > 0) { // thanh cuộn
    const g = C.grid, th = Math.max(24, g.h * CREATIVE_ROWS / (CREATIVE_ROWS + C.maxScroll));
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(g.x + g.w - 8, g.y, 6, g.h);
    ctx.fillStyle = '#555'; ctx.fillRect(g.x + g.w - 8, g.y + (g.h - th) * creativeScroll / C.maxScroll, 6, th);
  }
  ctx.fillStyle = '#505050'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(C.count + ' món', C.x + C.w / 2, C.y + C.h - 10);
  return tip;
}

// Gợi ý khi trỏ vào một ô kho
function slotTip(id) {
  const t = itemTip(id);
  if (GEAR_IDS.includes(id)) return [...t, 'Bấm hoặc kéo vào ô giáp để mặc'];
  if (id === 'nonla') return [...t, 'Kéo vào ô đầu (ô giáp trên cùng) để đội'];
  if (MATERIALS.includes(id)) return [...t, id === held ? 'Đang chọn' : 'Bấm để chọn'];
  return t;
}

// ---------- Giao diện lò nung (nhấn E gần lò) ----------
const FURNACE_SUPPLY = [...FURNACE_INPUTS, ...FURNACE_FUELS]; // hàng nguyên liệu ở dưới

function furnaceLayout() {
  const pad = 16, w = Math.max(pad * 2 + 9 * SLOT, pad * 2 + FURNACE_SUPPLY.length * (SLOT + 6)), h = 252;
  const x = Math.round((canvas.width - w) / 2);
  const y = Math.round((canvas.height - h) / 2 - 40);
  const ix = x + pad + 40, top = y + 44;
  return {
    x, y, w, h, pad,
    input: slotRect(ix, top),
    fuel: slotRect(ix, top + SLOT * 2 + 4),
    flame: { x: ix + 6, y: top + SLOT + 4 },
    arrow: { x: ix + SLOT + 44, y: top + SLOT + 4 - 2 },
    output: slotRect(ix + SLOT + 44 + 52, top + SLOT - 14 + 4),
    supply: FURNACE_SUPPLY.map((id, i) => ({ id, ...slotRect(x + pad + i * (SLOT + 6), y + 188) })),
  };
}

function clickFurnace() {
  const L = furnaceLayout();
  if (inRect(mouse, L.input)) furnaceTake('in');
  else if (inRect(mouse, L.fuel)) furnaceTake('fuel');
  else if (inRect(mouse, L.output)) furnaceTake('out');
  L.supply.forEach((s) => { if (inRect(mouse, s)) furnaceAdd(s.id); });
}

function drawFurnaceUi() {
  const L = furnaceLayout();
  const f = furnaceAt(furnaceKey);
  const hover = (r) => inRect(mouse, r);
  let tip = null;

  mcPanel(L);
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#404040';
  ctx.fillText('Lò nung', L.x + L.pad, L.y + 24);
  ctx.fillText('Túi đồ', L.x + L.pad, L.y + 180);

  // Ô quặng, nhiên liệu, thành phẩm
  const slotItem = (r, id, n, label) => {
    drawSlot(r, hover(r));
    if (!id || n <= 0) return;
    drawIcon(id, r.x + 4, r.y + 4, 32);
    drawCount(r, n);
    if (hover(r)) tip = [ITEMS[id].name, label];
  };
  slotItem(L.input, f.inId, f.inN, 'Bấm để lấy ra');
  slotItem(L.fuel, f.fuelId, f.fuelN, 'Bấm để lấy ra');
  slotItem(L.output, f.outId, f.outN, 'Bấm để lấy');
  ctx.textAlign = 'left';
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#505050';
  ctx.fillText('Nguyên liệu nung', L.input.x + SLOT + 6, L.input.y + 24);
  ctx.fillText('Nhiên liệu', L.fuel.x + SLOT + 6, L.fuel.y + 24);

  // Ngọn lửa: đầy theo thời gian cháy còn lại
  const fl = L.flame, burnRatio = f.burn > 0 ? f.burn / f.burnMax : 0;
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(fl.x, fl.y, 28, 28);
  if (burnRatio > 0) {
    const hgt = 28 * burnRatio;
    ctx.fillStyle = '#ff8a1f';
    ctx.fillRect(fl.x, fl.y + 28 - hgt, 28, hgt);
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(fl.x + 7, fl.y + 28 - hgt * 0.6, 14, hgt * 0.6);
  }
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(fl.x, fl.y, 28, 28);

  // Mũi tên tiến độ nung
  const a = L.arrow;
  const shape = [[a.x, a.y + 8], [a.x + 24, a.y + 8], [a.x + 24, a.y], [a.x + 42, a.y + 14], [a.x + 24, a.y + 28], [a.x + 24, a.y + 20], [a.x, a.y + 20]];
  poly(shape, '#8b8b8b');
  ctx.save();
  ctx.beginPath();
  ctx.rect(a.x, a.y, 42 * (f.prog / SMELT_TIME), 30);
  ctx.clip();
  poly(shape, '#43a047');
  ctx.restore();

  // Hàng nguyên liệu trong túi: bấm để cho vào lò
  L.supply.forEach((s) => {
    drawSlot(s, hover(s));
    const n = inv[s.id];
    ctx.globalAlpha = n > 0 ? 1 : 0.3;
    drawIcon(s.id, s.x + 4, s.y + 4, 32);
    ctx.globalAlpha = 1;
    if (n > 0) drawCount(s, n);
    if (hover(s)) {
      const isOre = FURNACE_INPUTS.includes(s.id);
      tip = [ITEMS[s.id].name, isOre ? 'Nung ra: ' + ITEMS[SMELT[s.id]].name.toLowerCase() : 'Nhiên liệu: cháy ' + FUEL[s.id] + ' giây', 'Bấm: cho 1  ·  Shift: cho hết'];
    }
  });

  ctx.textAlign = 'center';
  ctx.font = '12px sans-serif';

  if (tip) drawTooltip(tip);
}

// ---------- Thanh 9 ô ở dưới màn hình (phím 1-9 hoặc bấm chuột) ----------
let hotbarSel = 0;                       // ô vừa chọn
let drag = null;                         // đang kéo một ô: { from, id }
let hotbarLabel = { text: '', time: 0 }; // tên món hiện phía trên thanh

function hotbarRects(W, H) {
  const x = Math.round((W - 9 * SLOT) / 2), y = H - SLOT - 16;
  return Array.from({ length: 9 }, (_, i) => slotRect(x + i * SLOT, y));
}

function useHotbarSlot(i) {
  hotbarSel = i;
  const id = slotList()[i];
  if (!id) { hotbarLabel.time = 0; return; }
  hotbarLabel = { text: itemTip(id)[0], time: 1.6 };
  useItem(id);
}

function hotbarBounds(rs) {
  return { x: rs[0].x - 6, y: rs[0].y - 6, w: rs[8].x + SLOT - rs[0].x + 12, h: SLOT + 12 };
}

// Nhấn giữ vào ô có đồ để kéo; nhả ở ô khác (kể cả ô trống) thì đổi chỗ, nhả lại đúng ô cũ thì dùng món đó
function clickHotbar() {
  const rs = hotbarRects(canvas.width, canvas.height);
  if (!inRect(mouse, hotbarBounds(rs))) return false;
  const i = rs.findIndex((r) => inRect(mouse, r));
  const id = i >= 0 ? slotList()[i] : null;
  if (id) drag = { src: 'slot', i, id };
  else if (i >= 0) hotbarSel = i;
  return true; // bấm lên thanh thì không chém
}

function equipFromBag(id) {
  if (gear[id]) { say('Bạn đang mặc ' + ARMOR_NAME[id].toLowerCase() + ' rồi'); return; }
  if (!(gearBag[id] > 0)) return;
  const cur = wornGearIn(GEAR_BASE[id]);
  if (cur) { gear[cur] = false; gearBag[cur]++; } // cùng ô: món đang mặc về túi
  if (GEAR_BASE[id] === 'head' && hatOn) hatOn = false;   // một ô đầu: mũ thay chỗ nón lá
  gearBag[id]--;
  gear[id] = true;
  say('Đã mặc ' + ARMOR_NAME[id].toLowerCase());
}
// Cất giáp đang mặc vào túi; at: ô kho muốn đặt vào (nếu còn trống)
function unequipToBag(id, at) {
  if (!gear[id]) return;
  syncSlots();
  const had = slots.includes(id);
  gear[id] = false;
  gearBag[id]++;
  syncSlots();
  if (!had && at !== undefined && at >= 0 && !slots[at]) { slots[slots.indexOf(id)] = null; slots[at] = id; }
  say('Đã cất ' + ARMOR_NAME[id].toLowerCase() + ' vào túi');
}

// Bấm vào một ô kho: thanh nhanh thì dùng món đó, ô túi thì chọn nguyên liệu / mặc giáp / dùng vật phẩm
function activateSlot(i) {
  const id = slots[i];
  if (!id) return;
  if (i < 9) useHotbarSlot(i); else useItem(id);
}

// Thả chuột sau khi kéo: đổi chỗ ô, mặc / cất giáp, bỏ vào rương, hoặc bỏ vào lưới chế tạo
function endDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (ui === 'inv') endInvDrag(d);
  else if (ui === 'store') endStoreDrag(d);
  else if (!ui && d.src === 'slot') {
    const to = hotbarRects(canvas.width, canvas.height).findIndex((r) => inRect(mouse, r));
    if (to < 0) return;                                   // thả ra ngoài thanh: huỷ
    if (to === d.i) { activateSlot(d.i); return; }
    swapSlots(d.i, to);
    hotbarSel = to;
  }
}

function endInvDrag(d) {
  const L = invLayout();
  const toSlot = L.all.findIndex((s) => inRect(mouse, s));
  const toArmor = L.armor.find((s) => inRect(mouse, s));
  // Chế độ sáng tạo: thả món vào bảng chọn đồ = cất lại (xoá khỏi túi)
  if (window.CREATIVE_ON && d.src !== 'hat' && inRect(mouse, creativeLayout(L)) && !inRect(mouse, { x: L.x, y: L.y, w: L.w, h: L.h })) { creativeTake(d); return; }
  // Thả ra ngoài khung túi đồ (và ngoài sách công thức) = vứt xuống đất
  const outside = !inRect(mouse, { x: L.x, y: L.y, w: L.w, h: L.h }) && !inRect(mouse, L.bookBox);
  if (outside && d.src !== 'hat') {
    if (d.src === 'armor') dropGear(d.id, false, false);
    else dropSlotItem(d.id, !keys['ShiftLeft'] && !keys['ShiftRight'], d.i); // mặc định vứt cả chồng, giữ Shift = vứt 1 cái
    return;
  }
  if (d.src === 'hat') {   // nón lá đang đội ở ô đầu: thả vào túi hoặc bấm tại chỗ = bỏ xuống
    if (toSlot >= 0 || (toArmor && toArmor.slot === 'head')) { hatOn = false; say('Đã bỏ nón lá xuống'); }
    return;
  }
  if (d.src === 'armor') {
    if (toSlot >= 0) unequipToBag(d.id, toSlot);
    else if (toArmor && toArmor.id === d.id) unequipToBag(d.id);  // bấm tại chỗ: cất vào túi
    return;
  }
  if (toSlot === d.i) { activateSlot(d.i); return; }
  if (toSlot >= 0) { swapSlots(d.i, toSlot); return; }
  if (toArmor) {
    if (GEAR_BASE[d.id] === toArmor.slot) equipFromBag(d.id);
    else if (d.id === 'nonla' && toArmor.slot === 'head') { if (!hatOn) toggleHat(); }
    return;
  }
  const cell = L.grid.find((s) => s.active && inRect(mouse, s));
  if (cell && MATERIALS.includes(d.id)) {
    held = d.id;
    if (!grid[cell.i]) clickGridCell(cell.i);
  }
}

// Món đang kéo bám theo con trỏ
function drawDragGhost() {
  if (!drag) return;
  const tier = drag.tier !== undefined ? drag.tier : drag.id in tools ? tools[drag.id] : GEAR_IDS.includes(drag.id) ? 3 : 1;
  ctx.globalAlpha = 0.9;
  drawIcon(drag.id, mouse.x - 16, mouse.y - 16, 32, tier);
  ctx.globalAlpha = 1;
}

// Con trỏ bàn tay trên toàn bộ thanh nhanh: mở bàn tay khi rê, nắm lại khi đang kéo
function updateCursor(W, H) {
  let c = '';
  if (deathScreen) {
    const L = deathLayout(W, H);
    c = (adState ? inRect(mouse, L.cancel) : deathScreen.t >= 0.8 && (inRect(mouse, L.respawn) || inRect(mouse, L.ad))) ? 'pointer' : 'default';
    if (canvas.style.cursor !== c) canvas.style.cursor = c;
    return;
  }
  if (drag) c = 'grabbing';
  else if (ui === 'map') c = mapDrag && mapDrag.moved ? 'grabbing' : 'grab';
  else if (ui === 'elements' || ui === 'spellshop') c = window.ElementPick ? ElementPick.cursor() : '';
  else if (ui === 'dwarf') c = window.Dwarf ? Dwarf.cursor() : '';
  else if (ui === 'dialog') c = 'pointer';
  else if (!ui && layer === 2 && (() => { const r = wizardScreenRect(); return r && inRect(mouse, r); })()) c = 'pointer';
  else if (ui === 'store') { const SL = storeLayout(); if ([...SL.cs, ...SL.all].some((r) => inRect(mouse, r))) c = 'grab'; }
  else if (inRect(mouse, hotbarBounds(ui === 'inv' ? invLayout().hotbar : hotbarRects(W, H)))) c = 'grab';
  else if (!ui && mmOver(W)) c = 'pointer';
  if (canvas.style.cursor !== c) canvas.style.cursor = c;
}

function drawHotbar(W, H, dt) {
  const rs = hotbarRects(W, H);
  const first = rs[0], last = rs[8];
  mcPanel({ x: first.x - 6, y: first.y - 6, w: last.x + SLOT - first.x + 12, h: SLOT + 12 });
  let tip = null;
  const hb = slotList();

  rs.forEach((s, i) => {
    const id = hb[i];
    const hov = inRect(mouse, s);
    drawSlot(s, hov);
    if (i === hotbarSel) { ctx.fillStyle = 'rgba(255,196,40,0.22)'; ctx.fillRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4); } // ô đang chọn: nền vàng đậm
    if (id) {
      drawSlotItem(s, id, drag && drag.src === 'slot' && drag.i === i, 24, stackCount(i));
      if (hov && !drag) tip = itemTip(id);
    }
    ctx.textAlign = 'left';
    ctx.font = 'bold 10px sans-serif';
    shadowText(String(i + 1), s.x + 4, s.y + 12, 'rgba(255,255,255,0.8)');
  });

  // Ô đang chọn: viền vàng mảnh, dịu
  const sel = rs[hotbarSel];
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sel.x - 3.5, sel.y - 3.5, sel.w + 7, sel.h + 7);
  ctx.strokeStyle = 'rgba(255,208,70,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(sel.x - 1, sel.y - 1, sel.w + 2, sel.h + 2);

  // Tên món vừa chọn
  hotbarLabel.time -= dt;
  if (hotbarLabel.time > 0) {
    ctx.globalAlpha = Math.min(1, hotbarLabel.time / 0.4);
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    shadowText(hotbarLabel.text, W / 2, first.y - 16);
    ctx.globalAlpha = 1;
  }

  if (drag) drawDragGhost();
  else if (tip) drawTooltip(tip);
}

// ---------- Vẽ: tổng hợp ----------
function draw(dt) {
  const W = canvas.width, H = canvas.height;
  ctx.imageSmoothingEnabled = false; // giữ pixel art sắc nét

  const camX = Math.floor(player.x - W / 2);
  const camY = Math.floor(player.y - H / 2);
  const tx0 = Math.floor(camX / TILE) - 1;
  const ty0 = Math.floor(camY / TILE) - 1;
  const tx1 = Math.ceil((camX + W) / TILE) + 1;
  const ty1 = Math.ceil((camY + H) / TILE) + 7; // dư thêm vài hàng để zombie cao ở mép dưới vẫn được vẽ

  // Nhóm vẽ thế giới: chịu rung màn hình
  ctx.save();
  ctx.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 10);

  drawGround(camX, camY, tx0, ty0, tx1, ty1);
  if (layer === 0) drawWitchGround(witchesInView(tx0, ty0, tx1, ty1), camX, camY);
  for (const s of strikes) if (s.t < LIGHTNING.warn) drawStrikeWarning(s, camX, camY);
  drawMeteorShadow(camX, camY);
  for (const ci of caveins) drawCaveInWarning(ci, camX, camY);
  if (window.Magma) Magma.drawGround(camX, camY); // vùng đỏ núi lửa + vòng báo bom (magma.js)
  if (layer === 0 && typeof drawIcePonds === 'function') drawIcePonds(camX, camY, tx0, ty0, tx1, ty1); // hồ băng đảo băng (volcano.js)
  if (window.FinalBoss) FinalBoss.drawGround(camX, camY); // vũng / hố đen / vòng báo đòn của boss cuối (final-boss.js)
  if (window.VolcBoss) VolcBoss.drawGround(camX, camY); // vòng báo đòn + vũng lửa của boss núi lửa (volcano-boss.js)

  // Vẽ vật thể theo hàng từ trên xuống để có chiều sâu
  const vobjs = villageObjsInView(tx0, ty0, tx1, ty1);
  lastVObjs = vobjs;
  const elders = layer === 0 ? eldersInView(tx0, ty0, tx1, ty1) : [];
  const witches = layer === 0 ? witchesInView(tx0, ty0, tx1, ty1) : [];
  const volcs = layer === 0 ? volcanoesIn(tx0, ty0, tx1, ty1) : []; // đảo núi lửa (volcano.js)
  const gatesVisible = layer === 1 ? gatesIn(tx0 - 8, ty0 - 8, tx1 + 8, ty1 + 8) : [];
  const playerRow = Math.floor((player.y + 10) / TILE);
  if (layer === 2 && houseCur && houseCur.witchHouse && !witchInterior) drawWitchRug(camX, camY);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = getTile(tx, ty);
      if (t === FARM) { const cr = changes.get('c' + tx + ',' + ty); if (cr) drawCrop(cr, tx * TILE - camX, ty * TILE - camY); continue; }
      if (t === GRASS || t === VOBJ || t === LAVA || t === WATER || t === SEA) continue;
      const sx = tx * TILE - camX, sy = ty * TILE - camY;
      if (layer === 2 && t === HWALL) { drawHouseTile(t, tx, ty, sx, sy); continue; }
      if (layer === 3 && t === GWALL && !arenaWallVisible(tx, ty)) continue;
      const key = tx + ',' + ty;
      drawTile(t, sx, sy, key);

      // Thanh máu khi đang bị phá
      if (damage.has(key)) {
        const lost = damage.get(key) / TILE_INFO[t].hp;
        ctx.fillStyle = '#000';
        ctx.fillRect(sx + 8, sy - 10, 32, 5);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(sx + 8, sy - 10, 32 * (1 - lost), 5);
      }
    }
    for (const c of chests) if (c.ty === ty) drawChest(c, camX, camY);
    for (const b of bags) if (b.layer === layer && Math.floor((b.y + 10) / TILE) === ty) drawBag(b, camX, camY);
    for (const d of itemDrops) if (d.layer === layer && Math.floor((d.y + 10) / TILE) === ty) drawDrop(d, camX, camY);
    if (layer === 2 && houseCur) { drawSleepers(ty, camX, camY); if (houseCur.witchHouse) drawWizard(ty, camX, camY); }
    if (layer === 0) {
      for (const pb of placedBoats) if (Math.floor((pb.y + 10) / TILE) === ty) drawPlacedBoat(pb, camX, camY);
      for (const o of vobjs) if (o.by === ty) drawVillageObj(o, camX, camY);
      for (const el of elders) if (el.ty === ty || (ty === ty1 && el.ty > ty1)) drawElder(el, camX, camY); // gốc nằm dưới mép màn hình mà tán còn thấy: vẫn vẽ, không bị biến mất rồi hiện lại khi đi
      for (const vo of volcs) if (volcBaseRow(vo) === ty) drawVolcano(vo, camX, camY);
      for (const wh of witches) { drawWitchDecorRow(wh, ty, camX, camY); if (wh.ty === ty) drawWitch(wh, camX, camY); }
      for (const a of animals) if (Math.floor((a.y + 10) / TILE) === ty) drawAnimal(a, camX, camY);
      for (const vl of villagers) if (Math.floor((vl.y + 10) / TILE) === ty) drawVillager(vl, camX, camY);
      for (const e of exercisers) if (Math.floor((e.y + 10) / TILE) === ty) drawExerciser(e, camX, camY);
      for (const h of warriors) if (Math.floor((h.y + 10) / TILE) === ty) drawWarrior(h, camX, camY);
    }
    if (layer === 1) for (const g of gatesVisible) if (g.ty === ty) drawGateSprite(g, camX, camY); // Cổng Ma Vương dưới hầm
    for (const z of zombies) if (Math.floor((z.y + 10) / TILE) === ty) (z.boss ? drawBoss : z.plant ? drawPlant : drawZombie)(z, camX, camY);
    for (const sp of spiders) if (Math.floor((sp.y + 10) / TILE) === ty) drawSpider(sp, camX, camY);
    if (ty === playerRow && !deathScreen) drawPlayer(camX, camY);
  }

  if (layer === 0) drawWitchFlyers(witches, camX, camY);
  if (layer === 0) drawDarkFlowers(witches, camX, camY);
  if (layer === 0) drawSaplings(camX, camY);
  if (layer === 0) for (const vl of villagers) drawVillagerBubble(vl, camX, camY);
  if (layer === 0) for (const e of exercisers) drawVillagerBubble(e, camX, camY);

  // Khung chọn ô mục tiêu
  if (!ui) {
    const t = currentTarget(camX, camY);
    const tt = t ? getTile(t.tx, t.ty) : GRASS;
    if (t && tt !== GRASS && tt !== VOBJ && tt !== HWALL && tt !== GWALL) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(t.tx * TILE - camX, t.ty * TILE - camY, TILE, TILE);
      if (tt === FARM) {
        drawCropLabel(t.tx, t.ty, camX, camY);
        if (layer === 0 && slotList()[hotbarSel] === 'watercan' && cropAt(t.tx, t.ty)) { // cầm bình tưới: khung xanh báo cây sẽ được tưới
          ctx.strokeStyle = 'rgba(110,190,255,0.95)';
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(t.tx * TILE - camX + 2, t.ty * TILE - camY + 2, TILE - 4, TILE - 4);
          ctx.setLineDash([]);
        }
      }
    } else if (t && tt === GRASS && layer === 0 && heldTool() === 'hoe') { // cầm cuốc đất: khung nâu báo ô sẽ cày
      ctx.strokeStyle = 'rgba(200,125,85,0.95)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(t.tx * TILE - camX, t.ty * TILE - camY, TILE, TILE);
      ctx.setLineDash([]);
    }
  }

  if (bucketHeld() && !ui) { // cầm xô: khung xanh báo ô sẽ múc / đổ được
    const bt = currentTarget(camX, camY);
    if (bt && (bucketLava ? (getTile(bt.tx, bt.ty) === GRASS && !(layer === 0 && villageAt(bt.tx, bt.ty)) && !waterSourceAt(bt.tx, bt.ty)) : bucketWater ? canPourAt(bt.tx, bt.ty) : (waterSourceAt(bt.tx, bt.ty) || getTile(bt.tx, bt.ty) === LAVA))) {
      ctx.strokeStyle = 'rgba(110,190,255,0.95)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.strokeRect(bt.tx * TILE - camX + 2, bt.ty * TILE - camY + 2, TILE - 4, TILE - 4);
      ctx.setLineDash([]);
    }
  }
  drawBuildGhost(camX, camY);
  drawRocks(camX, camY);
  drawArrows(camX, camY);
  drawArrows(camX, camY, vArrows);
  if (window.Magma) Magma.drawAir(camX, camY); // bom dung nham đang bay (magma.js)
  if (window.FinalBoss) FinalBoss.drawAir(camX, camY); // đòn trên không của boss cuối (final-boss.js)
  if (window.VolcBoss) VolcBoss.drawAir(camX, camY); // đạn / thiên thạch / rồng lửa của boss núi lửa (volcano-boss.js)
  if (window.FireMagic) FireMagic.draw(camX, camY);
  if (window.IceMagic) IceMagic.draw(camX, camY);
  if (window.ArcaneMagic) ArcaneMagic.draw(camX, camY);
  if (window.ExtraMagic) ExtraMagic.draw(camX, camY);
  drawSpits(camX, camY);
  drawBossMud(camX, camY);
  drawGolemFx(camX, camY);
  drawParticles(camX, camY);
  drawToolFx(camX, camY);
  drawBooms(camX, camY);
  drawMeteors(camX, camY);
  for (const s of strikes) drawBolt(s, camX, camY);

  // Chữ bay (+gỗ, -máu...)
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px sans-serif';
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = f.color || '#fff';
    ctx.fillText(f.text, f.x - camX, f.y - camY);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Lớp phủ trên thế giới: ban đêm, mưa, chớp, viền máu, mũi tên chỉ rương, giao diện
  drawLighting(camX, camY);
  drawBossBar(dt); // sau lớp bóng tối để thanh máu boss luôn rõ
  drawRain(dt);
  drawScreenFx(W, H);
  drawBagArrows(camX, camY);
  drawHud(W, H);
  if (window.Magma) Magma.drawHud(W, H); // đồng hồ phun trào (magma.js)
  drawMinimap(W);

  if (ui === 'inv') drawInventory();
  else if (ui === 'store') drawStoreUi();
  else {
    drawHotbar(W, H, dt);
    if (ui === 'furnace') drawFurnaceUi();
    if (ui === 'market') drawMarketUi();
    if (ui === 'spellbook') drawSpellbookUi(W, H);
    if ((ui === 'elements' || ui === 'spellshop') && window.ElementPick) ElementPick.draw(W, H);
    if (ui === 'dwarf' && window.Dwarf) Dwarf.draw(W, H);
    if (ui === 'dialog' && window.Dialog) Dialog.draw(W, H);
  }
  drawFullMap(W, H);
  if (deathScreen) drawDeathScreen(W, H);
  updateCursor(W, H);
}

// ---------- Mini map (tròn, góc phải trên) ----------
// Chỉ hiện vùng đã đi qua. Bấm vào bản đồ để ghim một chỗ đã đi qua; bấm vào ghim để gỡ.
const MM = {
  r: 60,            // bán kính vòng tròn (pixel)
  scale: 2,         // pixel trên mỗi ô đất
  tiles: 68,        // cạnh ảnh nền (ô): lớn hơn vùng hiển thị để cuộn mượt giữa hai lần vẽ lại
  cell: 4,          // cạnh ô khám phá (ô đất)
  reveal: 3,        // bán kính khám phá quanh người chơi (tính bằng ô khám phá)
  revealMine: 1,    // trong hầm tối: chỉ khám phá sát quanh người, vừa tầm sáng
  margin: 12,
  top: 34,
  minW: 440,        // màn hình hẹp hơn thì ẩn để khỏi đè lên thanh máu
  maxPins: 12,
};
const MM_PIN_COLORS = ['#ff5a4d', '#4da6ff', '#ffd34d', '#6fdc6f', '#c68bff'];
const MM_COL = {
  swamp: [74, 88, 44], water: [44, 88, 86], seaDeep: [29, 90, 148], seaShallow: [74, 155, 208], sand: [220, 200, 143], [SEA]: [29, 90, 148], grass: [79, 122, 52], dirt: [163, 132, 87], trail: [148, 118, 75], market: [186, 150, 96],
  [TREE]: [38, 84, 36], [ROCK]: [141, 141, 149], [COAL]: [52, 52, 58], [IRON]: [208, 140, 104], [GOLD]: [242, 193, 78], [DIAMOND]: [79, 224, 255],
  cave: [86, 74, 62], [LAVA]: [226, 84, 30], [WATER]: [52, 112, 190], [VOBJ]: [176, 88, 58], [STAIRS]: [30, 30, 34], [ROOF]: [163, 64, 47], [IWALL]: [140, 146, 156], [WWALL]: [138, 90, 43], [WBLOCK]: [176, 125, 66], [SBLOCK]: [141, 145, 153], [IBLOCK]: [205, 210, 220], [DBLOCK]: [79, 216, 255], [CBLOCK]: [40, 40, 46], [FARM]: [105, 56, 43], [VCONE]: [92, 60, 48], [VROCK]: [98, 82, 66], [VSNAG]: [60, 46, 40], [VCRYS]: [120, 200, 245], other: [217, 174, 110],
};
let mmExplored = new Set();   // các ô khám phá đã đi qua (khoá số, xem mmKey)
let mmPins = [];                // { tx, ty, c }: vị trí tính bằng ô đất (số thực), c: chỉ số màu
let mmLastCell = null;          // ô khám phá lần trước người chơi đứng
let mmOrigin = null;            // góc trên-trái (ô đất) của ảnh nền đã vẽ
let mmDirty = true;             // cần vẽ lại ảnh nền
const mapStore = [null, null, null];  // bản đồ của tầng đang không ở (0 = mặt đất, 1 = hầm mỏ, 2 = đấu trường boss)
function mapKeyOf(l) { return l === 1 ? 1 : l === 3 ? 2 : 0; } // trong nhà dùng chung bản đồ mặt đất; đấu trường có bản đồ riêng (toạ độ trùng với hầm / mặt đất)

// Đổi tầng thì đổi luôn bản đồ: mặt đất và hầm mỏ mỗi nơi một bản đồ, một bộ ghim
function swapMapState(from, to) {
  const a = mapKeyOf(from), b = mapKeyOf(to);
  if (a === b) return;
  mapStore[a] = { ex: mmExplored, pins: mmPins, last: mmLastCell };
  const s = mapStore[b] || { ex: new Set(), pins: [], last: null };
  mapStore[b] = null;
  mmExplored = s.ex; mmPins = s.pins; mmLastCell = s.last;
  mmOrigin = null; fmInfo = null; mmDirty = true; mmVersion++;
}
let mmVersion = 0;              // tăng mỗi khi vùng khám phá đổi (bản đồ lớn dùng để biết cần vẽ lại)
const mmCanvas = document.createElement('canvas');
mmCanvas.width = mmCanvas.height = MM.tiles;
const mmCtx = mmCanvas.getContext('2d');
const mmImg = mmCtx.createImageData(MM.tiles, MM.tiles);

function mmKey(cx, cy) { return (cx + 32768) * 65536 + (cy + 32768); }
function mmIsExplored(tx, ty) { return mmExplored.has(mmKey(Math.floor(tx / MM.cell), Math.floor(ty / MM.cell))); }

function mmTileColor(tx, ty) {
  const t = getTile(tx, ty);
  if (layer === 1) { // hầm: bản đồ không để lộ quặng, chỉ hiện lối đi, thang và đá
    if (t === GRASS) return MM_COL.cave;
    if (t === LAVA || t === WATER) return MM_COL[t];
    return t === STAIRS ? MM_COL[STAIRS] : MM_COL[ROCK];
  }
  if (t === GRASS) {
    const vg = villageAt(tx, ty);
    if (vg) {
      if (vg.isMarket) return tx > vg.x0 && tx < vg.x1 && ty > vg.y0 && ty < vg.y1 ? MM_COL.market : MM_COL.grass;
      if (vg.trail.has(tx + ',' + ty)) return MM_COL.trail;
      if (ty >= vg.py0 && ty <= vg.py1 && tx > vg.x0 && tx < vg.x1) return MM_COL.dirt;
    }
    const se = seaType(tx, ty);
    if (se) return se === 1 ? MM_COL.sand : MM_COL.seaShallow;
    const vm = volcanoMiniColor(tx, ty); // nền tro đảo núi lửa
    if (vm) return vm;
    const sw = swampType(tx, ty);
    if (sw) return sw === 2 ? MM_COL.water : MM_COL.swamp;
    return MM_COL.grass;
  }
  return MM_COL[t] || MM_COL.other;
}

function redrawMinimapImage() {
  const n = MM.tiles, half = n >> 1;
  const ox = Math.floor(player.x / TILE) - half, oy = Math.floor(player.y / TILE) - half;
  const d = mmImg.data;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = (j * n + i) * 4;
      if (!mmIsExplored(ox + i, oy + j)) { d[p + 3] = 0; continue; } // chưa đi qua: để trống (thấy nền tối)
      const c = mmTileColor(ox + i, oy + j);
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
  }
  mmCtx.putImageData(mmImg, 0, 0);
  mmOrigin = { x: ox, y: oy };
  mmDirty = false;
}

function updateMinimap() {
  if (ui === 'map' && layer >= 2) closeUi(); // vào nhà / đấu trường thì đóng bản đồ
  if (layer >= 2) return;
  const tx = Math.floor(player.x / TILE), ty = Math.floor(player.y / TILE);
  const cx = Math.floor(tx / MM.cell), cy = Math.floor(ty / MM.cell);
  const k = cx + ',' + cy;
  if (k !== mmLastCell) { // sang ô khám phá mới: mở thêm vùng xung quanh
    mmLastCell = k;
    const R = layer === 1 ? MM.revealMine : MM.reveal;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const key = mmKey(cx + dx, cy + dy);
        if (!mmExplored.has(key)) { mmExplored.add(key); mmDirty = true; mmVersion++; }
      }
    }
  }
  const half = MM.tiles >> 1;
  if (mmDirty || !mmOrigin || Math.abs(tx - (mmOrigin.x + half)) > 4 || Math.abs(ty - (mmOrigin.y + half)) > 4) redrawMinimapImage();
}

function mmGeom(W) {
  return { cx: W - MM.margin - MM.r, cy: MM.top + MM.r, r: MM.r };
}
function mmActive(W) {
  return layer < 2 && !deathScreen && ui !== 'inv' && ui !== 'map' && W >= MM.minW;
}
function mmOver(W) {
  if (!mmActive(W)) return false;
  const g = mmGeom(W);
  return Math.hypot(mouse.x - g.cx, mouse.y - g.cy) <= g.r;
}

// Vị trí ghim trên màn hình (ghim ở xa thì dính vào mép vòng tròn)
function mmPinScreen(p, g) {
  let dx = (p.tx - player.x / TILE) * MM.scale, dy = (p.ty - player.y / TILE) * MM.scale;
  const lim = g.r - 14, d = Math.hypot(dx, dy);
  const edge = d > lim;
  if (edge) { dx = dx / d * lim; dy = dy / d * lim; }
  return { x: g.cx + dx, y: g.cy + dy, edge };
}
function mmPinAt(g) {
  for (let i = mmPins.length - 1; i >= 0; i--) {
    const q = mmPinScreen(mmPins[i], g);
    if (Math.hypot(mouse.x - q.x, mouse.y - (q.y - 6)) <= 9) return i;
  }
  return -1;
}

// Bấm vào mini map: gỡ ghim đang trỏ tới, hoặc đặt ghim mới ở chỗ đã đi qua. Trả về true nếu đã xử lý.
function clickMinimap() {
  const W = canvas.width;
  if (ui || !mmOver(W)) return false;
  const g = mmGeom(W);
  const hit = mmPinAt(g);
  if (hit >= 0) { mmPins.splice(hit, 1); return true; }
  mmAddPin(player.x / TILE + (mouse.x - g.cx) / MM.scale, player.y / TILE + (mouse.y - g.cy) / MM.scale);
  return true;
}

// Đặt ghim ở vị trí (ô đất) nếu chỗ đó đã đi qua
function mmAddPin(tx, ty) {
  if (!mmIsExplored(tx, ty)) { say('Chỗ này bạn chưa đi qua nên chưa ghim được'); return false; }
  if (mmPins.length >= MM.maxPins) { say('Tối đa ' + MM.maxPins + ' ghim'); return false; }
  const used = mmPins.map((p) => p.c);
  let c = 0;
  while (used.includes(c) && c < MM_PIN_COLORS.length - 1) c++; // ưu tiên màu chưa dùng
  if (used.includes(c)) c = mmPins.length % MM_PIN_COLORS.length;
  mmPins.push({ tx, ty, c });
  return true;
}

function drawPinIcon(x, y, color, hot, alpha) {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hot ? '#fff' : '#000';
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - 4, y - 7); ctx.lineTo(x, y); ctx.lineTo(x + 4, y - 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y - 10, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y - 10, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawMinimap(W) {
  if (!mmActive(W) || !mmOrigin) return;
  const g = mmGeom(W), s = MM.scale;
  const px = player.x / TILE, py = player.y / TILE;

  // Nền + bản đồ (cắt tròn)
  ctx.save();
  ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#16120d';
  ctx.fillRect(g.cx - g.r, g.cy - g.r, g.r * 2, g.r * 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mmCanvas, Math.round(g.cx + (mmOrigin.x - px) * s), Math.round(g.cy + (mmOrigin.y - py) * s), MM.tiles * s, MM.tiles * s);
  ctx.restore();

  // Viền
  ctx.lineWidth = 5; ctx.strokeStyle = '#2b1d0e';
  ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r + 1, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = '#c9a36a';
  ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r + 1, 0, Math.PI * 2); ctx.stroke();
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  shadowText('B', g.cx, g.cy - g.r + 14);

  // Ghim
  const hover = mmOver(W) ? mmPinAt(g) : -1;
  mmPins.forEach((p, i) => {
    const q = mmPinScreen(p, g);
    drawPinIcon(q.x, q.y, MM_PIN_COLORS[p.c % MM_PIN_COLORS.length], i === hover, q.edge ? 0.8 : 1);
  });

  // Người chơi: mũi tên theo hướng đang quay mặt
  ctx.save();
  ctx.translate(g.cx, g.cy);
  ctx.rotate(Math.atan2(player.faceY || 1, player.faceX || 0));
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4.5); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4.5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // Gợi ý phím mở bản đồ lớn (luôn hiện dưới mini map)
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  shadowText((layer === 1 ? MINE_ZONES[playerMineZone()].name + ' · ' : '') + '[M] Bản đồ lớn', g.cx, g.cy + g.r + 17, '#e6d3a8');

  // Gợi ý khi rê chuột
  if (mmOver(W)) {
    let txt;
    if (hover >= 0) txt = 'Bấm để gỡ ghim';
    else {
      const wx = px + (mouse.x - g.cx) / s, wy = py + (mouse.y - g.cy) / s;
      txt = mmIsExplored(wx, wy) ? 'Bấm để ghim (' + mmPins.length + '/' + MM.maxPins + ')' : 'Chưa đi qua chỗ này';
    }
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    shadowText(txt, g.cx, g.cy + g.r + 34);
  }
}

// ---------- Bản đồ lớn (nhấn M) ----------
// Xem toàn bộ vùng đã đi qua: kéo chuột để di chuyển, lăn chuột để thu phóng, bấm để ghim / gỡ ghim.
const FM_SCALES = [2, 3, 4, 6, 8];   // pixel trên mỗi ô đất
const FM_MARGIN = 24;                // ảnh nền vẽ rộng hơn khung nhìn (ô) để kéo mượt, không phải vẽ lại liên tục
const fmCanvas = document.createElement('canvas');
const fmCtx = fmCanvas.getContext('2d');
let fmInfo = null;                   // { ox, oy, nw, nh, ver }: vùng ảnh nền đã vẽ
const mapView = { cx: 0, cy: 0, s: 4 }; // tâm khung nhìn (ô đất) và độ phóng
let mapDrag = null;                  // { x, y, cx, cy, moved }

function fmLayout(W, H) {
  const w = Math.min(W - 24, 920), h = Math.min(H - 24, 640);
  const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
  const area = { x: x + 10, y: y + 38, w: w - 20, h: h - 38 - 34 };
  return { panel: { x, y, w, h }, area, btn: { x: area.x + area.w - 112, y: area.y + 8, w: 104, h: 26 } };
}

function openMap() {
  mapView.cx = player.x / TILE;
  mapView.cy = player.y / TILE;
  mapDrag = null;
  ui = 'map';
}
function toggleMap() {
  if (ui === 'map') { closeUi(); return; }
  if (ui) return;
  if (layer >= 2) { say('Không dùng được bản đồ ở đây'); return; }
  openMap();
}

// Vẽ ảnh nền (1 pixel / ô) khi khung nhìn ra khỏi vùng đã vẽ, đổi phóng to, hoặc có vùng mới khám phá
function fmRender(vw, vh) {
  const l = mapView.cx - vw / 2, t = mapView.cy - vh / 2;
  if (fmInfo && fmInfo.ver === mmVersion && l >= fmInfo.ox && t >= fmInfo.oy && l + vw <= fmInfo.ox + fmInfo.nw && t + vh <= fmInfo.oy + fmInfo.nh) return;
  const ox = Math.floor(l) - FM_MARGIN, oy = Math.floor(t) - FM_MARGIN;
  const nw = Math.ceil(vw) + FM_MARGIN * 2 + 2, nh = Math.ceil(vh) + FM_MARGIN * 2 + 2;
  fmCanvas.width = nw; fmCanvas.height = nh;
  const img = fmCtx.createImageData(nw, nh), d = img.data;
  for (let j = 0; j < nh; j++) {
    for (let i = 0; i < nw; i++) {
      if (!mmIsExplored(ox + i, oy + j)) continue; // alpha 0: chưa đi qua
      const c = mmTileColor(ox + i, oy + j), p = (j * nw + i) * 4;
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
  }
  fmCtx.putImageData(img, 0, 0);
  fmInfo = { ox, oy, nw, nh, ver: mmVersion };
}

function fmToWorld(L, sx, sy) {
  return { tx: mapView.cx + (sx - (L.area.x + L.area.w / 2)) / mapView.s, ty: mapView.cy + (sy - (L.area.y + L.area.h / 2)) / mapView.s };
}
function fmToScreen(L, tx, ty) {
  return { x: L.area.x + L.area.w / 2 + (tx - mapView.cx) * mapView.s, y: L.area.y + L.area.h / 2 + (ty - mapView.cy) * mapView.s };
}
function fmPinAt(L) {
  for (let i = mmPins.length - 1; i >= 0; i--) {
    const q = fmToScreen(L, mmPins[i].tx, mmPins[i].ty);
    if (Math.hypot(mouse.x - q.x, mouse.y - (q.y - 6)) <= 9) return i;
  }
  return -1;
}

function mapMouseDown() {
  const L = fmLayout(canvas.width, canvas.height);
  if (inRect(mouse, L.btn)) { mapView.cx = player.x / TILE; mapView.cy = player.y / TILE; return; }
  if (inRect(mouse, L.area)) mapDrag = { x: mouse.x, y: mouse.y, cx: mapView.cx, cy: mapView.cy, moved: false };
}
function mapMouseMove() {
  if (!mapDrag) return;
  const dx = mouse.x - mapDrag.x, dy = mouse.y - mapDrag.y;
  if (!mapDrag.moved && Math.hypot(dx, dy) > 4) mapDrag.moved = true;
  if (mapDrag.moved) { mapView.cx = mapDrag.cx - dx / mapView.s; mapView.cy = mapDrag.cy - dy / mapView.s; }
}
function mapMouseUp() {
  if (!mapDrag) return;
  const moved = mapDrag.moved;
  mapDrag = null;
  if (moved) return; // vừa kéo bản đồ, không tính là bấm
  const L = fmLayout(canvas.width, canvas.height);
  if (window.ArcaneMagic && ArcaneMagic.picking()) { // đang chọn điểm dịch chuyển (Chúa Tể Không Gian): bấm = chọn điểm đến, không ghim
    if (inRect(mouse, L.area) && !inRect(mouse, L.btn)) { const q = fmToWorld(L, mouse.x, mouse.y); ArcaneMagic.mapClick(q.tx, q.ty); }
    return;
  }
  const hit = fmPinAt(L);
  if (hit >= 0) { mmPins.splice(hit, 1); return; }
  const w = fmToWorld(L, mouse.x, mouse.y);
  mmAddPin(w.tx, w.ty);
}
// Thu phóng quanh vị trí con trỏ (điểm dưới con trỏ đứng yên)
function mapZoom(dir) {
  const L = fmLayout(canvas.width, canvas.height);
  const i = Math.max(0, Math.min(FM_SCALES.length - 1, FM_SCALES.indexOf(mapView.s) + dir));
  if (FM_SCALES[i] === mapView.s) return;
  const anchor = inRect(mouse, L.area) ? { x: mouse.x, y: mouse.y } : { x: L.area.x + L.area.w / 2, y: L.area.y + L.area.h / 2 };
  const w = fmToWorld(L, anchor.x, anchor.y);
  mapView.s = FM_SCALES[i];
  mapView.cx = w.tx - (anchor.x - (L.area.x + L.area.w / 2)) / mapView.s;
  mapView.cy = w.ty - (anchor.y - (L.area.y + L.area.h / 2)) / mapView.s;
}

function drawFullMap(W, H) {
  if (ui !== 'map' || deathScreen || layer >= 2) return;
  const L = fmLayout(W, H), a = L.area, s = mapView.s;
  fmRender(a.w / s, a.h / s);

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);
  mcPanel(L.panel);
  ctx.fillStyle = '#373737';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Bản đồ', L.panel.x + 14, L.panel.y + 26);
  if (window.ArcaneMagic) ArcaneMagic.drawMapBanner(L);

  // Bản đồ (cắt theo khung)
  ctx.save();
  ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
  ctx.fillStyle = '#16120d';
  ctx.fillRect(a.x, a.y, a.w, a.h);
  ctx.imageSmoothingEnabled = false;
  const o = fmToScreen(L, fmInfo.ox, fmInfo.oy);
  ctx.drawImage(fmCanvas, Math.round(o.x), Math.round(o.y), fmInfo.nw * s, fmInfo.nh * s);

  const hover = !mapDrag && inRect(mouse, a) && !inRect(mouse, L.btn) ? fmPinAt(L) : -1;
  mmPins.forEach((p, i) => {
    const q = fmToScreen(L, p.tx, p.ty);
    drawPinIcon(q.x, q.y, MM_PIN_COLORS[p.c % MM_PIN_COLORS.length], i === hover, 1);
  });

  if (window.ArcaneMagic) ArcaneMagic.drawMapOverlay(L); // vòng 50 ô + tâm ngắm khi đang chọn điểm dịch chuyển

  // Người chơi
  const pp = fmToScreen(L, player.x / TILE, player.y / TILE);
  ctx.save();
  ctx.translate(pp.x, pp.y);
  ctx.rotate(Math.atan2(player.faceY || 1, player.faceX || 0));
  ctx.scale(1.4, 1.4);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4.5); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4.5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // Nút về chỗ người chơi
  const bh = inRect(mouse, L.btn);
  ctx.fillStyle = bh ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.55)';
  ctx.fillRect(L.btn.x, L.btn.y, L.btn.w, L.btn.h);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.strokeRect(L.btn.x, L.btn.y, L.btn.w, L.btn.h);
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
  shadowText('Về chỗ tôi', L.btn.x + L.btn.w / 2, L.btn.y + 18);
  ctx.restore();

  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.strokeRect(a.x, a.y, a.w, a.h);

  // Gợi ý theo con trỏ
  if (!mapDrag && inRect(mouse, a) && !inRect(mouse, L.btn)) {
    let txt;
    if (hover >= 0) {
      const p = mmPins[hover];
      txt = 'Bấm để gỡ ghim · cách bạn ' + Math.round(Math.hypot(p.tx - player.x / TILE, p.ty - player.y / TILE)) + ' ô';
    } else {
      const w = fmToWorld(L, mouse.x, mouse.y);
      txt = mmIsExplored(w.tx, w.ty) ? 'Bấm để ghim' : 'Chưa đi qua chỗ này';
    }
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    shadowText(txt, Math.max(a.x + 90, Math.min(a.x + a.w - 90, mouse.x)), Math.max(a.y + 14, mouse.y - 22));
  }

  // Chân bảng
  const fy = a.y + a.h + 22;
  ctx.fillStyle = '#373737'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Bạn: (' + Math.floor(player.x / TILE) + ', ' + Math.floor(player.y / TILE) + ')  ·  Ghim ' + mmPins.length + '/' + MM.maxPins, a.x, fy);
  ctx.textAlign = 'right';
}

// ---------- Vòng lặp chính ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  draw(dt);
  requestAnimationFrame(frame);
}

// Tải sprite xong mới chạy (nếu thiếu file ảnh thì dùng hình tạm)
Promise.all([loadSprites(), loadFx(), loadZombieSprites(), loadAnimalSprites(), loadVillagerSprites(), loadVillageSprites(), loadElderSprite(), loadWitchSprite(), loadWitchDeco(), loadHudSprites(), loadWizardSprite(), loadBlackMarketSprite(), loadWarriorSprites(), loadNatureSprites()]).then(() => {
  if (!spritesReady) console.warn('Không tải được sprite: kiểm tra thư mục assets/player/');
  if (!FX.lightning.length) console.warn('Không tải được sprite sét: kiểm tra thư mục assets/fx/');
  if (!zombieSpritesReady) console.warn('Không tải được sprite zombie: kiểm tra thư mục assets/zombie/');
  if (!warriorSpritesReady) console.warn('Không tải được sprite chiến binh: kiểm tra thư mục assets/warrior/');
  if (loadGame()) say('Đã tải game đã lưu');
  else {
    setSeed(Math.floor(Math.random() * 2147483646) + 1); // thế giới mới ngẫu nhiên
    spawnStarterChest();
    say(loadNotice || 'Thế giới mới!');
  }
  last = performance.now();
  requestAnimationFrame(frame);
});
