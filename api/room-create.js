const { initSchema, pool } = require("./_db");
const { sendJson, randomRoomId } = require("./_utils");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    await initSchema();
    const roomId = randomRoomId();
    await pool.query("INSERT INTO rooms (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [roomId]);
    return sendJson(res, 201, { roomId });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
