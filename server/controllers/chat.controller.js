import * as chatService from '../services/chat.service.js';

export async function getInbox(req, res) {
  res.json(chatService.getInbox(req.user.id, req.user.role));
}

export async function getGroupChannel(req, res) {
  const groupId = parseInt(req.params.groupId, 10);
  const data = chatService.getGroupChannel(groupId, req.user.id, req.user.role);
  const messages = chatService.getMessages(data.channel.id, req.user.id, req.user.role);
  res.json({ ...data, messages });
}

export async function getMessages(req, res) {
  const channelId = parseInt(req.params.id, 10);
  const messages = chatService.getMessages(channelId, req.user.id, req.user.role, {
    limit: req.query.limit,
    before: req.query.before,
  });
  res.json({ messages });
}

export async function sendMessage(req, res) {
  const channelId = parseInt(req.params.id, 10);
  const message = chatService.sendMessage(channelId, req.user.id, req.user.role, req.body);
  res.status(201).json({ message });
}

export async function createDm(req, res) {
  const data = chatService.getOrCreateDm(req.user.id, req.body.userId, req.user.role);
  const messages = chatService.getMessages(data.channel_id, req.user.id, req.user.role);
  res.json({ ...data, messages });
}

export async function listDmCandidates(req, res) {
  const groupId = req.query.groupId ? parseInt(req.query.groupId, 10) : null;
  res.json({
    users: chatService.listDmCandidates(req.user.id, req.user.role, groupId),
  });
}

export async function uploadMedia(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Файл не завантажено' });
  const url = chatService.chatUploadUrl(req.file.filename);
  const msgType = req.file.mimetype.startsWith('video/') ? 'video' : (
    req.file.mimetype === 'image/gif' ? 'gif' : 'image'
  );
  res.json({ url, msg_type: msgType });
}

export async function getGroupRanking(req, res) {
  const groupId = parseInt(req.params.groupId, 10);
  res.json(chatService.getGroupRanking(groupId, req.user.id, req.user.role));
}

export async function listGroupDms(req, res) {
  const groupId = parseInt(req.params.groupId, 10);
  res.json({ dms: chatService.listGroupDms(groupId, req.user.id, req.user.role) });
}

export async function listMyGroups(req, res) {
  res.json({ groups: chatService.listMyGroups(req.user.id, req.user.role) });
}
