import * as homeworkReminder from '../services/homework-reminder.service.js';

export async function getSettings(req, res) {
  res.json({ settings: homeworkReminder.getSettings() });
}

export async function saveSettings(req, res) {
  const settings = homeworkReminder.saveSettings(req.body);
  res.json({ settings, message: 'Нагадування про ДЗ збережено' });
}
