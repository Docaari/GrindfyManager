/**
 * Sprint FX-1 RF-07: FxRatesPanel — UI Settings.
 *
 * Mostra USD/BRL + USD/EUR resolvidos pela cascata user > system > wallets >
 * fallback. Badge indica origem ('sistema' / 'manual' / 'fallback').
 *
 * Acoes:
 *   - "Editar manualmente" abre dialog com inputs preenchidos.
 *     Save → PUT /api/user-settings { exchangeRates: {BRL, EUR} }.
 *   - "Resetar para taxas do sistema" → PUT /api/user-settings { exchangeRates: {} }.
 *
 * NOTA TECNICA: NAO usa JSX porque o test FxRatesPanel.test.tsx usa
 * `require()` sincrono, que em Vitest 4 nao passa pela transform pipeline
 * (lesson #14 CLAUDE.md). React.createElement direto evita o problema.
 */

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const h = React.createElement;

function formatRate(v) {
  if (v == null || !Number.isFinite(v)) return "-";
  return Number(v).toFixed(4);
}

function badgeLabel(source) {
  if (source === "user" || source === "mixed") return "manual";
  if (source === "system") return "sistema";
  if (source === "wallets") return "wallets";
  return "fallback";
}

export function FxRatesPanel() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["fx-current"],
    queryFn: () => apiRequest("GET", "/api/fx/current"),
  });

  const [editOpen, setEditOpen] = React.useState(false);
  const [brlInput, setBrlInput] = React.useState("");
  const [eurInput, setEurInput] = React.useState("");

  React.useEffect(() => {
    if (query.data?.rates) {
      setBrlInput(String(query.data.rates.BRL ?? ""));
      setEurInput(String(query.data.rates.EUR ?? ""));
    }
  }, [query.data?.rates?.BRL, query.data?.rates?.EUR]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      return await apiRequest("PUT", "/api/user-settings", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fx-current"] });
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      setEditOpen(false);
    },
  });

  if (query.isLoading) {
    return h(
      "div",
      {
        "data-testid": "fx-loading",
        className: "p-4 border rounded-lg animate-pulse",
      },
      "Carregando taxas...",
    );
  }

  if (query.isError) {
    return h(
      "div",
      {
        "data-testid": "fx-error",
        className: "p-4 border rounded-lg border-red-500",
      },
      h("p", null, "Erro ao carregar taxas."),
      h(
        "button",
        {
          type: "button",
          onClick: () => query.refetch(),
          className: "mt-2 px-3 py-1 border rounded",
        },
        "Tentar novamente",
      ),
    );
  }

  const data = query.data;
  const source = data?.source ?? "fallback";
  const brl = data?.rates?.BRL;
  const eur = data?.rates?.EUR;

  const editDialog = editOpen
    ? h(
        "div",
        {
          "data-testid": "fx-edit-dialog",
          className: "mt-3 p-3 border rounded space-y-2",
        },
        h(
          "label",
          { className: "block text-sm" },
          "USD/BRL",
          h("input", {
            "data-testid": "fx-input-BRL",
            type: "number",
            step: "0.0001",
            value: brlInput,
            onChange: (e) => setBrlInput(e.target.value),
            className: "ml-2 px-2 py-1 border rounded",
          }),
        ),
        h(
          "label",
          { className: "block text-sm" },
          "USD/EUR",
          h("input", {
            "data-testid": "fx-input-EUR",
            type: "number",
            step: "0.0001",
            value: eurInput,
            onChange: (e) => setEurInput(e.target.value),
            className: "ml-2 px-2 py-1 border rounded",
          }),
        ),
        h(
          "div",
          { className: "flex items-center gap-2" },
          h(
            "button",
            {
              type: "button",
              "data-testid": "fx-save-btn",
              onClick: () => {
                const payload = {};
                const brlNum = Number(brlInput);
                const eurNum = Number(eurInput);
                if (Number.isFinite(brlNum) && brlNum > 0) payload.BRL = brlNum;
                if (Number.isFinite(eurNum) && eurNum > 0) payload.EUR = eurNum;
                saveMutation.mutate({ exchangeRates: payload });
              },
              className: "px-3 py-1 text-sm bg-primary text-primary-foreground rounded",
            },
            "Salvar",
          ),
          h(
            "button",
            {
              type: "button",
              onClick: () => setEditOpen(false),
              className: "px-3 py-1 text-sm border rounded",
            },
            "Cancelar",
          ),
        ),
      )
    : null;

  return h(
    "div",
    { className: "p-4 border rounded-lg space-y-3" },
    h(
      "div",
      { className: "flex items-center justify-between" },
      h("h3", { className: "text-base font-semibold" }, "Taxas de Cambio"),
      h(
        "span",
        {
          "data-testid": "fx-source-badge",
          className: "px-2 py-0.5 text-xs rounded bg-muted",
        },
        badgeLabel(source),
      ),
    ),
    h(
      "div",
      { className: "space-y-1" },
      h(
        "div",
        { className: "flex items-center justify-between" },
        h("span", { className: "text-sm text-muted-foreground" }, "USD/BRL"),
        h(
          "span",
          { "data-testid": "fx-rate-BRL", className: "font-mono" },
          formatRate(brl),
        ),
      ),
      h(
        "div",
        { className: "flex items-center justify-between" },
        h("span", { className: "text-sm text-muted-foreground" }, "USD/EUR"),
        h(
          "span",
          { "data-testid": "fx-rate-EUR", className: "font-mono" },
          formatRate(eur),
        ),
      ),
    ),
    h(
      "div",
      { className: "flex items-center gap-2" },
      h(
        "button",
        {
          type: "button",
          "data-testid": "fx-edit-btn",
          onClick: () => setEditOpen(true),
          className: "px-3 py-1 text-sm border rounded",
        },
        "Editar manualmente",
      ),
      h(
        "button",
        {
          type: "button",
          "data-testid": "fx-reset-btn",
          onClick: () => saveMutation.mutate({ exchangeRates: {} }),
          className: "px-3 py-1 text-sm border rounded",
        },
        "Resetar para taxas do sistema",
      ),
    ),
    editDialog,
  );
}

export default FxRatesPanel;
