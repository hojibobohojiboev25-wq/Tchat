const { ensureSchema, pool } = require("./_db");
const { sendJson } = require("./_utils");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    await ensureSchema();
    await pool.query("SELECT 1");
    return sendJson(res, 200, { ok: true, service: "tchat-vercel-api" });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
};
