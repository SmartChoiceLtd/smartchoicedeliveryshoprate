// POST /api/route-order  { origin: {lat,lng} | null, stops: [{id, address}] }
// Asks Google Directions (from the server, where the key is not exposed and CORS does not apply) for the
// best visiting order, and returns { ids: [stop ids in order] }. If Google refuses, the reply carries
// Google's own status and message so the cause is visible instead of silently keeping the old order.
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const key = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_KEY;
  if (!key) return json({ error: 'No Google Maps key configured' }, 500);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
  const stops = (Array.isArray(body.stops) ? body.stops : []).filter(s => s && s.id && s.address).slice(0, 25);
  if (stops.length < 2) return json({ ids: stops.map(s => s.id), note: 'fewer than 2 stops' });
  const o = body.origin;
  const hasOrigin = o && isFinite(o.lat) && isFinite(o.lng);
  // With a real starting point every stop can move; without one, the first stop is the start.
  const start = hasOrigin ? o.lat + ',' + o.lng : stops[0].address;
  const rest = hasOrigin ? stops : stops.slice(1);
  const dest = rest[rest.length - 1];
  const mids = rest.slice(0, -1);
  const withCity = a => /calgary|alberta|, ab\b/i.test(a) ? a : a + ', Alberta, Canada';
  const params = new URLSearchParams({ origin: hasOrigin ? start : withCity(start), destination: withCity(dest.address), key });
  if (mids.length) params.set('waypoints', 'optimize:true|' + mids.map(s => withCity(s.address)).join('|'));
  let data;
  try {
    const r = await fetch('https://maps.googleapis.com/maps/api/directions/json?' + params.toString(), { signal: AbortSignal.timeout(8000) });
    data = await r.json();
  } catch (e) { return json({ error: 'Could not reach Google: ' + e.message }, 502); }
  if (data.status !== 'OK' || !data.routes || !data.routes[0]) {
    return json({ error: 'Google Directions: ' + data.status, google_status: data.status, google_message: data.error_message || null }, 502);
  }
  const order = data.routes[0].waypoint_order || [];
  const ids = [];
  if (!hasOrigin) ids.push(stops[0].id);
  order.forEach(i => ids.push(mids[i].id));
  ids.push(dest.id);
  return json({ ids });
};

export const config = { path: '/api/route-order' };
