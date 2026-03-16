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
    if (!userId) {
      return sendError(res, 400, "userId is required", requestId);
    }

    const result = await pool.query(
      `
      SELECT id, handle, display_name, avatar_url, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      return sendError(res, 404, "Profile not found", requestId);
    }

    return sendJson(
      res,
      200,
      {
        ok: true,
        profile: {
          id: row.id,
          handle: row.handle,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      },
      requestId
    );
  } catch (error) {
    logEvent("profile_me_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to load profile", requestId);
  }
};
