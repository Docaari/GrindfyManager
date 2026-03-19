import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Neon driver removal', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  it('package.json should NOT contain @neondatabase/serverless', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'),
    );
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    expect(allDeps).not.toHaveProperty('@neondatabase/serverless');
  });

  it('no source file should import @neondatabase', () => {
    const dirs = ['server', 'shared'];
    const violations: string[] = [];

    for (const dir of dirs) {
      const fullDir = path.join(rootDir, dir);
      if (!fs.existsSync(fullDir)) continue;
      const files = fs.readdirSync(fullDir).filter((f) => f.endsWith('.ts'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(fullDir, file), 'utf-8');
        if (content.includes('@neondatabase')) {
          violations.push(`${dir}/${file}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('server/db.ts should use pg driver', () => {
    const dbFile = fs.readFileSync(
      path.join(rootDir, 'server', 'db.ts'),
      'utf-8',
    );
    expect(dbFile).toContain('import pg from "pg"');
    expect(dbFile).toContain('drizzle-orm/node-postgres');
    expect(dbFile).toContain('pg.Pool');
    expect(dbFile).not.toContain('@neondatabase');
  });
});
