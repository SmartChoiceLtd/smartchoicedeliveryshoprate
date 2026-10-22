import { getStore } from '@netlify/blobs';
import { runBackup, BACKUP_STORES } from './backup.mjs';

// Staff-only: GET = backup status, POST {action:'run'} = back up now, POST {action:'restore', ...} =
// put records from a backup file back. Restore defaults to "only records that are missing", so it can
// never overwrite anything unless overwrite is chosen deliberately.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
async function requireAuth(req) {
  const m = (req.headers.get('cookie') || '').match(/scd_session=([a-f0-9]+)/);
  if (!m) return null;
  const s = await getStore('flower-sessions').get(m[1], { type: 'json' });
  if (!s || new Date(s.expires_at) < new Date()) return null;
  return s.username;
}

export default async (req) => {
  const user = await requireAuth(req);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const statusStore = getStore('flower-backups');

  if (req.method === 'GET') {
    const last = await statusStore.get('last', { type: 'json' }).catch(() => null);
    const history = await statusStore.get('history', { type: 'json' }).catch(() => null);
    return json({ last, history: history || [], email_configured: !!process.env.BACKUP_EMAIL, stores: BACKUP_STORES });
  }
  if (req.method !== 'POST') return json({ error: 'GET or POST only' }, 405);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }

  if (body.action === 'run') {
    const st = await runBackup({ trigger: 'manual by ' + user });
    return json(st);
  }

  if (body.action === 'restore') {
    if (!BACKUP_STORES.includes(body.store)) return json({ error: 'Unknown store' }, 400);
    const recs = Array.isArray(body.records) ? body.records.slice(0, 200) : [];
    const overwrite = body.overwrite === true;
    const store = getStore(body.store);
    let restored = 0, skipped = 0, failed = 0;
    for (const r of recs) {
      if (!r || typeof r.key !== 'string' || !r.key || r.key.length > 300) { failed++; continue; }
      try {
        if (!overwrite) {
          const existing = await store.get(r.key, { type: 'text' });
          if (existing !== null && existing !== undefined) { skipped++; continue; }
        }
        const v = r.value;
        if (v && typeof v === 'object' && typeof v.__text === 'string') await store.set(r.key, v.__text);
        else await store.setJSON(r.key, v);
        restored++;
      } catch (e) { failed++; }
    }
    return json({ ok: true, restored, skipped_existing: skipped, failed });
  }
  return json({ error: 'Unknown action' }, 400);
};

export const config = { path: '/api/backup' };
