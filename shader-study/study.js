/* Wires up the study page: the big stage, the eight cards, the controls and the source view.
   Works on any page that has the same markup inside [data-study] (index.html here, and the Lab page
   on arnetz.design). Needs shaders.js first. */
(function () {
  const root = document.querySelector('[data-study]');
  if (!root || !window.ShaderStudy) return;
  const $ = (s) => root.querySelector(s);
  const cards = [...root.querySelectorAll('[data-shader]')];
  const stageCanvas = $('[data-stage] canvas');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stage = ShaderStudy.create(stageCanvas, { tokens: root, shader: 'flow', still: reduce });
  const small = cards.map((c) => ShaderStudy.create(c.querySelector('canvas'), { tokens: root, shader: c.dataset.shader, still: reduce }));
  const all = [stage, ...small];

  // Pick a study: it moves onto the stage, and its source shows below the controls.
  const pick = (card) => {
    stage.setShader(card.dataset.shader);
    $('[data-name]').textContent = card.querySelector('[data-card-name]').textContent;
    $('[data-about]').textContent = card.querySelector('[data-card-about]').textContent;
    $('[data-source]').textContent = ShaderStudy.source(card.dataset.shader);
    cards.forEach((c) => c.setAttribute('aria-pressed', String(c === card)));
  };
  cards.forEach((c) => c.addEventListener('click', () => pick(c)));
  pick(cards.find((c) => c.getAttribute('aria-pressed') === 'true') || cards[0]);

  // The pointer steers the stage; let go and it drifts again.
  const steer = (e) => {
    const r = stageCanvas.getBoundingClientRect();
    stage.setPointer((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
  };
  stageCanvas.addEventListener('pointermove', steer);
  stageCanvas.addEventListener('pointerdown', steer);
  stageCanvas.addEventListener('pointerleave', () => stage.setPointer(null));

  const amount = $('[data-amount]');
  amount.addEventListener('input', () => all.forEach((s) => s.setAmount(amount.valueAsNumber / 100)));

  // Two colourways, same three roles: paper, ink and one accent.
  const PALETTES = {
    ink: { paper: '#000000', ink: '#f2f2f2', accent: '#f1441d' },
    paper: { paper: '#ffffff', ink: '#111111', accent: '#f1441d' },
  };
  const chips = [...root.querySelectorAll('[data-palette]')];
  chips.forEach((b) => b.addEventListener('click', () => {
    for (const [k, v] of Object.entries(PALETTES[b.dataset.palette])) root.style.setProperty('--sh-' + k, v);
    all.forEach((s) => s.refreshColours());
    chips.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  const freeze = $('[data-freeze]');
  const setStill = (on) => { all.forEach((s) => s.setStill(on)); freeze.setAttribute('aria-pressed', String(on)); };
  freeze.addEventListener('click', () => setStill(freeze.getAttribute('aria-pressed') !== 'true'));
  setStill(reduce);

  const copy = $('[data-copy]');
  copy.addEventListener('click', async () => {
    await navigator.clipboard?.writeText($('[data-source]').textContent).catch(() => {});
    copy.textContent = 'Copied';
    setTimeout(() => (copy.textContent = 'Copy'), 1600);
  });
})();
