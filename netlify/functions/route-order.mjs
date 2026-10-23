// POST /api/route-order  { origin: {lat,lng} | null, stops: [{id, address}] }
// Orders the driver's stops NEAREST FIRST by driving time from where the driver is right now.
// Drivers collect from nearby shops all day and rarely finish a planned loop, so the order is not a fixed
// tour: it is recalculated from the current position each time the route is loaded or refreshed.
// Without a location, the first stop is treated as the starting point.
// If Google refuses, the reply carries Google's own status and message.
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
  const withCity = a => /calgary|alberta|, ab\b/i.test(a) ? a : a + ', Alberta, Canada';
  const origin = hasOrigin ? o.lat + ',' + o.lng : withCity(stops[0].address);
  const params = new URLSearchParams({
    origins: origin,
    destinations: stops.map(s => withCity(s.address)).join('|'),
    mode: 'driving', units: 'metric', key
  });
  let data;
  try {
    const r = await fetch('https://maps.googleapis.com/maps/api/distancematrix/json?' + params.toString(), { signal: AbortSignal.timeout(8000) });
    data = await r.json();
  } catch (e) { return json({ error: 'Could not reach Google: ' + e.message }, 502); }
  if (data.status !== 'OK' || !data.rows || !data.rows[0]) {
    return json({ error: 'Google Distance Matrix: ' + data.status, google_status: data.status, google_message: data.error_message || null }, 502);
  }
  const els = data.rows[0].elements || [];
  const scored = stops.map((s, i) => {
    const e = els[i];
    return { s, i, secs: e && e.status === 'OK' && e.duration ? e.duration.value : null };
  });
  // Nearest first. A stop Google could not measure keeps its place after the measured ones.
  scored.sort((a, b) => {
    if (a.secs === null && b.secs === null) return a.i - b.i;
    if (a.secs === null) return 1;
    if (b.secs === null) return -1;
    return a.secs - b.secs || a.i - b.i;
  });
  const first = scored[0];
  return json({
    ids: scored.map(x => x.s.id),
    next_minutes: first && first.secs !== null ? Math.max(1, Math.round(first.secs / 60)) : null,
    from: hasOrigin ? 'location' : 'first_stop'
  });
};

export const config = { path: '/api/route-order' };
