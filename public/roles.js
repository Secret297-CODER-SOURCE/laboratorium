export const ADMIN_ROLES = ['teacher', 'owner', 'developer'];

export function isAdminUser(user) {
  return !!user && ADMIN_ROLES.includes(user.role);
}

/** Self-registered account not yet approved via a course application. */
export function isRestrictedUser(user) {
  return !!user?.is_restricted;
}
