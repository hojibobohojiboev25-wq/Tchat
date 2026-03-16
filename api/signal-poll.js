const { cleanupOldData, ensureSchema, pool } = require("./_db");
const { asCleanString, getRequestId, logEvent, sendError, sendJson } = require("./_utils");

module.exports = async (req, res) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true }, requestId);
  }

  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed", requestId);
  }

  try {
    await ensureSchema();

    const callSessionId = asCleanString(req.query.callSessionId, { min: 8, max: 40 });
    const userId = asCleanString(req.query.userId, { min: 8, max: 64 });
    const afterId = Number(req.query.afterId || 0);
    const limit = Math.min(Number(req.query.limit || 50), 100);

    if (!callSessionId || !userId) {
      return sendError(res, 400, "callSessionId and userId are required", requestId);
    }

    const sessionResult = await pool.query(
      `
      SELECT id, caller_id, callee_id, status, ended_at, end_reason
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
    if (session.caller_id !== userId && session.callee_id !== userId) {
      return sendError(res, 403, "Forbidden for this call session", requestId);
    }

    const signalsResult = await pool.query(
      `
      SELECT id, from_user_id, to_user_id, type, payload, created_at
      FROM signals
      WHERE call_session_id = $1
        AND to_user_id = $2
        AND id > $3
      ORDER BY id ASC
      LIMIT $4
      `,
      [callSessionId, userId, afterId, limit]
    );

    if (Math.random() < 0.02) {
      await cleanupOldData();
    }

    return sendJson(
      res,
      200,
      {
        ok: true,
        retryAfterMs: 1200,
        callSession: {
          id: session.id,
          status: session.status,
          endedAt: session.ended_at,
          endReason: session.end_reason,
          callerId: session.caller_id,
          calleeId: session.callee_id
        },
        signals: signalsResult.rows
      },
      requestId
    );
  } catch (error) {
    logEvent("signal_poll_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to poll signals", requestId, { retryAfterMs: 2000 });
  }
};
