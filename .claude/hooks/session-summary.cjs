#!/usr/bin/env node
// Stop hook. Logs git diff stat at end of session for review.
// Non-blocking (exit 0 always). Output goes to .claude/session-log.txt.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  const projectRoot = process.cwd();
  const logFile = path.join(projectRoot, '.claude', 'session-log.txt');

  let stat = '';
  try {
    stat = execSync('git diff --stat HEAD 2>/dev/null', { cwd: projectRoot }).toString();
  } catch {
    // not a git repo or no changes — fine
  }

  let staged = '';
  try {
    staged = execSync('git diff --stat --cached 2>/dev/null', { cwd: projectRoot }).toString();
  } catch {}

  const ts = new Date().toISOString();
  const entry = `\n=== ${ts} ===\nUNSTAGED:\n${stat || '(none)'}\nSTAGED:\n${staged || '(none)'}\n`;

  fs.appendFileSync(logFile, entry);
} catch {
  // hook must never break session
}

process.exit(0);
