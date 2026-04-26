#!/usr/bin/env node
// PreToolUse hook for Bash. Warns on destructive commands.
// Exit 2 = block (Claude sees stderr and adjusts).

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

const cmd = (payload.tool_input || {}).command || '';

const patterns = [
  { re: /\brm\s+-rf?\s+\/[^\s]/, msg: 'rm -rf at filesystem root — NEVER' },
  { re: /\brm\s+-rf?\s+~/, msg: 'rm -rf on home directory — confirm with user first' },
  { re: /\bgit\s+push\s+(--force|-f)\b/, msg: 'git push --force — confirm with user first; never on main/master' },
  { re: /--no-verify\b/, msg: 'skipping git hooks (--no-verify) — fix the underlying issue instead' },
  { re: /\bgit\s+reset\s+--hard\b/, msg: 'git reset --hard discards uncommitted work — confirm with user' },
  { re: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, msg: 'DROP TABLE/DATABASE/SCHEMA — confirm with user; verify backup' },
  { re: /\bTRUNCATE\s+TABLE\b/i, msg: 'TRUNCATE TABLE — confirm with user' },
  { re: /\bDELETE\s+FROM\s+\w+\s*;/i, msg: 'DELETE FROM without WHERE — confirm with user' },
  { re: /\bgit\s+branch\s+-D\b/, msg: 'force-delete branch — confirm with user' },
  { re: /\bgit\s+clean\s+-[fdx]+/, msg: 'git clean removes untracked files permanently — confirm with user' },
  { re: /\bnpm\s+publish\b/, msg: 'npm publish — confirm with user; check package.json version' },
];

for (const { re, msg } of patterns) {
  if (re.test(cmd)) {
    process.stderr.write(`BLOCKED: ${msg}\nCommand: ${cmd}\nIf user explicitly authorized, ask them to confirm in chat.\n`);
    process.exit(2);
  }
}

process.exit(0);
