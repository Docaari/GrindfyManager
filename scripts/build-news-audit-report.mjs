#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";
const T = tmpdir();
const bySource = JSON.parse(readFileSync(join(T, "news-by-source.json"), "utf8")) || [];
const byCategory = JSON.parse(readFileSync(join(T, "news-by-category.json"), "utf8")) || [];
const global = JSON.parse(readFileSync(join(T, "news-global.json"), "utf8")) || [];
const checked = JSON.parse(readFileSync(join(T, "news-urls-checked.json"), "utf8")) || [];

const checkByUrl = {};
for (const c of checked) checkByUrl[c.url] = c.check;

function statusBadge(check) {
  if (!check) return "?";
  if (check.ok) return `${check.status} OK`;
  if (check.status === 0) return `ERR (${(check.error || "").slice(0, 30)})`;
  return `${check.status}`;
}

function fmtDate(iso) {
  return iso?.slice(0, 10) || "?";
}

function clip(s, n) {
  if (!s) return "";
  s = s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function urlCell(url) {
  const safeUrl = (url || "").replace(/\)/g, "%29").replace(/\(/g, "%28");
  return `[link](${safeUrl})`;
}

const lines = [];
lines.push("# News Audit — 2026-05-04");
lines.push("");
lines.push("**Contexto:** Grok provider gera noticias via xAI Responses API standard (LLM-only, sem web_search).");
lines.push("Founder suspeita de hallucination (datas em outubro 2024, hoje 2026-05-04).");
lines.push("");
lines.push("**Metodologia:**");
lines.push("- 5 ultimas noticias por source / category / global, ordenadas por `published_at DESC`.");
lines.push("- HEAD check com timeout 8s + redirect follow + fallback GET (Range bytes=0-0) em 405.");
lines.push("- User-Agent `GrindfyNewsAudit/1.0`.");
lines.push("");

// counters
const total = checked.length;
const ok = checked.filter((c) => c.check?.ok).length;
const dead = total - ok;
lines.push("## Sumario");
lines.push("");
lines.push(`| Metrica | Valor |`);
lines.push(`|---------|-------|`);
lines.push(`| Total items DB | 53 |`);
lines.push(`| URLs unicas | ${total} |`);
lines.push(`| URLs alive (2xx/3xx) | ${ok} |`);
lines.push(`| URLs dead (4xx/5xx/timeout/network) | ${dead} |`);
lines.push(`| % URLs vivas | ${total ? ((ok / total) * 100).toFixed(1) : 0}% |`);
lines.push("");
lines.push("> Nota: muitas URLs alive sao homepage (substituidas pelo fix item 11). Item-level original era hallucinated; homepage substitute volta 200 mas nao prova que titulo+summary+data sao reais.");
lines.push("");
lines.push("## Como classificar (founder)");
lines.push("");
lines.push("Marcar coluna `Veredicto` com:");
lines.push("- `[REAL]` — titulo+summary+data correspondem a artigo real existente.");
lines.push("- `[FAKE]` — totalmente alucinado (titulo nao existe, data falsa, etc).");
lines.push("- `[PARCIAL]` — titulo existe mas data/summary errados, OU URL homepage substitui item real perdido.");
lines.push("- `[HOME]` — URL apenas aponta pra homepage da source (substituicao item 11).");
lines.push("");

function tableHeader() {
  return [
    "| Data | Titulo | URL | HTTP | Summary | Veredicto |",
    "|------|--------|-----|------|---------|-----------|",
  ];
}

// Group by source
lines.push("## Por Source (top 5)");
lines.push("");
const groupedSrc = new Map();
for (const r of bySource) {
  const k = `${r.category} :: ${r.source_name} (${r.source_id})`;
  if (!groupedSrc.has(k)) groupedSrc.set(k, []);
  groupedSrc.get(k).push(r);
}
for (const [k, rows] of groupedSrc) {
  lines.push(`### ${k}`);
  lines.push("");
  lines.push(...tableHeader());
  for (const r of rows) {
    const c = checkByUrl[r.url];
    lines.push(
      `| ${fmtDate(r.published_at)} | ${clip(r.title, 60)} | ${urlCell(r.url)} | ${statusBadge(c)} | ${clip(r.summary, 100)} |  |`,
    );
  }
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push("## Por Category (top 5)");
lines.push("");
const groupedCat = new Map();
for (const r of byCategory) {
  if (!groupedCat.has(r.category)) groupedCat.set(r.category, []);
  groupedCat.get(r.category).push(r);
}
for (const [k, rows] of groupedCat) {
  lines.push(`### ${k}`);
  lines.push("");
  lines.push(...tableHeader());
  for (const r of rows) {
    const c = checkByUrl[r.url];
    lines.push(
      `| ${fmtDate(r.published_at)} | ${clip(r.title, 60)} | ${urlCell(r.url)} | ${statusBadge(c)} | ${clip(r.summary, 100)} |  |`,
    );
  }
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push("## Top 5 Global");
lines.push("");
lines.push(...tableHeader());
for (const r of global) {
  const c = checkByUrl[r.url];
  lines.push(
    `| ${fmtDate(r.published_at)} | ${clip(r.title, 60)} | ${urlCell(r.url)} | ${statusBadge(c)} | ${clip(r.summary, 100)} |  |`,
  );
}
lines.push("");

lines.push("---");
lines.push("");
lines.push("## Decisao apos audit");
lines.push("");
lines.push("- (A) Kill flag `NEWS_FEED_ENABLED=false` ate refactor (5min).");
lines.push("- (B) Sprint News-2: migrar grokNewsProvider pra Agent Tools API com `web_search` real (1-2 dias).");
lines.push("- (C) Sprint News-3: substituir Grok por RSS scrapers (PokerNewsBR, PokerNews, blog.gtowizard.com RSS).");
lines.push("");

writeFileSync("Docs/audits/news-audit-2026-05-04.md", lines.join("\n"));
console.error("Wrote Docs/audits/news-audit-2026-05-04.md");
