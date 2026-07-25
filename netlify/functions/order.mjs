import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export default async (req) => {
  const url = new URL(req.url);
  const id = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop());
  const store = getStore('flower-orders');

  if (req.method === 'GET') {
    const order = await store.get(id, { type: 'json' });
    if (!order) return json({ error: 'Order not found' }, 404);
    return json(order);
  }

  if (req.method === 'PUT') {
    const existing = await store.get(id, { type: 'json' });
    if (!existing) return json({ error: 'Order not found' }, 404);
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
    const updated = { ...existing, ...body, id, updated_at: new Date().toISOString() };
    await store.setJSON(id, updated);
    return json(updated);
  }

  if (req.method === 'DELETE') {
    await store.delete(id);
    return new Response(null, { status: 204 });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/orders/:id' };
