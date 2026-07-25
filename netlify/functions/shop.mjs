import { getStore } from '@netlify/blobs';
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }); }
export default async (req) => {
  const url = new URL(req.url);
  const id = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop());
  const store = getStore('flower-shops');
  if (req.method === 'GET') { const shop = await store.get(id, { type: 'json' }); if (!shop) return json({ error: 'Shop not found' }, 404); return json(shop); }
  if (req.method === 'PUT') { const existing = await store.get(id, { type: 'json' }); if (!existing) return json({ error: 'Shop not found' }, 404); let body; try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); } const updated = { ...existing, ...body, id }; await store.setJSON(id, updated); return json(updated); }
  if (req.method === 'DELETE') { await store.delete(id); return new Response(null, { status: 204 }); }
  return json({ error: 'Method not allowed' }, 405);
};
export const config = { path: '/api/shops/*' };
