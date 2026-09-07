import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

async function requireAuth(req) {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/scd_session=([a-f0-9]+)/);
  if (!match) return null;
  const sessionsStore = getStore('flower-sessions');
  const session = await sessionsStore.get(match[1], { type: 'json' });
  if (!session || new Date(session.expires_at) < new Date()) return null;
  return session.username;
}

export default async (req) => {
  const username = await requireAuth(req);
  if (!username) return json({ error: 'Not authenticated' }, 401);

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
        let r;
        if (zoneChanged) {
          // No historical rate exists for a zone the order never used
          // before - current rates are the only option here. Update the
          // snapshot too, so this becomes the new historical record for
          // this order going forward rather than silently drifting on
          // every future report run.
          const ratesStore = getStore('flower-rates');
          const rates = await ratesStore.get('rates', { type: 'json' }) || {};
          r = rates[updated.zone_code] || {};
          updated.rate_snapshot = r;
        } else {
          // Pieces-only correction: use the rate actually in effect when
          // this order was originally created, not today's rate table -
          // otherwise correcting a typo months later would retroactively
          // apply a rate change that had nothing to do with the mistake.
          // Falls back to current rates only for older orders that predate
          // rate snapshotting entirely.
          if (existing.rate_snapshot) {
            r = existing.rate_snapshot;
          } else {
            const ratesStore = getStore('flower-rates');
            const rates = await ratesStore.get('rates', { type: 'json' }) || {};
            r = rates[updated.zone_code] || {};
          }
        }
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
