import { getStore } from '@netlify/blobs';

// The Deleted bin for shops and drivers. shop-detail.mjs and drivers.mjs copy a record here before
// deleting it. It can be restored for 90 days; after that it is removed for good the next time the list
// is opened. A driver's pay ledger and PIN are kept separately and are not touched by a delete.

const KEEP_DAYS = 90;
const TARGET = { shop: 'flower-shops', driver: 'flower-drivers' };
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
  const bin = getStore('flower-deleted-records');

  if (req.method === 'GET') {
    const { blobs } = await bin.list();
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    const items = [];
    for (const b of blobs) {
      const rec = await bin.get(b.key, { type: 'json' });
      if (!rec) continue;
      if (new Date(rec.deleted_at).getTime() < cutoff) { await bin.delete(b.key); continue; }
      items.push({ bin_id: rec.bin_id || b.key, type: rec.type, key: rec.key, label: rec.label, deleted_at: rec.deleted_at, deleted_by: rec.deleted_by });
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
    const storeName = TARGET[rec.type];
    if (!storeName) return json({ error: 'Unknown record type' }, 400);
    const target = getStore(storeName);
    // A strong read, so a record deleted a moment ago is not still "seen" from a cached copy.
    const existing = await target.get(rec.key, { type: 'json', consistency: 'strong' });
    if (existing) return json({ error: 'A ' + rec.type + ' with this ID/code is currently in the live list, so nothing was restored. If you just deleted it, reload the Admin list to check, then try again.' }, 409);
    await target.setJSON(rec.key, rec.record);
    await bin.delete(id);
    return json({ ok: true, restored: rec.label });
  }
  if (body.action === 'purge') {
    await bin.delete(id);
    return json({ ok: true });
  }
  return json({ error: 'Unknown action' }, 400);
};

export const config = { path: '/api/deleted-records' };
