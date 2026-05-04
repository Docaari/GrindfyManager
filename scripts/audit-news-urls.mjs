#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const TIMEOUT_MS = 8000;
const CONCURRENCY = 8;

async function checkOne(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let r = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 GrindfyNewsAudit/1.0" },
    });
    if (r.status === 405) {
      r = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 GrindfyNewsAudit/1.0",
          Range: "bytes=0-0",
        },
      });
    }
    clearTimeout(t);
    return { url, status: r.status, finalUrl: r.url, ok: r.ok || (r.status >= 300 && r.status < 400) };
  } catch (e) {
    clearTimeout(t);
    return { url, status: 0, error: String(e?.message || e), ok: false };
  }
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
      process.stderr.write(".");
    }
  });
  await Promise.all(workers);
  return out;
}

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
const urls = input.map((x) => x.url);
const uniq = [...new Set(urls)];
console.error(`Checking ${uniq.length} unique URLs (of ${urls.length} total)`);
const results = await pool(uniq, CONCURRENCY, checkOne);
const byUrl = Object.fromEntries(results.map((r) => [r.url, r]));
const enriched = input.map((x) => ({ ...x, check: byUrl[x.url] }));
writeFileSync(process.argv[3], JSON.stringify(enriched, null, 2));
console.error("\nDone:", process.argv[3]);
const ok = results.filter((r) => r.ok).length;
const dead = results.length - ok;
console.error(`OK: ${ok} / Dead: ${dead}`);
