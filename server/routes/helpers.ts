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

// Helper function to remove user permissions
export async function removeUserPermissions(userId: string) {
  try {
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
  } catch (error) {
    throw error;
  }
}
