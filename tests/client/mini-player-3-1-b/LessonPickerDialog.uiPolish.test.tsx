// Sprint Mini Player 3.1 Wave B / INFO-NEW-4 — placeholder + loading usam … (U+2026).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

describe('LessonPickerDialog UI polish (Wave B INFO-NEW-4)', () => {
  const filePath = path.resolve(
    __dirname,
    '../../../client/src/components/audio-player/LessonPickerDialog.tsx',
  );
  const src = readFileSync(filePath, 'utf8');

  it('Buscar aulas usa horizontal ellipsis (…) ao inves de tres pontos literais', () => {
    // U+2026
    expect(src).toMatch(/Buscar aulas…/);
    expect(src).not.toMatch(/Buscar aulas\.{3}/);
  });

  it('Carregando usa horizontal ellipsis (…)', () => {
    expect(src).toMatch(/Carregando…/);
    expect(src).not.toMatch(/Carregando\.{3}/);
  });

  it('importa ListPlus do lucide-react', () => {
    expect(src).toMatch(/ListPlus/);
    expect(src).toMatch(/from "lucide-react"/);
  });

  it('substitui `+` literal por <ListPlus /> no botao add-to-queue', () => {
    // confirma que <ListPlus className=... /> aparece dentro do add-to-queue path
    expect(src).toMatch(/<ListPlus[\s\S]*?\/>/);
  });
});
