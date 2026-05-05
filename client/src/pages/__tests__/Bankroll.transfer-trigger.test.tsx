/**
 * Bankroll-Reform 2026-05-05: founder removeu botoes do header.
 * Botao "Transferir" agora vive dentro de WalletDetailPanel (visivel apos
 * selecionar carteira). Header so tem titulo + count.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(async (method: string, url: string) => {
    const r = await (global.fetch as any)(url, { method, credentials: "include" });
    if (!r?.ok) throw new Error("mock_fetch_not_ok");
    return r.json();
  }),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

vi.mock("@/components/bankroll/BankrollWidget", () => ({
  BankrollWidget: () => null,
}));
vi.mock("@/components/bankroll/BankrollHistoryTable", () => ({
  BankrollHistoryTable: () => null,
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

// WalletDetailPanel mock que expoe canTransfer + onTransferClick para o teste.
const detailPanelSpy = vi.fn();
vi.mock("@/components/bankroll/WalletDetailPanel", () => ({
  WalletDetailPanel: (props: any) => {
    detailPanelSpy(props);
    return (
      <div data-testid="wallet-detail-mock">
        <button
          data-testid="wallet-detail-transfer-button"
          disabled={!props.canTransfer}
          onClick={props.onTransferClick}
        >
          Transferir
        </button>
      </div>
    );
  },
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  detailPanelSpy.mockClear();
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

describe("BankrollPage — Transfer wiring (pos-reform)", () => {
  it("header NAO renderiza mais bankroll-transfer-trigger-header", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ wallets: [], totalUSD: "0", walletCount: 0, byWallet: [] }),
    });
    render(wrap(<BankrollPage />));
    await waitFor(() => {
      expect(screen.queryByTestId("bankroll-transfer-trigger-header")).toBeNull();
    });
  });

  it("WalletDetailPanel recebe canTransfer=false quando ha 1 wallet ativa", async () => {
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
      const last = detailPanelSpy.mock.calls.at(-1)?.[0];
      expect(last?.canTransfer).toBe(false);
    });
  });

  it("WalletDetailPanel recebe canTransfer=true + onTransferClick quando ha 2+ wallets ativas", async () => {
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
    await waitFor(() => {
      const last = detailPanelSpy.mock.calls.at(-1)?.[0];
      expect(last?.canTransfer).toBe(true);
      expect(typeof last?.onTransferClick).toBe("function");
    });
  });
});
