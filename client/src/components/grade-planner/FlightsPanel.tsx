/**
 * FlightsPanel — Sprint coach-page-reform-1 RF-02 / RF-07.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-02.
 *
 * Conteudo migrado de client/src/pages/Flight.tsx para uso como aba dentro
 * de /coach. Self-contained: gerencia tab interna (pending/completed/cancelled/all)
 * e backfill dialog.
 *
 * data-testids preservados (paridade com Flight.tsx original):
 *   - flight-page-header
 *   - flight-page-backfill-btn
 *   - flight-tab-pending / -completed / -cancelled / -all
 *   - flight-empty-state
 *   - flight-series-card-{id}
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { BackfillSeriesDialog } from '@/components/flight/BackfillSeriesDialog';

type Status = 'pending' | 'completed' | 'cancelled' | 'all';

interface SeriesItem {
  id: string;
  name: string;
  network?: string | null;
  totalDay1s: number;
  day2DateTime: string;
  day2Status: 'pending' | 'completed' | 'cancelled';
  stackMode: 'single' | 'combined';
}

export const FlightsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Status>('pending');
  const [backfillOpen, setBackfillOpen] = useState(false);

  const { data, isLoading } = useQuery<SeriesItem[]>({
    queryKey: ['/api/tournament-series', { status: activeTab }] as const,
    queryFn: () => apiRequest('GET', `/api/tournament-series?status=${activeTab}`),
  });

  const series = (data ?? []) as SeriesItem[];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div data-testid="flight-page-header" className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Flight</h1>
        <button
          data-testid="flight-page-backfill-btn"
          type="button"
          onClick={() => setBackfillOpen(true)}
          className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
        >
          Adicionar Series Retroativo
        </button>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-700">
        <TabButton
          testid="flight-tab-pending"
          active={activeTab === 'pending'}
          onClick={() => setActiveTab('pending')}
        >
          Pendentes
        </TabButton>
        <TabButton
          testid="flight-tab-completed"
          active={activeTab === 'completed'}
          onClick={() => setActiveTab('completed')}
        >
          Concluidas
        </TabButton>
        <TabButton
          testid="flight-tab-cancelled"
          active={activeTab === 'cancelled'}
          onClick={() => setActiveTab('cancelled')}
        >
          Canceladas
        </TabButton>
        <TabButton
          testid="flight-tab-all"
          active={activeTab === 'all'}
          onClick={() => setActiveTab('all')}
        >
          Todas
        </TabButton>
      </div>

      {isLoading && <p className="text-gray-400 text-sm">Carregando...</p>}

      {!isLoading && series.length === 0 && (
        <div data-testid="flight-empty-state" className="text-center py-12 text-gray-400">
          <p className="mb-3">Voce ainda nao tem nenhuma serie multi-flight.</p>
          <p className="text-xs">Importe um CSV ou adicione retroativo.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {series.map((s) => (
          <div
            key={s.id}
            data-testid={`flight-series-card-${s.id}`}
            className="border border-gray-700 rounded p-4 bg-gray-800/40"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-white font-semibold">{s.name}</h3>
              <span className="text-xs text-gray-400">{s.network ?? '—'}</span>
            </div>
            <div className="flex gap-2 mb-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                {s.day2Status}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                {s.stackMode === 'combined' ? 'Combined' : 'Single'}
              </span>
            </div>
            <p className="text-xs text-gray-400">0 / {s.totalDay1s} Day 1s pagos</p>
            <p className="text-xs text-gray-500 mt-1">
              Day 2: {new Date(s.day2DateTime).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <BackfillSeriesDialog open={backfillOpen} onOpenChange={setBackfillOpen} />
    </div>
  );
};

interface TabButtonProps {
  testid: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ testid, active, onClick, children }) => (
  <button
    data-testid={testid}
    type="button"
    onClick={onClick}
    className={`px-4 py-2 text-sm border-b-2 transition-colors ${
      active
        ? 'border-green-400 text-green-400'
        : 'border-transparent text-gray-400 hover:text-white'
    }`}
  >
    {children}
  </button>
);

export default FlightsPanel;
