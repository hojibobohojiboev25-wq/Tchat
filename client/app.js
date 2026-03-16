const localVideoEl = document.getElementById("localVideo");
const remoteVideoEl = document.getElementById("remoteVideo");
const remoteStatusEl = document.getElementById("remoteStatus");
const statusEl = document.getElementById("status");
const roomIdInput = document.getElementById("roomIdInput");
const roomHintEl = document.getElementById("roomHint");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const toggleCameraBtn = document.getElementById("toggleCameraBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let socket = null;
let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
let apiBaseUrl = "";
let signalingUrl = "";
let currentRoomId = "";
let peerSocketId = "";
let cameraEnabled = true;
let micEnabled = true;

function updateStatus(text) {
  statusEl.textContent = `Статус: ${text}`;
}

function updateRemoteStatus(text) {
  remoteStatusEl.textContent = text;
}

function buildApiUrl(path) {
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

async function loadRuntimeConfig() {
  const response = await fetch("/api/runtime-config");
  if (!response.ok) {
    throw new Error("Не удалось загрузить runtime-конфигурацию");
  }

  const payload = await response.json();
  if (Array.isArray(payload.iceServers) && payload.iceServers.length > 0) {
    iceServers = payload.iceServers;
  }
  if (typeof payload.apiBaseUrl === "string") {
    apiBaseUrl = payload.apiBaseUrl.trim().replace(/\/$/, "");
  }
  if (typeof payload.signalingUrl === "string") {
    signalingUrl = payload.signalingUrl.trim().replace(/\/$/, "");
  }
}

async function startLocalMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  localVideoEl.srcObject = localStream;
  updateStatus("камера и микрофон активированы");
}

function resetPeerConnection() {
  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.ontrack = null;
    peerConnection.close();
    peerConnection = null;
  }
  remoteStream = new MediaStream();
  remoteVideoEl.srcObject = remoteStream;
  updateRemoteStatus("Ожидание подключения...");
}

function ensurePeerConnection() {
  if (peerConnection) {
    return peerConnection;
  }

  peerConnection = new RTCPeerConnection({ iceServers });
  remoteStream = new MediaStream();
  remoteVideoEl.srcObject = remoteStream;

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || !peerSocketId || !currentRoomId) {
      return;
    }

    socket.emit("webrtc-ice-candidate", {
      roomId: currentRoomId,
      targetPeerId: peerSocketId,
      candidate: event.candidate
    });
  };

  peerConnection.ontrack = (event) => {
    // Remote stream can contain multiple tracks; merge all in one MediaStream.
    event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
    updateRemoteStatus("Собеседник подключен");
  };

  return peerConnection;
}

async function createAndSetOffer(targetPeerId) {
  const pc = ensurePeerConnection();
  peerSocketId = targetPeerId;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("webrtc-offer", {
    roomId: currentRoomId,
    targetPeerId,
    offer
  });
  updateStatus("отправлен offer");
}

async function createRoom() {
  const response = await fetch(buildApiUrl("/api/rooms"), { method: "POST" });
  if (!response.ok) {
    throw new Error("Не удалось создать комнату");
  }
  const payload = await response.json();
  return payload.roomId;
}

async function joinRoom(roomId) {
  if (!roomId) {
    updateStatus("введите ID комнаты");
    return;
  }

  currentRoomId = roomId;
  roomIdInput.value = roomId;
  history.replaceState(null, "", `/?room=${encodeURIComponent(roomId)}`);
  roomHintEl.textContent = `Комната: ${roomId}. Скопируйте URL и отправьте собеседнику.`;
  updateStatus(`подключение к комнате ${roomId}`);
  socket.emit("join-room", { roomId });
}

function toggleTrack(kind) {
  if (!localStream) {
    return;
  }

  const tracks = kind === "video" ? localStream.getVideoTracks() : localStream.getAudioTracks();
  if (!tracks[0]) {
    return;
  }

  tracks[0].enabled = !tracks[0].enabled;
  const enabled = tracks[0].enabled;

  if (kind === "video") {
    cameraEnabled = enabled;
    toggleCameraBtn.textContent = `Камера: ${enabled ? "вкл" : "выкл"}`;
  } else {
    micEnabled = enabled;
    toggleMicBtn.textContent = `Микрофон: ${enabled ? "вкл" : "выкл"}`;
  }

  if (currentRoomId) {
    socket.emit("media-toggled", { roomId: currentRoomId, kind, enabled });
  }
}

function setupSocket() {
  const targetUrl = signalingUrl || undefined;
  socket = io(targetUrl, {
    transports: ["websocket", "polling"]
  });

  socket.on("connect", () => {
    updateStatus("соединение с сигналинг-сервером установлено");
  });

  socket.on("room-error", ({ message }) => {
    updateStatus(`ошибка комнаты: ${message}`);
  });

  socket.on("peers-in-room", async ({ peers }) => {
    updateStatus(`в комнате участников: ${peers.length + 1}`);
    if (peers.length > 0) {
      await createAndSetOffer(peers[0]);
    }
  });

  socket.on("peer-joined", async ({ peerId }) => {
    updateStatus("новый участник подключился");
    if (!peerSocketId) {
      await createAndSetOffer(peerId);
    }
  });

  socket.on("webrtc-offer", async ({ fromPeerId, offer }) => {
    const pc = ensurePeerConnection();
    peerSocketId = fromPeerId;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("webrtc-answer", {
      roomId: currentRoomId,
      targetPeerId: fromPeerId,
      answer
    });
    updateStatus("получен offer, отправлен answer");
  });

  socket.on("webrtc-answer", async ({ answer }) => {
    if (!peerConnection) {
      return;
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    updateStatus("получен answer, соединение стабилизируется");
  });

  socket.on("webrtc-ice-candidate", async ({ candidate }) => {
    if (!peerConnection || !candidate) {
      return;
    }
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      updateStatus(`ошибка ICE: ${error.message}`);
    }
  });

  socket.on("peer-left", () => {
    peerSocketId = "";
    resetPeerConnection();
    updateStatus("собеседник отключился");
  });

  socket.on("peer-media-toggled", ({ kind, enabled }) => {
    const kindText = kind === "video" ? "камера" : "микрофон";
    updateStatus(`собеседник: ${kindText} ${enabled ? "вкл" : "выкл"}`);
  });
}

createRoomBtn.addEventListener("click", async () => {
  try {
    const roomId = await createRoom();
    await joinRoom(roomId);
  } catch (error) {
    updateStatus(error.message);
  }
});

joinRoomBtn.addEventListener("click", async () => {
  await joinRoom(roomIdInput.value.trim());
});

toggleCameraBtn.addEventListener("click", () => toggleTrack("video"));
toggleMicBtn.addEventListener("click", () => toggleTrack("audio"));

window.addEventListener("beforeunload", () => {
  if (peerConnection) {
    peerConnection.close();
  }
});

async function boot() {
  try {
    updateStatus("загрузка конфигурации");
    await loadRuntimeConfig();
    setupSocket();
    await startLocalMedia();
    resetPeerConnection();

    const roomFromUrl = new URLSearchParams(window.location.search).get("room");
    if (roomFromUrl) {
      await joinRoom(roomFromUrl);
      return;
    }

    const roomId = await createRoom();
    await joinRoom(roomId);
  } catch (error) {
    updateStatus(`ошибка запуска: ${error.message}`);
  }
}

boot();
