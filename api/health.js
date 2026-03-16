const { ensureSchema, pool } = require("./_db");
const { getRequestId, logEvent, sendError, sendJson } = require("./_utils");

module.exports = async (req, res) => {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed", requestId);
  }

  try {
    await ensureSchema();
    const db = await pool.query("SELECT NOW() AS now");
    return sendJson(
      res,
      200,
      {
        ok: true,
        service: "tchat-vercel-api",
        dbTime: db.rows[0].now,
        requestId
      },
      requestId
    );
  } catch (error) {
    logEvent("health_error", { requestId, message: error.message });
    return sendError(res, 500, "Healthcheck failed", requestId);
  }
};
