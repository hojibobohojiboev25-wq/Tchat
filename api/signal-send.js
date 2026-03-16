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
    const { roomId, fromPeerId, toPeerId, type, payload } = body;
    if (!roomId || !fromPeerId || !toPeerId || !type || typeof payload === "undefined") {
      return sendJson(res, 400, { error: "roomId, fromPeerId, toPeerId, type and payload are required" });
    }

    await pool.query(
      `
      INSERT INTO signals (room_id, from_peer_id, to_peer_id, type, payload)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [roomId, fromPeerId, toPeerId, type, JSON.stringify(payload)]
    );

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
