function sendJson(res, code, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(code).json(payload);
}

function randomRoomId() {
  return Math.random().toString(36).slice(2, 10);
}

module.exports = {
  sendJson,
  randomRoomId
};
