const { ensureSchema, pool } = require("./_db");
const { asCleanString, getRequestId, logEvent, sendError, sendJson } = require("./_utils");

module.exports = async (req, res) => {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed", requestId);
  }

  try {
    await ensureSchema();
    const userId = asCleanString(req.query.userId, { min: 8, max: 64 });
    const afterIso = asCleanString(req.query.after || "", { min: 0, max: 40 });
    if (!userId) {
      return sendError(res, 400, "userId is required", requestId);
    }

    const pendingResult = await pool.query(
      `
      SELECT
        i.id,
        i.from_user_id,
        i.to_user_id,
        i.status,
        i.created_at,
        i.updated_at,
        from_user.display_name AS from_display_name,
        from_user.handle AS from_handle
      FROM invitations i
      JOIN users from_user ON from_user.id = i.from_user_id
      WHERE i.to_user_id = $1
        AND i.status = 'pending'
      ORDER BY i.created_at DESC
      LIMIT 50
      `,
      [userId]
    );

    const updatesResult = await pool.query(
      `
      SELECT
        i.id,
        i.from_user_id,
        i.to_user_id,
        i.status,
        i.created_at,
        i.updated_at
      FROM invitations i
      WHERE (i.from_user_id = $1 OR i.to_user_id = $1)
        AND i.updated_at > COALESCE(NULLIF($2, '')::timestamp, NOW() - INTERVAL '15 minutes')
      ORDER BY i.updated_at DESC
      LIMIT 100
      `,
      [userId, afterIso]
    );

    return sendJson(
      res,
      200,
      {
        ok: true,
        pending: pendingResult.rows,
        updates: updatesResult.rows
      },
      requestId
    );
  } catch (error) {
    logEvent("invite_inbox_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to fetch invitations", requestId);
  }
};
