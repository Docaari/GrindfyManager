/**
 * GrindPersonalizationDialog — preferencias da pagina /grind.
 *
 * 3 grupos de controles:
 *   - Visibilidade dos cards (KPIs, torneios, historico)
 *   - Performance mental (toggle global: liga balões + dashboard mental)
 *   - Moeda base (USD/BRL — propagada para /grind e /grind-live)
 *
 * Persistencia: localStorage via lib/grindPagePreferences.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  GrindBaseCurrency,
  useGrindPreferences,
  DEFAULT_GRIND_PREFERENCES,
} from '@/lib/grindPagePreferences';

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const VISIBILITY_LABELS: Array<{ key: keyof typeof DEFAULT_GRIND_PREFERENCES.visibility; label: string; hint: string }> = [
  {
    key: 'kpisVolume',
    label: 'Cards de Volume',
    hint: 'Contagem, Reentradas, Média Participantes, ABI',
  },
  {
    key: 'kpisProfit',
    label: 'Cards de Lucro / ROI',
    hint: 'Lucro, ROI, Lucro Médio por Dia/Torneio',
  },
  {
    key: 'kpisItm',
    label: 'Cards de ITM / Mesas Finais',
    hint: 'ITM, Mesas Finais, Cravadas, Maior Resultado',
  },
  {
    key: 'tournaments',
    label: 'Tipos de Torneio',
    hint: 'Toggle expansível com Vanilla/PKO/Mystery/Normal/Turbo',
  },
  {
    key: 'history',
    label: 'Histórico de Sessões',
    hint: 'Lista mensal com cards e métricas das sessões',
  },
];

export default function GrindPersonalizationDialog({ isOpen, onOpenChange }: Props) {
  const [prefs, setPrefs] = useGrindPreferences();

  const toggleVisibility = (key: keyof typeof DEFAULT_GRIND_PREFERENCES.visibility, value: boolean) => {
    setPrefs({
      ...prefs,
      visibility: { ...prefs.visibility, [key]: value },
    });
  };

  const toggleMental = (value: boolean) => {
    setPrefs({ ...prefs, mentalEnabled: value });
  };

  const setCurrency = (value: GrindBaseCurrency) => {
    setPrefs({ ...prefs, baseCurrency: value });
  };

  const resetDefaults = () => setPrefs(DEFAULT_GRIND_PREFERENCES);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle>Personalizar Página Grind</DialogTitle>
          <DialogDescription className="text-gray-400">
            Controle quais seções aparecem, performance mental e a moeda base.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <section>
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Cards visíveis</h3>
            <div className="space-y-3">
              {VISIBILITY_LABELS.map(({ key, label, hint }) => (
                <div key={key} className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <Label htmlFor={`vis-${key}`} className="text-sm text-gray-100 cursor-pointer">
                      {label}
                    </Label>
                    <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
                  </div>
                  <Switch
                    id={`vis-${key}`}
                    checked={prefs.visibility[key]}
                    onCheckedChange={(v) => toggleVisibility(key, !!v)}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-gray-700 pt-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Performance Mental</h3>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <Label htmlFor="vis-mental" className="text-sm text-gray-100 cursor-pointer">
                  Ativar Performance Mental
                </Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Quando desligado, os balões nas sessões e o card expansível "Performance Mental" deixam de aparecer.
                </p>
              </div>
              <Switch
                id="vis-mental"
                checked={prefs.mentalEnabled}
                onCheckedChange={(v) => toggleMental(!!v)}
              />
            </div>
          </section>

          <section className="border-t border-gray-700 pt-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Moeda Base</h3>
            <p className="text-xs text-gray-500 mb-3">
              Todos os valores na página Grind e Grind Live são convertidos para esta moeda usando as taxas configuradas em Configurações.
            </p>
            <div className="flex gap-2">
              {(['USD', 'BRL'] as GrindBaseCurrency[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition ${
                    prefs.baseCurrency === c
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </section>
        </div>

        <DialogFooter className="border-t border-gray-700 pt-4">
          <Button variant="ghost" onClick={resetDefaults} className="text-gray-400 hover:text-white">
            Restaurar padrão
          </Button>
          <Button onClick={() => onOpenChange(false)} className="bg-emerald-600 hover:bg-emerald-700">
            Concluído
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
