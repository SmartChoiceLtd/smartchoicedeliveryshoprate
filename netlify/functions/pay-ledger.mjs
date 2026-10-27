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

// Driver-facing view. Needs the driver's own PIN (set by staff on the ledger page), sent in a POST
// body so it never appears in a URL or log. Five wrong PINs lock that driver's view for 15 minutes.
// Returns ONLY that driver's recent weeks - never any other driver, never staff names.
const enc = new TextEncoder();
async function hashPin(pin, saltHex) {
  const salt = saltHex ? new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hex = a => Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash: hex(new Uint8Array(bits)), salt: hex(salt) };
}
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;

async function driverView(ledger, code) {
  const { blobs } = await ledger.list();
  const mine = blobs.filter(b => b.key.endsWith('_' + code)).map(b => b.key).sort().reverse().slice(0, 8);
  const recs = (await Promise.all(mine.map(k => ledger.get(k, { type: 'json' })))).filter(Boolean);
  return recs.map(r => {
    const live = (r.entries || []).filter(e => !e.voided);
    const stmts = live.filter(e => e.type === 'statement_emailed');
    const statement = stmts.length ? stmts[stmts.length - 1].amount : null;
    const adj = live.filter(e => e.type === 'adjustment');
    const pay = live.filter(e => PAYMENT_TYPES.includes(e.type));
    const adjTotal = adj.reduce((s, e) => s + e.amount, 0);
    const paidTotal = pay.reduce((s, e) => s + e.amount, 0);
    const balance = statement === null ? null : Math.round((statement + adjTotal - paidTotal) * 100) / 100;
    return {
      week_end: r.week_end, statement,
      adjustments: adj.map(e => ({ amount: e.amount, note: e.note || '', date: e.occurred_at || e.recorded_at })),
      payments: pay.map(e => ({ type: e.type, amount: e.amount, date: e.occurred_at || e.recorded_at, reference: e.reference || '' })),
      paid_total: Math.round(paidTotal * 100) / 100, adjustments_total: Math.round(adjTotal * 100) / 100, balance
    };
  });
}

async function handleDriverView(body) {
  const code = String(body.driver || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pin = String(body.pin || '').trim();
  if (!code || !pin) return json({ error: 'Driver and PIN required' }, 400);
  const pins = getStore('flower-driver-pins');
  const rec = await pins.get('pin_' + code, { type: 'json' });
  if (!rec) return json({ error: 'No PIN has been set up for you yet. Please contact Smart Choice Delivery.' }, 403);
  const failKey = 'fail_' + code;
  const fails = (await pins.get(failKey, { type: 'json' })) || { count: 0, locked_until: 0 };
  if (fails.locked_until && Date.now() < fails.locked_until) {
    return json({ error: 'Too many wrong PINs. Try again in ' + Math.ceil((fails.locked_until - Date.now()) / 60000) + ' minutes.' }, 429);
  }
  const { hash } = await hashPin(pin, rec.salt);
  if (hash !== rec.hash) {
    fails.count = (fails.locked_until && Date.now() >= fails.locked_until ? 0 : fails.count) + 1;
    fails.locked_until = fails.count >= MAX_FAILS ? Date.now() + LOCK_MS : 0;
    if (fails.count >= MAX_FAILS) fails.count = 0;
    await pins.setJSON(failKey, fails);
    return json({ error: 'Wrong PIN.' }, 401);
  }
  if (fails.count || fails.locked_until) await pins.setJSON(failKey, { count: 0, locked_until: 0 });
  return json({ driver: code, weeks: await driverView(getStore('flower-driver-payments'), code) });
}

export default async (req) => {
  // Driver-facing PIN-protected view (POST). Everything else below needs a staff login.
  if (req.method === 'POST') {
    const peek = await req.clone().json().catch(() => ({}));
    if (peek && peek.action === 'driver_view') return handleDriverView(peek);
  }
  const username = await requireAuth(req);
  if (!username) return json({ error: 'Not authenticated' }, 401);
  const store = getStore('flower-driver-payments');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const weekEnd = url.searchParams.get('week_end');
    const driver = (url.searchParams.get('driver') || '').toUpperCase();
    if (url.searchParams.get('pins') === '1') {
      const { blobs } = await getStore('flower-driver-pins').list({ prefix: 'pin_' });
      return json({ pins: blobs.map(b => b.key.slice(4)) });
    }
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
  if (body.action === 'set_pin') {
    // Staff sets or resets a driver's PIN. Leave pin blank to generate a random 6-digit one. The PIN
    // is returned ONCE here (only a salted hash is stored) so it can be passed to the driver.
    const code = String(body.driver || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return json({ error: 'driver required' }, 400);
    let pin = String(body.pin || '').trim();
    if (!pin) pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
    if (!/^\d{4,8}$/.test(pin)) return json({ error: 'PIN must be 4 to 8 digits' }, 400);
    const { hash, salt } = await hashPin(pin);
    const pins = getStore('flower-driver-pins');
    await pins.setJSON('pin_' + code, { hash, salt, set_at: new Date().toISOString(), set_by: username });
    await pins.setJSON('fail_' + code, { count: 0, locked_until: 0 });
    return json({ ok: true, driver: code, pin });
  }
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

  if (body.action === 'redate') { // correct the date money moved; the old date stays on the entry as an audit trail
    const e = rec.entries.find(x => x.id === body.entry_id);
    if (!e) return json({ error: 'Entry not found' }, 404);
    if (e.voided) return json({ error: 'That entry is voided' }, 400);
    if (e.type === 'statement_emailed') return json({ error: 'The emailed date is logged automatically and cannot be changed' }, 400);
    const d = new Date(body.occurred_at);
    if (!body.occurred_at || isNaN(d.getTime())) return json({ error: 'A valid date is required' }, 400);
    if (d.getTime() > Date.now() + 36 * 3600e3) return json({ error: 'That date is in the future' }, 400);
    e.edits = (e.edits || []).concat([{ at: new Date().toISOString(), by: username, field: 'occurred_at', from: e.occurred_at || null, to: d.toISOString() }]);
    e.occurred_at = d.toISOString();
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
  if (body.occurred_at) { const d = new Date(body.occurred_at); if (!isNaN(d.getTime())) { if (d.getTime() > Date.now() + 36 * 3600e3) return json({ error: 'The date paid is in the future. Check the date and try again.' }, 400); occurred = d.toISOString(); } }
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
