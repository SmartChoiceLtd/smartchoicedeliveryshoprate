import { getStore } from '@netlify/blobs';

// Driver pay ledger: one record per driver per week-ending, holding an append-only list of
// entries (statement emailed, e-transfer, advance, other payment, adjustment). Entries are never
// deleted - a mistaken one is VOIDED with a reason, so there is always an audit trail.
// Key: <week_end>_<DRIVER>   e.g. 2026-10-18_KE

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

const PAYMENT_TYPES = ['etransfer', 'advance', 'other_payment'];
const ALL_TYPES = PAYMENT_TYPES.concat(['adjustment']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async (req) => {
  const username = await requireAuth(req);
  if (!username) return json({ error: 'Not authenticated' }, 401);
  const store = getStore('flower-driver-payments');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const weekEnd = url.searchParams.get('week_end');
    const driver = (url.searchParams.get('driver') || '').toUpperCase();
    if (weekEnd) {
      if (!DATE_RE.test(weekEnd)) return json({ error: 'week_end must be YYYY-MM-DD' }, 400);
      const { blobs } = await store.list({ prefix: weekEnd + '_' });
      const recs = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);
      return json({ week_end: weekEnd, records: recs });
    }
    if (driver) {
      const { blobs } = await store.list();
      const mine = blobs.filter(b => b.key.endsWith('_' + driver));
      const recs = (await Promise.all(mine.map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);
      recs.sort((a, b) => b.week_end.localeCompare(a.week_end));
      return json({ driver, records: recs });
    }
    return json({ error: 'week_end or driver required' }, 400);
  }

  if (req.method !== 'POST') return json({ error: 'GET or POST only' }, 405);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
  const weekEnd = body.week_end;
  const driver = String(body.driver || '').toUpperCase().trim();
  if (!DATE_RE.test(weekEnd || '') || !driver) return json({ error: 'week_end (YYYY-MM-DD) and driver required' }, 400);
  const key = weekEnd + '_' + driver;
  const rec = (await store.get(key, { type: 'json' })) || { week_end: weekEnd, driver, entries: [] };

  if (body.action === 'void') {
    const e = rec.entries.find(x => x.id === body.entry_id);
    if (!e) return json({ error: 'Entry not found' }, 404);
    if (e.voided) return json({ error: 'Entry already voided' }, 400);
    const reason = String(body.reason || '').trim();
    if (!reason) return json({ error: 'A reason is required to void an entry' }, 400);
    e.voided = { at: new Date().toISOString(), by: username, reason: reason.slice(0, 300) };
    await store.setJSON(key, rec);
    return json({ ok: true, record: rec });
  }

  const type = body.type;
  if (!ALL_TYPES.includes(type)) return json({ error: 'type must be one of ' + ALL_TYPES.join(', ') }, 400);
  let amount = Math.round((parseFloat(body.amount) || 0) * 100) / 100;
  if (!amount) return json({ error: 'amount required' }, 400);
  if (PAYMENT_TYPES.includes(type) && amount < 0) return json({ error: 'Payments must be a positive amount (use an adjustment to reduce what is owed)' }, 400);
  const note = String(body.note || '').trim().slice(0, 300);
  if (type === 'adjustment' && !note) return json({ error: 'A note is required for an adjustment' }, 400);
  // recorded_at is when it was entered here (server clock, cannot be edited). occurred_at is when the
  // money actually moved, if the person entering it says so (e.g. an e-transfer sent yesterday).
  let occurred = null;
  if (body.occurred_at) { const d = new Date(body.occurred_at); if (!isNaN(d.getTime())) occurred = d.toISOString(); }
  const entry = {
    id: Math.random().toString(36).slice(2, 10),
    type, amount, note,
    reference: String(body.reference || '').trim().slice(0, 60) || null,
    recorded_at: new Date().toISOString(),
    occurred_at: occurred,
    by: username
  };
  rec.entries.push(entry);
  await store.setJSON(key, rec);
  return json({ ok: true, entry, record: rec });
};

export const config = { path: '/api/pay-ledger' };
