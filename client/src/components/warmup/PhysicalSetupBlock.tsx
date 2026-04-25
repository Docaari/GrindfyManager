/**
 * PhysicalSetupBlock — Sprint W-1 (RF-08, T-10)
 *
 * Bloco 4: Setup fisico. 6 toggles, minimo 4/6 marcados para avancar.
 * Microcopy spec secao 9.4.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface SetupItems {
  water: boolean;
  snacks: boolean;
  phoneAirplane: boolean;
  notificationsOff: boolean;
  headphones: boolean;
  light: boolean;
}

const ITEMS: { key: keyof SetupItems; testid: string; label: string }[] = [
  { key: "water", testid: "setup-water", label: "Garrafa de 1L de agua na mesa" },
  { key: "snacks", testid: "setup-snacks", label: "Snacks preparados (nozes, banana, barra)" },
  { key: "phoneAirplane", testid: "setup-phone-airplane", label: "Celular em modo aviao ou na gaveta" },
  { key: "notificationsOff", testid: "setup-notifications-off", label: "Notificacoes silenciadas no computador" },
  { key: "headphones", testid: "setup-headphones", label: "Fone de ouvido (se for grindar com playlist)" },
  { key: "light", testid: "setup-light", label: "Luz ambiente calibrada" },
];

export interface PhysicalSetupBlockProps {
  onAdvance: (payload: { setupItems: SetupItems }) => void;
}

export function PhysicalSetupBlock({ onAdvance }: PhysicalSetupBlockProps) {
  const [state, setState] = useState<SetupItems>({
    water: false,
    snacks: false,
    phoneAirplane: false,
    notificationsOff: false,
    headphones: false,
    light: false,
  });

  const checkedCount = Object.values(state).filter(Boolean).length;
  const canAdvance = checkedCount >= 4;

  const toggle = (key: keyof SetupItems) => {
    setState((s) => ({ ...s, [key]: !s[key] }));
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto px-4">
      <header className="text-center space-y-1">
        <h2 className="text-2xl font-bold">Setup fisico</h2>
        <p className="text-sm text-muted-foreground">
          Cada friccao evitada agora e um glitch a menos daqui a 2 horas
        </p>
      </header>

      <ul className="space-y-2">
        {ITEMS.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            <Checkbox
              id={item.testid}
              data-testid={item.testid}
              checked={state[item.key]}
              onCheckedChange={() => toggle(item.key)}
            />
            <label htmlFor={item.testid} className="text-sm">
              {item.label}
            </label>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground text-center">
        Minimo 4 de 6 para avancar. Os outros 2 anote como meta para a proxima
        sessao. ({checkedCount}/6)
      </p>

      <div className="flex justify-end">
        <Button
          type="button"
          data-testid="setup-advance"
          onClick={() => onAdvance({ setupItems: state })}
          disabled={!canAdvance}
        >
          Proximo
        </Button>
      </div>
    </div>
  );
}
