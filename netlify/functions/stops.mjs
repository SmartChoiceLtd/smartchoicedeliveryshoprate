import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

// Driver NV gets an automatic daily premium (zone SC2) the first time they
// scan a tag each day - hardcoded to this one driver for now rather than a
// general per-driver config field, since generalizing this safely needs
// seeing drivers.mjs's actual structure first, which hasn't been reviewed
// yet. Uses a small dedicated store for the once-per-day check instead of
// scanning the whole orders history on every single scan, which would add
// real latency to a flow that's already been an issue today.
async function maybeApplyDailyPremium(driver, localDate) {
  if (driver !== 'NV' || !localDate) return;
  try {
    const premiumsStore = getStore('flower-daily-premiums');
    const key = driver + '_' + localDate;
    const already = await premiumsStore.get(key, { type: 'json' }).catch(() => null);
    if (already) return;

    const ratesStore = getStore('flower-rates');
    const rates = await ratesStore.get('rates', { type: 'json' }) || {};
    const r = rates['SC2'] || {};

    const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const order = {
      id: orderId,
      received_at: new Date().toISOString(),
      date: localDate,
      order_id: 'PREMIUM',
      name: 'Daily Premium (SC2)',
      address: null,
      formatted_address: null,
      community: null,
      distance_km: null,
      shop_code: null,
      shop_full: null,
      driver: driver,
      driver_pay: (r.drate || 0) + (r.gdpi || 0),
      total_pieces: 1,
      zone_entered: 'SC2',
      zone_code: 'SC2',
      zone_source: 'manual',
      zone_conflict: false,
      zone_suggestion: null,
      delivery_status: null,
      delivery_time: null,
      contact_method: null,
      neighboured_to: null,
      accepted_by: null,
      comments: 'Automatic daily premium',
      has_photo: false,
      rate_snapshot: rates['SC2'] || null,
    };

    const ordersStore = getStore('flower-orders');
    await ordersStore.setJSON(orderId, order);
    await premiumsStore.setJSON(key, { given_at: new Date().toISOString(), order_id: orderId });
  } catch (e) {
    // Best-effort - a failure here shouldn't block the driver from
    // scanning their actual delivery.
  }
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
        await maybeApplyDailyPremium(body.driver, body.local_date);
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
      skipped: false,
      status: 'pending', // 'pending' | 'fulfilled' | 'abandoned'
      fulfilled_at: null,
    };
    await store.setJSON(id, stop);
    await maybeApplyDailyPremium(body.driver, body.local_date);
    return json(stop, 201);
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/stops' };
