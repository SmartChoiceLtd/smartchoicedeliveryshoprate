function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

const EXTRACTION_PROMPT = `You are looking at a photo of a delivery tag attached to a flower/gift order. These tags come in many different shapes, sizes, and layouts - printed labels, handwritten cards, different fonts and orientations.

Extract exactly these four fields from the tag:
- order_id: the order number/tag code (often near "Order #", "Tag", or just a standalone number)
- name: the recipient's name
- address: the delivery address (street address, as complete as legible)
- shop_name: the sending/originating shop's full name if printed on the tag (usually NOT abbreviated to a short code - it's typically the full business name, e.g. "Kensington Flowers")

Respond with ONLY a raw JSON object, no markdown formatting, no code fences, no explanation. Use this exact shape:
{"order_id": "...", "name": "...", "address": "...", "shop_name": "..."}

If a field is not legible or not present on the tag, use an empty string "" for that field rather than guessing or making up a value. Never fabricate information that isn't actually visible on the tag.`;

export default async (req) => {
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

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
              { type: 'text', text: EXTRACTION_PROMPT }
            ]
          }
        ]
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return json({ error: 'Vision API request failed: ' + res.status + ' ' + errText }, 502);
    }

    const data = await res.json();
    const textBlock = (data.content || []).find(c => c.type === 'text');
    if (!textBlock) {
      return json({ error: 'No text response from vision API' }, 502);
    }

    let extracted;
    try {
      // Strip any accidental markdown code fences before parsing, in case
      // the model wraps the JSON despite being asked not to.
      const cleaned = textBlock.text.replace(/^```json\s*|^```\s*|```\s*$/gm, '').trim();
      extracted = JSON.parse(cleaned);
    } catch (e) {
      return json({ error: 'Could not parse extraction result', raw: textBlock.text }, 502);
    }

    return json({
      order_id: extracted.order_id || '',
      name: extracted.name || '',
      address: extracted.address || '',
      shop_name: extracted.shop_name || ''
    });
  } catch (e) {
    return json({ error: 'Could not process tag: ' + e.message }, 500);
  }
};

export const config = { path: '/api/scan-tag' };
