import { getStore } from '@netlify/blobs';
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
    await store.setJSON(id, shop); return json(shop, 201);
  }
  return json({ error: 'Method not allowed' }, 405);
};
export const config = { path: '/api/shops' };
