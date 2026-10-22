import { getStore } from '@netlify/blobs';
import { Resend } from 'resend';
import { gzipSync } from 'node:zlib';

// Daily backup. Copies every record in the business data stores, compresses each store into its own
// file and EMAILS them to BACKUP_EMAIL (an off-platform copy that survives any problem with the app).
// Left out on purpose: sessions, user accounts and driver PINs (secrets), order photos (large) and the
// year-to-date cache (rebuilt automatically). Set BACKUP_EMAIL in Netlify > Environment variables
// (one address, or several separated by commas). Runs every day at 11:00 UTC (about 5 am Calgary).
// A manual run and restore live in backup-now.mjs / backups.html.

export const BACKUP_STORES = [
  'flower-orders', 'flower-shops', 'flower-rates', 'flower-drivers', 'flower-driver-payments',
  'flower-stops', 'flower-scan-log', 'flower-daily-premiums', 'driver-applications', 'email-templates'
];

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

async function dumpStore(name) {
  const store = getStore(name);
  const { blobs } = await store.list();
  const records = {};
  await mapLimit(blobs, 40, async b => {
    try { records[b.key] = await store.get(b.key, { type: 'json' }); }
    catch (e) {
      try { records[b.key] = { __text: await store.get(b.key, { type: 'text' }) }; }
      catch (e2) { records[b.key] = { __error: String(e2.message || e2) }; }
    }
  });
  return records;
}

function stamp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function runBackup({ trigger = 'schedule' } = {}) {
  const started = Date.now();
  const status = { at: new Date().toISOString(), trigger, ok: false, stores: {}, emailed: false, error: null };
  const statusStore = getStore('flower-backups');
  const to = (process.env.BACKUP_EMAIL || '').split(',').map(s => s.trim()).filter(Boolean);
  try {
    const files = [];
    const day = stamp();
    for (const name of BACKUP_STORES) {
      try {
        const records = await dumpStore(name);
        const payload = JSON.stringify({ store: name, created_at: status.at, count: Object.keys(records).length, records });
        const gz = gzipSync(Buffer.from(payload));
        status.stores[name] = { records: Object.keys(records).length, kb: Math.round(gz.length / 1024) };
        files.push({ filename: 'scd-' + name + '-' + day + '.json.gz', content: gz });
      } catch (e) { status.stores[name] = { error: String(e.message || e) }; }
    }
    if (!to.length) throw new Error('BACKUP_EMAIL is not set in Netlify environment variables - backup was made but not sent anywhere.');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const total = files.reduce((s, f) => s + f.content.length, 0);
    const summary = Object.keys(status.stores).map(n => n + ': ' + (status.stores[n].error ? 'ERROR ' + status.stores[n].error : status.stores[n].records + ' records, ' + status.stores[n].kb + ' KB')).join('\n');
    const groups = total < 25 * 1024 * 1024 ? [files] : files.map(f => [f]);
    for (let i = 0; i < groups.length; i++) {
      const r = await resend.emails.send({
        from: 'backup@smartchoicedelivery.ca', to,
        subject: 'Smart Choice Delivery backup ' + day + (groups.length > 1 ? ' (' + (i + 1) + ' of ' + groups.length + ')' : ''),
        text: 'Daily data backup (' + trigger + '). Keep these files; restore them from the Backups page.\n\n' + summary,
        attachments: groups[i]
      });
      if (r && r.error) throw new Error('Email failed: ' + (r.error.message || JSON.stringify(r.error)));
    }
    status.emailed = true;
    status.ok = !Object.values(status.stores).some(s => s.error);
  } catch (e) {
    status.error = String(e.message || e);
    try {
      if (to.length && process.env.RESEND_API_KEY) {
        await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'backup@smartchoicedelivery.ca', to, subject: 'Smart Choice Delivery backup FAILED', text: 'The backup did not complete:\n' + status.error });
      }
    } catch (e2) { /* nothing more can be done */ }
  }
  status.took_ms = Date.now() - started;
  try {
    await statusStore.setJSON('last', status);
    const hist = (await statusStore.get('history', { type: 'json' })) || [];
    hist.unshift({ at: status.at, trigger, ok: status.ok, error: status.error, emailed: status.emailed });
    await statusStore.setJSON('history', hist.slice(0, 30));
  } catch (e) { console.error('backup status save failed', e.message); }
  return status;
}

export default async () => { await runBackup({ trigger: 'schedule' }); };
export const config = { schedule: '0 11 * * *' };
