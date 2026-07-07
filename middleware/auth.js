// middleware/auth.js
const { q } = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = q.getUserById.get(req.session.userId);
  if (!user) {
    req.session.destroy();
    return res.status(401).json({ error: 'Session invalid' });
  }
  req.user = user;
  next();
}

function requirePro(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.tier !== 'pro' || req.user.subscription_status !== 'active') {
      return res.status(403).json({ error: 'Pro subscription required', upgrade: true });
    }
    next();
  });
}

// Check and reset monthly generation count
function checkGenerationLimit(req, res, next) {
  requireAuth(req, res, () => {
    const user = req.user;

    // Pro users: unlimited
    if (user.tier === 'pro' && user.subscription_status === 'active') {
      return next();
    }

    // Free users: 5/month
    const FREE_LIMIT = 5;
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    // Reset count if new month
    if (user.gen_reset_month !== currentMonth) {
      q.resetGenCount.run({ month: currentMonth, id: user.id });
      user.gen_count = 0;
    }

    if (user.gen_count >= FREE_LIMIT) {
      return res.status(403).json({
        error: `Free limit reached (${FREE_LIMIT}/month). Upgrade to Pro for unlimited.`,
        upgrade: true,
        gen_count: user.gen_count,
        gen_limit: FREE_LIMIT
      });
    }

    next();
  });
}

module.exports = { requireAuth, requirePro, checkGenerationLimit };
