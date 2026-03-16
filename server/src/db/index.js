const fs = require("fs");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const { Pool } = require("pg");
const config = require("../../../config/default");
const logger = require("../logger");

let dbType = "sqlite";
let sqliteDb = null;
let pgPool = null;

async function initDb() {
  if (config.db.databaseUrl) {
    dbType = "postgres";
    pgPool = new Pool({
      connectionString: config.db.databaseUrl,
      ssl: { rejectUnauthorized: false }
    });

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        socket_id TEXT NOT NULL,
        joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
        left_at TIMESTAMP
      );
    `);

    logger.info("PostgreSQL database initialized");
    return;
  }

  const targetDir = path.dirname(config.db.sqlitePath);
  fs.mkdirSync(targetDir, { recursive: true });

  sqliteDb = await open({
    filename: config.db.sqlitePath,
    driver: sqlite3.Database
  });

  await sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      socket_id TEXT NOT NULL,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      left_at TEXT
    );
  `);

  logger.info("SQLite database initialized", { file: config.db.sqlitePath });
}

async function createRoom(roomId) {
  if (dbType === "postgres") {
    await pgPool.query("INSERT INTO rooms (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [roomId]);
    return;
  }

  await sqliteDb.run("INSERT OR IGNORE INTO rooms (id) VALUES (?)", roomId);
}

async function getRoom(roomId) {
  if (dbType === "postgres") {
    const result = await pgPool.query("SELECT id, created_at FROM rooms WHERE id = $1 LIMIT 1", [roomId]);
    return result.rows[0] || null;
  }

  return sqliteDb.get("SELECT id, created_at FROM rooms WHERE id = ? LIMIT 1", roomId);
}

async function markSessionJoin(roomId, socketId) {
  if (dbType === "postgres") {
    await pgPool.query("INSERT INTO sessions (room_id, socket_id) VALUES ($1, $2)", [roomId, socketId]);
    return;
  }

  await sqliteDb.run("INSERT INTO sessions (room_id, socket_id) VALUES (?, ?)", [roomId, socketId]);
}

async function markSessionLeave(socketId) {
  if (dbType === "postgres") {
    await pgPool.query("UPDATE sessions SET left_at = NOW() WHERE socket_id = $1 AND left_at IS NULL", [socketId]);
    return;
  }

  await sqliteDb.run(
    "UPDATE sessions SET left_at = datetime('now') WHERE socket_id = ? AND left_at IS NULL",
    socketId
  );
}

module.exports = {
  initDb,
  createRoom,
  getRoom,
  markSessionJoin,
  markSessionLeave
};
