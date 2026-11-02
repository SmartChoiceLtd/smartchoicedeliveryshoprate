import { getStore } from '@netlify/blobs';

// Driver activity log: what happened on a driver's phone, as reported by the driver and route pages.
//   POST /api/activity-log   (no login; sent by the driver link)  { driver, event, page, tid, detail, online }
//   GET  /api/activity-log?day=YYYY-MM-DD[&driver=CODE]   (office login)  the events for that day, oldest first
//
// Events: opened, bad_link, submit_try / submit_ok / submit_fail / submit_queued / submit_blocked  (driver form),
//         add_try / add_ok / add_fail / add_blocked  (adding a scanned or typed stop to the route).
// A "try" with no matching "ok" or "fail" (same tid) means the phone never heard back, usually lost signal.
// A code that is not a real driver is still logged (driver_valid:false): a mistyped or old link shows up here.

const EVENTS = ['opened', 'bad_link', 'submit_try', 'submit_ok', 'submit_fail', 'submit_queued', 'submit_blocked', 'add_try', 'add_ok', 'add_fail', 'add_blocked'];
const MAX_PER_DAY_READ = 800;

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
const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
function calgaryDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function device(ua) {
  ua = String(ua || '');
  let m;
  if ((m = ua.match(/iPhone OS (\d+)[_.](\d+)/))) return 'iPhone iOS ' + m[1] + '.' + m[2];
  if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) return 'Android ' + m[1];
  return ua ? 'other' : '';
}

export default async (req) => {
  const store = getStore('flower-activity-log');

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
    const event = String(body.event || '');
    if (!EVENTS.includes(event)) return json({ error: 'Invalid event' }, 400);
    const code = clean(body.driver, 12).toUpperCase();
    if (!/^[A-Z0-9]{1,12}$/.test(code)) return json({ error: 'Invalid driver' }, 400);
    const d = await getStore('flower-drivers').get(code.toLowerCase(), { type: 'json' }).catch(() => null);
    const now = new Date();
    const rec = {
      at: now.toISOString(), day: calgaryDay(now), driver: code, driver_valid: !!(d && d.active !== false), name: d ? d.name : '',
      event, page: body.page === 'route' ? 'route' : 'form', tid: clean(body.tid, 20), detail: clean(body.detail, 200),
      online: body.online === false ? false : true, device: device(req.headers.get('user-agent'))
    };
    await store.setJSON(rec.day + '_' + now.getTime() + '_' + Math.random().toString(36).slice(2, 6), rec);
    return json({ ok: true }, 201);
  }

  if (req.method === 'GET') {
    if (!(await whoIs(req))) return json({ error: 'Not authenticated' }, 401);
    const url = new URL(req.url);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') || '') ? url.searchParams.get('day') : calgaryDay();
    const only = clean(url.searchParams.get('driver'), 12).toUpperCase();
    const { blobs } = await store.list({ prefix: day + '_' });
    const keys = blobs.map(b => b.key).sort().slice(0, MAX_PER_DAY_READ);
    const events = [];
    for (let i = 0; i < keys.length; i += 50) {
      const chunk = await Promise.all(keys.slice(i, i + 50).map(k => store.get(k, { type: 'json' }).catch(() => null)));
      chunk.forEach(r => { if (r) events.push(r); });
    }
    events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const drivers = {};
    events.forEach(e => { const x = drivers[e.driver] || (drivers[e.driver] = { code: e.driver, name: e.name, valid: e.driver_valid, events: 0 }); x.events++; });
    return json({ day, drivers: Object.values(drivers), events: only ? events.filter(e => e.driver === only) : events });
  }
  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/activity-log' };
