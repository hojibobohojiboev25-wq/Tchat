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

    await pool.query("INSERT INTO rooms (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [roomId]);
    await pool.query("DELETE FROM room_peers WHERE room_id = $1 AND last_seen < NOW() - INTERVAL '90 seconds'", [roomId]);

    await pool.query(
      `
      INSERT INTO room_peers (room_id, peer_id, last_seen)
      VALUES ($1, $2, NOW())
      ON CONFLICT (room_id, peer_id) DO UPDATE SET last_seen = NOW()
      `,
      [roomId, peerId]
    );

    const participantsResult = await pool.query(
      `
      SELECT peer_id
      FROM room_peers
      WHERE room_id = $1 AND last_seen > NOW() - INTERVAL '90 seconds'
      ORDER BY last_seen DESC
      `,
      [roomId]
    );

    const peers = participantsResult.rows.map((row) => row.peer_id).filter((id) => id !== peerId);

    if (peers.length > 1) {
      return sendJson(res, 409, { error: "Room is full" });
    }

    return sendJson(res, 200, { peers });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
