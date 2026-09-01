import * as notificationService from '../services/notification.service.js';
import * as webpushService from '../services/webpush.service.js';

export async function listNotifications(req, res) {
  const notifications = notificationService.listNotifications(req.user.id, {
    unreadOnly: req.query.unreadOnly === '1',
    limit: req.query.limit,
    beforeId: req.query.beforeId,
  });
  res.json({ notifications });
}

export async function getUnreadCount(req, res) {
  res.json({ count: notificationService.getUnreadCount(req.user.id) });
}

export async function markRead(req, res) {
  const id = parseInt(req.params.id, 10);
  res.json(notificationService.markRead(req.user.id, id));
}

export async function markAllRead(req, res) {
  res.json(notificationService.markAllRead(req.user.id));
}

export async function deleteNotification(req, res) {
  const id = parseInt(req.params.id, 10);
  res.json(notificationService.deleteNotification(req.user.id, id));
}

export async function getPushPublicKey(req, res) {
  res.json({ publicKey: webpushService.getPublicKey() });
}

export async function subscribePush(req, res) {
  res.json(webpushService.saveSubscription(req.user.id, req.body));
}

export async function unsubscribePush(req, res) {
  res.json(webpushService.removeSubscription(req.user.id, req.body?.endpoint));
}
