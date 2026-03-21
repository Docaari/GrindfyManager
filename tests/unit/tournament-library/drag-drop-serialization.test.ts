import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Drag Data Serialization — serializa/deserializa dados de drag
//
// O modulo shared/drag-drop-utils.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo com as funcoes abaixo.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import {
  serializeDragData,
  deserializeDragData,
} from '../../../shared/drag-drop-utils';

// =============================================================================
// Grupo 4a: serializeDragData
// =============================================================================

describe('serializeDragData', () => {

  // ---------------------------------------------------------------------------
  // Tipo library
  // ---------------------------------------------------------------------------

  it('deve serializar drag de library com todos os campos obrigatorios', () => {
    const result = serializeDragData('library', {
      tournamentId: 'lib-abc123',
      name: 'Sunday Million',
      site: 'PokerStars',
      buyIn: '109',
    });

    const parsed = JSON.parse(result);

    expect(parsed.type).toBe('library');
    expect(parsed.tournamentId).toBe('lib-abc123');
    expect(parsed.name).toBe('Sunday Million');
    expect(parsed.site).toBe('PokerStars');
    expect(parsed.buyIn).toBe('109');
  });

  it('deve retornar string JSON valida para tipo library', () => {
    const result = serializeDragData('library', {
      tournamentId: 'lib-abc123',
      name: 'Sunday Million',
      site: 'PokerStars',
      buyIn: '109',
    });

    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Tipo cell
  // ---------------------------------------------------------------------------

  it('deve serializar drag de cell com todos os campos obrigatorios', () => {
    const result = serializeDragData('cell', {
      tournamentId: 'pt-xyz789',
      fromDay: 1,
      fromTime: '19:00',
    });

    const parsed = JSON.parse(result);

    expect(parsed.type).toBe('cell');
    expect(parsed.tournamentId).toBe('pt-xyz789');
    expect(parsed.fromDay).toBe(1);
    expect(parsed.fromTime).toBe('19:00');
  });

  it('deve retornar string JSON valida para tipo cell', () => {
    const result = serializeDragData('cell', {
      tournamentId: 'pt-xyz789',
      fromDay: 1,
      fromTime: '19:00',
    });

    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Edge cases: caracteres especiais no nome
  // ---------------------------------------------------------------------------

  it('deve serializar nome com caracteres especiais sem corromper JSON', () => {
    const result = serializeDragData('library', {
      tournamentId: 'lib-1',
      name: 'PKO $33 "Bounty" Hunter\'s Special',
      site: 'PokerStars',
      buyIn: '33',
    });

    const parsed = JSON.parse(result);

    expect(parsed.name).toBe('PKO $33 "Bounty" Hunter\'s Special');
  });

  it('deve serializar nome com emojis e unicode', () => {
    const result = serializeDragData('library', {
      tournamentId: 'lib-2',
      name: 'Sunday Special \u2605',
      site: 'GGNetwork',
      buyIn: '55',
    });

    const parsed = JSON.parse(result);

    expect(parsed.name).toBe('Sunday Special \u2605');
  });
});

// =============================================================================
// Grupo 4b: deserializeDragData
// =============================================================================

describe('deserializeDragData', () => {

  // ---------------------------------------------------------------------------
  // Happy path: JSON valido com type library
  // ---------------------------------------------------------------------------

  it('deve deserializar JSON valido de tipo library', () => {
    const json = JSON.stringify({
      type: 'library',
      tournamentId: 'lib-abc123',
      name: 'Sunday Million',
      site: 'PokerStars',
      buyIn: '109',
    });

    const result = deserializeDragData(json);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('library');
    expect(result!.tournamentId).toBe('lib-abc123');
  });

  // ---------------------------------------------------------------------------
  // Happy path: JSON valido com type cell
  // ---------------------------------------------------------------------------

  it('deve deserializar JSON valido de tipo cell', () => {
    const json = JSON.stringify({
      type: 'cell',
      tournamentId: 'pt-xyz789',
      fromDay: 1,
      fromTime: '19:00',
    });

    const result = deserializeDragData(json);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('cell');
    expect(result!.tournamentId).toBe('pt-xyz789');
    expect(result!.fromDay).toBe(1);
    expect(result!.fromTime).toBe('19:00');
  });

  // ---------------------------------------------------------------------------
  // Erro: JSON invalido
  // ---------------------------------------------------------------------------

  it('deve retornar null para JSON invalido', () => {
    const result = deserializeDragData('{invalid json}');

    expect(result).toBeNull();
  });

  it('deve retornar null para JSON truncado', () => {
    const result = deserializeDragData('{"type":"libra');

    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Erro: string vazia
  // ---------------------------------------------------------------------------

  it('deve retornar null para string vazia', () => {
    const result = deserializeDragData('');

    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Erro: objeto sem type
  // ---------------------------------------------------------------------------

  it('deve retornar null para objeto sem campo type', () => {
    const json = JSON.stringify({
      tournamentId: 'lib-abc123',
      name: 'Sunday Million',
    });

    const result = deserializeDragData(json);

    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Erro: type invalido
  // ---------------------------------------------------------------------------

  it('deve retornar null para type desconhecido', () => {
    const json = JSON.stringify({
      type: 'unknown',
      tournamentId: 'lib-abc123',
    });

    const result = deserializeDragData(json);

    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('deve retornar null para JSON que e um array', () => {
    const result = deserializeDragData('[1, 2, 3]');

    expect(result).toBeNull();
  });

  it('deve retornar null para JSON que e um primitivo', () => {
    const result = deserializeDragData('"just a string"');

    expect(result).toBeNull();
  });

  it('deve retornar null para JSON que e um numero', () => {
    const result = deserializeDragData('42');

    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Roundtrip: serialize -> deserialize
  // ---------------------------------------------------------------------------

  it('deve manter dados intactos em roundtrip library', () => {
    const original = {
      tournamentId: 'lib-abc123',
      name: 'Sunday Million $109',
      site: 'PokerStars',
      buyIn: '109',
    };

    const serialized = serializeDragData('library', original);
    const deserialized = deserializeDragData(serialized);

    expect(deserialized).not.toBeNull();
    expect(deserialized!.type).toBe('library');
    expect(deserialized!.tournamentId).toBe('lib-abc123');
    expect(deserialized!.name).toBe('Sunday Million $109');
    expect(deserialized!.site).toBe('PokerStars');
    expect(deserialized!.buyIn).toBe('109');
  });

  it('deve manter dados intactos em roundtrip cell', () => {
    const original = {
      tournamentId: 'pt-xyz789',
      fromDay: 5,
      fromTime: '22:00',
    };

    const serialized = serializeDragData('cell', original);
    const deserialized = deserializeDragData(serialized);

    expect(deserialized).not.toBeNull();
    expect(deserialized!.type).toBe('cell');
    expect(deserialized!.tournamentId).toBe('pt-xyz789');
    expect(deserialized!.fromDay).toBe(5);
    expect(deserialized!.fromTime).toBe('22:00');
  });
});
