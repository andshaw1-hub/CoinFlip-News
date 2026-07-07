// routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { q }   = require('../db');

const router = express.Router();

// ── REGISTER ──────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const existing = q.getUserByEmail.get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const currentMonth = new Date().toISOString().slice(0, 7);

    q.createUser.run({
      id,
      email: email.toLowerCase(),
      password_hash,
      tier: 'free',
      gen_reset_month: currentMonth
    });

    const user = q.getUserById.get(id);
    req.session.userId = id;

    res.json({
      user: safeUser(user),
      message: 'Account created successfully.'
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── LOGIN ─────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = q.getUserByEmail.get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.userId = user.id;

    res.json({
      user: safeUser(user),
      message: 'Signed in successfully.'
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── LOGOUT ────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed.' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Signed out successfully.' });
  });
});

// ── SESSION CHECK ─────────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = q.getUserById.get(req.session.userId);
  if (!user) {
    req.session.destroy();
    return res.json({ user: null });
  }

  // Check/reset monthly count
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (user.gen_reset_month !== currentMonth) {
    q.resetGenCount.run({ month: currentMonth, id: user.id });
    user.gen_count = 0;
  }

  res.json({ user: safeUser(user) });
});

// Strip sensitive fields before sending to client
function safeUser(user) {
  const { password_hash, stripe_customer_id, ...safe } = user;
  return safe;
}

module.exports = router;
