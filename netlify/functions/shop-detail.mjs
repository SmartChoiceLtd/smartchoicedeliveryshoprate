import { getStore } from '@netlify/blobs';


// Price/name changes to a shop are recorded in flower-rate-history (kind "shop"). Not blocked or login-gated
// here - the quote page also saves shops - so "by" is the signed-in user when there is one.
async function whoIs(req) {
  try {
    const m = (req.headers.get('cookie') || '').match(/scd_session=([a-f0-9]+)/);
    if (!m) return 'not signed in';
    const s = await getStore('flower-sessions').get(m[1], { type: 'json' });
    return (s && new Date(s.expires_at) > new Date()) ? s.username : 'not signed in';
  } catch (e) { return 'unknown'; }
}
function flat(prefix, obj, out) {
  Object.keys(obj || {}).forEach(k => { out[prefix + '.' + k] = obj[k]; });
}
function shopFields(s) {
  const out = {};
  if (!s) return out;
  ['name', 'address', 'featured'].forEach(k => { if (s[k] !== undefined) out[k] = s[k]; });
  flat('zonePrices', s.zonePrices, out); flat('townPrices', s.townPrices, out); flat('communityZones', s.communityZones, out);
  return out;
}
async function logShopChange(req, before, after) {
  try {
    const b = shopFields(before), a = shopFields(after), changes = [];
    new Set([...Object.keys(b), ...Object.keys(a)]).forEach(f => {
      if (JSON.stringify(b[f]) !== JSON.stringify(a[f])) changes.push({ field: f, from: b[f] === undefined ? null : b[f], to: a[f] === undefined ? null : a[f] });
    });
    if (!changes.length) return;
    const at = new Date().toISOString();
    const shop = after || before;
    await getStore('flower-rate-history').setJSON(at + '_' + Math.random().toString(36).slice(2, 6), { at, by: await whoIs(req), kind: 'shop', target: shop.name || shop.id, shop_id: shop.id, changes });
  } catch (e) { console.error('shop history log failed:', e.message); }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export default async (req) => {
  const url = new URL(req.url);
  const id = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop());
  const store = getStore('flower-shops');

  if (req.method === 'GET') {
    const shop = await store.get(id, { type: 'json' });
    if (!shop) return json({ error: 'Shop not found' }, 404);
    return json(shop);
  }

  if (req.method === 'PUT') {
    const existing = await store.get(id, { type: 'json' });
    if (!existing) return json({ error: 'Shop not found' }, 404);
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
    const updated = { ...existing, ...body, id };
    await store.setJSON(id, updated);
    await logShopChange(req, existing, updated);
    return json(updated);
  }

  if (req.method === 'DELETE') {
    if ((await whoIs(req)) === 'not signed in') return json({ error: 'Not authenticated - sign in to delete a shop' }, 401);
    const gone = await store.get(id, { type: 'json' }).catch(() => null);
    if (gone) {
      await logShopChange(req, gone, { id, name: gone.name, __deleted: true });
      // Keep a copy in the Deleted bin (Hub > Deleted Shops & Drivers) so a mistaken delete can be undone.
      try {
        const at = new Date().toISOString();
        await getStore('flower-deleted-records').setJSON('shop_' + id + '_' + Date.now(), { bin_id: 'shop_' + id + '_' + Date.now(), type: 'shop', key: id, label: gone.name || id, deleted_at: at, deleted_by: await whoIs(req), record: gone });
      } catch (e) { console.error('bin copy failed:', e.message); }
    }
    await store.delete(id);
    return new Response(null, { status: 204 });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/shops/*' };
