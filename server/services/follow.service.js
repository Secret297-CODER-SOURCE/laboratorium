import db from '../db/index.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';

function getStudentByHandle(handle) {
  const user = db.prepare(`
    SELECT id, handle, name, role, profile_public
    FROM users WHERE lower(handle) = lower(?)
  `).get(String(handle || '').trim());
  if (!user || user.role !== 'student') throw new NotFoundError('Профіль не знайдено');
  return user;
}

export function isFollowing(followerId, followingId) {
  if (!followerId || !followingId || followerId === followingId) return false;
  return !!db.prepare(`
    SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ? LIMIT 1
  `).get(followerId, followingId);
}

export function areConnected(userA, userB) {
  return isFollowing(userA, userB) || isFollowing(userB, userA);
}

export function getFollowCounts(userId) {
  const followers = db.prepare(`
    SELECT COUNT(*) AS c FROM user_follows WHERE following_id = ?
  `).get(userId)?.c || 0;
  const following = db.prepare(`
    SELECT COUNT(*) AS c FROM user_follows WHERE follower_id = ?
  `).get(userId)?.c || 0;
  return { followers, following };
}

export function follow(followerId, handle) {
  const target = getStudentByHandle(handle);
  if (target.id === followerId) throw new ValidationError('Не можна підписатися на себе');
  if (!target.profile_public) throw new NotFoundError('Профіль не знайдено');
  if (isFollowing(followerId, target.id)) throw new ConflictError('Ви вже підписані');
  db.prepare(`
    INSERT INTO user_follows (follower_id, following_id) VALUES (?, ?)
  `).run(followerId, target.id);
  const counts = getFollowCounts(target.id);
  return {
    isFollowing: true,
    userId: target.id,
    followerCount: counts.followers,
    followingCount: counts.following,
    handle: target.handle,
  };
}

export function unfollow(followerId, handle) {
  const target = getStudentByHandle(handle);
  db.prepare(`
    DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?
  `).run(followerId, target.id);
  const counts = getFollowCounts(target.id);
  return {
    isFollowing: false,
    userId: target.id,
    followerCount: counts.followers,
    followingCount: counts.following,
    handle: target.handle,
  };
}
