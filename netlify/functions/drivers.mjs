import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export default async (req) => {
  const store = getStore('flower-drivers');
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const code = url.searchParams.get('code');
    if (code) {
      try {
        const driver = await store.get(code.toLowerCase(), { type: 'json' });
        if (!driver) return json({ error: 'Driver not found' }, 404);
        return json(driver);
      } catch(e) { return json({ error: 'Driver not found' }, 404); }
    }
    const { blobs } = await store.list();
    const drivers = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
    return json(drivers.filter(Boolean).sort((a,b) => a.name.localeCompare(b.name)));
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'Invalid JSON' }, 400); }
    if (!body.code || !body.name) return json({ error: 'code and name required' }, 400);
    const key = body.code.toLowerCase();
    const driver = {
      code: body.code.toUpperCase(),
      name: body.name,
      vehicle: body.vehicle || '',
      active: true,
      created_at: new Date().toISOString()
    };
    await store.setJSON(key, driver);
    return json(driver, 201);
  }

  if (req.method === 'PUT') {
    const code = url.searchParams.get('code');
    if (!code) return json({ error: 'code required' }, 400);
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'Invalid JSON' }, 400); }
    let existing;
    try { existing = await store.get(code.toLowerCase(), { type: 'json' }); }
    catch(e) { return json({ error: 'Driver not found' }, 404); }
    const updated = { ...existing, ...body, code: existing.code };
    await store.setJSON(code.toLowerCase(), updated);
    return json(updated);
  }
  if (req.method === 'DELETE') {
    const code = url.searchParams.get('code');
    if (!code) return json({ error: 'code required' }, 400);
    await store.delete(code.toLowerCase());
    return json({ deleted: code });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/drivers' };
