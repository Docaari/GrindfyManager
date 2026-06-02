// =============================================================================
// CoachKnowledgePanel — Coach AI UX Overhaul (Wave 4 / #9)
//
// "O que o Coach sabe de voce" — painel editavel do perfil estruturado
// (aiStructuredProfile) que alimenta o contexto do agente. Da transparencia +
// controle ao jogador (coach que lembra = confianca). GET/PUT
// /api/coach/structured-profile.
//
// Lessons: #2 (data-testid estavel), #13 (apiRequest JSON), #29 (useQuery dentro
// de QueryClientProvider — montado no hub, ja tem provider).
// =============================================================================

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type Tom = 'gentle' | 'balanced' | 'direct';
const TOM_LABEL: Record<Tom, string> = {
  gentle: 'Gentil',
  balanced: 'Equilibrado',
  direct: 'Direto',
};

interface StructuredProfile {
  nivel?: string | null;
  tomPreferido?: Tom;
  focoDoMes?: string | null;
  stakesTipico?: string | null;
  metas?: Array<{ id?: string; texto?: string; prazo?: string | null }>;
}

export function CoachKnowledgePanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ structuredProfile?: StructuredProfile } | null>({
    queryKey: ['/api/coach/structured-profile'],
    queryFn: () => apiRequest('GET', '/api/coach/structured-profile'),
    retry: false,
  });

  const profile = data?.structuredProfile;

  const [tom, setTom] = useState<Tom>('balanced');
  const [foco, setFoco] = useState('');
  const [stakes, setStakes] = useState('');
  const [metas, setMetas] = useState<string[]>(['', '', '']);

  // Hidrata o form quando o perfil chega (uma vez por load do perfil).
  useEffect(() => {
    if (!profile) return;
    setTom((profile.tomPreferido as Tom) ?? 'balanced');
    setFoco(profile.focoDoMes ?? '');
    setStakes(profile.stakesTipico ?? '');
    const ms = Array.isArray(profile.metas) ? profile.metas.map((m) => m?.texto ?? '') : [];
    setMetas([ms[0] ?? '', ms[1] ?? '', ms[2] ?? '']);
  }, [profile]);

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest('PUT', '/api/coach/structured-profile', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/coach/structured-profile'] });
      toast({ title: 'Atualizado', description: 'O Coach ja sabe.' });
    },
    onError: () => toast({ title: 'Nao consegui salvar', variant: 'destructive' }),
  });

  const onSave = () => {
    const metasPayload = metas
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((texto) => ({ texto, prazo: 'mes' as const }));
    mutation.mutate({
      tomPreferido: tom,
      focoDoMes: foco.trim() || null,
      stakesTipico: stakes.trim() || null,
      metas: metasPayload,
    });
  };

  return (
    <div data-testid="coach-knowledge-panel" className="rounded-lg border border-gray-700 bg-gray-800/40 p-4 space-y-4">
      <div>
        <h3 className="text-base font-medium text-gray-200">O que o Coach sabe de voce</h3>
        <p className="text-xs text-gray-500">
          Isso alimenta o contexto do Grindfy AI. Edite quando quiser — ele lembra.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : (
        <>
          {profile?.nivel ? (
            <p className="text-xs text-gray-400" data-testid="coach-knowledge-nivel">
              Nivel detectado: <span className="text-gray-200">{profile.nivel}</span>
            </p>
          ) : null}

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Tom preferido</label>
            <div className="flex gap-2">
              {(['gentle', 'balanced', 'direct'] as Tom[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={`coach-knowledge-tom-${t}`}
                  onClick={() => setTom(t)}
                  className={
                    'rounded-full px-3 py-1 text-xs border ' +
                    (tom === t
                      ? 'bg-green-600/20 text-green-400 border-green-600/30'
                      : 'text-gray-400 border-gray-700 hover:bg-gray-800')
                  }
                >
                  {TOM_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Foco do mes</label>
            <Input
              data-testid="coach-knowledge-foco"
              value={foco}
              maxLength={200}
              onChange={(e) => setFoco(e.target.value)}
              placeholder="Ex: ICM em mesa final"
              className="bg-gray-800 border-gray-700 text-gray-100"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Stakes tipico</label>
            <Input
              data-testid="coach-knowledge-stakes"
              value={stakes}
              maxLength={50}
              onChange={(e) => setStakes(e.target.value)}
              placeholder="Ex: $11-$33"
              className="bg-gray-800 border-gray-700 text-gray-100"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Metas (ate 3)</label>
            {metas.map((m, i) => (
              <Input
                key={i}
                data-testid={`coach-knowledge-meta-${i}`}
                value={m}
                maxLength={200}
                onChange={(e) => setMetas((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Meta ${i + 1}`}
                className="bg-gray-800 border-gray-700 text-gray-100"
              />
            ))}
          </div>

          <Button
            data-testid="coach-knowledge-save"
            onClick={onSave}
            disabled={mutation.isPending}
            className="bg-green-600 hover:bg-green-500 text-white"
          >
            {mutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      )}
    </div>
  );
}

export default CoachKnowledgePanel;
