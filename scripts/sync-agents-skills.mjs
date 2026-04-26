#!/usr/bin/env node
// Sync .claude/agents/*.md -> .claude/skills/<name>/SKILL.md
// Mantem os dois canais (Agent tool e Skill tool) com mesmo conteudo
// sem duplicacao manual.
//
// Uso:
//   node scripts/sync-agents-skills.mjs           # sync agents -> skills
//   node scripts/sync-agents-skills.mjs --check   # exit 1 se desincronizado
//   node scripts/sync-agents-skills.mjs --reverse # sync skills -> agents
//
// Source of truth padrao: .claude/agents/ (canonical).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');

const args = new Set(process.argv.slice(2));
const isCheck = args.has('--check');
const isReverse = args.has('--reverse');

function hash(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function listAgents() {
  return fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .map(f => {
      // Normalize names like "system-architect (1).md" -> "system-architect"
      const name = f.replace(/\.md$/, '').replace(/\s*\(\d+\)$/, '');
      return { file: f, name };
    });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function syncAgentToSkill({ file, name }) {
  const src = path.join(AGENTS_DIR, file);
  const dstDir = path.join(SKILLS_DIR, name);
  const dst = path.join(dstDir, 'SKILL.md');

  const srcContent = fs.readFileSync(src, 'utf8');
  let action = 'NEW';
  let dstContent = '';
  if (fs.existsSync(dst)) {
    dstContent = fs.readFileSync(dst, 'utf8');
    if (hash(srcContent) === hash(dstContent)) return { name, action: 'OK' };
    action = 'UPDATE';
  }

  if (isCheck) return { name, action };

  ensureDir(dstDir);
  fs.writeFileSync(dst, srcContent);
  return { name, action };
}

function syncSkillToAgent({ name }) {
  const src = path.join(SKILLS_DIR, name, 'SKILL.md');
  if (!fs.existsSync(src)) return { name, action: 'SKIP' };

  const targetFile = path.join(AGENTS_DIR, `${name}.md`);
  const srcContent = fs.readFileSync(src, 'utf8');
  let action = 'NEW';
  if (fs.existsSync(targetFile)) {
    const dstContent = fs.readFileSync(targetFile, 'utf8');
    if (hash(srcContent) === hash(dstContent)) return { name, action: 'OK' };
    action = 'UPDATE';
  }

  if (isCheck) return { name, action };

  fs.writeFileSync(targetFile, srcContent);
  return { name, action };
}

function main() {
  const direction = isReverse ? 'skills -> agents' : 'agents -> skills';
  const mode = isCheck ? 'CHECK' : 'SYNC';
  console.log(`[${mode}] ${direction}`);

  const items = listAgents();
  const results = items.map(item =>
    isReverse ? syncSkillToAgent(item) : syncAgentToSkill(item)
  );

  const drifted = results.filter(r => r.action === 'NEW' || r.action === 'UPDATE');

  for (const r of results) {
    const symbol = r.action === 'OK' ? '[OK]' : r.action === 'SKIP' ? '[--]' : '[!!]';
    console.log(`  ${symbol} ${r.name.padEnd(20)} ${r.action}`);
  }

  if (isCheck && drifted.length > 0) {
    console.error(`\nFAIL: ${drifted.length} file(s) out of sync. Run without --check to fix.`);
    process.exit(1);
  }

  if (!isCheck && drifted.length > 0) {
    console.log(`\nSynced ${drifted.length} file(s).`);
  } else {
    console.log(`\nAll in sync.`);
  }
}

main();
