const { cleanupOldData, ensureSchema, pool } = require("./_db");
const { asCleanString, getRequestId, logEvent, parseBody, randomId, sendError, sendJson } = require("./_utils");

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
    const callSessionId = asCleanString(body.callSessionId, { min: 8, max: 40 });
    const fromUserId = asCleanString(body.fromUserId, { min: 8, max: 64 });
    const toUserId = asCleanString(body.toUserId, { min: 8, max: 64 });
    const type = asCleanString(body.type, { min: 3, max: 20 });
    const idempotencyKey = asCleanString(body.idempotencyKey || "", { min: 0, max: 80 }) || `sig_${randomId(20)}`;
    const payload = body.payload;

    if (!callSessionId || !fromUserId || !toUserId || !type || typeof payload === "undefined") {
      return sendError(
        res,
        400,
        "callSessionId, fromUserId, toUserId, type and payload are required",
        requestId
      );
    }

    if (!["offer", "answer", "ice", "hangup"].includes(type)) {
      return sendError(res, 400, "Unsupported signal type", requestId);
    }

    const sessionResult = await pool.query(
      `
      SELECT id, caller_id, callee_id, status
      FROM call_sessions
      WHERE id = $1
      LIMIT 1
      `,
      [callSessionId]
    );
    const session = sessionResult.rows[0];
    if (!session) {
      return sendError(res, 404, "Call session not found", requestId);
    }
    if (session.status !== "active") {
      return sendError(res, 409, "Call session is not active", requestId);
    }
    const memberIds = [session.caller_id, session.callee_id];
    if (!memberIds.includes(fromUserId) || !memberIds.includes(toUserId) || fromUserId === toUserId) {
      return sendError(res, 403, "Signal participants are invalid for this call", requestId);
    }

    await pool.query(
      `
      INSERT INTO signals (call_session_id, from_user_id, to_user_id, type, payload, idempotency_key)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [callSessionId, fromUserId, toUserId, type, JSON.stringify(payload), idempotencyKey]
    );

    if (Math.random() < 0.02) {
      await cleanupOldData();
    }

    logEvent("signal_send", { requestId, callSessionId, fromUserId, toUserId, type });
    return sendJson(res, 200, { ok: true, idempotencyKey }, requestId);
  } catch (error) {
    logEvent("signal_send_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to send signal", requestId);
  }
};
