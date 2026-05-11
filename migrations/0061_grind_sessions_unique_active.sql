-- launch-fix P1: garantir UMA UNICA sessao 'active' por usuario.
--
-- Sem este indice partial, o handler POST /api/grind-sessions tinha race
-- condition: dois requests simultaneos passavam pelo SELECT (encontravam
-- nada active) e ambos faziam INSERT — DB ficava com 2 sessoes active
-- por user. UI ficava confusa, snapshots de wallet duplicavam, etc.
--
-- O cleanup defensivo em GET /api/grind-sessions (cleanedUpUsers) resolvia
-- post-hoc, mas com efeito colateral (uma das sessoes virava completed sem
-- aviso ao founder). Indice partial bloqueia o estado invalido na origem.
--
-- Idempotente para re-runs. status='active' eh o unico filtro: sessoes em
-- 'completed', 'paused', etc. nao contam para o uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS uq_grind_sessions_one_active_per_user
  ON grind_sessions (user_id)
  WHERE status = 'active';
