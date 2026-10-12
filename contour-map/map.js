/* Contour map of anywhere: real elevation drawn as contour lines by one WebGL2 fragment shader.
   Elevation comes from the open Terrain Tiles (Terrarium PNGs: height = R * 256 + G + B / 256 - 32768 metres).
   Tiles are decoded to metres in JavaScript and packed into one float texture; the shader samples it
   bilinearly, draws a line wherever the height crosses a multiple of the interval, and shades the slopes
   by a sun you can turn. The contour at the height under your pointer lights in the accent ("Here").
   Usage: const m = ContourMap.mount(canvas, { onChange }); m.go(lat, lon, zoom); m.set('shade', 0.6); */
(function () {
  const TILE = 256, MAXZ = 15, MINZ = 2;
  const AW = 8, AH = 6; // atlas size in tiles
  const MISSING = -100000;
  const tileURL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

  const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
precision highp float;
uniform highp sampler2D uAtlas;
uniform vec2 uRes, uCenter, uOrigin;
uniform float uScale, uMpp, uInterval, uHere, uHereOn, uSun, uShade, uWarm, uLine;
out vec4 outColor;
const vec3 INK = vec3(0.04, 0.04, 0.045);
const vec3 ACCENT = vec3(0.945, 0.267, 0.114);

// Bilinear height in metres at a screen position (device pixels, y down). Missing tiles return a large negative.
float height(vec2 s) {
  vec2 a = uCenter + (s - 0.5 * uRes) / uScale - uOrigin - 0.5;
  vec2 i = floor(a), f = a - i;
  ivec2 c = ivec2(i);
  ivec2 lim = ivec2(${AW * TILE - 1}, ${AH * TILE - 1});
  float h00 = texelFetch(uAtlas, clamp(c, ivec2(0), lim), 0).r;
  float h10 = texelFetch(uAtlas, clamp(c + ivec2(1, 0), ivec2(0), lim), 0).r;
  float h01 = texelFetch(uAtlas, clamp(c + ivec2(0, 1), ivec2(0), lim), 0).r;
  float h11 = texelFetch(uAtlas, clamp(c + ivec2(1, 1), ivec2(0), lim), 0).r;
  if (min(min(h00, h10), min(h01, h11)) < -50000.0) return -100000.0;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

// Distance in device pixels from this pixel to the nearest crossing of height v.
float lineAt(float e, float g, float v, float w) {
  float d = abs(e - v) / g;
  return 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.0, d);
}

void main() {
  vec2 s = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float e = height(s);
  if (e < -50000.0) { outColor = vec4(INK, 1.0); return; }
  float ex = height(s + vec2(1.0, 0.0)) - e;
  float ey = e - height(s + vec2(0.0, 1.0)); // north is up
  float g = max(length(vec2(ex, ey)), 1e-4);

  // Light: a sun at 35 degrees, turned by uSun (0 = from the north, clockwise).
  vec3 n = normalize(vec3(-ex / uMpp * 3.0, -ey / uMpp * 3.0, 1.0)); // relief exaggerated three times, as hill shading usually is
  float alt = radians(35.0), az = uSun * 6.2832;
  vec3 L = vec3(sin(az) * cos(alt), cos(az) * cos(alt), sin(alt));
  float lit = clamp(dot(n, L), 0.0, 1.0);
  float level0 = sin(alt);
  vec3 light = mix(vec3(0.95, 0.94, 0.92), vec3(1.0, 0.62, 0.32), uWarm);
  vec3 base = vec3(0.055, 0.055, 0.06);
  vec3 col = base + light * uShade * 0.5 * max(lit - level0, 0.0);
  col -= base * uShade * clamp((level0 - lit) * 2.0, 0.0, 1.0);
  bool sea = e <= 0.0 && g < 0.05;
  if (sea) col = vec3(0.03, 0.04, 0.055);

  // Contours: thin every interval, thick every five.
  float x = e / uInterval;
  float d = abs(fract(x - 0.5) - 0.5) * uInterval / g;
  bool major = mod(floor(x + 0.5), 5.0) < 0.5;
  float w = uLine * (major ? 1.7 : 1.0);
  // No lines on the sea, or on ground so flat that every pixel would sit on one.
  float line = (1.0 - smoothstep(w * 0.5, w * 0.5 + 1.0, d)) * (sea || e < -0.5 || g < 0.02 ? 0.0 : 1.0);
  vec3 ink = mix(vec3(1.0), light, uWarm * 0.7);
  col = mix(col, ink * (major ? 0.6 : 0.34), line * (major ? 0.9 : 0.75));

  // Here: the one line at the height under your pointer.
  float here = lineAt(e, g, uHere, uLine * 1.8) * uHereOn;
  col = mix(col, ACCENT, here);
  col += ACCENT * 0.1 * uHereOn * exp(-abs(e - uHere) / g / (uLine * 6.0));
  outColor = vec4(col, 1.0);
}`;

  // Web Mercator, as 0..1 across the world.
  const mx = (lon) => (lon + 180) / 360;
  const my = (lat) => { const s = Math.sin((lat * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const lonOf = (x) => x * 360 - 180;
  const latOf = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

  function mount(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    const api = { go() {}, set() {}, zoomBy() {}, panBy() {}, state: null };
    if (!gl) { canvas.classList.add('no-gl'); opts.onError && opts.onError('This needs WebGL2, which this browser does not have.'); return api; }

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uAtlas', 'uRes', 'uCenter', 'uOrigin', 'uScale', 'uMpp', 'uInterval', 'uHere', 'uHereOn', 'uSun', 'uShade', 'uWarm', 'uLine'].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

    const atlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, AW * TILE, AH * TILE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const blank = new Float32Array(TILE * TILE).fill(MISSING);

    // Tiles: fetched once, decoded to metres, kept.
    const cache = new Map(); // key -> { data: Float32Array | null, max, min }
    const decoder = document.createElement('canvas');
    decoder.width = decoder.height = TILE;
    const dctx = decoder.getContext('2d', { willReadFrequently: true });
    function tile(z, x, y) {
      const n = 1 << z;
      const key = `${z}/${((x % n) + n) % n}/${y}`;
      let t = cache.get(key);
      if (t) return t;
      t = { data: null };
      cache.set(key, t);
      if (y < 0 || y >= n) return t;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        dctx.drawImage(img, 0, 0);
        const px = dctx.getImageData(0, 0, TILE, TILE).data;
        const data = new Float32Array(TILE * TILE);
        for (let i = 0; i < data.length; i++) data[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
        t.data = data;
        dirty = true;
        request();
      };
      img.onerror = () => { t.failed = true; };
      img.src = tileURL(z, ((x % n) + n) % n, y);
      return t;
    }

    const view = { x: mx(13.07), y: my(67.93), zoom: 12 };
    const dial = { density: 0.35, shade: 0.6, sun: 0.875, warm: 0 };
    const here = { on: 0, target: 0, h: 0 };
    let placed = null; // the atlas layout last uploaded
    let dirty = true, raf = 0, last = 0, interval = 20;

    function layout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const z = Math.max(MINZ, Math.min(MAXZ, Math.floor(view.zoom)));
      const k = Math.pow(2, view.zoom - z); // css px per tile px
      const S = TILE * (1 << z);
      const cx = view.x * S, cy = view.y * S;
      const x0 = Math.floor((cx - W / 2 / k) / TILE), x1 = Math.floor((cx + W / 2 / k) / TILE);
      const y0 = Math.floor((cy - H / 2 / k) / TILE), y1 = Math.floor((cy + H / 2 / k) / TILE);
      return { dpr, W, H, z, k, S, cx, cy, x0, y0, nx: Math.min(AW, x1 - x0 + 1), ny: Math.min(AH, y1 - y0 + 1) };
    }

    function upload(L) {
      gl.bindTexture(gl.TEXTURE_2D, atlas);
      for (let j = 0; j < AH; j++) for (let i = 0; i < AW; i++) {
        const t = i < L.nx && j < L.ny ? tile(L.z, L.x0 + i, L.y0 + j) : null;
        gl.texSubImage2D(gl.TEXTURE_2D, 0, i * TILE, j * TILE, TILE, TILE, gl.RED, gl.FLOAT, t && t.data ? t.data : blank);
      }
      placed = `${L.z}/${L.x0}/${L.y0}/${L.nx}/${L.ny}`;
    }

    // Height in metres at a canvas point (css px), from the decoded tiles; null where nothing has loaded.
    function heightAt(px, py, L = layout()) {
      const wx = L.cx + (px - L.W / 2) / L.k, wy = L.cy + (py - L.H / 2) / L.k;
      const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
      const t = cache.get(`${L.z}/${((tx % (1 << L.z)) + (1 << L.z)) % (1 << L.z)}/${ty}`);
      if (!t || !t.data) return null;
      const ix = Math.min(TILE - 1, Math.floor(wx - tx * TILE)), iy = Math.min(TILE - 1, Math.floor(wy - ty * TILE));
      return t.data[iy * TILE + ix];
    }

    // What's in view: lowest and highest point, and a contour interval that gives a readable number of lines.
    function survey(L) {
      let lo = Infinity, hi = -Infinity, hiAt = null, any = false;
      const step = 4;
      for (let py = 0; py < L.H; py += step) for (let px = 0; px < L.W; px += step) {
        const h = heightAt(px, py, L);
        if (h == null) continue;
        any = true;
        if (h < lo) lo = h;
        if (h > hi) { hi = h; hiAt = [px, py]; }
      }
      if (!any) return null;
      const span = Math.max(hi - Math.max(lo, 0), 1);
      const want = span / (14 + 40 * dial.density);
      const iv = NICE.find((v) => v >= want) || 1000;
      return { lo, hi, hiAt, interval: iv };
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); dirty = true; }
    }

    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      resize();
      const L = layout();
      const key = `${L.z}/${L.x0}/${L.y0}/${L.nx}/${L.ny}`;
      if (dirty || key !== placed) {
        upload(L);
        const s = survey(L);
        if (s) { interval = s.interval; opts.onChange && opts.onChange({ ...s, lat: latOf(view.y), lon: lonOf(view.x), zoom: view.zoom }); }
        dirty = false;
      }
      here.on += (here.target - here.on) * (1 - Math.pow(0.0005, dt));
      const mpp = (40075016.686 * Math.cos((latOf(view.y) * Math.PI) / 180)) / L.S / (L.k * L.dpr);
      gl.uniform1i(U.uAtlas, 0);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform2f(U.uCenter, L.cx, L.cy);
      gl.uniform2f(U.uOrigin, L.x0 * TILE, L.y0 * TILE);
      gl.uniform1f(U.uScale, L.k * L.dpr);
      gl.uniform1f(U.uMpp, mpp);
      gl.uniform1f(U.uInterval, interval);
      gl.uniform1f(U.uHere, here.h);
      gl.uniform1f(U.uHereOn, here.on);
      gl.uniform1f(U.uSun, dial.sun);
      gl.uniform1f(U.uShade, dial.shade);
      gl.uniform1f(U.uWarm, dial.warm);
      gl.uniform1f(U.uLine, L.dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (Math.abs(here.target - here.on) > 0.002) request();
    }
    const request = () => { if (!raf) raf = requestAnimationFrame(frame); };

    // Pointer: drag to pan, wheel or pinch to zoom, hover (or tap) to light the line at that height.
    const host = canvas.parentElement;
    const pts = new Map();
    let moved = 0, pinch = 0;
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function point(px, py) {
      const h = heightAt(px, py);
      if (h == null || h < 0) { here.target = 0; opts.onHere && opts.onHere(null); }
      else { here.h = h; here.target = 1; opts.onHere && opts.onHere(h); }
      request();
    }
    function zoomAt(px, py, by) {
      const before = layout();
      const wx = (before.cx + (px - before.W / 2) / before.k) / before.S, wy = (before.cy + (py - before.H / 2) / before.k) / before.S;
      view.zoom = Math.max(MINZ, Math.min(MAXZ + 1.5, view.zoom + by));
      const L = layout();
      view.x = wx - (px - L.W / 2) / L.k / L.S;
      view.y = Math.max(0, Math.min(1, wy - (py - L.H / 2) / L.k / L.S));
      dirty = true; request();
    }
    host.addEventListener('pointerdown', (e) => { host.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    host.addEventListener('pointermove', (e) => {
      const p = local(e);
      if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') point(p[0], p[1]); return; }
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, p);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.log2(d / pinch));
        pinch = d; moved = 99; return;
      }
      const L = layout();
      view.x -= (p[0] - prev[0]) / L.k / L.S;
      view.y = Math.max(0, Math.min(1, view.y - (p[1] - prev[1]) / L.k / L.S));
      moved += Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]);
      if (e.pointerType === 'mouse') point(p[0], p[1]);
      dirty = true; request();
    });
    const up = (e) => {
      if (pts.has(e.pointerId) && moved < 6 && pts.size === 1) { const p = local(e); point(p[0], p[1]); }
      pts.delete(e.pointerId); pinch = 0;
    };
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
    host.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pts.size) { here.target = 0; opts.onHere && opts.onHere(null); request(); } });
    host.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomAt(p[0], p[1], -e.deltaY * (e.deltaMode ? 0.05 : 0.002)); }, { passive: false });
    new ResizeObserver(() => { dirty = true; request(); }).observe(canvas);

    api.go = (lat, lon, zoom) => { view.x = mx(lon); view.y = my(lat); if (zoom) view.zoom = zoom; here.target = 0; dirty = true; request(); };
    api.fit = (south, north, west, east) => {
      const W = canvas.clientWidth || 800, H = canvas.clientHeight || 500;
      const dx = Math.max(Math.abs(mx(east) - mx(west)), 1e-6), dy = Math.max(Math.abs(my(south) - my(north)), 1e-6);
      const zoom = Math.log2(Math.min(W / (dx * TILE), H / (dy * TILE))) - 0.2;
      api.go((south + north) / 2, (west + east) / 2, Math.max(MINZ, Math.min(13.5, zoom)));
    };
    api.set = (k, v) => { dial[k] = v; dirty = k === 'density'; request(); };
    api.zoomBy = (by) => zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, by);
    api.panBy = (dx, dy) => { const L = layout(); view.x += dx / L.k / L.S; view.y = Math.max(0, Math.min(1, view.y + dy / L.k / L.S)); dirty = true; request(); };
    api.state = () => ({ lat: latOf(view.y), lon: lonOf(view.x), zoom: view.zoom, interval });
    request();
    return api;
  }

  window.ContourMap = { mount };
})();
