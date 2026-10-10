/* Shader study: eight small fragment shaders, one technique each, all drawn by one tiny WebGL engine.
   Every shader is a single function, vec3 shade(vec2 uv, vec2 m), that gets the same inputs:
   uv (the pixel, centred, the short side running from -1 to 1), m (the pointer in the same space),
   uTime, uAmount (one slider, 0 to 1) and three colours: cPaper, cInk and cAccent.
   Colours come from CSS custom properties on the element passed as `tokens`: --sh-paper, --sh-ink, --sh-accent.
   Usage: const s = ShaderStudy.create(canvas, { shader: 'flow' });  s.setAmount(0.7);  s.setPointer(0.5, 0.5);
   Shaders: grain, flow, cells, dither, blobs, moire, halftone, contours. ShaderStudy.source(name) returns one as text. */
(function () {
  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

  const COMMON = `
precision highp float;
uniform vec2 uRes, uPointer;
uniform float uTime, uAmount;
uniform vec3 cPaper, cInk, cAccent;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
#ifdef GL_OES_standard_derivatives
float aa(float x) { return fwidth(x); }
#else
float aa(float x) { return 0.04; }
#endif
`;

  // The eight studies. Each one is only the shade() function; everything above is shared.
  const SHADERS = {
    grain: `// Grain: a soft pool of light that follows you, with film grain on top.
vec3 shade(vec2 uv, vec2 m) {
  float light = smoothstep(1.6, 0.0, length(uv - m)) * (0.55 + 0.45 * uAmount);
  float grain = hash(floor(gl_FragCoord.xy) + floor(uTime * 24.0)) - 0.5;
  float v = clamp(light + grain * (0.15 + 0.35 * uAmount), 0.0, 1.0);
  return mix(cPaper, cInk, v);
}`,
    flow: `// Flow: domain warping. Noise pushes noise around, twice.
vec3 shade(vec2 uv, vec2 m) {
  vec2 p = uv * 1.6;
  float t = uTime * 0.08;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + m * 0.5), fbm(p + 3.0 * q + vec2(8.3, 2.8)));
  float f = fbm(p + (1.5 + 2.5 * uAmount) * r);
  vec3 c = mix(cPaper, cInk, smoothstep(0.25, 0.85, f));
  return mix(c, cAccent, smoothstep(0.75, 1.05, length(q)) * 0.85);
}`,
    cells: `// Cells: Voronoi. Each pixel finds its two nearest moving seeds; the edge is where they tie.
vec3 shade(vec2 uv, vec2 m) {
  vec2 p = uv * (3.0 + 4.0 * uAmount);
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = 0.5 + 0.45 * sin(uTime * 0.6 + 6.2831 * hash2(i + g));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  float edge = smoothstep(0.0, 0.06, d2 - d1);
  float near = smoothstep(0.9, 0.0, length(uv - m));
  return mix(mix(cInk, cAccent, near), cPaper, edge);
}`,
    dither: `// Dither: a soft light, drawn with only two colours through a 4x4 Bayer pattern.
vec3 shade(vec2 uv, vec2 m) {
  float size = floor(2.0 + 6.0 * uAmount);
  vec2 px = floor(gl_FragCoord.xy / size);
  vec2 c = ((px + 0.5) * size * 2.0 - uRes) / min(uRes.x, uRes.y);
  float light = smoothstep(1.8, 0.0, length(c - m)) + 0.08 * sin(uTime + c.x * 3.0);
  return light > bayer4(px) ? cInk : cPaper;
}`,
    blobs: `// Blobs: metaballs. Five orbiting fields and yours add up; the shape is where they pass 1.
vec3 shade(vec2 uv, vec2 m) {
  float f = 0.0;
  for (int k = 0; k < 5; k++) {
    float a = float(k) * 1.2566 + uTime * (0.25 + 0.05 * float(k));
    vec2 c = 0.6 * vec2(cos(a), sin(a * 1.3));
    f += 0.035 / (dot(uv - c, uv - c) + 1e-4);
  }
  f += (0.02 + 0.06 * uAmount) / (dot(uv - m, uv - m) + 1e-4);
  float body = smoothstep(1.0 - aa(f), 1.0 + aa(f), f);
  float rim = smoothstep(0.6, 0.98, f) * (1.0 - body);
  return mix(mix(cPaper, cAccent, rim), cInk, body);
}`,
    moire: `// Moiré: two sets of rings. Where they overlap, a third pattern appears that neither has.
vec3 shade(vec2 uv, vec2 m) {
  float k = 40.0 + 60.0 * uAmount;
  float a = sin(length(uv - vec2(0.25 * sin(uTime * 0.3), 0.0)) * k);
  float b = sin(length(uv - m) * k);
  float v = smoothstep(-0.2, 0.2, a) * smoothstep(-0.2, 0.2, b);
  return mix(cPaper, cInk, v);
}`,
    halftone: `// Halftone: a tilted dot grid. Each dot grows with the noise under its centre.
vec3 shade(vec2 uv, vec2 m) {
  float cells = 9.0 + 15.0 * uAmount;
  vec2 p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * uv * cells;
  vec2 c = floor(p) + 0.5;
  vec2 at = mat2(0.7071, 0.7071, -0.7071, 0.7071) * c / cells;
  float tone = fbm(at * 1.5 + uTime * 0.05) + 0.5 * smoothstep(1.2, 0.0, length(at - m)) - 0.2;
  float r = 0.55 * sqrt(clamp(tone, 0.0, 1.0));
  float d = length(p - c);
  return mix(cPaper, cInk, 1.0 - smoothstep(r - aa(d), r + aa(d), d));
}`,
    contours: `// Contours: a height map drawn as lines, like a topographic map. Your pointer raises a hill.
vec3 shade(vec2 uv, vec2 m) {
  float h = fbm(uv * 1.2 + vec2(uTime * 0.03, 0.0)) + 0.6 * exp(-3.0 * dot(uv - m, uv - m));
  float x = h * (10.0 + 14.0 * uAmount);
  float d = abs(fract(x - 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.0, aa(x) * 1.2, d);
  bool major = mod(floor(x + 0.5), 5.0) == 0.0;
  return mix(cPaper, major ? cAccent : cInk, line * (major ? 1.0 : 0.7));
}`,
  };

  const toRgb = (s) => {
    const m = s.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return [1, 1, 1];
    const n = parseInt(m[1], 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  function create(canvas, opts = {}) {
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    const noop = () => {};
    if (!gl) { canvas.classList.add('shader-fallback'); return { setShader: noop, setAmount: noop, setPointer: noop, setStill: noop, refreshColours: noop, destroy: noop }; }
    const deriv = gl.getExtension('OES_standard_derivatives');
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const tokenEl = opts.tokens || canvas;
    let colours;
    const readColours = () => {
      const cs = getComputedStyle(tokenEl);
      colours = ['--sh-paper', '--sh-ink', '--sh-accent'].map((v) => toRgb(cs.getPropertyValue(v) || '#ffffff'));
    };
    readColours();

    const programs = {};
    function program(name) {
      if (programs[name]) return programs[name];
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(name, gl.getShaderInfoLog(s));
        return s;
      };
      const frag = (deriv ? '#extension GL_OES_standard_derivatives : enable\n' : '') + COMMON + SHADERS[name] +
        '\nvoid main() { float s = min(uRes.x, uRes.y); vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / s; vec2 m = (uPointer * 2.0 - 1.0) * uRes / s; gl_FragColor = vec4(shade(uv, m), 1.0); }';
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
      gl.linkProgram(prog);
      const U = {};
      ['uRes', 'uPointer', 'uTime', 'uAmount', 'cPaper', 'cInk', 'cAccent'].forEach((u) => (U[u] = gl.getUniformLocation(prog, u)));
      return (programs[name] = { prog, U, loc: gl.getAttribLocation(prog, 'p') });
    }

    let name = SHADERS[opts.shader] ? opts.shader : 'flow';
    let amount = opts.amount ?? 0.5, shown = amount;
    let target = null, px = 0.5, py = 0.5;
    let still = !!opts.still, t = 10 + Math.random() * 20, last = performance.now(), raf = 0, visible = true;

    // Only draw while the canvas is on screen.
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => (visible = e.isIntersecting)) : null;
    io?.observe(canvas);

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) return;
      if (!still) t += dt;
      // Without a pointer the light drifts on its own, slowly.
      const [tx, ty] = target || [0.5 + 0.28 * Math.cos(t * 0.37), 0.5 + 0.24 * Math.sin(t * 0.51)];
      const k = still ? 1 : 1 - Math.exp(-dt * 6);
      px += (tx - px) * k; py += (ty - py) * k;
      shown += (amount - shown) * (still ? 1 : 1 - Math.exp(-dt * 8));

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (!w || !h) return;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      const P = program(name);
      gl.useProgram(P.prog);
      gl.enableVertexAttribArray(P.loc);
      gl.vertexAttribPointer(P.loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(P.U.uRes, w, h);
      gl.uniform2f(P.U.uPointer, px, py);
      gl.uniform1f(P.U.uTime, t);
      gl.uniform1f(P.U.uAmount, shown);
      gl.uniform3fv(P.U.cPaper, colours[0]);
      gl.uniform3fv(P.U.cInk, colours[1]);
      gl.uniform3fv(P.U.cAccent, colours[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    raf = requestAnimationFrame(frame);

    return {
      setShader(n) { if (SHADERS[n]) name = n; },
      setAmount(a) { amount = Math.max(0, Math.min(1, a)); },
      // x and y from 0 to 1, with y up; null lets it drift.
      setPointer(x, y) { target = x == null ? null : [x, y]; },
      setStill(b) { still = b; },
      refreshColours: readColours,
      destroy() { cancelAnimationFrame(raf); io?.disconnect(); },
    };
  }

  window.ShaderStudy = { create, SHADERS: Object.keys(SHADERS), source: (n) => SHADERS[n] || '' };
})();
