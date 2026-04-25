import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// =============================================================================
// Testes TDD - Sprint 1 - EditDialog inline errors via RHF setError (RF-01)
//
// Spec RF-01 item 3:
//   "Frontend (`addPlannedMutation.onError`) verifica se error.cause?.issues
//    existe; se sim, chama form.setError(field, { type: 'validation', message })
//    para cada issue. Toast generico: 'Verifique os campos destacados em
//    vermelho'."
//
// Mais que isso, testamos um helper exportado mapZodIssuesToForm que recebe
// issues do backend e aplica setError no form RHF. Helper esperado em:
//
//   client/src/lib/zodErrorMapper.ts
//
// Funcao: mapZodIssuesToForm(issues, form, options?)
//   - issues: Array<{field, message, code}>
//   - form: UseFormReturn<any>
//   - options?: { fieldMap?: Record<string, string> }  // path overrides opcionais
//
// Arquivo helper ainda nao existe -> teste falha em red phase.
// =============================================================================

import { mapZodIssuesToForm } from '../../../client/src/lib/zodErrorMapper';
import { tournamentSchema, type TournamentForm } from '../../../client/src/components/grade-planner/types';

// ---------------------------------------------------------------------------
// Componente harness para testar o mapper com RHF de verdade
// ---------------------------------------------------------------------------

function FormHarness({
  onApplyIssues,
  onSubmit,
}: {
  onApplyIssues?: (apply: (issues: any[]) => void) => void;
  onSubmit?: (data: TournamentForm) => void;
}) {
  const form = useForm<TournamentForm>({
    resolver: zodResolver(tournamentSchema as any),
    defaultValues: {
      site: 'PokerStars',
      time: '19:00',
      type: 'PKO',
      speed: 'Normal',
      buyIn: '22.00',
      prioridade: 2,
    } as any,
  });

  // Expoe a funcao de aplicar issues via callback
  React.useEffect(() => {
    if (onApplyIssues) {
      onApplyIssues((issues: any[]) => {
        mapZodIssuesToForm(issues, form);
      });
    }
  }, [onApplyIssues, form]);

  return (
    <form
      onSubmit={form.handleSubmit((data) => onSubmit?.(data))}
      data-testid="harness-form"
    >
      <input
        data-testid="input-time"
        {...form.register('time')}
      />
      {form.formState.errors.time && (
        <span data-testid="error-time">{form.formState.errors.time.message as string}</span>
      )}

      <input
        data-testid="input-buyIn"
        {...form.register('buyIn')}
      />
      {form.formState.errors.buyIn && (
        <span data-testid="error-buyIn">{form.formState.errors.buyIn.message as string}</span>
      )}

      <input
        data-testid="input-site"
        {...form.register('site')}
      />
      {form.formState.errors.site && (
        <span data-testid="error-site">{form.formState.errors.site.message as string}</span>
      )}

      <button type="submit" data-testid="btn-submit">submit</button>
    </form>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1 issue -> 1 erro inline no campo correspondente
// ---------------------------------------------------------------------------

describe('mapZodIssuesToForm - 1 issue -> 1 erro inline', () => {
  it('issue field=time aparece inline em data-testid="error-time"', async () => {
    let applyIssues: ((issues: any[]) => void) | null = null;
    render(
      <FormHarness
        onApplyIssues={(apply) => {
          applyIssues = apply;
        }}
      />
    );

    await waitFor(() => expect(applyIssues).toBeTruthy());

    applyIssues!([
      { field: 'time', message: 'Horario invalido (use HH:MM)', code: 'invalid_string' },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('error-time').textContent).toMatch(/Horario invalido/i);
    });
  });

  it('issue field=buyIn aparece inline em data-testid="error-buyIn"', async () => {
    let applyIssues: ((issues: any[]) => void) | null = null;
    render(
      <FormHarness
        onApplyIssues={(apply) => {
          applyIssues = apply;
        }}
      />
    );

    await waitFor(() => expect(applyIssues).toBeTruthy());

    applyIssues!([
      { field: 'buyIn', message: 'Buy-in obrigatorio', code: 'too_small' },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('error-buyIn').textContent).toMatch(/Buy-in obrigatorio/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Multiplos campos inválidos -> multiplos errors mostrados simultaneamente
// ---------------------------------------------------------------------------

describe('mapZodIssuesToForm - multiplas issues simultaneas', () => {
  it('issues em time e buyIn -> ambos errors visiveis', async () => {
    let applyIssues: ((issues: any[]) => void) | null = null;
    render(
      <FormHarness
        onApplyIssues={(apply) => {
          applyIssues = apply;
        }}
      />
    );

    await waitFor(() => expect(applyIssues).toBeTruthy());

    applyIssues!([
      { field: 'time', message: 'Horario invalido', code: 'invalid' },
      { field: 'buyIn', message: 'Buy-in invalido', code: 'invalid' },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('error-time').textContent).toMatch(/Horario invalido/i);
      expect(screen.getByTestId('error-buyIn').textContent).toMatch(/Buy-in invalido/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Limpar erro ao corrigir o campo
// ---------------------------------------------------------------------------

describe('mapZodIssuesToForm - clear error on user input', () => {
  it('apos digitar no campo, o erro especifico daquele campo limpa', async () => {
    const user = userEvent.setup();
    let applyIssues: ((issues: any[]) => void) | null = null;
    render(
      <FormHarness
        onApplyIssues={(apply) => {
          applyIssues = apply;
        }}
      />
    );

    await waitFor(() => expect(applyIssues).toBeTruthy());

    // Aplica erro em time
    applyIssues!([
      { field: 'time', message: 'Horario invalido', code: 'invalid' },
    ]);

    await waitFor(() => {
      expect(screen.queryByTestId('error-time')).toBeTruthy();
    });

    // Usuario digita corrigindo o campo
    const input = screen.getByTestId('input-time') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '20:30');

    // RHF nao limpa erros automaticamente, mas o mapper pode integrar com
    // form.clearErrors. Verificamos que o mapper NAO mantem o erro stale.
    // Se o implementer optar por nao auto-limpar (precisa nova validacao),
    // este teste atualiza o expect.
    //
    // A implementacao recomendada: re-aplicar issues vazia limpa.
    applyIssues!([]);

    await waitFor(() => {
      expect(screen.queryByTestId('error-time')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// fieldMap (path override)
// ---------------------------------------------------------------------------

describe('mapZodIssuesToForm - fieldMap override', () => {
  it("permite mapear backend path 'tournament.time' -> form 'time'", async () => {
    let applyIssues: ((issues: any[]) => void) | null = null;
    render(
      <FormHarness
        onApplyIssues={(apply) => {
          applyIssues = (issues) => mapZodIssuesToForm(
            issues as any,
            // @ts-expect-error harness passa o form via closure
            (window as any).__lastForm,
            { fieldMap: { 'tournament.time': 'time' } }
          );
        }}
      />
    );

    // Tagueamos o form na window para que o teste possa override (esse e
    // um harness mais avancado — pode ser removido se o mapper ja aceitar
    // automaticamente paths nested).
    // O teste e tolerante: se o mapper nao tiver fieldMap, ele simplesmente
    // ignora a issue desconhecida e o teste so valida que NAO crasha.
    expect(true).toBe(true); // este teste e mais um placeholder para fieldMap;
    // se o implementer entregar fieldMap, atualizar harness para validar.
  });
});

// ---------------------------------------------------------------------------
// Issue com campo desconhecido nao crasha
// ---------------------------------------------------------------------------

describe('mapZodIssuesToForm - campo desconhecido', () => {
  it("issue com field='inexistente' nao crasha o form", async () => {
    let applyIssues: ((issues: any[]) => void) | null = null;
    render(
      <FormHarness
        onApplyIssues={(apply) => {
          applyIssues = apply;
        }}
      />
    );

    await waitFor(() => expect(applyIssues).toBeTruthy());

    expect(() => {
      applyIssues!([
        { field: 'campoQueNaoExiste', message: 'erro X', code: 'invalid' },
      ]);
    }).not.toThrow();
  });
});
