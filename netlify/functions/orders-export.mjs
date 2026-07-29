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

export default async (req) => {
  try {
    const store = getStore('flower-orders');
    const { blobs } = await store.list();
    const orders = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }))))
      .filter(Boolean)
      .sort((a, b) => new Date(a.date || a.received_at) - new Date(b.date || b.received_at));

    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'detail';

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
          'content-disposition': `attachment; filename="orders-detail-${new Date().toISOString().slice(0,10)}.csv"`
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
          'content-disposition': `attachment; filename="orders-pivot-${new Date().toISOString().slice(0,10)}.csv"`
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
          'content-disposition': `attachment; filename="orders-driver-${new Date().toISOString().slice(0,10)}.csv"`
        }
      });
    }

    return new Response(JSON.stringify({ error: 'format must be detail, pivot, or driver' }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Export failed: ' + e.message }), { status: 500 });
  }
};

export const config = { path: '/api/export' };
