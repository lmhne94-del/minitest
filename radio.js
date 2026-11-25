// ======================================================================
// RADIO — đặt radio xuống đất (mua ở Tạp hoá 100 ngọc, chọn trên thanh nhanh rồi bấm chuột trái), đứng gần và nhấn E để dán link nhạc.
// Hỗ trợ: link YouTube (video hoặc playlist), link SoundCloud (bài hoặc playlist), link trực tiếp file/luồng nhạc (.mp3 .ogg .wav .m4a .aac, radio online).
// Âm lượng nghe được phụ thuộc khoảng cách tới radio: đứng sát thì to, đi xa thì nhỏ dần, quá xa thì im. Thanh trượt là âm lượng tối đa.
// Radio đặt sẵn ở làng (nhạc thể dục buổi sáng) nằm trong survival.js, không liên quan tới file này.
// Muốn bỏ: xoá file này và dòng <script src="radio.js"> trong survival.html
// ======================================================================
(function () {
  let box, input, status, vol, mode = null, audio = null, yt = null, ytReady = null, volume = 70, dot;
  let src = null;          // radio đang được mở bảng điều khiển: { key, x, y, layer }
  let playing = null;      // radio đang phát nhạc: { key, x, y, layer }
  let statusT = 0, lastGain = -1;

  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  volume = parseInt(store.get('radioVol', '70'), 10) || 70;

  // Mỗi radio nhớ link riêng (khoá: tầng:ô)
  function urlOf(key) { try { return (JSON.parse(store.get('radioUrls', '{}')) || {})[key] || ''; } catch (e) { return ''; } }
  function saveUrl(key, url) { try { const o = JSON.parse(store.get('radioUrls', '{}')) || {}; o[key] = url; store.set('radioUrls', JSON.stringify(o)); } catch (e) {} }

  // Hệ số 0..1 theo khoảng cách (dùng chung hàm của game để radio làng và radio người chơi nghe giống nhau)
  function falloff(d) {
    if (typeof soundFalloff === 'function') return soundFalloff(d);
    const near = 96, far = 720;
    if (d <= near) return 1;
    if (d >= far) return 0;
    const k = 1 - (d - near) / (far - near);
    return k * k;
  }
  function gainNow() {
    if (!playing || typeof player === 'undefined') return 0;
    if (typeof layer !== 'undefined' && layer !== playing.layer) return 0; // đứng trong nhà / hầm: không nghe thấy
    return falloff(Math.hypot(playing.x - player.x, playing.y - player.y));
  }

  function ytIds(url) {
    let u; try { u = new URL(url); } catch (e) { return null; }
    const h = u.hostname.replace(/^www\.|^m\./, '');
    let v = null, list = u.searchParams.get('list');
    if (h === 'youtu.be') v = u.pathname.slice(1);
    else if (h.endsWith('youtube.com') || h === 'music.youtube.com') {
      v = u.searchParams.get('v');
      const m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]{6,})/);
      if (!v && m) v = m[2];
    } else return null;
    return v || list ? { v, list } : null;
  }

  const isSC = (url) => { try { const h = new URL(url).hostname.replace(/^www\.|^m\./, ''); return h === 'soundcloud.com' || h === 'on.soundcloud.com' || h === 'api.soundcloud.com'; } catch (e) { return false; } };
  let sc = null, scReady = null;
  function loadSC() {
    if (scReady) return scReady;
    scReady = new Promise((ok, fail) => {
      if (window.SC && SC.Widget) return ok();
      const el = document.createElement('script');
      el.src = 'https://w.soundcloud.com/player/api.js';
      el.onload = ok;
      el.onerror = () => { scReady = null; fail(new Error('Không tải được SoundCloud (kiểm tra mạng)')); };
      document.head.appendChild(el);
    });
    return scReady;
  }

  function loadYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise((ok, fail) => {
      if (window.YT && YT.Player) return ok();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); ok(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { ytReady = null; fail(new Error('Không tải được YouTube (kiểm tra mạng)')); };
      document.head.appendChild(s);
    });
    return ytReady;
  }

  function stop(msg) {
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
    if (yt && yt.stopVideo) { try { yt.stopVideo(); } catch (e) {} }
    if (sc) { try { sc.pause(); } catch (e) {} }
    const f = document.getElementById('radio-sc'); if (f) f.remove();
    sc = null;
    mode = null; playing = null; lastGain = -1;
    if (dot) dot.style.display = 'none';
    setStatus(msg || 'Đã dừng');
  }

  function setStatus(t) { if (status) status.textContent = t; }

  // Âm lượng thực = thanh trượt × hệ số khoảng cách
  function applyVolume(force) {
    if (!mode) return;
    const g = gainNow();
    const eff = Math.round(volume * g);
    if (!force && eff === lastGain) return;
    lastGain = eff;
    if (audio) audio.volume = Math.max(0, Math.min(1, eff / 100));
    if (yt && yt.setVolume && mode === 'yt') { try { yt.setVolume(eff); } catch (e) {} }
    if (sc && mode === 'sc') { try { sc.setVolume(eff); } catch (e) {} }
    if (dot) { dot.style.display = 'block'; dot.style.opacity = String(0.35 + 0.65 * g); }
  }

  async function play(url) {
    url = url.trim();
    if (!src) return;
    if (!url) { setStatus('Dán link nhạc vào ô trên'); return; }
    stop('Đang kết nối...');
    saveUrl(src.key, url); store.set('radioUrl', url);
    playing = { key: src.key, x: src.x, y: src.y, layer: src.layer };
    const id = ytIds(url);
    const startVol = Math.round(volume * gainNow());
    try {
      if (isSC(url)) {
        setStatus('Đang tải SoundCloud...');
        await loadSC();
        const f = document.createElement('iframe');
        f.id = 'radio-sc'; f.allow = 'autoplay';
        f.style.cssText = 'position:fixed;left:-9999px;top:0;width:300px;height:166px;border:0;';
        f.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) + '&auto_play=true&visual=false&show_comments=false';
        document.body.appendChild(f);
        sc = SC.Widget(f);
        sc.bind(SC.Widget.Events.READY, () => {
          sc.setVolume(startVol);
          sc.play();
          sc.getCurrentSound((snd) => { mode = 'sc'; applyVolume(true); setStatus('♪ Đang phát SoundCloud' + (snd && snd.title ? ': ' + snd.title.slice(0, 36) : '')); });
        });
        sc.bind(SC.Widget.Events.FINISH, () => { sc.getSounds((l) => { if (l && l.length > 1) sc.next(); else { sc.seekTo(0); sc.play(); } }); });
        sc.bind(SC.Widget.Events.ERROR, () => { stop('SoundCloud không phát được link này (track riêng tư hoặc chặn nhúng)'); });
        mode = 'sc'; applyVolume(true);
      } else if (id) {
        setStatus('Đang tải YouTube...');
        await loadYT();
        const holder = document.getElementById('radio-yt') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'radio-yt' });
        holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:200px;';
        if (yt && yt.destroy) { yt.destroy(); yt = null; }
        const inner = holder.appendChild(document.createElement('div'));
        yt = new YT.Player(inner, {
          width: 200, height: 200, videoId: id.v || undefined,
          playerVars: { autoplay: 1, playsinline: 1, ...(id.list ? { listType: 'playlist', list: id.list } : { loop: 1, playlist: id.v }) },
          events: {
            onReady: (e) => { e.target.setVolume(startVol); e.target.playVideo(); mode = 'yt'; applyVolume(true); setStatus('♪ Đang phát YouTube'); },
            onStateChange: (e) => { if (e.data === 0 && id.list) e.target.nextVideo(); },
            onError: (e) => {
              const file = location.protocol === 'file:';
              stop('YouTube lỗi ' + e.data + (file || e.data === 150 || e.data === 153 || e.data === 101
                ? (file ? ': đang mở game bằng file:// nên YouTube từ chối. Chạy chay-game.bat (hoặc chay-game.sh) rồi mở http://localhost:8000' : ': video này chủ kênh chặn nhúng, thử bài khác')
                : ': link không hợp lệ hoặc video bị gỡ'));
            },
          },
        });
        mode = 'yt';
      } else {
        audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.loop = true;
        audio.volume = Math.max(0, Math.min(1, startVol / 100));
        audio.src = url;
        audio.onerror = () => { stop('Không phát được link này (cần link trực tiếp tới file hoặc luồng nhạc)'); };
        await audio.play();
        mode = 'audio'; applyVolume(true);
        setStatus('♪ Đang phát: ' + (url.split('/').pop().split('?')[0] || url).slice(0, 40));
      }
    } catch (e) { stop('Lỗi: ' + e.message); }
  }

  function setVol(v) {
    volume = v; store.set('radioVol', String(v));
    applyVolume(true);
  }

  function pauseResume(go) {
    if (mode === 'audio' && audio) { go ? audio.play() : audio.pause(); }
    else if (mode === 'yt' && yt) { go ? yt.playVideo() : yt.pauseVideo(); }
    else if (mode === 'sc' && sc) { go ? sc.play() : sc.pause(); }
  }

  function build() {
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:16px;bottom:16px;width:min(380px,90vw);z-index:40;display:none;padding:10px 12px;background:rgba(20,24,16,.92);border:2px solid #6aa83a;border-radius:8px;color:#fff;font:14px/1.4 sans-serif;';
    box.innerHTML = '<div style="font-weight:bold;margin-bottom:6px">📻 Radio</div>';
    input = document.createElement('input');
    input.type = 'text'; input.placeholder = 'Dán link YouTube, SoundCloud hoặc file .mp3...'; input.spellcheck = false;
    input.style.cssText = 'box-sizing:border-box;width:100%;padding:8px 10px;background:#0c100a;color:#fff;border:1px solid #6aa83a;border-radius:6px;font:inherit;outline:none;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin:8px 0;align-items:center;';
    const mk = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'padding:6px 10px;background:#3d6b22;color:#fff;border:0;border-radius:6px;font:inherit;cursor:pointer;'; b.onclick = () => { f(); input.focus(); }; return b; };
    vol = document.createElement('input');
    vol.type = 'range'; vol.min = 0; vol.max = 100; vol.value = volume; vol.title = 'Âm lượng tối đa (khi đứng sát radio)'; vol.style.cssText = 'flex:1;min-width:0;';
    vol.oninput = () => setVol(+vol.value);
    row.append(mk('▶ Phát', () => play(input.value)), mk('⏸', () => pauseResume(false)), mk('⏵', () => pauseResume(true)), mk('⏹', () => stop()), vol);
    status = document.createElement('div');
    status.style.cssText = 'font-size:12px;color:#9be34a;min-height:16px;';
    status.textContent = 'Chưa phát';
    box.append(input, row, status);
    document.body.appendChild(box);
    dot = document.createElement('div');
    dot.textContent = '♪';
    dot.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:39;display:none;color:#9be34a;font:bold 22px sans-serif;text-shadow:0 0 4px #000;pointer-events:none;';
    document.body.appendChild(dot);
    const quiet = (e) => e.stopPropagation(); // gõ link không làm nhân vật di chuyển
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') play(input.value); if (e.key === 'Escape') close(); });
    input.addEventListener('keyup', quiet);
  }

  function isOpen() { return Boolean(box && box.style.display !== 'none'); }

  function close() {
    if (!box) return;
    box.style.display = 'none';
    input.blur();
    src = null;
  }

  // Mở bảng điều khiển của radio tại (x, y) trên tầng lay. Mở lại đúng radio đó thì đóng.
  function open(key, x, y, lay) {
    if (!box) build();
    if (isOpen() && src && src.key === key) { close(); return; }
    src = { key, x, y, layer: lay };
    box.style.display = 'block';
    if (typeof keys === 'object') for (const k in keys) keys[k] = false;
    input.value = urlOf(key) || store.get('radioUrl', '');
    vol.value = volume;
    setStatus(playing && playing.key === key ? (mode ? '♪ Radio này đang phát' : 'Đang kết nối...') : playing ? 'Đang phát ở một radio khác, bấm Phát để chuyển sang radio này' : 'Chưa phát');
    statusT = 0;
    setTimeout(() => input.focus(), 0);
  }

  // Game gọi mỗi khung hình
  function update(dt) {
    if (isOpen() && src && typeof player !== 'undefined') {
      const away = (typeof layer !== 'undefined' && layer !== src.layer) || Math.hypot(src.x - player.x, src.y - player.y) > 220;
      if (away) close(); // đi xa khỏi radio thì tự đóng bảng
    }
    if (playing && typeof getTile === 'function' && typeof RADIO !== 'undefined' && typeof layer !== 'undefined' && layer === playing.layer) {
      const [tx, ty] = playing.key.split(':')[1].split(',').map(Number);
      if (getTile(tx, ty) !== RADIO) stop('Radio đã bị gỡ'); // radio bị đập hoặc mất
    }
    applyVolume(false);
    statusT -= dt;
    if (statusT <= 0 && isOpen() && playing && mode && src && playing.key === src.key) {
      statusT = 0.4;
    }
  }

  window.Radio = {
    open, close, isOpen, update,
    volumeNow() { return mode ? Math.round(volume * gainNow()) : 0; }, // âm lượng thực đang nghe (0-100), đã tính khoảng cách
    isPlaying(key) { return Boolean(playing && mode && playing.key === key); },
    removed(key) { if (playing && playing.key === key) stop('Radio đã bị gỡ'); if (src && src.key === key) close(); },
  };
})();
