/**
 * Sprint UX-QW-2 — RF-06
 *
 * Badge inline em cada wallet row indicando ha quantos dias o saldo foi
 * atualizado pela ultima vez.
 *
 * Fonte do timestamp (cascata):
 *   1. lastTransactionAt (MAX(wallet_transactions.occurred_at))
 *   2. updatedAt
 *   3. createdAt
 *
 * Thresholds:
 *   < 3d   -> sem badge
 *   3-7d   -> "atualizado ha {n}d" tone=info
 *   8-30d  -> "atualizado ha {n}d" tone=warn
 *   > 30d  -> "sem movimento ha {n}d" tone=warn
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface WalletStalenessBadgeProps {
  lastTransactionAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function pickTimestamp(props: WalletStalenessBadgeProps): string | null {
  if (props.lastTransactionAt) return props.lastTransactionAt;
  if (props.updatedAt) return props.updatedAt;
  if (props.createdAt) return props.createdAt;
  return null;
}

function daysSince(iso: string, now: number): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return -1;
  const diff = now - t;
  return Math.floor(diff / DAY_MS);
}

export function WalletStalenessBadge(props: WalletStalenessBadgeProps) {
  const iso = pickTimestamp(props);
  if (!iso) return null;

  const now = Date.now();
  const days = daysSince(iso, now);
  if (days < 0) return null;
  if (days < 3) return null;

  const tone: 'info' | 'warn' = days >= 8 ? 'warn' : 'info';
  const isLongIdle = days > 30;
  const label = isLongIdle
    ? `sem movimento ha ${days}d`
    : `atualizado ha ${days}d`;
  const title = isLongIdle
    ? `Saldo nao atualizado ha ${days} dias. Registre uma transacao ou atualize manualmente em Carteira > Editar.`
    : `Saldo atualizado pela ultima vez ha ${days} dias.`;

  return (
    <span
      data-testid="wallet-staleness-badge"
      data-tone={tone}
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
        tone === 'info'
          ? 'bg-muted text-muted-foreground'
          : 'bg-yellow-500/15 text-yellow-500',
      )}
    >
      {label}
    </span>
  );
}

export default WalletStalenessBadge;
