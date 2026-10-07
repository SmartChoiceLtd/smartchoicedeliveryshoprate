import { getStore } from '@netlify/blobs';

// Scan quality log. scan-tag.mjs records every scan as it is read. This function does two things:
//   POST - the scan page reports what the driver did at the review step (kept the reading as is,
//          fixed some fields, or threw it away). The server compares the corrected values with what
//          the AI originally read and works out for itself which fields had to be edited.
//   GET  - (login required) turns the log into accuracy numbers by model, phone type and driver.

const FIELDS = ['order_id', 'name', 'address', 'shop_code'];
const OUTCOMES = ['confirmed', 'discarded', 'replaced'];
const ID_PATTERN = /^scan_\d{4}-\d{2}-\d{2}_\d{10,}_[a-z0-9]{1,6}$/;
const MAX_RANGE_DAYS = 31;
const MAX_RECORDS_PER_DAY = 3000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

// Same session check as the other protected endpoints.
async function requireAuth(req) {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/scd_session=([a-f0-9]+)/);
  if (!match) return null;
  const session = await getStore('flower-sessions').get(match[1], { type: 'json' });
  if (!session || new Date(session.expires_at) < new Date()) return null;
  return session.username;
}

// Capitalisation and spacing differences are not corrections; a different word or number is.
function norm(v) { return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim(); }
function clip(v) { return String(v == null ? '' : v).slice(0, 200); }

function calgaryDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function addDays(dayStr, n) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0');
}

// ---- Turning the log into numbers ---------------------------------------------------------
function emptyCounters() {
  return { scans: 0, read: 0, no_address: 0, errors: 0, confirmed: 0, discarded: 0, replaced: 0, pending: 0, clean: 0,
    e_order_id: 0, e_name: 0, e_address: 0, e_shop_code: 0, lat_sum: 0, lat_n: 0, in_tok: 0, out_tok: 0, tok_n: 0 };
}
function addRecord(c, r) {
  c.scans++;
  if (r.status === 'read') c.read++;
  else if (r.status === 'no_address') c.no_address++;
  else c.errors++;
  if (r.status === 'read') {
    if (r.outcome === 'confirmed') {
      c.confirmed++;
      const edited = r.edited || [];
      if (!edited.length) c.clean++;
      edited.forEach(f => { if (('e_' + f) in c) c['e_' + f]++; });
    } else if (r.outcome === 'discarded') c.discarded++;
    else if (r.outcome === 'replaced') c.replaced++;
    else c.pending++;
  }
  if (typeof r.latency_ms === 'number') { c.lat_sum += r.latency_ms; c.lat_n++; }
  if (typeof r.input_tokens === 'number' && typeof r.output_tokens === 'number') { c.in_tok += r.input_tokens; c.out_tok += r.output_tokens; c.tok_n++; }
}
function mergeCounters(a, b) { const o = { ...a }; for (const k of Object.keys(b)) o[k] = (o[k] || 0) + b[k]; return o; }

const DIMENSIONS = {
  model: r => r.model || r.model_configured || 'unknown',
  model_phone: r => (r.platform || 'other') + ' \u00b7 ' + (r.model || r.model_configured || 'unknown'),
  platform: r => r.platform || 'other',
  os: r => (r.platform || 'other') + ' ' + (r.os_version ? String(r.os_version).split('.')[0] : '?'),
  driver: r => r.driver || '(unknown)',
  exif: r => r.platform === 'ios' ? (r.exif_auto === true ? 'phone rotates photos itself' : r.exif_auto === false ? 'phone needs manual rotation' : 'not recorded') : 'n/a (not iPhone)'
};

function summarize(records) {
  const out = { total: emptyCounters(), by: {}, edits: [] };
  Object.keys(DIMENSIONS).forEach(d => out.by[d] = {});
  for (const r of records) {
    addRecord(out.total, r);
    for (const [dim, fn] of Object.entries(DIMENSIONS)) { const k = fn(r); addRecord(out.by[dim][k] || (out.by[dim][k] = emptyCounters()), r); }
    if (r.status === 'read' && r.outcome === 'confirmed' && r.edited && r.edited.length) {
      out.edits.push({ at: r.at, driver: r.driver || '', platform: r.platform || '', model: r.model || '', edits: r.edits || {} });
    }
  }
  out.edits.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  out.edits = out.edits.slice(0, 20);
  return out;
}
function mergeSummaries(list) {
  const out = { total: emptyCounters(), by: {}, edits: [] };
  Object.keys(DIMENSIONS).forEach(d => out.by[d] = {});
  for (const s of list) {
    out.total = mergeCounters(out.total, s.total);
    for (const dim of Object.keys(DIMENSIONS)) for (const [k, c] of Object.entries((s.by && s.by[dim]) || {})) out.by[dim][k] = mergeCounters(out.by[dim][k] || emptyCounters(), c);
    out.edits.push(...(s.edits || []));
  }
  out.edits.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  out.edits = out.edits.slice(0, 30);
  return out;
}

async function loadDay(store, day) {
  const { blobs } = await store.list({ prefix: 'scan_' + day + '_' });
  const keys = blobs.map(b => b.key).slice(0, MAX_RECORDS_PER_DAY);
  const records = [];
  for (let i = 0; i < keys.length; i += 50) {
    const chunk = await Promise.all(keys.slice(i, i + 50).map(k => store.get(k, { type: 'json' }).catch(() => null)));
    chunk.forEach(r => { if (r) records.push(r); });
  }
  return { records, capped: blobs.length > MAX_RECORDS_PER_DAY };
}

// Days before yesterday are final, so they are summarised once and remembered; only recent
// days are recalculated, which keeps this fast however long the log grows.
async function summaryForDay(store, day, today) {
  const final = day < addDays(today, -1);
  const cacheKey = 'summary_' + day;
  if (final) {
    const cached = await store.get(cacheKey, { type: 'json' }).catch(() => null);
    if (cached) return { ...cached, from_cache: true };
  }
  const { records, capped } = await loadDay(store, day);
  const s = { ...summarize(records), capped };
  if (final && !capped) { try { await store.setJSON(cacheKey, s); } catch (e) { /* caching is only an optimisation */ } }
  return s;
}

export default async (req) => {
  const store = getStore('flower-scan-log');

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
    const id = String(body.scan_id || '');
    const outcome = String(body.outcome || '');
    if (!ID_PATTERN.test(id)) return json({ error: 'Invalid scan_id' }, 400);
    if (!OUTCOMES.includes(outcome)) return json({ error: 'Invalid outcome' }, 400);
    const rec = await store.get(id, { type: 'json' }).catch(() => null);
    if (!rec) return json({ error: 'Unknown scan' }, 404);
    if (rec.status !== 'read') return json({ error: 'That scan had no review step' }, 400);
    if (rec.outcome) return json({ ok: true, already_recorded: true });   // first answer wins

    rec.outcome = outcome;
    rec.outcome_at = new Date().toISOString();
    if (outcome === 'confirmed') {
      const f = body.final && typeof body.final === 'object' ? body.final : {};
      rec.final = {}; rec.edited = []; rec.edits = {};
      for (const k of FIELDS) {
        rec.final[k] = clip(f[k]);
        if (norm(f[k]) !== norm(rec.extracted && rec.extracted[k])) { rec.edited.push(k); rec.edits[k] = { from: clip(rec.extracted && rec.extracted[k]), to: clip(f[k]) }; }
      }
    }
    await store.setJSON(id, rec);
    return json({ ok: true, edited: rec.edited || [] });
  }

  if (req.method === 'GET') {
    const username = await requireAuth(req);
    if (!username) return json({ error: 'Not authenticated' }, 401);
    const url = new URL(req.url);
    const today = calgaryDay();
    const dayOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
    let to = dayOk(url.searchParams.get('to')) ? url.searchParams.get('to') : today;
    let from = dayOk(url.searchParams.get('from')) ? url.searchParams.get('from') : addDays(to, -6);
    if (from > to) [from, to] = [to, from];
    if (addDays(from, MAX_RANGE_DAYS - 1) < to) from = addDays(to, -(MAX_RANGE_DAYS - 1));
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    const perDay = [];
    for (const d of days) perDay.push(await summaryForDay(store, d, today));
    const merged = mergeSummaries(perDay);
    return json({ range: { from, to, days: days.length }, capped: perDay.some(s => s.capped), ...merged });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/scan-log' };
