export default async (req) => {
  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return new Response(JSON.stringify({ error: 'Maps key not configured.' }), { status: 500, headers: { 'content-type': 'application/json' } });
  const url = new URL(req.url);
  const oLat = url.searchParams.get('origin_lat'), oLng = url.searchParams.get('origin_lng');
  const dLat = url.searchParams.get('dest_lat'), dLng = url.searchParams.get('dest_lng');
  if (!oLat || !oLng || !dLat || !dLng) return new Response(JSON.stringify({ error: 'Missing params.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  const gUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json?origins=' + oLat + ',' + oLng + '&destinations=' + dLat + ',' + dLng + '&mode=driving&units=metric&key=' + key;
  const res = await fetch(gUrl);
  const data = await res.json();
  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') return new Response(JSON.stringify({ error: 'Could not calculate driving distance.' }), { status: 404, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ km: el.distance.value / 1000 }), { status: 200, headers: { 'content-type': 'application/json' } });
};
export const config = { path: '/api/distance' };
