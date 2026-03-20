import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Testes TDD: Correcoes frontend de MentalSlider e BreakFeedbackPopup
// Spec: docs/specs/fix-mental-prep.md — RF-04, RF-07, RF-08
//
// Modo: TDD (red phase) — todos devem FALHAR com o codigo atual.
//
// Abordagem: Como o ambiente de teste e Node (sem jsdom), estes testes
// verificam padroes no codigo fonte dos componentes React. Isso garante
// que as correcoes estruturais foram aplicadas sem precisar renderizar JSX.
// =============================================================================

// ---------------------------------------------------------------------------
// Helpers: Leitura dos arquivos fonte
// ---------------------------------------------------------------------------

const MENTAL_SLIDER_PATH = path.resolve(
  __dirname,
  '../../../client/src/components/MentalSlider.tsx'
);

const BREAK_FEEDBACK_PATH = path.resolve(
  __dirname,
  '../../../client/src/components/BreakFeedbackPopup.tsx'
);

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

// ---------------------------------------------------------------------------
// PARTE 1: RF-04 — onWheel passive listener em MentalSlider
//
// ATUALMENTE: MentalSlider.tsx usa `onWheel={handleWheel}` inline (linha 112)
//             com `e.preventDefault()` dentro do handler (linha 77).
//             Isso causa warnings em browsers modernos porque wheel listeners
//             sao passive por default.
//
// ESPERADO: O componente deve usar `useEffect` + `ref.addEventListener('wheel',
//           handler, { passive: false })` em vez de `onWheel` inline.
// ---------------------------------------------------------------------------

describe('RF-04: MentalSlider — onWheel passive listener fix', () => {
  it('nao deve ter prop onWheel inline no div container', () => {
    const source = readSource(MENTAL_SLIDER_PATH);

    // O codigo atual tem `onWheel={handleWheel}` no JSX.
    // Apos a correcao, nao deve haver nenhum onWheel no JSX.
    const hasInlineOnWheel = /onWheel\s*=\s*\{/.test(source);

    expect(hasInlineOnWheel).toBe(false);
  });

  it('deve registrar wheel event via addEventListener com passive: false', () => {
    const source = readSource(MENTAL_SLIDER_PATH);

    // Apos a correcao, o componente deve usar addEventListener
    // com a opcao { passive: false } dentro de um useEffect.
    const hasAddEventListener = /addEventListener\s*\(\s*['"]wheel['"]/.test(source);
    const hasPassiveFalse = /passive\s*:\s*false/.test(source);

    expect(hasAddEventListener).toBe(true);
    expect(hasPassiveFalse).toBe(true);
  });

  it('deve ter cleanup com removeEventListener no useEffect', () => {
    const source = readSource(MENTAL_SLIDER_PATH);

    // O useEffect deve retornar uma funcao de cleanup que remove o listener.
    const hasRemoveEventListener = /removeEventListener\s*\(\s*['"]wheel['"]/.test(source);

    expect(hasRemoveEventListener).toBe(true);
  });

  it('deve importar useEffect e useRef do React', () => {
    const source = readSource(MENTAL_SLIDER_PATH);

    // O componente precisa de useEffect para registrar o listener
    // e useRef para acessar o elemento DOM.
    const hasUseEffect = /\buseEffect\b/.test(source);
    const hasUseRef = /\buseRef\b/.test(source);

    expect(hasUseEffect).toBe(true);
    expect(hasUseRef).toBe(true);
  });

  it('handleWheel deve aumentar valor com scroll para cima (deltaY < 0)', () => {
    const source = readSource(MENTAL_SLIDER_PATH);

    // Verificar que a logica do handleWheel ainda existe:
    // deltaY < 0 -> aumentar valor (Math.min(10, value + 1))
    const hasScrollUpIncrease = /deltaY[\s\S]{0,50}(?:<\s*0[\s\S]{0,100}Math\.min\s*\(\s*10|Math\.min\s*\(\s*10[\s\S]{0,100}<\s*0)/.test(source)
      || /delta\s*<\s*0[\s\S]{0,200}value\s*\+\s*1/.test(source);

    expect(hasScrollUpIncrease).toBe(true);
  });

  it('handleWheel deve diminuir valor com scroll para baixo (deltaY > 0)', () => {
    const source = readSource(MENTAL_SLIDER_PATH);

    // deltaY > 0 -> diminuir valor (Math.max(1, value - 1))
    const hasScrollDownDecrease = /delta\s*>\s*0[\s\S]{0,200}value\s*-\s*1/.test(source)
      || /deltaY[\s\S]{0,50}(?:>\s*0[\s\S]{0,100}Math\.max\s*\(\s*1|Math\.max\s*\(\s*1[\s\S]{0,100}>\s*0)/.test(source);

    expect(hasScrollDownDecrease).toBe(true);
  });

  it('handleWheel deve clampar valor minimo em 1 (Math.max(1, ...))', () => {
    const source = readSource(MENTAL_SLIDER_PATH);

    // O handler de wheel deve garantir que o valor nao vai abaixo de 1.
    const hasMinClamp = /Math\.max\s*\(\s*1\s*,/.test(source);

    expect(hasMinClamp).toBe(true);
  });

  it('handleWheel deve clampar valor maximo em 10 (Math.min(10, ...))', () => {
    const source = readSource(MENTAL_SLIDER_PATH);

    // O handler de wheel deve garantir que o valor nao vai acima de 10.
    const hasMaxClamp = /Math\.min\s*\(\s*10\s*,/.test(source);

    expect(hasMaxClamp).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PARTE 2: RF-07 — Stale closure no BreakFeedbackPopup
//
// ATUALMENTE: O useEffect de keyboard (linhas 104-148) captura `feedback`
//             no momento do registro. O array de deps (linha 148) inclui
//             [isOpen, isInTextarea, hoveredField, onClose] mas NAO inclui
//             `feedback`. Quando o usuario muda sliders e pressiona Enter,
//             `handleSubmit` usa `onSubmit(feedback)` com valores stale.
//
// ESPERADO: O componente deve usar `useRef` para manter referencia
//           atualizada ao feedback. `handleKeyPress` deve usar
//           `feedbackRef.current` ao chamar onSubmit.
// ---------------------------------------------------------------------------

describe('RF-07: BreakFeedbackPopup — stale closure fix', () => {
  it('deve declarar feedbackRef com useRef', () => {
    const source = readSource(BREAK_FEEDBACK_PATH);

    // O componente deve ter um `useRef` que armazena o feedback atual.
    // Pattern esperado: const feedbackRef = useRef(feedback) ou useRef<...>(feedback)
    const hasFeedbackRef = /feedbackRef\s*=\s*useRef/.test(source);

    expect(hasFeedbackRef).toBe(true);
  });

  it('deve atualizar feedbackRef.current quando feedback muda', () => {
    const source = readSource(BREAK_FEEDBACK_PATH);

    // O componente deve sincronizar a ref com o state a cada render.
    // Pattern esperado: feedbackRef.current = feedback
    const updatesRef = /feedbackRef\.current\s*=\s*feedback/.test(source);

    expect(updatesRef).toBe(true);
  });

  it('handleKeyPress deve usar feedbackRef.current ao submeter (nao feedback direto)', () => {
    const source = readSource(BREAK_FEEDBACK_PATH);

    // Dentro do handleKeyPress (que e chamado via keydown listener),
    // o submit deve usar feedbackRef.current em vez de `feedback`.
    //
    // Duas possibilidades validas:
    // 1. onSubmit(feedbackRef.current) — diretamente na funcao
    // 2. handleSubmit usa feedbackRef.current internamente

    const usesFeedbackRef = /feedbackRef\.current/.test(source);

    expect(usesFeedbackRef).toBe(true);
  });

  it('useEffect de keyboard nao deve ter feedback no array de dependencias', () => {
    const source = readSource(BREAK_FEEDBACK_PATH);

    // Se feedback estivesse nas deps, o listener seria re-registrado
    // a cada mudanca de slider, causando flickering e perda de performance.
    // Com a ref, as deps podem permanecer como [isOpen, isInTextarea, hoveredField, onClose].
    //
    // Verificar que o useEffect com handleKeyPress NAO tem feedback nas deps.
    // Extrair o bloco do useEffect que contem handleKeyPress e verificar deps.

    // Buscar o useEffect que registra o keydown listener
    const keydownEffectMatch = source.match(
      /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?addEventListener\s*\(\s*['"]keydown['"][\s\S]*?\}\s*,\s*\[([\s\S]*?)\]\s*\)/
    );

    expect(keydownEffectMatch).not.toBeNull();

    if (keydownEffectMatch) {
      const deps = keydownEffectMatch[1];
      // O array de deps NAO deve conter 'feedback' como item solto
      // (feedbackRef e ok, feedback.foco e ok, mas nao 'feedback' sozinho)
      const depsItems = deps.split(',').map((d: string) => d.trim());
      const hasFeedbackInDeps = depsItems.some(
        (dep: string) => dep === 'feedback'
      );
      expect(hasFeedbackInDeps).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// PARTE 3: RF-08 — Error handling em loadSessionBreaks
//
// ATUALMENTE: O catch em loadSessionBreaks (linhas 84-85) e vazio:
//             `catch (error) {}`
//             Falhas na busca de breaks passam completamente despercebidas.
//
// ESPERADO: O catch deve fazer console.error e setar um estado de erro
//           (breaksError) para que a UI possa indicar a falha ao usuario.
// ---------------------------------------------------------------------------

describe('RF-08: BreakFeedbackPopup — error handling em loadSessionBreaks', () => {
  it('catch de loadSessionBreaks deve chamar console.error', () => {
    const source = readSource(BREAK_FEEDBACK_PATH);

    // Encontrar o bloco loadSessionBreaks e verificar que o catch nao e vazio.
    // Pattern esperado: catch (error) { console.error(...) }
    const loadSessionBreaksMatch = source.match(
      /loadSessionBreaks[\s\S]*?catch\s*\(\s*\w+\s*\)\s*\{([\s\S]*?)\}/
    );

    expect(loadSessionBreaksMatch).not.toBeNull();

    if (loadSessionBreaksMatch) {
      const catchBody = loadSessionBreaksMatch[1];
      const hasConsoleError = /console\.error/.test(catchBody);
      expect(hasConsoleError).toBe(true);
    }
  });

  it('catch de loadSessionBreaks nao deve ser vazio', () => {
    const source = readSource(BREAK_FEEDBACK_PATH);

    // O catch block atual e completamente vazio: `catch (error) {}`
    // Apos a correcao, deve ter conteudo.
    const hasEmptyCatch = /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/.test(source);

    expect(hasEmptyCatch).toBe(false);
  });

  it('deve declarar estado breaksError para indicar falha na UI', () => {
    const source = readSource(BREAK_FEEDBACK_PATH);

    // O componente deve ter um useState para breaksError.
    // Pattern esperado: const [breaksError, setBreaksError] = useState(false)
    // ou similar.
    const hasBreaksError = /\bbreaksError\b/.test(source);
    const hasSetBreaksError = /\bsetBreaksError\b/.test(source);

    expect(hasBreaksError).toBe(true);
    expect(hasSetBreaksError).toBe(true);
  });

  it('catch deve setar breaksError para true', () => {
    const source = readSource(BREAK_FEEDBACK_PATH);

    // Dentro do catch, deve haver setBreaksError(true).
    const loadSessionBreaksMatch = source.match(
      /loadSessionBreaks[\s\S]*?catch\s*\(\s*\w+\s*\)\s*\{([\s\S]*?)\}/
    );

    expect(loadSessionBreaksMatch).not.toBeNull();

    if (loadSessionBreaksMatch) {
      const catchBody = loadSessionBreaksMatch[1];
      const setsErrorState = /setBreaksError\s*\(\s*true\s*\)/.test(catchBody);
      expect(setsErrorState).toBe(true);
    }
  });
});
