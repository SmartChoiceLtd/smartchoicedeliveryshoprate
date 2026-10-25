import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

// Returns the Sunday (YYYY-MM-DD) that ends the Mon-Sun week containing
// the given date - same helper as orders.mjs, kept consistent so order
// keys can be found via prefix filtering regardless of which function
// created them.
function weekEndingSunday(dateStr) {
  let d = dateStr ? new Date(dateStr + 'T12:00:00') : null;
  // An unparseable date must still land on a real Sunday - previously this
  // returned today's date as-is, which is almost never a Sunday, so the
  // order got filed under a week key that no weekly report or pay run
  // would ever look up.
  if (!d || isNaN(d.getTime())) d = new Date();
  const day = d.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const daysToSunday = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + daysToSunday);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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

    const weekEnd = weekEndingSunday(localDate);
    // One fixed key per driver per day (the number is noon UTC of that date, so
    // the usual order_<week>_<time>_ key pattern still holds). Two scans that
    // arrive together both pass the "already" check above; with a fixed key the
    // second write lands on the same record instead of creating a second premium.
    const dayMs = Date.parse(localDate + 'T12:00:00Z') || Date.now();
    const orderId = `order_${weekEnd}_${dayMs}_premium${driver}`;
    const existingOrder = await getStore('flower-orders').get(orderId, { type: 'json' }).catch(() => null);
    if (existingOrder) {
      await premiumsStore.setJSON(key, { given_at: new Date().toISOString(), order_id: orderId });
      return;
    }
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
      // The premium belongs to Smart Choice itself, not a customer shop, so it is
      // filed under shop SCD (which shop billing and QuickBooks export skip).
      shop_code: 'SCD',
      shop_full: 'SCD SMART CHOICE DELIVERY',
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

// Recipient phone from the scan review card: only phone-number characters, short.
function cleanPhone(v) {
  return String(v == null ? '' : v).replace(/[^0-9+()\-.\sx]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 25);
}

export default async (req) => {
  const store = getStore('flower-stops');

  if (req.method === 'GET') {
    // Every stop ever scanned is kept, so reading them all gets slower each week. The route page asks for
    // only what it needs: ?days=N reads just stops created in the last N days (the id carries its creation
    // time, so the older ones are never even opened), and ?driver= / ?status= trim what is sent back.
    // With no parameters it still returns everything (Weekly Close and Reconciliation rely on that).
    const q = new URL(req.url).searchParams;
    const days = parseInt(q.get('days'), 10);
    const wantDriver = (q.get('driver') || '').toUpperCase();
    const wantStatus = q.get('status') || '';
    const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
    const { blobs } = await store.list();
    const keys = blobs.map(b => b.key).filter(k => {
      if (!cutoff) return true;
      const m = /^stop_(\d+)_/.exec(k);
      return !m || Number(m[1]) >= cutoff; // keep anything with an unrecognised key
    });
    let stops = (await Promise.all(keys.map(k => store.get(k, { type: 'json' })))).filter(Boolean);
    if (wantDriver) stops = stops.filter(s => String(s.driver || '').toUpperCase() === wantDriver);
    if (wantStatus) stops = stops.filter(s => s.status === wantStatus);
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
    // "1" is the placeholder for a tag with no order number (legacy process + scan default), so many
    // different deliveries from the same shop legitimately carry it. It must NOT be treated as the
    // same delivery or one stop would overwrite another.
    if (body.order_id && String(body.order_id).trim() !== '1' && body.shop_code) {
      const { blobs } = await store.list();
      const recentCut = Date.now() - 30 * 86400000;
      const recentKeys = blobs.map(b => b.key).filter(k => { const m = /^stop_(\d+)_/.exec(k); return !m || Number(m[1]) >= recentCut; });
      const existing = (await Promise.all(recentKeys.map(k => store.get(k, { type: 'json' })))).filter(Boolean);
      const match = existing.find(s =>
        s.status === 'pending' &&
        s.order_id === body.order_id &&
        s.shop_code === body.shop_code
      );
      if (match) {
        const updated = { ...match, driver: body.driver || match.driver, address: body.address || match.address, name: body.name || match.name, phone: cleanPhone(body.phone) || match.phone || null, delivery_type: body.delivery_type || match.delivery_type };
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
      phone: cleanPhone(body.phone) || null,
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
