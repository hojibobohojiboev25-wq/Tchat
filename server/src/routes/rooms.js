const express = require("express");
const roomService = require("../services/roomService");

const router = express.Router();

router.post("/", async (_req, res, next) => {
  try {
    const roomId = await roomService.createRoom();
    res.status(201).json({ roomId });
  } catch (error) {
    next(error);
  }
});

router.get("/:roomId", async (req, res, next) => {
  try {
    const participants = roomService.listRoomParticipants(req.params.roomId);
    res.json({
      roomId: req.params.roomId,
      participantsCount: participants.length
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
