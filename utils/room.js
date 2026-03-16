const { randomUUID } = require("crypto");

function createRoomId() {
  return randomUUID().split("-")[0];
}

module.exports = {
  createRoomId
};
