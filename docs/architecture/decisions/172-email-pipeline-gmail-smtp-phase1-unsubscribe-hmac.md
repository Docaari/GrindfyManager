# ADR-172: Email pipeline para relatórios (Weekly/Monthly/Quarterly — Daily Debrief NÃO via Q-G lock) reusando `server/emailService.ts` + nodemailer + Gmail SMTP existente em prod (fase 1 minimal, rate limit Gmail ~500/dia aceito em alpha externo, SES/SendGrid = follow-up pós-volume) + `server/services/reportEmailSender.ts` `sendReportEmail({reportId, userId, kind})` chamado inline pelo `processReportJobsTick` apos report ready (best-effort try/catch, não bloqueia tick) + idempotência via `email_log` UNIQUE `(report_id, kind)` + retry exponencial 15min/1h/4h herdado de `reportJobRunner` + 3 templates HTML separados em `server/emails/templates/{weekly,monthly,quarterly}ReportEmail.ts` + unsubscribe link com HMAC SHA256 (secret `EMAIL_UNSUBSCRIBE_SECRET` ?? `JWT_SECRET`, expires 1 ano) + endpoint público `GET /api/coach/email/unsubscribe?token=...` que desliga opt-in correspondente + disclaimer regulatório no footer dos templates (ADR-173)

## Status
Aceito

## Data
2026-05-20

## Sprint
AI-2B (`Docs/specs/sprint-ai-2b.md` — RF-01.3, RF-07; Q-F + Q-G locked 2026-05-20)

## Decision owner
system-architect (founder locked Q-F em 2026-05-20: reusar Gmail SMTP, fase 1; Q-G locked: Daily NÃO envia email — só Weekly/Monthly/Quarterly)

## Related
- Depende de: `server/emailService.ts` (existente, Gmail SMTP nodemailer — verification/welcome/reset em prod); ADR-159 (AI-1C `report_jobs`/`reports` pipeline + retry policy); ADR-169 (Quarterly como tipo novo); ADR-173 (Disclaimer regulatório — footer obrigatório).
- Reusa: `EmailService.getTransporter()`, env SMTP existentes (`SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_ADDRESS`); template pattern (header gradient + body + footer) já em prod.
- Sucessor de: nada — primeiro canal email de relatório.
- Diagramas: `Docs/architecture/diagrams/coach-ai-2b/email-pipeline-with-unsubscribe.mermaid`.

---

## 1. Contexto

Hoje `emailService.ts` envia 3 tipos de emails (verification, welcome, reset). Templates HTML inline. Sem tabela de log. Sem retries pós-falha. Sem unsubscribe.

A pergunta central: provider (Q-F), Daily ou não (Q-G), idempotência, unsubscribe, retries, integração com `processReportJobsTick`.

### Restrições

- **Lesson #5/#35 (constructor SDK):** `nodemailer.createTransporter` já em produção — sem novidade. Mas `sendMail` pode falhar; capturar e gravar `email_log.status='failed'`.
- **Lesson #16 (DOMPurify):** templates HTML são server-side (não vêm de user input externo) — sanitização não necessária, mas `ReportContent` pode conter texto livre do user (mental hands snippets); rendering deve escapar HTML do user.
- **Lesson #9 (logar antes de fallback):** todo erro de SMTP loga antes de marcar `email_log.status='failed'`.
- **Lesson #19 (CTAs em rotas):** templates linkam só para rotas Wouter existentes (`/coach-ai/relatorio/:id`, `/coach-ai`).
- **Privacidade:** unsubscribe link público (sem auth) — HMAC valida.
- **`COACH_NUDGES_ENABLED=false`:** kill switch global desliga TODO pipeline de proatividade (incluindo email — proatividade = report job runner + nudges + emails).
- **Compliance CAN-SPAM / LGPD:** unsubscribe link obrigatório em todo email.

### O que está fora de escopo

- SES/SendGrid migration — follow-up pós-alpha quando volume passar ~500/dia.
- Webhook de bounce externo (provider relata bounces de volta) — só log local + status="failed". Bounce real exige SES SNS ou similar.
- Suppression list automática — manual via DELETE em `user_coach_preferences` ou unsubscribe.
- Templates personalizáveis por user (cor, logo) — todos iguais.
- A/B test de subject line — fixo.
- Track de open/click — sem pixel + sem redirect. Privacidade > analytics.
- Email do Daily Debrief (Q-G lock).
- Internacionalização — PT-BR fixo (UI do produto é PT-BR).

---

## 2. Decisão

Adotada: **reuso de Gmail SMTP fase 1 + `email_log` idempotência + retry exponencial herdado + unsubscribe HMAC + envio inline pelo processor**.

### 2.1. Schema `email_log`

```sql
CREATE TABLE email_log (
    id              VARCHAR(21) PRIMARY KEY,
    user_id         VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    report_id       VARCHAR(21) REFERENCES reports(id) ON DELETE SET NULL,
    kind            VARCHAR(32) NOT NULL,
    to_email        VARCHAR(255) NOT NULL,           -- snapshot (caso email mude depois)
    subject         VARCHAR(255) NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts        INTEGER NOT NULL DEFAULT 0,
    message_id      TEXT,                            -- nodemailer messageId
    error_message   TEXT,
    sent_at         TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT email_log_status_enum CHECK (status IN ('pending','sent','failed','bounced','unsubscribed')),
    CONSTRAINT email_log_kind_enum CHECK (kind IN ('report_weekly','report_monthly','report_quarterly'))
);
CREATE UNIQUE INDEX uq_email_log_report_kind ON email_log(report_id, kind) WHERE report_id IS NOT NULL;
CREATE INDEX idx_email_log_user_kind_created ON email_log(user_id, kind, created_at DESC);
CREATE INDEX idx_email_log_pending ON email_log(created_at) WHERE status = 'pending';
```

- UNIQUE parcial `(report_id, kind) WHERE report_id IS NOT NULL` — idempotência. Tentar enviar 2x mesmo report+kind no-op.
- Index parcial `WHERE status='pending'` — fila de retry varre só pending.

### 2.2. `sendReportEmail` helper

Localização: `server/services/reportEmailSender.ts`.

```ts
export async function sendReportEmail({
  reportId,
  userId,
  kind,
  injectedStorage,
}: {
  reportId: string;
  userId: string;
  kind: 'report_weekly' | 'report_monthly' | 'report_quarterly';
  injectedStorage?: Storage;
}): Promise<{ status: 'sent' | 'failed' | 'skipped'; messageId?: string; error?: string }> {
  const storage = resolveStorage(injectedStorage);

  // 1. Revalidar opt-in
  const prefs = await storage.getUserCoachPreferences(userId);
  const optInField =
    kind === 'report_weekly' ? 'emailWeeklyEnabled'
    : kind === 'report_monthly' ? 'emailMonthlyEnabled'
    : 'emailQuarterlyEnabled';
  if (!prefs?.[optInField]) {
    return { status: 'skipped', error: 'opt_in_off' };
  }

  // 2. Revalidar tier (Q-G — Daily NÃO chega aqui; safety net)
  const reportType = kind.replace('report_', '') as 'weekly'|'monthly'|'quarterly';
  if (!(await isReportEligible(userId, reportType))) {
    return { status: 'skipped', error: 'tier_ineligible' };
  }

  // 3. INSERT email_log pending (ON CONFLICT (report_id, kind) DO NOTHING)
  const emailLogId = nanoid();
  const inserted = await storage.insertEmailLog({
    id: emailLogId, userId, reportId, kind,
    toEmail: user.email, subject, status: 'pending',
  });
  if (!inserted) {
    return { status: 'skipped', error: 'already_sent_or_pending' }; // UNIQUE conflict
  }

  // 4. Render template
  const { subject, html, text } = renderTemplate(kind, { content, userName, unsubscribeUrl, baseUrl });

  // 5. Send
  try {
    const transporter = EmailService.getTransporter(); // lazy + throw se sem config
    const info = await transporter.sendMail({ from, to: user.email, subject, html, text });
    await storage.updateEmailLog(emailLogId, { status: 'sent', sentAt: new Date(), messageId: info.messageId });
    return { status: 'sent', messageId: info.messageId };
  } catch (err) {
    console.error('[email] send failed', { reportId, kind, err }); // lesson #9
    await storage.updateEmailLog(emailLogId, {
      status: 'failed',
      attempts: (current?.attempts ?? 0) + 1,
      errorMessage: String(err),
    });
    return { status: 'failed', error: String(err) };
  }
}
```

### 2.3. Trigger — inline no processor

Após `processReportJobsTick` finalizar gerar um report (`reports.status='ready'`), chama:
```ts
void sendReportEmail({ reportId, userId, kind: `report_${reportType}` }).catch(err => {
  console.error('[email] background send failed', err); // best-effort, não bloqueia tick
});
```

- Best-effort fire-and-forget. Não bloqueia o tick (consistente com Daily Debrief enqueue AI-1C ADR-159).
- Se opt-in OFF → skip silencioso (sem `email_log` row).

### 2.4. Retry policy

- Retry exponencial herdado de `reportJobRunner` (AI-1B): job loop varre `email_log WHERE status='pending' AND attempts < 3`; backoff 15min/1h/4h via `next_attempt_at` (calculado a partir de `created_at + attempts * backoff`).
- Após 3 tentativas → `status='failed'` final, sem mais retries.
- Job loop dedicado opcional (`processEmailRetryTick`) ou inline no mesmo hourly tick — recomendado: inline para simplicidade (impl decide).

### 2.5. Templates HTML

Localização: `server/emails/templates/`:
- `weeklyReportEmail.ts` exporta `function renderWeeklyReportEmail({ content, userName, unsubscribeUrl, baseUrl }): { subject, html, text }`.
- `monthlyReportEmail.ts` idem.
- `quarterlyReportEmail.ts` idem.

**Subject patterns:**
- Weekly: `"Seu relatório semanal — semana de DD/MM"`
- Monthly: `"Seu relatório mensal — Mês/AAAA"`
- Quarterly: `"Seu relatório trimestral — Q{N}/{ANO}"`

**Body skeleton (todos os 3):**
- Header — logo Grindfy gradient (mesmo do `verification.html` legacy).
- Saudação — "Olá, {firstName}!".
- Resumo top — bullets 3-5 highlights do `content`.
- CTA grande — "Abrir relatório completo no Grindfy" → `${baseUrl}/coach-ai/relatorio/${reportId}` (rota Wouter registrada — lesson #19).
- Footer:
  - Link "Não quero mais receber relatórios `{kind}` por email" → `${unsubscribeUrl}` (HMAC).
  - Link "Gerenciar preferências" → `${baseUrl}/coach-ai` (rota Wouter).
  - **Disclaimer regulatório** (`REPORT_DISCLAIMER` — ADR-173) — texto fixo.
  - Marca Grindfy.

**Texto livre do user no body** (mental hands snippets, custom goal narratives): escapar HTML (`escapeHtml(s)`) — proteção XSS server-side.

### 2.6. Unsubscribe HMAC

- **Token format:** `${userId}.${kind}.${expiresAt}.${hmac}` — URL-safe base64.
- **HMAC:** `crypto.createHmac('sha256', SECRET).update(`${userId}|${kind}|${expiresAt}`).digest('hex')`.
- **SECRET:** `process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.JWT_SECRET` (fallback para JWT_SECRET — reuso simples; founder pode separar via env nova quando quiser rotation independente).
- **Expira em 1 ano** (`expiresAt = nowMs + 365 * 86400 * 1000`).
- Endpoint `GET /api/coach/email/unsubscribe?token=...`:
  - Sem auth (público — link no email).
  - Decodifica token; recalcula HMAC; compara (constant time `crypto.timingSafeEqual`).
  - Se válido + não expirado:
    - UPDATE `user_coach_preferences SET email_${kind.replace('report_','')}_enabled = false WHERE user_id = $userId`.
    - UPDATE `email_log SET status = 'unsubscribed' WHERE id = $emailLogId` (futuro: nesse design o link não traz emailLogId — apenas atualiza pref).
    - Retorna página HTML simples "Você foi descadastrado de relatórios `{kind}` por email. [Link para gerenciar preferências.]"
  - Se inválido/expirado: 400 "Link inválido ou expirado. [Link para login → /coach-ai]".

### 2.7. Risk acceptance — Gmail SMTP rate limit ~500/dia

- Em alpha externo (≤30 users com opt-in ON em todos os 3 tipos = ≤90 emails/semana + ~30 mensais + ~30 trimestrais = ~150/mês de pico). Folgado.
- Migração para SES/SendGrid quando volume passar 300/dia OU bounce rate > 5% (alarme manual via dashboard de admin — fora de escopo AI-2B).

---

## 3. Opções consideradas

### Opção A — Reuso Gmail SMTP + `email_log` local + unsubscribe HMAC — ESCOLHIDA (Q-F lock)
**Prós:**
- Zero dep nova (`nodemailer` já em prod).
- Zero env nova obrigatória (`EMAIL_UNSUBSCRIBE_SECRET` opcional, fallback JWT_SECRET).
- Idempotência via UNIQUE + retry herdado.
- Custo zero adicional (Gmail conta).
**Contras:**
- Rate limit ~500/dia — folgado em alpha mas estoura em ~150 users com opt-in pleno em todos os 3 tipos.
- Sem webhook de bounce — bounce vira "failed" genérico, sem distinção.
- Reputation: Gmail SMTP pode entrar em spam folder de alguns providers (Outlook). Aceito; SPF/DKIM do domínio config-driven (fora de escopo).

### Opção B — Migrar para SES/SendGrid já no AI-2B
**Prós:**
- Escalabilidade.
- Webhook de bounce + complaint.
- Reputation melhor (SES dedicado IP opt).
**Contras:**
- Novo dep (aws-sdk ou @sendgrid/mail).
- Novo env (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`).
- Custo (~$0.10/1000 emails — desprezível mas overhead config).
- Setup SPF/DKIM/DMARC mais complexo (verificação de domínio).
- Founder não quer agora (Q-F lock — pós-alpha).

### Opção C — Cron worker dedicado tipo "outbox pattern"
**Prós:**
- Desacoplado do processor de reports.
- Retry policy isolada.
**Contras:**
- Complexidade extra (2 ticks).
- Aceito hoje: inline no processor + best-effort fire-and-forget cobre 95% dos casos.

---

## 4. Consequências

### Positivas
- 3 kinds de email funcionando com zero custo adicional.
- Idempotência via UNIQUE → seguro chamar `sendReportEmail` múltiplas vezes (ex: retry após queda do processor).
- Unsubscribe link em todo email — compliance.
- Disclaimer regulatório (ADR-173) no footer protege empresa.

### Negativas
- Gmail SMTP rate limit — risco em volume > 500/dia. Mitigado: alarme manual + plano de migração para SES (follow-up documentado).
- Sem track de open/click — métrica de engajamento perdida. Aceito (privacidade > analytics).
- Sem webhook de bounce — bounces ficam como "failed" genérico. Manual review periódico via query `SELECT count(*) FROM email_log WHERE status='failed' GROUP BY error_message`.

### Neutras
- `EMAIL_UNSUBSCRIBE_SECRET` opcional — founder pode separar de `JWT_SECRET` quando quiser rotation independente sem invalidar JWTs.
- Templates fixos (sem personalização visual) — UX uniforme, fácil iterar via 1 commit.
- 3 kinds hardcoded em `email_log_kind_enum` — adicionar kind novo exige ALTER do CHECK (aceito; volume baixo de mudança).

## Confiança
**Alta** — pattern minimal, dependências em prod, idempotência via UNIQUE provada, retry herdado de pipeline maduro AI-1B. Follow-up SES quando volume justificar (documentado, não obstrutivo).
