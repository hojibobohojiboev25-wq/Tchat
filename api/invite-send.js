const { ensureSchema, pool } = require("./_db");
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
    const fromUserId = asCleanString(body.fromUserId, { min: 8, max: 64 });
    const toUserId = asCleanString(body.toUserId, { min: 8, max: 64 });

    if (!fromUserId || !toUserId) {
      return sendError(res, 400, "fromUserId and toUserId are required", requestId);
    }
    if (fromUserId === toUserId) {
      return sendError(res, 400, "You cannot invite yourself", requestId);
    }

    const users = await pool.query("SELECT id FROM users WHERE id = ANY($1::text[])", [[fromUserId, toUserId]]);
    if (users.rows.length !== 2) {
      return sendError(res, 404, "User not found", requestId);
    }

    const activeCall = await pool.query(
      `
      SELECT id
      FROM call_sessions
      WHERE status = 'active'
        AND (caller_id = $1 OR callee_id = $1 OR caller_id = $2 OR callee_id = $2)
      LIMIT 1
      `,
      [fromUserId, toUserId]
    );
    if (activeCall.rows[0]) {
      return sendError(res, 409, "One of users is already in active call", requestId);
    }

    const pending = await pool.query(
      `
      SELECT id
      FROM invitations
      WHERE status = 'pending'
        AND (
          (from_user_id = $1 AND to_user_id = $2)
          OR (from_user_id = $2 AND to_user_id = $1)
        )
      LIMIT 1
      `,
      [fromUserId, toUserId]
    );
    if (pending.rows[0]) {
      return sendError(res, 409, "Invitation already pending", requestId, { invitationId: pending.rows[0].id });
    }

    const recentBySender = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM invitations
      WHERE from_user_id = $1
        AND created_at > NOW() - INTERVAL '20 seconds'
      `,
      [fromUserId]
    );
    if (recentBySender.rows[0].count > 4) {
      return sendError(res, 429, "Too many invites, wait a few seconds", requestId);
    }

    const invitationId = `inv_${randomId(16)}`;
    await pool.query(
      `
      INSERT INTO invitations (id, from_user_id, to_user_id, status, created_at, updated_at)
      VALUES ($1, $2, $3, 'pending', NOW(), NOW())
      `,
      [invitationId, fromUserId, toUserId]
    );

    logEvent("invite_send", { requestId, invitationId, fromUserId, toUserId });
    return sendJson(res, 201, { ok: true, invitationId, status: "pending" }, requestId);
  } catch (error) {
    logEvent("invite_send_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to send invitation", requestId);
  }
};
