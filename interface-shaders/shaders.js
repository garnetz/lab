/* Shaders for interfaces. Six small fragment shaders an interface could use, and a tiny WebGL runner.
   Every shader gets the same inputs: uRes (pixels), uTime (seconds), uMouse (0..1, eased),
   uHover (0..1, eased), uTap (xy in 0..1, z = seconds since the last tap), and its own dials uA, uB, uC (0..1).
   Usage: Shaders.mount(canvas, 'grain', { a: 0.5, b: 0.4, c: 0.6 }) returns { set(name, value), still(bool) }. */
(function () {
  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

  const COMMON = `
precision highp float;
uniform vec2 uRes, uMouse;
uniform float uTime, uHover, uA, uB, uC;
uniform vec3 uTap;
const vec3 INK = vec3(0.04, 0.04, 0.045);
const vec3 PAPER = vec3(0.95, 0.94, 0.92);
const vec3 ACCENT = vec3(0.945, 0.267, 0.114);
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  vec2 o = vec2(0.0, 1.0);
  float a = hash(i.xy + i.z * 17.0), b = hash(i.xy + o.yx + i.z * 17.0), c = hash(i.xy + o.xy + i.z * 17.0), d = hash(i.xy + o.yy + i.z * 17.0);
  float e = hash(i.xy + (i.z + 1.0) * 17.0), g = hash(i.xy + o.yx + (i.z + 1.0) * 17.0), h = hash(i.xy + o.xy + (i.z + 1.0) * 17.0), k = hash(i.xy + o.yy + (i.z + 1.0) * 17.0);
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }
// Aspect-correct coordinates: y runs 0..1, x scales with the width
vec2 frame() { return gl_FragCoord.xy / uRes.y; }
vec2 aspectPoint(vec2 m) { return vec2(m.x * uRes.x / uRes.y, m.y); }
float px() { return 1.0 / uRes.y; }
`;

  const SHADERS = {
    // A slow gradient with film grain. uA: how far the colours wander. uB: grain. uC: contrast.
    grain: `
void main() {
  vec2 p = frame();
  float t = uTime * 0.06;
  vec2 q = vec2(fbm(vec3(p * 1.1, t)), fbm(vec3(p * 1.1 + 5.2, t + 2.0)));
  float f = fbm(vec3(p * 1.3 + q * (0.6 + 2.4 * uA), t * 1.5));
  f = clamp((f - 0.5) * (0.8 + 2.2 * uC) + 0.5, 0.0, 1.0);
  vec3 dusk = vec3(0.16, 0.18, 0.32), lilac = vec3(0.62, 0.66, 0.92);
  vec3 col = mix(INK, dusk, smoothstep(0.0, 0.35, f));
  col = mix(col, ACCENT, smoothstep(0.55, 0.8, f));
  col = mix(col, mix(lilac, PAPER, 0.4), smoothstep(0.85, 1.0, f));
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 91.0) - 0.5) * 0.28 * uB;
  gl_FragColor = vec4(col, 1.0);
}`,

    // A frosted panel over moving colour. uA: blur. uB: how much the edge bends light. uC: frost tint.
    glass: `
vec3 room(vec2 p) {
  vec3 col = INK;
  float t = uTime * 0.35;
  vec2 a = aspectPoint(vec2(0.5 + 0.32 * cos(t), 0.5 + 0.28 * sin(t * 1.3)));
  vec2 b = aspectPoint(vec2(0.5 + 0.3 * cos(t * 0.8 + 2.0), 0.5 + 0.3 * sin(t * 0.9 + 1.0)));
  vec2 c = aspectPoint(vec2(0.5 + 0.25 * sin(t * 1.1 + 4.0), 0.5 + 0.22 * cos(t * 0.7)));
  col += ACCENT * exp(-dot(p - a, p - a) * 14.0);
  col += vec3(0.55, 0.62, 0.95) * exp(-dot(p - b, p - b) * 12.0);
  col += vec3(0.56, 0.79, 0.71) * exp(-dot(p - c, p - c) * 18.0) * 0.9;
  return col;
}
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = frame();
  vec2 centre = aspectPoint(vec2(0.5)) + (aspectPoint(uMouse) - aspectPoint(vec2(0.5))) * 0.12 * uHover;
  vec2 size = vec2(0.42 * uRes.x / uRes.y * 0.5 + 0.1, 0.26);
  float d = box(p - centre, size, 0.06);
  vec3 col = room(p);
  if (d < 0.0) {
    float edge = smoothstep(-0.07, 0.0, d);
    vec2 bend = (p - centre) * -0.35 * uB * edge;
    vec2 s = p + bend;
    float r = 0.004 + 0.05 * uA;
    vec3 acc = room(s);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 2.39996;
      float rr = r * sqrt((float(i) + 0.5) / 12.0);
      acc += room(s + rr * vec2(cos(a), sin(a)));
    }
    vec3 inside = acc / 13.0;
    inside = mix(inside, PAPER, 0.04 + 0.16 * uC);
    inside += (hash(gl_FragCoord.xy) - 0.5) * 0.03 * uC;
    col = inside;
  }
  float rim = 1.0 - smoothstep(0.0, px() * 1.5, abs(d));
  float sheen = smoothstep(0.0, 1.0, (p.y - centre.y) / size.y);
  col += PAPER * rim * (0.12 + 0.3 * sheen);
  gl_FragColor = vec4(col, 1.0);
}`,

    // A light that follows the pointer across a dot grid, and drifts on its own when nobody is there.
    // uA: radius. uB: brightness. uC: grid size.
    spotlight: `
void main() {
  vec2 p = frame();
  vec2 drift = vec2(0.5 + 0.3 * sin(uTime * 0.4), 0.5 + 0.22 * sin(uTime * 0.53 + 1.0));
  vec2 m = aspectPoint(mix(drift, uMouse, uHover));
  float cell = mix(0.025, 0.075, uC);
  vec2 g = p / cell;
  float dotR = 0.09 + 0.06 * uC;
  float dd = length(fract(g) - 0.5);
  float aa = px() / cell * 1.5;
  float dotMask = 1.0 - smoothstep(dotR - aa, dotR + aa, dd);
  float rad = mix(0.12, 0.45, uA);
  float light = exp(-dot(p - m, p - m) / (rad * rad));
  vec3 col = INK;
  col += vec3(0.16) * dotMask;
  col += mix(PAPER, ACCENT, 0.25) * dotMask * light * (0.4 + 1.2 * uB);
  col += mix(ACCENT, PAPER, 0.3) * light * 0.06 * (0.3 + uB);
  gl_FragColor = vec4(col, 1.0);
}`,

    // A loading skeleton with a shimmer drawn on the GPU. uA: speed. uB: band width. uC: angle.
    shimmer: `
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = frame();
  float W = uRes.x / uRes.y;
  float x0 = W * 0.5 - 0.41;
  float shape = 1e3;
  for (int i = 0; i < 3; i++) {
    float y = 0.74 - float(i) * 0.24;
    shape = min(shape, length(p - vec2(x0 + 0.07, y)) - 0.07);
    shape = min(shape, box(p - vec2(x0 + 0.5, y + 0.03), vec2(0.3, 0.018), 0.018));
    shape = min(shape, box(p - vec2(x0 + 0.42 + 0.06 * float(i), y - 0.03), vec2(0.22 - 0.04 * float(i), 0.018), 0.018));
  }
  float m = 1.0 - smoothstep(-px(), px(), shape);
  float ang = mix(-0.2, 1.0, uC);
  float pos = p.x + (p.y - 0.5) * ang;
  float sweep = fract(uTime * mix(0.12, 0.6, uA)) * (W + 1.4) - 0.7;
  float w = mix(0.05, 0.3, uB);
  float band = exp(-pow((pos - sweep) / w, 2.0));
  vec3 col = INK;
  vec3 bone = vec3(0.12, 0.12, 0.13);
  col = mix(col, bone + vec3(0.13) * band, m);
  gl_FragColor = vec4(col, 1.0);
}`,

    // Ordered dithering of a slow gradient, like a print or an old screen. uA: pixel size. uB: tones. uC: contrast.
    dither: `
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  float size = floor(mix(2.0, 9.0, uA));
  vec2 cell = floor(gl_FragCoord.xy / size);
  vec2 p = cell * size / uRes.y;
  float t = uTime * 0.07;
  float l = fbm(vec3(p * 1.6, t)) * 0.7 + 0.5 * (1.0 - length(p - aspectPoint(vec2(0.5))) * 0.9);
  l = clamp((l - 0.62) * (0.8 + 2.4 * uC) + 0.4, 0.0, 1.0);
  float levels = floor(mix(2.0, 6.0, uB));
  float q = floor(l * (levels - 1.0) + bayer8(cell)) / (levels - 1.0);
  vec3 col = q < 0.5 ? mix(INK, ACCENT, q * 2.0) : mix(ACCENT, PAPER, q * 2.0 - 1.0);
  gl_FragColor = vec4(col, 1.0);
}`,

    // A surface that answers a tap with a ring of light. uA: wave size. uB: how long it rings. uC: line count.
    ripple: `
void main() {
  vec2 p = frame();
  vec2 c = aspectPoint(uTap.xy);
  float age = uTap.z;
  vec2 dir = p - c;
  float r = length(dir);
  float front = age * 0.55;
  float env = exp(-pow((r - front) / (0.08 + 0.12 * uA), 2.0)) * exp(-age * mix(2.2, 0.5, uB));
  float wave = sin((r - front) * mix(60.0, 22.0, uA)) * env;
  vec2 q = p + normalize(dir + 1e-4) * wave * 0.03;
  float count = floor(mix(14.0, 48.0, uC));
  float f = abs(fract(q.y * count) - 0.5) / count;
  float line = 1.0 - smoothstep(px() * 0.6, px() * 1.8, f);
  vec3 col = INK + vec3(0.03) * (1.0 - p.y);
  col += vec3(0.22) * line;
  col += mix(ACCENT, PAPER, 0.35) * line * max(wave, 0.0) * 2.2;
  col += ACCENT * env * 0.06;
  gl_FragColor = vec4(col, 1.0);
}`,
  };

  function mount(canvas, name, dials = {}) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    const api = { set() {}, still() {}, source: SHADERS[name] };
    if (!gl) { canvas.classList.add('no-gl'); return api; }

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(name, gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, COMMON + SHADERS[name]));
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uRes', 'uMouse', 'uTime', 'uHover', 'uA', 'uB', 'uC', 'uTap'].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

    const d = { a: 0.5, b: 0.5, c: 0.5, ...dials };
    const mouse = [0.5, 0.5], target = [0.5, 0.5];
    let hover = 0, hoverTarget = 0, tapAt = -10, tap = [0.5, 0.5];
    let t = Math.random() * 20, last = performance.now(), visible = true, still = false, raf = 0;

    const local = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; };
    canvas.addEventListener('pointermove', (e) => { [target[0], target[1]] = local(e); hoverTarget = 1; });
    canvas.addEventListener('pointerleave', () => (hoverTarget = 0));
    canvas.addEventListener('pointerdown', (e) => { tap = local(e); tapAt = t; [target[0], target[1]] = tap; hoverTarget = 1; });

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    }
    function draw() {
      resize();
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, t);
      gl.uniform2f(U.uMouse, mouse[0], mouse[1]);
      gl.uniform1f(U.uHover, hover);
      gl.uniform1f(U.uA, d.a); gl.uniform1f(U.uB, d.b); gl.uniform1f(U.uC, d.c);
      gl.uniform3f(U.uTap, tap[0], tap[1], t - tapAt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!still) t += dt;
      const k = 1 - Math.pow(0.001, dt);                     // pointer eases in over about a third of a second
      mouse[0] += (target[0] - mouse[0]) * k; mouse[1] += (target[1] - mouse[1]) * k;
      hover += (hoverTarget - hover) * (1 - Math.pow(0.02, dt));
      // With reduced motion, a ripple still answers a tap, but nothing moves on its own.
      if (still && t - tapAt < 6) t += dt;
      // The ripple taps itself every few seconds until someone does.
      if (name === 'ripple' && !still && t - tapAt > 4.5) { tap = [0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4]; tapAt = t; }
      draw();
      raf = visible ? requestAnimationFrame(frame) : 0;
    }
    // Only draw while on screen.
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }).observe(canvas);
    raf = requestAnimationFrame(frame);

    api.set = (k, v) => { d[k] = v; if (still) draw(); };
    api.still = (b) => { still = b; };
    return api;
  }

  window.Shaders = { mount, SOURCES: SHADERS };
})();
