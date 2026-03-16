const path = require("path");
require("dotenv").config();

const stunUrls = (process.env.STUN_URLS || "stun:stun.l.google.com:19302")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const rtcIceServers = [{ urls: stunUrls }];

if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
  rtcIceServers.push({
    urls: process.env.TURN_URL,
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL
  });
}

module.exports = {
  app: {
    name: "Tchat",
    env: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 3000)
  },
  log: {
    level: process.env.LOG_LEVEL || "info"
  },
  room: {
    maxParticipants: Number(process.env.MAX_ROOM_PARTICIPANTS || 2)
  },
  db: {
    databaseUrl: process.env.DATABASE_URL || "",
    sqlitePath: process.env.SQLITE_PATH || path.join(__dirname, "..", "server", "data", "tchat.sqlite")
  },
  deployment: {
    apiBaseUrl: process.env.API_BASE_URL || "",
    signalingUrl: process.env.SIGNALING_URL || ""
  },
  webrtc: {
    iceServers: rtcIceServers
  }
};
