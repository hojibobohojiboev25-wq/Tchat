const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { Server } = require("socket.io");

const config = require("../../config/default");
const logger = require("./logger");
const db = require("./db");
const roomRoutes = require("./routes/rooms");
const registerSignaling = require("./socket/signaling");

async function bootstrap() {
  await db.initDb();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json());
  app.use(
    morgan("combined", {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, app: config.app.name, env: config.app.env });
  });
  app.get("/api/webrtc-config", (_req, res) => {
    res.json({ iceServers: config.webrtc.iceServers });
  });
  app.get("/api/runtime-config", (_req, res) => {
    res.json({
      apiBaseUrl: config.deployment.apiBaseUrl,
      signalingUrl: config.deployment.signalingUrl,
      iceServers: config.webrtc.iceServers
    });
  });
  app.use("/api/rooms", roomRoutes);

  app.use(express.static(path.join(__dirname, "..", "..", "client")));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "..", "client", "index.html"));
  });

  app.use((error, _req, res, _next) => {
    logger.error("Unhandled error", { message: error.message, stack: error.stack });
    res.status(500).json({ error: "Internal server error" });
  });

  registerSignaling(io);

  server.listen(config.app.port, "0.0.0.0", () => {
    logger.info("Tchat server started", { port: config.app.port, env: config.app.env });
  });
}

bootstrap().catch((error) => {
  logger.error("Failed to start server", { message: error.message, stack: error.stack });
  process.exit(1);
});
