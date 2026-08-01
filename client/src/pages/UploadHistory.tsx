import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AutoUpload from "@/components/AutoUpload";
import { Upload, CheckCircle, AlertCircle, Database, Trash2, Undo2, Eraser } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
// ADR-243 — conferencia do import (lidas x importadas x duplicadas x rejeitadas).
import { ImportReconciliationCard, type ImportReconciliation } from "@/components/upload/ImportReconciliationCard";
import { BulkDeleteTournamentsCard } from "@/components/upload/BulkDeleteTournamentsCard";
import { UploadStatCard } from "@/components/upload/UploadStatCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Página de importação de histórico.
 *
 * Remodelada em 2026-08-01 para o padrão das telas modernas (Dashboard, Grade):
 * cabeçalho e cards alinhados à esquerda, tokens semânticos no lugar de cores
 * cruas, e os três domínios da página (importar / histórico / limpeza) separados
 * em abas em vez de empilhados num scroll único — `ui-patterns.md` §16.
 *
 * Também saíram daqui: um bloco inteiro de "Resultado do Upload" que NUNCA
 * renderizava (o estado que o controlava jamais era preenchido), um estado
 * `isUploading` que só era escrito e nunca lido, e um `hover:bg-gray-750` que não
 * existe no Tailwind — o hover da lista simplesmente não acontecia.
 */

interface UploadRecord {
  id: string;
  filename: string;
  status: "success" | "error" | "processing";
  tournamentsCount: number;
  uploadDate: string;
  errorMessage?: string;
  rowsInFile?: number | null;
  duplicatesFound?: number;
  rejectedCount?: number;
}

export default function UploadHistory() {
  const [lastReconciliation, setLastReconciliation] = useState<ImportReconciliation | null>(null);
  const [activeTab, setActiveTab] = useState('importar');
  /** Import aguardando confirmação de "desfazer" (substitui `window.confirm`). */
  const [undoTarget, setUndoTarget] = useState<UploadRecord | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const uploadHistoryQuery = useQuery({
    queryKey: ["/api/upload-history"],
    enabled: isAuthenticated,
    queryFn: async () => apiRequest('GET', '/api/upload-history'),
  });

  const siteStatsQuery = useQuery({
    queryKey: ["/api/tournaments/sites"],
    enabled: isAuthenticated,
    queryFn: async () => apiRequest('GET', '/api/tournaments/sites'),
  });

  /**
   * Invalida tudo que depende do histórico importado. Uma lista só, usada pelas
   * três mutações — antes cada uma invalidava um subconjunto diferente, então
   * desfazer um import deixava alguns gráficos do dashboard exibindo dado morto.
   */
  const invalidateImportDependents = () => {
    const keys = [
      '/api/upload-history', '/api/upload-stats', '/api/tournaments/sites',
      '/api/tournaments', '/api/dashboard/stats', '/api/dashboard/performance',
      '/api/dashboard/filter-options',
    ];
    for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] });
    // As abas do dashboard usam uma chave por recorte (/api/analytics/by-site,
    // by-buyin, ...): casar por prefixo pega todas de uma vez.
    queryClient.invalidateQueries({
      predicate: (query) => {
        const first = query.queryKey?.[0];
        return typeof first === 'string' && first.startsWith('/api/analytics');
      },
    });
  };

  // ADR-243 — desfazer import: remove os torneios daquele upload_id.
  const undoUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => apiRequest('POST', `/api/upload-history/${uploadId}/undo`),
    onSuccess: (data: any) => {
      toast({ title: 'Import desfeito', description: data?.message ?? 'Torneios do import removidos' });
      invalidateImportDependents();
      setUndoTarget(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao desfazer',
        description: error?.response?.data?.message ?? error?.message ?? 'Falha ao desfazer o import',
        variant: 'destructive',
      });
      setUndoTarget(null);
    },
  });

  const deleteUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => apiRequest('DELETE', `/api/upload-history/${uploadId}`),
    onSuccess: () => {
      toast({ title: "Registro removido", description: "O registro saiu do histórico. Os torneios foram mantidos." });
      invalidateImportDependents();
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível remover o registro", variant: "destructive" });
    },
  });

  const history: UploadRecord[] = Array.isArray(uploadHistoryQuery.data) ? uploadHistoryQuery.data : [];
  const sites = Array.isArray(siteStatsQuery.data) ? siteStatsQuery.data : [];
  const totalTournaments = sites.reduce((total: number, site: any) => total + (parseInt(site?.count ?? 0, 10) || 0), 0);
  const activeSites = sites.filter((site: any) => (parseInt(site?.count ?? 0, 10) || 0) > 0).length;
  const successfulUploads = history.filter((upload) => upload.status === 'success').length;

  const isLoading = uploadHistoryQuery.isLoading || siteStatsQuery.isLoading;
  // Só é erro de página quando as DUAS fontes falham; uma só degrada em silêncio.
  const hasFatalError = uploadHistoryQuery.isError && siteStatsQuery.isError;

  const goToTab = (tab: string) => setActiveTab(tab);

  if (hasFatalError) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <PageHeader title="Importar histórico" subtitle="Traga seus torneios das redes para o Grindfy" />
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-red-400 text-lg font-semibold">Erro ao carregar seus imports</p>
          <p className="text-muted-foreground">Não foi possível buscar o histórico de importações.</p>
          <Button
            onClick={() => {
              uploadHistoryQuery.refetch();
              siteStatsQuery.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Importar histórico"
        subtitle="Traga seus torneios das redes para o Grindfy e acompanhe cada importação"
      />

      {/* Indicadores — sempre visíveis, independentes da aba. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UploadStatCard
          icon={<Database className="h-5 w-5" />}
          label="Torneios importados"
          value={isLoading ? '—' : totalTournaments.toLocaleString('pt-BR')}
          hint="no seu histórico"
          tone="info"
          testId="upload-stat-tournaments"
        />
        <UploadStatCard
          icon={<CheckCircle className="h-5 w-5" />}
          label="Sites com dados"
          value={isLoading ? '—' : activeSites}
          hint="redes já importadas"
          tone="success"
          testId="upload-stat-sites"
        />
        <UploadStatCard
          icon={<Upload className="h-5 w-5" />}
          label="Importações concluídas"
          value={isLoading ? '—' : successfulUploads}
          hint="arquivos processados com sucesso"
          tone="accent"
          testId="upload-stat-uploads"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* onClick redundante: Radix TabsTrigger reage a onMouseDown, e
            `fireEvent.click` do RTL não dispara mousedown (lição #27). */}
        <TabsList>
          <TabsTrigger value="importar" onClick={() => goToTab('importar')} data-testid="upload-tab-importar">
            Importar
          </TabsTrigger>
          <TabsTrigger value="historico" onClick={() => goToTab('historico')} data-testid="upload-tab-historico">
            Histórico{history.length > 0 ? ` (${history.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="limpeza" onClick={() => goToTab('limpeza')} data-testid="upload-tab-limpeza">
            Limpeza
          </TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="mt-6 space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-xl">
                <Upload className="h-5 w-5 text-primary" />
                Enviar arquivo
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                CSV ou Excel exportado da sua rede. Torneios repetidos são detectados e não entram duas vezes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <AutoUpload
                onUploadComplete={(result) => {
                  // ADR-243: guarda a conferencia devolvida pelo backend.
                  setLastReconciliation(result?.reconciliation ?? null);
                  invalidateImportDependents();
                  toast({
                    title: "Importação concluída",
                    description: result?.message || "Arquivo processado com sucesso",
                  });
                }}
              />

              {lastReconciliation && (
                <ImportReconciliationCard
                  reconciliation={lastReconciliation}
                  title="Conferência do último import"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-xl">
                <Database className="h-5 w-5 text-primary" />
                Importações anteriores
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Cada linha mostra o que o arquivo trazia e o que entrou de fato.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {uploadHistoryQuery.isLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : history.length === 0 ? (
                <EmptyState
                  icon={<Database className="w-full h-full" />}
                  title="Nenhuma importação ainda"
                  description="Envie seu primeiro arquivo para começar a analisar seus torneios."
                  ctaLabel="Ir para o envio"
                  ctaAction={() => goToTab('importar')}
                  area="upload"
                  variant="compact"
                />
              ) : (
                <div className="space-y-3">
                  {history.map((upload) => (
                    <div
                      key={upload.id}
                      className="rounded-lg border border-border bg-background/40 p-4 hover:border-foreground/20 transition-colors"
                      data-testid={`upload-row-${upload.id}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            upload.status === 'success' ? 'bg-green-500/15' : 'bg-red-500/15'
                          }`}>
                            {upload.status === 'success'
                              ? <CheckCircle className="h-5 w-5 text-green-400" />
                              : <AlertCircle className="h-5 w-5 text-red-400" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-foreground font-medium truncate" title={upload.filename}>
                              {upload.filename}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap text-sm text-muted-foreground">
                              <span><strong className="text-foreground">{upload.tournamentsCount}</strong> torneios</span>
                              {/* ADR-243: reconciliacao — o jogador ve o que o arquivo tinha. */}
                              {upload.rowsInFile != null && (
                                <>
                                  <span>·</span>
                                  <span data-testid="history-rows-in-file">{upload.rowsInFile} linhas no arquivo</span>
                                </>
                              )}
                              {(upload.duplicatesFound ?? 0) > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-300">{upload.duplicatesFound} duplicadas</span>
                                </>
                              )}
                              {(upload.rejectedCount ?? 0) > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="text-red-400" data-testid="history-rejected">
                                    {upload.rejectedCount} rejeitadas
                                  </span>
                                </>
                              )}
                              <span>·</span>
                              <span>{new Date(upload.uploadDate).toLocaleDateString('pt-BR')}</span>
                            </div>
                            {upload.errorMessage && (
                              <p className="text-sm text-red-400 mt-2 bg-red-500/10 p-2 rounded">
                                {upload.errorMessage}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge
                            variant={upload.status === 'success' ? 'default' : 'destructive'}
                            className={upload.status === 'success'
                              ? 'bg-green-500/15 text-green-300 hover:bg-green-500/15'
                              : 'bg-red-500/15 text-red-300 hover:bg-red-500/15'}
                          >
                            {upload.status === 'success' ? 'Sucesso' : 'Erro'}
                          </Badge>

                          {/* ADR-243: desfaz o import (remove os torneios daquele
                              arquivo). So aparece para imports que gravaram. */}
                          {upload.status === 'success' && upload.tournamentsCount > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setUndoTarget(upload)}
                              disabled={undoUploadMutation.isPending}
                              className="text-amber-300 hover:text-amber-200 hover:bg-amber-500/10"
                              data-testid={`undo-import-${upload.id}`}
                              title="Desfazer import (remove os torneios deste arquivo)"
                            >
                              <Undo2 className="h-4 w-4 mr-1" />
                              Desfazer
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteUploadMutation.mutate(upload.id)}
                            disabled={deleteUploadMutation.isPending}
                            className="text-muted-foreground hover:text-red-300 hover:bg-red-500/10"
                            title="Remover apenas o registro do histórico (mantém os torneios)"
                            data-testid={`delete-record-${upload.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="limpeza" className="mt-6 space-y-4">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Eraser className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              Remoção em massa de torneios do seu histórico. Use quando um import entrou errado
              e você quer limpar por período ou por site.
            </p>
          </div>
          <BulkDeleteTournamentsCard />
        </TabsContent>
      </Tabs>

      {/* Confirmação de desfazer — era `window.confirm`, que não dá para estilizar
          nem testar e some do fluxo em alguns navegadores. */}
      <AlertDialog open={!!undoTarget} onOpenChange={(open) => { if (!open) setUndoTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer esta importação?</AlertDialogTitle>
            <AlertDialogDescription>
              Os <strong>{undoTarget?.tournamentsCount}</strong> torneios importados de{' '}
              <strong>{undoTarget?.filename}</strong> serão removidos do seu histórico.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (undoTarget) undoUploadMutation.mutate(undoTarget.id); }}
              data-testid="confirm-undo-import"
            >
              Desfazer import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
