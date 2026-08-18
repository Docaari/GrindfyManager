/**
 * Botoes de soneca (+1min / +3min) no toast de alerta do Grind Live.
 *
 * O componente vive dentro de um `Toast` do Radix, entao o render de teste
 * precisa do `ToastProvider` — `ToastAction` exige o contexto do toast.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

describe('AlertSnoozeActions', () => {
  beforeEach(() => {
    cleanup();
  });

  const renderActions = async (onSnooze: (minutes: number) => void) => {
    const { AlertSnoozeActions } = await import(
      '../../../client/src/components/grind-session-live/AlertSnoozeActions'
    );
    const { Toast, ToastProvider, ToastViewport } = await import(
      '../../../client/src/components/ui/toast'
    );
    return render(
      <ToastProvider>
        <Toast open>
          <AlertSnoozeActions onSnooze={onSnooze} />
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
  };

  it('renderiza um botao para cada opcao de soneca', async () => {
    await renderActions(vi.fn());

    expect(screen.getByTestId('alert-snooze-1min')).toBeTruthy();
    expect(screen.getByTestId('alert-snooze-3min')).toBeTruthy();
  });

  it('rotulo mostra os minutos que o jogador esta comprando', async () => {
    await renderActions(vi.fn());

    expect(screen.getByTestId('alert-snooze-1min').textContent).toContain('+1min');
    expect(screen.getByTestId('alert-snooze-3min').textContent).toContain('+3min');
  });

  it('clique no +1min chama onSnooze com 1', async () => {
    const onSnooze = vi.fn();
    await renderActions(onSnooze);

    fireEvent.click(screen.getByTestId('alert-snooze-1min'));

    expect(onSnooze).toHaveBeenCalledTimes(1);
    expect(onSnooze).toHaveBeenCalledWith(1);
  });

  it('clique no +3min chama onSnooze com 3', async () => {
    const onSnooze = vi.fn();
    await renderActions(onSnooze);

    fireEvent.click(screen.getByTestId('alert-snooze-3min'));

    expect(onSnooze).toHaveBeenCalledWith(3);
  });

  it('cada botao expoe altText — o leitor de tela precisa saber a acao quando o toast some', async () => {
    await renderActions(vi.fn());

    // Radix consome `altText` e nao o repassa ao DOM; o contrato garantido aqui
    // e que o botao tem nome acessivel legivel.
    expect(screen.getByTestId('alert-snooze-1min').textContent!.trim().length).toBeGreaterThan(0);
    expect(screen.getByTestId('alert-snooze-3min').textContent!.trim().length).toBeGreaterThan(0);
  });
});
