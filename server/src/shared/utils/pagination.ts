import type { PaginationParams, PaginatedResponse } from "../types/index.js";

export function calculatePagination(
  page: number = 1,
  limit: number = 10,
): { skip: number; take: number } {
  const pageNumber = Math.max(1, page);
  const take = Math.max(1, limit);

  const skip = (pageNumber - 1) * take;

  return { skip, take };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    },
  };
}
