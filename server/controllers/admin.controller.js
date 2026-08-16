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
import { addBounty } from '../services/bounty.service.js';
import { ForbiddenError } from '../utils/errors.js';
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
  res.status(201).json({ user: userService.toPublic(result.user), password: result.password });
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
  res.json({
    members: groupService.addGroupMembers(groupId, req.user.id, req.user.role, userIds),
  });
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
  res.json({ ok: true, assignment: result.assignment, message: 'Задачу завершено' });
}

export async function rejectTask(req, res) {
  const assignmentId = parseInt(req.params.id, 10);
  const assignment = taskService.rejectTask(req.user.id, req.user.role, assignmentId);
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
  res.json({
    settings,
    provisioned,
    message: settings.configured ? 'Налаштування Proxmox збережено' : 'Proxmox вимкнено',
  });
}

export async function provisionMissingLabs(req, res) {
  const result = await labService.provisionMissingStudents();
  res.json({ ...result, message: `Запущено створення ${result.started} машин` });
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
