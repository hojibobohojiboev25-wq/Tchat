const { URL } = require("url");

const routes = {
  "/api/health": require("./health"),
  "/api/runtime-config": require("./runtime-config"),
  "/api/profile/create-or-update": require("./profile-create-or-update"),
  "/api/profile/me": require("./profile-me"),
  "/api/presence/heartbeat": require("./presence-heartbeat"),
  "/api/users/online": require("./users-online"),
  "/api/invite/send": require("./invite-send"),
  "/api/invite/respond": require("./invite-respond"),
  "/api/invite/inbox": require("./invite-inbox"),
  "/api/call/start-from-invite": require("./call-start-from-invite"),
  "/api/call/end": require("./call-end"),
  "/api/signal/send": require("./signal-send"),
  "/api/signal/poll": require("./signal-poll"),
  "/api/room-create": require("./room-create"),
  "/api/room-join": require("./room-join"),
  "/api/room-leave": require("./room-leave")
};

module.exports = async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let routePath = reqUrl.pathname;
    const rewrittenPath = reqUrl.searchParams.get("path");
    if ((routePath === "/api/index.js" || routePath === "/api/index") && rewrittenPath) {
      routePath = rewrittenPath.startsWith("/") ? rewrittenPath : `/${rewrittenPath}`;
    }

    if (["POST", "PUT", "PATCH"].includes(req.method) && typeof req.body === "undefined") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        req.body = {};
      } else {
        try {
          req.body = JSON.parse(raw);
        } catch (_error) {
          req.body = {};
        }
      }
    }

    const handler = routes[routePath];
    if (!handler) {
      res.status(404).json({ error: "API route not found", routePath });
      return;
    }
    await handler(req, res);
  } catch (_error) {
    res.status(500).json({ error: "Internal API router error" });
  }
};
