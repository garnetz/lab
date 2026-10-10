// Playlist from a photo: the page. Shrinks the photo, reads its colours locally, asks /api/playlist
// for songs, and plays their 30-second previews one after another.
(() => {
  const $ = (id) => document.getElementById(id);
  const drop = $('drop'), file = $('file'), img = $('img'), audio = $('audio');
  const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';
  const MESSAGES = {
    offline: 'The playlist service isn’t switched on here. Run it locally with your own key to try it.',
    busy: 'Lots of photos right now. Try again in a minute.',
    default: 'Something went wrong reading that photo. Try again, or try another one.',
  };

  const status = (title, text, loading) => {
    $('status').hidden = false;
    $('status').innerHTML = `<p class="label${loading ? ' dots' : ''}"></p><p class="muted"></p>`;
    $('status').children[0].textContent = title;
    $('status').children[1].textContent = text || '';
  };

  // Shrink to at most 1280px on the long side, as a JPEG.
  async function prepare(f) {
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.src = url;
    await im.decode();
    const scale = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * scale);
    c.height = Math.round(im.naturalHeight * scale);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return { url, im, data: c.toDataURL('image/jpeg', 0.85) };
  }

  // The photo's main colours: bucket a small copy, then keep the most common ones that differ.
  function palette(im, n = 5) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0, 64, 64);
    const px = g.getImageData(0, 0, 64, 64).data;
    const buckets = new Map();
    for (let i = 0; i < px.length; i += 4) {
      const key = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4);
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += px[i]; b.g += px[i + 1]; b.b += px[i + 2];
      buckets.set(key, b);
    }
    const all = [...buckets.values()].sort((a, b) => b.n - a.n).map((b) => [b.r / b.n, b.g / b.n, b.b / b.n]);
    const out = [];
    for (const c of all) {
      if (out.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) > 48)) out.push(c);
      if (out.length === n) break;
    }
    return out.map((c) => `rgb(${c.map(Math.round).join(' ')})`);
  }

  async function choose(f) {
    if (!f || !f.type.startsWith('image/')) return;
    stop();
    $('head').hidden = true;
    $('songs').innerHTML = '';
    let prepared;
    try { prepared = await prepare(f); } catch { status('That file didn’t open', 'Try a JPEG or PNG photo.'); return; }
    img.src = prepared.url;
    img.hidden = false;
    drop.classList.add('has');
    $('again').hidden = false;
    $('swatches').innerHTML = palette(prepared.im).map((c) => `<i style="background:${c}" title="${c}"></i>`).join('');
    status('Reading the light', 'Looking at the colour, the time of day and the mood.', true);
    try {
      const res = await fetch('api/playlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: prepared.data }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.songs) { status('No playlist this time', MESSAGES[body.error] || MESSAGES.default); return; }
      if (!body.songs.length) { status('No previews found', 'Claude picked songs, but none had a preview. Try another photo.'); return; }
      show(body);
    } catch {
      status('No playlist this time', MESSAGES.offline);
    }
  }

  let list = [], current = -1;
  function show(p) {
    $('status').hidden = true;
    $('head').hidden = false;
    $('name').textContent = p.name;
    $('light').textContent = p.light;
    $('words').innerHTML = '';
    for (const w of p.words) { const s = document.createElement('span'); s.textContent = w; $('words').append(s); }
    list = p.songs;
    $('songs').innerHTML = '';
    list.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'song';
      li.style.animationDelay = `${i * 60}ms`;
      li.innerHTML = `<img alt="" loading="lazy" /><span class="meta"><a class="label title" target="_blank" rel="noopener"></a><span class="artist"></span><span class="why"></span></span><button class="play" type="button">${PLAY}</button><span class="bar"><b></b></span>`;
      if (s.artwork) li.querySelector('img').src = s.artwork; else li.querySelector('img').style.visibility = 'hidden';
      const a = li.querySelector('a'); a.textContent = s.title; a.href = s.link;
      li.querySelector('.artist').textContent = s.artist;
      li.querySelector('.why').textContent = s.why;
      const btn = li.querySelector('.play');
      btn.setAttribute('aria-label', `Play ${s.title} by ${s.artist}`);
      btn.addEventListener('click', () => (current === i && !audio.paused ? audio.pause() : play(i)));
      $('songs').append(li);
    });
  }

  function mark() {
    [...$('songs').children].forEach((li, i) => {
      const on = i === current;
      li.classList.toggle('on', on);
      const btn = li.querySelector('.play');
      btn.innerHTML = on && !audio.paused ? PAUSE : PLAY;
      btn.setAttribute('aria-label', `${on && !audio.paused ? 'Pause' : 'Play'} ${list[i].title} by ${list[i].artist}`);
    });
  }
  function play(i) {
    if (i !== current) { current = i; audio.src = list[i].preview; }
    audio.play().catch(() => {});
    mark();
  }
  function stop() { audio.pause(); current = -1; mark(); }
  audio.addEventListener('play', mark);
  audio.addEventListener('pause', mark);
  audio.addEventListener('ended', () => (current + 1 < list.length ? play(current + 1) : stop()));
  audio.addEventListener('timeupdate', () => {
    const b = $('songs').children[current]?.querySelector('.bar b');
    if (b && audio.duration) b.style.setProperty('--p', audio.currentTime / audio.duration);
  });

  file.addEventListener('change', () => choose(file.files[0]));
  $('again').addEventListener('click', () => file.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); choose(e.dataTransfer.files[0]); });
  drop.addEventListener('click', (e) => { if (drop.classList.contains('has')) e.preventDefault(); });
})();
