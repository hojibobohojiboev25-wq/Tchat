const { ensureSchema, pool } = require("./_db");
const { asCleanString, getRequestId, logEvent, sendError, sendJson } = require("./_utils");

module.exports = async (req, res) => {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed", requestId);
  }

  try {
    await ensureSchema();
    const userId = asCleanString(req.query.userId || "", { min: 0, max: 64 });

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.handle,
        u.display_name,
        u.avatar_url,
        p.status,
        p.last_seen
      FROM presence p
      JOIN users u ON u.id = p.user_id
      WHERE p.last_seen > NOW() - INTERVAL '70 seconds'
        AND ($1 = '' OR u.id <> $1)
      ORDER BY p.last_seen DESC
      LIMIT 100
      `,
      [userId]
    );

    const users = result.rows.map((row) => ({
      id: row.id,
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      status: row.status,
      lastSeen: row.last_seen
    }));

    return sendJson(res, 200, { ok: true, users }, requestId);
  } catch (error) {
    logEvent("users_online_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to load online users", requestId);
  }
};
