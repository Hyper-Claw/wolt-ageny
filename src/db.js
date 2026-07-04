import Database from 'better-sqlite3';
import fs from 'node:fs';

fs.mkdirSync('data', { recursive: true });
const db = new Database('data/tipfall.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS donations (
    txid       TEXT PRIMARY KEY,
    chain      TEXT NOT NULL,
    sender     TEXT,
    amount     TEXT NOT NULL,      -- base units (wei / lamports) as string
    name       TEXT,
    message    TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pending (
    id         TEXT PRIMARY KEY,
    chain      TEXT NOT NULL,
    expected   TEXT NOT NULL,      -- exact base-unit amount that identifies this donor
    name       TEXT,
    message    TEXT,
    status     TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | expired
    txid       TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS state (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

export const getState = (key) =>
  db.prepare('SELECT value FROM state WHERE key = ?').get(key)?.value ?? null;

export const setState = (key, value) =>
  db.prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));

export const donationSeen = (txid) =>
  !!db.prepare('SELECT 1 FROM donations WHERE txid = ?').get(txid);

export const recordDonation = (d) =>
  db.prepare(`INSERT OR IGNORE INTO donations (txid, chain, sender, amount, name, message, created_at)
              VALUES (@txid, @chain, @sender, @amount, @name, @message, @created_at)`).run(d);

export const createPending = (p) =>
  db.prepare(`INSERT INTO pending (id, chain, expected, name, message, created_at)
              VALUES (@id, @chain, @expected, @name, @message, @created_at)`).run(p);

export const getPending = (id) =>
  db.prepare('SELECT * FROM pending WHERE id = ?').get(id);

export const matchPending = (chain, expected, ttlMs) =>
  db.prepare(`SELECT * FROM pending
              WHERE chain = ? AND expected = ? AND status = 'pending' AND created_at > ?
              ORDER BY created_at DESC LIMIT 1`)
    .get(chain, expected, Date.now() - ttlMs);

export const expectedInUse = (chain, expected, ttlMs) =>
  !!db.prepare(`SELECT 1 FROM pending
                WHERE chain = ? AND expected = ? AND status = 'pending' AND created_at > ?`)
      .get(chain, expected, Date.now() - ttlMs);

export const markPaid = (id, txid) =>
  db.prepare(`UPDATE pending SET status = 'paid', txid = ? WHERE id = ?`).run(txid, id);

export default db;
