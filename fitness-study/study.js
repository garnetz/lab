// A calmer fitness app: moodboard tiles and the prototype. Sample data only.
(() => {
  const M = 'https://mobbin.com/screens/';
  const S = 'fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"';
  const A = '#f1441d';

  // Each sketch is drawn from the pattern, not traced from a screen.
  const TILES = [
    {
      name: 'The ring is everywhere',
      note: 'Almost every summary leads with a ring against a goal. One ring reads at a glance; three start to compete.',
      seen: [['Apple Fitness', '527bed87-fe98-4e4d-b778-b635c9475df5'], ['Garmin Connect', 'de5cba74-06e0-4cdd-9f34-5f5f86d13533'], ['Bevel', '45777953-3f7c-40ce-8675-09b3ec5bd8fd']],
      svg: `<circle cx="100" cy="75" r="46" ${S} opacity="0.35"/><path d="M100 29a46 46 0 1 1-44 60" ${S} style="stroke:${A}"/>`,
    },
    {
      name: 'Compared to you',
      note: 'The kindest screens compare today with your own normal: “above typical Friday”, or against your 30-day average.',
      seen: [['Gentler Streak', '06f36f85-e29b-4400-ba7d-90dde3d598b0'], ['The Outsiders', '98638987-60b2-4189-bee0-cd4f04fea285']],
      svg: `<line x1="20" x2="180" y1="80" y2="80" ${S} stroke-dasharray="4 6" opacity="0.5"/><path d="M20 90 C50 70 70 100 100 82 S150 60 180 66" ${S}/><circle cx="180" cy="66" r="5" fill="${A}"/>`,
    },
    {
      name: 'The score in words',
      note: 'A number alone asks you to know the scale. “Looking stable” and “Primed” do the reading for you.',
      seen: [['Visible', '3f60710a-3d4e-4892-a146-05dc3a432fc9'], ['Tempo', 'b7ba68e7-d252-472a-ad47-8d3537d8b4a7'], ['Oura', '7e8e52c0-5cd4-4f38-973a-777301d15195']],
      svg: `<rect x="70" y="36" width="60" height="34" rx="2" ${S} opacity="0.35"/><rect x="45" y="86" width="110" height="10" rx="2" fill="${A}"/><rect x="60" y="106" width="80" height="6" rx="2" fill="currentColor" opacity="0.35"/>`,
    },
    {
      name: 'Why, in rows',
      note: 'Good explainers break a score into a few rows, each a sentence with a direction. Dense ones list every metric.',
      seen: [['Visible', '3f60710a-3d4e-4892-a146-05dc3a432fc9'], ['WHOOP', '33b30723-adc2-4efa-82d5-6c320624aff3'], ['Bevel', 'aa0c2117-bc7b-4904-bbd7-afa5558f7153']],
      svg: [0, 1, 2].map((i) => `<path d="M32 ${52 + i * 26}l8-6m-8 6l8 6" ${S}/><line x1="54" x2="${150 - i * 22}" y1="${52 + i * 26}" y2="${52 + i * 26}" ${S} opacity="0.5"/>`).join(''),
    },
    {
      name: 'Next is always shown',
      note: 'During a session the best screens keep three things: the clock, the move, and what comes next.',
      seen: [['Peloton Strength+', 'ddbad8c8-8a68-4c12-98d5-6475e8e7bb74'], ['Ladder', 'd1169c75-4219-4bf1-aa2c-f5eb8fc0187a'], ['Runna', '5f5c55bd-9cb8-4916-9e86-2953b6c6ca18']],
      svg: `${[0, 1, 2, 3, 4].map((i) => `<line x1="${24 + i * 32}" x2="${48 + i * 32}" y1="34" y2="34" ${S} ${i < 2 ? `style="stroke:${A}"` : 'opacity="0.35"'}/>`).join('')}<rect x="24" y="56" width="90" height="26" rx="2" ${S}/><line x1="24" x2="176" y1="108" y2="108" ${S} opacity="0.35"/><path d="M150 102l8 6-8 6" ${S}/>`,
    },
    {
      name: 'Rest is part of it',
      note: 'Rest shows up as its own block with its own timer. Few apps give it a different tone; most treat it as a wait.',
      seen: [['Runna', '5f5c55bd-9cb8-4916-9e86-2953b6c6ca18'], ['Google Health (Fitbit)', 'db9f6c48-cf28-40bb-92ee-fa1541ae8d8b']],
      svg: `<rect x="30" y="40" width="140" height="20" rx="2" ${S} opacity="0.35"/><rect x="30" y="68" width="140" height="20" rx="2" fill="${A}" opacity="0.25"/><rect x="30" y="96" width="140" height="20" rx="2" ${S} opacity="0.35"/>`,
    },
    {
      name: 'Confetti to finish',
      note: 'Most sessions end in confetti and a share sheet. Runna asks “How did you find this workout?” instead.',
      seen: [['Hevy', 'db9dd20e-1263-4da0-88ef-4fdca528cc6a'], ['Bevel', '5f7837bf-96da-4c5d-a614-655893f9cbf3'], ['Runna', 'b391f097-28e3-4c50-b401-dde49ed68c25']],
      svg: `${[[40, 30], [70, 50], [130, 28], [160, 54], [52, 70], [150, 84], [96, 40]].map(([x, y], i) => `<rect x="${x}" y="${y}" width="6" height="3" transform="rotate(${i * 37} ${x} ${y})" fill="currentColor" opacity="0.5"/>`).join('')}<text x="100" y="118" text-anchor="middle" fill="${A}" font-size="22" font-family="system-ui">?</text>`,
    },
    {
      name: 'Dark to do, light to read',
      note: 'Screens you glance at mid-move are mostly dark. Screens you sit and read, like readiness, are often light.',
      seen: [['Peloton', '5e244bca-5c26-4fe3-90f0-55d7d0cc2797'], ['Gymshark', 'a570ef44-15d7-442f-a8b8-bdf164199e45'], ['Fitbit', '4bc22a29-5b98-4bee-9cbc-1c9a0ab3b497']],
      svg: `<rect x="40" y="24" width="56" height="102" rx="2" fill="currentColor" opacity="0.08" ${S}/><rect x="104" y="24" width="56" height="102" rx="2" fill="#f3f0e9" opacity="0.85"/><line x1="50" x2="84" y1="50" y2="50" stroke="${A}" stroke-width="3"/>`,
    },
  ];

  const tiles = document.getElementById('tiles');
  tiles.innerHTML = TILES.map((t) => `
    <article class="tile">
      <div class="sketch"><svg viewBox="0 0 200 150" aria-hidden="true">${t.svg}</svg></div>
      <h3 class="label">${t.name}</h3>
      <p class="muted">${t.note}</p>
      <p class="seen">Seen in ${t.seen.map(([n, id]) => `<a href="${M}${id}" target="_blank" rel="noopener">${n}</a>`).join(', ')}</p>
    </article>`).join('');

  // ---- Prototype ----
  const $ = (id) => document.getElementById(id);
  const DAYS = {
    rested: {
      word: 'A strong day', compare: 'A little above your usual. The dashed line is your normal over two weeks.',
      glow: 1.15, line: [0, 2, -1, 1, 0, -2, 1, 0, 2, 1, -1, 2, 4, 7],
      why: [['↑', 'You slept longer than usual.'], ['→', 'Your resting heart rate is about normal.'], ['↓', 'Last week was lighter than usual.']],
      plan: 'Strength', sub: '25 minutes, four moves',
      blocks: [['Warm up', 'March in place', 15], ['Goblet squat', '10 reps, slow down', 25], ['Rest', 'Shake it out', 10], ['Push up', '8 reps, knees are fine', 25], ['Rest', 'Breathe out longer than in', 10], ['Split squat', '8 each side', 25], ['Cool down', 'Long, easy stretch', 15]],
    },
    usual: {
      word: 'A steady day', compare: 'About your usual. The dashed line is your normal over two weeks.',
      glow: 1, line: [0, 2, -1, 1, 0, -2, 1, 0, 2, 1, -1, 1, 0, 1],
      why: [['→', 'You slept about as long as usual.'], ['→', 'Your resting heart rate is about normal.'], ['→', 'Last week looked like most weeks.']],
      plan: 'Easy strength', sub: '20 minutes, three moves',
      blocks: [['Warm up', 'March in place', 15], ['Goblet squat', '10 reps, slow down', 25], ['Rest', 'Shake it out', 10], ['Glute bridge', '12 reps', 25], ['Rest', 'Breathe out longer than in', 10], ['Cool down', 'Long, easy stretch', 15]],
    },
    tired: {
      word: 'Take it easy today', compare: 'Below your usual. Rest counts as training too.',
      glow: 0.75, line: [0, 2, -1, 1, 0, -2, 1, 0, 2, 1, -1, -2, -4, -6],
      why: [['↓', 'You slept less than usual.'], ['↑', 'Your resting heart rate is a little higher.'], ['↑', 'Last week was harder than usual.']],
      plan: 'Mobility', sub: '15 minutes, gentle',
      blocks: [['Breathe', 'Lie down, slow breaths', 15], ['Cat and cow', 'Move with the breath', 20], ['Rest', 'Stay where you are', 10], ['Hip opener', 'Each side, no rush', 20], ['Cool down', 'Long, easy stretch', 15]],
    },
  };
  const NUDGE = { easy: 'a little harder', right: 'about the same', hard: 'a little lighter' };
  const REPLY = {
    easy: 'Good to know. Tomorrow’s suggestion will ask a little more of you.',
    right: 'That’s the sweet spot. Tomorrow keeps the same pace.',
    hard: 'Thanks for saying so. Tomorrow starts a little lighter.',
  };

  let day = 'usual', feel = null, lastFeel = null;
  const screens = { today: $('s-today'), session: $('s-session'), done: $('s-done') };
  function show(name) {
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
    document.querySelectorAll('.note').forEach((n) => n.classList.toggle('dim', n.dataset.for !== name));
    const first = screens[name].querySelector('button:not([disabled])');
    if (first && document.activeElement && document.getElementById('phone').contains(document.activeElement)) first.focus();
  }

  function renderToday() {
    const d = DAYS[day];
    $('t-word').textContent = d.word;
    $('t-compare').textContent = d.compare;
    $('t-glow').style.setProperty('--s', d.glow);
    $('t-glow').style.setProperty('--o', 0.55 + 0.45 * (d.glow - 0.75) / 0.4);
    const pts = d.line.map((v, i) => [i * (300 / (d.line.length - 1)), 30 - v * 3.2]);
    $('t-line').setAttribute('d', 'M' + pts.map((p) => p.join(' ')).join(' L'));
    const [lx, ly] = pts[pts.length - 1];
    $('t-dot').setAttribute('cx', lx); $('t-dot').setAttribute('cy', ly);
    $('t-why').innerHTML = d.why.map(([a, t]) => `<li><b aria-hidden="true">${a}</b><span>${t}</span></li>`).join('');
    $('t-plan').textContent = d.plan; $('t-plan-sub').textContent = d.sub;
    const tm = $('t-tomorrow');
    tm.hidden = !lastFeel;
    if (lastFeel) tm.textContent = `You said yesterday felt ${lastFeel === 'right' ? 'about right' : lastFeel}, so today’s suggestion is ${NUDGE[lastFeel]}.`;
  }
  document.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
    day = b.dataset.day;
    document.querySelectorAll('[data-day]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    stop(); renderToday(); show('today');
  }));

  // Session: a simple block timer.
  let i = 0, left = 0, total = 0, timer = null, paused = false, startedAt = 0, moved = 0;
  const fmt = (s) => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  function block() {
    const b = DAYS[day].blocks;
    const [name, detail, secs] = b[i];
    left = secs;
    $('x-name').textContent = name; $('x-detail').textContent = detail;
    $('x-now').classList.toggle('rest', name === 'Rest');
    $('x-next').textContent = b[i + 1] ? b[i + 1][0] : 'Done';
    $('segs').innerHTML = b.map((_, k) => `<i class="${k < i ? 'done' : ''}">${k === i ? '<b></b>' : ''}</i>`).join('');
    tick(0);
  }
  function tick(dt) {
    left -= dt;
    const secs = DAYS[day].blocks[i][2];
    $('x-timer').textContent = fmt(Math.max(0, left));
    const bar = $('segs').querySelector('b');
    if (bar) bar.style.setProperty('--p', Math.min(1, 1 - left / secs));
    if (left <= 0) next();
  }
  function next() {
    if (i < DAYS[day].blocks.length - 1) { i++; block(); } else finish();
  }
  function run() {
    let last = performance.now();
    timer = setInterval(() => { const now = performance.now(); if (!paused) { moved += (now - last) / 1000; tick((now - last) / 1000); } last = now; }, 200);
  }
  function stop() { clearInterval(timer); timer = null; }
  function finish() {
    stop();
    $('d-plan').textContent = DAYS[day].plan;
    $('d-time').textContent = fmt(Math.floor(moved));
    feel = null; $('d-reply').textContent = ''; $('home').disabled = true;
    document.querySelectorAll('[data-feel]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    show('done');
  }
  $('start').addEventListener('click', () => {
    i = 0; moved = 0; paused = false; $('pause').textContent = 'Pause';
    $('x-plan').textContent = DAYS[day].plan;
    block(); show('session'); run();
  });
  $('pause').addEventListener('click', () => { paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause'; });
  $('skip').addEventListener('click', next);
  $('end').addEventListener('click', finish);

  document.querySelectorAll('[data-feel]').forEach((b) => b.addEventListener('click', () => {
    feel = b.dataset.feel;
    document.querySelectorAll('[data-feel]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('d-reply').textContent = REPLY[feel];
    $('home').disabled = false;
  }));
  $('home').addEventListener('click', () => { lastFeel = feel; renderToday(); show('today'); });

  renderToday();
})();
