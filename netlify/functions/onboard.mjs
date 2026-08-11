import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });
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

async function sendAcknowledgement(app) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const t = await getTemplate();
  const first = firstName(app.name);
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'applications@send.smartchoicedelivery.ca',
      to: app.email,
      bcc: 'kevinmichaud@yahoo.ca',
      subject: 'Smart Choice Delivery — Thank You For Your Interest',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#2B2620;background:#FAF7F2;">
          <div style="background:#0C769E;padding:20px 24px;border-bottom:4px solid #B8472B;">
            <h1 style="color:#fff;font-family:Georgia,serif;margin:0;font-size:22px;">Smart Choice Delivery</h1>
            <p style="color:#D6EEF7;margin:4px 0 0;font-size:13px;">Your Delivery Service Partner</p>
          </div>
          <div style="padding:24px;background:#fff;border-left:1px solid #E6DECF;border-right:1px solid #E6DECF;">
            <p style="font-size:16px;">Hey there ${first},</p>
            <p>Thank you for your interest in joining the Smart Choice Delivery team.</p>
            <div style="background:#D6EEF7;border-left:4px solid #0C769E;padding:12px 16px;border-radius:6px;margin:16px 0;">
              <p style="margin:0;font-size:15px;font-weight:600;color:#0C769E;">${t.season}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#2B2620;">${t.comment}</p>
              <p style="margin:4px 0 0;font-size:13px;"><strong>Dates:</strong> ${t.dates} &nbsp;|&nbsp; <strong>Positions Available:</strong> ${t.positions}</p>
            </div>
            <h3 style="color:#0C769E;border-bottom:2px solid #B8472B;padding-bottom:6px;">About the Opportunity</h3>
            <p>We provide primary in-house delivery service for 10 shops in Calgary, backup service for 20+ additional shops, and service for specialty bakery and gift basket shops.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
              <tr style="background:#F4DCC9;">
                <td style="padding:8px 12px;font-weight:700;color:#B8472B;width:40%;">Hours</td>
                <td style="padding:8px 12px;">Days start at 7am, typically until 6pm. Most drivers start between 9-10am.</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-weight:700;color:#B8472B;">Contractor Status</td>
                <td style="padding:8px 12px;">Independent contractor — work as much or as little as you want.</td>
              </tr>
              <tr style="background:#F4DCC9;">
                <td style="padding:8px 12px;font-weight:700;color:#B8472B;">Pay Per Delivery</td>
                <td style="padding:8px 12px;">Minimum average $8/delivery. Many drivers average closer to $10. Gas is included in the delivery payment.</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-weight:700;color:#B8472B;">Specialty Deliveries</td>
                <td style="padding:8px 12px;">Wholesale, out of town, weddings and events range $9–$50.</td>
              </tr>
              <tr style="background:#F4DCC9;">
                <td style="padding:8px 12px;font-weight:700;color:#B8472B;">Daily Volume</td>
                <td style="padding:8px 12px;">Typically 10–20 deliveries per day. During peak periods (Christmas, Valentine's, Mother's Day) experienced drivers do 30+ per shift.</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-weight:700;color:#B8472B;">Payment</td>
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
      `
    })
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
  }

  // GET/PUT email template
  if (req.url.includes('/template')) {
    const store = getStore('email-templates');
    if (req.method === 'GET') {
      try {
        const t = await store.get('driver-overview', { type: 'json' });
        return json(t || { season:'', dates:'', positions:'', comment:'' });
      } catch(e) { return json({ season:'', dates:'', positions:'', comment:'' }); }
    }
    if (req.method === 'PUT') {
      const body = await req.json();
      await store.setJSON('driver-overview', body);
      return json({ success: true });
    }
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
