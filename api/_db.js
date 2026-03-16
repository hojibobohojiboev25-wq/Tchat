const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Vercel backend");
}

const globalForDb = globalThis;

if (!globalForDb.__tchatPool) {
  globalForDb.__tchatPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

const pool = globalForDb.__tchatPool;

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS room_peers (
      room_id TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (room_id, peer_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS signals (
      id BIGSERIAL PRIMARY KEY,
      room_id TEXT NOT NULL,
      from_peer_id TEXT NOT NULL,
      to_peer_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

module.exports = {
  pool,
  initSchema
};
