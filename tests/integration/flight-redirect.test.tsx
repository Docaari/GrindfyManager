/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint coach-page-reform-1 — RF-02 + RF-07.1: Redirect /flight legacy.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-02 / §RF-07.1.
 * Diagrama: routes-migration.mermaid.
 *
 * Comportamento:
 *   - Wouter <Route path="/flight">{() => <Redirect to="/coach?tab=flights"/>}</Route>
 *   - Acesso direto a /flight troca location para /coach + search "?tab=flights".
 *   - Flight.tsx mantem header @deprecated no topo (lint marker).
 *
 * Lessons:
 *   #14 — await import() em test .tsx.
 *   #19 — rota Wouter deve casar com path real (App.tsx).
 *   #23 — Wouter v3 Redirect API estavel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Router, Route, Switch, Redirect } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import React from 'react';

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Wouter Redirect /flight → /coach?tab=flights (RF-02 / RF-07.1)', () => {
  it('Redirect funciona: navegar para /flight troca location para /coach', () => {
    const { hook, navigate } = memoryLocation({ path: '/flight', record: true });

    const TestApp = () => (
      <Router hook={hook}>
        <Switch>
          <Route path="/flight">{() => <Redirect to="/coach?tab=flights" />}</Route>
          <Route path="/coach">
            {() => <div data-testid="coach-page">Coach</div>}
          </Route>
        </Switch>
      </Router>
    );

    const { container } = render(<TestApp />);

    // Apos render, Redirect deve ter executado o navigate.
    // Aceita: <Redirect> sincrono ou via useEffect.
    // Verificamos que o conteudo do /flight nao e renderizado e o /coach sim.
    expect(container.querySelector('[data-testid="coach-page"]')).toBeTruthy();
  });

  it('memoryLocation history mostra /coach apos redirect', () => {
    const { hook, navigate } = memoryLocation({ path: '/flight', record: true });

    const TestApp = () => (
      <Router hook={hook}>
        <Switch>
          <Route path="/flight">{() => <Redirect to="/coach?tab=flights" />}</Route>
          <Route path="/coach">
            {() => <div data-testid="coach-page">Coach</div>}
          </Route>
        </Switch>
      </Router>
    );

    render(<TestApp />);

    // Verifica que o redirect mudou a location interna do hook.
    const [path] = hook();
    expect(path).toMatch(/^\/coach/);
  });
});

describe('Flight.tsx — deprecation marker (RF-02)', () => {
  it('Flight.tsx tem header @deprecated no topo do arquivo', async () => {
    // Le o arquivo Flight.tsx via fs (nao via import) para checar comentario.
    const fs = await import('fs');
    const path = await import('path');
    const projectRoot = path.resolve(__dirname, '..', '..');
    const flightPath = path.join(projectRoot, 'client', 'src', 'pages', 'Flight.tsx');
    const content = fs.readFileSync(flightPath, 'utf8');
    expect(/@deprecated/i.test(content)).toBe(true);
  });
});

describe('App.tsx — Sidebar Flight item aponta para /coach?tab=flights (RF-07.2)', () => {
  it('Sidebar.tsx linha 93 (item Flight) tem path /coach?tab=flights', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const projectRoot = path.resolve(__dirname, '..', '..');
    const sidebarPath = path.join(projectRoot, 'client', 'src', 'components', 'Sidebar.tsx');
    const content = fs.readFileSync(sidebarPath, 'utf8');
    // Procura por bloco que tenha label 'Flight' E path apontando para /coach?tab=flights.
    const flightLine = content
      .split('\n')
      .find((l: string) => /label:\s*['"]Flight['"]/.test(l));
    expect(flightLine).toBeTruthy();
    // Procura no contexto da linha o path /coach?tab=flights.
    const idx = content.split('\n').findIndex((l: string) => /label:\s*['"]Flight['"]/.test(l));
    const block = content.split('\n').slice(Math.max(0, idx - 2), idx + 3).join('\n');
    expect(block).toContain('/coach?tab=flights');
  });
});

describe('App.tsx — Route /flight redireciona via Wouter Redirect (RF-07.1)', () => {
  it('App.tsx contem Redirect to "/coach?tab=flights" ou navegacao equivalente', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const projectRoot = path.resolve(__dirname, '..', '..');
    const appPath = path.join(projectRoot, 'client', 'src', 'App.tsx');
    const content = fs.readFileSync(appPath, 'utf8');
    // Aceita: <Redirect to="/coach?tab=flights" /> ou string equivalente.
    const hasRedirect =
      /Redirect[^>]*to=["']\/coach\?tab=flights["']/.test(content) ||
      /to:\s*["']\/coach\?tab=flights["']/.test(content);
    expect(hasRedirect).toBe(true);
  });

  it('App.tsx NAO importa mais Flight como rota direta (lazy import vivo eh OK)', async () => {
    // Implementer pode manter import lazy (so para tipo) mas nao usar como Route component.
    // Verifica que NAO existe mais `<Route path="/flight" component={...Flight...}>`
    // ou similar com Flight como componente direto na Route.
    const fs = await import('fs');
    const path = await import('path');
    const projectRoot = path.resolve(__dirname, '..', '..');
    const appPath = path.join(projectRoot, 'client', 'src', 'App.tsx');
    const content = fs.readFileSync(appPath, 'utf8');

    // Padrao antigo: Route path="/flight" component={() => (<ProtectedRoute><Flight /></ProtectedRoute>)}
    // Esse pattern especifico NAO deve existir mais.
    const oldPattern = /Route\s+path=["']\/flight["']\s+component=\{[^}]*<Flight\s*\/>/s;
    expect(oldPattern.test(content)).toBe(false);
  });
});
