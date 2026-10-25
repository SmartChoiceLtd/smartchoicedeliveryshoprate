import { getStore } from '@netlify/blobs';

// POST /api/dispatch-rank  { address }   (office login)
// Ranks the drivers by driving time to a pickup address, measured from where each one will be free:
//   1. the address they said they are heading to (if they said so after their last delivery), else
//   2. their last delivery (its position if the phone gave one, otherwise its address), else
//   3. the last position the phone reported.
// Anyone with no information, or whose latest information is older than STALE_MIN minutes, is listed after the
// drivers who are current, so a driver who has gone quiet never looks closer than they really are.

const STALE_MIN = 180;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
async function whoIs(req) {
  const m = (req.headers.get('cookie') || '').match(/scd_session=([a-f0-9]+)/);
  if (!m) return null;
  const s = await getStore('flower-sessions').get(m[1], { type: 'json' });
  if (!s || new Date(s.expires_at) < new Date()) return null;
  return s.username;
}
const withCity = a => /calgary|alberta|, ab\b/i.test(a) ? a : a + ', Calgary, Alberta, Canada';
const ms = t => (t ? Date.parse(t) : 0) || 0;

// Where a driver will be free, and when that was last confirmed.
export function originFor(st) {
  if (!st) return null;
  const d = st.delivered, h = st.heading, s = st.seen;
  const hAt = h ? ms(h.at) : 0, dAt = d ? ms(d.at) : 0;
  if (h && h.address && hAt >= dAt) return { from: 'heading', label: h.address, at: h.at, query: withCity(h.address) };
  if (d) {
    const q = (typeof d.lat === 'number' && typeof d.lng === 'number') ? d.lat + ',' + d.lng : (d.address ? withCity(d.address) : null);
    if (q) return { from: 'delivered', label: d.address || 'last delivery', at: d.at, query: q };
  }
  if (s) return { from: 'seen', label: 'phone position', at: s.at, query: s.lat + ',' + s.lng };
  return null;
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!(await whoIs(req))) return json({ error: 'Not authenticated' }, 401);
  const key = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_KEY;
  if (!key) return json({ error: 'No Google Maps key configured' }, 500);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
  const address = String(body.address || '').trim().slice(0, 200);
  if (address.length < 5) return json({ error: 'Enter the pickup address' }, 400);

  const dStore = getStore('flower-drivers'), sStore = getStore('flower-driver-status');
  const { blobs } = await dStore.list();
  const drivers = (await Promise.all(blobs.map(b => dStore.get(b.key, { type: 'json' }).catch(() => null)))).filter(d => d && d.active !== false);
  const now = Date.now();
  const rows = await Promise.all(drivers.map(async d => {
    const st = await sStore.get(String(d.code).toLowerCase(), { type: 'json' }).catch(() => null);
    const o = originFor(st);
    const age = o && ms(o.at) ? Math.max(0, Math.round((now - ms(o.at)) / 60000)) : null;
    return { code: d.code, name: d.name, phone: d.phone || '', origin: o, age_min: age, stale: !o || age === null || age > STALE_MIN, minutes: null };
  }));

  const measurable = rows.filter(r => r.origin).slice(0, 25);
  if (measurable.length) {
    const params = new URLSearchParams({
      origins: measurable.map(r => r.origin.query).join('|'),
      destinations: withCity(address), mode: 'driving', units: 'metric', key
    });
    let data;
    try {
      const r = await fetch('https://maps.googleapis.com/maps/api/distancematrix/json?' + params.toString(), { signal: AbortSignal.timeout(8000) });
      data = await r.json();
    } catch (e) { return json({ error: 'Could not reach Google: ' + e.message }, 502); }
    if (data.status !== 'OK' || !data.rows) {
      return json({ error: 'Google Distance Matrix: ' + data.status, google_status: data.status, google_message: data.error_message || null }, 502);
    }
    measurable.forEach((r, i) => {
      const e = data.rows[i] && data.rows[i].elements && data.rows[i].elements[0];
      if (e && e.status === 'OK' && e.duration) r.minutes = Math.max(1, Math.round(e.duration.value / 60));
    });
  }
  // Current drivers first by driving time, then stale ones by driving time, then those with nothing measurable.
  const tier = r => (r.minutes === null ? 2 : r.stale ? 1 : 0);
  rows.sort((a, b) => tier(a) - tier(b) || (a.minutes ?? 0) - (b.minutes ?? 0) || a.name.localeCompare(b.name));
  rows.forEach(r => { if (r.origin) delete r.origin.query; });
  return json({ pickup: address, stale_after_min: STALE_MIN, drivers: rows });
};

export const config = { path: '/api/dispatch-rank' };
