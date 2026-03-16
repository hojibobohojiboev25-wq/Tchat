const { ensureSchema, pool } = require("./_db");
const { asCleanString, getRequestId, logEvent, parseBody, sendError, sendJson } = require("./_utils");

module.exports = async (req, res) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true }, requestId);
  }
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed", requestId);
  }

  try {
    await ensureSchema();
    const body = parseBody(req);
    const userId = asCleanString(body.userId, { min: 8, max: 64 });
    const status = asCleanString(body.status || "online", { min: 3, max: 20 }) || "online";
    const deviceInfo = body.deviceInfo && typeof body.deviceInfo === "object" ? body.deviceInfo : {};

    if (!userId) {
      return sendError(res, 400, "userId is required", requestId);
    }

    const userCheck = await pool.query("SELECT id FROM users WHERE id = $1 LIMIT 1", [userId]);
    if (!userCheck.rows[0]) {
      return sendError(res, 404, "Profile not found", requestId);
    }

    await pool.query(
      `
      INSERT INTO presence (user_id, status, device_info, last_seen, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET status = EXCLUDED.status,
                    device_info = EXCLUDED.device_info,
                    last_seen = NOW(),
                    updated_at = NOW()
      `,
      [userId, status, JSON.stringify(deviceInfo)]
    );

    return sendJson(res, 200, { ok: true, status }, requestId);
  } catch (error) {
    logEvent("presence_heartbeat_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to update presence", requestId);
  }
};
