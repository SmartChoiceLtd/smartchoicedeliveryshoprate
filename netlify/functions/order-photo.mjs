import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export default async (req) => {
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(req.url);
  // Path is /api/order-photo/:id
  const parts = url.pathname.split('/').filter(Boolean);
  const orderId = decodeURIComponent(parts[parts.length - 1] || '');

  if (!orderId) {
    return json({ error: 'order id required' }, 400);
  }

  try {
    const photoStore = getStore('flower-order-photos');
    const dataUrl = await photoStore.get(orderId, { type: 'text' });
    if (!dataUrl) {
      return json({ error: 'No photo found for this order.' }, 404);
    }
    // Stored as a data URL (e.g. "data:image/jpeg;base64,....") from
    // canvas.toDataURL() in driver.html - return it as JSON so orders.html
    // can drop it straight into an <img src="..."> without extra parsing.
    return json({ order_id: orderId, photo_data_url: dataUrl });
  } catch (e) {
    return json({ error: 'Could not load photo: ' + e.message }, 500);
  }
};

export const config = { path: '/api/order-photo/*' };
