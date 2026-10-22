import { getStore } from '@netlify/blobs';

// Staff-only view of the change history. GET /api/rate-history?kind=rate|shop&q=text  -> newest first.
// GET /api/rate-history?asof=YYYY-MM-DD -> the rate table as it stood at the END of that day, worked out
// by undoing every change made after it. Only changes recorded since history began can be undone.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
async function requireAuth(req) {
  const m = (req.headers.get('cookie') || '').match(/scd_session=([a-f0-9]+)/);
  if (!m) return null;
  const s = await getStore('flower-sessions').get(m[1], { type: 'json' });
  if (!s || new Date(s.expires_at) < new Date()) return null;
  return s.username;
}

export default async (req) => {
  if (!(await requireAuth(req))) return json({ error: 'Not authenticated' }, 401);
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);
  const url = new URL(req.url);
  const store = getStore('flower-rate-history');
  const { blobs } = await store.list();
  const keys = blobs.map(b => b.key).sort().reverse();
  const asof = url.searchParams.get('asof');

  if (asof) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asof)) return json({ error: 'asof must be YYYY-MM-DD' }, 400);
    const cutoff = new Date(asof + 'T23:59:59').getTime() + 7 * 3600000; // end of that day, Calgary (UTC-6/-7)
    const rates = JSON.parse(JSON.stringify((await getStore('flower-rates').get('rates', { type: 'json' })) || {}));
    let undone = 0, earliest = null;
    for (const k of keys) {
      const e = await store.get(k, { type: 'json' });
      if (!e || e.kind !== 'rate') continue;
      earliest = e.at;
      if (new Date(e.at).getTime() <= cutoff) break;
      (e.changes || []).slice().reverse().forEach(c => {
        if (c.from === null) { if (rates[c.zone]) { delete rates[c.zone][c.field]; if (!Object.keys(rates[c.zone]).length) delete rates[c.zone]; } }
        else { rates[c.zone] = rates[c.zone] || {}; rates[c.zone][c.field] = c.from; }
      });
      undone++;
    }
    const oldest = keys.length ? keys[keys.length - 1].slice(0, 10) : null;
    return json({ asof, rates, changes_undone: undone, history_starts: oldest });
  }

  const kind = url.searchParams.get('kind');
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const out = [];
  for (const k of keys) {
    if (out.length >= 300) break;
    const e = await store.get(k, { type: 'json' });
    if (!e) continue;
    if (kind && e.kind !== kind) continue;
    if (q && JSON.stringify(e).toLowerCase().indexOf(q) < 0) continue;
    out.push(e);
  }
  return json({ items: out, total_records: keys.length });
};

export const config = { path: '/api/rate-history' };
