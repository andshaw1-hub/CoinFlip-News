// server.js — Coin Flip main server
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── WEBHOOK ROUTE (raw body — must come BEFORE json middleware) ──────
const stripeRouter = require('./routes/stripe');
app.use('/api/stripe/webhook', stripeRouter);

// ── MIDDLEWARE ────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ── API ROUTES ────────────────────────────────────────────────────────
const authRouter    = require('./routes/auth');
const storiesRouter = require('./routes/stories');

app.use('/api/auth',    authRouter);
app.use('/api/stripe',  stripeRouter);
app.use('/api/stories', storiesRouter);

// Config endpoint — sends public keys to frontend safely
app.get('/api/config', (req, res) => {
  res.json({
    stripe_pk:       process.env.STRIPE_PUBLISHABLE_KEY,
    adsense_pub:     process.env.ADSENSE_PUBLISHER_ID,
    adsense_slots: {
      leaderboard:   process.env.ADSENSE_SLOT_LEADERBOARD,
      rectangle:     process.env.ADSENSE_SLOT_RECTANGLE,
      banner_top:    process.env.ADSENSE_SLOT_BANNER_TOP,
      banner_mid:    process.env.ADSENSE_SLOT_BANNER_MID,
    }
  });
});

// ── CATCH-ALL (SPA) ───────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   COIN FLIP  —  Running on :${PORT}       ║
╠════════════════════════════════════════╣
║  Local:  http://localhost:${PORT}          ║
╚════════════════════════════════════════╝
  `);
});

module.exports = app;
