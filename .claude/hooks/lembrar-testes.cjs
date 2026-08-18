#!/usr/bin/env node
// Stop hook. Le os arquivos tocados no turno (gravados por rastrear-tocados) e
// mostra quais suites cobrem a area. Nao bloqueia, nao reabre a conversa.
// Sem acento: roda no console do Windows.

const fs = require('fs');
const path = require('path');

const STATE = path.join(process.cwd(), '.claude', 'estado', 'tocados.txt');

const MAP = [
  { match: /server[\\/]coach[\\/]|server[\\/]routes[\\/]coach/i, cmd: 'npx vitest run tests/coach' },
  { match: /client[\\/]src[\\/]/i, cmd: 'npx vitest run tests/client' },
  { match: /server[\\/]routes[\\/]/i, cmd: 'npx vitest run tests/integration/routes' },
  { match: /server[\\/](storage|csvParser|scoring)/i, cmd: 'npx vitest run tests/unit tests/integration' },
  { match: /shared[\\/]/i, cmd: 'npx vitest run tests/unit' },
  { match: /migrations[\\/]|shared[\\/]schema\.ts$/i, cmd: 'npm run check' },
  { match: /tests[\\/]/i, cmd: 'npx vitest run' },
];

try {
  if (fs.existsSync(STATE)) {
    const touched = fs
      .readFileSync(STATE, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const cmds = new Set();
    touched.forEach((file) => {
      MAP.forEach((entry) => {
        if (entry.match.test(file)) cmds.add(entry.cmd);
      });
    });

    if (cmds.size > 0) {
      cmds.add('npm run check');
      process.stdout.write(
        JSON.stringify({
          systemMessage:
            'Testes que cobrem o que foi alterado: ' + Array.from(cmds).join(' | '),
        }),
      );
    }

    fs.writeFileSync(STATE, '');
  }
} catch {
  // hook nunca derruba a sessao
}
process.exit(0);
