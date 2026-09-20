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

function fmt(n) {
  return '$' + (parseFloat(n) || 0).toFixed(2);
}

function fmtWeekEnd(weekEnd) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(weekEnd + 'T12:00:00');
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

const YTD_START_DATE = '2025-12-29';

// Sums this driver's actual orders across the full YTD range (Dec 29
// through the current week), rather than relying on a single static
// "starting point" that only ever got one week added to it. Most of this
// history predates the week-embedded key format, so this scans the full
// key list (fast - metadata only) and filters candidates by the
// timestamp already embedded in every key (old or new format) before
// fetching each one's content, avoiding a full-content fetch of anything
// outside the YTD range.
async function getYtdTotalsForDriver(driverCode, weekEnd) {
  const store = getStore('flower-orders');
  const { blobs } = await store.list();
  const startMs = new Date(YTD_START_DATE + 'T00:00:00').getTime();
  const endMs = new Date(weekEnd + 'T23:59:59').getTime();
  const candidates = blobs.filter(b => {
    const m = b.key.match(/^order_(?:\d{4}-\d{2}-\d{2}_)?(\d+)_/);
    if (!m) return false;
    const ts = parseInt(m[1]);
    return ts >= startMs && ts <= endMs;
  });
  const orders = (await Promise.all(candidates.map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);
  const driverOrders = orders.filter(o => (o.driver || '').toUpperCase() === driverCode.toUpperCase());
  return {
    pay: driverOrders.reduce((s, o) => s + (parseFloat(o.driver_pay) || 0), 0),
    deliveries: driverOrders.length,
    candidates_scanned: candidates.length
  };
}

async function sendDriverPayEmail(driver, orders, weekEnd, rates) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const weekPay = orders.reduce((s, o) => s + (parseFloat(o.driver_pay) || 0), 0);
  const weekDel = orders.length;
  const weekAvg = weekDel > 0 ? weekPay / weekDel : 0;

  const weekGdpi = orders.reduce((s, o) => {
    const r = rates[o.zone_code] || {};
    return s + (parseFloat(r.gdpi) || 0);
  }, 0);

  const ytdStartPay = parseFloat(driver.ytd_start_pay) || 0;
  const ytdStartDel = parseInt(driver.ytd_start_deliveries) || 0;
  const tYtd = Date.now();
  const ytdTotals = await getYtdTotalsForDriver(driver.code, weekEnd);
  console.log('YTD fetch for', driver.code, ':', Date.now() - tYtd, 'ms,', ytdTotals.candidates_scanned, 'candidates scanned');
  const ytdPay = ytdStartPay + ytdTotals.pay;
  const ytdDel = ytdStartDel + ytdTotals.deliveries;
  const ytdAvg = ytdDel > 0 ? ytdPay / ytdDel : 0;

  const zoneBreak = {};
  orders.forEach(o => {
    const z = o.zone_code || 'UNK';
    if (!zoneBreak[z]) zoneBreak[z] = { del: 0, pay: 0, gdpi: 0 };
    zoneBreak[z].del++;
    zoneBreak[z].pay += parseFloat(o.driver_pay) || 0;
    zoneBreak[z].gdpi += parseFloat((rates[z] || {}).gdpi) || 0;
  });

  const zoneRows = Object.keys(zoneBreak).sort().map(z => {
    const zb = zoneBreak[z];
    return `<tr style="border-bottom:1px solid #E6DECF;">
      <td style="padding:7px 10px;font-weight:600;">${z}</td>
      <td style="padding:7px 10px;text-align:center;">${zb.del}</td>
      <td style="padding:7px 10px;text-align:right;">${fmt(zb.pay)}</td>
      <td style="padding:7px 10px;text-align:right;color:#6B6256;">${fmt(zb.gdpi)}</td>
    </tr>`;
  }).join('');

  const firstName = (driver.name || '').split(' ')[0];
  const driverLink = `https://smartchoicedeliveryshoprate.netlify.app/api/reports?type=driver&week_end=${weekEnd}&code=${(driver.code || '').toLowerCase()}`;

  const html = `
<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#2B2620;width:100% !important;min-width:280px;">
  <div style="background:#0C769E;padding:18px 24px;border-bottom:4px solid #B8472B;width:100% !important;box-sizing:border-box;">
    <h1 style="color:#fff;font-family:Georgia,serif;margin:0;font-size:20px;">Smart Choice Delivery</h1>
    <p style="color:#D6EEF7;margin:4px 0 0;font-size:12px;">Driver Pay Statement</p>
  </div>
  <div style="padding:20px 24px;background:#fff;">
    <p style="font-size:15px;margin:0 0 4px;">Hi ${firstName},</p>
    <p style="font-size:13px;color:#6B6256;margin:0 0 20px;">Week Ending <strong style="color:#2B2620;">${fmtWeekEnd(weekEnd)}</strong></p>
    <div style="background:#D6EEF7;border-radius:10px;padding:16px 20px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:#0C769E;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">This Week</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="text-align:center;padding:6px 4px;border-right:1px solid #B0D4E8;border-bottom:1px solid #B0D4E8;width:50%;">
            <div style="font-size:24px;font-weight:700;color:#0C769E;">${fmt(weekPay)}</div>
            <div style="font-size:11px;color:#6B6256;">Total Pay</div>
          </td>
          <td style="text-align:center;padding:6px 4px;border-bottom:1px solid #B0D4E8;width:50%;">
            <div style="font-size:18px;font-weight:700;color:#2B2620;">${fmt(weekGdpi)}</div>
            <div style="font-size:11px;color:#6B6256;">GDPI</div>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:6px 4px;border-right:1px solid #B0D4E8;">
            <div style="font-size:18px;font-weight:700;color:#2B2620;">${weekDel}</div>
            <div style="font-size:11px;color:#6B6256;">Deliveries</div>
          </td>
          <td style="text-align:center;padding:6px 4px;">
            <div style="font-size:18px;font-weight:700;color:#2B2620;">${fmt(weekAvg)}</div>
            <div style="font-size:11px;color:#6B6256;">Avg/Del</div>
          </td>
        </tr>
      </table>
    </div>
    <div style="background:#EAF4EA;border:1px solid #A8CFA8;border-radius:8px;padding:14px 20px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:#2C6B2C;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Year to Date — Dec 29, 2025</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="text-align:center;padding:6px 4px;" colspan="2">
            <div style="font-size:22px;font-weight:700;color:#2C6B2C;">${fmt(ytdPay)}</div>
            <div style="font-size:11px;color:#6B6256;">Total Pay</div>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:6px 4px;border-right:1px solid #A8CFA8;border-top:1px solid #A8CFA8;width:50%;">
            <div style="font-size:18px;font-weight:700;color:#2C6B2C;">${ytdDel}</div>
            <div style="font-size:11px;color:#6B6256;">Deliveries</div>
          </td>
          <td style="text-align:center;padding:6px 4px;border-top:1px solid #A8CFA8;width:50%;">
            <div style="font-size:18px;font-weight:700;color:#2C6B2C;">${fmt(ytdAvg)}</div>
            <div style="font-size:11px;color:#6B6256;">Avg/Del</div>
          </td>
        </tr>
      </table>
    </div>
    <div style="margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:#2B2620;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;border-bottom:2px solid #B8472B;padding-bottom:4px;">Zone Breakdown</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#0C769E;color:#fff;">
            <th style="padding:7px 10px;text-align:left;">Zone</th>
            <th style="padding:7px 10px;text-align:center;">Deliveries</th>
            <th style="padding:7px 10px;text-align:right;">Pay</th>
            <th style="padding:7px 10px;text-align:right;">GDPI</th>
          </tr>
        </thead>
        <tbody>${zoneRows}</tbody>
        <tfoot>
          <tr style="background:#F4DCC9;font-weight:700;">
            <td style="padding:7px 10px;">TOTAL</td>
            <td style="padding:7px 10px;text-align:center;">${weekDel}</td>
            <td style="padding:7px 10px;text-align:right;color:#B8472B;">${fmt(weekPay)}</td>
            <td style="padding:7px 10px;text-align:right;color:#B8472B;">${fmt(weekGdpi)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="background:#FAF7F2;border:1px solid #E6DECF;border-radius:8px;padding:14px 16px;font-size:13px;margin-bottom:16px;">
      <p style="margin:0 0 8px;"><strong>Payment:</strong> E-transfer sent Sunday to <strong>${driver.email}</strong></p>
      <a href="${driverLink}" style="color:#0C769E;font-weight:600;font-size:13px;">View full delivery detail →</a>
    </div>
    <p style="font-size:12px;color:#6B6256;margin:0;">Questions? Reply to this email or call Kevin at 403-880-9822.</p>
    <p style="font-size:13px;margin:12px 0 0;">Cheers,<br><strong>Kevin Michaud</strong><br>Smart Choice Delivery</p>
  </div>
  <div style="background:#0C769E;padding:10px 24px;text-align:center;">
    <p style="color:#D6EEF7;font-size:11px;margin:0;">Smart Choice Delivery &mdash; Calgary, AB &mdash; Your Delivery Service Partner</p>
  </div>
</div>`;

  const result = await resend.emails.send({
    from: 'pay@smartchoicedelivery.ca',
    to: driver.email,
    subject: `Smart Choice Delivery — Pay Statement Week Ending ${fmtWeekEnd(weekEnd)}`,
    html
  });
  // The Resend SDK doesn't always throw for API-level failures (unverified
  // sender domain, invalid recipient, etc.) - it can resolve normally with
  // an .error field set instead. Treat that the same as a thrown error,
  // rather than letting it silently look like a successful send.
  if (result && result.error) {
    throw new Error(result.error.message || JSON.stringify(result.error));
  }
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
  const timings = {};
  const t0 = Date.now();

  const ordersStore = getStore('flower-orders');

  // New-format orders (created after the week-embedded key change) are
  // found directly via a fast, server-side prefix filter - the week is
  // right there in the key, so this never needs to look at anything
  // outside the target week at all, regardless of how large the store
  // grows overall.
  const { blobs: newFormatBlobs } = await ordersStore.list({ prefix: `order_${week_end}_` });
  timings.new_format_count = newFormatBlobs.length;

  // Fallback for orders created before this key format existed - only
  // matters until historical orders age out of any realistic pay-run
  // window. Bounds are the exact Monday-Sunday week, no buffer needed
  // since week boundaries are unambiguous.
  const { blobs: allBlobs } = await ordersStore.list();
  timings.orders_list_count = allBlobs.length;
  const oldFormatCandidates = allBlobs.filter(b => {
    if (b.key.startsWith(`order_${week_end}_`)) return false; // already captured above
    const match = b.key.match(/^order_(\d+)_/); // old format: order_<timestamp>_<random>
    if (!match) return false;
    const ts = parseInt(match[1]);
    return ts >= bounds.start.getTime() && ts <= bounds.end.getTime();
  });
  timings.old_format_count = oldFormatCandidates.length;

  const relevantBlobs = newFormatBlobs.concat(oldFormatCandidates);
  timings.orders_relevant_count = relevantBlobs.length;

  const allOrders = await Promise.all(relevantBlobs.map(b => ordersStore.get(b.key, { type: 'json' })));
  timings.orders_fetch_ms = Date.now() - t0;

  const weekOrders = allOrders.filter(o => {
    if (!o) return false;
    const d = parseOrderDate(o);
    return d >= bounds.start && d <= bounds.end;
  });

  const byDriver = {};
  weekOrders.forEach(o => {
    const code = (o.driver || '').toUpperCase();
    if (!code) return;
    if (!byDriver[code]) byDriver[code] = [];
    byDriver[code].push(o);
  });

  const tDrivers = Date.now();
  const driversStore = getStore('flower-drivers');
  const { blobs: driverBlobs } = await driversStore.list();
  const driverList = await Promise.all(driverBlobs.map(b => driversStore.get(b.key, { type: 'json' })));
  const activeDrivers = driverList.filter(d => d && d.active && d.email);
  timings.drivers_fetch_ms = Date.now() - tDrivers;

  const tRates = Date.now();
  const ratesStore = getStore('flower-rates');
  let rates = {};
  try { rates = await ratesStore.get('rates', { type: 'json' }) || {}; } catch(e) {}
  timings.rates_fetch_ms = Date.now() - tRates;
  timings.total_before_send_ms = Date.now() - t0;

  const filterCode = (body.driver_code || '').toUpperCase();
  const driversToSend = (filterCode === 'ALL' || !filterCode)
    ? activeDrivers
    : activeDrivers.filter(d => (d.code || '').toUpperCase() === filterCode);

  if (filterCode && filterCode !== 'ALL' && driversToSend.length === 0) {
    // The requested driver code doesn't match any active driver with an
    // email on file at all - surface this clearly rather than silently
    // returning an empty, easy-to-miss result.
    return json({ success: true, week_end, emails_sent: [], warning: `No active driver found with code "${filterCode}" and an email on file.`, _timings: timings });
  }

  const results = [];
  for (const driver of driversToSend) {
    const code = (driver.code || '').toUpperCase();
    const orders = byDriver[code] || [];
    if (!orders.length) {
      // Previously this silently skipped with no record at all - the
      // outer response still said "success" with an empty emails_sent
      // list, which looked identical to a real send if you didn't read
      // the detail closely. Record explicitly why nothing was sent.
      results.push({ driver: code, status: 'skipped_no_deliveries', deliveries: 0 });
      continue;
    }
    const tSend = Date.now();
    try {
      await sendDriverPayEmail(driver, orders, week_end, rates);
      results.push({ driver: code, status: 'sent', deliveries: orders.length, send_ms: Date.now() - tSend });
      console.log('Pay email sent:', driver.name, driver.email);
    } catch(e) {
      results.push({ driver: code, status: 'failed', error: e.message, send_ms: Date.now() - tSend });
      console.error('Pay email failed:', driver.name, e.message);
    }
  }

  timings.total_ms = Date.now() - t0;
  return json({ success: true, week_end, emails_sent: results, _timings: timings });
};

export const config = { path: '/api/send-driver-pay' };
