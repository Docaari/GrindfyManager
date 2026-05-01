/**
 * Sprint Bankroll-3 — Implementer UX Round (#1 wiring)
 *
 * Garante que o botao "Transferir" aparece no header da pagina /bankroll
 * e abre o TransferDialog. Antes deste round, TransferDialog existia mas
 * nao era importado em nenhuma pagina (componente orfao).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

// Stubs leves para componentes pesados nao relacionados ao trigger.
vi.mock("@/components/bankroll/BankrollWidget", () => ({
  BankrollWidget: () => null,
}));
vi.mock("@/components/bankroll/BankrollHistoryTable", () => ({
  BankrollHistoryTable: () => null,
}));
vi.mock("@/components/bankroll/BankrollMovementDialog", () => ({
  BankrollMovementDialog: () => null,
}));
vi.mock("@/components/bankroll/WalletCreateDialog", () => ({
  WalletCreateDialog: () => null,
}));
vi.mock("@/components/bankroll/RakebackDialog", () => ({
  RakebackDialog: () => null,
}));
vi.mock("@/components/bankroll/WalletList", () => ({
  WalletList: () => null,
}));
vi.mock("@/components/bankroll/WalletDetailPanel", () => ({
  WalletDetailPanel: () => null,
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as any;
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

import BankrollPage from "../Bankroll";

describe("BankrollPage — TransferDialog wiring (#1)", () => {
  it("renderiza botao bankroll-transfer-trigger-header no header", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ wallets: [], totalUSD: "0", walletCount: 0, byWallet: [] }),
    });
    render(wrap(<BankrollPage />));
    await waitFor(() => {
      expect(screen.getByTestId("bankroll-transfer-trigger-header")).toBeInTheDocument();
    });
  });

  it("botao desabilitado quando ha menos de 2 wallets ativas", async () => {
    fetchMock.mockImplementation((url: any) => {
      const u = String(url);
      if (u.includes("/api/wallets")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            wallets: [
              { id: "w1", name: "Single", platform: "GGNetwork", nativeCurrency: "USD", balance: "100", status: "active" },
            ],
          }),
        });
      }
      if (u.includes("/api/bankroll/consolidated")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ totalUSD: "100", walletCount: 1, byWallet: [], aggregationMode: "global" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(wrap(<BankrollPage />));
    await waitFor(() => {
      const btn = screen.getByTestId("bankroll-transfer-trigger-header") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  it("abre TransferDialog (data-testid=transfer-dialog) ao clicar no trigger", async () => {
    fetchMock.mockImplementation((url: any) => {
      const u = String(url);
      if (u.includes("/api/wallets")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            wallets: [
              { id: "w1", name: "GG", platform: "GGNetwork", nativeCurrency: "USD", balance: "100", status: "active" },
              { id: "w2", name: "Suprema", platform: "Suprema", nativeCurrency: "BRL", balance: "500", status: "active" },
            ],
          }),
        });
      }
      if (u.includes("/api/bankroll/consolidated")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ totalUSD: "200", walletCount: 2, byWallet: [], aggregationMode: "global" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(wrap(<BankrollPage />));
    const user = userEvent.setup();
    await waitFor(() => {
      const btn = screen.getByTestId("bankroll-transfer-trigger-header") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    await user.click(screen.getByTestId("bankroll-transfer-trigger-header"));
    await waitFor(() => {
      expect(screen.getByTestId("transfer-dialog")).toBeInTheDocument();
    });
  });
});
