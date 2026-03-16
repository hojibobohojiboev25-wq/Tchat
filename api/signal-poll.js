const { cleanupOldData, ensureSchema, pool } = require("./_db");
const { sendJson } = require("./_utils");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    await ensureSchema();

    const roomId = String(req.query.roomId || "");
    const peerId = String(req.query.peerId || "");
    const afterId = Number(req.query.afterId || 0);

    if (!roomId || !peerId) {
      return sendJson(res, 400, { error: "roomId and peerId are required" });
    }

    await pool.query(
      `
      INSERT INTO room_peers (room_id, peer_id, last_seen)
      VALUES ($1, $2, NOW())
      ON CONFLICT (room_id, peer_id) DO UPDATE SET last_seen = NOW()
      `,
      [roomId, peerId]
    );

    const signalsResult = await pool.query(
      `
      SELECT id, from_peer_id, to_peer_id, type, payload, created_at
      FROM signals
      WHERE room_id = $1
        AND to_peer_id = $2
        AND id > $3
      ORDER BY id ASC
      LIMIT 100
      `,
      [roomId, peerId, afterId]
    );

    const peerCountResult = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM room_peers
      WHERE room_id = $1
        AND last_seen > NOW() - INTERVAL '90 seconds'
      `,
      [roomId]
    );

    const peerLeft = peerCountResult.rows[0].count <= 1;
    if (Math.random() < 0.02) {
      await cleanupOldData();
    }
    return sendJson(res, 200, { signals: signalsResult.rows, peerLeft });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
