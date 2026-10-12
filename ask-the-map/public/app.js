/* Ask the map: the page. Asks Claude to read the request, finds and measures real trails in the browser
   (routes.js), asks Claude to pick, and draws the picks on the contour map (map.js). Works without Claude too:
   the request is then read with simple patterns and the trails ranked by the measured facts alone. */
(() => {
  const $ = (id) => document.getElementById(id);
  const API = '/api/ask-the-map';
  const EXAMPLES = [
    'A three-hour loop near Stockholm with a lake and a sunset view',
    'Half a day near Interlaken with a summit and a view',
    'A two-hour walk by the sea near Edinburgh',
  ];
  const DEFAULT_HOURS = 3;
  const WANT_WORDS = { lake: 'a lake', sea: 'the sea', view: 'a view', sunset: 'a sunset view', sunrise: 'a sunrise view', summit: 'a summit', swim: 'a place to swim', shelter: 'a shelter', forest: 'forest' };

  // ---------- Map ----------
  let result = null, selected = null;
  const map = ContourMap.mount($('map'), { dim: 0.5, maxFit: 14.5, onFrame: draw, onError: (m) => showEmpty(m) });
  map.set('shade', 0.45);
  map.go(59.33, 18.07, 9.6);
  const overlay = $('overlay'), ctx = overlay.getContext('2d');
  $('zin').addEventListener('click', () => map.zoomBy(1));
  $('zout').addEventListener('click', () => map.zoomBy(-1));
  $('frame').addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=') map.zoomBy(1);
    if (e.key === '-') map.zoomBy(-1);
    const pan = { ArrowLeft: [-60, 0], ArrowRight: [60, 0], ArrowUp: [0, -60], ArrowDown: [0, 60] }[e.key];
    if (pan) { e.preventDefault(); map.panBy(...pan); }
  });
  function showEmpty(msg) { $('empty').textContent = msg || ''; $('empty').hidden = !msg; }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = overlay.clientWidth, H = overlay.clientHeight;
    if (overlay.width !== Math.round(W * dpr)) { overlay.width = Math.round(W * dpr); overlay.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!result) return;
    const stroke = (lines, color, width) => {
      ctx.beginPath();
      for (const l of lines) l.forEach((p, i) => { const [x, y] = map.project(p.lat, p.lon); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = ctx.lineCap = 'round'; ctx.stroke();
    };
    // The other trails it looked at, faintly; the picks brighter; the chosen one in the accent.
    for (const r of result.routes) if (!result.order.includes(r)) stroke(r.lines, 'rgba(255,255,255,0.22)', 1.5);
    for (const r of result.order) if (r !== selected) { stroke(r.lines, '#000', 4); stroke(r.lines, 'rgba(255,255,255,0.75)', 2); }
    if (selected) { stroke(selected.lines, '#000', 6); stroke(selected.lines, '#f1441d', 3); }
    // Where the sun sets, from the most open point on the chosen trail.
    const s = selected && selected.sun;
    if (s && s.spot && result.ask.wants.some((w) => w === 'sunset' || w === 'sunrise')) {
      const [x, y] = map.project(s.spot.lat, s.spot.lon);
      const far = AskMap.offset(s.spot, 40, s.dir);
      const [fx, fy] = map.project(far.lat, far.lon);
      const len = Math.hypot(fx - x, fy - y) || 1, ux = (fx - x) / len, uy = (fy - y) / len, L = Math.min(90, Math.max(W, H) * 0.12);
      ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ux * L, y + uy * L);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.font = '400 13px ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      ctx.textAlign = ux < 0 ? 'right' : 'left';
      ctx.fillText(`${s.word} ${s.time}`, x + ux * (L + 8), y + uy * (L + 8) + 4);
      ctx.shadowBlur = 0; ctx.textAlign = 'left';
    }
    // Numbers at each pick's start.
    result.order.forEach((r, i) => {
      const p = r.lines[0][0];
      const [x, y] = map.project(p.lat, p.lon);
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = r === selected ? '#f1441d' : '#fff'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.fillStyle = r === selected ? '#fff' : '#000'; ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y + 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    });
    // The place it searched around.
    const c = result.center;
    const [cx, cy] = map.project(c.lat, c.lon);
    ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function fit(routes) {
    const pts = routes.flatMap((r) => r.lines.flat());
    if (!pts.length) return;
    const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
    const s = Math.min(...lats), n = Math.max(...lats), w = Math.min(...lons), e = Math.max(...lons);
    const pl = (n - s) * 0.15 + 0.003, po = (e - w) * 0.15 + 0.006;
    map.fit(s - pl, n + pl, w - po, e + po);
  }

  // ---------- Formatting ----------
  const fmtKm = (km) => `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  const fmtH = (h) => { const m = Math.round((h * 60) / 5) * 5; return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
  const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  function clock(ms, zone) {
    try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone || undefined }).format(ms); }
    catch { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(ms); }
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- Talking to the server ----------
  async function post(path, body, signal) {
    const res = await fetch(`${API}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'server'), { code: data.error || 'server', status: res.status });
    return data;
  }

  // ---------- Asking ----------
  let busy = null;
  const say = (msg, working = true) => { $('progress').textContent = msg; $('progress').classList.toggle('busy', !!msg && working); };

  async function run(q) {
    if (busy) busy.abort();
    const ac = new AbortController();
    busy = ac;
    const signal = ac.signal;
    $('go').disabled = true;
    $('said').replaceChildren();
    $('picks').replaceChildren();
    showEmpty('');
    try {
      // 1. Read the request.
      say('Reading your request');
      let read, offline = false;
      const today = new Date().toLocaleDateString('en-CA');
      try { read = await post('read', { q, today }, signal); }
      catch (e) {
        if (signal.aborted) throw e;
        offline = true;
        read = AskMap.fallbackRead(q);
      }

      // 2. Find the place. With no place named, use the middle of the map.
      let center;
      if (read.place) {
        say(`Finding ${read.place}`);
        center = await AskMap.geocode(read.place, signal);
        if (!center) return done(`Couldn't find “${read.place}” on the map. Try a nearby town or add the country.`);
      } else {
        const st = map.state();
        center = { lat: st.lat, lon: st.lon, name: 'the middle of the map' };
      }
      const hours = read.hours ?? (read.km ? null : DEFAULT_HOURS);
      const ask = { ...read, hours, targetKm: read.km ?? hours * 4.2 };
      if (!read.place) map.go(center.lat, center.lon);

      // 3. Trails nearby, then the most likely ones in full.
      say(`Looking for marked trails within ${Math.round(ask.radius_km)} km of ${center.name.split(',')[0]}`);
      const all = await AskMap.nearby(center, ask.radius_km, signal);
      if (!all.length) return done(`OpenStreetMap has no marked walking trails within ${Math.round(ask.radius_km)} km of ${center.name}. Try a bigger area or a different place.`, center);
      const short = AskMap.shortlist(all, ask);
      if (!short.length) return done(`Found ${all.length} marked trails near ${center.name.split(',')[0]}, but none close to ${ask.km ? fmtKm(ask.km) : fmtH(hours)}. Try a different length.`, center);
      say(`Found ${all.length} marked trails. Measuring the ${short.length} closest to what you asked for`);
      let routes = await AskMap.details(short.map((e) => e.id), signal);
      if (signal.aborted) return;

      // 4. Measure: climb, time, sunset.
      const day = read.date || today;
      const sun = AskMap.sunset(day, center.lat, center.lon);
      const wantsSun = ask.wants.includes('sunset') || ask.wants.includes('sunrise');
      routes = routes.filter((r) => r.km > 0.3);
      routes.forEach((r) => { r.hours = AskMap.naismith(r.km, 0); });
      routes.sort((a, b) => fitScore(b, ask) - fitScore(a, ask));
      routes = routes.slice(0, 8);
      await Promise.all(routes.map(async (r) => {
        r.profile = await AskMap.profile(r);
        r.hours = AskMap.naismith(r.km, r.profile.up);
        if (wantsSun && sun.at) r.sun = await sunFacts(r, sun, ask.wants.includes('sunrise') && !ask.wants.includes('sunset'), read.time_zone);
      }));
      if (signal.aborted) return;
      routes.sort((a, b) => score(b, ask) - score(a, ask));

      // 5. Pick: Claude, or the facts alone.
      const facts = routes.map((r) => factsFor(r, center, ask));
      let picked = null;
      if (!offline) {
        say('Asking Claude to choose');
        try { picked = await post('pick', { q, read, candidates: facts }, signal); }
        catch (e) { if (signal.aborted) throw e; offline = true; }
      }
      const byId = new Map(routes.map((r) => [String(r.id), r]));
      const order = picked && picked.picks.length ? picked.picks.map((p) => Object.assign(byId.get(p.id), { note: p })) : routes.slice(0, 3);
      result = { routes, order, center, ask, sun, zone: read.time_zone };
      selected = order[0] || null;
      render(picked, offline, read, center, ask, sun);
      fit(order.length ? order : routes);
      say('', false);
      map.redraw();
    } catch (e) {
      if (signal.aborted) return;
      console.error(e);
      done('The map data didn’t answer just now. The open servers it uses get busy; try again in a moment.');
    } finally {
      if (busy === ac) { busy = null; $('go').disabled = false; }
    }
  }

  function done(msg, center) {
    say('', false);
    result = center ? { routes: [], order: [], center, ask: { wants: [] } } : null;
    selected = null;
    $('said').innerHTML = `<p>${esc(msg)}</p>`;
    if (center) map.go(center.lat, center.lon, 10);
    map.redraw();
  }

  // How well a trail fits the length asked for (0 is perfect).
  const lengthMiss = (r, ask) => Math.abs(Math.log(ask.km ? r.km / ask.km : r.hours / ask.hours));
  const fitScore = (r, ask) => -lengthMiss(r, ask) + (ask.shape === 'loop' && r.loop ? 0.4 : 0) + (ask.shape === 'loop' && !r.loop ? -0.3 : 0);
  // The ranking used when Claude isn't there, and to choose what Claude sees: length, shape, then what was asked for.
  function score(r, ask) {
    let s = fitScore(r, ask) * 2;
    const w = new Set(ask.wants);
    if (w.has('lake') && r.lakes.length) s += 0.6;
    if (w.has('sea') && r.sea) s += 0.6;
    if (w.has('view') && (r.viewpoints || r.peaks.length)) s += 0.4;
    if (w.has('summit') && r.peaks.length) s += 0.6;
    if (w.has('swim') && r.bathing) s += 0.5;
    if (w.has('shelter') && r.shelters) s += 0.3;
    if (r.sun && r.sun.open) s += 0.5;
    if (r.sun && r.sun.lakes.length) s += 0.2;
    return s;
  }

  // Sunset (or sunrise) seen from the trail: the most open point toward it, and any lake lying that way.
  async function sunFacts(r, sun, rise, zone) {
    const dir = rise ? sun.riseAzimuth : sun.azimuth;
    const at = rise ? sun.riseAt : sun.at;
    const pts = r.profile.samples;
    let d = 0;
    pts.forEach((p, i) => { if (i) d += AskMap.dist(pts[i - 1], p); p.km = d / 1000; });
    const step = Math.max(1, Math.floor(pts.length / 14));
    const tries = pts.filter((_, i) => i % step === 0);
    if (r.profile.top && !tries.includes(r.profile.top)) tries.push({ ...r.profile.top, km: null });
    let best = null;
    for (const p of tries) {
      const deg = await AskMap.horizon(p, dir);
      if (!best || deg < best.deg) best = { ...p, deg };
    }
    const lakes = r.lakes.filter((l) => {
      if (!l.at) return false;
      const near = pts.reduce((m, p) => { const dd = AskMap.dist(p, l.at); return dd < m.d ? { p, d: dd } : m; }, { d: Infinity });
      if (near.d > 1500) return false;
      const b = AskMap.bearing(near.p, l.at);
      return Math.abs(((b - dir + 540) % 360) - 180) < 40;
    }).map((l) => l.name);
    return {
      dir, word: rise ? 'Sunrise' : 'Sunset', time: clock(at, zone), spot: best,
      horizonDeg: best ? Math.round(best.deg * 10) / 10 : null, open: best ? best.deg < 1 : false, lakes,
    };
  }

  // What Claude gets to see about a trail. Nothing else.
  function factsFor(r, center, ask) {
    const near = Math.min(...r.lines.flat().map((p) => AskMap.dist(center, p))) / 1000;
    const f = {
      id: String(r.id),
      name: r.tags.name || r.tags.ref || 'Unnamed trail',
      network: { iwn: 'international', nwn: 'national', rwn: 'regional', lwn: 'local' }[r.tags.network] || null,
      km: Math.round(r.km * 10) / 10,
      hours_naismith: Math.round(r.hours * 10) / 10,
      climb_up_m: r.profile.up, climb_down_m: r.profile.down,
      highest_m: r.profile.top ? Math.round(r.profile.top.ele) : null,
      loop: r.loop,
      pieces: r.lines.length,
      nearest_km_from_place: Math.round(near * 10) / 10,
      lakes_within_200m: r.lakes.map((l) => l.name).slice(0, 8),
      sea_within_150m: r.sea,
      viewpoints: r.viewpoints,
      peaks: r.peaks.map((p) => [p.name, p.ele && `${p.ele} m`].filter(Boolean).join(' ') || 'unnamed').slice(0, 5),
      shelters: r.shelters,
      bathing_places: r.bathing,
      huts: r.huts.slice(0, 3),
      description: r.tags.description || null,
    };
    if (r.sun) Object.assign(f, {
      [`${r.sun.word.toLowerCase()}_time`]: r.sun.time || null,
      [`${r.sun.word.toLowerCase()}_direction`]: AskMap.compass(r.sun.dir),
      land_above_horizon_toward_it_deg: r.sun.horizonDeg,
      most_open_point_km_along: r.sun.spot && r.sun.spot.km != null ? Math.round(r.sun.spot.km * 10) / 10 : null,
      lakes_lying_toward_it: r.sun.lakes,
    });
    return f;
  }

  // ---------- Showing the answer ----------
  function render(picked, offline, read, center, ask, sun) {
    const said = [];
    if (read.understood) said.push(`<p class="big">${esc(read.understood)}</p>`);
    else said.push(`<p class="big">Looking for ${ask.shape === 'loop' ? 'a loop' : 'a walk'} of about ${ask.km ? fmtKm(ask.km) : fmtH(ask.hours)} near ${esc(center.name.split(',')[0])}${ask.wants.length ? `, with ${esc(list(ask.wants.map((w) => WANT_WORDS[w] || w)))}` : ''}.</p>`);
    if (!read.hours && !read.km) said.push(`<p class="muted">No length was given, so it looked for about ${DEFAULT_HOURS} hours.</p>`);
    if (picked && picked.summary) said.push(`<p>${esc(picked.summary)}</p>`);
    if (picked && picked.missing) said.push(`<p>${esc(picked.missing)}</p>`);
    if (read.cannot_check && read.cannot_check.length) said.push(`<p class="muted">A map can’t tell: ${esc(list(read.cannot_check))}.</p>`);
    if (offline) said.push(`<p class="muted">Claude isn’t connected here right now, so the request was read with simple patterns and the trails are ranked by the map facts alone, with no notes.</p>`);
    if (result.order.some((r) => r.sun)) said.push(`<p class="muted">Elevation data has no trees or buildings, so an open horizon on the map can still be hidden by forest.${read.time_zone ? '' : ' Times are in your own time zone.'}</p>`);
    if (sun.polar) said.push(`<p class="muted">The sun doesn’t set there that day.</p>`);
    $('said').innerHTML = said.join('');

    const picks = $('picks');
    picks.replaceChildren();
    result.order.forEach((r, i) => {
      const el = document.createElement('article');
      el.className = 'pick';
      const stats = [fmtKm(r.km), `about ${fmtH(r.hours)}`, `${r.profile.up} m up`, r.loop ? 'loop' : r.lines.length > 1 ? `one-way, in ${r.lines.length} pieces` : 'one-way'];
      const map_ = [];
      if (r.lakes.length) map_.push(`Passes within 200 m of ${esc(list(r.lakes.slice(0, 3).map((l) => l.name)))}${r.lakes.length > 3 ? ` and ${r.lakes.length - 3} more` : ''}.`);
      if (r.sea) map_.push('Runs along the sea.');
      if (r.viewpoints) map_.push(`${r.viewpoints} mapped viewpoint${r.viewpoints > 1 ? 's' : ''}.`);
      const named = r.peaks.filter((p) => p.name);
      if (named.length) map_.push(`Goes by ${esc(list(named.slice(0, 2).map((p) => p.name)))}.`);
      if (r.profile.top) map_.push(`Highest point ${Math.round(r.profile.top.ele)} m.`);
      if (r.shelters) map_.push(`${r.shelters} shelter${r.shelters > 1 ? 's' : ''} on the way.`);
      if (r.bathing) map_.push('A mapped bathing place.');
      if (r.sun) {
        const where = r.sun.spot && r.sun.spot.km != null ? ` from about ${fmtKm(r.sun.spot.km)} in` : ' from its highest point';
        const d = r.sun.horizonDeg;
        const land = d == null ? '' : d <= 0 ? ` Looking that way${where}, the land stays below the horizon.` : d < 1 ? ` Looking that way${where}, the land rises only ${d}° above the horizon.` : ` Even at the most open point${where}, the land rises ${d}° above the horizon that way.`;
        map_.push(`${r.sun.word} ${r.sun.time}, to the ${AskMap.compass(r.sun.dir)}.${land}`);
        if (r.sun.lakes.length) map_.push(`${esc(list(r.sun.lakes))} lie${r.sun.lakes.length > 1 ? '' : 's'} toward the ${r.sun.word.toLowerCase()}.`);
      }
      const n = r.note;
      el.innerHTML = `
        <button type="button" aria-pressed="false">
          <span class="label num">${i + 1}</span>
          <span class="name">${esc(r.tags.name || r.tags.ref || 'Unnamed trail')}</span>
          <span class="label muted stats">${stats.join(' · ')}</span>
        </button>
        ${n && n.why ? `<p>${esc(n.why)}</p>` : ''}
        ${map_.length ? `<div><span class="label muted kind">From the map</span><ul>${map_.map((m) => `<li>${m}</li>`).join('')}</ul></div>` : ''}
        ${n && n.guesses.length ? `<div><span class="label muted kind">Claude’s guesses</span><ul class="guess">${n.guesses.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
        ${n && n.watch ? `<p class="watch">${esc(n.watch)}</p>` : ''}
        <a class="muted osm" href="https://www.openstreetmap.org/relation/${r.id}" target="_blank" rel="noopener">See it on OpenStreetMap</a>`;
      el.querySelector('button').addEventListener('click', () => choose(r, true));
      picks.append(el);
    });
    choose(selected, false);
  }

  function choose(r, zoom) {
    selected = r;
    [...$('picks').children].forEach((el, i) => {
      const on = result.order[i] === r;
      el.classList.toggle('on', on);
      el.querySelector('button').setAttribute('aria-pressed', String(on));
    });
    if (zoom && r) fit([r]);
    map.redraw();
  }

  // ---------- Form ----------
  EXAMPLES.forEach((x) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = x;
    b.addEventListener('click', () => { $('q').value = x; run(x); });
    $('examples').append(b);
  });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); const q = $('q').value.trim(); if (q) run(q); });
})();
