/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint grade-planner-library-and-multi-day — RF-02 seletor de dias.
 * Spec: Docs/specs/grade-planner-library-and-multi-day.md §RF-02.
 * ADR:  Docs/architecture/decisions/245-...-multi-day.md §D1.
 *
 * Componente alvo (AINDA NAO EXISTE):
 *   client/src/components/grade-planner/WeekDaysPicker.tsx
 *
 * Contrato exercitado aqui (apresentacao pura — o picker NAO decide nada):
 *   selectedDays: number[]
 *   onToggleDay: (dayOfWeek: number) => void
 *   getProfileForDay: (dayOfWeek: number) => 'A'|'B'|'C'|'OFF'|null|undefined
 *   dayLabels?: readonly string[]   // default = weekDays[].short
 *
 * testids: week-days-picker, week-day-chip-${dayOfWeek}   (ADR §D1 e §C3).
 * O submit continua sendo day-zoom-create-submit do dialog canonico — o
 * "multi-day-submit" sugerido na spec esta SUPERADO (ADR §C3).
 *
 * Marcacao de dia sem perfil: o ADR pede "marcacao visual + title explicando".
 * Este teste fixa um atributo estavel `data-day-state` (active|off|no-profile)
 * em vez de inspecionar classe Tailwind — classe e detalhe de estilo, atributo
 * e contrato (lesson #2).
 *
 * Lessons: #14/#26/#38 (await import, nunca require, nunca misturar estilos),
 * #2 (data-testid estavel).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Especificador em variavel + @vite-ignore: o componente ainda NAO existe, e um
 * `await import('caminho literal')` faria o Vite falhar no TRANSFORM, derrubando
 * o arquivo inteiro com "0 test". Assim a ausencia do modulo vira uma falha em
 * runtime POR TESTE (red phase legivel), e a resolucao pelo alias `@/` continua
 * funcionando quando o implementer criar o arquivo.
 */
const WEEK_DAYS_PICKER_MODULE = '@/components/grade-planner/WeekDaysPicker';

async function renderPicker(override: Record<string, any> = {}) {
  const React = await import('react');
  const { render, screen, fireEvent } = await import('@testing-library/react');
  const { WeekDaysPicker } = (await import(
    /* @vite-ignore */ WEEK_DAYS_PICKER_MODULE
  )) as any;

  const props = {
    selectedDays: [3],
    onToggleDay: vi.fn(),
    getProfileForDay: (d: number) => (d === 3 ? 'B' : 'A'),
    dayLabels: DAY_LABELS,
    ...override,
  };

  const result = render(React.createElement(WeekDaysPicker as any, props));
  return { ...result, screen, fireEvent, props };
}

describe('WeekDaysPicker — estrutura e rotulos', () => {
  it('renderiza o container com data-testid week-days-picker', async () => {
    const { screen } = await renderPicker();
    expect(await screen.findByTestId('week-days-picker')).toBeInTheDocument();
  });

  it('renderiza um chip por dia da semana, domingo primeiro, com o rotulo curto', async () => {
    const { screen } = await renderPicker();
    for (let day = 0; day <= 6; day += 1) {
      const chip = await screen.findByTestId(`week-day-chip-${day}`);
      expect(chip).toBeInTheDocument();
      expect(chip.textContent).toContain(DAY_LABELS[day]);
    }
  });

  it('cada chip e um <button> (acessibilidade — RNF da spec)', async () => {
    const { screen } = await renderPicker();
    for (let day = 0; day <= 6; day += 1) {
      const chip = await screen.findByTestId(`week-day-chip-${day}`);
      expect(chip.tagName).toBe('BUTTON');
    }
  });

  it('usa os rotulos curtos padrao (Dom..Sab) quando dayLabels nao e passado', async () => {
    const { screen } = await renderPicker({ dayLabels: undefined });
    expect((await screen.findByTestId('week-day-chip-0')).textContent).toContain(
      'Dom',
    );
    expect((await screen.findByTestId('week-day-chip-6')).textContent).toContain(
      'Sab',
    );
  });
});

describe('WeekDaysPicker — selecao', () => {
  it('marca com aria-pressed=true apenas o dia de origem pre-selecionado', async () => {
    const { screen } = await renderPicker({ selectedDays: [3] });
    expect(
      (await screen.findByTestId('week-day-chip-3')).getAttribute('aria-pressed'),
    ).toBe('true');
    for (const day of [0, 1, 2, 4, 5, 6]) {
      expect(
        (await screen.findByTestId(`week-day-chip-${day}`)).getAttribute(
          'aria-pressed',
        ),
      ).toBe('false');
    }
  });

  it('marca varios dias quando selectedDays traz mais de um', async () => {
    const { screen } = await renderPicker({ selectedDays: [3, 4, 5] });
    for (const day of [3, 4, 5]) {
      expect(
        (await screen.findByTestId(`week-day-chip-${day}`)).getAttribute(
          'aria-pressed',
        ),
      ).toBe('true');
    }
    expect(
      (await screen.findByTestId('week-day-chip-1')).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('nenhum chip fica marcado quando selectedDays e vazio (fluxo da biblioteca)', async () => {
    const { screen } = await renderPicker({ selectedDays: [] });
    for (let day = 0; day <= 6; day += 1) {
      expect(
        (await screen.findByTestId(`week-day-chip-${day}`)).getAttribute(
          'aria-pressed',
        ),
      ).toBe('false');
    }
  });

  it('clicar num chip desmarcado sobe onToggleDay com aquele dayOfWeek', async () => {
    const { screen, fireEvent, props } = await renderPicker({
      selectedDays: [3],
    });
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    expect(props.onToggleDay).toHaveBeenCalledWith(5);
  });

  it('clicar no unico chip marcado tambem sobe onToggleDay — quem bloqueia o submit e o dialog, nao o picker', async () => {
    const { screen, fireEvent, props } = await renderPicker({
      selectedDays: [3],
    });
    fireEvent.click(await screen.findByTestId('week-day-chip-3'));
    expect(props.onToggleDay).toHaveBeenCalledWith(3);
  });

  it('nenhum chip vem desabilitado — todos os 7 dias sao clicaveis', async () => {
    const { screen } = await renderPicker({
      getProfileForDay: (d: number) => (d === 3 ? 'B' : d === 4 ? 'OFF' : null),
    });
    for (let day = 0; day <= 6; day += 1) {
      const chip = (await screen.findByTestId(
        `week-day-chip-${day}`,
      )) as HTMLButtonElement;
      expect(chip.disabled).toBe(false);
    }
  });
});

describe('WeekDaysPicker — sinalizacao de dia OFF / sem perfil (D3: marca, nao bloqueia)', () => {
  it('dia com perfil ativo recebe data-day-state=active', async () => {
    const { screen } = await renderPicker({
      getProfileForDay: () => 'B',
    });
    expect(
      (await screen.findByTestId('week-day-chip-3')).getAttribute('data-day-state'),
    ).toBe('active');
  });

  it('dia OFF recebe data-day-state=off e continua marcavel', async () => {
    const { screen, fireEvent, props } = await renderPicker({
      selectedDays: [],
      getProfileForDay: (d: number) => (d === 4 ? 'OFF' : 'A'),
    });
    const chip = await screen.findByTestId('week-day-chip-4');
    expect(chip.getAttribute('data-day-state')).toBe('off');
    fireEvent.click(chip);
    expect(props.onToggleDay).toHaveBeenCalledWith(4);
  });

  it('dia sem perfil ativo recebe data-day-state=no-profile e continua marcavel', async () => {
    const { screen, fireEvent, props } = await renderPicker({
      selectedDays: [],
      getProfileForDay: (d: number) => (d === 5 ? null : 'A'),
    });
    const chip = await screen.findByTestId('week-day-chip-5');
    expect(chip.getAttribute('data-day-state')).toBe('no-profile');
    fireEvent.click(chip);
    expect(props.onToggleDay).toHaveBeenCalledWith(5);
  });

  it('perfil desconhecido (fora de A|B|C|OFF) cai em no-profile, nao em active', async () => {
    const { screen } = await renderPicker({
      getProfileForDay: () => 'X',
    });
    expect(
      (await screen.findByTestId('week-day-chip-2')).getAttribute('data-day-state'),
    ).toBe('no-profile');
  });

  it('chip de dia sem perfil ativo tem title explicando por que ele seria pulado', async () => {
    const { screen } = await renderPicker({
      getProfileForDay: (d: number) => (d === 5 ? null : 'A'),
    });
    const title = (await screen.findByTestId('week-day-chip-5')).getAttribute(
      'title',
    );
    expect(title).toBeTruthy();
    expect(title).toMatch(/perfil/i);
  });

  it('chip de dia OFF tem title citando OFF', async () => {
    const { screen } = await renderPicker({
      getProfileForDay: (d: number) => (d === 4 ? 'OFF' : 'A'),
    });
    const title = (await screen.findByTestId('week-day-chip-4')).getAttribute(
      'title',
    );
    expect(title).toBeTruthy();
    expect(title).toMatch(/OFF/i);
  });
});
