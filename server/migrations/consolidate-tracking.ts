/**
 * Consolidate user_activities -> user_activity
 * Mapping function for migrating records from the old table to the new one.
 */

export function mapUserActivitiesToUserActivity(record: {
  id: string;
  userId: string;
  activityType: string;
  page: string | null;
  sessionDuration: number | null;
  metadata: unknown;
  createdAt: Date | null;
}): {
  id: string;
  userId: string;
  page: string;
  action: string;
  feature: string | null;
  duration: number | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date | null;
} {
  return {
    id: record.id,
    userId: record.userId,
    page: record.page ?? 'unknown',
    action: record.activityType,
    feature: null,
    duration: record.sessionDuration != null ? record.sessionDuration * 60 : null,
    metadata: record.metadata,
    ipAddress: null,
    userAgent: null,
    createdAt: record.createdAt,
  };
}
