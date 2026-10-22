import { getStore } from '@netlify/blobs';

// The Deleted bin for orders. Deleting an order (order-detail.mjs) copies it here first; it can be
// restored for 30 days, after which it is removed for good the next time the list is opened.

const KEEP_DAYS = 30;
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
  const bin = getStore('flower-deleted-orders');

  if (req.method === 'GET') {
    const { blobs } = await bin.list();
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    const items = [];
    for (const b of blobs) {
      const rec = await bin.get(b.key, { type: 'json' });
      if (!rec) continue;
      if (new Date(rec.deleted_at).getTime() < cutoff) { await bin.delete(b.key); continue; }
      items.push(rec);
    }
    items.sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)));
    return json({ keep_days: KEEP_DAYS, items });
  }

  if (req.method !== 'POST') return json({ error: 'GET or POST only' }, 405);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
  const id = String(body.id || '');
  if (!id) return json({ error: 'id required' }, 400);
  const rec = await bin.get(id, { type: 'json' });
  if (!rec) return json({ error: 'Not found in the Deleted bin' }, 404);

  if (body.action === 'restore') {
    const orders = getStore('flower-orders');
    const existing = await orders.get(id, { type: 'json' });
    if (existing) return json({ error: 'An order with this ID already exists, so nothing was restored.' }, 409);
    await orders.setJSON(id, rec.order);
    await bin.delete(id);
    return json({ ok: true, restored: id });
  }
  if (body.action === 'purge') {
    await bin.delete(id);
    return json({ ok: true });
  }
  return json({ error: 'Unknown action' }, 400);
};

export const config = { path: '/api/deleted-orders' };
