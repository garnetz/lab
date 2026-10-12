/* Turnaround time: when to turn back, and how sure that is.
   Effort follows Naismith's rule: an hour per 5 km, plus 10 minutes per 100 m up, plus (Langmuir) 10 minutes
   per 300 m down. Your own pace so far turns effort into time. The future is uncertain, so the model runs
   the rest of the day 2 000 times with a pace that wanders (less, the more you've walked) and tiredness that
   builds, then reads off the times that 9 runs in 10 beat. */
(function () {
  const effort = (km, up, down = 0) => km + up / 100 * (5 / 6) + down / 300 * (5 / 6); // in "flat km"

  // Deterministic random numbers, so the same inputs always give the same answer.
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function normal(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))))]; };

  /* i: { now (min), doneKm, doneUp, doneMin, aheadKm, aheadUp, backKm, backDown, dark (min), margin (min), confidence (0..1) } */
  function plan(i, runs = 2000) {
    const doneE = Math.max(0.2, effort(i.doneKm, i.doneUp));
    const minPerE = Math.max(4, i.doneMin / doneE); // your pace so far, minutes per flat km
    const spread = 0.06 + 0.22 / Math.sqrt(doneE + 1); // how much the rest of the day may differ from it
    const upE = effort(i.aheadKm, i.aheadUp), downE = effort(i.backKm, 0, i.backDown);
    const r = rng(Math.round(i.now * 7 + i.doneMin * 13 + i.aheadKm * 101 + i.aheadUp * 3 + i.dark));
    const top = [], home = [], paces = [];
    for (let k = 0; k < runs; k++) {
      const pace = minPerE * Math.exp(spread * normal(r));
      const tired = 1 + Math.max(0, 0.04 + 0.05 * normal(r)) * Math.min(1, (i.doneMin + upE * pace) / 360);
      const downPace = pace * tired * Math.exp(0.12 * normal(r)); // descents vary more between people
      const tTop = i.now + upE * pace * tired;
      paces.push([pace * tired, downPace]);
      top.push(tTop);
      home.push(tTop + 10 + downE * downPace); // ten minutes on the top
    }
    const limit = i.dark - i.margin;
    const q = 100 * i.confidence;
    // Latest time to turn back: walking up until then, then down from wherever you are, still home by the limit
    // in (confidence) of the runs. Searched minute by minute.
    let turn = null, nowBack = null;
    const p50top = pct(top, 50);
    for (let t = i.now; t <= p50top + 0.5; t += 1) {
      const back = paces.map(([up, down]) => {
        const climbedE = Math.min(upE, (t - i.now) / up);
        const f = upE ? climbedE / upE : 1;
        // Back the way you came, so the way down shrinks with the part of the climb you haven't done.
        const downHereE = downE * (i.doneKm + f * i.aheadKm) / Math.max(0.01, i.doneKm + i.aheadKm);
        return t + Math.max(0, downHereE) * down;
      });
      if (t === i.now) nowBack = { mid: pct(back, 50), hi: pct(back, q) };
      if (pct(back, q) <= limit) turn = t; else break;
    }
    const share = home.filter((h) => h <= limit).length / runs;
    return {
      minPerE, spread,
      top: { lo: pct(top, 10), mid: pct(top, 50), hi: pct(top, 90) },
      home: { lo: pct(home, 10), mid: pct(home, 50), hi: pct(home, 90) },
      turn, nowBack, share, limit,
      canSummit: pct(home, q) <= limit,
    };
  }

  // Sunset for a date and place (NOAA's simplified formula), in minutes after local midnight, in the device's zone.
  function sunset(date, lat, lon) {
    const rad = Math.PI / 180;
    const start = Date.UTC(date.getFullYear(), 0, 0);
    const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 864e5);
    const g = (2 * Math.PI / 365) * (day - 1);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
    if (cosH < -1) return { polar: 'day' };
    if (cosH > 1) return { polar: 'night' };
    const ha = Math.acos(cosH) / rad;
    const utcMin = 720 - 4 * (lon - ha) - eqt;
    const offset = -date.getTimezoneOffset();
    return { minutes: ((utcMin + offset) % 1440 + 1440) % 1440 };
  }

  window.Turnaround = { plan, sunset, effort };
})();
