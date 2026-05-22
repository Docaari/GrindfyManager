# ADR-197: Audio resume cross-session via localStorage snapshot + 7d TTL

## Status

Accepted — 2026-05-22 (Sprint Mini Player 3.1 Wave B / TIER 3 #4).

## Context

Pre-Wave B: MiniPlayer perdia posicao corrente apos F5 ou reload. Estado vivia
apenas em memoria (`AudioPlayerContext` state). Casos comuns dolorosos:

- User pausa aula no meio (ex. 23:47), troca de aba/abre dashboard, fecha
  navegador. Volta no dia seguinte e perde os 23min de progresso de audio
  (mesmo que o `library_progress` server-side esteja salvo via `/api/library/.../progress`).
- Crash do tab / OS sleep -> sessao perdida.
- Mobile: trocar app no iOS suspende worker e (eventualmente) descarta state.

Server-side `library_progress` ja existe (legacy MP1.1) mas:

1. Eh per-`lessonId`, NAO por sessao corrente.
2. Boot do AudioPlayerContext nao consulta progress.
3. NAO captura "qual era a track ativa" — apenas progress por aula vista.

## Decision

Snapshot client-only em `localStorage` (chave `audio.lastSession.v1`) com:

```ts
interface ResumeSnapshot {
  trackId: string;
  currentSeconds: number;
  isPlaying: boolean;
  timestamp: number;
}
```

**TTL: 7 dias** (`7 * 24 * 60 * 60 * 1000`). Expirado -> snapshot apagado +
`readResumeSnapshot()` retorna `null`.

**Persistencia** acontece em 3 caminhos (debounce + immediate):

1. **Debounced 2s**: durante playback, todo `currentSeconds` tick salva apos
   2s de inatividade da escrita. Evita 4 writes/s do `timeupdate`.
2. **Immediate em pause**: `isPlaying=false` dispara `writeResumeSnapshot` na
   hora (sem debounce) — captura o "pause final" antes do tab fechar.
3. **`beforeunload`**: handler sincrono salva snapshot no fechamento do tab.

**Restore no boot**: `AudioPlayerProvider` mount le `readResumeSnapshot()` 1x e
expoe via `window.__audioPlayerLastResumeSnapshot` flag (idem padrao OAuth
snapshot). NAO restaura `activeTrack` automaticamente — apenas disponibiliza o
snapshot para componentes que conhecem o catalogo (LessonPicker / Hub) usarem
em CTAs "Continuar de onde parou" (alavanca para Wave C, fora deste escopo).

**Auto-play: DESLIGADO por design.** Browsers modernos bloqueiam autoplay sem
user gesture; tentar tocar no boot eh UX-hostil + tecnicamente quebrado em iOS.
User clica play -> a sessao retoma na posicao snapshot.

**Limpeza**: `close()` apaga snapshot via `clearResumeSnapshot()`. Track end
natural NAO apaga (autoplay para proxima ja move o snapshot).

## Alternativas Consideradas

**A. Server-side via PATCH `/api/library/progress/last-session` periodico.**
Rejeitada: 1) custo de rede a cada 2s; 2) latencia em redes ruins suja state
recente; 3) jogadores poker em ambientes com firewall agressivo perdem updates;
4) tabs em outras maquinas/devices teriam conflito (user toca em mobile e
restore em desktop com posicao errada).

**B. `sessionStorage` (limpa ao fechar tab).** Rejeitada: o caso-alvo eh
exatamente sobreviver a fechar tab.

**C. IndexedDB.** Overkill p/ 4 fields scalar. localStorage atende com fail-safe
trivial.

**D. TTL 30d.** Rejeitada: dados velhos demais geram CTA "Continuar X de 2 meses
atras?" pessimo. 7d cobre o caso real (continuar amanha / proxima semana) sem
poluicao.

## Consequencias

**Positivas:**
- Continuidade real cross-reload sem custo server.
- Hub e LessonPicker podem oferecer CTA "Continuar" rico (Wave C).
- Resilencia a crashes / tab kill.

**Negativas:**
- localStorage compartilhado entre dispositivos: snapshot do desktop nao chega
  ao mobile (aceito — `library_progress` server ainda gateia per-`lessonId`).
- Browser anonymous mode + ITP (Safari iOS): localStorage purgado entre
  sessoes — snapshot vira null. Aceito (browsers fazem o seu).
- Tamanho ~80 bytes serializados — irrelevante perto do cap 5MB do localStorage.

**Neutras:**
- Snapshot expoe `trackId` em plain text. NAO eh PII (lessonIds sao opacos).
  Sem tokens, sem credentials.

## Implementacao

- `client/src/lib/audio-engine/resumeSession.ts` (novo util + 3 helpers + 2
  exports de constants para tests).
- `AudioPlayerContext.tsx`: 3 `useEffect`s adicionados (debounce / immediate
  pause / beforeunload) + 1 boot effect le snapshot.
- `close()` chama `clearResumeSnapshot()`.

Testes: `tests/client/mini-player-3-1-b/resumeSession.test.ts` (6 unit) +
`AudioPlayerContext.resumeSnapshot.test.tsx` (3 integration debounce + boot).
