import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // react() necessario para parsear JSX/TSX nos testes de componentes (RF-04 frontend).
  // O plugin do React adiciona transform JSX antes do SSR transform do rolldown.
  plugins: [react()],
  // Vitest 4 usa rolldown internamente; oxc (parser do rolldown) precisa de hint
  // explicito sobre JSX porque por padrao trata todos os arquivos como puros TS.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'react',
    },
  },
  test: {
    globals: true,
    // Vitest 4 removeu environmentMatchGlobs em favor de "projects" (multi-config).
    // Usamos projects para separar testes server-side (node) e client-side (jsdom).
    setupFiles: ['tests/setup.ts'],
    // clearMocks: true limpa mock.calls entre testes (sem resetar implementations).
    // Necessario para vi.spyOn(console, 'log') que reusa o mesmo MockInstance.
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts', 'shared/**/*.ts'],
    },
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@': path.resolve(__dirname, 'client/src'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
    },
    projects: [
      {
        plugins: [react()],
        oxc: {
          jsx: { runtime: 'automatic', importSource: 'react' },
        },
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          include: ['tests/**/*.test.ts'],
          // Hook tests com renderHook precisam de jsdom; rodam no projeto client.
          // Sprint coach-page-reform-1: useTabFromUrl + usePlatformsByPopularity.
          exclude: ['tests/**/*.test.tsx', 'tests/hooks/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
          clearMocks: true,
          alias: {
            '@shared': path.resolve(__dirname, 'shared'),
            '@': path.resolve(__dirname, 'client/src'),
            '@assets': path.resolve(__dirname, 'attached_assets'),
          },
        },
      },
      {
        plugins: [react()],
        oxc: {
          jsx: { runtime: 'automatic', importSource: 'react' },
        },
        test: {
          name: 'client',
          environment: 'jsdom',
          globals: true,
          include: [
            'client/src/**/*.test.tsx',
            'client/src/**/*.test.ts',
            'tests/**/*.test.tsx',
            // Hook tests que usam renderHook precisam de jsdom (DOM presente).
            'tests/hooks/**/*.test.ts',
          ],
          setupFiles: ['tests/setup.ts'],
          clearMocks: true,
          alias: {
            '@shared': path.resolve(__dirname, 'shared'),
            '@': path.resolve(__dirname, 'client/src'),
            '@assets': path.resolve(__dirname, 'attached_assets'),
          },
        },
      },
    ],
  },
});
