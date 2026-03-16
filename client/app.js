const localVideoEl = document.getElementById("localVideo");
const remoteVideoEl = document.getElementById("remoteVideo");
const remoteStatusEl = document.getElementById("remoteStatus");
const statusEl = document.getElementById("status");
const roomIdInput = document.getElementById("roomIdInput");
const roomHintEl = document.getElementById("roomHint");
const startChatBtn = document.getElementById("startChatBtn");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const toggleCameraBtn = document.getElementById("toggleCameraBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
let apiBaseUrl = "";
let currentRoomId = "";
let targetPeerId = "";
let pollTimer = null;
let lastSignalId = 0;
let booted = false;
const selfPeerId = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(
  0,
  24
);

function updateStatus(text) {
  statusEl.textContent = `Статус: ${text}`;
}

function updateRemoteStatus(text) {
  remoteStatusEl.textContent = text;
}

function buildApiUrl(path) {
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch (_) {}
    throw new Error(message);
  }

  return response.json();
}

async function loadRuntimeConfig() {
  try {
    const payload = await apiFetch("/api/runtime-config");
    if (Array.isArray(payload.iceServers) && payload.iceServers.length > 0) {
      iceServers = payload.iceServers;
    }
    if (typeof payload.apiBaseUrl === "string" && payload.apiBaseUrl.trim()) {
      apiBaseUrl = payload.apiBaseUrl.trim().replace(/\/$/, "");
    }
  } catch (_error) {
    updateStatus("runtime-конфиг недоступен, работаем с дефолтом");
  }
}

async function startLocalMedia() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Ваш браузер не поддерживает getUserMedia");
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });
  } catch (_firstError) {
    // Fallback constraints improve compatibility on older Android/iOS devices.
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
  }

  localVideoEl.srcObject = localStream;
  await localVideoEl.play().catch(() => {});
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

async function sendSignal(type, payload, toPeerId) {
  await apiFetch("/api/signal-send", {
    method: "POST",
    body: JSON.stringify({
      roomId: currentRoomId,
      fromPeerId: selfPeerId,
      toPeerId,
      type,
      payload
    })
  });
}

function ensurePeerConnection() {
  if (peerConnection) {
    return peerConnection;
  }

  peerConnection = new RTCPeerConnection({ iceServers });
  remoteStream = new MediaStream();
  remoteVideoEl.srcObject = remoteStream;

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.onicecandidate = async (event) => {
    if (!event.candidate || !targetPeerId) {
      return;
    }
    await sendSignal("ice", event.candidate, targetPeerId);
  };

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
    updateRemoteStatus("Собеседник подключен");
  };

  return peerConnection;
}

async function createAndSendOffer(peerId) {
  targetPeerId = peerId;
  const pc = ensurePeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendSignal("offer", offer, peerId);
  updateStatus("offer отправлен");
}

async function createRoom() {
  const payload = await apiFetch("/api/room-create", { method: "POST" });
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

  const payload = await apiFetch("/api/room-join", {
    method: "POST",
    body: JSON.stringify({ roomId, peerId: selfPeerId })
  });

  const peers = payload.peers || [];
  updateStatus(`в комнате участников: ${peers.length + 1}`);

  if (peers.length > 0) {
    await createAndSendOffer(peers[0]);
  }

  startPolling();
}

async function processSignal(signal) {
  lastSignalId = Math.max(lastSignalId, signal.id || 0);

  if (!signal || !signal.type || !signal.payload) {
    return;
  }

  if (signal.type === "offer") {
    targetPeerId = signal.from_peer_id;
    const pc = ensurePeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal("answer", answer, targetPeerId);
    updateStatus("offer получен, answer отправлен");
    return;
  }

  if (signal.type === "answer" && peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
    updateStatus("answer получен");
    return;
  }

  if (signal.type === "ice" && peerConnection) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(signal.payload));
    } catch (_error) {}
  }
}

function startPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }

  pollTimer = setInterval(async () => {
    if (!currentRoomId) {
      return;
    }
    try {
      const payload = await apiFetch(
        `/api/signal-poll?roomId=${encodeURIComponent(currentRoomId)}&peerId=${encodeURIComponent(selfPeerId)}&afterId=${encodeURIComponent(lastSignalId)}`
      );
      const signals = payload.signals || [];
      for (const signal of signals) {
        await processSignal(signal);
      }
      if (payload.peerLeft) {
        targetPeerId = "";
        resetPeerConnection();
        updateStatus("собеседник отключился");
      }
    } catch (_error) {}
  }, 1200);
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
    toggleCameraBtn.textContent = `Камера: ${enabled ? "вкл" : "выкл"}`;
  } else {
    toggleMicBtn.textContent = `Микрофон: ${enabled ? "вкл" : "выкл"}`;
  }
}

createRoomBtn.addEventListener("click", async () => {
  try {
    if (!booted) {
      await boot();
    }
    const roomId = await createRoom();
    await joinRoom(roomId);
  } catch (error) {
    updateStatus(`ошибка: ${error.message}`);
  }
});

joinRoomBtn.addEventListener("click", async () => {
  try {
    if (!booted) {
      await boot();
    }
    await joinRoom(roomIdInput.value.trim());
  } catch (error) {
    updateStatus(`ошибка: ${error.message}`);
  }
});

toggleCameraBtn.addEventListener("click", () => toggleTrack("video"));
toggleMicBtn.addEventListener("click", () => toggleTrack("audio"));

window.addEventListener("beforeunload", () => {
  if (currentRoomId) {
    navigator.sendBeacon(
      buildApiUrl("/api/room-leave"),
      JSON.stringify({ roomId: currentRoomId, peerId: selfPeerId })
    );
  }
});

async function boot() {
  if (booted) {
    return;
  }

  try {
    startChatBtn.disabled = true;
    updateStatus("запрашиваем доступ к камере и микрофону...");
    await loadRuntimeConfig();
    await startLocalMedia();
    resetPeerConnection();
    booted = true;
    updateStatus("медиа включено, можно подключаться");

    const roomFromUrl = new URLSearchParams(window.location.search).get("room");
    if (roomFromUrl) {
      await joinRoom(roomFromUrl);
      return;
    }

    const roomId = await createRoom();
    await joinRoom(roomId);
  } catch (error) {
    startChatBtn.disabled = false;
    if (error?.name === "NotAllowedError") {
      updateStatus("доступ к камере запрещен. Разрешите камеру/микрофон в настройках браузера.");
      return;
    }
    if (error?.name === "NotFoundError") {
      updateStatus("камера не найдена на устройстве.");
      return;
    }
    updateStatus(`ошибка запуска: ${error.message}`);
  }
}

startChatBtn.addEventListener("click", () => {
  boot();
});
