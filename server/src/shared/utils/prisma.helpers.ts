/**
 * Remove undefined values from object for Prisma operations
 * This helps with exactOptionalPropertyTypes: true
 */
export function omitUndefined<T extends Record<string, any>>(
  obj: T,
): Partial<T> {
  const result: any = {};

  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }

  return result;
}
