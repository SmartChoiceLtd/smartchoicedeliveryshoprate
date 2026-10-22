import { getStore } from '@netlify/blobs';

// Closing a week locks it: editing or deleting one of its orders then needs a written reason, and every
// change made after the close (and any order added late) is listed against the week. Reopening needs a
// reason too. Nothing is blocked outright - the lock makes changes deliberate and visible.
// Record: flower-week-locks / <week-ending Sunday>

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
  const user = await requireAuth(req);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const store = getStore('flower-week-locks');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const we = url.searchParams.get('week_end');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(we || '')) return json({ error: 'week_end (YYYY-MM-DD) required' }, 400);
    const rec = await store.get(we, { type: 'json' });
    return json(rec || { week_end: we, locked: false, history: [], changes: [] });
  }
  if (req.method !== 'POST') return json({ error: 'GET or POST only' }, 405);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
  const we = body.week_end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(we || '')) return json({ error: 'week_end (YYYY-MM-DD) required' }, 400);
  const rec = (await store.get(we, { type: 'json' })) || { week_end: we, locked: false, history: [], changes: [] };
  const now = new Date().toISOString();

  if (body.action === 'close') {
    if (rec.locked) return json({ error: 'Already closed' }, 400);
    rec.locked = true; rec.locked_at = now; rec.locked_by = user; rec.changes = [];
    rec.history.push({ at: now, by: user, action: 'closed', reason: String(body.note || '').slice(0, 300) });
  } else if (body.action === 'reopen') {
    const reason = String(body.reason || '').trim();
    if (!rec.locked) return json({ error: 'Not closed' }, 400);
    if (!reason) return json({ error: 'A reason is required to reopen a week' }, 400);
    rec.locked = false;
    rec.history.push({ at: now, by: user, action: 'reopened', reason: reason.slice(0, 300) });
  } else return json({ error: 'Unknown action' }, 400);
  await store.setJSON(we, rec);
  return json(rec);
};

export const config = { path: '/api/week-lock' };
