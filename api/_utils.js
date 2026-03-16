const { randomUUID } = require("crypto");

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Request-Id");
}

function getRequestId(req) {
  return req.headers["x-request-id"] || randomUUID();
}

function sendJson(res, code, payload, requestId) {
  applyCors(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (requestId) {
    res.setHeader("X-Request-Id", requestId);
  }
  res.status(code).json(payload);
}

function sendError(res, code, message, requestId, extra = {}) {
  sendJson(
    res,
    code,
    {
      error: message,
      requestId,
      ...extra
    },
    requestId
  );
}

function randomId(length = 10) {
  return Math.random().toString(36).slice(2, 2 + length);
}

function parseBody(req) {
  if (!req?.body) {
    return {};
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch (_error) {
      return {};
    }
  }

  return req.body;
}

function asCleanString(value, { min = 0, max = 120 } = {}) {
  if (typeof value !== "string") {
    return "";
  }
  const clean = value.trim();
  if (clean.length < min || clean.length > max) {
    return "";
  }
  return clean;
}

function validateHandle(handle) {
  const clean = asCleanString(handle, { min: 3, max: 24 });
  if (!clean) {
    return "";
  }
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
    return "";
  }
  return clean.toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function logEvent(name, meta = {}) {
  const safeMeta = { ...meta };
  if (safeMeta.payload) {
    delete safeMeta.payload;
  }
  console.log(JSON.stringify({ ts: nowIso(), event: name, ...safeMeta }));
}

module.exports = {
  applyCors,
  getRequestId,
  sendJson,
  sendError,
  randomId,
  parseBody,
  asCleanString,
  validateHandle,
  logEvent
};
