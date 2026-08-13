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

function formatDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dt = new Date(d);
  return months[dt.getMonth()] + ' ' + dt.getDate();
}

async function sendDriverPayEmail(driver, orders, weekEnd, rates) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const weekTotal = orders.reduce((sum, o) => sum + (parseFloat(o.driver_pay) || 0), 0);
  const totalDeliveries = orders.length;

  // YTD calculations
  const ytdStartPay = parseFloat(driver.ytd_start_pay) || 0;
  const ytdStartDeliveries = parseInt(driver.ytd_start_deliveries) || 0;
  const ytdPay = ytdStartPay + weekTotal;
  const ytdDeliveries = ytdStartDeliveries + totalDeliveries;
  const ytdAvg = ytdDeliveries > 0 ? ytdPay / ytdDeliveries : 0;

  // Sort orders by date
  orders.sort((a, b) => new Date(a.date || a.received_at) - new Date(b.date || b.received_at));

  const orderRows = orders.map(o => {
    const pay = parseFloat(o.driver_pay) || 0;
    const zone = o.zone_code || '';
    const shop = o.shop_code || '';
    const date = formatDate(o.date || o.received_at);
    const pcs = o.total_pieces || 1;
    return `
      <tr style="border-bottom:1px solid #E6DECF;">
        <td style="padding:6px 10px;">${date}</td>
        <td style="padding:6px 10px;">${shop}</td>
        <td style="padding:6px 10px;">${zone}</td>
        <td style="padding:6px 10px;text-align:center;">${pcs}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:600;">${formatCurrency(pay)}</td>
      </tr>`;
  }).join('');

  const firstName = (driver.name || '').split(' ')[0];

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2B2620;background:#FAF7F2;">
      <div style="background:#0C769E;padding:20px 24px;border-bottom:4px solid #B8472B;">
        <h1 style="color:#fff;font-family:Georgia,serif;margin:0;font-size:20px;">Smart Choice Delivery</h1>
        <p style="color:#D6EEF7;margin:4px 0 0;font-size:13px;">Driver Pay Statement</p>
      </div>
      <div style="padding:24px;background:#fff;">
        <p style="font-size:15px;">Hi ${firstName},</p>
        <p>Here is your pay summary for the week ending <strong>${weekEnd}</strong>.</p>

        <div style="background:#D6EEF7;border-radius:8px;padding:16px;margin:16px 0;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#0C769E;">${formatCurrency(weekTotal)}</div>
            <div style="font-size:12px;color:#6B6256;">This Week</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#2B2620;">${totalDeliveries}</div>
            <div style="font-size:12px;color:#6B6256;">Deliveries</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#2B2620;">${formatCurrency(totalDeliveries > 0 ? weekTotal / totalDeliveries : 0)}</div>
            <div style="font-size:12px;color:#6B6256;">Avg/Delivery</div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
          <thead>
            <tr style="background:#0C769E;color:#fff;">
              <th style="padding:8px 10px;text-align:left;">Date</th>
              <th style="padding:8px 10px;text-align:left;">Shop</th>
              <th style="padding:8px 10px;text-align:left;">Zone</th>
              <th style="padding:8px 10px;text-align:center;">Pcs</th>
              <th style="padding:8px 10px;text-align:right;">Pay</th>
            </tr>
          </thead>
          <tbody>
            ${orderRows}
            <tr style="background:#F4DCC9;">
              <td colspan="3" style="padding:8px 10px;font-weight:700;">TOTAL</td>
              <td style="padding:8px 10px;text-align:center;font-weight:700;">${totalDeliveries}</td>
              <td style="padding:8px 10px;text-align:right;font-weight:700;color:#B8472B;">${formatCurrency(weekTotal)}</td>
            </tr>
          </tbody>
        </table>

        <div style="background:#EAF4EA;border:1px solid #A8CFA8;border-radius:8px;padding:14px 16px;margin:16px 0;">
          <h3 style="margin:0 0 10px;color:#2C6B2C;font-size:14px;">Year to Date (Dec 29, 2025)</h3>
          <table style="width:100%;font-size:13px;">
            <tr>
              <td style="padding:4px 0;color:#6B6256;">Total Deliveries</td>
              <td style="padding:4px 0;text-align:right;font-weight:600;">${ytdDeliveries}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#6B6256;">Total Pay</td>
              <td style="padding:4px 0;text-align:right;font-weight:600;">${formatCurrency(ytdPay)}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#6B6256;">Average per Delivery</td>
              <td style="padding:4px 0;text-align:right;font-weight:600;">${formatCurrency(ytdAvg)}</td>
            </tr>
          </table>
        </div>

        <div style="background:#FAF7F2;border:1px solid #E6DECF;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;">
          <strong>Payment:</strong> E-transfer will be sent Sunday to <strong>${driver.email}</strong>
        </div>

        <p style="font-size:13px;color:#6B6256;">Questions? Reply to this email or call Kevin at 403-880-9822.</p>
        <p style="font-size:13px;">Cheers,<br><strong>Kevin Michaud</strong><br>Smart Choice Delivery</p>
      </div>
      <div style="background:#0C769E;padding:12px 24px;text-align:center;">
        <p style="color:#D6EEF7;font-size:11px;margin:0;">Smart Choice Delivery &mdash; Calgary, AB &mdash; Your Delivery Service Partner</p>
      </div>
    </div>
  `;

  const result = await resend.emails.send({
    from: 'pay@smartchoicedelivery.ca',
    to: driver.email,
    subject: `Smart Choice Delivery — Pay Statement Week Ending ${weekEnd}`,
    html
  });

  return result;
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
  
  // Load rates
  const ratesStore = getStore('flower-rates');
  let rates = {};
  try { rates = await ratesStore.get('rates', { type: 'json' }) || {}; } catch(e) {}

  const filterCode = (body.driver_code || '').toUpperCase();
  const driversToSend = filterCode === 'ALL' || !filterCode
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
