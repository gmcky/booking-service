import type { Request } from "express";

// Extend Express Request globally so req.user is typed everywhere without casts
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

// AuthenticatedRequest is now identical to Request (user is globally augmented above).
// Kept as a named export so existing controller imports continue to work.
export type AuthenticatedRequest = Request;

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
