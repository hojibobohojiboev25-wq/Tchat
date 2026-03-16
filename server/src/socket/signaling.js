const roomService = require("../services/roomService");
const logger = require("../logger");

function registerSignaling(io) {
  io.on("connection", (socket) => {
    logger.info("Socket connected", { socketId: socket.id });

    socket.on("join-room", async ({ roomId }) => {
      if (!roomId) {
        socket.emit("room-error", { message: "roomId is required" });
        return;
      }

      const result = await roomService.addParticipant(roomId, socket.id);

      if (!result.ok) {
        socket.emit("room-error", { message: "Room is full" });
        return;
      }

      socket.join(roomId);
      socket.data.roomId = roomId;

      const participants = roomService.listRoomParticipants(roomId).filter((id) => id !== socket.id);
      // New peer receives existing peers to initiate direct WebRTC negotiation.
      socket.emit("peers-in-room", { peers: participants });
      socket.to(roomId).emit("peer-joined", { peerId: socket.id });
      logger.info("Peer joined room", { roomId, socketId: socket.id, roomSize: roomService.getRoomSize(roomId) });
    });

    socket.on("webrtc-offer", ({ roomId, targetPeerId, offer }) => {
      io.to(targetPeerId).emit("webrtc-offer", {
        roomId,
        fromPeerId: socket.id,
        offer
      });
    });

    socket.on("webrtc-answer", ({ roomId, targetPeerId, answer }) => {
      io.to(targetPeerId).emit("webrtc-answer", {
        roomId,
        fromPeerId: socket.id,
        answer
      });
    });

    socket.on("webrtc-ice-candidate", ({ roomId, targetPeerId, candidate }) => {
      io.to(targetPeerId).emit("webrtc-ice-candidate", {
        roomId,
        fromPeerId: socket.id,
        candidate
      });
    });

    socket.on("media-toggled", ({ roomId, kind, enabled }) => {
      socket.to(roomId).emit("peer-media-toggled", { peerId: socket.id, kind, enabled });
    });

    socket.on("disconnect", async () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        await roomService.removeParticipant(roomId, socket.id);
        socket.to(roomId).emit("peer-left", { peerId: socket.id });
        logger.info("Peer left room", { roomId, socketId: socket.id, roomSize: roomService.getRoomSize(roomId) });
      }
      logger.info("Socket disconnected", { socketId: socket.id });
    });
  });
}

module.exports = registerSignaling;
