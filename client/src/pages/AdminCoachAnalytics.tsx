// =============================================================================
// AdminCoachAnalytics — Sprint Coach-1 Frontend UX / RF-15
//
// Dashboard admin com:
//  - 4 cards no topo: Mensagens (7d), Cache hit rate, Custo total, Feedback up rate
//  - Grafico de linha (custo/dia)
//  - Tabela top 10 thumbs-down
//  - Filtros: periodo (7d, 30d, 90d) e coach type (Todos, Mental, Tournament, Technical)
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-15)
// =============================================================================

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  MessageSquare,
  Database,
  DollarSign,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type CoachType = 'mental' | 'tournament' | 'technical';
type PeriodOption = 7 | 30 | 90;
type CoachFilter = 'all' | CoachType;

interface CostMetrics {
  period: { from: string; to: string; days: number };
  totalMessages: number;
  totalCost: number;
  avgCostPerMessage: number;
  cacheHitRate: number;
  byCoachType: {
    mental: { messages: number; cost: number; cacheHitRate: number };
    tournament: { messages: number; cost: number; cacheHitRate: number };
    technical: { messages: number; cost: number; cacheHitRate: number };
  };
  byModel: Record<string, { messages: number; cost: number }>;
  byDay: Array<{ date: string; messages: number; cost: number; cacheHitRate: number }>;
}

interface FeedbackStats {
  byCoachType: {
    mental: { up: number; down: number };
    tournament: { up: number; down: number };
    technical: { up: number; down: number };
  };
  last7Days: Array<{ date: string; up: number; down: number }>;
  topDownMessages: Array<{
    messageId: string;
    content: string;
    comment: string | null;
    createdAt: string;
  }>;
}

async function fetchCostMetrics(days: number): Promise<CostMetrics> {
  const res = await fetch(`/api/admin/coach/cost-metrics?days=${days}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchFeedbackStats(coachType?: CoachType): Promise<FeedbackStats> {
  const url = coachType
    ? `/api/admin/coach/feedback-stats?coachType=${coachType}`
    : `/api/admin/coach/feedback-stats`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
}: {
  label: string;
  value: string | JSX.Element;
  icon: any;
  colorClass?: string;
}): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-400">{label}</CardTitle>
        <Icon className={cn('h-4 w-4 text-gray-500', colorClass)} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', colorClass)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton(): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24 animate-pulse" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32 animate-pulse" />
      </CardContent>
    </Card>
  );
}

function cacheHitRateColor(rate: number): string {
  if (rate >= 0.7) return 'text-green-400';
  if (rate >= 0.4) return 'text-amber-400';
  return 'text-red-400';
}

function formatBR(value: number): string {
  // Numero estilo brasileiro com separador de milhar
  return value.toLocaleString('pt-BR');
}

function formatCurrency(value: number): string {
  return value.toFixed(2);
}

function formatDate(d: string): string {
  try {
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return d;
  }
}

export default function AdminCoachAnalytics(): JSX.Element {
  const { isAdmin } = useAuth();
  const [period, setPeriod] = useState<PeriodOption>(7);
  const [coachFilter, setCoachFilter] = useState<CoachFilter>('all');

  // INFO-4 — `isAdmin` no AuthContext ja engloba super-admin, role='admin' e
  // subscriptionPlan='admin'. Single source of truth.
  // Backend tambem valida via requirePermission (defesa em profundidade).
  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold text-gray-200">Acesso negado</h2>
            <p className="text-gray-400 mt-2">
              Esta pagina e restrita a administradores.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const {
    data: costMetrics,
    isLoading: isLoadingCost,
  } = useQuery<CostMetrics>({
    queryKey: ['/api/admin/coach/cost-metrics', period],
    queryFn: () => fetchCostMetrics(period),
    staleTime: 60_000,
  });

  const coachTypeForFeedback = coachFilter === 'all' ? undefined : coachFilter;
  const {
    data: feedbackStats,
    isLoading: isLoadingFeedback,
  } = useQuery<FeedbackStats>({
    queryKey: ['/api/admin/coach/feedback-stats', coachFilter],
    queryFn: () => fetchFeedbackStats(coachTypeForFeedback),
    staleTime: 60_000,
  });

  const isLoading = isLoadingCost || isLoadingFeedback;

  const upRate = useMemo(() => {
    if (!feedbackStats) return 0;
    let up = 0;
    let down = 0;
    if (coachFilter === 'all') {
      const ct = feedbackStats.byCoachType;
      up = (ct.mental?.up || 0) + (ct.tournament?.up || 0) + (ct.technical?.up || 0);
      down = (ct.mental?.down || 0) + (ct.tournament?.down || 0) + (ct.technical?.down || 0);
    } else {
      const ct = feedbackStats.byCoachType[coachFilter];
      up = ct?.up || 0;
      down = ct?.down || 0;
    }
    const total = up + down;
    return total > 0 ? up / total : 0;
  }, [feedbackStats, coachFilter]);

  const hasData = costMetrics && costMetrics.totalMessages > 0;

  // Filtra dados pelo coach selecionado
  const filteredByCoach = useMemo(() => {
    if (!costMetrics) return null;
    if (coachFilter === 'all') {
      return {
        totalMessages: costMetrics.totalMessages,
        totalCost: costMetrics.totalCost,
        cacheHitRate: costMetrics.cacheHitRate,
      };
    }
    const c = costMetrics.byCoachType[coachFilter];
    return {
      totalMessages: c?.messages || 0,
      totalCost: c?.cost || 0,
      cacheHitRate: c?.cacheHitRate || 0,
    };
  }, [costMetrics, coachFilter]);

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="admin-coach-analytics">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Coach Analytics</h1>
          <p className="text-sm text-gray-400 mt-1">
            Custo do LLM, cache hit rate e feedback dos usuarios.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filtro de periodo */}
          <div className="flex gap-1" role="group" aria-label="Periodo">
            {([7, 30, 90] as PeriodOption[]).map((d) => (
              <Button
                key={d}
                variant={period === d ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod(d)}
                aria-pressed={period === d}
              >
                {d}d
              </Button>
            ))}
          </div>

          {/* Filtro de coach type */}
          <Select value={coachFilter} onValueChange={(v) => setCoachFilter(v as CoachFilter)}>
            <SelectTrigger className="w-40" aria-label="Filtrar por coach">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="mental">Mental</SelectItem>
              <SelectItem value="tournament">Torneios</SelectItem>
              <SelectItem value="technical">Tecnico</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 4 cards no topo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label={`Mensagens (${period}d)`}
              value={formatBR(filteredByCoach?.totalMessages || 0)}
              icon={MessageSquare}
            />
            <StatCard
              label="Cache hit rate"
              value={`${Math.round((filteredByCoach?.cacheHitRate || 0) * 100)}%`}
              icon={Database}
              colorClass={cacheHitRateColor(filteredByCoach?.cacheHitRate || 0)}
            />
            <StatCard
              label={`Custo (${period}d)`}
              value={`$${formatCurrency(filteredByCoach?.totalCost || 0)}`}
              icon={DollarSign}
            />
            <StatCard
              label="Feedback up"
              value={`${Math.round(upRate * 100)}%`}
              icon={ThumbsUp}
              colorClass={upRate >= 0.7 ? 'text-green-400' : upRate >= 0.4 ? 'text-amber-400' : 'text-red-400'}
            />
          </>
        )}
      </div>

      {/* Estado vazio */}
      {!isLoading && !hasData && (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-gray-400">Sem dados para o periodo selecionado.</p>
            <p className="text-xs text-gray-500 mt-2">
              Nao ha mensagens registradas nos ultimos {period} dias.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Grafico de linha */}
      {!isLoading && hasData && costMetrics && costMetrics.byDay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-gray-200">Mensagens e custo por dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={costMetrics.byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#10b981"
                    tick={{ fill: '#10b981', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#f59e0b"
                    tick={{ fill: '#f59e0b', fontSize: 11 }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      color: '#e5e7eb',
                    }}
                  />
                  <Legend wrapperStyle={{ color: '#e5e7eb' }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="messages"
                    stroke="#10b981"
                    name="Mensagens"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cost"
                    stroke="#f59e0b"
                    name="Custo (USD)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela top 10 thumbs-down */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-200 flex items-center gap-2">
            <ThumbsDown className="h-5 w-5 text-red-400" />
            Top 10 mensagens com thumbs-down
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingFeedback ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full animate-pulse" />
              <Skeleton className="h-10 w-full animate-pulse" />
              <Skeleton className="h-10 w-full animate-pulse" />
            </div>
          ) : feedbackStats && feedbackStats.topDownMessages.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Preview</TableHead>
                  <TableHead>Comentario</TableHead>
                  <TableHead className="w-32">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedbackStats.topDownMessages.slice(0, 10).map((msg) => (
                  <TableRow key={msg.messageId}>
                    <TableCell className="max-w-md text-sm text-gray-300">
                      {msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content}
                    </TableCell>
                    <TableCell className="text-sm text-gray-400">
                      {msg.comment ? (
                        <span className="italic">{msg.comment}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {formatDate(msg.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">
              Nenhum thumbs-down registrado no periodo.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Detalhes por coach */}
      {!isLoading && hasData && costMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['mental', 'tournament', 'technical'] as CoachType[]).map((ct) => {
            const data = costMetrics.byCoachType[ct];
            const label = ct === 'mental' ? 'Mental' : ct === 'tournament' ? 'Torneios' : 'Tecnico';
            return (
              <Card key={ct}>
                <CardHeader>
                  <CardTitle className="text-base text-gray-200">{label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Mensagens</span>
                    <span className="text-gray-200">{formatBR(data.messages)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Custo</span>
                    <span className="text-gray-200">${formatCurrency(data.cost)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Cache hit</span>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', cacheHitRateColor(data.cacheHitRate))}
                    >
                      {Math.round(data.cacheHitRate * 100)}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
