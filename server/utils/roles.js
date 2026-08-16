export const ROLES = ['student', 'teacher', 'owner', 'developer'];

/** Додаткові ролі учня в групі (призначає викладач) */
export const STUDENT_MEMBER_ROLES = ['student', 'author'];

export const STUDENT_MEMBER_ROLE_LABELS = {
  student: 'Учень',
  author: 'Автор',
};

export const ROLE_RANK = { student: 0, teacher: 1, owner: 2, developer: 3 };

export function isRole(user, ...roles) {
  return roles.includes(user?.role || 'student');
}

export function canAssignRole(actorRole, targetRole) {
  if (actorRole === 'developer') return ROLES.includes(targetRole);
  if (actorRole === 'owner') return ['student', 'teacher', 'owner'].includes(targetRole);
  return false;
}

export function isAdminRole(role) {
  return ['teacher', 'owner', 'developer'].includes(role);
}

/** Повний доступ до платформи (власник = головний адмін) */
export function isPlatformAdmin(role) {
  return ['owner', 'developer'].includes(role);
}
