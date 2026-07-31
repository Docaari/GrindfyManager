/**
 * BulkDeleteTournamentsCard — ADR-243.
 *
 * Substitui o painel "Limpeza Granular de Dados" que vivia dentro de
 * UploadHistory.tsx. Problemas do painel antigo, apontados no uso real:
 *   - botao primario usava `bg-poker-gold`, classe que NAO existe (o CSS so
 *     define `.text-poker-gold`) -> botao renderizava sem fundo;
 *   - periodo so por dois `<input type="date">` digitados a mao;
 *   - nao havia forma de remover TUDO (o backend recusava filtro vazio e mandava
 *     o jogador procurar outra tela);
 *   - exigia clicar "Visualizar" e so entao aparecia a confirmacao.
 *
 * Agora: escopo em 1 clique (Tudo / 7d / 30d / 90d / este ano / personalizado),
 * sites como chips com contagem, previa automatica (debounce) e confirmacao
 * proporcional ao risco — digitar CONFIRMAR apenas quando o escopo e "tudo".
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScopeId = "all" | "7d" | "30d" | "90d" | "year" | "custom";

export const SCOPES: Array<{ id: ScopeId; label: string; hint: string }> = [
  { id: "all", label: "Tudo", hint: "todo o histórico importado" },
  { id: "7d", label: "Últimos 7 dias", hint: "torneios jogados nos últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias", hint: "torneios jogados nos últimos 30 dias" },
  { id: "90d", label: "Últimos 90 dias", hint: "torneios jogados nos últimos 90 dias" },
  { id: "year", label: "Este ano", hint: "torneios jogados neste ano" },
  { id: "custom", label: "Período específico", hint: "escolha as datas" },
];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Janela de datas de cada escopo. `null` = sem limite naquela ponta. PURA. */
export function windowForScope(scope: ScopeId): { from: string | null; to: string | null } {
  const now = new Date();
  const today = isoDay(now);
  const daysAgo = (n: number) => isoDay(new Date(now.getTime() - n * 86400000));
  switch (scope) {
    case "7d":
      return { from: daysAgo(7), to: today };
    case "30d":
      return { from: daysAgo(30), to: today };
    case "90d":
      return { from: daysAgo(90), to: today };
    case "year":
      return { from: `${now.getUTCFullYear()}-01-01`, to: today };
    default:
      return { from: null, to: null };
  }
}

interface SiteRow {
  site: string;
  count: number;
}

export function BulkDeleteTournamentsCard() {
  const [scope, setScope] = useState<ScopeId>("30d");
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sites } = useQuery({
    queryKey: ["/api/tournaments/sites"],
    queryFn: async () => apiRequest("GET", "/api/tournaments/sites"),
  });
  const siteRows: SiteRow[] = Array.isArray(sites) ? sites : [];

  const isAll = scope === "all";

  const filters = useMemo(() => {
    if (isAll) return { all: true, sites: [], dateFrom: "", dateTo: "" };
    const win = scope === "custom"
      ? { from: customFrom || null, to: customTo || null }
      : windowForScope(scope);
    return {
      all: false,
      sites: selectedSites,
      dateFrom: win.from ?? "",
      dateTo: win.to ?? "",
    };
  }, [isAll, scope, customFrom, customTo, selectedSites]);

  /** Escopo vazio = nada selecionado em "personalizado" (backend recusaria). */
  const hasScope = isAll || !!filters.dateFrom || !!filters.dateTo || filters.sites.length > 0;

  const previewMutation = useMutation({
    mutationFn: async (f: typeof filters) =>
      apiRequest("POST", "/api/tournaments/bulk-delete/preview", f),
    onSuccess: (data: any) => setPreviewCount(data?.count ?? 0),
    onError: () => setPreviewCount(null),
  });

  // Prévia automática: o painel antigo exigia clicar "Visualizar" a cada ajuste.
  useEffect(() => {
    setConfirmation("");
    if (!hasScope) {
      setPreviewCount(null);
      return;
    }
    const timer = setTimeout(() => previewMutation.mutate(filters), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), hasScope]);

  const deleteMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/tournaments/bulk-delete", { ...filters, confirmation: "CONFIRMAR" }),
    onSuccess: (data: any) => {
      toast({
        title: "Limpeza concluída",
        description: `${data?.deletedCount ?? 0} torneios removidos`,
      });
      setSelectedSites([]);
      setCustomFrom("");
      setCustomTo("");
      setConfirmation("");
      setPreviewCount(null);
      for (const key of [
        "/api/tournaments",
        "/api/tournaments/sites",
        "/api/upload-history",
        "/api/upload-stats",
        "/api/dashboard/stats",
        "/api/analytics",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro na limpeza",
        description: error?.response?.data?.message || error?.message || "Falha ao remover torneios",
        variant: "destructive",
      });
    },
  });

  const totalTournaments = siteRows.reduce((a, s) => a + (s.count ?? 0), 0);
  const scopeHint = SCOPES.find((s) => s.id === scope)?.hint ?? "";
  // Risco alto = apagar tudo. Só nesse caso exigimos digitar CONFIRMAR.
  const needsTypedConfirmation = isAll;
  const canDelete =
    hasScope &&
    (previewCount ?? 0) > 0 &&
    !deleteMutation.isPending &&
    (!needsTypedConfirmation || confirmation.trim().toUpperCase() === "CONFIRMAR");

  const runDelete = () => {
    const label = isAll ? "TODO o histórico importado" : `${previewCount} torneios`;
    if (!window.confirm(`Remover ${label}?\n\nEsta ação é irreversível.`)) return;
    deleteMutation.mutate();
  };

  return (
    <Card className="bg-card border-gray-700 shadow-lg" data-testid="bulk-delete-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-3 text-xl">
          <Trash2 className="h-6 w-6 text-red-400" />
          Remover torneios importados
        </CardTitle>
        <CardDescription className="text-gray-300">
          Escolha o escopo, confira a prévia e remova. Registros de sessão ao vivo não são afetados.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Escopo em 1 clique */}
        <div className="space-y-2">
          <Label className="text-gray-300">Escopo</Label>
          <div className="flex flex-wrap gap-2" data-testid="bulk-delete-scopes">
            {SCOPES.map((s) => (
              <Button
                key={s.id}
                type="button"
                size="sm"
                variant={scope === s.id ? "default" : "outline"}
                onClick={() => setScope(s.id)}
                className={cn(
                  "rounded-full",
                  scope === s.id
                    ? s.id === "all"
                      ? "bg-red-600 hover:bg-red-700 text-white border-red-600"
                      : ""
                    : "border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700",
                )}
                data-testid={`bulk-delete-scope-${s.id}`}
              >
                {s.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-gray-400">{scopeHint}</p>
        </div>

        {/* Datas só no modo personalizado */}
        {scope === "custom" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="bulk-delete-custom-dates">
            <div className="space-y-1">
              <Label className="text-gray-300 text-sm">De</Label>
              <Input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-gray-900 border-gray-600 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-300 text-sm">Até</Label>
              <Input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-gray-900 border-gray-600 text-white"
              />
            </div>
          </div>
        )}

        {/* No escopo "Tudo" os sites nao sao filtro — mas some-los deixava a tela
            confusa ("os sites nem aparecem"). Lista-os como informacao: fica
            explicito que a remocao cobre todos. */}
        {isAll && siteRows.length > 0 && (
          <div className="space-y-2" data-testid="bulk-delete-sites-readonly">
            <Label className="text-gray-300">Sites incluídos (todos)</Label>
            <div className="flex flex-wrap gap-2">
              {siteRows.map((s) => (
                <span
                  key={s.site}
                  className="px-3 py-1.5 rounded-full text-sm border bg-red-500/10 border-red-500/40 text-red-200"
                >
                  {s.site} <span className="text-red-300/60">({s.count.toLocaleString("pt-BR")})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Sites como chips — opcional, refina o escopo */}
        {!isAll && siteRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-gray-300">
                Sites <span className="text-gray-500 text-xs">(opcional — vazio = todos)</span>
              </Label>
              {selectedSites.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-gray-400 hover:text-white"
                  onClick={() => setSelectedSites([])}
                >
                  Limpar seleção
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2" data-testid="bulk-delete-sites">
              {siteRows.map((s) => {
                const active = selectedSites.includes(s.site);
                return (
                  <button
                    key={s.site}
                    type="button"
                    onClick={() =>
                      setSelectedSites((prev) =>
                        prev.includes(s.site) ? prev.filter((x) => x !== s.site) : [...prev, s.site],
                      )
                    }
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm border transition-colors",
                      active
                        ? "bg-red-500/20 border-red-500/60 text-red-200"
                        : "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700",
                    )}
                    data-testid={`bulk-delete-site-${s.site}`}
                  >
                    {s.site} <span className="text-gray-500">({s.count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Prévia */}
        <div
          className={cn(
            "rounded-lg border p-4 flex items-center gap-3",
            (previewCount ?? 0) > 0
              ? "bg-yellow-900/15 border-yellow-500/30"
              : "bg-gray-800 border-gray-600",
          )}
          data-testid="bulk-delete-preview"
        >
          {previewMutation.isPending ? (
            <>
              <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              <span className="text-gray-300 text-sm">Calculando…</span>
            </>
          ) : !hasScope ? (
            <span className="text-gray-400 text-sm">
              Escolha um período ou informe as datas para ver quantos torneios serão removidos.
            </span>
          ) : previewCount === null ? (
            <span className="text-gray-400 text-sm">Prévia indisponível.</span>
          ) : previewCount === 0 ? (
            <span className="text-gray-300 text-sm">Nenhum torneio neste escopo.</span>
          ) : (
            <>
              <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
              <div>
                <p className="text-yellow-300 font-semibold" data-testid="bulk-delete-count">
                  {previewCount.toLocaleString("pt-BR")} torneios serão removidos
                </p>
                <p className="text-yellow-200/70 text-xs">
                  {isAll
                    ? `Todo o histórico importado${totalTournaments ? ` (${totalTournaments.toLocaleString("pt-BR")} no total)` : ""}. Ação irreversível.`
                    : "Ação irreversível."}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Confirmação digitada apenas no escopo "tudo" */}
        {needsTypedConfirmation && (previewCount ?? 0) > 0 && (
          <div className="space-y-2" data-testid="bulk-delete-confirmation">
            <Label className="text-gray-300 text-sm">
              Digite <strong className="text-red-400">CONFIRMAR</strong> para liberar a remoção total
            </Label>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="CONFIRMAR"
              className="bg-gray-900 border-red-500/50 text-white font-mono"
            />
          </div>
        )}

        <Button
          onClick={runDelete}
          disabled={!canDelete}
          variant="destructive"
          className="w-full font-semibold"
          data-testid="bulk-delete-submit"
        >
          {deleteMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Removendo…
            </>
          ) : isAll ? (
            "Remover todo o histórico"
          ) : (
            `Remover ${previewCount ? previewCount.toLocaleString("pt-BR") : ""} torneios`.trim()
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default BulkDeleteTournamentsCard;
