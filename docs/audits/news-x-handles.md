# News Sources Locked — 2026-05-04

Lista final pos-audit (`Docs/audits/news-audit-2026-05-04.md`). Decisoes founder em `memory/session_2026-05-04-news-audit.md`.

**15 sources** (drops: Cravadas-BR, HoldemManager, PokerTracker, Chico, iPoker, Intuitive Table).

## Schema impact

Tabela `news_sources` ja tem coluna `live_search_handle`. Reutilizar.

Colunas novas necessarias:
- `rss_url` text NULL — URL feed RSS/Atom (ou pagina HTML scrape se nao tem RSS).
- `scrape_strategy` enum NULL — `rss` | `html` | `x_only` | `rss_and_x` | `html_and_x`.
- `x_handle` text NULL — handle X (sem `@`). Reusa `live_search_handle` ou rename.

## Sources finais

| ID | Category | Name | Strategy | Blog/HTML URL | X handle |
|----|----------|------|----------|---------------|----------|
| mundopoker | gossip | MundoPoker | html | https://mundopoker.com.br | — |
| superpoker | gossip | SuperPoker | html | https://superpoker.com.br | — |
| 888poker | sites | 888poker | x_only | — | 888poker |
| bodog | sites | Bodog/Bovada | x_only | — | IgnitionCasino |
| coinpoker | sites | CoinPoker | x_only | — | CoinPoker_OFF |
| ggpoker | sites | GGPoker | html_and_x | https://ggpoker.com/pt-br/blog/ | GGPoker |
| partypoker | sites | PartyPoker | x_only | — | partypoker |
| pokerstars | sites | PokerStars | html_and_x | https://www.pokerstars.com/pt-BR/poker/learn/news/?&no_redirect=1 | PokerStars |
| wpn-acr | sites | WPN/ACR | x_only | — | ACR_POKER |
| gto-wizard-studies | studies | GTO Wizard - Estudos | rss_or_html | https://blog.gtowizard.com/articles/ | — |
| gto-wizard | tools | GTO Wizard - What's New | rss_or_html | https://blog.gtowizard.com/whats-new-in-gto-wizard/ | — |
| hand2note | tools | Hand2Note | html_and_x | https://hand2note.com/Blog | hand2note |
| hrc | tools | HRC | html | https://www.holdemresources.net/blog | — |
| jurojin | tools | Jurojin | html | https://jurojinpoker.com/pt/blog | — |
| sharkscope | tools | SharkScope | x_only | — | sharkscope |

## Drops (status: enabled=false ou DELETE)

| ID | Motivo |
|----|--------|
| cravadas-br | Cravadas cobertas via MundoPoker + SuperPoker (gossip) |
| chico | Sem blog + sem handle X relevante |
| ipoker | Idem |
| Intuitive Table | Removido founder |
| Holdem Manager 3 | Nao publica news |
| PokerTracker 4 | Nao publica news |

## Cron schedule

- Frequencia: **1x/semana**
- Dia/hora: **Segunda-feira 12:00 America/Sao_Paulo**
- Cron expr (UTC): `0 15 * * 1` (Sao Paulo UTC-3, sem DST desde 2019)

## X Live Search via Grok

xAI Live Search API (`search_parameters.sources[].type = "x"`):

```ts
{
  search_parameters: {
    mode: "on",
    return_citations: true,
    sources: [{ type: "x", x_handles: ["888poker"] }],
    from_date: "2026-04-28", // 7 dias atras
    to_date: "2026-05-04",
    max_search_results: 10,
  }
}
```

Custo estimado: 9 sources X × 1x/semana × 4 semanas = 36 calls/mes × $0.025/call ≈ **$0.90/mes**. Cabe folgado.

## Dedupe strategy (3-layer)

Detalhe completo em spec Sprint News-3. Resumo:

1. **Layer 1 — URL canonicalization** (30d window): strip UTM/fbclid/etc, lowercase host, normalize twitter.com→x.com, sort query params, strip trailing slash. Match exact em `news_items.url`.
2. **Layer 2 — Title fingerprint** (30d window): NFD strip diacritics, lowercase, remove punct, strip stopwords PT+EN, sort tokens, top 10, sha256. Match em `news_items.content_hash` (semantic muda).
3. **Layer 3 — URL-in-tweet** (7d window): extract URLs do tweet summary, canonicalizar, match contra blog items. Drop tweet se cita blog ja indexado.
4. **Layer 4 — Embedding cosine** (DEFERRED Sprint News-3.1): so adicionar se metric `slip_rate > 5%` apos 4 semanas em prod.

NAO faz dedupe cross-source intencionalmente (perspectivas diferentes = valor).
