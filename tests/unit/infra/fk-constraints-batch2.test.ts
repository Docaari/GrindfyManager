import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const schemaPath = path.resolve(__dirname, '../../../shared/schema.ts');
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

describe('FK constraints batch 2 — secondary tables', () => {
  const batch2Tables = [
    'coachingInsights',
    'studyCards',
    'studySessions',
    'activeDays',
    'weeklyRoutines',
    'calendarCategories',
    'calendarEvents',
    'studySchedules',
  ];

  for (const table of batch2Tables) {
    it(`${table}.userId should have .references(() => users.userPlatformId, { onDelete: "cascade" })`, () => {
      const regex = new RegExp(
        `export const ${table} = pgTable[\\s\\S]*?userId:\\s*varchar\\("user_id"\\)([^\\r\\n]*)`
      );
      const match = schemaContent.match(regex);
      expect(match).not.toBeNull();
      const fieldLine = match![1];
      expect(fieldLine).toContain('.references');
      expect(fieldLine).toContain('users.userPlatformId');
      expect(fieldLine).toContain('cascade');
    });
  }

  it('all 17 Grupo C tables should now have FK constraints', () => {
    const allTables = [
      'tournamentTemplates', 'weeklyPlans', 'plannedTournaments',
      'grindSessions', 'breakFeedbacks', 'sessionTournaments',
      'preparationLogs', 'customGroups', 'userSettings',
      'coachingInsights', 'studyCards', 'studySessions', 'activeDays',
      'weeklyRoutines', 'calendarCategories', 'calendarEvents', 'studySchedules',
    ];
    const missing: string[] = [];
    for (const table of allTables) {
      const regex = new RegExp(
        `export const ${table} = pgTable[\\s\\S]*?userId:\\s*varchar\\("user_id"\\)([^\\r\\n]*)`
      );
      const match = schemaContent.match(regex);
      if (!match || !match[1].includes('.references')) {
        missing.push(table);
      }
    }
    expect(missing).toEqual([]);
  });
});
