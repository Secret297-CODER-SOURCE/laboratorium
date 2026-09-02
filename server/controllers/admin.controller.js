import * as adminService from '../services/admin.service.js';
import * as directionService from '../services/direction.service.js';
import * as programService from '../services/program.service.js';
import * as userService from '../services/user.service.js';
import * as passwordService from '../services/password.service.js';
import * as groupService from '../services/group.service.js';
import * as taskService from '../services/task.service.js';
import * as articleService from '../services/article.service.js';
import * as settingsService from '../services/settings.service.js';
import * as tabAccessService from '../services/tab-access.service.js';
import * as paymentService from '../services/payment.service.js';
import * as labService from '../services/lab.service.js';
import * as notificationService from '../services/notification.service.js';
import { addBounty } from '../services/bounty.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { isAdminRole } from '../utils/roles.js';

export async function getOverview(req, res) {
  const role = req.user.role || 'student';
  if (!isAdminRole(role)) throw new ForbiddenError();

  if (role === 'teacher') {
    const data = adminService.getTeacherDashboard(req.user.id);
    return res.json({ role, ...data });
  }

  const stats = adminService.getPlatformStats();
  const applications = adminService.listApplications('pending').slice(0, 10);

  if (role === 'developer') {
    return res.json({ role, ...adminService.getDeveloperInfo(), applications });
  }

  if (role === 'owner') {
    return res.json({
      role,
      ...adminService.getOwnerDashboard(),
      directions: directionService.getAll(),
      programs: programService.getAllAdmin(),
    });
  }

  return res.status(403).json({ error: 'Недостатньо прав доступу' });
}

export async function listUsers(req, res) {
  res.json({ users: adminService.listUsers(req.user.role) });
}

export async function createUser(req, res) {
  const result = await userService.adminCreateUser(req.body);
  res.status(201).json({
    user: userService.toPublic(result.user),
    password: result.password,
    emailSent: result.emailSent,
  });
}

export async function updateUserRole(req, res) {
  const user = adminService.updateUserRole(
    req.user.id,
    req.user.role,
    parseInt(req.params.id, 10),
    req.body.role,
  );
  res.json({ user });
}

export async function sendUserPasswordReset(req, res) {
  const result = await passwordService.adminSendPasswordReset(parseInt(req.params.id, 10));
  res.json(result);
}

export async function sendUserNewPassword(req, res) {
  const result = await passwordService.adminSendNewPassword(parseInt(req.params.id, 10));
  res.json(result);
}

export async function listApplications(req, res) {
  res.json({ applications: adminService.listApplications(req.query.status) });
}

export async function updateApplication(req, res) {
  const app = await adminService.updateApplicationStatus(
    parseInt(req.params.id, 10),
    req.body.status,
    req.body.createAccount,
    req.user,
  );
  res.json({ application: app.application, account: app.account });
}

export async function listDirections(req, res) {
  res.json({ directions: directionService.getAll() });
}

export async function createDirection(req, res) {
  res.status(201).json({ direction: directionService.create(req.body) });
}

export async function updateDirection(req, res) {
  res.json({ direction: directionService.update(parseInt(req.params.id, 10), req.body) });
}

export async function deleteDirection(req, res) {
  res.json(await directionService.remove(parseInt(req.params.id, 10)));
}

export async function listPrograms(req, res) {
  res.json({ programs: programService.getAllAdmin() });
}

export async function createProgram(req, res) {
  res.status(201).json({ program: programService.create(req.body) });
}

export async function updateProgram(req, res) {
  res.json({ program: programService.update(parseInt(req.params.id, 10), req.body) });
}

export async function deleteProgram(req, res) {
  res.json(await programService.remove(parseInt(req.params.id, 10)));
}

export async function listGroups(req, res) {
  const all = req.query.all === '1' && ['owner', 'developer'].includes(req.user.role);
  res.json({
    groups: groupService.listGroups(req.user.id, req.user.role, { all }),
  });
}

export async function createGroup(req, res) {
  res.status(201).json({
    group: groupService.createGroup(req.user.id, req.user.role, req.body),
  });
}

export async function updateGroup(req, res) {
  res.json({
    group: groupService.updateGroup(parseInt(req.params.id, 10), req.user.id, req.user.role, req.body),
  });
}

export async function deleteGroup(req, res) {
  res.json(groupService.deleteGroup(parseInt(req.params.id, 10), req.user.id, req.user.role));
}

export async function listGroupMembers(req, res) {
  const groupId = parseInt(req.params.id, 10);
  res.json({
    members: groupService.listGroupMembers(groupId, req.user.id, req.user.role),
  });
}

export async function addGroupMembers(req, res) {
  const groupId = parseInt(req.params.id, 10);
  const userIds = req.body.userIds || req.body.userId;
  const members = groupService.addGroupMembers(groupId, req.user.id, req.user.role, userIds);
  const group = groupService.getGroupById(groupId);

  // Only notify ids group.service actually confirmed as real students in this
  // group (members) — notifying a raw, unvalidated id from the request could
  // hit a non-existent user and violate the notifications FK constraint.
  const requestedIds = new Set((Array.isArray(userIds) ? userIds : [userIds]).map((id) => parseInt(id, 10)));
  const addedIds = members.filter((m) => requestedIds.has(m.id)).map((m) => m.id);
  notificationService.notifyUsers(addedIds, {
    type: 'group_added',
    title: 'Вас додано до групи',
    body: group?.name || null,
    link: '/dashboard.html',
  });
  res.json({ members });
}

export async function removeGroupMember(req, res) {
  const groupId = parseInt(req.params.id, 10);
  const userId = parseInt(req.params.userId, 10);
  groupService.removeGroupMember(groupId, userId, req.user.id, req.user.role);
  res.json({ ok: true });
}

export async function updateGroupMemberRole(req, res) {
  const groupId = parseInt(req.params.id, 10);
  const userId = parseInt(req.params.userId, 10);
  const member = groupService.updateMemberRole(
    groupId,
    userId,
    req.body.member_role,
    req.user.id,
    req.user.role,
  );
  res.json({ member, message: 'Роль учня оновлено' });
}

export async function listArticles(req, res) {
  res.json({ articles: articleService.listSubmittedForTeacher(req.user.id, req.user.role) });
}

export async function listAvailableStudents(req, res) {
  const groupId = req.query.groupId ? parseInt(req.query.groupId, 10) : null;
  res.json({
    students: groupService.listAvailableStudents(req.user.id, req.user.role, groupId),
  });
}

export async function listTasks(req, res) {
  res.json(taskService.listForTeacher(req.user.id, req.user.role));
}

export async function createTask(req, res) {
  const task = taskService.createTask(req.user.id, req.user.role, req.body);
  const assigneeIds = taskService.getTaskAssigneeIds(task.id);
  notificationService.notifyUsers(assigneeIds, {
    type: 'task_assigned',
    title: 'Нове завдання',
    body: task.title,
    link: '/dashboard.html',
  });
  res.status(201).json({ task, message: 'Задачу створено для учнів групи' });
}

export async function deleteTask(req, res) {
  const taskId = parseInt(req.params.id, 10);
  res.json(taskService.deleteTask(taskId, req.user.id, req.user.role));
}

export async function approveTask(req, res) {
  const assignmentId = parseInt(req.params.id, 10);
  const result = taskService.approveTask(req.user.id, req.user.role, assignmentId);
  if (result.bounty_reward > 0) {
    addBounty(result.user_id, result.bounty_reward, `Задача: ${result.title}`);
  }
  notificationService.notifyUser(result.user_id, {
    type: 'task_approved',
    title: 'Завдання зараховано',
    body: result.bounty_reward > 0 ? `«${result.title}» — +${result.bounty_reward} bounty` : `«${result.title}»`,
    link: '/dashboard.html',
  });
  res.json({ ok: true, assignment: result.assignment, message: 'Задачу завершено' });
}

export async function rejectTask(req, res) {
  const assignmentId = parseInt(req.params.id, 10);
  const assignment = taskService.rejectTask(req.user.id, req.user.role, assignmentId);
  notificationService.notifyUser(assignment.user_id, {
    type: 'task_rejected',
    title: 'Задачу повернуто на доопрацювання',
    body: assignment.title,
    link: '/dashboard.html',
  });
  res.json({ ok: true, assignment, message: 'Повернуто на доопрацювання' });
}

export async function getLabPublicSettings(req, res) {
  res.json({ settings: settingsService.getLabPublicSettingsPublic() });
}

export async function updateLabPublicSettings(req, res) {
  const settings = settingsService.saveLabPublicSettings(req.body);
  res.json({ settings, message: 'Налаштування доступу збережено' });
}

export async function getProxmoxSettings(req, res) {
  res.json({ settings: settingsService.getProxmoxSettingsPublic() });
}

export async function updateProxmoxSettings(req, res) {
  const wasEnabled = settingsService.getProxmoxSettingsPublic().configured;
  const settings = settingsService.saveProxmoxSettings(req.body);
  let provisioned = null;
  if (!wasEnabled && settings.configured) {
    provisioned = await labService.provisionMissingStudents();
  }
  const isBackupOnly = req.body.host === undefined && req.body.enabled === undefined;
  res.json({
    settings,
    provisioned,
    message: isBackupOnly
      ? 'Розклад бекапів збережено'
      : (settings.configured ? 'Налаштування Proxmox збережено' : 'Proxmox вимкнено'),
  });
}

export async function provisionMissingLabs(req, res) {
  const result = await labService.provisionMissingStudents();
  res.json({ ...result, message: `Запущено створення ${result.started} машин` });
}

export async function listLabs(req, res) {
  res.json({ labs: labService.adminListLabs() });
}

export async function adminStartVm(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const vm = await labService.startVm(userId);
  notificationService.notifyUser(userId, {
    type: 'lab_ready',
    title: 'Вашу машину запущено',
    body: 'Адміністратор запустив вашу лабораторну машину',
    link: '/dashboard.html?tab=lab',
  });
  res.json({ vm, message: 'Машину запущено' });
}

export async function adminStopVm(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const vm = await labService.stopVm(userId);
  notificationService.notifyUser(userId, {
    type: 'lab_stopped',
    title: 'Вашу машину зупинено',
    body: 'Адміністратор зупинив вашу лабораторну машину',
    link: '/dashboard.html?tab=lab',
  });
  res.json({ vm, message: 'Машину зупинено' });
}

export async function adminResetVm(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const user = userService.findById(userId);
  if (!user) throw new NotFoundError('Учня не знайдено');
  const vm = await labService.resetVm(userId, user.handle);
  notificationService.notifyUser(userId, {
    type: 'lab_reset',
    title: 'Вашу машину пересоздано',
    body: vm?.ip ? `Нова IP-адреса: ${vm.ip}` : null,
    link: '/dashboard.html?tab=lab',
  });
  res.json({ vm, message: 'Машину пересоздано' });
}

export async function adminTransferVm(req, res) {
  const fromUserId = parseInt(req.params.userId, 10);
  const toUserId = parseInt(req.body.toUserId, 10);
  const vm = labService.transferLab(fromUserId, toUserId);
  notificationService.notifyUser(toUserId, {
    type: 'lab_ready',
    title: 'Вам передано лабораторну машину',
    body: vm?.ip ? `IP: ${vm.ip}` : null,
    link: '/dashboard.html?tab=lab',
  });
  res.json({ vm, message: 'Машину передано іншому учню' });
}

export async function adminLinkVm(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const vm = await labService.linkExistingVm(userId, req.body.vmid, req.body.ip);
  notificationService.notifyUser(userId, {
    type: 'lab_ready',
    title: 'Вам прив\'язано лабораторну машину',
    body: vm?.ip ? `IP: ${vm.ip}` : null,
    link: '/dashboard.html?tab=lab',
  });
  res.json({ vm, message: 'Машину прив\'язано до учня' });
}

export async function adminDeleteVm(req, res) {
  const userId = parseInt(req.params.userId, 10);
  await labService.deleteLab(userId);
  notificationService.notifyUser(userId, {
    type: 'lab_deleted',
    title: 'Вашу машину видалено',
    body: 'Адміністратор видалив вашу лабораторну машину',
    link: '/dashboard.html?tab=lab',
  });
  res.json({ ok: true, message: 'Машину видалено' });
}

export async function listVmBackups(req, res) {
  const userId = parseInt(req.params.userId, 10);
  res.json({ backups: labService.listVmBackups(userId) });
}

export async function createVmBackup(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const backup = await labService.createVmBackup(userId, req.body?.label);
  res.status(201).json({ backup, message: 'Бекап машини створено' });
}

export async function restoreVmBackup(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const backupId = parseInt(req.params.backupId, 10);
  const vm = await labService.restoreVmBackup(userId, backupId);
  res.json({ vm, message: 'Машину відновлено з бекапу' });
}

export async function deleteVmBackup(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const backupId = parseInt(req.params.backupId, 10);
  const result = await labService.deleteVmBackup(userId, backupId);
  res.json({ ...result, message: 'Бекап видалено' });
}

export async function listDockerBackups(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const deployId = parseInt(req.params.deployId, 10);
  res.json({ backups: labService.listDockerBackups(userId, deployId) });
}

export async function createDockerBackup(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const deployId = parseInt(req.params.deployId, 10);
  const backup = await labService.createDockerBackup(userId, deployId, req.body?.label);
  res.status(201).json({ backup, message: 'Бекап контейнера створено' });
}

export async function restoreDockerBackup(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const backupId = parseInt(req.params.backupId, 10);
  const deployment = await labService.restoreDockerBackup(userId, backupId);
  res.json({ deployment, message: 'Контейнер відновлено з бекапу' });
}

export async function deleteDockerBackup(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const backupId = parseInt(req.params.backupId, 10);
  const result = await labService.deleteDockerBackup(userId, backupId);
  res.json({ ...result, message: 'Бекап видалено' });
}

export async function getTabAccessSettings(_req, res) {
  res.json(tabAccessService.getTabAccessSettings());
}

export async function saveTabAccessSettings(req, res) {
  const data = tabAccessService.saveTabAccessSettings(req.body);
  res.json({ ...data, message: 'Правила доступу збережено' });
}

export async function getBillingOverview(req, res) {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);
  res.json(paymentService.listBillingOverview({ year, month }));
}

export async function recordBillingPayment(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const { year, month, note, amount } = req.body;
  const payment = paymentService.recordPayment({
    userId,
    year,
    month,
    note,
    amount,
    recordedBy: req.user.id,
  });
  notificationService.notifyUser(userId, {
    type: 'billing_recorded',
    title: 'Оплату отримано',
    body: `Дякуємо! Оплату за ${payment.period_month}/${payment.period_year} зафіксовано.`,
    link: '/portal.html',
  });
  res.status(201).json({ payment, message: 'Оплату зафіксовано' });
}

export async function deleteBillingPayment(req, res) {
  const paymentId = parseInt(req.params.paymentId, 10);
  paymentService.removePayment(paymentId);
  res.json({ ok: true, message: 'Запис оплати видалено' });
}

export async function updateBillingUser(req, res) {
  const userId = parseInt(req.params.userId, 10);
  const user = paymentService.updateBillingSettings(userId, req.body);
  res.json({ user, message: 'Налаштування оплати оновлено' });
}

/** Ручна розсилка оголошення учням: вчитель — лише своїй групі, owner/developer — будь-якій аудиторії. */
export async function createAnnouncement(req, res) {
  const title = req.body.title?.trim();
  if (!title) throw new ValidationError('Вкажіть заголовок оголошення');

  let audienceType = req.body.audienceType || 'all';
  let groupId = req.body.groupId ? parseInt(req.body.groupId, 10) : null;
  let programId = req.body.programId ? parseInt(req.body.programId, 10) : null;

  if (req.user.role === 'teacher') {
    if (!groupId) throw new ValidationError('Оберіть групу');
    const group = groupService.getGroupById(groupId);
    if (!group || group.teacher_id !== req.user.id) throw new ForbiddenError('Немає доступу до цієї групи');
    audienceType = 'group';
    programId = null;
  }

  const userIds = notificationService.resolveStudentAudience({ audienceType, groupId, programId });
  notificationService.notifyUsers(userIds, {
    type: 'announcement',
    title,
    body: req.body.body?.trim() || null,
    link: req.body.link?.trim() || '/dashboard.html',
  });

  res.status(201).json({ ok: true, sent: userIds.length, message: `Оголошення надіслано ${userIds.length} учням` });
}
