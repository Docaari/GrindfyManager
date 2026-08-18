#!/usr/bin/env node
// PostToolUse hook para Write|Edit. Anota o arquivo tocado em
// .claude/estado/tocados.txt para o lembrar-testes.cjs consumir no Stop.
// Nao bloqueia nada. Sem acento: roda no console do Windows.

const fs = require('fs');
const path = require('path');

try {
  const raw = fs.readFileSync(0, 'utf8');
  const payload = JSON.parse(raw);
  const filePath = String((payload.tool_input || {}).file_path || '');

  if (filePath) {
    const dir = path.join(process.cwd(), '.claude', 'estado');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const state = path.join(dir, 'tocados.txt');

    const existing = fs.existsSync(state) ? fs.readFileSync(state, 'utf8') : '';
    if (!existing.split('\n').includes(filePath)) {
      fs.appendFileSync(state, filePath + '\n');
    }
  }
} catch {
  // hook nunca derruba a sessao
}
process.exit(0);
