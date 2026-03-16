const { ensureSchema, pool } = require("./_db");
const { asCleanString, getRequestId, logEvent, parseBody, sendError, sendJson, validateHandle } = require("./_utils");

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
    const id = asCleanString(body.userId, { min: 8, max: 64 });
    const handle = validateHandle(body.handle);
    const displayName = asCleanString(body.displayName, { min: 2, max: 40 });
    const avatarUrl = asCleanString(body.avatarUrl || "", { min: 0, max: 300 });

    if (!id || !handle || !displayName) {
      return sendError(res, 400, "userId, handle and displayName are required", requestId);
    }

    const existingByHandle = await pool.query("SELECT id FROM users WHERE handle = $1 LIMIT 1", [handle]);
    if (existingByHandle.rows[0] && existingByHandle.rows[0].id !== id) {
      return sendError(res, 409, "Handle already in use", requestId);
    }

    await pool.query(
      `
      INSERT INTO users (id, handle, display_name, avatar_url, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (id)
      DO UPDATE SET handle = EXCLUDED.handle,
                    display_name = EXCLUDED.display_name,
                    avatar_url = EXCLUDED.avatar_url,
                    updated_at = NOW()
      `,
      [id, handle, displayName, avatarUrl || null]
    );

    logEvent("profile_upsert", { requestId, userId: id, handle });
    return sendJson(
      res,
      200,
      {
        ok: true,
        profile: {
          id,
          handle,
          displayName,
          avatarUrl: avatarUrl || null
        }
      },
      requestId
    );
  } catch (error) {
    logEvent("profile_upsert_error", { requestId, message: error.message });
    return sendError(res, 500, "Failed to save profile", requestId);
  }
};
