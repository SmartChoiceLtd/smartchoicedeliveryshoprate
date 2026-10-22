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
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }); }
function slugify(name) { const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); return (base || 'shop') + '-' + Math.random().toString(36).slice(2, 6); }
export default async (req) => {
  const store = getStore('flower-shops');
  if (req.method === 'GET') { const { blobs } = await store.list(); const shops = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }))); return json(shops.filter(Boolean)); }
  if (req.method === 'POST') {
    let body; try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
    if (!body.name || !body.address || typeof body.lat !== 'number' || typeof body.lng !== 'number') return json({ error: 'name, address, lat, and lng are required' }, 400);
    const id = slugify(body.name);
    const shop = { id, name: body.name, address: body.address, lat: body.lat, lng: body.lng, zonePrices: body.zonePrices || { C1:10,C2:15,C3:20,C4:30,OUT1:45,OUT2:55,OUT3:75,OUT4:95,OUT5:120 }, communityZones: body.communityZones || {}, townPrices: body.townPrices || {} };
    await store.setJSON(id, shop); await logShopChange(req, null, shop); return json(shop, 201);
  }
  return json({ error: 'Method not allowed' }, 405);
};
export const config = { path: '/api/shops' };
