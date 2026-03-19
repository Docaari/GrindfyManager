import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const schemaPath = path.resolve(__dirname, '../../../shared/schema.ts');
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

/**
 * Batch 1: 9 core business tables must have FK constraint
 * on userId → users.userPlatformId with onDelete: cascade
 */
describe('FK constraints batch 1 — core business tables', () => {
  const batch1Tables = [
    'tournamentTemplates',
    'weeklyPlans',
    'plannedTournaments',
    'grindSessions',
    'breakFeedbacks',
    'sessionTournaments',
    'preparationLogs',
    'customGroups',
  ];

  for (const table of batch1Tables) {
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

  it('userSettings.userId should have .references() AND .unique()', () => {
    const regex = /export const userSettings = pgTable[\s\S]*?userId:\s*varchar\("user_id"\)([^\r\n]*)/;
    const match = schemaContent.match(regex);
    expect(match).not.toBeNull();
    const fieldChain = match![1];
    expect(fieldChain).toContain('.unique()');
    expect(fieldChain).toContain('.references');
    expect(fieldChain).toContain('users.userPlatformId');
    expect(fieldChain).toContain('cascade');
  });

  describe('Batch 2 tables should also have FK (added in batch 2)', () => {
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
      it(`${table}.userId should have .references()`, () => {
        const regex = new RegExp(
          `export const ${table} = pgTable[\\s\\S]*?userId:\\s*varchar\\("user_id"\\)([^\\r\\n]*)`
        );
        const match = schemaContent.match(regex);
        if (match) {
          expect(match[1]).toContain('.references');
        }
      });
    }
  });
});
