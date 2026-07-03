import type { AuthUser } from "@/lib/auth/store";

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Avatar processing (resize/S3 upload) happens in a background worker with
 * no dedicated polling endpoint — refetch the user until avatarUrl actually
 * changes, or give up after the attempt budget (soft timeout, not a failure).
 */
export async function pollForAvatarUpdate(
  previousUrl: string | null,
  fetchUser: () => Promise<AuthUser>,
  opts?: { attempts?: number; delayMs?: number },
): Promise<AuthUser | null> {
  const attempts = opts?.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = opts?.delayMs ?? DEFAULT_DELAY_MS;

  let lastUser: AuthUser | null = null;
  for (let i = 0; i < attempts; i++) {
    await delay(delayMs);
    lastUser = await fetchUser();
    if (lastUser.avatarUrl !== previousUrl) return lastUser;
  }
  return null;
}
