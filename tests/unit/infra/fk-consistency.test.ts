import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const schemaPath = path.resolve(__dirname, '../../../shared/schema.ts');
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

describe('FK consistency — all user FKs should reference users.userPlatformId', () => {

  describe('Grupo B: FK constraints in table definitions', () => {
    it('uploadHistory.userId should reference users.userPlatformId', () => {
      // Find the uploadHistory table definition and its userId FK
      const uploadHistoryMatch = schemaContent.match(
        /export const uploadHistory = pgTable[\s\S]*?userId:\s*varchar\([^)]+\)[^,]*\.references\(\(\)\s*=>\s*users\.(\w+)/
      );
      expect(uploadHistoryMatch).not.toBeNull();
      expect(uploadHistoryMatch![1]).toBe('userPlatformId');
    });

    it('userSubscriptions.userId should reference users.userPlatformId', () => {
      const userSubsMatch = schemaContent.match(
        /export const userSubscriptions = pgTable[\s\S]*?userId:\s*varchar\([^)]+\)[^,]*\.references\(\(\)\s*=>\s*users\.(\w+)/
      );
      expect(userSubsMatch).not.toBeNull();
      expect(userSubsMatch![1]).toBe('userPlatformId');
    });
  });

  describe('Grupo D: Relations layer should use users.userPlatformId', () => {
    // Each relation that has `references: [users.XXX]` should use userPlatformId
    const relationPattern = /export const (\w+Relations) = relations\([\s\S]*?\}\)\)/g;
    const userRefPattern = /references:\s*\[users\.(\w+)\]/g;

    // Collect all relations and their user references
    const relations: Array<{ name: string; refs: string[] }> = [];
    let match: RegExpExecArray | null;

    // Reset and scan
    const fullRelations = schemaContent.matchAll(
      /export const (\w+Relations)\s*=\s*relations\([^)]+,\s*\([^)]*\)\s*=>\s*\((\{[\s\S]*?\})\)\)/g
    );

    for (const rel of fullRelations) {
      const name = rel[1];
      const body = rel[2];
      const refs: string[] = [];
      let refMatch: RegExpExecArray | null;
      const refRe = /references:\s*\[users\.(\w+)\]/g;
      while ((refMatch = refRe.exec(body)) !== null) {
        refs.push(refMatch[1]);
      }
      if (refs.length > 0) {
        relations.push({ name, refs });
      }
    }

    it('should find relations that reference users table', () => {
      // We expect at least 25 relations referencing users
      expect(relations.length).toBeGreaterThanOrEqual(25);
    });

    it('all relations should reference users.userPlatformId, not users.id', () => {
      const violations = relations.filter((r) =>
        r.refs.some((ref) => ref === 'id')
      );
      expect(violations.map((v) => v.name)).toEqual([]);
    });
  });

  describe('usersRelations settings field should use userPlatformId', () => {
    it('usersRelations settings should use fields: [users.userPlatformId]', () => {
      const usersRelMatch = schemaContent.match(
        /export const usersRelations[\s\S]*?settings:\s*one\(userSettings,\s*\{[\s\S]*?fields:\s*\[users\.(\w+)\]/
      );
      expect(usersRelMatch).not.toBeNull();
      expect(usersRelMatch![1]).toBe('userPlatformId');
    });
  });

  describe('Grupo C: tables without FK should NOT be modified (out of scope)', () => {
    const groupCTables = [
      'tournamentTemplates', 'weeklyPlans', 'plannedTournaments',
      'grindSessions', 'breakFeedbacks', 'sessionTournaments',
      'preparationLogs', 'customGroups', 'coachingInsights',
      'userSettings', 'studyCards', 'studySessions', 'activeDays',
      'weeklyRoutines', 'calendarCategories', 'calendarEvents', 'studySchedules',
    ];

    for (const table of groupCTables) {
      it(`${table}.userId should NOT have a .references() constraint`, () => {
        // Match the table definition and check if userId has .references()
        const tableRegex = new RegExp(
          `export const ${table} = pgTable[\\s\\S]*?userId:\\s*varchar\\([^)]+\\)([^,]*)`
        );
        const tableMatch = schemaContent.match(tableRegex);
        if (tableMatch) {
          // The captured group after userId should NOT contain .references
          expect(tableMatch[1]).not.toContain('.references');
        }
      });
    }
  });
});
