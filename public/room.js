import { getToken, getUser, initTheme, requireUnrestrictedAsync } from '/auth.js';
import { icon, setIcon, initNavIcons } from '/icons.js';
import { showAlert, showConfirm, showCopyDialog } from '/dialog.js';

initTheme();
initNavIcons();
if (!(await requireUnrestrictedAsync())) throw new Error('no auth');

function setMicState(on) {
  setIcon('local-mic-icon', on ? 'mic' : 'mic-off');
  document.getElementById('mic-btn').innerHTML = icon(on ? 'mic' : 'mic-off', 'ico');
  document.getElementById('mic-btn').classList.toggle('active', on);
}

function setCamState(on) {
  setIcon('local-cam-icon', on ? 'camera' : 'camera-off');
  document.getElementById('cam-btn').innerHTML = icon(on ? 'camera' : 'camera-off', 'ico');
  document.getElementById('cam-btn').classList.toggle('active', on);
}

const TOKEN = getToken();
const USER = getUser();
const params = new URLSearchParams(location.search);
const CONF_ID = parseInt(params.get('id'), 10);

if (!CONF_ID) location.href = '/conferences.html';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const socket = io({ auth: { token: TOKEN } });

let localStream = null;
let screenStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let micEnabled = false;
let camEnabled = false;
let screenSharing = false;
let startTime = null;
let timerInterval = null;
let isHost = false;

const peers = new Map();
// One audio + one video RTCRtpSender per peer, pre-negotiated up front (see
// createPeer) so mic/cam/screen toggles are always a plain replaceTrack —
// never a renegotiation added after the fact, which turned out to be the
// actual cause of screen share not reaching peers whose connection was
// first set up with no live tracks at all (mic+cam both off at join time).
const peerSenders = new Map();

const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const chatMessages = document.getElementById('chat-messages');
const participantsList = document.getElementById('participants-list');

async function initMedia() {
  localStream = new MediaStream();
  document.getElementById('local-label').textContent = `@${USER.handle}`;
  document.getElementById('local-avatar').textContent = USER.name?.charAt(0) || USER.handle?.charAt(0) || '?';
  setMicState(false);
  setCamState(false);
  updateLocalVideo();

  socket.emit('room:join', { conferenceId: CONF_ID });
}

function updateLocalVideo() {
  const tile = document.getElementById('local-tile');
  const hasVideo = camEnabled && localStream.getVideoTracks().length > 0;

  if (hasVideo) {
    localVideo.srcObject = localStream;
    localVideo.hidden = false;
    tile.classList.remove('cam-off');
  } else {
    localVideo.srcObject = null;
    localVideo.hidden = true;
    tile.classList.add('cam-off');
  }
}

/** Pushes whatever localStream currently has onto one peer's pre-created senders. */
async function applyLocalTracks(socketId) {
  const senders = peerSenders.get(socketId);
  if (!senders || !localStream) return;
  await senders.audio.replaceTrack(localStream.getAudioTracks()[0] || null);
  await senders.video.replaceTrack(localStream.getVideoTracks()[0] || null);
}

/** Swaps the given kind's outgoing track (mic/cam/screen) on every peer — no
 * signaling round-trip needed since the sender already exists for every
 * connection (see createPeer). Pass track=null to stop sending that kind. */
async function setSenderTrack(kind, track) {
  for (const senders of peerSenders.values()) {
    const sender = senders[kind];
    if (sender) await sender.replaceTrack(track);
  }
}

async function setMicEnabled(on) {
  if (on) {
    try {
      let track = localStream.getAudioTracks()[0];
      if (!track) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        track = stream.getAudioTracks()[0];
        localStream.addTrack(track);
      } else {
        track.enabled = true;
      }
      micEnabled = true;
      await setSenderTrack('audio', track);
    } catch {
      addSystemMessage('Мікрофон недоступний');
      return;
    }
  } else {
    const track = localStream.getAudioTracks()[0];
    if (track) {
      track.stop();
      localStream.removeTrack(track);
      await setSenderTrack('audio', null);
    }
    micEnabled = false;
  }
  setMicState(micEnabled);
  socket.emit('media:toggle', { audioEnabled: micEnabled });
}

async function setCamEnabled(on) {
  if (on) {
    try {
      let track = localStream.getVideoTracks()[0];
      if (!track) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        track = stream.getVideoTracks()[0];
        localStream.addTrack(track);
      } else {
        track.enabled = true;
      }
      camEnabled = true;
      if (!screenSharing) await setSenderTrack('video', track);
    } catch {
      addSystemMessage('Камера недоступна');
      return;
    }
  } else {
    const track = localStream.getVideoTracks()[0];
    if (track) {
      track.stop();
      localStream.removeTrack(track);
      if (!screenSharing) await setSenderTrack('video', null);
    }
    camEnabled = false;
  }
  setCamState(camEnabled);
  updateLocalVideo();
  socket.emit('media:toggle', { videoEnabled: camEnabled });
}

function updateGridClass() {
  const count = videoGrid.querySelectorAll('.video-tile').length;
  videoGrid.className = `video-grid ${
    count <= 1 ? 'grid-1' :
    count === 2 ? 'grid-2' :
    count <= 4 ? 'grid-3' : 'grid-many'
  }`;
}

async function createPeer(socketId, isInitiator, userData) {
  if (peers.has(socketId)) return peers.get(socketId);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peers.set(socketId, pc);

  // Always negotiate one audio + one video slot immediately, even with no
  // track yet (mic/cam start off) — see applyLocalTracks/setSenderTrack.
  peerSenders.set(socketId, {
    audio: pc.addTransceiver('audio', { direction: 'sendrecv' }).sender,
    video: pc.addTransceiver('video', { direction: 'sendrecv' }).sender,
  });
  await applyLocalTracks(socketId);
  if (screenSharing && screenStream) {
    await peerSenders.get(socketId).video.replaceTrack(screenStream.getVideoTracks()[0]);
  }

  const tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.id = `tile-${socketId}`;
  tile.innerHTML = `
    <video autoplay muted playsinline></video>
    <audio autoplay hidden></audio>
    <div class="tile-label">
      <span>${userData?.handle ? `@${userData.handle}` : '...'}</span>
      <div class="tile-icons">
        <span class="tile-icon">${userData?.audioEnabled ? icon('mic', 'ico ico--sm') : icon('mic-off', 'ico ico--sm')}</span>
        <span class="tile-icon">${userData?.videoEnabled ? icon('camera', 'ico ico--sm') : icon('camera-off', 'ico ico--sm')}</span>
      </div>
    </div>`;
  videoGrid.appendChild(tile);
  updateGridClass();

  pc.ontrack = (e) => {
    if (e.track.kind === 'audio') {
      tile.querySelector('audio').srcObject = new MediaStream([e.track]);
      return;
    }

    const video = tile.querySelector('video');
    video.srcObject = new MediaStream([e.track]);
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('signal:ice-candidate', { targetSocketId: socketId, candidate: e.candidate });
  };

  pc.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      removePeer(socketId);
    }
  };

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal:offer', { targetSocketId: socketId, offer });
  }

  return pc;
}

function removePeer(socketId) {
  const pc = peers.get(socketId);
  if (pc) { pc.close(); peers.delete(socketId); }
  peerSenders.delete(socketId);
  const tile = document.getElementById(`tile-${socketId}`);
  if (tile) tile.remove();
  updateGridClass();
}

socket.on('room:joined', ({ conference, participants, messages }) => {
  document.getElementById('room-title').textContent = conference.title;
  document.getElementById('room-code').textContent = `Код: ${conference.room_code}`;
  isHost = conference.host_user_id === USER.id;
  document.getElementById('leave-ctrl-btn').title = isHost ? 'Завершити для всіх' : 'Покинути';
  startTime = new Date();
  timerInterval = setInterval(updateTimer, 1000);

  renderParticipants(participants);
  messages.forEach(m => addChatMessage(m));
  addSystemMessage(`Ви увійшли в «${conference.title}»`);

  participants.forEach(p => {
    if (p.socketId !== socket.id) {
      createPeer(p.socketId, true, p);
    }
  });
});

socket.on('participant:joined', ({ participant }) => {
  addSystemMessage(`@${participant.handle} підключився`);
  renderParticipants([...getAllParticipants(), participant]);
  if (participant.socketId !== socket.id) {
    createPeer(participant.socketId, false, participant);
  }
});

socket.on('participant:left', ({ participant }) => {
  addSystemMessage(`@${participant.handle} вийшов`);
  removePeer(participant.socketId);
});

socket.on('participants:update', ({ participants }) => renderParticipants(participants));

socket.on('signal:offer', async ({ from, offer, user }) => {
  const pc = await createPeer(from, false, user);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('signal:answer', { targetSocketId: from, answer });
});

socket.on('signal:answer', async ({ from, answer }) => {
  const pc = peers.get(from);
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('signal:ice-candidate', async ({ from, candidate }) => {
  const pc = peers.get(from);
  if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on('chat:message', (msg) => addChatMessage(msg));

socket.on('recording:status', ({ isRecording: rec, userName }) => {
  document.getElementById('rec-badge').style.display = rec ? 'flex' : 'none';
  addSystemMessage(rec ? `${userName} почав запис` : `${userName} зупинив запис`);
});

// Broadcast to everyone in the room once the host ends it (see 'room:end'
// below) — each client, including the host's own, reacts by leaving the
// same way a manual leave would, so cleanup only lives in one place.
socket.on('conference:ended', () => {
  leaveRoom();
});

socket.on('error', async ({ message }) => {
  if (!startTime) {
    await showAlert(message);
    location.href = '/conferences.html';
    return;
  }
  addSystemMessage(`${message}`);
});

function addChatMessage(msg) {
  const isSystem = msg.msg_type === 'system';
  const div = document.createElement('div');
  div.className = `chat-msg${isSystem ? ' system' : ''}`;
  if (isSystem) {
    div.textContent = msg.message;
  } else {
    const time = new Date(msg.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-msg-handle">@${msg.handle}</span>
        <span class="chat-msg-time">${time}</span>
      </div>
      <div>${escapeHtml(msg.message)}</div>`;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
  addChatMessage({ message: text, msg_type: 'system', created_at: new Date().toISOString() });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let currentParticipants = [];
function getAllParticipants() { return currentParticipants; }

function renderParticipants(participants) {
  currentParticipants = participants;
  participantsList.innerHTML = participants.map(p => `
    <div class="participant-item">
      <div class="participant-avatar">${p.name?.charAt(0) || '?'}</div>
      <div class="participant-info">
        <div class="participant-name">${p.name || p.handle}</div>
        <div class="participant-role">${p.role} • @${p.handle}</div>
      </div>
      <div class="participant-status">
        ${p.audioEnabled ? icon('mic', 'ico ico--sm') : icon('mic-off', 'ico ico--sm')}
        ${p.videoEnabled ? icon('camera', 'ico ico--sm') : icon('camera-off', 'ico ico--sm')}
      </div>
    </div>`).join('');
}

function updateTimer() {
  if (!startTime) return;
  const sec = Math.floor((Date.now() - startTime) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  document.getElementById('room-timer').textContent =
    (h ? `${String(h).padStart(2,'0')}:` : '') +
    `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

document.getElementById('mic-btn').addEventListener('click', () => {
  setMicEnabled(!micEnabled);
});

document.getElementById('cam-btn').addEventListener('click', () => {
  setCamEnabled(!camEnabled);
});

document.getElementById('screen-btn').addEventListener('click', async () => {
  if (screenSharing) {
    await stopScreenShare();
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    screenSharing = true;
    document.getElementById('screen-btn').classList.add('active');
    socket.emit('media:toggle', { screenSharing: true });

    const tile = document.createElement('div');
    tile.className = 'video-tile screen-share';
    tile.id = 'tile-screen';
    tile.innerHTML = `<video autoplay muted playsinline></video><div class="tile-label ico-inline">${icon('screen', 'ico ico--sm')}Ваш екран</div>`;
    tile.querySelector('video').srcObject = screenStream;
    videoGrid.appendChild(tile);
    updateGridClass();

    // The tile above only renders the screen locally — remote peers only
    // ever see whatever track occupies the shared 'video' sender (the same
    // one the camera uses), so the screen has to be pushed onto it too.
    const screenTrack = screenStream.getVideoTracks()[0];
    await setSenderTrack('video', screenTrack);
    screenTrack.onended = () => {
      document.getElementById('screen-btn').click();
    };
  } catch { addSystemMessage('Демонстрація екрана скасована'); }
});

async function stopScreenShare() {
  screenStream?.getTracks().forEach(t => t.stop());
  screenSharing = false;
  document.getElementById('screen-btn').classList.remove('active');
  socket.emit('media:toggle', { screenSharing: false });

  const screenTile = document.getElementById('tile-screen');
  if (screenTile) screenTile.remove();
  updateGridClass();

  // The screen track was occupying the shared video sender — hand it back
  // to the camera (if still on) or clear it so peers stop seeing the screen.
  const camTrack = camEnabled ? localStream.getVideoTracks()[0] : null;
  await setSenderTrack('video', camTrack || null);
}

document.getElementById('rec-btn').addEventListener('click', async () => {
  if (isRecording) {
    mediaRecorder?.stop();
    return;
  }

  try {
    const stream = screenStream || localStream;
    if (!stream) return addSystemMessage('Немає відеопотоку для запису');

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    recordedChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      isRecording = false;
      document.getElementById('rec-btn').classList.remove('recording');
      document.getElementById('rec-badge').style.display = 'none';
      socket.emit('recording:status', { isRecording: false, userName: USER.name });
      addSystemMessage('Запис зупинено — завантаження...');
      await uploadRecording(blob);
    };

    mediaRecorder.start(1000);
    isRecording = true;
    document.getElementById('rec-btn').classList.add('recording');
    document.getElementById('rec-badge').style.display = 'flex';
    socket.emit('recording:status', { isRecording: true, userName: USER.name });
    addSystemMessage('Запис розпочато');
  } catch (err) {
    addSystemMessage(`Помилка запису: ${err.message}`);
  }
});

async function uploadRecording(blob) {
  const confTitle = document.getElementById('room-title').textContent;
  const fd = new FormData();
  fd.append('recording', blob, 'recording.webm');
  fd.append('title', `${confTitle} — ${new Date().toLocaleDateString('uk-UA')}`);
  fd.append('conferenceId', CONF_ID);
  fd.append('durationSeconds', Math.floor((Date.now() - startTime) / 1000));

  try {
    const res = await fetch('/api/recordings/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: fd,
    });
    if (res.ok) {
      addSystemMessage('Запис збережено — розділ «Записи»');
    }
  } catch {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording-${Date.now()}.webm`;
    a.click();
    addSystemMessage('Запис завантажено локально');
  }
}

const chatInput = document.getElementById('chat-input');
document.getElementById('chat-send').addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

function sendMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  socket.emit('chat:message', { message: msg });
  chatInput.value = '';
}

document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
  });
});

document.getElementById('copy-link-btn').addEventListener('click', async () => {
  const link = `${location.origin}/room.html?id=${CONF_ID}`;
  try {
    await navigator.clipboard.writeText(link);
    addSystemMessage('Посилання на конференцію скопійовано');
  } catch {
    await showCopyDialog('Посилання на конференцію', link, { title: 'Копіювати посилання' });
  }
});

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

document.getElementById('chat-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === 'chat'));
  document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-chat'));
});

function leaveRoom() {
  clearInterval(timerInterval);
  socket.emit('room:leave');
  peers.forEach((_, id) => removePeer(id));
  localStream?.getTracks().forEach(t => t.stop());
  screenStream?.getTracks().forEach(t => t.stop());
  location.href = '/conferences.html';
}

async function handleLeaveClick() {
  if (isHost) {
    const ok = await showConfirm('Завершити конференцію для всіх учасників?', {
      confirmText: 'Завершити', danger: true,
    });
    if (!ok) return;
    // Cleanup happens uniformly via the 'conference:ended' broadcast this
    // socket also receives — not called directly here.
    socket.emit('room:end');
    return;
  }
  leaveRoom();
}

document.getElementById('leave-ctrl-btn').addEventListener('click', handleLeaveClick);
document.getElementById('leave-btn').addEventListener('click', (e) => { e.preventDefault(); handleLeaveClick(); });

window.addEventListener('beforeunload', () => socket.emit('room:leave'));

// Lets the teacher's attendance view see who switched away to another tab
// during the lesson — the server no-ops this while the socket isn't in a
// room, so no local guard is needed here.
document.addEventListener('visibilitychange', () => {
  socket.emit('presence:visibility', { hidden: document.hidden });
});

initMedia();
