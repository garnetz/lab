/* Trail card: the logic. Packs a route while there's signal (heights, sunset, a picture of the map), keeps it on
   the phone, and from then on works out everything from the route and your position alone, with no network.
   On this page a slider stands in for walking; "Use my location" uses the real GPS, which never leaves the phone. */
(() => {
  const $ = (id) => document.getElementById(id);
  const STORE = 'trail-card';
  const rad = Math.PI / 180;
  const R = 6371000;
  const OFF_ROUTE = 40; // metres from the line before the card says you're off it

  // ---------- Small helpers ----------
  const dist = Trail.dist;
  function bearing(a, b) {
    const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
    const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }
  const WORDS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const compass = (deg) => WORDS[Math.round(deg / 45) % 8];
  const mx = (lon) => (lon + 180) / 360;
  const my = (lat) => { const s = Math.sin(lat * rad); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const fmtDist = (m) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`);
  const fmtDur = (min) => { min = Math.max(0, Math.round(min)); return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`; };
  const clock = (ms, zone) => { try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone || undefined }).format(ms); } catch { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(ms); } };
  const dayIn = (ms, zone) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone || undefined }).format(ms); } catch { return new Date(ms).toLocaleDateString('en-CA'); } };

  // Sunset and sunrise for a day and place (NOAA's simplified formula), as moments in time.
  function sun(dateStr, lat, lon) {
    const [Y, M, D] = dateStr.split('-').map(Number);
    const day = Math.floor((Date.UTC(Y, M - 1, D) - Date.UTC(Y, 0, 0)) / 864e5);
    const g = (2 * Math.PI / 365) * (day - 1);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
    if (cosH < -1) return { polar: 'day' };
    if (cosH > 1) return { polar: 'night' };
    const ha = Math.acos(cosH) / rad;
    const base = Date.UTC(Y, M - 1, D);
    return { set: base + (720 - 4 * (lon - ha) - eqt) * 60e3, rise: base + (720 - 4 * (lon + ha) - eqt) * 60e3 };
  }

  // Walking time in minutes: Naismith (5 km an hour, 10 minutes per 100 m up) with Langmuir's 10 minutes per 300 m down.
  const minutes = (m, up, down) => (m / 5000) * 60 + up / 10 + down / 30;

  // ---------- Elevation for tracks without heights (only while packing, so only with signal) ----------
  async function addHeights(pts) {
    const Z = 13, cache = new Map();
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d', { willReadFrequently: true });
    const tile = (x, y) => {
      const k = `${x}/${y}`;
      if (!cache.has(k)) cache.set(k, new Promise((res) => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => { g.drawImage(img, 0, 0); res(g.getImageData(0, 0, 256, 256).data); };
        img.onerror = () => res(null);
        img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
      }));
      return cache.get(k);
    };
    const n = (1 << Z) * 256;
    for (const p of pts) {
      if (p.ele != null) continue;
      const X = mx(p.lon) * n, Y = my(p.lat) * n;
      const t = await tile(Math.floor(X / 256), Math.floor(Y / 256));
      if (!t) continue;
      const i = ((Math.floor(Y) % 256) * 256 + (Math.floor(X) % 256)) * 4;
      p.ele = t[i] * 256 + t[i + 1] + t[i + 2] / 256 - 32768;
    }
    // Smooth, so pixel noise doesn't count as climbing.
    const raw = pts.map((p) => p.ele);
    pts.forEach((p, i) => { const w = raw.slice(Math.max(0, i - 2), i + 3).filter((v) => v != null); p.ele = w.length ? w.reduce((s, v) => s + v, 0) / w.length : null; });
  }

  // ---------- The route ----------
  // Adds .d (metres along), .up and .down (cumulative climb and descent along the route, with a 3 m deadband).
  function prepare(pts) {
    Trail.measure(pts);
    let up = 0, down = 0, ref = pts[0].ele;
    for (const p of pts) {
      if (p.ele != null && ref != null) {
        if (p.ele - ref > 3) { up += p.ele - ref; ref = p.ele; }
        else if (ref - p.ele > 3) { down += ref - p.ele; ref = p.ele; }
      } else if (p.ele != null) ref = p.ele;
      p.up = up; p.down = down;
    }
    return pts;
  }

  // The closest point on the route to a position: how far along it is, and how far off you are.
  function locate(route, pos) {
    const k = Math.cos(pos.lat * rad) * R * rad, kl = R * rad;
    let best = { off: Infinity };
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const ax = (a.lon - pos.lon) * k, ay = (a.lat - pos.lat) * kl, bx = (b.lon - pos.lon) * k, by = (b.lat - pos.lat) * kl;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const f = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
      const off = Math.hypot(ax + dx * f, ay + dy * f);
      if (off < best.off) best = { off, i, f, d: a.d + (b.d - a.d) * f, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
    }
    return best;
  }
  function pointAt(route, d) {
    d = Math.max(0, Math.min(route[route.length - 1].d, d));
    const i = Math.max(1, route.findIndex((p) => p.d >= d));
    const a = route[i - 1], b = route[i], f = (d - a.d) / Math.max(1e-6, b.d - a.d);
    const lerp = (k) => (a[k] == null || b[k] == null ? a[k] ?? b[k] : a[k] + (b[k] - a[k]) * f);
    return { lat: lerp('lat'), lon: lerp('lon'), ele: lerp('ele'), up: lerp('up'), down: lerp('down'), d };
  }

  // ---------- State ----------
  let trip = null;            // { name, route, zone, packedAt, snapshot, T, sample }
  let pos = null;             // { lat, lon, ele, acc, at }
  let dir = 'out';            // walking toward the end ('out') or back to the start ('back')
  let now = Date.now();
  let card = 'way';
  let watch = null, saverTimer = null;
  const phone = $('phone');

  // ---------- Packing: everything the card needs, made once while there's signal ----------
  let packMap = null, onPackFrame = null;
  async function pack(next) {
    say('Packing for offline: heights, sunset and a picture of the map…');
    $('state').textContent = 'Packing for offline…';
    if (next.route.some((p) => p.ele == null)) await addHeights(next.route);
    prepare(next.route);
    const shot = await takeSnapshot(next.route);
    trip = { ...next, snapshot: shot ? shot.img : null, T: shot ? shot.T : null, packedAt: Date.now() };
    mapImg = null;
    if (!trip.sample) { try { localStorage.setItem(STORE, JSON.stringify(trip)); } catch { /* storage full or blocked: still works for this visit */ } }
    say(trip.snapshot ? '' : 'Couldn’t take the map picture (no WebGL or no signal), so the map card shows the route on its own.');
    $('state').textContent = 'Works offline';
    render();
  }

  // The picture and its projection, together.
  async function takeSnapshot(route) {
    const canvas = $('packmap');
    let frames = 0, last = 0, want = false, resolveImg;
    const img = new Promise((r) => (resolveImg = r));
    if (!packMap) {
      packMap = ContourMap.mount(canvas, { dim: 0.85, maxFit: 16, onError: () => onPackFrame && onPackFrame(true), onFrame: () => onPackFrame && onPackFrame() });
      packMap.set('shade', 0.35);
    }
    onPackFrame = (failed) => {
      if (failed) return resolveImg(null);
      frames++; last = performance.now();
      if (want) { want = false; resolveImg(canvas.toDataURL('image/jpeg', 0.82)); }
    };
    const lats = route.map((p) => p.lat), lons = route.map((p) => p.lon);
    const pl = (Math.max(...lats) - Math.min(...lats)) * 0.12 + 0.001, po = (Math.max(...lons) - Math.min(...lons)) * 0.12 + 0.002;
    packMap.fit(Math.min(...lats) - pl, Math.max(...lats) + pl, Math.min(...lons) - po, Math.max(...lons) + po);
    const A = route[0], B = route.reduce((m, p) => (dist(A, p) > dist(A, m) ? p : m), route[0]);
    const pa = packMap.project(A.lat, A.lon), pb = packMap.project(B.lat, B.lon);
    const ax = (pb[0] - pa[0]) / (mx(B.lon) - mx(A.lon) || 1e-9), ay = (pb[1] - pa[1]) / (my(B.lat) - my(A.lat) || 1e-9);
    const T = { w: canvas.clientWidth, h: canvas.clientHeight, ax, bx: pa[0] - ax * mx(A.lon), ay, by: pa[1] - ay * my(A.lat) };
    const t0 = performance.now();
    await new Promise((res) => {
      const check = () => {
        const t = performance.now();
        if ((frames && !packMap.pending() && t - last > 400) || t - t0 > 20000) return res();
        setTimeout(check, 300);
      };
      setTimeout(check, 600);
    });
    want = true;
    packMap.redraw();
    setTimeout(() => resolveImg(null), 2500);
    const data = await img;
    return data ? { img: data, T } : null;
  }

  // ---------- Drawing ----------
  const say = (msg) => { $('status').textContent = msg || ''; };
  let mapImg = null;

  function render() {
    if (!trip) return;
    const route = trip.route, end = route[route.length - 1], zone = trip.zone;
    $('clock').textContent = clock(now, zone);
    if (!pos) return;
    const at = locate(route, pos);
    const off = at.off > OFF_ROUTE;
    const here = pointAt(route, at.d);

    // Way: one number for how far, then climb and time, then which way to go.
    const back = dir === 'back';
    const remain = back ? at.d : end.d - at.d;
    const up = back ? here.down : end.up - here.up;
    const down = back ? here.up : end.down - here.down;
    const mins = minutes(remain, up, down) + (off ? minutes(at.off, 0, 0) : 0);
    $('way-k').textContent = back ? `Back to ${trip.startName}` : `To ${trip.endName}`;
    $('way-dist').textContent = fmtDist(remain + (off ? at.off : 0));
    $('way-line').textContent = `${Math.round(up)} m up${down > 15 ? ` · ${Math.round(down)} m down` : ''} · about ${fmtDur(mins)}`;
    let aim, text;
    if (off) {
      aim = bearing(pos, at);
      text = `Off the route by ${fmtDist(at.off)}. It’s to the ${compass(aim)}.`;
    } else {
      const ahead = pointAt(route, at.d + (back ? -120 : 120));
      aim = bearing(pos, ahead);
      text = remain < 25 ? (back ? 'You’re back at the start.' : 'You’re there.') : `Head ${compass(aim)}`;
    }
    $('dir-text').textContent = text;
    $('dir-text').classList.toggle('hot', off);
    $('way-dist').classList.toggle('hot', off);
    $('arrow').setAttribute('transform', `rotate(${aim} 32 32)`);
    $('turn').textContent = back ? 'I’m heading on' : 'I’m heading back';
    drawProfile(route, at.d);

    // Light: time to sunset, and whether turning now gets you down before it.
    const day = dayIn(now, zone);
    const s = sun(day, route[0].lat, route[0].lon);
    const toStart = minutes(at.d, here.down, here.up) + (off ? minutes(at.off, 0, 0) : 0);
    const downAt = now + toStart * 60e3;
    if (s.polar) {
      $('light-k').textContent = s.polar === 'day' ? 'Midnight sun' : 'Polar night';
      $('light-left').textContent = s.polar === 'day' ? 'No sunset' : 'No sunrise';
      $('light-at').textContent = s.polar === 'day' ? 'The sun stays up all day here today.' : 'The sun stays down all day here today.';
      $('light-back').textContent = `Back at the start by about ${clock(downAt, zone)} if you turn now.`;
    } else if (now < s.set) {
      const left = (s.set - now) / 60e3;
      const spare = (s.set - downAt) / 60e3;
      $('light-k').textContent = 'Sunset in';
      $('light-left').textContent = fmtDur(left);
      $('light-at').textContent = `at ${clock(s.set, zone)}`;
      $('light-back').textContent = spare >= 0
        ? `Turn back now and you’re down at ${clock(downAt, zone)}, ${fmtDur(spare)} before sunset.`
        : `Turning back now, you’re down at ${clock(downAt, zone)}, ${fmtDur(-spare)} after sunset. Have a light ready.`;
      $('light-left').classList.toggle('hot', spare < 30);
    } else {
      $('light-k').textContent = 'The sun has set';
      $('light-left').textContent = clock(s.set, zone);
      $('light-at').textContent = `Sunrise ${clock(s.rise + 864e5, zone)}`;
      $('light-back').textContent = `Back at the start by about ${clock(downAt, zone)} if you turn now.`;
      $('light-left').classList.add('hot');
    }

    // Help: where you are, in a form you can read out or text.
    const lat = `${Math.abs(pos.lat).toFixed(5)}° ${pos.lat >= 0 ? 'N' : 'S'}`, lon = `${Math.abs(pos.lon).toFixed(5)}° ${pos.lon >= 0 ? 'E' : 'W'}`;
    $('help-pos').innerHTML = `${lat}<br>${lon}`;
    const age = Math.round((now - pos.at) / 1000);
    const ele = pos.ele ?? here.ele;
    $('help-line').textContent = [ele != null ? `Height about ${Math.round(ele)} m` : '', pos.acc ? `±${Math.round(pos.acc)} m` : '', age > 20 ? `fix ${age < 120 ? `${age} s` : fmtDur(age / 60)} old` : 'fix just now'].filter(Boolean).join(' · ');
    const msg = `My position: ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}${ele != null ? `, about ${Math.round(ele)} m up` : ''}, on ${trip.name}, at ${clock(pos.at, zone)}. https://www.openstreetmap.org/?mlat=${pos.lat.toFixed(5)}&mlon=${pos.lon.toFixed(5)}#map=16/${pos.lat.toFixed(5)}/${pos.lon.toFixed(5)}`;
    $('sms').href = `sms:?&body=${encodeURIComponent(msg)}`;

    if (card === 'map') drawMap(at);
  }

  function sizeCanvas(c) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    return [g, W, H];
  }
  const css = (name) => getComputedStyle(phone).getPropertyValue(name).trim();

  function drawProfile(route, d) {
    const [g, W, H] = sizeCanvas($('profile'));
    const eles = route.map((p) => p.ele ?? 0), lo = Math.min(...eles), hi = Math.max(...eles), span = Math.max(30, hi - lo);
    const end = route[route.length - 1].d;
    const X = (dd) => (dd / end) * W, Y = (e) => H - 4 - ((e - lo) / span) * (H - 12);
    g.beginPath();
    route.forEach((p, i) => (i ? g.lineTo(X(p.d), Y(p.ele ?? 0)) : g.moveTo(X(p.d), Y(p.ele ?? 0))));
    g.strokeStyle = css('--c-dim'); g.lineWidth = 2; g.stroke();
    const here = pointAt(route, d);
    g.beginPath(); g.arc(X(d), Y(here.ele ?? 0), 7, 0, Math.PI * 2); g.fillStyle = css('--c-hot'); g.fill();
  }

  function drawMap(at) {
    const [g, W, H] = sizeCanvas($('mapview'));
    const T = trip.T;
    // The packed picture fills the card; the route and you are drawn on top, so night mode can recolour them.
    let s = 1, ox = 0, oy = 0;
    if (T) { s = Math.max(W / T.w, H / T.h); ox = (W - T.w * s) / 2; oy = (H - T.h * s) / 2; }
    const P = (p) => (T ? [ox + (T.ax * mx(p.lon) + T.bx) * s, oy + (T.ay * my(p.lat) + T.by) * s] : fallbackP(p, W, H));
    if (trip.snapshot) {
      if (!mapImg) { mapImg = new Image(); mapImg.onload = () => render(); mapImg.src = trip.snapshot; }
      if (mapImg.complete && mapImg.naturalWidth) g.drawImage(mapImg, ox, oy, T.w * s, T.h * s);
    }
    const route = trip.route;
    g.lineJoin = g.lineCap = 'round';
    g.beginPath(); route.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = '#000'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = css('--c-ink'); g.lineWidth = 3.5; g.stroke();
    const [ex, ey] = P(route[route.length - 1]);
    g.beginPath(); g.arc(ex, ey, 7, 0, Math.PI * 2); g.fillStyle = css('--c-ink'); g.fill();
    const [x, y] = P(pos);
    g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fillStyle = 'rgba(241,68,29,0.28)'; g.fill();
    g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fillStyle = css('--c-hot'); g.fill(); g.lineWidth = 3; g.strokeStyle = '#000'; g.stroke();
    $('map-note').textContent = `North is up · packed ${clock(trip.packedAt, trip.zone)}${at.off > OFF_ROUTE ? ` · ${fmtDist(at.off)} off the route` : ''}`;
  }
  // Without a picture: fit the route to the card.
  function fallbackP(p, W, H) {
    const r = trip.route, xs = r.map((q) => mx(q.lon)), ys = r.map((q) => my(q.lat));
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.min((W - 64) / (x1 - x0 || 1e-9), (H - 96) / (y1 - y0 || 1e-9));
    return [W / 2 + (mx(p.lon) - (x0 + x1) / 2) * s, H / 2 + (my(p.lat) - (y0 + y1) / 2) * s];
  }

  // ---------- Cards and taps ----------
  const CARDS = ['way', 'map', 'light', 'help'];
  function show(name) {
    card = name;
    CARDS.forEach((c) => { $(`card-${c}`).hidden = c !== name; $(`tab-${c}`).setAttribute('aria-selected', String(c === name)); });
    render();
  }
  CARDS.forEach((c) => $(`tab-${c}`).addEventListener('click', () => show(c)));
  // Tap anywhere on a card (not on its buttons) for the next one: no aiming needed with gloves on.
  $('screen').addEventListener('click', (e) => { if (e.target.closest('button, a')) return; show(CARDS[(CARDS.indexOf(card) + 1) % CARDS.length]); });
  $('turn').addEventListener('click', () => { dir = dir === 'back' ? 'out' : 'back'; render(); });
  document.addEventListener('keydown', (e) => { const i = Number(e.key) - 1; if (CARDS[i] && !e.target.closest('input')) show(CARDS[i]); });

  // ---------- The sample, and the slider that stands in for walking ----------
  function sampleTrip() {
    return {
      name: 'Reinebringen', startName: 'the start', endName: 'the top', zone: 'Europe/Oslo', sample: true,
      route: SAMPLE_ROUTE.map(([lat, lon, ele]) => ({ lat, lon, ele })),
    };
  }
  // The sample walk starts at 15:10 local time today, a little late for October: the light card has something to say.
  function simulate() {
    if (!trip || live) return;
    const route = trip.route, end = route[route.length - 1];
    const v = Number($('walk').value) / 1000;
    dir = v > 0.5 ? 'back' : 'out';
    const d = (v <= 0.5 ? v * 2 : (1 - v) * 2) * end.d;
    let p = pointAt(route, d);
    if ($('off').getAttribute('aria-pressed') === 'true') {
      // Ninety metres to the side of the route.
      const a = pointAt(route, Math.max(0, d - 20)), b = pointAt(route, Math.min(end.d, d + 20));
      const side = (bearing(a, b) + 90) * rad, m = 90;
      p = { ...p, lat: p.lat + (m * Math.cos(side)) / (R * rad), lon: p.lon + (m * Math.sin(side)) / (R * rad * Math.cos(p.lat * rad)), ele: null };
    }
    const upMins = minutes(Math.min(d, end.d), p.up ?? 0, p.down ?? 0);
    const walked = v <= 0.5 ? upMins : minutes(end.d, end.up, end.down) + 20 + minutes(end.d - d, end.down - (p.down ?? 0), end.up - (p.up ?? 0));
    const day = dayIn(Date.now(), trip.zone);
    const start = startOf(day, trip.zone, 15, 10);
    now = start + walked * 60e3;
    pos = { lat: p.lat, lon: p.lon, ele: p.ele, acc: 8, at: now - 6e3 };
    render();
  }
  // A local wall-clock time in a time zone, as a moment.
  function startOf(day, zone, h, m) {
    const [Y, M, D] = day.split('-').map(Number);
    let t = Date.UTC(Y, M - 1, D, h, m);
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t).split(':').map(Number);
      t -= ((parts[0] * 60 + parts[1]) - (h * 60 + m)) * 60e3;
    } catch { /* keep UTC */ }
    return t;
  }
  $('walk').addEventListener('input', simulate);
  $('off').addEventListener('click', () => { toggle('off'); simulate(); });

  // ---------- Conditions ----------
  function toggle(id) { const b = $(id); const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); return on; }
  $('night').addEventListener('click', () => { phone.classList.toggle('night', toggle('night')); render(); });
  $('saver').addEventListener('click', () => { const on = toggle('saver'); phone.classList.toggle('saver', on); if (live) startGPS(); render(); });

  // ---------- The real thing: your own GPX and your own position ----------
  let live = false;
  function startGPS() {
    stopGPS();
    const saver = $('saver').getAttribute('aria-pressed') === 'true';
    const ok = (p) => { now = Date.now(); pos = { lat: p.coords.latitude, lon: p.coords.longitude, ele: p.coords.altitude, acc: p.coords.accuracy, at: p.timestamp || now }; say(''); render(); };
    const fail = (e) => say(e.code === 1 ? 'Location is turned off for this page.' : 'No position yet. Out in the open it usually comes within a minute.');
    if (saver) {
      // One fix a minute, without high accuracy: much lighter on the battery.
      const once = () => navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, maximumAge: 60e3, timeout: 30e3 });
      once();
      saverTimer = setInterval(once, 60e3);
    } else {
      watch = navigator.geolocation.watchPosition(ok, fail, { enableHighAccuracy: true, maximumAge: 5e3, timeout: 30e3 });
    }
  }
  function stopGPS() { if (watch != null) navigator.geolocation.clearWatch(watch); if (saverTimer) clearInterval(saverTimer); watch = null; saverTimer = null; }
  // Keeps the clock and "fix … old" honest between fixes, once a minute in saver mode.
  setInterval(() => { if (live) { now = Date.now(); render(); } }, 15e3);

  $('live').addEventListener('click', () => {
    if (!('geolocation' in navigator)) return say('This browser can’t give a position.');
    live = toggle('live');
    $('walk').disabled = $('off').disabled = live;
    if (live) { say('Asking for your position. It stays on this device.'); startGPS(); }
    else { stopGPS(); say(''); simulate(); }
  });

  $('gpx').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const pts = Trail.readGPX(await f.text()).map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele }));
    if (pts.length < 2) return say('That file has no track or route in it.');
    const name = (new DOMParser().parseFromString(await f.text(), 'application/xml').querySelector('trk > name, rte > name, metadata > name')?.textContent || f.name.replace(/\.gpx$/i, '')).trim();
    await pack({ name, startName: 'the start', endName: 'the end', zone: Intl.DateTimeFormat().resolvedOptions().timeZone, route: pts });
    $('sample').hidden = false;
    $('sample-note').textContent = `${name}, packed and kept on this device. It will still be here, offline, next time you open this page. Move along it with the slider, or use your real location.`;
    simulate();
  });
  $('sample').addEventListener('click', async () => {
    try { localStorage.removeItem(STORE); } catch { /* fine */ }
    $('sample').hidden = true;
    $('sample-note').textContent = 'The real Reinebringen trail above Reine in Lofoten: one kilometre and 460 metres straight up, then the same way down. Move along it, step off it, and change the conditions.';
    await pack(sampleTrip());
    simulate();
  });

  window.addEventListener('resize', () => render());

  // ---------- Start: a packed route from before, or the sample ----------
  (async () => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { /* none */ }
    if (saved && saved.route && saved.route.length > 1) {
      trip = saved;
      $('state').textContent = 'Works offline';
      $('sample').hidden = false;
      $('sample-note').textContent = `${saved.name}, packed ${new Date(saved.packedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} and kept on this device. Move along it with the slider, or use your real location.`;
      simulate();
    } else {
      trip = { ...sampleTrip(), route: prepare(sampleTrip().route), packedAt: Date.now() };
      simulate();
      await pack(sampleTrip());
      simulate();
    }
  })();

  // So the page itself opens without signal next time (only where service workers are allowed).
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
