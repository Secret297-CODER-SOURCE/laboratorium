import * as conferenceService from '../services/conference.service.js';

export async function create(req, res) {
  const conf = conferenceService.create({
    hostId: req.user.id,
    hostRole: req.user.role,
    ...req.body,
  });
  res.status(201).json({ conference: conf });
}

export async function list(req, res) {
  const { status, from, to } = req.query;
  res.json({
    conferences: conferenceService.list({
      userId: req.user.id,
      userRole: req.user.role,
      status,
      from,
      to,
    }),
  });
}

export async function schedule(req, res) {
  const from = req.query.from || new Date().toISOString();
  const to = req.query.to || new Date(Date.now() + 30 * 86400000).toISOString();
  res.json({ conferences: conferenceService.getSchedule(from, to) });
}

export async function upcoming(req, res) {
  res.json({
    conferences: conferenceService.getUpcoming(req.user.id, req.user.role),
  });
}

export async function getById(req, res) {
  const conf = conferenceService.getById(parseInt(req.params.id, 10));
  if (!conf) return res.status(404).json({ error: 'Конференцію не знайдено' });
  res.json({
    conference: conf,
    participants: conferenceService.getParticipants(conf.id),
    messages: conferenceService.getMessages(conf.id),
  });
}

export async function getByCode(req, res) {
  const conf = conferenceService.getByRoomCode(req.params.code);
  if (!conf) return res.status(404).json({ error: 'Кімнату не знайдено' });
  res.json({ conference: conf });
}

export async function join(req, res) {
  const conf = conferenceService.join(
    parseInt(req.params.id, 10),
    req.user.id,
    req.user.role,
  );
  res.json({ conference: conf, roomUrl: `/room.html?id=${conf.id}` });
}

export async function start(req, res) {
  const conf = conferenceService.start(parseInt(req.params.id, 10), req.user.id);
  res.json({ conference: conf });
}

export async function end(req, res) {
  const conf = conferenceService.end(parseInt(req.params.id, 10), req.user.id);
  res.json({ conference: conf });
}

export async function cancel(req, res) {
  const conf = conferenceService.cancel(parseInt(req.params.id, 10), req.user.id);
  res.json({ conference: conf });
}

export async function getMessages(req, res) {
  const messages = conferenceService.getMessages(parseInt(req.params.id, 10));
  res.json({ messages });
}
