const { ensureSchema, pool, withTransaction } = require("./_db");
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
    const callSessionId = asCleanString(body.callSessionId, { min: 8, max: 40 });
    const userId = asCleanString(body.userId, { min: 8, max: 64 });
    const reason = asCleanString(body.reason || "hangup", { min: 3, max: 40 }) || "hangup";
    if (!callSessionId || !userId) {
      return sendError(res, 400, "callSessionId and userId are required", requestId);
    }

    const endedSession = await withTransaction(async (client) => {
      const callResult = await client.query("SELECT * FROM call_sessions WHERE id = $1 FOR UPDATE", [callSessionId]);
      const call = callResult.rows[0];
      if (!call) {
        throw new Error("NOT_FOUND");
      }
      if (call.caller_id !== userId && call.callee_id !== userId) {
        throw new Error("FORBIDDEN");
      }

      if (call.status === "ended") {
        return call;
      }

      const updated = await client.query(
        `
        UPDATE call_sessions
        SET status = 'ended', ended_at = NOW(), ended_by = $2, end_reason = $3
        WHERE id = $1
        RETURNING *
        `,
        [callSessionId, userId, reason]
      );
      return updated.rows[0];
    });

    await pool.query("DELETE FROM signals WHERE call_session_id = $1", [callSessionId]);

    return sendJson(
      res,
      200,
      {
        ok: true,
        callSession: {
          id: endedSession.id,
          status: endedSession.status,
          endedAt: endedSession.ended_at,
          endedBy: endedSession.ended_by,
          reason: endedSession.end_reason
        }
      },
      requestId
    );
  } catch (error) {
    if (error.message === "NOT_FOUND") {
      return sendError(res, 404, "Call session not found", requestId);
    }
    if (error.message === "FORBIDDEN") {
      return sendError(res, 403, "Forbidden", requestId);
    }
    logEvent("call_end_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to end call", requestId);
  }
};
