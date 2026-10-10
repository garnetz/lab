/* Shaders for interfaces. Ten small fragment shaders, each built for one moment in a real screen,
   and a tiny WebGL runner. Every shader gets the same inputs: uRes (pixels), uTime (seconds),
   uMouse (0..1, eased), uHover (0..1, eased), uTap (xy in 0..1, z = seconds since the last tap),
   three dials uA, uB, uC (0..1), and two state values uK and uE (0..1) that the screen eases between.
   Usage: const s = Shaders.mount(canvas, 'glass', { a: 0.5 });  s.to({ k: 1, e: 0 });  s.tap(0.5, 0.5); */
(function () {
  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

  const COMMON = `
precision highp float;
uniform vec2 uRes, uMouse;
uniform float uTime, uHover, uA, uB, uC, uK, uE;
uniform vec3 uTap;
const vec3 INK = vec3(0.04, 0.04, 0.045);
const vec3 PAPER = vec3(0.95, 0.94, 0.92);
const vec3 ACCENT = vec3(0.945, 0.267, 0.114);
const vec3 CALM = vec3(0.56, 0.79, 0.71);
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
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;

  const SHADERS = {
    // Behind a sign-in screen. It settles and darkens while you type (uK), so the text on top stays easy to read.
    // uA: how far the colours wander. uB: grain. uC: contrast.
    grain: `
void main() {
  vec2 p = frame();
  float t = uTime * 0.06;
  float wander = uA * (1.0 - 0.75 * uK);
  vec2 q = vec2(fbm(vec3(p * 1.1, t)), fbm(vec3(p * 1.1 + 5.2, t + 2.0)));
  float f = fbm(vec3(p * 1.3 + q * (0.6 + 2.4 * wander), t * 1.5));
  f = clamp((f - 0.5) * (0.8 + 2.2 * uC * (1.0 - 0.6 * uK)) + 0.5, 0.0, 1.0);
  vec3 dusk = vec3(0.16, 0.18, 0.32), lilac = vec3(0.62, 0.66, 0.92);
  vec3 col = mix(INK, dusk, smoothstep(0.0, 0.35, f));
  col = mix(col, ACCENT, smoothstep(0.55, 0.8, f));
  col = mix(col, mix(lilac, PAPER, 0.4), smoothstep(0.85, 1.0, f));
  col = mix(col, INK, 0.5 * uK);
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 91.0) - 0.5) * 0.28 * uB;
  gl_FragColor = vec4(col, 1.0);
}`,

    // A frosted dialog over a moving feed. uK opens it; uE turns its edge to an error.
    // uA: blur. uB: how much the edge bends light. uC: frost tint.
    glass: `
vec3 room(vec2 p) {
  vec3 col = INK;
  float t = uTime * 0.35;
  vec2 a = aspectPoint(vec2(0.5 + 0.32 * cos(t), 0.5 + 0.28 * sin(t * 1.3)));
  vec2 b = aspectPoint(vec2(0.5 + 0.3 * cos(t * 0.8 + 2.0), 0.5 + 0.3 * sin(t * 0.9 + 1.0)));
  vec2 c = aspectPoint(vec2(0.5 + 0.25 * sin(t * 1.1 + 4.0), 0.5 + 0.22 * cos(t * 0.7)));
  col += ACCENT * exp(-dot(p - a, p - a) * 14.0);
  col += vec3(0.55, 0.62, 0.95) * exp(-dot(p - b, p - b) * 12.0);
  col += CALM * exp(-dot(p - c, p - c) * 18.0) * 0.9;
  return col;
}
void main() {
  vec2 p = frame();
  float W = uRes.x / uRes.y;
  vec2 centre = vec2(W * 0.5, 0.5);
  float open = smoothstep(0.0, 1.0, uK);
  vec2 size = vec2(0.3 * W, 0.26) * (0.92 + 0.08 * open);
  float d = box(p - centre, size, 0.014);
  vec3 col = room(p) * (1.0 - 0.35 * open);
  if (d < 0.0 && open > 0.001) {
    float edge = smoothstep(-0.07, 0.0, d);
    vec2 s = p + (p - centre) * -0.35 * uB * edge;
    float r = 0.004 + 0.05 * uA;
    vec3 acc = room(s);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 2.39996;
      acc += room(s + r * sqrt((float(i) + 0.5) / 12.0) * vec2(cos(a), sin(a)));
    }
    // Darker inside than out, so the dialog's words stay readable over bright colour.
    vec3 inside = mix(acc / 13.0 * 0.55, PAPER, 0.04 + 0.12 * uC);
    inside = mix(inside, ACCENT, 0.12 * uE);
    inside += (hash(gl_FragCoord.xy) - 0.5) * 0.03 * uC;
    col = mix(col, inside, open);
  }
  float rim = (1.0 - smoothstep(0.0, px() * 1.5, abs(d))) * open;
  float sheen = smoothstep(-1.0, 1.0, (p.y - centre.y) / size.y);
  col += mix(PAPER * (0.1 + 0.3 * sheen), ACCENT * 0.9, uE) * rim;
  gl_FragColor = vec4(col, 1.0);
}`,

    // A light that follows the pointer across a dot grid, and drifts on its own when nobody is there.
    // uK presses it: the light gathers and brightens. uA: radius. uB: brightness. uC: grid size.
    spotlight: `
void main() {
  vec2 p = frame();
  vec2 drift = vec2(0.5 + 0.3 * sin(uTime * 0.4), 0.5 + 0.22 * sin(uTime * 0.53 + 1.0));
  vec2 m = aspectPoint(mix(drift, uMouse, uHover));
  float cell = mix(0.025, 0.075, uC);
  float dotR = 0.09 + 0.06 * uC;
  float dd = length(fract(p / cell) - 0.5);
  float aa = px() / cell * 1.5;
  float dotMask = 1.0 - smoothstep(dotR - aa, dotR + aa, dd);
  float rad = mix(0.12, 0.45, uA) * (1.0 - 0.45 * uK);
  float light = exp(-dot(p - m, p - m) / (rad * rad));
  float bright = (0.4 + 1.2 * uB) * (1.0 + 0.8 * uK);
  vec3 col = INK + vec3(0.16) * dotMask;
  col += mix(PAPER, ACCENT, 0.25 + 0.3 * uK) * dotMask * light * bright;
  col += mix(ACCENT, PAPER, 0.3) * light * 0.06 * (0.3 + uB) * (1.0 + uK);
  gl_FragColor = vec4(col, 1.0);
}`,

    // A loading list. The shimmer runs while loading, slows and dims when it's taking long (uE),
    // and the skeleton fades away as the real rows arrive (uK). uA: speed. uB: band width. uC: angle.
    shimmer: `
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
  float m = (1.0 - smoothstep(-px(), px(), shape)) * (1.0 - uK);
  float pos = p.x + (p.y - 0.5) * mix(-0.2, 1.0, uC);
  float sweep = fract(uTime * mix(0.12, 0.6, uA) * (1.0 - 0.6 * uE)) * (W + 1.4) - 0.7;
  float band = exp(-pow((pos - sweep) / mix(0.05, 0.3, uB), 2.0)) * (1.0 - 0.5 * uE);
  vec3 bone = vec3(0.12, 0.12, 0.13);
  gl_FragColor = vec4(mix(INK, bone + vec3(0.13) * band, m), 1.0);
}`,

    // A picture that loads progressively: coarse dithered blocks first, then finer, then the real tones (uK).
    // uA: starting block size. uB: starting tones. uC: contrast.
    dither: `
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float scene(vec2 p) {
  float t = uTime * 0.03;
  vec2 sunAt = aspectPoint(vec2(0.68, 0.66));
  float sky = smoothstep(0.2, 1.0, p.y) * 0.5;
  float hills = smoothstep(0.02, -0.02, p.y - 0.42 - 0.12 * fbm(vec3(p.x * 1.5, 0.0, 1.0)));
  float sun = exp(-dot(p - sunAt, p - sunAt) * 30.0);
  float cloud = fbm(vec3(p * vec2(1.2, 3.0) + vec2(t, 0.0), 2.0));
  return clamp(0.12 + sky * 0.7 + sun * 0.75 + cloud * 0.2 - hills * 0.3, 0.0, 1.0);
}
void main() {
  float k = smoothstep(0.0, 1.0, uK);
  float start = floor(mix(4.0, 16.0, uA));
  float size = max(1.0, floor(mix(start, 1.0, k)));
  vec2 cell = floor(gl_FragCoord.xy / size);
  vec2 p = cell * size / uRes.y;
  float l = clamp((scene(p) - 0.5) * (0.8 + 1.4 * uC) + 0.5, 0.0, 1.0);
  float levels = floor(mix(mix(3.0, 6.0, uB), 24.0, k * k));
  float q = floor(l * (levels - 1.0) + bayer8(cell)) / (levels - 1.0);
  q = mix(q, scene(frame()), smoothstep(0.85, 1.0, k));
  vec3 col = q < 0.5 ? mix(INK, ACCENT, q * 2.0) : mix(ACCENT, PAPER, q * 2.0 - 1.0);
  gl_FragColor = vec4(col, 1.0);
}`,

    // A trail map. Contour lines drift slowly and your pointer raises a hill. "Here" lights the one line
    // at your height (uK); searching draws the map denser and moving (uE).
    // uA: scale. uB: line count. uC: line strength.
    contours: `
vec2 you() { return aspectPoint(vec2(0.4, 0.42)); }
float height(vec2 p) {
  float t = uTime * (0.012 + 0.09 * uE);
  vec2 m = aspectPoint(uMouse);
  return fbm(vec3(p * mix(0.9, 2.2, uA), t)) + 0.35 * uHover * exp(-14.0 * dot(p - m, p - m));
}
void main() {
  vec2 p = frame();
  float e = px() * 1.5;
  float h = height(p);
  float g = max(length(vec2(height(p + vec2(e, 0.0)) - h, height(p + vec2(0.0, e)) - h)) / e, 1e-3);
  float n = mix(12.0, 30.0, uB) * (1.0 + 0.5 * uE);
  float x = h * n;
  float d = abs(fract(x - 0.5) - 0.5) / (g * n);
  float line = 1.0 - smoothstep(px() * 0.4, px() * 1.4, d);
  float major = step(mod(floor(x + 0.5), 5.0), 0.5);
  float ink = mix(0.16, 0.34, major) * (0.6 + 0.8 * uC) * (1.0 - 0.55 * uK);
  vec3 col = INK + vec3(0.02) * p.y + vec3(ink) * line;
  // Here: the contour through your position, in the accent.
  float dl = abs(h - height(you())) / g;
  col += ACCENT * uK * ((1.0 - smoothstep(px() * 0.5, px() * 1.6, dl)) + 0.08 * exp(-dl / (px() * 6.0)));
  gl_FragColor = vec4(col, 1.0);
}`,

    // A theme that follows the light outside: blue hour, golden hour (uK), night (uE). Low sun rims the hills,
    // the way backlight does in a photograph. uA: sun height. uB: haze. uC: flare.
    golden: `
void main() {
  vec2 p = frame();
  float W = uRes.x / uRes.y;
  float gold = uK * (1.0 - uE), night = uE;
  float hz = 0.36;
  vec2 sun = vec2(W * (0.68 + 0.1 * (uMouse.x - 0.5) * uHover), hz + mix(-0.04, mix(0.03, 0.2, uA), gold) - 0.25 * night);
  float y = clamp((p.y - hz) / (1.0 - hz), 0.0, 1.0);
  vec3 top = mix(mix(vec3(0.05, 0.07, 0.19), vec3(0.2, 0.14, 0.2), gold), vec3(0.008, 0.01, 0.018), night);
  vec3 hor = mix(mix(vec3(0.45, 0.44, 0.66), vec3(1.0, 0.56, 0.24), gold), vec3(0.05, 0.06, 0.1), night);
  vec3 col = mix(hor, top, pow(y, 0.55));
  float ds = length(p - sun);
  vec3 glowCol = mix(vec3(0.62, 0.58, 0.85), vec3(1.0, 0.62, 0.3), gold);
  col += glowCol * exp(-ds * mix(7.0, 4.5, gold)) * mix(0.35, 0.9, gold) * (1.0 - night);
  col += vec3(1.0, 0.92, 0.78) * smoothstep(0.034, 0.028, ds) * gold;
  col += vec3(1.0, 0.55, 0.25) * exp(-abs(p.y - sun.y) * 140.0) * exp(-abs(p.x - sun.x) * 1.8) * 0.5 * uC * gold;
  col = mix(col, hor, uB * 0.35 * (1.0 - y) * (1.0 - night));
  col += step(0.9975, hash(floor(gl_FragCoord.xy / 2.0))) * night * y * 0.5;
  // Hills, with a rim of light along the crest when the sun is low behind them.
  float crest = hz - 0.03 + 0.08 * fbm(vec3(p.x * 1.6, 0.0, 3.0));
  float below = crest - p.y;
  if (below > 0.0) {
    vec3 ground = mix(mix(vec3(0.07, 0.07, 0.11), vec3(0.11, 0.07, 0.05), gold), vec3(0.01), night);
    float field = fbm(vec3(p * vec2(6.0, 14.0), 1.0));
    ground += vec3(0.9, 0.5, 0.2) * field * 0.1 * gold * exp(-below * 5.0);
    float rim = exp(-below / (px() * 6.0)) * exp(-abs(p.x - sun.x) * 1.2);
    col = ground + vec3(1.0, 0.7, 0.35) * rim * (0.25 + 1.1 * gold) * (1.0 - night);
  }
  col += (hash(gl_FragCoord.xy + fract(uTime) * 50.0) - 0.5) * 0.02;
  gl_FragColor = vec4(col, 1.0);
}`,

    // A camera finding focus on a portrait. Night lights are sharp points until the subject is in focus (uK),
    // then they open into soft discs. Hunting (uE) breathes the focus in and out.
    // uA: aperture blades (round to hexagonal). uB: disc size. uC: how many lights.
    bokeh: `
vec3 lights(vec2 p, float scale, float focus, float seed) {
  vec3 col = vec3(0.0);
  vec2 g = p * scale, id = floor(g);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = id + vec2(float(i), float(j));
      float h = hash(c + seed);
      if (h > mix(0.3, 0.85, uC)) continue;
      vec2 o = vec2(hash(c + seed + 3.1), hash(c + seed + 7.7));
      o += 0.12 * vec2(sin(uTime * 0.3 + h * 20.0), cos(uTime * 0.25 + h * 13.0));
      vec2 q = (g - c - o) / scale;
      float r = mix(0.0035, 0.03 + 0.045 * uB, focus) * (0.6 + 0.8 * hash(c + seed + 1.3));
      float a = atan(q.y, q.x);
      float hex = 0.866 / cos(mod(a, 1.0472) - 0.5236);
      float d = length(q) / mix(1.0, hex, uA);
      float soft = mix(0.0015, 0.0035, focus);
      float disc = 1.0 - smoothstep(r - soft, r + soft, d);
      float rim = smoothstep(r * 0.55, r, d) * disc * 0.6 * focus;
      vec3 tint = h < 0.08 ? ACCENT : (h < 0.35 ? vec3(1.0, 0.7, 0.4) : vec3(1.0, 0.92, 0.8));
      col += tint * (disc + rim) * mix(1.4, 0.3, focus) * (0.5 + 0.5 * hash(c + seed + 9.0));
    }
  }
  return col;
}
void main() {
  vec2 p = frame();
  float focus = clamp(mix(uK, 0.5 + 0.45 * sin(uTime * 3.5), uE), 0.0, 1.0);
  vec3 col = INK + vec3(0.05, 0.035, 0.03) * (1.0 - p.y);
  col += lights(p, 5.0, focus, 0.0) + 0.7 * lights(p + 3.7, 9.0, focus * 0.8, 17.0);
  col = 1.0 - exp(-col * 1.3);
  vec2 c = frame() - aspectPoint(vec2(0.5));
  col *= 1.0 - 0.35 * dot(c, c);
  gl_FragColor = vec4(col, 1.0);
}`,

    // A shutter. Each tap flashes, and a light leak blooms in from the edge of the frame and fades,
    // like the end of a roll of film. The film look (uK) warms the tones, lifts the blacks and adds grain.
    // uA: how far the leak reaches. uB: grain. uC: warmth.
    leak: `
vec3 photo(vec2 p) {
  float t = uTime * 0.02;
  vec3 col = mix(vec3(0.78, 0.62, 0.5), vec3(0.32, 0.4, 0.55), smoothstep(0.3, 1.0, p.y));
  col += vec3(0.08) * fbm(vec3(p * vec2(1.5, 5.0) + vec2(t, 0.0), 4.0));
  float hill = 0.3 + 0.22 * fbm(vec3(p.x * 1.6, 0.0, 5.0));
  col = mix(col, vec3(0.13, 0.14, 0.12) + 0.05 * fbm(vec3(p * 12.0, 1.0)), smoothstep(0.003, -0.003, p.y - hill));
  return col;
}
void main() {
  vec2 p = frame();
  float W = uRes.x / uRes.y;
  float age = uTap.z;
  float burst = smoothstep(0.0, 0.12, age) * exp(-age * 1.1);
  float amount = burst + 0.3 * uK;
  vec3 col = photo(p);
  // Film look
  vec3 film = col * mix(vec3(1.0), vec3(1.08, 0.98, 0.84), uC) * 0.92 + vec3(0.05, 0.04, 0.03);
  col = mix(col, film, uK);
  vec2 v = p - vec2(W * 0.5, 0.5);
  col *= 1.0 - (0.15 + 0.35 * uK) * dot(v, v);
  // The leak, from the right edge
  float edge = W - p.x;
  float shape = 0.55 + 0.7 * fbm(vec3(p * vec2(1.2, 2.8), uTime * 0.15));
  float mask = exp(-edge * mix(9.0, 2.2, uA) / max(amount, 0.05)) * shape * min(amount * 1.6, 1.0);
  vec3 leakCol = mix(mix(vec3(0.85, 0.2, 0.3), ACCENT, smoothstep(0.0, 0.5, p.y)), vec3(1.0, 0.8, 0.35), smoothstep(0.5, 1.0, p.y));
  col = 1.0 - (1.0 - col) * (1.0 - leakCol * mask);
  col = mix(col, vec3(1.0), exp(-age * 14.0) * step(0.0, age) * 0.85);
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 91.0) - 0.5) * 0.2 * uB * uK;
  gl_FragColor = vec4(col, 1.0);
}`,

    // A pay button's surface. A tap sends a ring; success turns it calm (uK), an error turns it to the accent
    // and rings twice, faster (uE). uA: wave size. uB: how long it rings. uC: line count.
    ripple: `
float ring(float r, float age) {
  return exp(-pow((r - age * 0.55) / (0.08 + 0.12 * uA), 2.0)) * exp(-age * mix(2.2, 0.5, uB));
}
void main() {
  vec2 p = frame();
  vec2 dir = p - aspectPoint(uTap.xy);
  float r = length(dir);
  float age = uTap.z;
  float env = ring(r, age) + uE * ring(r, max(age - 0.18, 0.0)) * step(0.18, age);
  float wave = sin((r - age * 0.55) * mix(60.0, 22.0, uA) * (1.0 + 0.4 * uE)) * env;
  vec2 q = p + normalize(dir + 1e-4) * wave * 0.03;
  float count = floor(mix(14.0, 48.0, uC));
  float f = abs(fract(q.y * count) - 0.5) / count;
  float line = 1.0 - smoothstep(px() * 0.6, px() * 1.8, f);
  vec3 tint = mix(mix(mix(ACCENT, PAPER, 0.35), CALM, uK), ACCENT, uE);
  vec3 col = INK + vec3(0.03) * (1.0 - p.y);
  col += vec3(0.22) * line;
  col += tint * line * max(wave, 0.0) * 2.2;
  col += tint * env * 0.06;
  gl_FragColor = vec4(col, 1.0);
}`,
  };

  function mount(canvas, name, dials = {}) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    const api = { set() {}, to() {}, tap() {}, point() {}, still() {}, source: SHADERS[name] };
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
    ['uRes', 'uMouse', 'uTime', 'uHover', 'uA', 'uB', 'uC', 'uK', 'uE', 'uTap'].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

    // Dials and state values ease toward their targets, so a state change is a transition, not a cut.
    const cur = { a: 0.5, b: 0.5, c: 0.5, k: 0, e: 0, ...dials };
    const target = { ...cur };
    const mouse = [0.5, 0.5], aim = [0.5, 0.5];
    let hover = 0, hoverTarget = 0, held = false, tapAt = -10, tapPos = [0.5, 0.5];
    let t = Math.random() * 20, last = performance.now(), visible = true, still = false, raf = 0;

    const local = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; };
    const host = canvas.parentElement;
    host.addEventListener('pointermove', (e) => { if (held) return; [aim[0], aim[1]] = local(e); hoverTarget = 1; });
    host.addEventListener('pointerleave', () => { if (!held) hoverTarget = 0; });

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
      gl.uniform1f(U.uA, cur.a); gl.uniform1f(U.uB, cur.b); gl.uniform1f(U.uC, cur.c);
      gl.uniform1f(U.uK, cur.k); gl.uniform1f(U.uE, cur.e);
      gl.uniform3f(U.uTap, tapPos[0], tapPos[1], t - tapAt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // With reduced motion nothing moves on its own, but a tap still plays out.
      if (!still || t - tapAt < 6) t += dt;
      const k = 1 - Math.pow(0.001, dt);
      mouse[0] += (aim[0] - mouse[0]) * k; mouse[1] += (aim[1] - mouse[1]) * k;
      hover += (hoverTarget - hover) * (1 - Math.pow(0.02, dt));
      const s = still ? 1 : 1 - Math.pow(0.004, dt);          // about 0.8s per state change
      for (const key in target) cur[key] += (target[key] - cur[key]) * s;
      draw();
      raf = visible ? requestAnimationFrame(frame) : 0;
    }
    // Only draw while on screen.
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }).observe(canvas);
    raf = requestAnimationFrame(frame);

    api.set = (key, v) => { target[key] = v; };
    api.to = (values) => Object.assign(target, values);
    api.tap = (x, y) => { tapPos = [x, y]; tapAt = t; };
    // Hold the light on a point (a scripted hover), or pass null to give it back to the pointer.
    api.point = (xy) => { held = !!xy; if (xy) { [aim[0], aim[1]] = xy; hoverTarget = 1; } else hoverTarget = 0; };
    api.still = (b) => { still = b; };
    return api;
  }

  window.Shaders = { mount, SOURCES: SHADERS };
})();
