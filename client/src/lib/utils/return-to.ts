/**
 * Validates a `returnTo` query param before using it as a redirect target.
 * Only allows same-origin relative paths to prevent open-redirect.
 *
 * String prefix checks alone are bypassable: WHATWG URL parsing strips
 * tab/CR/LF, so `/\t/evil.com` (from `?returnTo=%2F%09%2Fevil.com`)
 * normalizes to protocol-relative `//evil.com`. Instead of enumerating
 * tricks, resolve against a fixed dummy origin and require the parse to
 * stay on it, then re-serialize from the parsed parts.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  let url: URL;
  try {
    url = new URL(value, "http://internal");
  } catch {
    return "/";
  }
  if (url.origin !== "http://internal") return "/";
  return url.pathname + url.search + url.hash;
}
