// ======================================================================
// BẢNG LỆNH (cheat) — bấm / hoặc ` để mở. Muốn bỏ hẳn: xoá file này và dòng <script src="cheat.js"> trong survival.html
// (survival.js chỉ còn 2 chỗ nhắc tới window.CHEAT_OPEN, để yên cũng không sao)
// ======================================================================
(function () {
  window.CHEAT_OPEN = false;
  let box = null, logEl = null, input = null;
  const hist = [];
  let infMana = false;
  setInterval(() => { if (infMana && typeof mana !== 'undefined') mana = MAX_MANA; }, 30); // giữ Mana luôn đầy
  let hi = 0;

  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
  const itemName = (id) => { try { return itemTip(id)[0] || id; } catch (e) { return id; } };
  const num = (a, d) => { const v = parseInt(a, 10); return Number.isFinite(v) ? v : d; };

  // Tìm vật phẩm theo mã (wood) hoặc tên tiếng Việt (gỗ, go, sắt...)
  function findItem(q) {
    const k = norm(q);
    if (!k) return null;
    const alias = { sat: 'iron', vang: 'gold', da: 'stone', go: 'wood', than: 'coal', tao: 'apple', rau: 'veg', cam: 'orange', chuoi: 'banana', ca: 'fish', vai: 'cloth', non: 'nonla', thuoc: 'potion', giaidoc: 'antidote', den: 'torch', gay: 'stick' };
    if (alias[k]) return alias[k];
    const ids = Object.keys(inv);
    let hit = ids.find((id) => id === k) || ids.find((id) => norm(itemName(id)) === k);
    if (!hit) {
      const part = ids.filter((id) => id.includes(k) || norm(itemName(id)).includes(k));
      if (part.length === 1) hit = part[0];
    }
    return hit || null;
  }

  function give(id, n) {
    n = Math.max(1, Math.min(9999, n | 0));
    inv[id] += n;
    return 'Đã cấp ' + n + ' ' + itemName(id);
  }

  function giveArmor() { for (const s of ARMOR_SLOTS) gear[s] = true; return 'Đã mặc đủ bộ giáp'; }
  function giveDiamondArmor() { for (const s of ARMOR_SLOTS) for (const v of SLOT_VARIANTS[s]) gear[v] = false; for (const id of Object.keys(DIAMOND_ARMOR)) gear[id] = true; inv.diamond += 10; return 'Đã mặc đủ bộ giáp kim cương + 10 kim cương'; }
  function giveTools() { for (const id of ['axe', 'pickaxe', 'hoe', 'sword']) setTool(id, 3); return 'Đã cấp rìu, cuốc, cuốc đất, kiếm sắt'; }
  function giveMana() { // mở khoá thanh Mana như đã xong nhiệm vụ Cây Cổ Thụ, hồi đầy
    elderQuest.found = true; elderQuest.accepted = true; elderQuest.step = ELDER_QUESTS.length; elderQuest.unlocked = true;
    mana = MAX_MANA;
    return 'Đã mở thanh Mana (' + MAX_MANA + '/' + MAX_MANA + ')';
  }
  function skipQuest(all) { // /skip nv: bỏ qua nhiệm vụ Cây Cổ Thụ đang làm (thêm 'all' = xong hết, mở Mana + Nhà Phù Thủy)
    if (elderQuest.unlocked) return 'Nhiệm vụ Cây Cổ Thụ đã hoàn thành rồi';
    elderQuest.found = true; elderQuest.accepted = true;
    const done = elderQuest.step + 1;
    if (all) elderQuest.step = ELDER_QUESTS.length; else elderQuest.step++;
    elderQuest.prog = 0;
    if (elderQuest.step >= ELDER_QUESTS.length) {
      giveMana();
      const hw = nearestWitchAny();
      return 'Đã hoàn thành nhiệm vụ Cây Cổ Thụ, mở thanh Mana.' + (hw ? ' Nhà Phù Thủy xuất hiện ở ' + witchHintDir(hw).name + ', ~' + witchHintDir(hw).tiles + ' ô (/tp phuthuy để tới)' : '');
    }
    return 'Đã bỏ qua nhiệm vụ ' + done + '/' + ELDER_QUESTS.length + '. Tiếp: ' + ELDER_QUESTS[elderQuest.step].text;
  }
  function giveFarm() { setTool('hoe', 3); for (const k of Object.keys(CROPS)) inv['seed_' + k] += 8; return 'Đã cấp cuốc đất sắt + 8 hạt giống mỗi loại'; }
  function growAll() { // làm chín mọi cây đã trồng
    let n = 0;
    for (const [k, v] of changes) {
      if (k[0] !== 'c' || !v || !CROPS[v.k]) continue;
      if (v.h !== undefined) v.h = farmClock - CROPS[v.k].regrow - 1; else v.t = farmClock - CROPS[v.k].st * 2 - 1;
      n++;
    }
    return 'Đã làm chín ' + n + ' cây';
  }

  // Tìm chỗ đứng được (không vướng tường/cây) quanh một ô
  function freeSpotNear(tx, ty, maxR) {
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const c = tileCenter(tx + dx, ty + dy);
          if (!collides(c.x, c.y, 12) && !isSolid(tx + dx, ty + dy)) return c;
        }
      }
    }
    return null;
  }

  function tpVillage() {
    const rx = Math.floor(player.x / TILE / REG), ry = Math.floor(player.y / TILE / REG);
    let best = null, bd = Infinity;
    for (let j = -8; j <= 8; j++) {
      for (let i = -8; i <= 8; i++) {
        const c = villageCenterForRegion(rx + i, ry + j);
        if (!c) continue;
        const d = Math.hypot(c.cx * TILE - player.x, c.cy * TILE - player.y);
        if (d < bd) { bd = d; best = c; }
      }
    }
    if (!best) return 'Không tìm thấy làng nào gần đây';
    const spot = freeSpotNear(best.cx, best.cy, 8);
    if (!spot) return 'Không tìm được chỗ đứng trong làng';
    player.x = spot.x; player.y = spot.y;
    return 'Đã dịch chuyển tới làng';
  }

  function tpMarket() {
    const rx = Math.floor(player.x / TILE / REG), ry = Math.floor(player.y / TILE / REG);
    let best = null, bd = Infinity;
    for (let j = -8; j <= 8; j++) {
      for (let i = -8; i <= 8; i++) {
        const c = villageCenterForRegion(rx + i, ry + j);
        const m = c && marketSiteFor(c.cx, c.cy);
        if (!m) continue;
        const d = Math.hypot(m.mx * TILE - player.x, m.my * TILE - player.y);
        if (d < bd) { bd = d; best = m; }
      }
    }
    if (!best) return 'Không tìm thấy chợ nào gần đây';
    const spot = freeSpotNear(best.mx, best.my, 8);
    if (!spot) return 'Không tìm được chỗ đứng trong chợ';
    player.x = spot.x; player.y = spot.y;
    return 'Đã dịch chuyển tới chợ';
  }

  function tpSwamp() {
    const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE);
    for (let r = 4; r <= 420; r += 3) { // quét các vòng vuông rộng dần, lấy mảng đầm lầy gần nhất
      for (let k = -r; k <= r; k += 3) {
        for (const [dx, dy] of [[k, -r], [k, r], [-r, k], [r, k]]) {
          if (swampType(px + dx, py + dy) !== 1) continue;
          const spot = freeSpotNear(px + dx, py + dy, 3);
          if (spot) { player.x = spot.x; player.y = spot.y; return 'Đã dịch chuyển tới khu đầm lầy'; }
        }
      }
    }
    return 'Không tìm thấy khu đầm lầy gần đây';
  }

  function tpBoss() { // tới boss Cá Sấu Đầm Lầy gần nhất
    const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE);
    const cx0 = Math.floor(px / BOSS_CELL), cy0 = Math.floor(py / BOSS_CELL);
    let best = null, bd = Infinity;
    for (let r = 0; r <= 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const sp = bossSpot(cx0 + dx, cy0 + dy);
          if (!sp) continue;
          const d = Math.hypot(sp.tx - px, sp.ty - py);
          if (d < bd) { bd = d; best = sp; }
        }
      }
      if (best && r * BOSS_CELL > bd) break;
    }
    if (!best) return 'Không tìm thấy boss nào gần đây';
    bossDeaths.delete(best.key);
    const spot = freeSpotNear(best.tx - 7, best.ty, 4);
    if (!spot) return 'Không tìm được chỗ đứng gần boss';
    player.x = spot.x; player.y = spot.y;
    return 'Đã dịch chuyển tới Cá Sấu Đầm Lầy (cách ' + Math.round(bd) + ' ô)';
  }

  function tpGate() { // Cổng Ma Vương nằm DƯỚI HẦM: ở mặt đất thì tự xuống hầm, đang dưới hầm thì dịch chuyển thẳng tới cổng gần nhất
    if (layer === 2 || layer === 3) return 'Hãy ra ngoài (hoặc ra khỏi đấu trường) rồi dịch chuyển';
    const from = layer;
    if (from !== 1) switchLayer(1);
    const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE), R = GATE.cell * 2;
    let best = null, bd = Infinity;
    for (const g of gatesIn(px - R, py - R, px + R, py + R)) {
      const d = Math.hypot(g.tx - px, g.ty - py);
      if (d < bd) { bd = d; best = g; }
    }
    if (!best) { if (from !== 1) switchLayer(from); return 'Không tìm thấy Cổng Ma Vương nào gần đây'; }
    const c = tileCenter(best.tx, best.ty + 2); // chỗ đứng trống ngay trước cổng (gateTile), nhấn E để vào đấu trường
    player.x = c.x; player.y = c.y;
    player.invuln = Math.max(player.invuln || 0, 1);
    return 'Đã dịch chuyển tới Cổng Ma Vương dưới hầm (cách ' + Math.round(bd) + ' ô), nhấn E trước cổng để vào';
  }

  function tpElder() { // tới Cây Cổ Thụ gần nhất (chỉ ở mặt đất)
    const cx0 = Math.floor(player.x / TILE / ELDER.cell), cy0 = Math.floor(player.y / TILE / ELDER.cell);
    const px = player.x / TILE, py = player.y / TILE;
    let best = null, bd = Infinity;
    for (let cy = cy0 - 8; cy <= cy0 + 8; cy++) {
      for (let cx = cx0 - 8; cx <= cx0 + 8; cx++) {
        const el = elderForCell(cx, cy);
        if (!el) continue;
        const d = Math.hypot(el.tx - px, el.ty - py);
        if (d < bd) { bd = d; best = el; }
      }
    }
    if (!best) return 'Không tìm thấy Cây Cổ Thụ nào gần đây';
    if (!elderOpen()) world.dayT = 0.5; // cây chỉ hiện ban đêm: tự chuyển sang đêm
    const spot = freeSpotNear(best.tx, best.ty + 2, 4);
    if (!spot) return 'Không tìm được chỗ đứng gần Cây Cổ Thụ';
    player.x = spot.x; player.y = spot.y;
    return 'Đã dịch chuyển tới Cây Cổ Thụ (cách ' + Math.round(bd) + ' ô), nhấn E để nói chuyện';
  }

  function tpWitch() { // tới Nhà Phù Thủy gần nhất (chỉ ở mặt đất)
    const cx0 = Math.floor(player.x / TILE / WITCH.cell), cy0 = Math.floor(player.y / TILE / WITCH.cell);
    const px = player.x / TILE, py = player.y / TILE;
    let best = null, bd = Infinity;
    for (let cy = cy0 - 8; cy <= cy0 + 8; cy++) for (let cx = cx0 - 8; cx <= cx0 + 8; cx++) {
      const w = witchForCell(cx, cy);
      if (w && Math.hypot(w.tx - px, w.ty - py) < bd) { bd = Math.hypot(w.tx - px, w.ty - py); best = w; }
    }
    if (!best) return 'Không tìm thấy Nhà Phù Thủy nào gần đây';
    const spot = freeSpotNear(best.tx, best.ty + 3, 4);
    if (!spot) return 'Không tìm được chỗ đứng gần Nhà Phù Thủy';
    player.x = spot.x; player.y = spot.y;
    return 'Đã dịch chuyển tới Nhà Phù Thủy (cách ' + Math.round(bd) + ' ô), nhấn E để nói chuyện';
  }

  function tpVolcano(ice = false) { // tới đảo núi lửa (hoặc đảo băng) gần nhất (chỉ ở mặt đất): đứng ngay ngoài lối vào vòng đá ngoài
    const near = nearestVolcano(player.x / TILE, player.y / TILE, ice);
    if (!near) return ice ? 'Không tìm thấy đảo băng nào gần đây' : 'Không tìm thấy đảo núi lửa nào gần đây';
    const spot = volcanoLanding(near.v);
    if (!spot) return 'Không tìm được chỗ đứng trên đảo';
    player.x = spot.x; player.y = spot.y;
    return 'Đã dịch chuyển tới ' + (ice ? 'đảo băng' : 'đảo núi lửa') + ' (cách ' + Math.round(near.dist) + ' ô)';
  }

  function tpVolcanoBoss(ice = false) { // tới hang Chúa Tể Dung Nham của đảo núi lửa gần nhất (chỉ ở mặt đất), boss hồi sinh sẵn
    if (!window.VolcBoss) return 'Chưa tải volcano-boss.js';
    const near = nearestVolcano(player.x / TILE, player.y / TILE, ice);
    if (!near) return ice ? 'Không tìm thấy đảo băng nào gần đây' : 'Không tìm thấy đảo núi lửa nào gần đây';
    const lair = VolcBoss.lairOf(near.v);
    if (!lair) return 'Không tìm thấy hang boss';
    bossDeaths.delete(lair.key); // boss đã bị hạ thì cho hồi sinh ngay
    const spot = freeSpotNear(lair.tx - 8, lair.ty, 4);
    if (!spot) return 'Không tìm được chỗ đứng gần hang boss';
    player.x = spot.x; player.y = spot.y;
    player.invuln = Math.max(player.invuln || 0, 1);
    return 'Đã dịch chuyển tới hang ' + VolcBoss.nameOf({ ice }) + ' (cách ' + Math.round(near.dist) + ' ô)';
  }

  function tpGolem() { // xuống hầm, tới hang Quái Vật Hầm Mỏ gần nhất
    if (layer === 2) return 'Hãy ra ngoài trời rồi dịch chuyển';
    const px = Math.floor(player.x / TILE), py = Math.floor(player.y / TILE);
    const cx0 = Math.floor(px / GOLEM_CELL), cy0 = Math.floor(py / GOLEM_CELL);
    let best = null, bd = Infinity;
    for (let r = 0; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const L = mineLair(cx0 + dx, cy0 + dy);
          if (!L) continue;
          const d = Math.hypot(L.tx - px, L.ty - py);
          if (d < bd) { bd = d; best = L; }
        }
      }
      if (best && r * GOLEM_CELL > bd) break;
    }
    if (!best) return 'Không tìm thấy hang boss nào gần đây';
    if (layer !== 1) switchLayer(1);
    bossDeaths.delete(best.key);
    const c = tileCenter(best.tx - 6, best.ty);
    player.x = c.x; player.y = c.y;
    return 'Đã xuống hầm, tới hang Quái Vật Hầm Mỏ (cách ' + Math.round(bd) + ' ô)';
  }

  // ---- Chế độ sáng tạo: bất tử, không đói, dụng cụ không mòn, đào/chặt/chém một nhát; đồ lấy từ bảng chọn trong túi đồ ----
  let creative = false, creativeTimer = null, savedDmg = null;
  function creativeTick() {
    if (deathScreen) return;
    player.hp = MAX_HP; player.hpGhost = MAX_HP; player.hunger = MAX_HUNGER; player.invuln = Math.max(player.invuln || 0, 1);
    // Không nhồi đồ vào túi nữa: muốn món nào thì mở túi đồ (B / C) và chọn trong bảng "Chế độ sáng tạo" (chia theo mục)
    for (const id of ['axe', 'pickaxe', 'hoe', 'sword']) if (tools[id] > 0) toolDur[id] = TOOL_DUR[tools[id]]; // dụng cụ đang có không mòn
    canUses = WATERCAN_USES;
  }
  function setCreative(on) {
    if (on === creative) return;
    creative = on;
    window.CREATIVE_ON = on; // survival.js dựa vào cờ này để hiện bảng chọn đồ trong túi đồ
    if (on) {
      savedDmg = { tool: TOOL_DMG.slice(), weapon: JSON.parse(JSON.stringify(WEAPON_DMG)) };
      for (let i = 0; i < TOOL_DMG.length; i++) TOOL_DMG[i] = 9999;
      for (const k in WEAPON_DMG) for (let i = 0; i < WEAPON_DMG[k].length; i++) WEAPON_DMG[k][i] = 9999;
      creativeTick();
      creativeTimer = setInterval(creativeTick, 100);
    } else {
      clearInterval(creativeTimer);
      for (let i = 0; i < TOOL_DMG.length; i++) TOOL_DMG[i] = savedDmg.tool[i];
      for (const k in WEAPON_DMG) for (let i = 0; i < WEAPON_DMG[k].length; i++) WEAPON_DMG[k][i] = savedDmg.weapon[k][i];
    }
  }

  const HELP = [
    '/survival  ·  về chế độ sinh tồn (tắt sáng tạo)',
    '/creative  ·  bật/tắt chế độ sáng tạo (bất tử, không đói, đào/chém 1 nhát; mở túi đồ để chọn đồ theo mục)',
    '/give diamondarmor (full giáp kim cương)  ·  /give kimcuong <n> = lấy n viên  ·  /give armor  ·  /give trangbi (full rìu cuốc kiếm sắt)',
    '/give thanhmana (mở thanh Mana, hồi đầy)  ·  /give farm (cuốc đất + hạt giống)  ·  /grow (làm chín hết cây trồng)',
    '/give go 50  ·  /give sat 20  ·  /give <tên đồ> [số lượng]  ·  /list xem mã đồ',
    '/tp village  ·  /tp cho (chợ gần nhất)  ·  /tp damlay  ·  /tp boss (tới Cá Sấu Đầm Lầy)  ·  /tp bossnuilua (tới hang Chúa Tể Dung Nham)  ·  /tp golem (xuống hầm, tới Quái Vật Hầm Mỏ)  ·  /tp cong (Cổng Ma Vương, dùng được cả dưới hầm)  ·  /tp caycothu (Cây Cổ Thụ)  ·  /tp phuthuy (Nhà Phù Thủy)  ·  /tp nuilua (đảo núi lửa)  ·  /tp bangdao (đảo băng)  ·  /tp bossbang (hang Chúa Tể Băng Giá)',
    '/skip nv (bỏ qua nhiệm vụ Cây Cổ Thụ đang làm)  ·  /skip nv all (xong hết → mở Mana + Nhà Phù Thủy)',
    '/skip 3 (bỏ qua 3 nhiệm vụ nhỏ của vòng Sách Hệ → nhận ngay 1 sách ngẫu nhiên)',
    '/skills (mở khoá cả 10 hệ + học FULL mọi chiêu, bỏ qua điều kiện)  ·  /skills dark (chỉ một hệ)',
    '/unlock all (mở khoá cả 10 Sách Hệ)  ·  /unlock fire (một hệ: fire ice lightning poison earth wind holy dark nature arcane)',
    '/heal  ·  /food  ·  /mana (bật/tắt Mana vô hạn)',
    '/time set day|night|clear',
    '/phun (phun trào ngay, phải ở gần đảo)  ·  /skip (không kèm gì: tua đồng hồ núi lửa tới 4:50)  ·  /slime [n] (gọi n Slime Lửa cạnh người; ở đảo băng thì gọi Sói Băng)',
    '/spam zombie [v1|v2] [số lượng] (gọi zombie thường / Zombie Điện)  ·  /mua samset (mưa giông, sét liên tục)  ·  /mua tat (tạnh mưa)',
    '/kill (diệt quái)  ·  /plant 1|2|3 (gọi thực vật)',
  ].join('\n');

  function run(line) {
    const parts = line.trim().replace(/^[\/`]+/, '').split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    const cmd = norm(parts[0]), rest = parts.slice(1);
    switch (cmd) {
      case 'help': case 'lenh': case '?': return HELP;
      case 'list': case 'ds': return 'Mã vật phẩm: ' + Object.keys(inv).map((id) => id + ' (' + itemName(id) + ')').join(', ');
      case 'creative': case 'sangtao': case 'cr': {
        const w = norm(rest[0] || '');
        setCreative(w === 'on' || w === 'bat' ? true : w === 'off' || w === 'tat' ? false : !creative);
        return creative ? 'Chế độ sáng tạo: BẬT (bất tử, không đói, đào/chém 1 nhát). Mở túi đồ (B / C) để chọn đồ theo mục' : 'Chế độ sáng tạo: TẮT (đồ đang có giữ nguyên)';
      }
      case 'survival': case 'sinhton': case 'sv': case 's':
        if (!creative) return 'Bạn đang ở chế độ sinh tồn rồi';
        setCreative(false);
        return 'Chế độ sinh tồn: đã tắt sáng tạo (đồ đang có giữ nguyên)';
      case 'phun': case 'eruption': return window.Magma ? Magma.trigger() : 'Chưa tải magma.js';
      case 'slime': { if (!window.Magma) return 'Chưa tải magma.js'; const nv = nearestVolcano(player.x / TILE, player.y / TILE), ice = !!(nv && nv.dist < 60 && nv.v.ice); return 'Đã gọi ' + Magma.spawnNear(Math.max(1, Math.min(20, num(rest[0], 1)))) + (ice ? ' Sói Băng' : ' Slime Lửa'); }
      case 'bossnuilua': case 'bossvolcano': return window.VolcBoss ? VolcBoss.spawnNear(false) : 'Chưa tải volcano-boss.js';
      case 'bossbang': case 'bossice': return window.VolcBoss ? VolcBoss.spawnNear(true) : 'Chưa tải volcano-boss.js';
      case 'bossrong': case 'bosscuoi': case 'finalboss': return window.FinalBoss ? FinalBoss.cheatEnter() : 'Chưa tải final-boss.js';
      case 'hoisinhrong': case 'revive': return window.FinalBoss ? FinalBoss.cheatRevive() : 'Chưa tải final-boss.js'; // rồng đã chết: thử đặt hoá thạch + rắc thuốc
      case 'bossrong2': case 'thuctinh': case 'bossrongv2': return window.FinalBoss ? FinalBoss.cheatEnter(true) : 'Chưa tải final-boss.js'; // vào thẳng dạng Thức Tỉnh
      case 'heal': player.hp = MAX_HP; player.hpGhost = MAX_HP; return 'Đã hồi đầy máu';
      case 'food': player.hunger = MAX_HUNGER; return 'Đã hồi đầy đồ ăn';
      case 'grow': return growAll();
      case 'skip': case 'boqua': {
        if (!rest[0] && window.Magma) return Magma.skip(); // /skip trơn: tua đồng hồ núi lửa tới 4:50 (magma.js)
        const w = norm(rest[0] || '');
        if (w === '3' || w === 'sach' || w === 'book' || w === 'vong') return window.Dwarf ? Dwarf.skipRound() : 'Chưa tải Chú Lùn';
        if (w && w !== 'nv' && w !== 'nhiemvu' && w !== 'quest') return 'Dùng: /skip nv (bỏ qua 1 nhiệm vụ)  ·  /skip nv all (xong hết)  ·  /skip 3 (3 nhiệm vụ nhỏ)';
        return skipQuest(norm(rest[1] || '') === 'all' || norm(rest[1] || '') === 'het' || norm(rest[0] || '') === 'all');
      }
      case 'unlock': case 'mokhoa': { // /unlock [all|<hệ>]: nhận + mở khoá Sách Hệ (kiểm tra nhanh)
        if (!window.ElementPick) return 'Chưa tải bảng hệ phép';
        const q = norm(rest[0] || 'all');
        const list = ElementPick.ELEMENTS.filter((e) => q === 'all' || norm(e.id) === q || norm(e.name).includes(q));
        if (!list.length) return 'Không có hệ "' + rest[0] + '" (mã: ' + ElementPick.ELEMENTS.map((e) => e.id).join(', ') + ')';
        witchSt.book = true;
        list.forEach((e) => { witchSt.owned[e.id] = true; witchSt.unlocked[e.id] = true; });
        return 'Đã mở khoá: ' + list.map((e) => e.name).join(', ');
      }
      case 'skills': case 'fullchieu': case 'hocfull': case 'learn': { // /skills [all|<hệ>]: mở khoá hệ + học luôn mọi chiêu (không cần điều kiện), kèm mở Mana / Nhà Phù Thủy
        if (!window.ElementPick) return 'Chưa tải bảng hệ phép';
        const q = norm(rest[0] || 'all');
        const els = ElementPick.ELEMENTS.filter((e) => q === 'all' || norm(e.id) === q || norm(e.name).includes(q));
        if (!els.length) return 'Không có hệ "' + rest[0] + '" (mã: ' + ElementPick.ELEMENTS.map((e) => e.id).join(', ') + ')';
        if (!elderQuest.unlocked) giveMana();
        witchSt.book = true;
        let n = 0;
        els.forEach((e) => {
          witchSt.owned[e.id] = true; witchSt.unlocked[e.id] = true;
          for (const s of WITCH.skills) if (s.el === e.id && !witchSt.learned[s.id]) { witchSt.learned[s.id] = true; n++; }
        });
        return 'Đã mở khoá ' + els.map((e) => e.name).join(', ') + ' và học ' + n + ' chiêu mới (mở Sách Phép K để xem)';
      }
      case 'mana': case 'vohan': { // bật/tắt Mana vô hạn (tự mở thanh Mana nếu chưa có)
        const w = norm(rest[0] || '');
        infMana = w === 'on' || w === 'bat' ? true : w === 'off' || w === 'tat' ? false : !infMana;
        if (infMana) giveMana();
        return infMana ? 'Mana vô hạn: BẬT (gõ /mana để tắt)' : 'Mana vô hạn: TẮT';
      }
      case 'thienthach': case 'meteor': { // gọi ngay một thiên thạch rơi gần người chơi
        return spawnMeteor() ? 'Thiên thạch đang rơi gần bạn!' : 'Không tìm được chỗ rơi, thử lại';
      }
      case 'give': {
        const w = norm(rest[0] || '');
        if (['armor', 'ammor', 'giap'].includes(w)) return giveArmor();
        if (['diamondarmor', 'giapkimcuong'].includes(w) && !rest[1]) return giveDiamondArmor();
        if (['trangbi', 'tool', 'tools', 'dungcu'].includes(w)) return giveTools();
        if (['thanhmana', 'mana'].includes(w)) return giveMana();
        if (['farm', 'trongtrot', 'nongtrai', 'hatgiong'].includes(w)) return giveFarm();
        const id = findItem(rest[0] || '');
        if (id) return give(id, num(rest[1], 1));
        return 'Không có vật phẩm "' + (rest[0] || '') + '" (gõ /list để xem mã)';
      }
      case 'tp': {
        const w = norm(rest[0] || '');
        if (w === 'golem' || w === 'hamgo' || w === 'hammo') return tpGolem();
        if (w === 'cong' || w === 'gate') return tpGate(); // cổng ở dưới hầm nên cho dùng cả dưới hầm
        if (layer !== 0) return 'Hãy ra ngoài trời rồi dịch chuyển';
        if (w === 'village' || w === 'lang') return tpVillage();
        if (w === 'cho' || w === 'market') return tpMarket();
        if (w === 'damlay' || w === 'swamp') return tpSwamp();
        if (w === 'boss') return tpBoss();
        if (w === 'bossnuilua' || w === 'bossvolcano' || w === 'chuato') return tpVolcanoBoss(false);
        if (w === 'phuthuy' || w === 'witch' || w === 'nhaphuthuy') return tpWitch();
        if (w === 'nuilua' || w === 'volcano' || w === 'daonuilua') return tpVolcano(false);
        if (w === 'bangdao' || w === 'daobang' || w === 'ice') return tpVolcano(true);
        if (w === 'bossbang' || w === 'chuabang') return tpVolcanoBoss(true);
        if (w === 'caycothu' || w === 'cothu' || w === 'elder' || w === 'cay') return tpElder();
        return 'Dùng: /tp village, /tp cho, /tp damlay, /tp boss, /tp bossnuilua, /tp golem, /tp cong, /tp caycothu, /tp phuthuy, /tp nuilua, /tp bangdao hoặc /tp bossbang';
      }
      case 'time': {
        const w = norm(rest[0] === 'set' ? rest[1] || '' : rest[0] || '');
        if (w === 'day') { world.dayT = 0; return 'Trời sáng'; }
        if (w === 'night') { world.dayT = 0.5; return 'Trời tối'; }
        if (w === 'clear') {
          const r = world.rain;
          r.active = false; r.storm = false; r.timeLeft = 0; r.intensity = 0; r.nextCheck = 120;
          return 'Trời trong lành';
        }
        return 'Dùng: /time set day | night | clear';
      }
      case 'spam': case 'spawn': case 'goi': { // /spam zombie [v1|v2|1-6] [số lượng]: v1 = zombie thường, v2 = Zombie Điện
        if (norm(rest[0] || '') !== 'zombie') return 'Dùng: /spam zombie [v1|v2] [số lượng]  (v1 = zombie thường, v2 = Zombie Điện)';
        if (layer !== 0) return 'Chỉ gọi zombie được ở ngoài mặt đất';
        let type = 0, count = 1;
        for (const a of rest.slice(1)) {
          const w = norm(a);
          if (w === 'v1') type = 1; else if (w === 'v2' || w === 'dien' || w === 'dienv2') type = 6;
          else if (/^[1-6]$/.test(w)) type = +w;
          else if (/^\d+$/.test(w)) count = Math.max(1, Math.min(30, +w));
        }
        for (let i = 0; i < count; i++) {
          const ang = Math.random() * Math.PI * 2, d = 140 + Math.random() * 120;
          const c = freeSpotNear(Math.floor((player.x + Math.cos(ang) * d) / TILE), Math.floor((player.y + Math.sin(ang) * d) / TILE), 4);
          if (!c) continue;
          const z = createZombie(type || randomZombieType(), c.x, c.y);
          z.aggro = true; z.noDrop = false;
        }
        return 'Đã gọi ' + count + ' ' + (type === 6 ? 'Zombie Điện (V2)' : type === 1 ? 'zombie thường (V1)' : 'zombie');
      }
      case 'mua': case 'samset': case 'giongbao': case 'storm': { // /mua samset [tắt]: gọi mưa giông có sét ngay (kèm "tat"/"off" để tạnh)
        const off = rest.some((w) => ['tat', 'off', 'tanh'].includes(norm(w)));
        const r = world.rain;
        if (off) { r.active = false; r.storm = false; r.timeLeft = 0; r.intensity = 0; r.nextCheck = 120; return 'Đã tạnh mưa'; }
        r.active = true; r.storm = true; r.timeLeft = 180; r.intensity = Math.max(r.intensity, 0.8); r.nextStrike = 1;
        return 'Đã gọi mưa sấm sét (3 phút). Sét sẽ đánh liên tục, tránh vòng đỏ! (/mua tat để tạnh)';
      }
      case 'kill': {
        let n = 0;
        for (const z of zombies.slice()) {
          if (z.dead || z.guard || Math.hypot(z.x - player.x, z.y - player.y) > 1400) continue;
          z.noDrop = true; killZombie(z); n++;
        }
        return 'Đã diệt ' + n + ' quái';
      }
      case 'plant': {
        if (layer !== 0) return 'Chỉ gọi được ở ngoài trời';
        const k = Math.max(1, Math.min(3, num(rest[0], 1)));
        createPlant(k, player.x + 110, player.y, 'cmd' + Date.now());
        return 'Đã gọi ' + PTYPES[k].name;
      }
      default: { // gõ thẳng tên đồ: "wood 50", "sắt 20"
        const last = num(parts[parts.length - 1], null);
        const name = (last === null ? parts : parts.slice(0, -1)).join(' ');
        const id = findItem(name);
        if (id) return give(id, last === null ? 1 : last);
        const kk = norm(name);
        const many = kk ? Object.keys(inv).filter((i) => i.includes(kk) || norm(itemName(i)).includes(kk)) : [];
        if (many.length > 1) return 'Có nhiều vật phẩm khớp, gõ rõ mã: ' + many.map((i) => i + ' (' + itemName(i) + ')').join(', ');
        return 'Lệnh không hợp lệ. Gõ /help để xem danh sách lệnh';
      }
    }
  }
  window.CHEAT_RUN = run; // để thử lệnh từ bảng điều khiển trình duyệt

  function ensure() {
    if (box) return;
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);width:min(640px,92vw);z-index:50;display:none;font:14px/1.4 monospace;';
    logEl = document.createElement('pre');
    logEl.style.cssText = 'margin:0 0 6px;padding:8px 10px;background:rgba(0,0,0,.72);color:#9be34a;border-radius:6px;white-space:pre-wrap;max-height:40vh;overflow:auto;display:none;';
    input = document.createElement('input');
    input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
    input.placeholder = 'Gõ lệnh (/help) · Enter chạy · Esc đóng';
    input.style.cssText = 'box-sizing:border-box;width:100%;padding:9px 12px;background:rgba(10,14,8,.9);color:#fff;border:2px solid #6aa83a;border-radius:6px;font:inherit;outline:none;';
    box.append(logEl, input);
    document.body.appendChild(box);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowUp' && hist.length) { hi = Math.max(0, hi - 1); input.value = hist[hi]; e.preventDefault(); return; }
      if (e.key === 'ArrowDown' && hist.length) { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || '/'; e.preventDefault(); return; }
      if (e.key !== 'Enter') return;
      const line = input.value.trim();
      input.value = '/';
      if (line.replace(/^\/+/, '') === '') return;
      if (hist[hist.length - 1] !== line) hist.push(line);
      hi = hist.length;
      let out;
      try { out = run(line); } catch (err) { out = 'Lỗi lệnh: ' + err.message; }
      if (out) { logEl.textContent = '> ' + line + '\n' + out; logEl.style.display = 'block'; }
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
  }

  function open() {
    ensure();
    window.CHEAT_OPEN = true;
    for (const k in keys) keys[k] = false; // thả hết phím đang giữ
    box.style.display = 'block';
    input.value = '/';
    setTimeout(() => { input.focus(); input.setSelectionRange(1, 1); }, 0);
  }
  function close() {
    window.CHEAT_OPEN = false;
    if (box) { box.style.display = 'none'; logEl.style.display = 'none'; input.blur(); }
  }

  window.addEventListener('keydown', (e) => {
    if (window.CHEAT_OPEN || deathScreen || ui) return;
    if (e.code === 'Slash' || e.code === 'Backquote') { e.preventDefault(); open(); }
  });
})();
