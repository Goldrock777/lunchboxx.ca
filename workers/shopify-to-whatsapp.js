/**
 * Cloudflare Worker — Shopify "Order Created" webhook → WhatsApp
 *
 * Deploy:
 *   1. `npm i -g wrangler`
 *   2. `wrangler login`
 *   3. `wrangler deploy workers/shopify-to-whatsapp.js`
 *      (or paste this file into the Cloudflare Workers dashboard)
 *   4. Set secrets:
 *      wrangler secret put SHOPIFY_WEBHOOK_SECRET
 *      wrangler secret put TWILIO_ACCOUNT_SID
 *      wrangler secret put TWILIO_AUTH_TOKEN
 *      wrangler secret put TWILIO_FROM_WHATSAPP      // e.g. "whatsapp:+14155238886" (Twilio sandbox)
 *      wrangler secret put DRIVER_WHATSAPP           // e.g. "whatsapp:+1604xxxxxxx"
 *   5. In Shopify Admin → Settings → Notifications → Webhooks:
 *      - Event: "Order creation"
 *      - Format: JSON
 *      - URL: https://<your-worker-subdomain>.workers.dev/
 *   6. Copy the webhook signing secret Shopify shows you into SHOPIFY_WEBHOOK_SECRET.
 *
 * Result: every new Shopify order sends a formatted WhatsApp message to the driver.
 */

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('POST only', { status: 405 });
    }

    const raw = await request.text();

    // Verify Shopify HMAC signature
    const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256') || '';
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.SHOPIFY_WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
    if (computed !== hmacHeader) {
      return new Response('bad signature', { status: 401 });
    }

    const order = JSON.parse(raw);
    const msg = formatOrder(order);

    // Send via Twilio WhatsApp API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
    const body = new URLSearchParams({
      From: env.TWILIO_FROM_WHATSAPP,
      To: env.DRIVER_WHATSAPP,
      Body: msg
    });
    const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!res.ok) {
      return new Response(`twilio ${res.status}: ${await res.text()}`, { status: 502 });
    }
    return new Response('ok', { status: 200 });
  }
};

function formatOrder(o) {
  const orderNum   = o.order_number || o.name || o.id;
  const customer   = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') || 'Guest';
  const phone      = o.customer?.phone || o.shipping_address?.phone || o.billing_address?.phone || '(no phone)';
  const addr       = o.shipping_address;
  const addressStr = addr
    ? [addr.address1, addr.address2, addr.city].filter(Boolean).join(', ')
    : '(no address)';
  const mapsUrl    = addr
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [addr.address1, addr.city, addr.province].filter(Boolean).join(', ')
      )}`
    : '';
  const items      = (o.line_items || [])
    .map(li => `• ${li.quantity}× ${li.title}${li.variant_title ? ' (' + li.variant_title + ')' : ''}`)
    .join('\n');
  const total      = `$${Number(o.total_price || 0).toFixed(2)} ${o.currency || 'CAD'}`;
  const note       = (o.note || '').trim();
  const createdAt  = new Date(o.created_at || Date.now()).toLocaleTimeString('en-CA', {
    timeZone: 'America/Vancouver',
    hour: 'numeric',
    minute: '2-digit'
  });

  return [
    `🌭 LUNCHBOXX #${orderNum} · ${total}`,
    `👤 ${customer} · ${phone}`,
    `📍 ${addressStr}`,
    mapsUrl ? `🗺️ ${mapsUrl}` : null,
    '',
    items || '(no items)',
    note ? `\n📝 ${note}` : null,
    `\n⏰ Ordered ${createdAt} PT`
  ]
    .filter(Boolean)
    .join('\n');
}
