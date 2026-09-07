import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export default async (req) => {
  const store = getStore('flower-stops');

  if (req.method === 'GET') {
    const { blobs } = await store.list();
    const stops = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);
    return json(stops.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }

    // Handoff case: another driver may already have scanned this same
    // delivery (order_id + shop_code both match) and handed the physical
    // tag off for better routing. Rather than creating a disconnected
    // duplicate - which would leave the original stop looking falsely
    // "abandoned" forever even though the delivery genuinely got done -
    // treat this as the same stop continuing under a new driver.
    if (body.order_id && body.shop_code) {
      const { blobs } = await store.list();
      const existing = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);
      const match = existing.find(s =>
        s.status === 'pending' &&
        s.order_id === body.order_id &&
        s.shop_code === body.shop_code
      );
      if (match) {
        const updated = { ...match, driver: body.driver || match.driver, address: body.address || match.address, name: body.name || match.name, delivery_type: body.delivery_type || match.delivery_type };
        await store.setJSON(match.id, updated);
        return json(updated);
      }
    }

    const id = `stop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const stop = {
      id,
      created_at: new Date().toISOString(),
      driver: body.driver || null,
      shop_code: body.shop_code || null,
      address: body.address || null,
      name: body.name || null,
      order_id: body.order_id || null,
      delivery_type: body.delivery_type || 'store',
      status: 'pending', // 'pending' | 'fulfilled' | 'abandoned'
      fulfilled_at: null,
    };
    await store.setJSON(id, stop);
    return json(stop, 201);
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/stops' };
