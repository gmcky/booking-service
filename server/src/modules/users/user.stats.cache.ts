import { cacheDel } from "../../shared/lib/cache.js";

export const USER_STATS_CACHE_TTL_SECONDS = 5 * 60;

export function getUserStatsCacheKey(userId: string): string {
  return `user:stats:${userId}`;
}

export async function invalidateUserStatsCache(
  ...userIds: Array<string | null | undefined>
): Promise<void> {
  const uniqueUserIds = Array.from(
    new Set(userIds.filter((id): id is string => Boolean(id))),
  );

  if (uniqueUserIds.length === 0) {
    return;
  }

  const keys = uniqueUserIds.map((id) => getUserStatsCacheKey(id));
  await cacheDel(...keys);
}
