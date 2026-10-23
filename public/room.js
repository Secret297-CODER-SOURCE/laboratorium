import { getToken, getUser, initTheme, requireUnrestrictedAsync } from '/auth.js';
import { icon, setIcon, initNavIcons } from '/icons.js';
import { showAlert, showConfirm, showCopyDialog } from '/dialog.js';

initTheme();
initNavIcons();
if (!(await requireUnrestrictedAsync())) throw new Error('no auth');

const TOKEN = getToken();
const USER = getUser();
const CONF_ID = parseInt(new URLSearchParams(location.search).get('id'), 10);
if (!CONF_ID) location.href = '/conferences.html';

/* ───────────────────────── ICE / TURN ─────────────────────────
 * Одного STUN недостаточно: через мобильный интернет / симметричный NAT
 * соединение между двумя устройствами часто просто не устанавливается —
 * тогда нет ни видео, ни демки, ни звука. Нужен TURN.
 *
 * Сервер может отдавать список на GET /api/ice-servers → { iceServers: [...] }
 * (например, из coturn / Metered / Cloudflare Calls). Если эндпоинта нет —
 * используется STUN и (опционально) TURN_FALLBACK ниже.
 */
const TURN_FALLBACK = [
  // { urls: 'turn:turn.laboratorium.club:3478', username: 'USER', credential: 'PASS' },
  // { urls: 'turns:turn.laboratorium.club:5349', username: 'USER', credential: 'PASS' },
];
let ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...TURN_FALLBACK,
];
async function loadIceServers() {
  try {
    const r = await fetch('/api/ice-servers', { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) return;
    const d = await r.json();
    if (Array.isArray(d.iceServers) && d.iceServers.length) ICE_SERVERS = d.iceServers;
  } catch { /* остаёмся на значениях по умолчанию */ }
}

/* ───────────────────────── Стили новых элементов ───────────────────────── */
const style = document.createElement('style');
style.textContent = `
.video-tile{position:relative;overflow:hidden;transition:box-shadow .15s,border-color .15s}
.video-tile video{width:100%;height:100%;object-fit:cover}
.video-tile.screen-share video{object-fit:contain;background:#000}
.video-tile.speaking{box-shadow:0 0 0 2px var(--accent,#ec4899),0 0 18px rgba(236,72,153,.45)}
.video-tile .tile-avatar{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:48px;font-weight:700;color:var(--accent,#ec4899);pointer-events:none}
.video-tile.cam-on .tile-avatar{display:none}
.video-tile .tile-fs{position:absolute;top:8px;right:8px;opacity:0;transition:opacity .15s;border:0;cursor:pointer;
  background:rgba(0,0,0,.55);color:#fff;border-radius:8px;padding:4px 8px;font-size:14px}
.video-tile:hover .tile-fs{opacity:1}
#video-grid.has-screen{display:grid!important;grid-template-columns:minmax(0,1fr) 240px;grid-auto-rows:minmax(130px,1fr);gap:8px}
#video-grid.has-screen .video-tile{grid-column:2;min-height:0}
#video-grid.has-screen .video-tile.screen-share{grid-column:1;grid-row:1 / span 6}
@media (max-width:800px){
  #video-grid.has-screen{grid-template-columns:1fr 1fr}
  #video-grid.has-screen .video-tile{grid-column:auto}
  #video-grid.has-screen .video-tile.screen-share{grid-column:1 / span 2;grid-row:auto;min-height:220px}
}
#sound-banner{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:50;display:none;
  background:var(--accent,#ec4899);color:#fff;border:0;border-radius:999px;padding:10px 18px;cursor:pointer;font-weight:600}
`;
document.head.appendChild(style);

const soundBanner = document.createElement('button');
soundBanner.id = 'sound-banner';
soundBanner.textContent = '🔊 Натисніть, щоб увімкнути звук';
document.body.appendChild(soundBanner);
soundBanner.addEventListener('click', () => {
  soundBanner.style.display = 'none';
  audioCtx()?.resume();
  document.querySelectorAll('#video-grid video').forEach(v => { if (!v.muted) v.play().catch(() => {}); });
});

/* ───────────────────────── Состояние ───────────────────────── */
const socket = io({ auth: { token: TOKEN } });

const camStreamLocal = new MediaStream();   // mic + camera
let screenStream = null;                    // демка (видео + системный звук, если дали)
let micEnabled = false;
let camEnabled = false;
let screenSharing = false;
let startTime = null;
let timerInterval = null;
let isHost = false;

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recMix = null;

/** socketId → { pc, isInitiator, tx, camStream, screenStream, pendingIce, dc, state, tile, screenTile } */
const peers = new Map();

const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const chatMessages = document.getElementById('chat-messages');
const participantsList = document.getElementById('participants-list');

/* ───────────────────────── Аудио-анализ («говорит») ───────────────────────── */
let _ctx = null;
function audioCtx() {
  try { return (_ctx ||= new (window.AudioContext || window.webkitAudioContext)()); } catch { return null; }
}
const speakingWatchers = new Map(); // key → interval id
function watchSpeaking(key, stream, tile) {
  stopWatching(key);
  const ctx = audioCtx();
  if (!ctx || !stream.getAudioTracks().length) return;
  try {
    const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const id = setInterval(() => {
      analyser.getByteFrequencyData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i];
      tile.classList.toggle('speaking', sum / buf.length > 14);
    }, 150);
    speakingWatchers.set(key, { id, src });
  } catch { /* не критично */ }
}
function stopWatching(key) {
  const w = speakingWatchers.get(key);
  if (!w) return;
  clearInterval(w.id);
  try { w.src.disconnect(); } catch {}
  speakingWatchers.delete(key);
}

/* ───────────────────────── Локальные кнопки/иконки ───────────────────────── */
function setMicState(on) {
  setIcon('local-mic-icon', on ? 'mic' : 'mic-off');
  const b = document.getElementById('mic-btn');
  b.innerHTML = icon(on ? 'mic' : 'mic-off', 'ico');
  b.classList.toggle('active', on);
}
function setCamState(on) {
  setIcon('local-cam-icon', on ? 'camera' : 'camera-off');
  const b = document.getElementById('cam-btn');
  b.innerHTML = icon(on ? 'camera' : 'camera-off', 'ico');
  b.classList.toggle('active', on);
}

function updateLocalVideo() {
  const tile = document.getElementById('local-tile');
  const vt = camStreamLocal.getVideoTracks()[0];
  localVideo.muted = true; // иначе эхо собственного микрофона
  if (camEnabled && vt) {
    localVideo.srcObject = new MediaStream([vt]);
    localVideo.hidden = false;
    tile.classList.remove('cam-off');
  } else {
    localVideo.srcObject = null;
    localVideo.hidden = true;
    tile.classList.add('cam-off');
  }
}

function updateGridClass() {
  const tiles = videoGrid.querySelectorAll('.video-tile');
  const hasScreen = !!videoGrid.querySelector('.video-tile.screen-share');
  const count = tiles.length;
  videoGrid.className = `video-grid ${
    count <= 1 ? 'grid-1' : count === 2 ? 'grid-2' : count <= 4 ? 'grid-3' : 'grid-many'
  }${hasScreen ? ' has-screen' : ''}`;
}

/* ───────────────────────── Отправка треков ───────────────────────── */
// У каждого пира 4 заранее согласованных слота (порядок одинаков на обеих сторонах):
//   audio (микрофон) · cam (камера) · screen (демка) · screenAudio (звук демки)
// Благодаря этому камера и демка идут ОДНОВРЕМЕННО, а включение/выключение —
// это просто replaceTrack без пересогласования.
async function applyAllTracks(peer) {
  const a = camStreamLocal.getAudioTracks()[0] || null;
  const v = camStreamLocal.getVideoTracks()[0] || null;
  const sv = screenStream?.getVideoTracks()[0] || null;
  const sa = screenStream?.getAudioTracks()[0] || null;
  await peer.tx.audio.sender.replaceTrack(a);
  await peer.tx.cam.sender.replaceTrack(v);
  await peer.tx.screen.sender.replaceTrack(sv);
  await peer.tx.screenAudio.sender.replaceTrack(sa);
}

async function setSlot(slot, track) {
  for (const peer of peers.values()) {
    try { await peer.tx[slot].sender.replaceTrack(track); } catch (e) { console.warn('replaceTrack', slot, e); }
  }
}

function sendMeta() {
  const msg = JSON.stringify({ audio: micEnabled, video: camEnabled, screen: screenSharing });
  for (const peer of peers.values()) {
    if (peer.dc?.readyState === 'open') peer.dc.send(msg);
  }
}

async function setMicEnabled(on) {
  if (on) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const track = stream.getAudioTracks()[0];
      camStreamLocal.getAudioTracks().forEach(t => { t.stop(); camStreamLocal.removeTrack(t); });
      camStreamLocal.addTrack(track);
      micEnabled = true;
      await setSlot('audio', track);
      watchSpeaking('local', camStreamLocal, document.getElementById('local-tile'));
    } catch (e) {
      addSystemMessage(`Мікрофон недоступний${e?.name === 'NotAllowedError' ? ' (немає дозволу)' : ''}`);
      return;
    }
  } else {
    camStreamLocal.getAudioTracks().forEach(t => { t.stop(); camStreamLocal.removeTrack(t); });
    await setSlot('audio', null);
    stopWatching('local');
    document.getElementById('local-tile').classList.remove('speaking');
    micEnabled = false;
  }
  setMicState(micEnabled);
  socket.emit('media:toggle', { audioEnabled: micEnabled });
  sendMeta();
}

async function setCamEnabled(on) {
  if (on) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      });
      const track = stream.getVideoTracks()[0];
      camStreamLocal.getVideoTracks().forEach(t => { t.stop(); camStreamLocal.removeTrack(t); });
      camStreamLocal.addTrack(track);
      camEnabled = true;
      await setSlot('cam', track);
    } catch (e) {
      addSystemMessage(`Камера недоступна${e?.name === 'NotAllowedError' ? ' (немає дозволу)' : ''}`);
      return;
    }
  } else {
    camStreamLocal.getVideoTracks().forEach(t => { t.stop(); camStreamLocal.removeTrack(t); });
    await setSlot('cam', null);
    camEnabled = false;
  }
  setCamState(camEnabled);
  updateLocalVideo();
  socket.emit('media:toggle', { videoEnabled: camEnabled });
  sendMeta();
}

/* ───────────────────────── Плитки ───────────────────────── */
function makeTile({ id, handle, name, screen = false, muted = false }) {
  const tile = document.createElement('div');
  tile.className = `video-tile${screen ? ' screen-share' : ' cam-off'}`;
  tile.id = id;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = muted;
  tile.appendChild(video);

  if (!screen) {
    const av = document.createElement('div');
    av.className = 'tile-avatar';
    av.textContent = (name || handle || '?').charAt(0).toUpperCase();
    tile.appendChild(av);
  }

  const label = document.createElement('div');
  label.className = 'tile-label';
  const text = document.createElement('span');
  text.textContent = screen ? `Екран @${handle || ''}` : (handle ? `@${handle}` : '...');
  label.appendChild(text);
  if (!screen) {
    const icons = document.createElement('div');
    icons.className = 'tile-icons';
    icons.innerHTML =
      `<span class="tile-icon" data-k="a">${icon('mic-off', 'ico ico--sm')}</span>` +
      `<span class="tile-icon" data-k="v">${icon('camera-off', 'ico ico--sm')}</span>`;
    label.appendChild(icons);
  }
  tile.appendChild(label);

  const fs = document.createElement('button');
  fs.className = 'tile-fs';
  fs.type = 'button';
  fs.title = 'На весь екран';
  fs.textContent = '⛶';
  fs.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(tile); });
  tile.appendChild(fs);
  tile.addEventListener('dblclick', () => toggleFullscreen(tile));
  return tile;
}

function toggleFullscreen(el) {
  if (document.fullscreenElement) document.exitFullscreen();
  else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el).catch?.(() => {});
}

function safePlay(video) {
  const p = video.play();
  if (p?.catch) p.catch(() => { soundBanner.style.display = 'block'; });
}

function renderPeerState(peer) {
  const t = peer.tile;
  if (!t) return;
  const set = (k, on, on_i, off_i) => {
    const el = t.querySelector(`.tile-icon[data-k="${k}"]`);
    if (el) el.innerHTML = icon(on ? on_i : off_i, 'ico ico--sm');
  };
  set('a', peer.state.audio, 'mic', 'mic-off');
  set('v', peer.state.video, 'camera', 'camera-off');
  const camOn = !!peer.state.video && peer.camStream.getVideoTracks().length > 0;
  t.classList.toggle('cam-on', camOn);
  t.classList.toggle('cam-off', !camOn);
  syncScreenTile(peer);
}

function syncScreenTile(peer) {
  const track = peer.screenStream.getVideoTracks().find(
    (item) => item.readyState === 'live'
  );

  // Плитка зависит от реального входящего видеотрека, а не от метаданных.
  if (track) {
    peer.state.screen = true;

    if (!peer.screenTile) {
      const tile = makeTile({
        id: `tile-screen-${peer.socketId}`,
        handle: peer.user?.handle,
        screen: true,
        muted: false,
      });

      const video = tile.querySelector('video');
      video.srcObject = peer.screenStream;

      video.addEventListener('loadedmetadata', () => {
        video.play().catch((error) => {
          console.warn('[screen-share] Playback failed:', error);
        });
      }, { once: true });

      videoGrid.prepend(tile);
      peer.screenTile = tile;
      safePlay(video);
      updateGridClass();
    }
  } else if (peer.screenTile) {
    peer.screenTile.remove();
    peer.screenTile = null;
    updateGridClass();
  }
}

/* ───────────────────────── WebRTC ───────────────────────── */
async function createPeer(socketId, isInitiator, userData) {
  if (peers.has(socketId)) return peers.get(socketId);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });
  const peer = {
    socketId, pc, isInitiator, user: userData,
    camStream: new MediaStream(), screenStream: new MediaStream(),
    pendingIce: [], dc: null, restarted: false,
    state: { audio: !!userData?.audioEnabled, video: !!userData?.videoEnabled, screen: false },
    tile: null, screenTile: null, tx: {},
  };
  peers.set(socketId, peer);

  // Порядок добавления ВАЖЕН и одинаков на обеих сторонах.
  peer.tx.audio       = pc.addTransceiver('audio', { direction: 'sendrecv' });
  peer.tx.cam         = pc.addTransceiver('video', { direction: 'sendrecv' });
  peer.tx.screen      = pc.addTransceiver('video', { direction: 'sendrecv' });
  peer.tx.screenAudio = pc.addTransceiver('audio', { direction: 'sendrecv' });

  // Канал метаданных (кто включил микрофон/камеру/демку).
  const bindDc = (dc) => {
    peer.dc = dc;
    dc.onopen = () => sendMeta();
    dc.onmessage = (e) => {
      try { Object.assign(peer.state, JSON.parse(e.data)); renderPeerState(peer); } catch {}
    };
  };
  if (isInitiator) bindDc(pc.createDataChannel('meta'));
  else pc.ondatachannel = (e) => bindDc(e.channel);

  // Плитка участника — сразу, до любых await.
  peer.tile = makeTile({ id: `tile-${socketId}`, handle: userData?.handle, name: userData?.name });
  const camVideo = peer.tile.querySelector('video');
  camVideo.srcObject = peer.camStream;
  videoGrid.appendChild(peer.tile);
  updateGridClass();
  renderPeerState(peer);

  pc.ontrack = (e) => {
    const tr = e.transceiver;
    if (tr === peer.tx.screen || tr === peer.tx.screenAudio) {
      if (!peer.screenStream.getTracks().includes(e.track)) peer.screenStream.addTrack(e.track);
      e.track.onunmute = () => {
        if (tr === peer.tx.screen) peer.state.screen = true; // страховка, если канал метаданных не доехал
        syncScreenTile(peer);
      };
      syncScreenTile(peer);
      peer.screenTile?.querySelector('video')?.play().catch(() => {});
    } else {
      if (!peer.camStream.getTracks().includes(e.track)) peer.camStream.addTrack(e.track);
      e.track.onunmute = () => renderPeerState(peer);
      if (e.track.kind === 'audio') watchSpeaking(socketId, peer.camStream, peer.tile);
      safePlay(camVideo);
      renderPeerState(peer);
    }
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('signal:ice-candidate', { targetSocketId: socketId, candidate: e.candidate });
  };

  pc.onconnectionstatechange = async () => {
    const s = pc.connectionState;
    if (s === 'failed') {
      // одна попытка перезапуска ICE инициатором, потом — убираем
      if (peer.isInitiator && !peer.restarted) {
        peer.restarted = true;
        try {
          pc.restartIce();
          const offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
          socket.emit('signal:offer', { targetSocketId: socketId, offer });
          return;
        } catch {}
      }
      addSystemMessage(`Не вдалося з'єднатися з @${peer.user?.handle || 'учасником'} (потрібен TURN-сервер)`);
      removePeer(socketId);
    } else if (s === 'closed') {
      removePeer(socketId);
    }
  };

  await applyAllTracks(peer);

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal:offer', { targetSocketId: socketId, offer });
  }
  return peer;
}

function removePeer(socketId) {
  const peer = peers.get(socketId);
  if (!peer) return;
  peers.delete(socketId);
  stopWatching(socketId);
  try { peer.dc?.close(); } catch {}
  try { peer.pc.close(); } catch {}
  peer.tile?.remove();
  peer.screenTile?.remove();
  updateGridClass();
}

async function flushIce(peer) {
  const list = peer.pendingIce.splice(0);
  for (const c of list) { try { await peer.pc.addIceCandidate(c); } catch {} }
}

/* ───────────────────────── Сокет-события ───────────────────────── */
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
    if (p.socketId !== socket.id) createPeer(p.socketId, true, p);
  });
});

socket.on('participant:joined', ({ participant }) => {
  addSystemMessage(`@${participant.handle} підключився`);
  renderParticipants([...getAllParticipants().filter(p => p.socketId !== participant.socketId), participant]);
  if (participant.socketId !== socket.id) createPeer(participant.socketId, false, participant);
});

socket.on('participant:left', ({ participant }) => {
  addSystemMessage(`@${participant.handle} вийшов`);
  removePeer(participant.socketId);
});

socket.on('participants:update', ({ participants }) => renderParticipants(participants));

socket.on('signal:offer', async ({ from, offer, user }) => {
  const peer = await createPeer(from, false, user);
  await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
  await flushIce(peer);
  await applyAllTracks(peer);
  const answer = await peer.pc.createAnswer();
  await peer.pc.setLocalDescription(answer);
  socket.emit('signal:answer', { targetSocketId: from, answer });
});

socket.on('signal:answer', async ({ from, answer }) => {
  const peer = peers.get(from);
  if (!peer) return;
  await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
  await flushIce(peer);
});

socket.on('signal:ice-candidate', async ({ from, candidate }) => {
  const peer = peers.get(from);
  if (!peer || !candidate) return;
  const c = new RTCIceCandidate(candidate);
  // Кандидат может прийти раньше offer/answer — раньше он молча терялся.
  if (peer.pc.remoteDescription) { try { await peer.pc.addIceCandidate(c); } catch {} }
  else peer.pendingIce.push(c);
});

socket.on('chat:message', (msg) => addChatMessage(msg));

socket.on('recording:status', ({ isRecording: rec, userName }) => {
  document.getElementById('rec-badge').style.display = rec ? 'flex' : 'none';
  addSystemMessage(rec ? `${userName} почав запис` : `${userName} зупинив запис`);
});

socket.on('conference:ended', () => leaveRoom());

socket.on('error', async ({ message }) => {
  if (!startTime) {
    await showAlert(message);
    location.href = '/conferences.html';
    return;
  }
  addSystemMessage(`${message}`);
});

/* ───────────────────────── Чат / участники ───────────────────────── */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
        <span class="chat-msg-handle">@${escapeHtml(msg.handle)}</span>
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

let currentParticipants = [];
function getAllParticipants() { return currentParticipants; }

function renderParticipants(participants) {
  currentParticipants = participants;
  participantsList.innerHTML = participants.map(p => `
    <div class="participant-item">
      <div class="participant-avatar">${escapeHtml(p.name?.charAt(0) || '?')}</div>
      <div class="participant-info">
        <div class="participant-name">${escapeHtml(p.name || p.handle)}</div>
        <div class="participant-role">${escapeHtml(p.role)} • @${escapeHtml(p.handle)}</div>
      </div>
      <div class="participant-status">
        ${p.screenSharing ? icon('screen', 'ico ico--sm') : ''}
        ${p.audioEnabled ? icon('mic', 'ico ico--sm') : icon('mic-off', 'ico ico--sm')}
        ${p.videoEnabled ? icon('camera', 'ico ico--sm') : icon('camera-off', 'ico ico--sm')}
      </div>
    </div>`).join('');
}

function updateTimer() {
  if (!startTime) return;
  const sec = Math.floor((Date.now() - startTime) / 1000);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  document.getElementById('room-timer').textContent =
    (h ? `${String(h).padStart(2, '0')}:` : '') + `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ───────────────────────── Кнопки ───────────────────────── */
document.getElementById('mic-btn').addEventListener('click', () => { audioCtx()?.resume(); setMicEnabled(!micEnabled); });
document.getElementById('cam-btn').addEventListener('click', () => setCamEnabled(!camEnabled));

document.getElementById('screen-btn').addEventListener('click', async () => {
  if (screenSharing) return stopScreenShare();
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return addSystemMessage('Цей браузер не підтримує демонстрацію екрана');
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      audio: true, // системный звук вкладки/экрана, если браузер даёт
    });
  } catch { return addSystemMessage('Демонстрація екрана скасована'); }

  screenSharing = true;
  document.getElementById('screen-btn').classList.add('active');

  const vTrack = screenStream.getVideoTracks()[0];
  const aTrack = screenStream.getAudioTracks()[0] || null;
  try { vTrack.contentHint = 'detail'; } catch {}
  vTrack.onended = () => stopScreenShare();

  // Локальное превью демки
  const tile = makeTile({ id: 'tile-screen', handle: USER.handle, screen: true, muted: true });
  tile.querySelector('.tile-label span').textContent = 'Ваш екран';
  tile.querySelector('video').srcObject = screenStream;
  videoGrid.prepend(tile);
  updateGridClass();

  // Демка — в ОТДЕЛЬНЫЙ слот, камера и микрофон продолжают работать.
  await setSlot('screen', vTrack);
  await setSlot('screenAudio', aTrack);
  // Поднимем битрейт для читаемого текста на экране
  for (const peer of peers.values()) {
    try {
      const p = peer.tx.screen.sender.getParameters();
      if (p.encodings?.length) { p.encodings[0].maxBitrate = 3_000_000; await peer.tx.screen.sender.setParameters(p); }
    } catch {}
  }

  socket.emit('media:toggle', { screenSharing: true });
  sendMeta();
});

async function stopScreenShare() {
  if (!screenSharing) return;
  screenSharing = false;
  screenStream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
  screenStream = null;
  document.getElementById('screen-btn').classList.remove('active');
  document.getElementById('tile-screen')?.remove();
  updateGridClass();
  await setSlot('screen', null);
  await setSlot('screenAudio', null);
  socket.emit('media:toggle', { screenSharing: false });
  sendMeta();
}

/* ───────────────────────── Запись (демка/камера + все голоса) ───────────────────────── */
function buildRecordingStream() {
  const ctx = audioCtx();
  const out = new MediaStream();
  const videoTrack = screenStream?.getVideoTracks()[0] || camStreamLocal.getVideoTracks()[0];
  if (videoTrack) out.addTrack(videoTrack);

  if (ctx) {
    const dest = ctx.createMediaStreamDestination();
    const nodes = [];
    const add = (stream) => {
      if (!stream?.getAudioTracks().length) return;
      const n = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      n.connect(dest); nodes.push(n);
    };
    add(camStreamLocal);
    add(screenStream);
    peers.forEach(p => { add(p.camStream); add(p.screenStream); });
    dest.stream.getAudioTracks().forEach(t => out.addTrack(t));
    recMix = { nodes, dest };
  }
  return out;
}

document.getElementById('rec-btn').addEventListener('click', async () => {
  if (isRecording) { mediaRecorder?.stop(); return; }
  try {
    const stream = buildRecordingStream();
    if (!stream.getTracks().length) return addSystemMessage('Немає відеопотоку для запису');

    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      isRecording = false;
      recMix?.nodes.forEach(n => { try { n.disconnect(); } catch {} });
      recMix = null;
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
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: fd,
    });
    if (!res.ok) throw new Error('upload');
    addSystemMessage('Запис збережено — розділ «Записи»');
  } catch {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `recording-${Date.now()}.webm`; a.click();
    addSystemMessage('Запис завантажено локально');
  }
}

/* ───────────────────────── Чат-ввод, сайдбар, ссылки ───────────────────────── */
const chatInput = document.getElementById('chat-input');
document.getElementById('chat-send').addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
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

/* ───────────────────────── Выход ───────────────────────── */
function leaveRoom() {
  clearInterval(timerInterval);
  socket.emit('room:leave');
  [...peers.keys()].forEach(removePeer);
  [...speakingWatchers.keys()].forEach(stopWatching);
  camStreamLocal.getTracks().forEach(t => t.stop());
  screenStream?.getTracks().forEach(t => t.stop());
  location.href = '/conferences.html';
}

async function handleLeaveClick() {
  if (isHost) {
    const ok = await showConfirm('Завершити конференцію для всіх учасників?', { confirmText: 'Завершити', danger: true });
    if (!ok) return;
    socket.emit('room:end');
    return;
  }
  leaveRoom();
}
document.getElementById('leave-ctrl-btn').addEventListener('click', handleLeaveClick);
document.getElementById('leave-btn').addEventListener('click', (e) => { e.preventDefault(); handleLeaveClick(); });

window.addEventListener('beforeunload', () => socket.emit('room:leave'));
document.addEventListener('visibilitychange', () => {
  socket.emit('presence:visibility', { hidden: document.hidden });
});

/* ───────────────────────── Старт ───────────────────────── */
async function initMedia() {
  await loadIceServers();
  document.getElementById('local-label').textContent = `@${USER.handle}`;
  document.getElementById('local-avatar').textContent = USER.name?.charAt(0) || USER.handle?.charAt(0) || '?';
  setMicState(false);
  setCamState(false);
  updateLocalVideo();
  socket.emit('room:join', { conferenceId: CONF_ID });
}
initMedia();