const { Pool } = require("pg");

const globalForDb = globalThis;

if (!globalForDb.__tchatPool && process.env.DATABASE_URL) {
  globalForDb.__tchatPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

const pool = globalForDb.__tchatPool;
let schemaInitPromise = globalForDb.__tchatSchemaInitPromise || null;

async function initSchema() {
  if (!pool) {
    throw new Error("DATABASE_URL is required for Vercel backend");
  }
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

  await pool.query("CREATE INDEX IF NOT EXISTS idx_signals_room_to_id ON signals (room_id, to_peer_id, id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_room_peers_last_seen ON room_peers (room_id, last_seen)");
}

async function ensureSchema() {
  if (!schemaInitPromise) {
    schemaInitPromise = initSchema().catch((error) => {
      schemaInitPromise = null;
      throw error;
    });
    globalForDb.__tchatSchemaInitPromise = schemaInitPromise;
  }
  return schemaInitPromise;
}

async function cleanupOldData() {
  await ensureSchema();
  await pool.query("DELETE FROM signals WHERE created_at < NOW() - INTERVAL '10 minutes'");
  await pool.query("DELETE FROM room_peers WHERE last_seen < NOW() - INTERVAL '3 minutes'");
}

module.exports = {
  pool,
  ensureSchema,
  cleanupOldData
};
