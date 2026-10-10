/* Voice orbs, drawn with WebGL. One engine, many looks; every look reacts to the same
   conversation states: ready, listening, natural pause, thinking, speaking and mic off.
   Colours come from CSS custom properties on the element passed as `tokens`:
   --orb-deep, --orb-mid, --orb-main, --orb-light, plus --orb-listen and --orb-speak, which the
   main colour shifts to while you talk and while the assistant talks, so it is always clear whose turn it is.
   Usage: const orb = VoiceOrb.create(canvas, { look: 'mist' });  orb.setState('listening'); orb.kick(0.8);
   Looks: mist (styles 0 Mist, 1 Still water, 2 Breath light), organic, pond, water, halo, horizon,
   halftone, bloom, contour, droplets, fireflies. */
(function () {
  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

  const COMMON = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uSwirl, uLevel, uBreath, uThink, uMute, uSpeak, uStyle, uGlow;
// uSwirl only advances while it is thinking, so easing in and out of a state never makes the shape spin
uniform vec3 cDeep, cMid, cMain, cLight;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec2 coords() { return (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y)); }
float px() { return 2.0 / min(uRes.x, uRes.y); }
// A slow, low-frequency outline for the organic look
float blob(vec2 uv) {
  float a = atan(uv.y, uv.x); vec2 c = vec2(cos(a), sin(a));
  return (noise(vec3(c * 0.9, uTime * 0.18)) - 0.5) * 0.24 + (noise(vec3(c * 2.1 + 3.1, uTime * 0.3)) - 0.5) * 0.09;
}
float wobble(vec2 uv, float amt) { float a = atan(uv.y, uv.x); return (noise(vec3(cos(a) * 1.5, sin(a) * 1.5, uTime * 0.6)) - 0.5) * amt; }

// Shared ending: mic-off greys everything; a soft glow sits behind the shape.
// pc is premultiplied colour, A its alpha.
vec4 finish(vec3 pc, float A, float rad, float glowAmt) {
  vec2 uv = coords();
  float g = dot(pc, vec3(0.299, 0.587, 0.114));
  pc = mix(pc, vec3(g) * 0.55 + cMid * 0.25 * A, uMute);
  float d = max(length(uv) - rad, 0.0);
  float glow = exp(-d * 9.0) * smoothstep(1.0, 0.72, length(uv)) * glowAmt * uGlow * (0.35 + 0.25 * uBreath + 0.5 * uLevel) * (1.0 - 0.85 * uMute) * (1.0 - A);
  return vec4(pc + cMain * glow, A + glow);
}
`;

  const LOOKS = {
    // A sphere of slow mist. uStyle 1 = Still water (banded, glassy), 2 = Breath light (no edge).
    mist: `
void main() {
  vec2 uv = coords();
  float organic = step(2.5, uStyle);
  float soft = step(1.5, uStyle) * (1.0 - organic);
  float water = step(0.5, uStyle) * (1.0 - soft) * (1.0 - organic);
  float R = mix(0.62, 0.58, organic) * (1.0 + 0.05 * uBreath + 0.06 * uLevel * (1.0 - uMute)) * (1.0 - 0.06 * uThink);
  float edge = mix(wobble(uv, (0.012 + 0.07 * uLevel) * (1.0 - uMute) * (1.0 - soft)),
                   blob(uv) * (1.0 - 0.6 * uThink) * (1.0 - 0.7 * uMute) + wobble(uv, 0.1 * uLevel * (1.0 - uMute)), organic);
  float rad = R * (1.0 + edge);
  float r = length(uv) / rad;
  float aa = 3.0 / (rad * 0.5 * min(uRes.x, uRes.y));
  float mask = mix(1.0 - smoothstep(1.0 - aa, 1.0 + aa, r), 1.0 - smoothstep(0.1, 1.2, r), soft);
  float rc = min(r, 1.0);
  float z = sqrt(max(0.0, 1.0 - rc * rc));
  vec3 n = vec3(uv / rad, z);

  vec3 p = vec3(uv / rad, z * 0.9);
  p.y *= mix(1.0, 2.6, water);
  p *= 0.95;
  p.xy = rot(uThink * 2.2 * (1.0 - rc) + uSwirl * 0.8) * p.xy;
  vec3 q = vec3(fbm(p + vec3(0.0, 0.0, uTime * 0.35)), fbm(p + vec3(5.2, 1.3, -uTime * 0.3)), 0.0);
  float f = fbm(p + 1.6 * vec3(q.x, q.y, q.x) + vec3(uTime * 0.12 * water, 0.0, uTime * 0.2));

  vec3 col = mix(cMain, cLight, smoothstep(0.32, 0.74, f));
  col = mix(col, cMid, (1.0 - smoothstep(0.2, 0.52, f)) * 0.55);
  col = mix(col, cLight, 0.28 * smoothstep(0.0, 0.9, n.y) * (1.0 - soft));
  col = mix(col, mix(cMain, cMid, 0.55), 0.55 * smoothstep(0.2, -0.95, n.y) * (1.0 - soft));
  vec3 L = normalize(vec3(-0.35, 0.55, 0.75));
  col *= mix(1.0, 0.86 + 0.18 * dot(n, L), 1.0 - soft);
  col = mix(col, mix(cMain, cMid, 0.35), 0.3 * smoothstep(0.78, 1.0, r) * (1.0 - soft));
  col += cLight * pow(1.0 - z, 4.0) * (0.22 + 0.5 * uLevel) * (1.0 - soft);
  col += cLight * pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * 0.55 * water;
  col += cLight * uSpeak * uLevel * 0.55 * exp(-4.0 * r * r);
  col = mix(col, mix(col, cLight, 0.5 * exp(-3.0 * r * r) * (0.6 + 0.4 * uBreath + 0.4 * uLevel)), soft);
  col *= 1.0 - 0.25 * uThink;
  gl_FragColor = finish(col * mask, mask, rad, 1.0);
}`,

    get organic() { return this.mist; },

    // Still water seen from above: ripples flow in while you talk and out while it answers.
    pond: `
void main() {
  vec2 uv = coords(); float r = length(uv);
  float R = 0.6 * (1.0 + 0.04 * uBreath + 0.03 * uLevel);
  float disc = 1.0 - smoothstep(R - px() * 1.5, R + px() * 1.5, r);
  float env = smoothstep(0.02, 0.18, r) * (1.0 - smoothstep(R * 0.75, R * 0.98, r));
  float inward = pow(0.5 + 0.5 * cos(6.2831 * (r * 5.5 + uTime * 0.35)), 10.0);
  float outward = pow(0.5 + 0.5 * cos(6.2831 * (r * 5.5 - uTime * 0.35)), 10.0);
  float rings = mix(inward, outward, uSpeak) * env * (0.18 + 0.25 * uBreath + 0.9 * uLevel) * (1.0 - 0.8 * uThink) * (1.0 - 0.6 * uMute);
  vec3 col = mix(mix(cMid, cMain, 0.28), mix(cMid, cMain, 0.55), smoothstep(-R, R, uv.y));
  col += cLight * 0.22 * exp(-12.0 * dot((uv - vec2(-0.2, 0.25)) * vec2(1.0, 2.2), (uv - vec2(-0.2, 0.25)) * vec2(1.0, 2.2)));
  col += (cLight * 0.6 + cMain * 0.3) * rings;
  col += cLight * exp(-r * r / (0.002 + 0.004 * uBreath)) * (0.35 + 0.6 * uThink + 0.4 * uSpeak * uLevel);
  col += cLight * 0.35 * (1.0 - smoothstep(0.0, px() * 3.0, abs(r - R + px() * 2.0)));
  gl_FragColor = finish(col * disc, disc, R, 0.8);
}`,

    // A ring of light with mist flowing round it; it draws in towards a point while it thinks.
    halo: `
void main() {
  vec2 uv = coords(); float r = length(uv), ang = atan(uv.y, uv.x);
  float R = 0.46 * (1.0 + 0.05 * uBreath + 0.08 * uLevel) * (1.0 - 0.55 * uThink);
  float w = (0.07 + 0.05 * uLevel + 0.03 * uBreath) * (1.0 + 0.6 * uThink);
  float wob = (noise(vec3(cos(ang) * 1.4, sin(ang) * 1.4, uTime * 0.5)) - 0.5) * (0.03 + 0.08 * uLevel) * (1.0 - uMute);
  float Rw = R * (1.0 + wob);
  float d = abs(r - Rw) - w;
  float m = 1.0 - smoothstep(-px() * 1.5, px() * 1.5, d);
  float f = fbm(vec3(cos(ang) * 1.5, sin(ang) * 1.5, (r - Rw) * 6.0 + uTime * 0.3));
  vec3 col = mix(cMain, cLight, smoothstep(0.35, 0.75, f));
  float across = clamp(1.0 - abs(r - Rw) / max(w, 0.001), 0.0, 1.0);
  col *= 0.65 + 0.45 * across;
  col += cLight * uSpeak * uLevel * 0.4 * across;
  float inner = (1.0 - smoothstep(0.0, Rw, r)) * (0.08 + 0.25 * uSpeak * uLevel);
  gl_FragColor = finish(col * m + cMain * inner * (1.0 - m), m + inner * (1.0 - m), Rw + w, 0.8);
}`,

    // Not an orb: a soft line of light like a calm horizon, moving with each voice.
    horizon: `
void main() {
  vec2 uv = coords(); float x = uv.x;
  float span = 1.0 - smoothstep(0.55, 0.85, abs(x));
  float amp = (0.02 + 0.05 * uBreath + 0.22 * uLevel) * (1.0 - 0.9 * uMute) * (1.0 - 0.5 * uThink);
  vec3 pc = vec3(0.0); float A = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float y = amp * span * (0.6 * sin(x * (3.0 + fi * 1.7) + uTime * (1.2 + fi * 0.4) + fi * 2.0) + 1.2 * (noise(vec3(x * 2.0 + fi, uTime * 0.6, fi)) - 0.5)) * (1.0 - 0.3 * fi);
    float d = abs(uv.y - y);
    float th = px() * (1.2 + fi * 0.3) + 0.004 * uSpeak * uLevel;
    float core = 1.0 - smoothstep(th, th + px() * 1.5, d);
    float soft = exp(-d * d / (0.0012 + 0.004 * uLevel)) * 0.35;
    float s = span * (1.0 - 0.7 * uThink * smoothstep(0.0, 0.6, abs(x)));
    float o = clamp((core + soft) * s * (1.0 - fi * 0.25), 0.0, 1.0);
    pc = mix(cLight, cMain, fi / 2.0) * o + pc * (1.0 - o); A = o + A * (1.0 - o);
  }
  float bead = exp(-dot(uv, uv) / (0.002 + 0.006 * uBreath + 0.01 * uSpeak * uLevel)) * (0.6 + 0.4 * uThink);
  pc += cLight * bead * (1.0 - A); A = max(A, bead);
  gl_FragColor = finish(pc, A, 0.1, 0.0);
}`,

    // A circle of tiny dots, like printed light; voice moves through it in waves.
    halftone: `
void main() {
  vec2 uv = coords();
  float R = 0.6 * (1.0 + 0.05 * uBreath + 0.06 * uLevel);
  float cell = 0.055;
  vec2 g = uv / cell; vec2 c = (floor(g) + 0.5) * cell; vec2 f = fract(g) - 0.5;
  float rc = length(c) / R;
  float n = fbm(vec3(c * 1.6, uTime * 0.25));
  float ripple = (sin(rc * 9.0 - uTime * 2.2) * uSpeak + sin(rc * 9.0 + uTime * 2.2) * (1.0 - uSpeak) * 0.8) * uLevel * 0.2;
  float size = clamp((0.15 + 0.55 * n + 0.25 * uBreath * (1.0 - rc) + ripple) * (1.0 - smoothstep(0.8, 1.05, rc)), 0.0, 0.48);
  size *= 1.0 - 0.5 * uThink * rc;
  float aa = px() / cell * 1.5;
  float m = (1.0 - smoothstep(-aa, aa, length(f) - size)) * step(0.02, size);
  vec3 col = mix(cMain, cLight, smoothstep(0.35, 0.8, n) * (1.0 - rc * 0.3));
  gl_FragColor = finish(col * m, m, R, 0.7);
}`,

    // A floating ball of clear water. It works like a lens (the room is seen small and upside down
    // inside it), its surface sloshes in slow waves, and voice sends ripples round its edge.
    water: `
vec3 room(vec2 p) {
  vec3 c = mix(cDeep, cMid, smoothstep(-1.0, 1.0, p.y));
  c += cMain * 0.45 * exp(-dot(p, p) * 2.5);
  c += cLight * 0.55 * smoothstep(0.2, 0.75, p.y) * (1.0 - smoothstep(0.5, 1.1, abs(p.x)));   // the bright top of the room
  return c;
}
void main() {
  vec2 uv = coords(); float r = length(uv), th = atan(uv.y, uv.x);
  float R = 0.58 * (1.0 + 0.04 * uBreath + 0.03 * uLevel);
  float wob = (0.012 + 0.012 * uBreath) * cos(2.0 * th + uTime * 0.5)              // resting wobble
            + (0.05 * uLevel + 0.03 * uThink) * cos(2.0 * th + uTime * 1.3 + uSwirl * 2.0)
            + 0.035 * uLevel * cos(3.0 * th - uTime * 1.7)
            + 0.02 * uLevel * cos(4.0 * th + uTime * 2.3)
            + 0.006 * uLevel * sin(14.0 * th - uTime * 6.0);                       // fine ripples from your voice
  float rad = R * (1.0 + wob * (1.0 - 0.85 * uMute));
  float rho = r / rad;
  float aa = 3.0 / (rad * 0.5 * min(uRes.x, uRes.y));
  float mask = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, rho);
  float rc = min(rho, 1.0);
  float z = sqrt(max(0.0, 1.0 - rc * rc));
  vec3 n = normalize(vec3(uv / rad, z));

  vec2 sp = rot(uSwirl * 0.8) * (-uv * 0.9 + n.xy * 0.45);                       // seen through the lens
  sp += (vec2(noise(vec3(uv * 3.0, uTime * 0.3)), noise(vec3(uv * 3.0 + 7.0, uTime * 0.3))) - 0.5) * 0.12;
  vec3 col = mix(room(sp), cMain, 0.18);
  col = mix(col, mix(cMain, cMid, 0.3), (1.0 - z) * 0.4);                         // deeper water towards the edge
  col = mix(col, cLight, pow(1.0 - z, 3.0) * 0.5);                                 // bright rim

  vec2 dir = uv / max(r, 0.0001);
  float caustic = smoothstep(0.45, 0.92, rc) * (1.0 - smoothstep(0.92, 1.0, rc)) * pow(max(dot(dir, normalize(vec2(0.45, -0.85))), 0.0), 3.0);
  col += (cLight * 0.8 + cMain * 0.5) * caustic * (0.8 + 0.8 * uSpeak * uLevel + 0.3 * uBreath);

  vec2 hp = (uv / rad - vec2(-0.36, 0.42)) * vec2(1.0, 1.4);                       // window-shaped highlight
  float hd = length(max(abs(hp) - vec2(0.09, 0.04), 0.0)) - 0.03;
  col = mix(col, cLight, (1.0 - smoothstep(-0.01, 0.035, hd)) * 0.6);
  vec2 gp = uv / rad - vec2(0.42, -0.4);
  col += cLight * exp(-dot(gp, gp) * 400.0) * 0.6;                                  // small second glint

  col += cLight * uSpeak * uLevel * 0.35 * exp(-3.0 * rc * rc);
  col *= 1.0 - 0.15 * uThink;
  gl_FragColor = finish(col * mask, mask, rad, 0.7);
}`,

    // Three rings of translucent petals: open as you talk, fold in while it thinks.
    bloom: `
void main() {
  vec2 uv = coords();
  float r = length(uv), a0 = atan(uv.y, uv.x);
  vec3 pc = vec3(0.0); float A = 0.0;
  float open = clamp(0.55 + 0.25 * uBreath + 0.4 * uLevel - 0.45 * uThink, 0.08, 1.0) * (1.0 - 0.35 * uMute);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float n = 5.0 + fi;
    float R = 0.8 - fi * 0.2;
    float dir = mod(fi, 2.0) * 2.0 - 1.0;
    float a = a0 + uTime * (0.05 + 0.03 * fi) * dir + fi * 0.7 + uSwirl * 0.5 * dir;
    float petal = pow(abs(cos(a * n * 0.5)), 0.7);
    float edge = R * (0.32 + 0.68 * open * petal) * (1.0 + wobble(uv, 0.05 * uLevel));
    float m = 1.0 - smoothstep(edge - px() * 1.5, edge + px() * 1.5, r);
    float tip = clamp(r / max(edge, 0.001), 0.0, 1.0);
    vec3 lc = mix(mix(cMid, cMain, 0.45 + 0.2 * fi), mix(cMain, cLight, 0.35 + 0.25 * fi), tip);
    lc += cLight * (0.15 + 0.45 * uSpeak * uLevel) * (1.0 - tip) * fi * 0.5;
    float o = m * 0.82;
    pc = lc * o + pc * (1.0 - o); A = o + A * (1.0 - o);
  }
  float core = exp(-r * r / (0.012 + 0.01 * uBreath + 0.02 * uSpeak * uLevel));
  pc += cLight * core * 0.8 * (1.0 - A * 0.3); A = max(A, core * 0.8);
  pc *= 1.0 - 0.2 * uThink;
  gl_FragColor = finish(pc, A, 0.5, 0.8);
}`,

    // Fine contour lines, like a topographic map of a calm hill; voice makes them ripple.
    contour: `
void main() {
  vec2 uv = coords();
  float r = length(uv), a = atan(uv.y, uv.x);
  vec3 pc = vec3(0.0); float A = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float base = (0.1 + fi * 0.068) * (1.0 + 0.06 * uBreath) * (1.0 - 0.35 * uThink * (1.0 - fi / 8.0));
    float k = noise(vec3(cos(a) * 1.4 + fi * 0.35, sin(a) * 1.4 - fi * 0.2, uTime * 0.45 + uSwirl * 0.6 + fi * 0.25)) - 0.5;
    float amp = (0.07 + 0.14 * uLevel + 0.03 * uBreath) * (0.4 + fi * 0.12) * (1.0 - 0.85 * uMute);
    float d = abs(r - (base + amp * k));
    float w = px() * (1.1 + 1.2 * uSpeak * uLevel);
    float m = 1.0 - smoothstep(w, w + px() * 1.2, d);
    float pulse = 1.0 - uSpeak * 0.55 * (0.5 + 0.5 * sin(uTime * 2.6 - fi * 0.8));
    float o = m * pulse * (0.45 + 0.55 * (1.0 - fi / 8.0));
    pc = mix(cLight, cMain, fi / 7.0) * o + pc * (1.0 - o); A = o + A * (1.0 - o);
  }
  float body = (1.0 - smoothstep(0.55, 0.62, r)) * 0.08;
  pc += cMain * body * (1.0 - A); A += body * (1.0 - A);
  gl_FragColor = finish(pc, A, 0.6, 0.6);
}`,

    // Liquid drops orbiting a larger one: they drift apart when you speak and merge while it thinks.
    droplets: `
float fieldAt(vec2 p) {
  float f = 0.05 / max(dot(p, p), 1e-4);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float ang = (uTime + 1.4 * uSwirl) * (0.3 + 0.12 * fi) + fi * 1.5708;
    float o = (0.36 + 0.09 * sin(uTime * 0.45 + fi * 1.3) + 0.16 * uLevel + 0.04 * uBreath) * (1.0 - 0.8 * uThink) * (1.0 - 0.9 * uMute);
    vec2 c = o * vec2(cos(ang), sin(ang));
    float rr = 0.085 + 0.02 * fi;
    f += rr * rr / max(dot(p - c, p - c), 1e-4);
  }
  return f;
}
void main() {
  vec2 uv = coords();
  float f = fieldAt(uv);
  float mask = smoothstep(0.95, 1.05, f);
  // Height 1 - 1/f is smooth everywhere, so drops get a liquid dome without hot spots
  float h = 1.0 - 1.0 / f;
  vec2 g = vec2(1.0 - 1.0 / fieldAt(uv + vec2(0.004, 0.0)) - h, 1.0 - 1.0 / fieldAt(uv + vec2(0.0, 0.004)) - h) / 0.004;
  vec3 n = normalize(vec3(-g * 0.05, 1.0));
  vec3 L = normalize(vec3(-0.4, 0.6, 0.7));
  vec3 col = mix(mix(cMain, cMid, 0.4), mix(cMain, cLight, 0.25), smoothstep(0.0, 0.8, h));
  col *= 0.72 + 0.38 * max(dot(n, L), 0.0);
  col += cLight * pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * 0.7;
  col += cMain * pow(1.0 - n.z, 2.0) * 0.5;                                   // rim
  col += cLight * uSpeak * uLevel * 0.35 * smoothstep(0.4, 0.9, h);
  col *= 1.0 - 0.15 * uThink;
  float halo = smoothstep(0.35, 1.0, f) * (1.0 - mask) * (0.3 + 0.4 * uLevel) * (1.0 - 0.85 * uMute);
  gl_FragColor = finish(col * mask + cMain * halo, mask + halo, 0.42, 0.0);
}`,

    // A swarm of small lights on a slowly turning sphere: gathers to think, pulses to speak.
    fireflies: `
void main() {
  vec2 uv = coords();
  vec3 pc = vec3(0.0);
  for (int i = 0; i < 70; i++) {
    float fi = float(i);
    float h1 = hash(vec3(fi, 1.3, 7.1)), h2 = hash(vec3(fi, 3.7, 1.9)), h3 = hash(vec3(fi, 5.1, 9.3));
    float th = h1 * 6.2831 + (uTime + 2.5 * uSwirl) * (0.18 + 0.12 * h3);
    float ph = acos(2.0 * h2 - 1.0);
    float R = (0.44 + 0.06 * uBreath + 0.16 * uLevel * h3) * (1.0 - 0.62 * uThink) * (1.0 + 0.08 * uSpeak * sin(uTime * 4.0 - h1 * 9.0)) * (1.0 - 0.15 * uMute);
    vec3 p = R * vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
    p.yz = rot(0.4) * p.yz;
    float depth = clamp(p.z + 0.5, 0.0, 1.0);
    float d = length(uv - p.xy);
    float s = (0.013 + 0.02 * depth) * (1.0 + 0.5 * uLevel * h3);
    float b = exp(-d * d / (s * s)) * (0.4 + 0.6 * depth) + 0.18 * exp(-d / (s * 2.5)) * depth;
    float tw = 0.75 + 0.25 * sin(uTime * (1.5 + h3 * 2.0) + fi) * (1.0 - uMute);
    pc += mix(cMain, cLight, 0.25 + 0.65 * depth) * b * tw;
  }
  pc += cMain * 0.28 * exp(-dot(uv, uv) * 6.0) * (1.0 - 0.7 * uMute);
  float A = clamp(max(pc.r, max(pc.g, pc.b)), 0.0, 1.0);
  gl_FragColor = finish(pc, A, 0.5, 0.0);
}`
  };

  // How each conversation state feels. Values are eased between, never snapped.
  const STATES = {
    ready:     { breath: 1,  think: 0, mute: 0, speak: 0, listen: 0, flow: 0.45 },
    waiting:   { breath: .7, think: 0, mute: 0, speak: 0, listen: 1, flow: 0.55 },
    listening: { breath: .2, think: 0, mute: 0, speak: 0, listen: 1, flow: 0.9 },
    pause:     { breath: 1,  think: 0, mute: 0, speak: 0, listen: 1, flow: 0.35 },
    thinking:  { breath: 0,  think: 1, mute: 0, speak: 0, listen: 0, flow: 0.8 },
    speaking:  { breath: .1, think: 0, mute: 0, speak: 1, listen: 0, flow: 0.9 },
    muted:     { breath: 0,  think: 0, mute: 1, speak: 0, listen: 0, flow: 0.12 },
    typing:    { breath: .5, think: 0, mute: 0, speak: 0, listen: 0, flow: 0.3 }
  };
  // Looks that share a shader, and the style each one uses
  const STYLE_OF = { organic: 3 };
  const UNIFORMS = ['uRes', 'uTime', 'uSwirl', 'uLevel', 'uBreath', 'uThink', 'uMute', 'uSpeak', 'uStyle', 'uGlow', 'cDeep', 'cMid', 'cMain', 'cLight'];

  function toRgb(value) {
    const s = value.trim();
    if (s.startsWith('#')) {
      let h = s.slice(1); if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const n = parseInt(h.slice(0, 6), 16);
      return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
    }
    const m = s.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(v => v / 255) : [1, 1, 1];
  }
  // A calm breath: 4 seconds in, 6 out
  function breathAt(sec) {
    const ph = sec % 10, ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    return ph < 4 ? ease(ph / 4) : 1 - ease((ph - 4) / 6);
  }

    const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  function create(canvas, opts = {}) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
    const noop = () => {};
    if (!gl) { canvas.classList.add('orb-fallback'); return { setState: noop, kick: noop, setLevel: noop, setStyle: noop, setLook: noop, setStill: noop, setVoiceColours: noop, refreshColours: noop, destroy: noop }; }

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const tokenEl = opts.tokens || canvas;
    const programs = {};

    let tok = {};
    function readTokens() {
      const cs = getComputedStyle(tokenEl), get = v => toRgb(cs.getPropertyValue(v));
      tok = { deep: get('--orb-deep'), mid: get('--orb-mid'), main: get('--orb-main'), light: get('--orb-light') };
      tok.listen = get('--orb-listen');   // you are talking
      tok.speak = get('--orb-speak');     // the assistant is talking
    }
    readTokens();
    function colours(U) {
      gl.uniform3fv(U.cDeep, tok.deep); gl.uniform3fv(U.cMid, tok.mid); gl.uniform3fv(U.cLight, tok.light);
    }
    function program(name) {
      if (programs[name]) return programs[name];
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(name, gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, COMMON + LOOKS[name]));
      gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog);
      gl.useProgram(prog);
      const U = {}; UNIFORMS.forEach(n => (U[n] = gl.getUniformLocation(prog, n)));
      colours(U);
      return (programs[name] = { prog, U });
    }
    let look = LOOKS[opts.look] ? opts.look : 'mist';
    let active = program(look);
    const cur = { ...STATES.ready }, target = { ...STATES.ready };
    let style = opts.style || 0, glow = opts.glow == null ? 1 : opts.glow, voiceColours = opts.voiceColours !== false;
    let energy = 0, level = 0, external = null, swirl = 0, t = Math.random() * 50, still = !!opts.still, last = performance.now(), raf = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      resize();
      const k = 1 - Math.pow(0.02, dt);                 // settles in about 800ms
      for (const key in target) cur[key] += (target[key] - cur[key]) * k;
      energy *= Math.pow(0.06, dt);
      const want = still ? 0 : (external != null ? external : Math.min(1, energy));
      level += (want - level) * (1 - Math.pow(0.0003, dt));
      if (!still) { const step = dt * (0.3 + cur.flow * 0.9 + level * 1.1); t += step; swirl += step * cur.think; }

      const U = active.U;
      gl.useProgram(active.prog);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, t);
      gl.uniform1f(U.uSwirl, swirl);
      gl.uniform1f(U.uLevel, level * (1 - cur.mute));
      gl.uniform1f(U.uBreath, still ? 0.5 : breathAt(now / 1000) * cur.breath);
      gl.uniform1f(U.uThink, cur.think);
      gl.uniform1f(U.uMute, cur.mute);
      gl.uniform1f(U.uSpeak, cur.speak);
      gl.uniform1f(U.uStyle, look in STYLE_OF ? STYLE_OF[look] : style);
      const vc = voiceColours ? 1 : 0;
      gl.uniform3fv(U.cMain, mixRgb(mixRgb(tok.main, tok.listen, cur.listen * vc), tok.speak, cur.speak * vc));
      gl.uniform1f(U.uGlow, glow);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      setState(s) { Object.assign(target, STATES[s] || STATES.ready); },
      kick(a = 0.7) { energy = Math.min(1.2, energy + a); },         // one syllable of voice
      setLevel(x) { external = x; },                                  // live mic level, or null
      setStyle(i) { style = i; },                                     // mist variants
      setLook(name) { if (LOOKS[name]) { look = name; active = program(name); } },
      setStill(b) { still = b; },
      setVoiceColours(b) { voiceColours = b; },
      refreshColours() { readTokens(); Object.values(programs).forEach(p => { gl.useProgram(p.prog); colours(p.U); }); },
      destroy() { cancelAnimationFrame(raf); }
    };
  }

  window.VoiceOrb = { create, STATES: Object.keys(STATES), LOOKS: Object.keys(LOOKS) };
})();
