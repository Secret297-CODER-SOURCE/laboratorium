export function getTier(points) {
  if (points >= 5000) return { name: 'Elite Operator', min: 5000, max: null };
  if (points >= 2000) return { name: 'White Hat', min: 2000, max: 4999 };
  if (points >= 500) return { name: 'Grey Hat', min: 500, max: 1999 };
  return { name: 'Script Kiddie', min: 0, max: 499 };
}

export function getNextTier(points) {
  if (points < 500) return getTier(500);
  if (points < 2000) return getTier(2000);
  if (points < 5000) return getTier(5000);
  return null;
}

export function sanitizeUser(user) {
  const tier = getTier(user.bounty_points);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    handle: user.handle,
    role: user.role || 'student',
    bounty_points: user.bounty_points,
    tier: tier.name,
    created_at: user.created_at,
  };
}
