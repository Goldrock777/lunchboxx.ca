# Workers

## shopify-to-whatsapp.js

Cloudflare Worker that receives Shopify `Order creation` webhooks, verifies the
Shopify HMAC signature, formats the order into a single WhatsApp message, and
sends it to the driver via Twilio's WhatsApp API.

### Example output

```
🌭 LUNCHBOXX #1247 · $20.00 CAD
👤 Alex Morgan · 604-555-0181
📍 13488 Central Ave, Unit 905, Surrey
🗺️ https://www.google.com/maps/search/?api=1&query=...

• 1× DUO

📝 No spicy mayo

⏰ Ordered 9:47 PM PT
```

### Setup (one-time, ~15 min)

**1. Twilio account**

- Create account at https://twilio.com (free trial includes $15 credit)
- Activate the WhatsApp sandbox: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
- The driver joins the sandbox by texting the provided code to the Twilio number. This
  enables messages to their phone without full WhatsApp Business API approval.
- For production volume, apply for a WhatsApp Business API sender (takes ~1–2 weeks).

**2. Deploy the worker**

```bash
npm i -g wrangler
wrangler login
cd workers
wrangler deploy shopify-to-whatsapp.js
```

Note the generated `*.workers.dev` URL.

**3. Set secrets**

```bash
wrangler secret put SHOPIFY_WEBHOOK_SECRET   # from Shopify (step 4)
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
wrangler secret put TWILIO_FROM_WHATSAPP     # e.g. whatsapp:+14155238886
wrangler secret put DRIVER_WHATSAPP          # e.g. whatsapp:+16045551234
```

**4. Register the Shopify webhook**

Shopify Admin → Settings → Notifications → Webhooks → Create webhook:

- Event: **Order creation**
- Format: **JSON**
- URL: `https://<your-subdomain>.workers.dev/`

Shopify shows a webhook signing secret — paste it into `SHOPIFY_WEBHOOK_SECRET`.

**5. Test**

Place a $1 test order through the site. The driver's phone should receive the
formatted WhatsApp message within 1–2 seconds.

### Cost

- Cloudflare Workers free tier: 100,000 requests/day (you'll use <200/day)
- Twilio WhatsApp sandbox: free
- Twilio production WhatsApp: ~$0.005 per message (i.e. $1 per 200 orders)

Total expected monthly cost at 80 orders/night: ~**$12/month**.
