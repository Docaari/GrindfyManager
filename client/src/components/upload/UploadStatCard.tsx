import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Indicador do topo da página de importação.
 *
 * Existe para matar a triplicação: os três cards eram o mesmo bloco de ~18
 * linhas copiado, cada um com o ícone e a cor no meio do markup.
 *
 * Alinhado à esquerda e com tokens semânticos, seguindo o padrão das páginas
 * modernas (Dashboard, Grade). A versão anterior era centralizada e usava cores
 * cruas (`text-white`, `border-gray-700`).
 */
interface UploadStatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint: string;
  /** Cor do ícone — semântica, não decorativa. */
  tone?: 'info' | 'success' | 'accent';
  testId?: string;
}

const TONE_CLASSES: Record<NonNullable<UploadStatCardProps['tone']>, string> = {
  info: 'bg-blue-500/15 text-blue-300',
  success: 'bg-green-500/15 text-green-300',
  accent: 'bg-primary/15 text-primary',
};

export function UploadStatCard({ icon, label, value, hint, tone = 'info', testId }: UploadStatCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0', TONE_CLASSES[tone])}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold text-foreground" data-testid={testId}>{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
