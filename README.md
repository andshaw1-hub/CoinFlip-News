# Food Tracker Pro — Setup Guide

## Prerequisites
- Node.js 18+ (`node -v`)
- A Stripe account (stripe.com)
- A Google AdSense account (adsense.google.com)

---

## 1. Install Dependencies

```bash
cd food-tracker-pro
npm install
```

---

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your real keys:

### Stripe Setup
1. Go to https://dashboard.stripe.com/apikeys
2. Copy your **Publishable key** → `STRIPE_PUBLISHABLE_KEY`
3. Copy your **Secret key** → `STRIPE_SECRET_KEY`
4. Create a Product: Dashboard → Products → Add Product
   - Name: "Food Tracker Pro"
   - Price: $9.00 / month / recurring / USD
   - Copy the **Price ID** → `STRIPE_PRICE_ID`

### Stripe Webhook (Local Dev)
```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Copy the webhook signing secret → STRIPE_WEBHOOK_SECRET
```

### Stripe Webhook (Production)
1. Dashboard → Webhooks → Add endpoint
2. URL: `https://yourdomain.com/api/stripe/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET`

### Google AdSense
1. Go to https://adsense.google.com
2. Copy your Publisher ID (ca-pub-XXXXXXXX) → `ADSENSE_PUBLISHER_ID`
3. Create 4 ad units and copy their Slot IDs:
   - Leaderboard (728×90) → `ADSENSE_SLOT_LEADERBOARD`
   - Rectangle (300×250)  → `ADSENSE_SLOT_RECTANGLE`
   - Banner top (468×60)  → `ADSENSE_SLOT_BANNER_TOP`
   - Banner mid (468×60)  → `ADSENSE_SLOT_BANNER_MID`

### Session Secret
Generate a random string:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
→ paste into `SESSION_SECRET`

---

## 3. Run Locally

```bash
npm run dev   # with auto-reload (nodemon)
# or
npm start     # production mode
```

Open http://localhost:3000

---

## 4. Deploy to Production

### Option A — Railway (Recommended, free tier available)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway variables set $(cat .env | xargs)
```

### Option B — Render
1. Connect your GitHub repo at render.com
2. Build command: `npm install`
3. Start command: `npm start`
4. Add all `.env` variables in the Environment tab
5. Set `APP_URL` to your Render URL

### Option C — DigitalOcean App Platform
1. Connect GitHub repo
2. Set environment variables in Settings
3. Deploy

---

## 5. Revenue Streams Active After Setup

| Stream | When Active | Est. Monthly @ 5K subs |
|--------|-------------|------------------------|
| Pro subscriptions ($9/mo) | Immediately | $500–2,000 |
| Google AdSense | After approval (~1-2 wks) | $200–800 |
| Direct sponsors | At ~2K+ subs | $500–2,500/issue |

---

## Architecture

```
food-tracker-pro/
├── server.js          # Express server, routes
├── db.js              # SQLite database (better-sqlite3)
├── .env               # Your secrets (never commit this)
├── .env.example       # Template
├── routes/
│   ├── auth.js        # Register, login, logout, /me
│   ├── stripe.js      # Checkout, portal, webhook handler
│   └── stories.js     # Generate, history, fetch
├── middleware/
│   └── auth.js        # Auth guards, generation limits
└── public/
    └── index.html     # Full SPA frontend
```

## Payment Flow

1. User registers → free account created in SQLite
2. User selects Pro → POST `/api/stripe/create-checkout-session`
3. Server creates Stripe Checkout Session → returns URL
4. User redirected to Stripe-hosted checkout page
5. User pays → Stripe fires `checkout.session.completed` webhook
6. Webhook handler upgrades user in database → `tier = 'pro'`
7. User redirected back to `/success?session_id=...`
8. Frontend detects session_id param → refreshes auth → shows Pro UI

## Cancellation Flow

1. User opens billing portal → POST `/api/stripe/create-portal-session`
2. User cancels in Stripe portal
3. Stripe fires `customer.subscription.deleted` webhook
4. Webhook downgrades user → `tier = 'free'`
