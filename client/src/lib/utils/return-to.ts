/**
 * Validates a `returnTo` query param before using it as a redirect target.
 * Only allows same-origin relative paths (single leading slash, no scheme)
 * to prevent open-redirect via a crafted `//evil.com` or `https://evil.com`.
 * Backslash counts as a slash here: URL parsers normalize `/\` to `//`.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
