import xss from "xss";

export function sanitizeString(value: string) {
  return xss(value);
}
