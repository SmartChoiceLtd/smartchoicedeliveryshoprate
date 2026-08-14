import { getStore } from '@netlify/blobs';
import { Resend } from 'resend';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });
}

function getWeekBounds(weekEnd) {
  const end = new Date(weekEnd + 'T23:59:59');
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function parseOrderDate(o) {
  const raw = o.date || o.received_at;
  if (!raw) return new Date(0);
  return new Date(raw);
}

function formatCurrency(n) {
  return '$' + (parseFloat(n) || 0).toFixed(2);
}

function formatDate(raw) {
  if (!raw) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(raw);
  return months[d.getMonth()] + ' ' + d.getDate();
}

async function sendDriverPayEmail(driver, orders, weekEnd, rates) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const weekTotal = orders.reduce((sum, o) => sum + (parseFloat(o.driver_pay) || 0), 0);
  const totalDeliveries = orders.length;
  const weekAvg = totalDeliveries > 0 ? weekTotal / totalDeliveries : 0;

  // YTD
  const ytdStartPay = parseFloat(driver.ytd_start_pay) || 0;
  const ytdStartDeliveries = parseInt(driver.ytd_start_deliveries) || 0;
  const ytdPay = ytdStartPay + weekTotal;
  const ytdDeliveries = ytdStartDeliveries + totalDeliveries;
  const ytdAvg = ytdDeliveries > 0 ? ytdPay / ytdDeliveries : 0;

  // Zone breakdown
  const zoneBreak = {};
  orders.forEach(o => {
    const z = o.zone_code || 'UNK';
    if (!zoneBreak[z]) zoneBreak[z] = { deliveries: 0, pay: 0 };
    zoneBreak[z].deliveries++;
    zoneBreak[z].pay += parseFloat(o.driver_pay) || 0;
  });

  const zoneRows = Object.keys(zoneBreak).sort().map(z =>
    `<tr>
      <td style="padding:5px 10px;">${z}</td>
      <td style="padding:5px 10px;text-align:center;">${zoneBreak[z].deliveries}</td>
      <td style="padding:5px 10px;text-align:right;">${formatCurrency(zoneBreak[z].pay)}</td>
      <td style="padding:5px 10px;text-align:right;color:#6B6256;">${formatCurrency(zoneBreak[z].deliveries > 0 ? zoneBreak[z].pay / zoneBreak[z].deliveries : 0)}</td>
    </tr>`
  ).join('');

  // Detail rows
  orders.sort((a, b) => new Date(a.date || a.received_at) - new Date(b.date || b.received_at));
  const detailRows = orders.map(o =>
    `<tr style="border-bottom:1px solid #E6DECF;">
      <td style="padding:5px 8px;">${formatDate(o.date || o.received_at)}</td>
      <td style="padding:5px 8px;">${o.shop_code || ''}</td>
      <td style="padding:5px 8px;">${o.zone_code || ''}</td>
      <td style="padding:5px 8px;text-align:center;">${o.total_pieces || 1}</td>
      <td style="padding:5px 8px;text-align:right;">${formatCurrency(o.driver_pay)}</td>
    </tr>`
  ).join('');

  const firstName = (driver.name || '').split(' ')[0];

  const html = `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#2B2620;background:#FAF7F2;">

  <!-- Header -->
  <div style="background:#0C769E;padding:18px 24px;border-bottom:4px solid #B8472B;">
    <h1 style="color:#fff;font-family:Georgia,serif;margin:0;font-size:20px;">Smart Choice Delivery</h1>
    <p style="color:#D6EEF7;margin:3px 0 0;font-size:12px;">Driver Pay Statement — Week Ending ${weekEnd}</p>
  </div>

  <div style="padding:20px 24px;background:#fff;">
    <p style="font-size:15px;margin:0 0 16px;">Hi ${firstName},</p>

    <!-- Summary Box -->
    <div style="background:#D6EEF7;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:30px;font-weight:700;color:#0C769E;">${formatCurrency(weekTotal)}</div>
            <div style="font-size:11px;color:#6B6256;text-transform:uppercase;letter-spacing:0.05em;">This Week</div>
          </td>
          <td style="text-align:center;padding:8px;border-left:1px solid #B0D4E8;">
            <div style="font-size:24px;font-weight:700;color:#2B2620;">${totalDeliveries}</div>
            <div style="font-size:11px;color:#6B6256;text-transform:uppercase;letter-spacing:0.05em;">Deliveries</div>
          </td>
          <td style="text-align:center;padding:8px;border-left:1px solid #B0D4E8;">
            <div style="font-size:24px;font-weight:700;color:#2B2620;">${formatCurrency(weekAvg)}</div>
            <div style="font-size:11px;color:#6B6256;text-transform:uppercase;letter-spacing:0.05em;">Avg / Delivery</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- YTD -->
    <div style="background:#EAF4EA;border:1px solid #A8CFA8;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:700;color:#2C6B2C;text-transform:uppercase;margin-bottom:8px;">Year to Date — Dec 29, 2025</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:3px 0;color:#6B6256;">Total Deliveries</td>
          <td style="padding:3px 0;text-align:right;font-weight:600;">${ytdDeliveries}</td>
          <td style="padding:3px 0;color:#6B6256;padding-left:24px;">Total Pay</td>
          <td style="padding:3px 0;text-align:right;font-weight:600;">${formatCurrency(ytdPay)}</td>
          <td style="padding:3px 0;color:#6B6256;padding-left:24px;">Avg/Delivery</td>
          <td style="padding:3px 0;text-align:right;font-weight:600;">${formatCurrency(ytdAvg)}</td>
        </tr>
      </table>
    </div>

    <!-- Zone Breakdown -->
    <h3 style="color:#0C769E;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;border-bottom:2px solid #B8472B;padding-bottom:4px;">Zone Breakdown</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
      <thead>
        <tr style="background:#0C769E;color:#fff;">
          <th style="padding:6px 10px;text-align:left;">Zone</th>
          <th style="padding:6px 10px;text-align:center;">Deliveries</th>
          <th style="padding:6px 10px;text-align:right;">Total Pay</th>
          <th style="padding:6px 10px;text-align:right;">Avg/Del</th>
        </tr>
      </thead>
      <tbody>${zoneRows}</tbody>
      <tfoot>
        <tr style="background:#F4DCC9;font-weight:700;">
          <td style="padding:6px 10px;">TOTAL</td>
          <td style="padding:6px 10px;text-align:center;">${totalDeliveries}</td>
          <td style="padding:6px 10px;text-align:right;color:#B8472B;">${formatCurrency(weekTotal)}</td>
          <td style="padding:6px 10px;text-align:right;color:#B8472B;">${formatCurrency(weekAvg)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Detail Table -->
    <h3 style="color:#0C769E;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;border-bottom:2px solid #B8472B;padding-bottom:4px;">Delivery Detail</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;">
      <thead>
        <tr style="background:#0C769E;color:#fff;">
          <th style="padding:6px 8px;text-align:left;">Date</th>
          <th style="padding:6px 8px;text-align:left;">Shop</th>
          <th style="padding:6px 8px;text-align:left;">Zone</th>
          <th style="padding:6px 8px;text-align:center;">Pcs</th>
          <th style="padding:6px 8px;text-align:right;">Pay</th>
        </tr>
      </thead>
      <tbody>${detailRows}</tbody>
    </table>

    <!-- Payment Note -->
    <div style="background:#FAF7F2;border:1px solid #E6DECF;border-radius:8px;padding:12px 16px;font-size:13px;">
      <strong>Payment:</strong> E-transfer will be sent Sunday to <strong>${driver.email}</strong>
    </div>

    <p style="font-size:13px;color:#6B6256;margin-top:16px;">Questions? Reply to this email or call Kevin at 403-880-9822.</p>
    <p style="font-size:13px;">Cheers,<br><strong>Kevin Michaud</strong><br>Smart Choice Delivery</p>
  </div>

  <!-- Footer -->
  <div style="background:#0C769E;padding:10px 24px;text-align:center;">
    <p style="color:#D6EEF7;font-size:11px;margin:0;">Smart Choice Delivery &mdash; Calgary, AB &mdash; Your Delivery Service Partner</p>
  </div>

</div>`;

  return await resend.emails.send({
    from: 'pay@smartchoicedelivery.ca',
    to: driver.email,
    subject: `Smart Choice Delivery — Pay Statement Week Ending ${weekEnd}`,
    html
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
  }

  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  let body;
  try { body = await req.json(); } catch(e) { return json({ error: 'Invalid JSON' }, 400); }

  const { week_end } = body;
  if (!week_end) return json({ error: 'week_end required (YYYY-MM-DD)' }, 400);

  const bounds = getWeekBounds(week_end);

  // Load all orders
  const ordersStore = getStore('flower-orders');
  const { blobs } = await ordersStore.list();
  const allOrders = await Promise.all(blobs.map(b => ordersStore.get(b.key, { type: 'json' })));

  // Filter to this week
  const weekOrders = allOrders.filter(o => {
    if (!o) return false;
    const d = parseOrderDate(o);
    return d >= bounds.start && d <= bounds.end;
  });

  // Group by driver
  const byDriver = {};
  weekOrders.forEach(o => {
    const code = (o.driver || '').toUpperCase();
    if (!code) return;
    if (!byDriver[code]) byDriver[code] = [];
    byDriver[code].push(o);
  });

  // Load drivers
  const driversStore = getStore('flower-drivers');
  const { blobs: driverBlobs } = await driversStore.list();
  const driverList = await Promise.all(driverBlobs.map(b => driversStore.get(b.key, { type: 'json' })));
  const activeDrivers = driverList.filter(d => d && d.active && d.email);

  // Load rates
  const ratesStore = getStore('flower-rates');
  let rates = {};
  try { rates = await ratesStore.get('rates', { type: 'json' }) || {}; } catch(e) {}

  // Filter by driver code if specified
  const filterCode = (body.driver_code || '').toUpperCase();
  const driversToSend = (filterCode === 'ALL' || !filterCode)
    ? activeDrivers
    : activeDrivers.filter(d => (d.code || '').toUpperCase() === filterCode);

  // Send emails
  const results = [];
  for (const driver of driversToSend) {
    const code = (driver.code || '').toUpperCase();
    const orders = byDriver[code] || [];
    if (!orders.length) continue;
    try {
      await sendDriverPayEmail(driver, orders, week_end, rates);
      results.push({ driver: code, status: 'sent', deliveries: orders.length });
      console.log('Pay email sent to:', driver.name, driver.email);
    } catch(e) {
      results.push({ driver: code, status: 'failed', error: e.message });
      console.error('Pay email failed:', driver.name, e.message);
    }
  }

  return json({ success: true, week_end, emails_sent: results });
};

export const config = { path: '/api/send-driver-pay' };
