const profileSection = document.getElementById("profileSection");
const lobbySection = document.getElementById("lobbySection");
const callSection = document.getElementById("callSection");
const inviteSection = document.getElementById("inviteSection");
const statusEl = document.getElementById("status");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const handleInput = document.getElementById("handleInput");
const displayNameInput = document.getElementById("displayNameInput");
const avatarInput = document.getElementById("avatarInput");
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const welcomeTextEl = document.getElementById("welcomeText");
const onlineListEl = document.getElementById("onlineList");
const lobbyEmptyTextEl = document.getElementById("lobbyEmptyText");
const inviteListEl = document.getElementById("inviteList");
const callInfoEl = document.getElementById("callInfo");
const endCallBtn = document.getElementById("endCallBtn");
const localVideoEl = document.getElementById("localVideo");
const remoteVideoEl = document.getElementById("remoteVideo");
const toggleCameraBtn = document.getElementById("toggleCameraBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");

const state = {
  apiBaseUrl: "",
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  profile: null,
  onlineUsers: [],
  pendingInvites: [],
  invitationUpdatesAfter: "",
  activeCall: null,
  activePeerId: "",
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  signalAfterId: 0,
  timers: {
    heartbeat: null,
    online: null,
    inbox: null,
    signal: null
  },
  callPollDelayMs: 1200
};

function updateStatus(text) {
  statusEl.textContent = `Статус: ${text}`;
}

function showSection(section, visible) {
  section.classList.toggle("hidden", !visible);
}

function buildApiUrl(path) {
  return state.apiBaseUrl ? `${state.apiBaseUrl}${path}` : path;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {}

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function getProfileFromStorage() {
  try {
    const raw = localStorage.getItem("tchat.profile.v1");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function saveProfileToStorage(profile) {
  localStorage.setItem("tchat.profile.v1", JSON.stringify(profile));
}

async function loadRuntimeConfig() {
  const payload = await apiFetch("/api/runtime-config");
  if (payload.apiBaseUrl) {
    state.apiBaseUrl = String(payload.apiBaseUrl).replace(/\/$/, "");
  }
  if (Array.isArray(payload.iceServers) && payload.iceServers.length > 0) {
    state.iceServers = payload.iceServers;
  }
}

function renderOnlineList() {
  onlineListEl.innerHTML = "";
  if (!state.onlineUsers.length) {
    lobbyEmptyTextEl.classList.remove("hidden");
    return;
  }

  lobbyEmptyTextEl.classList.add("hidden");
  for (const user of state.onlineUsers) {
    const card = document.createElement("div");
    card.className = "user-card";
    card.innerHTML = `
      <div class="card-row">
        <div>
          <h3>${user.displayName}</h3>
          <p class="muted">@${user.handle}</p>
        </div>
        <button class="btn" data-user-id="${user.id}">Общаться</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", () => sendInvite(user.id));
    onlineListEl.appendChild(card);
  }
}

function renderInvites() {
  inviteListEl.innerHTML = "";
  if (!state.pendingInvites.length) {
    inviteListEl.innerHTML = `<p class="muted">Нет новых приглашений.</p>`;
    return;
  }

  for (const invite of state.pendingInvites) {
    const card = document.createElement("div");
    card.className = "invite-card";
    card.innerHTML = `
      <h3>${invite.from_display_name || "Пользователь"} (@${invite.from_handle || "unknown"})</h3>
      <p class="muted">Приглашает в звонок</p>
      <div class="card-row">
        <button class="btn" data-action="accept">Принять</button>
        <button class="btn btn-light" data-action="decline">Отклонить</button>
      </div>
    `;
    card.querySelector('[data-action="accept"]').addEventListener("click", () => respondInvite(invite.id, "accept"));
    card.querySelector('[data-action="decline"]').addEventListener("click", () => respondInvite(invite.id, "decline"));
    inviteListEl.appendChild(card);
  }
}

async function refreshOnlineUsers() {
  if (!state.profile) {
    return;
  }
  const payload = await apiFetch(`/api/users/online?userId=${encodeURIComponent(state.profile.id)}`);
  state.onlineUsers = payload.users || [];
  renderOnlineList();
}

async function sendHeartbeat() {
  if (!state.profile) {
    return;
  }
  const deviceInfo = {
    ua: navigator.userAgent,
    platform: navigator.platform || "unknown"
  };
  await apiFetch("/api/presence/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      userId: state.profile.id,
      status: state.activeCall ? "in_call" : "online",
      deviceInfo
    })
  });
}

function resetPeerConnection() {
  if (state.peerConnection) {
    state.peerConnection.onicecandidate = null;
    state.peerConnection.ontrack = null;
    state.peerConnection.close();
    state.peerConnection = null;
  }
  state.remoteStream = new MediaStream();
  remoteVideoEl.srcObject = state.remoteStream;
}

async function ensureLocalMedia() {
  if (state.localStream) {
    return state.localStream;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Ваш браузер не поддерживает камеру и микрофон");
  }
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });
  } catch (_error) {
    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }
  localVideoEl.srcObject = state.localStream;
  await localVideoEl.play().catch(() => {});
  return state.localStream;
}

function ensurePeerConnection() {
  if (state.peerConnection) {
    return state.peerConnection;
  }
  state.peerConnection = new RTCPeerConnection({ iceServers: state.iceServers });
  state.remoteStream = new MediaStream();
  remoteVideoEl.srcObject = state.remoteStream;

  state.localStream.getTracks().forEach((track) => state.peerConnection.addTrack(track, state.localStream));

  state.peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => state.remoteStream.addTrack(track));
    callInfoEl.textContent = "Собеседник подключен";
  };

  state.peerConnection.onicecandidate = async (event) => {
    if (!event.candidate || !state.activePeerId || !state.activeCall) {
      return;
    }
    await sendSignal("ice", event.candidate);
  };

  return state.peerConnection;
}

async function sendSignal(type, payload) {
  if (!state.activeCall || !state.activePeerId) {
    return;
  }
  await apiFetch("/api/signal/send", {
    method: "POST",
    body: JSON.stringify({
      callSessionId: state.activeCall.id,
      fromUserId: state.profile.id,
      toUserId: state.activePeerId,
      type,
      payload,
      idempotencyKey: `idem_${state.profile.id}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
    })
  });
}

async function handleSignal(signal) {
  state.signalAfterId = Math.max(state.signalAfterId, signal.id || 0);
  if (!signal?.type) {
    return;
  }

  if (signal.type === "offer") {
    const pc = ensurePeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal("answer", answer);
    callInfoEl.textContent = "offer принят, answer отправлен";
    return;
  }

  if (signal.type === "answer" && state.peerConnection) {
    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
    callInfoEl.textContent = "Соединение устанавливается...";
    return;
  }

  if (signal.type === "ice" && state.peerConnection) {
    try {
      await state.peerConnection.addIceCandidate(new RTCIceCandidate(signal.payload));
    } catch (_error) {}
    return;
  }

  if (signal.type === "hangup") {
    await endCall(false);
  }
}

function scheduleSignalPolling() {
  clearTimeout(state.timers.signal);
  if (!state.activeCall) {
    return;
  }
  state.timers.signal = setTimeout(async () => {
    try {
      const payload = await apiFetch(
        `/api/signal/poll?callSessionId=${encodeURIComponent(state.activeCall.id)}&userId=${encodeURIComponent(state.profile.id)}&afterId=${encodeURIComponent(state.signalAfterId)}&limit=80`
      );
      const signals = payload.signals || [];
      for (const signal of signals) {
        await handleSignal(signal);
      }
      if (payload.callSession?.status === "ended") {
        await endCall(false);
      }
      state.callPollDelayMs = payload.retryAfterMs || 1200;
    } catch (_error) {
      state.callPollDelayMs = Math.min(state.callPollDelayMs * 1.5, 4000);
    } finally {
      scheduleSignalPolling();
    }
  }, state.callPollDelayMs);
}

async function startCall(callSession, peerId, shouldCreateOffer) {
  await ensureLocalMedia();
  state.activeCall = callSession;
  state.activePeerId = peerId;
  state.signalAfterId = 0;
  state.callPollDelayMs = 1200;
  callInfoEl.textContent = `Сессия: ${callSession.id}`;

  showSection(callSection, true);
  showSection(lobbySection, false);
  showSection(inviteSection, false);
  resetPeerConnection();

  if (shouldCreateOffer) {
    const pc = ensurePeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal("offer", offer);
  } else {
    ensurePeerConnection();
  }

  scheduleSignalPolling();
  updateStatus("Звонок активен");
}

function resolvePeerIdFromSession(callSession) {
  return callSession.callerId === state.profile.id ? callSession.calleeId : callSession.callerId;
}

async function refreshInvites() {
  if (!state.profile) {
    return;
  }
  const payload = await apiFetch(
    `/api/invite/inbox?userId=${encodeURIComponent(state.profile.id)}&after=${encodeURIComponent(state.invitationUpdatesAfter)}`
  );
  state.pendingInvites = payload.pending || [];
  renderInvites();

  const updates = payload.updates || [];
  if (updates[0]?.updated_at) {
    state.invitationUpdatesAfter = updates[0].updated_at;
  }

  for (const update of updates) {
    if (update.status !== "accepted" || state.activeCall) {
      continue;
    }
    const callPayload = await apiFetch("/api/call/start-from-invite", {
      method: "POST",
      body: JSON.stringify({ invitationId: update.id, userId: state.profile.id })
    });

    const call = callPayload.callSession;
    const normalized = {
      id: call.id,
      callerId: call.callerId,
      calleeId: call.calleeId,
      status: call.status
    };
    await startCall(normalized, resolvePeerIdFromSession(normalized), normalized.callerId === state.profile.id);
    break;
  }
}

async function sendInvite(targetUserId) {
  try {
    await apiFetch("/api/invite/send", {
      method: "POST",
      body: JSON.stringify({ fromUserId: state.profile.id, toUserId: targetUserId })
    });
    updateStatus("Приглашение отправлено");
  } catch (error) {
    updateStatus(`Не удалось отправить приглашение: ${error.message}`);
  }
}

async function respondInvite(invitationId, decision) {
  try {
    const payload = await apiFetch("/api/invite/respond", {
      method: "POST",
      body: JSON.stringify({ invitationId, userId: state.profile.id, decision })
    });

    if (decision === "accept" && payload.callSession) {
      const callSession = {
        id: payload.callSession.id,
        callerId: payload.callSession.caller_id,
        calleeId: payload.callSession.callee_id,
        status: payload.callSession.status
      };
      await startCall(callSession, resolvePeerIdFromSession(callSession), false);
    } else {
      updateStatus("Приглашение отклонено");
      await refreshInvites();
    }
  } catch (error) {
    updateStatus(`Ошибка ответа на приглашение: ${error.message}`);
  }
}

async function endCall(notifyPeer = true) {
  if (!state.activeCall) {
    return;
  }

  const callId = state.activeCall.id;
  const peerId = state.activePeerId;

  clearTimeout(state.timers.signal);
  resetPeerConnection();
  state.activeCall = null;
  state.activePeerId = "";

  showSection(callSection, false);
  showSection(lobbySection, true);
  showSection(inviteSection, true);

  try {
    if (notifyPeer && peerId) {
      await apiFetch("/api/signal/send", {
        method: "POST",
        body: JSON.stringify({
          callSessionId: callId,
          fromUserId: state.profile.id,
          toUserId: peerId,
          type: "hangup",
          payload: { reason: "hangup" },
          idempotencyKey: `hangup_${state.profile.id}_${Date.now()}`
        })
      });
    }
    await apiFetch("/api/call/end", {
      method: "POST",
      body: JSON.stringify({
        callSessionId: callId,
        userId: state.profile.id,
        reason: notifyPeer ? "hangup" : "remote_end"
      })
    });
  } catch (_error) {}

  updateStatus("Звонок завершен");
}

function startLobbyLoops() {
  clearInterval(state.timers.heartbeat);
  clearInterval(state.timers.online);
  clearInterval(state.timers.inbox);

  state.timers.heartbeat = setInterval(() => sendHeartbeat().catch(() => {}), 18000);
  state.timers.online = setInterval(() => refreshOnlineUsers().catch(() => {}), 4500);
  state.timers.inbox = setInterval(() => refreshInvites().catch(() => {}), 2400);
}

async function enterLobby() {
  showSection(profileSection, false);
  showSection(lobbySection, true);
  showSection(inviteSection, true);
  showSection(callSection, false);
  welcomeTextEl.textContent = `Вы вошли как ${state.profile.displayName} (@${state.profile.handle})`;

  await sendHeartbeat();
  await refreshOnlineUsers();
  await refreshInvites();
  startLobbyLoops();
  updateStatus("Профиль активен, ищем собеседников");
}

async function saveProfile() {
  const handle = String(handleInput.value || "").trim();
  const displayName = String(displayNameInput.value || "").trim();
  const avatarUrl = String(avatarInput.value || "").trim();

  if (!handle || !displayName) {
    updateStatus("Заполните ник и имя");
    return;
  }

  const userId = state.profile?.id || window.crypto.randomUUID();
  const payload = await apiFetch("/api/profile/create-or-update", {
    method: "POST",
    body: JSON.stringify({
      userId,
      handle,
      displayName,
      avatarUrl
    })
  });

  state.profile = payload.profile;
  saveProfileToStorage(state.profile);
  try {
    await ensureLocalMedia();
  } catch (error) {
    if (error?.name === "NotAllowedError") {
      throw new Error("Разрешите доступ к камере и микрофону в браузере и нажмите снова");
    }
    if (error?.name === "NotFoundError") {
      throw new Error("Камера или микрофон не найдены на устройстве");
    }
    throw error;
  }
  await enterLobby();
}

function wireUiEvents() {
  saveProfileBtn.addEventListener("click", () => {
    saveProfile().catch((error) => updateStatus(`Ошибка профиля: ${error.message}`));
  });

  refreshUsersBtn.addEventListener("click", () => {
    refreshOnlineUsers().catch((error) => updateStatus(`Ошибка списка участников: ${error.message}`));
  });

  toggleCameraBtn.addEventListener("click", () => {
    if (!state.localStream) {
      return;
    }
    const track = state.localStream.getVideoTracks()[0];
    if (!track) {
      return;
    }
    track.enabled = !track.enabled;
    toggleCameraBtn.textContent = `Камера: ${track.enabled ? "вкл" : "выкл"}`;
  });

  toggleMicBtn.addEventListener("click", () => {
    if (!state.localStream) {
      return;
    }
    const track = state.localStream.getAudioTracks()[0];
    if (!track) {
      return;
    }
    track.enabled = !track.enabled;
    toggleMicBtn.textContent = `Микрофон: ${track.enabled ? "вкл" : "выкл"}`;
  });

  endCallBtn.addEventListener("click", () => {
    endCall(true).catch(() => {});
  });
}

async function bootstrap() {
  updateStatus("Загрузка конфигурации...");
  await loadRuntimeConfig();

  const cached = getProfileFromStorage();
  if (cached?.id) {
    state.profile = cached;
    handleInput.value = cached.handle || "";
    displayNameInput.value = cached.displayName || "";
    avatarInput.value = cached.avatarUrl || "";
  }

  wireUiEvents();

  if (state.profile) {
    updateStatus("Профиль найден. Нажмите «Войти в платформу» для запуска медиа на телефоне.");
  } else {
    updateStatus("Сначала настройте профиль");
  }
}

window.addEventListener("beforeunload", () => {
  if (state.activeCall && state.activePeerId) {
    navigator.sendBeacon(
      buildApiUrl("/api/call/end"),
      JSON.stringify({
        callSessionId: state.activeCall.id,
        userId: state.profile?.id,
        reason: "page_unload"
      })
    );
  }
});

window.addEventListener("online", () => {
  if (!state.profile) {
    return;
  }
  updateStatus("Сеть восстановлена, синхронизируем состояние...");
  sendHeartbeat().catch(() => {});
  refreshOnlineUsers().catch(() => {});
  refreshInvites().catch(() => {});
  if (state.activeCall) {
    scheduleSignalPolling();
  }
});

window.addEventListener("offline", () => {
  updateStatus("Нет сети. Ожидаем восстановление подключения...");
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !state.profile) {
    return;
  }
  sendHeartbeat().catch(() => {});
  refreshInvites().catch(() => {});
});

bootstrap().catch((error) => {
  updateStatus(`Ошибка запуска: ${error.message}`);
});
