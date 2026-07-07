// routes/stripe.js
const express = require('express');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { q }   = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PRICE_ID        = process.env.STRIPE_PRICE_ID;
const WEBHOOK_SECRET  = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL         = process.env.APP_URL || 'http://localhost:3000';

// ── CREATE CHECKOUT SESSION ───────────────────────────────
// Redirects user to Stripe-hosted checkout page.
// On success, Stripe webhook upgrades the account.
router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const user = req.user;

    // Reuse existing Stripe customer or create new one
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      success_url: `${APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/#pricing`,
      subscription_data: {
        metadata: { user_id: user.id }
      },
      metadata: { user_id: user.id },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

// ── CUSTOMER PORTAL ───────────────────────────────────────
// Lets users manage billing, cancel, update card, etc.
router.post('/create-portal-session', requireAuth, async (req, res) => {
  try {
    const user = req.user;

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found.' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${APP_URL}/app`,
    });

    res.json({ url: portalSession.url });

  } catch (err) {
    console.error('Portal error:', err);
    res.status(500).json({ error: 'Failed to open billing portal.' });
  }
});

// ── STRIPE WEBHOOK ────────────────────────────────────────
// MUST use raw body — DO NOT add express.json() before this route
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`Stripe event: ${event.type}`);

    try {
      switch (event.type) {

        // ── Checkout completed — upgrade user ──
        case 'checkout.session.completed': {
          const session = event.data.object;
          if (session.mode !== 'subscription') break;

          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const userId = session.metadata?.user_id || subscription.metadata?.user_id;

          if (userId) {
            q.updateTierPro.run({
              id: userId,
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
            });
            console.log(`Upgraded user ${userId} to Pro`);
          }
          break;
        }

        // ── Subscription activated ──
        case 'customer.subscription.created':
        case 'invoice.payment_succeeded': {
          const obj = event.data.object;
          const subId = obj.subscription || obj.id;
          if (!subId) break;

          const user = q.getUserBySubscriptionId.get(subId);
          if (user) {
            q.updateSubscriptionStatus.run({
              status: 'active',
              tier: 'pro',
              stripe_subscription_id: subId
            });
          }
          break;
        }

        // ── Payment failed ──
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          const subId = invoice.subscription;
          if (!subId) break;

          q.updateSubscriptionStatus.run({
            status: 'past_due',
            tier: 'pro', // keep pro during grace period
            stripe_subscription_id: subId
          });
          console.log(`Payment failed for subscription ${subId}`);
          break;
        }

        // ── Subscription cancelled / expired ──
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          q.updateSubscriptionStatus.run({
            status: 'canceled',
            tier: 'free',
            stripe_subscription_id: sub.id
          });
          console.log(`Subscription ${sub.id} canceled — downgraded to free`);
          break;
        }

        // ── Subscription updated (e.g. plan change) ──
        case 'customer.subscription.updated': {
          const sub = event.data.object;
          const status = sub.status; // active | past_due | canceled | unpaid
          const tier = (status === 'active') ? 'pro' : 'free';
          q.updateSubscriptionStatus.run({
            status,
            tier,
            stripe_subscription_id: sub.id
          });
          break;
        }

        default:
          break;
      }

      res.json({ received: true });

    } catch (err) {
      console.error('Webhook handler error:', err);
      res.status(500).json({ error: 'Webhook processing failed.' });
    }
  }
);

// ── SUBSCRIPTION STATUS ───────────────────────────────────
router.get('/subscription', requireAuth, (req, res) => {
  const user = req.user;
  res.json({
    tier:                user.tier,
    subscription_status: user.subscription_status,
    has_subscription:    !!user.stripe_subscription_id
  });
});

module.exports = router;
