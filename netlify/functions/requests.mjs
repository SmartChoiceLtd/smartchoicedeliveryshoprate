import { getStore } from '@netlify/blobs';

// Delivery requests from shops, through a private link per shop (no login for the shop; the link's token says who they are).
//   GET   /api/requests?token=T                 (shop link)  shop name + that shop's own recent and upcoming requests
//   POST  /api/requests {token, submission_id, deliveries:[...]}   (shop link)  save one or more requests
//   GET   /api/requests?from=YYYY-MM-DD&to=YYYY-MM-DD           (office login)  every shop's requests in that date range
//   GET   /api/requests?link=<shopId>[&rotate=1]               (office login)  the shop's link token (made on first use; rotate replaces it)
//   PATCH /api/requests {id, status}                             (office login)  new / accepted / done / cancelled
// Records live in flower-requests under  req_<delivery date>_<SHOPCODE>_<submission>_<n>  so a date range can be read
// from the key names alone, without opening every record. Tokens live in flower-request-tokens, never on the shop record,
// because /api/shops is readable without a login.

const CUTOFF_HOUR = 14; // same-day cut-off, Calgary time
const MAX_PER_POST = 40;
const STATUSES = ['new', 'accepted', 'done', 'cancelled'];
const ALERT_TO = process.env.REQUEST_ALERT_EMAIL || 'smartchoicedelivery@yahoo.com';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
async function whoIs(req) {
  try {
    const m = (req.headers.get('cookie') || '').match(/scd_session=([a-f0-9]+)/);
    if (!m) return null;
    const s = await getStore('flower-sessions').get(m[1], { type: 'json' });
    return (s && new Date(s.expires_at) > new Date()) ? s.username : null;
  } catch (e) { return null; }
}
const clean = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
function calgaryParts(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return { day: p.year + '-' + p.month + '-' + p.day, hour: parseInt(p.hour, 10) % 24 };
}
function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s + 'T12:00:00Z'));
const codeOf = name => String(name || '').split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
const shopFromToken = async token => {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  return await getStore('flower-request-tokens').get(token, { type: 'json' }).catch(() => null);
};

async function readRange(from, to, codeFilter) {
  const store = getStore('flower-requests');
  const { blobs } = await store.list({ prefix: 'req_' });
  const keys = blobs.map(b => b.key).filter(k => {
    const m = /^req_(\d{4}-\d{2}-\d{2})_([A-Z0-9]*)_/.exec(k);
    return m && m[1] >= from && m[1] <= to && (!codeFilter || m[2] === codeFilter);
  }).slice(0, 2500);
  const rows = (await Promise.all(keys.map(k => store.get(k, { type: 'json' }).catch(() => null)))).filter(Boolean);
  return rows.sort((a, b) => (a.date + (a.submitted_at || '')).localeCompare(b.date + (b.submitted_at || '')));
}

async function alertOffice(shop, saved, total) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = saved.slice(0, 15).map(r => '<li><strong>' + esc(r.date) + '</strong> ' + esc(r.name) + ', ' + esc((r.unit ? r.unit + ' - ' : '') + r.address) +
      (r.time_pref && r.time_pref !== 'Anytime' ? ' <em>(' + esc(r.time_pref + (r.time_note ? ' ' + r.time_note : '')) + ')</em>' : '') +
      (r.after_cutoff ? ' <strong style="color:#B8472B">AFTER CUT-OFF</strong>' : '') + '</li>').join('') + (total > 15 ? '<li>...and ' + (total - 15) + ' more</li>' : '');
    const { Resend } = await import('resend');
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'requests@smartchoicedelivery.ca', to: ALERT_TO,
      subject: 'Delivery request: ' + shop.code + ' (' + total + ')',
      html: '<div style="font-family:Arial,sans-serif;font-size:15px"><p><strong>' + esc(shop.name) + '</strong> sent ' + total + ' delivery request' + (total === 1 ? '' : 's') + ':</p><ul>' + lines + '</ul><p><a href="https://quotes.smartchoicedelivery.ca/requests.html">Open the request list</a></p></div>',
    });
  } catch (e) { console.error('request alert failed:', e.message); }
}

export default async (req) => {
  const url = new URL(req.url);
  const store = getStore('flower-requests');

  // ---------- shop link ----------
  if (req.method === 'GET' && url.searchParams.get('token')) {
    const t = await shopFromToken(url.searchParams.get('token'));
    if (!t) return json({ error: 'This link is not valid. Please call or text Smart Choice Delivery for a new one.' }, 404);
    const now = calgaryParts();
    const mine = (await readRange(addDays(now.day, -2), addDays(now.day, 30), t.code)).slice(-200); // a big shop's busy day is hundreds of rows: show the latest 200
    return json({
      shop: { name: t.shop_name, code: t.code }, today: now.day, cutoff_hour: CUTOFF_HOUR, hour_now: now.hour,
      requests: mine.map(r => ({ date: r.date, name: r.name, address: r.address, unit: r.unit, time_pref: r.time_pref, status: r.status, after_cutoff: !!r.after_cutoff, submitted_at: r.submitted_at })),
    });
  }

  if (req.method === 'POST') {
    let body; try { body = await req.json(); } catch (e) { return json({ error: 'Invalid request' }, 400); }
    const t = await shopFromToken(body.token);
    if (!t) return json({ error: 'This link is not valid. Please call or text Smart Choice Delivery for a new one.' }, 404);
    const list = Array.isArray(body.deliveries) ? body.deliveries : [];
    if (!list.length) return json({ error: 'Nothing to send.' }, 400);
    if (list.length > MAX_PER_POST) return json({ error: 'Please send no more than ' + MAX_PER_POST + ' at a time.' }, 400);
    const now = calgaryParts();
    const sub = clean(body.submission_id, 40).replace(/[^A-Za-z0-9]/g, '') || Math.random().toString(36).slice(2, 12);
    const errors = [], clean_rows = [];
    list.forEach((d, i) => {
      const row = {
        date: clean(d.date, 10), name: clean(d.name, 80), address: clean(d.address, 160), unit: clean(d.unit, 40),
        access_code: clean(d.access_code, 40), phone: clean(d.phone, 30),
        time_pref: ['Anytime', 'Morning', 'Afternoon', 'Specific time'].includes(d.time_pref) ? d.time_pref : 'Anytime',
        time_note: clean(d.time_note, 60), notes: clean(d.notes, 300),
        pieces: Math.max(1, Math.min(parseInt(d.pieces, 10) || 1, 99)),
      };
      const n = i + 1, why = [];
      if (!isDay(row.date)) why.push('date'); else if (row.date < now.day) why.push('date (already past)'); else if (row.date > addDays(now.day, 365)) why.push('date (too far ahead)');
      if (!row.name) why.push('recipient name');
      if (!row.address) why.push('address');
      if (row.phone.replace(/\D/g, '').length < 10) why.push('contact number (deliveries without one cannot be accepted)');
      if (why.length) errors.push('Delivery ' + n + ': check ' + why.join(', ') + '.');
      clean_rows.push(row);
    });
    if (errors.length) return json({ error: errors.join(' '), errors }, 400);

    const saved = [], created = [];
    for (let i = 0; i < clean_rows.length; i++) {
      const row = clean_rows[i];
      const key = 'req_' + row.date + '_' + t.code + '_' + sub + '_' + (i + 1);
      const existing = await store.get(key, { type: 'json' }).catch(() => null);
      if (existing) { saved.push(existing); continue; } // the same send repeated (double tap, retry): not saved twice
      const rec = {
        id: key, shop_code: t.code, shop_name: t.shop_name, submitted_at: new Date().toISOString(), ...row,
        status: 'new', after_cutoff: row.date === now.day && now.hour >= CUTOFF_HOUR,
      };
      await store.setJSON(key, rec);
      saved.push(rec); created.push(rec);
    }
    // Only what is new, so a repeated send does not alert again. A big upload goes in chunks: all but the last are quiet, and the last reports the whole batch.
    if (created.length && body.quiet !== true) await alertOffice({ name: t.shop_name, code: t.code }, created, Math.max(created.length, Math.min(parseInt(body.batch_count, 10) || 0, 2000)));
    return json({ success: true, saved: saved.length, after_cutoff: saved.filter(r => r.after_cutoff).length }, 201);
  }

  // ---------- office ----------
  const user = await whoIs(req);
  if (!user) return json({ error: 'Not signed in' }, 401);

  if (req.method === 'GET' && url.searchParams.get('link')) {
    const shopId = url.searchParams.get('link');
    const shop = await getStore('flower-shops').get(shopId, { type: 'json' }).catch(() => null);
    if (!shop) return json({ error: 'Shop not found' }, 404);
    const tokens = getStore('flower-request-tokens');
    let token = await tokens.get('shop_' + shopId, { type: 'text' }).catch(() => null);
    if (token && url.searchParams.get('rotate') === '1') { await tokens.delete(token).catch(() => {}); token = null; }
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, '');
      await tokens.setJSON(token, { shop_id: shopId, shop_name: shop.name, code: codeOf(shop.name) });
      await tokens.set('shop_' + shopId, token);
    }
    return json({ token, path: '/request.html?s=' + token });
  }

  if (req.method === 'GET') {
    const now = calgaryParts();
    const from = isDay(url.searchParams.get('from')) ? url.searchParams.get('from') : addDays(now.day, -1);
    const to = isDay(url.searchParams.get('to')) ? url.searchParams.get('to') : addDays(now.day, 90);
    return json({ today: now.day, requests: await readRange(from, to, '') });
  }

  if (req.method === 'PATCH') {
    let body; try { body = await req.json(); } catch (e) { return json({ error: 'Invalid request' }, 400); }
    if (!/^req_\d{4}-\d{2}-\d{2}_[A-Z0-9]*_[A-Za-z0-9]+_\d+$/.test(String(body.id || ''))) return json({ error: 'Bad id' }, 400);
    if (!STATUSES.includes(body.status)) return json({ error: 'Bad status' }, 400);
    const rec = await store.get(body.id, { type: 'json' }).catch(() => null);
    if (!rec) return json({ error: 'Not found' }, 404);
    rec.status = body.status; rec.status_by = user; rec.status_at = new Date().toISOString();
    await store.setJSON(body.id, rec);
    return json(rec);
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/requests' };
