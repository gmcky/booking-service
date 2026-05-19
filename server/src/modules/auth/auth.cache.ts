import { cacheDel, cacheGet, cacheSet } from "../../shared/lib/cache.js";

export const USER_AUTH_CACHE_TTL_SECONDS = 5 * 60;

export function getUserAuthCacheKey(userId: string): string {
  return `user:auth:${userId}`;
}

export async function getCachedAuthUser(
  userId: string,
): Promise<{ id: string; email: string; role: string } | null> {
  return cacheGet<{ id: string; email: string; role: string }>(getUserAuthCacheKey(userId));
}

export async function setCachedAuthUser(user: {
  id: string;
  email: string;
  role: string;
}): Promise<void> {
  await cacheSet(getUserAuthCacheKey(user.id), user, USER_AUTH_CACHE_TTL_SECONDS);
}

export async function invalidateUserAuthCache(
  ...userIds: Array<string | null | undefined>
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return;
  await cacheDel(...unique.map(getUserAuthCacheKey));
}
