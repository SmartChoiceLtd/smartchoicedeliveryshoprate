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

// Date-only values are pinned to noon so they can't slip across a day
// boundary; see orderIsoDate for the formats handled.
function parseOrderDate(o) {
  const iso = orderIsoDate(o);
  return iso ? new Date(iso + 'T12:00:00') : new Date(0);
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

// The calendar day (YYYY-MM-DD) an order belongs to, whatever format its
// date arrived in: ISO from the driver form, DD-Mon-YYYY / D/M/YYYY from
// the Zoho webhook, or a full timestamp. Null if there's no usable date.
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

// Year-to-date, as plainly as it can be defined: total pay = the sum of
// every one of this driver's deliveries from YTD_START_DATE through the
// end of the pay week, deliveries = how many there are, average = pay /
// deliveries. An order counts if its DELIVERY DATE is in range - not when
// the record happened to be created - and this week's orders are always
// included exactly once, so YTD can never come out smaller than "This Week".
// The key timestamp is used only as a cheap pre-filter to avoid fetching
// the whole store; its upper bound is padded 14 days so late-entered
// orders aren't cut off before the exact date check.
// ---- Year-to-date, made fast -----------------------------------------------------------------
// The old version fetched EVERY order since Dec 29 for EVERY driver on every statement, which now
// takes longer than the server allows. Instead, each COMPLETED week's per-driver figures are worked
// out once and kept (store flower-ytd-cache, key = the week's Sunday). The 3 most recent completed
// weeks are always re-read live so late edits still count; older weeks come from the cache. The
// first run after this change builds the cache; if it cannot finish inside the time limit it says so
// and saves its progress, and the next attempt carries on (open ?action=warm_ytd to run it directly).
const YTD_BUDGET_MS = 8000;
let ytdDeadline = Date.now() + YTD_BUDGET_MS;
function resetYtdBudget() { ytdDeadline = Date.now() + YTD_BUDGET_MS; }

function isoOfDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addDaysIso(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOfDate(d); }
function sundayOnOrAfter(iso) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return isoOfDate(d); }

let blobListMemo = null; // { t, blobs } - one listing of the order store shared across drivers in a request
async function listOrderBlobs() {
  if (blobListMemo && Date.now() - blobListMemo.t < 30000) return blobListMemo.blobs;
  const { blobs } = await getStore('flower-orders').list();
  blobListMemo = { t: Date.now(), blobs };
  return blobs;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

// Every driver's deliveries for one Mon-Sun week, as { CODE: [[day, pay, isPremium], ...] }.
async function computeWeekData(we) {
  const store = getStore('flower-orders');
  const blobs = await listOrderBlobs();
  const startIso = addDaysIso(we, -6);
  const DAY = 86400000;
  const startMs = new Date(startIso + 'T00:00:00').getTime() - DAY;
  const endMs = new Date(we + 'T23:59:59').getTime() + 7 * DAY;
  const prefix = 'order_' + we + '_';
  const picked = blobs.filter(b => {
    if (b.key.startsWith(prefix)) return true;
    const m = b.key.match(/^order_(?:\d{4}-\d{2}-\d{2}_)?(\d+)_/);
    if (!m) return false;
    const ts = parseInt(m[1]);
    return ts >= startMs && ts <= endMs;
  });
  const orders = (await mapLimit(picked, 40, b => store.get(b.key, { type: 'json' }))).filter(Boolean);
  const drivers = {};
  orders.forEach(o => {
    const code = (o.driver || '').toUpperCase();
    const day = orderIsoDate(o);
    if (!code || !day || day < startIso || day > we) return;
    (drivers[code] = drivers[code] || []).push([day, parseFloat(o.driver_pay) || 0, o.order_id === 'PREMIUM' ? 1 : 0]);
  });
  return { week_end: we, drivers, orders_read: orders.length, computed_at: new Date().toISOString() };
}

const liveWeekMemo = new Map(); // week_end -> { t, data }  (recent weeks, short-lived)
async function getWeekData(we, cacheable) {
  if (!cacheable) {
    const m = liveWeekMemo.get(we);
    if (m && Date.now() - m.t < 30000) return m.data;
    const data = await computeWeekData(we);
    liveWeekMemo.set(we, { t: Date.now(), data });
    return data;
  }
  const cache = getStore('flower-ytd-cache');
  const hit = await cache.get(we, { type: 'json' }).catch(() => null);
  if (hit) return hit;
  if (Date.now() > ytdDeadline) throw new Error('YTD_WARMING');
  const data = await computeWeekData(we);
  await cache.setJSON(we, data);
  return data;
}

// Weeks (Sundays) from the first YTD week through the week before the pay week.
function priorWeekEnds(weekEnd) {
  const list = [];
  let we = sundayOnOrAfter(YTD_START_DATE);
  const last = addDaysIso(sundayOnOrAfter(weekEnd), -7);
  while (we <= last) { list.push(we); we = addDaysIso(we, 7); }
  return list;
}

async function computeYtd(driver, weekOrders, weekEnd) {
  const code = (driver.code || '').toUpperCase();
  const prior = priorWeekEnds(weekEnd);
  const liveFrom = addDaysIso(sundayOnOrAfter(weekEnd), -21); // this week and the 3 before it are read live
  const rows = [];
  let scanned = 0;
  // Cached weeks first (in order, so a time-out saves progress), then the live ones.
  const cachedWeeks = prior.filter(we => we < liveFrom), liveWeeks = prior.filter(we => we >= liveFrom);
  for (const we of cachedWeeks) { const d = await getWeekData(we, true); scanned += d.orders_read || 0; (d.drivers[code] || []).forEach(r => rows.push(r)); }
  for (const we of liveWeeks) { const d = await getWeekData(we, false); scanned += d.orders_read || 0; (d.drivers[code] || []).forEach(r => rows.push(r)); }
  // The pay week itself: the orders already loaded for the statement (or read live if none were given).
  if (weekOrders) {
    weekOrders.forEach(o => { const day = orderIsoDate(o); if (day) rows.push([day, parseFloat(o.driver_pay) || 0, o.order_id === 'PREMIUM' ? 1 : 0]); });
  } else {
    const d = await getWeekData(sundayOnOrAfter(weekEnd), false); (d.drivers[code] || []).forEach(r => rows.push(r));
  }
  // The starting figure (ytd_start_pay / ytd_start_deliveries) already covers everything up to and
  // including ytd_through_date, so orders on or before that day are NOT counted again.
  const counted = rows.filter(r => r[0] >= YTD_START_DATE && r[0] <= weekEnd && !(driver.ytd_through_date && r[0] <= driver.ytd_through_date));
  const days = counted.map(r => r[0]).sort();
  const ordersPay = counted.reduce((sum, r) => sum + r[1], 0);
  const baselinePay = parseFloat(driver.ytd_start_pay) || 0;
  const baselineDel = parseInt(driver.ytd_start_deliveries) || 0;
  const totalPay = baselinePay + ordersPay;
  const totalDel = baselineDel + counted.length;
  return {
    baseline: { pay: baselinePay, deliveries: baselineDel, through_date: driver.ytd_through_date || null },
    orders: {
      pay: ordersPay,
      deliveries: counted.length,
      first_date: days[0] || null,
      last_date: days[days.length - 1] || null,
      zero_pay_orders: counted.filter(r => !(r[1] > 0)).length,
      premium_records: counted.filter(r => r[2]).length,
      candidates_scanned: scanned
    },
    total: { pay: totalPay, deliveries: totalDel, avg: totalDel > 0 ? totalPay / totalDel : 0 }
  };
}

async function buildPayStatementHtml(driver, orders, weekEnd, rates, payDate) {
  payDate = payDate || fmtCalgaryDate(new Date());
  const weekPay = orders.reduce((s, o) => s + (parseFloat(o.driver_pay) || 0), 0);
  const weekDel = orders.length;
  const weekAvg = weekDel > 0 ? weekPay / weekDel : 0;

  const weekGdpi = orders.reduce((s, o) => {
    const r = rates[o.zone_code] || {};
    return s + (parseFloat(r.gdpi) || 0);
  }, 0);

  const tYtd = Date.now();
  const ytd = await computeYtd(driver, orders, weekEnd);
  console.log('YTD for', driver.code, ':', Date.now() - tYtd, 'ms,', ytd.orders.candidates_scanned, 'candidates scanned');
  const ytdPay = ytd.total.pay;
  const ytdDel = ytd.total.deliveries;
  const ytdAvg = ytd.total.avg;

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
  const driverLink = `https://quotes.smartchoicedelivery.ca/driver-summary/${(driver.code || '').toLowerCase()}`;

  return `
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
      <p style="margin:0 0 8px;"><strong>Payment:</strong> E-transfer sent ${payDate} to <strong>${driver.email}</strong></p>
      <a href="${driverLink}" style="color:#0C769E;font-weight:600;font-size:13px;">View your delivery summary, payments &amp; balance →</a>
    </div>
    <p style="font-size:12px;color:#6B6256;margin:0;">Questions? Reply to this email or call Kevin at 403-880-9822.</p>
    <p style="font-size:13px;margin:12px 0 0;">Cheers,<br><strong>Kevin Michaud</strong><br>Smart Choice Delivery</p>
  </div>
  <div style="background:#0C769E;padding:10px 24px;text-align:center;">
    <p style="color:#D6EEF7;font-size:11px;margin:0;">Smart Choice Delivery &mdash; Calgary, AB &mdash; Your Delivery Service Partner</p>
  </div>
</div>`;
}

// ---- Pay ledger hooks (see pay-ledger.mjs) -------------------------------------------------
// Every statement email is logged against the driver and week, with the amount it showed, so the
// ledger page can later compare what was emailed with what was paid. A logging problem must never
// stop or fail the email itself.
function weekTotalPay(orders) {
  return Math.round(orders.reduce((s, o) => s + (parseFloat(o.driver_pay) || 0), 0) * 100) / 100;
}
async function logStatementEmailed(driver, weekEnd, orders) {
  try {
    const store = getStore('flower-driver-payments');
    const code = (driver.code || '').toUpperCase();
    const key = weekEnd + '_' + code;
    const rec = (await store.get(key, { type: 'json' })) || { week_end: weekEnd, driver: code, entries: [] };
    rec.entries.push({
      id: Math.random().toString(36).slice(2, 10),
      type: 'statement_emailed',
      amount: weekTotalPay(orders),
      deliveries: orders.length,
      note: 'Pay statement emailed to ' + driver.email,
      recorded_at: new Date().toISOString(),
      by: 'system'
    });
    await store.setJSON(key, rec);
  } catch (e) { console.error('pay ledger log failed:', e.message); }
}
async function requireAuth(req) {
  const m = (req.headers.get('cookie') || '').match(/scd_session=([a-f0-9]+)/);
  if (!m) return null;
  const sess = await getStore('flower-sessions').get(m[1], { type: 'json' });
  if (!sess || new Date(sess.expires_at) < new Date()) return null;
  return sess.username;
}

// Calendar date in Calgary time, e.g. "Oct 21, 2026".
function fmtCalgaryDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: 'short', day: 'numeric' }).format(d).replace('.', '');
}
// The date shown for the e-transfer: the date an e-transfer was recorded for this driver and week in
// the pay ledger (the date it actually went out, if one was entered), otherwise today - the day this
// email is being sent.
async function etransferDate(driver, weekEnd) {
  try {
    const rec = await getStore('flower-driver-payments').get(weekEnd + '_' + (driver.code || '').toUpperCase(), { type: 'json' });
    const hits = ((rec && rec.entries) || []).filter(e => e.type === 'etransfer' && !e.voided);
    if (hits.length) {
      const e = hits[hits.length - 1];
      return fmtCalgaryDate(new Date(e.occurred_at || e.recorded_at));
    }
  } catch (e) {}
  return fmtCalgaryDate(new Date());
}

async function sendDriverPayEmail(driver, orders, weekEnd, rates) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = await buildPayStatementHtml(driver, orders, weekEnd, rates, await etransferDate(driver, weekEnd));

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

async function getWeekOrdersByDriver(week_end) {
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
    // Matches the old format (order_<timestamp>_<random>) AND new-format keys
    // filed under a different week prefix - webhook orders with non-ISO dates
    // were briefly filed under a bogus week key, so they're recovered here by
    // their embedded timestamp. The exact-date filter below keeps results correct.
    const match = b.key.match(/^order_(?:\d{4}-\d{2}-\d{2}_)?(\d+)_/);
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

  return { byDriver, timings };
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
  }

  const url = new URL(req.url);
  resetYtdBudget();

  // ?action=warm_ytd&week_end=YYYY-MM-DD (login required): builds the saved weekly figures a bit at a
  // time. Open it repeatedly until it says "done". Add &refresh=1 to throw the saved weeks away first.
  if (req.method === 'GET' && url.searchParams.get('action') === 'warm_ytd') {
    if (!(await requireAuth(req))) return json({ error: 'Not authenticated' }, 401);
    const we = url.searchParams.get('week_end');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(we || '')) return json({ error: 'week_end (YYYY-MM-DD) required' }, 400);
    const cache = getStore('flower-ytd-cache');
    if (url.searchParams.get('refresh') === '1') {
      const { blobs } = await cache.list();
      await Promise.all(blobs.map(b => cache.delete(b.key)));
    }
    const liveFrom = addDaysIso(sundayOnOrAfter(we), -21);
    const need = priorWeekEnds(we).filter(w => w < liveFrom);
    let done = 0, remaining = 0;
    for (const w of need) {
      try { await getWeekData(w, true); done++; } catch (e) { if (e.message === 'YTD_WARMING') remaining++; else throw e; }
    }
    return json({ status: remaining ? 'not finished - run this link again' : 'done', weeks_ready: done, weeks_remaining: remaining });
  }

  // View-only page: lets a driver (or dispatcher, on their behalf) see the
  // exact same statement even if the email was never received, or serves
  // as a printable/shareable page to send another way. No email/Resend
  // involved at all - pure lookup and render.
  if (req.method === 'GET' && url.searchParams.get('action') === 'week_totals') {
    // Live per-driver totals for a week (used by the pay ledger page). Login required.
    if (!(await requireAuth(req))) return json({ error: 'Not authenticated' }, 401);
    const we = url.searchParams.get('week_end');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(we || '')) return json({ error: 'week_end (YYYY-MM-DD) required' }, 400);
    const { byDriver } = await getWeekOrdersByDriver(we);
    const dStore = getStore('flower-drivers');
    const { blobs: dB } = await dStore.list();
    const dList = (await Promise.all(dB.map(b => dStore.get(b.key, { type: 'json' })))).filter(Boolean);
    const names = {};
    dList.forEach(d => { if (d.code) names[d.code.toUpperCase()] = d; });
    const out = Object.keys(byDriver).sort().map(code => ({
      code, name: (names[code] && names[code].name) || '', email: (names[code] && names[code].email) || '',
      deliveries: byDriver[code].length, total_pay: weekTotalPay(byDriver[code])
    }));
    return json({ week_end: we, drivers: out });
  }

  if (req.method === 'GET') {
    // The statement view (and its debug views) show a driver's pay, so they need a staff login.
    if (!(await requireAuth(req))) return new Response('Not authenticated. Please sign in at /login.html and try again.', { status: 401, headers: { 'content-type': 'text/plain' } });
    const weekEnd = url.searchParams.get('week_end');
    const driverCode = (url.searchParams.get('driver_code') || url.searchParams.get('code') || '').toUpperCase();
    if (!weekEnd || !driverCode) {
      return new Response('Both week_end (YYYY-MM-DD) and driver_code are required.', { status: 400, headers: { 'content-type': 'text/plain' } });
    }

    const driversStore = getStore('flower-drivers');
    const { blobs: driverBlobs } = await driversStore.list();
    const driverList = await Promise.all(driverBlobs.map(b => driversStore.get(b.key, { type: 'json' })));
    const driver = driverList.find(d => d && (d.code || '').toUpperCase() === driverCode);
    if (!driver) {
      return new Response('No driver found with code "' + driverCode + '".', { status: 404, headers: { 'content-type': 'text/plain' } });
    }

    // Lightweight debug views, answered BEFORE the slow whole-week order
    // load below (that load plus the YTD scan is what made ?debug=1 time
    // out on Netlify).
    //   ?debug=baseline  -> instant: just the stored starting figures
    //   ?debug=ytd       -> one scan of the orders for the YTD breakdown
    const dbg = url.searchParams.get('debug');
    if (dbg === 'baseline') {
      return json({
        driver: driverCode,
        ytd_start_date: YTD_START_DATE,
        ytd_start_pay: driver.ytd_start_pay ?? null,
        ytd_start_deliveries: driver.ytd_start_deliveries ?? null,
        ytd_through_date: driver.ytd_through_date ?? null,
        baseline_avg: (parseInt(driver.ytd_start_deliveries) > 0) ? (parseFloat(driver.ytd_start_pay) || 0) / parseInt(driver.ytd_start_deliveries) : null,
        hire_date: driver.hire_date || null
      });
    }
    if (dbg === 'ytd') {
      const t0 = Date.now();
      const ytd = await computeYtd(driver, null, weekEnd);
      return json({ driver: driverCode, week_end: weekEnd, ytd_start_date: YTD_START_DATE, ytd, took_ms: Date.now() - t0,
        note: 'ytd.total = ytd.baseline + ytd.orders. avg = total.pay / total.deliveries.' });
    }

    const { byDriver } = await getWeekOrdersByDriver(weekEnd);
    const orders = byDriver[driverCode] || [];

    const ratesStore = getStore('flower-rates');
    let rates = {};
    try { rates = await ratesStore.get('rates', { type: 'json' }) || {}; } catch(e) {}

    // ?debug=1 shows exactly what the YTD figures are made of, instead of
    // the statement itself - baseline vs. counted orders, the date range
    // covered, and how many zero-pay / premium records are in the count.
    if (url.searchParams.get('debug') === '1') {
      const ytd = await computeYtd(driver, orders, weekEnd);
      const weekPay = orders.reduce((s, o) => s + (parseFloat(o.driver_pay) || 0), 0);
      return json({
        driver: driverCode,
        week_end: weekEnd,
        week: { pay: weekPay, deliveries: orders.length, avg: orders.length ? weekPay / orders.length : 0 },
        ytd_start_date: YTD_START_DATE,
        ytd,
        note: 'ytd.total = ytd.baseline + ytd.orders. avg = total.pay / total.deliveries.'
      });
    }

    let html;
    try { html = await buildPayStatementHtml(driver, orders, weekEnd, rates, await etransferDate(driver, weekEnd)); }
    catch (e) {
      if (e.message === 'YTD_WARMING') return new Response('Pay history is being prepared for the first time. Wait a few seconds and reload this page - repeat once or twice if it asks again.', { status: 503, headers: { 'content-type': 'text/plain', 'retry-after': '5' } });
      throw e;
    }
    const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pay Statement - ${driver.name || driverCode}</title></head><body style="margin:0;padding:20px 12px;background:#FAF7F2;">${html}</body></html>`;
    return new Response(page, { status: 200, headers: { 'content-type': 'text/html', 'access-control-allow-origin': '*' } });
  }

  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  let body;
  try { body = await req.json(); } catch(e) { return json({ error: 'Invalid JSON' }, 400); }

  const { week_end } = body;
  if (!week_end) return json({ error: 'week_end required (YYYY-MM-DD)' }, 400);

  const t0 = Date.now();
  const { byDriver, timings } = await getWeekOrdersByDriver(week_end);

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
      await logStatementEmailed(driver, week_end, orders);
      results.push({ driver: code, status: 'sent', deliveries: orders.length, send_ms: Date.now() - tSend });
      console.log('Pay email sent:', driver.name, driver.email);
    } catch(e) {
      results.push({ driver: code, status: 'failed', error: e.message === 'YTD_WARMING' ? 'Pay history is being prepared - click Send again in a few seconds (nothing was sent)' : e.message, send_ms: Date.now() - tSend });
      console.error('Pay email failed:', driver.name, e.message);
    }
  }

  timings.total_ms = Date.now() - t0;
  return json({ success: true, week_end, emails_sent: results, _timings: timings });
};

export const config = { path: '/api/send-driver-pay' };
