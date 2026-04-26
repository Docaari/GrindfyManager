#!/usr/bin/env node
// PostToolUse hook for Edit|Write. If file modified is in .claude/agents/,
// auto-sync to .claude/skills/ via scripts/sync-agents-skills.mjs.
// Non-blocking (exit 0 always).

const fs = require('fs');
const { execSync } = require('child_process');

let raw = '';
try {
  raw = fs.readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const filePath = (payload.tool_input || {}).file_path || '';
const normalized = filePath.replace(/\\/g, '/');

// Only fire if edited file is inside .claude/agents/ and ends with .md
if (!/\.claude\/agents\/[^_].*\.md$/.test(normalized)) process.exit(0);

try {
  const out = execSync('node scripts/sync-agents-skills.mjs', { encoding: 'utf8' });
  // Print to stderr so Claude sees the sync happened
  process.stderr.write(`[auto-sync] agents -> skills synced after edit:\n${out}`);
} catch (err) {
  process.stderr.write(`[auto-sync] FAILED: ${err.message}\n`);
}

process.exit(0);
