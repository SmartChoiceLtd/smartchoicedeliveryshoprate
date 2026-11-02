import { getStore } from '@netlify/blobs';

// Special-event quotes: a priced quote for the customer, saved so it can be found again and tracked.
//   GET  /api/event-quotes            (login)  the 200 most recent quotes (summary)
//   GET  /api/event-quotes?id=Q-2026-0001   (login)  one full quote
//   POST /api/event-quotes            (login)  save a quote: { id?, customer, event, lines[], ... }  -> the saved quote
//   GET  /api/event-quotes?lookup=Q-2026-0001   (no login; the driver form) the few fields a driver needs, only for a sent or accepted quote
//   POST /api/event-quotes {action:'status', id, status}   draft | sent | accepted | declined | cancelled
// Totals are always recalculated here from the lines, so what is saved matches what the lines add up to.

const STATUSES = ['draft', 'sent', 'accepted', 'declined', 'cancelled'];
const GST_RATE = 0.05;

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
const clean = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, ' ').trim().slice(0, n);
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const num = (v, lo, hi) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0; };
function calgaryYear(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric' }).format(d);
}
const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '';

function totals(lines, gstOn) {
  const subtotal = r2(lines.reduce((s, l) => s + r2(l.qty * l.rate), 0));
  const gst = gstOn ? r2(subtotal * GST_RATE) : 0;
  return { subtotal, gst, total: r2(subtotal + gst) };
}
function summary(q) {
  return { id: q.id, status: q.status, customer: q.customer.name, event: q.event.name, event_date: q.event.date, total: q.total,
    trips: Math.max(1, q.event.trips || 1), linked: (q.linked || []).length, driver_pay: q.driver_pay || 0,
    created_at: q.created_at, updated_at: q.updated_at, valid_until: q.valid_until };
}

export default async (req) => {
  // The driver form checks a quote number without a login. It gets only what is needed to confirm the job and its pay.
  if (req.method === 'GET') {
    const lk = clean(new URL(req.url).searchParams.get('lookup'), 20).toUpperCase();
    if (lk) {
      const q = await getStore('flower-event-quotes').get(lk, { type: 'json', consistency: 'strong' }).catch(() => null);
      if (!q) return json({ error: 'Quote not found. Check the number.' }, 404);
      if (!['sent', 'accepted'].includes(q.status)) return json({ error: 'Quote ' + q.id + ' is ' + q.status + '. The office needs to mark it as sent or accepted first.' }, 409);
      const trips = Math.max(1, q.event.trips || 1), used = (q.linked || []).length;
      return json({ id: q.id, status: q.status, customer: q.customer.name, shop_code: q.customer.code, event: q.event.name, date: q.event.date, time: q.event.time,
        venue: q.event.venue, pickup: q.event.pickup, pieces: q.event.pieces, trips, used, open: used < trips, driver_pay: q.driver_pay || 0 });
    }
  }
  const user = await whoIs(req);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const store = getStore('flower-event-quotes');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const id = clean(url.searchParams.get('id'), 20);
    if (id) {
      const q = await store.get(id, { type: 'json' }).catch(() => null);
      return q ? json(q) : json({ error: 'Quote not found' }, 404);
    }
    const { blobs } = await store.list({ prefix: 'Q-' });
    const all = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
    all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return json({ quotes: all.slice(0, 200).map(summary) });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }

  if (body.action === 'status') {
    const q = await store.get(clean(body.id, 20), { type: 'json' }).catch(() => null);
    if (!q) return json({ error: 'Quote not found' }, 404);
    if (!STATUSES.includes(body.status)) return json({ error: 'Invalid status' }, 400);
    const at = new Date().toISOString();
    q.history = (q.history || []).concat([{ at, by: user, status: body.status }]).slice(-30);
    q.status = body.status; q.updated_at = at;
    if (body.status === 'accepted') q.accepted_at = at;
    await store.setJSON(q.id, q);
    return json(q);
  }

  const lines = (Array.isArray(body.lines) ? body.lines : []).slice(0, 40).map(l => ({
    desc: clean(l.desc, 200), qty: r2(num(l.qty, -9999, 9999)), rate: r2(num(l.rate, -99999, 99999)), auto: l.auto === true
  })).filter(l => l.desc && l.qty);
  if (!lines.length) return json({ error: 'Add at least one priced line' }, 400);
  const c = body.customer || {}, ev = body.event || {};
  const customer = { code: clean(c.code, 10).toUpperCase(), name: clean(c.name, 120), contact: clean(c.contact, 80), email: clean(c.email, 120), phone: clean(c.phone, 30), address: clean(c.address, 200) };
  if (!customer.name) return json({ error: 'Customer name is required' }, 400);
  const event = { name: clean(ev.name, 120), type: clean(ev.type, 30) || 'Special Event', date: dateOk(ev.date), time: clean(ev.time, 40), pickup: clean(ev.pickup, 200), venue: clean(ev.venue, 200),
    pieces: Math.floor(num(ev.pieces, 0, 9999)), trips: Math.floor(num(ev.trips, 0, 99)), setup_people: Math.floor(num(ev.setup_people, 0, 99)), setup_hours: num(ev.setup_hours, 0, 99) };
  const gstOn = body.gst !== false;
  const t = totals(lines, gstOn);

  const now = new Date().toISOString();
  let q = null;
  const id = clean(body.id, 20);
  if (id) q = await store.get(id, { type: 'json' }).catch(() => null);
  if (!q) {
    const counters = getStore('flower-event-quotes-counter');
    const year = calgaryYear();
    const cur = (await counters.get(year, { type: 'json', consistency: 'strong' }).catch(() => null)) || { n: 0 };
    cur.n += 1; await counters.setJSON(year, cur);
    q = { id: 'Q-' + year + '-' + String(cur.n).padStart(4, '0'), status: 'draft', created_at: now, created_by: user, history: [{ at: now, by: user, status: 'draft' }] };
  }
  Object.assign(q, { customer, event, lines, gst: gstOn, gst_rate: GST_RATE, ...t,
    driver_pay: r2(num(body.driver_pay, 0, 9999)), valid_until: dateOk(body.valid_until), notes: clean(body.notes, 1500), terms: clean(body.terms, 1500), updated_at: now, updated_by: user });
  await store.setJSON(q.id, q);
  return json(q, 201);
};

export const config = { path: '/api/event-quotes' };
