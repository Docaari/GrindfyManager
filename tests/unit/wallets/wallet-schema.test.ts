import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: shared/schema.ts -> tabela wallets (RF-01) + Zod insertWalletSchema (RF-02)
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-01, RF-02)
// ADR-034: modelo multi-wallet com FX historico imutavel
// =============================================================================

import {
  wallets,
  insertWalletSchema,
} from '../../../shared/schema';
import { WALLET_PLATFORMS } from '../../../shared/wallet-platforms';

describe('wallets - definicao da tabela Drizzle', () => {
  it('exportado de shared/schema.ts', () => {
    expect(wallets).toBeDefined();
  });

  it('tem coluna id (PK)', () => {
    expect((wallets as any).id).toBeDefined();
  });

  it('tem coluna userId (FK users.userPlatformId)', () => {
    expect((wallets as any).userId).toBeDefined();
  });

  it('tem coluna name (varchar 80)', () => {
    expect((wallets as any).name).toBeDefined();
  });

  it('tem coluna platform (varchar)', () => {
    expect((wallets as any).platform).toBeDefined();
  });

  it('tem coluna nativeCurrency (varchar 8)', () => {
    expect((wallets as any).nativeCurrency).toBeDefined();
  });

  it('tem coluna balance (decimal default 0)', () => {
    expect((wallets as any).balance).toBeDefined();
  });

  it('tem coluna status (active|archived)', () => {
    expect((wallets as any).status).toBeDefined();
  });

  it('tem coluna bankrollRule (override opcional)', () => {
    expect((wallets as any).bankrollRule).toBeDefined();
  });

  it('tem coluna color (varchar 7 hex)', () => {
    expect((wallets as any).color).toBeDefined();
  });

  it('tem coluna displayOrder (integer default 0)', () => {
    expect((wallets as any).displayOrder).toBeDefined();
  });

  it('tem coluna isShotPocket (boolean default false)', () => {
    expect((wallets as any).isShotPocket).toBeDefined();
  });

  it('tem timestamps createdAt e updatedAt', () => {
    expect((wallets as any).createdAt).toBeDefined();
    expect((wallets as any).updatedAt).toBeDefined();
  });
});

describe('insertWalletSchema - validacao Zod', () => {
  const validInput = {
    userId: 'USER-0001',
    name: 'GG Main',
    platform: 'GGNetwork',
    nativeCurrency: 'USD',
  };

  it('aceita input minimo valido', () => {
    const r = insertWalletSchema.safeParse(validInput);
    expect(r.success).toBe(true);
  });

  it('aceita input completo com todos os campos opcionais', () => {
    const r = insertWalletSchema.safeParse({
      ...validInput,
      balance: '0',
      status: 'active',
      bankrollRule: '1pct',
      color: '#FF5733',
      displayOrder: 0,
      isShotPocket: false,
    });
    expect(r.success).toBe(true);
  });

  it('rejeita name vazio (min 1 char)', () => {
    const r = insertWalletSchema.safeParse({ ...validInput, name: '' });
    expect(r.success).toBe(false);
  });

  it('rejeita name com 81 chars (max 80)', () => {
    const r = insertWalletSchema.safeParse({ ...validInput, name: 'x'.repeat(81) });
    expect(r.success).toBe(false);
  });

  it('aceita name com 80 chars exatos', () => {
    const r = insertWalletSchema.safeParse({ ...validInput, name: 'x'.repeat(80) });
    expect(r.success).toBe(true);
  });

  it('rejeita platform fora do enum', () => {
    const r = insertWalletSchema.safeParse({ ...validInput, platform: 'PokerKing' });
    expect(r.success).toBe(false);
  });

  it('aceita todas as 15 plataformas canonicas', () => {
    for (const p of WALLET_PLATFORMS) {
      const r = insertWalletSchema.safeParse({ ...validInput, platform: p });
      expect(r.success, `platform=${p}`).toBe(true);
    }
  });

  it('rejeita nativeCurrency fora do enum (USD/BRL/EUR/GBP/CNY/USDT/BTC)', () => {
    const r = insertWalletSchema.safeParse({ ...validInput, nativeCurrency: 'JPY' });
    expect(r.success).toBe(false);
  });

  it('aceita as 7 moedas suportadas', () => {
    for (const ccy of ['USD', 'BRL', 'EUR', 'GBP', 'CNY', 'USDT', 'BTC']) {
      const r = insertWalletSchema.safeParse({ ...validInput, nativeCurrency: ccy });
      expect(r.success, `ccy=${ccy}`).toBe(true);
    }
  });

  it('aceita bankrollRule valido (1pct, 2pct, 5pct, custom:N)', () => {
    for (const rule of ['1pct', '2pct', '5pct', 'custom:3.5', 'custom:10']) {
      const r = insertWalletSchema.safeParse({ ...validInput, bankrollRule: rule });
      expect(r.success, `rule=${rule}`).toBe(true);
    }
  });

  it('rejeita bankrollRule invalido', () => {
    const r = insertWalletSchema.safeParse({ ...validInput, bankrollRule: '10pct' });
    expect(r.success).toBe(false);
  });

  it('aceita bankrollRule null (usa default global de user_settings)', () => {
    const r = insertWalletSchema.safeParse({ ...validInput, bankrollRule: null });
    expect(r.success).toBe(true);
  });

  it('aceita color hex valido (#RRGGBB)', () => {
    const r = insertWalletSchema.safeParse({ ...validInput, color: '#FF5733' });
    expect(r.success).toBe(true);
  });

  it('rejeita color invalido (sem # ou tamanho errado)', () => {
    expect(insertWalletSchema.safeParse({ ...validInput, color: 'FF5733' }).success).toBe(false);
    expect(insertWalletSchema.safeParse({ ...validInput, color: '#FFF' }).success).toBe(false);
    expect(insertWalletSchema.safeParse({ ...validInput, color: '#GGGGGG' }).success).toBe(false);
  });

  it('aceita color null/omitido', () => {
    expect(insertWalletSchema.safeParse({ ...validInput, color: null }).success).toBe(true);
    expect(insertWalletSchema.safeParse(validInput).success).toBe(true);
  });

  it('rejeita displayOrder negativo', () => {
    const r = insertWalletSchema.safeParse({ ...validInput, displayOrder: -1 });
    expect(r.success).toBe(false);
  });

  it('isShotPocket aceita boolean', () => {
    expect(insertWalletSchema.safeParse({ ...validInput, isShotPocket: true }).success).toBe(true);
    expect(insertWalletSchema.safeParse({ ...validInput, isShotPocket: false }).success).toBe(true);
  });

  it('aplica trim no name antes de validar', () => {
    const r = insertWalletSchema.safeParse({ ...validInput, name: '  GG Main  ' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('GG Main');
    }
  });
});

describe('WALLET_PLATFORMS — constante canonica (RF-02)', () => {
  it('exporta array com 15 plataformas', () => {
    expect(WALLET_PLATFORMS.length).toBe(15);
  });

  it('inclui todas as redes de poker canonicas', () => {
    expect(WALLET_PLATFORMS).toContain('Suprema');
    expect(WALLET_PLATFORMS).toContain('GGNetwork');
    expect(WALLET_PLATFORMS).toContain('PokerStars');
    expect(WALLET_PLATFORMS).toContain('WPN');
    expect(WALLET_PLATFORMS).toContain('888');
    expect(WALLET_PLATFORMS).toContain('PartyPoker');
    expect(WALLET_PLATFORMS).toContain('CoinPoker');
    expect(WALLET_PLATFORMS).toContain('Chico');
    expect(WALLET_PLATFORMS).toContain('Revolution');
    expect(WALLET_PLATFORMS).toContain('iPoker');
  });

  it('inclui categorias off-platform', () => {
    expect(WALLET_PLATFORMS).toContain('OffPlatform_Bank');
    expect(WALLET_PLATFORMS).toContain('OffPlatform_Crypto');
    expect(WALLET_PLATFORMS).toContain('OffPlatform_Staker');
    expect(WALLET_PLATFORMS).toContain('OffPlatform_Other');
  });

  it('inclui GenericUSD reservado para migration v1->v2', () => {
    expect(WALLET_PLATFORMS).toContain('GenericUSD');
  });
});
