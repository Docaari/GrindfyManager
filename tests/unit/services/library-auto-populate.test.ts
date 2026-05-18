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

  it('create quando candidato existe mas o time difere', () => {
    const rows: LibraryDedupRow[] = [{ id: 'tpl-a', time: '21:00', deletedAt: null }];
    expect(decideLibraryAction(basePlanned, rows)).toEqual({ action: 'create' });
  });

  it('link quando ha match ativo com mesmo time', () => {
    const rows: LibraryDedupRow[] = [{ id: 'tpl-a', time: '20:00', deletedAt: null }];
    expect(decideLibraryAction(basePlanned, rows)).toEqual({ action: 'link', templateId: 'tpl-a' });
  });

  it('match por time null casa quando planned.time tambem e null', () => {
    const rows: LibraryDedupRow[] = [{ id: 'tpl-a', time: null, deletedAt: null }];
    expect(decideLibraryAction({ ...basePlanned, time: null }, rows)).toEqual({
      action: 'link',
      templateId: 'tpl-a',
    });
  });

  it('skip quando o unico match esta na lixeira (respeita exclusao do user)', () => {
    const rows: LibraryDedupRow[] = [{ id: 'tpl-a', time: '20:00', deletedAt: new Date() }];
    expect(decideLibraryAction(basePlanned, rows)).toEqual({ action: 'skip' });
  });

  it('prefere o match ativo quando ha trashed + ativo no mesmo time (qualquer ordem)', () => {
    const trashedFirst: LibraryDedupRow[] = [
      { id: 'tpl-trashed', time: '20:00', deletedAt: new Date() },
      { id: 'tpl-active', time: '20:00', deletedAt: null },
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
