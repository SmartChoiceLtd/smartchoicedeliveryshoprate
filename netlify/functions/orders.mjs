import { getStore } from '@netlify/blobs';
import { Resend } from 'resend';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });
}

async function whoIs(req) {
  try {
    const m = (req.headers.get('cookie') || '').match(/scd_session=([a-f0-9]+)/);
    if (!m) return null;
    const sess = await getStore('flower-sessions').get(m[1], { type: 'json' });
    return (sess && new Date(sess.expires_at) > new Date()) ? sess.username : null;
  } catch (e) { return null; }
}

function firstName(name) {
  return (name || '').split(' ')[0] || name;
}

async function getTemplate() {
  try {
    const store = getStore('email-templates');
    const t = await store.get('driver-overview', { type: 'json' });
    return t || {
      season: 'Current Season',
      dates: 'TBD',
      positions: '5',
      comment: 'We have positions available and would love to hear from you.'
    };
  } catch(e) {
    return {
      season: 'Current Season',
      dates: 'TBD',
      positions: '5',
      comment: 'We have positions available and would love to hear from you.'
    };
  }
}

// Builds the application-acknowledgement content as a standalone HTML
// string, reusable for both the actual email send and a view-only page -
// so if the email is never received, the exact same content can still be
// opened directly, printed, or forwarded another way.
function buildApplicationHtml(app, t) {
  const first = firstName(app.name);
  return `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#2B2620;background:#FAF7F2;">
          <div style="background:#0C769E;padding:20px 24px;border-bottom:4px solid #B8472B;">
            <h1 style="color:#fff;font-family:Georgia,serif;margin:0;font-size:22px;">Smart Choice Delivery</h1>
            <p style="color:#D6EEF7;margin:4px 0 0;font-size:13px;">Your Delivery Service Partner</p>
          </div>
          <div style="padding:24px;background:#fff;border-left:1px solid #E6DECF;border-right:1px solid #E6DECF;">
            <p style="font-size:16px;">Hey there ${first},</p>
            <p>Thank you for applying to join the Smart Choice Delivery team. <strong>Your application has been received.</strong></p>
            <div style="background:#D6EEF7;border-left:4px solid #0C769E;padding:12px 16px;border-radius:6px;margin:16px 0;">
              <p style="margin:0;font-size:15px;font-weight:600;color:#0C769E;">${t.season}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#2B2620;">${t.comment}</p>
              <p style="margin:4px 0 0;font-size:13px;"><strong>Dates:</strong> ${t.dates} &nbsp;|&nbsp; <strong>Positions Available:</strong> ${t.positions}</p>
            </div>
            <h3 style="color:##B8472B;border-bottom:2px solid ##B8472B;padding-bottom:6px;">About the Opportunity</h3>
            <p>We provide primary in-house delivery service for 10 shops in Calgary, backup service for 20+ additional shops, and service for specialty bakery and gift basket shops.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
              <tr style="background:#F4DCC9;">
                <td style="padding:8px 12px;font-weight:700;color:#0C769E;width:40%;">Hours</td>
                <td style="padding:8px 12px;">Days start at 7am, typically until 6pm. Most drivers start between 9-10am.</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-weight:700;color:#0C769E;">Contractor Status</td>
                <td style="padding:8px 12px;">Independent contractor — work as much or as little as you want.</td>
              </tr>
              <tr style="background:#F4DCC9;">
                <td style="padding:8px 12px;font-weight:700;color:#0C769E;">Pay Per Delivery</td>
                <td style="padding:8px 12px;">Minimum average $8/delivery. Many drivers average closer to $10. Gas is included in the delivery payment.</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-weight:700;color:#0C769E;">Specialty Deliveries</td>
                <td style="padding:8px 12px;">Wholesale, out of town, weddings and events range $9–$50.</td>
              </tr>
              <tr style="background:#F4DCC9;">
                <td style="padding:8px 12px;font-weight:700;color:#0C769E;">Daily Volume</td>
                <td style="padding:8px 12px;">Typically 10–20 deliveries per day. During peak periods (Christmas, Valentine's, Mother's Day) experienced drivers do 30+ per shift.</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-weight:700;color:#0C769E;">Payment</td>
                <td style="padding:8px 12px;">Weekly. Cut off Sunday, e-transfer the following Sunday. Valid email required.</td>
              </tr>
            </table>
            <div style="background:#EAF4EA;border:1px solid #A8CFA8;border-radius:8px;padding:14px 16px;margin:16px 0;">
              <p style="margin:0;font-size:14px;"><strong>Interested?</strong> I prefer to meet potential drivers before you start. Contact me to arrange a meeting or a couple of trial shifts to see if this is the right fit for you.</p>
            </div>
            <p>Please feel free to reach out with any questions.</p>
            <p style="margin-top:24px;">Cheers,<br>
            <strong>Kevin Michaud</strong><br>
            Owner/Operator, Smart Choice Delivery<br>
            <a href="tel:4038809822" style="color:#0C769E;">403-880-9822</a> &nbsp;|&nbsp;
            <a href="mailto:smartchoicedelivery@yahoo.com" style="color:#0C769E;">smartchoicedelivery@yahoo.com</a></p>
          </div>
          <div style="background:#0C769E;padding:12px 24px;text-align:center;">
            <p style="color:#D6EEF7;font-size:11px;margin:0;">Smart Choice Delivery &mdash; Calgary, AB &mdash; Your Delivery Service Partner</p>
          </div>
        </div>
      `;
}

const escH = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Plain-text message -> email: blank line = new paragraph. Each applicant is greeted by first name.
function buildBroadcastHtml(app, message) {
  const paras = String(message || '').replace(/\r/g, '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)
    .map(x => '<p style="margin:0 0 14px;font-size:15px;line-height:1.5;">' + escH(x).replace(/\n/g, '<br>') + '</p>').join('');
  return `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#2B2620;background:#FAF7F2;">
          <div style="background:#0C769E;padding:20px 24px;border-bottom:4px solid #B8472B;">
            <h1 style="color:#fff;font-family:Georgia,serif;margin:0;font-size:22px;">Smart Choice Delivery</h1>
            <p style="color:#D6EEF7;margin:4px 0 0;font-size:13px;">Your Delivery Service Partner</p>
          </div>
          <div style="padding:24px;background:#fff;border-left:1px solid #E6DECF;border-right:1px solid #E6DECF;">
            <p style="font-size:16px;margin:0 0 14px;">Hi ${escH(firstName(app.name) || 'there')},</p>
            ${paras}
            <p style="margin-top:24px;">Cheers,<br>
            <strong>Kevin Michaud</strong><br>
            Owner/Operator, Smart Choice Delivery<br>
            <a href="tel:4038809822" style="color:#0C769E;">403-880-9822</a> &nbsp;|&nbsp;
            <a href="mailto:smartchoicedelivery@yahoo.com" style="color:#0C769E;">smartchoicedelivery@yahoo.com</a></p>
          </div>
          <div style="background:#0C769E;padding:12px 24px;text-align:center;">
            <p style="color:#D6EEF7;font-size:11px;margin:0;">Smart Choice Delivery &mdash; Calgary, AB &mdash; You are receiving this because you applied to drive for us.</p>
          </div>
        </div>`;
}
async function uniqueApplicants() {
  const store = getStore('driver-applications');
  const { blobs } = await store.list();
  const apps = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
  const seen = new Set(), out = [];
  apps.sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0)).forEach(a => {
    const e = String(a.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || seen.has(e)) return;
    seen.add(e); out.push({ name: a.name || '', email: e });
  });
  return out;
}

async function sendAcknowledgement(app) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const t = await getTemplate();
  const html = buildApplicationHtml(app, t);
  try {
    const data = await resend.emails.send({
      from: 'applications@smartchoicedelivery.ca',
      to: app.email,
      subject: 'Smart Choice Delivery — Application Received',
      html
    });
    console.log('Email sent:', data);
    return data;
  } catch(error) {
    console.error('Failed to send email:', error);
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
  }

  const urlObj = new URL(req.url);
  if (urlObj.searchParams.get('type') === 'template') {
    const store = getStore('email-templates');
    if (req.method === 'GET') {
      try {
        const t = await store.get('driver-overview', { type: 'json' });
        return json(t || { season:'', dates:'', positions:'', comment:'' });
      } catch(e) { return json({ season:'', dates:'', positions:'', comment:'' }); }
    }
    if (req.method === 'PUT') {
      if (!(await whoIs(req))) return json({ error: 'Not signed in' }, 401);
      const body = await req.json();
      await store.setJSON('driver-overview', body);
      return json({ success: true });
    }
  }

  // View-only page: lets an applicant (or Kevin, on their behalf) see the
  // exact same acknowledgement content even if the email was never
  // received, or serves as a printable/shareable page to send another
  // way. No email/Resend involved at all - pure lookup and render.
  if (req.method === 'GET' && urlObj.searchParams.get('view') === 'html') {
    const id = urlObj.searchParams.get('id');
    if (!id) {
      return new Response('id is required.', { status: 400, headers: { 'content-type': 'text/plain' } });
    }
    const store = getStore('driver-applications');
    const app = await store.get(id, { type: 'json' });
    if (!app) {
      return new Response('No application found with that id.', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    const t = await getTemplate();
    const html = buildApplicationHtml(app, t);
    const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Application Received - ${app.name || ''}</title></head><body style="margin:0;padding:20px 12px;background:#FAF7F2;">${html}</body></html>`;
    return new Response(page, { status: 200, headers: { 'content-type': 'text/html', 'access-control-allow-origin': '*' } });
  }

  // Office only: email every applicant (one email each, nobody sees anyone else's address).
  //   {dry:true}                          -> how many would receive it, and when one was last sent
  //   {subject, message, test:'a@b.c'}    -> send one test to that address only
  //   {subject, message, confirm:true}    -> send to every applicant
  if (req.method === 'POST' && urlObj.searchParams.get('action') === 'broadcast') {
    const user = await whoIs(req);
    if (!user) return json({ error: 'Not signed in' }, 401);
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'Invalid JSON' }, 400); }
    const logStore = getStore('email-templates');
    const people = await uniqueApplicants();
    if (body.dry) {
      const last = await logStore.get('applicant-broadcast-log', { type: 'json' }).catch(() => null);
      return json({ count: people.length, last: last || null });
    }
    const subject = String(body.subject || '').trim().slice(0, 150), message = String(body.message || '').trim().slice(0, 5000);
    if (!subject || !message) return json({ error: 'Subject and message are both needed.' }, 400);
    if (!process.env.RESEND_API_KEY) return json({ error: 'Email is not set up (no RESEND_API_KEY).' }, 500);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const mk = p => ({ from: 'Smart Choice Delivery <applications@smartchoicedelivery.ca>', replyTo: 'smartchoicedelivery@yahoo.com', to: p.email, subject, html: buildBroadcastHtml(p, message) });
    if (body.test) {
      const to = String(body.test).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: 'That test address does not look right.' }, 400);
      const r = await resend.emails.send(mk({ name: 'Kevin', email: to }));
      if (r && r.error) return json({ error: 'Test failed: ' + (r.error.message || 'unknown') }, 502);
      return json({ success: true, test: true, sent: 1 });
    }
    if (body.confirm !== true) return json({ error: 'Not confirmed.' }, 400);
    if (!people.length) return json({ error: 'There are no applicants with a valid email.' }, 400);
    let sent = 0, failed = 0;
    for (let i = 0; i < people.length; i += 50) {
      const chunk = people.slice(i, i + 50).map(mk);
      try {
        const r = await resend.batch.send(chunk);
        if (r && r.error) failed += chunk.length; else sent += chunk.length;
      } catch (e) { console.error('applicant broadcast chunk failed:', e.message); failed += chunk.length; }
    }
    await logStore.setJSON('applicant-broadcast-log', { at: new Date().toISOString(), by: user, subject, sent, failed });
    return json({ success: true, sent, failed });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'Invalid JSON' }, 400); }
    const id = 'app_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const store = getStore('driver-applications');
    const app = { id, ...body };
    await store.setJSON(id, app);
    await sendAcknowledgement(app);
    return json({ success: true, id }, 201);
  }

  if (req.method === 'GET') {
    if (!(await whoIs(req))) return json({ error: 'Not signed in' }, 401);
    const store = getStore('driver-applications');
    const { blobs } = await store.list();
    const apps = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
    return json(apps.filter(Boolean).sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at)));
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/onboard' };

