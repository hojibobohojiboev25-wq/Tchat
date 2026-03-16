const config = require("../../../config/default");
const db = require("../db");
const { createRoomId } = require("../../../utils/room");

const rooms = new Map();

function getRoomParticipants(roomId) {
  return rooms.get(roomId) || new Set();
}

function getRoomSize(roomId) {
  return getRoomParticipants(roomId).size;
}

function listRoomParticipants(roomId) {
  return Array.from(getRoomParticipants(roomId));
}

async function createRoom() {
  const roomId = createRoomId();
  rooms.set(roomId, new Set());
  await db.createRoom(roomId);
  return roomId;
}

async function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    const existing = await db.getRoom(roomId);
    if (!existing) {
      await db.createRoom(roomId);
    }
    rooms.set(roomId, new Set());
  }
}

async function addParticipant(roomId, socketId) {
  await ensureRoom(roomId);
  const participants = rooms.get(roomId);

  if (participants.size >= config.room.maxParticipants) {
    return { ok: false, reason: "room-full" };
  }

  participants.add(socketId);
  await db.markSessionJoin(roomId, socketId);
  return { ok: true };
}

async function removeParticipant(roomId, socketId) {
  const participants = rooms.get(roomId);
  if (!participants) {
    return;
  }

  participants.delete(socketId);
  await db.markSessionLeave(socketId);

  if (participants.size === 0) {
    rooms.delete(roomId);
  }
}

module.exports = {
  createRoom,
  addParticipant,
  removeParticipant,
  getRoomSize,
  listRoomParticipants
};
