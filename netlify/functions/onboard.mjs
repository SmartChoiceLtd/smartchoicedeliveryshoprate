import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });
}

async function sendAcknowledgement(app) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'applications@send.smartchoicedelivery.ca',
      to: app.email,
      bcc: 
      subject: 'Smart Choice Delivery — Application Received',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#2B2620;">
          <div style="background:#0C769E;padding:20px 24px;border-bottom:4px solid #B8472B;">
            <h1 style="color:#fff;font-family:Georgia,serif;margin:0;font-size:20px;">Smart Choice Delivery</h1>
          </div>
          <div style="padding:24px;">
            <p>Hi ${app.name},</p>
            <p>Thank you for applying to join our delivery team. We have received your application and will be in touch shortly.</p>
            <h3 style="color:#0C769E;">Your Application Summary</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#6B6256;width:140px;">Date</td><td style="padding:6px 0;">${app.date}</td></tr>
              <tr><td style="padding:6px 0;color:#6B6256;">Phone</td><td style="padding:6px 0;">${app.phone}</td></tr>
              <tr><td style="padding:6px 0;color:#6B6256;">Vehicle</td><td style="padding:6px 0;">${app.vehicle}</td></tr>
              <tr><td style="padding:6px 0;color:#6B6256;">Days Available</td><td style="padding:6px 0;">${app.days_available}</td></tr>
              <tr><td style="padding:6px 0;color:#6B6256;">Times Available</td><td style="padding:6px 0;">${app.time_available}</td></tr>
              ${app.referred_by ? `<tr><td style="padding:6px 0;color:#6B6256;">Referred By</td><td style="padding:6px 0;">${app.referred_by}</td></tr>` : ''}
              ${app.comments ? `<tr><td style="padding:6px 0;color:#6B6256;">Comments</td><td style="padding:6px 0;">${app.comments}</td></tr>` : ''}
            </table>
            <p style="margin-top:24px;">We look forward to speaking with you.</p>
            <p style="color:#6B6256;font-size:13px;">Smart Choice Delivery<br>Calgary, AB</p>
          </div>
        </div>
      `
    })
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'Invalid JSON' }, 400); }
    const id = 'app_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const store = getStore('driver-applications');
    const app = { id, ...body };
    await store.setJSON(id, app);
    try { await sendAcknowledgement(app); } catch(e) { console.error('Email failed:', e.message); }
    return json({ success: true, id }, 201);
  }

  if (req.method === 'GET') {
    const store = getStore('driver-applications');
    const { blobs } = await store.list();
    const apps = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
    return json(apps.filter(Boolean).sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at)));
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/onboard' };
