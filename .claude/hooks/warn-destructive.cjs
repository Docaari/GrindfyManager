#!/usr/bin/env node
// PreToolUse hook for Bash. Warns on destructive commands.
// Exit 2 = block (Claude sees stderr and adjusts).
// Strips heredocs and quoted strings before matching to avoid
// false positives from commit messages, doc strings, etc.

const fs = require('fs');

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

const fullCmd = (payload.tool_input || {}).command || '';

function stripHeredocs(s) {
  // Match `<<EOF`, `<<-EOF`, `<<'EOF'`, `<<"EOF"` then capture body until EOF on its own line.
  return s.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?(?:\n|^)\1\b[^\n]*/g, '');
}

function stripQuotedStrings(s) {
  // Strip double-quoted (with escapes) and single-quoted strings.
  return s.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'[^']*'/g, "''");
}

const cmd = stripQuotedStrings(stripHeredocs(fullCmd));

const patterns = [
  { re: /\brm\s+-rf?\s+\/[^\s]/, msg: 'rm -rf at filesystem root' },
  { re: /\brm\s+-rf?\s+~/, msg: 'rm -rf on home directory' },
  { re: /\bgit\s+push\s+(--force|-f)\b/, msg: 'force-push detected — confirm with user; never on main/master' },
  { re: /--no-verify\b/, msg: 'skipping git hooks (--no-verify) — fix underlying issue instead' },
  { re: /\bgit\s+reset\s+--hard\b/, msg: 'git reset --hard discards uncommitted work' },
  { re: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, msg: 'DROP TABLE/DATABASE/SCHEMA — verify backup first' },
  { re: /\bTRUNCATE\s+TABLE\b/i, msg: 'TRUNCATE TABLE detected' },
  { re: /\bDELETE\s+FROM\s+\w+\s*;/i, msg: 'DELETE FROM without WHERE clause' },
  { re: /\bgit\s+branch\s+-D\b/, msg: 'force-delete branch detected' },
  { re: /\bgit\s+clean\s+-[fdx]+/, msg: 'git clean removes untracked files permanently' },
  { re: /\bnpm\s+publish\b/, msg: 'npm publish — verify package.json version' },
];

for (const { re, msg } of patterns) {
  if (re.test(cmd)) {
    process.stderr.write(`BLOCKED: ${msg}\nCommand (after stripping quotes/heredocs): ${cmd}\nIf user explicitly authorized, ask them to confirm in chat.\n`);
    process.exit(2);
  }
}

process.exit(0);
