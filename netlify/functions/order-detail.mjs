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

// A shop's code is the first word of its name ("KF Kensington Flowers" -> "KF").
function codeOfName(name) {
  return String(name || '').trim().split(/\s+/)[0].toUpperCase();
}

// Wholesalers are not in the shop registry: they are a fixed list in the driver
// form's "Pick Up From (Wholesaler)" dropdown, and an order billed to one stores that
// dropdown label as its shop name. KEEP IN STEP with that list in driver.html.
const WHOLESALERS = {
  AM: 'AM AMAZING FLORAL WHOLESALE',
  WFW: 'WFW WEAVER FLORAL WHOLESALE',
  BA: 'BA BERNARD ANDERSON',
  FC: 'FC FLOWER CENTER',
  FS: 'FS FLORISTS SUPPLY',
  SV: 'SV SAVANAH',
  QF: 'QF QFRESH LOGISTICS',
  SB: 'SB SBE WHOLESALE'
};

// The full name that belongs with a shop / billed-to code, or null if nothing uses
// that code. The free wholesaler list is checked first so those lookups cost nothing.
async function nameForCode(code) {
  if (WHOLESALERS[code]) return WHOLESALERS[code];
  const shopStore = getStore('flower-shops');
  const { blobs } = await shopStore.list();
  const shops = await Promise.all(blobs.map(b => shopStore.get(b.key, { type: 'json' })));
  const shop = shops.filter(Boolean).find(sh => codeOfName(sh.name) === code);
  return shop ? shop.name : null;
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

    // The Override screen sends only a shop CODE. Without this, the stored shop NAME
    // stayed whatever the order was created with, so a corrected order showed the new
    // code beside the old shop's name. The name is now looked up from the code whenever
    // the code changes - and also when the stored name doesn't belong to the code at all
    // (an order corrected before this fix), which repairs it the next time it is saved.
    // A name the caller sends explicitly is respected.
    if (body.shop_code !== undefined && body.shop_full === undefined) {
      const newCode = String(body.shop_code || '').trim().toUpperCase();
      if (newCode) {
        updated.shop_code = newCode;
        const codeChanged = newCode !== String(existing.shop_code || '').trim().toUpperCase();
        const storedName = existing.shop_full || existing.shop || '';
        const nameMismatch = !!storedName && codeOfName(storedName) !== newCode;
        if (codeChanged || nameMismatch) {
          try {
            const name = await nameForCode(newCode);
            if (name) updated.shop_full = name;
            // A code nothing uses must not keep the previous shop's name - that is the
            // bug. Blank it (the screen then shows just the code) rather than mislead.
            else if (codeChanged) updated.shop_full = '';
          } catch (e) {
            // Saving a new code beside the old name would recreate the bug, so refuse and
            // let them retry. A repair-only lookup failing shouldn't block their other edits.
            if (codeChanged) return json({ error: 'Could not look up the shop name for ' + newCode + '. Nothing was saved - please try again.' }, 502);
          }
        }
      }
    }

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
        const hotR = updated.hot_rate_snapshot || {};
        const rushPremium = updated.rush ? (hotR.drate || 0) : 0;
        updated.driver_pay = base + (pieces - 1) * (r.dratex || 0) + (r.gdpi || 0) + rushPremium;
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
