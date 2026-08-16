export const ADMIN_ROLES = ['teacher', 'owner', 'developer'];

export function isAdminUser(user) {
  return !!user && ADMIN_ROLES.includes(user.role);
}
