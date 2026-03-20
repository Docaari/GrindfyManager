import { db } from "../db";
import { userPermissions } from "@shared/schema";
import { eq } from "drizzle-orm";

// Safe JSON parse for query string filters — returns {} on invalid input
export function parseFiltersParam(raw: any): Record<string, any> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Utility function to map frontend filters to backend format
export function mapFiltersToBackendFormat(frontendFilters: any) {
  const backendFilters: any = { ...frontendFilters };

  // Map frontend keyword filter format to backend format
  if (frontendFilters.keyword && frontendFilters.keywordType) {
    backendFilters.keywordFilter = {
      keyword: frontendFilters.keyword,
      type: frontendFilters.keywordType
    };
    // Remove the frontend format properties
    delete backendFilters.keyword;
    delete backendFilters.keywordType;
  }

  return backendFilters;
}

// Calculate start date based on period string (e.g. '7d', '30d', '90d', '1y')
export function calculateStartDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case '7d':
      return new Date(now.setDate(now.getDate() - 7));
    case '90d':
      return new Date(now.setDate(now.getDate() - 90));
    case '365d':
    case '1y':
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(now.setDate(now.getDate() - 30));
  }
}

// Helper function to remove user permissions
export async function removeUserPermissions(userId: string) {
  try {
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
  } catch (error) {
    throw error;
  }
}
