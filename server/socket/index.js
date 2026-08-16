import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import * as conferenceService from '../services/conference.service.js';
import * as chatService from '../services/chat.service.js';
import * as userService from '../services/user.service.js';
import { getAccessStatus } from '../services/payment.service.js';

const roomSockets = new Map();

function getRoom(roomId) {
  if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Map());
  return roomSockets.get(roomId);
}

function broadcastRoom(io, roomId, event, data, excludeId) {
  const room = getRoom(roomId);
  for (const [socketId, info] of room) {
    if (socketId !== excludeId) {
      io.to(socketId).emit(event, data);
    }
  }
}

function getOnlineParticipants(roomId) {
  const room = getRoom(roomId);
  return Array.from(room.values()).map(p => ({
    socketId: p.socketId,
    userId: p.userId,
    name: p.name,
    handle: p.handle,
    role: p.role,
    audioEnabled: p.audioEnabled,
    videoEnabled: p.videoEnabled,
    screenSharing: p.screenSharing,
  }));
}

export function initSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Потрібна авторизація'));
    try {
      socket.user = jwt.verify(token, config.jwt.secret);
      const user = userService.findById(socket.user.id);
      if (!user) return next(new Error('Користувача не знайдено'));
      socket.userData = userService.toPublic(user);
      const billing = getAccessStatus(socket.user.id);
      if (!billing.access) return next(new Error('Доступ призупинено через прострочену оплату'));
      next();
    } catch {
      next(new Error('Недійсний токен'));
    }
  });

  io.on('connection', (socket) => {
    let currentRoom = null;
    let currentChatChannel = null;

    socket.on('room:join', async ({ conferenceId }) => {
      try {
        const conf = conferenceService.getById(conferenceId);
        if (!conf) return socket.emit('error', { message: 'Конференцію не знайдено' });
        if (conf.status === 'ended' || conf.status === 'cancelled') {
          return socket.emit('error', { message: 'Конференцію завершено' });
        }

        const roomBeforeJoin = getRoom(String(conferenceId));
        const alreadyConnected = [...roomBeforeJoin.values()].some(p => p.userId === socket.user.id);
        if (alreadyConnected) {
          return socket.emit('error', { message: 'Цей акаунт вже підключений до конференції з іншого пристрою' });
        }

        conferenceService.join(conferenceId, socket.user.id, socket.user.role || 'student');

        if (conf.status === 'scheduled' && conf.host_user_id === socket.user.id) {
          conferenceService.start(conferenceId, socket.user.id);
        }

        currentRoom = String(conferenceId);
        socket.join(currentRoom);

        const role = conf.host_user_id === socket.user.id ? 'host' : 'participant';
        const room = getRoom(currentRoom);
        room.set(socket.id, {
          socketId: socket.id,
          userId: socket.user.id,
          name: socket.userData.name,
          handle: socket.userData.handle,
          role,
          audioEnabled: false,
          videoEnabled: false,
          screenSharing: false,
        });

        const messages = conferenceService.getMessages(conferenceId);
        const participants = getOnlineParticipants(currentRoom);

        socket.emit('room:joined', { conference: conf, participants, messages });
        broadcastRoom(io, currentRoom, 'participant:joined', {
          participant: room.get(socket.id),
        }, socket.id);
        broadcastRoom(io, currentRoom, 'participants:update', { participants });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('signal:offer', ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit('signal:offer', { from: socket.id, offer, user: socket.userData });
    });

    socket.on('signal:answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('signal:answer', { from: socket.id, answer });
    });

    socket.on('signal:ice-candidate', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('signal:ice-candidate', { from: socket.id, candidate });
    });

    socket.on('media:toggle', ({ audioEnabled, videoEnabled, screenSharing }) => {
      if (!currentRoom) return;
      const room = getRoom(currentRoom);
      const p = room.get(socket.id);
      if (!p) return;
      if (audioEnabled !== undefined) p.audioEnabled = audioEnabled;
      if (videoEnabled !== undefined) p.videoEnabled = videoEnabled;
      if (screenSharing !== undefined) p.screenSharing = screenSharing;
      broadcastRoom(io, currentRoom, 'participant:updated', { participant: p });
      broadcastRoom(io, currentRoom, 'participants:update', { participants: getOnlineParticipants(currentRoom) });
    });

    socket.on('chat:message', ({ message }) => {
      if (!currentRoom || !message?.trim()) return;
      const saved = conferenceService.saveMessage(
        parseInt(currentRoom, 10),
        socket.user.id,
        socket.userData.handle,
        message.trim(),
      );
      io.to(currentRoom).emit('chat:message', {
        id: saved.id,
        userId: socket.user.id,
        handle: socket.userData.handle,
        name: socket.userData.name,
        message: saved.message,
        msg_type: saved.msg_type,
        created_at: saved.created_at,
      });
    });

    socket.on('chat:join', ({ channelId }) => {
      try {
        const id = parseInt(channelId, 10);
        chatService.getMessages(id, socket.user.id, socket.user.role || 'student', { limit: 1 });
        if (currentChatChannel) socket.leave(`chat:${currentChatChannel}`);
        currentChatChannel = String(id);
        socket.join(`chat:${currentChatChannel}`);
        const messages = chatService.getMessages(id, socket.user.id, socket.user.role || 'student');
        socket.emit('chat:joined', { channelId: id, messages });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('chat:send', (payload) => {
      if (!currentChatChannel) return;
      try {
        const message = chatService.sendMessage(
          parseInt(currentChatChannel, 10),
          socket.user.id,
          socket.user.role || 'student',
          payload,
        );
        io.to(`chat:${currentChatChannel}`).emit('chat:message', message);
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('chat:leave', () => {
      if (!currentChatChannel) return;
      socket.leave(`chat:${currentChatChannel}`);
      currentChatChannel = null;
    });

    socket.on('recording:status', ({ isRecording, userName }) => {
      if (!currentRoom) return;
      io.to(currentRoom).emit('recording:status', {
        isRecording,
        userId: socket.user.id,
        userName: userName || socket.userData.name,
      });
    });

    function leaveRoom() {
      if (!currentRoom) return;
      const room = getRoom(currentRoom);
      const participant = room.get(socket.id);
      room.delete(socket.id);

      if (participant) {
        conferenceService.leave(parseInt(currentRoom, 10), socket.user.id);
        broadcastRoom(io, currentRoom, 'participant:left', { participant });
        broadcastRoom(io, currentRoom, 'participants:update', { participants: getOnlineParticipants(currentRoom) });
      }

      if (room.size === 0) roomSockets.delete(currentRoom);
      socket.leave(currentRoom);
      currentRoom = null;
    }

    socket.on('room:leave', () => leaveRoom());

    socket.on('disconnect', () => {
      if (currentChatChannel) {
        socket.leave(`chat:${currentChatChannel}`);
        currentChatChannel = null;
      }
      leaveRoom();
    });
  });
}
