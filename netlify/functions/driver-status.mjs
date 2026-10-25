import { getStore } from '@netlify/blobs';

// Where each driver is, in the driver's own terms, so the office can offer new jobs to whoever is nearest.
//   POST /api/driver-status  (driver link, no login)
//        { driver, kind: 'delivered' | 'heading' | 'clear_heading' | 'seen', address?, lat?, lng? }
//     delivered     - a delivery was just submitted: where it was, and (if the phone allows) the phone's position
//     heading       - the driver is leaving a delivery for this address (replaces the "Leaving DV to 123 Main St SE" text)
//     clear_heading - the driver cancelled that
//     seen          - the phone's position while the route page was open
//   GET  /api/driver-status  (office login) - every active driver with their latest status
// Only the latest status plus the last few events are kept per driver. Nothing here is used for pay or invoicing.

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
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const okCoord = (lat, lng) => lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);

export default async (req) => {
  const status = getStore('flower-driver-status');

  if (req.method === 'GET') {
    if (!(await whoIs(req))) return json({ error: 'Not authenticated' }, 401);
    const dStore = getStore('flower-drivers');
    const { blobs } = await dStore.list();
    const drivers = (await Promise.all(blobs.map(b => dStore.get(b.key, { type: 'json' }).catch(() => null)))).filter(d => d && d.active !== false);
    const out = await Promise.all(drivers.map(async d => {
      const s = await status.get(String(d.code).toLowerCase(), { type: 'json' }).catch(() => null);
      return { code: d.code, name: d.name, phone: d.phone || '', status: s || null };
    }));
    out.sort((a, b) => a.name.localeCompare(b.name));
    return json({ now: new Date().toISOString(), drivers: out });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
  const code = clean(body.driver, 12).toLowerCase();
  const kind = body.kind;
  if (!code || !['delivered', 'heading', 'clear_heading', 'seen'].includes(kind)) return json({ error: 'driver and a valid kind are required' }, 400);
  const driver = await getStore('flower-drivers').get(code, { type: 'json' }).catch(() => null);
  if (!driver || driver.active === false) return json({ error: 'Unknown driver' }, 404);

  const at = new Date().toISOString();
  const lat = num(body.lat), lng = num(body.lng);
  const hasPos = okCoord(lat, lng);
  const address = clean(body.address, 200);
  const cur = (await status.get(code, { type: 'json' }).catch(() => null)) || { code: driver.code, name: driver.name, history: [] };
  cur.code = driver.code; cur.name = driver.name;

  if (kind === 'delivered') {
    if (!address && !hasPos) return json({ error: 'address or position required' }, 400);
    cur.delivered = { address, at, lat: hasPos ? lat : null, lng: hasPos ? lng : null };
    cur.heading = null; // arrived: the earlier "heading to" is no longer true
  } else if (kind === 'heading') {
    if (!address) return json({ error: 'address required' }, 400);
    cur.heading = { address, at };
  } else if (kind === 'clear_heading') {
    cur.heading = null;
  }
  if (hasPos) cur.seen = { lat, lng, at };
  if (kind !== 'seen') {
    cur.history = [{ kind, address: address || null, at }].concat(cur.history || []).slice(0, 15);
  }
  cur.updated_at = at;
  await status.setJSON(code, cur);
  return json({ ok: true, at });
};

export const config = { path: '/api/driver-status' };
