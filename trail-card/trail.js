/* From ../photo-trail: reads where and when each photo was taken, straight from the file, in the browser.
   Nothing here talks to a server. readPhoto(file) returns { time, lat, lon, ele } from the JPEG's EXIF
   (GPS position, GPS time in UTC, or the camera's own clock with its time zone when it saved one).
   readGPX(text) returns the track as [{ lat, lon, ele, time }]. place() puts photos on a track by time. */
(function () {
  // ---------- EXIF (JPEG only) ----------
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  function readIFD(view, tiff, offset, little) {
    const out = {};
    const n = view.getUint16(tiff + offset, little);
    for (let i = 0; i < n; i++) {
      const e = tiff + offset + 2 + i * 12;
      const tag = view.getUint16(e, little), type = view.getUint16(e + 2, little), count = view.getUint32(e + 4, little);
      const size = (TYPE_SIZE[type] || 1) * count;
      const at = size > 4 ? tiff + view.getUint32(e + 8, little) : e + 8;
      if (at + size > view.byteLength) continue;
      let v;
      if (type === 2) { v = ''; for (let k = 0; k < count - 1; k++) v += String.fromCharCode(view.getUint8(at + k)); }
      else if (type === 5 || type === 10) { v = []; for (let k = 0; k < count; k++) { const a = type === 5 ? view.getUint32(at + k * 8, little) : view.getInt32(at + k * 8, little); const b = view.getUint32(at + k * 8 + 4, little); v.push(b ? a / b : 0); } }
      else if (type === 3) { v = []; for (let k = 0; k < count; k++) v.push(view.getUint16(at + k * 2, little)); }
      else if (type === 4) { v = []; for (let k = 0; k < count; k++) v.push(view.getUint32(at + k * 4, little)); }
      else { v = []; for (let k = 0; k < count; k++) v.push(view.getUint8(at + k)); }
      out[tag] = v;
    }
    return out;
  }

  function exif(buffer) {
    const view = new DataView(buffer);
    if (view.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 < view.byteLength) {
      const marker = view.getUint16(p), len = view.getUint16(p + 2);
      if (marker === 0xffe1 && view.getUint32(p + 4) === 0x45786966) { // "Exif"
        const tiff = p + 10;
        const little = view.getUint16(tiff) === 0x4949;
        const ifd0 = readIFD(view, tiff, view.getUint32(tiff + 4, little), little);
        const sub = ifd0[0x8769] ? readIFD(view, tiff, ifd0[0x8769][0], little) : {};
        const gps = ifd0[0x8825] ? readIFD(view, tiff, ifd0[0x8825][0], little) : {};
        return { ifd0, sub, gps };
      }
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
      p += 2 + len;
    }
    return null;
  }

  const dms = (v, ref) => (v ? (v[0] + v[1] / 60 + v[2] / 3600) * (ref === 'S' || ref === 'W' ? -1 : 1) : null);

  async function readPhoto(file) {
    const buffer = await file.slice(0, 256 * 1024).arrayBuffer(); // EXIF sits at the start of the file
    const x = exif(buffer);
    const out = { time: null, lat: null, lon: null, ele: null, clock: null };
    if (!x) return out;
    const { sub, gps } = x;
    if (gps[2] && gps[4]) {
      out.lat = dms(gps[2], gps[1]);
      out.lon = dms(gps[4], gps[3]);
      if (gps[6]) out.ele = gps[6][0] * (gps[5] && gps[5][0] === 1 ? -1 : 1);
      if (Math.abs(out.lat) < 1e-9 && Math.abs(out.lon) < 1e-9) out.lat = out.lon = null; // 0,0 means "no fix"
    }
    // Time: GPS time is UTC and the most trustworthy. Otherwise the camera clock, with its zone if saved.
    if (gps[29] && gps[7]) {
      const [y, m, d] = gps[29].split(':').map(Number);
      const [h, mi, s] = gps[7];
      out.time = Date.UTC(y, m - 1, d, h, mi, Math.floor(s));
      out.clock = 'gps';
    }
    const original = sub[0x9003] || sub[0x9004] || x.ifd0[0x0132];
    if (original) {
      const m = original.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
      if (m) {
        const zone = sub[0x9011] || sub[0x9010]; // "+02:00"
        const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone && /^[+-]\d\d:\d\d$/.test(zone) ? zone : ''}`;
        const t = Date.parse(iso);
        if (!out.time && !Number.isNaN(t)) { out.time = t; out.clock = zone ? 'camera' : 'camera-local'; }
        out.zone = zone || null;
      }
    }
    return out;
  }

  // ---------- GPX ----------
  function readGPX(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const pts = [...doc.querySelectorAll('trkpt, rtept')].map((n) => ({
      lat: Number(n.getAttribute('lat')),
      lon: Number(n.getAttribute('lon')),
      ele: n.querySelector('ele') ? Number(n.querySelector('ele').textContent) : null,
      time: n.querySelector('time') ? Date.parse(n.querySelector('time').textContent) : null,
    }));
    return pts.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  }

  // ---------- Geometry ----------
  const R = 6371000;
  function dist(a, b) {
    const dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  // Adds .d (metres from the start) to every point.
  function measure(track) { let d = 0; track.forEach((p, i) => { if (i) d += dist(track[i - 1], p); p.d = d; }); return d; }

  // The point on the track at a moment in time (track points need .time).
  function at(track, t) {
    if (!track.length) return null;
    if (t <= track[0].time) return { ...track[0], i: 0 };
    for (let i = 1; i < track.length; i++) {
      if (track[i].time >= t) {
        const a = track[i - 1], b = track[i], f = (t - a.time) / Math.max(1, b.time - a.time);
        const ele = a.ele != null && b.ele != null ? a.ele + (b.ele - a.ele) * f : a.ele ?? b.ele;
        return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, ele, d: a.d + (b.d - a.d) * f, time: t, i };
      }
    }
    return { ...track[track.length - 1], i: track.length - 1 };
  }

  // Puts photos without a position on the track by their time. Photos must fall within the track's time
  // (with a little slack); the rest are reported as not placed, with the reason.
  function place(photos, track, slackMs = 10 * 60 * 1000) {
    const timed = track.length && track[0].time != null;
    for (const p of photos) {
      if (p.lat != null) { p.placedBy = 'gps'; continue; }
      if (!p.time) { p.placedBy = null; p.why = 'no time or location saved in the photo'; continue; }
      if (!timed) { p.placedBy = null; p.why = 'no location saved, and no timed track to place it by'; continue; }
      if (p.time < track[0].time - slackMs || p.time > track[track.length - 1].time + slackMs) { p.placedBy = null; p.why = 'taken outside the time of the track'; continue; }
      const q = at(track, p.time);
      Object.assign(p, { lat: q.lat, lon: q.lon, ele: p.ele ?? q.ele, placedBy: 'time' });
    }
    return photos;
  }

  window.Trail = { readPhoto, readGPX, measure, at, place, dist };
})();
