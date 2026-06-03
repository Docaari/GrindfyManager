import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Play,
  FileText,
  BookOpen,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  Wallet,
  AlertTriangle,
  RefreshCw,
  Target,
} from "lucide-react";
import { FilterState } from "@/components/FilterPopupSimple";
import { SessionHistoryData } from "./types";
import { EmptyState } from "@/components/ui/EmptyState";
import SessionWalletDeltaDialog from "./SessionWalletDeltaDialog";

interface SessionHistoryListProps {
  filteredSessions: SessionHistoryData[];
  historyLoading: boolean;
  historyError: boolean;
  refetchHistory: () => void;
  filterState: FilterState;
  setFilterState: (state: FilterState) => void;
  activeSession: any;
  checkExistingSessionBeforePreparation: () => void;
  onEditSession: (session: SessionHistoryData) => void;
  onDeleteSession: (session: SessionHistoryData) => void;
  onViewSessionDetails: (session: SessionHistoryData) => void;
  formatCurrency: (amountUsd: number) => string;
  mentalEnabled: boolean;
}

export default function SessionHistoryList({
  filteredSessions,
  historyLoading,
  historyError,
  refetchHistory,
  filterState,
  setFilterState,
  activeSession,
  checkExistingSessionBeforePreparation,
  onEditSession,
  onDeleteSession,
  onViewSessionDetails,
  formatCurrency,
  mentalEnabled,
}: SessionHistoryListProps) {
  const [expandedObservations, setExpandedObservations] = useState<Set<string>>(new Set());
  const [expandedObservationCards, setExpandedObservationCards] = useState<Set<string>>(new Set());
  const [walletDialogSession, setWalletDialogSession] = useState<SessionHistoryData | null>(null);

  const toggleObservations = (sessionId: string) => {
    setExpandedObservations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  const toggleObservationCard = (cardType: string, sessionId: string) => {
    const cardKey = `${cardType}-${sessionId}`;
    setExpandedObservationCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardKey)) {
        newSet.delete(cardKey);
      } else {
        newSet.add(cardKey);
      }
      return newSet;
    });
  };

  return (
    <div className="sessions-history">
      <div className="history-controls">
        <div className="grind-section-title">📚 Histórico de Sessões</div>
        <div className="period-selector">
          <button
            className={`period-btn ${filterState.period === '7d' ? 'active' : ''}`}
            onClick={() => setFilterState({...filterState, period: '7d'})}
          >
            7 dias
          </button>
          <button
            className={`period-btn ${filterState.period === '30d' ? 'active' : ''}`}
            onClick={() => setFilterState({...filterState, period: '30d'})}
          >
            30 dias
          </button>
          <button
            className={`period-btn ${filterState.period === '90d' ? 'active' : ''}`}
            onClick={() => setFilterState({...filterState, period: '90d'})}
          >
            90 dias
          </button>
          <button
            className={`period-btn ${filterState.period === 'all' ? 'active' : ''}`}
            onClick={() => setFilterState({...filterState, period: 'all'})}
          >
            Tudo
          </button>
        </div>
      </div>

      {historyLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-card border-gray-700">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Skeleton className="h-5 w-32 bg-gray-700" />
                  <Skeleton className="h-5 w-20 bg-gray-700" />
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <Skeleton className="h-12 w-full bg-gray-700" />
                  <Skeleton className="h-12 w-full bg-gray-700" />
                  <Skeleton className="h-12 w-full bg-gray-700" />
                  <Skeleton className="h-12 w-full bg-gray-700" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : historyError ? (
        <div className="text-center py-12">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <p className="grind-subheading mb-2 text-red-400">Erro ao carregar sessões</p>
          <p className="grind-body-text mb-4">Não foi possível carregar o histórico de sessões.</p>
          <Button
            variant="outline"
            onClick={() => refetchHistory()}
            className="bg-gray-800 border-gray-600 hover:bg-gray-700 text-white"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      ) : filteredSessions.length === 0 ? (
        // RF-06 (G6): EmptyState canonico — DEC-06 CTA = checkExistingSessionBeforePreparation
        <EmptyState
          icon={<Target className="w-full h-full" />}
          title="Nenhuma sessao encontrada"
          description="Comece a registrar suas sessoes de grind para ver historico e estatisticas aqui."
          ctaLabel="Registrar primeira sessao"
          ctaAction={checkExistingSessionBeforePreparation}
          area="grind-history"
        />
      ) : (
        <div>
          {(() => {
            const sessionsByMonth = filteredSessions.reduce((groups, session) => {
              const date = new Date(session.date);
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              const monthName = date.toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric'
              });

              if (!groups[monthKey]) {
                groups[monthKey] = {
                  name: monthName,
                  sessions: []
                };
              }
              groups[monthKey].sessions.push(session);
              return groups;
            }, {} as Record<string, { name: string; sessions: SessionHistoryData[] }>);

            const sortedMonths = Object.entries(sessionsByMonth)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([key, data]) => ({ key, ...data }));

            return sortedMonths.map(({ key, name, sessions }) => (
              <div key={key} className="sessions-monthly-group">
                <div className="monthly-separator">
                  <h3>{name}</h3>
                  <span className="session-count">
                    {sessions.length} sessão{sessions.length !== 1 ? 'ões' : ''}
                  </span>
                </div>

                <div className="sessions-grid">
                  {sessions
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((session: SessionHistoryData) => (
                    <div key={session.id} className="session-card" data-session-id={session.id}>
                      {/* Session Card Header */}
                      <div className="session-card-header">
                        <div className="session-card-date">
                          {new Date(session.date).toLocaleDateString('pt-BR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long'
                          })}
                        </div>
                        {/* Lucro reconciliado da banca (wallet_profit_usd) quando
                            disponivel; fallback p/ P&L de torneios em sessoes legadas. */}
                        {(() => {
                          const displayProfit = Number(
                            session.profitUsd ?? session.profit,
                          ) || 0;
                          return (
                            <div className={`session-card-result ${displayProfit >= 0 ? 'profit' : 'loss'}`}>
                              {formatCurrency(displayProfit)}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Session Summary Metrics */}
                      <div className="session-summary-metrics">
                        <div className="session-summary-metric">
                          <div className="metric-value">{Number(session.volume) || 0}</div>
                          <div className="metric-label">Volume</div>
                        </div>
                        <div className="session-summary-metric">
                          <div className="metric-value">{formatCurrency(Number(session.abiMed) || 0)}</div>
                          <div className="metric-label">ABI</div>
                        </div>
                        <div className="session-summary-metric">
                          <div className="metric-value">{(Number(session.roi) || 0).toFixed(1)}%</div>
                          <div className="metric-label">ROI</div>
                        </div>
                        <div className="session-summary-metric">
                          <div className="metric-value">{Number(session.fts) || 0}</div>
                          <div className="metric-label">FTs</div>
                        </div>
                        <div className="session-summary-metric">
                          <div className="metric-value">{Number(session.cravadas) || 0}</div>
                          <div className="metric-label">Cravadas</div>
                        </div>
                        <div className="session-summary-metric">
                          <div className="metric-value">{Number(session.breakCount) || 0}</div>
                          <div className="metric-label">Breaks</div>
                        </div>
                      </div>

                      {/* Mental State Balloons & Actions */}
                      <div className="session-mental-balloons">
                        {mentalEnabled && (() => {
                          // Convencao: valor 0 (ou null/undefined) = nao reportado.
                          // Performance vem de Warm Up + breaks. Quando user pulou,
                          // backend persiste 0 como sentinel — escondido aqui.
                          const balloons = [
                            { key: 'prep', label: 'Preparação', cls: 'prep', value: session.preparationPercentage },
                            { key: 'energy', label: 'Energia', cls: 'energy', value: session.energiaMedia },
                            { key: 'focus', label: 'Foco', cls: 'focus', value: session.focoMedio },
                            { key: 'confidence', label: 'Confiança', cls: 'confidence', value: session.confiancaMedia },
                            { key: 'emotional', label: 'Inteligência Emocional', cls: 'emotional', value: session.inteligenciaEmocionalMedia },
                            { key: 'interference', label: 'Interferências', cls: 'interference', value: session.interferenciasMedia },
                          ].filter((b) => Number(b.value) > 0);

                          if (balloons.length === 0) {
                            return (
                              <div className="mental-balloons-container">
                                <span className="text-xs text-gray-500 italic">Performance não registrada</span>
                              </div>
                            );
                          }

                          return (
                            <div className="mental-balloons-container">
                              {balloons.map((b) => (
                                <div key={b.key} className={`mental-balloon ${b.cls}`} title={b.label}>
                                  {Math.round(Number(b.value))}
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        <div className="session-card-actions">
                          <button
                            className={`session-expand-toggle ${expandedObservations.has(session.id) ? 'expanded' : ''}`}
                            onClick={() => toggleObservations(session.id)}
                            title="Expandir/Recolher sessão"
                          >
                            {expandedObservations.has(session.id) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEditSession(session)}
                            className="border-gray-600 text-gray-400 hover:text-white hover:border-gray-400"
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDeleteSession(session)}
                            className="border-red-600 text-red-400 hover:text-red-300 hover:border-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      <div className={`session-expanded-content ${expandedObservations.has(session.id) ? 'expanded' : ''}`}>
                        <div className="session-expanded-inner">
                          {/* Observations Section */}
                          <div className="session-observations-section">
                            <div className="observations-grid">
                              {/* Preparation Observation Card */}
                              <div className="observation-card">
                                <div
                                  className="observation-card-header"
                                  onClick={() => toggleObservationCard('prep', session.id)}
                                >
                                  <BookOpen className="w-4 h-4" />
                                  <span className="observation-card-title">Preparação</span>
                                  <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${
                                    expandedObservationCards.has(`prep-${session.id}`) ? 'rotate-180' : ''
                                  }`} />
                                </div>
                                <div className={`observation-card-content ${
                                  expandedObservationCards.has(`prep-${session.id}`) ? 'expanded' : ''
                                }`}>
                                  <div className="observation-card-inner">
                                    {session.preparationNotes ? (
                                      <p className="observation-text">{session.preparationNotes}</p>
                                    ) : (
                                      <p className="observation-empty">Nenhuma observação de preparação registrada</p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Final Notes Observation Card */}
                              <div className="observation-card">
                                <div
                                  className="observation-card-header"
                                  onClick={() => toggleObservationCard('final', session.id)}
                                >
                                  <FileText className="w-4 h-4" />
                                  <span className="observation-card-title">Observações Finais</span>
                                  <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${
                                    expandedObservationCards.has(`final-${session.id}`) ? 'rotate-180' : ''
                                  }`} />
                                </div>
                                <div className={`observation-card-content ${
                                  expandedObservationCards.has(`final-${session.id}`) ? 'expanded' : ''
                                }`}>
                                  <div className="observation-card-inner">
                                    {session.finalNotes ? (
                                      <p className="observation-text">{session.finalNotes}</p>
                                    ) : (
                                      <p className="observation-empty">Nenhuma observação final registrada</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Full Details Buttons */}
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="session-details-button"
                              onClick={() => onViewSessionDetails(session)}
                            >
                              <Eye className="w-4 h-4" />
                              Ver detalhes da sessão
                            </button>
                            <button
                              className="session-details-button"
                              onClick={() => setWalletDialogSession(session)}
                            >
                              <Wallet className="w-4 h-4" />
                              Ver detalhes das carteiras
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      <SessionWalletDeltaDialog
        session={walletDialogSession}
        onClose={() => setWalletDialogSession(null)}
        formatCurrency={formatCurrency}
      />
    </div>
  );
}
