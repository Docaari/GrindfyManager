/**
 * Sprint biblioteca-enrich — decideLibraryAction (decisao pura de dedup do
 * auto-populate de tournament_library a partir de planned_tournaments).
 *
 * server/services/libraryAutoPopulate.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  decideLibraryAction,
  type PlannedLike,
  type LibraryDedupRow,
} from '../../../server/services/libraryAutoPopulate';

const basePlanned: PlannedLike = {
  id: 'planned-1',
  userId: 'USER-0001',
  name: 'Bounty Hunter',
  site: 'PokerStars',
  buyIn: '50',
  time: '20:00',
};

// Sprint biblioteca-administrar-dedup / RF-02: o match passou de `time` exato
// para `libraryCanonicalKey`. Os candidate rows agora precisam carregar os
// campos canonicos (name/site/buyIn/type/dayOfWeek) alem de id/time/deletedAt
// para casar a key do `basePlanned`. Helper que monta um row com a MESMA key
// canonica do basePlanned por default; overrides quebram a key de proposito.
function row(overrides: Partial<LibraryDedupRow> = {}): LibraryDedupRow {
  return {
    id: 'tpl-a',
    name: 'Bounty Hunter',
    site: 'PokerStars',
    buyIn: '50',
    time: '20:00',
    type: 'Vanilla',
    dayOfWeek: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('decideLibraryAction', () => {
  it('skip quando planned ja tem libraryTemplateId', () => {
    const res = decideLibraryAction({ ...basePlanned, libraryTemplateId: 'tpl-x' }, []);
    expect(res).toEqual({ action: 'skip' });
  });

  it('skip quando falta name', () => {
    expect(decideLibraryAction({ ...basePlanned, name: null }, [])).toEqual({ action: 'skip' });
  });

  it('skip quando falta site', () => {
    expect(decideLibraryAction({ ...basePlanned, site: '' }, [])).toEqual({ action: 'skip' });
  });

  it('skip quando falta userId', () => {
    expect(decideLibraryAction({ ...basePlanned, userId: '' }, [])).toEqual({ action: 'skip' });
  });

  it('create quando nao ha candidato', () => {
    expect(decideLibraryAction(basePlanned, [])).toEqual({ action: 'create' });
  });

  it('create quando candidato existe mas o timeBin difere', () => {
    // 20:00 (bin 20-22) vs 23:00 (bin 22-24) → bins diferentes → key diferente.
    const rows: LibraryDedupRow[] = [row({ id: 'tpl-a', time: '23:00' })];
    expect(decideLibraryAction(basePlanned, rows)).toEqual({ action: 'create' });
  });

  it('link quando ha match ativo com a mesma key canonica', () => {
    const rows: LibraryDedupRow[] = [row({ id: 'tpl-a' })];
    expect(decideLibraryAction(basePlanned, rows)).toEqual({ action: 'link', templateId: 'tpl-a' });
  });

  it('match por time null casa quando planned.time tambem e null', () => {
    const rows: LibraryDedupRow[] = [row({ id: 'tpl-a', time: null })];
    expect(decideLibraryAction({ ...basePlanned, time: null }, rows)).toEqual({
      action: 'link',
      templateId: 'tpl-a',
    });
  });

  it('skip quando o unico match esta na lixeira (respeita exclusao do user)', () => {
    const rows: LibraryDedupRow[] = [row({ id: 'tpl-a', deletedAt: new Date() })];
    expect(decideLibraryAction(basePlanned, rows)).toEqual({ action: 'skip' });
  });

  it('prefere o match ativo quando ha trashed + ativo na mesma key (qualquer ordem)', () => {
    const trashedFirst: LibraryDedupRow[] = [
      row({ id: 'tpl-trashed', deletedAt: new Date() }),
      row({ id: 'tpl-active', deletedAt: null }),
    ];
    expect(decideLibraryAction(basePlanned, trashedFirst)).toEqual({
      action: 'link',
      templateId: 'tpl-active',
    });
    // Inverte a ordem — resultado deve ser o mesmo (deterministico).
    expect(decideLibraryAction(basePlanned, [...trashedFirst].reverse())).toEqual({
      action: 'link',
      templateId: 'tpl-active',
    });
  });
});
