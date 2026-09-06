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
    try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
    let updated = { ...existing, ...body, id };

    // If pieces or zone changed, recompute driver_pay from current rates
    // rather than leaving the old stored value in place - reports.mjs
    // prefers a stored driver_pay over recalculating, so a stale value
    // here would silently ignore a corrected piece count or zone.
    const piecesChanged = body.total_pieces !== undefined && body.total_pieces !== existing.total_pieces;
    const zoneChanged = body.zone_code !== undefined && body.zone_code !== existing.zone_code;
    if (piecesChanged || zoneChanged) {
      try {
        const ratesStore = getStore('flower-rates');
        const rates = await ratesStore.get('rates', { type: 'json' }) || {};
        const r = rates[updated.zone_code] || {};
        const pieces = parseInt(updated.total_pieces || 1);
        const dist = updated.distance_km ?? null;
        const base = ((updated.zone_code === 'RURALKM' || updated.zone_code === 'WRU') && dist != null)
          ? (r.drate || 0) + (r.perkm || 0) * dist
          : (r.drate || 0);
        updated.driver_pay = base + (pieces - 1) * (r.dratex || 0) + (r.gdpi || 0);
      } catch (e) { /* keep existing driver_pay if rates lookup fails */ }
    }

    await store.setJSON(id, updated);
    return json(updated);
  }

  if (req.method === 'DELETE') {
    const existing = await store.get(id, { type: 'json' });
    if (!existing) return json({ error: 'Order not found' }, 404);
    await store.delete(id);
    return new Response(null, { status: 204 });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/orders/*' };
