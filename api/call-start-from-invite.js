const { ensureSchema, withTransaction } = require("./_db");
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
    const invitationId = asCleanString(body.invitationId, { min: 8, max: 40 });
    const userId = asCleanString(body.userId, { min: 8, max: 64 });

    if (!invitationId || !userId) {
      return sendError(res, 400, "invitationId and userId are required", requestId);
    }

    const session = await withTransaction(async (client) => {
      const invitationResult = await client.query(
        "SELECT * FROM invitations WHERE id = $1 FOR UPDATE",
        [invitationId]
      );
      const invitation = invitationResult.rows[0];
      if (!invitation) {
        throw new Error("NOT_FOUND");
      }
      if (invitation.from_user_id !== userId && invitation.to_user_id !== userId) {
        throw new Error("FORBIDDEN");
      }
      if (invitation.status !== "accepted") {
        throw new Error("INVITE_NOT_ACCEPTED");
      }

      const existing = await client.query("SELECT * FROM call_sessions WHERE invitation_id = $1 LIMIT 1", [invitationId]);
      if (existing.rows[0]) {
        return existing.rows[0];
      }

      const newId = `call_${randomId(16)}`;
      const inserted = await client.query(
        `
        INSERT INTO call_sessions (id, invitation_id, caller_id, callee_id, status, started_at)
        VALUES ($1, $2, $3, $4, 'active', NOW())
        RETURNING *
        `,
        [newId, invitation.id, invitation.from_user_id, invitation.to_user_id]
      );
      return inserted.rows[0];
    });

    return sendJson(
      res,
      200,
      {
        ok: true,
        callSession: {
          id: session.id,
          invitationId: session.invitation_id,
          callerId: session.caller_id,
          calleeId: session.callee_id,
          status: session.status
        }
      },
      requestId
    );
  } catch (error) {
    if (error.message === "NOT_FOUND") {
      return sendError(res, 404, "Invitation not found", requestId);
    }
    if (error.message === "FORBIDDEN") {
      return sendError(res, 403, "Forbidden", requestId);
    }
    if (error.message === "INVITE_NOT_ACCEPTED") {
      return sendError(res, 409, "Invitation is not accepted", requestId);
    }
    logEvent("call_start_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to start call", requestId);
  }
};
