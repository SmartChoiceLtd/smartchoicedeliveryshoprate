import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

// Map Zoho's "Shop (with Group Name)" to shop code
// Format from Zoho: "AC ACADIA GROWER DIRECT" — first token is the code
function extractShopCode(shopWithGroup) {
  if (!shopWithGroup) return null;
  return shopWithGroup.trim().split(/\s+/)[0].toUpperCase();
}

// Map Zoho's "Zone (with Group Name)" to zone code
// Format from Zoho: "C3 City Basic" or "BAK1 Bakery SCV ML YANNS" — first token is the code
function extractZoneCode(zoneWithGroup) {
  if (!zoneWithGroup) return null;
  return zoneWithGroup.trim().split(/\s+/)[0].toUpperCase();
}

// Determine if zone needs auto-calculation
function needsZoneCalculation(zoneCode) {
  if (!zoneCode || zoneCode === '' || zoneCode === '-SELECT-' || zoneCode === 'SELECT') return true;
  return false;
}

async function suggestZone(address, shopLat, shopLng, key) {
  try {
    const params = new URLSearchParams({ address, shop_lat: shopLat, shop_lng: shopLng });
    const res = await fetch(`https://smartchoicedeliveryshoprate.netlify.app/api/suggest-zone?${params}`);
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}

async function getShopLocation(shopCode) {
  try {
    const store = getStore('flower-shops');
    const { blobs } = await store.list();
    const shops = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
    const match = shops.filter(Boolean).find(s =>
      s.name && s.name.toUpperCase().startsWith(shopCode.toUpperCase())
    );
    return match ? { lat: match.lat, lng: match.lng } : null;
  } catch (e) {
    return null;
  }
}

export default async (req) => {
  // Handle GET — list all orders
  if (req.method === 'GET') {
    try {
      const store = getStore('flower-orders');
      const url = new URL(req.url);
      const limitParam = parseInt(url.searchParams.get('limit') || '500');
      const { blobs } = await store.list();
      const orders = await Promise.all(
        blobs.slice(-Math.min(limitParam, 1000)).map(b => store.get(b.key, { type: 'json' }))
      );
      return json(orders.filter(Boolean).sort((a, b) => new Date(b.received_at) - new Date(a.received_at)));
    } catch (e) {
      return json({ error: 'Could not load orders: ' + e.message }, 500);
    }
  }  
  // Handle POST — receive Zoho webhook
  if
   (req.method === 'POST') {
    const key = process.env.GOOGLE_MAPS_KEY;
    const ratesStore = getStore('flower-rates');
    let ratesData = {};
    try { ratesData = await ratesStore.get('rates', { type: 'json' }) || {}; } catch(e) {}
   let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: 'Invalid JSON payload' }, 400);
    }

    // Map Zoho field names to our internal structure
    try {
      body = await req.json();
    } catch (e) {
 
      return json({ error: 'Invalid JSON payload' }, 400);
    }

    // Map Zoho field names to our internal structure
    const raw = {
      date:             body['Date']                     || body['date']              || null,
      order_id:         body['Order ID']                 || body['order_id']          || null,
      name:             body['Name']                     || body['name']              || null,
      address: body['Address - Street Address'] || body['Address'] || body['address'] || null,
      shop:             body['Shop']                     || body['shop']              || null,
      shop_full:        body['Shop (with Group Name)']   || null,
      driver:           body['Driver']                   || body['driver']            || null,
      driver_pay: body.driver_pay || body['driver_pay'] || 0,
     total_pieces: body['Pcs'] || body['Total Pieces'] || body['total_pieces'] || body['pcs'] || null,
      zone:             body['Zone']                     || body['zone']              || null,
      zone_full:        body['Zone (with Group Name)']   || null,
      delivery_status: body['Delivery Status'] || body['delivery_status'] || null,
      delivery_time:    body['Delivery Time']            || null,
      contact_method:   body['Recipient Contact Method'] || null,
      neighboured_to:   body['Neighboured To']           || null,
      accepted_by:      body['Delivery Accept By']       || null,
      comments:         body['Comments']                 || null,
    };

    const shopCode = extractShopCode(raw.shop_full) || extractShopCode(raw.shop) || raw.shop_code;
    const enteredZoneCode = extractZoneCode(raw.zone_full) || raw.zone;

    // Auto-calculate zone if not entered or flagged as needing calculation
    let zoneCode = enteredZoneCode;
    let zoneSource = 'manual';
    let zoneSuggestion = null;

    if (raw.address && key && needsZoneCalculation(enteredZoneCode)) {
      const shopLoc = shopCode ? await getShopLocation(shopCode) : null;
      zoneSuggestion = await suggestZone(
        raw.address,
        shopLoc?.lat || 51.0447,
        shopLoc?.lng || -114.0719,
        key
      );
      if (zoneSuggestion?.suggested && zoneSuggestion.confidence !== 'manual') {
        zoneCode = zoneSuggestion.suggested;
        zoneSource = 'auto';
      } else {
        zoneSource = 'needs_review';
      }
    } else if (enteredZoneCode) {
      // Zone was entered manually — still run suggestion for comparison
      if (raw.address && key) {
        const shopLoc = shopCode ? await getShopLocation(shopCode) : null;
        zoneSuggestion = await suggestZone(
          raw.address,
          shopLoc?.lat || 51.0447,
          shopLoc?.lng || -114.0719,
          key
        );
      }
    }

    // Flag if manual zone differs from suggestion
   const isWholesale = (raw.delivery_type === 'wholesale') || 
      (enteredZoneCode && enteredZoneCode.toUpperCase().startsWith('W'));
    const zoneConflict = !isWholesale &&
      zoneSuggestion?.suggested &&
      enteredZoneCode &&
      zoneSuggestion.suggested !== enteredZoneCode &&
      zoneSuggestion.confidence === 'high';

    const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const order = {
      id: orderId,
      received_at: new Date().toISOString(),
      date: raw.date,
      order_id: raw.order_id,
      name: raw.name,
      address: raw.address,
      formatted_address: zoneSuggestion?.formatted_address || raw.address,
      shop_code: shopCode,
      shop_full: raw.shop_full,
      driver: raw.driver,
      driver_pay: (function() {
        if (raw.driver_pay) return parseFloat(raw.driver_pay);
        const r = ratesData[zoneCode];
        if (!r) return 0;
        const pieces = parseInt(raw.total_pieces || 1);
        return (r.drate || 0) + (pieces - 1) * (r.dratex || 0) + (r.gdpi || 0);
      })(),
      total_pieces: raw.total_pieces,
      zone_entered: enteredZoneCode,
      zone_code: zoneCode,
      zone_source: zoneSource,          // 'manual', 'auto', 'needs_review'
      zone_conflict: zoneConflict,      // true if driver zone ≠ suggested zone
      zone_suggestion: zoneSuggestion,  // full suggestion object for reference
      delivery_status: raw.delivery_status,
      delivery_time: raw.delivery_time,
      contact_method: raw.contact_method,
      neighboured_to: raw.neighboured_to,
      accepted_by: raw.accepted_by,
      comments: raw.comments,
    };

    try {
      const store = getStore('flower-orders');
      await store.setJSON(orderId, order);
      return json({ success: true, order_id: orderId, zone_code: zoneCode, zone_source: zoneSource }, 201);
    } catch (e) {
      return json({ error: 'Could not store order: ' + e.message }, 500);
    }
  }
  
    return json({ error: 'Method not allowed' }, 405);
    };

export const config = { path: '/api/orders' };
