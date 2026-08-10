import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'Invalid JSON' }, 400); }
    const id = 'app_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const store = getStore('driver-applications');
    await store.setJSON(id, { id, ...body });
    return json({ success: true, id }, 201);
  }

  if (req.method === 'GET') {
    const store = getStore('driver-applications');
    const { blobs } = await store.list();
    const apps = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
    return json(apps.filter(Boolean).sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at)));
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/onboard' };
