import { getStore } from '@netlify/blobs';

// Seasonal charges. Right now: Christmas greens, a per-piece upcharge for the driver and for the shop that only applies
// to deliveries dated November 1 to January 31, and only while the office switch is on.
//   GET  /api/seasonal   (no login; the driver form reads it)  { xmas: { enabled, driver_rate, shop_rate, in_season, season } }
//   POST /api/seasonal   (office login)  { xmas: { enabled, driver_rate, shop_rate } }
// The driver form shows the Christmas box only when enabled and in season. The server checks the same rules again
// when an order is saved, so the box cannot be used outside the season or while switched off.

const DEFAULTS = { enabled: true, driver_rate: 1.5, shop_rate: 2 };

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
function calgaryToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export const inXmasSeason = iso => { const m = parseInt(String(iso || '').slice(5, 7), 10); return m === 11 || m === 12 || m === 1; };
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

export default async (req) => {
  const store = getStore('flower-settings');
  const saved = (await store.get('seasonal', { type: 'json' }).catch(() => null)) || {};
  const x = { ...DEFAULTS, ...(saved.xmas || {}) };

  if (req.method === 'GET') {
    return json({ xmas: { enabled: !!x.enabled, driver_rate: x.driver_rate, shop_rate: x.shop_rate, in_season: inXmasSeason(calgaryToday()), season: 'Nov 1 to Jan 31', today: calgaryToday() } });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await whoIs(req);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
  const b = body.xmas || {};
  const next = { enabled: b.enabled === true || b.enabled === 'true', driver_rate: r2(b.driver_rate), shop_rate: r2(b.shop_rate) };
  if (next.driver_rate < 0 || next.driver_rate > 50 || next.shop_rate < 0 || next.shop_rate > 50) return json({ error: 'Rates must be between $0 and $50' }, 400);
  await store.setJSON('seasonal', { ...saved, xmas: next, updated_at: new Date().toISOString(), updated_by: user });
  try { // same audit trail as rate changes
    const changes = [];
    ['enabled', 'driver_rate', 'shop_rate'].forEach(f => { if (JSON.stringify(x[f]) !== JSON.stringify(next[f])) changes.push({ zone: 'XMAS (Christmas greens)', field: f, from: x[f], to: next[f] }); });
    if (changes.length) { const at = new Date().toISOString(); await getStore('flower-rate-history').setJSON(at + '_' + Math.random().toString(36).slice(2, 6), { at, by: user, kind: 'rate', changes }); }
  } catch (e) { console.error('seasonal history failed:', e.message); }
  return json({ xmas: { ...next, in_season: inXmasSeason(calgaryToday()), season: 'Nov 1 to Jan 31' } });
};

export const config = { path: '/api/seasonal' };
