import { getStore } from '@netlify/blobs';

// Who is working today. One record per day (Calgary date), edited by the office as the day goes on.
//   GET  /api/roster                                  -> { date, set, codes, drivers:[{code,name}] }
//   POST /api/roster { code, on: true|false }         -> add or remove one driver
//   POST /api/roster { action: 'copy_last' }          -> start today from the most recent earlier day
//   POST /api/roster { action: 'all' | 'none' }       -> everyone on / nobody on
// `set` is false until someone touches today's list. While it is false the dispatch board treats every active driver as
// available, so nothing disappears before the office has marked the day.
// Office login required.

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
export function calgaryDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export default async (req) => {
  const user = await whoIs(req);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const store = getStore('flower-driver-roster');
  const dStore = getStore('flower-drivers');
  const today = calgaryDate();

  const { blobs } = await dStore.list();
  const drivers = (await Promise.all(blobs.map(b => dStore.get(b.key, { type: 'json' }).catch(() => null))))
    .filter(d => d && d.active !== false).map(d => ({ code: String(d.code).toUpperCase(), name: d.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const valid = new Set(drivers.map(d => d.code));
  const read = async () => (await store.get(today, { type: 'json', consistency: 'strong' }).catch(() => null));
  const view = rec => ({ date: today, set: !!rec, codes: rec ? rec.codes.filter(c => valid.has(c)) : [], drivers });

  if (req.method === 'GET') return json(view(await read()));
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
  let rec = await read();
  let codes = rec ? rec.codes.slice() : null;

  if (body.action === 'copy_last') {
    const { blobs: days } = await store.list();
    const prev = days.map(b => b.key).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k) && k < today).sort().pop();
    const last = prev ? await store.get(prev, { type: 'json' }).catch(() => null) : null;
    codes = last ? last.codes.filter(c => valid.has(c)) : [];
  } else if (body.action === 'all') {
    codes = drivers.map(d => d.code);
  } else if (body.action === 'none') {
    codes = [];
  } else if (typeof body.code === 'string' && typeof body.on === 'boolean') {
    const c = body.code.trim().toUpperCase();
    if (!valid.has(c)) return json({ error: 'Unknown driver' }, 404);
    if (codes === null) codes = []; // first change of the day starts from an empty list
    codes = body.on ? [...new Set(codes.concat(c))] : codes.filter(x => x !== c);
  } else {
    return json({ error: 'Nothing to do' }, 400);
  }
  rec = { date: today, codes, updated_at: new Date().toISOString(), updated_by: user };
  await store.setJSON(today, rec);
  return json(view(rec));
};

export const config = { path: '/api/roster' };
