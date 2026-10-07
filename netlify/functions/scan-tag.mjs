import { getStore } from '@netlify/blobs';

// ---- Scan log ---------------------------------------------------------------------------
// Every scan is recorded (which model read it, what phone it came from, how long it took,
// what it cost in tokens, and what it read) so scan accuracy can be MEASURED rather than
// guessed at: the scan page later reports what the driver did at the review step, and
// scan-log.mjs works out which fields had to be corrected. Logging must never get in the
// way of a scan, so every failure here is swallowed.
function calgaryDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// What kind of phone is this? (iPhones don't reveal their model in the browser string.)
function describeDevice(ua) {
  ua = String(ua || '');
  let platform = 'other', os = null;
  let m;
  if ((m = ua.match(/iPhone OS (\d+)[_.](\d+)/)) || (m = ua.match(/CPU OS (\d+)[_.](\d+)/))) { platform = 'ios'; os = m[1] + '.' + m[2]; }
  else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) { platform = 'android'; os = m[1]; }
  return { platform, os_version: os, ua: ua.slice(0, 180) };
}

async function writeScanLog(record) {
  try {
    await getStore('flower-scan-log').setJSON(record.id, record);
  } catch (e) {
    console.error('scan-tag: could not write scan log:', e && e.message);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function buildExtractionPrompt(shopList) {
  var shopSection = '';
  if (shopList && shopList.length) {
    shopSection = `\n\nHere is the list of registered shops in our system, each with a short code, full name, and any known alternate names seen on past delivery tags:\n` +
      shopList.map(function(s) {
        var aliasNote = (s.aliases && s.aliases.length) ? ' (also known on tags as: ' + s.aliases.join('; ') + ')' : '';
        return s.code + ' - ' + s.name + aliasNote;
      }).join('\n') +
      `\n\nThe tag will show a shop's full business name (possibly with extra words like a neighbourhood/location name, "Your", punctuation variants, or descriptive suffixes) - it will NOT show the short code. If the tag's shop name matches one of the listed alternate names for a shop, that is a strong, confirmed match - prefer it. Otherwise, use your judgment to match the tag's shop name to the single best entry in this list, the way a human dispatcher familiar with these shops would (e.g. "Midnapore Flower Magic" on a tag should match "FM Flower Magic" in the list; "Al Frach's Flowers" should match "AF Al Frache"). Return that shop's short code as shop_code. If you cannot confidently match it to any shop in the list, return an empty string for shop_code rather than guessing.`;
  }
  return `You are looking at a photo of a delivery tag attached to a flower/gift order. These tags come in many different shapes, sizes, and layouts - printed labels, handwritten cards, different fonts and orientations.

Extract exactly these four fields from the tag:
- order_id: the order number/tag code (often near "Order #", "Tag", or just a standalone number)
- name: the recipient's name
- address: the delivery address (street address, as complete as legible)
- shop_name: the sending/originating shop's name exactly as printed on the tag (verbatim, don't guess or standardize it)
- shop_code: the short code of the sending/originating shop, matched from the list below${shopSection}

Respond with ONLY a raw JSON object, no markdown formatting, no code fences, no explanation. Use this exact shape:
{"order_id": "...", "name": "...", "address": "...", "shop_name": "...", "shop_code": "..."}

If a field is not legible or not present on the tag, use an empty string "" for that field rather than guessing or making up a value. Never fabricate information that isn't actually visible on the tag.`;
}

// Which model reads the tag. PRIMARY is the accuracy upgrade over the smaller model that
// was running before. FALLBACK is that proven smaller model, used ONLY if the API rejects
// the primary model's name/access (a configuration problem) so a wrong model name can never
// stop scanning outright. Temporary errors (busy, rate limited) are NOT fallen back on -
// silently switching to the weaker model would hide a drop in accuracy; the driver just retries.
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';

// The model can be changed WITHOUT editing this file: set SCAN_MODEL in Netlify's
// environment variables (Site settings > Environment variables) and redeploy, e.g.
//   SCAN_MODEL = claude-haiku-4-5-20251001   -> the smaller, cheaper model
// Remove the variable to go back to the default above. Opening /api/scan-tag in a
// browser shows which model is currently configured.
function primaryModel() {
  return (process.env.SCAN_MODEL || '').trim() || DEFAULT_MODEL;
}

function callVision(model, apiKey, mediaType, base64Data, prompt) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt }
          ]
        }
      ]
    })
  });
}

export default async (req) => {
  if (req.method === 'GET') {
    // Status check only - safe to expose: no secrets, just which model is configured.
    return json({ status: 'ok', model: primaryModel(), fallback_model: FALLBACK_MODEL, api_key_configured: !!process.env.ANTHROPIC_API_KEY });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: 'ANTHROPIC_API_KEY not configured.' }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'Invalid JSON payload' }, 400);
  }

  const photoBase64 = body.photo_base64;
  if (!photoBase64 || typeof photoBase64 !== 'string') {
    return json({ error: 'photo_base64 required' }, 400);
  }

  // photo_base64 is a data URL like "data:image/jpeg;base64,....." from
  // canvas.toDataURL() on the client - split out the media type and the
  // raw base64 payload the Anthropic API expects separately.
  const match = photoBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return json({ error: 'photo_base64 must be a valid image data URL' }, 400);
  }
  const mediaType = match[1];
  const base64Data = match[2];

  // Who/what is scanning, for the log. Both are optional extras from the scan page.
  const startedAt = Date.now();
  const device = describeDevice(req.headers && req.headers.get ? req.headers.get('user-agent') : '');
  const scanId = 'scan_' + calgaryDay() + '_' + startedAt + '_' + Math.random().toString(36).slice(2, 6);
  const baseRecord = {
    id: scanId,
    at: new Date(startedAt).toISOString(),
    day: calgaryDay(),
    driver: /^[A-Za-z0-9]{1,8}$/.test(String(body.driver || '')) ? String(body.driver).toUpperCase() : '',
    ...device,
    exif_auto: typeof body.exif_auto === 'boolean' ? body.exif_auto : null,
    photo_kb: Math.round(base64Data.length * 0.75 / 1024),
    model_configured: primaryModel(),
    outcome: null, final: null, edited: null
  };
  const record = (status, extra) => writeScanLog({ ...baseRecord, status, latency_ms: Date.now() - startedAt, ...extra });

  try {
    const prompt = buildExtractionPrompt(body.shops);
    const PRIMARY = primaryModel();
    let modelUsed = PRIMARY;
    let res = await callVision(PRIMARY, apiKey, mediaType, base64Data, prompt);
    if (!res.ok && (res.status === 404 || res.status === 400) && PRIMARY !== FALLBACK_MODEL) {
      const rejection = await res.clone().text().catch(() => '');
      if (/model/i.test(rejection)) {
        console.error('scan-tag: ' + PRIMARY + ' was rejected (' + res.status + '), using ' + FALLBACK_MODEL + ' instead:', rejection.slice(0, 300));
        modelUsed = FALLBACK_MODEL;
        res = await callVision(FALLBACK_MODEL, apiKey, mediaType, base64Data, prompt);
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      await record('api_error', { model: modelUsed, error: ('HTTP ' + res.status + ' ' + errText).slice(0, 200) });
      return json({ error: 'Vision API request failed: ' + res.status + ' ' + errText }, 502);
    }

    const data = await res.json();
    const usage = { input_tokens: (data.usage && data.usage.input_tokens) || null, output_tokens: (data.usage && data.usage.output_tokens) || null };
    const textBlock = (data.content || []).find(c => c.type === 'text');
    if (!textBlock) {
      await record('api_error', { model: modelUsed, ...usage, error: 'no text in reply' });
      return json({ error: 'No text response from vision API' }, 502);
    }

    let extracted;
    try {
      // Strip any accidental markdown code fences before parsing, in case
      // the model wraps the JSON despite being asked not to.
      const cleaned = textBlock.text.replace(/^```json\s*|^```\s*|```\s*$/gm, '').trim();
      extracted = JSON.parse(cleaned);
    } catch (e) {
      await record('parse_error', { model: modelUsed, ...usage, error: String(textBlock.text).slice(0, 200) });
      return json({ error: 'Could not parse extraction result', raw: textBlock.text }, 502);
    }

    const read = {
      order_id: extracted.order_id || '',
      name: extracted.name || '',
      address: extracted.address || '',
      shop_name: extracted.shop_name || '',
      shop_code: (extracted.shop_code || '').toUpperCase()
    };
    await record(read.address ? 'read' : 'no_address', { model: modelUsed, ...usage, extracted: read });

    return json({
      order_id: extracted.order_id || '',
      name: extracted.name || '',
      address: extracted.address || '',
      shop_name: extracted.shop_name || '',
      shop_code: (extracted.shop_code || '').toUpperCase(),
      model_used: modelUsed,
      scan_id: scanId
    });
  } catch (e) {
    await record('error', { error: String(e && e.message).slice(0, 200) });
    return json({ error: 'Could not process tag: ' + e.message }, 500);
  }
};

export const config = { path: '/api/scan-tag' };
