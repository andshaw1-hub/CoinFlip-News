// db.js — SQLite database layer for Food Tracker Pro
// Exposes a `q` object of prepared statements used across the app.
const path     = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                     TEXT PRIMARY KEY,
    email                  TEXT UNIQUE NOT NULL,
    password_hash          TEXT NOT NULL,
    tier                   TEXT NOT NULL DEFAULT 'free',
    subscription_status    TEXT,
    stripe_customer_id     TEXT,
    stripe_subscription_id TEXT,
    gen_count              INTEGER NOT NULL DEFAULT 0,
    gen_reset_month        TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stories (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    topic      TEXT,
    tone       TEXT,
    headline   TEXT,
    payload    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_stories_user   ON stories(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_users_sub       ON users(stripe_subscription_id);
`);

// Number of stories retained per user (older ones are pruned after each save).
const STORY_RETENTION = 50;

// ── PREPARED STATEMENTS ───────────────────────────────────────────────
const q = {
  // Users
  getUserById:  db.prepare(`SELECT * FROM users WHERE id = ?`),
  getUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  getUserBySubscriptionId: db.prepare(`SELECT * FROM users WHERE stripe_subscription_id = ?`),

  createUser: db.prepare(`
    INSERT INTO users (id, email, password_hash, tier, gen_reset_month)
    VALUES (@id, @email, @password_hash, @tier, @gen_reset_month)
  `),

  resetGenCount: db.prepare(`
    UPDATE users SET gen_count = 0, gen_reset_month = @month WHERE id = @id
  `),

  incrementGenCount: db.prepare(`
    UPDATE users SET gen_count = gen_count + 1, gen_reset_month = @month WHERE id = @id
  `),

  updateTierPro: db.prepare(`
    UPDATE users
       SET tier = 'pro',
           subscription_status = 'active',
           stripe_customer_id = @stripe_customer_id,
           stripe_subscription_id = @stripe_subscription_id
     WHERE id = @id
  `),

  updateSubscriptionStatus: db.prepare(`
    UPDATE users
       SET subscription_status = @status,
           tier = @tier
     WHERE stripe_subscription_id = @stripe_subscription_id
  `),

  // Stories
  saveStory: db.prepare(`
    INSERT INTO stories (id, user_id, topic, tone, headline, payload)
    VALUES (@id, @user_id, @topic, @tone, @headline, @payload)
  `),

  getStories: db.prepare(`
    SELECT id, topic, tone, headline, created_at
      FROM stories
     WHERE user_id = ?
     ORDER BY created_at DESC
  `),

  getStory: db.prepare(`
    SELECT * FROM stories WHERE id = ? AND user_id = ?
  `),

  // Keep only the most recent STORY_RETENTION stories for a user.
  deleteOldStories: db.prepare(`
    DELETE FROM stories
     WHERE user_id = ?
       AND id NOT IN (
         SELECT id FROM stories
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ${STORY_RETENTION}
       )
  `),
};

module.exports = { db, q };
