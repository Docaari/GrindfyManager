// =============================================================================
// MetasEmptyState — onboarding 4DX (ADR-241 M6). Explica WIG vs medida de
// direcao com exemplos de poker MTT. Substitui os <p> cinzas. RF-06: exemplos
// de processo, nunca P&L de curto prazo.
// =============================================================================

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass, Target } from "lucide-react";

export function MetasEmptyState() {
  return (
    <div data-testid="metas-empty-state" className="space-y-4">
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <h2 className="text-lg font-semibold">Comece pelo seu placar 4DX</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          No 4DX voce define UMA meta global (onde quer chegar) e poucas medidas de
          direcao (o que voce controla toda semana). O placar mostra se voce esta
          ganhando o jogo do processo — sem olhar lucro.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex h-full flex-col gap-3 p-5">
            <div className="flex items-center gap-2 text-primary">
              <Compass className="h-5 w-5" />
              <span className="font-semibold text-foreground">Meta Global (WIG)</span>
            </div>
            <p className="flex-1 text-sm text-muted-foreground">
              O norte da temporada. Formato "de X para Y ate quando". Resultado de
              longo prazo, que voce nao controla 100%.
            </p>
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Ex: <strong className="text-foreground">ABI de $22 para $33 ate dezembro</strong>
            </p>
            <Link href="/metas/nova?kind=wig">
              <Button variant="outline" className="w-full" data-testid="metas-empty-wig-cta">
                Definir minha WIG
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex h-full flex-col gap-3 p-5">
            <div className="flex items-center gap-2 text-emerald-400">
              <Target className="h-5 w-5" />
              <span className="font-semibold text-foreground">Medida de Direcao</span>
            </div>
            <p className="flex-1 text-sm text-muted-foreground">
              O que voce controla 100% e faz toda semana. Preditiva da WIG. Maximo 3
              ativas — foco e o que importa.
            </p>
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Ex: <strong className="text-foreground">estudar 5h/semana</strong> · <strong className="text-foreground">300 torneios/mes</strong>
            </p>
            <Link href="/metas/nova?kind=measure">
              <Button className="w-full" data-testid="metas-empty-measure-cta">
                Criar uma medida
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default MetasEmptyState;
