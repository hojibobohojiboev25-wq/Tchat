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
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      handle TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS presence (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'online',
      device_info JSONB,
      last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMP,
      CHECK (from_user_id <> to_user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_sessions (
      id TEXT PRIMARY KEY,
      invitation_id TEXT REFERENCES invitations(id) ON DELETE SET NULL,
      caller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      callee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMP,
      ended_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      end_reason TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS signals (
      id BIGSERIAL PRIMARY KEY,
      call_session_id TEXT NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
      from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload JSONB NOT NULL,
      idempotency_key TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence (last_seen)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_invitations_to_status ON invitations (to_user_id, status, updated_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_invitations_from_status ON invitations (from_user_id, status, updated_at DESC)");
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_call_sessions_active_users ON call_sessions (status, caller_id, callee_id, started_at DESC)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_signals_session_to_id ON signals (call_session_id, to_user_id, id)"
  );
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_idempotency ON signals (idempotency_key)");
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
  await pool.query("DELETE FROM signals WHERE created_at < NOW() - INTERVAL '20 minutes'");
  await pool.query("DELETE FROM presence WHERE last_seen < NOW() - INTERVAL '5 minutes'");
  await pool.query(
    "UPDATE call_sessions SET status = 'ended', ended_at = NOW(), end_reason = 'timeout' WHERE status = 'active' AND started_at < NOW() - INTERVAL '8 hours'"
  );
}

async function withTransaction(run) {
  if (!pool) {
    throw new Error("DATABASE_URL is required for Vercel backend");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  ensureSchema,
  cleanupOldData,
  withTransaction
};
