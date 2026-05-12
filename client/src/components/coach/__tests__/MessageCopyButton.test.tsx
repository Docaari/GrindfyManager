import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-06 — Copy-to-clipboard
//
// Icone Copy no footer da bubble do assistant. Click copia cleanText
// (sem tags internas) para clipboard e mostra toast "Copiado".
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-06)
// Arquivo sob teste: client/src/components/coach/MessageCopyButton.tsx (AINDA NAO EXISTE)
// =============================================================================

import { MessageCopyButton } from '../MessageCopyButton';

const writeTextMock = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  writeTextMock.mockClear();
  // navigator.clipboard e getter-only em jsdom recente — usar defineProperty.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
    writable: true,
  });
});

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (args: any) => toastMock(args),
}));
beforeEach(() => toastMock.mockClear());

describe('<MessageCopyButton>', () => {
  it('renderiza icone Copy como botao', () => {
    render(<MessageCopyButton content="Oi, tudo bem?" />);
    const btn =
      document.querySelector('button[aria-label*="Copiar"]') ||
      document.querySelector('button[aria-label*="copiar"]');
    expect(btn).toBeTruthy();
    // Icone svg presente (lucide Copy icon)
    expect(btn!.querySelector('svg')).toBeTruthy();
  });

  it('aria-label="Copiar mensagem" ou similar', () => {
    render(<MessageCopyButton content="Oi" />);
    const btn = document.querySelector('button[aria-label]') as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    const aria = btn!.getAttribute('aria-label') || '';
    expect(aria.toLowerCase()).toMatch(/copiar/);
  });

  it('click chama navigator.clipboard.writeText com cleanText (sem tags internas)', async () => {
    const raw = 'Seu ROI e alto [confianca: alta, N=145]. Veja [Fonte: Dashboard > Por Speed].';
    // fireEvent (nao userEvent.setup) — userEvent v14 instala o proprio stub de
    // clipboard em setup(), o que sobrescreveria writeTextMock.
    render(<MessageCopyButton content={raw} />);

    const btn = document.querySelector('button[aria-label*="Copiar"]') as HTMLButtonElement;
    fireEvent.click(btn);

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(1));
    const copied = writeTextMock.mock.calls[0][0];
    // Tags internas nao aparecem no texto copiado
    expect(copied).not.toMatch(/\[confianca:/);
    expect(copied).not.toMatch(/\[Fonte:/);
    // Mas o conteudo real esta la
    expect(copied).toMatch(/Seu ROI e alto/);
  });

  it('dispara toast "Copiado" apos click bem-sucedido', async () => {
    const user = userEvent.setup();
    render(<MessageCopyButton content="teste" />);

    const btn = document.querySelector('button[aria-label*="Copiar"]') as HTMLButtonElement;
    await user.click(btn);

    expect(toastMock).toHaveBeenCalled();
    const payload = JSON.stringify(toastMock.mock.calls[0][0]);
    expect(payload).toMatch(/Copiado|copiado/);
  });
});
