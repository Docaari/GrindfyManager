// =============================================================================
// UpgradeCoachModal — Sprint Coach-1 Frontend UX / RF-10
// Modal de upgrade exibido quando usuario clica em coach bloqueado por plano.
// Mostra matriz 3x3 (planos x coaches) com check/lock + CTA de upgrade.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-10)
//
// INFO fix: refatorado para usar <DialogContent> com portal (padrao Radix
// correto). Tests usam screen.queryByRole/queryByText/document.body que
// alcancam o conteudo dentro do portal. Antes usavamos DialogPrimitive.Content
// direto sem portal, o que era um workaround para testes que olhavam apenas
// no container do RTL — mas o padrao correto e portal + queries que olham
// em document.
// =============================================================================

import * as React from 'react';
import { useLocation } from 'wouter';
import { Check, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type CoachType = 'mental' | 'tournament' | 'technical';

export interface UpgradeCoachModalProps {
  open: boolean;
  onClose: () => void;
  currentPlan: string;
  targetPlan: string;
  blockedCoach?: CoachType;
  pricing?: Partial<Record<string, string>>;
}

// Matriz de acesso plano x coach
const COACH_ACCESS_MATRIX: Record<string, Record<CoachType, boolean>> = {
  free: { mental: true, tournament: false, technical: false },
  pro: { mental: true, tournament: true, technical: false },
  premium: { mental: true, tournament: true, technical: true },
};

// TODO_UPDATE_PRICING: revisar estes valores antes de prod ou expor via /api/subscription-plans
const STATIC_PRICING: Record<string, string> = {
  free: 'Gratis',
  pro: 'R$ 49/mes',
  premium: 'R$ 99/mes',
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  premium: 'Premium',
};

const COACH_LABELS: Record<CoachType, string> = {
  mental: 'Mental',
  tournament: 'Torneios',
  technical: 'Tecnico',
};

export function UpgradeCoachModal({
  open,
  onClose,
  currentPlan,
  targetPlan,
  blockedCoach,
  pricing,
}: UpgradeCoachModalProps): JSX.Element {
  const [, setLocation] = useLocation();
  const planList: Array<keyof typeof PLAN_LABELS> = ['free', 'pro', 'premium'];
  const coachList: CoachType[] = ['mental', 'tournament', 'technical'];

  const targetPricing =
    (pricing && pricing[targetPlan]) || STATIC_PRICING[targetPlan] || '';

  const handleUpgrade = () => {
    setLocation('/subscriptions');
  };

  const blockedCoachLabel = blockedCoach ? COACH_LABELS[blockedCoach] : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        aria-modal="true"
        className="bg-gray-900 border-gray-700 max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle className="text-gray-100">
            {blockedCoach
              ? `O Coach ${blockedCoachLabel} requer plano ${PLAN_LABELS[targetPlan] || targetPlan}`
              : `Faca upgrade para ${PLAN_LABELS[targetPlan] || targetPlan}`}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Voce esta no plano <strong>{PLAN_LABELS[currentPlan] || currentPlan}</strong>.
            {blockedCoach && (
              <>
                {' '}
                Para conversar com o Coach <strong>{blockedCoachLabel}</strong>, faca
                upgrade para <strong>{PLAN_LABELS[targetPlan] || targetPlan}</strong>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Matriz coach x plano */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-left text-xs text-gray-500 font-normal"></th>
                {planList.map((plan) => (
                  <th
                    key={plan}
                    data-plan={plan}
                    data-current={currentPlan === plan ? 'true' : 'false'}
                    className={
                      'p-2 text-center text-sm font-medium ' +
                      (currentPlan === plan
                        ? 'bg-gray-800/50 text-green-400 border border-green-600/40'
                        : 'text-gray-300')
                    }
                  >
                    {PLAN_LABELS[plan]}
                    <div className="text-xs text-gray-500 font-normal mt-1">
                      {STATIC_PRICING[plan]}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coachList.map((coach) => (
                <tr key={coach}>
                  <td
                    className={
                      'p-2 text-sm font-medium ' +
                      (blockedCoach === coach
                        ? 'text-green-400'
                        : 'text-gray-300')
                    }
                  >
                    Coach {COACH_LABELS[coach]}
                  </td>
                  {planList.map((plan) => {
                    const hasAccess = COACH_ACCESS_MATRIX[plan]?.[coach] ?? false;
                    return (
                      <td
                        key={plan}
                        className="p-2 text-center"
                      >
                        {hasAccess ? (
                          <Check
                            className="h-5 w-5 text-green-400 mx-auto"
                            aria-label="Acesso liberado"
                          />
                        ) : (
                          <Lock
                            className="h-5 w-5 text-gray-600 mx-auto"
                            aria-label="Bloqueado"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-700 text-gray-300"
          >
            Fechar
          </Button>
          <Button
            onClick={handleUpgrade}
            className="bg-green-600 hover:bg-green-500 text-white"
          >
            Fazer upgrade para {PLAN_LABELS[targetPlan] || targetPlan}
            {targetPricing && ` (${targetPricing})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UpgradeCoachModal;
