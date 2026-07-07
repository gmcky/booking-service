import { cacheDel } from "../../shared/lib/cache.js";

export const USER_STATS_CACHE_TTL_SECONDS = 5 * 60;

export function getUserStatsCacheKey(userId: string): string {
  return `user:stats:${userId}`;
}

export function getUserPublicStatsCacheKey(userId: string): string {
  // v2: shape gained reviewsCount — new key so stale v1 entries age out.
  return `user:public:stats:v2:${userId}`;
}

export async function invalidateUserStatsCache(
  ...userIds: Array<string | null | undefined>
): Promise<void> {
  const uniqueUserIds = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));

  if (uniqueUserIds.length === 0) {
    return;
  }

  const keys = uniqueUserIds.flatMap((id) => [
    getUserStatsCacheKey(id),
    getUserPublicStatsCacheKey(id),
  ]);
  await cacheDel(...keys);
}
