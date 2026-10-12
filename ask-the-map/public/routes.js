/* Ask the map: everything the page knows for a fact, worked out in the browser from open data.
   - Places from Nominatim (OpenStreetMap's search), one request per question.
   - Marked trails (OSM route relations for hiking and walking) and what lies along them, from Overpass.
   - Climb and the land toward the sunset, from the open Terrain Tiles.
   - Sunset time and direction, from NOAA's formula.
   Claude never sees anything this file didn't measure, and the page shows these numbers, not Claude's. */
(function () {
  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  const R = 6371000, rad = Math.PI / 180;

  // ---------- Requests ----------
  // Tries each public Overpass server in turn, giving each a while before moving on.
  async function overpass(query, signal, wait = 30000) {
    let last;
    for (const url of OVERPASS) {
      const ac = new AbortController();
      const stop = () => ac.abort();
      signal && signal.addEventListener('abort', stop);
      const timer = setTimeout(stop, wait);
      try {
        const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ac.signal });
        if (res.ok) return await res.json();
        last = new Error(`Overpass ${res.status}`);
      } catch (e) {
        if (signal && signal.aborted) throw e;
        last = e;
      } finally {
        clearTimeout(timer);
        signal && signal.removeEventListener('abort', stop);
      }
    }
    throw last || new Error('Overpass');
  }

  async function geocode(place, signal) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(place)}`;
    const res = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error('search');
    const [hit] = await res.json();
    return hit ? { lat: Number(hit.lat), lon: Number(hit.lon), name: hit.display_name.split(',').slice(0, 2).join(',') } : null;
  }

  // ---------- Geometry ----------
  function dist(a, b) {
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function bearing(a, b) {
    const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
    const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }
  function offset(p, km, deg) {
    const d = (km * 1000) / R, b = deg * rad, la = p.lat * rad, lo = p.lon * rad;
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return { lat: la2 / rad, lon: lo2 / rad };
  }
  const lineLength = (pts) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);
  const COMPASS = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast', 'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest'];
  const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];

  // Joins a route's ways into as few lines as possible, end to end, flipping ways as needed. Mappers don't
  // always list the ways in walking order, so each line grows from whichever unused way touches either end.
  const SKIP_ROLES = /^(alternative|excursion|approach|connection|link|platform|stop|guidepost)/;
  function chain(members) {
    const left = members
      .filter((m) => m.type === 'way' && m.geometry && m.geometry.length > 1 && !SKIP_ROLES.test(m.role || ''))
      .map((m) => m.geometry.map((g) => ({ lat: g.lat, lon: g.lon })));
    const near = (a, b) => dist(a, b) < 25;
    const lines = [];
    while (left.length) {
      const line = left.shift();
      let grew = true;
      while (grew) {
        grew = false;
        for (let i = 0; i < left.length; i++) {
          const w = left[i], head = line[0], tail = line[line.length - 1], first = w[0], last = w[w.length - 1];
          if (near(tail, first)) line.push(...w.slice(1));
          else if (near(tail, last)) line.push(...w.slice(0, -1).reverse());
          else if (near(head, last)) line.unshift(...w.slice(0, -1));
          else if (near(head, first)) line.unshift(...w.slice(1).reverse());
          else continue;
          left.splice(i, 1);
          grew = true;
          break;
        }
      }
      lines.push(line);
    }
    return lines.sort((a, b) => lineLength(b) - lineLength(a));
  }

  // ---------- Finding trails ----------
  function tagKm(tags) {
    const m = String(tags.distance || '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(km|m)?/i);
    if (!m) return null;
    const v = Number(m[1]);
    return m[2] && m[2].toLowerCase() === 'm' ? v / 1000 : v > 200 ? v / 1000 : v;
  }

  // Trails within the radius, with their tags and bounds only (cheap).
  async function nearby(center, radiusKm, signal) {
    const q = `[out:json][timeout:30];rel(around:${Math.round(radiusKm * 1000)},${center.lat.toFixed(5)},${center.lon.toFixed(5)})[route~"^(hiking|foot|walking)$"];out tags bb;`;
    const data = await overpass(q, signal);
    return data.elements.filter((e) => e.type === 'relation' && e.bounds);
  }

  // A first guess at each trail's length from its tags or its size, to choose which ones to fetch in full.
  function shortlist(list, ask, n = 10) {
    const want = ask.targetKm;
    return list
      .map((e) => {
        const b = e.bounds;
        const diag = dist({ lat: b.minlat, lon: b.minlon }, { lat: b.maxlat, lon: b.maxlon }) / 1000;
        const km = tagKm(e.tags);
        const loop = e.tags.roundtrip === 'yes';
        const est = km ?? diag * (loop ? 2.6 : 1.4);
        const fit = Math.abs(Math.log(est / want));
        const ok = km != null ? fit < Math.log(1.8) : diag < want * 1.1 && diag > want * 0.12;
        let s = -fit;
        if (ask.shape === 'loop' && loop) s += 0.3;
        if (e.tags.name) s += 0.1;
        return { e, s, ok };
      })
      .filter((x) => x.ok)
      .sort((a, b) => b.s - a.s)
      .slice(0, n)
      .map((x) => x.e);
  }

  // Full geometry for the shortlist, plus what lies along each trail.
  async function details(ids, signal) {
    const q = `[out:json][timeout:60];rel(id:${ids.join(',')});foreach->.r(.r out geom;way(r.r)->.w;(way(around.w:200)[natural=water][name];rel(around.w:200)[natural=water][name];way(around.w:150)[natural=coastline];node(around.w:150)[tourism=viewpoint];node(around.w:150)[natural=peak];nwr(around.w:150)[amenity=shelter];nwr(around.w:200)[leisure=bathing_place];nwr(around.w:300)[tourism~"^(wilderness_hut|alpine_hut)$"];);out tags center qt;);`;
    const data = await overpass(q, signal);
    const routes = [];
    let cur = null;
    for (const e of data.elements) {
      if (e.type === 'relation' && e.tags && e.tags.route && ids.includes(e.id) && e.members) {
        const lines = chain(e.members);
        const km = lines.reduce((s, l) => s + lineLength(l), 0) / 1000;
        const main = lines[0];
        const loop = e.tags.roundtrip === 'yes' || (!!main && dist(main[0], main[main.length - 1]) < 300 && lineLength(main) > 1000 * km * 0.8);
        cur = { id: e.id, tags: e.tags, lines, km, loop, lakes: new Map(), sea: false, viewpoints: 0, peaks: [], shelters: 0, huts: [], bathing: 0 };
        if (lines.length) routes.push(cur);
        continue;
      }
      if (!cur) continue;
      const t = e.tags || {};
      const at = e.center || (e.lat != null ? { lat: e.lat, lon: e.lon } : null);
      if (t.natural === 'coastline') cur.sea = true;
      else if (t.natural === 'water' && t.name) { if (!cur.lakes.has(t.name)) cur.lakes.set(t.name, { name: t.name, at, kind: t.water || 'water' }); }
      else if (t.tourism === 'viewpoint') cur.viewpoints++;
      else if (t.natural === 'peak') cur.peaks.push({ name: t.name || null, ele: Number(t.ele) || null, at });
      else if (t.amenity === 'shelter') cur.shelters++;
      else if (t.leisure === 'bathing_place') cur.bathing++;
      else if (t.tourism) cur.huts.push(t.name || 'a hut');
    }
    routes.forEach((r) => { r.lakes = [...r.lakes.values()]; });
    return routes;
  }

  // ---------- Elevation (Terrain Tiles at zoom 12, about 20–40 m a pixel) ----------
  const EZ = 12;
  const tiles = new Map();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c2d = canvas.getContext('2d', { willReadFrequently: true });
  function tile(x, y) {
    const key = `${x}/${y}`;
    if (!tiles.has(key)) {
      tiles.set(key, new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          c2d.drawImage(img, 0, 0);
          const px = c2d.getImageData(0, 0, 256, 256).data;
          const h = new Float32Array(256 * 256);
          for (let i = 0; i < h.length; i++) h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
          resolve(h);
        };
        img.onerror = () => resolve(null);
        img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${EZ}/${x}/${y}.png`;
      }));
    }
    return tiles.get(key);
  }
  function pixel(p) {
    const n = 1 << EZ, s = Math.sin(p.lat * rad);
    return [((p.lon + 180) / 360) * n * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * 256];
  }
  async function heights(points) {
    const need = new Set(points.map((p) => { const [x, y] = pixel(p); return `${Math.floor(x / 256)}/${Math.floor(y / 256)}`; }));
    await Promise.all([...need].map((k) => tile(...k.split('/').map(Number))));
    return Promise.all(points.map(async (p) => {
      const [X, Y] = pixel(p);
      const at = async (x, y) => { const t = await tile(Math.floor(x / 256), Math.floor(y / 256)); return t ? t[(y % 256) * 256 + (x % 256)] : null; };
      const x0 = Math.floor(X - 0.5), y0 = Math.floor(Y - 0.5), fx = X - 0.5 - x0, fy = Y - 0.5 - y0;
      const [a, b, c, d] = await Promise.all([at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)]);
      if ([a, b, c, d].some((v) => v == null)) return null;
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }));
  }
  // Points every `step` metres along a line.
  function resample(line, step) {
    const out = [line[0]];
    let carry = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], d = dist(a, b);
      let s = step - carry;
      while (s <= d) { const f = s / d; out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f }); s += step; }
      carry = d - (s - step);
    }
    return out;
  }

  // Climb up and down along the trail as drawn, smoothed and with a 3 m deadband so pixel noise doesn't add up.
  async function profile(route) {
    let up = 0, down = 0, top = null, low = Infinity, samples = [];
    for (const line of route.lines) {
      const pts = resample(line, 40);
      const h = await heights(pts);
      const sm = h.map((v, i) => { const w = h.slice(Math.max(0, i - 2), i + 3).filter((x) => x != null); return w.length ? w.reduce((s, x) => s + x, 0) / w.length : null; });
      let ref = null;
      sm.forEach((v, i) => {
        if (v == null) return;
        samples.push({ ...pts[i], ele: v });
        if (!top || v > top.ele) top = { ...pts[i], ele: v };
        low = Math.min(low, v);
        if (ref == null) ref = v;
        else if (v - ref > 3) { up += v - ref; ref = v; }
        else if (ref - v > 3) { down += ref - v; ref = v; }
      });
    }
    return { up: Math.round(up), down: Math.round(down), top, low: Number.isFinite(low) ? Math.round(low) : null, samples };
  }

  // How high the land rises above the horizontal, looking from a point toward a compass direction, out to 4 km.
  async function horizon(from, deg) {
    const pts = [];
    for (let km = 0.08; km <= 4; km *= 1.25) pts.push({ ...offset(from, km, deg), km });
    const h = await heights(pts);
    let max = -90;
    pts.forEach((p, i) => { if (h[i] != null) max = Math.max(max, Math.atan2(h[i] - (from.ele + 1.7), p.km * 1000) / rad); });
    return max;
  }

  // ---------- The sun ----------
  // Sunset for a day and place: the moment (ms, UTC) and the compass direction it sets in, and the same for sunrise.
  function sunset(dateStr, lat, lon) {
    const [Y, M, D] = dateStr.split('-').map(Number);
    const day = Math.floor((Date.UTC(Y, M - 1, D) - Date.UTC(Y, 0, 0)) / 864e5);
    const g = (2 * Math.PI / 365) * (day - 1);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const h0 = -0.833 * rad, la = lat * rad;
    const cosH = (Math.sin(h0) - Math.sin(la) * Math.sin(decl)) / (Math.cos(la) * Math.cos(decl));
    if (cosH < -1) return { polar: 'day' };
    if (cosH > 1) return { polar: 'night' };
    const ha = Math.acos(cosH) / rad;
    const utcMin = 720 - 4 * (lon - ha) - eqt;
    const cosA = (Math.sin(decl) - Math.sin(la) * Math.sin(h0)) / (Math.cos(la) * Math.cos(h0));
    const azimuth = 360 - Math.acos(Math.max(-1, Math.min(1, cosA))) / rad;
    const riseMin = 720 - 4 * (lon + ha) - eqt;
    return { at: Date.UTC(Y, M - 1, D) + utcMin * 60e3, azimuth, riseAt: Date.UTC(Y, M - 1, D) + riseMin * 60e3, riseAzimuth: 360 - azimuth };
  }

  // Walking time by Naismith's rule: an hour per 5 km, plus 10 minutes per 100 m up.
  const naismith = (km, up) => km / 5 + up / 600;

  // ---------- When Claude is offline: read the request with simple patterns ----------
  const WORDS = { half: 0.5, one: 1, an: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  function fallbackRead(q) {
    const s = q.toLowerCase();
    const n = (v) => (v in WORDS ? WORDS[v] : Number(String(v).replace(',', '.')));
    const hm = s.match(/(\d+(?:[.,]\d+)?|half|one|an|a|two|three|four|five|six|seven|eight)[\s-]*(?:hours?|hrs?|h)\b/);
    const km = s.match(/(\d+(?:[.,]\d+)?)\s*(?:km|kilomet)/);
    const place = q.match(/\b(?:near|around|in|outside|close to|by|from)\s+([A-ZÅÄÖÜÉ][\p{L}'’.-]*(?:[\s-]+[A-ZÅÄÖÜÉ][\p{L}'’.-]*)*)/u);
    const wants = [];
    if (/lake|sjö|pond|water/.test(s)) wants.push('lake');
    if (/\bsea\b|coast|beach|shore|ocean/.test(s)) wants.push('sea');
    if (/view|vista|lookout|panorama/.test(s)) wants.push('view');
    if (/sunset|evening light|golden hour/.test(s)) wants.push('sunset');
    if (/sunrise/.test(s)) wants.push('sunrise');
    if (/summit|peak|\btop\b|mountain/.test(s)) wants.push('summit');
    if (/swim|bath/.test(s)) wants.push('swim');
    if (/shelter|fire|grill|barbecue/.test(s)) wants.push('shelter');
    return {
      place: place ? place[1] : '',
      radius_km: /\boutside\b|within an hour/.test(s) ? 40 : 25,
      hours: hm ? n(hm[1]) : /half[\s-]day/.test(s) ? 4 : null,
      km: km ? n(km[1]) : null,
      shape: /loop|round trip|circular|back to the start/.test(s) ? 'loop' : /one[\s-]way/.test(s) ? 'one-way' : 'any',
      wants,
      date: null,
      start: null,
      time_zone: null,
      cannot_check: [],
      understood: '',
    };
  }

  window.AskMap = { overpass, geocode, nearby, shortlist, details, profile, horizon, heights, sunset, naismith, fallbackRead, dist, bearing, offset, compass, resample, tagKm };
})();
