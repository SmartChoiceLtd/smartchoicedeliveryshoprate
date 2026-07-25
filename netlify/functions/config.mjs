export default async () => {
  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return new Response(JSON.stringify({ error: 'GOOGLE_MAPS_KEY not set.' }), { status: 500, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ key }), { status: 200, headers: { 'content-type': 'application/json' } });
};
export const config = { path: '/api/config' };
