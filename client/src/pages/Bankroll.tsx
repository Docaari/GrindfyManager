/**
 * Bankroll — Pagina /bankroll (RF-11)
 *
 * Historico completo + filtros + movimento manual.
 */
import React, { useState } from "react";
import { BankrollWidget } from "@/components/bankroll/BankrollWidget";
import { BankrollHistoryTable } from "@/components/bankroll/BankrollHistoryTable";
import { BankrollMovementDialog } from "@/components/bankroll/BankrollMovementDialog";

export default function BankrollPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Banca</h1>
        <button
          onClick={() => setDialogOpen(true)}
          className="px-4 py-2 rounded bg-primary text-primary-foreground"
        >
          Registrar aporte/saque
        </button>
      </header>

      <BankrollWidget />

      <section>
        <h2 className="text-lg font-semibold mb-3">Historico</h2>
        <BankrollHistoryTable />
      </section>

      <BankrollMovementDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
