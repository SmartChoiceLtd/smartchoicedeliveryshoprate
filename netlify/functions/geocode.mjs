export default async (req) => {
  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return new Response(JSON.stringify({ error: 'Maps key not configured.' }), { status: 500, headers: { 'content-type': 'application/json' } });
  const url = new URL(req.url);
  const address = url.searchParams.get('address');
  if (!address) return new Response(JSON.stringify({ error: 'address param required' }), { status: 400, headers: { 'content-type': 'application/json' } });
  const gUrl = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(address) + '&key=' + key;
  const res = await fetch(gUrl);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results[0]) return new Response(JSON.stringify({ error: 'Could not find that address (status: ' + data.status + ').' }), { status: 404, headers: { 'content-type': 'application/json' } });
  const r = data.results[0];
  return new Response(JSON.stringify({ formatted: r.formatted_address, lat: r.geometry.location.lat, lng: r.geometry.location.lng }), { status: 200, headers: { 'content-type': 'application/json' } });
};
export const config = { path: '/api/geocode' };
