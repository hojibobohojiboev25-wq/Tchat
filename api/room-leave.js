const { ensureSchema, pool } = require("./_db");
const { sendJson } = require("./_utils");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    await ensureSchema();
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { roomId, peerId } = body;
    if (!roomId || !peerId) {
      return sendJson(res, 400, { error: "roomId and peerId are required" });
    }

    await pool.query("DELETE FROM room_peers WHERE room_id = $1 AND peer_id = $2", [roomId, peerId]);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
