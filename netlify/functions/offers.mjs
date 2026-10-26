import { getStore } from '@netlify/blobs';

// Job offers: the office offers one job (1 to 3 pickups) to several drivers at once; the FIRST driver to accept gets it.
//
//   POST /api/offers            (office login)  { jobs:[{code,address,count,area}], drivers:[CODE,...] } -> { id, expires_at, links }
//   GET  /api/offers            (office login)  recent offers with who accepted / declined / has not answered
//   GET  /api/offers?id=&d=     (driver link)   what this driver sees: the job and its state (open / taken / expired)
//   POST /api/offers {action:'respond', id, d, response:'accept'|'decline'}   (driver link)
//
// Fairness. Blobs cannot lock a record, so every driver writes their OWN claim record (offer id + driver code) holding a
// server timestamp. After writing, an accepting driver waits a moment, reads every invited driver's claim with a strong
// read, and the winner is the EARLIEST accept (ties go to the lower driver code). Every phone works out the same winner, so
// two drivers tapping in the same instant still get one answer. The winner's status is set to "heading to the first
// pickup" so the dispatch board ranks them from there.

const OFFER_MIN = 15;
const SETTLE_MS = 700;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
async function whoIs(req) {
  const m = (req.headers.get('cookie') || '').match(/scd_session=([a-f0-9]+)/);
  if (!m) return null;
  const s = await getStore('flower-sessions').get(m[1], { type: 'json' });
  if (!s || new Date(s.expires_at) < new Date()) return null;
  return s.username;
}
const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const claimKey = (id, d) => id + '__' + String(d).toUpperCase();

// Every invited driver's reply, read strongly.
async function readClaims(offer) {
  const cs = getStore('flower-offer-claims');
  const out = {};
  await Promise.all(offer.drivers.map(async d => {
    const c = await cs.get(claimKey(offer.id, d.code), { type: 'json', consistency: 'strong' }).catch(() => null);
    if (c) out[d.code] = c;
  }));
  return out;
}
// A winner is only final once its claim is a moment old: a rival claim with an EARLIER timestamp may still be in flight.
// A reader that meets a fresh winner waits out that moment and reads again, so every phone settles on the same driver.
async function settledClaims(offer) {
  let claims = await readClaims(offer);
  const w = pickWinner(claims);
  if (w && Date.now() - Date.parse(w.at) < SETTLE_MS * 2) { await sleep(SETTLE_MS); claims = await readClaims(offer); }
  return claims;
}
export function pickWinner(claims) {
  const acc = Object.values(claims).filter(c => c.response === 'accept');
  acc.sort((a, b) => (Date.parse(a.at) - Date.parse(b.at)) || String(a.driver).localeCompare(String(b.driver)));
  return acc[0] || null;
}
function state(offer, claims, now) {
  const w = pickWinner(claims);
  if (w) return { state: 'taken', winner: w.driver, winner_name: (offer.drivers.find(d => d.code === w.driver) || {}).name || w.driver, taken_at: w.at };
  if (now > Date.parse(offer.expires_at)) return { state: 'expired' };
  return { state: 'open' };
}

export default async (req) => {
  const offers = getStore('flower-offers');
  const url = new URL(req.url);
  const now = Date.now();

  if (req.method === 'GET') {
    const id = url.searchParams.get('id');
    if (id) { // a driver's own view
      const d = clean(url.searchParams.get('d'), 12).toUpperCase();
      const offer = await offers.get(clean(id, 40), { type: 'json', consistency: 'strong' }).catch(() => null);
      const me = offer && offer.drivers.find(x => x.code === d);
      if (!offer || !me) return json({ error: 'This offer link is not valid.' }, 404);
      const claims = await settledClaims(offer);
      const st = state(offer, claims, Date.now());
      return json({
        id: offer.id, jobs: offer.jobs, expires_at: offer.expires_at, driver: me.name,
        ...st, mine: claims[d] ? claims[d].response : null, i_won: st.state === 'taken' && st.winner === d
      });
    }
    if (!(await whoIs(req))) return json({ error: 'Not authenticated' }, 401);
    const { blobs } = await offers.list();
    const all = (await Promise.all(blobs.map(b => offers.get(b.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
    const recent = all.filter(o => now - Date.parse(o.created_at) < 24 * 3600e3).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 15);
    const out = await Promise.all(recent.map(async o => {
      const claims = await readClaims(o);
      return { id: o.id, jobs: o.jobs, created_at: o.created_at, expires_at: o.expires_at, created_by: o.created_by,
        ...state(o, claims, now),
        drivers: o.drivers.map(d => ({ code: d.code, name: d.name, response: claims[d.code] ? claims[d.code].response : null, at: claims[d.code] ? claims[d.code].at : null })) };
    }));
    return json({ now: new Date(now).toISOString(), offers: out });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }

  // ---- a driver answers
  if (body.action === 'respond') {
    const d = clean(body.d, 12).toUpperCase();
    const response = body.response;
    if (!['accept', 'decline'].includes(response)) return json({ error: 'response must be accept or decline' }, 400);
    const offer = await offers.get(clean(body.id, 40), { type: 'json', consistency: 'strong' }).catch(() => null);
    const me = offer && offer.drivers.find(x => x.code === d);
    if (!offer || !me) return json({ error: 'This offer link is not valid.' }, 404);
    let claims = await settledClaims(offer);
    let st = state(offer, claims, Date.now());
    if (st.state !== 'open') return json({ ...st, i_won: st.state === 'taken' && st.winner === d, mine: claims[d] ? claims[d].response : null });
    const cs = getStore('flower-offer-claims');
    if (claims[d] && claims[d].response === 'accept') return json({ ...st, mine: 'accept' }); // already theirs, nothing to do
    const at = new Date().toISOString();
    await cs.setJSON(claimKey(offer.id, d), { offer: offer.id, driver: d, response, at });
    if (response === 'decline') return json({ state: 'open', mine: 'decline' });
    await sleep(SETTLE_MS); // let a claim written at the same moment by another phone land
    claims = await readClaims(offer);
    st = state(offer, claims, Date.now());
    const iWon = st.state === 'taken' && st.winner === d;
    if (iWon) {
      try { // the board and the nearest-driver ranking now see this driver as heading to the first pickup
        const ds = getStore('flower-driver-status'), key = d.toLowerCase();
        const cur = (await ds.get(key, { type: 'json' }).catch(() => null)) || { code: d, name: me.name, history: [] };
        const first = offer.jobs[0] && offer.jobs[0].address;
        if (first) { cur.heading = { address: first, at }; cur.history = [{ kind: 'heading', address: first, at }].concat(cur.history || []).slice(0, 15); cur.updated_at = at; await ds.setJSON(key, cur); }
      } catch (e) { console.error('offer winner status failed:', e.message); }
    }
    return json({ ...st, i_won: iWon, mine: 'accept' });
  }

  // ---- the office creates an offer
  const user = await whoIs(req);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const jobs = (Array.isArray(body.jobs) ? body.jobs : []).slice(0, 3).map(j => ({
    code: clean(j.code, 10).toUpperCase(), address: clean(j.address, 200),
    count: Number.isFinite(j.count) && j.count > 0 ? Math.min(99, Math.floor(j.count)) : 0, area: clean(j.area, 20).toUpperCase()
  })).filter(j => j.address.length >= 5);
  if (!jobs.length) return json({ error: 'At least one pickup address is required' }, 400);
  const codes = [...new Set((Array.isArray(body.drivers) ? body.drivers : []).map(c => clean(c, 12).toUpperCase()).filter(Boolean))].slice(0, 30);
  if (!codes.length) return json({ error: 'Choose at least one driver' }, 400);
  const dStore = getStore('flower-drivers');
  const drivers = (await Promise.all(codes.map(c => dStore.get(c.toLowerCase(), { type: 'json' }).catch(() => null)))).filter(d => d && d.active !== false).map(d => ({ code: String(d.code).toUpperCase(), name: d.name }));
  if (!drivers.length) return json({ error: 'None of those drivers were found' }, 400);
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const created = new Date(now);
  const offer = { id, jobs, drivers, created_at: created.toISOString(), expires_at: new Date(now + OFFER_MIN * 60000).toISOString(), created_by: user };
  await offers.setJSON(id, offer);
  return json({ id, expires_at: offer.expires_at, minutes: OFFER_MIN, links: drivers.map(d => ({ code: d.code, name: d.name, path: '/offer.html?id=' + id + '&d=' + encodeURIComponent(d.code) })) }, 201);
};

export const config = { path: '/api/offers' };
