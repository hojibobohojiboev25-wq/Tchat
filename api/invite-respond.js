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
    const decision = asCleanString(body.decision, { min: 6, max: 8 });

    if (!invitationId || !userId || !["accept", "decline"].includes(decision)) {
      return sendError(res, 400, "invitationId, userId and valid decision are required", requestId);
    }

    const result = await withTransaction(async (client) => {
      const invitationResult = await client.query(
        `
        SELECT *
        FROM invitations
        WHERE id = $1
        FOR UPDATE
        `,
        [invitationId]
      );

      const invitation = invitationResult.rows[0];
      if (!invitation) {
        throw new Error("NOT_FOUND");
      }
      if (invitation.to_user_id !== userId) {
        throw new Error("FORBIDDEN");
      }
      if (invitation.status !== "pending") {
        const existingCall = await client.query(
          "SELECT id, status, caller_id, callee_id FROM call_sessions WHERE invitation_id = $1 LIMIT 1",
          [invitationId]
        );
        return {
          invitation,
          status: invitation.status,
          callSession: existingCall.rows[0] || null
        };
      }

      const nextStatus = decision === "accept" ? "accepted" : "declined";
      await client.query(
        `
        UPDATE invitations
        SET status = $2, responded_at = NOW(), updated_at = NOW()
        WHERE id = $1
        `,
        [invitationId, nextStatus]
      );

      if (nextStatus === "declined") {
        return { invitation, status: nextStatus, callSession: null };
      }

      const callSessionId = `call_${randomId(16)}`;
      await client.query(
        `
        INSERT INTO call_sessions (id, invitation_id, caller_id, callee_id, status, started_at)
        VALUES ($1, $2, $3, $4, 'active', NOW())
        `,
        [callSessionId, invitationId, invitation.from_user_id, invitation.to_user_id]
      );

      return {
        invitation,
        status: nextStatus,
        callSession: {
          id: callSessionId,
          status: "active",
          caller_id: invitation.from_user_id,
          callee_id: invitation.to_user_id
        }
      };
    });

    logEvent("invite_respond", { requestId, invitationId, userId, decision, status: result.status });
    return sendJson(
      res,
      200,
      {
        ok: true,
        invitationId,
        status: result.status,
        callSession: result.callSession
      },
      requestId
    );
  } catch (error) {
    if (error.message === "NOT_FOUND") {
      return sendError(res, 404, "Invitation not found", requestId);
    }
    if (error.message === "FORBIDDEN") {
      return sendError(res, 403, "You cannot respond to this invitation", requestId);
    }
    logEvent("invite_respond_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to respond invitation", requestId);
  }
};
