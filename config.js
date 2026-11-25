// ============================================================================
//  config.js: TOÀN BỘ SỐ LIỆU CÂN BẰNG GAME NẰM Ở ĐÂY. Muốn chỉnh độ khó, sửa tại file này rồi tải lại trang.
//  (File này phải được nạp TRƯỚC survival.js, xem survival.html.)
//  Đơn vị: giây, pixel (1 ô = 48 pixel), hoặc tỉ lệ 0..1 nếu có ghi chú.
// ============================================================================
const BALANCE = {
  // ---- Người chơi ----
  player: {
    maxHp: 100,
    maxHunger: 100,
    hungerRate: 0.17,        // đói mỗi giây (~10 phút từ no tới đói hết, hợp với ngày game 15 phút)
    hungerRunMul: 1.6,       // chạy thì đói nhanh gấp từng này
    starveDps: 2,            // mất máu mỗi giây khi đói hết
    regenDelay: 6,           // giây không bị thương thì mới hồi máu
    regenMinHunger: 30,      // phải còn no hơn mức này mới hồi máu
    regenPerSec: 2,          // máu hồi mỗi giây
    potionHeal: 35,
    torchTime: 60,           // giây cháy của một cây đuốc
  },

  // ---- Cây Cổ Thụ (công trình hiếm; làm đủ nhiệm vụ để nhận thanh Mana) ----
  elder: {
    cell: 80,                // chia bản đồ thành ô vuông từng này ô đất; mỗi ô có tối đa một cây
    chance: 0.35,            // xác suất một ô lưới có cây (ô lưới chứa điểm xuất phát luôn có một cây ở gần, cách 28-44 ô)
    nightMin: 0.25,          // chỉ xuất hiện khi độ tối ngoài trời ≥ mức này (tối đa 0.72) = ban đêm
    discoverDist: 12,        // đi tới gần cây trong từng này ô thì báo đã tìm thấy (nhiệm vụ chỉ bắt đầu khi nhấn E nói chuyện với cây)
    talkDist: 5,             // đứng trong từng này ô thì nhấn E nói chuyện được
    drawTiles: 7,            // chiều rộng hình cây khi vẽ (tính bằng ô; hoạt ảnh 8 khung cao hơn ảnh cũ nên thu nhỏ chút)
    mana: { max: 200, regen: 5 }, // mana tối đa, hồi mỗi giây
    // 5 nhiệm vụ làm lần lượt. give: dâng vật phẩm cho cây (item, n) | kill: hạ n zombie / boss (what: 'zombie' | 'boss')
    quests: [
      { kind: 'give', item: 'wood',  n: 10, text: 'Dâng 10 gỗ' },
      { kind: 'give', item: 'stone', n: 8,  text: 'Dâng 8 đá' },
      { kind: 'kill', what: 'zombie', n: 8, text: 'Hạ 8 zombie' },
      { kind: 'give', item: 'iron',  n: 4,  text: 'Dâng 4 thỏi sắt' },
      { kind: 'kill', what: 'boss',  n: 1,  text: 'Hạ 1 boss' },
    ],
  },

  // ---- Chú Lùn Cổ Thụ (E ở Cây Cổ Thụ → vào phòng chú lùn; 5 nhiệm vụ nhận Mana, rồi mỗi vòng 3 nhiệm vụ nhận 1 Sách Hệ ngẫu nhiên; xem dwarf.js) ----
  dwarf: {
    bookHold: 6,             // giây nhân vật cầm Sách Hệ sau khi bấm phím phép / chọn hệ (bookhold.js); đặt rất lớn = luôn cầm sách
  },

  // ---- Nhà Phù Thủy (nói chuyện nhận Sách Phép; có Mana thì học phép, sách ghi lại) ----
  witch: {
    cell: 90,                // chia bản đồ thành ô vuông từng này ô đất; mỗi ô có tối đa một nhà (ô lưới chứa điểm xuất phát luôn có một nhà ở gần, cách 18-30 ô)
    chance: 0.3,             // xác suất một ô lưới có nhà
    talkDist: 5,             // đứng trong từng này ô thì nhấn E nói chuyện được
    drawTiles: 6.5,          // chiều rộng hình nhà khi vẽ (tính bằng ô)
    fps: 6,                  // tốc độ hoạt ảnh 20 khung
    lotusSulfur: 10,         // số lưu huỳnh đổi 1 Hoa Sen Lửa ở sạp Tạp Hoá ngoài chợ (hoa dùng để mở khoá phép Hỏa Cầu)
    // Phép: học ở Phù Thủy, cần đã mở Mana; dùng bằng phím tắt. Cách học:
    //   cost   = trả ngọc lục bảo | unlock = nộp vật phẩm {item, n} (không tốn ngọc) | soon = chưa mở khoá được
    skills: [
      // Hệ Lửa (el: 'fire'): nhấn Q (hoặc bấm thẻ trong Sách Phép) để chuyển sang hệ Lửa, lúc đó Z X C V là phép lửa
      { id: 'fireball', el: 'fire', name: 'Hỏa Cầu',   key: 'Z', mana: 15, unlock: { item: 'firelotus', n: 1 }, cd: 2, dmg: 14,  speed: 540, range: 560, splash: 46, desc: 'Phóng cầu lửa theo hướng chuột, nổ nhỏ khi trúng' },
      { id: 'nova',     el: 'fire', name: 'Bạo Viêm',  key: 'X', mana: 35, unlock: { item: 'tome_fire', n: 1 }, cd: 5,   dmg: 28,  radius: 110,                   desc: 'Bùng nổ lửa quanh người, đẩy lùi và thiêu quái xung quanh' },
      { id: 'meteor',   el: 'fire', name: 'Thiên Thạch', key: 'C', mana: 50, unlock: { item: 'magma', n: 20 }, cd: 7, dmg: 36, radius: 80, delay: 0.9, reach: 460, desc: 'Gọi thiên thạch rơi xuống chỗ trỏ chuột sau gần 1 giây' },
      { id: 'dragon',   el: 'fire', name: 'Hỏa Long',  key: 'V', mana: 60, unlock: { item: 'firescroll', n: 1 }, cd: 20,  dmg: 35, radius: 85, speed: 300, turn: 4.2, follow: 5, zoneTime: 4, zoneRadius: 70, zoneDmg: 4, zoneTick: 0.5, zoneOnTimeout: false, desc: 'Rồng lửa bay theo chuột 5 giây rồi tự nổ; trúng quái thì nổ và để lại vùng lửa 4 giây' },
      // Hệ Băng (el: 'ice'): nhấn Q để chuyển sang hệ Băng, lúc đó Z X C V là phép băng. slow = giây làm chậm, slowMul = hệ số tốc độ khi chậm, freeze = giây đóng băng (boss miễn nhiễm)
      { id: 'iceshard',  el: 'ice', name: 'Băng Tiễn', key: 'Z', mana: 15, unlock: { item: 'tome_ice', n: 1 }, cd: 2, dmg: 10,  speed: 600, range: 600, splash: 42, slow: 2.5, slowMul: 0.4, desc: 'Phóng mũi băng theo hướng chuột, trúng quái thì làm chậm' },
      { id: 'frostfield', el: 'ice', name: 'Hàn Vực', key: 'X', mana: 40, unlock: { item: 'icecrystal', n: 20 }, cd: 5, dmg: 16, radius: 130, delay: 0.6, freeze: 2, fieldTime: 4, tick: 0.5, zoneDmg: 2, slow: 0.8, slowMul: 0.4, desc: 'Khống chế: trận băng quanh người, gai băng trồi lên đóng băng quái 2 giây rồi để lại vùng giá lạnh làm chậm' },
      { id: 'icemirror', el: 'ice', name: 'Băng Kính', key: 'C', mana: 35, unlock: { flag: 'iceUse', text: 'Dùng chiêu Z (Băng Tiễn) 5 lần và chiêu X (Hàn Vực) 5 lần' }, cd: 7, dur: 7, cut: 0.7, desc: 'Phòng thủ: tấm khiên pha lê băng giảm 70% sát thương nhận trong 7 giây' },
      { id: 'blizzard',  el: 'ice', name: 'Bão Tuyết', key: 'V', mana: 60, unlock: { item: 'frostscroll', n: 1 }, cd: 20,  dmg: 6,  radius: 120, reach: 420, time: 6, tick: 0.4, slow: 0.8, slowMul: 0.35, desc: 'Gọi bão tuyết tại chỗ trỏ chuột 6 giây, liên tục gây sát thương và làm chậm' },
      // Hệ Không Gian (el: 'arcane'): Z X C V là phép không gian. Đơn vị range / radius / reach là số Ô (tile). window = số giây được chọn điểm đến trên bản đồ
      { id: 'blink',        el: 'arcane', name: 'Ảnh Bộ',   key: 'Z', mana: 15, cost: 8,  unlock: { item: 'icecrystal', n: 1, item2: 'magma', n2: 1 }, cd: 2,  range: 5, inv: 0.2, desc: 'Dịch chuyển nhanh về hướng con trỏ tối đa 5 ô, không xuyên tường, bất tử ngắn' },
      { id: 'riftslash',    el: 'arcane', name: 'Không Nhận', key: 'X', mana: 30, cost: 12, unlock: { flag: 'meleeKill', text: 'Hạ 10 zombie bằng đòn đánh gần (tay không hoặc kiếm)' }, cd: 5,  dmg: 14, speed: 620, range: 6, width: 26, pierce: 3, autoAim: true, desc: 'Tự ngắm quái gần nhất, phóng vết chém không gian 6 ô, xuyên tối đa 3 mục tiêu' },
      { id: 'voidcollapse', el: 'arcane', name: 'Hư Không',  key: 'C', mana: 45, cost: 18, unlock: { item: 'spaceclock', n: 1 }, cd: 7,  dmg: 28, radius: 3, reach: 7, time: 2, pull: 130, desc: 'Mở hố đen tại chỗ trỏ chuột 2 giây hút quái vào tâm rồi nổ (boss chỉ bị kéo nhẹ)' },
      { id: 'dimension',    el: 'arcane', name: 'Chúa Tể Không Gian', key: 'V', mana: 70, cost: 25, unlock: { flag: 'walkKill', text: 'Đi bộ 1000 mét (1 ô = 1 mét, dịch chuyển không tính)' }, cd: 20, range: 50, window: 4, chargeTime: 0.5, desc: 'Tự mở bản đồ, chọn nơi muốn tới trong 50 ô (trong 4 giây) để dịch chuyển, bất tử trong lúc thi triển' },
      // 6 hệ mới (more-magic.js): Z X C V là phép của hệ đang chọn. Đơn vị range / radius / reach là số Ô; dur / time / delay / cd là giây.
      // Hệ Sét (el: 'lightning')
      { id: 'thunderbolt', el: 'lightning', name: 'Lôi Kích',  key: 'Z', mana: 15, unlock: { flag: 'struck', text: 'Bị sét đánh trúng người 1 lần' }, cd: 2,  dmg: 10,  speed: 900, range: 6, width: 20, pierce: 2, autoAim: true, desc: 'Tự ngắm quái gần nhất trong tầm (không có thì bắn theo chuột), phóng tia sét xuyên tối đa 2 mục tiêu' },
      { id: 'skystrike',   el: 'lightning', name: 'Thiên Lôi', key: 'X', mana: 35, unlock: { flag: 'drodStruck', text: 'Đặt Cột Thu Lôi Tím (Chợ Đen) và để sét đánh vào cột 1 lần' }, cd: 5,  dmg: 28, radius: 1.5, reach: 7, delay: 0.5, stun: 0.4, desc: 'Đánh dấu chỗ trỏ chuột, sau 0,5 giây sét giáng xuống nổ điện và làm choáng quái' },
      { id: 'thunderstep', el: 'lightning', name: 'Lôi Bộ',    key: 'C', mana: 25, cost: 18, unlock: { flag: 'strikeDodge', text: 'Né thoát vùng sét đánh 3 lần (đang đứng trong vòng cảnh báo rồi chạy ra trước khi sét giáng)' }, cd: 3,  dmg: 8,  range: 4, inv: 0.2, stun: 0.3, desc: 'Lướt nhanh 4 ô theo hướng chuột, bất tử ngắn, điện giật quái trên đường đi' },
      { id: 'thundergod',  el: 'lightning', name: 'Lôi Thần',  key: 'V', mana: 70, cost: 25, unlock: { flag: 'elecKill', text: 'Đánh bại 1 Zombie Điện (V2)' }, cd: 25, dmg: 80, radius: 3, reach: 6, delay: 0.9, stun: 1, desc: 'Cột sét khổng lồ giáng xuống trước mặt (tầm 6 ô), nổ rộng 3 ô, quái thường choáng 1 giây' },
      // Hệ Độc (el: 'poison'): Tấn Công · Khống Chế · Triệu Hồi · Chiêu Cuối. pzDmg = sát thương độc mỗi 0,5 giây · pzTime = giây nhiễm độc. (id giữ nguyên để save cũ không mất phép đã học)
      { id: 'poisonspit',  el: 'poison', name: 'Độc Tiễn',   key: 'Z', mana: 15, unlock: { item: 'antidote', n: 1 }, cd: 2,  dmg: 4,  speed: 640, range: 8, width: 16, arrows: 3, spread: 11, splash: 0.7, pzDmg: 2, pzTime: 3, desc: 'Tấn công: bắn loạt 3 mũi tên độc theo hướng chuột, trúng thì nổ gai độc và nhiễm độc 3 giây' },
      { id: 'poisonpool',  el: 'poison', name: 'Độc Vực',    key: 'X', mana: 35, cost: 12, unlock: { flag: 'spiderKill', text: 'Giết 10 con nhện' }, cd: 8,  dmg: 6,  radius: 2.6, reach: 6, time: 6, tick: 0.5, slow: 0.6, slowMul: 0.4, pzDmg: 2, desc: 'Khống chế: mở vực độc 6 giây tại chỗ trỏ chuột, quái trong vùng bị chậm mạnh, nhiễm độc và mất máu liên tục' },
      { id: 'poisonshield', el: 'poison', name: 'Độc Triệu',  key: 'C', mana: 40, cost: 18, unlock: { item: 'spiritjar', n: 1 }, cd: 15, dur: 12, dmg: 4, range: 6, rate: 1.1, pzDmg: 2, pzTime: 3, desc: 'Triệu hồi: gọi Độc Linh (đầu lâu độc) bay quanh bạn 12 giây, tự nhả đạn độc vào quái gần nhất' },
      { id: 'poisonburst', el: 'poison', name: 'Độc Chúa',   key: 'V', mana: 75, cost: 25, unlock: { flag: 'antidoteUse', text: 'Bị nhện cắn nhiễm độc rồi uống Thuốc Giải Độc để giải độc 5 lần' }, cd: 25, dmg: 35, radius: 3.6, reach: 7, delay: 1.1, pzDmg: 4, pzTime: 6, cloudTime: 4, desc: 'Chiêu cuối: Độc Chúa trồi lên tại chỗ trỏ chuột, sau 1,1 giây nổ cực mạnh, nhiễm độc nặng 6 giây và để lại vực độc' },
      // Hệ Đất (el: 'earth'). knock = lực đẩy lùi (boss gần như không bị đẩy)
      { id: 'earthpunch',  el: 'earth', name: 'Đấm Đất',   key: 'Z', mana: 15, cost: 8, unlock: { item: 'stone', n: 10 }, cd: 2,  dmg: 12,  range: 2, arc: 120, knock: 380, desc: 'Đấm xuống đất tạo bụi và mảnh đá, gây sát thương và đẩy lùi quái phía trước' },
      { id: 'stoneshield', el: 'earth', name: 'Khiên Đá',  key: 'X', mana: 30, cost: 12, unlock: { flag: 'stoneRing', text: 'Đặt khối đá kín 4 phía quanh người (trên, dưới, trái, phải)' }, cd: 6,  dur: 8, cut: 0.6, desc: 'Bọc đá quanh người, giảm 60% sát thương nhận trong 8 giây' },
      { id: 'quake',       el: 'earth', name: 'Địa Chấn',  key: 'C', mana: 45, cost: 18, unlock: { flag: 'stoneBlock', text: 'Dùng Khiên Đá chặn 5 đòn của quái' }, cd: 7,  dmg: 20, radius: 3, knock: 520, stun: 1, desc: 'Đập mạnh xuống đất, sóng chấn động quanh người đẩy lùi và làm choáng quái 1 giây' },
      { id: 'rockfall',    el: 'earth', name: 'Thác Đá',   key: 'V', mana: 65, cost: 25, unlock: { item: 'earthscroll', n: 1 }, cd: 20, dmg: 22,  radius: 3, reach: 7, rocks: 9, rockRadius: 0.9, stun: 0.5, time: 5, desc: 'Gọi mưa đá rơi liên tục 5 giây xuống khu vực trỏ chuột, mỗi tảng đều gây sát thương và làm choáng ngắn' },
      // Hệ Gió (el: 'wind'; không trùng phép hệ Thường id 'wind'). mult = hệ số tốc độ chạy
      { id: 'windpush',    el: 'wind', name: 'Phong Đẩy',  key: 'Z', mana: 15, cost: 8, unlock: { item: 'feather', n: 10 }, cd: 2,  dmg: 8,  range: 4, arc: 100, knock: 1500, desc: 'Tung luồng gió đẩy lùi kẻ địch trước mặt (tối đa 4 ô); boss gần như không bị đẩy' },
      { id: 'windblade',   el: 'wind', name: 'Phong Nhận', key: 'X', mana: 30, cost: 12, unlock: { item: 'fan', n: 1 }, cd: 5,  dmg: 14,  speed: 640, range: 6, width: 24, pierce: 3, knock: 600, desc: 'Phóng lưỡi gió theo hướng chuột, xuyên tối đa 3 mục tiêu và hất quái văng ra' },
      { id: 'tornado',     el: 'wind', name: 'Lốc Xoáy',   key: 'C', mana: 45, cost: 18, unlock: { flag: 'windKill', text: 'Dùng Phong Đẩy (Z) hạ gục 10 zombie' }, cd: 9,  dmg: 9,  radius: 3, reach: 7, time: 3, tick: 0.5, pull: 110, desc: 'Dựng lốc xoáy tại chỗ trỏ chuột 3 giây, hút và cuốn quái liên tục (boss chỉ bị kéo nhẹ)' },
      { id: 'windgod',     el: 'wind', name: 'Phong Thần', key: 'V', mana: 70, cost: 25, unlock: { item: 'windscroll', n: 1 }, cd: 20, dmg: 35, radius: 4, knock: 1900, dur: 5, mult: 1.6, desc: 'Bão gió bùng ra quanh người đẩy lùi quái trong 4 ô, rồi chạy nhanh hơn 60% trong 5 giây' },
      // Hệ Thánh Quang (el: 'holy'). heal / absorb = tỉ lệ máu tối đa
      { id: 'lightheal',   el: 'holy', name: 'Ánh Sáng Hồi Phục',     key: 'Z', mana: 20, cost: 8, unlock: { flag: 'potionUse', text: 'Dùng Thuốc Hồi Máu 5 lần' }, cd: 2,  heal: 0.18, desc: 'Tia sáng giáng xuống hồi 18% máu tối đa' },
      { id: 'purify',      el: 'holy', name: 'Thanh Tẩy',             key: 'X', mana: 25, cost: 12, unlock: { flag: 'nightKill', text: 'Hạ 15 zombie vào ban đêm' }, cd: 5,  heal: 0.08, dmg: 12, radius: 2.5, knock: 220, desc: 'Xóa chảy máu và cháy, hồi 8% máu, ánh sáng thiêu và đẩy lùi quái xung quanh' },
      { id: 'holyshield',  el: 'holy', name: 'Quang Giáp',            key: 'C', mana: 40, cost: 18, unlock: { item: 'diamond', n: 10 }, cd: 12, dur: 6, absorb: 0.2, desc: 'Khiên sáng hấp thụ sát thương bằng 20% máu tối đa trong 6 giây' },
      { id: 'descent',     el: 'holy', name: 'Thánh Quang Giáng Thế', key: 'V', mana: 70, cost: 25, unlock: { flag: 'shieldBlock', text: 'Dùng Quang Giáp (C) hấp thụ 10 đòn của quái' }, cd: 20, heal: 0.3, dmg: 50, radius: 4, knock: 300, stun: 0.5, dur: 5, absorb: 0.15, desc: 'Cột sáng từ trời: hồi 30% máu, tẩy trạng thái xấu, khiên 15% máu 5 giây, thiêu quái quanh 4 ô' },
      // Hệ Hắc Ám (el: 'dark'): Tấn Công · Khống Chế · Triệu Hồi · Chiêu Cuối. steal = tỉ lệ sát thương gây ra được hồi lại thành máu. (id giữ nguyên để save cũ không mất phép đã học)
      { id: 'lifedrain',   el: 'dark', name: 'Hắc Ám',  key: 'Z', mana: 15, cost: 8, unlock: { flag: 'zombieKill', text: 'Hạ 5 zombie' }, cd: 2,  dmg: 8,  speed: 700, range: 6.5, width: 22, pierce: 3, steal: 0.2, desc: 'Tấn công: phóng vệt chém hắc ám theo hướng chuột, xuyên 3 mục tiêu và hồi 20% sát thương gây ra' },
      { id: 'darkorb',     el: 'dark', name: 'Hắc Vực', key: 'X', mana: 40, cost: 12, unlock: { flag: 'flowerKill', text: 'Thu thập 10 Hoa Hắc Ám mọc quanh nhà Phù Thủy (chỉ nở ban đêm)' }, cd: 9,  dmg: 9,  radius: 3, reach: 6.5, time: 4, tick: 0.5, pull: 90, stun: 1.2, steal: 0.25, desc: 'Khống chế: mở vực hắc ám tại chỗ trỏ chuột 4 giây, xích bóng tối trói và kéo quái về tâm, hút máu' },
      { id: 'shadowrend',  el: 'dark', name: 'Hắc Triệu', key: 'C', mana: 45, cost: 18, unlock: { flag: 'lowHpKill', text: 'Hạ 1 zombie khi máu dưới 20% mà không chết' }, cd: 16, dur: 12, count: 2, dmg: 6, speed: 260, steal: 0.3, desc: 'Triệu hồi: gọi 2 Oan Hồn bóng tối lao vào cắn quái gần bạn 12 giây, hồi 30% sát thương gây ra' },
      { id: 'abyss',       el: 'dark', name: 'Hắc Chúa', key: 'V', mana: 80, cost: 25, unlock: { item: 'darkscroll', n: 1 }, cd: 28, dmg: 70, radius: 4, reach: 6.5, delay: 1.2, stun: 1.5, steal: 0.3, desc: 'Chiêu cuối: Hắc Chúa giáng thế tại chỗ trỏ chuột, sau 1,2 giây nổ mặt trời đen, choáng quái và hồi 30% sát thương gây ra' },
      // Hệ Tự Nhiên (el: 'nature'): Z Dây Leo Trói Buộc · X Sinh Mệnh Hoa · C Địa Chấn Rễ Cây · V Cổ Thụ Thần Linh. Đơn vị range / reach / radius / width là số Ô; time, dur, delay, cd là giây.
      { id: 'vinebind',    el: 'nature', name: 'Dây Leo Trói Buộc', key: 'Z', mana: 20, cost: 8, unlock: { flag: 'chopKill', text: 'Chặt 10 cây' }, cd: 2,  dmg: 3, reach: 7, time: 3, tick: 0.5, desc: 'Trói chặt một mục tiêu gần con trỏ 3 giây, gây sát thương nhẹ theo thời gian (boss không bị giữ)' },
      { id: 'lifebloom',   el: 'nature', name: 'Sinh Mệnh Hoa',     key: 'X', mana: 30, cost: 12, unlock: { flag: 'plantKill', text: 'Trồng 5 cây (chặt cây có tỉ lệ rớt Hạt Cây, cầm hạt bấm vào ô cỏ để trồng)' }, cd: 5,  heal: 0.25, time: 4, desc: 'Hoa thần nở dưới chân, hồi 25% máu tối đa trong 4 giây (không hồi quá máu tối đa)' },
      { id: 'rootquake',   el: 'nature', name: 'Địa Chấn Rễ Cây',   key: 'C', mana: 45, cost: 18, unlock: { flag: 'harvestKill', text: 'Thu hoạch 10 nông sản chín từ ruộng' }, cd: 7,  dmg: 18, range: 6, width: 1.4, knock: 380, stun: 0.7, desc: 'Rễ cây trồi thành đường thẳng 6 ô phía trước, sát thương diện rộng, hất tung quái nhỏ (quái lớn chỉ bị đẩy lùi)' },
      { id: 'ancienttree', el: 'nature', name: 'Cổ Thụ Thần Linh',  key: 'V', mana: 70, cost: 25, unlock: { item: 'woodscroll', n: 1, item2: 'treeseed', n2: 5 }, cd: 20, dmg: 15, radius: 5, reach: 4, delay: 1.2, time: 8, rate: 1, targets: 3, heal: 0.04, healRate: 1.5, desc: 'Chiêu cuối: cổ thụ khổng lồ mọc ở chỗ trỏ chuột 8 giây, cành cây quất quái quanh đó và toả vùng hồi máu nhẹ cho bạn' },
    ],
  },

  // ---- Ngày đêm ----
  day: {
    length: 900,             // giây cho một ngày đêm (900 = 15 phút)
    nightStart: 0.68,        // "độ sáng thô" (0..1) mà trên mức này trời bắt đầu tối. Càng CAO càng ít đêm
    nightRamp: 0.2,          // độ rộng đoạn chuyển từ sáng sang tối hoàn toàn
    maxDarkness: 0.72,       // độ tối tối đa của màn hình
    sleepSkipFarmSeconds: 300, // ngủ qua đêm: cây trồng được cộng thêm từng này giây
  },

  // ---- Thời tiết ----
  weather: {
    chance: 0.6,             // xác suất mỗi lần thử ra mưa / giông
    stormShare: 0.25,        // trong số đó giông bão (có sét) chiếm tỉ lệ này
    rainTime: [40, 75],      // giây một đợt mưa thường
    stormTime: [30, 50],     // giây một đợt giông
    clearMin: 120, clearMax: 240, // trời quang sau mỗi đợt
    retryMin: 30, retryMax: 60,   // lần thử lại nếu chưa ra
    firstCheck: 90,          // giây đầu game trước khi có thể mưa
    zombieCapRain: 3,        // số zombie hoang tối thiểu khi mưa thường
    zombieCapStorm: 5,       // và khi giông
  },
  lightning: {
    radius: 70,              // vùng bị sét gây sát thương (pixel)
    damage: 35,
    rodLife: 3,              // số lần cột thu lôi chịu được
  },

  // ---- Zombie ----
  zombie: {
    detect: 300, lose: 560, guardLeash: 420, hitRange: 46, attackTime: 0.55, freezeDist: 1500,
    // hp | tốc độ đi bộ / chạy | sát thương
    types: {
      1: { hp: 20, walk: 50, run: 105, dmg: 8 },
      2: { hp: 30, walk: 55, run: 115, dmg: 11 },
      3: { hp: 45, walk: 60, run: 125, dmg: 15 },
      4: { hp: 16, walk: 75, run: 190, dmg: 7 },                          // chạy nhanh
      5: { hp: 26, walk: 50, run: 95, dmg: 9, ranged: true, range: 240 }, // ném đá
      6: { hp: 60, walk: 62, run: 130, dmg: 16 },                         // Zombie Điện (dạng V2): không tự sinh, chỉ biến hình khi sét đánh trúng cột thu lôi gần đó
    },
    electricRadius: 4,   // ô: zombie đứng trong tầm này quanh cột thu lôi bị sét đánh sẽ biến thành Zombie Điện (V2)
    fastChance: 0.14, rangedChance: 0.14, // từ ngày 2: tỉ lệ ra zombie chạy nhanh / ném đá (mỗi loại)
    capBase: 4, capPerDay: 1, capMaxDays: 6, // số zombie hoang tối đa ban đêm = độ tối * (capBase + min(ngày, capMaxDays) * capPerDay)
  },

  // ---- Nhện (số nhện trong hầm theo từng tầng, xem mine.zones) ----
  spider: {
    mineLateDay: 4,          // từ ngày này trở đi hầm có thêm 1 nhện
    mineMax: 6,              // trần số nhện trong hầm
  },

  // ---- Hầm mỏ: tầng sâu, dung nham, nước, sập hầm, rương kho báu ----
  mine: {
    caveinWarn: 1.6,         // giây báo trước (vòng đỏ) khi đá sắp rơi
    caveinDmg: 18,           // sát thương khi bị đá rơi trúng
    lavaDmg: 12,             // sát thương mỗi lần bị dung nham bỏng (cách nhau ~1 giây, giáp có giảm)
    burnTime: 4,             // giây tiếp tục cháy sau khi ra khỏi dung nham (xuống nước hoặc gặp mưa thì tắt)
    mobBurnDmg: 5,           // sát thương zombie / nhện / cây quái / động vật bị lửa thiêu mỗi 0,5 giây (đứng trong dung nham hoặc vừa ra)
    bossBurnDmg: 3,          // sát thương boss bị lửa thiêu mỗi 0,5 giây (boss 1000 máu: đứng trong lava ~170 giây mới chết)
    burnDmg: 5,              // sát thương mỗi lần bị lửa thiêu (~1 giây một lần, giáp có giảm)
    lavaSpeed: 0.6, waterSpeed: 0.6, // tốc độ đi trong dung nham / nước (1 = bình thường)
    chestEvery: [90, 180],   // giây giữa hai lần thử sinh rương kho báu
    chestDist: [18, 45],     // rương mới cách người chơi từng này ô
    maxChests: 2,            // số rương kho báu tối đa cùng lúc trong hầm
    // Mỗi tầng: from = khoảng cách (ô) tính từ điểm xuất phát (0,0) mà tầng bắt đầu
    //   coal / iron / gold / diamond = tỉ lệ ô đá là quặng đó (còn lại là đá thường)
    //   lavaAbove / waterAbove = ngưỡng nhiễu để ra hồ dung nham / nước ngầm (1 = không ra, càng thấp càng nhiều)
    //   cavein = xác suất sập hầm mỗi khi đào xong 1 ô đá · spiders / zombies = số tối đa · chestRare = xác suất rương có zombie canh
    zones: [
      { name: 'Tầng nông', from: 0,  coal: 0.16, iron: 0.07, gold: 0.002, diamond: 0, lavaAbove: 1,    waterAbove: 0.76, cavein: 0,    spiders: 1, zombies: 1, chestRare: 0,
        info: 'Tầng nông: nhiều than và sắt, khá an toàn' },
      { name: 'Tầng sâu',  from: 35, coal: 0.10, iron: 0.045, gold: 0.006, diamond: 0.00005, lavaAbove: 0.84, waterAbove: 0.80, cavein: 0.05, spiders: 3, zombies: 2, chestRare: 0.5,
        info: 'Tầng sâu: quặng hiếm hơn, có nước ngầm, dung nham và đá sập' },
      { name: 'Vực thẳm',  from: 75, coal: 0.05, iron: 0.03, gold: 0.004, diamond: 0.0008,  lavaAbove: 0.76, waterAbove: 1,    cavein: 0.10, spiders: 5, zombies: 4, chestRare: 1,
        info: 'Vực thẳm: kim cương ở đây! Cực kỳ nguy hiểm' },
    ],
  },

  // ---- Làng, chiến binh ----
  village: {
    chance: 0.15,            // xác suất một vùng 56x56 ô có làng
    minGap: 10,              // khoảng cách tối thiểu giữa hai làng (ô)
    marketDist: 50,          // khoảng cách làng -> chợ (ô)
    marketGap: 75,           // khoảng cách tối thiểu giữa hai chợ (ô, tính giữa hai tâm; đo theo trục lớn nhất)
    warriorCount: 3, warriorHp: 90, warriorDmg: 5, warriorRange: 44, warriorCd: 0.75,
    warriorRespawn: 30,
    archerCount: 2, archerHp: 60, archerDmg: 4, archerRange: 400, archerCd: 1.5,
    houseChestChance: 0.35,
  },

  // ---- Aerobic ----
  exercise: {
    start: 0.70,             // dayT bắt đầu tập (0 = trưa, 0.5 = nửa đêm)
    end: 1.08,
    duration: 180,           // giây một buổi tập
  },

  // ---- Rương ngẫu nhiên, thế giới ----
  world: {
    rareChestChance: 0.3,
    maxChests: 2,
    chestRespawn: [150, 270],
  },

  // ---- Đầm lầy, boss ----
  swamp: { threshold: 0.72, startClear: 80, plantNest: 0.0045, plantRespawn: 600 },

  // ---- Chế tạo, nông trại ----
  craft: { smeltTime: 5, hoeTime: 0.46, seedChance: 0.3, watercanUses: 5, watercanPrice: 4, stackMax: 70 },
};

// Kiểm tra nhanh các giá trị vô lý (báo trong console, không làm hỏng game)
(function validateBalance(B) {
  const bad = [];
  const num = (name, v, min, max) => { if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) bad.push(name + '=' + v + ' (cần ' + min + '..' + max + ')'); };
  num('player.maxHp', B.player.maxHp, 1, 10000);
  num('player.hungerRate', B.player.hungerRate, 0, 10);
  num('day.length', B.day.length, 60, 7200);
  num('day.nightStart', B.day.nightStart, 0, 0.95);
  num('day.nightRamp', B.day.nightRamp, 0.01, 1);
  num('weather.chance', B.weather.chance, 0, 1);
  num('weather.stormShare', B.weather.stormShare, 0, 1);
  num('village.minGap', B.village.minGap, 0, 40);
  num('village.marketGap', B.village.marketGap, 30, 400);
  if (B.weather.clearMin > B.weather.clearMax) bad.push('weather.clearMin > clearMax');
  if (bad.length) console.warn('config.js có giá trị bất thường:', bad.join('; '));
})(BALANCE);
