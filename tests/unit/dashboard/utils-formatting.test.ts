import { describe, it, expect } from 'vitest';
import { formatCurrency, formatCurrencyBR, formatDate } from '../../../client/src/lib/utils';

// =============================================================================
// Testes de Caracterizacao: Funcoes de formatacao em client/src/lib/utils.ts
//
// Estas funcoes sao usadas pelo Dashboard e outros componentes para exibir
// valores monetarios e datas. Documentam o comportamento ATUAL.
//
// MODO CARACTERIZACAO: Todos devem PASSAR com o codigo existente.
// =============================================================================

// ---------------------------------------------------------------------------
// formatCurrency — formata valor em USD com formato en-US mas prefixo $
// ---------------------------------------------------------------------------

describe('formatCurrency', () => {
  it('deve formatar valor positivo inteiro com duas casas decimais', () => {
    const result = formatCurrency(100);
    // Intl.NumberFormat('pt-BR', currency: 'USD').replace('US$', '$')
    expect(result).toContain('$');
    expect(result).toContain('100');
  });

  it('deve formatar valor zero como $0.00', () => {
    const result = formatCurrency(0);
    expect(result).toContain('$');
    expect(result).toContain('0');
  });

  it('deve formatar valor negativo com sinal de menos', () => {
    const result = formatCurrency(-500);
    expect(result).toContain('500');
    // O formato pode ter o sinal antes ou depois do $
    expect(result).toMatch(/-/);
  });

  it('deve formatar valor decimal com duas casas', () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain('$');
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain('56');
  });

  it('deve formatar valor grande com separador de milhar', () => {
    const result = formatCurrency(1000000);
    expect(result).toContain('$');
    // O separador depende do locale, mas o valor deve estar presente
    expect(result).toContain('1');
    expect(result).toContain('000');
  });

  it('deve incluir exatamente duas casas decimais para valor inteiro', () => {
    const result = formatCurrency(50);
    // Verificar que termina com .00 ou ,00 dependendo do locale
    expect(result).toMatch(/50[.,]00/);
  });

  it('nao deve conter prefixo US$ (deve ser substituido por $)', () => {
    const result = formatCurrency(100);
    expect(result).not.toContain('US$');
    expect(result).toContain('$');
  });
});

// ---------------------------------------------------------------------------
// formatCurrencyBR — formata valor em formato brasileiro: $X.XXX,XX
// ---------------------------------------------------------------------------

describe('formatCurrencyBR', () => {
  it('deve formatar valor positivo com prefixo $', () => {
    const result = formatCurrencyBR(100);
    expect(result).toBe('$100,00');
  });

  it('deve formatar zero como $0,00', () => {
    const result = formatCurrencyBR(0);
    expect(result).toBe('$0,00');
  });

  it('deve formatar valor negativo com $- prefixo', () => {
    const result = formatCurrencyBR(-500);
    expect(result).toBe('$-500,00');
  });

  it('deve usar ponto como separador de milhar (formato brasileiro)', () => {
    const result = formatCurrencyBR(1234.56);
    expect(result).toBe('$1.234,56');
  });

  it('deve usar virgula como separador decimal (formato brasileiro)', () => {
    const result = formatCurrencyBR(99.99);
    expect(result).toBe('$99,99');
  });

  it('deve formatar valor grande com separadores de milhar', () => {
    const result = formatCurrencyBR(1000000);
    expect(result).toBe('$1.000.000,00');
  });

  it('deve formatar valor negativo grande corretamente', () => {
    const result = formatCurrencyBR(-12345.67);
    expect(result).toBe('$-12.345,67');
  });

  it('deve tratar valor muito pequeno com duas casas decimais', () => {
    const result = formatCurrencyBR(0.01);
    expect(result).toBe('$0,01');
  });

  it('deve arredondar para duas casas decimais', () => {
    const result = formatCurrencyBR(99.999);
    // Intl.NumberFormat arredonda: 99.999 -> 100.00
    expect(result).toBe('$100,00');
  });

  it('deve tratar valor negativo proximo de zero', () => {
    const result = formatCurrencyBR(-0.5);
    expect(result).toBe('$-0,50');
  });
});

// ---------------------------------------------------------------------------
// formatDate — formata string de data para formato brasileiro com hora
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('deve formatar data ISO para formato dd/mm/yyyy, hh:mm', () => {
    // Nota: o resultado depende do timezone do sistema
    const result = formatDate('2025-06-15T20:00:00.000Z');
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/); // dd/mm/yyyy
    expect(result).toMatch(/\d{2}:\d{2}/); // hh:mm
  });

  it('deve incluir dia, mes, ano, hora e minuto', () => {
    const result = formatDate('2025-01-01T12:30:00.000Z');
    // O resultado contem os componentes esperados
    expect(result).toContain('01');
    expect(result).toContain('2025');
  });

  it('deve formatar data com timezone UTC corretamente', () => {
    const result = formatDate('2025-12-25T00:00:00.000Z');
    expect(result).toContain('2025');
    // O dia pode variar dependendo do timezone local
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('deve retornar string nao vazia para data valida', () => {
    const result = formatDate('2025-06-15T10:30:00Z');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });
});
