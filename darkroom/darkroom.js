/* Darkroom: six fragment shaders that work on a photograph, and a tiny WebGL runner.
   Each shader is one function, vec3 effect(vec2 uv), with uv the screen position from 0 to 1.
   It can read the photo with img(uv) (the photo is cropped to fill, like object-fit: cover)
   and gets the same inputs: uRes, uTime, uMouse (0..1, eased), uHover (0..1, eased) and
   three dials uA, uB, uC (0..1). uCompare fades back to the untouched photo.
   Usage: const d = Darkroom.mount(canvas, 'halation', imageElement, { a: 0.5 });  d.photo(otherImage); */
(function () {
  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

  const COMMON = `
precision highp float;
uniform sampler2D uImg;
uniform vec2 uRes, uImgRes, uMouse;
uniform float uTime, uHover, uA, uB, uC, uCompare;
vec2 cover(vec2 uv) {
  float ra = uRes.x / uRes.y, ia = uImgRes.x / uImgRes.y;
  vec2 s = ra > ia ? vec2(1.0, ia / ra) : vec2(ra / ia, 1.0);
  return (uv - 0.5) * s + 0.5;
}
vec3 img(vec2 uv) { return texture2D(uImg, cover(clamp(uv, 0.0, 1.0))).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// One unit of x and y in screen uv, so circles stay round on any aspect ratio.
vec2 aspect() { return vec2(uRes.y / uRes.x, 1.0); }
`;

  const SHADERS = {
    // Move a light across the photo. Surface direction is guessed from how brightness changes,
    // so ridges and edges catch the light. uA: strength. uB: relief. uC: warmth.
    relight: `
vec3 effect(vec2 uv) {
  vec3 c = img(uv);
  vec2 e = 2.0 / uRes;
  float dx = luma(img(uv + vec2(e.x, 0.0))) - luma(img(uv - vec2(e.x, 0.0)));
  float dy = luma(img(uv + vec2(0.0, e.y))) - luma(img(uv - vec2(0.0, e.y)));
  vec3 n = normalize(vec3(-dx * mix(4.0, 24.0, uB), -dy * mix(4.0, 24.0, uB), 1.0));
  vec2 d = (uMouse - uv) / aspect();
  vec3 L = normalize(vec3(d, 0.35));
  float diff = max(dot(n, L), 0.0);
  float fall = 1.0 / (1.0 + dot(d, d) * 6.0);
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.78, 0.5), uC);
  vec3 ambient = c * mix(0.75, 0.25, uA);
  return ambient + c * tint * diff * fall * mix(0.6, 2.4, uA);
}`,

    // Film halation: bright lights bleed a red-orange glow into the film around them,
    // the way cinema stock does. uA: threshold. uB: spread. uC: amount.
    halation: `
vec3 effect(vec2 uv) {
  vec3 c = img(uv);
  float th = mix(0.45, 0.85, uA);
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    float f = float(i) + 0.5;
    float r = sqrt(f / 32.0) * mix(0.01, 0.06, uB);
    float a = f * 2.39996;
    vec3 s = img(uv + vec2(cos(a), sin(a)) * r * aspect());
    glow += s * smoothstep(th, th + 0.15, luma(s));
  }
  glow /= 32.0;
  return c + glow * vec3(1.0, 0.32, 0.12) * mix(0.5, 3.0, uC);
}`,

    // Tilt-shift: one band stays sharp and the rest falls out of focus, so a real place reads
    // like a model. Your pointer moves the band. uA: band width. uB: blur. uC: colour.
    tiltshift: `
vec3 effect(vec2 uv) {
  float fy = mix(0.5, uMouse.y, uHover);
  float d = max(abs(uv.y - fy) - mix(0.04, 0.2, uA), 0.0);
  float r = min(d * 2.0, 1.0) * mix(0.004, 0.02, uB);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float f = float(i) + 0.5;
    float a = f * 2.39996;
    col += img(uv + vec2(cos(a), sin(a)) * sqrt(f / 24.0) * r * aspect());
  }
  col /= 24.0;
  float l = luma(col);
  col = mix(vec3(l), col, 1.0 + uC * 0.8);
  return clamp((col - 0.5) * (1.0 + uC * 0.2) + 0.5, 0.0, 1.0);
}`,

    // A film stock: split toning (cool shadows, warm highlights), lifted blacks and grain
    // that is strongest in the mid tones. uA: grain. uB: split tone. uC: fade.
    film: `
vec3 effect(vec2 uv) {
  vec3 c = img(uv);
  float l = luma(c);
  c += mix(vec3(-0.02, 0.03, 0.06), vec3(0.07, 0.03, -0.04), smoothstep(0.2, 0.8, l)) * uB * 1.6;
  c = mix(vec3(0.07, 0.065, 0.06), c, 1.0 - 0.18 * uC) + 0.04 * uC;
  float g = hash(floor(gl_FragCoord.xy / 1.5) + fract(uTime * 24.0) * 97.0) - 0.5;
  c += g * uA * 0.22 * (1.0 - abs(l - 0.5) * 1.2);
  return c;
}`,

    // Sun rays: light streams from your pointer through the bright gaps in the photo.
    // uA: length. uB: strength. uC: warmth.
    rays: `
vec3 effect(vec2 uv) {
  vec3 c = img(uv);
  vec2 sun = mix(vec2(0.62, 0.86), uMouse, uHover);
  vec2 dir = (sun - uv) * mix(0.3, 0.9, uA) / 40.0;
  vec2 p = uv;
  float decay = 1.0, sum = 0.0;
  for (int i = 0; i < 40; i++) {
    p += dir;
    float s = luma(img(p));
    sum += smoothstep(0.55, 0.9, s) * decay;
    decay *= 0.96;
  }
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.8, 0.5), uC);
  return c + tint * sum / 40.0 * mix(0.6, 3.0, uB);
}`,

    // Golden hour: re-time the photo from blue hour to golden hour. The light warms, the
    // highlights glow and the air fills with haze. Move across the photo to change the time.
    // uA: time of day. uB: haze. uC: glow.
    golden: `
vec3 effect(vec2 uv) {
  vec3 c = img(uv);
  float t = mix(uA, uMouse.x, uHover);
  float l = luma(c);
  vec3 blue = c * vec3(0.72, 0.82, 1.08) * 0.85;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float f = float(i) + 0.5;
    float a = f * 2.39996;
    vec3 s = img(uv + vec2(cos(a), sin(a)) * sqrt(f / 16.0) * 0.03 * aspect());
    glow += s * smoothstep(0.55, 0.9, luma(s));
  }
  glow /= 16.0;
  vec3 gold = c * vec3(1.06, 0.94, 0.76) + glow * vec3(1.0, 0.62, 0.3) * uC * 0.8;
  vec3 col = mix(blue, gold, smoothstep(0.0, 1.0, t));
  return mix(col, vec3(1.0, 0.82, 0.62) * (0.3 + l * 0.5), uB * 0.3 * t);
}`,
  };

  const MAIN = `
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = mix(effect(uv), img(uv), uCompare);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  function mount(canvas, name, image, dials = {}) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    const api = { set() {}, compare() {}, photo() {}, still() {}, source: SHADERS[name] };
    if (!gl) { canvas.classList.add('no-gl'); return api; }

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(name, gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, COMMON + SHADERS[name] + MAIN));
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uImg', 'uRes', 'uImgRes', 'uMouse', 'uTime', 'uHover', 'uA', 'uB', 'uC', 'uCompare'].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

    const tex = gl.createTexture();
    let imgSize = [1, 1], ready = false;
    function upload(im) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      imgSize = [im.naturalWidth || im.width, im.naturalHeight || im.height];
      ready = true;
    }
    const load = (im) => (im.complete && im.naturalWidth ? upload(im) : im.addEventListener('load', () => upload(im), { once: true }));
    load(image);

    // Dials ease toward their targets. Without a pointer, the light drifts on its own.
    const cur = { a: 0.5, b: 0.5, c: 0.5, compare: 0, ...dials };
    const target = { ...cur };
    const mouse = [0.5, 0.5], aim = [0.5, 0.5];
    let hover = 0, hoverTarget = 0, t = 0, last = performance.now(), visible = true, still = false, raf = 0;
    const host = canvas.parentElement;
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; };
    host.addEventListener('pointermove', (e) => { [aim[0], aim[1]] = local(e); hoverTarget = 1; });
    host.addEventListener('pointerdown', (e) => { [aim[0], aim[1]] = local(e); hoverTarget = 1; });
    host.addEventListener('pointerleave', () => { hoverTarget = 0; });

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    }
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!still) t += dt;
      if (!hoverTarget) { aim[0] = 0.5 + 0.3 * Math.cos(t * 0.35); aim[1] = 0.55 + 0.25 * Math.sin(t * 0.5); }
      const k = still ? 1 : 1 - Math.pow(0.002, dt);
      mouse[0] += (aim[0] - mouse[0]) * k; mouse[1] += (aim[1] - mouse[1]) * k;
      hover += (hoverTarget - hover) * (still ? 1 : 1 - Math.pow(0.02, dt));
      const s = still ? 1 : 1 - Math.pow(0.004, dt);
      for (const key in target) cur[key] += (target[key] - cur[key]) * s;
      if (ready) {
        resize();
        gl.uniform1i(U.uImg, 0);
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
        gl.uniform2f(U.uImgRes, imgSize[0], imgSize[1]);
        gl.uniform2f(U.uMouse, mouse[0], mouse[1]);
        gl.uniform1f(U.uTime, t);
        gl.uniform1f(U.uHover, hover);
        gl.uniform1f(U.uA, cur.a); gl.uniform1f(U.uB, cur.b); gl.uniform1f(U.uC, cur.c);
        gl.uniform1f(U.uCompare, cur.compare);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      raf = visible ? requestAnimationFrame(frame) : 0;
    }
    new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting; // newest entry wins when several arrive at once
      if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }).observe(canvas);
    raf = requestAnimationFrame(frame);

    api.set = (k, v) => { target[k] = v; };
    api.compare = (on) => { target.compare = on ? 1 : 0; };
    api.photo = (im) => { ready = false; load(im); };
    api.still = (on) => { still = on; };
    return api;
  }

  window.Darkroom = { mount, SOURCES: SHADERS };
})();
