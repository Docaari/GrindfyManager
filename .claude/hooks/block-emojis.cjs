#!/usr/bin/env node
// PreToolUse hook for Write|Edit. Blocks emojis in code files.
// CLAUDE.md rule: "Only use emojis if user explicitly requests it."
// Exit 2 = block. stderr shown to Claude.

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

const tool = payload.tool_name || '';
const input = payload.tool_input || {};
const filePath = (input.file_path || '').toLowerCase();
const content = input.content || input.new_string || '';

// Allow emojis in markdown/text/json (user docs may want them).
if (/\.(md|txt|json|yaml|yml|html)$/i.test(filePath)) process.exit(0);

// Allow emojis only in .ts/.tsx/.js/.jsx/.css/.scss source.
if (!/\.(ts|tsx|js|jsx|mjs|cjs|css|scss)$/i.test(filePath)) process.exit(0);

// Detect common emoji ranges + variation selectors.
const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F910}-\u{1F9FF}]/u;

if (emojiRegex.test(content)) {
  const match = content.match(emojiRegex);
  process.stderr.write(
    `BLOCKED: emoji detected (${match[0]}) in ${filePath}.\n` +
    `Project rule (CLAUDE.md): no emojis in code files unless user explicitly requested.\n` +
    `Remove emoji and retry.\n`
  );
  process.exit(2);
}

process.exit(0);
