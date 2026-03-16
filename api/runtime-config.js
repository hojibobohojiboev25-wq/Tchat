const parseIceServers = () => {
  const stunUrls = (process.env.STUN_URLS || "stun:stun.l.google.com:19302")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const iceServers = [{ urls: stunUrls }];

  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  return iceServers;
};

module.exports = (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    apiBaseUrl: process.env.API_BASE_URL || "",
    iceServers: parseIceServers()
  });
};
