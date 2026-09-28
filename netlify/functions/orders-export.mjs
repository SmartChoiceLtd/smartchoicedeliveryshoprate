import { getStore } from '@netlify/blobs';

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCSVRow(fields) {
  return fields.map(csvEscape).join(',');
}

// The calendar day (YYYY-MM-DD) an order belongs to, whatever format its
// date arrived in: ISO from the driver form, DD-Mon-YYYY / D/M/YYYY from
// the Zoho webhook, or a full timestamp.
function orderIsoDate(o) {
  const raw = o && (o.date || o.received_at);
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
  let m = s.match(/^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{4})/);
  if (m && months[m[2].toLowerCase()]) return m[3] + '-' + months[m[2].toLowerCase()] + '-' + m[1].padStart(2, '0');
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return null;
}

// The Monday-to-Sunday week ending on weekEnd: returns its Monday.
function weekStartIso(weekEnd) {
  const d = new Date(weekEnd + 'T12:00:00');
  d.setDate(d.getDate() - 6);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Fetches just one week's orders instead of every order ever created.
// Orders are stored under keys that embed their week-ending Sunday
// (order_<sunday>_<timestamp>_<random>), so the bulk of them come back from
// a fast prefix lookup. Older orders (no week in the key) and any that were
// filed under a different week are recovered by their key timestamp, padded
// a little either side for late entries. The exact date check at the end is
// what decides what's in the export - the key lookups only narrow the fetch.
async function getOrdersForWeek(store, weekEnd) {
  const startIso = weekStartIso(weekEnd);
  const DAY = 86400000;
  const startMs = new Date(startIso + 'T00:00:00').getTime() - DAY;
  const endMs = new Date(weekEnd + 'T23:59:59').getTime() + 7 * DAY;

  const { blobs: prefixed } = await store.list({ prefix: `order_${weekEnd}_` });
  const { blobs: all } = await store.list();
  const fallback = all.filter(b => {
    if (b.key.startsWith(`order_${weekEnd}_`)) return false;
    const m = b.key.match(/^order_(?:\d{4}-\d{2}-\d{2}_)?(\d+)_/);
    if (!m) return false;
    const ts = parseInt(m[1]);
    return ts >= startMs && ts <= endMs;
  });
  const fetched = (await Promise.all(prefixed.concat(fallback).map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);
  return fetched.filter(o => {
    const d = orderIsoDate(o);
    return d && d >= startIso && d <= weekEnd;
  });
}

export default async (req) => {
  try {
    const store = getStore('flower-orders');
    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'detail';

    // Optional: limit the export to one Monday-to-Sunday week, identified by
    // the Sunday it ends on. Without it, every order is exported, as before.
    const weekEnd = url.searchParams.get('week_end');
    if (weekEnd && !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)) {
      return new Response(JSON.stringify({ error: 'week_end must be YYYY-MM-DD' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    let orders;
    if (weekEnd) {
      orders = await getOrdersForWeek(store, weekEnd);
    } else {
      const { blobs } = await store.list();
      orders = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);
    }
    orders.sort((a, b) => (orderIsoDate(a) || '').localeCompare(orderIsoDate(b) || ''));

    // File names carry the week ending so exports from different weeks
    // don't collide or get mixed up in a downloads folder.
    const fileTag = weekEnd ? 'week-ending-' + weekEnd : new Date().toISOString().slice(0, 10);

    if (format === 'detail') {
      const headers = ['Date','Order ID','Name','Address','Shop Code','Shop','Driver','Pieces','Zone','Zone Source','Delivery Status','Delivery Time','Accepted By','Contact Method','Neighboured To','Comments','Driver Pay','Delivery Type','Wholesaler','Billing Party','Received At'];
      const rows = orders.map(o => toCSVRow([
        o.date, o.order_id, o.name, o.formatted_address || o.address,
        o.shop_code, o.shop_full || o.shop, o.driver, o.total_pieces,
        o.zone_code, o.zone_source,
        Array.isArray(o.delivery_status) ? o.delivery_status.join('; ') : o.delivery_status,
        o.delivery_time, o.accepted_by, o.contact_method,
        o.neighboured_to, o.comments, o.driver_pay,
        o.delivery_type, o.wholesaler, o.billing_party, o.received_at
      ]));
      const csv = [toCSVRow(headers), ...rows].join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv',
          'content-disposition': `attachment; filename="orders-detail-${fileTag}.csv"`
        }
      });
    }

    if (format === 'pivot') {
      const pivot = {};
      orders.forEach(o => {
        const shop = o.shop_code || 'UNKNOWN';
        const zone = o.zone_code || 'UNKNOWN';
        const key = `${shop}__${zone}`;
        if (!pivot[key]) pivot[key] = { shop, zone, count: 0, pieces: 0 };
        pivot[key].count++;
        pivot[key].pieces += parseInt(o.total_pieces || 1);
      });
      const headers = ['Shop Code','Zone','Order Count','Total Pieces'];
      const rows = Object.values(pivot)
        .sort((a,b) => a.shop.localeCompare(b.shop) || a.zone.localeCompare(b.zone))
        .map(r => toCSVRow([r.shop, r.zone, r.count, r.pieces]));
      const csv = [toCSVRow(headers), ...rows].join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv',
          'content-disposition': `attachment; filename="orders-pivot-${fileTag}.csv"`
        }
      });
    }

    if (format === 'driver') {
      const pivot = {};
      orders.forEach(o => {
        const driver = o.driver || 'UNKNOWN';
        const zone = o.zone_code || 'UNKNOWN';
        const key = `${driver}__${zone}`;
        if (!pivot[key]) pivot[key] = { driver, zone, count: 0, pieces: 0, pay: 0 };
        pivot[key].count++;
        pivot[key].pieces += parseInt(o.total_pieces || 1);
        pivot[key].pay += parseFloat(o.driver_pay || 0);
      });
      const headers = ['Driver','Zone','Delivery Count','Total Pieces','Total Pay'];
      const rows = Object.values(pivot)
        .sort((a,b) => a.driver.localeCompare(b.driver) || a.zone.localeCompare(b.zone))
        .map(r => toCSVRow([r.driver, r.zone, r.count, r.pieces, r.pay.toFixed(2)]));
      const csv = [toCSVRow(headers), ...rows].join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv',
          'content-disposition': `attachment; filename="orders-driver-${fileTag}.csv"`
        }
      });
    }

    return new Response(JSON.stringify({ error: 'format must be detail, pivot, or driver' }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Export failed: ' + e.message }), { status: 500 });
  }
};

export const config = { path: '/api/export' };
